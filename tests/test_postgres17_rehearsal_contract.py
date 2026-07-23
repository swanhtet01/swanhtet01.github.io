from __future__ import annotations

import ast
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REHEARSAL = ROOT / "tools" / "rehearse_supermega_postgres17.py"
PACKAGE = ROOT / "package.json"


def _load_rehearsal():
    spec = importlib.util.spec_from_file_location("supermega_postgres17_rehearsal", REHEARSAL)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Postgres17RehearsalContractTests(unittest.TestCase):
    def test_rehearsal_declares_the_complete_fail_closed_boundary(self) -> None:
        source = REHEARSAL.read_text(encoding="utf-8")
        lowered = source.lower()
        for expected in (
            "supermega_postgres17_rehearsal_v1",
            "expected_postgres_major = 17",
            "127.0.0.1",
            "hostssl all all 127.0.0.1/32 scram-sha-256",
            "hostnossl all all 127.0.0.1/32 reject",
            "ssl = on",
            "--require-ready",
            "pg_dump",
            "pg_restore",
            "v1_upgrade_preserved",
            "tenant_isolation",
            "identity_transaction_local",
            "postgrestrialstore",
            "runtime_adapter_readiness_failed",
            "runtime_set_role_denied",
            "browser_role_isolation",
            "optimistic_concurrency",
            "event_immutability",
            "revocation",
        ):
            self.assertIn(expected, lowered)

        for forbidden_argument in (
            '"--password"',
            '"--database-url"',
            '"--admin-url"',
            '"--runtime-url"',
        ):
            self.assertNotIn(forbidden_argument, lowered)
        self.assertNotIn("shell=true", lowered)
        self.assertNotIn("sslmode=disable", lowered)

    def test_exact_migration_chain_is_rehearsed_with_a_v1_upgrade_fixture(self) -> None:
        module = _load_rehearsal()
        self.assertEqual(
            module.MIGRATIONS,
            (
                "20260722004500_private_trial_backend_role_preflight.sql",
                "20260722005134_private_trial_backend_foundation.sql",
                "20260722142801_private_trial_backend_v2.sql",
                "20260723094500_private_trial_backend_v3_website.sql",
                "20260723144500_private_trial_backend_v4_hardening.sql",
            ),
        )
        source = REHEARSAL.read_text(encoding="utf-8")
        self.assertIn("if position == 1:", source)
        self.assertIn("_seed_v1_upgrade_data(admin_database_url)", source)
        self.assertIn("'legacy-workspace', 'shop'", source)
        self.assertIn("membership[0] != \"legacy\"", source)
        self.assertIn("list(membership[1]) != [\"commerce.write\"]", source)

        package = json.loads(PACKAGE.read_text(encoding="utf-8"))
        self.assertEqual(
            package["scripts"]["database:postgres17:rehearse"],
            "node tools/run_postgres17_rehearsal.mjs",
        )

    def test_missing_local_tooling_returns_only_sanitized_evidence(self) -> None:
        module = _load_rehearsal()
        with tempfile.TemporaryDirectory() as temporary:
            missing_bin = Path(temporary) / "missing-bin"
            missing_openssl = Path(temporary) / "missing-openssl"
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                return_code = module.main(
                    [
                        "--postgres-bin",
                        str(missing_bin),
                        "--openssl",
                        str(missing_openssl),
                        "--preflight",
                    ]
                )
        self.assertEqual(return_code, 1)
        payload = json.loads(output.getvalue())
        self.assertEqual(payload["error"], "postgres17_tooling_missing")
        self.assertFalse(payload["ok"])
        self.assertTrue(payload["cleanup_complete"])
        self.assertFalse(payload["secret_values_exposed"])
        self.assertFalse(payload["production_mutated"])
        self.assertFalse(payload["supabase_mutated"])
        self.assertFalse(payload["vercel_mutated"])
        serialized = json.dumps(payload)
        self.assertNotIn(str(missing_bin), serialized)
        self.assertNotIn(str(missing_openssl), serialized)

    def test_reports_have_one_controlled_stdout_boundary(self) -> None:
        tree = ast.parse(REHEARSAL.read_text(encoding="utf-8"), filename=str(REHEARSAL))
        print_calls = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "print"
        ]
        self.assertEqual(len(print_calls), 1)

    def test_policy_rejections_require_an_explicit_database_sqlstate(self) -> None:
        module = _load_rehearsal()

        class PolicyDenied(Exception):
            sqlstate = "42501"

        module._expect_database_rejection(
            lambda: (_ for _ in ()).throw(PolicyDenied("denied")),
            "policy_should_deny",
        )
        with self.assertRaises(module.RehearsalFailure) as caught:
            module._expect_database_rejection(
                lambda: (_ for _ in ()).throw(RuntimeError("connection disappeared")),
                "policy_should_deny",
            )
        self.assertEqual(str(caught.exception), "policy_should_deny_unexpected_error")


if __name__ == "__main__":
    unittest.main()
