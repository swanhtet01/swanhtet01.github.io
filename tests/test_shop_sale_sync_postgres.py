"""Source-bound Shop v14 rehearsal on disposable PostgreSQL 17 in hosted CI.

The parent test starts a fresh process so the runtime imports schema v14. The
existing TLS-only PostgreSQL fixture applies the canonical v13 chain first,
then the proposed Shop migration. No provider URL or credentials are used.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from uuid import uuid4

from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.shop_sale_sync import (
    ShopSyncDeviceNotBound, ShopSyncOperationConflict, parse_sale_operation,
)
from supermega_runtime.trial_store import (
    PostgresTrialStore, TrialNotReadyError, TrialPermissionDenied, TrialPrincipal,
)
from tests.test_website_media_postgres import _local_database
from tools import rehearse_supermega_postgres17 as pg


ROOT = Path(__file__).resolve().parents[1]
CHILD = "SUPERMEGA_TEST_SHOP_SYNC_POSTGRES_CHILD"


@unittest.skipUnless(
    os.environ.get("GITHUB_ACTIONS") == "true"
    and bool(os.environ.get("SUPERMEGA_CI_SOURCE_SHA"))
    and os.environ.get(CHILD) != "1",
    "Hosted exact-source PostgreSQL 17 rehearsal only.",
)
class ShopSyncPostgresLauncher(unittest.TestCase):
    def test_disposable_v13_to_v14_rehearsal(self) -> None:
        head = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
        ).strip()
        self.assertEqual(head, os.environ["SUPERMEGA_CI_SOURCE_SHA"])
        self.assertFalse(subprocess.check_output(
            ["git", "status", "--porcelain", "--untracked-files=all"],
            cwd=ROOT, text=True,
        ).strip())
        environment = os.environ.copy()
        environment[CHILD] = "1"
        environment["SUPERMEGA_TRIAL_SCHEMA_VERSION"] = "14"
        environment["SUPERMEGA_BILLING_SCHEMA_VERSION"] = "13"
        environment["SUPERMEGA_OTEL_DISABLED"] = "1"
        environment["SUPERMEGA_TEST_POSTGRES_BIN"] = environment["SUPERMEGA_POSTGRES17_BIN"]
        completed = subprocess.run(
            [sys.executable, "-m", "unittest",
             "tests.test_shop_sale_sync_postgres.LocalShopSyncPostgresTests", "-v"],
            cwd=ROOT, env=environment, capture_output=True, text=True,
            timeout=180, check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr[-7000:])


@unittest.skipUnless(os.environ.get(CHILD) == "1", "Run via source-bound hosted launcher.")
class LocalShopSyncPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if pg.CURRENT_SCHEMA_VERSION != 13:
            raise RuntimeError("The Shop rehearsal must start from canonical v13.")
        cls.admin, cls.runtime = cls.enterClassContext(_local_database(
            extra_migrations=(pg.SHOP_SYNC_CANDIDATE_MIGRATION,),
        ))
        cls.store = PostgresTrialStore(cls.runtime, reducer=reduce_trial_state, write_enabled=True)

    def _sql(self, statement: str, parameters: tuple = ()) -> list[tuple]:
        with pg._connect(self.admin) as connection:
            with connection.cursor() as cursor:
                cursor.execute(statement, parameters)
                return cursor.fetchall() if cursor.description else []

    def _principal(self, product: str = "shop") -> TrialPrincipal:
        workspace = "shop-sql-" + str(uuid4())
        actor, session = str(uuid4()), str(uuid4())
        self._sql(
            """insert into app_private.workspace_access_controls
               (workspace_id, activation_id, authorization_id, authorization_contract,
                plan_digest, owner_actor_id, project_ref, release_commit, status)
               values (%s,%s,%s,'legacy_migration_v1',%s,%s,%s,%s,'active')""",
            (workspace, str(uuid4()), str(uuid4()), "0" * 64, actor, "0" * 20, "0" * 40),
        )
        self._sql(
            """insert into app_private.workspace_events
               (event_id, workspace_id, command_id, command_fingerprint, surface,
                event_type, actor_id, actor_kind, payload_json, result_json)
               values (%s,%s,%s,%s,'company','company.workspace.activated',%s,
                       'human',%s::jsonb,%s::jsonb)""",
            (str(uuid4()), workspace, str(uuid4()), "0" * 64, actor,
             json.dumps({"products": [product]}), json.dumps({"status": "activated"})),
        )
        self._sql(
            """insert into app_private.workspace_memberships
               (workspace_id, actor_id, status, capabilities, actor_kind)
               values (%s,%s,'active',%s,'human')""",
            (workspace, actor, ["commerce.write", "company.read"]),
        )
        self._sql("insert into auth.sessions (id,user_id) values (%s,%s)", (session, actor))
        return TrialPrincipal(workspace, actor, "human", session_id=session,
                              identity_provider="supabase")

    @staticmethod
    def _sale(principal: TrialPrincipal, device_id: str, operation_id: str):
        return parse_sale_operation({
            "schemaVersion": 1,
            "workspaceId": principal.workspace_id,
            "deviceId": device_id,
            "operationId": operation_id,
            "eventType": "shop.cash_sale.completed.v1",
            "payload": {
                "saleId": operation_id,
                "totalMmk": 6500,
                "paymentMethod": "cash",
                "createdAtMillis": 1792627200000,
                "lines": [
                    {"productId": "tea", "productName": "Tea", "unitPriceMmk": 1500,
                     "quantity": 1, "lineTotalMmk": 1500},
                    {"productId": "rice", "productName": "Rice", "unitPriceMmk": 2500,
                     "quantity": 2, "lineTotalMmk": 5000},
                ],
            },
        }, workspace_id=principal.workspace_id)

    def _raw_device_insert_denied(self, principal: TrialPrincipal, target_workspace: str) -> None:
        import psycopg
        with pg._connect(self.runtime) as connection:
            with connection.cursor() as cursor:
                cursor.execute("select current_user")
                self.assertEqual(cursor.fetchone()[0], pg.RUNTIME_ROLE)
                cursor.execute(
                    """select set_config('app.workspace_id',%s,true),
                              set_config('app.actor_id',%s,true),
                              set_config('app.actor_kind','human',true)""",
                    (principal.workspace_id, principal.actor_id),
                )
                with self.assertRaises(psycopg.Error) as denied:
                    cursor.execute(
                        """insert into app_private.shop_sync_devices
                           (workspace_id,device_id,bound_by) values (%s,%s,%s)""",
                        (target_workspace, str(uuid4()), principal.actor_id),
                    )
                self.assertEqual(denied.exception.sqlstate, "42501")

    def test_v14_ddl_runtime_sale_replay_and_cross_tenant_rls(self) -> None:
        self.assertEqual(self._sql(
            "select schema_version from app_private.trial_schema_meta where component='private_trial_backend'"
        ), [(14,)])
        owner, other = self._principal(), self._principal()
        device_id, operation_id = str(uuid4()), "sale-" + str(uuid4())
        self.store.bind_shop_sync_device(owner, device_id=device_id)
        operation = self._sale(owner, device_id, operation_id)
        first = self.store.ingest_shop_sale_operation(owner, operation)
        replay = self.store.ingest_shop_sale_operation(owner, operation)
        self.assertEqual(first["acknowledgement"], replay["acknowledgement"])
        self.assertFalse(first["idempotentReplay"])
        self.assertTrue(replay["idempotentReplay"])
        self.assertGreater(first["acknowledgement"]["serverRevision"], 0)
        self.assertEqual(self._sql(
            "select count(*) from app_private.shop_sales where workspace_id=%s",
            (owner.workspace_id,),
        ), [(1,)])
        self.assertEqual(self._sql(
            """select product_id,quantity_delta from app_private.shop_stock_movements
               where workspace_id=%s order by product_id""",
            (owner.workspace_id,),
        ), [("rice", -2), ("tea", -1)])
        self._raw_device_insert_denied(owner, other.workspace_id)

    def test_ecommerce_only_activation_denies_runtime_and_rls(self) -> None:
        operator = self._principal("ecommerce")
        with self.assertRaises(TrialPermissionDenied):
            self.store.bind_shop_sync_device(operator, device_id=str(uuid4()))
        self._raw_device_insert_denied(operator, operator.workspace_id)

    def test_revoked_membership_and_device_deny_replay(self) -> None:
        owner = self._principal()
        device_id, operation_id = str(uuid4()), "sale-" + str(uuid4())
        self.store.bind_shop_sync_device(owner, device_id=device_id)
        operation = self._sale(owner, device_id, operation_id)
        self.store.ingest_shop_sale_operation(owner, operation)
        self._sql(
            """update app_private.workspace_memberships set status='revoked'
               where workspace_id=%s and actor_id=%s""",
            (owner.workspace_id, owner.actor_id),
        )
        with self.assertRaises((TrialNotReadyError, TrialPermissionDenied)):
            self.store.ingest_shop_sale_operation(owner, operation)
        self._sql(
            """update app_private.workspace_memberships set status='active'
               where workspace_id=%s and actor_id=%s""",
            (owner.workspace_id, owner.actor_id),
        )
        self._sql(
            """update app_private.shop_sync_devices set status='revoked'
               where workspace_id=%s and device_id=%s""",
            (owner.workspace_id, device_id),
        )
        with self.assertRaises(ShopSyncDeviceNotBound):
            self.store.ingest_shop_sale_operation(owner, operation)
        self.assertEqual(self._sql(
            "select count(*) from app_private.shop_sale_operations where workspace_id=%s",
            (owner.workspace_id,),
        ), [(1,)])

    def test_changed_retry_and_immutable_ledger_rows(self) -> None:
        import psycopg
        owner = self._principal()
        device_id, operation_id = str(uuid4()), "sale-" + str(uuid4())
        self.store.bind_shop_sync_device(owner, device_id=device_id)
        original = self._sale(owner, device_id, operation_id)
        self.store.ingest_shop_sale_operation(owner, original)
        changed = self._sale(owner, device_id, operation_id)
        from dataclasses import replace
        with self.assertRaises(ShopSyncOperationConflict):
            self.store.ingest_shop_sale_operation(
                owner, replace(changed, fingerprint="0" * 64),
            )
        for table, column in (
            ("shop_sales", "total_mmk"),
            ("shop_stock_movements", "quantity_delta"),
            ("shop_sale_operations", "fingerprint"),
        ):
            with self.subTest(table=table):
                for mutation in (
                    f"update app_private.{table} set {column}={column} where workspace_id=%s",
                    f"delete from app_private.{table} where workspace_id=%s",
                ):
                    with self.assertRaises(psycopg.Error) as denied:
                        self._sql(mutation, (owner.workspace_id,))
                    self.assertEqual(denied.exception.sqlstate, "55000")


if __name__ == "__main__":
    unittest.main()
