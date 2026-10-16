"""Read-only runner contracts; actual SQL is an explicit isolated CLI rehearsal."""
import ast
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import rehearse_self_serve_v13 as proof


class FullChainProofContractTests(unittest.TestCase):
    def test_both_independent_schema_settings_are_explicit(self):
        with patch.dict(proof.os.environ, {}, clear=True):
            proof.configure_local_schema()
            self.assertEqual(dict(proof.os.environ), {
                "SUPERMEGA_TRIAL_SCHEMA_VERSION": "13",
                "SUPERMEGA_BILLING_SCHEMA_VERSION": "13", "SUPERMEGA_OTEL_DISABLED": "1"})

    def test_runtime_products_not_activation_display_ids(self):
        self.assertEqual(proof.PRODUCTS, ("commerce", "production", "website", "ecommerce"))
        source = Path(proof.__file__).read_text(encoding="utf-8")
        self.assertIn("ready.product_entitlements == (product,)", source)
        self.assertIn("ready.capabilities == self_serve_owner_capabilities(product)", source)
        self.assertIn("self_serve_ecommerce_owner_granted_internal_work", source)
        self.assertIn("ecommerce.manage", source)

    def test_ecommerce_rehearsal_uses_internal_staff_role_capabilities(self):
        from supermega_runtime.managed_staff_access import _role_capabilities
        from supermega_runtime.trial_store import self_serve_owner_capabilities
        capabilities = _role_capabilities({
            "products": ["ecommerce"],
            "ownerCapabilities": sorted(self_serve_owner_capabilities("ecommerce")),
        }, "ecommerce-operator")
        self.assertIn("company.read", capabilities)
        self.assertIn("ecommerce.manage", capabilities)
        self.assertNotIn("company.write", capabilities)
        self.assertNotIn("approvals.decide", capabilities)

    def test_exact_current_private_migration_chain(self):
        actual = sorted(p.name for p in (proof.ROOT / "supabase/migrations").glob("*.sql")
                        if p.name not in ("20260711081300_public_legacy_baseline.sql",
                                          *proof.pg.DOMAIN_CANDIDATE_MIGRATIONS))
        self.assertEqual(list(proof.MIGRATIONS), actual)
        for candidate in proof.pg.DOMAIN_CANDIDATE_MIGRATIONS:
            self.assertTrue((proof.ROOT / "supabase/migrations" / candidate).is_file())
            self.assertNotIn(candidate, proof.MIGRATIONS)
        self.assertEqual(len(proof.MIGRATIONS), 29)
        self.assertEqual(proof.MIGRATIONS[-14:], (
            "20260915184728_website_customer_review_storage.sql",
            "20260915191528_website_review_entitlement_proof.sql",
            "20260918011500_website_customer_acceptance.sql",
            "20260924190304_ecommerce_review_entitlement_proof.sql",
            "20260924194557_ecommerce_customer_review_storage.sql",
            "20260924231714_ecommerce_customer_decisions.sql",
            "20260929171000_ecommerce_decision_review_fk_index.sql",
            "20260930010000_app_rls_initplan_optimization.sql",
            "20261010063000_website_publishing_and_inquiries.sql",
            "20261010070000_website_published_hero_media.sql",
            "20261010120857_website_inquiry_followup.sql",
            "20261014090000_website_channel_stable_update.sql",
            "20261015091500_website_six_page_reviews.sql",
            "20261015202629_ecommerce_operator_review_grant.sql",
        ))

    def test_matrix_has_exact_unique_behavior_checks(self):
        self.assertEqual(len(proof.CHECKS), 19)
        self.assertEqual(len(set(proof.CHECKS)), 19)
        for name in ("payment_confirmation_not_entitlement", "restored_budget_enforced",
                     "four_product_workspaces_created", "revoked_session_denied",
                     "unwrapped_migration_failure_rolled_back",
                     "ecommerce_internal_operator_boundary"):
            self.assertIn(name, proof.CHECKS)

    def test_invalid_head_fails_before_cluster(self):
        with patch.object(proof.subprocess, "check_output") as git:
            with self.assertRaisesRegex(proof.pg.RehearsalFailure, "expected_head_invalid"):
                proof.source_identity("main")
        git.assert_not_called()

    def test_dirty_source_is_refused(self):
        with patch.object(proof.subprocess, "check_output", return_value=" M file"):
            with self.assertRaisesRegex(proof.pg.RehearsalFailure, "source_dirty"):
                proof.source_identity("a" * 40)

    def test_nested_runner_failure_codes_are_safe_and_bounded(self):
        nested_failure = type("RehearsalFailure", (RuntimeError,), {
            "__module__": "tools.rehearse_supermega_postgres17"})
        self.assertEqual(
            proof.pg.safe_rehearsal_failure_code(
                nested_failure("ecommerce_internal_operator_prepare_denied")),
            "ecommerce_internal_operator_prepare_denied")
        self.assertIsNone(proof.pg.safe_rehearsal_failure_code(
            nested_failure("password=not-safe-to-print")))
        self.assertIsNone(proof.pg.safe_rehearsal_failure_code(
            ValueError("unrelated exception")))

    def test_existing_output_causes_no_database_work(self):
        with tempfile.TemporaryDirectory(prefix="supermega-proof-contract-") as temp:
            target = Path(temp) / "receipt.json"
            target.touch()
            with patch.object(proof, "run") as run:
                with self.assertRaises(FileExistsError):
                    proof.main(["--expected-head", "a" * 40, "--output", str(target)])
            run.assert_not_called()

    def test_no_remote_url_or_credentials_cli(self):
        source = Path(proof.__file__).read_text(encoding="utf-8")
        parsed = ast.parse(source)
        args = [n.args[0].value for n in ast.walk(parsed) if isinstance(n, ast.Call)
                and isinstance(n.func, ast.Attribute) and n.func.attr == "add_argument"]
        self.assertEqual(args, ["--expected-head", "--output"])
        self.assertNotIn("mock", source)
        self.assertNotIn("sslmode=disable", source)


if __name__ == "__main__":
    unittest.main()
