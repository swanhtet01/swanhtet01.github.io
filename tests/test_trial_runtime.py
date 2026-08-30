from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.commerce_runtime import (
    commerce_catalog_digest,
    commerce_storefront_preview_digest,
)
from supermega_runtime.plant_order_foundation import plant_order_evidence_digest
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal


def _decision_packet(release: str = "catalog-v1") -> dict[str, object]:
    return {
        "contract": "decision_packet.v1",
        "subject": {"kind": "release", "id": release, "version": 1},
        "decision": f"Release {release}",
        "claims": [
            {
                "id": "claim-catalog-review",
                "claim_type": "fact",
                "statement": "The catalog passed the bounded trial review.",
                "source_reference": "review://catalog/1",
                "captured_at": "2026-07-22T00:00:00+00:00",
                "status": "verified",
                "uncertainty": "low",
                "visibility": "private",
                "digest": "sha256:" + "0" * 64,
            }
        ],
        "baseline": "Catalog is not released.",
        "target": f"{release} is available to the trial workspace.",
        "result": "The bounded review passed.",
        "acceptance": "The release record and owner decision are preserved.",
        "artifact_reference": "artifact://catalog/release-v1",
    }


class MergeReducer:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(
        self,
        surface: str,
        event_type: str,
        current: Mapping[str, object],
        payload: Mapping[str, object],
    ) -> Mapping[str, object]:
        self.calls += 1
        next_state = dict(current)
        changes = payload.get("changes", {})
        if isinstance(changes, Mapping):
            next_state.update(changes)
        next_state["last_event_type"] = event_type
        return next_state


class TrialRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reducer = MergeReducer()
        self.store = InMemoryTrialStore(reducer=self.reducer)
        self.operator = TrialPrincipal("workspace-a", "actor-operator", "human")
        self.manager = TrialPrincipal("workspace-a", "actor-manager", "human")
        self.agent_manager = TrialPrincipal("workspace-a", "actor-agent-manager", "agent")
        self.other_operator = TrialPrincipal("workspace-b", "actor-other", "human")
        self.other_manager = TrialPrincipal("workspace-b", "actor-other-manager", "human")
        self.missing_member = TrialPrincipal("workspace-a", "actor-missing", "human")
        self.sessions = {
            "operator-session": self.operator,
            "manager-session": self.manager,
            "agent-manager-session": self.agent_manager,
            "other-operator-session": self.other_operator,
            "other-manager-session": self.other_manager,
            "missing-session": self.missing_member,
        }
        self._provision(self.store)
        self.client = self._client(self.store)

    def tearDown(self) -> None:
        self.client.close()

    @staticmethod
    def _provision(store: InMemoryTrialStore) -> None:
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=("commerce.write", "website.write", "approvals.request"),
        )
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-manager",
            actor_kind="human",
            capabilities=("approvals.decide",),
        )
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("website.write", "approvals.decide"),
        )
        store.provision_membership(
            workspace_id="workspace-b",
            actor_id="actor-other",
            actor_kind="human",
            capabilities=("commerce.write", "approvals.request"),
        )
        store.provision_membership(
            workspace_id="workspace-b",
            actor_id="actor-other-manager",
            actor_kind="human",
            capabilities=("approvals.decide",),
        )

    def _client(self, store: InMemoryTrialStore) -> TestClient:
        # The test token map stands in for trusted authentication middleware.
        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return self.sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(create_trial_router(store=store, resolve_principal=resolve_principal))
        return TestClient(app)

    @staticmethod
    def _headers(session: str = "operator-session") -> dict[str, str]:
        return {"x-test-session": session}

    @staticmethod
    def _command_body(
        *,
        command_id: str | None = None,
        expected_version: int = 0,
        sku: str = "sku-a",
        actor: str = "actor-operator",
        event_type: str = "commerce.order.saved",
    ) -> dict[str, object]:
        return {
            "command_id": command_id or str(uuid4()),
            "surface": "commerce",
            "event_type": event_type,
            "expected_version": expected_version,
            "payload": {
                "changes": {"sku": sku},
                "evidence": {"actor": actor},
            },
        }

    def test_auth_is_required_and_client_identity_is_rejected(self) -> None:
        unauthenticated = self.client.post("/api/trial/v1/commands", json=self._command_body())
        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(unauthenticated.json()["detail"]["code"], "trial_auth_required")

        top_level_identity = self._command_body()
        top_level_identity["workspace_id"] = "workspace-b"
        rejected_top_level = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=top_level_identity,
        )
        self.assertEqual(rejected_top_level.status_code, 422)

        nested_identity = self._command_body()
        nested_identity["payload"] = {
            "changes": {"sku": "sku-a"},
            "metadata": {"actor_id": "spoofed-actor"},
        }
        rejected_nested = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=nested_identity,
        )
        self.assertEqual(rejected_nested.status_code, 422)
        self.assertEqual(
            rejected_nested.json()["detail"]["code"],
            "client_identity_forbidden",
        )
        self.assertEqual(self.reducer.calls, 0)

    def test_product_acceptance_is_owner_gated_idempotent_and_tenant_isolated(self) -> None:
        self.store.provision_product_entitlements(
            workspace_id="workspace-a",
            products=("commerce", "website"),
        )
        self.store.provision_product_entitlements(
            workspace_id="workspace-b",
            products=("commerce",),
        )
        probe_id = str(uuid4())
        owner_approval_id = str(uuid4())
        body = {
            "probe_id": probe_id,
            "owner_approval_id": owner_approval_id,
            "product": "commerce",
            "release_commit": "a" * 40,
            "confirmation": "RECORD HOSTED PRODUCT ACCEPTANCE",
        }

        recorded = self.client.post(
            "/api/trial/v1/product-acceptance",
            headers=self._headers(),
            json=body,
        )
        self.assertEqual(recorded.status_code, 200)
        recorded_body = recorded.json()
        self.assertTrue(recorded_body["external_writes_performed"])
        self.assertFalse(recorded_body["product_state_mutated"])
        self.assertFalse(recorded_body["secret_values_exposed"])
        acceptance = recorded_body["acceptance"]
        self.assertEqual(acceptance["probe_id"], probe_id)
        self.assertEqual(acceptance["owner_approval_id"], owner_approval_id)
        self.assertEqual(acceptance["product"], "commerce")
        self.assertEqual(acceptance["surface"], "commerce")
        self.assertEqual(acceptance["release_commit"], "a" * 40)
        self.assertEqual(acceptance["state_version"], 0)
        self.assertRegex(acceptance["state_digest"], r"^sha256:[0-9a-f]{64}$")

        readback = self.client.get(
            f"/api/trial/v1/product-acceptance/{probe_id}",
            headers=self._headers(),
        )
        self.assertEqual(readback.status_code, 200)
        self.assertEqual(readback.json()["acceptance"], acceptance)
        self.assertFalse(readback.json()["external_writes_performed"])

        replay = self.client.post(
            "/api/trial/v1/product-acceptance",
            headers=self._headers(),
            json=body,
        )
        self.assertEqual(replay.status_code, 200)
        self.assertFalse(replay.json()["external_writes_performed"])
        self.assertTrue(replay.json()["acceptance"]["idempotent_replay"])

        changed = {**body, "owner_approval_id": str(uuid4())}
        conflict = self.client.post(
            "/api/trial/v1/product-acceptance",
            headers=self._headers(),
            json=changed,
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"]["code"], "trial_idempotency_conflict")

        unentitled = self.client.post(
            "/api/trial/v1/product-acceptance",
            headers=self._headers(),
            json={**body, "probe_id": str(uuid4()), "product": "ecommerce"},
        )
        self.assertEqual(unentitled.status_code, 403)
        self.assertEqual(
            unentitled.json()["detail"]["code"],
            "trial_product_entitlement_required",
        )

        cross_tenant = self.client.get(
            f"/api/trial/v1/product-acceptance/{probe_id}",
            headers=self._headers("other-operator-session"),
        )
        self.assertEqual(cross_tenant.status_code, 404)
        self.assertEqual(cross_tenant.json()["detail"]["code"], "trial_not_found")

    def test_activation_entitlements_override_mismatched_product_capabilities(self) -> None:
        store = InMemoryTrialStore(reducer=self.reducer)
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=(
                "company.read",
                "commerce.write",
                "production.write",
                "website.write",
            ),
        )
        store.provision_product_entitlements(
            workspace_id="workspace-a",
            products=("commerce",),
        )
        with self._client(store) as client:
            bootstrap = client.get("/api/trial/v1/bootstrap", headers=self._headers())
            self.assertEqual(bootstrap.status_code, 200)
            body = bootstrap.json()
            self.assertEqual(body["readiness"]["productEntitlements"], ["commerce"])
            self.assertEqual(
                body["readiness"]["capabilities"],
                ["commerce.write", "company.read"],
            )
            self.assertIn("commerce", body["states"])
            self.assertNotIn("production", body["states"])
            self.assertNotIn("website", body["states"])

            denied = self._command_body(event_type="production.workspace.initialized")
            denied["surface"] = "production"
            response = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=denied,
            )
            self.assertEqual(response.status_code, 403)
            self.assertEqual(
                response.json()["detail"],
                {"code": "trial_capability_required", "required_capability": "production.write"},
            )

    def test_ecommerce_entitlement_can_use_shared_commerce_state_without_shop_access(self) -> None:
        store = InMemoryTrialStore(reducer=self.reducer)
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=("commerce.read", "commerce.write", "production.write"),
        )
        store.provision_product_entitlements(
            workspace_id="workspace-a",
            products=("ecommerce",),
        )
        with self._client(store) as client:
            bootstrap = client.get("/api/trial/v1/bootstrap", headers=self._headers())
            self.assertEqual(bootstrap.status_code, 200)
            body = bootstrap.json()
            self.assertEqual(body["readiness"]["productEntitlements"], ["ecommerce"])
            self.assertIn("commerce", body["states"])
            self.assertNotIn("production", body["states"])

    def test_successful_state_uses_resolved_workspace_and_actor(self) -> None:
        response = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["result"]["version"], 1)

        bootstrap = self.client.get("/api/trial/v1/bootstrap", headers=self._headers())
        self.assertEqual(bootstrap.status_code, 200)
        body = bootstrap.json()
        self.assertEqual(body["identity"]["workspace_id"], "workspace-a")
        self.assertEqual(body["identity"]["actor_id"], "actor-operator")
        self.assertEqual(body["identity"]["actor_kind"], "human")
        self.assertEqual(body["states"]["commerce"]["updated_by"], "actor-operator")
        self.assertEqual(body["states"]["commerce"]["state"]["sku"], "sku-a")

    def test_bootstrap_filters_states_and_approvals_by_capability(self) -> None:
        self.store.apply_command(
            self.operator,
            command_id=str(uuid4()),
            surface="commerce",
            event_type="commerce.order.saved",
            expected_version=0,
            payload={"changes": {"customer": "private-shop-customer"}},
        )
        self.store.apply_command(
            self.operator,
            command_id=str(uuid4()),
            surface="website",
            event_type="website.content.saved",
            expected_version=0,
            payload={"changes": {"headline": "Website-only content"}},
        )
        approval = self.store.create_approval(
            self.operator,
            command_id=str(uuid4()),
            title="Review release",
            proposal=_decision_packet(),
            evidence_refs=("review://catalog/1",),
        )

        operator = self.client.get(
            "/api/trial/v1/bootstrap",
            headers=self._headers("operator-session"),
        )
        self.assertEqual(operator.status_code, 200)
        self.assertEqual(set(operator.json()["states"]), {"commerce", "website"})
        self.assertEqual(operator.json()["approvals"][0]["approval_id"], approval.approval_id)

        manager = self.client.get(
            "/api/trial/v1/bootstrap",
            headers=self._headers("manager-session"),
        )
        self.assertEqual(manager.status_code, 200)
        self.assertEqual(manager.json()["states"], {})
        self.assertEqual(manager.json()["approvals"][0]["approval_id"], approval.approval_id)
        self.assertNotIn("private-shop-customer", str(manager.json()))

        website_reader = TrialPrincipal("workspace-a", "actor-website-reader", "human")
        self.sessions["website-reader-session"] = website_reader
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-website-reader",
            actor_kind="human",
            capabilities=("website.read",),
        )
        reader = self.client.get(
            "/api/trial/v1/bootstrap",
            headers=self._headers("website-reader-session"),
        )
        self.assertEqual(reader.status_code, 200)
        self.assertEqual(set(reader.json()["states"]), {"website"})
        self.assertEqual(reader.json()["states"]["website"]["state"]["headline"], "Website-only content")
        self.assertEqual(reader.json()["approvals"], [])
        self.assertNotIn("private-shop-customer", str(reader.json()))

    def test_bootstrap_is_workspace_scoped(self) -> None:
        shared_command_id = str(uuid4())
        first = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("operator-session"),
            json=self._command_body(command_id=shared_command_id, sku="workspace-a-sku"),
        )
        second = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("other-operator-session"),
            json=self._command_body(
                command_id=shared_command_id,
                sku="workspace-b-sku",
                actor="actor-other",
            ),
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)

        workspace_a = self.client.get(
            "/api/trial/v1/bootstrap",
            headers=self._headers("operator-session"),
        ).json()
        workspace_b = self.client.get(
            "/api/trial/v1/bootstrap",
            headers=self._headers("other-operator-session"),
        ).json()
        self.assertEqual(workspace_a["states"]["commerce"]["state"]["sku"], "workspace-a-sku")
        self.assertEqual(workspace_b["states"]["commerce"]["state"]["sku"], "workspace-b-sku")

    def test_storefront_request_command_is_revisioned_scoped_and_recoverable(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        self._provision(store)
        client = self._client(store)
        request_uuid = "00000000-0000-4000-8000-000000000020"
        request_id = f"ECR-{request_uuid}"
        catalog = {
            "schema": "supermega.commerce.workspace.v2",
            "items": [{"sku": "SKU-1", "name": "Test item", "onHand": 10, "reorderAt": 2, "price": 100}],
            "orders": [],
            "movements": [],
            "closes": [],
        }
        catalog_digest = commerce_catalog_digest(catalog)
        configured_states: dict[str, dict[str, object]] = {}

        for session, actor in (
            ("operator-session", "actor-operator"),
            ("other-operator-session", "actor-other"),
        ):
            initialized = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(session),
                json={
                    "command_id": str(uuid4()),
                    "surface": "commerce",
                    "event_type": "commerce.workspace.initialized",
                    "expected_version": 0,
                    "payload": {
                        "state": catalog,
                        "evidence": {
                            "actionId": f"ACT-{uuid4()}",
                            "capturedAt": "2026-07-24T08:58:00.000Z",
                            "actor": actor,
                            "reason": "Initialize the current Shop catalog.",
                            "evidenceReference": "catalog://opening/1",
                        },
                    },
                },
            )
            self.assertEqual(initialized.status_code, 200)
            configuration_evidence = {
                "actionId": f"ACT-STOREFRONT-R1-{catalog_digest.removeprefix('sha256:')}",
                "capturedAt": "2026-07-24T08:59:00.000Z",
                "actor": actor,
                "reason": "Save the current storefront before retaining requests.",
                "evidenceReference": f"ECOMMERCE-STOREFRONT:{catalog_digest}:R1",
            }
            configured_state = {
                **catalog,
                "storefrontConfiguration": {
                    "schema": "supermega.ecommerce.storefront.v1",
                    "revision": 1,
                    "shopCatalogSnapshotRevision": 1,
                    "shopCatalogDigest": catalog_digest,
                    "storeName": "Mingalar Shop",
                    "summary": "Clear prices and a small customer-ready catalog.",
                    "selectedSkus": ["SKU-1"],
                    "saved": configuration_evidence,
                },
            }
            configured = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(session),
                json={
                    "command_id": str(uuid4()),
                    "surface": "commerce",
                    "event_type": "commerce.storefront.configuration.saved",
                    "expected_version": 1,
                    "payload": {
                        "state": configured_state,
                        "evidence": configuration_evidence,
                    },
                },
            )
            self.assertEqual(configured.status_code, 200)
            configured_states[session] = configured.json()["result"]["state"]

        digest = commerce_storefront_preview_digest(configured_states["operator-session"])
        request_created_at = configured_states["operator-session"][
            "storefrontConfiguration"
        ]["saved"]["capturedAt"]  # type: ignore[index]

        def evidence(actor: str) -> dict[str, str]:
            return {
                "actionId": f"ACT-{request_uuid}",
                "capturedAt": request_created_at,
                "actor": actor,
                "reason": "Retain this customer request for human Shop review.",
                "evidenceReference": f"ECOMMERCE:{request_id}:{digest}",
            }

        request = {
            "schema": "supermega.ecommerce.order_request.v1",
            "mode": "browser-local-request",
            "state": "pending_shop_review",
            "id": request_id,
            "idempotencyKey": f"ECI-{request_uuid}",
            "createdAt": request_created_at,
            "sourcePreviewDigest": digest,
            "sourceStorefrontRevision": 1,
            "sourceStorefrontActionId": configured_states["operator-session"]["storefrontConfiguration"]["saved"]["actionId"],  # type: ignore[index]
            "customerReference": "Customer A",
            "fulfilment": "pickup",
            "currency": "MMK",
            "line": {"sku": "SKU-1", "name": "Test item", "variant": None, "quantity": 2, "unitPriceMmk": 100},
            "totalMmk": 200,
        }
        command = {
            "command_id": request_uuid,
            "surface": "commerce",
            "event_type": "commerce.storefront_request.received",
            "expected_version": 2,
            "payload": {
                "intent": {"request": request},
                "evidence": evidence("actor-operator"),
            },
        }
        first = client.post("/api/trial/v1/commands", headers=self._headers(), json=command)
        replay = client.post("/api/trial/v1/commands", headers=self._headers(), json=command)
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["result"]["version"], 3)
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        self.assertEqual(first.json()["result"]["state"]["storefrontRequests"], [request])
        for field in ("items", "orders", "movements", "closes"):
            self.assertEqual(first.json()["result"]["state"][field], catalog[field])
        self.assertEqual(
            first.json()["result"]["state"]["storefrontConfiguration"],
            configured_states["operator-session"]["storefrontConfiguration"],
        )

        changed = {
            **command,
            "payload": {
                **command["payload"],
                "intent": {
                    "request": {**request, "customerReference": "Conflict"},
                },
            },
        }
        conflict = client.post("/api/trial/v1/commands", headers=self._headers(), json=changed)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.json()["detail"]["code"], "trial_idempotency_conflict")
        stale = client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json={**command, "command_id": str(uuid4())},
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"]["code"], "trial_version_conflict")

        future_uuid = str(uuid4()).upper()
        future_request = {
            **request,
            "id": f"ECR-{future_uuid}",
            "idempotencyKey": f"ECI-{future_uuid}",
            "createdAt": "2099-01-01T00:00:00.000Z",
        }
        future = client.post(
            "/api/trial/v1/commands",
            headers=self._headers("other-operator-session"),
            json={
                "command_id": str(uuid4()),
                "surface": "commerce",
                "event_type": "commerce.storefront_request.received",
                "expected_version": 2,
                "payload": {
                    "intent": {"request": future_request},
                    "evidence": {
                        "actionId": f"ACT-{future_uuid}",
                        "capturedAt": future_request["createdAt"],
                        "actor": "actor-other",
                        "reason": "Retain this customer request for human Shop review.",
                        "evidenceReference": (
                            f"ECOMMERCE:{future_request['id']}:{digest}"
                        ),
                    },
                },
            },
        )
        self.assertEqual(future.status_code, 422)
        self.assertIn("cannot predate", future.text)

        other = client.get("/api/trial/v1/bootstrap", headers=self._headers("other-operator-session"))
        self.assertNotIn("storefrontRequests", other.json()["states"]["commerce"]["state"])
        client.close()

        recovered_client = self._client(store)
        recovered = recovered_client.get("/api/trial/v1/bootstrap", headers=self._headers())
        self.assertEqual(recovered.status_code, 200)
        self.assertEqual(recovered.json()["states"]["commerce"]["version"], 3)
        self.assertEqual(recovered.json()["states"]["commerce"]["state"]["storefrontRequests"], [request])
        recovered_replay = recovered_client.post("/api/trial/v1/commands", headers=self._headers(), json=command)
        self.assertTrue(recovered_replay.json()["result"]["idempotent_replay"])
        recovered_client.close()

    def test_service_schedule_endpoint_is_scoped_human_versioned_and_replayable(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        self._provision(store)
        client = self._client(store)
        catalog = {
            "schema": "supermega.commerce.workspace.v2",
            "items": [{"sku": "SKU-1", "name": "Test item", "onHand": 10, "reorderAt": 2, "price": 100}],
            "orders": [],
            "movements": [],
            "closes": [],
        }
        initialized = client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json={
                "command_id": str(uuid4()),
                "surface": "commerce",
                "event_type": "commerce.workspace.initialized",
                "expected_version": 0,
                "payload": {
                    "state": catalog,
                    "evidence": {
                        "actionId": f"ACT-{uuid4()}",
                        "capturedAt": "2026-07-29T04:00:00.000Z",
                        "actor": "actor-operator",
                        "reason": "Initialize the current Shop catalog.",
                        "evidenceReference": "catalog://opening/1",
                    },
                },
            },
        )
        self.assertEqual(initialized.status_code, 200, initialized.text)
        empty = client.get(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
        )
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(
            empty.json(),
            {
                "workspace_id": "workspace-a",
                "version": 1,
                "privacy_owner": False,
                "schedule": None,
            },
        )
        schedule = {
            "schema": "supermega.shop.service_schedule.v4",
            "industryPackId": "spa",
            "revision": 1,
            "services": [
                {
                    "id": "service-consultation",
                    "name": "Consultation",
                    "durationMinutes": 30,
                    "priceMmk": 20000,
                    "active": True,
                },
                {
                    "id": "service-session",
                    "name": "Standard treatment",
                    "durationMinutes": 60,
                    "priceMmk": 45000,
                    "active": True,
                }
            ],
            "resources": [
                {
                    "id": "resource-room-1",
                    "name": "Treatment room 1",
                    "kind": "room",
                    "active": True,
                }
            ],
            "privacyPolicy": {"clientRetentionDays": None},
            "clients": [],
            "bookings": [],
            "events": [
                {
                    "revision": 1,
                    "type": "service_registered",
                    "subjectId": "service-session",
                    "actor": "fabricated-client-actor",
                    "reason": "Added from Shop appointment setup.",
                    "happenedAt": "2026-07-29T04:05:00.000Z",
                }
            ],
        }
        clean_schedule = {
            **schedule,
            "revision": 0,
            "services": schedule["services"][:1],
            "events": [],
        }
        initialize_command = {
            "command_id": str(uuid4()),
            "expected_version": 1,
            "captured_at": "2026-07-29T04:00:00.000Z",
            "schedule": clean_schedule,
        }
        initialized_schedule = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json=initialize_command,
        )
        initialize_replay = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json=initialize_command,
        )
        self.assertEqual(initialized_schedule.status_code, 200, initialized_schedule.text)
        self.assertEqual(initialized_schedule.json()["result"]["version"], 2)
        self.assertEqual(
            initialized_schedule.json()["result"]["event_type"],
            "commerce.service_schedule.initialized",
        )
        self.assertTrue(initialize_replay.json()["result"]["idempotent_replay"])
        command = {
            "command_id": str(uuid4()),
            "expected_version": 2,
            "captured_at": "2026-07-29T04:05:00.000Z",
            "schedule": schedule,
        }
        first = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json=command,
        )
        replay = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json=command,
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["result"]["version"], 3)
        self.assertEqual(
            first.json()["result"]["state"]["serviceSchedule"]["events"][-1]["actor"],
            "actor-operator",
        )
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        stale = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json={**command, "command_id": str(uuid4())},
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"]["code"], "trial_version_conflict")
        forbidden_identity = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json={
                **command,
                "command_id": str(uuid4()),
                "schedule": {**schedule, "workspace_id": "workspace-b"},
            },
        )
        self.assertEqual(forbidden_identity.status_code, 422)
        self.assertEqual(forbidden_identity.json()["detail"]["code"], "client_identity_forbidden")

        current_schedule = first.json()["result"]["state"]["serviceSchedule"]
        retention_at = "2026-07-29T04:06:00.000Z"
        retention_schedule = {
            **current_schedule,
            "revision": 2,
            "privacyPolicy": {
                "clientRetentionDays": 365,
                "updatedAt": retention_at,
                "updatedBy": "fabricated-client-actor",
            },
            "events": [
                *current_schedule["events"],
                {
                    "revision": 2,
                    "type": "client_retention_set",
                    "subjectId": "retention-365-days",
                    "actor": "fabricated-client-actor",
                    "reason": "Owner approved a 365-day client retention period.",
                    "happenedAt": retention_at,
                },
            ],
        }
        owner_required = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json={
                "command_id": str(uuid4()),
                "expected_version": 3,
                "captured_at": retention_at,
                "schedule": retention_schedule,
            },
        )
        self.assertEqual(owner_required.status_code, 403, owner_required.text)
        self.assertEqual(owner_required.json()["detail"]["code"], "spa_owner_action_required")

        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=("commerce.write", "company.write", "product.shop"),
        )
        owner_view = client.get(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
        )
        self.assertTrue(owner_view.json()["privacy_owner"])
        retained = client.post(
            "/api/trial/v1/commerce/service-schedule",
            headers=self._headers(),
            json={
                "command_id": str(uuid4()),
                "expected_version": 3,
                "captured_at": retention_at,
                "schedule": retention_schedule,
            },
        )
        self.assertEqual(retained.status_code, 200, retained.text)
        retained_schedule = retained.json()["result"]["state"]["serviceSchedule"]
        server_event = retained_schedule["events"][-1]
        self.assertEqual(server_event["actor"], "actor-operator")
        self.assertNotEqual(server_event["happenedAt"], retention_at)
        self.assertEqual(retained_schedule["privacyPolicy"]["updatedAt"], server_event["happenedAt"])
        self.assertEqual(retained_schedule["privacyPolicy"]["updatedBy"], "actor-operator")
        client.close()

    def test_runtime_checks_membership_and_capability(self) -> None:
        missing = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("missing-session"),
            json=self._command_body(actor="actor-missing"),
        )
        self.assertEqual(missing.status_code, 403)
        self.assertEqual(missing.json()["detail"]["code"], "trial_membership_required")

        missing_capability = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("manager-session"),
            json=self._command_body(actor="actor-manager"),
        )
        self.assertEqual(missing_capability.status_code, 403)
        self.assertEqual(
            missing_capability.json()["detail"]["required_capability"],
            "commerce.write",
        )
        self.assertEqual(self.reducer.calls, 0)

    def test_commerce_commands_bind_actor_evidence_and_human_authority(self) -> None:
        spoofed = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(actor="actor-spoofed"),
        )
        self.assertEqual(spoofed.status_code, 422)
        self.assertEqual(spoofed.json()["detail"]["code"], "commerce_actor_evidence_required")

        human = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(event_type="commerce.website_intake.converted"),
        )
        self.assertEqual(human.status_code, 200)

        unproven_source = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(
                event_type="commerce.website_intake.created",
                expected_version=1,
            ),
        )
        self.assertEqual(unproven_source.status_code, 422)
        self.assertEqual(unproven_source.json()["detail"]["code"], "trial_validation_error")

        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("website.write", "approvals.decide", "commerce.write"),
        )
        human_only_events = (
            "commerce.workspace.initialized",
            "commerce.item.created",
            "commerce.item.updated",
            "commerce.order.created",
            "commerce.order.advanced",
            "commerce.order.cancelled",
            "commerce.order.return_recorded",
            "commerce.payment.reconciled",
            "commerce.refund.settled",
            "commerce.stock.received",
            "commerce.close.saved",
            "commerce.website_intake.converted",
            "commerce.service_schedule.initialized",
            "commerce.service_schedule.saved",
        )
        for event_type in human_only_events:
            with self.subTest(event_type=event_type):
                agent = self.client.post(
                    "/api/trial/v1/commands",
                    headers=self._headers("agent-manager-session"),
                    json=self._command_body(
                        actor="actor-agent-manager",
                        event_type=event_type,
                        expected_version=1,
                    ),
                )
                self.assertEqual(agent.status_code, 403)
                self.assertEqual(agent.json()["detail"]["code"], "trial_human_approval_required")

    def test_managed_shop_order_intent_is_server_priced_scoped_and_replay_safe(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        self._provision(store)
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent-manager",
            actor_kind="agent",
            capabilities=("commerce.write",),
        )
        client = self._client(store)
        try:
            initialized = store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.workspace.initialized",
                expected_version=0,
                payload={
                    "state": {
                        "schema": "supermega.commerce.workspace.v2",
                        "items": [
                            {
                                "sku": "SKU-1",
                                "name": "Current catalog item",
                                "onHand": 10,
                                "reorderAt": 2,
                                "price": 12_500,
                            }
                        ],
                        "orders": [],
                        "movements": [],
                        "closes": [],
                    },
                    "evidence": {
                        "actionId": "ACT-SHOP-INIT-001",
                        "capturedAt": "2026-01-01T00:00:00.000Z",
                        "actor": self.operator.actor_id,
                        "reason": "Initialize the reviewed Shop catalog.",
                        "evidenceReference": "SHOP-INIT-001",
                    },
                },
            )
            command_id = str(uuid4())
            body = {
                "command_id": command_id,
                "surface": "commerce",
                "event_type": "commerce.order.created",
                "expected_version": initialized.version,
                "payload": {
                    "intent": {
                        "orderId": "ORD-MANAGED-001",
                        "customer": "Walk-in customer",
                        "channel": "Counter",
                        "payment": "Cash",
                        "fulfilment": "pickup",
                        "fulfilmentReference": "Counter ORD-MANAGED-001",
                        "promisedAt": "2099-01-01T01:00:00.000Z",
                        "paymentTermsDays": 0,
                        "lines": [{"sku": "SKU-1", "quantity": 2}],
                    },
                    "evidence": {
                        "actionId": "ACT-SHOP-ORDER-001",
                        "capturedAt": "1970-01-01T00:00:00.000Z",
                        "actor": self.operator.actor_id,
                        "reason": "Counter sale reviewed by the operator.",
                        "evidenceReference": "COUNTER-ORD-MANAGED-001",
                    },
                },
            }
            created = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=body,
            )
            self.assertEqual(created.status_code, 200, created.text)
            result = created.json()["result"]
            order = result["state"]["orders"][0]
            self.assertEqual(order["owner"], self.operator.actor_id)
            self.assertEqual(order["lines"][0]["name"], "Current catalog item")
            self.assertEqual(order["lines"][0]["unitPriceMmk"], 12_500)
            self.assertEqual(order["total"], 25_000)
            self.assertEqual(result["state"]["items"][0]["onHand"], 8)
            self.assertNotEqual(order["createdAt"], "1970-01-01T00:00:00.000Z")

            replay = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=body,
            )
            self.assertEqual(replay.status_code, 200, replay.text)
            self.assertTrue(replay.json()["result"]["idempotent_replay"])
            self.assertEqual(replay.json()["result"]["version"], result["version"])

            changed = deepcopy(body)
            changed["payload"]["intent"]["lines"][0]["quantity"] = 3
            conflict = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=changed,
            )
            self.assertEqual(conflict.status_code, 409)
            self.assertEqual(conflict.json()["detail"]["code"], "trial_idempotency_conflict")

            stale = deepcopy(body)
            stale["command_id"] = str(uuid4())
            stale["expected_version"] = initialized.version
            stale["payload"]["evidence"]["actionId"] = "ACT-SHOP-ORDER-STALE"
            stale["payload"]["evidence"]["evidenceReference"] = "COUNTER-STALE"
            stale["payload"]["intent"]["orderId"] = "ORD-MANAGED-STALE"
            version_conflict = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=stale,
            )
            self.assertEqual(version_conflict.status_code, 409)
            self.assertEqual(version_conflict.json()["detail"]["code"], "trial_version_conflict")

            agent = client.post(
                "/api/trial/v1/commands",
                headers=self._headers("agent-manager-session"),
                json={**body, "command_id": str(uuid4())},
            )
            self.assertEqual(agent.status_code, 422)
            self.assertEqual(agent.json()["detail"]["code"], "commerce_actor_evidence_required")

            other = client.get(
                "/api/trial/v1/bootstrap",
                headers=self._headers("other-operator-session"),
            )
            self.assertEqual(other.status_code, 200)
            self.assertEqual(other.json()["states"]["commerce"]["state"], {})
        finally:
            client.close()

    def test_managed_plant_job_intent_is_server_owned_scoped_and_replay_safe(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        self._provision(store)
        store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-operator",
            actor_kind="human",
            capabilities=("commerce.write", "production.write", "website.write", "approvals.request"),
        )
        store.provision_membership(
            workspace_id="workspace-b",
            actor_id="actor-other",
            actor_kind="human",
            capabilities=("commerce.write", "production.write", "approvals.request"),
        )
        client = self._client(store)
        try:
            store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="commerce",
                event_type="commerce.workspace.initialized",
                expected_version=0,
                payload={
                    "state": {
                        "schema": "supermega.commerce.workspace.v2",
                        "items": [
                            {
                                "sku": "SKU-DEMAND",
                                "name": "Demand item",
                                "onHand": 10,
                                "reorderAt": 15,
                                "price": 5_000,
                            }
                        ],
                        "orders": [],
                        "movements": [],
                        "closes": [],
                    },
                    "evidence": {
                        "actionId": "ACT-SHOP-DEMAND-INIT",
                        "capturedAt": "2026-01-01T00:00:00.000Z",
                        "actor": self.operator.actor_id,
                        "reason": "Initialize Shop demand authority.",
                        "evidenceReference": "SHOP-DEMAND-INIT",
                    },
                },
            )
            initialized = store.apply_command(
                self.operator,
                command_id=str(uuid4()),
                surface="production",
                event_type="production.workspace.initialized",
                expected_version=0,
                payload={
                    "state": {
                        "schema": "supermega.production.workspace.v2",
                        "revision": 0,
                        "jobs": [
                            {
                                "id": "JOB-OPENING-001",
                                "line": "Line 01",
                                "product": "Opening batch",
                                "target": 100,
                                "output": 0,
                                "owner": "Opening owner",
                                "priority": "normal",
                                "dueAt": "2098-01-01T00:00:00.000Z",
                            }
                        ],
                        "issues": [],
                        "machines": [
                            {"id": "MC-01", "name": "Mixer 01", "state": "running"}
                        ],
                        "events": [],
                    },
                    "evidence": {
                        "actionId": "ACT-PLANT-INIT-001",
                        "capturedAt": "2026-01-01T00:00:00.000Z",
                        "actor": self.operator.actor_id,
                        "reason": "Initialize the reviewed Plant workspace.",
                        "evidenceReference": "PLANT-INIT-001",
                    },
                },
            )
            command_id = str(uuid4())
            body = {
                "command_id": command_id,
                "surface": "production",
                "event_type": "production.job.created",
                "expected_version": initialized.version,
                "payload": {
                    "intent": {
                        "jobId": "JOB-MANAGED-001",
                        "line": "Line 02",
                        "product": "Premium batch",
                        "target": 750,
                        "owner": "Production lead",
                        "priority": "urgent",
                        "dueAt": "2099-01-01T00:00:00.000Z",
                    },
                    "evidence": {
                        "actionId": "ACT-PLANT-JOB-001",
                        "capturedAt": "1970-01-01T00:00:00.000Z",
                        "actor": self.operator.actor_id,
                        "reason": "Production plan reviewed by the operator.",
                        "evidenceReference": "PLANT-JOB-MANAGED-001",
                    },
                },
            }
            created = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=body,
            )
            self.assertEqual(created.status_code, 200, created.text)
            result = created.json()["result"]
            job = result["state"]["jobs"][0]
            event = result["state"]["events"][0]
            self.assertEqual(job["id"], "JOB-MANAGED-001")
            self.assertEqual(job["output"], 0)
            self.assertEqual(job["target"], 750)
            self.assertEqual(event["actor"], self.operator.actor_id)
            self.assertEqual(event["jobOwner"], "Production lead")
            self.assertNotEqual(event["createdAt"], "1970-01-01T00:00:00.000Z")

            replay = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=body,
            )
            self.assertEqual(replay.status_code, 200, replay.text)
            self.assertTrue(replay.json()["result"]["idempotent_replay"])

            changed = deepcopy(body)
            changed["payload"]["intent"]["target"] = 751
            conflict = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=changed,
            )
            self.assertEqual(conflict.status_code, 409)
            self.assertEqual(conflict.json()["detail"]["code"], "trial_idempotency_conflict")

            stale_snapshot = {
                "schema": "supermega.shop_production_demand.v1",
                "operatingUnitLocationId": "LOC-MAIN",
                "sku": "SKU-DEMAND",
                "productName": "Demand item",
                "sourceOrderIds": [],
                "activeDemandUnits": 0,
                "uncoveredDemandUnits": 0,
                "availableToPromiseUnits": 9,
                "reorderAtUnits": 15,
                "replenishmentGapUnits": 6,
                "recommendedBatchUnits": 6,
            }

            def demand_body(snapshot: dict[str, object], job_id: str) -> dict[str, object]:
                source_digest = plant_order_evidence_digest(snapshot)
                evidence_reference = f"SHOP-DEMAND:{source_digest}:LOC-MAIN"
                return {
                    "command_id": str(uuid4()),
                    "surface": "production",
                    "event_type": "production.job.created",
                    "expected_version": result["version"],
                    "payload": {
                        "intent": {
                            "jobId": job_id,
                            "line": "Packing team",
                            "product": "Demand item",
                            "target": snapshot["recommendedBatchUnits"],
                            "owner": "Packing lead",
                            "priority": "urgent",
                            "dueAt": "2099-02-01T00:00:00.000Z",
                            "shopDemandSource": {
                                "contract": "supermega.production.shop-demand-source.v1",
                                "sourceDigest": source_digest,
                                "evidenceReference": evidence_reference,
                                "snapshot": snapshot,
                            },
                        },
                        "evidence": {
                            "actionId": f"ACT-{job_id}",
                            "capturedAt": "1970-01-01T00:00:00.000Z",
                            "actor": self.operator.actor_id,
                            "reason": "Create a job from current Shop demand.",
                            "evidenceReference": evidence_reference,
                        },
                    },
                }

            stale_demand = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=demand_body(stale_snapshot, "JOB-DEMAND-STALE"),
            )
            self.assertEqual(stale_demand.status_code, 422)
            self.assertEqual(stale_demand.json()["detail"]["code"], "trial_validation_error")

            current_snapshot = {
                **stale_snapshot,
                "availableToPromiseUnits": 10,
                "replenishmentGapUnits": 5,
                "recommendedBatchUnits": 5,
            }
            current_body = demand_body(current_snapshot, "JOB-DEMAND-CURRENT")
            current_demand = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=current_body,
            )
            self.assertEqual(current_demand.status_code, 200, current_demand.text)
            demand_result = current_demand.json()["result"]
            retained_source = demand_result["state"]["jobs"][0]["shopDemandSource"]
            self.assertEqual(retained_source["snapshot"], current_snapshot)
            self.assertNotIn("customer", str(retained_source).lower())

            duplicate_body = demand_body(current_snapshot, "JOB-DEMAND-DUPLICATE")
            duplicate_body["expected_version"] = demand_result["version"]
            duplicate_demand = client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=duplicate_body,
            )
            self.assertEqual(duplicate_demand.status_code, 422)
            self.assertEqual(duplicate_demand.json()["detail"]["code"], "trial_validation_error")

            other = client.get(
                "/api/trial/v1/bootstrap",
                headers=self._headers("other-operator-session"),
            )
            self.assertEqual(other.status_code, 200)
            self.assertEqual(other.json()["states"]["production"]["state"], {})
        finally:
            client.close()

    def test_retained_website_source_preserves_exact_command_replay_only(self) -> None:
        source = {
            "fingerprint": "web-1234abcd",
            "approvalId": "approval-1",
            "snapshotId": "snapshot-1",
            "pageId": "page-home",
            "siteName": "SuperMega",
            "pagePath": "/",
        }
        seeded = self._command_body()
        seeded["payload"] = {
            "changes": {"websiteIntakes": [{"source": source}]},
            "evidence": {"actor": "actor-operator"},
        }
        self.assertEqual(
            self.client.post(
                "/api/trial/v1/commands",
                headers=self._headers(),
                json=seeded,
            ).status_code,
            200,
        )

        command_id = str(uuid4())
        replayable = self._command_body(
            command_id=command_id,
            event_type="commerce.website_intake.created",
            expected_version=1,
        )
        replayable["payload"] = {
            "state": {"websiteIntakes": [{"source": source}]},
            "evidence": {"actor": "actor-operator"},
        }
        first = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=replayable,
        )
        replay = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=replayable,
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.json()["result"]["version"], replay.json()["result"]["version"])
        self.assertEqual(first.json()["result"]["state"], replay.json()["result"]["state"])
        self.assertFalse(first.json()["result"]["idempotent_replay"])
        self.assertTrue(replay.json()["result"]["idempotent_replay"])

        changed_source = {**source, "siteName": "Spoofed"}
        changed = self._command_body(
            event_type="commerce.website_intake.created",
            expected_version=2,
        )
        changed["payload"] = {
            "state": {"websiteIntakes": [{"source": changed_source}]},
            "evidence": {"actor": "actor-operator"},
        }
        rejected = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=changed,
        )
        self.assertEqual(rejected.status_code, 422)
        self.assertEqual(rejected.json()["detail"]["code"], "trial_validation_error")

    def test_website_commands_bind_actor_evidence_and_human_release_actions(self) -> None:
        def website_body(*, actor: str, event_type: str = "website.content.saved") -> dict[str, object]:
            return {
                "command_id": str(uuid4()),
                "surface": "website",
                "event_type": event_type,
                "expected_version": 0,
                "payload": {
                    "state": {"draft": "bounded"},
                    "evidence": {
                        "actionId": "website-action-1",
                        "capturedAt": "2026-07-23T03:30:00.000Z",
                        "actor": actor,
                        "reason": "Website command",
                        "evidenceReference": "website://draft/1",
                    },
                },
            }

        spoofed = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=website_body(actor="actor-spoofed"),
        )
        self.assertEqual(spoofed.status_code, 422)
        self.assertEqual(spoofed.json()["detail"]["code"], "website_actor_evidence_required")

        human = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=website_body(actor="actor-operator", event_type="website.revision.approved"),
        )
        self.assertEqual(human.status_code, 200)

        agent = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("agent-manager-session"),
            json=website_body(actor="actor-agent-manager", event_type="website.snapshot.recorded"),
        )
        self.assertEqual(agent.status_code, 403)
        self.assertEqual(agent.json()["detail"]["code"], "trial_human_approval_required")

        agent_evidence = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("agent-manager-session"),
            json=website_body(actor="actor-agent-manager", event_type="website.evidence.recorded"),
        )
        self.assertEqual(agent_evidence.status_code, 403)
        self.assertEqual(agent_evidence.json()["detail"]["code"], "trial_human_approval_required")

        agent_release = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers("agent-manager-session"),
            json=website_body(actor="actor-agent-manager", event_type="website.release.recorded"),
        )
        self.assertEqual(agent_release.status_code, 403)
        self.assertEqual(agent_release.json()["detail"]["code"], "trial_human_approval_required")

    def test_every_runtime_write_readiness_gate_fails_closed(self) -> None:
        for blocked_check in ("database_ready", "role_ready", "schema_ready", "audit_ready", "write_enabled"):
            with self.subTest(blocked_check=blocked_check):
                reducer = MergeReducer()
                store = InMemoryTrialStore(reducer=reducer, **{blocked_check: False})
                self._provision(store)
                client = self._client(store)
                try:
                    response = client.post(
                        "/api/trial/v1/commands",
                        headers=self._headers(),
                        json=self._command_body(),
                    )
                finally:
                    client.close()
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["detail"]["code"], "trial_not_ready")
                self.assertIn(blocked_check, response.json()["detail"]["blockers"])
                self.assertEqual(reducer.calls, 0)

    def test_readiness_is_private_and_reports_blocked_writes(self) -> None:
        unauthenticated = self.client.get("/api/trial/v1/readiness")
        self.assertEqual(unauthenticated.status_code, 401)

        store = InMemoryTrialStore(reducer=MergeReducer(), write_enabled=False)
        self._provision(store)
        client = self._client(store)
        try:
            readiness = client.get("/api/trial/v1/readiness", headers=self._headers())
        finally:
            client.close()
        self.assertEqual(readiness.status_code, 200)
        self.assertFalse(readiness.json()["write_ready"])
        self.assertIn("write_enabled", readiness.json()["blockers"])

    def test_idempotency_and_version_conflicts_map_to_http_409(self) -> None:
        command_id = str(uuid4())
        first = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(command_id=command_id),
        )
        replay = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(command_id=command_id),
        )
        reused = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(command_id=command_id, sku="different"),
        )
        stale = self.client.post(
            "/api/trial/v1/commands",
            headers=self._headers(),
            json=self._command_body(expected_version=0, sku="stale"),
        )

        self.assertEqual(first.status_code, 200)
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        self.assertEqual(reused.status_code, 409)
        self.assertEqual(reused.json()["detail"]["code"], "trial_idempotency_conflict")
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"]["code"], "trial_version_conflict")
        self.assertEqual(stale.json()["detail"]["current_version"], 1)

    def test_approval_api_only_allows_pending_to_terminal_decision(self) -> None:
        opaque_proposal = self.client.post(
            "/api/trial/v1/approvals",
            headers=self._headers(),
            json={
                "command_id": str(uuid4()),
                "title": "Opaque release request",
                "proposal": {"release": "catalog-v1"},
                "evidence_refs": ["review://catalog/1"],
            },
        )
        self.assertEqual(opaque_proposal.status_code, 422)

        client_status = {
            "command_id": str(uuid4()),
            "title": "Release trial catalog",
            "proposal": _decision_packet(),
            "evidence_refs": ["review://catalog/1"],
            "status": "approved",
        }
        rejected_status = self.client.post(
            "/api/trial/v1/approvals",
            headers=self._headers(),
            json=client_status,
        )
        self.assertEqual(rejected_status.status_code, 422)

        request_body = {
            "command_id": str(uuid4()),
            "title": "Release trial catalog",
            "proposal": _decision_packet(),
            "evidence_refs": ["review://catalog/1"],
        }
        requested = self.client.post(
            "/api/trial/v1/approvals",
            headers=self._headers(),
            json=request_body,
        )
        self.assertEqual(requested.status_code, 200)
        approval = requested.json()["approval"]
        self.assertEqual(approval["status"], "pending")
        self.assertEqual(approval["requested_by"], "actor-operator")
        self.assertEqual(approval["requested_actor_kind"], "human")

        decision_path = f"/api/trial/v1/approvals/{approval['approval_id']}/decision"
        missing_note = self.client.post(
            decision_path,
            headers=self._headers("manager-session"),
            json={"command_id": str(uuid4()), "decision": "approved"},
        )
        blank_note = self.client.post(
            decision_path,
            headers=self._headers("manager-session"),
            json={"command_id": str(uuid4()), "decision": "approved", "note": "  \t\n"},
        )
        self.assertEqual(missing_note.status_code, 422)
        self.assertEqual(blank_note.status_code, 422)

        operator_decision = self.client.post(
            decision_path,
            headers=self._headers("operator-session"),
            json={"command_id": str(uuid4()), "decision": "approved", "note": "Operator request."},
        )
        self.assertEqual(operator_decision.status_code, 403)

        agent_decision = self.client.post(
            decision_path,
            headers=self._headers("agent-manager-session"),
            json={"command_id": str(uuid4()), "decision": "approved", "note": "Agent attempt."},
        )
        self.assertEqual(agent_decision.status_code, 403)
        self.assertEqual(
            agent_decision.json()["detail"]["code"],
            "trial_human_approval_required",
        )

        cross_workspace = self.client.post(
            decision_path,
            headers=self._headers("other-manager-session"),
            json={"command_id": str(uuid4()), "decision": "approved", "note": "Other workspace."},
        )
        self.assertEqual(cross_workspace.status_code, 404)

        decision_command_id = str(uuid4())
        decision_body = {
            "command_id": decision_command_id,
            "decision": "approved",
            "note": "  Reviewed by the named owner.  ",
        }
        decided = self.client.post(
            decision_path,
            headers=self._headers("manager-session"),
            json=decision_body,
        )
        replay = self.client.post(
            decision_path,
            headers=self._headers("manager-session"),
            json=decision_body,
        )
        terminal_retry = self.client.post(
            decision_path,
            headers=self._headers("manager-session"),
            json={
                "command_id": str(uuid4()),
                "decision": "declined",
                "note": "A second terminal decision is forbidden.",
            },
        )
        self.assertEqual(decided.status_code, 200)
        self.assertEqual(decided.json()["approval"]["status"], "approved")
        self.assertEqual(decided.json()["approval"]["decided_by"], "actor-manager")
        self.assertEqual(decided.json()["approval"]["decided_actor_kind"], "human")
        self.assertEqual(decided.json()["approval"]["decision_note"], "Reviewed by the named owner.")
        self.assertTrue(replay.json()["approval"]["idempotent_replay"])
        self.assertEqual(terminal_retry.status_code, 409)
        self.assertEqual(terminal_retry.json()["detail"]["code"], "trial_invalid_transition")


if __name__ == "__main__":
    unittest.main()
