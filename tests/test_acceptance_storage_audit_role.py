import contextlib
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import provision_acceptance_storage_audit_role as module


class AcceptanceStorageAuditRoleTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 1, tzinfo=timezone.utc)
        self.record = dict(contract=module.CONTRACT, project_ref=module.ACCEPTANCE_REF,
                           action="create_temporary_storage_audit_login", create_only=True,
                           approval_id="123e4567-e89b-42d3-a456-426614174000",
                           issued_at=self.now.isoformat(),
                           expires_at=(self.now + timedelta(hours=1)).isoformat())

    def test_approval_is_exact_short_lived_and_nonproduction(self):
        expiry = module.validate_approval(self.record, module.ACCEPTANCE_REF,
                                          "zvtzwcimpvvtkowflhda", self.now)
        self.assertEqual(expiry, self.now + timedelta(hours=1))
        changes = [("action", "rotate"), ("create_only", False),
                   ("project_ref", "other"), ("contract", "other")]
        for key, value in changes:
            with self.subTest(key=key), self.assertRaises(ValueError):
                module.validate_approval({**self.record, key: value}, module.ACCEPTANCE_REF,
                                         "zvtzwcimpvvtkowflhda", self.now)
        with self.assertRaises(ValueError):
            module.validate_approval(self.record, module.ACCEPTANCE_REF,
                                     module.ACCEPTANCE_REF, self.now)

    def test_apply_is_create_only_and_uses_exact_minimum_grants(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {"present": False}
        with patch.object(module, "inspect_role", return_value={"role_exists": False, "ready": True}), \
             patch.object(module.core, "validate_runtime_expiry", return_value=self.now + timedelta(hours=1)), \
             patch("psycopg.sql") as sql:
            sql.SQL.side_effect = lambda value: value
            sql.Identifier.side_effect = lambda value: value
            sql.Literal.side_effect = lambda value: value
            module.apply_role(connection, "x" * 32,
                              valid_until=(self.now + timedelta(hours=1)).isoformat())
        statements = [str(call.args[0]).lower() for call in cursor.execute.call_args_list]
        self.assertTrue(any("grant usage on schema storage" in item for item in statements))
        self.assertTrue(any("grant select on table storage.buckets" in item for item in statements))
        self.assertFalse(any("pg_read_all_data" in item or "storage.objects" in item for item in statements))
        self.assertTrue(any("default_transaction_read_only" in item for item in statements))

    def test_failure_never_echoes_secret(self):
        output = io.StringIO()
        with patch.object(module.core, "_assert_package_guard_committed", side_effect=RuntimeError("PRIVATE_SENTINEL")), \
             contextlib.redirect_stdout(output):
            self.assertEqual(module.main(["--expected-project-ref", module.ACCEPTANCE_REF]), 2)
        self.assertNotIn("PRIVATE_SENTINEL", output.getvalue())
        self.assertFalse(json.loads(output.getvalue())["external_mutation_performed"])

    def test_inspection_is_default_and_apply_rechecks_expiry(self):
        for applying in (False, True):
            connection = MagicMock()
            connection.__enter__.return_value = connection
            states = ([{"role_exists": False, "ready": True},
                       {"role_exists": True, "ready": True}] if applying
                      else [{"role_exists": False, "ready": True}])
            output = io.StringIO()
            with patch.object(module.core, "_assert_package_guard_committed"), \
                 patch.object(module.core, "_load_target_guard", return_value=module.core.TargetGuard("zvtzwcimpvvtkowflhda", "protected-unapproved")), \
                 patch.object(module.Path, "read_text", return_value=json.dumps(self.record)), \
                 patch.object(module, "validate_approval", return_value=self.now + timedelta(hours=1)) as approval, \
                 patch.object(module.core, "_read_secret", return_value="PRIVATE_SENTINEL") as secret, \
                 patch.object(module.core, "validate_admin_target"), \
                 patch.object(module.core, "_connect", return_value=connection), \
                 patch.object(module, "inspect_role", side_effect=states), \
                 patch.object(module, "apply_role") as apply, \
                 contextlib.redirect_stdout(output):
                args = ["--expected-project-ref", module.ACCEPTANCE_REF]
                if applying:
                    args += ["--apply", "--approval-file", "approval.json"]
                self.assertEqual(module.main(args), 0)
            self.assertEqual(apply.call_count, int(applying))
            self.assertEqual(approval.call_count, 2 if applying else 0)
            self.assertEqual(secret.call_count, 2 if applying else 1)
            self.assertNotIn("PRIVATE_SENTINEL", output.getvalue())


if __name__ == "__main__":
    unittest.main()
