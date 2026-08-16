#!/usr/bin/env python3
"""Prove durable commands, recovery, and tenant isolation on an isolated branch.

Instrument for the managed_persistence gate (kernel/managed-pilot-readiness.mjs,
contract v4). Plan: hq/strategy/MANAGED-PERSISTENCE-PROOF-PLAN.md section 2.
House style: tools/verify_private_storage_privacy.py (session env, fixed budget,
digests only, fail-closed, --self-test / --preflight / --confirm flag).

Seven fixed proofs, exact order, against app_private on a disposable Supabase
preview branch (never production):
  1. durable_write_readback            committed command survives a reconnect
  2. exact_idempotent_retry            same command_id+fingerprint is a no-op
  3. version_conflict_rejected         wrong version bump raises; stale writer
                                       matches zero rows
  4. event_immutability_enforced       update/delete on workspace_events raises
  5. cross_tenant_read_denied          tenant B cannot see tenant A rows that
                                       provably exist (canary semantics)
  6. workspace_backup_restore_roundtrip  export tenant A, restore into an empty
                                       fixture workspace, counts+digests match
  7. induced_failure_atomic_rollback   induced mid-transaction failure leaves
                                       zero partial effect

Fixed script: exactly MAX_SESSIONS database connections and MAX_STATEMENTS
statements (transaction control excluded); the run fails closed unless the
final statement count equals the budget exactly.

Session-pooler lane (2026-08-16 tech-lead decision; intent-preserving
strengthening, same principle as the storage verifier's proof-1 canary). The
original pooler rejection exists because TRANSACTION-mode pooling (port 6543)
breaks the exact semantics the seven proofs rely on: transaction-local GUC
identity, cross-statement backend affinity, and session state. SESSION-mode
pooling on port 5432 assigns one dedicated backend per connection and
preserves all of them, so it is accepted as a second lane WITHOUT weakening
anything: (a) the pooler username must carry the project-ref suffix and that
ref must equal the ref bound by the direct ALLOWED_HOST, (b) port 6543 is
hard-rejected with its own error code in both lanes, and (c) session 1 opens
with a live two-statement posture probe proving cross-transaction backend
stability (stable pg_backend_pid) and session-GUC round-trip; any deviation
fails closed as pooler_transaction_mode_detected. The production ref stays
hard-rejected in both lanes.

Branch fixture contract (founder-approved setup SQL, phase F3 of the plan):
  - workspace_memberships holds exactly (workspace_a, actor_a, 'human',
    'active', {'commerce.write'}) and (workspace_b, actor_b, 'human',
    'active', {'commerce.write'});
  - workspace_state / workspace_events / approval_requests hold zero rows for
    all three fixture workspaces; the restore workspace has no membership;
  - workspace_access_controls holds one ACTIVE row for each of the three
    fixture workspaces (the v6 restrictive access gate denies every
    runtime-role read/write without it; discovered during 20260816 staging);
  - the runtime URL logs in as a branch-only role that inherits
    supermega_trial_backend (no SUPERUSER, no BYPASSRLS);
  - the recovery URL logs in as a branch role with recovery authority
    (rolsuper or rolbypassrls), mirroring tools/manage_workspace_recovery.py.

Reuse note (documented deviation): manage_workspace_recovery.py pins
EXPECTED_SCHEMA_VERSION = 5 while this instrument targets schema version 10,
so its export_workspace/build_package/verify_package cannot run here. This
tool imports its SECTION_ORDER, WORKSPACE_PATTERN, RecoveryError, and
_assert_no_secret_fields instead and mirrors its transaction rules (read-only
export, restore acceptance re-verified inside the restore transaction,
rollback on any failure).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import uuid
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Protocol
from urllib.parse import parse_qs, urlsplit

_TOOLS_DIR = str(Path(__file__).resolve().parent)
if _TOOLS_DIR not in sys.path:
    sys.path.insert(0, _TOOLS_DIR)

from manage_workspace_recovery import (  # noqa: E402
    SECTION_ORDER,
    WORKSPACE_PATTERN,
    RecoveryError,
    _assert_no_secret_fields,
)
from validate_supermega_database_url import (  # noqa: E402
    AuditConfigurationError,
    validate_database_url,
)


CONTRACT = "supermega.managed-persistence.v1"
ADAPTER = "postgres_trial_backend_v1"
SCHEMA_COMPONENT = "private_trial_backend"
EXPECTED_SCHEMA_VERSION = 10
MAX_SESSIONS = 4
MAX_STATEMENTS = 49
MAX_RESULT_ROWS = 8
MAX_ROW_BYTES = 32_768
MAX_ROW_KEYS = 32
SURFACE = "commerce"
EVENT_TYPE = "persistence.proof.recorded"
WORKSPACE_PREFIX = "persistence-proof-"
PRODUCTION_PROJECT_REF = "zvtzwcimpvvtkowflhda"
SIGNIFICANT_TIMESTAMP_EXCLUSIONS = frozenset({"created_at", "updated_at"})
DATABASE_REJECTION_SQLSTATES = frozenset({"23502", "23505", "23514", "40001", "42501", "55000"})
SAFE_SSL_MODES = frozenset({"require", "verify-ca", "verify-full"})
ALLOWED_URL_QUERY_KEYS = frozenset({"sslmode", "sslrootcert"})

PROOF_IDS = (
    "durable_write_readback",
    "exact_idempotent_retry",
    "version_conflict_rejected",
    "event_immutability_enforced",
    "cross_tenant_read_denied",
    "workspace_backup_restore_roundtrip",
    "induced_failure_atomic_rollback",
)

EXPECTED_EXPORT_COUNTS = {
    "workspace_memberships": 1,
    "workspace_state": 1,
    "workspace_events": 1,
    "approval_requests": 0,
}
RESTORE_SECTIONS = tuple(
    section for section in SECTION_ORDER if EXPECTED_EXPORT_COUNTS[section] > 0
)
SECTION_SORT_FIELD = {
    "workspace_memberships": "actor_id",
    "workspace_state": "surface",
    "workspace_events": "command_id",
    "approval_requests": "command_id",
}
FIXTURE_ROWS_COMMITTED = {
    "workspace_memberships": 1,
    "workspace_state": 2,
    "workspace_events": 2,
    "approval_requests": 0,
}

EVENT_ID_1 = "00000000-0000-4000-8000-0000000000a1"
COMMAND_ID_1 = "00000000-0000-4000-8000-0000000000c1"
EVENT_ID_2 = "00000000-0000-4000-8000-0000000000a2"
COMMAND_ID_2 = "00000000-0000-4000-8000-0000000000c2"
PROOF_UUID_NAMESPACE = uuid.UUID("6f8c2f6e-2a41-4d7b-9b64-5f0d7a1c9e21")
STATE_V1 = {"orders": 1, "proof": "managed-persistence"}
STATE_V2 = {"orders": 2, "proof": "managed-persistence"}
STATE_CONFLICT = {"orders": 3, "proof": "managed-persistence"}
EVENT_PAYLOAD = {"intent": "record-durable-command"}
EVENT_RESULT_1 = {"ok": True, "resulting_version": 1}
EVENT_RESULT_2 = {"ok": True, "resulting_version": 2}

ENV_ADAPTER = "SUPERMEGA_MANAGED_PERSISTENCE_ADAPTER"
ENV_ALLOWED_HOST = "SUPERMEGA_MANAGED_PERSISTENCE_ALLOWED_HOST"
ENV_OWNER_APPROVAL_ID = "SUPERMEGA_MANAGED_PERSISTENCE_OWNER_APPROVAL_ID"
ENV_WORKSPACE_A = "SUPERMEGA_MANAGED_PERSISTENCE_WORKSPACE_A"
ENV_WORKSPACE_B = "SUPERMEGA_MANAGED_PERSISTENCE_WORKSPACE_B"
ENV_RESTORE_WORKSPACE = "SUPERMEGA_MANAGED_PERSISTENCE_RESTORE_WORKSPACE"
ENV_ACTOR_A = "SUPERMEGA_MANAGED_PERSISTENCE_ACTOR_A"
ENV_ACTOR_B = "SUPERMEGA_MANAGED_PERSISTENCE_ACTOR_B"
ENV_DATABASE_URL = "SUPERMEGA_MANAGED_PERSISTENCE_DATABASE_URL"
ENV_RECOVERY_DATABASE_URL = "SUPERMEGA_MANAGED_PERSISTENCE_RECOVERY_DATABASE_URL"
ENV_POOLER_HOST = "SUPERMEGA_MANAGED_PERSISTENCE_POOLER_HOST"

_DB_HOST_PATTERN = re.compile(r"db\.([a-z0-9]{20})\.supabase\.co\Z")
_POOLER_HOST_PATTERN = re.compile(r"aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com\Z")
_APPROVAL_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._:-]{6,126}[A-Za-z0-9])?\Z")
_ACTOR_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}\Z")
_SAFE_ERROR_PATTERN = re.compile(r"[a-z][a-z0-9_]{2,80}\Z")
_SQLSTATE_PATTERN = re.compile(r"[0-9A-Z]{5}\Z")


class PersistenceProofError(RuntimeError):
    def __init__(self, code: str) -> None:
        if not _SAFE_ERROR_PATTERN.fullmatch(code):
            code = "persistence_proof_failed"
        self.code = code
        super().__init__(code)


class _StatementRejected(Exception):
    """A statement the server rejected; carries only the 5-char SQLSTATE."""

    def __init__(self, sqlstate: str) -> None:
        self.sqlstate = sqlstate if _SQLSTATE_PATTERN.fullmatch(str(sqlstate or "")) else "00000"
        super().__init__(self.sqlstate)


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _digest_text(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _digest_value(value: Any) -> str:
    return _digest_text(_canonical_json(value))


def _fingerprint(workspace: str, sequence: int) -> str:
    command = {
        "command": EVENT_TYPE,
        "sequence": sequence,
        "surface": SURFACE,
        "workspace": workspace,
    }
    return hashlib.sha256(_canonical_json(command).encode("utf-8")).hexdigest()


def _require_environment(environment: dict[str, str], key: str) -> str:
    value = str(environment.get(key, "")).strip()
    if not value:
        raise PersistenceProofError("persistence_environment_incomplete")
    return value


def _validate_workspace(value: str) -> str:
    workspace = value.strip()
    if not WORKSPACE_PATTERN.fullmatch(workspace):
        raise PersistenceProofError("fixture_workspace_invalid")
    if not workspace.startswith(WORKSPACE_PREFIX):
        raise PersistenceProofError("fixture_workspace_prefix_invalid")
    return workspace


def _validate_actor(value: str) -> str:
    actor = value.strip()
    if not _ACTOR_PATTERN.fullmatch(actor):
        raise PersistenceProofError("fixture_actor_invalid")
    return actor


def _validate_database_url(
    raw_url: str,
    *,
    allowed_host: str,
    pooler_host: str | None,
    project_ref: str,
) -> tuple[str, str]:
    """Validate one connection URL and return (url, lane).

    Two lanes only (2026-08-16 tech-lead decision, see module docstring):
    the direct host db.<ref>.supabase.co, or the SESSION-mode pooler host on
    port 5432 with the project-ref-suffixed username bound to the same ref as
    ALLOWED_HOST. Port 6543 (transaction-mode pooling) is hard-rejected with
    its own code in both lanes; nothing else is accepted.
    """
    url = raw_url.strip()
    try:
        validate_database_url(url)
    except AuditConfigurationError as exc:
        code = str(exc.args[0]) if exc.args else "database_url_invalid"
        if not _SAFE_ERROR_PATTERN.fullmatch(code):
            code = "database_url_invalid"
        raise PersistenceProofError(code) from exc
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise PersistenceProofError("database_url_invalid") from exc
    host = str(parsed.hostname or "").lower().rstrip(".")
    if port == 6543:
        raise PersistenceProofError("transaction_pooler_port_forbidden")
    if host == allowed_host:
        lane = "direct"
        if port not in {None, 5432}:
            raise PersistenceProofError("direct_port_required")
    elif pooler_host is not None and host == pooler_host:
        lane = "session_pooler"
        if port not in {None, 5432}:
            raise PersistenceProofError("pooler_session_port_required")
        username = str(parsed.username or "")
        if "." not in username:
            raise PersistenceProofError("pooler_username_ref_missing")
        base_role, _, username_ref = username.rpartition(".")
        if not base_role:
            raise PersistenceProofError("pooler_username_ref_missing")
        if username_ref != project_ref:
            raise PersistenceProofError("pooler_username_ref_mismatch")
    else:
        raise PersistenceProofError("database_url_host_mismatch")
    if parsed.path != "/postgres":
        raise PersistenceProofError("database_name_invalid")
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) - ALLOWED_URL_QUERY_KEYS:
        raise PersistenceProofError("database_url_query_invalid")
    ssl_modes = [value.lower() for value in query.get("sslmode", [])]
    if len(ssl_modes) != 1 or ssl_modes[0] not in SAFE_SSL_MODES:
        raise PersistenceProofError("database_url_tls_required")
    return url, lane


@dataclass(frozen=True)
class AuditConfig:
    host: str
    project_ref: str
    pooler_host: str | None
    connection_lane: str
    owner_approval_id: str
    workspace_a: str
    workspace_b: str
    restore_workspace: str
    actor_a: str
    actor_b: str
    database_url: str
    recovery_database_url: str


def load_config(environment: dict[str, str] | None = None) -> AuditConfig:
    values = dict(os.environ if environment is None else environment)
    if _require_environment(values, ENV_ADAPTER) != ADAPTER:
        raise PersistenceProofError("persistence_adapter_invalid")

    allowed_host = _require_environment(values, ENV_ALLOWED_HOST).lower().rstrip(".")
    host_match = _DB_HOST_PATTERN.fullmatch(allowed_host)
    if not host_match:
        raise PersistenceProofError("allowed_host_invalid")
    project_ref = host_match.group(1)
    if project_ref == PRODUCTION_PROJECT_REF:
        raise PersistenceProofError("production_target_forbidden")

    owner_approval_id = _require_environment(values, ENV_OWNER_APPROVAL_ID)
    if not _APPROVAL_PATTERN.fullmatch(owner_approval_id):
        raise PersistenceProofError("owner_approval_id_invalid")

    workspace_a = _validate_workspace(_require_environment(values, ENV_WORKSPACE_A))
    workspace_b = _validate_workspace(_require_environment(values, ENV_WORKSPACE_B))
    restore_workspace = _validate_workspace(_require_environment(values, ENV_RESTORE_WORKSPACE))
    if len({workspace_a, workspace_b, restore_workspace}) != 3:
        raise PersistenceProofError("fixture_workspaces_not_distinct")

    actor_a = _validate_actor(_require_environment(values, ENV_ACTOR_A))
    actor_b = _validate_actor(_require_environment(values, ENV_ACTOR_B))
    if actor_a == actor_b:
        raise PersistenceProofError("fixture_actors_not_distinct")

    pooler_host: str | None = str(values.get(ENV_POOLER_HOST, "")).strip().lower().rstrip(".") or None
    if pooler_host is not None and not _POOLER_HOST_PATTERN.fullmatch(pooler_host):
        raise PersistenceProofError("pooler_host_invalid")

    database_url, runtime_lane = _validate_database_url(
        _require_environment(values, ENV_DATABASE_URL),
        allowed_host=allowed_host,
        pooler_host=pooler_host,
        project_ref=project_ref,
    )
    recovery_database_url, recovery_lane = _validate_database_url(
        _require_environment(values, ENV_RECOVERY_DATABASE_URL),
        allowed_host=allowed_host,
        pooler_host=pooler_host,
        project_ref=project_ref,
    )
    if database_url == recovery_database_url:
        raise PersistenceProofError("runtime_and_recovery_url_identical")
    connection_lane = (
        "session_pooler"
        if "session_pooler" in {runtime_lane, recovery_lane}
        else "direct"
    )

    return AuditConfig(
        host=allowed_host,
        project_ref=project_ref,
        pooler_host=pooler_host,
        connection_lane=connection_lane,
        owner_approval_id=owner_approval_id,
        workspace_a=workspace_a,
        workspace_b=workspace_b,
        restore_workspace=restore_workspace,
        actor_a=actor_a,
        actor_b=actor_b,
        database_url=database_url,
        recovery_database_url=recovery_database_url,
    )


# The complete fixed statement script. Live SQL per tag is a pinned constant;
# the run must consume the tags in exactly this order and exactly this count.
_SQL: dict[str, str] = {
    # Session-mode posture probe (2026-08-16 tech-lead decision): statement one
    # seeds a SESSION-level GUC and reports the backend pid; statement two runs
    # in the NEXT transaction and must observe the same pid and the same GUC
    # value. A transaction-mode pooler hands consecutive transactions to
    # different backends and resets session state, so either mismatch fails
    # closed as pooler_transaction_mode_detected. The probe GUC is never read
    # by any RLS policy.
    "session_mode_seed": "select pg_backend_pid(), set_config('app.pooler_probe', %s, false)",
    "session_mode_verify": "select pg_backend_pid(), current_setting('app.pooler_probe', true)",
    "role_posture": "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
    "schema_version": (
        "select schema_version from app_private.trial_schema_meta where component = %s"
    ),
    "set_identity": (
        "select set_config('app.workspace_id', %s, true), "
        "set_config('app.actor_id', %s, true), "
        "set_config('app.actor_kind', %s, true)"
    ),
    "insert_state": (
        "insert into app_private.workspace_state "
        "(workspace_id, surface, version, state_json, updated_by) "
        "values (%s, %s, 1, %s::jsonb, %s)"
    ),
    "insert_event": (
        "insert into app_private.workspace_events "
        "(event_id, workspace_id, command_id, command_fingerprint, surface, event_type, "
        "actor_id, actor_kind, expected_version, resulting_version, payload_json, result_json) "
        "values (%s::uuid, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)"
    ),
    "retry_event": (
        "insert into app_private.workspace_events "
        "(event_id, workspace_id, command_id, command_fingerprint, surface, event_type, "
        "actor_id, actor_kind, expected_version, resulting_version, payload_json, result_json) "
        "values (%s::uuid, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb) "
        "on conflict on constraint workspace_events_workspace_id_command_id_key "
        "do nothing returning event_id"
    ),
    "select_event_fingerprint": (
        "select command_fingerprint from app_private.workspace_events "
        "where workspace_id = %s and command_id = %s::uuid"
    ),
    "select_state_version": (
        "select version from app_private.workspace_state "
        "where workspace_id = %s and surface = %s"
    ),
    "conflict_update": (
        "update app_private.workspace_state "
        "set version = 3, state_json = %s::jsonb, updated_by = %s "
        "where workspace_id = %s and surface = %s and version = 1 returning version"
    ),
    "stale_update": (
        "update app_private.workspace_state "
        "set version = 2, state_json = %s::jsonb, updated_by = %s "
        "where workspace_id = %s and surface = %s and version = 999 returning version"
    ),
    "event_update": (
        "update app_private.workspace_events set result_json = %s::jsonb "
        "where event_id = %s::uuid"
    ),
    "event_delete": "delete from app_private.workspace_events where event_id = %s::uuid",
    "rollback_update": (
        "update app_private.workspace_state "
        "set version = 2, state_json = %s::jsonb, updated_by = %s "
        "where workspace_id = %s and surface = %s and version = 1 returning version"
    ),
    "rollback_insert_event": (
        "insert into app_private.workspace_events "
        "(event_id, workspace_id, command_id, command_fingerprint, surface, event_type, "
        "actor_id, actor_kind, expected_version, resulting_version, payload_json, result_json) "
        "values (%s::uuid, %s, %s::uuid, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)"
    ),
    "poison_insert_state": (
        "insert into app_private.workspace_state "
        "(workspace_id, surface, version, state_json, updated_by) "
        "values (%s, %s, 1, %s::jsonb, %s)"
    ),
    "verify_state_version": (
        "select version from app_private.workspace_state "
        "where workspace_id = %s and surface = %s"
    ),
    "verify_event_count": (
        "select count(*) from app_private.workspace_events where workspace_id = %s"
    ),
    "b_memberships": (
        "select workspace_id from app_private.workspace_memberships order by workspace_id"
    ),
    "b_cross_state": (
        "select count(*) from app_private.workspace_state where workspace_id = %s"
    ),
    "b_cross_events": (
        "select count(*) from app_private.workspace_events where workspace_id = %s"
    ),
    "recovery_posture": (
        "select coalesce(rolsuper or rolbypassrls, false) "
        "from pg_roles where rolname = current_user"
    ),
    "recovery_schema": (
        "select schema_version from app_private.trial_schema_meta where component = %s"
    ),
    "export_read_only": "set transaction read only",
    "final_state": (
        "select version, state_json from app_private.workspace_state "
        "where workspace_id = %s and surface = %s"
    ),
    "final_events": (
        "select command_fingerprint from app_private.workspace_events "
        "where workspace_id = %s order by command_id"
    ),
    "final_dest_state": (
        "select to_jsonb(source_row) from app_private.workspace_state as source_row "
        "where workspace_id = %s order by surface"
    ),
}
for _section in SECTION_ORDER:
    _SQL[f"export_{_section}"] = (
        f"select to_jsonb(source_row) from app_private.{_section} as source_row "
        f"where workspace_id = %s order by {SECTION_SORT_FIELD[_section]}"
    )
    _SQL[f"accept_{_section}"] = (
        f"select to_jsonb(source_row) from app_private.{_section} as source_row "
        f"where workspace_id = %s order by {SECTION_SORT_FIELD[_section]}"
    )
    _SQL[f"restore_insert_{_section}"] = (
        f"insert into app_private.{_section} "
        f"select * from jsonb_populate_record(null::app_private.{_section}, %s::jsonb)"
    )

EXPECTED_TAG_SEQUENCE = (
    "session_mode_seed", "session_mode_verify",
    "role_posture", "schema_version",
    "set_identity", "insert_state", "insert_event",
    "set_identity", "retry_event", "select_event_fingerprint", "select_state_version",
    "set_identity", "conflict_update",
    "set_identity", "stale_update",
    "set_identity", "event_update",
    "set_identity", "event_delete",
    "set_identity", "rollback_update", "rollback_insert_event", "poison_insert_state",
    "set_identity", "verify_state_version", "verify_event_count",
    "set_identity", "b_memberships", "b_cross_state", "b_cross_events",
    "recovery_posture", "recovery_schema",
    "export_read_only",
    "export_workspace_memberships", "export_workspace_state",
    "export_workspace_events", "export_approval_requests",
    "restore_insert_workspace_memberships", "restore_insert_workspace_state",
    "restore_insert_workspace_events",
    "accept_workspace_memberships", "accept_workspace_state",
    "accept_workspace_events", "accept_approval_requests",
    "set_identity", "final_state", "final_events",
    "set_identity", "final_dest_state",
)
assert len(EXPECTED_TAG_SEQUENCE) == MAX_STATEMENTS


class AuditSessionTransport(Protocol):
    def execute(self, tag: str, sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]]: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def close(self) -> None: ...


class SessionFactory(Protocol):
    def open(self, kind: str) -> AuditSessionTransport: ...


class _Budget:
    def __init__(self) -> None:
        self.sessions = 0
        self.statements = 0

    def open_session(self) -> None:
        if self.sessions >= MAX_SESSIONS:
            raise PersistenceProofError("session_budget_exceeded")
        self.sessions += 1

    def statement(self) -> None:
        if self.statements >= MAX_STATEMENTS:
            raise PersistenceProofError("statement_budget_exceeded")
        self.statements += 1


class _PostgresSession:
    """Live session. psycopg errors are reduced to SQLSTATE-only rejections."""

    def __init__(self, connection: Any, errors_module: Any) -> None:
        self._connection = connection
        self._errors = errors_module

    def execute(self, tag: str, sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]]:
        del tag
        try:
            cursor = self._connection.cursor()
            cursor.execute(sql, params or None)
            if cursor.description is None:
                return []
            rows = cursor.fetchmany(MAX_RESULT_ROWS + 1)
            return [tuple(row) for row in rows]
        except self._errors.Error as exc:
            sqlstate = getattr(exc, "sqlstate", None)
            if sqlstate:
                raise _StatementRejected(str(sqlstate)) from None
            raise PersistenceProofError("database_operation_failed") from None

    def commit(self) -> None:
        try:
            self._connection.commit()
        except Exception:  # noqa: BLE001 - never leak driver detail
            raise PersistenceProofError("database_commit_failed") from None

    def rollback(self) -> None:
        try:
            self._connection.rollback()
        except Exception:  # noqa: BLE001
            raise PersistenceProofError("database_rollback_failed") from None

    def close(self) -> None:
        try:
            self._connection.close()
        except Exception:  # noqa: BLE001
            pass


class NetworkSessionFactory:
    def __init__(self, config: AuditConfig) -> None:
        self._config = config

    def open(self, kind: str) -> AuditSessionTransport:
        try:
            import psycopg
            import psycopg.errors
        except ImportError as exc:
            raise PersistenceProofError("database_driver_unavailable") from exc
        url = self._config.database_url if kind == "runtime" else self._config.recovery_database_url
        try:
            connection = psycopg.connect(
                url,
                autocommit=False,
                connect_timeout=5,
                prepare_threshold=None,
                application_name="supermega-managed-persistence-proof",
                options=(
                    "-c statement_timeout=8000 "
                    "-c lock_timeout=2000 "
                    "-c idle_in_transaction_session_timeout=15000"
                ),
            )
        except Exception:  # noqa: BLE001 - connection errors may embed the URL
            raise PersistenceProofError("database_connection_failed") from None
        return _PostgresSession(connection, psycopg.errors)


class _AuditSession:
    def __init__(self, transport: AuditSessionTransport, budget: _Budget) -> None:
        self._transport = transport
        self._budget = budget

    def execute(self, tag: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        self._budget.statement()
        try:
            rows = self._transport.execute(tag, _SQL[tag], params)
        except (_StatementRejected, PersistenceProofError):
            raise
        except Exception:  # noqa: BLE001 - unknown driver/fixture failure
            raise PersistenceProofError("database_operation_failed") from None
        if not isinstance(rows, list) or len(rows) > MAX_RESULT_ROWS:
            raise PersistenceProofError("result_rows_exceeded")
        return rows

    def run(self, tag: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        """Execute a statement where a server rejection is NOT expected."""
        try:
            return self.execute(tag, params)
        except _StatementRejected:
            raise PersistenceProofError("database_operation_rejected") from None

    def commit(self) -> None:
        self._transport.commit()

    def rollback(self) -> None:
        self._transport.rollback()

    def close(self) -> None:
        self._transport.close()


def _expect_rejection(operation: Callable[[], Any], failure_code: str) -> str:
    try:
        operation()
    except _StatementRejected as exc:
        if exc.sqlstate in DATABASE_REJECTION_SQLSTATES:
            return exc.sqlstate
        raise PersistenceProofError(failure_code) from None
    raise PersistenceProofError(failure_code)


def _validate_exported_row(section: str, row: Any, *, workspace: str) -> dict[str, Any]:
    if not isinstance(row, dict) or not row:
        raise PersistenceProofError("export_row_shape_invalid")
    if len(row) > MAX_ROW_KEYS:
        raise PersistenceProofError("export_row_shape_invalid")
    if row.get("workspace_id") != workspace:
        raise PersistenceProofError("export_scope_violation")
    if len(_canonical_json(row).encode("utf-8")) > MAX_ROW_BYTES:
        raise PersistenceProofError("export_row_too_large")
    try:
        _assert_no_secret_fields({section: [row]})
    except RecoveryError:
        raise PersistenceProofError("export_secret_field_detected") from None
    return row


def _acceptance_view(
    section: str,
    row: dict[str, Any],
    *,
    workspace_id: str,
    id_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    view = {
        key: value
        for key, value in row.items()
        if key not in SIGNIFICANT_TIMESTAMP_EXCLUSIONS
    }
    view["workspace_id"] = workspace_id
    if id_map:
        id_field = "event_id" if section == "workspace_events" else "approval_id"
        original = id_map.get(str(view.get(id_field, "")))
        if original is not None:
            view[id_field] = original
    return view


def _sorted_views(section: str, views: list[dict[str, Any]]) -> list[dict[str, Any]]:
    field = SECTION_SORT_FIELD[section]
    return sorted(views, key=lambda row: str(row.get(field, "")))


def _restored_row(
    section: str, row: dict[str, Any], *, destination: str
) -> tuple[dict[str, Any], str | None, str | None]:
    """Rewrite one exported row for the restore workspace.

    Returns (row, new_id, original_id); primary-key UUIDs are re-derived
    deterministically because workspace_events/approval_requests ids are
    globally unique and the source rows stay in place on the branch.
    """
    rewritten = dict(row)
    rewritten["workspace_id"] = destination
    if section in {"workspace_events", "approval_requests"}:
        id_field = "event_id" if section == "workspace_events" else "approval_id"
        original = str(rewritten.get(id_field, ""))
        replacement = str(uuid.uuid5(PROOF_UUID_NAMESPACE, f"{destination}/{original}"))
        rewritten[id_field] = replacement
        return rewritten, replacement, original
    return rewritten, None, None


class ManagedPersistenceAudit:
    def __init__(self, config: AuditConfig, factory: SessionFactory) -> None:
        self.config = config
        self.factory = factory
        self.budget = _Budget()

    def _open(self, kind: str) -> _AuditSession:
        self.budget.open_session()
        try:
            transport = self.factory.open(kind)
        except PersistenceProofError:
            raise
        except Exception:  # noqa: BLE001
            raise PersistenceProofError("database_connection_failed") from None
        return _AuditSession(transport, self.budget)

    def _identity(
        self, session: _AuditSession, workspace: str, actor: str
    ) -> None:
        session.run("set_identity", (workspace, actor, "human"))

    def run(self, *, captured_at: datetime | None = None) -> dict[str, Any]:
        now = (captured_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
        config = self.config
        fingerprint_1 = _fingerprint(config.workspace_a, 1)
        fingerprint_2 = _fingerprint(config.workspace_a, 2)
        results: dict[str, dict[str, Any]] = {}

        # ---- Session 1: runtime, tenant A -------------------------------
        session = self._open("runtime")
        try:
            # Session-mode posture probe (2026-08-16 tech-lead decision): the
            # seed statement commits in its own transaction; the verify
            # statement must then see the SAME backend pid and the SAME
            # session GUC value from a new transaction. Anything else means
            # transaction-mode pooling and the run stops before any proof.
            probe_nonce = uuid.uuid4().hex
            seeded = session.run("session_mode_seed", (probe_nonce,))
            if len(seeded) != 1 or seeded[0][1] != probe_nonce:
                raise PersistenceProofError("pooler_transaction_mode_detected")
            session.commit()
            verified = session.run("session_mode_verify")
            if verified != [(seeded[0][0], probe_nonce)]:
                raise PersistenceProofError("pooler_transaction_mode_detected")
            posture = session.run("role_posture")
            if posture != [(False, False)]:
                raise PersistenceProofError("runtime_role_posture_invalid")
            schema = session.run("schema_version", (SCHEMA_COMPONENT,))
            if schema != [(EXPECTED_SCHEMA_VERSION,)]:
                raise PersistenceProofError("schema_version_mismatch")
            session.commit()

            # P1 write half: one durable command = state row + event row.
            self._identity(session, config.workspace_a, config.actor_a)
            session.run(
                "insert_state",
                (config.workspace_a, SURFACE, _canonical_json(STATE_V1), config.actor_a),
            )
            session.run(
                "insert_event",
                (
                    EVENT_ID_1, config.workspace_a, COMMAND_ID_1, fingerprint_1,
                    SURFACE, EVENT_TYPE, config.actor_a, "human", 0, 1,
                    _canonical_json(EVENT_PAYLOAD), _canonical_json(EVENT_RESULT_1),
                ),
            )
            session.commit()

            # P2: the exact same command replays as a no-op.
            self._identity(session, config.workspace_a, config.actor_a)
            retry_rows = session.run(
                "retry_event",
                (
                    EVENT_ID_1, config.workspace_a, COMMAND_ID_1, fingerprint_1,
                    SURFACE, EVENT_TYPE, config.actor_a, "human", 0, 1,
                    _canonical_json(EVENT_PAYLOAD), _canonical_json(EVENT_RESULT_1),
                ),
            )
            if retry_rows:
                raise PersistenceProofError("retry_not_idempotent")
            stored = session.run(
                "select_event_fingerprint", (config.workspace_a, COMMAND_ID_1)
            )
            if stored != [(fingerprint_1,)]:
                raise PersistenceProofError("retry_fingerprint_diverged")
            version_rows = session.run(
                "select_state_version", (config.workspace_a, SURFACE)
            )
            if version_rows != [(1,)]:
                raise PersistenceProofError("retry_state_mutated")
            session.commit()
            results["exact_idempotent_retry"] = {
                "id": "exact_idempotent_retry",
                "result": "no_op_replay",
                "duplicate_rows_created": 0,
            }

            # P3: wrong version bump rejected; stale writer matches nothing.
            self._identity(session, config.workspace_a, config.actor_a)
            conflict_sqlstate = _expect_rejection(
                lambda: session.execute(
                    "conflict_update",
                    (
                        _canonical_json(STATE_CONFLICT), config.actor_a,
                        config.workspace_a, SURFACE,
                    ),
                ),
                "version_conflict_not_rejected",
            )
            session.rollback()
            self._identity(session, config.workspace_a, config.actor_a)
            stale_rows = session.run(
                "stale_update",
                (
                    _canonical_json(STATE_CONFLICT), config.actor_a,
                    config.workspace_a, SURFACE,
                ),
            )
            if stale_rows:
                raise PersistenceProofError("stale_write_accepted")
            session.rollback()
            results["version_conflict_rejected"] = {
                "id": "version_conflict_rejected",
                "result": "rejected",
                "denial_sqlstate": conflict_sqlstate,
                "stale_rows_matched": 0,
            }

            # P4: recorded events are immutable, update and delete both raise.
            self._identity(session, config.workspace_a, config.actor_a)
            update_sqlstate = _expect_rejection(
                lambda: session.execute(
                    "event_update", (_canonical_json({"tampered": True}), EVENT_ID_1)
                ),
                "event_mutation_accepted",
            )
            session.rollback()
            self._identity(session, config.workspace_a, config.actor_a)
            delete_sqlstate = _expect_rejection(
                lambda: session.execute("event_delete", (EVENT_ID_1,)),
                "event_deletion_accepted",
            )
            session.rollback()
            results["event_immutability_enforced"] = {
                "id": "event_immutability_enforced",
                "result": "update_and_delete_rejected",
                "update_sqlstate": update_sqlstate,
                "delete_sqlstate": delete_sqlstate,
            }

            # P7: valid writes plus one induced failure roll back atomically.
            self._identity(session, config.workspace_a, config.actor_a)
            advanced = session.run(
                "rollback_update",
                (
                    _canonical_json(STATE_V2), config.actor_a,
                    config.workspace_a, SURFACE,
                ),
            )
            if advanced != [(2,)]:
                raise PersistenceProofError("rollback_setup_failed")
            session.run(
                "rollback_insert_event",
                (
                    EVENT_ID_2, config.workspace_a, COMMAND_ID_2, fingerprint_2,
                    SURFACE, EVENT_TYPE, config.actor_a, "human", 1, 2,
                    _canonical_json(EVENT_PAYLOAD), _canonical_json(EVENT_RESULT_2),
                ),
            )
            induced_sqlstate = _expect_rejection(
                lambda: session.execute(
                    "poison_insert_state",
                    (config.workspace_a, SURFACE, _canonical_json(STATE_V1), config.actor_a),
                ),
                "induced_failure_not_rejected",
            )
            session.rollback()
            self._identity(session, config.workspace_a, config.actor_a)
            post_version = session.run(
                "verify_state_version", (config.workspace_a, SURFACE)
            )
            post_events = session.run("verify_event_count", (config.workspace_a,))
            if post_version != [(1,)] or post_events != [(1,)]:
                raise PersistenceProofError("rollback_not_atomic")
            session.commit()
            results["induced_failure_atomic_rollback"] = {
                "id": "induced_failure_atomic_rollback",
                "result": "rolled_back_clean",
                "induced_sqlstate": induced_sqlstate,
                "residual_event_rows": 0,
            }
        finally:
            session.close()

        # ---- Session 2: runtime, tenant B (canary: session 1 committed
        # tenant A rows, so B seeing zero of them is a real denial) --------
        session = self._open("runtime")
        try:
            self._identity(session, config.workspace_b, config.actor_b)
            memberships = session.run("b_memberships")
            if memberships != [(config.workspace_b,)]:
                raise PersistenceProofError("cross_tenant_membership_visible")
            cross_state = session.run("b_cross_state", (config.workspace_a,))
            if cross_state != [(0,)]:
                raise PersistenceProofError("cross_tenant_state_visible")
            cross_events = session.run("b_cross_events", (config.workspace_a,))
            if cross_events != [(0,)]:
                raise PersistenceProofError("cross_tenant_events_visible")
            session.rollback()
            results["cross_tenant_read_denied"] = {
                "id": "cross_tenant_read_denied",
                "result": "denied_with_canary",
                "foreign_rows_visible": 0,
            }
        finally:
            session.close()

        # ---- Session 3: recovery, export + restore round trip -----------
        session = self._open("recovery")
        exported: dict[str, list[dict[str, Any]]] = {}
        id_map: dict[str, str] = {}
        section_digests: dict[str, str] = {}
        try:
            authority = session.run("recovery_posture")
            if authority != [(True,)]:
                raise PersistenceProofError("recovery_authority_missing")
            schema = session.run("recovery_schema", (SCHEMA_COMPONENT,))
            if schema != [(EXPECTED_SCHEMA_VERSION,)]:
                raise PersistenceProofError("schema_version_mismatch")
            session.commit()

            session.run("export_read_only")
            for section in SECTION_ORDER:
                rows = [
                    _validate_exported_row(section, row[0], workspace=config.workspace_a)
                    for row in session.run(f"export_{section}", (config.workspace_a,))
                ]
                if len(rows) != EXPECTED_EXPORT_COUNTS[section]:
                    raise PersistenceProofError("fixture_shape_unexpected")
                exported[section] = rows
            session.commit()

            for section in RESTORE_SECTIONS:
                for row in exported[section]:
                    rewritten, replacement, original = _restored_row(
                        section, row, destination=config.restore_workspace
                    )
                    if replacement is not None and original is not None:
                        id_map[replacement] = original
                    session.run(
                        f"restore_insert_{section}", (_canonical_json(rewritten),)
                    )
            for section in SECTION_ORDER:
                restored_rows = [
                    _validate_exported_row(
                        section, row[0], workspace=config.restore_workspace
                    )
                    for row in session.run(
                        f"accept_{section}", (config.restore_workspace,)
                    )
                ]
                if len(restored_rows) != EXPECTED_EXPORT_COUNTS[section]:
                    raise PersistenceProofError("restore_count_mismatch")
                source_views = _sorted_views(section, [
                    _acceptance_view(section, row, workspace_id=config.workspace_a)
                    for row in exported[section]
                ])
                restored_views = _sorted_views(section, [
                    _acceptance_view(
                        section, row, workspace_id=config.workspace_a, id_map=id_map
                    )
                    for row in restored_rows
                ])
                section_digests[section] = _digest_value(source_views)
                if _digest_value(restored_views) != section_digests[section]:
                    raise PersistenceProofError("restore_content_mismatch")
            session.commit()
        finally:
            session.close()

        # ---- Session 4: fresh runtime connection, durable read-back -----
        session = self._open("runtime")
        try:
            self._identity(session, config.workspace_a, config.actor_a)
            final_state = session.run("final_state", (config.workspace_a, SURFACE))
            if (
                len(final_state) != 1
                or final_state[0][0] != 1
                or _digest_value(final_state[0][1]) != _digest_value(STATE_V1)
            ):
                raise PersistenceProofError("durable_state_readback_failed")
            final_events = session.run("final_events", (config.workspace_a,))
            if final_events != [(fingerprint_1,)]:
                raise PersistenceProofError("durable_event_readback_failed")
            session.rollback()
            results["durable_write_readback"] = {
                "id": "durable_write_readback",
                "result": "readback_exact",
                "state_version": 1,
            }

            self._identity(session, config.restore_workspace, config.actor_a)
            dest_rows = [
                _validate_exported_row(
                    "workspace_state", row[0], workspace=config.restore_workspace
                )
                for row in session.run("final_dest_state", (config.restore_workspace,))
            ]
            session.rollback()
            if len(dest_rows) != 1:
                raise PersistenceProofError("restore_not_durable")
            durable_view = _sorted_views("workspace_state", [
                _acceptance_view(
                    "workspace_state", dest_rows[0], workspace_id=config.workspace_a
                )
            ])
            if _digest_value(durable_view) != section_digests["workspace_state"]:
                raise PersistenceProofError("restore_not_durable")
            results["workspace_backup_restore_roundtrip"] = {
                "id": "workspace_backup_restore_roundtrip",
                "result": "roundtrip_exact",
                "rows_restored": sum(
                    EXPECTED_EXPORT_COUNTS[section] for section in RESTORE_SECTIONS
                ),
            }
        finally:
            session.close()

        if self.budget.statements != MAX_STATEMENTS:
            raise PersistenceProofError("statement_budget_mismatch")
        if self.budget.sessions != MAX_SESSIONS:
            raise PersistenceProofError("session_budget_mismatch")
        if set(results) != set(PROOF_IDS):
            raise PersistenceProofError("proof_set_incomplete")

        evidence = {
            "contract": CONTRACT,
            "adapter": ADAPTER,
            "connection_lane": config.connection_lane,
            "target_host_digest": _digest_text(config.host),
            "owner_approval_digest": _digest_text(config.owner_approval_id),
            "workspace_a_digest": _digest_text(config.workspace_a),
            "workspace_b_digest": _digest_text(config.workspace_b),
            "restore_workspace_digest": _digest_text(config.restore_workspace),
            "captured_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "schema_version_observed": EXPECTED_SCHEMA_VERSION,
            "proofs": [results[proof_id] for proof_id in PROOF_IDS],
            "sessions_performed": self.budget.sessions,
            "statements_performed": self.budget.statements,
            "export_row_counts": dict(EXPECTED_EXPORT_COUNTS),
            "export_section_sha256": section_digests,
            "fixture_rows_committed": dict(FIXTURE_ROWS_COMMITTED),
            "writes_confined_to_fixture_workspaces": True,
            "secrets_exposed": False,
            "tenant_rows_exposed": False,
        }
        return {"ok": True, **evidence, "evidence_digest": _digest_text(_canonical_json(evidence))}


def configuration_preflight(
    config: AuditConfig, *, captured_at: datetime | None = None
) -> dict[str, Any]:
    now = (captured_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    evidence = {
        "contract": CONTRACT,
        "mode": "offline_configuration_preflight",
        "adapter": ADAPTER,
        "connection_lane": config.connection_lane,
        "target_host_digest": _digest_text(config.host),
        "owner_approval_digest": _digest_text(config.owner_approval_id),
        "workspace_a_digest": _digest_text(config.workspace_a),
        "workspace_b_digest": _digest_text(config.workspace_b),
        "restore_workspace_digest": _digest_text(config.restore_workspace),
        "captured_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "maximum_live_sessions": MAX_SESSIONS,
        "maximum_live_statements": MAX_STATEMENTS,
        "network_requests_performed": 0,
        "database_connections_performed": 0,
        "persistent_mutations_performed": 0,
        "credential_shapes_validated_locally": True,
        "provider_credentials_verified": False,
        "secrets_exposed": False,
        "tenant_rows_exposed": False,
    }
    return {"ok": True, **evidence, "evidence_digest": _digest_text(_canonical_json(evidence))}


# --------------------------------------------------------------------------
# Offline adversarial self-test fixtures. The fixture database simulates the
# v10 app_private semantics per statement tag; each named defect models one
# way the hosted database could misbehave, and the self-test requires the
# instrument to fail closed with the exact error code for every one of them.
# --------------------------------------------------------------------------

_STAMP_EXPORT = "2030-01-01T00:00:00Z"
_STAMP_RESTORE = "2030-01-02T00:00:00Z"


class _FixtureFactory:
    def __init__(self, config: AuditConfig, defects: frozenset[str] = frozenset()) -> None:
        self.config = config
        self.defects = frozenset(defects)
        self.tags: list[str] = []
        self.opened = 0
        self.store: dict[str, dict[Any, dict[str, Any]]] = {
            "memberships": {
                (config.workspace_a, config.actor_a): {
                    "workspace_id": config.workspace_a,
                    "actor_id": config.actor_a,
                    "actor_kind": "human",
                    "status": "active",
                    "capabilities": ["commerce.write"],
                    "created_at": _STAMP_EXPORT,
                    "updated_at": _STAMP_EXPORT,
                },
                (config.workspace_b, config.actor_b): {
                    "workspace_id": config.workspace_b,
                    "actor_id": config.actor_b,
                    "actor_kind": "human",
                    "status": "active",
                    "capabilities": ["commerce.write"],
                    "created_at": _STAMP_EXPORT,
                    "updated_at": _STAMP_EXPORT,
                },
            },
            "state": {},
            "events": {},
            "approvals": {},
        }

    def open(self, kind: str) -> "_FixtureSession":
        self.opened += 1
        return _FixtureSession(self, kind)


class _FixtureSession:
    def __init__(self, factory: _FixtureFactory, kind: str) -> None:
        self.factory = factory
        self.kind = kind
        self.working: dict[str, dict[Any, dict[str, Any]]] | None = None
        self.identity: tuple[str, str, str] | None = None
        self._restore_written = False
        # Session-scoped connection posture: a dedicated backend keeps one pid
        # and its session GUCs for the whole connection. The
        # 'pooler_transaction_mode' defect models a transaction-mode pooler:
        # every transaction lands on a fresh backend (new pid) and session
        # state is discarded between transactions.
        self.session_gucs: dict[str, str] = {}
        self._transaction_serial = 0

    def _backend_pid(self) -> int:
        if "pooler_transaction_mode" in self.factory.defects:
            return 4242 + self._transaction_serial
        return 4242

    # -- transaction plumbing ------------------------------------------
    def _work(self) -> dict[str, dict[Any, dict[str, Any]]]:
        if self.working is None:
            self.working = deepcopy(self.factory.store)
            self._transaction_serial += 1
        return self.working

    def commit(self) -> None:
        if self.working is not None:
            dropped = (
                "restore_not_durable" in self.factory.defects and self._restore_written
            )
            if not dropped:
                self.factory.store = self.working
        self.working = None
        self.identity = None
        self._restore_written = False
        if "pooler_transaction_mode" in self.factory.defects:
            self.session_gucs.clear()

    def rollback(self) -> None:
        if self.working is not None and "rollback_leaks" in self.factory.defects:
            self.factory.store = self.working
        self.working = None
        self.identity = None
        self._restore_written = False
        if "pooler_transaction_mode" in self.factory.defects:
            self.session_gucs.clear()

    def close(self) -> None:
        return None

    # -- policy helpers -------------------------------------------------
    def _member_ok(
        self,
        work: dict[str, dict[Any, dict[str, Any]]],
        workspace: str,
        *,
        capability: str | None = None,
    ) -> bool:
        if self.identity is None:
            return False
        ident_workspace, ident_actor, ident_kind = self.identity
        if workspace != ident_workspace or ident_kind not in {"human", "service", "agent"}:
            return False
        row = work["memberships"].get((workspace, ident_actor))
        if row is None or row["status"] != "active" or row["actor_kind"] != ident_kind:
            return False
        if capability is not None and capability not in row["capabilities"]:
            return False
        return True

    # -- dispatch --------------------------------------------------------
    def execute(self, tag: str, sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]]:
        del sql
        self.factory.tags.append(tag)
        defects = self.factory.defects
        work = self._work()
        config = self.factory.config

        if tag == "session_mode_seed":
            (nonce,) = params
            self.session_gucs["app.pooler_probe"] = str(nonce)
            return [(self._backend_pid(), str(nonce))]
        if tag == "session_mode_verify":
            return [(self._backend_pid(), self.session_gucs.get("app.pooler_probe"))]
        if tag == "role_posture":
            return [("role_superuser" in defects, "role_bypassrls" in defects)]
        if tag in {"schema_version", "recovery_schema"}:
            return [(9 if "schema_drift" in defects else EXPECTED_SCHEMA_VERSION,)]
        if tag == "set_identity":
            self.identity = (str(params[0]), str(params[1]), str(params[2]))
            return [(None,)]
        if tag in {"insert_state", "poison_insert_state"}:
            workspace, surface, state_json, updated_by = params
            if "raw_error_leak" in defects and tag == "insert_state":
                raise RuntimeError(
                    f"connection failure postgresql://leak:password=hunter2@{config.host}/postgres"
                )
            if (
                not self._member_ok(work, str(workspace), capability="commerce.write")
                or updated_by != self.identity[1]
            ):
                raise _StatementRejected("42501")
            key = (str(workspace), str(surface))
            if key in work["state"]:
                raise _StatementRejected("23505")
            work["state"][key] = {
                "workspace_id": str(workspace),
                "surface": str(surface),
                "version": 1,
                "state_json": json.loads(str(state_json)),
                "updated_by": str(updated_by),
                "updated_at": _STAMP_EXPORT,
            }
            return []
        if tag in {"insert_event", "rollback_insert_event", "retry_event"}:
            (
                event_id, workspace, command_id, fingerprint, surface, event_type,
                actor_id, actor_kind, expected_version, resulting_version,
                payload_json, result_json,
            ) = params
            if (
                not self._member_ok(work, str(workspace), capability="commerce.write")
                or actor_id != self.identity[1]
                or actor_kind != self.identity[2]
            ):
                raise _StatementRejected("42501")
            duplicate = any(
                row["workspace_id"] == workspace and row["command_id"] == command_id
                for row in work["events"].values()
            )
            if duplicate:
                if tag != "retry_event":
                    raise _StatementRejected("23505")
                if "retry_duplicates" in defects:
                    extra_id = str(uuid.uuid5(PROOF_UUID_NAMESPACE, "duplicate"))
                    work["events"][extra_id] = {
                        "event_id": extra_id,
                        "workspace_id": str(workspace),
                        "command_id": str(command_id),
                        "command_fingerprint": str(fingerprint),
                        "surface": str(surface),
                        "event_type": str(event_type),
                        "actor_id": str(actor_id),
                        "actor_kind": str(actor_kind),
                        "expected_version": expected_version,
                        "resulting_version": resulting_version,
                        "payload_json": json.loads(str(payload_json)),
                        "result_json": json.loads(str(result_json)),
                        "created_at": _STAMP_EXPORT,
                    }
                    return [(extra_id,)]
                return []
            if str(event_id) in work["events"]:
                raise _StatementRejected("23505")
            stored_fingerprint = str(fingerprint)
            if "fingerprint_drift" in defects:
                stored_fingerprint = stored_fingerprint[::-1]
            work["events"][str(event_id)] = {
                "event_id": str(event_id),
                "workspace_id": str(workspace),
                "command_id": str(command_id),
                "command_fingerprint": stored_fingerprint,
                "surface": str(surface),
                "event_type": str(event_type),
                "actor_id": str(actor_id),
                "actor_kind": str(actor_kind),
                "expected_version": expected_version,
                "resulting_version": resulting_version,
                "payload_json": json.loads(str(payload_json)),
                "result_json": json.loads(str(result_json)),
                "created_at": _STAMP_EXPORT,
            }
            return [(str(event_id),)] if tag == "retry_event" else []
        if tag == "select_event_fingerprint":
            workspace, command_id = params
            if not self._member_ok(work, str(workspace)):
                return []
            return [
                (row["command_fingerprint"],)
                for row in work["events"].values()
                if row["workspace_id"] == workspace and row["command_id"] == command_id
            ]
        if tag in {"select_state_version", "verify_state_version"}:
            workspace, surface = params
            if not self._member_ok(work, str(workspace)):
                return []
            row = work["state"].get((str(workspace), str(surface)))
            return [] if row is None else [(row["version"],)]
        if tag == "conflict_update":
            _state_json, updated_by, workspace, surface = params
            if not self._member_ok(work, str(workspace), capability="commerce.write"):
                return []
            row = work["state"].get((str(workspace), str(surface)))
            if row is None or row["version"] != 1:
                return []
            if "version_guard_missing" in defects:
                row["version"] = 3
                row["updated_by"] = str(updated_by)
                return [(3,)]
            raise _StatementRejected("40001")
        if tag == "stale_update":
            _state_json, updated_by, workspace, surface = params
            row = work["state"].get((str(workspace), str(surface)))
            if row is not None and "stale_matches" in defects:
                row["version"] = 2
                row["updated_by"] = str(updated_by)
                return [(2,)]
            return []
        if tag == "event_update":
            result_json, event_id = params
            if "event_update_allowed" in defects:
                row = work["events"].get(str(event_id))
                if row is not None:
                    row["result_json"] = json.loads(str(result_json))
                return []
            raise _StatementRejected("55000")
        if tag == "event_delete":
            (event_id,) = params
            if "event_delete_allowed" in defects:
                work["events"].pop(str(event_id), None)
                return []
            raise _StatementRejected("55000")
        if tag == "rollback_update":
            state_json, updated_by, workspace, surface = params
            if not self._member_ok(work, str(workspace), capability="commerce.write"):
                return []
            row = work["state"].get((str(workspace), str(surface)))
            if row is None or row["version"] != 1:
                return []
            row["version"] = 2
            row["state_json"] = json.loads(str(state_json))
            row["updated_by"] = str(updated_by)
            row["updated_at"] = _STAMP_RESTORE
            return [(2,)]
        if tag == "verify_event_count":
            (workspace,) = params
            if not self._member_ok(work, str(workspace)):
                return [(0,)]
            count = sum(
                1 for row in work["events"].values() if row["workspace_id"] == workspace
            )
            return [(count,)]
        if tag == "b_memberships":
            if self.identity is None:
                return []
            _ident_workspace, ident_actor, ident_kind = self.identity
            visible = sorted(
                workspace
                for (workspace, actor), row in work["memberships"].items()
                if actor == ident_actor
                and row["actor_kind"] == ident_kind
                and row["status"] == "active"
            )
            if "membership_leak" in defects:
                visible = sorted([*visible, config.workspace_a])
            return [(workspace,) for workspace in visible]
        if tag == "b_cross_state":
            return [(1 if "cross_state_visible" in defects else 0,)]
        if tag == "b_cross_events":
            return [(1 if "cross_events_visible" in defects else 0,)]
        if tag == "recovery_posture":
            return [("recovery_unprivileged" not in defects,)]
        if tag == "export_read_only":
            return []
        if tag.startswith("export_"):
            section = tag.removeprefix("export_")
            (workspace,) = params
            rows = self._section_rows(work, section, str(workspace))
            if section == "workspace_memberships" and "export_overflow" in defects:
                extra = deepcopy(rows[0]) if rows else {"workspace_id": str(workspace)}
                extra["actor_id"] = "unexpected-extra-actor"
                rows = [*rows, extra]
            if section == "workspace_memberships" and "export_foreign_row" in defects:
                foreign = {
                    "workspace_id": config.workspace_b,
                    "actor_id": config.actor_b,
                    "actor_kind": "human",
                    "status": "active",
                    "capabilities": ["commerce.write"],
                    "created_at": _STAMP_EXPORT,
                    "updated_at": _STAMP_EXPORT,
                }
                rows = [*rows, foreign]
            if section == "workspace_state" and "export_row_huge" in defects:
                rows = [dict(rows[0], state_json={"padding": "x" * (MAX_ROW_BYTES + 1)})]
            return [(row,) for row in rows]
        if tag.startswith("restore_insert_"):
            section = tag.removeprefix("restore_insert_")
            self._restore_written = True
            (row_json,) = params
            row = json.loads(str(row_json))
            if section == "workspace_state":
                if "restore_drops_row" in defects:
                    return []
                if "restore_mutates" in defects:
                    row["state_json"] = {"orders": 999, "proof": "tampered"}
                key = (row["workspace_id"], row["surface"])
                if key in work["state"]:
                    raise _StatementRejected("23505")
                if row.get("version") != 1:
                    raise _StatementRejected("55000")
                row["updated_at"] = _STAMP_RESTORE
                work["state"][key] = row
                return []
            if section == "workspace_memberships":
                key = (row["workspace_id"], row["actor_id"])
                if key in work["memberships"]:
                    raise _StatementRejected("23505")
                row["created_at"] = _STAMP_RESTORE
                row["updated_at"] = _STAMP_RESTORE
                work["memberships"][key] = row
                return []
            if section == "workspace_events":
                if row["event_id"] in work["events"]:
                    raise _StatementRejected("23505")
                row["created_at"] = _STAMP_RESTORE
                work["events"][row["event_id"]] = row
                return []
            raise _StatementRejected("42501")
        if tag.startswith("accept_"):
            section = tag.removeprefix("accept_")
            (workspace,) = params
            return [(row,) for row in self._section_rows(work, section, str(workspace))]
        if tag == "final_state":
            workspace, surface = params
            if "durable_state_lost" in defects or not self._member_ok(work, str(workspace)):
                return []
            row = work["state"].get((str(workspace), str(surface)))
            return [] if row is None else [(row["version"], deepcopy(row["state_json"]))]
        if tag == "final_events":
            (workspace,) = params
            if "durable_event_lost" in defects or not self._member_ok(work, str(workspace)):
                return []
            rows = sorted(
                (
                    row
                    for row in work["events"].values()
                    if row["workspace_id"] == workspace
                ),
                key=lambda row: str(row["command_id"]),
            )
            return [(row["command_fingerprint"],) for row in rows]
        if tag == "final_dest_state":
            (workspace,) = params
            if not self._member_ok(work, str(workspace)):
                return []
            return [
                (row,)
                for row in self._section_rows(work, "workspace_state", str(workspace))
            ]
        raise PersistenceProofError("fixture_tag_unknown")

    def _section_rows(
        self,
        work: dict[str, dict[Any, dict[str, Any]]],
        section: str,
        workspace: str,
    ) -> list[dict[str, Any]]:
        table = {
            "workspace_memberships": "memberships",
            "workspace_state": "state",
            "workspace_events": "events",
            "approval_requests": "approvals",
        }[section]
        rows = [
            deepcopy(row)
            for row in work[table].values()
            if row["workspace_id"] == workspace
        ]
        return sorted(rows, key=lambda row: str(row.get(SECTION_SORT_FIELD[section], "")))


def _fixture_environment() -> dict[str, str]:
    host = "db.fixturebranch0000001.supabase.co"
    return {
        ENV_ADAPTER: ADAPTER,
        ENV_ALLOWED_HOST: host,
        ENV_OWNER_APPROVAL_ID: "OWNER-PERSISTENCE-PROOF-001",
        ENV_WORKSPACE_A: "persistence-proof-selftest-a",
        ENV_WORKSPACE_B: "persistence-proof-selftest-b",
        ENV_RESTORE_WORKSPACE: "persistence-proof-selftest-restore",
        ENV_ACTOR_A: "proof-owner-a",
        ENV_ACTOR_B: "proof-owner-b",
        ENV_DATABASE_URL: (
            f"postgresql://persistence_proof_runtime:fixture-secret-a@{host}:5432/postgres"
            "?sslmode=require"
        ),
        ENV_RECOVERY_DATABASE_URL: (
            f"postgresql://persistence_proof_recovery:fixture-secret-b@{host}:5432/postgres"
            "?sslmode=require"
        ),
    }


def _pooler_environment() -> dict[str, str]:
    pooler_host = "aws-0-ap-southeast-1.pooler.supabase.com"
    return {
        **_fixture_environment(),
        ENV_POOLER_HOST: pooler_host,
        ENV_DATABASE_URL: (
            "postgresql://persistence_proof_runtime.fixturebranch0000001:fixture-secret-a"
            f"@{pooler_host}:5432/postgres?sslmode=require"
        ),
        ENV_RECOVERY_DATABASE_URL: (
            "postgresql://persistence_proof_recovery.fixturebranch0000001:fixture-secret-b"
            f"@{pooler_host}:5432/postgres?sslmode=require"
        ),
    }


def run_self_test() -> dict[str, Any]:
    cases = 0
    environment = _fixture_environment()
    config = load_config(environment)
    frozen_now = datetime(2030, 1, 3, tzinfo=timezone.utc)

    # Case: the happy path passes all seven proofs on the exact fixed script.
    cases += 1
    happy_factory = _FixtureFactory(config)
    report = ManagedPersistenceAudit(config, happy_factory).run(captured_at=frozen_now)
    if (
        report["ok"] is not True
        or report["connection_lane"] != "direct"
        or report["sessions_performed"] != MAX_SESSIONS
        or report["statements_performed"] != MAX_STATEMENTS
        or [proof["id"] for proof in report["proofs"]] != list(PROOF_IDS)
        or any(proof.get("result") is None for proof in report["proofs"])
        or happy_factory.opened != MAX_SESSIONS
        or tuple(happy_factory.tags) != EXPECTED_TAG_SEQUENCE
    ):
        raise PersistenceProofError("self_test_happy_path_failed")

    # Case: the session-pooler lane passes the identical fixed script with the
    # ref-suffixed usernames and reports its lane in the evidence.
    cases += 1
    pooler_config = load_config(_pooler_environment())
    pooler_factory = _FixtureFactory(pooler_config)
    pooler_report = ManagedPersistenceAudit(pooler_config, pooler_factory).run(
        captured_at=frozen_now
    )
    if (
        pooler_report["ok"] is not True
        or pooler_report["connection_lane"] != "session_pooler"
        or pooler_report["statements_performed"] != MAX_STATEMENTS
        or [proof["id"] for proof in pooler_report["proofs"]] != list(PROOF_IDS)
        or tuple(pooler_factory.tags) != EXPECTED_TAG_SEQUENCE
    ):
        raise PersistenceProofError("self_test_pooler_lane_failed")

    def expect_failure(
        code: str,
        defects: frozenset[str],
        audit_config: AuditConfig | None = None,
    ) -> PersistenceProofError:
        nonlocal cases
        cases += 1
        target_config = audit_config or config
        try:
            ManagedPersistenceAudit(
                target_config, _FixtureFactory(target_config, defects)
            ).run(captured_at=frozen_now)
        except PersistenceProofError as exc:
            if exc.code == code:
                return exc
            raise PersistenceProofError("self_test_expected_failure_missing") from exc
        raise PersistenceProofError("self_test_expected_failure_missing")

    # Cases: a transaction-mode pooler is detected live in either lane before
    # any proof statement runs.
    expect_failure(
        "pooler_transaction_mode_detected",
        frozenset({"pooler_transaction_mode"}),
        pooler_config,
    )
    expect_failure(
        "pooler_transaction_mode_detected", frozenset({"pooler_transaction_mode"})
    )

    # Cases: every laundering / defect path fails closed with its exact code.
    expect_failure("runtime_role_posture_invalid", frozenset({"role_superuser"}))
    expect_failure("runtime_role_posture_invalid", frozenset({"role_bypassrls"}))
    expect_failure("schema_version_mismatch", frozenset({"schema_drift"}))
    expect_failure("recovery_authority_missing", frozenset({"recovery_unprivileged"}))
    expect_failure("retry_not_idempotent", frozenset({"retry_duplicates"}))
    expect_failure("retry_fingerprint_diverged", frozenset({"fingerprint_drift"}))
    expect_failure("version_conflict_not_rejected", frozenset({"version_guard_missing"}))
    expect_failure("stale_write_accepted", frozenset({"stale_matches"}))
    expect_failure("event_mutation_accepted", frozenset({"event_update_allowed"}))
    expect_failure("event_deletion_accepted", frozenset({"event_delete_allowed"}))
    expect_failure("cross_tenant_membership_visible", frozenset({"membership_leak"}))
    expect_failure("cross_tenant_state_visible", frozenset({"cross_state_visible"}))
    expect_failure("cross_tenant_events_visible", frozenset({"cross_events_visible"}))
    expect_failure("rollback_not_atomic", frozenset({"rollback_leaks"}))
    expect_failure("restore_count_mismatch", frozenset({"restore_drops_row"}))
    expect_failure("restore_content_mismatch", frozenset({"restore_mutates"}))
    expect_failure("restore_not_durable", frozenset({"restore_not_durable"}))
    expect_failure("fixture_shape_unexpected", frozenset({"export_overflow"}))
    expect_failure("export_row_too_large", frozenset({"export_row_huge"}))
    expect_failure("export_scope_violation", frozenset({"export_foreign_row"}))
    expect_failure("durable_state_readback_failed", frozenset({"durable_state_lost"}))
    expect_failure("durable_event_readback_failed", frozenset({"durable_event_lost"}))
    leak_error = expect_failure("database_operation_failed", frozenset({"raw_error_leak"}))

    # Cases: configuration laundering is rejected before any connection.
    def expect_config_failure(code: str, mutation: dict[str, str]) -> None:
        nonlocal cases
        cases += 1
        try:
            load_config({**environment, **mutation})
        except PersistenceProofError as exc:
            if exc.code == code:
                return
            raise PersistenceProofError("self_test_config_rejection_failed") from exc
        raise PersistenceProofError("self_test_config_rejection_failed")

    production_host = f"db.{PRODUCTION_PROJECT_REF}.supabase.co"
    expect_config_failure("persistence_adapter_invalid", {ENV_ADAPTER: "other_adapter"})
    expect_config_failure(
        "production_target_forbidden",
        {
            ENV_ALLOWED_HOST: production_host,
            ENV_DATABASE_URL: (
                f"postgresql://runtime:secret@{production_host}:5432/postgres?sslmode=require"
            ),
            ENV_RECOVERY_DATABASE_URL: (
                f"postgresql://postgres:secret@{production_host}:5432/postgres?sslmode=require"
            ),
        },
    )
    expect_config_failure(
        "allowed_host_invalid",
        {ENV_ALLOWED_HOST: "aws-0-ap-southeast-1.pooler.supabase.com"},
    )
    expect_config_failure(
        "database_url_host_mismatch",
        {
            ENV_DATABASE_URL: (
                "postgresql://runtime:secret@db.otherbranch000000002.supabase.co:5432/postgres"
                "?sslmode=require"
            )
        },
    )
    expect_config_failure(
        "direct_port_required",
        {
            ENV_DATABASE_URL: (
                f"postgresql://runtime:secret@{environment[ENV_ALLOWED_HOST]}:5433/postgres"
                "?sslmode=require"
            )
        },
    )
    expect_config_failure(
        "transaction_pooler_port_forbidden",
        {
            ENV_DATABASE_URL: (
                f"postgresql://runtime:secret@{environment[ENV_ALLOWED_HOST]}:6543/postgres"
                "?sslmode=require"
            )
        },
    )
    pooler_environment = _pooler_environment()

    def expect_pooler_config_failure(code: str, mutation: dict[str, str]) -> None:
        nonlocal cases
        cases += 1
        try:
            load_config({**pooler_environment, **mutation})
        except PersistenceProofError as exc:
            if exc.code == code:
                return
            raise PersistenceProofError("self_test_config_rejection_failed") from exc
        raise PersistenceProofError("self_test_config_rejection_failed")

    pooler_host_value = pooler_environment[ENV_POOLER_HOST]
    expect_pooler_config_failure(
        "transaction_pooler_port_forbidden",
        {
            ENV_DATABASE_URL: (
                "postgresql://persistence_proof_runtime.fixturebranch0000001:fixture-secret-a"
                f"@{pooler_host_value}:6543/postgres?sslmode=require"
            )
        },
    )
    expect_pooler_config_failure(
        "pooler_username_ref_mismatch",
        {
            ENV_DATABASE_URL: (
                "postgresql://persistence_proof_runtime.wrongref000000000001:fixture-secret-a"
                f"@{pooler_host_value}:5432/postgres?sslmode=require"
            )
        },
    )
    expect_pooler_config_failure(
        "pooler_username_ref_missing",
        {
            ENV_DATABASE_URL: (
                "postgresql://persistence_proof_runtime:fixture-secret-a"
                f"@{pooler_host_value}:5432/postgres?sslmode=require"
            )
        },
    )
    expect_pooler_config_failure(
        "pooler_host_invalid", {ENV_POOLER_HOST: "evil.example.com"}
    )
    expect_config_failure(
        "database_url_tls_required",
        {
            ENV_DATABASE_URL: (
                f"postgresql://runtime:secret@{environment[ENV_ALLOWED_HOST]}:5432/postgres"
            )
        },
    )
    expect_config_failure(
        "fixture_workspace_prefix_invalid", {ENV_WORKSPACE_A: "shop-workspace-a"}
    )
    expect_config_failure(
        "fixture_workspaces_not_distinct",
        {ENV_WORKSPACE_B: environment[ENV_WORKSPACE_A]},
    )
    expect_config_failure(
        "runtime_and_recovery_url_identical",
        {ENV_RECOVERY_DATABASE_URL: environment[ENV_DATABASE_URL]},
    )

    # Case: the budgets are hard limits, not advisory counters.
    cases += 1
    budget = _Budget()
    for _ in range(MAX_STATEMENTS):
        budget.statement()
    try:
        budget.statement()
    except PersistenceProofError as exc:
        if exc.code != "statement_budget_exceeded":
            raise PersistenceProofError("self_test_budget_failed") from exc
    else:
        raise PersistenceProofError("self_test_budget_failed")
    for _ in range(MAX_SESSIONS):
        budget.open_session()
    try:
        budget.open_session()
    except PersistenceProofError as exc:
        if exc.code != "session_budget_exceeded":
            raise PersistenceProofError("self_test_budget_failed") from exc
    else:
        raise PersistenceProofError("self_test_budget_failed")

    # Case: the confirm flag must match the configured owner approval id and
    # is checked before any session factory exists.
    cases += 1
    import contextlib
    import io

    saved_environment = {key: os.environ.get(key) for key in environment}
    try:
        os.environ.update(environment)
        stderr_capture = io.StringIO()
        with contextlib.redirect_stderr(stderr_capture):
            exit_code = main(["--confirm-hosted-persistence-audit", "WRONG-APPROVAL-ID"])
        if exit_code != 1 or "owner_approval_confirmation_mismatch" not in stderr_capture.getvalue():
            raise PersistenceProofError("self_test_approval_confirmation_failed")
    finally:
        for key, value in saved_environment.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    # Case: preflight performs zero connections and zero statements.
    cases += 1
    preflight = configuration_preflight(config, captured_at=frozen_now)
    if (
        preflight["mode"] != "offline_configuration_preflight"
        or preflight["network_requests_performed"] != 0
        or preflight["database_connections_performed"] != 0
        or preflight["persistent_mutations_performed"] != 0
        or preflight["provider_credentials_verified"] is not False
    ):
        raise PersistenceProofError("self_test_preflight_failed")

    # Case: evidence, preflight, and failure reports never leak configured
    # values, connection strings, or raw error text.
    cases += 1
    failure_report = _failure_report(leak_error, sessions=1, statements=4)
    serialized = json.dumps(
        [report, pooler_report, preflight, failure_report], sort_keys=True
    )
    forbidden_values = [
        environment[ENV_DATABASE_URL],
        environment[ENV_RECOVERY_DATABASE_URL],
        pooler_environment[ENV_DATABASE_URL],
        pooler_environment[ENV_RECOVERY_DATABASE_URL],
        "persistence_proof_runtime.fixturebranch0000001",
        "fixture-secret-a",
        "fixture-secret-b",
        "hunter2",
        "password=",
        "postgresql://",
        config.workspace_a,
        config.workspace_b,
        config.restore_workspace,
        config.actor_a,
        config.actor_b,
        config.owner_approval_id,
    ]
    if any(value in serialized for value in forbidden_values):
        raise PersistenceProofError("self_test_redaction_failed")

    return {
        "ok": True,
        "contract": CONTRACT,
        "mode": "offline_adversarial_self_test",
        "cases": cases,
        "network_requests_performed": 0,
        "database_connections_performed": 0,
        "persistent_mutations_performed": 0,
        "secrets_exposed": False,
    }


def _failure_report(
    error: PersistenceProofError, *, sessions: int, statements: int
) -> dict[str, Any]:
    return {
        "ok": False,
        "contract": CONTRACT,
        "error": error.code,
        "sessions_performed": sessions,
        "statements_performed": statements,
        "secrets_exposed": False,
        "tenant_rows_exposed": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Prove durable commands, recovery, and tenant isolation on an "
            "owner-approved isolated Supabase branch."
        )
    )
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--confirm-hosted-persistence-audit", metavar="OWNER_APPROVAL_ID")
    args = parser.parse_args(argv)
    audit: ManagedPersistenceAudit | None = None
    try:
        selected_modes = sum(
            (
                bool(args.self_test),
                bool(args.preflight),
                bool(args.confirm_hosted_persistence_audit),
            )
        )
        if selected_modes > 1:
            raise PersistenceProofError("audit_mode_conflict")
        if args.self_test:
            result = run_self_test()
        elif args.preflight:
            result = configuration_preflight(load_config())
        else:
            if not args.confirm_hosted_persistence_audit:
                raise PersistenceProofError("owner_approval_confirmation_required")
            config = load_config()
            if args.confirm_hosted_persistence_audit != config.owner_approval_id:
                raise PersistenceProofError("owner_approval_confirmation_mismatch")
            audit = ManagedPersistenceAudit(config, NetworkSessionFactory(config))
            result = audit.run()
        print(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True))
        return 0
    except PersistenceProofError as exc:
        print(
            json.dumps(
                _failure_report(
                    exc,
                    sessions=0 if audit is None else audit.budget.sessions,
                    statements=0 if audit is None else audit.budget.statements,
                ),
                ensure_ascii=True,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
