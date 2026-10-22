"""Source-level sale sync checks with synthetic merchants and the parity store."""

from __future__ import annotations

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    InMemoryTrialStore, PostgresTrialStore, TrialNotReadyError, TrialPrincipal,
)


WORKSPACE_A = "shop-sync-workspace-a"
WORKSPACE_B = "shop-sync-workspace-b"
ACTOR_A = "3ebf95d9-b2c4-4c0c-96c5-c648cad55f40"
ACTOR_B = "642fd192-690b-4ba5-af1c-c9988ac592cb"
SESSION_A = "c87d28d5-1b8d-4c48-aa75-7ecbc877ef7b"
SESSION_B = "80f9c4e2-6283-4cad-92cf-1fe727581ec2"
DEVICE_A = "3974d349-d499-4570-a68c-ef71ed40c244"
DEVICE_B = "5c49880d-b176-4200-b6b6-699631d38b5d"
BIND_ROUTE = "/api/trial/v1/shop/sync-devices/bind"
SALE_ROUTE = "/api/trial/v1/shop/sale-operations"


def sale(operation_id: str = "sale-local-001", *, workspace_id: str = WORKSPACE_A, device_id: str = DEVICE_A) -> dict:
    return {
        "schemaVersion": 1,
        "workspaceId": workspace_id,
        "deviceId": device_id,
        "operationId": operation_id,
        "eventType": "shop.cash_sale.completed.v1",
        "payload": {
            "saleId": operation_id,
            "totalMmk": 6500,
            "paymentMethod": "cash",
            "createdAtMillis": 1792627200000,
            "lines": [
                {"productId": "tea", "productName": "Tea", "unitPriceMmk": 1500, "quantity": 1, "lineTotalMmk": 1500},
                {"productId": "rice", "productName": "Rice", "unitPriceMmk": 2500, "quantity": 2, "lineTotalMmk": 5000},
            ],
        },
    }


class ShopSaleSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        self.principals = {
            "user-a": TrialPrincipal(WORKSPACE_A, ACTOR_A, "human", session_id=SESSION_A, identity_provider="supabase"),
            "user-b": TrialPrincipal(WORKSPACE_B, ACTOR_B, "human", session_id=SESSION_B, identity_provider="supabase"),
            "gateway": TrialPrincipal(WORKSPACE_A, ACTOR_A, "human", identity_provider="gateway"),
        }
        for workspace, actor in ((WORKSPACE_A, ACTOR_A), (WORKSPACE_B, ACTOR_B)):
            self.store.provision_membership(
                workspace_id=workspace, actor_id=actor, actor_kind="human",
                capabilities=("commerce.write",),
            )
            self.store.provision_product_entitlements(workspace_id=workspace, products=("commerce",))
        app = FastAPI()
        app.include_router(create_trial_router(
            store=self.store,
            resolve_principal=lambda request: self.principals.get(
                request.headers.get("authorization", "").removeprefix("Bearer ")
            ),
        ))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def post(self, route: str, body: dict, token: str = "user-a"):
        return self.client.post(route, json=body, headers={"Authorization": f"Bearer {token}"})

    def bind(self, *, workspace_id: str = WORKSPACE_A, device_id: str = DEVICE_A, token: str = "user-a"):
        return self.post(BIND_ROUTE, {
            "schemaVersion": 1, "workspaceId": workspace_id,
            "deviceId": device_id, "confirmWorkspace": True,
        }, token)

    def test_lost_ack_retry_and_reordered_lines_keep_one_sale_and_stock_effect(self) -> None:
        self.assertEqual(self.bind().status_code, 200)
        first = self.post(SALE_ROUTE, sale())
        self.assertEqual(first.status_code, 200, first.text)
        retry_payload = sale()
        retry_payload["payload"]["lines"].reverse()
        retry = self.post(SALE_ROUTE, retry_payload)
        self.assertEqual(retry.status_code, 200, retry.text)
        self.assertFalse(first.json()["idempotentReplay"])
        self.assertTrue(retry.json()["idempotentReplay"])
        self.assertEqual(first.json()["acknowledgement"], retry.json()["acknowledgement"])
        self.assertEqual(len(self.store._shop_sales), 1)
        self.assertEqual(len(self.store._shop_stock_movements), 2)
        self.assertEqual({row[3] for row in self.store._shop_stock_movements}, {-1, -2})

    def test_changed_retry_conflicts_without_extra_sale(self) -> None:
        self.bind()
        self.assertEqual(self.post(SALE_ROUTE, sale()).status_code, 200)
        changed = deepcopy(sale())
        changed["payload"]["lines"][0]["productName"] = "Other tea"
        conflict = self.post(SALE_ROUTE, changed)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"]["code"], "shop_sync_operation_conflict")
        self.assertEqual(len(self.store._shop_sales), 1)
        self.assertEqual(len(self.store._shop_stock_movements), 2)

    def test_wrong_workspace_and_missing_membership_cannot_bind_or_ingest(self) -> None:
        self.assertEqual(self.bind(workspace_id=WORKSPACE_B).status_code, 403)
        self.assertEqual(self.bind(token="user-b", workspace_id=WORKSPACE_B, device_id=DEVICE_B).status_code, 200)
        self.assertEqual(self.post(SALE_ROUTE, sale(), token="user-b").status_code, 403)
        self.store.provision_membership(
            workspace_id=WORKSPACE_A, actor_id=ACTOR_A, actor_kind="human",
            capabilities=("commerce.write",), status="revoked",
        )
        self.assertEqual(self.bind().status_code, 403)
        self.assertFalse(self.store._shop_sales)

    def test_shop_only_can_sell_but_ecommerce_only_cannot_bind_or_ingest(self) -> None:
        self.store.provision_product_entitlements(
            workspace_id=WORKSPACE_B, products=("ecommerce",),
        )
        self.assertEqual(self.bind(token="user-b", workspace_id=WORKSPACE_B, device_id=DEVICE_B).status_code, 403)
        self.assertEqual(self.post(
            SALE_ROUTE, sale(workspace_id=WORKSPACE_B, device_id=DEVICE_B), token="user-b",
        ).status_code, 403)
        self.assertEqual(self.bind().status_code, 200)
        self.assertEqual(self.post(SALE_ROUTE, sale()).status_code, 200)
        self.assertEqual(len(self.store._shop_sales), 1)

    def test_binding_is_explicit_and_one_device_only(self) -> None:
        self.assertEqual(self.post(SALE_ROUTE, sale()).status_code, 403)
        first = self.bind()
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(self.bind().json()["boundAt"], first.json()["boundAt"])
        self.assertEqual(self.bind(device_id=DEVICE_B).status_code, 409)
        self.assertEqual(len(self.store._shop_sync_devices), 1)

    def test_revoked_device_cannot_retry_even_a_previously_accepted_sale(self) -> None:
        self.bind()
        self.assertEqual(self.post(SALE_ROUTE, sale()).status_code, 200)
        self.store._shop_sync_devices[(WORKSPACE_A, DEVICE_A)]["status"] = "revoked"
        self.assertEqual(self.post(SALE_ROUTE, sale()).status_code, 403)
        self.assertEqual(self.bind().status_code, 409)
        self.assertEqual(len(self.store._shop_sales), 1)

    def test_reordered_operations_receive_distinct_revisions(self) -> None:
        self.bind()
        second = self.post(SALE_ROUTE, sale("sale-local-002"))
        first = self.post(SALE_ROUTE, sale("sale-local-001"))
        self.assertEqual((second.status_code, first.status_code), (200, 200))
        self.assertLess(second.json()["acknowledgement"]["serverRevision"], first.json()["acknowledgement"]["serverRevision"])
        self.assertEqual(len(self.store._shop_sales), 2)
        self.assertEqual(len(self.store._shop_stock_movements), 4)

    def test_auth_schema_and_arithmetic_fail_closed(self) -> None:
        self.assertEqual(self.bind(token="unknown").status_code, 401)
        self.assertEqual(self.bind(token="gateway").status_code, 401)
        self.assertEqual(self.bind().status_code, 200)
        wrong_version = sale()
        wrong_version["schemaVersion"] = 2
        self.assertEqual(self.post(SALE_ROUTE, wrong_version).status_code, 422)
        wrong_amount = sale()
        wrong_amount["payload"]["totalMmk"] = 6501
        self.assertEqual(self.post(SALE_ROUTE, wrong_amount).status_code, 422)
        invalid_unicode = sale()
        invalid_unicode["payload"]["lines"][0]["productName"] = "\ud800"
        self.assertEqual(self.client.post(
            SALE_ROUTE, content=json.dumps(invalid_unicode).encode("ascii"),
            headers={"Authorization": "Bearer user-a", "Content-Type": "application/json"},
        ).status_code, 422)
        self.assertFalse(self.store._shop_sales)

    def test_postgres_adapter_stays_closed_before_v14_schema_target(self) -> None:
        postgres = PostgresTrialStore("", reducer=reduce_trial_state, write_enabled=True)
        with patch("supermega_runtime.trial_store.TRIAL_SCHEMA_VERSION", 13):
            with self.assertRaises(TrialNotReadyError) as binding:
                postgres.bind_shop_sync_device(self.principals["user-a"], device_id=DEVICE_A)
        self.assertEqual(binding.exception.reasons, ("shop_sync_schema_ready",))


if __name__ == "__main__":
    unittest.main()
