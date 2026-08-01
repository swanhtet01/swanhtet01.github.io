from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

from tools.manage_workspace_recovery import (
    EXPECTED_SCHEMA_VERSION,
    RecoveryError,
    build_package,
    build_restore_plan,
    export_workspace,
    read_package,
    verify_package,
    write_package,
)


def fixture_sections(workspace_id: str = "client-one"):
    return {
        "workspace_memberships": [
            {
                "workspace_id": workspace_id,
                "actor_id": "owner@example.com",
                "actor_kind": "human",
                "capabilities": ["commerce.read"],
            }
        ],
        "workspace_state": [
            {
                "workspace_id": workspace_id,
                "surface": "commerce",
                "version": 7,
                "state_json": {"orders": [{"id": "SO-1", "total": 125000}]},
            }
        ],
        "workspace_events": [
            {
                "workspace_id": workspace_id,
                "event_id": "00000000-0000-0000-0000-000000000001",
                "created_at": datetime(2026, 7, 29, 1, 2, 3, tzinfo=timezone.utc),
            }
        ],
        "approval_requests": [],
    }


class WorkspaceRecoveryTests(unittest.TestCase):
    def build(self, workspace_id: str = "client-one"):
        return build_package(
            workspace_id=workspace_id,
            schema_version=EXPECTED_SCHEMA_VERSION,
            sections=fixture_sections(workspace_id),
            exported_at=datetime(2026, 7, 29, tzinfo=timezone.utc),
        )

    def test_package_is_deterministic_and_verifiable(self):
        first = self.build()
        second = self.build()
        self.assertEqual(first, second)
        result = verify_package(first)
        self.assertTrue(result["valid"])
        self.assertEqual(result["counts"]["workspace_state"], 1)
        self.assertTrue(result["integrity_sha256"].startswith("sha256:"))

    def test_cross_workspace_row_is_rejected(self):
        rows = fixture_sections()
        rows["workspace_state"][0]["workspace_id"] = "client-two"
        with self.assertRaisesRegex(RecoveryError, "workspace_state_workspace_scope_mismatch"):
            build_package(
                workspace_id="client-one",
                schema_version=EXPECTED_SCHEMA_VERSION,
                sections=rows,
            )

    def test_tampering_and_unknown_fields_are_rejected(self):
        tampered = json.loads(json.dumps(self.build()))
        tampered["sections"]["workspace_state"][0]["version"] = 99
        with self.assertRaisesRegex(RecoveryError, "workspace_recovery_section_digest_invalid"):
            verify_package(tampered)
        unknown = self.build()
        unknown["database_url"] = "must-not-appear"
        with self.assertRaisesRegex(RecoveryError, "workspace_recovery_package_shape_invalid"):
            verify_package(unknown)

    def test_credential_shaped_fields_are_rejected(self):
        rows = fixture_sections()
        rows["workspace_state"][0]["state_json"]["apiKey"] = "must-not-export"
        with self.assertRaisesRegex(RecoveryError, "workspace_recovery_secret_field_detected"):
            build_package(
                workspace_id="client-one",
                schema_version=EXPECTED_SCHEMA_VERSION,
                sections=rows,
            )

    def test_atomic_file_refuses_overwrite_and_round_trips(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "client-one-recovery.json"
            write_package(destination, self.build())
            self.assertGreater(destination.stat().st_size, 0)
            self.assertEqual(read_package(destination), self.build())
            with self.assertRaisesRegex(RecoveryError, "workspace_recovery_output_exists"):
                write_package(destination, self.build())

    def test_restore_plan_is_explicitly_read_only(self):
        plan = build_restore_plan(self.build(), destination_workspace="client-one-recovered")
        self.assertFalse(plan["write_performed"])
        self.assertIn("fresh_pre_restore_backup", plan["required_gates"])
        self.assertEqual(
            plan["transaction_order"],
            ["workspace_memberships", "workspace_state", "workspace_events", "approval_requests"],
        )

    def test_bad_workspace_and_row_limit_fail_closed(self):
        with self.assertRaisesRegex(RecoveryError, "workspace_id_invalid"):
            self.build("../unsafe")
        with self.assertRaisesRegex(RecoveryError, "workspace_recovery_row_limit_invalid"):
            build_package(
                workspace_id="client-one",
                schema_version=EXPECTED_SCHEMA_VERSION,
                sections=fixture_sections(),
                max_rows_per_section=0,
            )

    def test_database_export_is_read_only_scoped_and_closed(self):
        sections = fixture_sections()

        class Cursor:
            def __init__(self):
                self.executed = []
                self.current = ""

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, query, parameters=None):
                self.current = " ".join(str(query).split())
                self.executed.append((self.current, parameters))

            def fetchone(self):
                if "trial_schema_meta" in self.current:
                    return {"schema_version": EXPECTED_SCHEMA_VERSION}
                if "pg_roles" in self.current:
                    return {"recovery_authority": True}
                raise AssertionError(self.current)

            def fetchall(self):
                for section, rows in sections.items():
                    if f"app_private.{section}" in self.current:
                        return [{"row_json": row} for row in rows]
                raise AssertionError(self.current)

        class Connection:
            def __init__(self):
                self.cursor_instance = Cursor()
                self.closed = False

            def transaction(self):
                return self

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def cursor(self):
                return self.cursor_instance

            def close(self):
                self.closed = True

        connection = Connection()
        package = export_workspace(
            database_url="postgresql://not-logged:not-logged@example.invalid/postgres?sslmode=require",
            workspace_id="client-one",
            connection_factory=lambda _url: connection,
        )
        self.assertTrue(connection.closed)
        statements = connection.cursor_instance.executed
        self.assertEqual(statements[0][0], "set transaction read only")
        scoped_queries = [entry for entry in statements if "where workspace_id = %s" in entry[0]]
        self.assertEqual(len(scoped_queries), 4)
        self.assertTrue(all(entry[1][0] == "client-one" for entry in scoped_queries))
        self.assertEqual(package["counts"]["workspace_events"], 1)


if __name__ == "__main__":
    unittest.main()
