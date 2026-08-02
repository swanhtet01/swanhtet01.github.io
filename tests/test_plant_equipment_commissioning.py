from __future__ import annotations

from copy import deepcopy
import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.plant_equipment_import import validate_plant_equipment_import
from supermega_runtime.production_runtime import (
    reduce_production_state,
    validate_production_state,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialHumanApprovalRequired,
    TrialPrincipal,
    TrialValidationError,
)
from tests.test_plant_equipment_import import (
    _equipment_payload,
    _opening_state,
    _package,
)


def _equipment_state() -> tuple[dict[str, object], str]:
    validation, _ = validate_plant_equipment_import(_package())
    opening = validate_production_state(_opening_state())
    state = reduce_production_state(
        "production.equipment_master.imported",
        opening,
        _equipment_payload(validation.package_digest),
    )
    return state, validation.package_digest


def _commission_payload(
    equipment_id: str = "EQ-MIX-01",
    *,
    action_id: str = "ACT-EQUIPMENT-COMMISSION-00000000-0000-4000-8000-000000000401",
) -> dict[str, object]:
    safety_reference = "SAFETY-BASELINE-EQ-MIX-01-R1"
    return {
        "equipmentId": equipment_id,
        "installedAt": "2026-07-29T06:00:00.000Z",
        "initialState": "attention",
        "safetyBaselineReference": safety_reference,
        "evidence": {
            "actionId": action_id,
            "capturedAt": "2026-07-30T08:00:00.000Z",
            "actor": "plant-owner",
            "reason": "Commissioned reviewed Plant equipment",
            "evidenceReference": safety_reference,
        },
    }


class PlantEquipmentCommissioningRuntimeTests(unittest.TestCase):
    def test_one_asset_becomes_one_runtime_machine_with_immutable_evidence(self) -> None:
        current, _ = _equipment_state()
        next_state = reduce_production_state(
            "production.equipment.commissioned",
            current,
            _commission_payload(),
        )
        self.assertEqual(next_state["revision"], current["revision"] + 1)
        self.assertEqual(next_state["jobs"], current["jobs"])
        self.assertEqual(next_state["issues"], current["issues"])
        self.assertEqual(next_state["openingPlan"], current["openingPlan"])
        self.assertEqual(next_state["openingPlan"]["machineIds"], [])
        self.assertEqual(
            next_state["machines"],
            [{"id": "EQ-MIX-01", "name": "Rubber mixer", "state": "attention"}],
        )
        asset = next_state["equipmentMaster"]["assets"][0]
        self.assertEqual(asset["commissioningStatus"], "commissioned")
        self.assertEqual(asset["commissioning"]["initialState"], "attention")
        self.assertEqual(
            asset["commissioning"]["safetyBaselineReference"],
            "SAFETY-BASELINE-EQ-MIX-01-R1",
        )
        self.assertEqual(next_state["events"][0]["kind"], "equipment_commissioned")
        self.assertEqual(next_state["events"][0]["subjectId"], "EQ-MIX-01")

    def test_unknown_duplicate_future_and_mismatched_evidence_fail_closed(self) -> None:
        current, _ = _equipment_state()
        cases: list[dict[str, object]] = []
        unknown = _commission_payload("EQ-UNKNOWN")
        cases.append(unknown)
        future = _commission_payload()
        future["installedAt"] = "2026-07-31T08:00:00.000Z"
        cases.append(future)
        mismatch = _commission_payload()
        mismatch["evidence"]["evidenceReference"] = "OTHER-BASELINE"
        cases.append(mismatch)
        bulk = _commission_payload()
        bulk["equipmentIds"] = ["EQ-MIX-01", "EQ-PRESS-02"]
        cases.append(bulk)
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                reduce_production_state(
                    "production.equipment.commissioned",
                    current,
                    candidate,
                )
        commissioned = reduce_production_state(
            "production.equipment.commissioned",
            current,
            _commission_payload(),
        )
        duplicate = _commission_payload(
            action_id="ACT-EQUIPMENT-COMMISSION-00000000-0000-4000-8000-000000000402"
        )
        with self.assertRaises(TrialValidationError):
            reduce_production_state(
                "production.equipment.commissioned", commissioned, duplicate
            )

    def test_commissioning_machine_and_history_tamper_fail_validation(self) -> None:
        current, _ = _equipment_state()
        commissioned = reduce_production_state(
            "production.equipment.commissioned",
            current,
            _commission_payload(),
        )
        cases = []
        no_event = deepcopy(commissioned)
        no_event["events"] = no_event["events"][1:]
        no_event["revision"] -= 1
        cases.append(no_event)
        renamed_machine = deepcopy(commissioned)
        renamed_machine["machines"][0]["name"] = "Invented runtime name"
        cases.append(renamed_machine)
        changed_baseline = deepcopy(commissioned)
        changed_baseline["equipmentMaster"]["assets"][0]["commissioning"][
            "safetyBaselineReference"
        ] = "CHANGED"
        cases.append(changed_baseline)
        invented_machine = deepcopy(current)
        invented_machine["machines"] = [
            {"id": "FAKE-01", "name": "Fake", "state": "running"}
        ]
        cases.append(invented_machine)
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                validate_production_state(candidate)


class PlantEquipmentCommissioningRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.writer = TrialPrincipal(
            workspace_id="workspace-equipment",
            actor_id="plant-owner",
            actor_kind="human",
        )
        self.agent = TrialPrincipal(
            workspace_id=self.writer.workspace_id,
            actor_id="plant-agent",
            actor_kind="agent",
        )
        self.sessions = {"writer": self.writer, "agent": self.agent}
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        for principal in (self.writer, self.agent):
            self.store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("setup.write", "production.write"),
            )
        opening = _opening_state()
        opening["openingPlan"]["confirmedAt"] = "server-assigned"
        self.store.apply_command(
            self.writer,
            command_id="00000000-0000-4000-8000-000000000400",
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload={
                "state": opening,
                "evidence": {
                    "actionId": "ACT-PLANT-OPENING-COMMISSION",
                    "capturedAt": "server-assigned",
                    "actor": self.writer.actor_id,
                    "reason": "Initialized reviewed Plant jobs",
                    "evidenceReference": opening["openingPlan"]["packageDigest"],
                },
            },
        )
        validation, _ = validate_plant_equipment_import(_package())
        imported_payload = _equipment_payload(validation.package_digest)
        imported_payload["evidence"]["capturedAt"] = "server-assigned"
        self.store.apply_command(
            self.writer,
            command_id="00000000-0000-4000-8000-000000000401",
            surface="production",
            event_type="production.equipment_master.imported",
            expected_version=1,
            payload=imported_payload,
        )

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return self.sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(store=self.store, resolve_principal=resolve_principal)
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_human_commission_and_exact_replay_are_atomic(self) -> None:
        body = {
            "command_id": "00000000-0000-4000-8000-000000000402",
            "expected_version": 2,
            "equipment_id": "EQ-MIX-01",
            "installed_at": "2026-07-29T06:00:00.000Z",
            "initial_state": "attention",
            "safety_baseline_reference": "SAFETY-BASELINE-EQ-MIX-01-R1",
            "confirmation": "COMMISSION EQ-MIX-01",
        }
        response = self.client.post(
            "/api/trial/v1/production/equipment/commission",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(response.status_code, 200, response.text)
        receipt = response.json()
        self.assertEqual(receipt["result"]["version"], 3)
        self.assertFalse(receipt["result"]["idempotent_replay"])
        self.assertFalse(receipt["commissioning"]["equipment_command_performed"])
        self.assertFalse(receipt["commissioning"]["telemetry_connected"])
        self.assertFalse(receipt["commissioning"]["bulk_commissioning_performed"])
        state = receipt["result"]["state"]
        self.assertEqual(state["machines"][0]["id"], "EQ-MIX-01")
        self.assertEqual(state["events"][0]["actor"], self.writer.actor_id)
        self.assertNotEqual(state["events"][0]["createdAt"], "server-assigned")
        replay = self.client.post(
            "/api/trial/v1/production/equipment/commission",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        self.assertEqual(replay.json()["result"]["state"], state)
        self.assertEqual(len(self.store._events), 3)

    def test_agent_wrong_confirmation_and_direct_store_attempt_fail(self) -> None:
        body = {
            "command_id": "00000000-0000-4000-8000-000000000403",
            "expected_version": 2,
            "equipment_id": "EQ-MIX-01",
            "installed_at": "2026-07-29T06:00:00.000Z",
            "initial_state": "attention",
            "safety_baseline_reference": "SAFETY-BASELINE-EQ-MIX-01-R1",
            "confirmation": "COMMISSION EQ-PRESS-02",
        }
        wrong = self.client.post(
            "/api/trial/v1/production/equipment/commission",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(wrong.status_code, 409)
        agent_route = self.client.post(
            "/api/trial/v1/production/equipment/commission",
            headers={"x-test-session": "agent"},
            json={**body, "confirmation": "COMMISSION EQ-MIX-01"},
        )
        self.assertEqual(agent_route.status_code, 403)
        payload = _commission_payload()
        payload["evidence"]["actor"] = self.agent.actor_id
        with self.assertRaises(TrialHumanApprovalRequired):
            self.store.apply_command(
                self.agent,
                command_id="00000000-0000-4000-8000-000000000404",
                surface="production",
                event_type="production.equipment.commissioned",
                expected_version=2,
                payload=payload,
            )
        self.assertEqual(len(self.store._events), 2)


if __name__ == "__main__":
    unittest.main()
