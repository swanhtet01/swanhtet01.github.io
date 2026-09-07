"""Read-only runner contracts; actual SQL is an explicit isolated CLI rehearsal."""
import ast
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import rehearse_self_serve_v13 as proof


class FullChainProofContractTests(unittest.TestCase):
    def test_exact_current_private_migration_chain(self):
        actual = sorted(p.name for p in (proof.ROOT / "supabase/migrations").glob("*.sql")
                        if p.name != "20260711081300_public_legacy_baseline.sql")
        self.assertEqual(list(proof.MIGRATIONS), actual)
        self.assertEqual(len(proof.MIGRATIONS), 15)

    def test_matrix_has_exact_unique_behavior_checks(self):
        self.assertEqual(len(proof.CHECKS), 17)
        self.assertEqual(len(set(proof.CHECKS)), 17)
        for name in ("payment_confirmation_not_entitlement", "restored_budget_enforced",
                     "four_product_workspaces_created", "revoked_session_denied"):
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
