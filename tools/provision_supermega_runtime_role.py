#!/usr/bin/env python3
"""Provision SuperMega's least-privilege managed-runtime login.

The command is read-only unless ``--apply`` is supplied. Production mutation is
additionally bound to the reviewed project ref/status in package.json, an exact
UUID approval, and ``--production-handoff``. Secrets are accepted only through
an ignored file or a process-scoped environment variable.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import unquote, urlsplit

from validate_supermega_database_url import (
    AuditConfigurationError,
    validate_supabase_activation_target,
)


RUNTIME_ROLE = "supermega_trial_login"
BACKEND_ROLE = "supermega_trial_backend"
CONTRACT = "supermega.runtime_role_provisioning.v1"
PROJECT_REF_PATTERN = re.compile(r"^[a-z0-9]{20}$")
APPROVAL_ID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_PATH = REPO_ROOT / "package.json"


class ProvisioningFailure(RuntimeError):
    pass


@dataclass(frozen=True)
class TargetGuard:
    production_project_ref: str
    production_target_status: str


def _read_secret(file_value: str, environment_key: str, label: str) -> str:
    if file_value.strip():
        path = Path(file_value).resolve(strict=True)
        if not path.is_file() or path.stat().st_size > 16_384:
            raise ProvisioningFailure(f"{label}_file_invalid")
        value = path.read_text(encoding="utf-8").strip()
    else:
        value = os.environ.get(environment_key, "").strip()
    if not value:
        raise ProvisioningFailure(f"{label}_missing")
    return value


def _load_target_guard() -> TargetGuard:
    try:
        package = json.loads(PACKAGE_PATH.read_text(encoding="utf-8"))
        config = package["supermega"]
        project_ref = str(config["productionSupabaseProjectRef"])
        status = str(config["productionSupabaseTargetStatus"])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ProvisioningFailure("production_target_guard_invalid") from exc
    if not PROJECT_REF_PATTERN.fullmatch(project_ref):
        raise ProvisioningFailure("production_project_ref_invalid")
    if status not in {"protected-unapproved", "activation-approved"}:
        raise ProvisioningFailure("production_target_status_invalid")
    return TargetGuard(project_ref, status)


def _assert_package_guard_committed() -> None:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "status", "--porcelain", "--", "package.json"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode or result.stdout.strip():
        raise ProvisioningFailure("production_target_guard_not_committed")


def validate_admin_target(database_url: str, expected_project_ref: str) -> str:
    try:
        mode = validate_supabase_activation_target(
            database_url,
            expected_project_ref=expected_project_ref,
        )
    except AuditConfigurationError as exc:
        raise ProvisioningFailure(exc.code) from exc
    if mode == "transaction_pooler":
        raise ProvisioningFailure("admin_transaction_pooler_not_allowed")
    parsed = urlsplit(database_url)
    username = unquote(parsed.username or "")
    expected_username = (
        "postgres" if mode == "direct" else f"postgres.{expected_project_ref}"
    )
    if username != expected_username:
        raise ProvisioningFailure("admin_postgres_login_required")
    return mode


def authorize_target(
    *,
    expected_project_ref: str,
    apply: bool,
    production_handoff: bool,
    approval_id: str,
    guard: TargetGuard,
) -> None:
    if not PROJECT_REF_PATTERN.fullmatch(expected_project_ref):
        raise ProvisioningFailure("expected_project_ref_invalid")
    is_production = expected_project_ref == guard.production_project_ref
    if not apply:
        return
    if not production_handoff:
        raise ProvisioningFailure("apply_requires_production_handoff")
    if not APPROVAL_ID_PATTERN.fullmatch(approval_id):
        raise ProvisioningFailure("apply_requires_reviewed_approval_id")
    if is_production and guard.production_target_status != "activation-approved":
        raise ProvisioningFailure("production_target_not_activation_approved")
    if not is_production:
        raise ProvisioningFailure("apply_target_not_reviewed_production")


def _mapping(row: Any) -> Mapping[str, Any]:
    return row if isinstance(row, Mapping) else {}


def inspect_runtime_role(connection: Any) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("set transaction read only")
        cursor.execute(
            """
            with backend as (
              select * from pg_roles where rolname = 'supermega_trial_backend'
            ), runtime as (
              select * from pg_roles where rolname = 'supermega_trial_login'
            )
            select
              current_setting('server_version_num')::integer as server_version_num,
              coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active,
              current_user = session_user as session_role_stable,
              coalesce((select rolcreaterole or rolsuper from pg_roles where rolname = current_user), false) as can_create_role,
              exists(select 1 from backend) as backend_exists,
              coalesce((select not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication from backend), false) as backend_safe,
              exists(select 1 from runtime) as runtime_exists,
              coalesce((select rolcanlogin and rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication from runtime), false) as runtime_attributes_safe,
              not exists (
                select 1 from runtime
                join pg_shdepend dependency on dependency.refclassid = 'pg_authid'::regclass
                  and dependency.refobjid = runtime.oid and dependency.deptype in ('a', 'o')
              ) as runtime_has_no_acl_or_ownership,
              not exists (
                select 1 from runtime
                join pg_auth_members membership on membership.member = runtime.oid
                join pg_roles parent on parent.oid = membership.roleid
                where parent.rolname <> 'supermega_trial_backend'
              ) as runtime_has_no_unexpected_parent,
              not exists (
                select 1 from runtime
                join pg_db_role_setting setting on setting.setrole = runtime.oid
              ) as runtime_settings_empty
            """
        )
        identity = _mapping(cursor.fetchone())
        cursor.execute(
            """
            select membership.admin_option,
                   membership.inherit_option,
                   membership.set_option
            from pg_auth_members membership
            join pg_roles parent on parent.oid = membership.roleid
            join pg_roles member on member.oid = membership.member
            where parent.rolname = 'supermega_trial_backend'
              and member.rolname = 'supermega_trial_login'
            """
        )
        memberships = list(cursor.fetchall())
    membership_safe = len(memberships) == 1 and all(
        _mapping(membership).get("admin_option") is False
        and _mapping(membership).get("inherit_option") is True
        and _mapping(membership).get("set_option") is False
        for membership in memberships
    )
    runtime_exists = identity.get("runtime_exists") is True
    checks = {
        "postgres_major_17": int(identity.get("server_version_num", 0)) // 10_000 == 17,
        "encrypted_connection": identity.get("tls_active") is True,
        "session_role_stable": identity.get("session_role_stable") is True,
        "admin_can_create_role": identity.get("can_create_role") is True,
        "backend_role_safe": identity.get("backend_exists") is True and identity.get("backend_safe") is True,
        "runtime_attributes_safe": (not runtime_exists) or identity.get("runtime_attributes_safe") is True,
        "runtime_has_no_acl_or_ownership": identity.get("runtime_has_no_acl_or_ownership") is True,
        "runtime_has_no_unexpected_parent": identity.get("runtime_has_no_unexpected_parent") is True,
        "runtime_settings_empty": identity.get("runtime_settings_empty") is True,
        "runtime_membership_safe": (not runtime_exists) or membership_safe,
    }
    failed = sorted(name for name, passed in checks.items() if not passed)
    return {
        "ready": not failed,
        "runtime_exists": runtime_exists,
        "checks": checks,
        "failed_checks": failed,
    }


def _assert_runtime_role_postconditions(cursor: Any) -> None:
    cursor.execute(
        """
        with runtime as (
          select * from pg_roles where rolname = 'supermega_trial_login'
        ), exact_membership as (
          select membership.*
          from runtime
          join pg_auth_members membership on membership.member = runtime.oid
          join pg_roles parent on parent.oid = membership.roleid
          where parent.rolname = 'supermega_trial_backend'
        )
        select
          coalesce((select rolcanlogin and rolinherit and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication from runtime), false)
          and (select count(*) = 1 and bool_and(not admin_option and inherit_option and not set_option) from exact_membership)
          and not exists (
            select 1 from runtime
            join pg_auth_members membership on membership.member = runtime.oid
            join pg_roles parent on parent.oid = membership.roleid
            where parent.rolname <> 'supermega_trial_backend'
          )
          and not exists (
            select 1 from runtime
            join pg_shdepend dependency on dependency.refclassid = 'pg_authid'::regclass
              and dependency.refobjid = runtime.oid and dependency.deptype in ('a', 'o')
          )
          and not exists (
            select 1 from runtime
            join pg_db_role_setting setting on setting.setrole = runtime.oid
          ) as safe
        """
    )
    if _mapping(cursor.fetchone()).get("safe") is not True:
        raise ProvisioningFailure("runtime_role_atomic_postcondition_failed")


def apply_runtime_role(connection: Any, runtime_password: str) -> None:
    if len(runtime_password) < 24 or len(runtime_password) > 1024:
        raise ProvisioningFailure("runtime_password_length_invalid")
    try:
        from psycopg import sql
    except ImportError as exc:
        raise ProvisioningFailure("postgres_driver_missing") from exc
    before = inspect_runtime_role(connection)
    unsafe = [
        item
        for item in before["failed_checks"]
        if item not in {
            "runtime_attributes_safe",
            "runtime_membership_safe",
            "runtime_settings_empty",
        }
    ]
    if unsafe:
        raise ProvisioningFailure("runtime_role_preflight_failed:" + ",".join(unsafe))
    connection.rollback()
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (CONTRACT,))
            if before["runtime_exists"]:
                cursor.execute(
                    sql.SQL(
                        "alter role {} login inherit nosuperuser nocreatedb nocreaterole "
                        "noreplication nobypassrls password {}"
                    ).format(sql.Identifier(RUNTIME_ROLE), sql.Literal(runtime_password))
                )
                cursor.execute(sql.SQL("alter role {} reset all").format(sql.Identifier(RUNTIME_ROLE)))
            else:
                cursor.execute(
                    sql.SQL(
                        "create role {} login inherit nosuperuser nocreatedb nocreaterole "
                        "noreplication nobypassrls password {}"
                    ).format(sql.Identifier(RUNTIME_ROLE), sql.Literal(runtime_password))
                )
            cursor.execute(
                sql.SQL(
                    "grant {} to {} with inherit true, set false, admin false"
                ).format(sql.Identifier(BACKEND_ROLE), sql.Identifier(RUNTIME_ROLE))
            )
            _assert_runtime_role_postconditions(cursor)


def _connect(database_url: str) -> Any:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise ProvisioningFailure("postgres_driver_missing") from exc
    return psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=8,
        application_name="supermega-runtime-role-provisioner",
        options="-c statement_timeout=10000 -c lock_timeout=2000",
    )


def _write_evidence(path_value: str, report: Mapping[str, Any]) -> None:
    if not path_value.strip():
        return
    path = Path(path_value).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-database-url-file", default="")
    parser.add_argument("--runtime-password-file", default="")
    parser.add_argument("--expected-project-ref", required=True)
    parser.add_argument("--approval-id", default="")
    parser.add_argument("--production-handoff", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--evidence-output", default="")
    args = parser.parse_args(argv)

    try:
        _assert_package_guard_committed()
        guard = _load_target_guard()
        authorize_target(
            expected_project_ref=args.expected_project_ref,
            apply=args.apply,
            production_handoff=args.production_handoff,
            approval_id=args.approval_id,
            guard=guard,
        )
        admin_url = _read_secret(
            args.admin_database_url_file,
            "SUPERMEGA_ADMIN_DATABASE_URL_TO_PROVISION",
            "admin_database_url",
        )
        connection_mode = validate_admin_target(admin_url, args.expected_project_ref)
        with _connect(admin_url) as connection:
            before = inspect_runtime_role(connection)
            if args.apply:
                password = _read_secret(
                    args.runtime_password_file,
                    "SUPERMEGA_RUNTIME_PASSWORD_TO_PROVISION",
                    "runtime_password",
                )
                try:
                    apply_runtime_role(connection, password)
                finally:
                    password = ""
                after = inspect_runtime_role(connection)
                if not after["ready"] or not after["runtime_exists"]:
                    raise ProvisioningFailure("runtime_role_postcondition_failed")
            else:
                after = before
        if after["failed_checks"]:
            status = "blocked"
        elif args.apply:
            status = "provisioned"
        elif after["runtime_exists"]:
            status = "ready"
        else:
            status = "provisioning_required"
        report = {
            "contract": CONTRACT,
            "status": status,
            "target_project_ref": args.expected_project_ref,
            "connection_mode": connection_mode,
            "apply_requested": args.apply,
            "external_mutation_performed": args.apply,
            "runtime_role": RUNTIME_ROLE,
            "runtime_exists": after["runtime_exists"],
            "checks": after["checks"],
            "failed_checks": after["failed_checks"],
            "secret_values_exposed": False,
        }
        _write_evidence(args.evidence_output, report)
        print(json.dumps(report, sort_keys=True))
        return 0 if status in {"ready", "provisioning_required", "provisioned"} else 2
    except (OSError, ProvisioningFailure) as exc:
        print(json.dumps({"contract": CONTRACT, "status": "blocked", "error": str(exc), "external_mutation_performed": False, "secret_values_exposed": False}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
