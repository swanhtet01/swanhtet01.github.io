from __future__ import annotations

import ast
import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


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
    def test_postgres_bin_platform_defaults_and_explicit_override(self) -> None:
        module = _load_rehearsal()
        for platform, expected in (
            ("posix", Path("/usr/lib/postgresql/17/bin")),
            ("nt", Path.home() / ".cache/supermega-postgresql/17.10-2/pgsql/bin"),
        ):
            with self.subTest(platform=platform), patch.object(
                module, "os", SimpleNamespace(name=platform, getenv=lambda *_: "")
            ):
                self.assertEqual(module._default_postgres_bin(), expected)
        with patch.object(module, "os", SimpleNamespace(
            name="posix", getenv=lambda *_: " /explicit/pg17/bin "
        )):
            self.assertEqual(module._default_postgres_bin(), Path("/explicit/pg17/bin"))

    def test_api_workflows_prepare_pg17_before_unconditional_discovery(self) -> None:
        for name in ("showroom-ci.yml", "supermega-app-deploy.yml", "supermega-public-release.yml"):
            source = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
            with self.subTest(workflow=name):
                self.assertIn("apt-get install --yes postgresql-17 postgresql-client-17 openssl", source)
                self.assertIn('echo "SUPERMEGA_POSTGRES17_BIN=/usr/lib/postgresql/17/bin" >> "$GITHUB_ENV"', source)
                self.assertLess(source.index("Prepare PostgreSQL 17 test tools"),
                                source.index("python -m unittest discover"))

    def test_release_rehearsal_requires_current_complete_chain(self) -> None:
        module = _load_rehearsal()
        self.assertEqual(getattr(module, "CURRENT_SCHEMA_VERSION", None), 13)
        self.assertEqual(module.CURRENT_PROFILE, "v13-self-serve")
        self.assertEqual(module.CURRENT_MIGRATIONS, (*module.MIGRATIONS,
            "20260817090000_private_trial_backend_v12_billing_rail.sql",
            "20260818090000_private_trial_backend_v13_billing_entitlement_read.sql",
            "20260907024457_self_serve_durable_attempt_budget.sql",
            "20260915184728_website_customer_review_storage.sql",
            "20260915191528_website_review_entitlement_proof.sql",
            "20260918011500_website_customer_acceptance.sql"))
        observed = tuple(sorted(path.name for path in (ROOT / "supabase/migrations").glob("*.sql")
                                if path.name != "20260711081300_public_legacy_baseline.sql"))
        self.assertEqual(module.CURRENT_MIGRATIONS, observed)

    def test_account_restore_inventory_includes_website_review_history(self) -> None:
        from tools import rehearse_self_serve_v13 as account
        module = _load_rehearsal()
        self.assertEqual(account.MIGRATIONS, module.CURRENT_MIGRATIONS)
        self.assertEqual(account.TABLES, tuple(sorted(set(account.TABLES))))
        self.assertIn("website_customer_reviews", account.TABLES)
        self.assertIn("website_customer_feedback", account.TABLES)
        self.assertIn("website_customer_acceptances", account.TABLES)
        self.assertIn("supermega_runtime/website_acceptance_schema.py", module.IMPLEMENTATION_PATHS)

    def test_rehearsal_declares_the_complete_fail_closed_boundary(self) -> None:
        source = REHEARSAL.read_text(encoding="utf-8")
        lowered = source.lower()
        for expected in (
            "supermega_postgres17_rehearsal_v2",
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
            "identity_leaked_after_rollback",
            "postgrestrialstore",
            "runtime_adapter_readiness_failed",
            "runtime_set_role_denied",
            "browser_role_isolation",
            "optimistic_concurrency",
            "event_immutability",
            "revocation",
            "managed_website_to_commerce_journey",
            "managed_production_job_to_output",
            "managed_human_attribution",
            "managed_exact_retry",
            "managed_supabase_session_revocation_enforced",
            "approval_agent_row_spoof_denied",
            "approval_service_row_spoof_denied",
            "approval_human_decision_once",
            "approval_exact_retry",
            "approval_mutated_retry_rejected",
            "approval_terminal_replay_rejected",
            "approval_record_immutable",
            "approval_decision_event_immutable",
            "trusted_backend_transaction_context",
            "local_private_fixture",
            "hosted_storage_privacy_proof_required",
            "supermega_storage_audit_database_url",
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
                "20260724204920_private_trial_backend_v5_read_capabilities.sql",
                "20260730113000_private_trial_backend_v6_managed_activation.sql",
                "20260730123000_private_trial_backend_v7_workspace_discovery.sql",
                "20260802161500_private_trial_backend_v8_rls_initplan.sql",
                "20260803063822_private_trial_backend_v9_metadata_rls.sql",
                "20260804102000_private_trial_backend_v10_supabase_session_revocation.sql",
                "20260816120000_private_trial_backend_v11_self_serve_grants.sql",
            ),
        )
        source = REHEARSAL.read_text(encoding="utf-8")
        self.assertIn("if position == 1:", source)
        self.assertIn("_seed_v1_upgrade_data(admin_database_url)", source)
        self.assertIn("company.workspace.activated", source)
        self.assertIn("rehearsal-entitlement-event:", source)
        self.assertIn("'legacy-workspace', 'shop'", source)
        self.assertIn("membership[0] != \"legacy\"", source)
        self.assertIn("list(membership[1]) != [\"commerce.write\"]", source)

        package = json.loads(PACKAGE.read_text(encoding="utf-8"))
        self.assertEqual(
            package["scripts"]["database:postgres17:rehearse"],
            "node tools/run_postgres17_rehearsal.mjs",
        )

    def test_real_product_journeys_use_the_exact_managed_adapter(self) -> None:
        source = REHEARSAL.read_text(encoding="utf-8")
        for expected in (
            "PostgresTrialStore(",
            "write_enabled=True",
            "website.snapshot.recorded",
            "commerce.website_intake.created",
            "commerce.website_intake.converted",
            'related_surfaces=("website",)',
            "validate_website_snapshot_source",
            "production.job.created",
            "production.output.recorded",
            "idempotent_replay",
            "rehearsal-product",
            "owner-product",
            "approval-reader",
            "website-reader",
            "capability_scoped_reads",
            "capability_scoped_event_reads",
            "write_capability_implies_read",
            "approval_requester_read_scoped",
            "approval_reviewer_reads_all",
            "array['approvals.request']::text[]",
        ):
            self.assertIn(expected, source)
        self.assertNotIn("fastapi.testclient", source.casefold())
        self.assertNotIn("httpx", source.casefold())

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

    def test_current_source_identity_rejects_missing_dirty_wrong_head_and_inventory(self):
        module = _load_rehearsal()
        with patch.object(module.subprocess, "run") as git:
            with self.assertRaisesRegex(module.RehearsalFailure, "expected_head_required"):
                module._source_identity(None)
            git.assert_not_called()
        result = lambda text: SimpleNamespace(returncode=0, stdout=text)
        with patch.object(module.subprocess, "run", return_value=result(" M source.py")):
            with self.assertRaisesRegex(module.RehearsalFailure, "source_dirty"):
                module._source_identity("a" * 40)
        with patch.object(module.subprocess, "run", side_effect=[result(""), result("b" * 40)]):
            with self.assertRaisesRegex(module.RehearsalFailure, "source_head_mismatch"):
                module._source_identity("a" * 40)
        with tempfile.TemporaryDirectory() as folder, patch.object(module, "MIGRATION_DIRECTORY", Path(folder)), \
                patch.object(module.subprocess, "run", side_effect=[result(""), result("a" * 40)]):
            with self.assertRaisesRegex(module.RehearsalFailure, "private_migration_inventory_mismatch"):
                module._source_identity("a" * 40)
        with patch.object(module.subprocess, "run", side_effect=[result(""), result("a" * 40), result("b" * 40)]):
            identity = module._source_identity("a" * 40)
        self.assertEqual(identity, {"head": "a" * 40, "tree": "b" * 40,
                                   "implementation_digest": module._implementation_digest()})

    def test_existing_raw_output_stops_before_any_source_or_database_work(self):
        module = _load_rehearsal()
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "historical.json"
            output.write_text("preserve", encoding="utf-8")
            with patch.object(module, "_source_identity") as identity, \
                    patch.object(module, "_run_rehearsal") as run, \
                    contextlib.redirect_stdout(io.StringIO()) as stdout:
                code = module.main(["--evidence-file", str(output)])
            self.assertEqual(code, 2)
            self.assertEqual(json.loads(stdout.getvalue())["error"], "evidence_output_exists")
            self.assertEqual(output.read_text(encoding="utf-8"), "preserve")
            identity.assert_not_called()
            run.assert_not_called()

    def test_current_validator_profile_is_explicit_and_wrong_contract_cannot_pass(self):
        module = _load_rehearsal()
        good = {"ok": True, "ready": True, "contract": module.CURRENT_CATALOG_CONTRACT,
                "checks": {"schema_version_current": True}}
        def run(payload):
            with patch.object(module, "_run", return_value=SimpleNamespace(returncode=0, stdout=json.dumps(payload))) as called:
                result = module._run_validator("synthetic-runtime", "synthetic-storage", {}, schema_profile=module.CURRENT_PROFILE)
                self.assertEqual(called.call_args.args[0][-2:], ["--schema-profile", "v13-self-serve"])
                return result
        self.assertEqual(run(good), good)
        for delta in ({"contract": "old"}, {"checks": {}}, {"checks": {"x": False}}):
            with self.subTest(delta=delta), self.assertRaisesRegex(module.RehearsalFailure, "current_catalog_contract_mismatch"):
                run({**good, **delta})

    def test_release_runner_wires_current_migrations_catalog_and_recovery(self):
        source = REHEARSAL.read_text(encoding="utf-8")
        tree = ast.parse(source)
        run = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_run_rehearsal")
        calls = [n for n in ast.walk(run) if isinstance(n, ast.Call)]
        named = lambda name: [n for n in calls if isinstance(n.func, ast.Name) and n.func.id == name]
        migrations = named("_apply_migrations")
        self.assertEqual(len(migrations), 1)
        self.assertTrue(any(k.arg == "migrations" and isinstance(k.value, ast.Name)
                            and k.value.id == "CURRENT_MIGRATIONS" for k in migrations[0].keywords))
        for call in named("_run_validator"):
            self.assertTrue(any(k.arg == "schema_profile" and isinstance(k.value, ast.Name)
                                and k.value.id == "CURRENT_PROFILE" for k in call.keywords))
        self.assertEqual(len(named("_run_validator")), 2)
        for pin in ('account_proof.exercise(', 'account_proof.snapshot(admin_database_url)',
                    'account_proof.snapshot(restore_admin_database_url)', 'restored_snapshot != private_snapshot',
                    'not ready.write_ready or not ready.premium_unlocked', 'except TrialRateLimited:',
                    'expected_row_counts=row_counts', '_source_identity(source_identity["head"]) != source_identity'):
            self.assertIn(pin, source)

    def test_workspace_cleanup_requires_known_stopped_state(self):
        module = _load_rehearsal()
        with tempfile.TemporaryDirectory() as parent:
            target = Path(parent) / "supermega-pg17-fixture"
            target.mkdir()
            with patch.object(module.tempfile, "mkdtemp", return_value=str(target)), \
                    patch.object(module.tempfile, "gettempdir", return_value=parent), \
                    patch.object(module.shutil, "rmtree") as delete:
                with module._disposable_workspace():
                    pass
                delete.assert_not_called()
                with module._disposable_workspace() as (_, state):
                    state["stopped"] = True
                delete.assert_called_once_with(target.resolve())

    def test_policy_rejections_require_an_explicit_database_sqlstate(self) -> None:
        module = _load_rehearsal()

        class PolicyDenied(Exception):
            sqlstate = "42501"

        module._expect_database_rejection(
            lambda: (_ for _ in ()).throw(PolicyDenied("denied")),
            "policy_should_deny",
        )

        class ImmutableDenied(Exception):
            sqlstate = "55000"

        module._expect_database_rejection(
            lambda: (_ for _ in ()).throw(ImmutableDenied("immutable")),
            "immutable_record_should_deny",
            expected_sqlstates=frozenset({"55000"}),
        )
        with self.assertRaises(module.RehearsalFailure) as caught:
            module._expect_database_rejection(
                lambda: (_ for _ in ()).throw(RuntimeError("connection disappeared")),
                "policy_should_deny",
            )
        self.assertEqual(str(caught.exception), "policy_should_deny_unexpected_error")

        class ConstraintDenied(Exception):
            sqlstate = "23514"

        with self.assertRaises(module.RehearsalFailure) as caught:
            module._expect_database_rejection(
                lambda: (_ for _ in ()).throw(ConstraintDenied("wrong boundary")),
                "immutable_record_should_deny",
                expected_sqlstates=frozenset({"55000"}),
            )
        self.assertEqual(
            str(caught.exception),
            "immutable_record_should_deny_unexpected_error",
        )

    def test_approval_authority_runs_and_restore_compares_full_snapshots(self) -> None:
        source = REHEARSAL.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(REHEARSAL))
        functions = {
            node.name: node
            for node in tree.body
            if isinstance(node, ast.FunctionDef)
        }

        def called_names(function_name: str) -> list[str]:
            names: list[str] = []
            for node in ast.walk(functions[function_name]):
                if not isinstance(node, ast.Call):
                    continue
                if isinstance(node.func, ast.Name):
                    names.append(node.func.id)
                elif isinstance(node.func, ast.Attribute):
                    names.append(node.func.attr)
            return names

        self.assertIn(
            "_exercise_approval_authority",
            called_names("_run_rehearsal"),
        )
        self.assertGreaterEqual(
            called_names("_exercise_approval_authority").count(
                "_expect_database_rejection"
            ),
            5,
        )
        self.assertIn(
            "_approval_authority_snapshot",
            called_names("_exercise_approval_authority"),
        )
        self.assertIn(
            "_approval_authority_snapshot",
            called_names("_verify_restored_data"),
        )
        snapshot_source = ast.get_source_segment(
            source,
            functions["_approval_authority_snapshot"],
        )
        self.assertIsNotNone(snapshot_source)
        assert snapshot_source is not None
        self.assertIn("to_jsonb(approval_record)", snapshot_source)
        self.assertIn("to_jsonb(event_record)", snapshot_source)


if __name__ == "__main__":
    unittest.main()
