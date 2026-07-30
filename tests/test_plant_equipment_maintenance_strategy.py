from __future__ import annotations

from copy import deepcopy
import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.plant_equipment_import import validate_plant_equipment_import
from supermega_runtime.production_runtime import (
    project_production_maintenance_due_queue,
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
from tests.test_plant_equipment_commissioning import _commission_payload, _equipment_state
from tests.test_plant_equipment_import import _equipment_payload, _opening_state, _package


def _commissioned_state() -> dict[str, object]:
    current, _ = _equipment_state()
    return reduce_production_state(
        "production.equipment.commissioned",
        current,
        _commission_payload(),
    )


def _strategy_payload(
    *,
    action_id: str = "ACT-EQUIPMENT-MAINTENANCE-STRATEGY-00000000-0000-4000-8000-000000000501",
    captured_at: str = "2026-07-30T09:00:00.000Z",
) -> dict[str, object]:
    safety_reference = "SAFETY-PM-EQ-MIX-01-R1"
    return {
        "equipmentId": "EQ-MIX-01",
        "maintenanceOwner": "Maintenance lead",
        "intervalDays": 30,
        "nextDueAt": "2026-08-15T09:00:00.000Z",
        "procedureReference": "SOP-PM-MIXER-001-R3",
        "safetyBaselineReference": safety_reference,
        "evidence": {
            "actionId": action_id,
            "capturedAt": captured_at,
            "actor": "plant-owner",
            "reason": "Saved reviewed preventive maintenance strategy",
            "evidenceReference": safety_reference,
        },
    }


def _maintenance_evidence(
    action_id: str,
    captured_at: str,
    reason: str,
) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": "plant-owner",
        "reason": reason,
        "evidenceReference": f"EVIDENCE-{action_id}",
    }


def _strategy_maintenance_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    start_action_id: str | None = None,
) -> dict[str, object]:
    state = deepcopy(current)
    asset = state["equipmentMaster"]["assets"][0]
    strategy = asset["maintenanceStrategy"]
    machine = state["machines"][0]
    completing = start_action_id is not None
    event = {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "maintenance_completed" if completing else "maintenance_started",
        "subjectId": machine["id"],
        "summary": (
            f"Completed maintenance for {machine['name']}"
            if completing
            else f"Started maintenance for {machine['name']}"
        ),
        "maintenanceStrategyActionId": strategy["actionId"],
        "maintenanceStrategyRevision": strategy["revision"],
        "maintenanceProcedureReference": strategy["procedureReference"],
        "maintenancePlannedDueAt": strategy["nextDueAt"],
    }
    if completing:
        event["maintenanceStartActionId"] = start_action_id
        event["maintenanceOutcome"] = "completed"
        event["maintenanceFindings"] = "No findings outside the reviewed procedure"
        event["maintenanceProcedureCompleted"] = True
        event["maintenanceReturnToService"] = "recommended"
        event["nextDueAt"] = "2026-09-15T10:00:00.000Z"
        strategy["nextDueAt"] = event["nextDueAt"]
    else:
        event["maintenanceOwner"] = strategy["maintenanceOwner"]
    state["revision"] += 1
    state["events"] = [event, *state["events"]]
    return state


class PlantEquipmentMaintenanceStrategyRuntimeTests(unittest.TestCase):
    def test_strategy_is_versioned_without_starting_maintenance(self) -> None:
        current = _commissioned_state()
        saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            current,
            _strategy_payload(),
        )
        self.assertEqual(saved["revision"], current["revision"] + 1)
        self.assertEqual(saved["jobs"], current["jobs"])
        self.assertEqual(saved["issues"], current["issues"])
        self.assertEqual(saved["machines"], current["machines"])
        strategy = saved["equipmentMaster"]["assets"][0]["maintenanceStrategy"]
        self.assertEqual(strategy["revision"], 1)
        self.assertEqual(strategy["intervalDays"], 30)
        self.assertEqual(strategy["nextDueAt"], "2026-08-15T09:00:00.000Z")
        self.assertEqual(saved["events"][0]["kind"], "equipment_maintenance_strategy_saved")
        self.assertNotIn("maintenanceStartActionId", saved["events"][0])

        revised_payload = _strategy_payload(
            action_id="ACT-EQUIPMENT-MAINTENANCE-STRATEGY-00000000-0000-4000-8000-000000000502",
            captured_at="2026-07-30T10:00:00.000Z",
        )
        revised_payload["intervalDays"] = 45
        revised_payload["nextDueAt"] = "2026-08-20T10:00:00.000Z"
        revised = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            saved,
            revised_payload,
        )
        self.assertEqual(revised["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["revision"], 2)
        self.assertEqual(
            [event["strategyRevision"] for event in revised["events"][:2]],
            [2, 1],
        )

    def test_uncommissioned_invalid_interval_evidence_and_bulk_fail_closed(self) -> None:
        uncommissioned, _ = _equipment_state()
        with self.assertRaises(TrialValidationError):
            reduce_production_state(
                "production.equipment_maintenance_strategy.saved",
                uncommissioned,
                _strategy_payload(),
            )
        current = _commissioned_state()
        cases = []
        past = _strategy_payload()
        past["nextDueAt"] = "2026-07-30T08:00:00.000Z"
        cases.append(past)
        too_far = _strategy_payload()
        too_far["nextDueAt"] = "2026-09-15T09:00:00.000Z"
        cases.append(too_far)
        mismatch = _strategy_payload()
        mismatch["evidence"]["evidenceReference"] = "OTHER-SAFETY"
        cases.append(mismatch)
        bulk = _strategy_payload()
        bulk["equipmentIds"] = ["EQ-MIX-01", "EQ-PRESS-02"]
        cases.append(bulk)
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                reduce_production_state(
                    "production.equipment_maintenance_strategy.saved",
                    current,
                    candidate,
                )

    def test_strategy_history_tamper_fails_validation(self) -> None:
        saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            _commissioned_state(),
            _strategy_payload(),
        )
        cases = []
        changed_owner = deepcopy(saved)
        changed_owner["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["maintenanceOwner"] = "Other owner"
        cases.append(changed_owner)
        missing_event = deepcopy(saved)
        missing_event["events"] = missing_event["events"][1:]
        missing_event["revision"] -= 1
        cases.append(missing_event)
        changed_revision = deepcopy(saved)
        changed_revision["events"][0]["strategyRevision"] = 2
        cases.append(changed_revision)
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                validate_production_state(candidate)

    def test_reviewed_execution_binds_strategy_and_advances_due_after_completion(self) -> None:
        saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            _commissioned_state(),
            _strategy_payload(),
        )
        start_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-START-501",
            "2026-08-15T09:00:00.000Z",
            "Performed reviewed mixer preventive maintenance procedure",
        )
        started = reduce_production_state(
            "production.maintenance.started",
            saved,
            {
                "state": _strategy_maintenance_state(saved, start_evidence),
                "evidence": start_evidence,
            },
        )
        self.assertEqual(
            started["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"],
            "2026-08-15T09:00:00.000Z",
        )
        self.assertEqual(
            started["events"][0]["maintenanceProcedureReference"],
            "SOP-PM-MIXER-001-R3",
        )

        completion_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-COMPLETE-501",
            "2026-08-16T10:00:00.000Z",
            "Inspected, lubricated, and returned mixer to reviewed service condition",
        )
        completed = reduce_production_state(
            "production.maintenance.completed",
            started,
            {
                "state": _strategy_maintenance_state(
                    started,
                    completion_evidence,
                    start_action_id=start_evidence["actionId"],
                ),
                "evidence": completion_evidence,
            },
        )
        self.assertEqual(
            completed["events"][0]["nextDueAt"],
            "2026-09-15T10:00:00.000Z",
        )
        self.assertEqual(
            {
                field: completed["events"][0][field]
                for field in (
                    "maintenanceOutcome",
                    "maintenanceFindings",
                    "maintenanceProcedureCompleted",
                    "maintenanceReturnToService",
                )
            },
            {
                "maintenanceOutcome": "completed",
                "maintenanceFindings": "No findings outside the reviewed procedure",
                "maintenanceProcedureCompleted": True,
                "maintenanceReturnToService": "recommended",
            },
        )
        self.assertEqual(
            completed["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"],
            "2026-09-15T10:00:00.000Z",
        )
        self.assertEqual(saved["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"], "2026-08-15T09:00:00.000Z")

    def test_strategy_execution_tamper_and_unbound_start_fail_closed(self) -> None:
        saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            _commissioned_state(),
            _strategy_payload(),
        )
        start_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-START-502",
            "2026-08-15T09:00:00.000Z",
            "Performed reviewed mixer preventive maintenance procedure",
        )
        valid_start = _strategy_maintenance_state(saved, start_evidence)
        cases = []
        unbound = deepcopy(valid_start)
        for field in (
            "maintenanceStrategyActionId",
            "maintenanceStrategyRevision",
            "maintenanceProcedureReference",
            "maintenancePlannedDueAt",
        ):
            unbound["events"][0].pop(field)
        cases.append(unbound)
        wrong_owner = deepcopy(valid_start)
        wrong_owner["events"][0]["maintenanceOwner"] = "Unassigned contractor"
        cases.append(wrong_owner)
        wrong_procedure = deepcopy(valid_start)
        wrong_procedure["events"][0]["maintenanceProcedureReference"] = "SOP-OTHER"
        cases.append(wrong_procedure)
        changed_master = deepcopy(valid_start)
        changed_master["equipmentMaster"]["assets"][0]["owner"] = "Other owner"
        cases.append(changed_master)
        for candidate in cases:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                reduce_production_state(
                    "production.maintenance.started",
                    saved,
                    {"state": candidate, "evidence": start_evidence},
                )

        started = reduce_production_state(
            "production.maintenance.started",
            saved,
            {"state": valid_start, "evidence": start_evidence},
        )
        completion_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-COMPLETE-502",
            "2026-08-16T10:00:00.000Z",
            "Completed reviewed preventive maintenance",
        )
        valid_completion = _strategy_maintenance_state(
            started,
            completion_evidence,
            start_action_id=start_evidence["actionId"],
        )
        completion_cases = []
        forged_completion = deepcopy(valid_completion)
        forged_completion["events"][0]["nextDueAt"] = "2026-09-14T10:00:00.000Z"
        forged_completion["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"] = "2026-09-14T10:00:00.000Z"
        completion_cases.append(forged_completion)
        missing_result = deepcopy(valid_completion)
        for field in (
            "maintenanceOutcome",
            "maintenanceFindings",
            "maintenanceProcedureCompleted",
            "maintenanceReturnToService",
        ):
            missing_result["events"][0].pop(field)
        completion_cases.append(missing_result)
        partial_result = deepcopy(valid_completion)
        partial_result["events"][0].pop("maintenanceFindings")
        completion_cases.append(partial_result)
        unconfirmed_procedure = deepcopy(valid_completion)
        unconfirmed_procedure["events"][0]["maintenanceProcedureCompleted"] = False
        completion_cases.append(unconfirmed_procedure)
        contradictory_result = deepcopy(valid_completion)
        contradictory_result["events"][0]["maintenanceReturnToService"] = "restricted"
        completion_cases.append(contradictory_result)
        for candidate in completion_cases:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                reduce_production_state(
                    "production.maintenance.completed",
                    started,
                    {"state": candidate, "evidence": completion_evidence},
                )

    def test_due_queue_orders_real_strategies_and_retains_completion_basis(self) -> None:
        first_commissioned = _commissioned_state()
        second_commissioned = reduce_production_state(
            "production.equipment.commissioned",
            first_commissioned,
            _commission_payload(
                "EQ-PRESS-02",
                action_id="ACT-EQUIPMENT-COMMISSION-00000000-0000-4000-8000-000000000402",
            ),
        )
        first_saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            second_commissioned,
            _strategy_payload(),
        )
        second_payload = _strategy_payload(
            action_id="ACT-EQUIPMENT-MAINTENANCE-STRATEGY-00000000-0000-4000-8000-000000000503",
            captured_at="2026-07-30T09:30:00.000Z",
        )
        second_payload["equipmentId"] = "EQ-PRESS-02"
        second_payload["nextDueAt"] = "2026-08-10T09:30:00.000Z"
        second_saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            first_saved,
            second_payload,
        )
        snapshot = deepcopy(second_saved)
        queue = project_production_maintenance_due_queue(
            second_saved,
            "2026-08-11T09:30:00.000Z",
        )
        self.assertEqual(queue["contract"], "supermega.production.maintenance-due-queue.v1")
        self.assertEqual(
            [(item["assetId"], item["status"], item["daysUntilDue"]) for item in queue["items"]],
            [
                ("EQ-PRESS-02", "overdue", -1),
                ("EQ-MIX-01", "due_soon", 4),
            ],
        )
        self.assertEqual(second_saved, snapshot)
        with self.assertRaises(TrialValidationError):
            project_production_maintenance_due_queue(
                second_saved,
                "2026-08-11T09:30:00Z",
            )

        start_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-START-503",
            "2026-08-15T09:00:00.000Z",
            "Performed reviewed mixer preventive maintenance procedure",
        )
        started = reduce_production_state(
            "production.maintenance.started",
            second_saved,
            {"state": _strategy_maintenance_state(second_saved, start_evidence), "evidence": start_evidence},
        )
        completion_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-COMPLETE-503",
            "2026-08-16T10:00:00.000Z",
            "Completed reviewed preventive maintenance",
        )
        completed = reduce_production_state(
            "production.maintenance.completed",
            started,
            {
                "state": _strategy_maintenance_state(
                    started,
                    completion_evidence,
                    start_action_id=start_evidence["actionId"],
                ),
                "evidence": completion_evidence,
            },
        )
        completed_queue = project_production_maintenance_due_queue(
            completed,
            "2026-08-17T10:00:00.000Z",
        )
        mixer = next(item for item in completed_queue["items"] if item["assetId"] == "EQ-MIX-01")
        self.assertEqual(mixer["lastCompletionActionId"], completion_evidence["actionId"])
        self.assertEqual(mixer["lastCompletedAt"], completion_evidence["capturedAt"])
        self.assertEqual(mixer["dueAt"], "2026-09-15T10:00:00.000Z")


class PlantEquipmentMaintenanceStrategyRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.writer = TrialPrincipal(
            workspace_id="workspace-equipment-strategy",
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
            command_id="00000000-0000-4000-8000-000000000500",
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload={
                "state": opening,
                "evidence": {
                    "actionId": "ACT-PLANT-OPENING-MAINTENANCE-STRATEGY",
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
            command_id="00000000-0000-4000-8000-000000000501",
            surface="production",
            event_type="production.equipment_master.imported",
            expected_version=1,
            payload=imported_payload,
        )
        commission_payload = _commission_payload()
        commission_payload["evidence"]["capturedAt"] = "server-assigned"
        self.store.apply_command(
            self.writer,
            command_id="00000000-0000-4000-8000-000000000502",
            surface="production",
            event_type="production.equipment.commissioned",
            expected_version=2,
            payload=commission_payload,
        )

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return self.sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=resolve_principal))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def _body(self) -> dict[str, object]:
        return {
            "command_id": "00000000-0000-4000-8000-000000000503",
            "expected_version": 3,
            "equipment_id": "EQ-MIX-01",
            "maintenance_owner": "Maintenance lead",
            "interval_days": 30,
            "next_due_at": "2026-08-15T09:00:00.000Z",
            "procedure_reference": "SOP-PM-MIXER-001-R3",
            "safety_baseline_reference": "SAFETY-PM-EQ-MIX-01-R1",
            "confirmation": "SAVE MAINTENANCE EQ-MIX-01",
        }

    def test_human_save_and_exact_replay_are_atomic_and_plan_only(self) -> None:
        body = self._body()
        response = self.client.post(
            "/api/trial/v1/production/equipment/maintenance-strategy",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(response.status_code, 200, response.text)
        receipt = response.json()
        self.assertEqual(receipt["result"]["version"], 4)
        self.assertFalse(receipt["maintenance_strategy"]["maintenance_execution_started"])
        self.assertFalse(receipt["maintenance_strategy"]["work_order_created"])
        self.assertFalse(receipt["maintenance_strategy"]["equipment_command_performed"])
        self.assertFalse(receipt["maintenance_strategy"]["telemetry_connected"])
        strategy = receipt["result"]["state"]["equipmentMaster"]["assets"][0]["maintenanceStrategy"]
        self.assertEqual(strategy["revision"], 1)
        self.assertEqual(strategy["savedBy"], self.writer.actor_id)
        replay = self.client.post(
            "/api/trial/v1/production/equipment/maintenance-strategy",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(replay.status_code, 200)
        self.assertTrue(replay.json()["result"]["idempotent_replay"])
        self.assertEqual(replay.json()["result"]["state"], receipt["result"]["state"])

    def test_wrong_confirmation_agent_and_direct_store_fail(self) -> None:
        body = self._body()
        wrong = self.client.post(
            "/api/trial/v1/production/equipment/maintenance-strategy",
            headers={"x-test-session": "writer"},
            json={**body, "confirmation": "SAVE MAINTENANCE EQ-PRESS-02"},
        )
        self.assertEqual(wrong.status_code, 409)
        agent = self.client.post(
            "/api/trial/v1/production/equipment/maintenance-strategy",
            headers={"x-test-session": "agent"},
            json=body,
        )
        self.assertEqual(agent.status_code, 403)
        payload = _strategy_payload()
        payload["evidence"]["actor"] = self.agent.actor_id
        with self.assertRaises(TrialHumanApprovalRequired):
            self.store.apply_command(
                self.agent,
                command_id="00000000-0000-4000-8000-000000000504",
                surface="production",
                event_type="production.equipment_maintenance_strategy.saved",
                expected_version=3,
                payload=payload,
            )


if __name__ == "__main__":
    unittest.main()
