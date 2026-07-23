#!/usr/bin/env python3
"""Run the private-trial backend on a disposable, loopback-only PostgreSQL 17.

The rehearsal never accepts credentials as command-line arguments. It creates
ephemeral administrator and runtime secrets in memory, applies the committed
migrations, runs the production read-only validator, exercises the critical RLS
behaviour, proves dump/restore recovery, and removes the temporary cluster.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_DIRECTORY = ROOT / "supabase" / "migrations"
MIGRATIONS = (
    "20260722004500_private_trial_backend_role_preflight.sql",
    "20260722005134_private_trial_backend_foundation.sql",
    "20260722142801_private_trial_backend_v2.sql",
    "20260723094500_private_trial_backend_v3_website.sql",
    "20260723144500_private_trial_backend_v4_hardening.sql",
)
VALIDATOR = ROOT / "tools" / "validate_supermega_database_url.py"
CONTRACT = "supermega_postgres17_rehearsal_v1"
RUNTIME_ROLE = "supermega_trial_login"
DATABASE_NAME = "supermega_rehearsal"
RESTORE_DATABASE_NAME = "supermega_rehearsal_restore"
EXPECTED_POSTGRES_MAJOR = 17
class RehearsalFailure(RuntimeError):
    """A fail-closed error with a safe, credential-free code."""


def _default_postgres_bin() -> Path:
    if os.name == "nt":
        return (
            Path.home()
            / ".cache"
            / "supermega-postgresql"
            / "17.10-2"
            / "pgsql"
            / "bin"
        )
    return Path("")


def _default_openssl() -> Path:
    candidates = (
        Path(r"C:\Program Files\Git\usr\bin\openssl.exe"),
        Path(r"C:\Program Files\Git\mingw64\bin\openssl.exe"),
    )
    return next((candidate for candidate in candidates if candidate.is_file()), Path("openssl"))


def _resolve_executable(value: Path) -> Path:
    expanded = value.expanduser()
    if expanded.is_absolute() or expanded.parent != Path("."):
        return expanded.resolve()
    located = shutil.which(str(expanded))
    return Path(located).resolve() if located else expanded


def _configured_path(environment_key: str, fallback: Callable[[], Path]) -> Path:
    configured = str(os.getenv(environment_key, "")).strip()
    return Path(configured) if configured else fallback()


def _safe_report(error: str, *, cleanup_complete: bool) -> dict[str, Any]:
    return {
        "ok": False,
        "ready": False,
        "status": "attention",
        "contract": CONTRACT,
        "error": error,
        "cleanup_complete": cleanup_complete,
        "secret_values_exposed": False,
        "production_mutated": False,
        "supabase_mutated": False,
        "vercel_mutated": False,
    }


def _emit(report: dict[str, Any], evidence_file: Path | None) -> None:
    serialized = json.dumps(report, indent=2, sort_keys=True)
    if evidence_file is not None:
        evidence_file.parent.mkdir(parents=True, exist_ok=True)
        evidence_file.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)


def _run(
    command: list[str],
    *,
    environment: dict[str, str],
    timeout: int = 90,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _require_success(
    command: list[str],
    *,
    environment: dict[str, str],
    failure_code: str,
    timeout: int = 90,
) -> subprocess.CompletedProcess[str]:
    result = _run(command, environment=environment, timeout=timeout)
    if result.returncode != 0:
        raise RehearsalFailure(failure_code)
    return result


def _run_without_inheritable_pipes(
    command: list[str],
    *,
    environment: dict[str, str],
    timeout: int,
) -> subprocess.CompletedProcess[str]:
    """Run process managers without pipes their detached children can retain."""

    return subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=timeout,
        check=False,
    )


def _clean_environment(postgres_bin: Path) -> dict[str, str]:
    environment = {
        key: value
        for key, value in os.environ.items()
        if key.upper()
        not in {
            "PGPASSWORD",
            "PGPASSFILE",
            "PGSERVICE",
            "PGSERVICEFILE",
            "SUPERMEGA_DATABASE_URL",
            "SUPERMEGA_DATABASE_URL_TO_ACTIVATE",
            "SUPERMEGA_REHEARSAL_DATABASE_URL",
        }
    }
    environment["PATH"] = str(postgres_bin) + os.pathsep + environment.get("PATH", "")
    environment["PGCONNECT_TIMEOUT"] = "10"
    environment["PGSSLMODE"] = "require"
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    return environment


def _binary(postgres_bin: Path, name: str) -> Path:
    suffix = ".exe" if os.name == "nt" else ""
    path = postgres_bin / f"{name}{suffix}"
    if not path.is_file():
        raise RehearsalFailure(f"postgres_{name}_missing")
    return path


def _postgres_version(postgres: Path, environment: dict[str, str]) -> tuple[str, int]:
    result = _require_success(
        [str(postgres), "--version"],
        environment=environment,
        failure_code="postgres_version_unavailable",
    )
    match = re.search(r"\b(\d+)(?:\.(\d+))?", result.stdout)
    if not match:
        raise RehearsalFailure("postgres_version_unrecognized")
    major = int(match.group(1))
    if major != EXPECTED_POSTGRES_MAJOR:
        raise RehearsalFailure("postgres_major_mismatch")
    return match.group(0), major


def _free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _password() -> str:
    return secrets.token_urlsafe(36)


def _connection_url(user: str, password: str, port: int, database: str) -> str:
    return (
        f"postgresql://{quote(user, safe='')}:{quote(password, safe='')}"
        f"@127.0.0.1:{port}/{quote(database, safe='')}?sslmode=require"
    )


def _connect(database_url: str, *, autocommit: bool = False) -> Any:
    try:
        import psycopg
    except ImportError as exc:
        raise RehearsalFailure("postgres_driver_missing") from exc
    try:
        return psycopg.connect(
            database_url,
            autocommit=autocommit,
            connect_timeout=10,
            prepare_threshold=None,
        )
    except Exception as exc:
        raise RehearsalFailure("postgres_connection_failed") from exc


def _initialize_cluster(
    *,
    postgres_bin: Path,
    openssl: Path,
    data_directory: Path,
    admin_password: str,
    port: int,
    environment: dict[str, str],
) -> None:
    initdb = _binary(postgres_bin, "initdb")
    password_file = data_directory.parent / "admin-password.txt"
    password_file.write_text(admin_password + "\n", encoding="utf-8")
    try:
        _require_success(
            [
                str(initdb),
                "--pgdata",
                str(data_directory),
                "--username",
                "postgres",
                "--encoding",
                "UTF8",
                "--no-locale",
                "--auth-host",
                "scram-sha-256",
                "--auth-local",
                "scram-sha-256",
                "--pwfile",
                str(password_file),
                "--no-instructions",
            ],
            environment=environment,
            failure_code="postgres_init_failed",
            timeout=180,
        )
    finally:
        password_file.unlink(missing_ok=True)

    server_key = data_directory / "server.key"
    server_certificate = data_directory / "server.crt"
    _require_success(
        [
            str(openssl),
            "req",
            "-new",
            "-x509",
            "-nodes",
            "-days",
            "1",
            "-subj",
            "/CN=localhost",
            "-keyout",
            str(server_key),
            "-out",
            str(server_certificate),
        ],
        environment=environment,
        failure_code="postgres_tls_certificate_failed",
    )

    with (data_directory / "postgresql.conf").open("a", encoding="utf-8") as config:
        config.write("\n# SuperMega disposable PostgreSQL 17 rehearsal\n")
        config.write("listen_addresses = '127.0.0.1'\n")
        config.write(f"port = {port}\n")
        config.write("ssl = on\n")
        config.write("ssl_cert_file = 'server.crt'\n")
        config.write("ssl_key_file = 'server.key'\n")
        config.write("password_encryption = 'scram-sha-256'\n")
        config.write("log_connections = off\n")
        config.write("log_disconnections = off\n")

    (data_directory / "pg_hba.conf").write_text(
        "\n".join(
            (
                "# SuperMega disposable rehearsal: TLS over loopback only.",
                "hostssl all all 127.0.0.1/32 scram-sha-256",
                "hostnossl all all 127.0.0.1/32 reject",
                "",
            )
        ),
        encoding="utf-8",
    )


def _start_cluster(
    *,
    postgres_bin: Path,
    data_directory: Path,
    log_file: Path,
    environment: dict[str, str],
) -> None:
    pg_ctl = _binary(postgres_bin, "pg_ctl")
    result = _run_without_inheritable_pipes(
        [
            str(pg_ctl),
            "start",
            "--pgdata",
            str(data_directory),
            "--log",
            str(log_file),
            "--wait",
            "--timeout",
            "60",
        ],
        environment=environment,
        timeout=90,
    )
    if result.returncode != 0:
        raise RehearsalFailure("postgres_start_failed")


def _stop_cluster(
    *,
    postgres_bin: Path,
    data_directory: Path,
    environment: dict[str, str],
) -> bool:
    try:
        pg_ctl = _binary(postgres_bin, "pg_ctl")
        result = _run_without_inheritable_pipes(
            [
                str(pg_ctl),
                "stop",
                "--pgdata",
                str(data_directory),
                "--mode",
                "fast",
                "--wait",
                "--timeout",
                "60",
            ],
            environment=environment,
            timeout=90,
        )
        return result.returncode in {0, 3}
    except Exception:
        return False


def _create_database_and_roles(admin_url: str, database_name: str) -> None:
    with _connect(admin_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(f'create database "{database_name}"')
            for role in ("anon", "authenticated", "service_role"):
                cursor.execute(f'create role "{role}" nologin')


def _apply_migrations(
    *,
    postgres_bin: Path,
    admin_password: str,
    admin_database_url: str,
    port: int,
    environment: dict[str, str],
) -> None:
    psql = _binary(postgres_bin, "psql")
    migration_environment = dict(environment)
    migration_environment["PGPASSWORD"] = admin_password
    for position, migration in enumerate(MIGRATIONS):
        migration_path = MIGRATION_DIRECTORY / migration
        if not migration_path.is_file():
            raise RehearsalFailure("migration_inventory_incomplete")
        _require_success(
            [
                str(psql),
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--username",
                "postgres",
                "--dbname",
                DATABASE_NAME,
                "--no-password",
                "--set",
                "ON_ERROR_STOP=1",
                "--file",
                str(migration_path),
            ],
            environment=migration_environment,
            failure_code="migration_application_failed",
            timeout=120,
        )
        if position == 1:
            _seed_v1_upgrade_data(admin_database_url)


def _seed_v1_upgrade_data(admin_database_url: str) -> None:
    """Seed representative historical rows between foundation and v2."""

    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into app_private.workspace_memberships
                  (workspace_id, actor_id, status, capabilities)
                values
                  ('legacy-workspace', 'legacy-actor', 'active',
                   array['shop.write']::text[])
                """
            )
            cursor.execute(
                """
                insert into app_private.workspace_state
                  (workspace_id, surface, version, state_json, updated_by)
                values
                  ('legacy-workspace', 'shop', 1,
                   '{"orders": "historical"}'::jsonb, 'legacy-actor')
                """
            )
            cursor.execute(
                """
                insert into app_private.workspace_events (
                  event_id, workspace_id, command_id, command_fingerprint,
                  surface, event_type, actor_id, payload_json, result_json
                ) values (
                  '10000000-0000-4000-8000-000000000001'::uuid,
                  'legacy-workspace',
                  '10000000-0000-4000-8000-000000000002'::uuid,
                  repeat('c', 64),
                  'shop',
                  'order.legacy',
                  'legacy-actor',
                  '{}'::jsonb,
                  '{"preserved": true}'::jsonb
                )
                """
            )
            cursor.execute(
                """
                insert into app_private.approval_requests (
                  approval_id, workspace_id, command_id, command_fingerprint,
                  title, proposal_json, evidence_refs_json, requested_by
                ) values (
                  '10000000-0000-4000-8000-000000000003'::uuid,
                  'legacy-workspace',
                  '10000000-0000-4000-8000-000000000004'::uuid,
                  repeat('d', 64),
                  'Historical approval',
                  '{}'::jsonb,
                  '[]'::jsonb,
                  'legacy-actor'
                )
                """
            )


def _provision_runtime(admin_database_url: str, runtime_password: str) -> None:
    try:
        from psycopg import sql
    except ImportError as exc:
        raise RehearsalFailure("postgres_driver_missing") from exc
    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                sql.SQL(
                    "create role {} login inherit nosuperuser nocreatedb "
                    "nocreaterole noreplication nobypassrls password {}"
                ).format(sql.Identifier(RUNTIME_ROLE), sql.Literal(runtime_password))
            )
            cursor.execute(
                sql.SQL(
                    "grant supermega_trial_backend to {} "
                    "with inherit true, set false"
                ).format(sql.Identifier(RUNTIME_ROLE))
            )


def _create_backend_group_for_restore(admin_database_url: str) -> None:
    with _connect(admin_database_url, autocommit=True) as connection:
        connection.execute(
            """
            create role supermega_trial_backend
              nologin
              inherit
              nosuperuser
              nocreatedb
              nocreaterole
              noreplication
              nobypassrls
            """
        )


def _seed_rehearsal_data(admin_database_url: str) -> None:
    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into app_private.workspace_memberships
                  (workspace_id, actor_id, status, capabilities, actor_kind)
                values
                  ('rehearsal-a', 'owner-a', 'active',
                   array['commerce.write']::text[], 'human'),
                  ('rehearsal-b', 'owner-b', 'active',
                   array['production.write']::text[], 'human')
                """
            )
            cursor.execute(
                """
                insert into app_private.workspace_state
                  (workspace_id, surface, version, state_json, updated_by)
                values
                  ('rehearsal-b', 'production', 1, '{"jobs": 1}'::jsonb, 'owner-b')
                """
            )


def _set_identity(
    cursor: Any,
    workspace: str = "rehearsal-a",
    actor: str = "owner-a",
    actor_kind: str = "human",
) -> None:
    cursor.execute("select set_config('app.workspace_id', %s, true)", (workspace,))
    cursor.execute("select set_config('app.actor_id', %s, true)", (actor,))
    cursor.execute("select set_config('app.actor_kind', %s, true)", (actor_kind,))


def _expect_database_rejection(operation: Callable[[], None], code: str) -> None:
    try:
        operation()
    except Exception as exc:
        if str(getattr(exc, "sqlstate", "")) in {"23514", "40001", "42501", "55000"}:
            return
        raise RehearsalFailure(f"{code}_unexpected_error") from exc
    raise RehearsalFailure(code)


def _verify_upgrade_and_role_boundaries(
    runtime_database_url: str,
    admin_database_url: str,
) -> dict[str, bool]:
    checks = {
        "v1_upgrade_preserved": False,
        "legacy_actor_denied": False,
        "identity_transaction_local": False,
        "mismatched_identity_denied": False,
        "runtime_role_settings_empty": False,
        "runtime_set_role_denied": False,
        "browser_role_isolation": False,
        "invalid_initial_version_denied": False,
    }
    with _connect(admin_database_url, autocommit=True) as administrator:
        with administrator.cursor() as cursor:
            cursor.execute(
                """
                select actor_kind, capabilities
                from app_private.workspace_memberships
                where workspace_id = 'legacy-workspace'
                  and actor_id = 'legacy-actor'
                """
            )
            membership = cursor.fetchone()
            cursor.execute(
                """
                select surface
                from app_private.workspace_state
                where workspace_id = 'legacy-workspace'
                """
            )
            state = cursor.fetchone()
            cursor.execute(
                """
                select surface, actor_kind
                from app_private.workspace_events
                where workspace_id = 'legacy-workspace'
                """
            )
            event = cursor.fetchone()
            cursor.execute(
                """
                select requested_actor_kind, decision_contract_version
                from app_private.approval_requests
                where workspace_id = 'legacy-workspace'
                """
            )
            approval = cursor.fetchone()
            if (
                membership is None
                or membership[0] != "legacy"
                or list(membership[1]) != ["commerce.write"]
                or state != ("commerce",)
                or event != ("commerce", "legacy")
                or approval != ("legacy", 1)
            ):
                raise RehearsalFailure("v1_upgrade_data_mismatch")
            checks["v1_upgrade_preserved"] = True

            cursor.execute(
                """
                select count(*)
                from pg_db_role_setting setting
                join pg_roles role_record on role_record.oid = setting.setrole
                where role_record.rolname in (
                  'supermega_trial_backend',
                  'supermega_trial_login'
                )
                """
            )
            if int(cursor.fetchone()[0]) != 0:
                raise RehearsalFailure("runtime_role_setting_detected")
            checks["runtime_role_settings_empty"] = True

    with _connect(runtime_database_url) as runtime:
        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(
                    cursor,
                    workspace="legacy-workspace",
                    actor="legacy-actor",
                    actor_kind="legacy",
                )
                cursor.execute("select count(*) from app_private.workspace_memberships")
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("legacy_actor_authorized")
                checks["legacy_actor_denied"] = True

        with runtime.transaction():
            with runtime.cursor() as cursor:
                cursor.execute("select count(*) from app_private.workspace_memberships")
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("absent_identity_authorized")
                _set_identity(cursor)

        with runtime.transaction():
            with runtime.cursor() as cursor:
                cursor.execute("select count(*) from app_private.workspace_memberships")
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("identity_leaked_across_transaction")
                checks["identity_transaction_local"] = True

        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor, actor_kind="agent")
                cursor.execute("select count(*) from app_private.workspace_memberships")
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("mismatched_actor_kind_authorized")
                checks["mismatched_identity_denied"] = True

        def set_backend_role() -> None:
            with runtime.transaction():
                runtime.execute("set local role supermega_trial_backend")

        _expect_database_rejection(set_backend_role, "runtime_set_role_accepted")
        checks["runtime_set_role_denied"] = True

    for browser_role in ("anon", "authenticated", "service_role"):
        def read_as_browser(role: str = browser_role) -> None:
            with _connect(admin_database_url) as administrator:
                with administrator.transaction():
                    administrator.execute(f"set local role {role}")
                    administrator.execute(
                        "select count(*) from app_private.workspace_memberships"
                    )

        _expect_database_rejection(
            read_as_browser,
            f"browser_role_{browser_role}_authorized",
        )
    checks["browser_role_isolation"] = True

    def invalid_initial_version() -> None:
        with _connect(admin_database_url) as administrator:
            with administrator.transaction():
                administrator.execute(
                    """
                    insert into app_private.workspace_state
                      (workspace_id, surface, version, state_json, updated_by)
                    values
                      ('rehearsal-a', 'website', 2, '{}'::jsonb, 'owner-a')
                    """
                )

    _expect_database_rejection(
        invalid_initial_version,
        "invalid_initial_version_accepted",
    )
    checks["invalid_initial_version_denied"] = True
    return checks


def _exercise_runtime(
    runtime_database_url: str,
    admin_database_url: str,
) -> dict[str, bool]:
    checks = {
        "tenant_isolation": False,
        "capability_denial": False,
        "optimistic_concurrency": False,
        "event_immutability": False,
        "server_timestamps": False,
        "revocation": False,
    }

    with _connect(runtime_database_url) as runtime:
        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor)
                cursor.execute(
                    "select workspace_id from app_private.workspace_memberships order by workspace_id"
                )
                memberships = [str(row[0]) for row in cursor.fetchall()]
                cursor.execute(
                    "select workspace_id from app_private.workspace_state order by workspace_id"
                )
                visible_state = cursor.fetchall()
                if memberships != ["rehearsal-a"] or visible_state:
                    raise RehearsalFailure("tenant_isolation_failed")
                checks["tenant_isolation"] = True

        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor)
                cursor.execute(
                    """
                    insert into app_private.workspace_state
                      (workspace_id, surface, version, state_json, updated_by)
                    values
                      ('rehearsal-a', 'commerce', 1, '{"orders": 1}'::jsonb, 'owner-a')
                    """
                )

        def unauthorized_surface() -> None:
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(cursor)
                    cursor.execute(
                        """
                        insert into app_private.workspace_state
                          (workspace_id, surface, version, state_json, updated_by)
                        values
                          ('rehearsal-a', 'production', 1, '{}'::jsonb, 'owner-a')
                        """
                    )

        _expect_database_rejection(unauthorized_surface, "capability_denial_failed")
        checks["capability_denial"] = True

        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor)
                cursor.execute(
                    """
                    update app_private.workspace_state
                    set version = 2, state_json = '{"orders": 2}'::jsonb
                    where workspace_id = 'rehearsal-a'
                      and surface = 'commerce'
                      and version = 1
                    returning version
                    """
                )
                if cursor.fetchone() != (2,):
                    raise RehearsalFailure("optimistic_update_failed")

        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor)
                cursor.execute(
                    """
                    update app_private.workspace_state
                    set version = 3, state_json = '{"orders": 3}'::jsonb
                    where workspace_id = 'rehearsal-a'
                      and surface = 'commerce'
                      and version = 1
                    returning version
                    """
                )
                if cursor.fetchone() is not None:
                    raise RehearsalFailure("stale_writer_accepted")
                checks["optimistic_concurrency"] = True

        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor)
                cursor.execute(
                    """
                    insert into app_private.workspace_events (
                      event_id, workspace_id, command_id, command_fingerprint,
                      surface, event_type, actor_id, actor_kind,
                      expected_version, resulting_version, payload_json,
                      result_json, created_at
                    ) values (
                      '00000000-0000-4000-8000-000000000001'::uuid,
                      'rehearsal-a',
                      '00000000-0000-4000-8000-000000000002'::uuid,
                      repeat('a', 64),
                      'commerce',
                      'order.rehearsed',
                      'owner-a',
                      'human',
                      1,
                      2,
                      '{}'::jsonb,
                      '{"ok": true}'::jsonb,
                      '2000-01-01T00:00:00Z'::timestamptz
                    )
                    returning extract(year from created_at)::integer
                    """
                )
                inserted_year = int(cursor.fetchone()[0])
                if inserted_year < 2025:
                    raise RehearsalFailure("server_timestamp_not_applied")
                checks["server_timestamps"] = True

        def mutate_event() -> None:
            with _connect(admin_database_url) as administrator:
                with administrator.transaction():
                    administrator.execute(
                        """
                        update app_private.workspace_events
                        set result_json = '{"tampered": true}'::jsonb
                        where event_id = '00000000-0000-4000-8000-000000000001'::uuid
                        """
                    )

        _expect_database_rejection(mutate_event, "immutable_event_update_accepted")

        def delete_event() -> None:
            with _connect(admin_database_url) as administrator:
                with administrator.transaction():
                    administrator.execute(
                        """
                        delete from app_private.workspace_events
                        where event_id = '00000000-0000-4000-8000-000000000001'::uuid
                        """
                    )

        _expect_database_rejection(delete_event, "immutable_event_delete_accepted")
        checks["event_immutability"] = True

    with _connect(admin_database_url, autocommit=True) as administrator:
        administrator.execute(
            """
            update app_private.workspace_memberships
            set status = 'revoked', updated_at = transaction_timestamp()
            where workspace_id = 'rehearsal-a' and actor_id = 'owner-a'
            """
        )

    with _connect(runtime_database_url) as runtime:
        with runtime.transaction():
            with runtime.cursor() as cursor:
                _set_identity(cursor)
                cursor.execute(
                    "select count(*) from app_private.workspace_state where workspace_id = 'rehearsal-a'"
                )
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("revoked_actor_retained_read_access")

        def revoked_write() -> None:
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(cursor)
                    cursor.execute(
                        """
                        insert into app_private.workspace_events (
                          event_id, workspace_id, command_id, command_fingerprint,
                          surface, event_type, actor_id, actor_kind,
                          payload_json, result_json
                        ) values (
                          '00000000-0000-4000-8000-000000000003'::uuid,
                          'rehearsal-a',
                          '00000000-0000-4000-8000-000000000004'::uuid,
                          repeat('b', 64),
                          'commerce',
                          'order.after-revocation',
                          'owner-a',
                          'human',
                          '{}'::jsonb,
                          '{}'::jsonb
                        )
                        """
                    )

        _expect_database_rejection(revoked_write, "revoked_actor_retained_write_access")
        checks["revocation"] = True

    return checks


def _run_validator(runtime_database_url: str, environment: dict[str, str]) -> dict[str, Any]:
    validator_environment = dict(environment)
    validator_environment["SUPERMEGA_REHEARSAL_DATABASE_URL"] = runtime_database_url
    result = _run(
        [
            sys.executable,
            str(VALIDATOR),
            "--env-key",
            "SUPERMEGA_REHEARSAL_DATABASE_URL",
            "--ensure-schema",
            "--require-ready",
        ],
        environment=validator_environment,
        timeout=90,
    )
    if result.returncode != 0:
        raise RehearsalFailure("database_validator_failed")
    try:
        payload = json.loads(result.stdout.strip().splitlines()[-1])
    except (IndexError, json.JSONDecodeError) as exc:
        raise RehearsalFailure("database_validator_output_invalid") from exc
    if payload.get("ok") is not True or payload.get("ready") is not True:
        raise RehearsalFailure("database_validator_not_ready")
    return payload


def _backup_database(
    *,
    postgres_bin: Path,
    admin_password: str,
    port: int,
    backup_file: Path,
    environment: dict[str, str],
) -> None:
    pg_dump = _binary(postgres_bin, "pg_dump")
    backup_environment = dict(environment)
    backup_environment["PGPASSWORD"] = admin_password
    _require_success(
        [
            str(pg_dump),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--username",
            "postgres",
            "--dbname",
            DATABASE_NAME,
            "--no-password",
            "--format",
            "custom",
            "--file",
            str(backup_file),
        ],
        environment=backup_environment,
        failure_code="database_backup_failed",
        timeout=120,
    )
    if not backup_file.is_file() or backup_file.stat().st_size == 0:
        raise RehearsalFailure("database_backup_empty")



def _restore_database(
    *,
    postgres_bin: Path,
    admin_password: str,
    port: int,
    backup_file: Path,
    environment: dict[str, str],
) -> None:
    pg_restore = _binary(postgres_bin, "pg_restore")
    backup_environment = dict(environment)
    backup_environment["PGPASSWORD"] = admin_password
    _require_success(
        [
            str(pg_restore),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--username",
            "postgres",
            "--dbname",
            RESTORE_DATABASE_NAME,
            "--no-password",
            "--exit-on-error",
            str(backup_file),
        ],
        environment=backup_environment,
        failure_code="database_restore_failed",
        timeout=120,
    )


def _verify_restored_data(admin_database_url: str) -> None:
    with _connect(admin_database_url, autocommit=True) as administrator:
        row = administrator.execute(
            """
            select
              (select schema_version
               from app_private.trial_schema_meta
               where component = 'private_trial_backend'),
              (select count(*) from app_private.workspace_memberships),
              (select count(*) from app_private.workspace_state),
              (select count(*) from app_private.workspace_events),
              (select count(*) from app_private.approval_requests)
            """
        ).fetchone()
    if row != (4, 3, 3, 2, 1):
        raise RehearsalFailure("restored_data_mismatch")


def _preflight(postgres_bin: Path, openssl: Path) -> dict[str, Any]:
    environment = _clean_environment(postgres_bin)
    required = ("postgres", "initdb", "pg_ctl", "psql", "pg_dump", "pg_restore")
    available = all(
        (postgres_bin / f"{name}{'.exe' if os.name == 'nt' else ''}").is_file()
        for name in required
    ) and (openssl.is_file() or shutil.which(str(openssl)) is not None)
    if not available:
        return _safe_report("postgres17_tooling_missing", cleanup_complete=True)
    try:
        version, major = _postgres_version(_binary(postgres_bin, "postgres"), environment)
    except RehearsalFailure as exc:
        return _safe_report(str(exc), cleanup_complete=True)
    return {
        "ok": True,
        "ready": False,
        "status": "available",
        "contract": CONTRACT,
        "engine": {"major": major, "version": version},
        "loopback_only": True,
        "secret_values_exposed": False,
        "production_mutated": False,
        "supabase_mutated": False,
        "vercel_mutated": False,
    }


def _run_rehearsal(
    postgres_bin: Path,
    openssl: Path,
    evidence_file: Path | None,
) -> int:
    environment = _clean_environment(postgres_bin)
    preflight = _preflight(postgres_bin, openssl)
    if preflight.get("ok") is not True:
        _emit(preflight, evidence_file)
        return 2

    admin_password = _password()
    runtime_password = _password()
    cleanup_complete = False
    started = False
    phase = "workspace_initialization"
    report: dict[str, Any] | None = None

    with tempfile.TemporaryDirectory(prefix="supermega-pg17-") as temporary:
        workspace = Path(temporary)
        primary_data_directory = workspace / "primary-data"
        restore_data_directory = workspace / "restore-data"
        active_data_directory: Path | None = None
        primary_log_file = workspace / "primary-postgres.log"
        restore_log_file = workspace / "restore-postgres.log"
        backup_file = workspace / "rehearsal.dump"
        port = _free_loopback_port()
        try:
            phase = "cluster_initialization"
            _initialize_cluster(
                postgres_bin=postgres_bin,
                openssl=openssl,
                data_directory=primary_data_directory,
                admin_password=admin_password,
                port=port,
                environment=environment,
            )
            phase = "cluster_start"
            _start_cluster(
                postgres_bin=postgres_bin,
                data_directory=primary_data_directory,
                log_file=primary_log_file,
                environment=environment,
            )
            started = True
            active_data_directory = primary_data_directory

            admin_root_url = _connection_url("postgres", admin_password, port, "postgres")
            admin_database_url = _connection_url(
                "postgres",
                admin_password,
                port,
                DATABASE_NAME,
            )
            runtime_database_url = _connection_url(
                RUNTIME_ROLE,
                runtime_password,
                port,
                DATABASE_NAME,
            )

            phase = "database_bootstrap"
            _create_database_and_roles(admin_root_url, DATABASE_NAME)
            phase = "migration_application"
            _apply_migrations(
                postgres_bin=postgres_bin,
                admin_password=admin_password,
                admin_database_url=admin_database_url,
                port=port,
                environment=environment,
            )
            phase = "runtime_provisioning"
            _provision_runtime(admin_database_url, runtime_password)
            phase = "runtime_seed"
            _seed_rehearsal_data(admin_database_url)
            phase = "database_validation"
            primary_validation = _run_validator(runtime_database_url, environment)
            phase = "upgrade_and_role_boundaries"
            boundaries = _verify_upgrade_and_role_boundaries(
                runtime_database_url,
                admin_database_url,
            )
            phase = "runtime_behaviour"
            behaviour = _exercise_runtime(runtime_database_url, admin_database_url)
            phase = "database_backup"
            _backup_database(
                postgres_bin=postgres_bin,
                admin_password=admin_password,
                port=port,
                backup_file=backup_file,
                environment=environment,
            )
            phase = "primary_cluster_stop"
            if not _stop_cluster(
                postgres_bin=postgres_bin,
                data_directory=primary_data_directory,
                environment=environment,
            ):
                raise RehearsalFailure("primary_cluster_stop_failed")
            started = False
            active_data_directory = None

            restore_port = _free_loopback_port()
            phase = "restore_cluster_initialization"
            _initialize_cluster(
                postgres_bin=postgres_bin,
                openssl=openssl,
                data_directory=restore_data_directory,
                admin_password=admin_password,
                port=restore_port,
                environment=environment,
            )
            phase = "restore_cluster_start"
            _start_cluster(
                postgres_bin=postgres_bin,
                data_directory=restore_data_directory,
                log_file=restore_log_file,
                environment=environment,
            )
            started = True
            active_data_directory = restore_data_directory

            restore_admin_root_url = _connection_url(
                "postgres",
                admin_password,
                restore_port,
                "postgres",
            )
            restore_admin_database_url = _connection_url(
                "postgres",
                admin_password,
                restore_port,
                RESTORE_DATABASE_NAME,
            )
            restored_runtime_url = _connection_url(
                RUNTIME_ROLE,
                runtime_password,
                restore_port,
                RESTORE_DATABASE_NAME,
            )
            phase = "restore_database_bootstrap"
            _create_database_and_roles(
                restore_admin_root_url,
                RESTORE_DATABASE_NAME,
            )
            _create_backend_group_for_restore(restore_admin_database_url)
            _provision_runtime(restore_admin_database_url, runtime_password)
            phase = "database_restore"
            _restore_database(
                postgres_bin=postgres_bin,
                admin_password=admin_password,
                port=restore_port,
                backup_file=backup_file,
                environment=environment,
            )
            phase = "restored_database_validation"
            restored_validation = _run_validator(restored_runtime_url, environment)
            _verify_restored_data(restore_admin_database_url)

            version = str(preflight["engine"]["version"])
            major = int(preflight["engine"]["major"])
            report = {
                "ok": True,
                "ready": True,
                "status": "rehearsed",
                "contract": CONTRACT,
                "engine": {
                    "major": major,
                    "version": version,
                    "tls_active": True,
                    "loopback_only": True,
                },
                "migrations": {
                    "count": len(MIGRATIONS),
                    "schema_version": 4,
                    "production_validator_ready": primary_validation.get("ready") is True,
                },
                "checks": {
                    "migration_chain_applied": True,
                    "dedicated_runtime_role_validated": True,
                    **boundaries,
                    **behaviour,
                    "backup_created": True,
                    "restore_completed": True,
                    "restored_database_validated": restored_validation.get("ready") is True,
                    "restored_data_preserved": True,
                },
                "recovery": {
                    "format": "pg_dump_custom",
                    "backup_nonempty": True,
                    "restored_schema_version": 4,
                },
                "cleanup_complete": False,
                "secret_values_exposed": False,
                "production_mutated": False,
                "supabase_mutated": False,
                "vercel_mutated": False,
            }
        except RehearsalFailure as exc:
            report = _safe_report(str(exc), cleanup_complete=False)
        except Exception:
            report = _safe_report(f"{phase}_failed", cleanup_complete=False)
        finally:
            if started:
                cleanup_complete = _stop_cluster(
                    postgres_bin=postgres_bin,
                    data_directory=active_data_directory or restore_data_directory,
                    environment=environment,
                )
            else:
                cleanup_complete = True
            admin_password = ""
            runtime_password = ""
            if report is not None:
                report["cleanup_complete"] = cleanup_complete

    assert report is not None
    if not cleanup_complete and report.get("ok") is True:
        report = _safe_report("cluster_cleanup_failed", cleanup_complete=False)
    _emit(report, evidence_file)
    return 0 if report.get("ok") is True else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Rehearse SuperMega migrations on a disposable, TLS-enabled "
            "PostgreSQL 17 cluster bound to 127.0.0.1."
        )
    )
    parser.add_argument(
        "--postgres-bin",
        type=Path,
        default=_configured_path("SUPERMEGA_POSTGRES17_BIN", _default_postgres_bin),
        help="Directory containing PostgreSQL 17 executables; never a database URL.",
    )
    parser.add_argument(
        "--openssl",
        type=Path,
        default=_configured_path("SUPERMEGA_OPENSSL", _default_openssl),
        help="OpenSSL executable used only for the disposable loopback certificate.",
    )
    parser.add_argument(
        "--evidence-file",
        type=Path,
        help="Optional path for the sanitized JSON report.",
    )
    parser.add_argument(
        "--preflight",
        action="store_true",
        help="Verify local PostgreSQL 17 tooling without starting a server.",
    )
    args = parser.parse_args(argv)

    postgres_bin = args.postgres_bin.expanduser().resolve()
    openssl = _resolve_executable(args.openssl)
    if args.preflight:
        report = _preflight(postgres_bin, openssl)
        _emit(report, args.evidence_file)
        return 0 if report.get("ok") is True else 1
    return _run_rehearsal(postgres_bin, openssl, args.evidence_file)


if __name__ == "__main__":
    raise SystemExit(main())
