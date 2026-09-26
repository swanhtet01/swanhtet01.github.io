import contextlib
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import provision_acceptance_runtime_role as module


class AcceptanceRoleTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 27, tzinfo=timezone.utc)
        self.record = dict(contract=module.CONTRACT, project_ref=module.ACCEPTANCE_REF,
                           action="create_temporary_runtime_login", create_only=True,
                           approval_id="123e4567-e89b-42d3-a456-426614174000",
                           issued_at=self.now.isoformat(),
                           expires_at=(self.now + timedelta(hours=1)).isoformat())

    def validate(self, record=None, target=None, production="zvtzwcimpvvtkowflhda"):
        return module.validate_approval(self.record if record is None else record,
                                       target or module.ACCEPTANCE_REF, production, self.now)

    def test_exact_scope_is_accepted(self):
        self.assertEqual(self.validate(), self.now + timedelta(hours=1))

    def test_production_and_other_targets_rejected(self):
        for target, production in [(module.ACCEPTANCE_REF, module.ACCEPTANCE_REF),
                                   ("abcdefghijklmnopqrst", "zvtzwcimpvvtkowflhda")]:
            with self.subTest(target=target), self.assertRaises(ValueError):
                self.validate(target=target, production=production)

    def test_scope_substitution_rejected(self):
        for key, value in [("project_ref", "wrong"), ("create_only", False),
                           ("action", "rotate"), ("approval_id", ""), ("contract", "other")]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate({**self.record, key: value})

    def test_expired_future_and_naive_times_rejected(self):
        cases = [{"expires_at": self.now.isoformat()},
                 {"issued_at": (self.now + timedelta(minutes=1)).isoformat()},
                 {"issued_at": "2026-09-27T00:00:00"},
                 {"issued_at": (self.now - timedelta(days=2)).isoformat()}]
        for change in cases:
            with self.subTest(change=change), self.assertRaises(Exception):
                self.validate({**self.record, **change})

    def test_failure_output_never_echoes_secret(self):
        output = io.StringIO()
        with patch.object(module.core, "_assert_package_guard_committed", side_effect=RuntimeError("PRIVATE_SENTINEL")), contextlib.redirect_stdout(output):
            self.assertEqual(module.main(["--expected-project-ref", module.ACCEPTANCE_REF]), 2)
        self.assertNotIn("PRIVATE_SENTINEL", output.getvalue())
        self.assertFalse(json.loads(output.getvalue())["external_mutation_performed"])

    def test_apply_is_create_only_and_commit_error_is_unknown(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        output = io.StringIO()
        with patch.object(module.core, "_assert_package_guard_committed"), \
             patch.object(module.core, "_load_target_guard", return_value=module.core.TargetGuard("zvtzwcimpvvtkowflhda", "protected-unapproved")), \
             patch.object(module.Path, "read_text", return_value=json.dumps(self.record)), \
             patch.object(module, "validate_approval", return_value=self.now + timedelta(hours=1)), \
             patch.object(module.core, "_read_secret", return_value="PRIVATE_SENTINEL"), \
             patch.object(module.core, "validate_admin_target"), \
             patch.object(module.core, "_connect", return_value=connection), \
             patch.object(module.core, "inspect_runtime_role", return_value={"runtime_exists": False, "ready": False}), \
             patch.object(module.core, "apply_runtime_role", side_effect=RuntimeError("PRIVATE_SENTINEL")) as apply, \
             contextlib.redirect_stdout(output):
            self.assertEqual(module.main(["--expected-project-ref", module.ACCEPTANCE_REF, "--approval-file", "approval.json", "--apply"]), 2)
        self.assertTrue(apply.call_args.kwargs["create_only"])
        self.assertEqual(apply.call_args.kwargs["valid_until"], (self.now + timedelta(hours=1)).isoformat())
        self.assertIsNone(json.loads(output.getvalue())["external_mutation_performed"])
        self.assertNotIn("PRIVATE_SENTINEL", output.getvalue())

    def test_inspection_and_successful_apply_dispatch(self):
        for applying in (False, True):
            with self.subTest(applying=applying), contextlib.ExitStack() as stack:
                output = io.StringIO()
                connection = MagicMock()
                connection.__enter__.return_value = connection
                stack.enter_context(contextlib.redirect_stdout(output))
                stack.enter_context(patch.object(module.core, "_assert_package_guard_committed"))
                stack.enter_context(patch.object(module.core, "_load_target_guard", return_value=module.core.TargetGuard("zvtzwcimpvvtkowflhda", "protected-unapproved")))
                stack.enter_context(patch.object(module.Path, "read_text", return_value=json.dumps(self.record)))
                approval = stack.enter_context(patch.object(module, "validate_approval", return_value=self.now + timedelta(hours=1)))
                secret = stack.enter_context(patch.object(module.core, "_read_secret", return_value="PRIVATE_SENTINEL"))
                stack.enter_context(patch.object(module.core, "validate_admin_target"))
                stack.enter_context(patch.object(module.core, "_connect", return_value=connection))
                stack.enter_context(patch.object(module.core, "inspect_runtime_role", return_value={"runtime_exists": applying, "ready": applying}))
                apply = stack.enter_context(patch.object(module.core, "apply_runtime_role"))
                args = ["--expected-project-ref", module.ACCEPTANCE_REF]
                if applying:
                    args += ["--apply", "--approval-file", "approval.json"]
                self.assertEqual(module.main(args), 0)
                self.assertEqual(apply.call_count, int(applying))
                self.assertEqual(approval.call_count, 2 if applying else 0)
                self.assertEqual(secret.call_count, 2 if applying else 1)
                report = json.loads(output.getvalue())
                self.assertEqual(report["status"], "provisioned" if applying else "inspected")
                self.assertEqual(report["external_mutation_performed"], applying)
                self.assertNotIn("PRIVATE_SENTINEL", output.getvalue())

    def test_expiry_during_connect_prevents_password_read_and_mutation(self):
        with contextlib.ExitStack() as stack:
            output = io.StringIO()
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(patch.object(module.core, "_assert_package_guard_committed"))
            stack.enter_context(patch.object(module.core, "_load_target_guard", return_value=module.core.TargetGuard("zvtzwcimpvvtkowflhda", "protected-unapproved")))
            stack.enter_context(patch.object(module.Path, "read_text", return_value=json.dumps(self.record)))
            stack.enter_context(patch.object(module, "validate_approval", side_effect=[self.now + timedelta(hours=1), ValueError("expired")]))
            secret = stack.enter_context(patch.object(module.core, "_read_secret", return_value="PRIVATE_SENTINEL"))
            stack.enter_context(patch.object(module.core, "validate_admin_target"))
            stack.enter_context(patch.object(module.core, "_connect"))
            stack.enter_context(patch.object(module.core, "inspect_runtime_role", return_value={"runtime_exists": False, "ready": False}))
            apply = stack.enter_context(patch.object(module.core, "apply_runtime_role"))
            self.assertEqual(module.main(["--expected-project-ref", module.ACCEPTANCE_REF, "--apply", "--approval-file", "approval.json"]), 2)
            self.assertEqual(secret.call_count, 1)
            self.assertEqual(secret.call_args.args[1], "SUPERMEGA_ACCEPTANCE_ADMIN_URL")
            apply.assert_not_called()
            self.assertFalse(json.loads(output.getvalue())["external_mutation_performed"])


if __name__ == "__main__":
    unittest.main()
