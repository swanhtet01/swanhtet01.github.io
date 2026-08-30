#!/usr/bin/env python3
"""Run the private-trial backend on a disposable, loopback-only PostgreSQL 17.

The rehearsal never accepts credentials as command-line arguments. It creates
ephemeral administrator and runtime secrets in memory, applies the committed
migrations, runs the production read-only validator, exercises the critical RLS
behaviour, proves dump/restore recovery, and removes the temporary cluster.
"""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import hmac
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
MIGRATION_DIRECTORY = ROOT / "supabase" / "migrations"
PUBLIC_BROWSER_QUARANTINE = (
    ROOT / "supabase" / "rehearsal" / "20260804_public_browser_quarantine.sql"
)
MIGRATIONS = (
    "20260722004500_private_trial_backend_role_preflight.sql",
    "20260722005134_private_trial_backend_foundation.sql",
    "20260722142801_private_trial_backend_v2.sql",
    "20260723094500_private_trial_backend_v3_website.sql",
    "20260723144500_private_trial_backend_v4_hardening.sql",
    "20260724204920_private_trial_backend_v5_read_capabilities.sql",
    "20260730113000_private_trial_backend_v6_managed_activation.sql",
    "20260730123000_private_trial_backend_v7_workspace_discovery.sql",
    "20260802161500_private_trial_backend_v8_rls_initplan.sql",
    "20260803063822_private_trial_backend_v9_metadata_rls.sql",
    "20260804102000_private_trial_backend_v10_supabase_session_revocation.sql",
    "20260816120000_private_trial_backend_v11_self_serve_grants.sql",
)
VALIDATOR = ROOT / "tools" / "validate_supermega_database_url.py"
CONTRACT = "supermega_postgres17_rehearsal_v1"
RUNTIME_ROLE = "supermega_trial_login"
DATABASE_NAME = "supermega_rehearsal"
RESTORE_DATABASE_NAME = "supermega_rehearsal_restore"
EXPECTED_POSTGRES_MAJOR = 17
WINDOWS_DIRECT_START_MODE = "codex-sandbox-direct"
PUBLIC_BROWSER_TABLES = (
    "assets",
    "enterprise_agent_runs",
    "enterprise_audit_events",
    "enterprise_connector_events",
    "enterprise_knowledge_chunks",
    "enterprise_knowledge_embeddings",
    "enterprise_lead_activities",
    "enterprise_lead_hunt_profiles",
    "enterprise_leads",
    "enterprise_memberships",
    "enterprise_metric_records",
    "enterprise_module_definitions",
    "enterprise_sessions",
    "enterprise_source_change_events",
    "enterprise_source_records",
    "enterprise_users",
    "enterprise_workspace_domains",
    "enterprise_workspace_modules",
    "enterprise_workspace_profiles",
    "enterprise_workspace_tasks",
    "enterprise_workspaces",
    "iot_telemetry",
    "production_ledger",
    "supermega_campaign_clicks",
    "supermega_leads",
    "supermega_sales_runs",
    "wcm_incidents",
)
PUBLIC_BROWSER_SEQUENCES = (
    "supermega_leads_id_seq",
    "supermega_sales_runs_id_seq",
)
IMPLEMENTATION_PATHS = (
    "supermega_runtime/managed_context.py",
    "supermega_runtime/managed_activation.py",
    "supermega_runtime/runtime.py",
    "supermega_runtime/trial_runtime.py",
    "supermega_runtime/trial_store.py",
    "supabase/migrations/20260730113000_private_trial_backend_v6_managed_activation.sql",
    "supabase/migrations/20260730123000_private_trial_backend_v7_workspace_discovery.sql",
    "supabase/migrations/20260802161500_private_trial_backend_v8_rls_initplan.sql",
    "supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql",
    "supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql",
    "supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql",
    "supabase/rehearsal/20260804_public_browser_quarantine.sql",
    "tools/activate_supermega_database.ps1",
    "tools/rehearse_supermega_postgres17.py",
    "tools/validate_supermega_database_url.py",
    "tools/verify_public_browser_quarantine.mjs",
    "tools/verify_managed_runtime_environment_values.mjs",
)
JOURNEY_PRODUCT_WORKSPACE = "rehearsal-product"
JOURNEY_PRODUCT_ACTOR = "owner-product"
JOURNEY_PRODUCTION_WORKSPACE = "rehearsal-b"
JOURNEY_PRODUCTION_ACTOR = "owner-b"
APPROVAL_WORKSPACE = "rehearsal-approval"
APPROVAL_AGENT_ACTOR = "approval-agent"
APPROVAL_SERVICE_ACTOR = "approval-service"
APPROVAL_HUMAN_ACTOR = "approval-owner"
APPROVAL_IDENTITY_AUTHORITY = "trusted_backend_transaction_context"
MANAGED_WORKSPACE = "rehearsal-managed"
MANAGED_OWNER_ACTOR = "c63af44e-b7c1-4dbf-970d-389d5bba93a7"
MANAGED_OWNER_SESSION = "1ed07925-e474-42e3-82f1-4387f1ae63f9"
MANAGED_SECOND_ACTOR = "f3ea98a2-9954-413c-ad4d-c6dc7ce8a23c"
MANAGED_SECOND_SESSION = "d8aaab28-a5a7-4a0d-9d75-7a6265a969c3"
MANAGED_APPROVAL_ID = "7f201a3b-d6d9-4c1a-b6c6-3d0d1e123731"
DATABASE_REJECTION_SQLSTATES = frozenset({"23514", "40001", "42501", "55000"})


class RehearsalFailure(RuntimeError):
    """A fail-closed error with a safe, credential-free code."""


def _implementation_digest() -> str:
    digest = sha256()
    for relative_path in IMPLEMENTATION_PATHS:
        digest.update(relative_path.encode("utf-8"))
        digest.update(b"\0")
        digest.update((ROOT / relative_path).read_bytes().replace(b"\r\n", b"\n"))
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


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
            "SUPERMEGA_STORAGE_AUDIT_DATABASE_URL",
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
    port: int,
    environment: dict[str, str],
) -> None:
    if (
        os.name == "nt"
        and environment.get("SUPERMEGA_POSTGRES17_WINDOWS_START_MODE")
        == WINDOWS_DIRECT_START_MODE
    ):
        postgres = _binary(postgres_bin, "postgres")
        pg_isready = _binary(postgres_bin, "pg_isready")
        with log_file.open("ab", buffering=0) as output:
            process = subprocess.Popen(
                [str(postgres), "-D", str(data_directory)],
                cwd=ROOT,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=output,
                stderr=subprocess.STDOUT,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise RehearsalFailure("postgres_direct_start_failed")
            ready = _run(
                [str(pg_isready), "--host", "127.0.0.1", "--port", str(port), "--timeout", "1"],
                environment=environment,
                timeout=5,
            )
            if ready.returncode == 0:
                return
            time.sleep(0.2)
        process.terminate()
        raise RehearsalFailure("postgres_direct_start_timeout")

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
            for role in ("anon", "authenticated", "supabase_admin"):
                cursor.execute(f'create role "{role}" nologin')
            cursor.execute('create role "service_role" nologin bypassrls')


def _create_auth_session_fixture(admin_database_url: str) -> None:
    """Create the minimum local Auth catalog that Supabase owns when hosted."""

    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("create schema auth authorization postgres")
            cursor.execute(
                "create table auth.sessions (id uuid primary key, user_id uuid not null)"
            )


def _create_public_browser_fixture(admin_database_url: str) -> None:
    """Mirror the reviewed legacy public catalog without copying business rows."""

    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            for owner in ("postgres", "supabase_admin"):
                cursor.execute(
                    f'alter default privileges for role "{owner}" in schema public '
                    "grant all privileges on tables to anon, authenticated, service_role"
                )
                cursor.execute(
                    f'alter default privileges for role "{owner}" in schema public '
                    "grant all privileges on sequences to anon, authenticated, service_role"
                )
                cursor.execute(
                    f'alter default privileges for role "{owner}" in schema public '
                    "grant execute on functions to anon, authenticated, service_role"
                )
            for table in PUBLIC_BROWSER_TABLES:
                cursor.execute(f'create table public."{table}" (id bigint)')
                cursor.execute(f'alter table public."{table}" enable row level security')
            for sequence in PUBLIC_BROWSER_SEQUENCES:
                cursor.execute(f'create sequence public."{sequence}"')
            cursor.execute(
                "grant all privileges on all tables in schema public "
                "to anon, authenticated, service_role"
            )
            cursor.execute(
                "grant all privileges on all sequences in schema public "
                "to anon, authenticated, service_role"
            )


def _apply_public_browser_quarantine(
    *,
    postgres_bin: Path,
    admin_password: str,
    port: int,
    database_name: str,
    environment: dict[str, str],
) -> None:
    if not PUBLIC_BROWSER_QUARANTINE.is_file():
        raise RehearsalFailure("public_browser_quarantine_missing")
    quarantine_environment = dict(environment)
    quarantine_environment["PGPASSWORD"] = admin_password
    result = _run(
        [
            str(_binary(postgres_bin, "psql")),
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--username",
            "postgres",
            "--dbname",
            database_name,
            "--no-password",
            "--set",
            "ON_ERROR_STOP=1",
            "--file",
            str(PUBLIC_BROWSER_QUARANTINE),
        ],
        environment=quarantine_environment,
        timeout=120,
    )
    if result.returncode != 0:
        raise RehearsalFailure("public_browser_quarantine_application_failed")


def _verify_public_browser_quarantine(admin_database_url: str) -> None:
    table_privileges = (
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
    )
    sequence_privileges = ("USAGE", "SELECT", "UPDATE")
    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            for browser_role in ("anon", "authenticated"):
                for table in PUBLIC_BROWSER_TABLES:
                    for privilege in table_privileges:
                        cursor.execute(
                            "select has_table_privilege(%s, %s, %s)",
                            (browser_role, f"public.{table}", privilege),
                        )
                        if cursor.fetchone()[0] is True:
                            raise RehearsalFailure(
                                "public_browser_quarantine_table_grant_retained"
                            )
                for sequence in PUBLIC_BROWSER_SEQUENCES:
                    for privilege in sequence_privileges:
                        cursor.execute(
                            "select has_sequence_privilege(%s, %s, %s)",
                            (browser_role, f"public.{sequence}", privilege),
                        )
                        if cursor.fetchone()[0] is True:
                            raise RehearsalFailure(
                                "public_browser_quarantine_sequence_grant_retained"
                            )
            for table in PUBLIC_BROWSER_TABLES:
                for privilege in table_privileges:
                    cursor.execute(
                        "select has_table_privilege('service_role', %s, %s)",
                        (f"public.{table}", privilege),
                    )
                    if cursor.fetchone()[0] is not True:
                        raise RehearsalFailure(
                            "public_browser_quarantine_service_table_grant_changed"
                        )
            for sequence in PUBLIC_BROWSER_SEQUENCES:
                for privilege in sequence_privileges:
                    cursor.execute(
                        "select has_sequence_privilege('service_role', %s, %s)",
                        (f"public.{sequence}", privilege),
                    )
                    if cursor.fetchone()[0] is not True:
                        raise RehearsalFailure(
                            "public_browser_quarantine_service_sequence_grant_changed"
                        )
            cursor.execute(
                """
                select count(*)
                from pg_default_acl default_acl
                join pg_roles owner_role on owner_role.oid = default_acl.defaclrole
                join pg_namespace schema_record
                  on schema_record.oid = default_acl.defaclnamespace
                cross join lateral aclexplode(default_acl.defaclacl) privilege_record
                left join pg_roles grantee_role
                  on grantee_role.oid = privilege_record.grantee
                where owner_role.rolname in ('postgres', 'supabase_admin')
                  and schema_record.nspname = 'public'
                  and default_acl.defaclobjtype in ('r', 'S', 'f')
                  and (
                    privilege_record.grantee = 0
                    or grantee_role.rolname in ('anon', 'authenticated')
                  )
                """
            )
            if cursor.fetchone()[0] != 0:
                raise RehearsalFailure(
                    "public_browser_quarantine_default_grant_retained"
                )


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
        result = _run(
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
            timeout=120,
        )
        if result.returncode != 0:
            error_match = re.search(r"ERROR:\s*([^\r\n]+)", result.stderr or "")
            detail = re.sub(
                r"[^a-z0-9]+",
                "_",
                str(error_match.group(1) if error_match else "postgres_error").casefold(),
            ).strip("_")[:120]
            raise RehearsalFailure(
                f"migration_application_failed_{migration_path.stem}_{detail}"
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


def _bootstrap_local_storage_catalog_fixture(admin_database_url: str) -> None:
    """Create only the Storage metadata needed for a local validator rehearsal.

    This is not hosted Supabase Storage proof. It lets the real PostgreSQL 17
    rehearsal verify that the production validator rejects public buckets,
    missing RLS, and unexpected policies while keeping the fixture private.
    """

    with _connect(admin_database_url, autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("create schema storage authorization postgres")
            cursor.execute(
                """
                create table storage.buckets (
                  id text primary key,
                  public boolean not null default false
                )
                """
            )
            cursor.execute(
                """
                create table storage.objects (
                  id uuid primary key
                )
                """
            )
            cursor.execute("alter table storage.buckets enable row level security")
            cursor.execute("alter table storage.objects enable row level security")
            cursor.execute(
                """
                insert into storage.buckets (id, public)
                values ('supermega-private-trial', false)
                """
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
                insert into app_private.workspace_access_controls (
                  workspace_id, activation_id, authorization_id,
                  authorization_contract, plan_digest, owner_actor_id,
                  project_ref, release_commit, status
                )
                select
                  workspace_id,
                  md5('rehearsal-activation:' || workspace_id)::uuid,
                  md5('rehearsal-authorization:' || workspace_id)::uuid,
                  'legacy_migration_v1',
                  md5('rehearsal-plan-a:' || workspace_id)
                    || md5('rehearsal-plan-b:' || workspace_id),
                  owner_actor_id,
                  repeat('0', 20),
                  repeat('0', 40),
                  'active'
                from (values
                  ('rehearsal-a', 'owner-a'),
                  ('rehearsal-b', 'owner-b'),
                  ('rehearsal-product', 'owner-product'),
                  ('rehearsal-approval', 'approval-owner')
                ) as fixture(workspace_id, owner_actor_id)
                """
            )
            cursor.execute(
                """
                insert into app_private.workspace_memberships
                  (workspace_id, actor_id, status, capabilities, actor_kind)
                values
                  ('rehearsal-a', 'owner-a', 'active',
                    array['company.read', 'commerce.write']::text[], 'human'),
                  ('rehearsal-a', 'approval-reader', 'active',
                    array['approvals.read']::text[], 'human'),
                  ('rehearsal-a', 'website-reader', 'active',
                    array['website.read']::text[], 'human'),
                  ('rehearsal-b', 'owner-b', 'active',
                   array['company.read', 'production.write']::text[], 'human'),
                  ('rehearsal-product', 'owner-product', 'active',
                    array['company.read', 'commerce.write', 'website.write']::text[], 'human'),
                  ('rehearsal-approval', 'approval-agent', 'active',
                    array['approvals.request']::text[], 'agent'),
                  ('rehearsal-approval', 'approval-service', 'active',
                   array['approvals.decide']::text[], 'service'),
                  ('rehearsal-approval', 'approval-owner', 'active',
                   array['approvals.decide']::text[], 'human')
                """
            )
            cursor.execute(
                """
                insert into app_private.workspace_events (
                  event_id, workspace_id, command_id, command_fingerprint,
                  surface, event_type, actor_id, actor_kind,
                  expected_version, resulting_version, payload_json, result_json
                )
                select
                  md5('rehearsal-entitlement-event:' || workspace_id)::uuid,
                  workspace_id,
                  md5('rehearsal-entitlement-command:' || workspace_id)::uuid,
                  md5('rehearsal-entitlement-a:' || workspace_id)
                    || md5('rehearsal-entitlement-b:' || workspace_id),
                  'company',
                  'company.workspace.activated',
                  owner_actor_id,
                  'human',
                  null,
                  null,
                  jsonb_build_object('products', to_jsonb(products)),
                  jsonb_build_object('status', 'activated')
                from (values
                  ('rehearsal-a', 'owner-a', array['shop']::text[]),
                  ('rehearsal-b', 'owner-b', array['plant']::text[]),
                  ('rehearsal-product', 'owner-product', array['shop', 'website']::text[])
                ) as fixture(workspace_id, owner_actor_id, products)
                """
            )


def _managed_activation_request() -> dict[str, Any]:
    from supermega_runtime.managed_context import (
        MANAGED_CONTEXT_ALLOWED_USES,
        MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
        managed_ai_context_export_digest,
    )

    started_at = "2026-07-30T11:30:00.000Z"
    reviewed_at = "2026-07-30T11:35:00.000Z"
    checkpoint_digest = "sha256:" + "2" * 64
    baseline = {
        "metricId": "shop-exceptions",
        "label": "Shop exceptions",
        "value": 3,
        "unit": "exceptions",
        "better": "lower",
        "detail": "2 low stock, 1 payment, 0 refund.",
        "sourceDigest": "sha256:" + "3" * 64,
    }
    current = {
        **baseline,
        "value": 1,
        "detail": "1 low stock, 0 payment, 0 refund.",
        "sourceDigest": "sha256:" + "4" * 64,
    }
    recommendation = "Accept the measured improvement or continue until the product is clear."
    projection = [
        "supermega.pilot_outcome_report.v1",
        1,
        "commerce",
        "Managed rehearsal workspace",
        "Rehearsal Owner",
        "retail-wholesale",
        checkpoint_digest,
        started_at,
        list(baseline.values()),
        list(current.values()),
        "improved",
        -2,
        recommendation,
        False,
        False,
    ]
    report_digest = "sha256:" + sha256(
        json.dumps(projection, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    outcome = {
        "contract": "supermega.pilot_outcome_report.v1",
        "version": 1,
        "product": "commerce",
        "workspace": "Managed rehearsal workspace",
        "owner": "Rehearsal Owner",
        "templateId": "retail-wholesale",
        "checkpointDigest": checkpoint_digest,
        "startedAt": started_at,
        "measuredAt": reviewed_at,
        "baseline": baseline,
        "current": current,
        "outcomeStatus": "improved",
        "change": -2,
        "recommendation": recommendation,
        "review": {
            "contract": "supermega.local_pilot_outcome_review.v1",
            "reportDigest": report_digest,
            "reviewedBy": "Rehearsal Owner",
            "reviewedAt": reviewed_at,
            "decision": "accepted",
        },
        "rawRecordsIncluded": False,
        "externalWritesPerformed": False,
        "reportDigest": report_digest,
    }
    data_package = {
        "evidenceFilename": "supermega-trial-evidence.json",
        "localRecords": 12,
        "storagePackages": 1,
        "selectedProductRecords": 12,
        "productSources": ["commerce"],
        "approvalPackets": 2,
        "behaviorSignals": 4,
        "pilotOutcomeDigest": report_digest,
    }
    approved_context = {
        "contract": "supermega.ai_context_export.v1",
        "version": 1,
        "product": "shop",
        "templateId": "retail-wholesale",
        "sourceCounts": {
            "selectedProductRecords": 12,
            "behaviorSignals": 4,
            "reviewedDecisions": 2,
        },
        "behaviorPreference": {
            "product": "commerce",
            "chosenCount": 3,
        },
        "outcome": {
            "status": "improved",
            "digest": report_digest,
            "accepted": True,
        },
        "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
        "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
        "handoff": {
            "route": "managed_activation_review",
            "activationRequired": True,
        },
        "ownerReview": {
            "status": "approved_for_managed_review",
            "reviewedBy": "Rehearsal Owner",
            "reviewedAt": "2026-07-30T11:36:00.000Z",
        },
        "privacyBoundary": {
            "rawProductRecordsIncluded": False,
            "rawBehaviorEntriesIncluded": False,
            "rawDecisionRecordsIncluded": False,
            "externalSendPerformed": False,
            "managedWritePerformed": False,
            "modelTrainingAllowed": False,
        },
    }
    approved_context["contextDigest"] = managed_ai_context_export_digest(approved_context)
    return {
        "contract": "supermega.managed_trial_request.v1",
        "version": 1,
        "createdAt": "2026-07-30T11:40:00.000Z",
        "product": "Shop",
        "productSlug": "shop",
        "templateId": "retail-wholesale",
        "templateName": "Retail and wholesale",
        "workspace": "Managed rehearsal workspace",
        "owner": "Rehearsal Owner",
        "pilotReady": True,
        "localRecords": 12,
        "approvalPackets": 2,
        "behaviorSignals": 4,
        "evidenceVersion": 24,
        "pilotOutcomeReport": outcome,
        "approvedAiContext": approved_context,
        "managedWorkspaceProvisioningPacket": {
            "contract": "supermega.managed_workspace_provisioning.v1",
            "version": 1,
            "createdAt": "2026-07-30T11:40:00.000Z",
            "evidenceVersion": 24,
            "workspace": "Managed rehearsal workspace",
            "owner": "Rehearsal Owner",
            "product": "Shop",
            "template": "Retail and wholesale",
            "tenantMode": "managed_required",
            "dataPackage": data_package,
            "requiredControls": [
                "dedicated_postgres_rls",
                "trusted_identity_gateway",
                "private_storage",
                "audit_trail",
                "owner_write_approvals",
                "scheduler_budget_limits",
            ],
            "firstSafeActivation": "Create one reviewed managed workspace.",
            "forbiddenUntilProvisioned": [
                "copy_browser_storage_to_production",
                "enable_hosted_scheduler",
                "send_customer_messages",
                "capture_payments",
                "publish_domains",
            ],
        },
        "importProvisioningPacket": {
            "contract": "supermega.import_provisioning_readiness.v1",
            "status": "blocked",
            "secretValuesExposed": False,
        },
        "noExternalSend": True,
    }


def _exercise_managed_context_postgres_route(
    runtime_database_url: str,
    admin_database_url: str,
    *,
    approved_context: dict[str, Any],
) -> dict[str, bool]:
    """Prove authenticated context retention through the production API and store."""

    from fastapi import HTTPException, Request
    from supermega_runtime.managed_context import managed_context_from_company_state
    from supermega_runtime.runtime import reduce_trial_state, resolve_trial_principal
    from supermega_runtime.trial_runtime import (
        TrialCompanyBriefRequest,
        TrialManagedContextRetainRequest,
        TrialManagedContextValidateRequest,
        create_trial_router,
    )
    from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal

    store = PostgresTrialStore(
        runtime_database_url,
        reducer=reduce_trial_state,
        write_enabled=True,
    )
    owner = TrialPrincipal(MANAGED_WORKSPACE, MANAGED_OWNER_ACTOR, "human")
    identity_secret = "SuperMega-Rehearsal-Identity-7pK4-vN2-xQ9"
    prior_identity_secret = os.environ.get("SUPERMEGA_TRIAL_IDENTITY_SECRET")
    os.environ["SUPERMEGA_TRIAL_IDENTITY_SECRET"] = identity_secret

    def identity_headers(actor_id: str, *, valid_signature: bool = True) -> dict[str, str]:
        timestamp = str(int(datetime.now(timezone.utc).timestamp()))
        message = f"v2\n{timestamp}\n{MANAGED_WORKSPACE}\n{actor_id}\nhuman".encode("utf-8")
        signature = hmac.new(identity_secret.encode("utf-8"), message, sha256).hexdigest()
        if not valid_signature:
            signature = "0" * 64
        return {
            "x-supermega-workspace-id": MANAGED_WORKSPACE,
            "x-supermega-actor-id": actor_id,
            "x-supermega-actor-kind": "human",
            "x-supermega-identity-timestamp": timestamp,
            "x-supermega-identity-signature": signature,
        }

    def workspace_counts() -> tuple[int, int, int]:
        with _connect(admin_database_url, autocommit=True) as administrator:
            row = administrator.execute(
                """
                select
                  (select count(*) from app_private.workspace_state where workspace_id = %s),
                  (select count(*) from app_private.workspace_events where workspace_id = %s),
                  (select count(*) from app_private.approval_requests where workspace_id = %s)
                """,
                (MANAGED_WORKSPACE, MANAGED_WORKSPACE, MANAGED_WORKSPACE),
            ).fetchone()
        return int(row[0]), int(row[1]), int(row[2])

    router = create_trial_router(store=store, resolve_principal=resolve_trial_principal)

    def route_endpoint(path: str) -> Callable[..., dict[str, Any]]:
        for route in router.routes:
            if getattr(route, "path", "") == path and "POST" in getattr(route, "methods", set()):
                return route.endpoint
        raise RehearsalFailure("managed_context_route_missing")

    validate_endpoint = route_endpoint("/api/trial/v1/managed-context/validate")
    retain_endpoint = route_endpoint("/api/trial/v1/managed-context/retain")
    brief_endpoint = route_endpoint("/api/trial/v1/company-brief")

    def route_request(headers: dict[str, str]) -> Request:
        return Request(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "POST",
                "scheme": "https",
                "path": "/api/trial/v1/rehearsal",
                "raw_path": b"/api/trial/v1/rehearsal",
                "query_string": b"",
                "headers": [
                    (key.lower().encode("latin-1"), value.encode("latin-1"))
                    for key, value in headers.items()
                ],
                "client": ("127.0.0.1", 1),
                "server": ("127.0.0.1", 443),
            }
        )

    def denied_call(
        endpoint: Callable[..., dict[str, Any]],
        headers: dict[str, str],
        body: object,
    ) -> tuple[int, dict[str, Any]]:
        try:
            endpoint(route_request(headers), body)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            return int(exc.status_code), dict(detail)
        raise RehearsalFailure("managed_context_expected_denial_missing")

    before = workspace_counts()
    if before != (0, 1, 1):
        raise RehearsalFailure("managed_context_initial_state_unexpected")
    try:
        validation_body = TrialManagedContextValidateRequest(package=approved_context)
        unauthenticated_status, _ = denied_call(validate_endpoint, {}, validation_body)
        forged_status, _ = denied_call(
            validate_endpoint,
            identity_headers(MANAGED_OWNER_ACTOR, valid_signature=False),
            validation_body,
        )
        if unauthenticated_status != 401 or forged_status != 401:
            raise RehearsalFailure("managed_context_identity_bypass")
        if workspace_counts() != before:
            raise RehearsalFailure("managed_context_identity_denial_wrote")

        owner_headers = identity_headers(MANAGED_OWNER_ACTOR)
        validation_payload = validate_endpoint(route_request(owner_headers), validation_body)
        validation = validation_payload.get("validation", {})
        profile = validation_payload.get("profile", {})
        if (
            validation.get("contract") != "supermega.managed_context_profile_validation.v2"
            or validation.get("companyVersion") != 0
            or validation.get("internalWritePerformed") is not False
            or validation.get("externalWritesPerformed") is not False
            or profile.get("contract") != "supermega.managed_context_profile.v2"
            or profile.get("approvedContextDigest") != approved_context.get("contextDigest")
        ):
            raise RehearsalFailure("managed_context_validation_projection_failed")
        if workspace_counts() != before:
            raise RehearsalFailure("managed_context_validation_wrote")

        retention_body = TrialManagedContextRetainRequest(
            command_id="d3454044-5a2f-44b4-aa26-9a1e99f0b0ef",
            expected_company_version=0,
            profile_digest=profile["profileDigest"],
            validation_digest=validation["validationDigest"],
            package=approved_context,
        )
        retained = retain_endpoint(route_request(owner_headers), retention_body)
        result = retained.get("result", {})
        retention = retained.get("retention", {})
        if (
            retention.get("contract") != "supermega.managed_context_profile_retention.v2"
            or retention.get("companyVersion") != 1
            or retention.get("internalWritePerformed") is not True
            or retention.get("externalWritesPerformed") is not False
            or retention.get("idempotentReplay") is not False
            or result.get("version") != 1
        ):
            raise RehearsalFailure("managed_context_retention_projection_failed")
        if workspace_counts() != (1, 2, 1):
            raise RehearsalFailure("managed_context_retention_not_atomic")

        replay_payload = retain_endpoint(route_request(owner_headers), retention_body)
        if (
            replay_payload.get("result", {}).get("version") != 1
            or replay_payload.get("retention", {}).get("idempotentReplay") is not True
            or workspace_counts() != (1, 2, 1)
        ):
            raise RehearsalFailure("managed_context_replay_wrote")

        writer_headers = identity_headers(MANAGED_SECOND_ACTOR)
        writer_validation_payload = validate_endpoint(route_request(writer_headers), validation_body)
        writer_retention_body = TrialManagedContextRetainRequest(
            command_id="e544a089-269a-4dbb-aeb6-9e6b28429bb0",
            expected_company_version=1,
            profile_digest=writer_validation_payload["profile"]["profileDigest"],
            validation_digest=writer_validation_payload["validation"]["validationDigest"],
            package=approved_context,
        )
        writer_status, writer_error = denied_call(
            retain_endpoint,
            writer_headers,
            writer_retention_body,
        )
        if (
            writer_status != 403
            or writer_error.get("code") != "trial_capability_required"
            or writer_error.get("required_capability") != "company.control.approve"
            or workspace_counts() != (1, 2, 1)
        ):
            raise RehearsalFailure("managed_context_owner_capability_bypass")

        brief_payload = brief_endpoint(
            route_request(owner_headers),
            TrialCompanyBriefRequest(intent="attention"),
        )
        owner_context = brief_payload.get("brief", {}).get("ownerContext", {})
        expected_brief_keys = {
            "contract",
            "version",
            "profileDigest",
            "approvedContextDigest",
            "acceptedOutcomeDigest",
            "preferredProduct",
        }
        if (
            set(owner_context) != expected_brief_keys
            or owner_context.get("profileDigest") != profile.get("profileDigest")
            or owner_context.get("approvedContextDigest") != approved_context.get("contextDigest")
            or workspace_counts() != (1, 2, 1)
        ):
            raise RehearsalFailure("managed_context_summary_projection_failed")
    finally:
        if prior_identity_secret is None:
            os.environ.pop("SUPERMEGA_TRIAL_IDENTITY_SECRET", None)
        else:
            os.environ["SUPERMEGA_TRIAL_IDENTITY_SECRET"] = prior_identity_secret

    state = store.get_state(owner, "company")
    persisted_profile = managed_context_from_company_state(
        state.state,
        workspace_id=MANAGED_WORKSPACE,
    )
    receipts = state.state.get("managedContextReceipts", [])
    if (
        state.version != 1
        or state.updated_by != MANAGED_OWNER_ACTOR
        or persisted_profile is None
        or persisted_profile.get("profileDigest") != profile.get("profileDigest")
        or not isinstance(receipts, list)
        or len(receipts) != 1
    ):
        raise RehearsalFailure("managed_context_postgres_readback_failed")
    receipt = receipts[0]
    if (
        not isinstance(receipt, dict)
        or receipt.get("approvedContextDigest") != approved_context.get("contextDigest")
        or receipt.get("acceptedOutcomeDigest") != approved_context.get("outcome", {}).get("digest")
        or receipt.get("rawProductRecordsIncluded") is not False
        or receipt.get("rawBehaviorEntriesIncluded") is not False
        or receipt.get("rawDecisionRecordsIncluded") is not False
        or receipt.get("modelTrainingAllowed") is not False
    ):
        raise RehearsalFailure("managed_context_summary_boundary_failed")
    persisted_text = json.dumps(state.state, ensure_ascii=False, separators=(",", ":"))
    if any(
        forbidden in persisted_text
        for forbidden in ('"customerRows"', '"productRecords"', '"behaviorEntries"', '"decisionRecords"')
    ):
        raise RehearsalFailure("managed_context_raw_records_persisted")

    with _connect(admin_database_url, autocommit=True) as administrator:
        event_rows = administrator.execute(
            """
            select actor_id, actor_kind, expected_version, resulting_version,
                   payload_json, result_json
            from app_private.workspace_events
            where workspace_id = %s and event_type = 'company.snapshot.saved'
            """,
            (MANAGED_WORKSPACE,),
        ).fetchall()
    if len(event_rows) != 1:
        raise RehearsalFailure("managed_context_audit_count_failed")
    event = event_rows[0]
    event_payload = event[4] if isinstance(event[4], dict) else json.loads(event[4])
    event_result = event[5] if isinstance(event[5], dict) else json.loads(event[5])
    if (
        str(event[0]) != MANAGED_OWNER_ACTOR
        or str(event[1]) != "human"
        or int(event[2]) != 0
        or int(event[3]) != 1
        or event_payload.get("state", {}).get("managedContextProfile", {}).get("profileDigest")
        != profile.get("profileDigest")
        or event_result.get("state", {}).get("managedContextProfile", {}).get("profileDigest")
        != profile.get("profileDigest")
    ):
        raise RehearsalFailure("managed_context_audit_binding_failed")

    return {
        "managed_context_authenticated_identity_enforced": True,
        "managed_context_validation_zero_write": True,
        "managed_context_retention_rls_audited": True,
        "managed_context_retention_idempotent_replay": True,
        "managed_context_owner_capability_enforced": True,
        "managed_context_summary_readback": True,
    }


def _exercise_managed_activation_control(
    runtime_database_url: str,
    admin_database_url: str,
) -> dict[str, bool]:
    """Prove durable authorization, atomic activation, and DB-level suspension."""

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from supermega_runtime.managed_activation import (
        ManagedWorkspaceProvisioner,
        compile_activation_plan,
    )
    from supermega_runtime.trial_store import (
        PostgresTrialStore,
        TrialNotReadyError,
        TrialPrincipal,
    )

    now = datetime.now(timezone.utc)
    activation_request = _managed_activation_request()
    approved_context = deepcopy(activation_request["approvedAiContext"])
    plan = compile_activation_plan(
        activation_request,
        workspace_id=MANAGED_WORKSPACE,
        owner_actor_id=MANAGED_OWNER_ACTOR,
        approval_id=MANAGED_APPROVAL_ID,
        approved_by="Rehearsal Owner",
        approved_at=now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        project_ref="zvtzwcimpvvtkowflhda",
        release_commit="a" * 40,
        admin_ca_sha256="sha256:" + "1" * 64,
        now=now,
    )
    if (
        plan.get("evidence", {}).get("approvedContextContract")
        != approved_context.get("contract")
        or plan.get("evidence", {}).get("approvedContextDigest")
        != approved_context.get("contextDigest")
        or plan.get("evidence", {}).get("approvedContextOutcomeDigest")
        != approved_context.get("outcome", {}).get("digest")
    ):
        raise RehearsalFailure("managed_context_activation_evidence_unbound")
    with _connect(admin_database_url, autocommit=True) as administrator:
        administrator.execute(
            "insert into auth.sessions (id, user_id) values (%s::uuid, %s::uuid)",
            (MANAGED_OWNER_SESSION, MANAGED_OWNER_ACTOR),
        )
    provisioner = ManagedWorkspaceProvisioner(admin_database_url)
    authorization = provisioner.authorize(
        plan,
        verified_owner_actor_id=MANAGED_OWNER_ACTOR,
        verified_owner_session_id=MANAGED_OWNER_SESSION,
        decision_note="Owner approved the bounded PostgreSQL rehearsal.",
    )
    if authorization.get("status") != "approved" or authorization.get("replayed") is not False:
        raise RehearsalFailure("managed_authorization_failed")
    if provisioner.inspect(plan).get("status") != "ready_to_apply":
        raise RehearsalFailure("managed_authorization_not_durable")

    with _connect(admin_database_url, autocommit=True) as administrator:
        administrator.execute(
            """
            create function app_private.fail_rehearsal_managed_membership()
            returns trigger language plpgsql security invoker
            set search_path = pg_catalog, app_private
            as $function$
            begin
              if new.workspace_id = 'rehearsal-managed' then
                raise exception using errcode = '55000', message = 'rehearsal activation failure';
              end if;
              return new;
            end
            $function$
            """
        )
        administrator.execute(
            """
            create trigger fail_rehearsal_managed_membership
            before insert on app_private.workspace_memberships
            for each row execute function app_private.fail_rehearsal_managed_membership()
            """
        )
    try:
        try:
            provisioner.apply(plan)
        except Exception as exc:
            if str(getattr(exc, "sqlstate", "")) != "55000":
                raise RehearsalFailure("managed_atomic_failure_unexpected") from exc
        else:
            raise RehearsalFailure("managed_atomic_failure_not_raised")
    finally:
        with _connect(admin_database_url, autocommit=True) as administrator:
            administrator.execute(
                "drop trigger if exists fail_rehearsal_managed_membership "
                "on app_private.workspace_memberships"
            )
            administrator.execute(
                "drop function if exists app_private.fail_rehearsal_managed_membership()"
            )

    with _connect(admin_database_url, autocommit=True) as administrator:
        partial_counts = administrator.execute(
            """
            select
              (select count(*) from app_private.workspace_access_controls where workspace_id = %s),
              (select count(*) from app_private.workspace_memberships where workspace_id = %s),
              (select count(*) from app_private.workspace_events where workspace_id = %s)
            """,
            (MANAGED_WORKSPACE, MANAGED_WORKSPACE, MANAGED_WORKSPACE),
        ).fetchone()
    if partial_counts != (0, 0, 0):
        raise RehearsalFailure("managed_atomic_rollback_failed")

    receipt = provisioner.apply(plan)
    replay = provisioner.apply(plan)
    if receipt.get("status") != "active" or receipt.get("replayed") is not False:
        raise RehearsalFailure("managed_activation_failed")
    receipt_projection = {
        key: value for key, value in receipt.items() if key not in {"replayed", "projectionDigest"}
    }
    replay_projection = {
        key: value for key, value in replay.items() if key not in {"replayed", "projectionDigest"}
    }
    if replay_projection != receipt_projection or replay.get("replayed") is not True:
        raise RehearsalFailure("managed_activation_replay_failed")

    with _connect(admin_database_url, autocommit=True) as administrator:
        administrator.execute(
            """
            insert into app_private.workspace_memberships
              (workspace_id, actor_id, status, capabilities, actor_kind)
            values (
              %s, %s, 'active',
              array['company.read', 'company.write', 'approvals.read']::text[],
              'human'
            )
            """,
            (MANAGED_WORKSPACE, MANAGED_SECOND_ACTOR),
        )
        administrator.execute(
            "insert into auth.sessions (id, user_id) values (%s::uuid, %s::uuid)",
            (MANAGED_SECOND_SESSION, MANAGED_SECOND_ACTOR),
        )

    managed_context = _exercise_managed_context_postgres_route(
        runtime_database_url,
        admin_database_url,
        approved_context=approved_context,
    )

    directory_store = PostgresTrialStore(
        runtime_database_url,
        reducer=lambda _surface, _event_type, state, _payload: state,
        write_enabled=False,
    )
    discovery_principal = TrialPrincipal(
        "workspace-discovery",
        MANAGED_SECOND_ACTOR,
        "human",
        True,
        MANAGED_SECOND_SESSION,
        "supabase",
    )
    managed_supabase_principal = TrialPrincipal(
        MANAGED_WORKSPACE,
        MANAGED_SECOND_ACTOR,
        "human",
        True,
        MANAGED_SECOND_SESSION,
        "supabase",
    )
    active_directory, active_directory_truncated = directory_store.list_actor_workspaces(
        discovery_principal,
        limit=50,
    )
    if active_directory_truncated or [item.workspace_id for item in active_directory] != [MANAGED_WORKSPACE]:
        raise RehearsalFailure("managed_workspace_discovery_active_failed")
    if directory_store.get_state(managed_supabase_principal, "company").workspace_id != MANAGED_WORKSPACE:
        raise RehearsalFailure("managed_supabase_session_active_failed")
    with _connect(admin_database_url, autocommit=True) as administrator:
        administrator.execute(
            "delete from auth.sessions where id = %s::uuid",
            (MANAGED_SECOND_SESSION,),
        )
    revoked_checks = 0
    for operation in (
        lambda: directory_store.list_actor_workspaces(discovery_principal, limit=50),
        lambda: directory_store.get_state(managed_supabase_principal, "company"),
    ):
        try:
            operation()
        except TrialNotReadyError as exc:
            if exc.reasons == ("auth_session_active",):
                revoked_checks += 1
    if revoked_checks != 2:
        raise RehearsalFailure("managed_supabase_session_revocation_failed")
    with _connect(admin_database_url, autocommit=True) as administrator:
        administrator.execute(
            "insert into auth.sessions (id, user_id) values (%s::uuid, %s::uuid)",
            (MANAGED_SECOND_SESSION, MANAGED_SECOND_ACTOR),
        )

    def visible_counts() -> tuple[int, int, int, int, int]:
        with _connect(runtime_database_url) as runtime:
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(
                        cursor,
                        workspace=MANAGED_WORKSPACE,
                        actor=MANAGED_SECOND_ACTOR,
                        actor_kind="human",
                    )
                    cursor.execute(
                        """
                        select
                          (select count(*) from app_private.workspace_access_controls),
                          (select count(*) from app_private.workspace_memberships),
                          (select count(*) from app_private.workspace_state),
                          (select count(*) from app_private.workspace_events),
                          (select count(*) from app_private.approval_requests)
                        """
                    )
                    return tuple(int(value) for value in cursor.fetchone())

    def append_runtime_probe(event_id: str, command_id: str) -> None:
        with _connect(runtime_database_url) as runtime:
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(
                        cursor,
                        workspace=MANAGED_WORKSPACE,
                        actor=MANAGED_SECOND_ACTOR,
                        actor_kind="human",
                    )
                    cursor.execute(
                        """
                        insert into app_private.workspace_events (
                          event_id, workspace_id, command_id, command_fingerprint,
                          surface, event_type, actor_id, actor_kind,
                          payload_json, result_json
                        ) values (
                          %s, %s, %s, repeat('e', 64),
                          'company', 'company.suspension-probe', %s, 'human',
                          '{}'::jsonb, '{"probe": true}'::jsonb
                        )
                        """,
                        (
                            event_id,
                            MANAGED_WORKSPACE,
                            command_id,
                            MANAGED_SECOND_ACTOR,
                        ),
                    )

    append_runtime_probe(
        "7846eac4-9f91-4a0a-af04-9fd4c7074188",
        "203c1184-3007-4be7-b0cb-22bc0414c91d",
    )
    if visible_counts() != (1, 1, 1, 3, 1):
        raise RehearsalFailure("managed_active_workspace_visibility_failed")
    suspension = provisioner.suspend(
        plan,
        suspension_approval_id=plan["rollback"]["authorizationId"],
        suspended_by=MANAGED_OWNER_ACTOR,
        reason="Activation compensation after a downstream release gate failure.",
    )
    if suspension.get("status") != "suspended" or suspension.get("customerDataDeleted") is not False:
        raise RehearsalFailure("managed_suspension_failed")
    if visible_counts() != (0, 0, 0, 0, 0):
        raise RehearsalFailure("managed_suspension_rls_bypass")
    suspended_directory, suspended_directory_truncated = directory_store.list_actor_workspaces(
        discovery_principal,
        limit=50,
    )
    if suspended_directory_truncated or suspended_directory:
        raise RehearsalFailure("managed_workspace_discovery_suspension_failed")
    suspension_write_denied = False
    try:
        append_runtime_probe(
            "b2f82adb-173f-48c0-b959-cabf2ec60908",
            "274f3e46-b014-4710-b9b3-8537e5811f13",
        )
    except Exception as exc:
        if str(getattr(exc, "sqlstate", "")) not in DATABASE_REJECTION_SQLSTATES:
            raise RehearsalFailure("managed_suspension_write_unexpected") from exc
        suspension_write_denied = True
    if not suspension_write_denied:
        raise RehearsalFailure("managed_suspension_write_allowed")
    with _connect(admin_database_url, autocommit=True) as administrator:
        probe_count = administrator.execute(
            "select count(*) from app_private.workspace_events where workspace_id = %s and event_type = 'company.suspension-probe'",
            (MANAGED_WORKSPACE,),
        ).fetchone()[0]
    if probe_count != 1:
        raise RehearsalFailure("managed_suspension_write_persisted")

    return {
        "managed_owner_authorization_durable": True,
        "managed_activation_atomic_rollback": True,
        "managed_activation_idempotent_replay": True,
        "managed_supabase_session_revocation_enforced": True,
        "managed_context_activation_evidence_bound": True,
        **managed_context,
        "managed_suspension_database_enforced": True,
        "managed_suspension_blocks_additional_member": True,
        "managed_suspension_write_denied": True,
        "managed_workspace_discovery_actor_scoped": True,
        "managed_workspace_discovery_suspension_filtered": True,
    }


def _journey_evidence(
    action_id: str,
    *,
    actor: str,
    captured_at: str,
    reason: str,
    reference: str,
) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": actor,
        "reason": reason,
        "evidenceReference": reference,
    }


def _journey_website_state() -> dict[str, Any]:
    return {
        "schema": "supermega.website.workspace.v2",
        "version": 2,
        "revision": 0,
        "contentRevision": 0,
        "siteName": "SuperMega Rehearsal",
        "pages": [
            {
                "id": "page-home",
                "internalName": "Home",
                "slug": "/",
                "stage": "ready",
                "navigation": {"label": "Home", "visible": True},
                "hero": {
                    "eyebrow": "Managed website",
                    "headline": "Order from one accountable website.",
                    "summary": (
                        "A retained Website artifact can enter Commerce only "
                        "after named human review."
                    ),
                    "ctaLabel": "Order",
                    "ctaHref": "/",
                },
                "sections": [
                    {
                        "id": "section-proof",
                        "eyebrow": "Proof",
                        "title": "One retained source",
                        "body": (
                            "Website evidence, approval, and snapshot remain "
                            "bound to the Commerce intake."
                        ),
                    }
                ],
                "seo": {
                    "title": "SuperMega managed Website rehearsal",
                    "description": "A retained Website-to-Commerce workflow.",
                },
                "updatedAt": "2026-07-24T08:55:00.000Z",
            }
        ],
        "selectedPageId": "page-home",
        "evidence": [],
        "approvals": [],
        "localPublishes": [],
        "events": [],
    }


def _journey_website_evidence_state(
    current: dict[str, Any],
    *,
    kind: str,
    captured_at: str,
    fingerprint: Callable[[dict[str, Any]], str],
) -> tuple[dict[str, Any], dict[str, str]]:
    next_state = deepcopy(current)
    next_state["revision"] = int(current["revision"]) + 1
    source = {
        "contentRevision": int(current["contentRevision"]),
        "digest": fingerprint(current),
    }
    identifier = f"EVIDENCE-WEB-{kind.upper()}"
    reason = f"Verified managed Website {kind} evidence"
    reference = f"evidence://website/{kind}"
    record = {
        "id": identifier,
        "kind": kind,
        "finding": reason,
        "reference": reference,
        "verifiedBy": JOURNEY_PRODUCT_ACTOR,
        "verifiedAt": captured_at,
        "fingerprint": source["digest"],
        "source": source,
        "migratedFromV1": False,
    }
    event = {
        "id": f"EVENT-{identifier}",
        "createdAt": captured_at,
        "actorKind": "human",
        "actor": JOURNEY_PRODUCT_ACTOR,
        "action": "publish_evidence_recorded",
        "subjectId": identifier,
        "reason": reason,
        "evidenceReference": reference,
        "source": source,
    }
    next_state["evidence"] = [record, *current["evidence"]]
    next_state["events"] = [event, *current["events"]]
    return next_state, _journey_evidence(
        identifier,
        actor=JOURNEY_PRODUCT_ACTOR,
        captured_at=captured_at,
        reason=reason,
        reference=reference,
    )


def _journey_production_event(
    evidence: dict[str, str],
    *,
    kind: str,
    subject_id: str,
    summary: str,
    **details: object,
) -> dict[str, Any]:
    return {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": kind,
        "subjectId": subject_id,
        "summary": summary,
        **details,
    }


def _exercise_managed_product_journeys(
    runtime_database_url: str,
    admin_database_url: str,
) -> dict[str, bool]:
    """Run two real product journeys through the exact PostgreSQL adapter."""

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from supermega_runtime.commerce_runtime import reduce_commerce_state
    from supermega_runtime.production_runtime import reduce_production_state
    from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal
    from supermega_runtime.website_runtime import (
        _website_artifact,
        _website_fingerprint,
        reduce_website_state,
        validate_website_snapshot_source,
    )

    def reducer(
        surface: str,
        event_type: str,
        current: dict[str, Any],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if surface == "website":
            return dict(reduce_website_state(event_type, current, payload))
        if surface == "commerce":
            return reduce_commerce_state(event_type, current, payload)
        if surface == "production":
            return reduce_production_state(event_type, current, payload)
        raise RehearsalFailure("managed_journey_surface_unsupported")

    store = PostgresTrialStore(
        runtime_database_url,
        reducer=reducer,
        write_enabled=True,
    )
    product_owner = TrialPrincipal(
        JOURNEY_PRODUCT_WORKSPACE,
        JOURNEY_PRODUCT_ACTOR,
        "human",
    )
    production_owner = TrialPrincipal(
        JOURNEY_PRODUCTION_WORKSPACE,
        JOURNEY_PRODUCTION_ACTOR,
        "human",
    )
    command_number = 100

    def apply(
        principal: Any,
        *,
        surface: str,
        event_type: str,
        expected_version: int,
        state: dict[str, Any],
        evidence: dict[str, str],
        related_surfaces: tuple[str, ...] = (),
        state_precondition: Callable[
            [dict[str, Any], dict[str, dict[str, Any]]],
            None,
        ]
        | None = None,
    ) -> tuple[Any, str]:
        nonlocal command_number
        command_number += 1
        command_id = f"10000000-0000-4000-8000-{command_number:012d}"
        try:
            result = store.apply_command(
                principal,
                command_id=command_id,
                surface=surface,
                event_type=event_type,
                expected_version=expected_version,
                payload={"state": state, "evidence": evidence},
                related_surfaces=related_surfaces,
                state_precondition=state_precondition,
            )
        except Exception as exc:
            safe_event = event_type.replace(".", "_")
            raise RehearsalFailure(
                f"managed_journey_{surface}_{safe_event}_failed"
            ) from exc
        if (
            result.idempotent_replay
            or result.surface != surface
            or result.event_type != event_type
            or result.version != expected_version + 1
        ):
            raise RehearsalFailure("managed_journey_command_result_invalid")
        return result, command_id

    website_state = _journey_website_state()
    website_init_evidence = _journey_evidence(
        "ACT-WEBSITE-INIT",
        actor=JOURNEY_PRODUCT_ACTOR,
        captured_at="2026-07-24T09:00:00.000Z",
        reason="Initialize retained Website rehearsal",
        reference="website:revision:0",
    )
    website_result, _ = apply(
        product_owner,
        surface="website",
        event_type="website.workspace.initialized",
        expected_version=0,
        state=website_state,
        evidence=website_init_evidence,
    )
    for kind, captured_at in (
        ("content", "2026-07-24T09:05:00.000Z"),
        ("responsive", "2026-07-24T09:06:00.000Z"),
        ("links", "2026-07-24T09:07:00.000Z"),
    ):
        evidence_state, evidence = _journey_website_evidence_state(
            dict(website_result.state),
            kind=kind,
            captured_at=captured_at,
            fingerprint=_website_fingerprint,
        )
        website_result, _ = apply(
            product_owner,
            surface="website",
            event_type="website.evidence.recorded",
            expected_version=website_result.version,
            state=evidence_state,
            evidence=evidence,
        )

    approved_state = deepcopy(dict(website_result.state))
    approved_state["revision"] = int(approved_state["revision"]) + 1
    website_source = {
        "contentRevision": int(approved_state["contentRevision"]),
        "digest": _website_fingerprint(approved_state),
    }
    evidence_ids = [str(record["id"]) for record in approved_state["evidence"]]
    approval_id = "APPROVAL-WEB-REHEARSAL"
    approval_note = "Approved for retained Commerce intake rehearsal"
    approval_reference = ",".join(evidence_ids)
    approval = {
        "id": approval_id,
        "reviewer": JOURNEY_PRODUCT_ACTOR,
        "note": approval_note,
        "approvedAt": "2026-07-24T09:10:00.000Z",
        "fingerprint": website_source["digest"],
        "evidenceIds": evidence_ids,
        "source": website_source,
        "migratedFromV1": False,
    }
    approval_event = {
        "id": "EVENT-APPROVAL-WEB-REHEARSAL",
        "createdAt": approval["approvedAt"],
        "actorKind": "human",
        "actor": JOURNEY_PRODUCT_ACTOR,
        "action": "website_revision_approved",
        "subjectId": approval_id,
        "reason": approval_note,
        "evidenceReference": approval_reference,
        "source": website_source,
    }
    approved_state["approvals"] = [approval, *approved_state["approvals"]]
    approved_state["events"] = [approval_event, *approved_state["events"]]
    website_result, _ = apply(
        product_owner,
        surface="website",
        event_type="website.revision.approved",
        expected_version=website_result.version,
        state=approved_state,
        evidence=_journey_evidence(
            approval_id,
            actor=JOURNEY_PRODUCT_ACTOR,
            captured_at=str(approval["approvedAt"]),
            reason=approval_note,
            reference=approval_reference,
        ),
    )

    snapshot_state = deepcopy(dict(website_result.state))
    snapshot_state["revision"] = int(snapshot_state["revision"]) + 1
    snapshot_id = "SNAPSHOT-WEB-REHEARSAL"
    snapshot_at = "2026-07-24T09:12:00.000Z"
    snapshot_reason = "Retained approved Website artifact for Commerce intake"
    snapshot = {
        "id": snapshot_id,
        "recordedAt": snapshot_at,
        "recordedBy": JOURNEY_PRODUCT_ACTOR,
        "fingerprint": website_source["digest"],
        "readyPageIds": ["page-home"],
        "approvalId": approval_id,
        "evidenceIds": evidence_ids,
        "source": website_source,
        "migratedFromV1": False,
        "artifact": _website_artifact(snapshot_state),
    }
    snapshot_event = {
        "id": "EVENT-SNAPSHOT-WEB-REHEARSAL",
        "createdAt": snapshot_at,
        "actorKind": "human",
        "actor": JOURNEY_PRODUCT_ACTOR,
        "action": "local_snapshot_recorded",
        "subjectId": snapshot_id,
        "reason": snapshot_reason,
        "evidenceReference": approval_id,
        "source": website_source,
    }
    snapshot_state["localPublishes"] = [
        snapshot,
        *snapshot_state["localPublishes"],
    ]
    snapshot_state["events"] = [snapshot_event, *snapshot_state["events"]]
    website_result, _ = apply(
        product_owner,
        surface="website",
        event_type="website.snapshot.recorded",
        expected_version=website_result.version,
        state=snapshot_state,
        evidence=_journey_evidence(
            snapshot_id,
            actor=JOURNEY_PRODUCT_ACTOR,
            captured_at=snapshot_at,
            reason=snapshot_reason,
            reference=approval_id,
        ),
    )

    commerce_state = {
        "schema": "supermega.commerce.workspace.v2",
        "items": [
            {
                "sku": "SKU-REHEARSAL-1",
                "name": "Rehearsal item",
                "onHand": 10,
                "reorderAt": 2,
                "price": 25_000,
            }
        ],
        "orders": [],
        "movements": [],
        "closes": [],
    }
    commerce_result, _ = apply(
        product_owner,
        surface="commerce",
        event_type="commerce.workspace.initialized",
        expected_version=0,
        state=commerce_state,
        evidence=_journey_evidence(
            "ACT-COMMERCE-INIT",
            actor=JOURNEY_PRODUCT_ACTOR,
            captured_at="2026-07-24T09:15:00.000Z",
            reason="Initialize accountable Commerce catalog",
            reference="commerce:catalog:rehearsal",
        ),
    )

    commerce_source = {
        "fingerprint": website_source["digest"],
        "approvalId": approval_id,
        "snapshotId": snapshot_id,
        "pageId": "page-home",
        "siteName": "SuperMega Rehearsal",
        "pagePath": "/",
    }
    intake_evidence = _journey_evidence(
        "ACT-WEBSITE-INTAKE-REHEARSAL",
        actor=JOURNEY_PRODUCT_ACTOR,
        captured_at="2026-07-24T09:20:00.000Z",
        reason="Retain approved Website source in Commerce",
        reference=snapshot_id,
    )
    intake_id = "WINT-REHEARSAL-001"
    intake = {
        "id": intake_id,
        "createdAt": intake_evidence["capturedAt"],
        "status": "pending_confirmation",
        "source": commerce_source,
        "sku": "SKU-REHEARSAL-1",
        "quantity": 2,
        "itemName": "Rehearsal item",
        "unitPrice": 25_000,
        "total": 50_000,
        "creation": intake_evidence,
    }
    intake_state = deepcopy(dict(commerce_result.state))
    intake_state["websiteIntakes"] = [intake]

    def require_retained_website(
        _commerce_state: dict[str, Any],
        related_states: dict[str, dict[str, Any]],
    ) -> None:
        validate_website_snapshot_source(
            related_states.get("website", {}),
            commerce_source,
        )

    commerce_result, _ = apply(
        product_owner,
        surface="commerce",
        event_type="commerce.website_intake.created",
        expected_version=commerce_result.version,
        state=intake_state,
        evidence=intake_evidence,
        related_surfaces=("website",),
        state_precondition=require_retained_website,
    )

    conversion_evidence = _journey_evidence(
        "ACT-WEBSITE-CONVERT-REHEARSAL",
        actor=JOURNEY_PRODUCT_ACTOR,
        captured_at="2026-07-24T09:25:00.000Z",
        reason="Human confirmed retained Website intake",
        reference="evidence://commerce/website-confirmation",
    )
    conversion_promised_at = (
        datetime.now(timezone.utc) + timedelta(hours=1)
    ).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    conversion_state = deepcopy(dict(commerce_result.state))
    conversion_state["websiteIntakes"][0]["status"] = "converted"
    conversion_state["websiteIntakes"][0]["conversion"] = {
        **conversion_evidence,
        "orderId": "ORD-WEB-REHEARSAL-001",
    }
    conversion_state["items"][0]["onHand"] = 8
    conversion_state["orders"] = [
        {
            "id": "ORD-WEB-REHEARSAL-001",
            "createdAt": conversion_evidence["capturedAt"],
            "customer": "Website customer reference",
            "channel": "Website",
            "item": "Rehearsal item",
            "itemSku": "SKU-REHEARSAL-1",
            "quantity": 2,
            "payment": "Manual review",
            "paymentStatus": "pending",
            "refundStatus": "none",
            "fulfilment": "pickup",
            "fulfilmentReference": "Website pickup confirmed by the named owner.",
            "promisedAt": conversion_promised_at,
            "sourceRecordId": intake_id,
            "evidenceReference": conversion_evidence["evidenceReference"],
            "total": 50_000,
            "status": "confirmed",
        }
    ]
    conversion_state["movements"] = [
        {
            "id": f"MOV2:{conversion_evidence['actionId']}",
            "actionId": conversion_evidence["actionId"],
            "createdAt": conversion_evidence["capturedAt"],
            "actor": conversion_evidence["actor"],
            "reason": conversion_evidence["reason"],
            "evidenceReference": conversion_evidence["evidenceReference"],
            "kind": "reserve",
            "sku": "SKU-REHEARSAL-1",
            "quantityDelta": -2,
            "orderId": "ORD-WEB-REHEARSAL-001",
        }
    ]
    commerce_result, conversion_command_id = apply(
        product_owner,
        surface="commerce",
        event_type="commerce.website_intake.converted",
        expected_version=commerce_result.version,
        state=conversion_state,
        evidence=conversion_evidence,
    )
    conversion_replay = store.apply_command(
        product_owner,
        command_id=conversion_command_id,
        surface="commerce",
        event_type="commerce.website_intake.converted",
        expected_version=2,
        payload={"state": conversion_state, "evidence": conversion_evidence},
    )

    production_state = {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [
            {
                "id": "JOB-REAL-001",
                "line": "Assembly team",
                "product": "Customer batch 001",
                "target": 100,
                "output": 0,
                "owner": "Production lead",
                "priority": "normal",
                "dueAt": "2026-07-25T09:00:00.000Z",
            }
        ],
        "issues": [],
        "machines": [
            {
                "id": "MACHINE-REAL-001",
                "name": "Assembly machine",
                "state": "running",
            }
        ],
        "events": [],
    }
    production_result, _ = apply(
        production_owner,
        surface="production",
        event_type="production.workspace.initialized",
        expected_version=0,
        state=production_state,
        evidence=_journey_evidence(
            "ACT-PRODUCTION-INIT",
            actor=JOURNEY_PRODUCTION_ACTOR,
            captured_at="2026-07-24T09:30:00.000Z",
            reason="Initialize accountable Production workspace",
            reference="evidence://production/initial-job",
        ),
    )

    job_evidence = _journey_evidence(
        "ACT-PRODUCTION-JOB",
        actor=JOURNEY_PRODUCTION_ACTOR,
        captured_at="2026-07-24T09:35:00.000Z",
        reason="Create the next accountable customer job",
        reference="evidence://production/job-002",
    )
    job_state = deepcopy(dict(production_result.state))
    new_job = {
        "id": "JOB-REAL-002",
        "line": "Assembly team",
        "product": "Customer batch 002",
        "target": 50,
        "output": 0,
        "owner": "Production lead",
        "priority": "normal",
        "dueAt": "2026-07-26T09:00:00.000Z",
    }
    job_state["revision"] = int(job_state["revision"]) + 1
    job_state["jobs"] = [new_job, *job_state["jobs"]]
    job_state["events"] = [
        _journey_production_event(
            job_evidence,
            kind="job_created",
            subject_id=new_job["id"],
            summary="Created Customer batch 002 job for Assembly team",
            jobPriority=new_job["priority"],
            jobDueAt=new_job["dueAt"],
            jobOwner=new_job["owner"],
        ),
        *job_state["events"],
    ]
    production_result, _ = apply(
        production_owner,
        surface="production",
        event_type="production.job.created",
        expected_version=production_result.version,
        state=job_state,
        evidence=job_evidence,
    )

    output_evidence = _journey_evidence(
        "ACT-PRODUCTION-OUTPUT",
        actor=JOURNEY_PRODUCTION_ACTOR,
        captured_at="2026-07-24T09:40:00.000Z",
        reason="Record five verified good units",
        reference="evidence://production/output-002",
    )
    output_state = deepcopy(dict(production_result.state))
    output_state["revision"] = int(output_state["revision"]) + 1
    output_state["jobs"][0]["output"] = 5
    output_state["events"] = [
        _journey_production_event(
            output_evidence,
            kind="output_recorded",
            subject_id="JOB-REAL-002",
            summary="Recorded 5 good units",
            quantity=5,
            shiftRef="2026-07-24 Day",
        ),
        *output_state["events"],
    ]
    production_result, output_command_id = apply(
        production_owner,
        surface="production",
        event_type="production.output.recorded",
        expected_version=production_result.version,
        state=output_state,
        evidence=output_evidence,
    )
    output_replay = store.apply_command(
        production_owner,
        command_id=output_command_id,
        surface="production",
        event_type="production.output.recorded",
        expected_version=2,
        payload={"state": output_state, "evidence": output_evidence},
    )

    final_website = store.get_state(product_owner, "website")
    final_commerce = store.get_state(product_owner, "commerce")
    final_production = store.get_state(production_owner, "production")
    validate_website_snapshot_source(final_website.state, commerce_source)
    if (
        final_website.version != 6
        or len(final_website.state.get("localPublishes", [])) != 1
        or final_commerce.version != 3
        or final_commerce.state.get("orders", [{}])[0].get("status") != "confirmed"
        or final_commerce.state.get("items", [{}])[0].get("onHand") != 8
        or final_commerce.state.get("websiteIntakes", [{}])[0].get("status")
        != "converted"
    ):
        raise RehearsalFailure("managed_website_to_commerce_journey_failed")
    if (
        final_production.version != 3
        or final_production.state.get("jobs", [{}])[0].get("id") != "JOB-REAL-002"
        or final_production.state.get("jobs", [{}])[0].get("output") != 5
    ):
        raise RehearsalFailure("managed_production_job_to_output_failed")
    if (
        final_website.updated_by != JOURNEY_PRODUCT_ACTOR
        or final_commerce.updated_by != JOURNEY_PRODUCT_ACTOR
        or final_production.updated_by != JOURNEY_PRODUCTION_ACTOR
    ):
        raise RehearsalFailure("managed_journey_attribution_failed")
    if (
        not conversion_replay.idempotent_replay
        or conversion_replay.version != 3
        or not output_replay.idempotent_replay
        or output_replay.version != 3
    ):
        raise RehearsalFailure("managed_journey_exact_retry_failed")

    with _connect(admin_database_url, autocommit=True) as administrator:
        rows = administrator.execute(
            """
            select workspace_id, actor_id, actor_kind, count(*)::integer
            from app_private.workspace_events
            where workspace_id in ('rehearsal-product', 'rehearsal-b')
            group by workspace_id, actor_id, actor_kind
            order by workspace_id
            """
        ).fetchall()
    if rows != [
        ("rehearsal-b", "owner-b", "human", 4),
        ("rehearsal-product", "owner-product", "human", 10),
    ]:
        raise RehearsalFailure("managed_journey_event_attribution_failed")
    return {
        "managed_website_to_commerce_journey": True,
        "managed_production_job_to_output": True,
        "managed_human_attribution": True,
        "managed_exact_retry": True,
    }


def _set_identity(
    cursor: Any,
    workspace: str = "rehearsal-a",
    actor: str = "owner-a",
    actor_kind: str = "human",
) -> None:
    cursor.execute("select set_config('app.workspace_id', %s, true)", (workspace,))
    cursor.execute("select set_config('app.actor_id', %s, true)", (actor,))
    cursor.execute("select set_config('app.actor_kind', %s, true)", (actor_kind,))


def _expect_database_rejection(
    operation: Callable[[], None],
    code: str,
    *,
    expected_sqlstates: frozenset[str] = DATABASE_REJECTION_SQLSTATES,
) -> None:
    try:
        operation()
    except Exception as exc:
        if str(getattr(exc, "sqlstate", "")) in expected_sqlstates:
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

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal

    adapter = PostgresTrialStore(
        runtime_database_url,
        reducer=lambda _surface, _event_type, current, _payload: dict(current),
        write_enabled=False,
    )
    adapter_principal = TrialPrincipal("rehearsal-a", "owner-a", "human")
    adapter_readiness = adapter.readiness(adapter_principal)
    if not adapter_readiness.read_ready:
        raise RehearsalFailure("runtime_adapter_readiness_failed")
    adapter_state = adapter.get_state(adapter_principal, "commerce")
    if adapter_state.workspace_id != "rehearsal-a" or adapter_state.version != 0:
        raise RehearsalFailure("runtime_adapter_read_failed")

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
                cursor.execute(
                    """
                    select
                      current_setting('app.workspace_id', true),
                      current_setting('app.actor_id', true),
                      current_setting('app.actor_kind', true)
                    """
                )
                if any(str(value or "") for value in cursor.fetchone()):
                    raise RehearsalFailure("identity_leaked_across_transaction")
                cursor.execute("select count(*) from app_private.workspace_memberships")
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("identity_authorized_without_context")

        class IntentionalRollback(RuntimeError):
            pass

        try:
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(cursor)
                    raise IntentionalRollback("exercise rollback")
        except IntentionalRollback:
            pass

        with runtime.transaction():
            with runtime.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      current_setting('app.workspace_id', true),
                      current_setting('app.actor_id', true),
                      current_setting('app.actor_kind', true)
                    """
                )
                if any(str(value or "") for value in cursor.fetchone()):
                    raise RehearsalFailure("identity_leaked_after_rollback")
                cursor.execute("select count(*) from app_private.workspace_memberships")
                if int(cursor.fetchone()[0]) != 0:
                    raise RehearsalFailure("rollback_identity_authorized")
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


def _approval_authority_snapshot(admin_database_url: str) -> dict[str, Any]:
    with _connect(admin_database_url, autocommit=True) as administrator:
        approval_rows = administrator.execute(
            """
            select to_jsonb(approval_record)
            from app_private.approval_requests as approval_record
            where workspace_id = %s
            order by approval_id
            """,
            (APPROVAL_WORKSPACE,),
        ).fetchall()
        event_rows = administrator.execute(
            """
            select to_jsonb(event_record)
            from app_private.workspace_events as event_record
            where workspace_id = %s and surface = 'approvals'
            order by event_type, event_id
            """,
            (APPROVAL_WORKSPACE,),
        ).fetchall()
    approvals = [row[0] for row in approval_rows]
    events = [row[0] for row in event_rows]
    if (
        len(approvals) != 1
        or [event.get("event_type") for event in events]
        != ["approval.decided", "approval.requested"]
    ):
        raise RehearsalFailure("approval_authority_snapshot_incomplete")
    return {"approval": approvals[0], "events": events}


def _exercise_approval_authority(
    runtime_database_url: str,
    admin_database_url: str,
) -> tuple[dict[str, bool], dict[str, Any]]:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    from supermega_runtime.trial_store import (
        PostgresTrialStore,
        TrialIdempotencyConflict,
        TrialPrincipal,
    )

    store = PostgresTrialStore(
        runtime_database_url,
        reducer=lambda _surface, _event_type, current, _payload: dict(current),
        write_enabled=True,
    )
    requester = TrialPrincipal(
        APPROVAL_WORKSPACE,
        APPROVAL_AGENT_ACTOR,
        "agent",
    )
    human_decider = TrialPrincipal(
        APPROVAL_WORKSPACE,
        APPROVAL_HUMAN_ACTOR,
        "human",
    )
    request_command_id = "00000000-0000-4000-8000-000000000101"
    decision_command_id = "00000000-0000-4000-8000-000000000102"
    evidence_reference = "review://approval-authority/rehearsal-1"
    proposal = {
        "contract": "decision_packet.v1",
        "subject": {
            "kind": "release",
            "id": "approval-authority-rehearsal",
            "version": 1,
        },
        "decision": "Release the approval authority rehearsal",
        "claims": [
            {
                "id": "claim-approval-authority",
                "claim_type": "fact",
                "statement": "The bounded approval packet is ready for owner review.",
                "source_reference": evidence_reference,
                "captured_at": "2026-07-25T00:00:00+06:30",
                "status": "verified",
                "uncertainty": "low",
                "visibility": "private",
                "digest": "sha256:" + "1" * 64,
            }
        ],
        "baseline": "The rehearsal remains unreleased.",
        "target": "The rehearsal is approved by the named owner.",
        "result": "The database authority boundary is preserved.",
        "acceptance": "One human decision and its immutable evidence are retained.",
        "artifact_reference": "artifact://approval-authority/rehearsal-1",
    }
    approval = store.create_approval(
        requester,
        command_id=request_command_id,
        title="Approve the database authority rehearsal",
        proposal=proposal,
        evidence_refs=(evidence_reference,),
    )
    if (
        approval.status != "pending"
        or approval.requested_by != APPROVAL_AGENT_ACTOR
        or approval.requested_actor_kind != "agent"
        or approval.version != 0
    ):
        raise RehearsalFailure("approval_request_attribution_failed")

    def attempt_nonhuman_spoof(actor: str, actor_kind: str) -> None:
        try:
            with _connect(runtime_database_url) as runtime:
                with runtime.transaction():
                    with runtime.cursor() as cursor:
                        _set_identity(
                            cursor,
                            workspace=APPROVAL_WORKSPACE,
                            actor=actor,
                            actor_kind=actor_kind,
                        )
                        cursor.execute(
                            """
                            select status
                            from app_private.approval_requests
                            where workspace_id = %s and approval_id = %s
                            """,
                            (APPROVAL_WORKSPACE, approval.approval_id),
                        )
                        if cursor.fetchone() != ("pending",):
                            raise RehearsalFailure(
                                f"approval_{actor_kind}_pending_read_denied"
                            )
                        cursor.execute(
                            """
                            update app_private.approval_requests
                            set status = 'approved',
                                decided_by = %s,
                                decided_actor_kind = 'human',
                                decision_note = 'Spoofed human decision.',
                                version = version + 1
                            where workspace_id = %s
                              and approval_id = %s
                              and status = 'pending'
                            returning status
                            """,
                            (
                                APPROVAL_HUMAN_ACTOR,
                                APPROVAL_WORKSPACE,
                                approval.approval_id,
                            ),
                        )
                        returned = cursor.fetchone()
                        affected = cursor.rowcount
        except RehearsalFailure:
            raise
        except Exception as exc:
            if str(getattr(exc, "sqlstate", "")) == "42501":
                return
            raise RehearsalFailure(
                f"approval_{actor_kind}_spoof_unexpected_error"
            ) from exc
        if affected != 0 or returned is not None:
            raise RehearsalFailure(f"approval_{actor_kind}_spoof_accepted")

    attempt_nonhuman_spoof(APPROVAL_AGENT_ACTOR, "agent")
    attempt_nonhuman_spoof(APPROVAL_SERVICE_ACTOR, "service")

    with _connect(admin_database_url, autocommit=True) as administrator:
        pending = administrator.execute(
            """
            select status, decided_by, decided_actor_kind, decided_at,
                   decision_note, version
            from app_private.approval_requests
            where workspace_id = %s and approval_id = %s
            """,
            (APPROVAL_WORKSPACE, approval.approval_id),
        ).fetchone()
    if pending != ("pending", None, None, None, "", 0):
        raise RehearsalFailure("approval_nonhuman_spoof_changed_record")

    decided = store.decide_approval(
        human_decider,
        approval_id=approval.approval_id,
        command_id=decision_command_id,
        decision="approved",
        note="Named owner approved the bounded rehearsal.",
    )
    replay = store.decide_approval(
        human_decider,
        approval_id=approval.approval_id,
        command_id=decision_command_id,
        decision="approved",
        note="Named owner approved the bounded rehearsal.",
    )
    try:
        store.decide_approval(
            human_decider,
            approval_id=approval.approval_id,
            command_id=decision_command_id,
            decision="declined",
            note="Mutated retry must not reuse the decision command.",
        )
    except TrialIdempotencyConflict:
        pass
    else:
        raise RehearsalFailure("approval_mutated_retry_accepted")
    decided_comparable = decided.to_dict()
    replay_comparable = replay.to_dict()
    decided_comparable["idempotent_replay"] = False
    replay_comparable["idempotent_replay"] = False
    if (
        decided.status != "approved"
        or decided.version != 1
        or decided.decided_by != APPROVAL_HUMAN_ACTOR
        or decided.decided_actor_kind != "human"
        or not decided.decided_at
        or decided.idempotent_replay
        or not replay.idempotent_replay
        or replay_comparable != decided_comparable
    ):
        raise RehearsalFailure("approval_human_decision_failed")

    approval_snapshot = _approval_authority_snapshot(admin_database_url)
    decision_events = [
        event
        for event in approval_snapshot["events"]
        if event.get("event_type") == "approval.decided"
    ]
    if len(decision_events) != 1:
        raise RehearsalFailure("approval_decision_evidence_missing")
    decision_event_snapshot = decision_events[0]

    def replay_terminal_decision() -> None:
        with _connect(admin_database_url) as administrator:
            with administrator.transaction():
                administrator.execute(
                    """
                    update app_private.approval_requests
                    set status = 'declined',
                        decided_by = %s,
                        decided_actor_kind = 'human',
                        decision_note = 'Attempted second decision.',
                        version = version + 1
                    where workspace_id = %s and approval_id = %s
                    """,
                    (
                        APPROVAL_HUMAN_ACTOR,
                        APPROVAL_WORKSPACE,
                        approval.approval_id,
                    ),
                )

    _expect_database_rejection(
        replay_terminal_decision,
        "approval_terminal_replay_accepted",
        expected_sqlstates=frozenset({"55000"}),
    )

    def mutate_approval_evidence() -> None:
        with _connect(admin_database_url) as administrator:
            with administrator.transaction():
                administrator.execute(
                    """
                    update app_private.approval_requests
                    set proposal_json = proposal_json
                      || '{"tampered": true}'::jsonb
                    where workspace_id = %s and approval_id = %s
                    """,
                    (APPROVAL_WORKSPACE, approval.approval_id),
                )

    _expect_database_rejection(
        mutate_approval_evidence,
        "approval_evidence_mutation_accepted",
        expected_sqlstates=frozenset({"55000"}),
    )

    def delete_approval() -> None:
        with _connect(admin_database_url) as administrator:
            with administrator.transaction():
                administrator.execute(
                    """
                    delete from app_private.approval_requests
                    where workspace_id = %s and approval_id = %s
                    """,
                    (APPROVAL_WORKSPACE, approval.approval_id),
                )

    _expect_database_rejection(
        delete_approval,
        "approval_delete_accepted",
        expected_sqlstates=frozenset({"55000"}),
    )

    decision_event_id = str(decision_event_snapshot["event_id"])

    def mutate_decision_event() -> None:
        with _connect(admin_database_url) as administrator:
            with administrator.transaction():
                administrator.execute(
                    """
                    update app_private.workspace_events
                    set result_json = '{"tampered": true}'::jsonb
                    where event_id = %s::uuid
                    """,
                    (decision_event_id,),
                )

    _expect_database_rejection(
        mutate_decision_event,
        "approval_decision_event_mutation_accepted",
        expected_sqlstates=frozenset({"55000"}),
    )

    def delete_decision_event() -> None:
        with _connect(admin_database_url) as administrator:
            with administrator.transaction():
                administrator.execute(
                    """
                    delete from app_private.workspace_events
                    where event_id = %s::uuid
                    """,
                    (decision_event_id,),
                )

    _expect_database_rejection(
        delete_decision_event,
        "approval_decision_event_delete_accepted",
        expected_sqlstates=frozenset({"55000"}),
    )

    final_snapshot = _approval_authority_snapshot(admin_database_url)
    if final_snapshot != approval_snapshot:
        raise RehearsalFailure("approval_authority_changed_after_rejection")

    approval_read_visibility: dict[str, tuple[int, list[str]]] = {}
    for actor, actor_kind in (
        (APPROVAL_AGENT_ACTOR, "agent"),
        (APPROVAL_HUMAN_ACTOR, "human"),
    ):
        with _connect(runtime_database_url) as runtime:
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(
                        cursor,
                        workspace=APPROVAL_WORKSPACE,
                        actor=actor,
                        actor_kind=actor_kind,
                    )
                    cursor.execute("select count(*) from app_private.approval_requests")
                    approval_count = int(cursor.fetchone()[0])
                    cursor.execute(
                        """
                        select event_type
                        from app_private.workspace_events
                        where surface = 'approvals'
                        order by event_type
                        """
                    )
                    approval_events = [str(row[0]) for row in cursor.fetchall()]
                    approval_read_visibility[actor] = (
                        approval_count,
                        approval_events,
                    )
    if approval_read_visibility[APPROVAL_AGENT_ACTOR] != (
        1,
        ["approval.requested"],
    ):
        raise RehearsalFailure("approval_requester_read_scope_failed")
    if approval_read_visibility[APPROVAL_HUMAN_ACTOR] != (
        1,
        ["approval.decided", "approval.requested"],
    ):
        raise RehearsalFailure("approval_reviewer_read_scope_failed")

    return (
        {
            "approval_agent_row_spoof_denied": True,
            "approval_service_row_spoof_denied": True,
            "approval_human_decision_once": True,
            "approval_exact_retry": True,
            "approval_mutated_retry_rejected": True,
            "approval_terminal_replay_rejected": True,
            "approval_record_immutable": True,
            "approval_decision_event_immutable": True,
            "approval_requester_read_scoped": True,
            "approval_reviewer_reads_all": True,
        },
        final_snapshot,
    )


def _exercise_runtime(
    runtime_database_url: str,
    admin_database_url: str,
) -> dict[str, bool]:
    checks = {
        "tenant_isolation": False,
        "capability_denial": False,
        "capability_scoped_reads": False,
        "capability_scoped_event_reads": False,
        "write_capability_implies_read": False,
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

        with _connect(admin_database_url, autocommit=True) as administrator:
            administrator.execute(
                """
                insert into app_private.workspace_state
                  (workspace_id, surface, version, state_json, updated_by)
                values
                  ('rehearsal-a', 'website', 1,
                   '{"site": "capability-scoped"}'::jsonb, 'administrator')
                """
            )

        visible_surfaces: dict[str, list[str]] = {}
        for actor in ("owner-a", "website-reader", "approval-reader"):
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(cursor, actor=actor)
                    cursor.execute(
                        """
                        select surface
                        from app_private.workspace_state
                        order by surface
                        """
                    )
                    visible_surfaces[actor] = [str(row[0]) for row in cursor.fetchall()]
        if visible_surfaces["owner-a"] != ["commerce"]:
            raise RehearsalFailure("write_capability_read_denied")
        checks["write_capability_implies_read"] = True
        if (
            visible_surfaces["website-reader"] != ["website"]
            or visible_surfaces["approval-reader"]
        ):
            raise RehearsalFailure("capability_scoped_read_failed")
        checks["capability_scoped_reads"] = True

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

        visible_events: dict[str, list[tuple[str, str]]] = {}
        for actor in ("owner-a", "website-reader", "approval-reader"):
            with runtime.transaction():
                with runtime.cursor() as cursor:
                    _set_identity(cursor, actor=actor)
                    cursor.execute(
                        """
                        select surface, event_type
                        from app_private.workspace_events
                        order by event_type
                        """
                    )
                    visible_events[actor] = [
                        (str(row[0]), str(row[1]))
                        for row in cursor.fetchall()
                    ]
        if (
            visible_events["owner-a"] != [
                ("company", "company.workspace.activated"),
                ("commerce", "order.rehearsed"),
            ]
            or visible_events["website-reader"]
            or visible_events["approval-reader"]
        ):
            raise RehearsalFailure("capability_scoped_event_read_failed")
        checks["capability_scoped_event_reads"] = True

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


def _run_validator(
    runtime_database_url: str,
    storage_audit_database_url: str,
    environment: dict[str, str],
) -> dict[str, Any]:
    validator_environment = dict(environment)
    validator_environment["SUPERMEGA_REHEARSAL_DATABASE_URL"] = runtime_database_url
    validator_environment["SUPERMEGA_STORAGE_AUDIT_DATABASE_URL"] = (
        storage_audit_database_url
    )
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


def _verify_restored_data(
    admin_database_url: str,
    *,
    expected_approval_authority_snapshot: dict[str, Any],
) -> None:
    from supermega_runtime.managed_context import build_managed_context_profile

    approved_context = _managed_activation_request()["approvedAiContext"]
    expected_profile = build_managed_context_profile(
        approved_context,
        workspace_id=MANAGED_WORKSPACE,
        actor_id=MANAGED_OWNER_ACTOR,
    )
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
              (select count(*) from app_private.approval_requests),
              (select state_json #>> '{managedContextProfile,approvedContextDigest}'
               from app_private.workspace_state
               where workspace_id = 'rehearsal-managed' and surface = 'company'),
              (select state_json #>> '{managedContextProfile,profileDigest}'
               from app_private.workspace_state
               where workspace_id = 'rehearsal-managed' and surface = 'company'),
              (select result_json #>> '{state,managedContextProfile,profileDigest}'
               from app_private.workspace_events
               where workspace_id = 'rehearsal-managed'
                 and event_type = 'company.snapshot.saved')
            """
        ).fetchone()
    if row != (
        11,
        11,
        7,
        23,
        3,
        approved_context["contextDigest"],
        expected_profile["profileDigest"],
        expected_profile["profileDigest"],
    ):
        raise RehearsalFailure("restored_data_mismatch")
    restored_approval_authority_snapshot = _approval_authority_snapshot(
        admin_database_url
    )
    if restored_approval_authority_snapshot != expected_approval_authority_snapshot:
        raise RehearsalFailure("restored_approval_authority_mismatch")


def _preflight(postgres_bin: Path, openssl: Path) -> dict[str, Any]:
    environment = _clean_environment(postgres_bin)
    required = ("postgres", "initdb", "pg_ctl", "pg_isready", "psql", "pg_dump", "pg_restore")
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

    # The runtime schema contract is process-scoped for this disposable v11
    # rehearsal. The launcher is a short-lived child process, so this cannot
    # alter the caller or any hosted environment.
    os.environ["SUPERMEGA_TRIAL_SCHEMA_VERSION"] = "11"
    os.environ["SUPERMEGA_OTEL_DISABLED"] = "1"

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
                port=port,
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
            _create_auth_session_fixture(admin_database_url)
            phase = "public_browser_quarantine"
            _create_public_browser_fixture(admin_database_url)
            _apply_public_browser_quarantine(
                postgres_bin=postgres_bin,
                admin_password=admin_password,
                port=port,
                database_name=DATABASE_NAME,
                environment=environment,
            )
            _apply_public_browser_quarantine(
                postgres_bin=postgres_bin,
                admin_password=admin_password,
                port=port,
                database_name=DATABASE_NAME,
                environment=environment,
            )
            _verify_public_browser_quarantine(admin_database_url)
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
            phase = "local_storage_catalog_fixture"
            _bootstrap_local_storage_catalog_fixture(admin_database_url)
            phase = "runtime_seed"
            _seed_rehearsal_data(admin_database_url)
            phase = "database_validation"
            primary_validation = _run_validator(
                runtime_database_url,
                admin_database_url,
                environment,
            )
            phase = "upgrade_and_role_boundaries"
            boundaries = _verify_upgrade_and_role_boundaries(
                runtime_database_url,
                admin_database_url,
            )
            phase = "managed_product_journeys"
            product_journeys = _exercise_managed_product_journeys(
                runtime_database_url,
                admin_database_url,
            )
            phase = "approval_authority"
            (
                approval_authority,
                approval_authority_snapshot,
            ) = _exercise_approval_authority(
                runtime_database_url,
                admin_database_url,
            )
            phase = "runtime_behaviour"
            behaviour = _exercise_runtime(runtime_database_url, admin_database_url)
            phase = "managed_activation_control"
            managed_activation = _exercise_managed_activation_control(
                runtime_database_url,
                admin_database_url,
            )
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
                port=restore_port,
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
            restored_validation = _run_validator(
                restored_runtime_url,
                restore_admin_database_url,
                environment,
            )
            _verify_restored_data(
                restore_admin_database_url,
                expected_approval_authority_snapshot=approval_authority_snapshot,
            )
            _verify_public_browser_quarantine(restore_admin_database_url)

            version = str(preflight["engine"]["version"])
            major = int(preflight["engine"]["major"])
            report = {
                "ok": True,
                "ready": True,
                "status": "rehearsed",
                "contract": CONTRACT,
                "implementation": {
                    "paths": list(IMPLEMENTATION_PATHS),
                    "digest": _implementation_digest(),
                },
                "engine": {
                    "major": major,
                    "version": version,
                    "tls_active": True,
                    "loopback_only": True,
                    "start_mode": (
                        "windows_direct_sandbox"
                        if environment.get("SUPERMEGA_POSTGRES17_WINDOWS_START_MODE")
                        == WINDOWS_DIRECT_START_MODE
                        else "pg_ctl_restricted_token"
                    ),
                },
                "migrations": {
                    "count": len(MIGRATIONS),
                    "schema_version": 11,
                    "production_validator_ready": primary_validation.get("ready") is True,
                },
                "storage": {
                    "catalog_mode": "local_private_fixture",
                    "public_bucket_count": 0,
                    "policy_count": 0,
                    "hosted_storage_privacy_proof_required": True,
                },
                "checks": {
                    "migration_chain_applied": True,
                    "public_browser_quarantine_enforced": True,
                    "public_browser_quarantine_idempotent": True,
                    "dedicated_runtime_role_validated": True,
                    **boundaries,
                    **product_journeys,
                    **approval_authority,
                    **behaviour,
                    **managed_activation,
                    "backup_created": True,
                    "restore_completed": True,
                    "restored_database_validated": restored_validation.get("ready") is True,
                    "restored_data_preserved": True,
                    "restored_public_browser_quarantine_preserved": True,
                },
                "authority": {
                    "actor_identity_source": APPROVAL_IDENTITY_AUTHORITY,
                    "database_authenticates_individual_actors": False,
                    "runtime_credentials_must_remain_server_only": True,
                },
                "recovery": {
                    "format": "pg_dump_custom",
                    "backup_nonempty": True,
                    "restored_schema_version": 11,
                },
                "cleanup_complete": False,
                "secret_values_exposed": False,
                "production_mutated": False,
                "supabase_mutated": False,
                "vercel_mutated": False,
            }
        except RehearsalFailure as exc:
            report = _safe_report(str(exc), cleanup_complete=False)
        except Exception as exc:
            safe_error_type = re.sub(
                r"[^a-z0-9]+",
                "_",
                type(exc).__name__.casefold(),
            ).strip("_") or "unexpected"
            report = _safe_report(
                f"{phase}_{safe_error_type}_failed",
                cleanup_complete=False,
            )
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
