from __future__ import annotations

from collections.abc import Mapping
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.commerce_runtime import (
    commerce_catalog_digest,
    commerce_storefront_preview_digest,
)
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
        next_state = {
            **configured_states["operator-session"],
            "storefrontRequests": [request],
        }
        command = {
            "command_id": request_uuid,
            "surface": "commerce",
            "event_type": "commerce.storefront_request.received",
            "expected_version": 2,
            "payload": {"state": next_state, "evidence": evidence("actor-operator")},
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
                "state": {
                    **next_state,
                    "storefrontRequests": [{**request, "customerReference": "Conflict"}],
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
