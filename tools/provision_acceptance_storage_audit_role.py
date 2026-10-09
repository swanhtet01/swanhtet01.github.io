#!/usr/bin/env python3
"""Create the temporary acceptance Storage auditor; inspect-only by default.

The login can read only ``storage.buckets`` and PostgreSQL's public catalogs.
An approval record is an audit reference, not proof of owner consent; operators
must verify consent separately. Diagnostics never include connection details.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from typing import Any, Mapping

import provision_supermega_runtime_role as core

ACCEPTANCE_REF = "twflgmlwfkykgzsxnegc"
ROLE = "supermega_storage_audit"
CONTRACT = "supermega.acceptance-storage-audit-role.v1"
EXPECTED_SETTINGS = {
    "default_transaction_read_only=on",
    "lock_timeout=1000",
    "statement_timeout=5000",
}


def _mapping(row: Any) -> Mapping[str, Any]:
    return row if isinstance(row, Mapping) else {}


def validate_approval(record, project_ref, production_ref, now=None):
    now = now or datetime.now(timezone.utc)
    if project_ref == production_ref or project_ref != ACCEPTANCE_REF:
        raise ValueError("acceptance_target_rejected")
    if not isinstance(record, dict):
        raise ValueError("approval_record_invalid")
    if (record.get("contract") != CONTRACT
            or record.get("project_ref") != project_ref
            or record.get("action") != "create_temporary_storage_audit_login"
            or record.get("create_only") is not True
            or not core.APPROVAL_ID_PATTERN.fullmatch(str(record.get("approval_id", "")))):
        raise ValueError("approval_scope_invalid")
    expiry = core.validate_runtime_expiry(record.get("expires_at", ""), now)
    try:
        issued = datetime.fromisoformat(record["issued_at"].replace("Z", "+00:00"))
        if issued.tzinfo is None or not issued <= now < expiry:
            raise ValueError()
        if (expiry - issued).total_seconds() > 86400:
            raise ValueError()
    except (KeyError, TypeError, ValueError):
        raise ValueError("approval_time_invalid") from None
    return expiry


def inspect_role(connection) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("set transaction read only")
        cursor.execute(
            """
            with audit_role as (select * from pg_roles where rolname = %s)
            select current_setting('server_version_num')::integer as server_version_num,
                   coalesce((select ssl from pg_stat_ssl where pid = pg_backend_pid()), false) as tls_active,
                   current_user = session_user as session_role_stable,
                   coalesce((select rolcreaterole or rolsuper from pg_roles where rolname = current_user), false) as can_create_role,
                   exists(select 1 from audit_role) as role_exists,
                   (select rolvaliduntil from audit_role) as valid_until,
                   coalesce((select rolcanlogin and rolinherit and not rolsuper and not rolbypassrls
                     and not rolcreaterole and not rolcreatedb and not rolreplication from audit_role), false) as attributes_safe,
                   not exists (
                     select 1 from audit_role r join pg_auth_members m on m.member = r.oid
                   ) as no_parent_memberships,
                   not exists (
                     select 1 from audit_role r join pg_shdepend d
                       on d.refclassid = 'pg_authid'::regclass and d.refobjid = r.oid and d.deptype = 'o'
                   ) as owns_no_objects
            """,
            (ROLE,),
        )
        identity = _mapping(cursor.fetchone())
        cursor.execute(
            """
            with audit_role as (select oid from pg_roles where rolname = %s),
            direct_schema as (
              select n.nspname as object_name, lower(x.privilege_type) as privilege
              from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x
              where x.grantee = (select oid from audit_role)
            ), direct_relation as (
              select n.nspname || '.' || c.relname as object_name, lower(x.privilege_type) as privilege
              from pg_class c join pg_namespace n on n.oid = c.relnamespace
              cross join lateral aclexplode(coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 'S'::\"char\" else 'r'::\"char\" end, c.relowner))) x
              where x.grantee = (select oid from audit_role)
            ), direct_database as (
              select d.datname as object_name, lower(x.privilege_type) as privilege
              from pg_database d cross join lateral aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) x
              where x.grantee = (select oid from audit_role)
            )
            select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'object', object_name, 'privilege', privilege)
                                      order by kind, object_name, privilege), '[]'::jsonb) as grants
            from (
              select 'schema'::text as kind, * from direct_schema
              union all select 'relation', * from direct_relation
              union all select 'database', * from direct_database
            ) grants
            """,
            (ROLE,),
        )
        grants = list(_mapping(cursor.fetchone()).get("grants") or [])
        cursor.execute(
            """
            select setting
            from pg_db_role_setting role_setting
            cross join lateral unnest(role_setting.setconfig) setting
            where role_setting.setrole = (select oid from pg_roles where rolname = %s)
              and role_setting.setdatabase = 0
            """,
            (ROLE,),
        )
        settings = {str(_mapping(row).get("setting", "")) for row in cursor.fetchall()}
    exists = identity.get("role_exists") is True
    expiry = identity.get("valid_until")
    now = datetime.now(timezone.utc)
    expiry_safe = (not exists) or (
        isinstance(expiry, datetime)
        and expiry.tzinfo is not None
        and now < expiry.astimezone(timezone.utc) <= now + timedelta(hours=24)
    )
    expected_grants = {
        ("schema", "storage", "usage"),
        ("relation", "storage.buckets", "select"),
    }
    actual_grants = {(str(g.get("kind")), str(g.get("object")), str(g.get("privilege"))) for g in grants}
    checks = {
        "postgres_major_17": int(identity.get("server_version_num", 0)) // 10_000 == 17,
        "encrypted_connection": identity.get("tls_active") is True,
        "session_role_stable": identity.get("session_role_stable") is True,
        "admin_can_create_role": identity.get("can_create_role") is True,
        "attributes_safe": (not exists) or identity.get("attributes_safe") is True,
        "valid_until_within_24_hours": expiry_safe,
        "no_parent_memberships": identity.get("no_parent_memberships") is True,
        "owns_no_objects": identity.get("owns_no_objects") is True,
        "grants_exact": (not exists and not actual_grants) or actual_grants == expected_grants,
        "settings_exact": (not exists and not settings) or settings == EXPECTED_SETTINGS,
    }
    failed = sorted(name for name, passed in checks.items() if not passed)
    return {"ready": not failed, "role_exists": exists, "checks": checks, "failed_checks": failed}


def apply_role(connection, password: str, *, valid_until: str, create_only: bool = True) -> None:
    if not create_only:
        raise ValueError("create_only_required")
    if len(password) < 24 or len(password) > 1024:
        raise ValueError("audit_password_length_invalid")
    expiry = core.validate_runtime_expiry(valid_until)
    before = inspect_role(connection)
    if before["role_exists"]:
        raise ValueError("audit_role_creation_collision")
    if not before["ready"]:
        raise ValueError("audit_role_preflight_failed")
    try:
        from psycopg import sql
    except ImportError as exc:
        raise ValueError("postgres_driver_missing") from exc
    connection.rollback()
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute("select pg_advisory_xact_lock(hashtextextended(%s, 0))", (CONTRACT,))
            cursor.execute("select exists(select 1 from pg_roles where rolname = %s) as present", (ROLE,))
            if _mapping(cursor.fetchone()).get("present") is not False:
                raise ValueError("audit_role_creation_collision")
            cursor.execute(sql.SQL(
                "create role {} login inherit nosuperuser nocreatedb nocreaterole noreplication "
                "nobypassrls password {} valid until {}"
            ).format(sql.Identifier(ROLE), sql.Literal(password), sql.Literal(expiry.isoformat())))
            cursor.execute(sql.SQL("alter role {} set default_transaction_read_only = on").format(sql.Identifier(ROLE)))
            cursor.execute(sql.SQL("alter role {} set statement_timeout = '5000'").format(sql.Identifier(ROLE)))
            cursor.execute(sql.SQL("alter role {} set lock_timeout = '1000'").format(sql.Identifier(ROLE)))
            cursor.execute(sql.SQL("grant usage on schema storage to {}").format(sql.Identifier(ROLE)))
            cursor.execute(sql.SQL("grant select on table storage.buckets to {}").format(sql.Identifier(ROLE)))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-project-ref", required=True)
    parser.add_argument("--approval-file", default="")
    parser.add_argument("--admin-database-url-file", default="")
    parser.add_argument("--audit-password-file", default="")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    mutation = False
    attempted = False
    try:
        core._assert_package_guard_committed()
        guard = core._load_target_guard()
        if args.expected_project_ref == guard.production_project_ref or args.expected_project_ref != ACCEPTANCE_REF:
            raise ValueError("acceptance_target_rejected")
        record = None
        if args.apply:
            record = json.loads(Path(args.approval_file).read_text(encoding="utf-8"))
            validate_approval(record, args.expected_project_ref, guard.production_project_ref)
        url = core._read_secret(args.admin_database_url_file, "SUPERMEGA_ACCEPTANCE_ADMIN_URL", "admin_url")
        core.validate_admin_target(url, args.expected_project_ref)
        with core._connect(url) as connection:
            connection.execute("BEGIN READ ONLY")
            before = inspect_role(connection)
            connection.rollback()
            if args.apply:
                expiry = validate_approval(record, args.expected_project_ref, guard.production_project_ref)
                password = core._read_secret(args.audit_password_file, "SUPERMEGA_ACCEPTANCE_STORAGE_AUDIT_PASSWORD", "audit_password")
                try:
                    attempted = True
                    apply_role(connection, password, valid_until=expiry.isoformat(), create_only=True)
                    mutation = True
                finally:
                    password = ""
                after = inspect_role(connection)
                if not after["ready"] or not after["role_exists"]:
                    raise ValueError("postcondition_failed")
            else:
                after = before
        print(json.dumps({"contract": CONTRACT, "status": "provisioned" if mutation else "inspected",
                          "role_exists": after["role_exists"], "ready": after["ready"],
                          "external_mutation_performed": mutation}))
        return 0
    except Exception:
        print(json.dumps({"contract": CONTRACT, "status": "failed",
                          "external_mutation_performed": True if mutation else (None if attempted else False)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
