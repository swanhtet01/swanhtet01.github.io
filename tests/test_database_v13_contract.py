"""Real disposable PostgreSQL catalog plus adversarial snapshot/SQL contracts."""
from contextlib import ExitStack, redirect_stdout
from copy import deepcopy
from io import StringIO
import json
import os
import unittest
from unittest.mock import patch

from tools import rehearse_self_serve_v13 as proof
from tools import validate_supermega_database_url as audit
from tools import private_trial_v13_contract as current


class V13CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.resources = ExitStack()
        cls.addClassCleanup(cls.resources.close)
        pg = proof.pg
        binary, openssl = pg._default_postgres_bin(), pg._default_openssl()
        if pg._preflight(binary, openssl).get("ok") is not True:
            raise RuntimeError("installed_local_pg17_required")
        admin_secret, runtime_secret = pg._password(), pg._password()
        port, environment = cls.resources.enter_context(proof.cluster(binary, openssl, admin_secret, "catalog-test"))
        cls.admin = pg._connection_url("postgres", admin_secret, port, pg.DATABASE_NAME)
        cls.runtime = pg._connection_url(pg.RUNTIME_ROLE, runtime_secret, port, pg.DATABASE_NAME)
        pg._create_database_and_roles(pg._connection_url("postgres", admin_secret, port, "postgres"), pg.DATABASE_NAME)
        pg._create_auth_session_fixture(cls.admin)
        pg._create_public_browser_fixture(cls.admin)
        pg._apply_public_browser_quarantine(postgres_bin=binary, admin_password=admin_secret,
            port=port, database_name=pg.DATABASE_NAME, environment=environment)
        pg._apply_migrations(postgres_bin=binary, admin_password=admin_secret,
            admin_database_url=cls.admin, port=port, environment=environment)
        pg._provision_runtime(cls.admin, runtime_secret)
        pg._bootstrap_local_storage_catalog_fixture(cls.admin)
        cls.legacy_snapshot = cls.snapshot("legacy-v11")
        for name in proof.EXTRAS:
            with pg._connect(cls.admin, autocommit=True) as conn:
                conn.execute((proof.ROOT / "supabase/migrations" / name).read_text(encoding="utf-8"))
        cls.good = cls.snapshot(current.PROFILE)

    @classmethod
    def snapshot(cls, profile):
        conn = audit._open_connection(cls.runtime)
        try:
            result = audit.collect_snapshot(conn, schema_profile=profile)
        finally:
            conn.rollback()
            conn.close()
        conn = audit._open_storage_audit_connection(cls.admin)
        try:
            result.update(audit.collect_storage_snapshot(conn))
        finally:
            conn.rollback()
            conn.close()
        return result

    def evaluate(self, snapshot):
        return audit.evaluate_snapshot(snapshot, schema_profile=current.PROFILE)

    def test_valid_migrated_v13_is_exactly_ready(self):
        report = self.evaluate(self.good)
        diagnostics = {"failed": report["failed_checks"],
            "extensionPins": current.observed_extension_digests(self.good),
            "policyPins": {r["policy_name"]: audit._catalog_expression_fingerprint(r["qual"])
                           for r in self.good["policies"] if r["policy_name"] in current.POLICIES},
            "newDependencies": [r for r in self.good["backend_acl_dependencies"]
                                if any(v in r["object_name"] for v in ("billing", "self_serve"))]}
        self.assertTrue(report["ready"], json.dumps(diagnostics, sort_keys=True))
        self.assertEqual(report["contract"], current.CONTRACT)
        self.assertEqual(len(report["checks"]), 33)
        self.assertEqual(report["evidence"]["schema"]["version"], 13)

    def test_legacy_profile_stays_exact_and_cannot_accept_v13(self):
        self.assertTrue(audit.evaluate_snapshot(self.legacy_snapshot)["ready"])
        self.assertFalse(audit.evaluate_snapshot(self.good)["ready"])
        self.assertFalse(self.evaluate(self.legacy_snapshot)["ready"])
        self.assertEqual(audit.SCHEMA_VERSION, 11)
        self.assertNotIn("billing_invoices", audit.EXPECTED_TABLES)

    def test_unknown_profile_fails_before_connect(self):
        def forbidden(*_):
            self.fail("must not connect")
        with self.assertRaisesRegex(audit.AuditConfigurationError, "schema_profile_invalid"):
            audit.audit_database("unused", storage_audit_database_url="unused",
                                 schema_profile="latest", connect_factory=forbidden)

    def test_cli_binds_explicit_profile_for_audit_and_activation(self):
        for activation in (False, True):
            function = "audit_supabase_activation_target" if activation else "audit_database"
            with patch.dict(os.environ, {"TEST_DB_URL": "fixture", "TEST_STORAGE_URL": "fixture"}, clear=True), \
                    patch.object(audit, function, return_value={"ok": True, "ready": True}) as call, \
                    redirect_stdout(StringIO()):
                args = ["--env-key", "TEST_DB_URL", "--storage-audit-env-key", "TEST_STORAGE_URL",
                        "--schema-profile", current.PROFILE, "--require-ready"]
                if activation:
                    args.append("--activation-target")
                self.assertEqual(audit.main(args), 0)
                self.assertEqual(call.call_args.kwargs["schema_profile"], current.PROFILE)

    def test_migration_source_tampering_fails_before_any_database_connection(self):
        with patch.object(current.Path, "read_text", return_value="unreviewed source"):
            with self.assertRaisesRegex(ValueError, "v13_contract_migration_source_mismatch"):
                audit.schema_contract(current.PROFILE)
            output = StringIO()
            with patch.dict(os.environ, {"TEST_DB_URL": "fixture", "TEST_STORAGE_URL": "fixture"}, clear=True), \
                    patch.object(audit, "_open_connection") as connect, redirect_stdout(output):
                result = audit.main(["--env-key", "TEST_DB_URL", "--storage-audit-env-key", "TEST_STORAGE_URL",
                                     "--schema-profile", current.PROFILE, "--require-ready"])
            connect.assert_not_called()
            self.assertEqual(result, 1)
            self.assertEqual(json.loads(output.getvalue())["error"], "database_connection_or_audit_failed")
            self.assertNotIn("unreviewed source", output.getvalue())

    def test_current_profile_cannot_label_legacy_self_test_or_blank_target_preflight(self):
        for other_mode in ("--self-test", "--rehearsal-preflight"):
            with redirect_stdout(StringIO()):
                self.assertEqual(audit.main(["--schema-profile", current.PROFILE, other_mode]), 2)

    def test_every_core_security_surface_remains_fail_closed(self):
        for key in ("engine", "identity", "backend_role", "schema", "tables", "functions",
                    "policies", "hardening_constraints", "triggers", "indexes", "acl_entries",
                    "backend_acl_dependencies", "browser_roles", "runtime_parent_memberships",
                    "backend_members", "storage_catalog", "storage_bucket_inventory"):
            with self.subTest(surface=key):
                damaged = deepcopy(self.good)
                damaged.pop(key)
                self.assertFalse(self.evaluate(damaged)["ready"])

    def test_new_catalog_each_row_cannot_be_missing_duplicated_or_changed(self):
        for key in ("extension_columns", "extension_constraints", "column_acl_entries"):
            for index in range(len(self.good[key])):
                for operation in ("remove", "duplicate", "change"):
                    with self.subTest(surface=key, index=index, operation=operation):
                        damaged = deepcopy(self.good)
                        if operation == "remove":
                            damaged[key].pop(index)
                        elif operation == "duplicate":
                            damaged[key].append(deepcopy(damaged[key][index]))
                        else:
                            damaged[key][index]["unexpected"] = True
                        self.assertFalse(self.evaluate(damaged)["ready"])

    def test_new_function_and_policy_bodies_are_bound_without_normalizing_literals(self):
        for key, identity, names, field in (
            ("functions", "function_name", current.FUNCTIONS, "function_source"),
            ("policies", "policy_name", current.POLICIES, "qual"),
        ):
            for row in self.good[key]:
                if row[identity] not in names:
                    continue
                with self.subTest(function_or_policy=row[identity]):
                    damaged = deepcopy(self.good)
                    chosen = next(r for r in damaged[key] if r[identity] == row[identity])
                    chosen[field] += " OR true"
                    self.assertFalse(self.evaluate(damaged)["ready"])

    def test_future_old_or_missing_version_and_duplicate_objects_are_denied(self):
        for version in (None, 11, 12, 14, "13", True):
            bad = deepcopy(self.good)
            bad["schema_version"] = version
            self.assertFalse(self.evaluate(bad)["ready"])
        for key in ("tables", "functions", "policies", "indexes", "acl_entries"):
            bad = deepcopy(self.good)
            bad[key].append(deepcopy(bad[key][-1]))
            self.assertFalse(self.evaluate(bad)["ready"], key)

    def test_actual_database_privilege_and_rls_drift_is_rejected_and_restored(self):
        pg = proof.pg
        cases = (
            ('alter table app_private.billing_invoices alter column workspace_id type text collate "C"',
             'alter table app_private.billing_invoices alter column workspace_id type text collate "default"'),
            ("grant update on app_private.self_serve_attempt_budgets to supermega_trial_backend",
             "revoke update on app_private.self_serve_attempt_budgets from supermega_trial_backend; "
             "grant update(attempts, claim_conflicts) on app_private.self_serve_attempt_budgets to supermega_trial_backend"),
            ("grant update(actor_id) on app_private.self_serve_attempt_budgets to supermega_trial_backend",
             "revoke update(actor_id) on app_private.self_serve_attempt_budgets from supermega_trial_backend"),
            ("grant select(payload_json) on app_private.billing_invoices to anon",
             "revoke select(payload_json) on app_private.billing_invoices from anon"),
            ("alter table app_private.self_serve_attempt_budgets no force row level security",
             "alter table app_private.self_serve_attempt_budgets force row level security"),
            ("alter function app_private.reserve_self_serve_attempt() security definer",
             "alter function app_private.reserve_self_serve_attempt() security invoker"),
            ("alter policy billing_entitlements_self_read on app_private.billing_entitlements using (true)",
             "alter policy billing_entitlements_self_read on app_private.billing_entitlements using (workspace_id = (select current_setting('app.workspace_id', true)))"),
        )
        for change, restore in cases:
            with self.subTest(change=change):
                self.assertTrue(self.evaluate(self.snapshot(current.PROFILE))["ready"])
                try:
                    with pg._connect(self.admin) as conn:
                        conn.execute(change)
                    result = audit.audit_database(self.runtime, storage_audit_database_url=self.admin,
                                                  schema_profile=current.PROFILE)
                    self.assertFalse(result["ready"])
                finally:
                    with pg._connect(self.admin) as conn:
                        conn.execute(restore)
                restored = self.evaluate(self.snapshot(current.PROFILE))
                self.assertTrue(restored["ready"], restored["failed_checks"])


if __name__ == "__main__":
    unittest.main()
