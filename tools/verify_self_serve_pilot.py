#!/usr/bin/env python3
"""Prove self-serve tenant creation on an owner-approved isolated branch.

Instrument for the self_serve_pilot gate (spec: hq/strategy/
SELF-SERVE-ONBOARDING-SPEC.md step D and section 3). House style copied from
tools/verify_managed_persistence.py EXACTLY: session env only, two connection
lanes, port 6543 hard-rejected, production ref hard-rejected, fixed session /
statement budget, digests and status-classes only, fail-closed, and the
--self-test / --preflight / --confirm-self-serve-pilot-audit flag trio.

The subject under test is the REAL store method
supermega_runtime.trial_store.PostgresTrialStore.create_self_serve_workspace.
This harness imports and calls it against the branch connection (it never
reimplements it) with the activation-window preconditions satisfied in-process
FOR THE BRANCH ONLY: the fail-closed service gate self_serve_activation_window_open
is imported from supermega_runtime.trial_runtime and composed around the store
call exactly as the router composes it. Production stays untouched; no
production write is ever enabled by this tool.

Six fixed proofs, exact order, against app_private on a disposable Supabase
preview branch (never production):
  1. window_closed_refused             flag absent -> the create path refuses
                                       before the store is ever called
  2. claim_creates_isolated_tenant     SM-XXXX-XXXX Crockford claim + verified
                                       email actor -> one access-control row,
                                       one owner membership with 15 capabilities,
                                       one immutable company.workspace.created
                                       event carrying claim linkage; durable
                                       read-back on a fresh connection
  3. exact_idempotent_replay           same claim + same owner replays the same
                                       workspace and creates zero new rows
  4. different_user_same_claim_rejected a second actor on the same claim raises
                                       claim_code_conflict
  5. created_event_immutable           update / delete on the created event row
                                       raise SQLSTATE 55000
  6. cross_tenant_invisible            a second owner cannot see the first
                                       tenant's rows under GUC identity (canary:
                                       the first tenant's rows provably exist)

Fixed script: exactly MAX_SESSIONS verification connections, MAX_STATEMENTS
verification statements, and MAX_STORE_CALLS invocations of the real store
method (transaction control excluded). The run fails closed unless every final
count equals its budget exactly.

Session-pooler lane (2026-08-16 tech-lead decision, identical to the
persistence verifier): the direct host db.<ref>.supabase.co, or the
SESSION-mode pooler host on port 5432 whose username carries the project-ref
suffix bound to the same ref as ALLOWED_HOST. Port 6543 (transaction-mode
pooling) is hard-rejected with its own code in both lanes; session 1 opens with
a two-statement posture probe proving cross-transaction backend stability and
session-GUC round-trip, failing closed as pooler_transaction_mode_detected on
any deviation. The production ref stays hard-rejected in both lanes.

Reuse note: this tool imports WORKSPACE-independent helpers from the recovery
tool (RecoveryError, _assert_no_secret_fields) and the URL validator
(validate_database_url, AuditConfigurationError), and the real self-serve
contract constants and exceptions from supermega_runtime.trial_store, so the
offline self-test double stays faithful to the production semantics.
"""

from __future__ import annotations

import argparse
import contextlib
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
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from manage_workspace_recovery import (  # noqa: E402
    RecoveryError,
    _assert_no_secret_fields,
)
from validate_supermega_database_url import (  # noqa: E402
    AuditConfigurationError,
    validate_database_url,
)

from supermega_runtime.trial_runtime import (  # noqa: E402
    SELF_SERVE_ACTIVATION_WINDOW_ENV,
    self_serve_activation_window_open,
)
from supermega_runtime.trial_store import (  # noqa: E402
    SELF_SERVE_OWNER_CAPABILITIES,
    SELF_SERVE_RATE_LIMIT_MAX,
    SELF_SERVE_WORKSPACE_EVENT_TYPE,
    SelfServeWorkspaceResult,
    TrialClaimConflict,
    TrialIdempotencyConflict,
    TrialInvalidTransition,
    TrialNotReadyError,
    TrialPrincipal,
    TrialRateLimited,
    TrialValidationError,
    _principal_auth_ready,
    _self_serve_command_identity,
    self_serve_workspace_id,
    validate_self_serve_business_name,
    validate_self_serve_claim_code,
)


CONTRACT = "supermega.self-serve-pilot.v1"
ADAPTER = "postgres_self_serve_workspace_v1"
SCHEMA_COMPONENT = "private_trial_backend"
# Harness and store agree on the expected live schema through one env var
# (default 10). Set SUPERMEGA_TRIAL_SCHEMA_VERSION=11 for a v11 branch so both
# the posture probe here and the store's _assert_schema accept it.
EXPECTED_SCHEMA_VERSION = int(os.environ.get("SUPERMEGA_TRIAL_SCHEMA_VERSION", "10"))
MAX_SESSIONS = 3
MAX_STATEMENTS = 23
MAX_STORE_CALLS = 4
MAX_RESULT_ROWS = 8
MAX_ROW_BYTES = 32_768
MAX_ROW_KEYS = 32
EXPECTED_OWNER_CAPABILITY_COUNT = len(SELF_SERVE_OWNER_CAPABILITIES)
PRODUCTION_PROJECT_REF = "zvtzwcimpvvtkowflhda"
IMMUTABILITY_SQLSTATE = "55000"
IMMUTABILITY_SQLSTATES = frozenset({IMMUTABILITY_SQLSTATE})
SAFE_SSL_MODES = frozenset({"require", "verify-ca", "verify-full"})
ALLOWED_URL_QUERY_KEYS = frozenset({"sslmode", "sslrootcert"})

PROOF_IDS = (
    "window_closed_refused",
    "claim_creates_isolated_tenant",
    "exact_idempotent_replay",
    "different_user_same_claim_rejected",
    "created_event_immutable",
    "cross_tenant_invisible",
)

# Env: the store's own target-ready gate reads these (branch ref + release
# commit). This harness sets them in-process, scoped to the creation proofs,
# pointed at the isolated branch only; production is a different, rejected ref.
STORE_PROJECT_REF_ENV = "SUPERMEGA_SUPABASE_PROJECT_REF"
STORE_RELEASE_COMMIT_ENV = "SUPERMEGA_RELEASE_COMMIT"

ENV_ADAPTER = "SUPERMEGA_SELF_SERVE_PILOT_ADAPTER"
ENV_ALLOWED_HOST = "SUPERMEGA_SELF_SERVE_PILOT_ALLOWED_HOST"
ENV_OWNER_APPROVAL_ID = "SUPERMEGA_SELF_SERVE_PILOT_OWNER_APPROVAL_ID"
ENV_CLAIM_A = "SUPERMEGA_SELF_SERVE_PILOT_CLAIM_A"
ENV_CLAIM_B = "SUPERMEGA_SELF_SERVE_PILOT_CLAIM_B"
ENV_ACTOR_A = "SUPERMEGA_SELF_SERVE_PILOT_ACTOR_A"
ENV_ACTOR_B = "SUPERMEGA_SELF_SERVE_PILOT_ACTOR_B"
ENV_SESSION_A = "SUPERMEGA_SELF_SERVE_PILOT_SESSION_A"
ENV_SESSION_B = "SUPERMEGA_SELF_SERVE_PILOT_SESSION_B"
ENV_BUSINESS_NAME = "SUPERMEGA_SELF_SERVE_PILOT_BUSINESS_NAME"
ENV_RELEASE_COMMIT = "SUPERMEGA_SELF_SERVE_PILOT_RELEASE_COMMIT"
ENV_DATABASE_URL = "SUPERMEGA_SELF_SERVE_PILOT_DATABASE_URL"
ENV_POOLER_HOST = "SUPERMEGA_SELF_SERVE_PILOT_POOLER_HOST"

_DB_HOST_PATTERN = re.compile(r"db\.([a-z0-9]{20})\.supabase\.co\Z")
_POOLER_HOST_PATTERN = re.compile(r"aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com\Z")
_APPROVAL_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._:-]{6,126}[A-Za-z0-9])?\Z")
_RELEASE_COMMIT_PATTERN = re.compile(r"[0-9a-f]{40}\Z")
_SAFE_ERROR_PATTERN = re.compile(r"[a-z][a-z0-9_]{2,80}\Z")
_SQLSTATE_PATTERN = re.compile(r"[0-9A-Z]{5}\Z")
_FINGERPRINT_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class PilotProofError(RuntimeError):
    def __init__(self, code: str) -> None:
        if not _SAFE_ERROR_PATTERN.fullmatch(code):
            code = "self_serve_pilot_failed"
        self.code = code
        super().__init__(code)


class _StatementRejected(Exception):
    """A statement the server rejected; carries only the 5-char SQLSTATE."""

    def __init__(self, sqlstate: str) -> None:
        self.sqlstate = sqlstate if _SQLSTATE_PATTERN.fullmatch(str(sqlstate or "")) else "00000"
        super().__init__(self.sqlstate)


def _canonical_json(value: Any) -> str:
    # psycopg returns uuid/timestamptz columns as Python UUID/datetime objects, which
    # json.dumps cannot serialize natively; default=str renders them to their canonical
    # string form deterministically (fine for the byte-length, redaction, and digest uses).
    return json.dumps(
        value, ensure_ascii=True, separators=(",", ":"), sort_keys=True, default=str
    )


def _digest_text(value: str) -> str:
    return f"sha256:{hashlib.sha256(value.encode('utf-8')).hexdigest()}"


def _require_environment(environment: dict[str, str], key: str) -> str:
    value = str(environment.get(key, "")).strip()
    if not value:
        raise PilotProofError("pilot_environment_incomplete")
    return value


def _validate_claim(value: str) -> str:
    try:
        return validate_self_serve_claim_code(value)
    except TrialValidationError as exc:
        raise PilotProofError("fixture_claim_invalid") from exc


def _validate_uuid(value: str, code: str) -> str:
    candidate = value.strip()
    try:
        parsed = uuid.UUID(candidate)
    except (ValueError, AttributeError, TypeError) as exc:
        raise PilotProofError(code) from exc
    if str(parsed) != candidate.lower():
        raise PilotProofError(code)
    return str(parsed)


def _validate_database_url(
    raw_url: str,
    *,
    allowed_host: str,
    pooler_host: str | None,
    project_ref: str,
) -> tuple[str, str]:
    """Validate one connection URL and return (url, lane).

    Two lanes only (identical rule to verify_managed_persistence.py): the
    direct host db.<ref>.supabase.co, or the SESSION-mode pooler host on port
    5432 with the project-ref-suffixed username bound to the same ref as
    ALLOWED_HOST. Port 6543 is hard-rejected in both lanes; nothing else is
    accepted.
    """
    url = raw_url.strip()
    try:
        validate_database_url(url)
    except AuditConfigurationError as exc:
        code = str(exc.args[0]) if exc.args else "database_url_invalid"
        if not _SAFE_ERROR_PATTERN.fullmatch(code):
            code = "database_url_invalid"
        raise PilotProofError(code) from exc
    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise PilotProofError("database_url_invalid") from exc
    host = str(parsed.hostname or "").lower().rstrip(".")
    if port == 6543:
        raise PilotProofError("transaction_pooler_port_forbidden")
    if host == allowed_host:
        lane = "direct"
        if port not in {None, 5432}:
            raise PilotProofError("direct_port_required")
    elif pooler_host is not None and host == pooler_host:
        lane = "session_pooler"
        if port not in {None, 5432}:
            raise PilotProofError("pooler_session_port_required")
        username = str(parsed.username or "")
        if "." not in username:
            raise PilotProofError("pooler_username_ref_missing")
        base_role, _, username_ref = username.rpartition(".")
        if not base_role:
            raise PilotProofError("pooler_username_ref_missing")
        if username_ref != project_ref:
            raise PilotProofError("pooler_username_ref_mismatch")
    else:
        raise PilotProofError("database_url_host_mismatch")
    if parsed.path != "/postgres":
        raise PilotProofError("database_name_invalid")
    query = parse_qs(parsed.query, keep_blank_values=True)
    if set(query) - ALLOWED_URL_QUERY_KEYS:
        raise PilotProofError("database_url_query_invalid")
    ssl_modes = [value.lower() for value in query.get("sslmode", [])]
    if len(ssl_modes) != 1 or ssl_modes[0] not in SAFE_SSL_MODES:
        raise PilotProofError("database_url_tls_required")
    return url, lane


@dataclass(frozen=True)
class AuditConfig:
    host: str
    project_ref: str
    pooler_host: str | None
    connection_lane: str
    owner_approval_id: str
    claim_a: str
    claim_b: str
    actor_a: str
    actor_b: str
    session_a: str
    session_b: str
    business_name: str
    release_commit: str
    database_url: str


def load_config(environment: dict[str, str] | None = None) -> AuditConfig:
    values = dict(os.environ if environment is None else environment)
    if _require_environment(values, ENV_ADAPTER) != ADAPTER:
        raise PilotProofError("pilot_adapter_invalid")

    allowed_host = _require_environment(values, ENV_ALLOWED_HOST).lower().rstrip(".")
    host_match = _DB_HOST_PATTERN.fullmatch(allowed_host)
    if not host_match:
        raise PilotProofError("allowed_host_invalid")
    project_ref = host_match.group(1)
    if project_ref == PRODUCTION_PROJECT_REF:
        raise PilotProofError("production_target_forbidden")

    owner_approval_id = _require_environment(values, ENV_OWNER_APPROVAL_ID)
    if not _APPROVAL_PATTERN.fullmatch(owner_approval_id):
        raise PilotProofError("owner_approval_id_invalid")

    claim_a = _validate_claim(_require_environment(values, ENV_CLAIM_A))
    claim_b = _validate_claim(_require_environment(values, ENV_CLAIM_B))
    if claim_a == claim_b:
        raise PilotProofError("fixture_claims_not_distinct")

    actor_a = _validate_uuid(_require_environment(values, ENV_ACTOR_A), "fixture_actor_invalid")
    actor_b = _validate_uuid(_require_environment(values, ENV_ACTOR_B), "fixture_actor_invalid")
    if actor_a == actor_b:
        raise PilotProofError("fixture_actors_not_distinct")
    session_a = _validate_uuid(_require_environment(values, ENV_SESSION_A), "fixture_session_invalid")
    session_b = _validate_uuid(_require_environment(values, ENV_SESSION_B), "fixture_session_invalid")
    if session_a == session_b:
        raise PilotProofError("fixture_sessions_not_distinct")

    try:
        business_name = validate_self_serve_business_name(
            _require_environment(values, ENV_BUSINESS_NAME)
        )
    except TrialValidationError as exc:
        raise PilotProofError("fixture_business_name_invalid") from exc

    release_commit = _require_environment(values, ENV_RELEASE_COMMIT).strip().lower()
    if not _RELEASE_COMMIT_PATTERN.fullmatch(release_commit):
        raise PilotProofError("release_commit_invalid")

    pooler_host: str | None = str(values.get(ENV_POOLER_HOST, "")).strip().lower().rstrip(".") or None
    if pooler_host is not None and not _POOLER_HOST_PATTERN.fullmatch(pooler_host):
        raise PilotProofError("pooler_host_invalid")

    database_url, connection_lane = _validate_database_url(
        _require_environment(values, ENV_DATABASE_URL),
        allowed_host=allowed_host,
        pooler_host=pooler_host,
        project_ref=project_ref,
    )

    return AuditConfig(
        host=allowed_host,
        project_ref=project_ref,
        pooler_host=pooler_host,
        connection_lane=connection_lane,
        owner_approval_id=owner_approval_id,
        claim_a=claim_a,
        claim_b=claim_b,
        actor_a=actor_a,
        actor_b=actor_b,
        session_a=session_a,
        session_b=session_b,
        business_name=business_name,
        release_commit=release_commit,
        database_url=database_url,
    )


# The complete fixed verification-statement script. Live SQL per tag is a
# pinned constant; the run must consume the tags in exactly this order and
# exactly this count. Tenant WRITES never appear here -- every write goes
# through the real store method; these statements only read back and probe.
_SQL: dict[str, str] = {
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
    "select_access_control": (
        "select status from app_private.workspace_access_controls where workspace_id = %s"
    ),
    "select_membership": (
        "select actor_kind, status, capabilities "
        "from app_private.workspace_memberships where workspace_id = %s and actor_id = %s"
    ),
    "select_created_event": (
        "select event_id, event_type, actor_id, actor_kind, command_fingerprint, "
        "payload_json, result_json from app_private.workspace_events where workspace_id = %s"
    ),
    "count_events": (
        "select count(*) from app_private.workspace_events where workspace_id = %s"
    ),
    "count_memberships": (
        "select count(*) from app_private.workspace_memberships where workspace_id = %s"
    ),
    "count_access_controls": (
        "select count(*) from app_private.workspace_access_controls where workspace_id = %s"
    ),
    "event_update": (
        "update app_private.workspace_events set result_json = %s::jsonb "
        "where event_id = %s::uuid"
    ),
    "event_delete": "delete from app_private.workspace_events where event_id = %s::uuid",
    "cross_access": (
        "select count(*) from app_private.workspace_access_controls where workspace_id = %s"
    ),
    "cross_memberships": (
        "select count(*) from app_private.workspace_memberships where workspace_id = %s"
    ),
    "cross_events": (
        "select count(*) from app_private.workspace_events where workspace_id = %s"
    ),
}

EXPECTED_TAG_SEQUENCE = (
    # Session 1: fresh runtime connection, durable read-back of the created tenant.
    "session_mode_seed", "session_mode_verify",
    "role_posture", "schema_version",
    "set_identity", "select_access_control", "select_membership", "select_created_event",
    "count_events", "count_memberships", "count_access_controls",
    # Session 2: post-replay counts unchanged, then event immutability.
    "set_identity", "count_events", "count_memberships", "count_access_controls",
    "set_identity", "event_update",
    "set_identity", "event_delete",
    # Session 3: the second owner cannot see the first tenant's rows.
    "set_identity", "cross_access", "cross_memberships", "cross_events",
)
assert len(EXPECTED_TAG_SEQUENCE) == MAX_STATEMENTS


class AuditSessionTransport(Protocol):
    def execute(self, tag: str, sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]]: ...
    def commit(self) -> None: ...
    def rollback(self) -> None: ...
    def close(self) -> None: ...


class SessionFactory(Protocol):
    def open(self, kind: str) -> AuditSessionTransport: ...


class PilotStore(Protocol):
    def create_self_serve_workspace(
        self,
        *,
        actor_id: str,
        claim_code: str,
        business_name: str,
        session_id: str = "",
        identity_provider: str = "supabase",
    ) -> SelfServeWorkspaceResult: ...


class StoreFactory(Protocol):
    def get(self) -> PilotStore: ...


class _Budget:
    def __init__(self) -> None:
        self.sessions = 0
        self.statements = 0
        self.store_calls = 0

    def open_session(self) -> None:
        if self.sessions >= MAX_SESSIONS:
            raise PilotProofError("session_budget_exceeded")
        self.sessions += 1

    def statement(self) -> None:
        if self.statements >= MAX_STATEMENTS:
            raise PilotProofError("statement_budget_exceeded")
        self.statements += 1

    def store_call(self) -> None:
        if self.store_calls >= MAX_STORE_CALLS:
            raise PilotProofError("store_call_budget_exceeded")
        self.store_calls += 1


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
            raise PilotProofError("database_operation_failed") from None

    def commit(self) -> None:
        try:
            self._connection.commit()
        except Exception:  # noqa: BLE001 - never leak driver detail
            raise PilotProofError("database_commit_failed") from None

    def rollback(self) -> None:
        try:
            self._connection.rollback()
        except Exception:  # noqa: BLE001
            raise PilotProofError("database_rollback_failed") from None

    def close(self) -> None:
        try:
            self._connection.close()
        except Exception:  # noqa: BLE001
            pass


class NetworkSessionFactory:
    def __init__(self, config: AuditConfig) -> None:
        self._config = config

    def open(self, kind: str) -> AuditSessionTransport:
        del kind
        try:
            import psycopg
            import psycopg.errors
        except ImportError as exc:
            raise PilotProofError("database_driver_unavailable") from exc
        try:
            connection = psycopg.connect(
                self._config.database_url,
                autocommit=False,
                connect_timeout=5,
                prepare_threshold=None,
                application_name="supermega-self-serve-pilot-proof",
                options=(
                    "-c statement_timeout=8000 "
                    "-c lock_timeout=2000 "
                    "-c idle_in_transaction_session_timeout=15000"
                ),
            )
        except Exception:  # noqa: BLE001 - connection errors may embed the URL
            raise PilotProofError("database_connection_failed") from None
        return _PostgresSession(connection, psycopg.errors)


class NetworkStoreFactory:
    """Builds the REAL PostgresTrialStore bound to the branch runtime URL.

    The store method is the subject under test; the harness never touches its
    internals. ``write_enabled=True`` is local to this branch-only process and
    enables no production write (production is a different, rejected ref). The
    reducer is never invoked by create_self_serve_workspace and is wired to
    fail closed if it ever were.
    """

    def __init__(self, config: AuditConfig) -> None:
        self._config = config
        self._store: PilotStore | None = None

    @staticmethod
    def _unused_reducer(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        raise PilotProofError("reducer_unexpectedly_invoked")

    def get(self) -> PilotStore:
        if self._store is None:
            from supermega_runtime.trial_store import PostgresTrialStore

            self._store = PostgresTrialStore(
                self._config.database_url,
                reducer=self._unused_reducer,
                write_enabled=True,
            )
        return self._store


class _AuditSession:
    def __init__(self, transport: AuditSessionTransport, budget: _Budget) -> None:
        self._transport = transport
        self._budget = budget

    def execute(self, tag: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        self._budget.statement()
        try:
            rows = self._transport.execute(tag, _SQL[tag], params)
        except (_StatementRejected, PilotProofError):
            raise
        except Exception:  # noqa: BLE001 - unknown driver/fixture failure
            raise PilotProofError("database_operation_failed") from None
        if not isinstance(rows, list) or len(rows) > MAX_RESULT_ROWS:
            raise PilotProofError("result_rows_exceeded")
        return rows

    def run(self, tag: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
        """Execute a statement where a server rejection is NOT expected."""
        try:
            return self.execute(tag, params)
        except _StatementRejected:
            raise PilotProofError("database_operation_rejected") from None

    def commit(self) -> None:
        self._transport.commit()

    def rollback(self) -> None:
        self._transport.rollback()

    def close(self) -> None:
        self._transport.close()


def _expect_rejection(
    operation: Callable[[], Any], failure_code: str, allowed: frozenset[str]
) -> str:
    try:
        operation()
    except _StatementRejected as exc:
        if exc.sqlstate in allowed:
            return exc.sqlstate
        raise PilotProofError(failure_code) from None
    raise PilotProofError(failure_code)


def _validate_event_row(row: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(row, dict) or not row or len(row) > MAX_ROW_KEYS:
        raise PilotProofError("event_row_shape_invalid")
    if len(_canonical_json(row).encode("utf-8")) > MAX_ROW_BYTES:
        raise PilotProofError("event_row_too_large")
    try:
        _assert_no_secret_fields(row)
    except RecoveryError:
        raise PilotProofError("event_secret_field_detected") from None
    return row


class SelfServePilotAudit:
    def __init__(
        self,
        config: AuditConfig,
        store_factory: StoreFactory,
        session_factory: SessionFactory,
        *,
        window_open: Callable[[], bool] | None = None,
    ) -> None:
        self.config = config
        self.store_factory = store_factory
        self.session_factory = session_factory
        self.window_open = window_open or self_serve_activation_window_open
        self.budget = _Budget()

    # -- environment plumbing ------------------------------------------
    @contextlib.contextmanager
    def _activation_env(self, *, window: bool):
        keys = {
            SELF_SERVE_ACTIVATION_WINDOW_ENV: "open" if window else None,
            STORE_PROJECT_REF_ENV: self.config.project_ref,
            STORE_RELEASE_COMMIT_ENV: self.config.release_commit,
        }
        saved = {key: os.environ.get(key) for key in keys}
        try:
            for key, value in keys.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            yield
        finally:
            for key, value in saved.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    # -- session plumbing ----------------------------------------------
    def _open(self, kind: str) -> _AuditSession:
        self.budget.open_session()
        try:
            transport = self.session_factory.open(kind)
        except PilotProofError:
            raise
        except Exception:  # noqa: BLE001
            raise PilotProofError("database_connection_failed") from None
        return _AuditSession(transport, self.budget)

    def _identity(self, session: _AuditSession, workspace: str, actor: str) -> None:
        session.run("set_identity", (workspace, actor, "human"))

    def _posture_probe(self, session: _AuditSession) -> None:
        probe_nonce = uuid.uuid4().hex
        seeded = session.run("session_mode_seed", (probe_nonce,))
        if len(seeded) != 1 or seeded[0][1] != probe_nonce:
            raise PilotProofError("pooler_transaction_mode_detected")
        session.commit()
        verified = session.run("session_mode_verify")
        if verified != [(seeded[0][0], probe_nonce)]:
            raise PilotProofError("pooler_transaction_mode_detected")
        posture = session.run("role_posture")
        if posture != [(False, False)]:
            raise PilotProofError("runtime_role_posture_invalid")
        schema = session.run("schema_version", (SCHEMA_COMPONENT,))
        if schema != [(EXPECTED_SCHEMA_VERSION,)]:
            raise PilotProofError("schema_version_mismatch")
        session.commit()

    # -- store plumbing -------------------------------------------------
    def _store_create(
        self, store: PilotStore, *, actor: str, session_id: str, claim: str
    ) -> SelfServeWorkspaceResult:
        self.budget.store_call()
        try:
            result = store.create_self_serve_workspace(
                actor_id=actor,
                claim_code=claim,
                business_name=self.config.business_name,
                session_id=session_id,
                identity_provider="supabase",
            )
        except (
            TrialClaimConflict,
            TrialRateLimited,
            TrialIdempotencyConflict,
            TrialInvalidTransition,
            TrialNotReadyError,
            TrialValidationError,
        ):
            raise
        except PilotProofError:
            raise
        except Exception:  # noqa: BLE001 - never leak store/driver detail
            raise PilotProofError("store_operation_failed") from None
        if not isinstance(result, SelfServeWorkspaceResult):
            raise PilotProofError("store_result_shape_invalid")
        return result

    def _create_path(
        self, store: PilotStore, *, actor: str, session_id: str, claim: str, email_verified: bool = True
    ) -> SelfServeWorkspaceResult:
        # Compose the fail-closed service gate exactly as the router does:
        # window gate first, then verified email, then the real store call.
        if not self.window_open():
            raise PilotProofError("activation_window_closed")
        if not email_verified:
            raise PilotProofError("email_verification_required")
        return self._store_create(store, actor=actor, session_id=session_id, claim=claim)

    # -- run ------------------------------------------------------------
    def run(self, *, captured_at: datetime | None = None) -> dict[str, Any]:
        now = (captured_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
        config = self.config
        store = self.store_factory.get()
        results: dict[str, dict[str, Any]] = {}

        workspace_a = self_serve_workspace_id(config.claim_a)
        workspace_b = self_serve_workspace_id(config.claim_b)

        # ---- Proof 1: window closed refuses before the store is touched ----
        with self._activation_env(window=False):
            try:
                self._create_path(
                    store, actor=config.actor_a, session_id=config.session_a, claim=config.claim_a
                )
            except PilotProofError as exc:
                if exc.code != "activation_window_closed":
                    raise PilotProofError("window_refusal_wrong_class") from None
            else:
                raise PilotProofError("window_refusal_not_enforced")
        if self.budget.store_calls != 0:
            raise PilotProofError("window_refusal_touched_store")
        results["window_closed_refused"] = {
            "id": "window_closed_refused",
            "result": "refused_before_store",
            "refusal_class": "activation_window_closed",
        }

        with self._activation_env(window=True):
            # ---- Proof 2: the claim creates one isolated owner tenant -------
            created = self._create_path(
                store, actor=config.actor_a, session_id=config.session_a, claim=config.claim_a
            )
            if (
                created.workspace_id != workspace_a
                or created.access != "owner"
                or created.owner_actor_id != config.actor_a
                or created.claim_code != config.claim_a
                or created.idempotent_replay is not False
            ):
                raise PilotProofError("tenant_creation_result_invalid")
            event_id_a = created.event_id

            session = self._open("verify_create")
            try:
                self._posture_probe(session)
                self._identity(session, workspace_a, config.actor_a)
                access = session.run("select_access_control", (workspace_a,))
                if access != [("active",)]:
                    raise PilotProofError("access_control_not_active")
                membership = session.run(
                    "select_membership", (workspace_a, config.actor_a)
                )
                if len(membership) != 1:
                    raise PilotProofError("owner_membership_missing")
                actor_kind, status, capabilities = membership[0]
                if actor_kind != "human" or status != "active":
                    raise PilotProofError("owner_membership_invalid")
                if frozenset(str(item) for item in capabilities) != SELF_SERVE_OWNER_CAPABILITIES:
                    raise PilotProofError("owner_capabilities_incomplete")
                event_rows = session.run("select_created_event", (workspace_a,))
                if len(event_rows) != 1:
                    raise PilotProofError("created_event_missing")
                (
                    event_id, event_type, event_actor, event_actor_kind,
                    fingerprint, payload_json, _result_json,
                ) = event_rows[0]
                _validate_event_row(
                    {
                        "event_id": event_id,
                        "event_type": event_type,
                        "actor_id": event_actor,
                        "actor_kind": event_actor_kind,
                        "command_fingerprint": fingerprint,
                        "payload_json": payload_json,
                    }
                )
                if (
                    str(event_id) != event_id_a
                    or event_type != SELF_SERVE_WORKSPACE_EVENT_TYPE
                    or event_actor != config.actor_a
                    or event_actor_kind != "human"
                    or not _FINGERPRINT_PATTERN.fullmatch(str(fingerprint or ""))
                ):
                    raise PilotProofError("created_event_invalid")
                linkage = payload_json.get("claimLinkage") if isinstance(payload_json, dict) else None
                if (
                    not isinstance(linkage, dict)
                    or linkage.get("claimCode") != config.claim_a
                    or linkage.get("workspaceId") != workspace_a
                ):
                    raise PilotProofError("claim_linkage_missing")
                base_events = session.run("count_events", (workspace_a,))
                base_memberships = session.run("count_memberships", (workspace_a,))
                base_access = session.run("count_access_controls", (workspace_a,))
                if base_events != [(1,)] or base_memberships != [(1,)] or base_access != [(1,)]:
                    raise PilotProofError("tenant_row_counts_unexpected")
                session.commit()
            finally:
                session.close()
            results["claim_creates_isolated_tenant"] = {
                "id": "claim_creates_isolated_tenant",
                "result": "tenant_created",
                "owner_capability_count": EXPECTED_OWNER_CAPABILITY_COUNT,
                "access_control_rows": 1,
                "owner_membership_rows": 1,
                "created_event_rows": 1,
                "claim_linkage_bound": True,
            }

            # ---- Proof 3: the same claim + owner replays with zero new rows -
            replay = self._create_path(
                store, actor=config.actor_a, session_id=config.session_a, claim=config.claim_a
            )
            if (
                replay.workspace_id != workspace_a
                or replay.event_id != event_id_a
                or replay.idempotent_replay is not True
            ):
                raise PilotProofError("replay_diverged")

            session = self._open("verify_replay")
            try:
                self._identity(session, workspace_a, config.actor_a)
                after_events = session.run("count_events", (workspace_a,))
                after_memberships = session.run("count_memberships", (workspace_a,))
                after_access = session.run("count_access_controls", (workspace_a,))
                if after_events != [(1,)] or after_memberships != [(1,)] or after_access != [(1,)]:
                    raise PilotProofError("replay_created_rows")
                session.commit()

                # ---- Proof 5: the created event row is immutable ------------
                self._identity(session, workspace_a, config.actor_a)
                update_sqlstate = _expect_rejection(
                    lambda: session.execute(
                        "event_update", (_canonical_json({"tampered": True}), event_id_a)
                    ),
                    "created_event_mutation_accepted",
                    IMMUTABILITY_SQLSTATES,
                )
                session.rollback()
                self._identity(session, workspace_a, config.actor_a)
                delete_sqlstate = _expect_rejection(
                    lambda: session.execute("event_delete", (event_id_a,)),
                    "created_event_deletion_accepted",
                    IMMUTABILITY_SQLSTATES,
                )
                session.rollback()
            finally:
                session.close()
            results["exact_idempotent_replay"] = {
                "id": "exact_idempotent_replay",
                "result": "no_op_replay",
                "new_rows_created": 0,
            }
            results["created_event_immutable"] = {
                "id": "created_event_immutable",
                "result": "update_and_delete_rejected",
                "update_sqlstate": update_sqlstate,
                "delete_sqlstate": delete_sqlstate,
            }

            # ---- Proof 4: a different user on the same claim is rejected -----
            try:
                self._create_path(
                    store, actor=config.actor_b, session_id=config.session_b, claim=config.claim_a
                )
            except TrialClaimConflict:
                pass
            except PilotProofError:
                raise
            except (
                TrialRateLimited,
                TrialIdempotencyConflict,
                TrialInvalidTransition,
                TrialNotReadyError,
                TrialValidationError,
            ):
                raise PilotProofError("claim_conflict_wrong_class") from None
            else:
                raise PilotProofError("claim_conflict_not_enforced")
            results["different_user_same_claim_rejected"] = {
                "id": "different_user_same_claim_rejected",
                "result": "rejected",
                "conflict_class": "claim_code_conflict",
            }

            # ---- Proof 6 canary setup: the second owner creates their tenant.
            created_b = self._create_path(
                store, actor=config.actor_b, session_id=config.session_b, claim=config.claim_b
            )
            if created_b.workspace_id != workspace_b or created_b.owner_actor_id != config.actor_b:
                raise PilotProofError("canary_tenant_creation_invalid")

        # ---- Proof 6: the second owner cannot see the first tenant's rows ---
        session = self._open("verify_cross_tenant")
        try:
            self._identity(session, workspace_b, config.actor_b)
            cross_access = session.run("cross_access", (workspace_a,))
            if cross_access != [(0,)]:
                raise PilotProofError("cross_tenant_access_visible")
            cross_memberships = session.run("cross_memberships", (workspace_a,))
            if cross_memberships != [(0,)]:
                raise PilotProofError("cross_tenant_membership_visible")
            cross_events = session.run("cross_events", (workspace_a,))
            if cross_events != [(0,)]:
                raise PilotProofError("cross_tenant_events_visible")
            session.rollback()
        finally:
            session.close()
        results["cross_tenant_invisible"] = {
            "id": "cross_tenant_invisible",
            "result": "denied_with_canary",
            "foreign_rows_visible": 0,
        }

        if self.budget.statements != MAX_STATEMENTS:
            raise PilotProofError("statement_budget_mismatch")
        if self.budget.sessions != MAX_SESSIONS:
            raise PilotProofError("session_budget_mismatch")
        if self.budget.store_calls != MAX_STORE_CALLS:
            raise PilotProofError("store_call_budget_mismatch")
        if set(results) != set(PROOF_IDS):
            raise PilotProofError("proof_set_incomplete")

        evidence = {
            "contract": CONTRACT,
            "adapter": ADAPTER,
            "connection_lane": config.connection_lane,
            "target_host_digest": _digest_text(config.host),
            "owner_approval_digest": _digest_text(config.owner_approval_id),
            "claim_a_digest": _digest_text(config.claim_a),
            "claim_b_digest": _digest_text(config.claim_b),
            "actor_a_digest": _digest_text(config.actor_a),
            "actor_b_digest": _digest_text(config.actor_b),
            "workspace_a_digest": _digest_text(workspace_a),
            "workspace_b_digest": _digest_text(workspace_b),
            "captured_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "schema_version_observed": EXPECTED_SCHEMA_VERSION,
            "owner_capabilities_expected": EXPECTED_OWNER_CAPABILITY_COUNT,
            "proofs": [results[proof_id] for proof_id in PROOF_IDS],
            "sessions_performed": self.budget.sessions,
            "statements_performed": self.budget.statements,
            "store_calls_performed": self.budget.store_calls,
            "writes_confined_to_fixtures": True,
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
        "claim_a_digest": _digest_text(config.claim_a),
        "claim_b_digest": _digest_text(config.claim_b),
        "actor_a_digest": _digest_text(config.actor_a),
        "actor_b_digest": _digest_text(config.actor_b),
        "captured_at": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "maximum_live_sessions": MAX_SESSIONS,
        "maximum_live_statements": MAX_STATEMENTS,
        "maximum_store_calls": MAX_STORE_CALLS,
        "network_requests_performed": 0,
        "database_connections_performed": 0,
        "store_calls_performed": 0,
        "persistent_mutations_performed": 0,
        "credential_shapes_validated_locally": True,
        "provider_credentials_verified": False,
        "secrets_exposed": False,
        "tenant_rows_exposed": False,
    }
    return {"ok": True, **evidence, "evidence_digest": _digest_text(_canonical_json(evidence))}


# --------------------------------------------------------------------------
# Offline adversarial self-test fixtures. A shared in-memory backend stands in
# for app_private; the fixture store reproduces the observable semantics of the
# real create_self_serve_workspace, and the fixture sessions reproduce the v10
# read-side RLS and immutability semantics. Each named defect models one way
# the hosted branch (or a regressed store) could misbehave, and the self-test
# requires the instrument to fail closed with the exact code for every one.
# --------------------------------------------------------------------------

_STAMP = "2030-01-01T00:00:00Z"


class _FixtureBackend:
    def __init__(self) -> None:
        self.access_controls: dict[str, dict[str, Any]] = {}
        self.memberships: dict[tuple[str, str], dict[str, Any]] = {}
        self.events: dict[str, dict[str, Any]] = {}


class _FixtureStore:
    """Self-test double for PostgresTrialStore.create_self_serve_workspace.

    It reuses the real claim/business validators, identity derivation, capability
    set, and exception classes so the offline path stays faithful to production.
    """

    def __init__(self, backend: _FixtureBackend, defects: frozenset[str]) -> None:
        self.backend = backend
        self.defects = defects
        self._attempts: dict[str, int] = {}

    def create_self_serve_workspace(
        self,
        *,
        actor_id: str,
        claim_code: str,
        business_name: str,
        session_id: str = "",
        identity_provider: str = "supabase",
    ) -> SelfServeWorkspaceResult:
        claim = validate_self_serve_claim_code(claim_code)
        label = validate_self_serve_business_name(business_name)
        workspace_id, command_id, fingerprint = _self_serve_command_identity(claim, label)
        principal = TrialPrincipal(
            workspace_id=workspace_id,
            actor_id=actor_id,
            actor_kind="human",
            authenticated=True,
            session_id=session_id,
            identity_provider=identity_provider,
        ).normalized()
        if not _principal_auth_ready(principal):
            raise TrialNotReadyError(("auth_ready",))
        self._attempts[actor_id] = self._attempts.get(actor_id, 0) + 1
        if self._attempts[actor_id] > SELF_SERVE_RATE_LIMIT_MAX:
            raise TrialRateLimited(limit=SELF_SERVE_RATE_LIMIT_MAX)

        members = [aid for (ws, aid) in self.backend.memberships if ws == workspace_id]
        if any(aid != actor_id for aid in members):
            if "claim_conflict_not_enforced" in self.defects:
                return SelfServeWorkspaceResult(
                    workspace_id=workspace_id,
                    label=label,
                    access="owner",
                    claim_code=claim,
                    owner_actor_id=actor_id,
                    event_id=command_id,
                    created_at=_STAMP,
                    idempotent_replay=False,
                )
            raise TrialClaimConflict(claim)

        event = self.backend.events.get(command_id)
        if event is not None:
            if event["actor_id"] != actor_id or event["command_fingerprint"] != fingerprint:
                raise TrialIdempotencyConflict(command_id)
            if "replay_creates_rows" in self.defects:
                extra_id = str(uuid.uuid5(uuid.UUID(workspace_id), "replay-duplicate"))
                self.backend.events[extra_id] = {**event, "event_id": extra_id}
            replay_workspace = workspace_id
            if "replay_workspace_diverges" in self.defects:
                replay_workspace = self_serve_workspace_id("SM-9999-9999")
            replay_flag = "replay_not_flagged" not in self.defects
            return SelfServeWorkspaceResult(
                workspace_id=replay_workspace,
                label=str(event["result_json"]["self_serve_workspace"]["label"]),
                access="owner",
                claim_code=claim,
                owner_actor_id=actor_id,
                event_id=command_id,
                created_at=_STAMP,
                idempotent_replay=replay_flag,
            )

        if members:
            raise TrialInvalidTransition("membership without event")
        capabilities = sorted(SELF_SERVE_OWNER_CAPABILITIES)
        self.backend.access_controls[workspace_id] = {
            "workspace_id": workspace_id,
            "status": "active",
            "owner_actor_id": actor_id,
        }
        self.backend.memberships[(workspace_id, actor_id)] = {
            "workspace_id": workspace_id,
            "actor_id": actor_id,
            "actor_kind": "human",
            "status": "active",
            "capabilities": list(capabilities),
        }
        result_payload = {
            "self_serve_workspace": {
                "workspace_id": workspace_id,
                "label": label,
                "access": "owner",
                "claim_code": claim,
                "owner_actor_id": actor_id,
                "event_id": command_id,
            }
        }
        self.backend.events[command_id] = {
            "event_id": command_id,
            "workspace_id": workspace_id,
            "command_id": command_id,
            "command_fingerprint": fingerprint,
            "surface": "company",
            "event_type": SELF_SERVE_WORKSPACE_EVENT_TYPE,
            "actor_id": actor_id,
            "actor_kind": "human",
            "payload_json": {
                "claimLinkage": {
                    "claimCode": claim,
                    "workspaceId": workspace_id,
                    "linkedBy": actor_id,
                },
                "businessName": label,
                "ownerCapabilities": list(capabilities),
            },
            "result_json": result_payload,
            "created_at": _STAMP,
        }
        return SelfServeWorkspaceResult(
            workspace_id=workspace_id,
            label=label,
            access="owner",
            claim_code=claim,
            owner_actor_id=actor_id,
            event_id=command_id,
            created_at=_STAMP,
            idempotent_replay=False,
        )


class _FixtureStoreFactory:
    def __init__(self, backend: _FixtureBackend, defects: frozenset[str]) -> None:
        self._store = _FixtureStore(backend, defects)

    def get(self) -> PilotStore:
        return self._store


class _FixtureSessionFactory:
    def __init__(self, backend: _FixtureBackend, defects: frozenset[str]) -> None:
        self.backend = backend
        self.defects = frozenset(defects)
        self.tags: list[str] = []
        self.opened = 0

    def open(self, kind: str) -> "_FixtureSession":
        self.opened += 1
        return _FixtureSession(self, kind)


class _FixtureSession:
    def __init__(self, factory: _FixtureSessionFactory, kind: str) -> None:
        self.factory = factory
        self.kind = kind
        self.identity: tuple[str, str, str] | None = None
        self.session_gucs: dict[str, str] = {}
        self._transaction_serial = 0

    def _backend_pid(self) -> int:
        if "pooler_transaction_mode" in self.factory.defects:
            return 4242 + self._transaction_serial
        return 4242

    def commit(self) -> None:
        self.identity = None
        if "pooler_transaction_mode" in self.factory.defects:
            self.session_gucs.clear()

    def rollback(self) -> None:
        self.identity = None
        if "pooler_transaction_mode" in self.factory.defects:
            self.session_gucs.clear()

    def close(self) -> None:
        return None

    def _member_visible(self, target_workspace: str) -> bool:
        if "cross_tenant_visible" in self.factory.defects:
            return True
        if self.identity is None:
            return False
        ident_workspace, ident_actor, ident_kind = self.identity
        if ident_workspace != target_workspace:
            return False
        row = self.factory.backend.memberships.get((ident_workspace, ident_actor))
        return bool(row and row["status"] == "active" and row["actor_kind"] == ident_kind)

    def execute(self, tag: str, sql: str, params: tuple[Any, ...]) -> list[tuple[Any, ...]]:
        del sql
        self.factory.tags.append(tag)
        defects = self.factory.defects
        backend = self.factory.backend

        if tag == "session_mode_seed":
            self._transaction_serial += 1
            (nonce,) = params
            self.session_gucs["app.pooler_probe"] = str(nonce)
            return [(self._backend_pid(), str(nonce))]
        if tag == "session_mode_verify":
            self._transaction_serial += 1
            return [(self._backend_pid(), self.session_gucs.get("app.pooler_probe"))]
        if tag == "role_posture":
            return [("role_superuser" in defects, "role_bypassrls" in defects)]
        if tag == "schema_version":
            return [(9 if "schema_drift" in defects else EXPECTED_SCHEMA_VERSION,)]
        if tag == "set_identity":
            self.identity = (str(params[0]), str(params[1]), str(params[2]))
            return [(None,)]
        if tag == "select_access_control":
            (workspace,) = params
            if not self._member_visible(str(workspace)):
                return []
            row = backend.access_controls.get(str(workspace))
            if row is None:
                return []
            status = "suspended" if "access_not_active" in defects else row["status"]
            return [(status,)]
        if tag == "select_membership":
            workspace, actor = params
            if not self._member_visible(str(workspace)):
                return []
            row = backend.memberships.get((str(workspace), str(actor)))
            if row is None:
                return []
            capabilities = list(row["capabilities"])
            if "membership_caps_short" in defects and capabilities:
                capabilities = capabilities[:-1]
            return [(row["actor_kind"], row["status"], capabilities)]
        if tag == "select_created_event":
            (workspace,) = params
            if "raw_error_leak" in defects:
                raise RuntimeError(
                    "connection failure "
                    + "postgresql"
                    + "://leak:password=fixture-pw@db.fixture.supabase.co/postgres"
                )
            if not self._member_visible(str(workspace)):
                return []
            rows = [
                row for row in backend.events.values() if row["workspace_id"] == str(workspace)
            ]
            out: list[tuple[Any, ...]] = []
            for row in rows:
                payload = deepcopy(row["payload_json"])
                if "event_missing_linkage" in defects:
                    payload = {key: value for key, value in payload.items() if key != "claimLinkage"}
                out.append(
                    (
                        row["event_id"],
                        row["event_type"],
                        row["actor_id"],
                        row["actor_kind"],
                        row["command_fingerprint"],
                        payload,
                        deepcopy(row["result_json"]),
                    )
                )
            return out
        if tag in {"count_events", "cross_events"}:
            (workspace,) = params
            if not self._member_visible(str(workspace)):
                return [(0,)]
            count = sum(
                1 for row in backend.events.values() if row["workspace_id"] == str(workspace)
            )
            return [(count,)]
        if tag in {"count_memberships", "cross_memberships"}:
            (workspace,) = params
            if not self._member_visible(str(workspace)):
                return [(0,)]
            count = sum(1 for (ws, _actor) in backend.memberships if ws == str(workspace))
            return [(count,)]
        if tag in {"count_access_controls", "cross_access"}:
            (workspace,) = params
            if not self._member_visible(str(workspace)):
                return [(0,)]
            count = 1 if str(workspace) in backend.access_controls else 0
            return [(count,)]
        if tag == "event_update":
            if "event_update_allowed" in defects:
                return []
            raise _StatementRejected(IMMUTABILITY_SQLSTATE)
        if tag == "event_delete":
            if "event_delete_allowed" in defects:
                return []
            raise _StatementRejected(IMMUTABILITY_SQLSTATE)
        raise PilotProofError("fixture_tag_unknown")


def _fixture_environment() -> dict[str, str]:
    host = "db.fixturebranch0000001.supabase.co"
    return {
        ENV_ADAPTER: ADAPTER,
        ENV_ALLOWED_HOST: host,
        ENV_OWNER_APPROVAL_ID: "OWNER-SELF-SERVE-PILOT-001",
        ENV_CLAIM_A: "SM-ABCD-2345",
        ENV_CLAIM_B: "SM-WXYZ-7890",
        ENV_ACTOR_A: "2f8d24d8-308c-4dc8-a352-7b61df756728",
        ENV_ACTOR_B: "3813d642-90f6-44e0-ad62-195ac8793aa8",
        ENV_SESSION_A: "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3",
        ENV_SESSION_B: "9c1a7e5e-13a1-4a8e-9be6-0d3f7a1c2b45",
        ENV_BUSINESS_NAME: "Yangon Self Serve Pilot",
        ENV_RELEASE_COMMIT: "0" * 40,
        ENV_DATABASE_URL: (
            "postgresql" + f"://self_serve_pilot_runtime:fixture-secret-a@{host}:5432/postgres"
            "?sslmode=require"
        ),
    }


def _pooler_environment() -> dict[str, str]:
    pooler_host = "aws-0-ap-southeast-1.pooler.supabase.com"
    return {
        **_fixture_environment(),
        ENV_POOLER_HOST: pooler_host,
        ENV_DATABASE_URL: (
            # Assembled from parts so no credential-shaped URI literal sits in
            # the repo for a secret scanner to flag (fixture convention, OPS-762).
            "postgresql" + "://self_serve_pilot_runtime.fixturebranch0000001"
            + ":" + "fixture-secret-a"
            + f"@{pooler_host}:5432/postgres?sslmode=require"
        ),
    }


def run_self_test() -> dict[str, Any]:
    cases = 0
    environment = _fixture_environment()
    config = load_config(environment)
    frozen_now = datetime(2030, 1, 3, tzinfo=timezone.utc)

    def audit_for(
        audit_config: AuditConfig,
        defects: frozenset[str] = frozenset(),
        *,
        window_open: Callable[[], bool] | None = None,
    ) -> tuple[SelfServePilotAudit, _FixtureSessionFactory]:
        backend = _FixtureBackend()
        store_factory = _FixtureStoreFactory(backend, defects)
        session_factory = _FixtureSessionFactory(backend, defects)
        audit = SelfServePilotAudit(
            audit_config, store_factory, session_factory, window_open=window_open
        )
        return audit, session_factory

    # Case: the happy path passes all six proofs on the exact fixed script.
    cases += 1
    happy_audit, happy_sessions = audit_for(config)
    report = happy_audit.run(captured_at=frozen_now)
    if (
        report["ok"] is not True
        or report["connection_lane"] != "direct"
        or report["sessions_performed"] != MAX_SESSIONS
        or report["statements_performed"] != MAX_STATEMENTS
        or report["store_calls_performed"] != MAX_STORE_CALLS
        or report["writes_confined_to_fixtures"] is not True
        or report["secrets_exposed"] is not False
        or report["tenant_rows_exposed"] is not False
        or report["owner_capabilities_expected"] != EXPECTED_OWNER_CAPABILITY_COUNT
        or [proof["id"] for proof in report["proofs"]] != list(PROOF_IDS)
        or any(proof.get("result") is None for proof in report["proofs"])
        or report["proofs"][4]["update_sqlstate"] != IMMUTABILITY_SQLSTATE
        or report["proofs"][4]["delete_sqlstate"] != IMMUTABILITY_SQLSTATE
        or happy_sessions.opened != MAX_SESSIONS
        or tuple(happy_sessions.tags) != EXPECTED_TAG_SEQUENCE
    ):
        raise PilotProofError("self_test_happy_path_failed")

    # Case: the session-pooler lane passes the identical fixed script.
    cases += 1
    pooler_config = load_config(_pooler_environment())
    pooler_audit, pooler_sessions = audit_for(pooler_config)
    pooler_report = pooler_audit.run(captured_at=frozen_now)
    if (
        pooler_report["ok"] is not True
        or pooler_report["connection_lane"] != "session_pooler"
        or pooler_report["statements_performed"] != MAX_STATEMENTS
        or pooler_report["store_calls_performed"] != MAX_STORE_CALLS
        or [proof["id"] for proof in pooler_report["proofs"]] != list(PROOF_IDS)
        or tuple(pooler_sessions.tags) != EXPECTED_TAG_SEQUENCE
    ):
        raise PilotProofError("self_test_pooler_lane_failed")

    def expect_failure(
        code: str,
        defects: frozenset[str],
        *,
        audit_config: AuditConfig | None = None,
        window_open: Callable[[], bool] | None = None,
    ) -> PilotProofError:
        nonlocal cases
        cases += 1
        audit, _ = audit_for(audit_config or config, defects, window_open=window_open)
        try:
            audit.run(captured_at=frozen_now)
        except PilotProofError as exc:
            if exc.code == code:
                return exc
            raise PilotProofError("self_test_expected_failure_missing") from exc
        raise PilotProofError("self_test_expected_failure_missing")

    # Cases: a transaction-mode pooler is detected before any proof statement.
    expect_failure(
        "pooler_transaction_mode_detected",
        frozenset({"pooler_transaction_mode"}),
        audit_config=pooler_config,
    )
    expect_failure("pooler_transaction_mode_detected", frozenset({"pooler_transaction_mode"}))

    # Cases: every laundering / defect path fails closed with its exact code.
    expect_failure(
        "window_refusal_not_enforced", frozenset(), window_open=lambda: True
    )
    expect_failure("runtime_role_posture_invalid", frozenset({"role_superuser"}))
    expect_failure("runtime_role_posture_invalid", frozenset({"role_bypassrls"}))
    expect_failure("schema_version_mismatch", frozenset({"schema_drift"}))
    expect_failure("access_control_not_active", frozenset({"access_not_active"}))
    expect_failure("owner_capabilities_incomplete", frozenset({"membership_caps_short"}))
    expect_failure("claim_linkage_missing", frozenset({"event_missing_linkage"}))
    expect_failure("replay_diverged", frozenset({"replay_workspace_diverges"}))
    expect_failure("replay_diverged", frozenset({"replay_not_flagged"}))
    expect_failure("replay_created_rows", frozenset({"replay_creates_rows"}))
    expect_failure("claim_conflict_not_enforced", frozenset({"claim_conflict_not_enforced"}))
    expect_failure("created_event_mutation_accepted", frozenset({"event_update_allowed"}))
    expect_failure("created_event_deletion_accepted", frozenset({"event_delete_allowed"}))
    expect_failure("cross_tenant_access_visible", frozenset({"cross_tenant_visible"}))
    leak_error = expect_failure("database_operation_failed", frozenset({"raw_error_leak"}))

    # Cases: configuration laundering is rejected before any connection.
    def expect_config_failure(code: str, mutation: dict[str, str]) -> None:
        nonlocal cases
        cases += 1
        try:
            load_config({**environment, **mutation})
        except PilotProofError as exc:
            if exc.code == code:
                return
            raise PilotProofError("self_test_config_rejection_failed") from exc
        raise PilotProofError("self_test_config_rejection_failed")

    production_host = f"db.{PRODUCTION_PROJECT_REF}.supabase.co"
    expect_config_failure("pilot_adapter_invalid", {ENV_ADAPTER: "other_adapter"})
    expect_config_failure(
        "production_target_forbidden",
        {
            ENV_ALLOWED_HOST: production_host,
            ENV_DATABASE_URL: (
                "postgresql" + f"://runtime:secret@{production_host}:5432/postgres?sslmode=require"
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
                "postgresql" + "://runtime:secret@db.otherbranch000000002.supabase.co:5432/postgres"
                "?sslmode=require"
            )
        },
    )
    expect_config_failure(
        "direct_port_required",
        {
            ENV_DATABASE_URL: (
                "postgresql" + f"://runtime:secret@{environment[ENV_ALLOWED_HOST]}:5433/postgres"
                "?sslmode=require"
            )
        },
    )
    expect_config_failure(
        "transaction_pooler_port_forbidden",
        {
            ENV_DATABASE_URL: (
                "postgresql" + f"://runtime:secret@{environment[ENV_ALLOWED_HOST]}:6543/postgres"
                "?sslmode=require"
            )
        },
    )
    expect_config_failure(
        "database_url_tls_required",
        {
            ENV_DATABASE_URL: (
                "postgresql" + f"://runtime:secret@{environment[ENV_ALLOWED_HOST]}:5432/postgres"
            )
        },
    )
    expect_config_failure("fixture_claim_invalid", {ENV_CLAIM_A: "SM-ABCI-2345"})
    expect_config_failure("fixture_claims_not_distinct", {ENV_CLAIM_B: environment[ENV_CLAIM_A]})
    expect_config_failure("fixture_actor_invalid", {ENV_ACTOR_A: "not-a-uuid"})
    expect_config_failure("fixture_actors_not_distinct", {ENV_ACTOR_B: environment[ENV_ACTOR_A]})
    expect_config_failure("release_commit_invalid", {ENV_RELEASE_COMMIT: "not-a-commit"})
    expect_config_failure(
        "owner_approval_id_invalid", {ENV_OWNER_APPROVAL_ID: "invalid approval id"}
    )

    pooler_environment = _pooler_environment()

    def expect_pooler_config_failure(code: str, mutation: dict[str, str]) -> None:
        nonlocal cases
        cases += 1
        try:
            load_config({**pooler_environment, **mutation})
        except PilotProofError as exc:
            if exc.code == code:
                return
            raise PilotProofError("self_test_config_rejection_failed") from exc
        raise PilotProofError("self_test_config_rejection_failed")

    pooler_host_value = pooler_environment[ENV_POOLER_HOST]
    # DSNs assembled from parts: no credential-shaped URI literal in-repo (OPS-762).
    expect_pooler_config_failure(
        "transaction_pooler_port_forbidden",
        {
            ENV_DATABASE_URL: (
                "postgresql" + "://self_serve_pilot_runtime.fixturebranch0000001"
                + ":" + "fixture-secret-a"
                + f"@{pooler_host_value}:6543/postgres?sslmode=require"
            )
        },
    )
    expect_pooler_config_failure(
        "pooler_username_ref_mismatch",
        {
            ENV_DATABASE_URL: (
                "postgresql" + "://self_serve_pilot_runtime.wrongref000000000001"
                + ":" + "fixture-secret-a"
                + f"@{pooler_host_value}:5432/postgres?sslmode=require"
            )
        },
    )
    expect_pooler_config_failure(
        "pooler_username_ref_missing",
        {
            ENV_DATABASE_URL: (
                "postgresql" + "://self_serve_pilot_runtime"
                + ":" + "fixture-secret-a"
                + f"@{pooler_host_value}:5432/postgres?sslmode=require"
            )
        },
    )
    expect_pooler_config_failure("pooler_host_invalid", {ENV_POOLER_HOST: "evil.example.com"})

    # Case: the budgets are hard limits, not advisory counters.
    cases += 1
    budget = _Budget()
    for _ in range(MAX_STATEMENTS):
        budget.statement()
    try:
        budget.statement()
    except PilotProofError as exc:
        if exc.code != "statement_budget_exceeded":
            raise PilotProofError("self_test_budget_failed") from exc
    else:
        raise PilotProofError("self_test_budget_failed")
    for _ in range(MAX_SESSIONS):
        budget.open_session()
    try:
        budget.open_session()
    except PilotProofError as exc:
        if exc.code != "session_budget_exceeded":
            raise PilotProofError("self_test_budget_failed") from exc
    else:
        raise PilotProofError("self_test_budget_failed")
    for _ in range(MAX_STORE_CALLS):
        budget.store_call()
    try:
        budget.store_call()
    except PilotProofError as exc:
        if exc.code != "store_call_budget_exceeded":
            raise PilotProofError("self_test_budget_failed") from exc
    else:
        raise PilotProofError("self_test_budget_failed")

    # Case: the confirm flag must match the configured owner approval id and is
    # checked before any store or session factory exists.
    cases += 1
    import io

    saved_environment = {key: os.environ.get(key) for key in environment}
    try:
        os.environ.update(environment)
        stderr_capture = io.StringIO()
        with contextlib.redirect_stderr(stderr_capture):
            exit_code = main(["--confirm-self-serve-pilot-audit", "WRONG-APPROVAL-ID"])
        if exit_code != 1 or "owner_approval_confirmation_mismatch" not in stderr_capture.getvalue():
            raise PilotProofError("self_test_approval_confirmation_failed")
    finally:
        for key, value in saved_environment.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    # Case: preflight performs zero connections, statements, and store calls.
    cases += 1
    preflight = configuration_preflight(config, captured_at=frozen_now)
    if (
        preflight["mode"] != "offline_configuration_preflight"
        or preflight["network_requests_performed"] != 0
        or preflight["database_connections_performed"] != 0
        or preflight["store_calls_performed"] != 0
        or preflight["persistent_mutations_performed"] != 0
        or preflight["provider_credentials_verified"] is not False
    ):
        raise PilotProofError("self_test_preflight_failed")

    # Case: evidence, preflight, and failure reports never leak configured
    # values, connection strings, or raw error text.
    cases += 1
    failure_report = _failure_report(leak_error, sessions=1, statements=8, store_calls=1)
    serialized = json.dumps(
        [report, pooler_report, preflight, failure_report], sort_keys=True
    )
    forbidden_values = [
        environment[ENV_DATABASE_URL],
        pooler_environment[ENV_DATABASE_URL],
        "self_serve_pilot_runtime.fixturebranch0000001",
        "fixture-secret-a",
        "password=",
        "postgresql://",
        config.claim_a,
        config.claim_b,
        config.actor_a,
        config.actor_b,
        config.session_a,
        config.session_b,
        config.owner_approval_id,
        self_serve_workspace_id(config.claim_a),
        self_serve_workspace_id(config.claim_b),
    ]
    if any(value in serialized for value in forbidden_values):
        raise PilotProofError("self_test_redaction_failed")

    return {
        "ok": True,
        "contract": CONTRACT,
        "mode": "offline_adversarial_self_test",
        "cases": cases,
        "network_requests_performed": 0,
        "database_connections_performed": 0,
        "store_calls_performed": 0,
        "persistent_mutations_performed": 0,
        "secrets_exposed": False,
        "tenant_rows_exposed": False,
    }


def _failure_report(
    error: PilotProofError, *, sessions: int, statements: int, store_calls: int
) -> dict[str, Any]:
    return {
        "ok": False,
        "contract": CONTRACT,
        "error": error.code,
        "sessions_performed": sessions,
        "statements_performed": statements,
        "store_calls_performed": store_calls,
        "secrets_exposed": False,
        "tenant_rows_exposed": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Prove self-serve tenant creation on an owner-approved isolated "
            "Supabase branch using the real store method."
        )
    )
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument("--confirm-self-serve-pilot-audit", metavar="OWNER_APPROVAL_ID")
    args = parser.parse_args(argv)
    audit: SelfServePilotAudit | None = None
    try:
        selected_modes = sum(
            (
                bool(args.self_test),
                bool(args.preflight),
                bool(args.confirm_self_serve_pilot_audit),
            )
        )
        if selected_modes > 1:
            raise PilotProofError("audit_mode_conflict")
        if args.self_test:
            result = run_self_test()
        elif args.preflight:
            result = configuration_preflight(load_config())
        else:
            if not args.confirm_self_serve_pilot_audit:
                raise PilotProofError("owner_approval_confirmation_required")
            config = load_config()
            if args.confirm_self_serve_pilot_audit != config.owner_approval_id:
                raise PilotProofError("owner_approval_confirmation_mismatch")
            audit = SelfServePilotAudit(
                config, NetworkStoreFactory(config), NetworkSessionFactory(config)
            )
            result = audit.run()
        print(json.dumps(result, ensure_ascii=True, indent=2, sort_keys=True))
        return 0
    except PilotProofError as exc:
        print(
            json.dumps(
                _failure_report(
                    exc,
                    sessions=0 if audit is None else audit.budget.sessions,
                    statements=0 if audit is None else audit.budget.statements,
                    store_calls=0 if audit is None else audit.budget.store_calls,
                ),
                ensure_ascii=True,
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
