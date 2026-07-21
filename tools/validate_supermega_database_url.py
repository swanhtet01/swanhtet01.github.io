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


CONTRACT = "supermega_private_trial_database_v1"
SCHEMA = "app_private"
BACKEND_ROLE = "supermega_trial_backend"
SCHEMA_COMPONENT = "private_trial_backend"
SCHEMA_VERSION = 1
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
EXPECTED_TRIGGERS = {
    "workspace_events_immutable": ("workspace_events", "reject_workspace_event_mutation"),
    "workspace_state_version_guard": ("workspace_state", "guard_workspace_state_update"),
    "approval_requests_controlled_mutation": ("approval_requests", "guard_approval_mutation"),
}
EXPECTED_POLICIES: dict[str, dict[str, Any]] = {
    "workspace_memberships_self_read": {
        "table": "workspace_memberships",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "active"),
        "check": (),
    },
    "workspace_state_member_read": {
        "table": "workspace_state",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "workspace_memberships", "active"),
        "check": (),
    },
    "workspace_state_capability_insert": {
        "table": "workspace_state",
        "command": "INSERT",
        "qual": (),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "workspace_memberships",
            "command.write",
            "shop.write",
            "plant.write",
            "setup.write",
        ),
    },
    "workspace_state_capability_update": {
        "table": "workspace_state",
        "command": "UPDATE",
        "qual": ("app.workspace_id", "app.actor_id", "workspace_memberships"),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "workspace_memberships",
            "command.write",
            "shop.write",
            "plant.write",
            "setup.write",
        ),
    },
    "workspace_events_member_read": {
        "table": "workspace_events",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "workspace_memberships", "active"),
        "check": (),
    },
    "workspace_events_capability_insert": {
        "table": "workspace_events",
        "command": "INSERT",
        "qual": (),
        "check": (
            "app.workspace_id",
            "app.actor_id",
            "workspace_memberships",
            "command.write",
            "shop.write",
            "plant.write",
            "setup.write",
            "approvals.request",
            "approvals.decide",
        ),
    },
    "approval_requests_member_read": {
        "table": "approval_requests",
        "command": "SELECT",
        "qual": ("app.workspace_id", "app.actor_id", "workspace_memberships", "active"),
        "check": (),
    },
    "approval_requests_capability_insert": {
        "table": "approval_requests",
        "command": "INSERT",
        "qual": (),
        "check": ("app.workspace_id", "app.actor_id", "workspace_memberships", "approvals.request"),
    },
    "approval_requests_capability_update": {
        "table": "approval_requests",
        "command": "UPDATE",
        "qual": ("app.workspace_id", "app.actor_id", "workspace_memberships", "approvals.decide"),
        "check": ("app.workspace_id", "app.actor_id", "workspace_memberships", "approvals.decide"),
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


def _contains_tokens(expression: Any, tokens: Sequence[str]) -> bool:
    if not tokens:
        return expression in (None, "")
    value = str(expression or "").lower()
    return all(token.lower() in value for token in tokens)


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
                   pg_get_triggerdef(t.oid, true) as definition
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            join pg_proc p on p.oid = t.tgfoid
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
                and _contains_tokens(row.get("qual"), expected["qual"])
                and _contains_tokens(row.get("with_check"), expected["check"])
            )
            if not policy_contract:
                break

    triggers = {str(row.get("trigger_name")): row for row in trigger_rows}
    trigger_contract = frozenset(triggers) == frozenset(EXPECTED_TRIGGERS)
    if trigger_contract:
        for name, (table_name, function_name) in EXPECTED_TRIGGERS.items():
            row = triggers[name]
            trigger_contract = trigger_contract and (
                str(row.get("table_name")) == table_name
                and str(row.get("function_name")) == function_name
                and str(row.get("enabled")) in {"O", "A"}
                and "before" in str(row.get("definition", "")).lower()
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
        help="Require the complete v1 schema contract; this flag never applies migrations.",
    )
    parser.add_argument("--require-ready", action="store_true")
    args = parser.parse_args(argv)

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
