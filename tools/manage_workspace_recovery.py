#!/usr/bin/env python3
"""Create and verify a bounded, workspace-scoped recovery package.

The export path is deliberately read-only. Restoring customer data is a
separate, owner-approved operation; this tool emits a deterministic restore
plan but never writes to Postgres.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
from decimal import Decimal
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any, Mapping, Sequence
from uuid import UUID


CONTRACT = "supermega.workspace_recovery.v1"
RESTORE_PLAN_CONTRACT = "supermega.workspace_restore_plan.v1"
SCHEMA_COMPONENT = "private_trial_backend"
EXPECTED_SCHEMA_VERSION = 5
DEFAULT_ENV_KEY = "SUPERMEGA_RECOVERY_ADMIN_DATABASE_URL"
DEFAULT_MAX_ROWS_PER_SECTION = 50_000
MAX_PACKAGE_BYTES = 32 * 1024 * 1024
WORKSPACE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
SECRET_FIELD_NAMES = frozenset(
    {
        "access_token",
        "api_key",
        "authorization",
        "cookie",
        "credentials",
        "database_url",
        "dsn",
        "password",
        "private_key",
        "refresh_token",
        "secret",
        "service_role_key",
    }
)
SECTION_ORDER = (
    "workspace_memberships",
    "workspace_state",
    "workspace_events",
    "approval_requests",
)
SECTION_ORDER_BY = {
    "workspace_memberships": "actor_id",
    "workspace_state": "surface",
    "workspace_events": "created_at, event_id",
    "approval_requests": "requested_at, approval_id",
}
PACKAGE_KEYS = frozenset(
    {
        "contract",
        "schema_component",
        "schema_version",
        "workspace_id",
        "exported_at",
        "data_classification",
        "storage_protection",
        "sections",
        "counts",
        "section_sha256",
        "integrity_sha256",
        "secret_values_exposed",
    }
)


class RecoveryError(RuntimeError):
    """A safe, stable recovery-tool failure."""


def _fail(code: str) -> None:
    raise RecoveryError(code)


def _validate_workspace_id(value: str, *, code: str = "workspace_id_invalid") -> str:
    workspace_id = str(value or "").strip()
    if not WORKSPACE_PATTERN.fullmatch(workspace_id):
        _fail(code)
    return workspace_id


def _normalize(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            _fail("non_finite_number_not_allowed")
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            _fail("naive_timestamp_not_allowed")
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Mapping):
        return {str(key): _normalize(item) for key, item in sorted(value.items(), key=lambda pair: str(pair[0]))}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_normalize(item) for item in value]
    _fail("unsupported_recovery_value")


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        _normalize(value),
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _digest(value: Any) -> str:
    return f"sha256:{sha256(_canonical_bytes(value)).hexdigest()}"


def _assert_no_secret_fields(value: Any) -> None:
    if isinstance(value, Mapping):
        for key, item in value.items():
            snake_key = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", str(key).strip())
            normalized_key = re.sub(r"[^a-z0-9]+", "_", snake_key.lower()).strip("_")
            if normalized_key in SECRET_FIELD_NAMES:
                _fail("workspace_recovery_secret_field_detected")
            _assert_no_secret_fields(item)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for item in value:
            _assert_no_secret_fields(item)


def _validate_section_rows(
    section: str,
    rows: Any,
    *,
    workspace_id: str,
    max_rows_per_section: int,
) -> list[dict[str, Any]]:
    if not isinstance(rows, list):
        _fail(f"{section}_rows_invalid")
    if len(rows) > max_rows_per_section:
        _fail(f"{section}_row_limit_exceeded")
    normalized: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, Mapping):
            _fail(f"{section}_row_invalid")
        item = _normalize(row)
        if item.get("workspace_id") != workspace_id:
            _fail(f"{section}_workspace_scope_mismatch")
        normalized.append(item)
    return normalized


def build_package(
    *,
    workspace_id: str,
    schema_version: int,
    sections: Mapping[str, Sequence[Mapping[str, Any]]],
    exported_at: datetime | None = None,
    max_rows_per_section: int = DEFAULT_MAX_ROWS_PER_SECTION,
) -> dict[str, Any]:
    workspace_id = _validate_workspace_id(workspace_id)
    if schema_version != EXPECTED_SCHEMA_VERSION:
        _fail("workspace_recovery_schema_version_mismatch")
    if set(sections) != set(SECTION_ORDER):
        _fail("workspace_recovery_sections_invalid")
    if max_rows_per_section < 1 or max_rows_per_section > DEFAULT_MAX_ROWS_PER_SECTION:
        _fail("workspace_recovery_row_limit_invalid")
    timestamp = exported_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        _fail("workspace_recovery_timestamp_invalid")
    normalized_sections = {
        section: _validate_section_rows(
            section,
            list(sections[section]),
            workspace_id=workspace_id,
            max_rows_per_section=max_rows_per_section,
        )
        for section in SECTION_ORDER
    }
    if not normalized_sections["workspace_memberships"]:
        _fail("workspace_recovery_workspace_not_found")
    _assert_no_secret_fields(normalized_sections)
    package: dict[str, Any] = {
        "contract": CONTRACT,
        "schema_component": SCHEMA_COMPONENT,
        "schema_version": schema_version,
        "workspace_id": workspace_id,
        "exported_at": timestamp.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data_classification": "confidential_customer_data",
        "storage_protection": "owner_protected_plaintext_file",
        "sections": normalized_sections,
        "counts": {section: len(normalized_sections[section]) for section in SECTION_ORDER},
        "section_sha256": {section: _digest(normalized_sections[section]) for section in SECTION_ORDER},
        "secret_values_exposed": False,
    }
    package["integrity_sha256"] = _digest(package)
    if len(_canonical_bytes(package)) > MAX_PACKAGE_BYTES:
        _fail("workspace_recovery_package_too_large")
    return package


def verify_package(
    package: Any,
    *,
    max_rows_per_section: int = DEFAULT_MAX_ROWS_PER_SECTION,
) -> dict[str, Any]:
    if not isinstance(package, Mapping) or set(package) != PACKAGE_KEYS:
        _fail("workspace_recovery_package_shape_invalid")
    if package.get("contract") != CONTRACT:
        _fail("workspace_recovery_contract_invalid")
    if package.get("schema_component") != SCHEMA_COMPONENT:
        _fail("workspace_recovery_schema_component_invalid")
    if package.get("schema_version") != EXPECTED_SCHEMA_VERSION:
        _fail("workspace_recovery_schema_version_mismatch")
    if package.get("data_classification") != "confidential_customer_data":
        _fail("workspace_recovery_classification_invalid")
    if package.get("storage_protection") != "owner_protected_plaintext_file":
        _fail("workspace_recovery_storage_protection_invalid")
    if package.get("secret_values_exposed") is not False:
        _fail("workspace_recovery_secret_flag_invalid")
    workspace_id = _validate_workspace_id(str(package.get("workspace_id", "")))
    timestamp = package.get("exported_at")
    if not isinstance(timestamp, str) or not timestamp.endswith("Z"):
        _fail("workspace_recovery_timestamp_invalid")
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise RecoveryError("workspace_recovery_timestamp_invalid") from exc
    sections = package.get("sections")
    if not isinstance(sections, Mapping) or set(sections) != set(SECTION_ORDER):
        _fail("workspace_recovery_sections_invalid")
    normalized_sections = {
        section: _validate_section_rows(
            section,
            sections[section],
            workspace_id=workspace_id,
            max_rows_per_section=max_rows_per_section,
        )
        for section in SECTION_ORDER
    }
    if not normalized_sections["workspace_memberships"]:
        _fail("workspace_recovery_workspace_not_found")
    _assert_no_secret_fields(normalized_sections)
    expected_counts = {section: len(normalized_sections[section]) for section in SECTION_ORDER}
    if package.get("counts") != expected_counts:
        _fail("workspace_recovery_counts_invalid")
    expected_section_digests = {section: _digest(normalized_sections[section]) for section in SECTION_ORDER}
    if package.get("section_sha256") != expected_section_digests:
        _fail("workspace_recovery_section_digest_invalid")
    unsigned = dict(package)
    observed_digest = unsigned.pop("integrity_sha256", None)
    if observed_digest != _digest(unsigned):
        _fail("workspace_recovery_integrity_invalid")
    if len(_canonical_bytes(package)) > MAX_PACKAGE_BYTES:
        _fail("workspace_recovery_package_too_large")
    return {
        "contract": CONTRACT,
        "valid": True,
        "workspace_id": workspace_id,
        "schema_version": EXPECTED_SCHEMA_VERSION,
        "counts": expected_counts,
        "integrity_sha256": observed_digest,
    }


def read_package(path: str | Path) -> dict[str, Any]:
    unresolved_source = Path(path).expanduser()
    if unresolved_source.is_symlink():
        _fail("workspace_recovery_input_invalid")
    source = unresolved_source.resolve()
    if not source.is_file():
        _fail("workspace_recovery_input_invalid")
    size = source.stat().st_size
    if size < 2 or size > MAX_PACKAGE_BYTES:
        _fail("workspace_recovery_input_size_invalid")
    try:
        payload = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise RecoveryError("workspace_recovery_input_unreadable") from exc
    verify_package(payload)
    return payload


def write_package(path: str | Path, package: Mapping[str, Any]) -> Path:
    verify_package(package)
    unresolved_destination = Path(path).expanduser()
    if unresolved_destination.is_symlink():
        _fail("workspace_recovery_output_exists")
    destination = unresolved_destination.resolve()
    if destination.suffix.lower() != ".json":
        _fail("workspace_recovery_output_must_be_json")
    if destination.exists() or destination.is_symlink():
        _fail("workspace_recovery_output_exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        encoded = json.dumps(package, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8") + b"\n"
        if len(encoded) > MAX_PACKAGE_BYTES:
            _fail("workspace_recovery_package_too_large")
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, destination)
        except FileExistsError as exc:
            raise RecoveryError("workspace_recovery_output_exists") from exc
        temporary.unlink()
        try:
            os.chmod(destination, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
    finally:
        if descriptor is not None:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)
    return destination


def _open_connection(database_url: str) -> Any:
    try:
        import psycopg
        from psycopg.conninfo import conninfo_to_dict
        from psycopg.rows import dict_row
        from validate_supermega_database_url import validate_database_url
    except ImportError as exc:
        raise RecoveryError("workspace_recovery_driver_unavailable") from exc
    try:
        validate_database_url(database_url)
        configured_sslmode = str(conninfo_to_dict(database_url).get("sslmode", "")).lower()
        kwargs: dict[str, Any] = {
            "autocommit": False,
            "connect_timeout": 5,
            "prepare_threshold": None,
            "application_name": "supermega-workspace-recovery",
            "row_factory": dict_row,
        }
        if configured_sslmode not in {"require", "verify-ca", "verify-full"}:
            kwargs["sslmode"] = "require"
        return psycopg.connect(database_url, **kwargs)
    except RecoveryError:
        raise
    except Exception as exc:
        raise RecoveryError("workspace_recovery_connection_failed") from exc


def export_workspace(
    *,
    database_url: str,
    workspace_id: str,
    max_rows_per_section: int = DEFAULT_MAX_ROWS_PER_SECTION,
    connection_factory: Any = _open_connection,
) -> dict[str, Any]:
    workspace_id = _validate_workspace_id(workspace_id)
    if not database_url.strip():
        _fail("workspace_recovery_database_url_missing")
    connection = connection_factory(database_url)
    try:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute("set transaction read only")
                cursor.execute("set local statement_timeout = '30s'")
                cursor.execute("set local lock_timeout = '2s'")
                cursor.execute(
                    "select schema_version from app_private.trial_schema_meta where component = %s",
                    (SCHEMA_COMPONENT,),
                )
                schema_row = cursor.fetchone()
                if not schema_row or int(schema_row["schema_version"]) != EXPECTED_SCHEMA_VERSION:
                    _fail("workspace_recovery_schema_version_mismatch")
                cursor.execute(
                    "select coalesce(rolsuper or rolbypassrls, false) as recovery_authority "
                    "from pg_roles where rolname = current_user"
                )
                authority_row = cursor.fetchone()
                if not authority_row or authority_row["recovery_authority"] is not True:
                    _fail("workspace_recovery_admin_role_required")
                sections: dict[str, list[dict[str, Any]]] = {}
                for section in SECTION_ORDER:
                    cursor.execute(
                        f"select to_jsonb(source_row) as row_json from app_private.{section} as source_row "
                        f"where workspace_id = %s order by {SECTION_ORDER_BY[section]} limit %s",
                        (workspace_id, max_rows_per_section + 1),
                    )
                    rows = [row["row_json"] for row in cursor.fetchall()]
                    if len(rows) > max_rows_per_section:
                        _fail(f"{section}_row_limit_exceeded")
                    sections[section] = rows
        return build_package(
            workspace_id=workspace_id,
            schema_version=EXPECTED_SCHEMA_VERSION,
            sections=sections,
            max_rows_per_section=max_rows_per_section,
        )
    except RecoveryError:
        raise
    except Exception as exc:
        raise RecoveryError("workspace_recovery_export_failed") from exc
    finally:
        connection.close()


def build_restore_plan(package: Mapping[str, Any], *, destination_workspace: str) -> dict[str, Any]:
    verification = verify_package(package)
    destination = _validate_workspace_id(destination_workspace, code="destination_workspace_id_invalid")
    return {
        "contract": RESTORE_PLAN_CONTRACT,
        "source_contract": CONTRACT,
        "source_workspace_id": verification["workspace_id"],
        "destination_workspace_id": destination,
        "source_integrity_sha256": verification["integrity_sha256"],
        "schema_version_required": EXPECTED_SCHEMA_VERSION,
        "counts": verification["counts"],
        "write_performed": False,
        "required_gates": [
            "owner_approved_isolated_target",
            "exact_schema_version",
            "fresh_pre_restore_backup",
            "empty_or_formally_quiesced_destination_workspace",
            "integrity_reverified_inside_restore_transaction",
            "tenant_isolation_and_row_count_acceptance",
        ],
        "transaction_order": list(SECTION_ORDER),
        "rollback_rule": "rollback_on_any_insert_or_acceptance_failure",
    }


def _fixture_sections(workspace_id: str) -> dict[str, list[dict[str, Any]]]:
    return {
        "workspace_memberships": [{"workspace_id": workspace_id, "actor_id": "owner", "actor_kind": "human"}],
        "workspace_state": [{"workspace_id": workspace_id, "surface": "commerce", "version": 2, "state_json": {"orders": 1}}],
        "workspace_events": [{"workspace_id": workspace_id, "event_id": "00000000-0000-0000-0000-000000000001", "created_at": "2026-07-29T00:00:00Z"}],
        "approval_requests": [],
    }


def run_self_test() -> dict[str, Any]:
    timestamp = datetime(2026, 7, 29, tzinfo=timezone.utc)
    package = build_package(
        workspace_id="sample-workspace",
        schema_version=EXPECTED_SCHEMA_VERSION,
        sections=_fixture_sections("sample-workspace"),
        exported_at=timestamp,
    )
    verification = verify_package(package)
    tampered = json.loads(json.dumps(package))
    tampered["sections"]["workspace_state"][0]["version"] = 3
    try:
        verify_package(tampered)
    except RecoveryError as exc:
        if str(exc) not in {"workspace_recovery_section_digest_invalid", "workspace_recovery_integrity_invalid"}:
            raise
    else:
        _fail("workspace_recovery_tamper_test_failed")
    plan = build_restore_plan(package, destination_workspace="recovered-workspace")
    if plan["write_performed"] is not False:
        _fail("workspace_recovery_restore_plan_wrote_data")
    return {
        "contract": CONTRACT,
        "self_test": "passed",
        "counts": verification["counts"],
        "tamper_rejected": True,
        "restore_plan_read_only": True,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export or verify a SuperMega workspace recovery package.")
    parser.add_argument("--self-test", action="store_true")
    subparsers = parser.add_subparsers(dest="command")
    export_parser = subparsers.add_parser("export", help="Read one workspace and create a protected JSON package.")
    export_parser.add_argument("--workspace", required=True)
    export_parser.add_argument("--confirm-workspace", required=True)
    export_parser.add_argument("--out", required=True)
    export_parser.add_argument("--env-key", default=DEFAULT_ENV_KEY)
    export_parser.add_argument("--max-rows-per-section", type=int, default=DEFAULT_MAX_ROWS_PER_SECTION)
    verify_parser = subparsers.add_parser("verify", help="Verify an existing package without a database connection.")
    verify_parser.add_argument("package")
    plan_parser = subparsers.add_parser("plan-restore", help="Create a read-only restore plan; never writes data.")
    plan_parser.add_argument("package")
    plan_parser.add_argument("--destination-workspace", required=True)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        args = parse_args(argv)
        if args.self_test:
            result = run_self_test()
        elif args.command == "export":
            workspace_id = _validate_workspace_id(args.workspace)
            if args.confirm_workspace != workspace_id:
                _fail("workspace_recovery_confirmation_mismatch")
            if not re.fullmatch(r"[A-Z][A-Z0-9_]{2,79}", args.env_key or ""):
                _fail("workspace_recovery_env_key_invalid")
            package = export_workspace(
                database_url=os.environ.get(args.env_key, ""),
                workspace_id=workspace_id,
                max_rows_per_section=args.max_rows_per_section,
            )
            destination = write_package(args.out, package)
            result = {
                "contract": CONTRACT,
                "export": "created",
                "workspace_id": workspace_id,
                "output": str(destination),
                "counts": package["counts"],
                "integrity_sha256": package["integrity_sha256"],
                "database_url_exposed": False,
            }
        elif args.command == "verify":
            result = verify_package(read_package(args.package))
        elif args.command == "plan-restore":
            result = build_restore_plan(
                read_package(args.package),
                destination_workspace=args.destination_workspace,
            )
        else:
            _fail("workspace_recovery_command_required")
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except RecoveryError as exc:
        print(json.dumps({"contract": CONTRACT, "ok": False, "error": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
