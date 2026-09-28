"""Create a temporary acceptance login; inspect-only unless explicitly applied.

An approval record is an audit reference, not proof of owner consent. The operator
must verify that consent separately. Never generate an approval to authorize self.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import provision_supermega_runtime_role as core

ACCEPTANCE_REF = "twflgmlwfkykgzsxnegc"
CONTRACT = "supermega.acceptance-runtime-role.v1"


def validate_approval(record, project_ref, production_ref, now=None):
    now = now or datetime.now(timezone.utc)
    if project_ref == production_ref or project_ref != ACCEPTANCE_REF:
        raise ValueError("acceptance_target_rejected")
    if not isinstance(record, dict):
        raise ValueError("approval_record_invalid")
    if (record.get("contract") != CONTRACT
            or record.get("project_ref") != project_ref
            or record.get("action") != "create_temporary_runtime_login"
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


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-project-ref", required=True)
    parser.add_argument("--approval-file", default="")
    parser.add_argument("--admin-database-url-file", default="")
    parser.add_argument("--runtime-password-file", default="")
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
            # Enforce inspection safety at the database, including through a
            # pooler that may ignore connection startup options.
            connection.execute("BEGIN READ ONLY")
            before = core.inspect_runtime_role(connection)
            connection.rollback()
            if args.apply:
                # Recheck immediately before mutation; a slow connect must not
                # extend the recorded authorization window.
                expiry = validate_approval(record, args.expected_project_ref, guard.production_project_ref)
                password = core._read_secret(args.runtime_password_file, "SUPERMEGA_ACCEPTANCE_RUNTIME_PASSWORD", "runtime_password")
                try:
                    attempted = True
                    core.apply_runtime_role(connection, password, valid_until=expiry.isoformat(), create_only=True)
                    mutation = True
                finally:
                    password = ""
                after = core.inspect_runtime_role(connection)
                if not after["ready"] or not after["runtime_exists"]:
                    raise ValueError("postcondition_failed")
            else:
                after = before
        print(json.dumps({"contract": CONTRACT, "status": "provisioned" if mutation else "inspected",
                          "runtime_exists": after["runtime_exists"], "ready": after["ready"],
                          "external_mutation_performed": mutation}))
        return 0
    except Exception:
        # Driver errors can contain connection strings. Never echo exception text.
        print(json.dumps({"contract": CONTRACT, "status": "failed",
                          "external_mutation_performed": True if mutation else (None if attempted else False)}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
