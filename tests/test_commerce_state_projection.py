from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import unittest
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    PostgresTrialStore,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialState,
)


class CommerceStateProjectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.workspace_id = "workspace-shared"
        self.shop_actor = TrialPrincipal(self.workspace_id, "shop-operator", "human")
        self.internal_actor = TrialPrincipal(self.workspace_id, "internal-operator", "human")
        self.full_state = {
            "items": [{"id": "item-1", "name": "Tea"}],
            "websiteIntakes": [{"id": "intake-1"}],
            "storefrontRequests": [{"id": "request-1", "status": "new"}],
            "storefrontConfiguration": {"privateDraft": "internal-only"},
        }

    @staticmethod
    def replace_state(_surface, _event_type, _current, payload):
        return payload["state"]

    def make_store(self) -> InMemoryTrialStore:
        store = InMemoryTrialStore(reducer=self.replace_state)
        store.provision_product_entitlements(
            workspace_id=self.workspace_id,
            products=("commerce", "ecommerce"),
        )
        store.provision_membership(
            workspace_id=self.workspace_id,
            actor_id=self.shop_actor.actor_id,
            actor_kind="human",
            capabilities=("commerce.read", "commerce.write"),
        )
        store.provision_membership(
            workspace_id=self.workspace_id,
            actor_id=self.internal_actor.actor_id,
            actor_kind="human",
            capabilities=("commerce.read", "commerce.write", "ecommerce.manage"),
        )
        store._states[(self.workspace_id, "commerce")] = TrialState(
            self.workspace_id, "commerce", 1, deepcopy(self.full_state)
        )
        return store

    def test_shop_read_and_full_state_command_preserve_internal_draft(self) -> None:
        store = self.make_store()
        shop_state = store.get_state(self.shop_actor, "commerce")
        self.assertEqual(shop_state.state["items"], self.full_state["items"])
        self.assertEqual(shop_state.state["websiteIntakes"], self.full_state["websiteIntakes"])
        self.assertEqual(shop_state.state["storefrontRequests"], self.full_state["storefrontRequests"])
        self.assertNotIn("storefrontConfiguration", shop_state.state)
        self.assertEqual(
            store.get_state(self.internal_actor, "commerce").state["storefrontConfiguration"],
            self.full_state["storefrontConfiguration"],
        )

        edited_shop_state = deepcopy(shop_state.state)
        edited_shop_state["items"].append({"id": "item-2", "name": "Coffee"})
        command_id = str(uuid4())
        command = dict(
            command_id=command_id,
            surface="commerce",
            event_type="commerce.item.created",
            expected_version=1,
            payload={"state": edited_shop_state},
        )
        result = store.apply_command(self.shop_actor, **command)
        self.assertEqual(result.version, 2)
        self.assertNotIn("storefrontConfiguration", result.state)
        self.assertEqual(result.state["items"], edited_shop_state["items"])
        self.assertEqual(result.state["storefrontRequests"], self.full_state["storefrontRequests"])
        self.assertEqual(
            store.get_state(self.internal_actor, "commerce").state["storefrontConfiguration"],
            self.full_state["storefrontConfiguration"],
        )
        replay = store.apply_command(self.shop_actor, **command)
        self.assertTrue(replay.idempotent_replay)
        self.assertNotIn("storefrontConfiguration", replay.state)

        forged_state = deepcopy(edited_shop_state)
        forged_state["storefrontConfiguration"] = {"privateDraft": "overwritten"}
        with self.assertRaises(TrialPermissionDenied):
            store.apply_command(
                self.shop_actor,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.item.created",
                expected_version=2,
                payload={"state": forged_state},
            )
        self.assertEqual(store.get_state(self.internal_actor, "commerce").version, 2)
        self.assertEqual(
            store.get_state(self.internal_actor, "commerce").state["storefrontConfiguration"],
            self.full_state["storefrontConfiguration"],
        )

    def test_postgres_read_uses_guarded_membership_capabilities(self) -> None:
        store = PostgresTrialStore("", reducer=self.replace_state)
        row = {
            "workspace_id": self.workspace_id,
            "surface": "commerce",
            "version": 1,
            "state_json": deepcopy(self.full_state),
            "updated_by": self.internal_actor.actor_id,
            "updated_at": "2026-10-16T00:00:00Z",
        }

        @contextmanager
        def guarded_cursor(principal, *, write=False, capability=None):
            self.assertFalse(write)
            self.assertIsNone(capability)
            cursor = Mock()
            cursor.fetchone.return_value = deepcopy(row)
            capabilities = {"commerce.read"}
            if principal.actor_id == self.internal_actor.actor_id:
                capabilities.add("ecommerce.manage")
            yield cursor, frozenset(capabilities)

        with patch.object(store, "_guarded_cursor", side_effect=guarded_cursor):
            customer_state = store.get_state(self.shop_actor, "commerce")
            internal_state = store.get_state(self.internal_actor, "commerce")
        self.assertNotIn("storefrontConfiguration", customer_state.state)
        self.assertEqual(customer_state.state["storefrontRequests"], self.full_state["storefrontRequests"])
        self.assertEqual(
            internal_state.state["storefrontConfiguration"],
            self.full_state["storefrontConfiguration"],
        )

    def test_customer_bootstrap_keeps_shop_inbox_without_internal_draft(self) -> None:
        store = self.make_store()
        app = FastAPI()

        def resolve_principal(_request: Request) -> TrialPrincipal:
            return self.shop_actor

        app.include_router(create_trial_router(store=store, resolve_principal=resolve_principal))
        with TestClient(app) as client:
            response = client.get("/api/trial/v1/bootstrap")
        self.assertEqual(response.status_code, 200)
        commerce = response.json()["states"]["commerce"]["state"]
        self.assertEqual(commerce["storefrontRequests"], self.full_state["storefrontRequests"])
        self.assertNotIn("storefrontConfiguration", commerce)


if __name__ == "__main__":
    unittest.main()
