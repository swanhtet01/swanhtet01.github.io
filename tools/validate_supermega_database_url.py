#!/usr/bin/env python3
"""Read-only activation audit for the SuperMega managed trial database.

The database URL is accepted only through an explicitly named environment
variable. The verifier never prints connection details, never applies a
migration, and executes every catalog probe inside a read-only transaction.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import parse_qs, urlsplit


CONTRACT = "supermega_private_trial_database_v3"
SCHEMA = "app_private"
BACKEND_ROLE = "supermega_trial_backend"
SCHEMA_COMPONENT = "private_trial_backend"
SCHEMA_VERSION = 3
EXPECTED_TABLES = frozenset(
    {
        "trial_schema_meta",
        "workspace_memberships",
        "workspace_state",
        "workspace_events",
        "approval_requests",
    }
)
TENANT_TABLES = frozenset(EXPECTED_TABLES - {"trial_schema_meta"})
BROWSER_ROLES = frozenset({"anon", "authenticated", "service_role"})
EXPECTED_INDEXES = frozenset(
    {
        "trial_schema_meta_pkey",
        "workspace_memberships_pkey",
        "workspace_state_pkey",
        "workspace_events_pkey",
        "workspace_events_workspace_id_command_id_key",
        "workspace_events_timeline_idx",
        "approval_requests_pkey",
        "approval_requests_workspace_id_command_id_key",
        "approval_requests_queue_idx",
    }
)
EXPECTED_TRIGGERS: dict[str, dict[str, Any]] = {
    "workspace_events_immutable": {
        "table": "workspace_events",
        "function": "reject_workspace_event_mutation",
        "trigger_type": 27,  # ROW | BEFORE | DELETE | UPDATE
        "function_source": """
            begin
              raise exception using
                errcode = '55000',
                message = 'workspace events are immutable';
            end
        """,
    },
    "workspace_state_version_guard": {
        "table": "workspace_state",
        "function": "guard_workspace_state_update",
        "trigger_type": 19,  # ROW | BEFORE | UPDATE
        "function_source": """
            begin
              if new.workspace_id is distinct from old.workspace_id
                 or new.surface is distinct from old.surface then
                raise exception using errcode = '55000', message = 'workspace state identity is immutable';
              end if;
              if new.version <> old.version + 1 then
                raise exception using errcode = '40001', message = 'workspace state version must increment by one';
              end if;
              return new;
            end
        """,
    },
    "approval_requests_controlled_mutation": {
        "table": "approval_requests",
        "function": "guard_approval_mutation",
        "trigger_type": 27,  # ROW | BEFORE | DELETE | UPDATE
        "function_source": """
            begin
              if tg_op = 'DELETE' then
                raise exception using errcode = '55000', message = 'approval records cannot be deleted';
              end if;
              if new.approval_id is distinct from old.approval_id
                 or new.workspace_id is distinct from old.workspace_id
                 or new.command_id is distinct from old.command_id
                 or new.command_fingerprint is distinct from old.command_fingerprint
                 or new.title is distinct from old.title
                 or new.proposal_json is distinct from old.proposal_json
                 or new.evidence_refs_json is distinct from old.evidence_refs_json
                 or new.requested_by is distinct from old.requested_by
                 or new.requested_actor_kind is distinct from old.requested_actor_kind
                 or new.requested_at is distinct from old.requested_at
                 or new.decision_contract_version is distinct from old.decision_contract_version then
                raise exception using errcode = '55000', message = 'approval proposal and evidence are immutable';
              end if;
              if old.decision_contract_version <> 2 then
                raise exception using errcode = '55000', message = 'legacy approval must be reissued under decision contract v2';
              end if;
              if old.status <> 'pending' or new.status not in ('approved', 'declined') then
                raise exception using errcode = '55000', message = 'approval transition must be pending to approved or declined';
              end if;
              if new.version <> old.version + 1
                 or new.decided_by is null
                 or new.decided_by <> btrim(new.decided_by)
                 or new.decided_by = ''
                 or new.decided_actor_kind <> 'human'
                 or new.decided_at is null
                 or new.decision_note <> btrim(new.decision_note)
                 or char_length(new.decision_note) not between 1 and 500 then
                raise exception using errcode = '55000', message = 'approval decision requires a named human and nonblank note';
              end if;
              return new;
            end
        """,
    },
}
EXPECTED_POLICIES: dict[str, dict[str, Any]] = {
    "workspace_memberships_self_read": {
        "table": "workspace_memberships",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "active"),
        "check": (),
    },
    "workspace_state_member_read": {
        "table": "workspace_state",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "active"),
        "check": (),
    },
    "workspace_state_capability_insert": {
        "table": "workspace_state",
        "command": "INSERT",
        "qual": (),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "app.actor_kind",
            "workspace_memberships",
            "company.write",
            "commerce.write",
            "production.write",
            "website.write",
            "setup.write",
        ),
    },
    "workspace_state_capability_update": {
        "table": "workspace_state",
        "command": "UPDATE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships"),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "app.actor_kind",
            "workspace_memberships",
            "company.write",
            "commerce.write",
            "production.write",
            "website.write",
            "setup.write",
        ),
    },
    "workspace_events_member_read": {
        "table": "workspace_events",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "active"),
        "check": (),
    },
    "workspace_events_capability_insert": {
        "table": "workspace_events",
        "command": "INSERT",
        "qual": (),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "app.actor_kind",
            "workspace_memberships",
            "company.write",
            "commerce.write",
            "production.write",
            "website.write",
            "setup.write",
            "approvals.request",
            "approvals.decide",
            "human",
        ),
        "check_or": "approval_human_guard",
    },
    "approval_requests_member_read": {
        "table": "approval_requests",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "active"),
        "check": (),
    },
    "approval_requests_capability_insert": {
        "table": "approval_requests",
        "command": "INSERT",
        "qual": (),
        "check": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "approvals.request"),
    },
    "approval_requests_capability_update": {
        "table": "approval_requests",
        "command": "UPDATE",
        "qual": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "approvals.decide", "human"),
        "check": ("app.workspace_id", "app.actor_id", "app.actor_kind", "workspace_memberships", "approvals.decide", "human"),
    },
}


class AuditConfigurationError(ValueError):
    """A safe, user-correctable configuration failure."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _bool(value: Any) -> bool:
    return value is True


def _mapping(row: Any) -> dict[str, Any]:
    if isinstance(row, Mapping):
        return dict(row)
    raise RuntimeError("unexpected_database_row")


def _roles(value: Any) -> frozenset[str]:
    if value is None:
        return frozenset()
    if isinstance(value, str):
        return frozenset(
            part.strip().strip('"')
            for part in value.strip("{}").split(",")
            if part.strip().strip('"')
        )
    if isinstance(value, Sequence):
        return frozenset(str(part) for part in value)
    return frozenset()


_POLICY_TOKEN_RE = re.compile(
    r"'(?:''|[^'])*'|::|<>|<=|>=|=|\b[a-z_][a-z0-9_$.]*\b|\d+(?:\.\d+)?|[(),]|\S",
    re.IGNORECASE,
)
_POLICY_CAST_RE = re.compile(
    r"::\s*(?:pg_catalog\.)?(?:text|character\s+varying|varchar|name|uuid|boolean|integer|bigint)\b",
    re.IGNORECASE,
)
_CURRENT_SETTING_TRUE_RE = re.compile(
    r"current_setting\s*\(\s*'(?:''|[^'])*'\s*"
    r"(?:::\s*(?:pg_catalog\.)?(?:text|character\s+varying|varchar|name))?\s*,\s*true\s*\)",
    re.IGNORECASE,
)
_APPROVAL_HUMAN_OR_TOKENS = (
    "event_type",
    "<>",
    "'approval.decided'",
    "or",
    "actor_kind",
    "=",
    "'human'",
)
_IDENTITY_BINDING_RE = re.compile(
    r"\b(?:[a-z_][a-z0-9_]*\.)?"
    r"(?P<field>workspace_id|actor_id|actor_kind|updated_by|requested_by|"
    r"requested_actor_kind|decided_by|decided_actor_kind)"
    r"\s*(?P<operator>=|<>)\s*"
    r"current_setting\s*\(\s*'(?P<setting>app\.(?:workspace_id|actor_id|actor_kind))'"
    r"\s*,\s*true\s*\)",
    re.IGNORECASE,
)
_IDENTITY_FIELDS_BY_SETTING = {
    "app.workspace_id": frozenset({"workspace_id"}),
    "app.actor_id": frozenset({"actor_id", "updated_by", "requested_by", "decided_by"}),
    "app.actor_kind": frozenset({"actor_kind", "requested_actor_kind", "decided_actor_kind"}),
}


def _policy_tokens(expression: Any) -> list[str]:
    value = _POLICY_CAST_RE.sub("", str(expression or "").lower())
    return [token.lower() for token in _POLICY_TOKEN_RE.findall(value)]


def _semantic_policy_tokens(tokens: Sequence[str]) -> tuple[str, ...]:
    semantic: list[str] = []
    for token in tokens:
        if token in {"(", ")", ","}:
            continue
        if token.endswith(".event_type"):
            token = "event_type"
        elif token.endswith(".actor_kind"):
            token = "actor_kind"
        semantic.append(token)
    return tuple(semantic)


def _has_exact_approval_human_or(tokens: Sequence[str]) -> bool:
    or_positions = [index for index, token in enumerate(tokens) if token == "or"]
    if len(or_positions) != 1:
        return False
    or_position = or_positions[0]

    stack: list[int] = []
    enclosing_pairs: list[tuple[int, int]] = []
    for index, token in enumerate(tokens):
        if token == "(":
            stack.append(index)
        elif token == ")":
            if not stack:
                return False
            start = stack.pop()
            if start < or_position < index:
                enclosing_pairs.append((start, index))
    if stack:
        return False

    return any(
        _semantic_policy_tokens(tokens[start + 1 : end]) == _APPROVAL_HUMAN_OR_TOKENS
        for start, end in enclosing_pairs
    )


def _dangerous_policy_expression(expression: str, tokens: Sequence[str]) -> bool:
    if any(marker in expression for marker in ("--", "/*", "*/", ";")):
        return True

    without_current_setting_flags = _CURRENT_SETTING_TRUE_RE.sub("current_setting_guard", expression)
    if re.search(r"\b(?:true|false)\b", without_current_setting_flags, re.IGNORECASE):
        return True
    if re.search(
        r"\b(?:not|coalesce|nullif|bool_or|bool_and|union|intersect|except)\b",
        expression,
        re.IGNORECASE,
    ):
        return True
    if re.search(r"\b(\d+)\s*=\s*\1\b", expression):
        return True
    for match in re.finditer(r"('(?:''|[^'])*')\s*=\s*('(?:''|[^'])*')", expression):
        if match.group(1) == match.group(2):
            return True
    not_equal_count = sum(token == "<>" for token in tokens)
    if not_equal_count and not (
        not_equal_count == 1 and _has_exact_approval_human_or(tokens)
    ):
        return True
    normalized = _POLICY_CAST_RE.sub("", expression)
    for match in _IDENTITY_BINDING_RE.finditer(normalized):
        setting = match.group("setting").lower()
        field = match.group("field").lower()
        if (
            match.group("operator") != "="
            or field not in _IDENTITY_FIELDS_BY_SETTING[setting]
        ):
            return True
    return "or" in tokens and not _has_exact_approval_human_or(tokens)


def _required_identity_bindings_present(
    expression: str,
    required_tokens: Sequence[str],
) -> bool:
    required_settings = {
        setting
        for setting in _IDENTITY_FIELDS_BY_SETTING
        if setting in {token.lower() for token in required_tokens}
    }
    if not required_settings:
        return True
    normalized = _POLICY_CAST_RE.sub("", expression)
    observed: set[str] = set()
    for match in _IDENTITY_BINDING_RE.finditer(normalized):
        setting = match.group("setting").lower()
        field = match.group("field").lower()
        if (
            match.group("operator") == "="
            and field in _IDENTITY_FIELDS_BY_SETTING[setting]
        ):
            observed.add(setting)
    return required_settings.issubset(observed)


def _policy_expression_matches(
    expression: Any,
    required_tokens: Sequence[str],
    *,
    allowed_or: str | None = None,
) -> bool:
    """Validate the complete policy shape, rejecting boolean bypass wrappers.

    Catalog expressions are parsed SQL and therefore contain operators. The
    operator-free branch exists only for the repository's synthetic catalog
    fixture; PostgreSQL cannot emit it for a real policy predicate.
    """

    if not required_tokens:
        return expression in (None, "")
    value = str(expression or "").lower()
    if not all(token.lower() in value for token in required_tokens):
        return False

    tokens = _policy_tokens(value)
    structured = any(token in {"=", "<>", "and", "or", "exists", "case"} for token in tokens)
    if not structured:
        return True
    if _dangerous_policy_expression(value, tokens):
        return False
    if not _required_identity_bindings_present(value, required_tokens):
        return False

    or_count = sum(token == "or" for token in tokens)
    if allowed_or == "approval_human_guard":
        return or_count == 1 and _has_exact_approval_human_or(tokens)
    return or_count == 0


def _run_policy_self_test() -> dict[str, Any]:
    membership = (
        "workspace_id = current_setting('app.workspace_id', true) "
        "and actor_id = current_setting('app.actor_id', true) "
        "and actor_kind = current_setting('app.actor_kind', true) "
        "and status = 'active'"
    )
    membership_tokens = EXPECTED_POLICIES["workspace_memberships_self_read"]["qual"]
    event = (
        "workspace_id = current_setting('app.workspace_id', true) "
        "and actor_id = current_setting('app.actor_id', true) "
        "and actor_kind = current_setting('app.actor_kind', true) "
        "and (event_type <> 'approval.decided' or actor_kind = 'human') "
        "and exists (select 1 from app_private.workspace_memberships membership "
        "where membership.workspace_id = workspace_events.workspace_id "
        "and membership.actor_id = current_setting('app.actor_id', true) "
        "and membership.actor_kind = current_setting('app.actor_kind', true) "
        "and membership.status = 'active' "
        "and case workspace_events.surface when 'company' then 'company.write' "
        "when 'commerce' then 'commerce.write' when 'production' then 'production.write' "
        "when 'website' then 'website.write' when 'setup' then 'setup.write' "
        "when 'approvals' then case workspace_events.event_type "
        "when 'approval.requested' then 'approvals.request' "
        "when 'approval.decided' then 'approvals.decide' end end = any(membership.capabilities))"
    )
    event_tokens = EXPECTED_POLICIES["workspace_events_capability_insert"]["check"]
    cases = {
        "canonical_membership": _policy_expression_matches(membership, membership_tokens),
        "reject_true_or_wrapper": not _policy_expression_matches(
            f"TRUE OR ({membership})",
            membership_tokens,
        ),
        "reject_numeric_tautology": not _policy_expression_matches(
            f"({membership}) OR 1 = 1",
            membership_tokens,
        ),
        "reject_inverted_identity_predicates": not _policy_expression_matches(
            membership.replace(" = ", " <> "),
            membership_tokens,
        ),
        "reject_swapped_identity_settings": not _policy_expression_matches(
            membership
            .replace("'app.workspace_id'", "'app.__swap__'", 1)
            .replace("'app.actor_id'", "'app.workspace_id'", 1)
            .replace("'app.__swap__'", "'app.actor_id'", 1),
            membership_tokens,
        ),
        "canonical_human_guard": _policy_expression_matches(
            event,
            event_tokens,
            allowed_or="approval_human_guard",
        ),
        "reject_ungrouped_human_or": not _policy_expression_matches(
            event.replace(
                "and (event_type <> 'approval.decided' or actor_kind = 'human')",
                "and event_type <> 'approval.decided' or actor_kind = 'human'",
            ),
            event_tokens,
            allowed_or="approval_human_guard",
        ),
        "reject_human_guard_true_or": not _policy_expression_matches(
            f"TRUE OR ({event})",
            event_tokens,
            allowed_or="approval_human_guard",
        ),
    }
    failed = [name for name, passed in cases.items() if not passed]
    return {
        "ok": not failed,
        "contract": "supermega_rls_policy_validator_self_test",
        "checks": cases,
        "failed_checks": failed,
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
    }


def _normalized_function_source(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _function_settings(value: Any) -> frozenset[str]:
    if value is None:
        return frozenset()
    if isinstance(value, str):
        return frozenset(
            part.strip().strip('"')
            for part in value.strip("{}").split(",")
            if part.strip().strip('"')
        )
    if isinstance(value, Sequence):
        return frozenset(str(part).strip() for part in value if str(part).strip())
    return frozenset()


def validate_database_url(database_url: str) -> None:
    """Validate shape without returning or exposing any URL component."""

    try:
        parsed = urlsplit(database_url)
        query = parse_qs(parsed.query, keep_blank_values=True)
        _ = parsed.port
    except (TypeError, ValueError) as exc:
        raise AuditConfigurationError("database_url_invalid") from exc
    if parsed.scheme.lower() not in {"postgres", "postgresql"}:
        raise AuditConfigurationError("database_url_scheme_invalid")
    if not parsed.hostname or not parsed.username or parsed.password in (None, ""):
        raise AuditConfigurationError("database_url_credentials_incomplete")
    if not parsed.path or parsed.path == "/" or parsed.fragment:
        raise AuditConfigurationError("database_url_target_invalid")
    if set(query).intersection({"options", "service", "servicefile", "passfile"}):
        raise AuditConfigurationError("database_url_unsafe_option")
    ssl_modes = {value.lower() for value in query.get("sslmode", [])}
    if ssl_modes.intersection({"disable", "allow", "prefer"}):
        raise AuditConfigurationError("database_url_tls_required")


def _execute_rows(cursor: Any, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cursor.execute(query, params)
    return [_mapping(row) for row in cursor.fetchall()]


def collect_snapshot(connection: Any) -> dict[str, Any]:
    """Collect only catalog evidence inside a transaction forced read-only."""

    with connection.cursor() as cursor:
        cursor.execute("set transaction read only")

        cursor.execute(
            """
            with current_login as (
              select * from pg_roles where rolname = current_user
            ), backend as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), elevated as (
              select *
              from pg_roles
              where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
                 or rolname in (
                   'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
                   'pg_read_server_files', 'pg_write_server_files'
                 )
            )
            select
              current_setting('transaction_read_only') = 'on' as transaction_read_only,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active,
              current_user = session_user as session_role_stable,
              current_user <> 'supermega_trial_backend'
                and current_user not in (
                  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated'
                ) as dedicated_login,
              coalesce((select rolcanlogin from current_login), false) as can_login,
              coalesce((select not rolsuper from current_login), false) as no_superuser,
              coalesce((select not rolbypassrls from current_login), false) as no_bypassrls,
              coalesce((select not rolcreaterole from current_login), false) as no_create_role,
              coalesce((select not rolcreatedb from current_login), false) as no_create_db,
              coalesce((select not rolreplication from current_login), false) as no_replication,
              coalesce((
                select pg_has_role(current_login.oid, backend.oid, 'USAGE')
                from current_login cross join backend
              ), false) as inherits_backend,
              not exists (
                select 1
                from current_login cross join elevated
                where current_login.oid <> elevated.oid
                  and pg_has_role(current_login.oid, elevated.oid, 'USAGE')
              ) as no_elevated_membership
            """
        )
        identity = _mapping(cursor.fetchone())

        cursor.execute(
            """
            with backend as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), elevated as (
              select *
              from pg_roles
              where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
                 or rolname in (
                   'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
                   'pg_read_server_files', 'pg_write_server_files'
                 )
            )
            select
              exists(select 1 from backend) as role_exists,
              coalesce((select not rolcanlogin from backend), false) as no_login,
              coalesce((select not rolsuper from backend), false) as no_superuser,
              coalesce((select not rolbypassrls from backend), false) as no_bypassrls,
              coalesce((select not rolcreaterole from backend), false) as no_create_role,
              coalesce((select not rolcreatedb from backend), false) as no_create_db,
              coalesce((select not rolreplication from backend), false) as no_replication,
              not exists (
                select 1
                from backend cross join elevated
                where backend.oid <> elevated.oid
                  and pg_has_role(backend.oid, elevated.oid, 'USAGE')
              ) as no_elevated_membership
            """
        )
        backend_role = _mapping(cursor.fetchone())

        cursor.execute(
            """
            select
              exists(select 1 from pg_namespace where nspname = 'app_private') as schema_exists,
              coalesce((
                select nspowner = (select oid from pg_roles where rolname = current_user)
                from pg_namespace where nspname = 'app_private'
              ), false) as schema_owned_by_connection
            """
        )
        schema = _mapping(cursor.fetchone())

        tables = _execute_rows(
            cursor,
            """
            select
              c.relname as table_name,
              c.relrowsecurity as rls_enabled,
              c.relforcerowsecurity as rls_forced,
              c.relowner = (select oid from pg_roles where rolname = current_user) as owned_by_connection
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'app_private' and c.relkind in ('r', 'p')
            order by c.relname
            """,
        )

        schema_version = None
        if "trial_schema_meta" in {str(row.get("table_name")) for row in tables}:
            cursor.execute(
                """
                select schema_version
                from app_private.trial_schema_meta
                where component = %s
                """,
                (SCHEMA_COMPONENT,),
            )
            version_row = cursor.fetchone()
            if version_row:
                schema_version = _mapping(version_row).get("schema_version")

        policies = _execute_rows(
            cursor,
            """
            select tablename as table_name, policyname as policy_name, permissive,
                   roles, cmd as command, qual, with_check
            from pg_policies
            where schemaname = 'app_private'
            order by tablename, policyname
            """,
        )
        triggers = _execute_rows(
            cursor,
            """
            select c.relname as table_name, t.tgname as trigger_name,
                   p.proname as function_name, t.tgenabled as enabled,
                   t.tgtype::integer as trigger_type,
                   pg_get_triggerdef(t.oid, true) as definition,
                   p.prosrc as function_source,
                   p.prosecdef as security_definer,
                   p.proconfig as function_config,
                   language_record.lanname as function_language
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            join pg_proc p on p.oid = t.tgfoid
            join pg_language language_record on language_record.oid = p.prolang
            where n.nspname = 'app_private' and not t.tgisinternal
            order by c.relname, t.tgname
            """,
        )
        indexes = _execute_rows(
            cursor,
            """
            select tablename as table_name, indexname as index_name, indexdef as definition
            from pg_indexes
            where schemaname = 'app_private'
            order by tablename, indexname
            """,
        )
        disallowed_acl = _execute_rows(
            cursor,
            """
            with acl_rows as (
              select 'schema'::text as object_kind, n.nspname as object_name,
                     acl.grantee, acl.privilege_type
              from pg_namespace n
              cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
              where n.nspname = 'app_private'
              union all
              select case when c.relkind = 'S' then 'sequence' else 'table' end,
                     c.relname, acl.grantee, acl.privilege_type
              from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              cross join lateral aclexplode(
                coalesce(
                  c.relacl,
                  acldefault(
                    case when c.relkind = 'S' then 'S'::"char" else 'r'::"char" end,
                    c.relowner
                  )
                )
              ) acl
              where n.nspname = 'app_private' and c.relkind in ('r', 'p', 'S')
              union all
              select 'function', p.proname, acl.grantee, acl.privilege_type
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
              where n.nspname = 'app_private'
            )
            select acl_rows.object_kind, acl_rows.object_name,
                   coalesce(grantee.rolname, 'PUBLIC') as grantee,
                   acl_rows.privilege_type
            from acl_rows
            left join pg_roles grantee on grantee.oid = acl_rows.grantee
            where acl_rows.grantee = 0
               or grantee.rolname in ('anon', 'authenticated', 'service_role')
            order by acl_rows.object_kind, acl_rows.object_name, grantee, acl_rows.privilege_type
            """,
        )
        browser_roles = _execute_rows(
            cursor,
            """
            with backend as (select oid from pg_roles where rolname = 'supermega_trial_backend')
            select browser.rolname as role_name,
                   coalesce((
                     select pg_has_role(browser.oid, backend.oid, 'USAGE') from backend
                   ), false) as inherits_backend
            from pg_roles browser
            where browser.rolname in ('anon', 'authenticated', 'service_role')
            order by browser.rolname
            """,
        )

    return {
        "identity": identity,
        "backend_role": backend_role,
        "schema": schema,
        "schema_version": schema_version,
        "tables": tables,
        "policies": policies,
        "triggers": triggers,
        "indexes": indexes,
        "disallowed_acl": disallowed_acl,
        "browser_roles": browser_roles,
    }


def evaluate_snapshot(snapshot: Mapping[str, Any]) -> dict[str, Any]:
    identity = _mapping(snapshot.get("identity", {}))
    backend = _mapping(snapshot.get("backend_role", {}))
    schema = _mapping(snapshot.get("schema", {}))
    table_rows = [_mapping(row) for row in snapshot.get("tables", [])]
    policy_rows = [_mapping(row) for row in snapshot.get("policies", [])]
    trigger_rows = [_mapping(row) for row in snapshot.get("triggers", [])]
    index_rows = [_mapping(row) for row in snapshot.get("indexes", [])]
    acl_rows = [_mapping(row) for row in snapshot.get("disallowed_acl", [])]
    browser_rows = [_mapping(row) for row in snapshot.get("browser_roles", [])]

    connection_keys = (
        "transaction_read_only",
        "tls_active",
        "session_role_stable",
        "dedicated_login",
        "can_login",
        "no_superuser",
        "no_bypassrls",
        "no_create_role",
        "no_create_db",
        "no_replication",
        "inherits_backend",
        "no_elevated_membership",
    )
    backend_keys = (
        "role_exists",
        "no_login",
        "no_superuser",
        "no_bypassrls",
        "no_create_role",
        "no_create_db",
        "no_replication",
        "no_elevated_membership",
    )

    tables = {str(row.get("table_name")): row for row in table_rows}
    exact_tables = frozenset(tables) == EXPECTED_TABLES
    tenant_rls = exact_tables and all(
        _bool(tables[name].get("rls_enabled")) and _bool(tables[name].get("rls_forced"))
        for name in TENANT_TABLES
    )
    runtime_owns_no_objects = not _bool(schema.get("schema_owned_by_connection")) and all(
        not _bool(row.get("owned_by_connection")) for row in table_rows
    )

    policies = {str(row.get("policy_name")): row for row in policy_rows}
    policy_contract = frozenset(policies) == frozenset(EXPECTED_POLICIES)
    if policy_contract:
        for name, expected in EXPECTED_POLICIES.items():
            row = policies[name]
            policy_contract = policy_contract and (
                str(row.get("table_name")) == expected["table"]
                and str(row.get("command", "")).upper() == expected["command"]
                and str(row.get("permissive", "")).upper() == "PERMISSIVE"
                and _roles(row.get("roles")) == {BACKEND_ROLE}
                and _policy_expression_matches(
                    row.get("qual"),
                    expected["qual"],
                    allowed_or=expected.get("qual_or"),
                )
                and _policy_expression_matches(
                    row.get("with_check"),
                    expected["check"],
                    allowed_or=expected.get("check_or"),
                )
            )
            if not policy_contract:
                break

    triggers = {str(row.get("trigger_name")): row for row in trigger_rows}
    trigger_contract = frozenset(triggers) == frozenset(EXPECTED_TRIGGERS)
    if trigger_contract:
        for name, expected in EXPECTED_TRIGGERS.items():
            row = triggers[name]
            trigger_contract = trigger_contract and (
                str(row.get("table_name")) == expected["table"]
                and str(row.get("function_name")) == expected["function"]
                and str(row.get("enabled")) in {"O", "A"}
                and int(row.get("trigger_type", -1)) == expected["trigger_type"]
                and str(row.get("function_language", "")).lower() == "plpgsql"
                and row.get("security_definer") is False
                and _function_settings(row.get("function_config"))
                == {"search_path=pg_catalog, app_private"}
                and _normalized_function_source(row.get("function_source"))
                == _normalized_function_source(expected["function_source"])
            )
            if not trigger_contract:
                break

    index_names = frozenset(str(row.get("index_name")) for row in index_rows)
    browser_names = frozenset(str(row.get("role_name")) for row in browser_rows)
    browser_roles_isolated = browser_names == BROWSER_ROLES and all(
        not _bool(row.get("inherits_backend")) for row in browser_rows
    )

    checks = {
        "read_only_encrypted_connection": all(
            _bool(identity.get(key)) for key in ("transaction_read_only", "tls_active")
        ),
        "dedicated_runtime_role": all(_bool(identity.get(key)) for key in connection_keys[2:]),
        "backend_group_role_safe": all(_bool(backend.get(key)) for key in backend_keys),
        "private_schema_present": _bool(schema.get("schema_exists")),
        "schema_version_current": snapshot.get("schema_version") == SCHEMA_VERSION,
        "expected_private_tables_only": exact_tables,
        "tenant_tables_force_rls": tenant_rls,
        "runtime_role_owns_no_private_objects": runtime_owns_no_objects,
        "policy_contract_exact": policy_contract,
        "immutable_and_version_triggers_exact": trigger_contract,
        "required_policy_indexes_present": EXPECTED_INDEXES.issubset(index_names),
        "browser_and_public_acl_empty": not acl_rows,
        "browser_roles_not_backend_members": browser_roles_isolated,
    }
    failed = [name for name, passed in checks.items() if not passed]
    return {
        "ok": not failed,
        "ready": not failed,
        "status": "ready" if not failed else "attention",
        "contract": CONTRACT,
        "checks": checks,
        "failed_checks": failed,
        "evidence": {
            "schema": {
                "name": SCHEMA,
                "component": SCHEMA_COMPONENT,
                "version": snapshot.get("schema_version"),
            },
            "role": {
                "backend_group": BACKEND_ROLE,
                "dedicated_login_verified": checks["dedicated_runtime_role"],
            },
            "tables": sorted(EXPECTED_TABLES),
            "rls": {
                "forced_tables": sorted(
                    name
                    for name in TENANT_TABLES
                    if name in tables
                    and _bool(tables[name].get("rls_enabled"))
                    and _bool(tables[name].get("rls_forced"))
                ),
                "required_tables": sorted(TENANT_TABLES),
            },
            "grant": {
                "forbidden_roles": ["PUBLIC", *sorted(BROWSER_ROLES)],
                "disallowed_acl_entries": len(acl_rows),
            },
            "policies": sorted(EXPECTED_POLICIES),
            "triggers": sorted(EXPECTED_TRIGGERS),
            "indexes": sorted(EXPECTED_INDEXES),
        },
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
    }


def _open_connection(database_url: str) -> Any:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError("postgres_driver_missing") from exc
    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=5,
        sslmode="require",
        application_name="supermega-readiness-audit",
        options="-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000",
    )


def audit_database(database_url: str, *, connect_factory: Any = None) -> dict[str, Any]:
    validate_database_url(database_url)
    connection = (connect_factory or _open_connection)(database_url)
    try:
        snapshot = collect_snapshot(connection)
        return evaluate_snapshot(snapshot)
    finally:
        try:
            connection.rollback()
        finally:
            connection.close()


def _safe_failure(code: str) -> dict[str, Any]:
    return {
        "ok": False,
        "ready": False,
        "status": "attention",
        "contract": CONTRACT,
        "error": code,
        "mutation_statements_executed": 0,
        "secret_values_exposed": False,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Audit the SuperMega trial database without mutating it.")
    parser.add_argument("--env-key", default="SUPERMEGA_DATABASE_URL")
    parser.add_argument(
        "--ensure-schema",
        action="store_true",
        help="Require the complete v3 schema contract; this flag never applies migrations.",
    )
    parser.add_argument("--require-ready", action="store_true")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Exercise policy-bypass fixtures without opening a database connection.",
    )
    args = parser.parse_args(argv)

    if args.self_test:
        report = _run_policy_self_test()
        print(json.dumps(report, sort_keys=True))
        return 0 if report["ok"] is True else 1

    if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,80}", args.env_key):
        print(json.dumps(_safe_failure("env_key_invalid"), sort_keys=True))
        return 2
    database_url = str(os.getenv(args.env_key, "")).strip()
    if not database_url:
        print(json.dumps(_safe_failure("database_url_missing"), sort_keys=True))
        return 2

    try:
        report = audit_database(database_url)
    except AuditConfigurationError as exc:
        report = _safe_failure(exc.code)
    except RuntimeError as exc:
        code = str(exc) if str(exc) in {"postgres_driver_missing", "unexpected_database_row"} else "database_audit_failed"
        report = _safe_failure(code)
    except Exception:
        report = _safe_failure("database_connection_or_audit_failed")

    print(json.dumps(report, sort_keys=True))
    if args.require_ready or args.ensure_schema:
        return 0 if report.get("ok") is True else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
