from __future__ import annotations

from copy import deepcopy
import json
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.owner_control import (
    build_managed_owner_control_run,
    company_state_with_owner_control_acknowledgement,
    owner_control_acknowledgement,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialState


def commerce_state() -> dict[str, object]:
    return {
        "schema": "supermega.commerce.workspace.v2",
        "items": [
            {"sku": "SKU-LOW", "name": "Private product name", "onHand": 2, "reorderAt": 2, "price": 12_000},
        ],
        "orders": [],
        "movements": [],
        "closes": [],
    }


def production_state(*, machine_state: str = "running") -> dict[str, object]:
    return {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [
            {
                "id": "JOB-001",
                "line": "Packing",
                "product": "Retail pack",
                "target": 100,
                "output": 0,
                "owner": "Shift lead",
                "priority": "normal",
                "dueAt": "2026-07-31T09:00:00.000Z",
            }
        ],
        "issues": [],
        "machines": [{"id": "MACHINE-001", "name": "Packing line", "state": machine_state}],
        "events": [],
    }


class OwnerControlUnitTests(unittest.TestCase):
    def test_run_is_deterministic_aggregate_only_and_plant_safety_ranks_first(self) -> None:
        invalid_commerce = deepcopy(commerce_state())
        invalid_commerce["items"][0]["onHand"] = -1
        states = {
            "commerce": TrialState("workspace-a", "commerce", 2, invalid_commerce, "operator", "2026-07-30T08:00:00Z"),
            "production": TrialState("workspace-a", "production", 4, production_state(machine_state="stopped"), "operator", "2026-07-30T08:05:00Z"),
        }

        first = build_managed_owner_control_run(workspace_id="workspace-a", states=states)
        second = build_managed_owner_control_run(workspace_id="workspace-a", states=states)

        self.assertEqual(first, second)
        self.assertEqual(first["contract"], "supermega.managed_owner_control_run.v1")
        self.assertEqual(first["items"][0]["product"], "plant")
        self.assertEqual(first["items"][0]["priority"], "critical")
        self.assertEqual(first["items"][1]["product"], "shop")
        self.assertEqual(first["items"][1]["priority"], "high")
        self.assertEqual(first["pendingCount"], 2)
        self.assertEqual(first["externalWritesPerformed"], False)
        self.assertNotIn("Private product name", str(first))
        self.assertRegex(str(first["runDigest"]), r"^sha256:[0-9a-f]{64}$")

    def test_acknowledgement_is_bounded_idempotent_and_reopens_on_source_change(self) -> None:
        states = {
            "company": TrialState("workspace-a", "company", 0, {"tasks": [{"id": "TASK-1"}]}),
            "commerce": TrialState("workspace-a", "commerce", 1, commerce_state(), "operator", "2026-07-30T08:00:00Z"),
        }
        run = build_managed_owner_control_run(workspace_id="workspace-a", states=states)
        acknowledgement = owner_control_acknowledgement(
            run,
            item_id=run["items"][0]["itemId"],
            retained_by="owner-a",
        )
        retained = company_state_with_owner_control_acknowledgement(states["company"].state, acknowledgement)
        replay = company_state_with_owner_control_acknowledgement(retained, acknowledgement)
        self.assertEqual(retained, replay)
        self.assertEqual(retained["tasks"], [{"id": "TASK-1"}])
        self.assertEqual(len(retained["ownerControlAcknowledgements"]), 1)
        self.assertNotIn("result", retained["ownerControlAcknowledgements"][0])
        self.assertNotIn("operatingBaseline", retained["ownerControlAcknowledgements"][0])

        bounded = {"tasks": []}
        for index in range(20):
            candidate = {
                **acknowledgement,
                "runDigest": f"sha256:{index + 1:064x}",
                "itemId": f"sha256:{index + 101:064x}",
                "product": ("shop", "plant", "website", "ecommerce")[index % 4],
            }
            bounded = company_state_with_owner_control_acknowledgement(bounded, candidate)
        self.assertEqual(len(bounded["ownerControlAcknowledgements"]), 4)
        self.assertEqual(
            {receipt["product"] for receipt in bounded["ownerControlAcknowledgements"]},
            {"shop", "plant", "website", "ecommerce"},
        )
        self.assertLess(len(json.dumps(bounded["ownerControlAcknowledgements"])), 8_192)

        acknowledged_run = build_managed_owner_control_run(
            workspace_id="workspace-a",
            states={**states, "company": TrialState("workspace-a", "company", 1, retained)},
        )
        self.assertEqual(acknowledged_run["pendingCount"], 0)
        self.assertEqual(acknowledged_run["items"][0]["status"], "acknowledged")

        changed_commerce = deepcopy(commerce_state())
        changed_commerce["items"][0]["onHand"] = 1
        changed_run = build_managed_owner_control_run(
            workspace_id="workspace-a",
            states={
                "company": TrialState("workspace-a", "company", 1, retained),
                "commerce": TrialState("workspace-a", "commerce", 2, changed_commerce, "operator", "2026-07-30T09:00:00Z"),
            },
        )
        self.assertNotEqual(changed_run["runDigest"], run["runDigest"])
        self.assertEqual(changed_run["items"][0]["status"], "pending")

    def test_foreign_workspace_acknowledgement_is_not_reused(self) -> None:
        states = {"commerce": TrialState("workspace-a", "commerce", 1, commerce_state())}
        run = build_managed_owner_control_run(workspace_id="workspace-a", states=states)
        acknowledgement = owner_control_acknowledgement(run, item_id=run["items"][0]["itemId"], retained_by="owner-a")
        foreign = build_managed_owner_control_run(
            workspace_id="workspace-b",
            states={
                "company": TrialState("workspace-b", "company", 1, {"ownerControlAcknowledgements": [acknowledgement]}),
                "commerce": TrialState("workspace-b", "commerce", 1, commerce_state()),
            },
        )
        self.assertEqual(foreign["items"][0]["status"], "pending")


class OwnerControlRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        capabilities = (
            "company.control.approve",
            "company.write",
            "commerce.read",
            "commerce.write",
            "production.read",
            "production.write",
            "website.read",
            "approvals.read",
        )
        principals = {
            "human": TrialPrincipal("workspace-a", "actor-human", "human"),
            "agent": TrialPrincipal("workspace-a", "actor-agent", "agent"),
            "writer": TrialPrincipal("workspace-a", "actor-writer", "human"),
        }
        for session, principal in principals.items():
            self.store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=tuple(
                    capability
                    for capability in capabilities
                    if not (session == "writer" and capability == "company.control.approve")
                ),
            )

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return principals.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=resolve_principal))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_read_acknowledge_and_domain_replay_are_zero_external_write(self) -> None:
        headers = {"x-test-session": "human"}
        response = self.client.get("/api/trial/v1/owner-control", headers=headers)
        self.assertEqual(response.status_code, 200)
        run = response.json()["run"]
        self.assertEqual(run["companyVersion"], 0)
        body = {
            "command_id": str(uuid4()),
            "expected_company_version": 0,
            "run_digest": run["runDigest"],
            "item_id": run["items"][0]["itemId"],
        }
        acknowledged = self.client.post("/api/trial/v1/owner-control/acknowledgements", headers=headers, json=body)
        self.assertEqual(acknowledged.status_code, 200)
        payload = acknowledged.json()
        self.assertEqual(payload["run"]["pendingCount"], 0)
        self.assertEqual(payload["run"]["acknowledgedCount"], 1)
        self.assertEqual(payload["retention"]["status"], "acknowledged")
        self.assertEqual(payload["retention"]["internalWritePerformed"], True)
        self.assertEqual(payload["retention"]["externalWritesPerformed"], False)
        self.assertNotIn("result", payload)
        self.assertEqual(len(self.store._events), 1)

        replay = self.client.post(
            "/api/trial/v1/owner-control/acknowledgements",
            headers=headers,
            json={**body, "command_id": str(uuid4()), "expected_company_version": 1},
        )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["retention"]["status"], "already_acknowledged")
        self.assertEqual(replay.json()["retention"]["internalWritePerformed"], False)
        self.assertEqual(len(self.store._events), 1)

    def test_acknowledgement_requires_human_capability_and_current_run(self) -> None:
        run = self.client.get("/api/trial/v1/owner-control", headers={"x-test-session": "human"}).json()["run"]
        body = {
            "command_id": str(uuid4()),
            "expected_company_version": 0,
            "run_digest": run["runDigest"],
            "item_id": run["items"][0]["itemId"],
        }
        agent = self.client.post("/api/trial/v1/owner-control/acknowledgements", headers={"x-test-session": "agent"}, json=body)
        self.assertEqual(agent.status_code, 403)
        self.assertEqual(agent.json()["detail"]["code"], "trial_human_approval_required")
        writer = self.client.post("/api/trial/v1/owner-control/acknowledgements", headers={"x-test-session": "writer"}, json=body)
        self.assertEqual(writer.status_code, 403)
        self.assertEqual(writer.json()["detail"]["required_capability"], "company.control.approve")
        changed = self.client.post(
            "/api/trial/v1/owner-control/acknowledgements",
            headers={"x-test-session": "human"},
            json={**body, "run_digest": f"sha256:{'a' * 64}"},
        )
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(changed.json()["detail"]["code"], "owner_control_changed")
        self.assertEqual(self.store.get_state(TrialPrincipal("workspace-a", "actor-human", "human"), "company").version, 0)

    def test_conflicting_command_id_cannot_acknowledge_a_second_item(self) -> None:
        principal = TrialPrincipal("workspace-a", "actor-human", "human")
        for surface, event_type, state, action_id in (
            ("commerce", "commerce.workspace.initialized", commerce_state(), "ACT-OWNER-CONTROL-COMMERCE"),
            ("production", "production.workspace.initialized", production_state(), "ACT-OWNER-CONTROL-PRODUCTION"),
        ):
            self.store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface=surface,
                event_type=event_type,
                expected_version=0,
                payload={
                    "state": state,
                    "evidence": {
                        "actionId": action_id,
                        "capturedAt": "2026-07-30T08:00:00.000Z",
                        "actor": principal.actor_id,
                        "reason": f"Initialize {surface} evidence for owner control.",
                        "evidenceReference": f"owner-control://{surface}/opening",
                    },
                },
            )
        headers = {"x-test-session": "human"}
        run = self.client.get("/api/trial/v1/owner-control", headers=headers).json()["run"]
        self.assertEqual(len(run["items"]), 2)
        command_id = str(uuid4())
        first = self.client.post(
            "/api/trial/v1/owner-control/acknowledgements",
            headers=headers,
            json={
                "command_id": command_id,
                "expected_company_version": 0,
                "run_digest": run["runDigest"],
                "item_id": run["items"][0]["itemId"],
            },
        )
        self.assertEqual(first.status_code, 200)
        second_run = first.json()["run"]
        conflict = self.client.post(
            "/api/trial/v1/owner-control/acknowledgements",
            headers=headers,
            json={
                "command_id": command_id,
                "expected_company_version": second_run["companyVersion"],
                "run_digest": second_run["runDigest"],
                "item_id": second_run["items"][1]["itemId"],
            },
        )
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(self.store.get_state(principal, "company").version, 1)


if __name__ == "__main__":
    unittest.main()
