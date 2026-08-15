from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
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


# Due dates are validated against BOTH clocks: within intervalDays of the evidence capturedAt
# (reducer) and after the real save clock (router) -- so fixed strings expire the moment real
# time crosses them (this file failed CI on exactly the morning its first nextDueAt passed).
# The entire fixture timeline is therefore re-anchored at import-time now, preserving the
# original relative offsets (anchor was 2026-07-30T09:00Z) so every ordering still holds.
_NOW = datetime.now(timezone.utc).replace(microsecond=0)


def _ts(days: int, hours: int = 0, minutes: int = 0, seconds: int = 0) -> str:
    return (_NOW + timedelta(days=days, hours=hours, minutes=minutes, seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


CAPTURED_AT = _ts(0)
CAPTURED_AT_H1 = _ts(0, 1)
CAPTURED_AT_M30 = _ts(0, 0, 30)
PAST_NEXT_DUE_AT = _ts(0, -1)
STRATEGY_NEXT_DUE_AT = _ts(16)
REVISED_NEXT_DUE_AT = _ts(21, 1)
SECOND_NEXT_DUE_AT = _ts(11, 0, 30)
SECOND_QUEUE_AT = _ts(12, 0, 30)
EXEC_AT_H1 = _ts(17, 1)
EXEC_AT_H2 = _ts(17, 2)
EXEC_AT_H2M30 = _ts(17, 2, 30)
EXEC_AT_H3 = _ts(17, 3)
EXEC_PREDATE_AT = _ts(17, 0, 59, 59)
FINDING_DUE_AT = _ts(18, 3)
COMPLETED_NEXT_DUE_AT = _ts(47, 1)


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
    captured_at: str = CAPTURED_AT,
) -> dict[str, object]:
    safety_reference = "SAFETY-PM-EQ-MIX-01-R1"
    return {
        "equipmentId": "EQ-MIX-01",
        "maintenanceOwner": "Maintenance lead",
        "intervalDays": 30,
        "nextDueAt": STRATEGY_NEXT_DUE_AT,
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
    outcome: str = "completed",
    findings: str = "No findings outside the reviewed procedure",
    return_to_service: str = "recommended",
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
        event["maintenanceOutcome"] = outcome
        event["maintenanceFindings"] = findings
        event["maintenanceProcedureCompleted"] = True
        event["maintenanceReturnToService"] = return_to_service
        event["nextDueAt"] = COMPLETED_NEXT_DUE_AT
        strategy["nextDueAt"] = event["nextDueAt"]
    else:
        event["maintenanceOwner"] = strategy["maintenanceOwner"]
    state["revision"] += 1
    state["events"] = [event, *state["events"]]
    return state


def _maintenance_finding_issue_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    issue_id: str = "ISS-MAINTENANCE-FINDING-501",
) -> dict[str, object]:
    state = deepcopy(current)
    completion = next(event for event in state["events"] if event["kind"] == "maintenance_completed")
    start = next(
        event
        for event in state["events"]
        if event["kind"] == "maintenance_started"
        and event["actionId"] == completion["maintenanceStartActionId"]
    )
    machine = next(machine for machine in state["machines"] if machine["id"] == completion["subjectId"])
    source = {
        "contract": "supermega.production.maintenance-finding-source.v1",
        "equipmentId": machine["id"],
        "equipmentName": machine["name"],
        "maintenanceOwner": start["maintenanceOwner"],
        "completionActionId": completion["actionId"],
        "completedAt": completion["createdAt"],
        "strategyActionId": completion["maintenanceStrategyActionId"],
        "strategyRevision": completion["maintenanceStrategyRevision"],
        "returnToService": completion["maintenanceReturnToService"],
        "findings": completion["maintenanceFindings"],
        "evidenceReference": completion["evidenceReference"],
    }
    issue = {
        "id": issue_id,
        "createdAt": evidence["capturedAt"],
        "area": machine["name"],
        "kind": "maintenance",
        "summary": f"Maintenance finding: {completion['maintenanceFindings']}",
        "status": "open",
        "severity": "high",
        "owner": start["maintenanceOwner"],
        "dueAt": FINDING_DUE_AT,
        "containment": "Keep the asset out of service pending reviewed corrective action.",
        "maintenanceFindingSource": source,
    }
    event = {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "issue_opened",
        "subjectId": issue_id,
        "summary": f"Opened maintenance issue for {machine['name']}",
        "issueSeverity": issue["severity"],
        "issueOwner": issue["owner"],
        "issueDueAt": issue["dueAt"],
        "issueContainment": issue["containment"],
        "maintenanceFindingSource": source,
    }
    state["revision"] += 1
    state["issues"] = [issue, *state["issues"]]
    state["events"] = [event, *state["events"]]
    return state


def _maintenance_finding_resolution_state(
    current: dict[str, object],
    evidence: dict[str, str],
    corrective_action: dict[str, object],
) -> dict[str, object]:
    state = deepcopy(current)
    issue = next(candidate for candidate in state["issues"] if "maintenanceFindingSource" in candidate)
    resolution = {
        "actionId": evidence["actionId"],
        "resolvedAt": evidence["capturedAt"],
        "resolvedBy": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "maintenanceCorrectiveAction": deepcopy(corrective_action),
    }
    state["issues"] = [
        {**candidate, "status": "resolved", "resolution": resolution}
        if candidate["id"] == issue["id"]
        else candidate
        for candidate in state["issues"]
    ]
    state["revision"] += 1
    state["events"] = [{
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "issue_resolved",
        "subjectId": issue["id"],
        "summary": f"Resolved {issue['kind']} issue for {issue['area']}",
        "maintenanceCorrectiveAction": deepcopy(corrective_action),
    }, *state["events"]]
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
        self.assertEqual(strategy["nextDueAt"], STRATEGY_NEXT_DUE_AT)
        self.assertEqual(saved["events"][0]["kind"], "equipment_maintenance_strategy_saved")
        self.assertNotIn("maintenanceStartActionId", saved["events"][0])

        revised_payload = _strategy_payload(
            action_id="ACT-EQUIPMENT-MAINTENANCE-STRATEGY-00000000-0000-4000-8000-000000000502",
            captured_at=CAPTURED_AT_H1,
        )
        revised_payload["intervalDays"] = 45
        revised_payload["nextDueAt"] = REVISED_NEXT_DUE_AT
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
        past["nextDueAt"] = PAST_NEXT_DUE_AT
        cases.append(past)
        too_far = _strategy_payload()
        too_far["nextDueAt"] = _ts(31)
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
            STRATEGY_NEXT_DUE_AT,
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
            STRATEGY_NEXT_DUE_AT,
        )
        self.assertEqual(
            started["events"][0]["maintenanceProcedureReference"],
            "SOP-PM-MIXER-001-R3",
        )

        completion_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-COMPLETE-501",
            EXEC_AT_H1,
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
            COMPLETED_NEXT_DUE_AT,
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
            COMPLETED_NEXT_DUE_AT,
        )
        self.assertEqual(saved["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"], STRATEGY_NEXT_DUE_AT)

    def test_strategy_execution_tamper_and_unbound_start_fail_closed(self) -> None:
        saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            _commissioned_state(),
            _strategy_payload(),
        )
        start_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-START-502",
            STRATEGY_NEXT_DUE_AT,
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
            EXEC_AT_H1,
            "Completed reviewed preventive maintenance",
        )
        valid_completion = _strategy_maintenance_state(
            started,
            completion_evidence,
            start_action_id=start_evidence["actionId"],
        )
        completion_cases = []
        forged_completion = deepcopy(valid_completion)
        forged_completion["events"][0]["nextDueAt"] = _ts(46, 1)
        forged_completion["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"] = _ts(46, 1)
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

    def test_restricted_completion_can_open_one_evidence_bound_problem_only(self) -> None:
        saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            _commissioned_state(),
            _strategy_payload(),
        )
        start_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-START-504",
            STRATEGY_NEXT_DUE_AT,
            "Performed reviewed mixer preventive maintenance procedure",
        )
        started = reduce_production_state(
            "production.maintenance.started",
            saved,
            {"state": _strategy_maintenance_state(saved, start_evidence), "evidence": start_evidence},
        )
        completion_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-COMPLETE-504",
            EXEC_AT_H1,
            "Completed reviewed preventive maintenance with a limiting finding",
        )
        completed = reduce_production_state(
            "production.maintenance.completed",
            started,
            {
                "state": _strategy_maintenance_state(
                    started,
                    completion_evidence,
                    start_action_id=start_evidence["actionId"],
                    outcome="completed_with_findings",
                    findings="Seal wear requires restricted service pending replacement",
                    return_to_service="restricted",
                ),
                "evidence": completion_evidence,
            },
        )
        issue_evidence = _maintenance_evidence(
            "ACT-MAINTENANCE-FINDING-PROBLEM-504",
            EXEC_AT_H2,
            "Reviewed maintenance finding and assigned corrective action",
        )
        proposed = _maintenance_finding_issue_state(completed, issue_evidence)
        opened = reduce_production_state(
            "production.issue.opened",
            completed,
            {"state": proposed, "evidence": issue_evidence},
        )
        source = opened["issues"][0]["maintenanceFindingSource"]
        self.assertEqual(source["completionActionId"], completion_evidence["actionId"])
        self.assertEqual(source, opened["events"][0]["maintenanceFindingSource"])
        self.assertEqual(opened["jobs"], completed["jobs"])
        self.assertEqual(opened["machines"], completed["machines"])
        self.assertEqual(opened["equipmentMaster"], completed["equipmentMaster"])

        tampered_states = []
        for field, value in (
            ("maintenanceOwner", "Other owner"),
            ("equipmentName", "Other mixer"),
            ("findings", "No issue found"),
            ("evidenceReference", "OTHER-EVIDENCE"),
            ("returnToService", "recommended"),
        ):
            candidate = deepcopy(proposed)
            candidate["issues"][0]["maintenanceFindingSource"][field] = value
            candidate["events"][0]["maintenanceFindingSource"][field] = value
            tampered_states.append(candidate)
        wrong_kind = deepcopy(proposed)
        wrong_kind["issues"][0]["kind"] = "quality"
        wrong_kind["events"][0]["summary"] = "Opened quality issue for Mixer 01"
        tampered_states.append(wrong_kind)
        predating = deepcopy(proposed)
        predating["issues"][0]["createdAt"] = EXEC_PREDATE_AT
        predating["events"][0]["createdAt"] = EXEC_PREDATE_AT
        predating["events"][0]["issueDueAt"] = FINDING_DUE_AT
        tampered_states.append(predating)
        missing_event_source = deepcopy(proposed)
        missing_event_source["events"][0].pop("maintenanceFindingSource")
        tampered_states.append(missing_event_source)
        changed_master = deepcopy(proposed)
        changed_master["equipmentMaster"]["assets"][0]["owner"] = "Other asset owner"
        tampered_states.append(changed_master)
        for candidate in tampered_states:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                reduce_production_state(
                    "production.issue.opened",
                    completed,
                    {"state": candidate, "evidence": issue_evidence},
                )

        duplicate_evidence = _maintenance_evidence(
            "ACT-MAINTENANCE-FINDING-PROBLEM-505",
            EXEC_AT_H2M30,
            "Attempted duplicate maintenance finding problem",
        )
        duplicate = _maintenance_finding_issue_state(
            opened,
            duplicate_evidence,
            issue_id="ISS-MAINTENANCE-FINDING-502",
        )
        with self.assertRaises(TrialValidationError):
            reduce_production_state(
                "production.issue.opened",
                opened,
                {"state": duplicate, "evidence": duplicate_evidence},
            )

        resolution_evidence = _maintenance_evidence(
            "ACT-MAINTENANCE-CORRECTIVE-CLOSE-504",
            EXEC_AT_H3,
            "Reviewed corrective action and final service disposition",
        )
        corrective_action = {
            "contract": "supermega.production.maintenance-corrective-action.v1",
            "correctiveAction": "Replaced the worn seal and retained the removed part reference",
            "verificationResult": "Leak inspection passed at reviewed operating pressure",
            "finalDisposition": "recommended",
        }
        proposed_resolution = _maintenance_finding_resolution_state(
            opened,
            resolution_evidence,
            corrective_action,
        )
        resolved = reduce_production_state(
            "production.issue.resolved",
            opened,
            {"state": proposed_resolution, "evidence": resolution_evidence},
        )
        self.assertEqual(
            resolved["issues"][0]["resolution"]["maintenanceCorrectiveAction"],
            corrective_action,
        )
        self.assertEqual(
            resolved["events"][0]["maintenanceCorrectiveAction"],
            corrective_action,
        )
        self.assertEqual(resolved["jobs"], opened["jobs"])
        self.assertEqual(resolved["machines"], opened["machines"])
        self.assertEqual(resolved["equipmentMaster"], opened["equipmentMaster"])

        resolution_tamper = []
        missing_result = deepcopy(proposed_resolution)
        missing_result["issues"][0]["resolution"].pop("maintenanceCorrectiveAction")
        missing_result["events"][0].pop("maintenanceCorrectiveAction")
        resolution_tamper.append(missing_result)
        mismatched_event = deepcopy(proposed_resolution)
        mismatched_event["events"][0]["maintenanceCorrectiveAction"]["finalDisposition"] = "restricted"
        resolution_tamper.append(mismatched_event)
        invalid_contract = deepcopy(proposed_resolution)
        invalid_contract["issues"][0]["resolution"]["maintenanceCorrectiveAction"]["contract"] = "unsupported"
        invalid_contract["events"][0]["maintenanceCorrectiveAction"]["contract"] = "unsupported"
        resolution_tamper.append(invalid_contract)
        blank_verification = deepcopy(proposed_resolution)
        blank_verification["issues"][0]["resolution"]["maintenanceCorrectiveAction"]["verificationResult"] = ""
        blank_verification["events"][0]["maintenanceCorrectiveAction"]["verificationResult"] = ""
        resolution_tamper.append(blank_verification)
        changed_master_on_close = deepcopy(proposed_resolution)
        changed_master_on_close["equipmentMaster"]["assets"][0]["owner"] = "Other asset owner"
        resolution_tamper.append(changed_master_on_close)
        for candidate in resolution_tamper:
            with self.subTest(candidate=candidate), self.assertRaises(TrialValidationError):
                reduce_production_state(
                    "production.issue.resolved",
                    opened,
                    {"state": candidate, "evidence": resolution_evidence},
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
            captured_at=CAPTURED_AT_M30,
        )
        second_payload["equipmentId"] = "EQ-PRESS-02"
        second_payload["nextDueAt"] = SECOND_NEXT_DUE_AT
        second_saved = reduce_production_state(
            "production.equipment_maintenance_strategy.saved",
            first_saved,
            second_payload,
        )
        snapshot = deepcopy(second_saved)
        queue = project_production_maintenance_due_queue(
            second_saved,
            SECOND_QUEUE_AT,
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
                SECOND_QUEUE_AT.replace(".000Z", "Z"),
            )

        start_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-START-503",
            STRATEGY_NEXT_DUE_AT,
            "Performed reviewed mixer preventive maintenance procedure",
        )
        started = reduce_production_state(
            "production.maintenance.started",
            second_saved,
            {"state": _strategy_maintenance_state(second_saved, start_evidence), "evidence": start_evidence},
        )
        completion_evidence = _maintenance_evidence(
            "ACT-EQUIPMENT-MAINTENANCE-COMPLETE-503",
            EXEC_AT_H1,
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
            _ts(18, 1),
        )
        mixer = next(item for item in completed_queue["items"] if item["assetId"] == "EQ-MIX-01")
        self.assertEqual(mixer["lastCompletionActionId"], completion_evidence["actionId"])
        self.assertEqual(mixer["lastCompletedAt"], completion_evidence["capturedAt"])
        self.assertEqual(mixer["dueAt"], COMPLETED_NEXT_DUE_AT)


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
            "next_due_at": STRATEGY_NEXT_DUE_AT,
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
