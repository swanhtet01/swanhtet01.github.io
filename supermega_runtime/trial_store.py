"""Workspace-scoped persistence contracts for the canonical SuperMega trial."""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
from threading import RLock
from typing import Any, Callable, Iterator, Mapping, Protocol, Sequence
from uuid import UUID, uuid4


TRIAL_SCHEMA_COMPONENT = "private_trial_backend"
TRIAL_SCHEMA_VERSION = 1
TRIAL_SURFACES = frozenset({"command", "shop", "plant", "setup"})
SURFACE_WRITE_CAPABILITIES = {
    "command": "command.write",
    "shop": "shop.write",
    "plant": "plant.write",
    "setup": "setup.write",
}
APPROVAL_REQUEST_CAPABILITY = "approvals.request"
APPROVAL_DECIDE_CAPABILITY = "approvals.decide"
MAX_JSON_BYTES = 64 * 1024

JsonObject = dict[str, Any]
StateReducer = Callable[[str, str, Mapping[str, Any], Mapping[str, Any]], Mapping[str, Any]]


class TrialStoreError(RuntimeError):
    """Base class for safe, expected trial-store failures."""


class TrialNotReadyError(TrialStoreError):
    def __init__(self, reasons: Sequence[str]):
        self.reasons = tuple(dict.fromkeys(str(reason) for reason in reasons if str(reason)))
        super().__init__("Trial backend is not ready: " + ", ".join(self.reasons))


class TrialPermissionDenied(TrialStoreError):
    def __init__(self, required_capability: str):
        self.required_capability = required_capability
        super().__init__(f"Missing capability: {required_capability}")


class TrialVersionConflict(TrialStoreError):
    def __init__(self, *, expected_version: int, current_version: int):
        self.expected_version = expected_version
        self.current_version = current_version
        super().__init__(
            f"Expected workspace state version {expected_version}, current version is {current_version}."
        )


class TrialIdempotencyConflict(TrialStoreError):
    def __init__(self, command_id: str):
        self.command_id = command_id
        super().__init__(f"Command {command_id} was already used with different input.")


class TrialInvalidTransition(TrialStoreError):
    pass


class TrialNotFound(TrialStoreError):
    pass


class TrialValidationError(TrialStoreError):
    pass


@dataclass(frozen=True, slots=True)
class TrialPrincipal:
    workspace_id: str
    actor_id: str
    authenticated: bool = True

    def normalized(self) -> "TrialPrincipal":
        return TrialPrincipal(
            workspace_id=str(self.workspace_id or "").strip(),
            actor_id=str(self.actor_id or "").strip(),
            authenticated=bool(self.authenticated),
        )


@dataclass(frozen=True, slots=True)
class TrialReadiness:
    backend: str
    database_ready: bool
    role_ready: bool
    schema_ready: bool
    auth_ready: bool
    membership_ready: bool
    audit_ready: bool
    write_enabled: bool
    capabilities: frozenset[str] = frozenset()

    @property
    def read_ready(self) -> bool:
        return all(
            (
                self.database_ready,
                self.role_ready,
                self.schema_ready,
                self.auth_ready,
                self.membership_ready,
            )
        )

    @property
    def write_ready(self) -> bool:
        return self.read_ready and self.audit_ready and self.write_enabled

    @property
    def blockers(self) -> tuple[str, ...]:
        checks = (
            ("database_ready", self.database_ready),
            ("role_ready", self.role_ready),
            ("schema_ready", self.schema_ready),
            ("auth_ready", self.auth_ready),
            ("membership_ready", self.membership_ready),
            ("audit_ready", self.audit_ready),
            ("write_enabled", self.write_enabled),
        )
        return tuple(name for name, ready in checks if not ready)

    def to_dict(self) -> JsonObject:
        return {
            "status": "ready" if self.write_ready else "blocked",
            "backend": self.backend,
            "read_ready": self.read_ready,
            "write_ready": self.write_ready,
            "checks": {
                "database_ready": self.database_ready,
                "role_ready": self.role_ready,
                "schema_ready": self.schema_ready,
                "auth_ready": self.auth_ready,
                "membership_ready": self.membership_ready,
                "audit_ready": self.audit_ready,
                "write_enabled": self.write_enabled,
            },
            "blockers": list(self.blockers),
        }


@dataclass(frozen=True, slots=True)
class TrialState:
    workspace_id: str
    surface: str
    version: int
    state: JsonObject
    updated_by: str = ""
    updated_at: str = ""

    def to_dict(self) -> JsonObject:
        return {
            "surface": self.surface,
            "version": self.version,
            "state": deepcopy(self.state),
            "updated_by": self.updated_by,
            "updated_at": self.updated_at,
        }


@dataclass(frozen=True, slots=True)
class CommandResult:
    command_id: str
    surface: str
    event_type: str
    version: int
    state: JsonObject
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "command_id": self.command_id,
            "surface": self.surface,
            "event_type": self.event_type,
            "version": self.version,
            "state": deepcopy(self.state),
            "idempotent_replay": self.idempotent_replay,
        }


@dataclass(frozen=True, slots=True)
class ApprovalRecord:
    approval_id: str
    command_id: str
    title: str
    proposal: JsonObject
    evidence_refs: tuple[str, ...]
    status: str
    requested_by: str
    requested_at: str
    decided_by: str = ""
    decided_at: str = ""
    decision_note: str = ""
    version: int = 0
    idempotent_replay: bool = False

    def to_dict(self) -> JsonObject:
        return {
            "approval_id": self.approval_id,
            "command_id": self.command_id,
            "title": self.title,
            "proposal": deepcopy(self.proposal),
            "evidence_refs": list(self.evidence_refs),
            "status": self.status,
            "requested_by": self.requested_by,
            "requested_at": self.requested_at,
            "decided_by": self.decided_by,
            "decided_at": self.decided_at,
            "decision_note": self.decision_note,
            "version": self.version,
            "idempotent_replay": self.idempotent_replay,
        }


class TrialStore(Protocol):
    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness: ...

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState: ...

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]: ...

    def apply_command(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        surface: str,
        event_type: str,
        expected_version: int,
        payload: Mapping[str, Any],
    ) -> CommandResult: ...

    def create_approval(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        title: str,
        proposal: Mapping[str, Any],
        evidence_refs: Sequence[str],
    ) -> ApprovalRecord: ...

    def decide_approval(
        self,
        principal: TrialPrincipal,
        *,
        approval_id: str | UUID,
        command_id: str | UUID,
        decision: str,
        note: str = "",
    ) -> ApprovalRecord: ...


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_uuid(value: str | UUID, *, field_name: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise TrialValidationError(f"{field_name} must be a UUID.") from exc


def _normalize_surface(surface: str) -> str:
    normalized = str(surface or "").strip().lower()
    if normalized not in TRIAL_SURFACES:
        raise TrialValidationError(f"Unsupported trial surface: {normalized or 'missing'}")
    return normalized


def _normalize_event_type(event_type: str) -> str:
    normalized = str(event_type or "").strip().lower()
    if not normalized or len(normalized) > 80:
        raise TrialValidationError("event_type must contain between 1 and 80 characters.")
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-")
    if any(character not in allowed for character in normalized):
        raise TrialValidationError("event_type contains unsupported characters.")
    return normalized


def _json_object(value: Mapping[str, Any], *, field_name: str) -> JsonObject:
    if not isinstance(value, Mapping):
        raise TrialValidationError(f"{field_name} must be a JSON object.")
    try:
        encoded = json.dumps(
            dict(value),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise TrialValidationError(f"{field_name} must contain valid JSON values.") from exc
    if len(encoded.encode("utf-8")) > MAX_JSON_BYTES:
        raise TrialValidationError(f"{field_name} exceeds {MAX_JSON_BYTES} bytes.")
    return json.loads(encoded)


def _canonical_fingerprint(kind: str, payload: Mapping[str, Any]) -> str:
    normalized = _json_object(payload, field_name="fingerprint payload")
    encoded = json.dumps(
        {"kind": kind, "payload": normalized},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


def _required_surface_capability(surface: str) -> str:
    return SURFACE_WRITE_CAPABILITIES[_normalize_surface(surface)]


def _principal_auth_ready(principal: TrialPrincipal | None) -> bool:
    if principal is None:
        return False
    normalized = principal.normalized()
    return bool(normalized.authenticated and normalized.workspace_id and normalized.actor_id)


def _approval_from_mapping(row: Mapping[str, Any], *, replay: bool = False) -> ApprovalRecord:
    evidence = row.get("evidence_refs", row.get("evidence_refs_json", []))
    proposal = row.get("proposal", row.get("proposal_json", {}))
    if isinstance(evidence, str):
        evidence = json.loads(evidence or "[]")
    if isinstance(proposal, str):
        proposal = json.loads(proposal or "{}")
    return ApprovalRecord(
        approval_id=str(row.get("approval_id", "")),
        command_id=str(row.get("command_id", "")),
        title=str(row.get("title", "")),
        proposal=_json_object(proposal or {}, field_name="proposal"),
        evidence_refs=tuple(str(item) for item in (evidence or [])),
        status=str(row.get("status", "pending")),
        requested_by=str(row.get("requested_by", "")),
        requested_at=str(row.get("requested_at", "")),
        decided_by=str(row.get("decided_by", "") or ""),
        decided_at=str(row.get("decided_at", "") or ""),
        decision_note=str(row.get("decision_note", "") or ""),
        version=int(row.get("version", 0) or 0),
        idempotent_replay=replay,
    )


class PostgresTrialStore:
    """Server-only Postgres adapter for the private trial schema.

    The psycopg import is deliberately lazy so validation and authorization
    tests can run without a database or native driver. Production integration
    is not verified until the migration is applied and this adapter's readiness
    probe succeeds with a dedicated non-BYPASSRLS login role.
    """

    def __init__(self, database_url: str, *, reducer: StateReducer, write_enabled: bool = False):
        self.database_url = str(database_url or "").strip()
        self.reducer = reducer
        self.write_enabled = bool(write_enabled)

    def _connect(self):
        if not self.database_url:
            raise TrialNotReadyError(("database_ready",))
        try:
            import psycopg
            from psycopg.conninfo import conninfo_to_dict
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise TrialNotReadyError(("postgres_driver_ready",)) from exc
        # The Vercel runtime uses short-lived pooled connections. Disable
        # automatic prepared statements for Supavisor transaction mode and
        # enforce encrypted transport even if a manually supplied URL omitted
        # sslmode. A stronger URL setting (verify-ca / verify-full) remains in
        # the DSN and should be used where the provider certificate is pinned.
        connection_kwargs: dict[str, Any] = {
            "row_factory": dict_row,
            "connect_timeout": 5,
            "prepare_threshold": None,
            "application_name": "supermega-trial-runtime",
        }
        configured_sslmode = str(conninfo_to_dict(self.database_url).get("sslmode", "")).lower()
        if configured_sslmode not in {"require", "verify-ca", "verify-full"}:
            connection_kwargs["sslmode"] = "require"
        return psycopg.connect(self.database_url, **connection_kwargs)

    @staticmethod
    def _set_context(cursor: Any, principal: TrialPrincipal) -> None:
        cursor.execute(
            "select set_config('app.workspace_id', %s, true), set_config('app.actor_id', %s, true)",
            (principal.workspace_id, principal.actor_id),
        )

    @staticmethod
    def _assert_schema(cursor: Any) -> None:
        cursor.execute(
            """
            select schema_version
            from app_private.trial_schema_meta
            where component = %s
            """,
            (TRIAL_SCHEMA_COMPONENT,),
        )
        row = cursor.fetchone()
        if not row or int(row["schema_version"]) != TRIAL_SCHEMA_VERSION:
            raise TrialNotReadyError(("schema_ready",))

    @staticmethod
    def _assert_runtime_role(cursor: Any) -> None:
        cursor.execute(
            """
            with runtime_role as (
              select * from pg_roles where rolname = current_user
            ), backend_role as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), elevated_role as (
              select *
              from pg_roles
              where rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication
                 or rolname in (
                   'pg_read_all_data', 'pg_write_all_data', 'pg_execute_server_program',
                   'pg_read_server_files', 'pg_write_server_files'
                 )
            )
            select
              current_user = session_user as session_role_stable,
              current_user <> 'supermega_trial_backend'
                and current_user not in (
                  'postgres', 'supabase_admin', 'service_role', 'authenticator', 'anon', 'authenticated'
                ) as dedicated_login,
              coalesce((select rolcanlogin from runtime_role), false) as can_login,
              coalesce((select not rolsuper from runtime_role), false) as no_superuser,
              coalesce((select not rolbypassrls from runtime_role), false) as no_bypassrls,
              coalesce((select not rolcreaterole from runtime_role), false) as no_create_role,
              coalesce((select not rolcreatedb from runtime_role), false) as no_create_db,
              coalesce((select not rolreplication from runtime_role), false) as no_replication,
              coalesce((
                select pg_has_role(runtime_role.oid, backend_role.oid, 'USAGE')
                from runtime_role cross join backend_role
              ), false) as inherits_backend,
              not exists (
                select 1
                from runtime_role cross join elevated_role
                where runtime_role.oid <> elevated_role.oid
                  and pg_has_role(runtime_role.oid, elevated_role.oid, 'USAGE')
              ) as no_elevated_membership,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active
            """
        )
        row = cursor.fetchone() or {}
        required = (
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
            "tls_active",
        )
        if not all(bool(row.get(check)) for check in required):
            raise TrialNotReadyError(("role_ready",))

    @staticmethod
    def _load_membership(cursor: Any, principal: TrialPrincipal) -> frozenset[str]:
        cursor.execute(
            """
            select capabilities
            from app_private.workspace_memberships
            where workspace_id = %s and actor_id = %s and status = 'active'
            """,
            (principal.workspace_id, principal.actor_id),
        )
        row = cursor.fetchone()
        if not row:
            raise TrialNotReadyError(("membership_ready",))
        return frozenset(str(item) for item in (row.get("capabilities") or []))

    @staticmethod
    def _assert_audit(cursor: Any) -> None:
        cursor.execute(
            """
            select
              to_regclass('app_private.workspace_events') is not null as table_ready,
              has_table_privilege(current_user, 'app_private.workspace_events', 'INSERT') as insert_ready
            """
        )
        row = cursor.fetchone() or {}
        if not bool(row.get("table_ready")) or not bool(row.get("insert_ready")):
            raise TrialNotReadyError(("audit_ready",))

    @contextmanager
    def _guarded_cursor(
        self,
        principal: TrialPrincipal,
        *,
        write: bool,
        capability: str | None = None,
    ) -> Iterator[tuple[Any, frozenset[str]]]:
        normalized = principal.normalized()
        if not _principal_auth_ready(normalized):
            raise TrialNotReadyError(("auth_ready",))
        if write and not self.write_enabled:
            raise TrialNotReadyError(("write_enabled",))
        try:
            connection = self._connect()
        except TrialStoreError:
            raise
        except Exception as exc:
            raise TrialNotReadyError(("database_ready",)) from exc

        with connection:
            with connection.cursor() as cursor:
                try:
                    self._assert_runtime_role(cursor)
                    self._assert_schema(cursor)
                    self._set_context(cursor, normalized)
                    capabilities = self._load_membership(cursor, normalized)
                    if write:
                        self._assert_audit(cursor)
                except TrialStoreError:
                    raise
                except Exception as exc:
                    raise TrialNotReadyError(("database_or_schema_ready",)) from exc
                if capability and capability not in capabilities:
                    raise TrialPermissionDenied(capability)
                yield cursor, capabilities

    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness:
        auth_ready = _principal_auth_ready(principal)
        database_ready = False
        role_ready = False
        schema_ready = False
        membership_ready = False
        audit_ready = False
        capabilities: frozenset[str] = frozenset()
        if not self.database_url:
            return TrialReadiness(
                backend="postgres",
                database_ready=False,
                role_ready=False,
                schema_ready=False,
                auth_ready=auth_ready,
                membership_ready=False,
                audit_ready=False,
                write_enabled=self.write_enabled,
            )
        try:
            with self._connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("select 1 as ready")
                    database_ready = bool((cursor.fetchone() or {}).get("ready"))
                    self._assert_runtime_role(cursor)
                    role_ready = True
                    self._assert_schema(cursor)
                    schema_ready = True
                    self._assert_audit(cursor)
                    audit_ready = True
                    if auth_ready and principal is not None:
                        normalized = principal.normalized()
                        self._set_context(cursor, normalized)
                        capabilities = self._load_membership(cursor, normalized)
                        membership_ready = True
        except TrialNotReadyError as exc:
            if "postgres_driver_ready" in exc.reasons:
                database_ready = False
            elif "role_ready" in exc.reasons:
                role_ready = False
            elif "schema_ready" in exc.reasons or "database_or_schema_ready" in exc.reasons:
                schema_ready = False
            elif "audit_ready" in exc.reasons:
                audit_ready = False
            elif "membership_ready" in exc.reasons:
                membership_ready = False
        except Exception:
            database_ready = False
            role_ready = False
            schema_ready = False
            audit_ready = False
            membership_ready = False
        return TrialReadiness(
            backend="postgres",
            database_ready=database_ready,
            role_ready=role_ready,
            schema_ready=schema_ready,
            auth_ready=auth_ready,
            membership_ready=membership_ready,
            audit_ready=audit_ready,
            write_enabled=self.write_enabled,
            capabilities=capabilities,
        )

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState:
        normalized_surface = _normalize_surface(surface)
        with self._guarded_cursor(principal, write=False) as (cursor, _):
            cursor.execute(
                """
                select workspace_id, surface, version, state_json, updated_by, updated_at
                from app_private.workspace_state
                where workspace_id = %s and surface = %s
                """,
                (principal.normalized().workspace_id, normalized_surface),
            )
            row = cursor.fetchone()
        if not row:
            return TrialState(principal.normalized().workspace_id, normalized_surface, 0, {})
        state = row.get("state_json") or {}
        if isinstance(state, str):
            state = json.loads(state)
        return TrialState(
            workspace_id=str(row["workspace_id"]),
            surface=str(row["surface"]),
            version=int(row["version"]),
            state=_json_object(state, field_name="state"),
            updated_by=str(row.get("updated_by", "")),
            updated_at=str(row.get("updated_at", "")),
        )

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]:
        bounded_limit = max(1, min(int(limit), 100))
        with self._guarded_cursor(principal, write=False) as (cursor, _):
            cursor.execute(
                """
                select approval_id, command_id, title, proposal_json, evidence_refs_json,
                       status, requested_by, requested_at, decided_by, decided_at,
                       decision_note, version
                from app_private.approval_requests
                where workspace_id = %s
                order by case status when 'pending' then 0 else 1 end, requested_at desc
                limit %s
                """,
                (principal.normalized().workspace_id, bounded_limit),
            )
            rows = cursor.fetchall()
        return [_approval_from_mapping(row) for row in rows]

    @staticmethod
    def _lock(cursor: Any, key: str) -> None:
        cursor.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (key,))

    @staticmethod
    def _load_event_replay(
        cursor: Any,
        *,
        workspace_id: str,
        command_id: str,
        fingerprint: str,
    ) -> Mapping[str, Any] | None:
        cursor.execute(
            """
            select command_fingerprint, result_json
            from app_private.workspace_events
            where workspace_id = %s and command_id = %s
            """,
            (workspace_id, command_id),
        )
        row = cursor.fetchone()
        if not row:
            return None
        if str(row["command_fingerprint"]) != fingerprint:
            raise TrialIdempotencyConflict(command_id)
        result = row.get("result_json") or {}
        return json.loads(result) if isinstance(result, str) else result

    def apply_command(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        surface: str,
        event_type: str,
        expected_version: int,
        payload: Mapping[str, Any],
    ) -> CommandResult:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        surface_value = _normalize_surface(surface)
        event_type_value = _normalize_event_type(event_type)
        if int(expected_version) < 0:
            raise TrialValidationError("expected_version must be non-negative.")
        payload_value = _json_object(payload, field_name="payload")
        fingerprint = _canonical_fingerprint(
            "state_command",
            {
                "surface": surface_value,
                "event_type": event_type_value,
                "expected_version": int(expected_version),
                "payload": payload_value,
            },
        )
        normalized = principal.normalized()
        capability = _required_surface_capability(surface_value)
        with self._guarded_cursor(normalized, write=True, capability=capability) as (cursor, _):
            self._lock(cursor, f"{normalized.workspace_id}:command:{command_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=command_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return CommandResult(
                    command_id=command_id_value,
                    surface=str(replay["surface"]),
                    event_type=str(replay["event_type"]),
                    version=int(replay["version"]),
                    state=_json_object(replay.get("state", {}), field_name="state"),
                    idempotent_replay=True,
                )

            self._lock(cursor, f"{normalized.workspace_id}:state:{surface_value}")
            cursor.execute(
                """
                select version, state_json
                from app_private.workspace_state
                where workspace_id = %s and surface = %s
                for update
                """,
                (normalized.workspace_id, surface_value),
            )
            row = cursor.fetchone()
            current_version = int(row["version"]) if row else 0
            current_state = row.get("state_json", {}) if row else {}
            if isinstance(current_state, str):
                current_state = json.loads(current_state)
            if current_version != int(expected_version):
                raise TrialVersionConflict(
                    expected_version=int(expected_version),
                    current_version=current_version,
                )
            next_state = _json_object(
                self.reducer(surface_value, event_type_value, deepcopy(current_state), deepcopy(payload_value)),
                field_name="reduced state",
            )
            next_version = current_version + 1
            now = _utc_now()
            if row:
                cursor.execute(
                    """
                    update app_private.workspace_state
                    set version = %s, state_json = %s::jsonb, updated_by = %s, updated_at = %s::timestamptz
                    where workspace_id = %s and surface = %s
                    """,
                    (
                        next_version,
                        json.dumps(next_state, ensure_ascii=False),
                        normalized.actor_id,
                        now,
                        normalized.workspace_id,
                        surface_value,
                    ),
                )
            else:
                cursor.execute(
                    """
                    insert into app_private.workspace_state
                      (workspace_id, surface, version, state_json, updated_by, updated_at)
                    values (%s, %s, %s, %s::jsonb, %s, %s::timestamptz)
                    """,
                    (
                        normalized.workspace_id,
                        surface_value,
                        next_version,
                        json.dumps(next_state, ensure_ascii=False),
                        normalized.actor_id,
                        now,
                    ),
                )
            result = {
                "command_id": command_id_value,
                "surface": surface_value,
                "event_type": event_type_value,
                "version": next_version,
                "state": next_state,
            }
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, expected_version, resulting_version,
                   payload_json, result_json, created_at)
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::timestamptz)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    surface_value,
                    event_type_value,
                    normalized.actor_id,
                    int(expected_version),
                    next_version,
                    json.dumps(payload_value, ensure_ascii=False),
                    json.dumps(result, ensure_ascii=False),
                    now,
                ),
            )
        return CommandResult(
            command_id=command_id_value,
            surface=surface_value,
            event_type=event_type_value,
            version=next_version,
            state=next_state,
        )

    def create_approval(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        title: str,
        proposal: Mapping[str, Any],
        evidence_refs: Sequence[str],
    ) -> ApprovalRecord:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        title_value = str(title or "").strip()
        if not 1 <= len(title_value) <= 160:
            raise TrialValidationError("title must contain between 1 and 160 characters.")
        proposal_value = _json_object(proposal, field_name="proposal")
        evidence_value = tuple(str(item).strip() for item in evidence_refs if str(item).strip())
        if not evidence_value or len(evidence_value) > 20 or any(len(item) > 200 for item in evidence_value):
            raise TrialValidationError("evidence_refs must contain 1 to 20 references of at most 200 characters.")
        fingerprint = _canonical_fingerprint(
            "approval_request",
            {"title": title_value, "proposal": proposal_value, "evidence_refs": list(evidence_value)},
        )
        normalized = principal.normalized()
        with self._guarded_cursor(
            normalized,
            write=True,
            capability=APPROVAL_REQUEST_CAPABILITY,
        ) as (cursor, _):
            self._lock(cursor, f"{normalized.workspace_id}:command:{command_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=command_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            approval_id = str(uuid4())
            now = _utc_now()
            cursor.execute(
                """
                insert into app_private.approval_requests
                  (approval_id, workspace_id, command_id, command_fingerprint, title,
                   proposal_json, evidence_refs_json, status, requested_by, requested_at, version)
                values (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 'pending', %s, %s::timestamptz, 0)
                """,
                (
                    approval_id,
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    title_value,
                    json.dumps(proposal_value, ensure_ascii=False),
                    json.dumps(list(evidence_value), ensure_ascii=False),
                    normalized.actor_id,
                    now,
                ),
            )
            approval = ApprovalRecord(
                approval_id=approval_id,
                command_id=command_id_value,
                title=title_value,
                proposal=proposal_value,
                evidence_refs=evidence_value,
                status="pending",
                requested_by=normalized.actor_id,
                requested_at=now,
            )
            result = {"approval": approval.to_dict()}
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, expected_version, resulting_version,
                   payload_json, result_json, created_at)
                values (%s, %s, %s, %s, 'approvals', 'approval.requested', %s,
                        null, 0, %s::jsonb, %s::jsonb, %s::timestamptz)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    normalized.actor_id,
                    json.dumps(
                        {"title": title_value, "proposal": proposal_value, "evidence_refs": list(evidence_value)},
                        ensure_ascii=False,
                    ),
                    json.dumps(result, ensure_ascii=False),
                    now,
                ),
            )
        return approval

    def decide_approval(
        self,
        principal: TrialPrincipal,
        *,
        approval_id: str | UUID,
        command_id: str | UUID,
        decision: str,
        note: str = "",
    ) -> ApprovalRecord:
        approval_id_value = _normalize_uuid(approval_id, field_name="approval_id")
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        decision_value = str(decision or "").strip().lower()
        if decision_value not in {"approved", "declined"}:
            raise TrialValidationError("decision must be approved or declined.")
        note_value = str(note or "").strip()
        if len(note_value) > 500:
            raise TrialValidationError("decision note exceeds 500 characters.")
        fingerprint = _canonical_fingerprint(
            "approval_decision",
            {"approval_id": approval_id_value, "decision": decision_value, "note": note_value},
        )
        normalized = principal.normalized()
        with self._guarded_cursor(
            normalized,
            write=True,
            capability=APPROVAL_DECIDE_CAPABILITY,
        ) as (cursor, _):
            self._lock(cursor, f"{normalized.workspace_id}:command:{command_id_value}")
            replay = self._load_event_replay(
                cursor,
                workspace_id=normalized.workspace_id,
                command_id=command_id_value,
                fingerprint=fingerprint,
            )
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            self._lock(cursor, f"{normalized.workspace_id}:approval:{approval_id_value}")
            cursor.execute(
                """
                select approval_id, command_id, title, proposal_json, evidence_refs_json,
                       status, requested_by, requested_at, decided_by, decided_at,
                       decision_note, version
                from app_private.approval_requests
                where workspace_id = %s and approval_id = %s
                for update
                """,
                (normalized.workspace_id, approval_id_value),
            )
            row = cursor.fetchone()
            if not row:
                raise TrialNotFound("Approval not found.")
            if str(row["status"]) != "pending":
                raise TrialInvalidTransition("Approval has already reached a terminal decision.")
            now = _utc_now()
            cursor.execute(
                """
                update app_private.approval_requests
                set status = %s, decided_by = %s, decided_at = %s::timestamptz,
                    decision_note = %s, version = version + 1
                where workspace_id = %s and approval_id = %s and status = 'pending'
                """,
                (
                    decision_value,
                    normalized.actor_id,
                    now,
                    note_value,
                    normalized.workspace_id,
                    approval_id_value,
                ),
            )
            if cursor.rowcount != 1:
                raise TrialInvalidTransition("Approval decision lost a concurrent update race.")
            decided = _approval_from_mapping(
                {
                    **dict(row),
                    "status": decision_value,
                    "decided_by": normalized.actor_id,
                    "decided_at": now,
                    "decision_note": note_value,
                    "version": int(row["version"]) + 1,
                }
            )
            result = {"approval": decided.to_dict()}
            cursor.execute(
                """
                insert into app_private.workspace_events
                  (event_id, workspace_id, command_id, command_fingerprint, surface,
                   event_type, actor_id, expected_version, resulting_version,
                   payload_json, result_json, created_at)
                values (%s, %s, %s, %s, 'approvals', 'approval.decided', %s,
                        0, 1, %s::jsonb, %s::jsonb, %s::timestamptz)
                """,
                (
                    str(uuid4()),
                    normalized.workspace_id,
                    command_id_value,
                    fingerprint,
                    normalized.actor_id,
                    json.dumps(
                        {"approval_id": approval_id_value, "decision": decision_value, "note": note_value},
                        ensure_ascii=False,
                    ),
                    json.dumps(result, ensure_ascii=False),
                    now,
                ),
            )
        return decided


class InMemoryTrialStore:
    """Parity test double. It is intentionally unsuitable for production use."""

    def __init__(
        self,
        *,
        reducer: StateReducer,
        database_ready: bool = True,
        role_ready: bool = True,
        schema_ready: bool = True,
        audit_ready: bool = True,
        write_enabled: bool = True,
    ):
        self.reducer = reducer
        self.database_ready = bool(database_ready)
        self.role_ready = bool(role_ready)
        self.schema_ready = bool(schema_ready)
        self.audit_ready = bool(audit_ready)
        self.write_enabled = bool(write_enabled)
        self._memberships: dict[tuple[str, str], tuple[str, frozenset[str]]] = {}
        self._states: dict[tuple[str, str], TrialState] = {}
        self._events: dict[tuple[str, str], tuple[str, JsonObject]] = {}
        self._approvals: dict[tuple[str, str], ApprovalRecord] = {}
        self._approval_commands: dict[tuple[str, str], str] = {}
        self._lock = RLock()

    def provision_membership(
        self,
        *,
        workspace_id: str,
        actor_id: str,
        capabilities: Sequence[str],
        status: str = "active",
    ) -> None:
        normalized_status = str(status).strip().lower()
        if normalized_status not in {"active", "suspended", "revoked"}:
            raise TrialValidationError("Unsupported membership status.")
        key = (str(workspace_id).strip(), str(actor_id).strip())
        self._memberships[key] = (
            normalized_status,
            frozenset(str(item).strip() for item in capabilities if str(item).strip()),
        )

    def readiness(self, principal: TrialPrincipal | None) -> TrialReadiness:
        auth_ready = _principal_auth_ready(principal)
        membership_ready = False
        capabilities: frozenset[str] = frozenset()
        if auth_ready and principal is not None:
            normalized = principal.normalized()
            status, capabilities = self._memberships.get(
                (normalized.workspace_id, normalized.actor_id),
                ("missing", frozenset()),
            )
            membership_ready = status == "active"
        return TrialReadiness(
            backend="memory_test_double",
            database_ready=self.database_ready,
            role_ready=self.role_ready,
            schema_ready=self.schema_ready,
            auth_ready=auth_ready,
            membership_ready=membership_ready,
            audit_ready=self.audit_ready,
            write_enabled=self.write_enabled,
            capabilities=capabilities,
        )

    def _guard(
        self,
        principal: TrialPrincipal,
        *,
        write: bool,
        capability: str | None = None,
    ) -> tuple[TrialPrincipal, TrialReadiness]:
        normalized = principal.normalized()
        readiness = self.readiness(normalized)
        blockers = readiness.blockers if write else tuple(
            blocker
            for blocker in readiness.blockers
            if blocker not in {"audit_ready", "write_enabled"}
        )
        if blockers:
            raise TrialNotReadyError(blockers)
        if capability and capability not in readiness.capabilities:
            raise TrialPermissionDenied(capability)
        return normalized, readiness

    def get_state(self, principal: TrialPrincipal, surface: str) -> TrialState:
        normalized, _ = self._guard(principal, write=False)
        surface_value = _normalize_surface(surface)
        state = self._states.get((normalized.workspace_id, surface_value))
        if state is None:
            return TrialState(normalized.workspace_id, surface_value, 0, {})
        return TrialState(
            workspace_id=state.workspace_id,
            surface=state.surface,
            version=state.version,
            state=deepcopy(state.state),
            updated_by=state.updated_by,
            updated_at=state.updated_at,
        )

    def list_approvals(self, principal: TrialPrincipal, *, limit: int = 50) -> list[ApprovalRecord]:
        normalized, _ = self._guard(principal, write=False)
        rows = [
            approval
            for (workspace_id, _), approval in self._approvals.items()
            if workspace_id == normalized.workspace_id
        ]
        rows.sort(key=lambda row: (row.status != "pending", row.requested_at), reverse=False)
        return [deepcopy(row) for row in rows[: max(1, min(int(limit), 100))]]

    def _replay(self, workspace_id: str, command_id: str, fingerprint: str) -> JsonObject | None:
        row = self._events.get((workspace_id, command_id))
        if row is None:
            return None
        stored_fingerprint, result = row
        if stored_fingerprint != fingerprint:
            raise TrialIdempotencyConflict(command_id)
        return deepcopy(result)

    def apply_command(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        surface: str,
        event_type: str,
        expected_version: int,
        payload: Mapping[str, Any],
    ) -> CommandResult:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        surface_value = _normalize_surface(surface)
        event_type_value = _normalize_event_type(event_type)
        if int(expected_version) < 0:
            raise TrialValidationError("expected_version must be non-negative.")
        payload_value = _json_object(payload, field_name="payload")
        fingerprint = _canonical_fingerprint(
            "state_command",
            {
                "surface": surface_value,
                "event_type": event_type_value,
                "expected_version": int(expected_version),
                "payload": payload_value,
            },
        )
        with self._lock:
            normalized, _ = self._guard(
                principal,
                write=True,
                capability=_required_surface_capability(surface_value),
            )
            replay = self._replay(normalized.workspace_id, command_id_value, fingerprint)
            if replay is not None:
                return CommandResult(
                    command_id=command_id_value,
                    surface=str(replay["surface"]),
                    event_type=str(replay["event_type"]),
                    version=int(replay["version"]),
                    state=_json_object(replay.get("state", {}), field_name="state"),
                    idempotent_replay=True,
                )
            current = self._states.get(
                (normalized.workspace_id, surface_value),
                TrialState(normalized.workspace_id, surface_value, 0, {}),
            )
            if current.version != int(expected_version):
                raise TrialVersionConflict(
                    expected_version=int(expected_version),
                    current_version=current.version,
                )
            next_state = _json_object(
                self.reducer(surface_value, event_type_value, deepcopy(current.state), deepcopy(payload_value)),
                field_name="reduced state",
            )
            next_version = current.version + 1
            next_row = TrialState(
                workspace_id=normalized.workspace_id,
                surface=surface_value,
                version=next_version,
                state=deepcopy(next_state),
                updated_by=normalized.actor_id,
                updated_at=_utc_now(),
            )
            result = CommandResult(
                command_id=command_id_value,
                surface=surface_value,
                event_type=event_type_value,
                version=next_version,
                state=deepcopy(next_state),
            )
            self._states[(normalized.workspace_id, surface_value)] = next_row
            self._events[(normalized.workspace_id, command_id_value)] = (fingerprint, result.to_dict())
            return result

    def create_approval(
        self,
        principal: TrialPrincipal,
        *,
        command_id: str | UUID,
        title: str,
        proposal: Mapping[str, Any],
        evidence_refs: Sequence[str],
    ) -> ApprovalRecord:
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        title_value = str(title or "").strip()
        if not 1 <= len(title_value) <= 160:
            raise TrialValidationError("title must contain between 1 and 160 characters.")
        proposal_value = _json_object(proposal, field_name="proposal")
        evidence_value = tuple(str(item).strip() for item in evidence_refs if str(item).strip())
        if not evidence_value or len(evidence_value) > 20 or any(len(item) > 200 for item in evidence_value):
            raise TrialValidationError("evidence_refs must contain 1 to 20 references of at most 200 characters.")
        fingerprint = _canonical_fingerprint(
            "approval_request",
            {"title": title_value, "proposal": proposal_value, "evidence_refs": list(evidence_value)},
        )
        with self._lock:
            normalized, _ = self._guard(
                principal,
                write=True,
                capability=APPROVAL_REQUEST_CAPABILITY,
            )
            replay = self._replay(normalized.workspace_id, command_id_value, fingerprint)
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            approval = ApprovalRecord(
                approval_id=str(uuid4()),
                command_id=command_id_value,
                title=title_value,
                proposal=proposal_value,
                evidence_refs=evidence_value,
                status="pending",
                requested_by=normalized.actor_id,
                requested_at=_utc_now(),
            )
            self._approvals[(normalized.workspace_id, approval.approval_id)] = deepcopy(approval)
            self._approval_commands[(normalized.workspace_id, command_id_value)] = approval.approval_id
            self._events[(normalized.workspace_id, command_id_value)] = (
                fingerprint,
                {"approval": approval.to_dict()},
            )
            return deepcopy(approval)

    def decide_approval(
        self,
        principal: TrialPrincipal,
        *,
        approval_id: str | UUID,
        command_id: str | UUID,
        decision: str,
        note: str = "",
    ) -> ApprovalRecord:
        approval_id_value = _normalize_uuid(approval_id, field_name="approval_id")
        command_id_value = _normalize_uuid(command_id, field_name="command_id")
        decision_value = str(decision or "").strip().lower()
        if decision_value not in {"approved", "declined"}:
            raise TrialValidationError("decision must be approved or declined.")
        note_value = str(note or "").strip()
        if len(note_value) > 500:
            raise TrialValidationError("decision note exceeds 500 characters.")
        fingerprint = _canonical_fingerprint(
            "approval_decision",
            {"approval_id": approval_id_value, "decision": decision_value, "note": note_value},
        )
        with self._lock:
            normalized, _ = self._guard(
                principal,
                write=True,
                capability=APPROVAL_DECIDE_CAPABILITY,
            )
            replay = self._replay(normalized.workspace_id, command_id_value, fingerprint)
            if replay is not None:
                return _approval_from_mapping(replay["approval"], replay=True)
            key = (normalized.workspace_id, approval_id_value)
            current = self._approvals.get(key)
            if current is None:
                raise TrialNotFound("Approval not found.")
            if current.status != "pending":
                raise TrialInvalidTransition("Approval has already reached a terminal decision.")
            decided = ApprovalRecord(
                approval_id=current.approval_id,
                command_id=current.command_id,
                title=current.title,
                proposal=deepcopy(current.proposal),
                evidence_refs=current.evidence_refs,
                status=decision_value,
                requested_by=current.requested_by,
                requested_at=current.requested_at,
                decided_by=normalized.actor_id,
                decided_at=_utc_now(),
                decision_note=note_value,
                version=1,
            )
            self._approvals[key] = deepcopy(decided)
            self._events[(normalized.workspace_id, command_id_value)] = (
                fingerprint,
                {"approval": decided.to_dict()},
            )
            return deepcopy(decided)
