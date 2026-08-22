from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))
SPEC = importlib.util.spec_from_file_location(
    "runtime_role_provisioning", TOOLS / "provision_supermega_runtime_role.py"
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class RuntimeRoleProvisioningTests(unittest.TestCase):
    REF = "abcdefghijklmnopqrst"
    PROD = "zvtzwcimpvvtkowflhda"
    APPROVAL = "123e4567-e89b-42d3-a456-426614174000"

    def guard(self, status: str = "protected-unapproved"):
        return MODULE.TargetGuard(self.PROD, status)

    def test_validate_only_is_read_only_and_does_not_need_approval(self):
        MODULE.authorize_target(
            expected_project_ref=self.PROD,
            apply=False,
            production_handoff=False,
            approval_id="",
            guard=self.guard(),
        )

    def test_apply_requires_handoff_and_uuid(self):
        for handoff, approval, error in (
            (False, self.APPROVAL, "apply_requires_production_handoff"),
            (True, "not-an-approval", "apply_requires_reviewed_approval_id"),
        ):
            with self.subTest(error=error), self.assertRaises(MODULE.ProvisioningFailure) as caught:
                MODULE.authorize_target(
                    expected_project_ref=self.PROD,
                    apply=True,
                    production_handoff=handoff,
                    approval_id=approval,
                    guard=self.guard("activation-approved"),
                )
            self.assertEqual(str(caught.exception), error)

    def test_production_apply_requires_committed_activation_status(self):
        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE.authorize_target(
                expected_project_ref=self.PROD,
                apply=True,
                production_handoff=True,
                approval_id=self.APPROVAL,
                guard=self.guard(),
            )
        self.assertEqual(str(caught.exception), "production_target_not_activation_approved")

    def test_apply_rejects_unreviewed_project(self):
        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE.authorize_target(
                expected_project_ref=self.REF,
                apply=True,
                production_handoff=True,
                approval_id=self.APPROVAL,
                guard=self.guard("activation-approved"),
            )
        self.assertEqual(str(caught.exception), "apply_target_not_reviewed_production")

    def test_admin_target_rejects_runtime_login_and_transaction_pooler(self):
        runtime = f"postgresql://supermega_trial_login.{self.REF}:secret@region.pooler.supabase.com:5432/postgres?sslmode=require"
        transaction = f"postgresql://postgres.{self.REF}:secret@region.pooler.supabase.com:6543/postgres?sslmode=require"
        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE.validate_admin_target(runtime, self.REF)
        self.assertEqual(str(caught.exception), "admin_postgres_login_required")
        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE.validate_admin_target(transaction, self.REF)
        self.assertEqual(str(caught.exception), "admin_transaction_pooler_not_allowed")

    def test_admin_target_accepts_bound_direct_and_session_pooler(self):
        direct = f"postgresql://postgres:secret@db.{self.REF}.supabase.co:5432/postgres?sslmode=require"
        session = f"postgresql://postgres.{self.REF}:secret@region.pooler.supabase.com:5432/postgres?sslmode=require"
        self.assertEqual(MODULE.validate_admin_target(direct, self.REF), "direct")
        self.assertEqual(MODULE.validate_admin_target(session, self.REF), "session_pooler")

    def test_secret_reader_prefers_file_and_never_accepts_argument_value(self):
        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE._read_secret("", "MISSING_TEST_SECRET", "runtime_password")
        self.assertEqual(str(caught.exception), "runtime_password_missing")

    def test_source_has_atomic_least_privilege_role_contract(self):
        source = (TOOLS / "provision_supermega_runtime_role.py").read_text(encoding="utf-8")
        self.assertIn("with connection.transaction():", source)
        self.assertIn("pg_advisory_xact_lock", source)
        self.assertIn("login inherit nosuperuser nocreatedb nocreaterole", source)
        self.assertIn("noreplication nobypassrls password", source)
        self.assertIn("with inherit true, set false, admin false", source)
        self.assertIn("alter role {} reset all", source)
        self.assertIn("_assert_runtime_role_postconditions(cursor)", source)
        self.assertLess(
            source.index("_assert_runtime_role_postconditions(cursor)"),
            source.index("def _connect("),
        )
        self.assertNotIn("print(admin_url)", source)
        self.assertNotIn("print(password)", source)

    def test_invalid_password_fails_before_mutation(self):
        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE.apply_runtime_role(object(), "short")
        self.assertEqual(str(caught.exception), "runtime_password_length_invalid")

    def test_atomic_postcondition_fails_inside_transaction(self):
        class Cursor:
            def execute(self, _query):
                return None

            def fetchone(self):
                return {"safe": False}

        with self.assertRaises(MODULE.ProvisioningFailure) as caught:
            MODULE._assert_runtime_role_postconditions(Cursor())
        self.assertEqual(str(caught.exception), "runtime_role_atomic_postcondition_failed")

    def test_atomic_postcondition_accepts_exact_role(self):
        class Cursor:
            def execute(self, _query):
                return None

            def fetchone(self):
                return {"safe": True}

        MODULE._assert_runtime_role_postconditions(Cursor())

    def test_dirty_package_guard_fails_closed(self):
        completed = type("Result", (), {"returncode": 0, "stdout": " M package.json\n"})()
        with patch.object(MODULE.subprocess, "run", return_value=completed):
            with self.assertRaises(MODULE.ProvisioningFailure) as caught:
                MODULE._assert_package_guard_committed()
        self.assertEqual(str(caught.exception), "production_target_guard_not_committed")


if __name__ == "__main__":
    unittest.main()
