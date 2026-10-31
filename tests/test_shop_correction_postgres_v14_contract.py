from __future__ import annotations

import ast
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261024090000_private_trial_backend_v14_shop_correction_consumption.sql"
STORE = ROOT / "supermega_runtime/trial_store.py"
RUNTIME = ROOT / "supermega_runtime/trial_runtime.py"


def _normalized_sql() -> str:
    return " ".join(MIGRATION.read_text(encoding="utf-8").lower().split())


def _function_source(path: Path, class_name: str | None, function_name: str) -> str:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    body = tree.body
    if class_name is not None:
        class_node = next(
            node
            for node in body
            if isinstance(node, ast.ClassDef) and node.name == class_name
        )
        body = class_node.body
    function = next(
        node
        for node in body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name == function_name
    )
    return ast.get_source_segment(source, function) or ""


class ShopCorrectionPostgresV14MigrationContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sql = _normalized_sql()

    def test_schema_guard_advances_exactly_from_v13_to_v14(self) -> None:
        self.assertIn("schema_version = 13", self.sql)
        self.assertIn("private trial backend v14 requires schema version 13", self.sql)
        self.assertRegex(
            self.sql,
            re.compile(
                r"update app_private\.trial_schema_meta set schema_version = 14,"
                r" applied_at = transaction_timestamp\(\) where component ="
                r" 'private_trial_backend' and schema_version = 13"
            ),
        )
        self.assertIn("private trial backend v14 did not reach schema version 14", self.sql)

    def test_projection_identity_and_concurrency_constraints_are_database_enforced(self) -> None:
        required = (
            "unique (workspace_id, lineage_epoch)",
            "unique (workspace_id, lineage_id, lineage_epoch)",
            "unique (workspace_id, activation_request_id)",
            "create unique index shop_correction_one_active_lineage_idx",
            "where superseded_at is null",
            "unique (workspace_id, consumption_request_id)",
            "unique (workspace_id, authorization_receipt_id)",
            "unique (workspace_id, command_id)",
            "unique (workspace_id, lineage_id, consumption_ordinal)",
            "unique (workspace_id, history_digest)",
            "foreign key (workspace_id, lineage_id)",
            "foreign key (workspace_id, lineage_id, lineage_epoch)",
            "foreign key (workspace_id, previous_lineage_id, previous_lineage_epoch)",
        )
        for contract in required:
            with self.subTest(contract=contract):
                self.assertIn(contract, self.sql)

    def test_lineage_watermark_can_advance_only_for_matching_immutable_consumption(self) -> None:
        guard = self.sql[
            self.sql.index("create function app_private.guard_shop_correction_lineage()") :
            self.sql.index("create trigger shop_correction_lineage_guard")
        ]
        self.assertIn("new.current_consumption_ordinal = old.current_consumption_ordinal + 1", guard)
        self.assertIn("from app_private.shop_correction_consumptions consumption", guard)
        self.assertIn("consumption.workspace_id = old.workspace_id", guard)
        self.assertIn("consumption.lineage_id = old.lineage_id", guard)
        self.assertIn("consumption.lineage_epoch = old.lineage_epoch", guard)
        self.assertIn(
            "consumption.previous_consumption_digest is not distinct from old.current_consumption_digest",
            guard,
        )
        self.assertIn("consumption.history_digest = new.current_consumption_digest", guard)
        self.assertIn("shop correction lineages cannot be deleted", guard)
        self.assertIn("prior.superseded_at is not null", guard)
        self.assertIn(
            "prior.current_consumption_ordinal = new.initial_consumption_ordinal",
            guard,
        )
        self.assertIn(
            "prior.current_consumption_digest is not distinct from new.initial_consumption_digest",
            guard,
        )

    def test_consumption_is_immutable_and_uses_transaction_server_time(self) -> None:
        guard = self.sql[
            self.sql.index("create function app_private.guard_shop_correction_consumption()") :
            self.sql.index("create trigger shop_correction_consumption_guard")
        ]
        self.assertIn("if tg_op <> 'insert'", guard)
        self.assertIn("shop correction consumptions are immutable", guard)
        self.assertIn("new.consumed_at := transaction_timestamp()", guard)
        self.assertIn("extract(epoch from new.consumed_at) * 1000", guard)

    def test_both_tables_force_rls_and_owner_policies_bind_workspace_human_and_capability(self) -> None:
        for table in ("shop_correction_lineages", "shop_correction_consumptions"):
            with self.subTest(table=table):
                self.assertIn(
                    f"alter table app_private.{table} enable row level security", self.sql
                )
                self.assertIn(
                    f"alter table app_private.{table} force row level security", self.sql
                )
        for binding in (
            "current_setting('app.workspace_id', true)",
            "current_setting('app.actor_id', true)",
            "current_setting('app.actor_kind', true)) = 'human'",
            "membership.status = 'active'",
            "'commerce.write' = any(membership.capabilities)",
            "access.status = 'active'",
            "access.owner_actor_id = (select current_setting('app.actor_id', true))",
        ):
            with self.subTest(binding=binding):
                self.assertGreaterEqual(self.sql.count(binding), 2)

    def test_grants_are_narrow_and_api_roles_are_revoked(self) -> None:
        self.assertIn(
            "revoke all on app_private.shop_correction_lineages from public, anon, authenticated, service_role",
            self.sql,
        )
        self.assertIn(
            "revoke all on app_private.shop_correction_consumptions from public, anon, authenticated, service_role",
            self.sql,
        )
        self.assertIn(
            "grant select, insert, update on app_private.shop_correction_lineages to supermega_trial_backend",
            self.sql,
        )
        self.assertIn(
            "grant select, insert on app_private.shop_correction_consumptions to supermega_trial_backend",
            self.sql,
        )
        self.assertNotIn(
            "grant select, insert, update on app_private.shop_correction_consumptions",
            self.sql,
        )
        self.assertNotIn(
            "grant delete on app_private.shop_correction_lineages", self.sql
        )
        self.assertNotIn(
            "on app_private.shop_correction_lineages for all", self.sql
        )
        self.assertNotIn(
            "on app_private.shop_correction_consumptions for all", self.sql
        )


class ShopCorrectionPostgresV14SourceBoundaryTests(unittest.TestCase):
    def test_global_consumption_gate_remains_hardcoded_false(self) -> None:
        function = _function_source(
            RUNTIME, None, "shop_correction_global_consumption_ready"
        )
        parsed = ast.parse(function)
        returns = [node for node in ast.walk(parsed) if isinstance(node, ast.Return)]
        self.assertEqual(len(returns), 1)
        self.assertIsInstance(returns[0].value, ast.Constant)
        self.assertIs(returns[0].value.value, False)
        calls = [node for node in ast.walk(parsed) if isinstance(node, ast.Call)]
        self.assertEqual(calls, [])

    def test_every_postgres_consumption_method_requires_human_supabase_principal(self) -> None:
        methods = (
            "activate_shop_correction_lineage",
            "consume_shop_correction_authorization",
            "get_shop_correction_reconciliation_status",
        )
        for method in methods:
            with self.subTest(method=method):
                function = _function_source(STORE, "PostgresTrialStore", method)
                self.assertIn("_require_shop_correction_principal(principal)", function)
                self.assertIn("capability=\"commerce.write\"", function)
                self.assertIn("_require_active_workspace_owner", function)
                self.assertNotIn("shop_correction_consumption_postgres_ready", function)


if __name__ == "__main__":
    unittest.main()
