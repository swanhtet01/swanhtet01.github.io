from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
import json
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.plant_order_foundation import (
    PlantOrderValidationError,
    apply_plant_order_plan,
    build_plant_order_cost_review_packet,
    build_plant_order_effective_plan,
    build_plant_order_execution_plan,
    check_plant_order_availability,
    create_empty_plant_order_state,
    issue_plant_order_material,
    plant_order_evidence_digest,
    project_plant_order,
    project_plant_order_cost_drivers,
    project_plant_order_financial_cost,
    record_plant_order_operation,
    release_plant_order,
    validate_plant_order_cost_review_packet,
)
from supermega_runtime.production_runtime import (
    PRODUCTION_EVENTS,
    PRODUCTION_HUMAN_EVENTS,
    project_production_maintenance_capacity_review,
    project_production_maintenance_windows,
    project_production_quality_capa_trend,
    validate_production_state,
)
from supermega_runtime.production_material_handoff import (
    project_production_material_requirements,
    validate_production_material_requirements,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    TrialHumanApprovalRequired,
    TrialIdempotencyConflict,
    TrialPrincipal,
    TrialValidationError,
)


ACTOR = "actor-operator"
NOW = "2026-07-24T09:00:00.000Z"
LATER = "2026-07-24T09:15:00.000Z"
LATEST = "2026-07-24T09:30:00.000Z"
OPENING_DIGEST = f"sha256:{'a' * 64}"


def action_evidence(
    action_id: str,
    *,
    actor: str = ACTOR,
    captured_at: str = NOW,
    evidence_reference: str | None = None,
) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": actor,
        "reason": "Verified against the accountable operating record.",
        "evidenceReference": evidence_reference or f"evidence://production/{action_id}",
    }


def starting_workspace(*, target: int = 100) -> dict[str, object]:
    return {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [
            {
                "id": "JOB-REAL-001",
                "line": "Assembly team",
                "product": "Customer batch 001",
                "target": target,
                "output": 0,
                "owner": "Shift lead",
                "priority": "normal",
                "dueAt": "2026-07-25T09:00:00.000Z",
            }
        ],
        "issues": [],
        "machines": [
            {
                "id": "MACHINE-REAL-001",
                "name": "Assembly machine",
                "state": "running",
            }
        ],
        "events": [],
    }


def planned_order_execution(
    workspace: dict[str, object],
    evidence: dict[str, str],
    *,
    target: int | None = None,
    shop_supply: dict[str, object] | None = None,
) -> dict[str, object]:
    job = workspace["jobs"][0]  # type: ignore[index]
    plan = build_plant_order_execution_plan(
        plan_id="PLN-MANAGED-001",
        source_digest=plant_order_evidence_digest({"job": job}),
        job={
            "jobId": job["id"],
            "product": job["product"],
            "targetQuantity": target if target is not None else job["target"],
            "outputBatchId": "BATCH-MANAGED-001",
        },
        materials=[
            {
                "materialId": "MAT-MANAGED-001",
                "name": "Managed material",
                "unit": "kg",
                "quantityPerUnitMilli": 1_000,
                **({"shopSupply": shop_supply} if shop_supply else {}),
            }
        ],
        work_centres=[{"workCentreId": "WC-MANAGED-001", "name": "Managed line"}],
        routing=[
            {
                "operationId": "OP-MANAGED-10",
                "sequence": 1,
                "name": "Managed operation",
                "workCentreId": "WC-MANAGED-001",
                "minutesPerUnitMilli": 1_000,
            }
        ],
    )
    empty = create_empty_plant_order_state()
    return apply_plant_order_plan(
        empty,
        plan,
        evidence,
        expected_head_digest=empty["headDigest"],
    )["state"]


def opening_plan_workspace(
    *,
    digest: str = OPENING_DIGEST,
    confirmed_at: str = NOW,
) -> dict[str, object]:
    return {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [
            {
                "id": "JOB-OPENING-001",
                "line": "Assembly line",
                "product": "Customer batch 001",
                "target": 100,
                "output": 0,
                "owner": "Production lead",
                "priority": "normal",
                "dueAt": "2026-07-25T09:00:00.000Z",
            },
            {
                "id": "JOB-OPENING-002",
                "line": "Packing line",
                "product": "Customer batch 002",
                "target": 50,
                "output": 0,
                "owner": "Production lead",
                "priority": "normal",
                "dueAt": "2026-07-26T09:00:00.000Z",
            },
        ],
        "issues": [],
        "machines": [
            {
                "id": "MACHINE-OPENING-001",
                "name": "Assembly line",
                "state": "running",
            },
            {
                "id": "MACHINE-OPENING-002",
                "name": "Packing line",
                "state": "running",
            },
        ],
        "events": [],
        "openingPlan": {
            "contract": "supermega.production.opening-plan.v1",
            "packageDigest": digest,
            "confirmedAt": confirmed_at,
            "industryPackId": "general-manufacturing",
            "jobIds": ["JOB-OPENING-001", "JOB-OPENING-002"],
            "machineIds": ["MACHINE-OPENING-001", "MACHINE-OPENING-002"],
        },
    }


def production_event(
    evidence: dict[str, str],
    *,
    kind: str,
    subject_id: str,
    summary: str,
    **details: object,
) -> dict[str, object]:
    return {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": kind,
        "subjectId": subject_id,
        "summary": summary,
        **details,
    }


def output_state(
    current: dict[str, object],
    quantity: int,
    evidence: dict[str, str],
    *,
    shift_ref: str = "2026-07-24 Day",
) -> dict[str, object]:
    state = deepcopy(current)
    job = state["jobs"][0]
    job["output"] += quantity
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="output_recorded",
            subject_id=job["id"],
            summary=f"Recorded {quantity} good units",
            quantity=quantity,
            shiftRef=shift_ref,
        ),
        *state["events"],
    ]
    return state


def schedule_state(
    current: dict[str, object],
    priority: str,
    due_at: str,
    evidence: dict[str, str],
    *,
    job_id: str | None = None,
    owner: str | None = None,
) -> dict[str, object]:
    state = deepcopy(current)
    job = next(
        candidate
        for candidate in state["jobs"]
        if job_id is None or candidate["id"] == job_id
    )
    previous = (
        {
            "fromJobPriority": job["priority"],
            "fromJobDueAt": job["dueAt"],
        }
        if "priority" in job and "dueAt" in job
        else {}
    )
    previous_owner = (
        {"fromJobOwner": job["owner"]}
        if "owner" in job
        else {}
    )
    next_owner = owner if owner is not None else job.get("owner", "Shift lead")
    job["priority"] = priority
    job["dueAt"] = due_at
    job["owner"] = next_owner
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="job_schedule_updated",
            subject_id=job["id"],
            summary=f"Updated {job['product']} plan for {job['line']}",
            **previous,
            **previous_owner,
            jobPriority=priority,
            jobDueAt=due_at,
            jobOwner=next_owner,
        ),
        *state["events"],
    ]
    return state


def scrap_state(
    current: dict[str, object],
    quantity: int,
    evidence: dict[str, str],
    *,
    shift_ref: str = "2026-07-24 Day",
) -> dict[str, object]:
    state = deepcopy(current)
    job = state["jobs"][0]
    job["scrap"] = job.get("scrap", 0) + quantity
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="output_recorded",
            subject_id=job["id"],
            summary=f"Recorded {quantity} scrap units",
            quantity=quantity,
            shiftRef=shift_ref,
            outputKind="scrap",
        ),
        *state["events"],
    ]
    return state


def material_state(
    current: dict[str, object],
    quantity: int | float,
    evidence: dict[str, str],
    *,
    material_ref: str = "RM-RESIN-01",
    material_lot: str | None = "LOT-24",
    material_unit: str = "kg",
    shift_ref: str = "2026-07-24 Day",
) -> dict[str, object]:
    state = deepcopy(current)
    job = state["jobs"][0]
    quantity_text = format(Decimal(str(quantity)).normalize(), "f")
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="material_consumed",
            subject_id=job["id"],
            summary=(
                f"Used {quantity_text} {material_unit} {material_ref}"
                f"{f' · lot {material_lot}' if material_lot else ''}"
            ),
            quantity=quantity,
            shiftRef=shift_ref,
            materialRef=material_ref,
            **({"materialLot": material_lot} if material_lot else {}),
            materialUnit=material_unit,
        ),
        *state["events"],
    ]
    return state


def production_source_digest(state: dict[str, object]) -> str:
    canonical = json.dumps(
        state,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


def shift_closed_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    shift_ref: str = "2026-07-24 Day",
) -> dict[str, object]:
    state = deepcopy(current)
    output_events = [
        event
        for event in current["events"]
        if event["kind"] == "output_recorded" and event.get("shiftRef") == shift_ref
    ]
    material_events = [
        event
        for event in current["events"]
        if event["kind"] == "material_consumed" and event["shiftRef"] == shift_ref
    ]
    good_units = sum(
        event["quantity"]
        for event in output_events
        if event.get("outputKind", "good") == "good"
    )
    scrap_units = sum(
        event["quantity"]
        for event in output_events
        if event.get("outputKind") == "scrap"
    )
    summary = (
        f"Closed shift {shift_ref} with {good_units} good, {scrap_units} scrap, "
        f"{len(output_events)} output entries, {len(material_events)} material entries"
    )
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="shift_closed",
            subject_id=shift_ref,
            summary=summary,
            shiftRef=shift_ref,
            sourceRevision=current["revision"],
            sourceDigest=production_source_digest(current),
            goodUnits=good_units,
            scrapUnits=scrap_units,
            outputEntryCount=len(output_events),
            materialEntryCount=len(material_events),
        ),
        *state["events"],
    ]
    return state


def closed_job_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    shift_ref: str = "2026-07-24 Day",
) -> dict[str, object]:
    state = deepcopy(current)
    job = state["jobs"][0]
    remaining = job["target"] - job["output"] - job.get("scrap", 0)
    job["closure"] = {
        "actionId": evidence["actionId"],
        "closedAt": evidence["capturedAt"],
        "closedBy": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "shiftRef": shift_ref,
        "remainingUnits": remaining,
    }
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="job_closed",
            subject_id=job["id"],
            summary=(
                f"Closed {job['product']} short with {remaining} units remaining"
            ),
            shiftRef=shift_ref,
            remainingQuantity=remaining,
        ),
        *state["events"],
    ]
    return state


def held_job_state(
    current: dict[str, object],
    evidence: dict[str, str],
) -> dict[str, object]:
    state = deepcopy(current)
    job = state["jobs"][0]
    job["qualityHold"] = {
        "actionId": evidence["actionId"],
        "heldAt": evidence["capturedAt"],
        "heldBy": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
    }
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="quality_hold_placed",
            subject_id=job["id"],
            summary=f"Held {job['product']} for quality review",
        ),
        *state["events"],
    ]
    return state


def released_job_state(
    current: dict[str, object],
    evidence: dict[str, str],
) -> dict[str, object]:
    state = deepcopy(current)
    job = state["jobs"][0]
    job.pop("qualityHold")
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="quality_hold_released",
            subject_id=job["id"],
            summary=f"Released {job['product']} from quality hold",
        ),
        *state["events"],
    ]
    return state


def started_downtime_state(
    current: dict[str, object],
    evidence: dict[str, str],
) -> dict[str, object]:
    state = deepcopy(current)
    machine = state["machines"][0]
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="downtime_started",
            subject_id=machine["id"],
            summary=f"Started downtime for {machine['name']}",
        ),
        *state["events"],
    ]
    return state


def ended_downtime_state(
    current: dict[str, object],
    start_evidence: dict[str, str],
    end_evidence: dict[str, str],
) -> dict[str, object]:
    state = deepcopy(current)
    machine = state["machines"][0]
    state["revision"] += 1
    state["events"] = [
        production_event(
            end_evidence,
            kind="downtime_ended",
            subject_id=machine["id"],
            summary=f"Ended downtime for {machine['name']}",
            downtimeStartActionId=start_evidence["actionId"],
        ),
        *state["events"],
    ]
    return state


def started_maintenance_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    owner: str = "Maintenance lead",
) -> dict[str, object]:
    state = deepcopy(current)
    machine = state["machines"][0]
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="maintenance_started",
            subject_id=machine["id"],
            summary=f"Started maintenance for {machine['name']}",
            maintenanceOwner=owner,
        ),
        *state["events"],
    ]
    return state


def completed_maintenance_state(
    current: dict[str, object],
    start_evidence: dict[str, str],
    completion_evidence: dict[str, str],
) -> dict[str, object]:
    state = deepcopy(current)
    machine = state["machines"][0]
    state["revision"] += 1
    state["events"] = [
        production_event(
            completion_evidence,
            kind="maintenance_completed",
            subject_id=machine["id"],
            summary=f"Completed maintenance for {machine['name']}",
            maintenanceStartActionId=start_evidence["actionId"],
        ),
        *state["events"],
    ]
    return state


def opened_issue_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    issue_id: str = "ISSUE-REAL-001",
    actionable: bool = True,
) -> dict[str, object]:
    state = deepcopy(current)
    issue = {
        "id": issue_id,
        "createdAt": evidence["capturedAt"],
        "area": "Assembly team",
        "kind": "quality",
        "summary": "Measured output is outside the approved tolerance.",
        "status": "open",
    }
    if actionable:
        issue.update(
            {
                "severity": "high",
                "owner": "Shift supervisor",
                "dueAt": "2026-07-24T13:00:00.000Z",
                "containment": "Hold the affected batch and verify the next sample.",
            }
        )
    event_details = (
        {
            "issueSeverity": issue["severity"],
            "issueOwner": issue["owner"],
            "issueDueAt": issue["dueAt"],
            "issueContainment": issue["containment"],
        }
        if actionable
        else {}
    )
    state["revision"] += 1
    state["issues"] = [issue, *state["issues"]]
    state["events"] = [
        production_event(
            evidence,
            kind="issue_opened",
            subject_id=issue_id,
            summary="Opened quality issue for Assembly team",
            **event_details,
        ),
        *state["events"],
    ]
    return state


def quality_corrective_action(
    current: dict[str, object],
    *,
    issue_id: str,
    failure_mode: str = "Seal temperature drift",
    cause_category: str = "machine",
) -> dict[str, object]:
    recurrence_key = f"{cause_category}:{failure_mode.lower().replace(' ', '-')}"
    prior = sorted(
        (
            issue
            for issue in current["issues"]
            if issue["id"] != issue_id
            and issue["status"] == "resolved"
            and issue.get("resolution", {})
            .get("qualityCorrectiveAction", {})
            .get("recurrenceKey")
            == recurrence_key
        ),
        key=lambda issue: (issue["resolution"]["resolvedAt"], issue["id"]),
    )
    return {
        "contract": "supermega.production.quality-capa.v1",
        "failureMode": failure_mode,
        "causeCategory": cause_category,
        "rootCause": "Heater feedback drifted outside the reviewed control range.",
        "correctiveAction": "Recalibrated the feedback loop and updated the first-piece check.",
        "verificationResult": "Three consecutive samples remained inside the approved range.",
        "effectivenessOwner": "Quality supervisor",
        "recurrenceKey": recurrence_key,
        "priorIssueIds": [issue["id"] for issue in prior],
    }


def quality_corrective_action_v2(
    current: dict[str, object],
    *,
    issue_id: str,
    effectiveness_review_due_at: str,
    failure_mode: str = "Seal temperature drift",
    cause_category: str = "machine",
) -> dict[str, object]:
    action = quality_corrective_action(
        current,
        issue_id=issue_id,
        failure_mode=failure_mode,
        cause_category=cause_category,
    )
    action["contract"] = "supermega.production.quality-capa.v2"
    action["effectivenessReviewDueAt"] = effectiveness_review_due_at
    return action


def resolved_issue_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    issue_id: str = "ISSUE-REAL-001",
) -> dict[str, object]:
    state = deepcopy(current)
    index = next(
        index
        for index, issue in enumerate(state["issues"])
        if issue["id"] == issue_id
    )
    issue = state["issues"][index]
    quality_action = (
        quality_corrective_action(current, issue_id=issue_id)
        if issue["kind"] == "quality" and {"severity", "owner", "dueAt", "containment"}.issubset(issue)
        else None
    )
    state["issues"][index] = {
        **issue,
        "status": "resolved",
        "resolution": {
            "actionId": evidence["actionId"],
            "resolvedAt": evidence["capturedAt"],
            "resolvedBy": evidence["actor"],
            "reason": evidence["reason"],
            "evidenceReference": evidence["evidenceReference"],
            **(
                {"qualityCorrectiveAction": deepcopy(quality_action)}
                if quality_action is not None
                else {}
            ),
        },
    }
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="issue_resolved",
            subject_id=issue_id,
            summary=f"Resolved {issue['kind']} issue for {issue['area']}",
            **(
                {"qualityCorrectiveAction": deepcopy(quality_action)}
                if quality_action is not None
                else {}
            ),
        ),
        *state["events"],
    ]
    return state


def resolved_issue_state_with_quality_action(
    current: dict[str, object],
    evidence: dict[str, str],
    quality_action: dict[str, object],
    *,
    issue_id: str = "ISSUE-REAL-001",
) -> dict[str, object]:
    state = resolved_issue_state(current, evidence, issue_id=issue_id)
    issue = next(issue for issue in state["issues"] if issue["id"] == issue_id)
    issue["resolution"]["qualityCorrectiveAction"] = deepcopy(quality_action)
    state["events"][0]["qualityCorrectiveAction"] = deepcopy(quality_action)
    return state


def quality_effectiveness_reviewed_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    issue_id: str,
    outcome: str,
    evidence_summary: str = "Reviewed the planned sample window and the classified problem history.",
) -> dict[str, object]:
    state = deepcopy(current)
    issue_index = next(
        index for index, issue in enumerate(state["issues"]) if issue["id"] == issue_id
    )
    issue = state["issues"][issue_index]
    resolution = issue["resolution"]
    quality_action = resolution["qualityCorrectiveAction"]
    reviewed_at = datetime.fromisoformat(evidence["capturedAt"].replace("Z", "+00:00"))
    resolved_at = datetime.fromisoformat(resolution["resolvedAt"].replace("Z", "+00:00"))
    recurrence_ids = sorted(
        (
            candidate
            for candidate in current["issues"]
            if candidate["id"] != issue_id
            and candidate["kind"] == "quality"
            and candidate["status"] == "resolved"
            and datetime.fromisoformat(candidate["createdAt"].replace("Z", "+00:00"))
            > resolved_at
            and datetime.fromisoformat(candidate["createdAt"].replace("Z", "+00:00"))
            <= reviewed_at
            and datetime.fromisoformat(
                candidate["resolution"]["resolvedAt"].replace("Z", "+00:00")
            )
            <= reviewed_at
            and candidate["resolution"]["qualityCorrectiveAction"]["recurrenceKey"]
            == quality_action["recurrenceKey"]
        ),
        key=lambda candidate: (candidate["createdAt"], candidate["id"]),
    )
    review = {
        "contract": "supermega.production.quality-capa-effectiveness.v1",
        "actionId": evidence["actionId"],
        "reviewedAt": evidence["capturedAt"],
        "reviewedBy": evidence["actor"],
        "outcome": outcome,
        "evidenceSummary": evidence_summary,
        "evidenceReference": evidence["evidenceReference"],
        "recurrenceIssueIds": [candidate["id"] for candidate in recurrence_ids],
        "escalation": "none" if outcome == "effective" else "required",
    }
    state["issues"][issue_index] = {
        **issue,
        "resolution": {**resolution, "qualityEffectivenessReview": review},
    }
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="quality_effectiveness_reviewed",
            subject_id=issue_id,
            summary=f"Reviewed {issue_id} CAPA as {outcome}",
            qualityEffectivenessReview=deepcopy(review),
        ),
        *state["events"],
    ]
    return state


def machine_state(
    current: dict[str, object],
    evidence: dict[str, str],
    to_state: str,
) -> dict[str, object]:
    state = deepcopy(current)
    machine = state["machines"][0]
    before = machine["state"]
    after = to_state
    machine["state"] = after
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="machine_state_changed",
            subject_id=machine["id"],
            summary=f"{machine['name']}: {before} to {after}",
            fromState=before,
            toState=after,
        ),
        *state["events"],
    ]
    return state


def apply_event(
    current: dict[str, object],
    event_type: str,
    next_state: dict[str, object],
    evidence: dict[str, str],
) -> dict[str, object]:
    return dict(
        reduce_trial_state(
            "production",
            event_type,
            current,
            {"state": next_state, "evidence": evidence},
        )
    )


class ProductionRuntimeTests(unittest.TestCase):
    def test_material_requirements_bind_bom_shop_stock_and_open_purchase_orders(self) -> None:
        current = starting_workspace(target=10)
        evidence = action_evidence("ACT-MRP-PLAN-001")
        plan = build_plant_order_effective_plan(
            plan_id="PLN-MRP-001",
            source_digest=plant_order_evidence_digest({"job": current["jobs"][0]}),  # type: ignore[index]
            effective_from="2026-08-01T15:30:00+06:30",
            effective_until="2026-08-31T15:30:00+06:30",
            job={
                "jobId": "JOB-REAL-001",
                "product": "Customer batch 001",
                "targetQuantity": 10,
                "outputBatchId": "BATCH-MRP-001",
            },
            materials=[{
                "materialId": "MAT-FILTER-001",
                "name": "Filter media",
                "unit": "kg",
                "quantityPerUnitMilli": 1_500,
                "standardCostPerUnitMmk": 1_000,
                "shopSupply": {
                    "sku": "SKU-RM-BAG",
                    "materialQuantityMilliPerStockUnit": 5_000,
                },
            }],
            work_centres=[{"workCentreId": "WC-MRP-001", "name": "MRP line"}],
            routing=[{
                "operationId": "OP-MRP-10",
                "sequence": 1,
                "name": "Process",
                "workCentreId": "WC-MRP-001",
                "minutesPerUnitMilli": 1_000,
                "standardCostPerMinuteMmk": 500,
            }],
        )
        empty = create_empty_plant_order_state()
        execution = apply_plant_order_plan(
            empty, plan, evidence, expected_head_digest=empty["headDigest"]
        )["state"]
        proposed = deepcopy(current)
        proposed["orderExecution"] = execution
        production = apply_event(
            current,
            "production.order_execution.recorded",
            proposed,
            evidence,
        )
        commerce = {
            "schema": "supermega.commerce.workspace.v2",
            "items": [{
                "sku": "SKU-RM-BAG",
                "name": "Filter media 5 kg bag",
                "onHand": 2,
                "reorderAt": 1,
                "price": 5_000,
            }],
            "orders": [],
            "movements": [],
            "closes": [],
            "purchaseOrders": [{
                "id": "PO-00000000-0000-4000-8000-000000000402",
                "createdAt": "2026-07-24T09:00:00.000Z",
                "expectedAt": "2026-08-02T09:00:00.000Z",
                "supplier": "Reviewed material supplier",
                "sku": "SKU-RM-BAG",
                "quantityOrdered": 2,
                "unitCostMmk": 5_000,
                "creation": action_evidence("ACT-MRP-PO-001"),
            }],
        }
        commerce_without_purchase = deepcopy(commerce)
        commerce_without_purchase["purchaseOrders"] = []
        protected_shortage = project_production_material_requirements(
            production, commerce_without_purchase
        )
        assert protected_shortage is not None
        self.assertEqual(protected_shortage["status"], "shortage")
        self.assertEqual(
            protected_shortage["rows"][0]["shopSupply"]["suggestedOrderStockUnits"],
            2,
        )
        requirements = project_production_material_requirements(production, commerce)
        self.assertIsNotNone(requirements)
        assert requirements is not None
        self.assertEqual(requirements["status"], "covered_by_open_po")
        self.assertEqual(requirements["rows"][0]["requiredQuantityMilli"], 15_000)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["onHandQuantityMilli"], 10_000)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["protectedStockUnits"], 1)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["availableToIssueStockUnits"], 1)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["suggestedIssueStockUnits"], 1)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["openPurchaseOrderQuantityMilli"], 10_000)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["suggestedOrderStockUnits"], 0)
        self.assertEqual(requirements["rows"][0]["shopSupply"]["atRiskPurchaseOrderStockUnits"], 0)
        self.assertTrue(all(value is False for value in requirements["authority"].values()))
        self.assertEqual(
            validate_production_material_requirements(
                requirements, production, commerce
            )["digest"],
            requirements["digest"],
        )
        tampered = deepcopy(requirements)
        tampered["rows"][0]["shopSupply"]["onHandStockUnits"] += 1
        with self.assertRaisesRegex(
            TrialValidationError,
            "do not match their current Plant and Shop evidence",
        ):
            validate_production_material_requirements(tampered, production, commerce)
        changed_floor_commerce = deepcopy(commerce)
        changed_floor_commerce["items"][0]["reorderAt"] = 2
        with self.assertRaisesRegex(
            TrialValidationError,
            "do not match their current Plant and Shop evidence",
        ):
            validate_production_material_requirements(
                requirements, production, changed_floor_commerce
            )

        late_commerce = deepcopy(commerce)
        late_commerce["purchaseOrders"][0]["expectedAt"] = "2026-07-28T09:00:00.000Z"
        at_risk = project_production_material_requirements(production, late_commerce)
        assert at_risk is not None
        self.assertEqual(at_risk["status"], "supply_at_risk")
        self.assertEqual(at_risk["summary"]["supplyAtRisk"], 1)
        self.assertEqual(at_risk["rows"][0]["shopSupply"]["atRiskPurchaseOrderStockUnits"], 2)
        self.assertEqual(at_risk["rows"][0]["shopSupply"]["suggestedExpediteStockUnits"], 2)
        self.assertEqual(at_risk["rows"][0]["shopSupply"]["suggestedOrderStockUnits"], 0)
        self.assertIsNone(at_risk["rows"][0]["shopSupply"]["nextExpectedAt"])

        reserve_deficit_commerce = deepcopy(late_commerce)
        reserve_deficit_commerce["items"][0]["onHand"] = 0
        reserve_deficit_commerce["purchaseOrders"][0]["quantityOrdered"] = 4
        reserve_deficit = project_production_material_requirements(
            production, reserve_deficit_commerce
        )
        assert reserve_deficit is not None
        self.assertEqual(reserve_deficit["status"], "supply_at_risk")
        self.assertEqual(
            reserve_deficit["rows"][0]["shopSupply"]["requiredSupplyStockUnits"],
            4,
        )
        self.assertEqual(
            reserve_deficit["rows"][0]["shopSupply"]["suggestedExpediteStockUnits"],
            4,
        )

        after_window_commerce = deepcopy(commerce)
        after_window_commerce["purchaseOrders"][0]["expectedAt"] = "2026-09-01T09:00:00.000Z"
        after_window = project_production_material_requirements(
            production, after_window_commerce
        )
        assert after_window is not None
        self.assertEqual(after_window["status"], "supply_at_risk")
        self.assertEqual(
            after_window["rows"][0]["shopSupply"]["atRiskPurchaseOrderStockUnits"],
            2,
        )

    def test_plant_cost_packet_has_python_browser_parity_and_rejects_tamper(self) -> None:
        plan_input = {
            "plan_id": "PLN-20260726-402",
            "source_digest": plant_order_evidence_digest(
                {"jobId": "JOB-401", "revision": 12, "target": 10}
            ),
            "job": {
                "jobId": "JOB-401",
                "product": "Premium water filter",
                "targetQuantity": 10,
                "outputBatchId": "BATCH-20260726-401",
            },
            "materials": [
                {
                    "materialId": "MAT-FILTER-001",
                    "name": "Filter media",
                    "unit": "kg",
                    "quantityPerUnitMilli": 1_500,
                    "standardCostPerUnitMmk": 1_000,
                },
                {
                    "materialId": "MAT-SHELL-001",
                    "name": "Outer shell",
                    "unit": "pcs",
                    "quantityPerUnitMilli": 2_000,
                    "standardCostPerUnitMmk": 2_000,
                },
            ],
            "work_centres": [
                {"workCentreId": "WC-ASSEMBLY-01", "name": "Assembly bench"},
                {"workCentreId": "WC-TEST-01", "name": "Pressure test"},
            ],
            "routing": [
                {
                    "operationId": "OP-ASSEMBLY-10",
                    "sequence": 1,
                    "name": "Assemble",
                    "workCentreId": "WC-ASSEMBLY-01",
                    "minutesPerUnitMilli": 500,
                    "standardCostPerMinuteMmk": 500,
                },
                {
                    "operationId": "OP-TEST-20",
                    "sequence": 2,
                    "name": "Pressure test",
                    "workCentreId": "WC-TEST-01",
                    "minutesPerUnitMilli": 1_000,
                    "standardCostPerMinuteMmk": 600,
                },
            ],
        }
        plan = build_plant_order_execution_plan(**plan_input)
        empty = create_empty_plant_order_state()
        state = apply_plant_order_plan(
            empty,
            plan,
            action_evidence("ACT-20260726-001"),
            expected_head_digest=empty["headDigest"],
        )["state"]

        projection = project_plant_order(state)
        drivers = project_plant_order_cost_drivers(projection)
        financial_cost = project_plant_order_financial_cost(projection)
        packet = build_plant_order_cost_review_packet(state)

        self.assertEqual(plan["packageDigest"], "sha256:c8c747513a48ab4ef6a055bcf612bfdc9244c94771d5eeaae94b6204312b5f69")
        self.assertEqual(drivers["status"], "not_started")
        self.assertEqual(financial_cost["planned"]["totalMmk"], 63_500)
        self.assertEqual(financial_cost["varianceMmk"], 0)
        self.assertIsNotNone(packet)
        assert packet is not None
        self.assertTrue(all(value is False for value in packet["authority"].values()))
        self.assertEqual(
            validate_plant_order_cost_review_packet(packet)["digest"], packet["digest"]
        )

        tampered = deepcopy(packet)
        tampered["financialCost"]["planned"]["totalMmk"] += 1
        with self.assertRaisesRegex(
            PlantOrderValidationError,
            "does not match its validated command chain",
        ):
            validate_plant_order_cost_review_packet(tampered)

        unpriced_input = deepcopy(plan_input)
        unpriced_input["plan_id"] = "PLN-20260726-403"
        for material in unpriced_input["materials"]:
            material.pop("standardCostPerUnitMmk")
        for operation in unpriced_input["routing"]:
            operation.pop("standardCostPerMinuteMmk")
        unpriced_plan = build_plant_order_execution_plan(**unpriced_input)
        unpriced = apply_plant_order_plan(
            empty,
            unpriced_plan,
            action_evidence("ACT-20260726-002", captured_at=LATER),
            expected_head_digest=empty["headDigest"],
        )["state"]
        self.assertIsNone(build_plant_order_cost_review_packet(unpriced))

    def test_event_contract_and_real_workspace_initialization(self) -> None:
        expected_events = {
            "production.workspace.initialized",
            "production.job.created",
            "production.job.schedule_updated",
            "production.job.closed",
            "production.output.recorded",
            "production.material.consumed",
            "production.issue.opened",
            "production.issue.resolved",
            "production.quality_effectiveness.reviewed",
            "production.quality_hold.placed",
            "production.quality_hold.released",
            "production.machine_state.changed",
            "production.equipment_master.imported",
            "production.equipment.commissioned",
            "production.equipment_maintenance_strategy.saved",
            "production.order_execution.recorded",
            "production.downtime.started",
            "production.downtime.ended",
            "production.maintenance_window.scheduled",
            "production.maintenance.started",
            "production.maintenance.completed",
            "production.shift.closed",
        }
        self.assertEqual(PRODUCTION_EVENTS, expected_events)
        self.assertEqual(PRODUCTION_HUMAN_EVENTS, expected_events)

    def test_shift_close_binds_exact_clear_shift_evidence(self) -> None:
        base = starting_workspace(target=20)
        output_evidence = action_evidence("ACT-SHIFT-OUTPUT", captured_at=NOW)
        output = apply_event(
            base,
            "production.output.recorded",
            output_state(base, 3, output_evidence),
            output_evidence,
        )
        material_evidence = action_evidence("ACT-SHIFT-MATERIAL", captured_at=LATER)
        traced = apply_event(
            output,
            "production.material.consumed",
            material_state(output, 1.25, material_evidence),
            material_evidence,
        )
        close_evidence = action_evidence("ACT-SHIFT-CLOSE", captured_at=LATEST)
        closed = apply_event(
            traced,
            "production.shift.closed",
            shift_closed_state(traced, close_evidence),
            close_evidence,
        )
        close_event = closed["events"][0]
        self.assertEqual(close_event["kind"], "shift_closed")
        self.assertEqual(close_event["sourceRevision"], traced["revision"])
        self.assertEqual(close_event["sourceDigest"], production_source_digest(traced))
        self.assertEqual(close_event["goodUnits"], 3)
        self.assertEqual(close_event["scrapUnits"], 0)
        self.assertEqual(close_event["outputEntryCount"], 1)
        self.assertEqual(close_event["materialEntryCount"], 1)
        self.assertEqual(closed["jobs"], traced["jobs"])
        self.assertEqual(closed["issues"], traced["issues"])
        self.assertEqual(closed["machines"], traced["machines"])

        missing_material = shift_closed_state(output, close_evidence)
        with self.assertRaises(TrialValidationError):
            apply_event(output, "production.shift.closed", missing_material, close_evidence)

        tampered_digest = shift_closed_state(traced, close_evidence)
        tampered_digest["events"][0]["sourceDigest"] = f"sha256:{'0' * 64}"
        with self.assertRaises(TrialValidationError):
            apply_event(traced, "production.shift.closed", tampered_digest, close_evidence)

        issue_evidence = action_evidence(
            "ACT-SHIFT-QUALITY",
            captured_at="2026-07-24T09:20:00.000Z",
        )
        quality_blocked = apply_event(
            traced,
            "production.issue.opened",
            opened_issue_state(traced, issue_evidence),
            issue_evidence,
        )
        blocked_close_evidence = action_evidence(
            "ACT-SHIFT-CLOSE-QUALITY",
            captured_at="2026-07-24T09:40:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                quality_blocked,
                "production.shift.closed",
                shift_closed_state(quality_blocked, blocked_close_evidence),
                blocked_close_evidence,
            )

        downtime_evidence = action_evidence(
            "ACT-SHIFT-DOWNTIME",
            captured_at="2026-07-24T09:20:00.000Z",
        )
        wcm_blocked = apply_event(
            traced,
            "production.downtime.started",
            started_downtime_state(traced, downtime_evidence),
            downtime_evidence,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                wcm_blocked,
                "production.shift.closed",
                shift_closed_state(wcm_blocked, blocked_close_evidence),
                blocked_close_evidence,
            )

        second_close_evidence = action_evidence(
            "ACT-SHIFT-CLOSE-AGAIN",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                closed,
                "production.shift.closed",
                shift_closed_state(closed, second_close_evidence),
                second_close_evidence,
            )

        execution_evidence = action_evidence(
            "ACT-SHIFT-EXECUTION",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        execution_changed = deepcopy(closed)
        execution_changed["orderExecution"] = planned_order_execution(
            closed,
            execution_evidence,
            target=17,
        )
        execution_changed = apply_event(
            closed,
            "production.order_execution.recorded",
            execution_changed,
            execution_evidence,
        )
        renewed_close_evidence = action_evidence(
            "ACT-SHIFT-CLOSE-AFTER-EXECUTION",
            captured_at="2026-07-24T10:00:00.000Z",
        )
        renewed = apply_event(
            execution_changed,
            "production.shift.closed",
            shift_closed_state(execution_changed, renewed_close_evidence),
            renewed_close_evidence,
        )
        self.assertEqual(renewed["events"][0]["kind"], "shift_closed")
        self.assertEqual(renewed["events"][1]["kind"], "shift_closed")
        self.assertNotEqual(
            renewed["events"][0]["sourceDigest"],
            renewed["events"][1]["sourceDigest"],
        )
    def test_shop_demand_job_retains_digest_bound_customer_free_source(self) -> None:
        current = starting_workspace()
        snapshot = {
            "schema": "supermega.shop_production_demand.v1",
            "operatingUnitLocationId": "LOC-MAIN",
            "sku": "SKU-SHOP-001",
            "productName": "Shop replenishment batch",
            "sourceOrderIds": ["ORD-001", "ORD-002"],
            "activeDemandUnits": 18,
            "uncoveredDemandUnits": 8,
            "availableToPromiseUnits": 10,
            "reorderAtUnits": 15,
            "replenishmentGapUnits": 5,
            "recommendedBatchUnits": 8,
        }
        source_digest = plant_order_evidence_digest(snapshot)
        evidence_reference = f"SHOP-DEMAND:{source_digest}:LOC-MAIN"
        evidence = action_evidence(
            "ACT-SHOP-DEMAND-JOB",
            captured_at=LATER,
            evidence_reference=evidence_reference,
        )
        job = {
            "id": "JOB-SHOP-001",
            "line": "Packing team",
            "product": snapshot["productName"],
            "target": snapshot["recommendedBatchUnits"],
            "output": 0,
            "owner": "Packing lead",
            "priority": "urgent",
            "dueAt": "2026-07-25T09:00:00.000Z",
            "shopDemandSource": {
                "contract": "supermega.production.shop-demand-source.v1",
                "sourceDigest": source_digest,
                "evidenceReference": evidence_reference,
                "snapshot": snapshot,
            },
        }
        next_state = deepcopy(current)
        next_state["revision"] = 1
        next_state["jobs"] = [job, *next_state["jobs"]]
        next_state["events"] = [
            production_event(
                evidence,
                kind="job_created",
                subject_id=job["id"],
                summary="Created Shop replenishment batch job for Packing team",
                jobPriority=job["priority"],
                jobDueAt=job["dueAt"],
                jobOwner=job["owner"],
            )
        ]

        accepted = apply_event(
            current,
            "production.job.created",
            next_state,
            evidence,
        )
        retained = accepted["jobs"][0]["shopDemandSource"]
        self.assertEqual(retained["snapshot"]["sourceOrderIds"], ["ORD-001", "ORD-002"])
        self.assertNotIn("customer", str(retained).lower())

        for mutate in (
            lambda state: state["jobs"][0]["shopDemandSource"]["snapshot"]["sourceOrderIds"].append("ORD-003"),
            lambda state: state["jobs"][0]["shopDemandSource"].__setitem__("sourceDigest", f"sha256:{'0' * 64}"),
            lambda state: state["events"][0].__setitem__("evidenceReference", "evidence://forged"),
            lambda state: state["jobs"][0].__setitem__("target", 9),
        ):
            forged = deepcopy(next_state)
            mutate(forged)
            with self.assertRaises(TrialValidationError):
                validate_production_state(forged)

    def test_managed_order_execution_appends_one_bound_command(self) -> None:
        current = starting_workspace(target=10)
        plan_evidence = action_evidence("ACT-ORDER-EXECUTION-001")
        planned = deepcopy(current)
        planned["orderExecution"] = planned_order_execution(current, plan_evidence)

        accepted = apply_event(
            current,
            "production.order_execution.recorded",
            planned,
            plan_evidence,
        )

        self.assertEqual(accepted["revision"], current["revision"])
        self.assertEqual(accepted["events"], current["events"])
        self.assertEqual(accepted["orderExecution"]["revision"], 1)  # type: ignore[index]

        output_evidence = action_evidence(
            "ACT-ORDER-EXECUTION-LATEST-OUTPUT",
            captured_at=LATER,
        )
        output_current = apply_event(
            current,
            "production.output.recorded",
            output_state(current, 1, output_evidence),
            output_evidence,
        )
        stale_execution = deepcopy(output_current)
        stale_execution["orderExecution"] = planned_order_execution(
            output_current,
            plan_evidence,
            target=9,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                output_current,
                "production.order_execution.recorded",
                stale_execution,
                plan_evidence,
            )

        availability_evidence = action_evidence(
            "ACT-ORDER-EXECUTION-002",
            captured_at=LATER,
        )
        available_execution = check_plant_order_availability(
            accepted["orderExecution"],
            check_id="CHK-MANAGED-001",
            source_digest=plant_order_evidence_digest({"availability": "observed"}),
            materials=[
                {
                    "materialId": "MAT-MANAGED-001",
                    "inputLotId": "LOT-MANAGED-001",
                    "availableQuantityMilli": 10_000,
                }
            ],
            work_centres=[
                {"workCentreId": "WC-MANAGED-001", "availableMinutes": 10}
            ],
            proof=availability_evidence,
            expected_head_digest=accepted["orderExecution"]["headDigest"],  # type: ignore[index]
        )["state"]
        available = deepcopy(accepted)
        available["orderExecution"] = available_execution
        accepted_available = apply_event(
            accepted,
            "production.order_execution.recorded",
            available,
            availability_evidence,
        )
        self.assertEqual(accepted_available["orderExecution"]["revision"], 2)  # type: ignore[index]

        release_evidence = action_evidence(
            "ACT-ORDER-EXECUTION-003",
            captured_at=LATEST,
        )
        released_execution = release_plant_order(
            accepted_available["orderExecution"],
            release_id="REL-MANAGED-001",
            availability_check_id="CHK-MANAGED-001",
            proof=release_evidence,
            expected_head_digest=accepted_available["orderExecution"]["headDigest"],
        )["state"]
        released = deepcopy(accepted_available)
        released["orderExecution"] = released_execution
        accepted_released = apply_event(
            accepted_available,
            "production.order_execution.recorded",
            released,
            release_evidence,
        )

        issue_evidence = action_evidence(
            "ACT-ORDER-EXECUTION-004",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        issued_execution = issue_plant_order_material(
            accepted_released["orderExecution"],
            issue_id="ISSUE-MANAGED-001",
            material_id="MAT-MANAGED-001",
            input_lot_id="LOT-MANAGED-001",
            quantity_milli=10_000,
            proof=issue_evidence,
            expected_head_digest=accepted_released["orderExecution"]["headDigest"],
        )["state"]
        issued = deepcopy(accepted_released)
        issued["orderExecution"] = issued_execution
        accepted_issued = apply_event(
            accepted_released,
            "production.order_execution.recorded",
            issued,
            issue_evidence,
        )

        operation_evidence = action_evidence(
            "ACT-ORDER-EXECUTION-005",
            captured_at="2026-07-24T10:00:00.000Z",
        )
        operated_execution = record_plant_order_operation(
            accepted_issued["orderExecution"],
            operation_run_id="OPRUN-MANAGED-001",
            operation_id="OP-MANAGED-10",
            quantity=10,
            actual_minutes_milli=9_500,
            proof=operation_evidence,
            expected_head_digest=accepted_issued["orderExecution"]["headDigest"],
        )["state"]
        operated = deepcopy(accepted_issued)
        operated["orderExecution"] = operated_execution
        accepted_operated = apply_event(
            accepted_issued,
            "production.order_execution.recorded",
            operated,
            operation_evidence,
        )
        self.assertEqual(accepted_operated["orderExecution"]["revision"], 5)  # type: ignore[index]
        self.assertEqual(
            accepted_operated["orderExecution"]["commands"][-1]["payload"]["kind"],  # type: ignore[index]
            "record_operation",
        )

        wrong_job = deepcopy(current)
        wrong_job["orderExecution"] = planned_order_execution(
            current,
            plan_evidence,
            target=9,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.order_execution.recorded",
                wrong_job,
                plan_evidence,
            )

        spoofed_proof = action_evidence(
            "ACT-ORDER-EXECUTION-SPOOFED",
            actor="actor-spoofed",
        )
        spoofed = deepcopy(current)
        spoofed["orderExecution"] = planned_order_execution(current, spoofed_proof)
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.order_execution.recorded",
                spoofed,
                action_evidence("ACT-ORDER-EXECUTION-SPOOFED"),
            )

        unrelated = output_state(
            accepted,
            1,
            action_evidence("ACT-OUTPUT-WITH-EXECUTION", captured_at=LATER),
        )
        unrelated.pop("orderExecution")
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "production.output.recorded",
                unrelated,
                action_evidence("ACT-OUTPUT-WITH-EXECUTION", captured_at=LATER),
            )

        retained_history = starting_workspace(target=1_000)
        retained_history["jobs"][0]["output"] = 501
        retained_history["revision"] = 501
        retained_history["events"] = [
            production_event(
                action_evidence(f"ACT-RETAINED-{index:03d}"),
                kind="output_recorded",
                subject_id=retained_history["jobs"][0]["id"],
                summary="Recorded 1 good units",
                quantity=1,
            )
            for index in range(501)
        ]
        self.assertEqual(
            len(validate_production_state(retained_history)["events"]),
            501,
        )

    def test_managed_order_portfolio_appends_one_job_at_a_time(self) -> None:
        current = opening_plan_workspace()
        first_evidence = action_evidence("ACT-PORTFOLIO-001")
        first_execution = planned_order_execution(current, first_evidence)
        first = deepcopy(current)
        first["orderPortfolio"] = {
            "contract": "supermega.production.order_portfolio.v1",
            "entries": [{"jobId": "JOB-OPENING-001", "execution": first_execution}],
        }
        accepted_first = apply_event(
            current,
            "production.order_execution.recorded",
            first,
            first_evidence,
        )

        second_evidence = action_evidence("ACT-PORTFOLIO-002", captured_at=LATER)
        second_job = current["jobs"][1]  # type: ignore[index]
        second_plan = build_plant_order_execution_plan(
            plan_id="PLN-MANAGED-002",
            source_digest=plant_order_evidence_digest({"job": second_job}),
            job={
                "jobId": second_job["id"],
                "product": second_job["product"],
                "targetQuantity": second_job["target"],
                "outputBatchId": "BATCH-MANAGED-002",
            },
            materials=[{
                "materialId": "MAT-MANAGED-002",
                "name": "Second managed material",
                "unit": "kg",
                "quantityPerUnitMilli": 1_000,
            }],
            work_centres=[{"workCentreId": "WC-MANAGED-002", "name": "Second line"}],
            routing=[{
                "operationId": "OP-MANAGED-20",
                "sequence": 1,
                "name": "Second managed operation",
                "workCentreId": "WC-MANAGED-002",
                "minutesPerUnitMilli": 1_000,
            }],
        )
        empty = create_empty_plant_order_state()
        second_execution = apply_plant_order_plan(
            empty,
            second_plan,
            second_evidence,
            expected_head_digest=empty["headDigest"],
        )["state"]
        second = deepcopy(accepted_first)
        second["orderPortfolio"]["entries"].append({  # type: ignore[index]
            "jobId": "JOB-OPENING-002",
            "execution": second_execution,
        })
        accepted_second = apply_event(
            accepted_first,
            "production.order_execution.recorded",
            second,
            second_evidence,
        )
        self.assertEqual(
            [entry["jobId"] for entry in accepted_second["orderPortfolio"]["entries"]],  # type: ignore[index]
            ["JOB-OPENING-001", "JOB-OPENING-002"],
        )

        changed_two = deepcopy(accepted_second)
        for index, action_id in enumerate(("ACT-PORTFOLIO-003", "ACT-PORTFOLIO-004")):
            evidence = action_evidence(action_id, captured_at=LATEST)
            execution = changed_two["orderPortfolio"]["entries"][index]["execution"]  # type: ignore[index]
            changed_two["orderPortfolio"]["entries"][index]["execution"] = check_plant_order_availability(  # type: ignore[index]
                execution,
                check_id=f"CHK-PORTFOLIO-{index + 1:03d}",
                source_digest=plant_order_evidence_digest({"portfolio": index}),
                materials=[{
                    "materialId": f"MAT-MANAGED-{index + 1:03d}",
                    "inputLotId": f"LOT-MANAGED-{index + 1:03d}",
                    "availableQuantityMilli": (100 if index else 10) * 1_000,
                }],
                work_centres=[{
                    "workCentreId": f"WC-MANAGED-{index + 1:03d}",
                    "availableMinutes": 100 if index else 10,
                }],
                proof=evidence,
                expected_head_digest=execution["headDigest"],
            )["state"]
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted_second,
                "production.order_execution.recorded",
                changed_two,
                action_evidence("ACT-PORTFOLIO-003", captured_at=LATEST),
            )

    def test_opening_plan_is_atomic_multi_record_and_immutable(self) -> None:
        initial = opening_plan_workspace()
        evidence = action_evidence("ACT-INIT-OPENING-PLAN")
        evidence["evidenceReference"] = OPENING_DIGEST

        self.assertEqual(validate_production_state(initial), initial)
        accepted = apply_event(
            {},
            "production.workspace.initialized",
            initial,
            evidence,
        )
        self.assertEqual(len(accepted["jobs"]), 2)
        self.assertEqual(len(accepted["machines"]), 2)
        self.assertEqual(accepted["revision"], 0)
        self.assertEqual(accepted["events"], [])

        schedule_evidence = action_evidence(
            "ACT-OPENING-PLAN-SCHEDULE",
            captured_at=LATER,
        )
        scheduled = apply_event(
            accepted,
            "production.job.schedule_updated",
            schedule_state(
                accepted,
                "urgent",
                "2026-07-27T09:00:00.000Z",
                schedule_evidence,
                job_id="JOB-OPENING-002",
                owner="Packing supervisor",
            ),
            schedule_evidence,
        )
        self.assertEqual(scheduled["openingPlan"], accepted["openingPlan"])
        self.assertEqual(scheduled["jobs"][1]["priority"], "urgent")
        self.assertEqual(scheduled["revision"], 1)

        altered = schedule_state(
            accepted,
            "urgent",
            "2026-07-27T09:00:00.000Z",
            schedule_evidence,
            job_id="JOB-OPENING-002",
            owner="Packing supervisor",
        )
        altered["openingPlan"]["packageDigest"] = f"sha256:{'b' * 64}"
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "production.job.schedule_updated",
                altered,
                schedule_evidence,
            )

    def test_opening_plan_rejects_tamper_and_copied_history(self) -> None:
        invalid_states: list[tuple[str, dict[str, object]]] = []

        reordered_jobs = opening_plan_workspace()
        reordered_jobs["openingPlan"]["jobIds"].reverse()
        invalid_states.append(("reordered jobs", reordered_jobs))

        missing_job = opening_plan_workspace()
        missing_job["openingPlan"]["jobIds"].pop(0)
        invalid_states.append(("missing job", missing_job))

        duplicate_job = opening_plan_workspace()
        duplicate_job["openingPlan"]["jobIds"][1] = "JOB-OPENING-001"
        invalid_states.append(("duplicate job", duplicate_job))

        mismatched_machine = opening_plan_workspace()
        mismatched_machine["openingPlan"]["machineIds"].reverse()
        invalid_states.append(("mismatched machine", mismatched_machine))

        bad_contract = opening_plan_workspace()
        bad_contract["openingPlan"]["contract"] = "supermega.production.opening-plan.v0"
        invalid_states.append(("bad contract", bad_contract))

        bad_pack = opening_plan_workspace()
        bad_pack["openingPlan"]["industryPackId"] = "unsupported-pack"
        invalid_states.append(("bad industry pack", bad_pack))

        bad_digest = opening_plan_workspace(digest="sha256:not-a-digest")
        invalid_states.append(("bad digest", bad_digest))

        noncanonical_time = opening_plan_workspace(
            confirmed_at="2026-07-24T09:00:00Z"
        )
        invalid_states.append(("noncanonical time", noncanonical_time))

        copied_output = opening_plan_workspace()
        copied_output["jobs"][0]["output"] = 1
        invalid_states.append(("copied output", copied_output))

        stopped_machine = opening_plan_workspace()
        stopped_machine["machines"][0]["state"] = "stopped"
        invalid_states.append(("stopped machine", stopped_machine))

        for label, candidate in invalid_states:
            with self.subTest(label=label), self.assertRaises(TrialValidationError):
                validate_production_state(candidate)

        evidence = action_evidence("ACT-INIT-OPENING-TAMPER")
        evidence["evidenceReference"] = OPENING_DIGEST

        wrong_digest_evidence = deepcopy(evidence)
        wrong_digest_evidence["evidenceReference"] = f"sha256:{'b' * 64}"
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                opening_plan_workspace(),
                wrong_digest_evidence,
            )

        mismatched_confirmation = opening_plan_workspace(confirmed_at=LATER)
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                mismatched_confirmation,
                evidence,
            )

        overdue = opening_plan_workspace()
        overdue["jobs"][1]["dueAt"] = NOW
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                overdue,
                evidence,
            )

        copied_scrap_field = opening_plan_workspace()
        copied_scrap_field["jobs"][0]["scrap"] = 0
        self.assertEqual(
            validate_production_state(copied_scrap_field),
            copied_scrap_field,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                copied_scrap_field,
                evidence,
            )

    def test_job_schedule_update_is_chained_exact_and_active_only(self) -> None:
        current = starting_workspace()
        first_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-001",
            captured_at=LATER,
        )
        first_proposed = schedule_state(
            current,
            "urgent",
            "2026-07-26T09:00:00.000Z",
            first_evidence,
            owner="Night shift lead",
        )
        first = apply_event(
            current,
            "production.job.schedule_updated",
            first_proposed,
            first_evidence,
        )

        self.assertEqual(first["jobs"][0]["priority"], "urgent")
        self.assertEqual(first["jobs"][0]["dueAt"], "2026-07-26T09:00:00.000Z")
        self.assertEqual(first["jobs"][0]["owner"], "Night shift lead")
        self.assertEqual(first["jobs"][0]["target"], current["jobs"][0]["target"])
        self.assertEqual(first["jobs"][0]["output"], current["jobs"][0]["output"])
        self.assertEqual(first["issues"], current["issues"])
        self.assertEqual(first["machines"], current["machines"])
        self.assertEqual(first["events"][0]["fromJobPriority"], "normal")
        self.assertEqual(
            first["events"][0]["fromJobDueAt"],
            "2026-07-25T09:00:00.000Z",
        )
        self.assertEqual(first["events"][0]["jobPriority"], "urgent")
        self.assertEqual(first["events"][0]["fromJobOwner"], "Shift lead")
        self.assertEqual(first["events"][0]["jobOwner"], "Night shift lead")

        second_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-002",
            captured_at=LATEST,
        )
        second = apply_event(
            first,
            "production.job.schedule_updated",
            schedule_state(
                first,
                "low",
                "2026-07-27T09:00:00.000Z",
                second_evidence,
                owner="Finishing supervisor",
            ),
            second_evidence,
        )
        self.assertEqual(
            [
                (
                    event.get("fromJobPriority"),
                    event["jobPriority"],
                    event["jobDueAt"],
                    event.get("fromJobOwner"),
                    event.get("jobOwner"),
                )
                for event in second["events"][:2]
            ],
            [
                (
                    "urgent",
                    "low",
                    "2026-07-27T09:00:00.000Z",
                    "Night shift lead",
                    "Finishing supervisor",
                ),
                (
                    "normal",
                    "urgent",
                    "2026-07-26T09:00:00.000Z",
                    "Shift lead",
                    "Night shift lead",
                ),
            ],
        )

        legacy = starting_workspace()
        legacy["jobs"][0].pop("priority")
        legacy["jobs"][0].pop("dueAt")
        legacy["jobs"][0].pop("owner")
        legacy_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-LEGACY",
            captured_at=LATER,
        )
        scheduled_legacy = apply_event(
            legacy,
            "production.job.schedule_updated",
            schedule_state(
                legacy,
                "normal",
                "2026-07-26T12:00:00.000Z",
                legacy_evidence,
            ),
            legacy_evidence,
        )
        self.assertNotIn("fromJobPriority", scheduled_legacy["events"][0])
        self.assertNotIn("fromJobDueAt", scheduled_legacy["events"][0])
        self.assertNotIn("fromJobOwner", scheduled_legacy["events"][0])
        self.assertEqual(scheduled_legacy["jobs"][0]["owner"], "Shift lead")

        schedule_only_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-ONLY-HISTORY",
            captured_at=NOW,
        )
        schedule_only = starting_workspace()
        schedule_only["jobs"][0].pop("owner")
        schedule_only["jobs"][0]["priority"] = "urgent"
        schedule_only["jobs"][0]["dueAt"] = "2026-07-26T09:00:00.000Z"
        schedule_only["revision"] = 1
        schedule_only["events"] = [
            production_event(
                schedule_only_evidence,
                kind="job_schedule_updated",
                subject_id=schedule_only["jobs"][0]["id"],
                summary="Updated Customer batch 001 schedule for Assembly team",
                fromJobPriority="normal",
                fromJobDueAt="2026-07-25T09:00:00.000Z",
                jobPriority="urgent",
                jobDueAt="2026-07-26T09:00:00.000Z",
            )
        ]
        validate_production_state(schedule_only)
        upgraded_schedule_only_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-ONLY-UPGRADE",
            captured_at=LATER,
        )
        upgraded_schedule_only = apply_event(
            schedule_only,
            "production.job.schedule_updated",
            schedule_state(
                schedule_only,
                "urgent",
                "2026-07-26T09:00:00.000Z",
                upgraded_schedule_only_evidence,
                owner="Named shift lead",
            ),
            upgraded_schedule_only_evidence,
        )
        self.assertEqual(upgraded_schedule_only["jobs"][0]["owner"], "Named shift lead")
        self.assertNotIn("fromJobOwner", upgraded_schedule_only["events"][0])

        no_op_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-NOOP",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                second,
                "production.job.schedule_updated",
                schedule_state(
                    second,
                    "low",
                    "2026-07-27T09:00:00.000Z",
                    no_op_evidence,
                ),
                no_op_evidence,
            )

        nonfuture_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-NONFUTURE",
            captured_at=LATER,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.schedule_updated",
                schedule_state(
                    current,
                    "urgent",
                    LATER,
                    nonfuture_evidence,
                ),
                nonfuture_evidence,
            )

        forged_previous = deepcopy(first_proposed)
        forged_previous["events"][0]["fromJobPriority"] = "low"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.schedule_updated",
                forged_previous,
                first_evidence,
            )

        forged_previous_owner = deepcopy(first_proposed)
        forged_previous_owner["events"][0]["fromJobOwner"] = "Different lead"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.schedule_updated",
                forged_previous_owner,
                first_evidence,
            )

        missing_owner_snapshot = deepcopy(first_proposed)
        missing_owner_snapshot["events"][0].pop("jobOwner")
        missing_owner_snapshot["events"][0].pop("fromJobOwner")
        missing_owner_snapshot["events"][0]["summary"] = (
            "Updated Customer batch 001 schedule for Assembly team"
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.schedule_updated",
                missing_owner_snapshot,
                first_evidence,
            )

        for invalid_owner in (" Shift lead", "Shift lead ", "x" * 121):
            with self.subTest(invalid_owner=invalid_owner), self.assertRaises(
                TrialValidationError
            ):
                apply_event(
                    current,
                    "production.job.schedule_updated",
                    schedule_state(
                        current,
                        "urgent",
                        "2026-07-26T09:00:00.000Z",
                        first_evidence,
                        owner=invalid_owner,
                    ),
                    first_evidence,
                )

        unrelated_output = deepcopy(first_proposed)
        unrelated_output["jobs"][0]["output"] = 1
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.schedule_updated",
                unrelated_output,
                first_evidence,
            )

        rewritten_current = deepcopy(second)
        rewritten_current["jobs"][0]["dueAt"] = "2026-07-28T09:00:00.000Z"
        with self.assertRaises(TrialValidationError):
            validate_production_state(rewritten_current)

        rewritten_owner = deepcopy(second)
        rewritten_owner["jobs"][0]["owner"] = "Unrecorded reassignment"
        with self.assertRaises(TrialValidationError):
            validate_production_state(rewritten_owner)

        completed = output_state(
            starting_workspace(target=1),
            1,
            action_evidence("ACT-JOB-SCHEDULE-COMPLETE-BASE", captured_at=NOW),
        )
        completed_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-COMPLETE",
            captured_at=LATER,
        )
        completed_schedule_state = schedule_state(
            completed,
            "urgent",
            "2026-07-26T09:00:00.000Z",
            completed_evidence,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(completed_schedule_state)
        with self.assertRaises(TrialValidationError):
            apply_event(
                completed,
                "production.job.schedule_updated",
                completed_schedule_state,
                completed_evidence,
            )

        close_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-CLOSE-BASE",
            captured_at=LATER,
        )
        closed = apply_event(
            current,
            "production.job.closed",
            closed_job_state(current, close_evidence),
            close_evidence,
        )
        closed_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-CLOSED",
            captured_at=LATEST,
        )
        closed_schedule_state = schedule_state(
            closed,
            "urgent",
            "2026-07-26T09:00:00.000Z",
            closed_evidence,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(closed_schedule_state)
        with self.assertRaises(TrialValidationError):
            apply_event(
                closed,
                "production.job.schedule_updated",
                closed_schedule_state,
                closed_evidence,
            )

        latest_output = output_state(
            current,
            1,
            action_evidence("ACT-JOB-SCHEDULE-LATEST-OUTPUT", captured_at=LATEST),
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                latest_output,
                "production.job.schedule_updated",
                schedule_state(
                    latest_output,
                    "urgent",
                    "2026-07-26T09:00:00.000Z",
                    first_evidence,
                ),
                first_evidence,
            )

        creation_evidence = action_evidence(
            "ACT-JOB-SCHEDULE-CREATE",
            captured_at=NOW,
        )
        created = deepcopy(current)
        created_job = {
            "id": "JOB-SCHEDULED-CREATED",
            "line": "Finishing team",
            "product": "Created scheduled batch",
            "target": 25,
            "output": 0,
            "owner": "Finishing lead",
            "priority": "urgent",
            "dueAt": "2026-07-25T12:00:00.000Z",
        }
        created["revision"] = 1
        created["jobs"] = [created_job, *created["jobs"]]
        created["events"] = [
            production_event(
                creation_evidence,
                kind="job_created",
                subject_id=created_job["id"],
                summary="Created Created scheduled batch job for Finishing team",
                jobPriority=created_job["priority"],
                jobDueAt=created_job["dueAt"],
                jobOwner=created_job["owner"],
            )
        ]
        accepted_created = apply_event(
            current,
            "production.job.created",
            created,
            creation_evidence,
        )
        updated_created = apply_event(
            accepted_created,
            "production.job.schedule_updated",
            schedule_state(
                accepted_created,
                "normal",
                "2026-07-27T12:00:00.000Z",
                first_evidence,
                job_id=created_job["id"],
            ),
            first_evidence,
        )
        self.assertEqual(
            updated_created["events"][0]["fromJobDueAt"],
            created_job["dueAt"],
        )
        self.assertEqual(
            updated_created["events"][0]["fromJobOwner"],
            created_job["owner"],
        )

    def test_short_close_is_evidence_backed_terminal_and_fail_closed(self) -> None:
        current = output_state(
            starting_workspace(target=100),
            40,
            action_evidence("ACT-JOB-CLOSE-OUTPUT-BASE", captured_at=NOW),
        )
        close_evidence = action_evidence("ACT-JOB-CLOSE", captured_at=LATER)
        proposed = closed_job_state(current, close_evidence, shift_ref="Day A")
        accepted = apply_event(
            current,
            "production.job.closed",
            proposed,
            close_evidence,
        )

        self.assertEqual(
            accepted["jobs"][0]["closure"],
            {
                "actionId": "ACT-JOB-CLOSE",
                "closedAt": LATER,
                "closedBy": ACTOR,
                "reason": close_evidence["reason"],
                "evidenceReference": close_evidence["evidenceReference"],
                "shiftRef": "Day A",
                "remainingUnits": 60,
            },
        )
        self.assertEqual(accepted["events"][0]["remainingQuantity"], 60)
        self.assertEqual(
            accepted["events"][0]["summary"],
            "Closed Customer batch 001 short with 60 units remaining",
        )

        output_evidence = action_evidence("ACT-AFTER-CLOSE-OUTPUT", captured_at=LATEST)
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "production.output.recorded",
                output_state(accepted, 1, output_evidence),
                output_evidence,
            )

        material_evidence = action_evidence(
            "ACT-AFTER-CLOSE-MATERIAL",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "production.material.consumed",
                material_state(accepted, 1, material_evidence),
                material_evidence,
            )

        forged_hold_evidence = action_evidence(
            "ACT-AFTER-CLOSE-HOLD",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(
                held_job_state(accepted, forged_hold_evidence)
            )

        held_base = output_state(
            starting_workspace(target=100),
            10,
            action_evidence("ACT-HELD-CLOSE-OUTPUT", captured_at=NOW),
        )
        hold_evidence = action_evidence(
            "ACT-HELD-CLOSE-HOLD",
            captured_at=LATER,
        )
        held = apply_event(
            held_base,
            "production.quality_hold.placed",
            held_job_state(held_base, hold_evidence),
            hold_evidence,
        )
        held_close_evidence = action_evidence(
            "ACT-HELD-CLOSE",
            captured_at=LATEST,
        )
        held_closed = apply_event(
            held,
            "production.job.closed",
            closed_job_state(held, held_close_evidence),
            held_close_evidence,
        )
        backdated_release_evidence = action_evidence(
            "ACT-HELD-CLOSE-BACKDATED-RELEASE",
            captured_at="2026-07-24T09:20:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(
                released_job_state(held_closed, backdated_release_evidence)
            )
        release_evidence = action_evidence(
            "ACT-HELD-CLOSE-RELEASE",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        released_after_close = apply_event(
            held_closed,
            "production.quality_hold.released",
            released_job_state(held_closed, release_evidence),
            release_evidence,
        )
        self.assertNotIn("qualityHold", released_after_close["jobs"][0])
        self.assertEqual(
            released_after_close["jobs"][0]["closure"]["actionId"],
            "ACT-HELD-CLOSE",
        )

        duplicate_close = closed_job_state(
            accepted,
            action_evidence("ACT-JOB-CLOSE-SECOND", captured_at=LATEST),
            shift_ref="Day B",
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(duplicate_close)

        tampered_remaining = deepcopy(accepted)
        tampered_remaining["jobs"][0]["closure"]["remainingUnits"] = 59
        tampered_remaining["events"][0]["remainingQuantity"] = 59
        with self.assertRaises(TrialValidationError):
            validate_production_state(tampered_remaining)

        tampered_actor = deepcopy(accepted)
        tampered_actor["jobs"][0]["closure"]["closedBy"] = "forged-operator"
        with self.assertRaises(TrialValidationError):
            validate_production_state(tampered_actor)

        completed = output_state(
            starting_workspace(target=40),
            40,
            action_evidence("ACT-JOB-CLOSE-COMPLETE-BASE", captured_at=NOW),
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                completed,
                "production.job.closed",
                closed_job_state(completed, close_evidence),
                close_evidence,
            )

        prior_output_evidence = action_evidence(
            "ACT-PRIOR-OUTPUT",
            captured_at=LATER,
        )
        with_prior_output = output_state(
            starting_workspace(target=100),
            10,
            prior_output_evidence,
        )
        backdated_close_evidence = action_evidence(
            "ACT-BACKDATED-CLOSE",
            captured_at=NOW,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(
                closed_job_state(with_prior_output, backdated_close_evidence)
            )

        initial = starting_workspace()
        evidence = action_evidence("ACT-INIT-REAL")
        self.assertEqual(
            apply_event(
                {},
                "production.workspace.initialized",
                initial,
                evidence,
            ),
            initial,
        )

        unscheduled_initial = deepcopy(initial)
        unscheduled_initial["jobs"][0].pop("priority")
        unscheduled_initial["jobs"][0].pop("dueAt")
        self.assertEqual(
            validate_production_state(unscheduled_initial),
            unscheduled_initial,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                unscheduled_initial,
                evidence,
            )

        unowned_initial = deepcopy(initial)
        unowned_initial["jobs"][0].pop("owner")
        self.assertEqual(
            validate_production_state(unowned_initial),
            unowned_initial,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                unowned_initial,
                evidence,
            )

        overdue_initial = deepcopy(initial)
        overdue_initial["jobs"][0]["dueAt"] = NOW
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                overdue_initial,
                evidence,
            )

        already_initialized = starting_workspace()
        with self.assertRaises(TrialValidationError):
            apply_event(
                already_initialized,
                "production.workspace.initialized",
                initial,
                evidence,
            )

        copied_history = starting_workspace()
        copied_history["jobs"][0]["output"] = 10
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                copied_history,
                evidence,
            )

        multiple_jobs = starting_workspace()
        multiple_jobs["jobs"].append(
            {
                "id": "JOB-DEMO-002",
                "line": "Demo line",
                "product": "Demo batch",
                "target": 10,
                "output": 0,
            }
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                multiple_jobs,
                evidence,
            )

    def test_schema_payload_and_legacy_snapshot_fail_closed(self) -> None:
        initial = starting_workspace()
        evidence = action_evidence("ACT-INIT-SCHEMA")

        wrong_schema = deepcopy(initial)
        wrong_schema["schema"] = "supermega.production.workspace.v1"
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                wrong_schema,
                evidence,
            )

        extra_state = deepcopy(initial)
        extra_state["untrusted"] = True
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                extra_state,
                evidence,
            )

        bad_action = {**evidence, "actionId": " ACT-NOT-CANONICAL "}
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.workspace.initialized",
                initial,
                bad_action,
            )

        malformed_event = output_state(
            initial,
            1,
            action_evidence("ACT-MALFORMED-EVENT"),
        )
        malformed_event["events"][0]["kind"] = []
        with self.assertRaises(TrialValidationError):
            apply_event(
                initial,
                "production.output.recorded",
                malformed_event,
                action_evidence("ACT-MALFORMED-EVENT"),
            )

        with self.assertRaises(TrialValidationError):
            reduce_trial_state(
                "production",
                "production.workspace.initialized",
                {},
                {
                    "state": initial,
                    "evidence": evidence,
                    "unexpected": True,
                },
            )
        with self.assertRaises(TrialValidationError):
            apply_event(
                {},
                "production.snapshot.saved",
                initial,
                evidence,
            )

    def test_output_is_one_exact_diff_and_never_exceeds_target(self) -> None:
        current = apply_event(
            {},
            "production.workspace.initialized",
            starting_workspace(target=10),
            action_evidence("ACT-INIT-OUTPUT"),
        )
        first_evidence = action_evidence("ACT-OUTPUT-001")
        first = output_state(current, 4, first_evidence)
        accepted = apply_event(
            current,
            "production.output.recorded",
            first,
            first_evidence,
        )
        self.assertEqual(accepted["revision"], 1)
        self.assertEqual(accepted["jobs"][0]["output"], 4)
        self.assertEqual(accepted["events"][0]["shiftRef"], "2026-07-24 Day")

        missing_shift_evidence = action_evidence("ACT-OUTPUT-MISSING-SHIFT")
        missing_shift = output_state(current, 1, missing_shift_evidence)
        missing_shift["events"][0].pop("shiftRef")
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.output.recorded",
                missing_shift,
                missing_shift_evidence,
            )

        legacy_current = deepcopy(accepted)
        legacy_current["events"][0].pop("shiftRef")
        legacy_evidence = action_evidence(
            "ACT-OUTPUT-AFTER-LEGACY",
            captured_at=LATER,
        )
        after_legacy = apply_event(
            legacy_current,
            "production.output.recorded",
            output_state(legacy_current, 1, legacy_evidence),
            legacy_evidence,
        )
        self.assertNotIn("shiftRef", after_legacy["events"][1])
        self.assertEqual(after_legacy["events"][0]["shiftRef"], "2026-07-24 Day")

        for index, invalid_shift in enumerate(("", " Day", "Day ", "X" * 81)):
            invalid_evidence = action_evidence(f"ACT-OUTPUT-BAD-SHIFT-{index}")
            invalid = output_state(
                current,
                1,
                invalid_evidence,
                shift_ref=invalid_shift,
            )
            with self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "production.output.recorded",
                    invalid,
                    invalid_evidence,
                )

        exact_evidence = action_evidence(
            "ACT-OUTPUT-002",
            captured_at=LATER,
        )
        exact = output_state(accepted, 6, exact_evidence)
        at_target = apply_event(
            accepted,
            "production.output.recorded",
            exact,
            exact_evidence,
        )
        self.assertEqual(at_target["jobs"][0]["output"], 10)

        overflow_evidence = action_evidence(
            "ACT-OUTPUT-003",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                at_target,
                "production.output.recorded",
                output_state(at_target, 1, overflow_evidence),
                overflow_evidence,
            )

        unrelated = output_state(current, 1, action_evidence("ACT-OUTPUT-004"))
        unrelated["machines"][0]["name"] = "Changed outside this action"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.output.recorded",
                unrelated,
                action_evidence("ACT-OUTPUT-004"),
            )

        multi_field = output_state(current, 1, action_evidence("ACT-OUTPUT-005"))
        multi_field["jobs"][0]["line"] = "Unauthorized line change"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.output.recorded",
                multi_field,
                action_evidence("ACT-OUTPUT-005"),
            )

    def test_scrap_is_separate_attributed_and_bounded_by_the_job_target(self) -> None:
        current = apply_event(
            {},
            "production.workspace.initialized",
            starting_workspace(target=10),
            action_evidence("ACT-INIT-SCRAP"),
        )
        good_evidence = action_evidence("ACT-GOOD-BEFORE-SCRAP")
        with_good = apply_event(
            current,
            "production.output.recorded",
            output_state(current, 6, good_evidence),
            good_evidence,
        )
        scrap_evidence = action_evidence(
            "ACT-SCRAP-001",
            captured_at=LATER,
        )
        proposed = scrap_state(with_good, 3, scrap_evidence)
        accepted = apply_event(
            with_good,
            "production.output.recorded",
            proposed,
            scrap_evidence,
        )
        self.assertEqual(accepted["jobs"][0]["output"], 6)
        self.assertEqual(accepted["jobs"][0]["scrap"], 3)
        self.assertEqual(accepted["events"][0]["outputKind"], "scrap")
        self.assertEqual(accepted["events"][0]["shiftRef"], "2026-07-24 Day")
        self.assertEqual(accepted["events"][0]["actor"], ACTOR)
        self.assertEqual(
            accepted["events"][0]["evidenceReference"],
            scrap_evidence["evidenceReference"],
        )

        missing_kind = deepcopy(proposed)
        missing_kind["events"][0].pop("outputKind")
        with self.assertRaises(TrialValidationError):
            apply_event(
                with_good,
                "production.output.recorded",
                missing_kind,
                scrap_evidence,
            )

        wrong_summary = deepcopy(proposed)
        wrong_summary["events"][0]["summary"] = "Recorded mixed output"
        with self.assertRaises(TrialValidationError):
            apply_event(
                with_good,
                "production.output.recorded",
                wrong_summary,
                scrap_evidence,
            )

        overflow_scrap_evidence = action_evidence(
            "ACT-SCRAP-OVER",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "production.output.recorded",
                scrap_state(accepted, 2, overflow_scrap_evidence),
                overflow_scrap_evidence,
            )

        overflow_good_evidence = action_evidence(
            "ACT-GOOD-OVER",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                accepted,
                "production.output.recorded",
                output_state(accepted, 2, overflow_good_evidence),
                overflow_good_evidence,
            )

    def test_material_use_is_job_linked_attributed_and_event_only(self) -> None:
        current = apply_event(
            {},
            "production.workspace.initialized",
            starting_workspace(target=10),
            action_evidence("ACT-INIT-MATERIAL"),
        )
        evidence = action_evidence("ACT-MATERIAL-001", captured_at=LATER)
        proposed = material_state(current, 1.25, evidence)
        accepted = apply_event(
            current,
            "production.material.consumed",
            proposed,
            evidence,
        )
        event = accepted["events"][0]
        self.assertEqual(accepted["jobs"], current["jobs"])
        self.assertEqual(accepted["issues"], current["issues"])
        self.assertEqual(accepted["machines"], current["machines"])
        self.assertEqual(accepted["revision"], current["revision"] + 1)
        self.assertEqual(event["kind"], "material_consumed")
        self.assertEqual(event["subjectId"], current["jobs"][0]["id"])
        self.assertEqual(event["materialRef"], "RM-RESIN-01")
        self.assertEqual(event["materialLot"], "LOT-24")
        self.assertEqual(event["materialUnit"], "kg")
        self.assertEqual(event["quantity"], 1.25)
        self.assertEqual(event["shiftRef"], "2026-07-24 Day")
        self.assertEqual(event["actor"], ACTOR)
        self.assertEqual(event["evidenceReference"], evidence["evidenceReference"])

        held_evidence = action_evidence("ACT-HOLD-BEFORE-MATERIAL")
        held = apply_event(
            current,
            "production.quality_hold.placed",
            held_job_state(current, held_evidence),
            held_evidence,
        )
        held_material_evidence = action_evidence(
            "ACT-MATERIAL-HELD",
            captured_at=LATER,
        )
        held_material = apply_event(
            held,
            "production.material.consumed",
            material_state(
                held,
                0.5,
                held_material_evidence,
                material_lot=None,
                material_unit="bag",
            ),
            held_material_evidence,
        )
        self.assertIn("qualityHold", held_material["jobs"][0])
        self.assertNotIn("materialLot", held_material["events"][0])

        for name, patch in (
            ("zero quantity", {"quantity": 0}),
            ("too precise quantity", {"quantity": 1.2345}),
            ("unsafe scaled quantity", {"quantity": 9_007_199_254_740_991}),
            ("unsupported unit", {"materialUnit": "tonne"}),
            ("noncanonical material", {"materialRef": " RM-01 "}),
            ("empty lot", {"materialLot": ""}),
            ("noncanonical lot", {"materialLot": " LOT-01 "}),
            ("noncanonical shift", {"shiftRef": " Day "}),
            ("unrelated output kind", {"outputKind": "good"}),
        ):
            with self.subTest(name=name):
                invalid = deepcopy(proposed)
                invalid["events"][0].update(patch)
                with self.assertRaises(TrialValidationError):
                    apply_event(
                        current,
                        "production.material.consumed",
                        invalid,
                        evidence,
                    )

        wrong_summary = deepcopy(proposed)
        wrong_summary["events"][0]["summary"] = "Material recorded"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.material.consumed",
                wrong_summary,
                evidence,
            )

        unrelated = deepcopy(proposed)
        unrelated["jobs"][0]["line"] = "Changed outside material use"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.material.consumed",
                unrelated,
                evidence,
            )

        completed_evidence = action_evidence(
            "ACT-COMPLETE-BEFORE-MATERIAL",
            captured_at=LATER,
        )
        completed = apply_event(
            current,
            "production.output.recorded",
            output_state(current, 10, completed_evidence),
            completed_evidence,
        )
        late_material_evidence = action_evidence(
            "ACT-MATERIAL-AFTER-COMPLETE",
            captured_at=LATEST,
        )
        late_material_state = material_state(
            completed,
            1,
            late_material_evidence,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(late_material_state)
        with self.assertRaises(TrialValidationError):
            apply_event(
                completed,
                "production.material.consumed",
                late_material_state,
                late_material_evidence,
            )

        for invalid_timestamp in (
            "2026-02-30T09:30:00.000Z",
            "20260724T093000+0630",
            "٢٠٢٦-07-24T09:30:00.000Z",
        ):
            with self.subTest(invalid_timestamp=invalid_timestamp):
                invalid_evidence = action_evidence(
                    f"ACT-MATERIAL-TIME-{invalid_timestamp}",
                    captured_at=invalid_timestamp,
                )
                with self.assertRaises(TrialValidationError):
                    validate_production_state(
                        material_state(current, 1, invalid_evidence)
                    )

        creation_evidence = action_evidence(
            "ACT-MATERIAL-PRECISE-CREATE",
            captured_at="2026-07-24T09:00:00.000002Z",
        )
        created = deepcopy(current)
        precise_job = {
            "id": "JOB-PRECISE",
            "line": "Precision line",
            "product": "Precision batch",
            "target": 10,
            "output": 0,
            "owner": "Precision lead",
            "priority": "urgent",
            "dueAt": "2026-07-25T09:00:00.000Z",
        }
        created["revision"] = 1
        created["jobs"] = [precise_job, *created["jobs"]]
        created["events"] = [
            production_event(
                creation_evidence,
                kind="job_created",
                subject_id=precise_job["id"],
                summary="Created Precision batch job for Precision line",
                jobPriority=precise_job["priority"],
                jobDueAt=precise_job["dueAt"],
                jobOwner=precise_job["owner"],
            )
        ]
        accepted_creation = apply_event(
            current,
            "production.job.created",
            created,
            creation_evidence,
        )
        early_material_evidence = action_evidence(
            "ACT-MATERIAL-PRECISE-EARLY",
            captured_at="2026-07-24T09:00:00.000001Z",
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(
                material_state(
                    accepted_creation,
                    1,
                    early_material_evidence,
                )
            )

        collision_quantity = 5_000_000_000_000
        collision_first_evidence = action_evidence(
            "ACT-MATERIAL-COLLISION-FIRST",
            captured_at=LATER,
        )
        collision_first = apply_event(
            current,
            "production.material.consumed",
            material_state(
                current,
                collision_quantity,
                collision_first_evidence,
                material_ref="B\u0000C",
                shift_ref="A",
            ),
            collision_first_evidence,
        )
        collision_second_evidence = action_evidence(
            "ACT-MATERIAL-COLLISION-SECOND",
            captured_at=LATEST,
        )
        collision_second = apply_event(
            collision_first,
            "production.material.consumed",
            material_state(
                collision_first,
                collision_quantity,
                collision_second_evidence,
                material_ref="C",
                shift_ref="A\u0000B",
            ),
            collision_second_evidence,
        )
        self.assertEqual(collision_second["revision"], 2)

    def test_quality_hold_and_release_are_distinct_evidence_backed_events(self) -> None:
        current = starting_workspace()
        hold_evidence = action_evidence("ACT-QUALITY-HOLD")
        held = apply_event(
            current,
            "production.quality_hold.placed",
            held_job_state(current, hold_evidence),
            hold_evidence,
        )
        quality_hold = held["jobs"][0]["qualityHold"]
        self.assertEqual(quality_hold["heldBy"], ACTOR)
        self.assertEqual(
            quality_hold["evidenceReference"],
            hold_evidence["evidenceReference"],
        )
        self.assertEqual(held["jobs"][0]["output"], current["jobs"][0]["output"])
        self.assertEqual(held["events"][0]["kind"], "quality_hold_placed")

        second_hold_evidence = action_evidence(
            "ACT-QUALITY-HOLD-AGAIN",
            captured_at=LATER,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                held,
                "production.quality_hold.placed",
                held_job_state(held, second_hold_evidence),
                second_hold_evidence,
            )

        detached_hold = held_job_state(current, hold_evidence)
        detached_hold["jobs"][0]["qualityHold"]["reason"] = "Changed reason"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.quality_hold.placed",
                detached_hold,
                hold_evidence,
            )

        unrelated_hold = held_job_state(current, hold_evidence)
        unrelated_hold["jobs"][0]["output"] = 1
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.quality_hold.placed",
                unrelated_hold,
                hold_evidence,
            )

        release_evidence = action_evidence(
            "ACT-QUALITY-RELEASE",
            captured_at=LATER,
        )
        released = apply_event(
            held,
            "production.quality_hold.released",
            released_job_state(held, release_evidence),
            release_evidence,
        )
        self.assertNotIn("qualityHold", released["jobs"][0])
        self.assertEqual(released["jobs"][0]["output"], current["jobs"][0]["output"])
        self.assertEqual(released["events"][0]["kind"], "quality_hold_released")
        self.assertEqual(
            released["events"][0]["evidenceReference"],
            release_evidence["evidenceReference"],
        )
        contradictory_release_time = deepcopy(released)
        contradictory_release_time["events"][0]["createdAt"] = (
            "2026-07-24T08:59:00.000Z"
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(contradictory_release_time)

        repeated_release = deepcopy(released)
        repeated_release["revision"] += 1
        repeated_release["events"] = [
            production_event(
                action_evidence(
                    "ACT-QUALITY-RELEASE-AGAIN",
                    captured_at=LATEST,
                ),
                kind="quality_hold_released",
                subject_id=released["jobs"][0]["id"],
                summary=(
                    f"Released {released['jobs'][0]['product']} from quality hold"
                ),
            ),
            *repeated_release["events"],
        ]
        with self.assertRaises(TrialValidationError):
            apply_event(
                released,
                "production.quality_hold.released",
                repeated_release,
                action_evidence(
                    "ACT-QUALITY-RELEASE-AGAIN",
                    captured_at=LATEST,
                ),
            )

        rehold_evidence = action_evidence(
            "ACT-QUALITY-REHOLD",
            captured_at=LATEST,
        )
        reheld = apply_event(
            released,
            "production.quality_hold.placed",
            held_job_state(released, rehold_evidence),
            rehold_evidence,
        )
        self.assertEqual(
            reheld["jobs"][0]["qualityHold"]["actionId"],
            rehold_evidence["actionId"],
        )
        self.assertEqual(
            [event["kind"] for event in reheld["events"][:3]],
            [
                "quality_hold_placed",
                "quality_hold_released",
                "quality_hold_placed",
            ],
        )

    def test_daily_job_creation_is_exact_unique_and_zero_output(self) -> None:
        current = starting_workspace()
        evidence = action_evidence("ACT-JOB-CREATE")
        created = deepcopy(current)
        job = {
            "id": "JOB-REAL-002",
            "line": "Assembly team",
            "product": "Customer batch 002",
            "target": 75,
            "output": 0,
            "owner": "Assembly lead",
            "priority": "urgent",
            "dueAt": "2026-07-25T09:00:00.000Z",
        }
        created["revision"] = 1
        created["jobs"] = [job, *created["jobs"]]
        created["events"] = [
            production_event(
                evidence,
                kind="job_created",
                subject_id=job["id"],
                summary="Created Customer batch 002 job for Assembly team",
                jobPriority=job["priority"],
                jobDueAt=job["dueAt"],
                jobOwner=job["owner"],
            )
        ]
        accepted = apply_event(
            current,
            "production.job.created",
            created,
            evidence,
        )
        self.assertEqual(accepted["jobs"][0], job)
        self.assertEqual(accepted["jobs"][1:], current["jobs"])
        self.assertEqual(accepted["issues"], current["issues"])
        self.assertEqual(accepted["machines"], current["machines"])
        self.assertEqual(accepted["events"][0]["jobPriority"], "urgent")
        self.assertEqual(
            accepted["events"][0]["jobDueAt"],
            "2026-07-25T09:00:00.000Z",
        )
        self.assertEqual(accepted["events"][0]["jobOwner"], "Assembly lead")

        unowned = deepcopy(created)
        unowned["jobs"][0].pop("owner")
        unowned["events"][0].pop("jobOwner")
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                unowned,
                evidence,
            )

        forged_owner = deepcopy(created)
        forged_owner["events"][0]["jobOwner"] = "Different lead"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                forged_owner,
                evidence,
            )

        unscheduled = deepcopy(created)
        unscheduled["jobs"][0].pop("priority")
        unscheduled["jobs"][0].pop("dueAt")
        unscheduled["events"][0].pop("jobPriority")
        unscheduled["events"][0].pop("jobDueAt")
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                unscheduled,
                evidence,
            )

        rewritten_priority = deepcopy(created)
        rewritten_priority["events"][0]["jobPriority"] = "low"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                rewritten_priority,
                evidence,
            )

        rewritten_due_at = deepcopy(created)
        rewritten_due_at["jobs"][0]["dueAt"] = "2026-07-26T09:00:00.000Z"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                rewritten_due_at,
                evidence,
            )

        overdue = deepcopy(created)
        overdue["jobs"][0]["dueAt"] = NOW
        overdue["events"][0]["jobDueAt"] = NOW
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                overdue,
                evidence,
            )

        duplicate = deepcopy(created)
        duplicate["jobs"][0]["id"] = current["jobs"][0]["id"]
        duplicate["events"][0]["subjectId"] = current["jobs"][0]["id"]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                duplicate,
                evidence,
            )

        conflicting = deepcopy(created)
        conflicting["jobs"] = [
            {**current["jobs"][0], "target": 200},
            *current["jobs"],
        ]
        conflicting["events"][0]["subjectId"] = current["jobs"][0]["id"]
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                conflicting,
                evidence,
            )

        nonzero = deepcopy(created)
        nonzero["jobs"][0]["output"] = 1
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                nonzero,
                evidence,
            )

        predeclared_scrap = deepcopy(created)
        predeclared_scrap["jobs"][0]["scrap"] = 0
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                predeclared_scrap,
                evidence,
            )

        predeclared_hold = deepcopy(created)
        predeclared_hold["jobs"][0]["qualityHold"] = {
            "actionId": "ACT-PREDECLARED-HOLD",
            "heldAt": NOW,
            "heldBy": ACTOR,
            "reason": "Not allowed on creation.",
            "evidenceReference": "evidence://production/predeclared",
        }
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                predeclared_hold,
                evidence,
            )

        invalid_target = deepcopy(created)
        invalid_target["jobs"][0]["target"] = 0
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.job.created",
                invalid_target,
                evidence,
            )

    def test_revision_evidence_and_prior_event_history_are_immutable(self) -> None:
        current = starting_workspace()
        first_evidence = action_evidence("ACT-HISTORY-001")
        first = apply_event(
            current,
            "production.output.recorded",
            output_state(current, 1, first_evidence),
            first_evidence,
        )

        wrong_revision_evidence = action_evidence(
            "ACT-HISTORY-002",
            captured_at=LATER,
        )
        wrong_revision = output_state(first, 1, wrong_revision_evidence)
        wrong_revision["revision"] = 9
        with self.assertRaises(TrialValidationError):
            apply_event(
                first,
                "production.output.recorded",
                wrong_revision,
                wrong_revision_evidence,
            )

        mismatched_evidence = action_evidence(
            "ACT-HISTORY-003",
            captured_at=LATER,
        )
        candidate = output_state(first, 1, mismatched_evidence)
        with self.assertRaises(TrialValidationError):
            apply_event(
                first,
                "production.output.recorded",
                candidate,
                {**mismatched_evidence, "reason": "Different command reason."},
            )

        second = apply_event(
            first,
            "production.output.recorded",
            candidate,
            mismatched_evidence,
        )
        third_evidence = action_evidence(
            "ACT-HISTORY-004",
            captured_at=LATEST,
        )
        replaced_history = output_state(second, 1, third_evidence)
        replaced_history["events"][2]["reason"] = "Rewritten prior history."
        with self.assertRaises(TrialValidationError):
            apply_event(
                second,
                "production.output.recorded",
                replaced_history,
                third_evidence,
            )

    def test_issue_lifecycle_is_attributed_and_fail_closed(self) -> None:
        current = starting_workspace()
        open_evidence = action_evidence("ACT-ISSUE-OPEN")
        opened = apply_event(
            current,
            "production.issue.opened",
            opened_issue_state(current, open_evidence),
            open_evidence,
        )
        self.assertEqual(opened["issues"][0]["status"], "open")

        second_evidence = action_evidence(
            "ACT-ISSUE-OPEN-002",
            captured_at=LATER,
        )
        two_open = apply_event(
            opened,
            "production.issue.opened",
            opened_issue_state(
                opened,
                second_evidence,
                issue_id="ISSUE-REAL-002",
            ),
            second_evidence,
        )
        resolve_evidence = action_evidence(
            "ACT-ISSUE-RESOLVE",
            captured_at=LATEST,
        )
        resolved = apply_event(
            two_open,
            "production.issue.resolved",
            resolved_issue_state(two_open, resolve_evidence),
            resolve_evidence,
        )
        self.assertEqual(resolved["issues"][0]["id"], "ISSUE-REAL-002")
        self.assertEqual(resolved["issues"][0]["status"], "open")
        self.assertEqual(resolved["issues"][1]["status"], "resolved")
        self.assertEqual(
            resolved["issues"][1]["resolution"]["resolvedBy"],
            ACTOR,
        )
        first_capa = resolved["issues"][1]["resolution"]["qualityCorrectiveAction"]
        self.assertEqual(first_capa["contract"], "supermega.production.quality-capa.v1")
        self.assertEqual(first_capa["priorIssueIds"], [])

        myanmar_capa = quality_corrective_action(
            two_open,
            issue_id="ISSUE-REAL-001",
            failure_mode="အပူချိန် လွဲ",
        )
        self.assertEqual(
            myanmar_capa["recurrenceKey"],
            "machine:အပူချိန်-လွဲ",
        )
        myanmar_state = resolved_issue_state(two_open, resolve_evidence)
        myanmar_state["issues"][1]["resolution"]["qualityCorrectiveAction"] = deepcopy(
            myanmar_capa
        )
        myanmar_state["events"][0]["qualityCorrectiveAction"] = deepcopy(
            myanmar_capa
        )
        self.assertEqual(validate_production_state(myanmar_state), myanmar_state)

        repeat_open_evidence = action_evidence(
            "ACT-ISSUE-OPEN-003",
            captured_at="2026-07-24T09:40:00.000Z",
        )
        repeat_open = apply_event(
            resolved,
            "production.issue.opened",
            opened_issue_state(
                resolved,
                repeat_open_evidence,
                issue_id="ISSUE-REAL-003",
            ),
            repeat_open_evidence,
        )
        repeat_resolve_evidence = action_evidence(
            "ACT-ISSUE-RESOLVE-003",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        recurring = apply_event(
            repeat_open,
            "production.issue.resolved",
            resolved_issue_state(
                repeat_open,
                repeat_resolve_evidence,
                issue_id="ISSUE-REAL-003",
            ),
            repeat_resolve_evidence,
        )
        repeat_capa = recurring["issues"][0]["resolution"]["qualityCorrectiveAction"]
        self.assertEqual(repeat_capa["priorIssueIds"], ["ISSUE-REAL-001"])

        missing_capa = resolved_issue_state(two_open, resolve_evidence)
        missing_capa["issues"][1]["resolution"].pop("qualityCorrectiveAction")
        missing_capa["events"][0].pop("qualityCorrectiveAction")
        with self.assertRaisesRegex(
            TrialValidationError,
            "requires structured CAPA evidence",
        ):
            validate_production_state(missing_capa)
        with self.assertRaisesRegex(
            TrialValidationError,
            "requires structured CAPA evidence",
        ):
            apply_event(
                two_open,
                "production.issue.resolved",
                missing_capa,
                resolve_evidence,
            )

        forged_recurrence = resolved_issue_state(
            repeat_open,
            repeat_resolve_evidence,
            issue_id="ISSUE-REAL-003",
        )
        forged_recurrence["issues"][0]["resolution"]["qualityCorrectiveAction"]["priorIssueIds"] = []
        forged_recurrence["events"][0]["qualityCorrectiveAction"]["priorIssueIds"] = []
        with self.assertRaisesRegex(
            TrialValidationError,
            "recurrence links",
        ):
            apply_event(
                repeat_open,
                "production.issue.resolved",
                forged_recurrence,
                repeat_resolve_evidence,
            )

        repeat_evidence = action_evidence(
            "ACT-ISSUE-RESOLVE-AGAIN",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                resolved,
                "production.issue.resolved",
                resolved_issue_state(
                    resolved,
                    repeat_evidence,
                ),
                repeat_evidence,
            )

        forged = starting_workspace()
        forged_issue = opened_issue_state(
            forged,
            action_evidence("ACT-FORGED-OPEN"),
        )
        forged_issue["events"] = []
        forged_issue["revision"] = 0
        with self.assertRaises(TrialValidationError):
            apply_event(
                forged,
                "production.issue.opened",
                forged_issue,
                action_evidence("ACT-FORGED-OPEN"),
            )

        unrelated = resolved_issue_state(opened, resolve_evidence)
        unrelated["jobs"][0]["product"] = "Unauthorized product change"
        with self.assertRaises(TrialValidationError):
            apply_event(
                opened,
                "production.issue.resolved",
                unrelated,
                resolve_evidence,
            )

    def test_quality_capa_effectiveness_review_is_due_dated_and_recurrence_aware(self) -> None:
        current = starting_workspace()
        open_evidence = action_evidence("ACT-CAPA-V2-OPEN")
        opened = apply_event(
            current,
            "production.issue.opened",
            opened_issue_state(current, open_evidence),
            open_evidence,
        )
        resolve_evidence = action_evidence(
            "ACT-CAPA-V2-RESOLVE",
            captured_at="2026-07-24T09:30:00.000Z",
        )
        quality_action = quality_corrective_action_v2(
            opened,
            issue_id="ISSUE-REAL-001",
            effectiveness_review_due_at="2026-07-24T09:35:00.000Z",
        )
        resolved = apply_event(
            opened,
            "production.issue.resolved",
            resolved_issue_state_with_quality_action(
                opened,
                resolve_evidence,
                quality_action,
            ),
            resolve_evidence,
        )
        self.assertEqual(
            resolved["issues"][0]["resolution"]["qualityCorrectiveAction"]["contract"],
            "supermega.production.quality-capa.v2",
        )
        resolved_before_trend = deepcopy(resolved)
        pre_due_trend = project_production_quality_capa_trend(
            resolved,
            "2026-07-24T09:34:59.999999Z",
        )
        self.assertEqual(pre_due_trend["contract"], "supermega.production.quality-capa-trend.v1")
        self.assertEqual(pre_due_trend["groups"][0]["status"], "monitor")
        self.assertEqual(pre_due_trend["groups"][0]["pendingReviewCount"], 1)
        self.assertEqual(pre_due_trend["groups"][0]["dueReviewCount"], 0)
        self.assertEqual(pre_due_trend["totals"]["classifiedCapaCount"], 1)
        self.assertEqual(resolved, resolved_before_trend)
        due_trend = project_production_quality_capa_trend(
            resolved,
            "2026-07-24T09:35:00.000Z",
        )
        self.assertEqual(due_trend["groups"][0]["status"], "review_due")
        self.assertEqual(due_trend["groups"][0]["dueReviewCount"], 1)
        self.assertEqual(
            due_trend["groups"][0]["nextReviewDueAt"],
            "2026-07-24T09:35:00.000Z",
        )
        with self.assertRaisesRegex(TrialValidationError, "canonical ISO-8601"):
            project_production_quality_capa_trend(resolved, "not-a-time")

        early_evidence = action_evidence(
            "ACT-CAPA-V2-EARLY",
            captured_at="2026-07-24T09:34:00.000Z",
        )
        with self.assertRaisesRegex(TrialValidationError, "predate its due time"):
            apply_event(
                resolved,
                "production.quality_effectiveness.reviewed",
                quality_effectiveness_reviewed_state(
                    resolved,
                    early_evidence,
                    issue_id="ISSUE-REAL-001",
                    outcome="effective",
                ),
                early_evidence,
            )

        review_evidence = action_evidence(
            "ACT-CAPA-V2-REVIEW",
            captured_at="2026-07-24T09:40:00.000Z",
        )
        reviewed = apply_event(
            resolved,
            "production.quality_effectiveness.reviewed",
            quality_effectiveness_reviewed_state(
                resolved,
                review_evidence,
                issue_id="ISSUE-REAL-001",
                outcome="effective",
            ),
            review_evidence,
        )
        review = reviewed["issues"][0]["resolution"]["qualityEffectivenessReview"]
        self.assertEqual(review["outcome"], "effective")
        self.assertEqual(review["recurrenceIssueIds"], [])
        self.assertEqual(review["escalation"], "none")
        self.assertEqual(reviewed["events"][0]["kind"], "quality_effectiveness_reviewed")

        second_review_evidence = action_evidence(
            "ACT-CAPA-V2-REVIEW-AGAIN",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        with self.assertRaisesRegex(TrialValidationError, "exactly one event"):
            apply_event(
                reviewed,
                "production.quality_effectiveness.reviewed",
                quality_effectiveness_reviewed_state(
                    reviewed,
                    second_review_evidence,
                    issue_id="ISSUE-REAL-001",
                    outcome="effective",
                ),
                second_review_evidence,
            )

        repeat_open_evidence = action_evidence(
            "ACT-CAPA-V2-REPEAT-OPEN",
            captured_at="2026-07-24T09:36:00.000Z",
        )
        repeat_open = apply_event(
            resolved,
            "production.issue.opened",
            opened_issue_state(
                resolved,
                repeat_open_evidence,
                issue_id="ISSUE-REAL-002",
            ),
            repeat_open_evidence,
        )
        repeat_resolve_evidence = action_evidence(
            "ACT-CAPA-V2-REPEAT-RESOLVE",
            captured_at="2026-07-24T09:38:00.000Z",
        )
        repeat_action = quality_corrective_action_v2(
            repeat_open,
            issue_id="ISSUE-REAL-002",
            effectiveness_review_due_at="2026-07-24T10:00:00.000Z",
        )
        recurring = apply_event(
            repeat_open,
            "production.issue.resolved",
            resolved_issue_state_with_quality_action(
                repeat_open,
                repeat_resolve_evidence,
                repeat_action,
                issue_id="ISSUE-REAL-002",
            ),
            repeat_resolve_evidence,
        )
        recurring_trend = project_production_quality_capa_trend(
            recurring,
            "2026-07-24T09:40:00.000Z",
        )
        recurring_group = recurring_trend["groups"][0]
        self.assertEqual(recurring_group["status"], "escalate")
        self.assertEqual(recurring_group["occurrenceCount"], 2)
        self.assertEqual(recurring_group["issueIds"], ["ISSUE-REAL-001", "ISSUE-REAL-002"])
        self.assertEqual(recurring_group["pendingReviewCount"], 2)
        self.assertEqual(recurring_group["dueReviewCount"], 1)
        self.assertEqual(recurring_group["controlReasons"], ["classified_recurrence"])
        self.assertEqual(recurring_trend["totals"]["recurrenceGroupCount"], 1)
        self.assertEqual(recurring_trend["totals"]["escalationGroupCount"], 1)
        recurring_review_evidence = action_evidence(
            "ACT-CAPA-V2-RECURRING-REVIEW",
            captured_at="2026-07-24T09:40:00.000Z",
        )
        effective_candidate = quality_effectiveness_reviewed_state(
            recurring,
            recurring_review_evidence,
            issue_id="ISSUE-REAL-001",
            outcome="effective",
        )
        with self.assertRaisesRegex(TrialValidationError, "effective outcome"):
            apply_event(
                recurring,
                "production.quality_effectiveness.reviewed",
                effective_candidate,
                recurring_review_evidence,
            )

        ineffective_candidate = quality_effectiveness_reviewed_state(
            recurring,
            recurring_review_evidence,
            issue_id="ISSUE-REAL-001",
            outcome="ineffective",
        )
        escalated = apply_event(
            recurring,
            "production.quality_effectiveness.reviewed",
            ineffective_candidate,
            recurring_review_evidence,
        )
        original = next(issue for issue in escalated["issues"] if issue["id"] == "ISSUE-REAL-001")
        recurring_review = original["resolution"]["qualityEffectivenessReview"]
        self.assertEqual(recurring_review["recurrenceIssueIds"], ["ISSUE-REAL-002"])
        self.assertEqual(recurring_review["outcome"], "ineffective")
        self.assertEqual(recurring_review["escalation"], "required")
        ineffective_trend = project_production_quality_capa_trend(
            escalated,
            "2026-07-24T09:40:00.000Z",
        )
        self.assertEqual(ineffective_trend["groups"][0]["status"], "escalate")
        self.assertEqual(ineffective_trend["groups"][0]["ineffectiveReviewCount"], 1)
        self.assertEqual(ineffective_trend["groups"][0]["pendingReviewCount"], 1)
        self.assertEqual(ineffective_trend["groups"][0]["dueReviewCount"], 0)
        self.assertEqual(
            ineffective_trend["groups"][0]["controlReasons"],
            ["classified_recurrence", "ineffective_review"],
        )

        forged = deepcopy(escalated)
        forged_review = next(
            issue for issue in forged["issues"] if issue["id"] == "ISSUE-REAL-001"
        )["resolution"]["qualityEffectivenessReview"]
        forged_review["recurrenceIssueIds"] = []
        forged["events"][0]["qualityEffectivenessReview"]["recurrenceIssueIds"] = []
        with self.assertRaisesRegex(TrialValidationError, "recurrence evidence"):
            validate_production_state(forged)

        legacy_current = starting_workspace()
        legacy_open_evidence = action_evidence("ACT-CAPA-TREND-LEGACY-OPEN")
        legacy_opened = apply_event(
            legacy_current,
            "production.issue.opened",
            opened_issue_state(legacy_current, legacy_open_evidence),
            legacy_open_evidence,
        )
        legacy_resolve_evidence = action_evidence(
            "ACT-CAPA-TREND-LEGACY-RESOLVE",
            captured_at="2026-07-24T09:30:00.000Z",
        )
        legacy_resolved = apply_event(
            legacy_opened,
            "production.issue.resolved",
            resolved_issue_state(legacy_opened, legacy_resolve_evidence),
            legacy_resolve_evidence,
        )
        legacy_trend = project_production_quality_capa_trend(
            legacy_resolved,
            "2026-07-24T09:40:00.000Z",
        )
        self.assertEqual(legacy_trend["groups"][0]["status"], "evidence_gap")
        self.assertEqual(legacy_trend["groups"][0]["legacyCapaCount"], 1)
        self.assertEqual(legacy_trend["totals"]["evidenceGapCount"], 1)

        unclassified_current = starting_workspace()
        unclassified_open_evidence = action_evidence("ACT-CAPA-TREND-UNCLASSIFIED-OPEN")
        unclassified_opened = validate_production_state(
            opened_issue_state(
                unclassified_current,
                unclassified_open_evidence,
                actionable=False,
            )
        )
        unclassified_resolve_evidence = action_evidence(
            "ACT-CAPA-TREND-UNCLASSIFIED-RESOLVE",
            captured_at="2026-07-24T09:30:00.000Z",
        )
        unclassified_resolved = apply_event(
            unclassified_opened,
            "production.issue.resolved",
            resolved_issue_state(unclassified_opened, unclassified_resolve_evidence),
            unclassified_resolve_evidence,
        )
        unclassified_trend = project_production_quality_capa_trend(
            unclassified_resolved,
            "2026-07-24T09:40:00.000Z",
        )
        self.assertEqual(unclassified_trend["groups"], [])
        self.assertEqual(unclassified_trend["unclassifiedIssueIds"], ["ISSUE-REAL-001"])
        self.assertEqual(unclassified_trend["totals"]["evidenceGapCount"], 1)

    def test_new_issue_requires_actionable_ownership_and_due_time(self) -> None:
        current = starting_workspace()
        evidence = action_evidence("ACT-ISSUE-ACTIONABLE")
        proposed = opened_issue_state(current, evidence)
        accepted = apply_event(
            current,
            "production.issue.opened",
            proposed,
            evidence,
        )
        issue = accepted["issues"][0]
        self.assertEqual(issue["severity"], "high")
        self.assertEqual(issue["owner"], "Shift supervisor")
        self.assertEqual(issue["dueAt"], "2026-07-24T13:00:00.000Z")
        self.assertEqual(
            issue["containment"],
            "Hold the affected batch and verify the next sample.",
        )
        self.assertEqual(accepted["events"][0]["issueSeverity"], issue["severity"])
        self.assertEqual(accepted["events"][0]["issueOwner"], issue["owner"])
        self.assertEqual(accepted["events"][0]["issueDueAt"], issue["dueAt"])
        self.assertEqual(
            accepted["events"][0]["issueContainment"],
            issue["containment"],
        )

        for field in ("severity", "owner", "dueAt", "containment"):
            missing = deepcopy(proposed)
            missing["issues"][0].pop(field)
            with self.subTest(missing=field), self.assertRaises(
                TrialValidationError
            ):
                apply_event(
                    current,
                    "production.issue.opened",
                    missing,
                    evidence,
                )

        for field, value in (
            ("severity", "urgent"),
            ("owner", " Shift supervisor"),
            ("dueAt", evidence["capturedAt"]),
            ("containment", ""),
        ):
            invalid = deepcopy(proposed)
            invalid["issues"][0][field] = value
            with self.subTest(invalid=field), self.assertRaises(
                TrialValidationError
            ):
                apply_event(
                    current,
                    "production.issue.opened",
                    invalid,
                    evidence,
                )

        incomplete_snapshot = deepcopy(proposed)
        incomplete_snapshot["events"][0].pop("issueOwner")
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.issue.opened",
                incomplete_snapshot,
                evidence,
            )

        mismatched_snapshot = deepcopy(proposed)
        mismatched_snapshot["events"][0]["issueOwner"] = "Different owner"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.issue.opened",
                mismatched_snapshot,
                evidence,
            )

        delayed_evidence = action_evidence(
            "ACT-ISSUE-DELAYED",
            captured_at=LATER,
        )
        expired_at_confirmation = opened_issue_state(
            current,
            delayed_evidence,
        )
        expired_at_confirmation["issues"][0]["createdAt"] = NOW
        expired_at_confirmation["issues"][0]["dueAt"] = "2026-07-24T09:10:00.000Z"
        expired_at_confirmation["events"][0]["issueDueAt"] = (
            "2026-07-24T09:10:00.000Z"
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.issue.opened",
                expired_at_confirmation,
                delayed_evidence,
            )

        legacy = opened_issue_state(
            current,
            action_evidence("ACT-ISSUE-LEGACY"),
            actionable=False,
        )
        legacy_resolution = action_evidence(
            "ACT-ISSUE-LEGACY-RESOLVE",
            captured_at=LATER,
        )
        resolved_legacy = apply_event(
            legacy,
            "production.issue.resolved",
            resolved_issue_state(legacy, legacy_resolution),
            legacy_resolution,
        )
        self.assertNotIn("severity", resolved_legacy["issues"][0])
        self.assertEqual(resolved_legacy["issues"][0]["status"], "resolved")
        self.assertEqual(
            resolved_legacy["issues"][0]["resolution"]["resolvedBy"],
            ACTOR,
        )

    def test_machine_state_accepts_truthful_distinct_observations(self) -> None:
        current = starting_workspace()
        observed_states = [
            "attention",
            "stopped",
            "attention",
            "running",
            "stopped",
            "running",
        ]
        for index, observed_state in enumerate(observed_states, start=1):
            evidence = action_evidence(
                f"ACT-MACHINE-{index:03d}",
                captured_at=NOW,
            )
            next_state = machine_state(current, evidence, observed_state)
            current = apply_event(
                current,
                "production.machine_state.changed",
                next_state,
                evidence,
            )
            self.assertEqual(current["machines"][0]["state"], observed_state)
            self.assertEqual(current["revision"], index)

        same_evidence = action_evidence("ACT-MACHINE-SAME")
        with self.assertRaises(TrialValidationError):
            apply_event(
                starting_workspace(),
                "production.machine_state.changed",
                machine_state(starting_workspace(), same_evidence, "running"),
                same_evidence,
            )

        stale_evidence = action_evidence("ACT-MACHINE-STALE")
        stale = machine_state(starting_workspace(), stale_evidence, "stopped")
        stale["events"][0]["fromState"] = "attention"
        with self.assertRaises(TrialValidationError):
            apply_event(
                starting_workspace(),
                "production.machine_state.changed",
                stale,
                stale_evidence,
            )

        unknown_state_evidence = action_evidence("ACT-MACHINE-UNKNOWN-STATE")
        with self.assertRaises(TrialValidationError):
            apply_event(
                starting_workspace(),
                "production.machine_state.changed",
                machine_state(
                    starting_workspace(),
                    unknown_state_evidence,
                    "offline",
                ),
                unknown_state_evidence,
            )

        unknown_machine_evidence = action_evidence("ACT-MACHINE-UNKNOWN-ID")
        unknown_machine = machine_state(
            starting_workspace(),
            unknown_machine_evidence,
            "attention",
        )
        unknown_machine["events"][0]["subjectId"] = "MACHINE-UNKNOWN"
        with self.assertRaises(TrialValidationError):
            apply_event(
                starting_workspace(),
                "production.machine_state.changed",
                unknown_machine,
                unknown_machine_evidence,
            )

        unrelated_evidence = action_evidence("ACT-MACHINE-UNRELATED")
        unrelated = machine_state(
            starting_workspace(),
            unrelated_evidence,
            "stopped",
        )
        unrelated["jobs"][0]["line"] = "Unauthorized line change"
        with self.assertRaises(TrialValidationError):
            apply_event(
                starting_workspace(),
                "production.machine_state.changed",
                unrelated,
                unrelated_evidence,
            )

    def test_downtime_interval_is_attributed_distinct_and_fail_closed(self) -> None:
        current = starting_workspace()
        original_collections = deepcopy(
            {
                "jobs": current["jobs"],
                "issues": current["issues"],
                "machines": current["machines"],
            }
        )
        start_evidence = action_evidence("ACT-DOWNTIME-START")
        started = apply_event(
            current,
            "production.downtime.started",
            started_downtime_state(current, start_evidence),
            start_evidence,
        )
        self.assertEqual(
            {
                "jobs": started["jobs"],
                "issues": started["issues"],
                "machines": started["machines"],
            },
            original_collections,
        )
        self.assertEqual(started["events"][0]["kind"], "downtime_started")
        self.assertEqual(started["events"][0]["actor"], ACTOR)
        self.assertEqual(
            started["events"][0]["evidenceReference"],
            start_evidence["evidenceReference"],
        )

        duplicate_evidence = action_evidence(
            "ACT-DOWNTIME-DUPLICATE",
            captured_at=LATER,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                started,
                "production.downtime.started",
                started_downtime_state(started, duplicate_evidence),
                duplicate_evidence,
            )

        unknown_machine = started_downtime_state(
            current,
            action_evidence("ACT-DOWNTIME-UNKNOWN"),
        )
        unknown_machine["events"][0]["subjectId"] = "MACHINE-UNKNOWN"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.downtime.started",
                unknown_machine,
                action_evidence("ACT-DOWNTIME-UNKNOWN"),
            )

        early_end_evidence = action_evidence(
            "ACT-DOWNTIME-EARLY-END",
            captured_at="2026-07-24T08:59:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                started,
                "production.downtime.ended",
                ended_downtime_state(
                    started,
                    start_evidence,
                    early_end_evidence,
                ),
                early_end_evidence,
            )

        submillisecond_end_evidence = action_evidence(
            "ACT-DOWNTIME-SUBMILLISECOND-END",
            captured_at="2026-07-24T09:00:00.000400Z",
        )
        submillisecond_start_evidence = action_evidence(
            "ACT-DOWNTIME-SUBMILLISECOND-START",
            captured_at="2026-07-24T09:00:00.000500Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.downtime.started",
                started_downtime_state(
                    current,
                    submillisecond_start_evidence,
                ),
                submillisecond_start_evidence,
            )
        zero_year_evidence = action_evidence(
            "ACT-DOWNTIME-ZERO-YEAR",
            captured_at="0000-07-24T09:00:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.downtime.started",
                started_downtime_state(current, zero_year_evidence),
                zero_year_evidence,
            )
        for expanded_timestamp in (
            "+010000-07-24T09:00:00.000Z",
            "-000001-07-24T09:00:00.000Z",
        ):
            expanded_year_evidence = action_evidence(
                f"ACT-DOWNTIME-EXPANDED-{expanded_timestamp[0]}",
                captured_at=expanded_timestamp,
            )
            with self.assertRaises(TrialValidationError):
                apply_event(
                    current,
                    "production.downtime.started",
                    started_downtime_state(current, expanded_year_evidence),
                    expanded_year_evidence,
                )
        forged_submillisecond = started_downtime_state(current, start_evidence)
        forged_submillisecond["events"][0]["createdAt"] = (
            submillisecond_start_evidence["capturedAt"]
        )
        forged_submillisecond["revision"] += 1
        forged_submillisecond["events"] = [
            production_event(
                submillisecond_end_evidence,
                kind="downtime_ended",
                subject_id=forged_submillisecond["machines"][0]["id"],
                summary=(
                    f"Ended downtime for "
                    f"{forged_submillisecond['machines'][0]['name']}"
                ),
                downtimeStartActionId=start_evidence["actionId"],
            ),
            *forged_submillisecond["events"],
        ]
        with self.assertRaises(TrialValidationError):
            validate_production_state(forged_submillisecond)

        wrong_start_evidence = action_evidence(
            "ACT-DOWNTIME-WRONG-END",
            captured_at=LATER,
        )
        wrong_start = ended_downtime_state(
            started,
            start_evidence,
            wrong_start_evidence,
        )
        wrong_start["events"][0]["downtimeStartActionId"] = "ACT-NOT-OPEN"
        with self.assertRaises(TrialValidationError):
            apply_event(
                started,
                "production.downtime.ended",
                wrong_start,
                wrong_start_evidence,
            )

        end_evidence = action_evidence(
            "ACT-DOWNTIME-END",
            captured_at=LATER,
        )
        ended = apply_event(
            started,
            "production.downtime.ended",
            ended_downtime_state(started, start_evidence, end_evidence),
            end_evidence,
        )
        self.assertEqual(
            {
                "jobs": ended["jobs"],
                "issues": ended["issues"],
                "machines": ended["machines"],
            },
            original_collections,
        )
        self.assertEqual(
            [event["kind"] for event in ended["events"][:2]],
            ["downtime_ended", "downtime_started"],
        )
        self.assertEqual(
            ended["events"][0]["downtimeStartActionId"],
            start_evidence["actionId"],
        )
        self.assertEqual(
            datetime.fromisoformat(
                ended["events"][0]["createdAt"].replace("Z", "+00:00")
            )
            - datetime.fromisoformat(
                ended["events"][1]["createdAt"].replace("Z", "+00:00")
            ),
            timedelta(minutes=15),
        )

        second_end_evidence = action_evidence(
            "ACT-DOWNTIME-END-AGAIN",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                ended,
                "production.downtime.ended",
                ended_downtime_state(
                    ended,
                    start_evidence,
                    second_end_evidence,
                ),
                second_end_evidence,
            )

        restart_evidence = action_evidence(
            "ACT-DOWNTIME-RESTART",
            captured_at=LATEST,
        )
        restarted = apply_event(
            ended,
            "production.downtime.started",
            started_downtime_state(ended, restart_evidence),
            restart_evidence,
        )
        self.assertEqual(restarted["events"][0]["kind"], "downtime_started")
        self.assertEqual(restarted["machines"], original_collections["machines"])

        detached_end = ended_downtime_state(
            current,
            start_evidence,
            end_evidence,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(detached_end)

        unrelated_start = started_downtime_state(current, start_evidence)
        unrelated_start["machines"][0]["state"] = "stopped"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.downtime.started",
                unrelated_start,
                start_evidence,
            )

    def test_maintenance_lifecycle_is_human_gated_and_side_effect_free(self) -> None:
        maintenance_events = {
            "production.maintenance_window.scheduled",
            "production.maintenance.started",
            "production.maintenance.completed",
        }
        self.assertTrue(maintenance_events.issubset(PRODUCTION_EVENTS))
        self.assertTrue(maintenance_events.issubset(PRODUCTION_HUMAN_EVENTS))

        current = starting_workspace()
        original_collections = deepcopy(
            {
                "jobs": current["jobs"],
                "issues": current["issues"],
                "machines": current["machines"],
            }
        )
        start_evidence = action_evidence("ACT-MAINTENANCE-START")
        started = apply_event(
            current,
            "production.maintenance.started",
            started_maintenance_state(current, start_evidence),
            start_evidence,
        )
        start_event = started["events"][0]
        self.assertEqual(
            set(start_event),
            {
                "id",
                "actionId",
                "createdAt",
                "actor",
                "reason",
                "evidenceReference",
                "kind",
                "subjectId",
                "summary",
                "maintenanceOwner",
            },
        )
        self.assertEqual(start_event["kind"], "maintenance_started")
        self.assertEqual(start_event["maintenanceOwner"], "Maintenance lead")
        self.assertEqual(start_event["actor"], start_evidence["actor"])
        self.assertEqual(start_event["createdAt"], start_evidence["capturedAt"])
        self.assertEqual(
            start_event["evidenceReference"],
            start_evidence["evidenceReference"],
        )
        self.assertEqual(
            {
                "jobs": started["jobs"],
                "issues": started["issues"],
                "machines": started["machines"],
            },
            original_collections,
        )
        self.assertEqual(len(started["events"]), len(current["events"]) + 1)

        completion_evidence = action_evidence(
            "ACT-MAINTENANCE-COMPLETE",
            captured_at=LATER,
        )
        completed = apply_event(
            started,
            "production.maintenance.completed",
            completed_maintenance_state(
                started,
                start_evidence,
                completion_evidence,
            ),
            completion_evidence,
        )
        completion_event = completed["events"][0]
        self.assertEqual(
            set(completion_event),
            {
                "id",
                "actionId",
                "createdAt",
                "actor",
                "reason",
                "evidenceReference",
                "kind",
                "subjectId",
                "summary",
                "maintenanceStartActionId",
            },
        )
        self.assertEqual(completion_event["kind"], "maintenance_completed")
        self.assertEqual(
            completion_event["maintenanceStartActionId"],
            start_evidence["actionId"],
        )
        self.assertEqual(
            {
                "jobs": completed["jobs"],
                "issues": completed["issues"],
                "machines": completed["machines"],
            },
            original_collections,
        )
        self.assertEqual(len(completed["events"]), len(started["events"]) + 1)
        self.assertEqual(
            [event["kind"] for event in completed["events"][:2]],
            ["maintenance_completed", "maintenance_started"],
        )

    def test_restrictive_maintenance_finding_binds_controlled_order_impact(self) -> None:
        current = starting_workspace()
        order_evidence = action_evidence(
            "ACT-MAINTENANCE-ORDER",
            captured_at="2026-07-24T09:30:00.000Z",
        )
        order_execution = planned_order_execution(current, order_evidence)
        current["orderPortfolio"] = {
            "contract": "supermega.production.order_portfolio.v1",
            "entries": [{"jobId": "JOB-REAL-001", "execution": order_execution}],
        }

        import_evidence = action_evidence(
            "ACT-MAINTENANCE-EQUIPMENT-IMPORT",
            captured_at="2026-07-24T10:00:00.000Z",
            evidence_reference=f"sha256:{'b' * 64}",
        )
        import_evidence["reason"] = "Imported reviewed Plant equipment master"
        imported = dict(
            reduce_trial_state(
                "production",
                "production.equipment_master.imported",
                current,
                {
                    "equipment": [{
                        "id": "MACHINE-MAINT-001",
                        "name": "Managed line drive",
                        "workCentreId": "WC-MANAGED-001",
                        "criticality": "critical",
                        "owner": "Plant engineering owner",
                    }],
                    "evidence": import_evidence,
                },
            )
        )
        commission_evidence = action_evidence(
            "ACT-MAINTENANCE-EQUIPMENT-COMMISSION",
            captured_at="2026-07-24T11:00:00.000Z",
            evidence_reference="SAFETY-MAINT-001",
        )
        commission_evidence["reason"] = "Commissioned reviewed Plant equipment"
        commissioned = dict(
            reduce_trial_state(
                "production",
                "production.equipment.commissioned",
                imported,
                {
                    "equipmentId": "MACHINE-MAINT-001",
                    "installedAt": "2026-07-24T10:30:00.000Z",
                    "initialState": "running",
                    "safetyBaselineReference": "SAFETY-MAINT-001",
                    "evidence": commission_evidence,
                },
            )
        )
        strategy_evidence = action_evidence(
            "ACT-MAINTENANCE-STRATEGY",
            captured_at="2026-07-24T12:00:00.000Z",
            evidence_reference="SAFETY-STRATEGY-001",
        )
        strategy_evidence["reason"] = "Saved reviewed preventive maintenance strategy"
        strategy = dict(
            reduce_trial_state(
                "production",
                "production.equipment_maintenance_strategy.saved",
                commissioned,
                {
                    "equipmentId": "MACHINE-MAINT-001",
                    "maintenanceOwner": "Maintenance lead",
                    "intervalDays": 30,
                    "nextDueAt": "2026-08-23T12:00:00.000Z",
                    "procedureReference": "SOP-MAINT-001-R1",
                    "safetyBaselineReference": "SAFETY-STRATEGY-001",
                    "evidence": strategy_evidence,
                },
            )
        )
        strategy_record = strategy["equipmentMaster"]["assets"][0]["maintenanceStrategy"]
        capacity_source = deepcopy(strategy)
        capacity_review = project_production_maintenance_capacity_review(
            strategy,
            "2026-08-20T12:00:00.000Z",
        )
        self.assertEqual(strategy, capacity_source)
        self.assertEqual(
            capacity_review["contract"],
            "supermega.production.maintenance-capacity-review.v1",
        )
        self.assertEqual(
            capacity_review["authority"],
            {
                "maintenanceScheduled": False,
                "ordersRescheduled": False,
                "machineStatusChanged": False,
                "equipmentCommanded": False,
            },
        )
        capacity_item = capacity_review["items"][0]
        self.assertEqual(capacity_item["workCentreId"], "WC-MANAGED-001")
        self.assertEqual(capacity_item["loadStatus"], "due_soon_with_load")
        self.assertEqual(capacity_item["daysUntilDue"], 3)
        self.assertEqual(capacity_item["totalRemainingMinutesMilli"], 100_000)
        capacity_order = capacity_item["orders"][0]
        self.assertEqual(
            {
                "jobId": capacity_order["jobId"],
                "jobOwner": capacity_order["jobOwner"],
                "jobPriority": capacity_order["jobPriority"],
                "jobDueAt": capacity_order["jobDueAt"],
                "planId": capacity_order["planId"],
                "orderRevision": capacity_order["orderRevision"],
                "orderHeadDigest": capacity_order["orderHeadDigest"],
                "status": capacity_order["status"],
                "totalRemainingMinutesMilli": capacity_order[
                    "totalRemainingMinutesMilli"
                ],
            },
            {
                "jobId": "JOB-REAL-001",
                "jobOwner": "Shift lead",
                "jobPriority": "normal",
                "jobDueAt": "2026-07-25T09:00:00.000Z",
                "planId": "PLN-MANAGED-001",
                "orderRevision": 1,
                "orderHeadDigest": order_execution["headDigest"],
                "status": "planned",
                "totalRemainingMinutesMilli": 100_000,
            },
        )
        self.assertEqual(
            capacity_order["operations"],
            [{
                "operationId": "OP-MANAGED-10",
                "sequence": 1,
                "name": "Managed operation",
                "status": "ready",
                "remainingQuantity": 100,
                "remainingMinutesMilli": 100_000,
            }],
        )
        no_load_state = deepcopy(strategy)
        del no_load_state["orderPortfolio"]
        no_load_review = project_production_maintenance_capacity_review(
            no_load_state,
            "2026-08-20T12:00:00.000Z",
        )
        self.assertEqual(no_load_review["items"][0]["loadStatus"], "due_soon_no_load")
        self.assertEqual(no_load_review["items"][0]["orders"], [])
        self.assertEqual(no_load_review["items"][0]["totalRemainingMinutesMilli"], 0)
        with self.assertRaisesRegex(
            TrialValidationError,
            "maintenance due queue asOf must be a canonical ISO-8601 timestamp",
        ):
            project_production_maintenance_capacity_review(strategy, "not-a-time")

        window_capacity = project_production_maintenance_capacity_review(
            strategy,
            "2026-07-24T12:15:00.000Z",
        )
        window_item = window_capacity["items"][0]
        window_evidence = action_evidence(
            "ACT-MAINTENANCE-WINDOW",
            captured_at="2026-07-24T12:30:00.000Z",
            evidence_reference="MAINTENANCE-WINDOW-REVIEW-001",
        )
        planned_start = "2026-07-24T13:00:00.000Z"
        planned_end = "2026-07-24T14:30:00.000Z"
        scheduled_candidate = deepcopy(strategy)
        scheduled_candidate["revision"] += 1
        scheduled_candidate["events"] = [
            production_event(
                window_evidence,
                kind="maintenance_window_scheduled",
                subject_id="MACHINE-MAINT-001",
                summary=(
                    "Scheduled maintenance for Managed line drive from "
                    f"{planned_start} to {planned_end}"
                ),
                maintenanceOwner="Maintenance lead",
                maintenanceStrategyActionId=strategy_record["actionId"],
                maintenanceStrategyRevision=strategy_record["revision"],
                maintenanceProcedureReference=strategy_record["procedureReference"],
                maintenancePlannedDueAt=strategy_record["nextDueAt"],
                maintenanceWindowStartAt=planned_start,
                maintenanceWindowEndAt=planned_end,
                maintenanceWindowDurationMinutes=90,
                maintenanceWindowCapacityAsOf=window_capacity["asOf"],
                maintenanceWindowWorkCentreId=window_item["workCentreId"],
                maintenanceWindowOrderCount=len(window_item["orders"]),
                maintenanceWindowLoadMinutesMilli=window_item[
                    "totalRemainingMinutesMilli"
                ],
                sourceRevision=strategy["revision"],
                sourceDigest=production_source_digest(strategy),
            ),
            *strategy["events"],
        ]
        forged_load = deepcopy(scheduled_candidate)
        forged_load["events"][0]["maintenanceWindowLoadMinutesMilli"] += 1
        with self.assertRaisesRegex(
            TrialValidationError,
            "does not match its reviewed strategy and controlled load",
        ):
            apply_event(
                strategy,
                "production.maintenance_window.scheduled",
                forged_load,
                window_evidence,
            )
        scheduled = apply_event(
            strategy,
            "production.maintenance_window.scheduled",
            scheduled_candidate,
            window_evidence,
        )
        window_projection = project_production_maintenance_windows(scheduled)
        self.assertEqual(len(window_projection), 1)
        self.assertEqual(
            {
                "contract": window_projection[0]["contract"],
                "durationMinutes": window_projection[0]["durationMinutes"],
                "orderCount": window_projection[0]["orderCount"],
                "totalRemainingMinutesMilli": window_projection[0][
                    "totalRemainingMinutesMilli"
                ],
                "authority": window_projection[0]["authority"],
            },
            {
                "contract": "supermega.production.maintenance-window.v1",
                "durationMinutes": 90,
                "orderCount": 1,
                "totalRemainingMinutesMilli": 100_000,
                "authority": {
                    "maintenanceScheduled": True,
                    "ordersRescheduled": False,
                    "machineStatusChanged": False,
                    "equipmentCommanded": False,
                },
            },
        )
        self.assertEqual(
            {
                "jobs": scheduled["jobs"],
                "issues": scheduled["issues"],
                "machines": scheduled["machines"],
                "orderPortfolio": scheduled["orderPortfolio"],
                "equipmentMaster": scheduled["equipmentMaster"],
            },
            {
                "jobs": strategy["jobs"],
                "issues": strategy["issues"],
                "machines": strategy["machines"],
                "orderPortfolio": strategy["orderPortfolio"],
                "equipmentMaster": strategy["equipmentMaster"],
            },
        )
        start_evidence = action_evidence(
            "ACT-MAINTENANCE-IMPACT-START",
            captured_at="2026-07-24T13:00:00.000Z",
        )
        start_capacity = project_production_maintenance_capacity_review(
            scheduled,
            start_evidence["capturedAt"],
        )
        start_item = start_capacity["items"][0]
        started = deepcopy(scheduled)
        started["revision"] += 1
        started["events"] = [
            production_event(
                start_evidence,
                kind="maintenance_started",
                subject_id="MACHINE-MAINT-001",
                summary="Started maintenance for Managed line drive",
                maintenanceOwner="Maintenance lead",
                maintenanceStrategyActionId=strategy_record["actionId"],
                maintenanceStrategyRevision=strategy_record["revision"],
                maintenanceProcedureReference=strategy_record["procedureReference"],
                maintenancePlannedDueAt=strategy_record["nextDueAt"],
                maintenanceWindowActionId=window_evidence["actionId"],
                maintenanceWindowCapacityAsOf=start_capacity["asOf"],
                maintenanceWindowWorkCentreId=start_item["workCentreId"],
                maintenanceWindowOrderCount=len(start_item["orders"]),
                maintenanceWindowLoadMinutesMilli=start_item[
                    "totalRemainingMinutesMilli"
                ],
                maintenanceWindowJobIds=[
                    order["jobId"] for order in start_item["orders"]
                ],
                sourceRevision=scheduled["revision"],
                sourceDigest=production_source_digest(scheduled),
            ),
            *scheduled["events"],
        ]
        started = apply_event(
            scheduled,
            "production.maintenance.started",
            started,
            start_evidence,
        )

        completion_evidence = action_evidence(
            "ACT-MAINTENANCE-IMPACT-COMPLETE",
            captured_at="2026-07-24T14:00:00.000Z",
        )
        completed = deepcopy(started)
        completed["revision"] += 1
        completed["equipmentMaster"]["assets"][0]["maintenanceStrategy"]["nextDueAt"] = "2026-08-23T14:00:00.000Z"
        completed["events"] = [
            production_event(
                completion_evidence,
                kind="maintenance_completed",
                subject_id="MACHINE-MAINT-001",
                summary="Completed maintenance for Managed line drive",
                maintenanceStartActionId=start_evidence["actionId"],
                maintenanceStrategyActionId=strategy_record["actionId"],
                maintenanceStrategyRevision=strategy_record["revision"],
                maintenanceProcedureReference=strategy_record["procedureReference"],
                maintenancePlannedDueAt=strategy_record["nextDueAt"],
                maintenanceOutcome="completed_with_findings",
                maintenanceFindings="Drive vibration exceeds the reviewed operating band.",
                maintenanceProcedureCompleted=True,
                maintenanceReturnToService="restricted",
                nextDueAt="2026-08-23T14:00:00.000Z",
            ),
            *started["events"],
        ]
        completed = apply_event(
            started,
            "production.maintenance.completed",
            completed,
            completion_evidence,
        )
        order_projection = project_plant_order(order_execution)
        plan = order_projection["plan"]
        source = {
            "contract": "supermega.production.maintenance-finding-source.v2",
            "equipmentId": "MACHINE-MAINT-001",
            "equipmentName": "Managed line drive",
            "maintenanceOwner": "Maintenance lead",
            "completionActionId": completion_evidence["actionId"],
            "completedAt": completion_evidence["capturedAt"],
            "strategyActionId": strategy_record["actionId"],
            "strategyRevision": strategy_record["revision"],
            "returnToService": "restricted",
            "findings": "Drive vibration exceeds the reviewed operating band.",
            "evidenceReference": completion_evidence["evidenceReference"],
            "workCentreId": "WC-MANAGED-001",
            "affectedOrders": [{
                "jobId": "JOB-REAL-001",
                "product": plan["job"]["product"],
                "planId": plan["planId"],
                "planPackageDigest": plan["packageDigest"],
                "orderRevision": order_projection["revision"],
                "orderHeadDigest": order_projection["headDigest"],
                "status": order_projection["status"],
                "operations": [{
                    "operationId": "OP-MANAGED-10",
                    "sequence": 1,
                    "name": "Managed operation",
                }],
            }],
        }
        issue_evidence = action_evidence(
            "ACT-MAINTENANCE-IMPACT-ISSUE",
            captured_at="2026-07-24T15:00:00.000Z",
        )
        issue = {
            "id": "ISS-MAINTENANCE-IMPACT-001",
            "createdAt": issue_evidence["capturedAt"],
            "area": "Managed line drive",
            "kind": "maintenance",
            "summary": "Maintenance finding requires controlled-order review.",
            "status": "open",
            "severity": "medium",
            "owner": "Maintenance lead",
            "dueAt": "2026-07-25T15:00:00.000Z",
            "containment": "Review the linked controlled order before normal operation.",
            "maintenanceFindingSource": deepcopy(source),
        }
        opened = deepcopy(completed)
        opened["revision"] += 1
        opened["issues"] = [issue, *completed["issues"]]
        opened["events"] = [
            production_event(
                issue_evidence,
                kind="issue_opened",
                subject_id=issue["id"],
                summary="Opened maintenance issue for Managed line drive",
                issueSeverity=issue["severity"],
                issueOwner=issue["owner"],
                issueDueAt=issue["dueAt"],
                issueContainment=issue["containment"],
                maintenanceFindingSource=deepcopy(source),
            ),
            *completed["events"],
        ]
        opened = apply_event(
            completed,
            "production.issue.opened",
            opened,
            issue_evidence,
        )
        self.assertEqual(
            opened["issues"][0]["maintenanceFindingSource"]["affectedOrders"][0]["operations"][0]["operationId"],
            "OP-MANAGED-10",
        )
        self.assertEqual(opened["orderPortfolio"], completed["orderPortfolio"])
        self.assertEqual(opened["jobs"], completed["jobs"])
        self.assertEqual(opened["machines"], completed["machines"])

        omitted = deepcopy(opened)
        omitted["issues"][0]["maintenanceFindingSource"]["affectedOrders"] = []
        omitted["events"][0]["maintenanceFindingSource"]["affectedOrders"] = []
        with self.assertRaisesRegex(
            TrialValidationError,
            "must match current equipment and controlled-order evidence",
        ):
            apply_event(
                completed,
                "production.issue.opened",
                omitted,
                issue_evidence,
            )

        forged_history = deepcopy(opened)
        forged_history["issues"][0]["maintenanceFindingSource"]["affectedOrders"][0]["operations"][0]["name"] = "Forged operation"
        forged_history["events"][0]["maintenanceFindingSource"] = deepcopy(
            forged_history["issues"][0]["maintenanceFindingSource"]
        )
        with self.assertRaisesRegex(
            TrialValidationError,
            "does not match its retained reviewed routing",
        ):
            validate_production_state(forged_history)

        advanced_execution = check_plant_order_availability(
            order_execution,
            check_id="CHK-MAINTENANCE-IMPACT-001",
            source_digest=plant_order_evidence_digest({"check": "maintenance-impact"}),
            materials=[{
                "materialId": "MAT-MANAGED-001",
                "inputLotId": "LOT-MAINTENANCE-001",
                "availableQuantityMilli": 100_000,
            }],
            work_centres=[{
                "workCentreId": "WC-MANAGED-001",
                "availableMinutes": 100,
            }],
            proof=action_evidence(
                "ACT-MAINTENANCE-ORDER-ADVANCE",
                captured_at="2026-07-24T15:30:00.000Z",
            ),
            expected_head_digest=order_execution["headDigest"],
        )["state"]
        advanced = deepcopy(opened)
        advanced["orderPortfolio"]["entries"][0]["execution"] = advanced_execution
        self.assertEqual(
            validate_production_state(advanced)["issues"][0]["maintenanceFindingSource"]["affectedOrders"][0]["orderRevision"],
            1,
        )

        legacy = deepcopy(opened)
        for legacy_source in (
            legacy["issues"][0]["maintenanceFindingSource"],
            legacy["events"][0]["maintenanceFindingSource"],
        ):
            legacy_source["contract"] = "supermega.production.maintenance-finding-source.v1"
            legacy_source.pop("workCentreId")
            legacy_source.pop("affectedOrders")
        self.assertEqual(
            validate_production_state(legacy)["issues"][0]["maintenanceFindingSource"]["contract"],
            "supermega.production.maintenance-finding-source.v1",
        )

    def test_maintenance_lifecycle_rejects_invalid_transitions_and_history(
        self,
    ) -> None:
        current = starting_workspace()
        start_evidence = action_evidence("ACT-MAINTENANCE-START")
        started = apply_event(
            current,
            "production.maintenance.started",
            started_maintenance_state(current, start_evidence),
            start_evidence,
        )

        for owner in (" Maintenance lead", "x" * 121):
            invalid_owner_evidence = action_evidence(
                f"ACT-MAINTENANCE-OWNER-{len(owner)}"
            )
            with self.subTest(owner=owner), self.assertRaises(
                TrialValidationError
            ):
                apply_event(
                    current,
                    "production.maintenance.started",
                    started_maintenance_state(
                        current,
                        invalid_owner_evidence,
                        owner=owner,
                    ),
                    invalid_owner_evidence,
                )

        missing_owner_evidence = action_evidence("ACT-MAINTENANCE-NO-OWNER")
        missing_owner = started_maintenance_state(
            current,
            missing_owner_evidence,
        )
        missing_owner["events"][0].pop("maintenanceOwner")
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                missing_owner,
                missing_owner_evidence,
            )

        unrelated_field_evidence = action_evidence(
            "ACT-MAINTENANCE-UNRELATED-FIELD"
        )
        unrelated_field = started_maintenance_state(
            current,
            unrelated_field_evidence,
        )
        unrelated_field["events"][0]["maintenanceStartActionId"] = (
            start_evidence["actionId"]
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                unrelated_field,
                unrelated_field_evidence,
            )

        duplicate_start_evidence = action_evidence(
            "ACT-MAINTENANCE-DUPLICATE",
            captured_at=LATER,
        )
        duplicate_start = started_maintenance_state(
            started,
            duplicate_start_evidence,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                started,
                "production.maintenance.started",
                duplicate_start,
                duplicate_start_evidence,
            )
        with self.assertRaises(TrialValidationError):
            validate_production_state(duplicate_start)

        unknown_machine_evidence = action_evidence("ACT-MAINTENANCE-UNKNOWN")
        unknown_machine = started_maintenance_state(
            current,
            unknown_machine_evidence,
        )
        unknown_machine["events"][0]["subjectId"] = "MACHINE-UNKNOWN"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                unknown_machine,
                unknown_machine_evidence,
            )

        detached_completion_evidence = action_evidence(
            "ACT-MAINTENANCE-DETACHED-COMPLETE",
            captured_at=LATER,
        )
        detached_completion = completed_maintenance_state(
            current,
            start_evidence,
            detached_completion_evidence,
        )
        with self.assertRaises(TrialValidationError):
            validate_production_state(detached_completion)
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.completed",
                detached_completion,
                detached_completion_evidence,
            )

        early_completion_evidence = action_evidence(
            "ACT-MAINTENANCE-EARLY-COMPLETE",
            captured_at="2026-07-24T08:59:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                started,
                "production.maintenance.completed",
                completed_maintenance_state(
                    started,
                    start_evidence,
                    early_completion_evidence,
                ),
                early_completion_evidence,
            )

        wrong_reference_evidence = action_evidence(
            "ACT-MAINTENANCE-WRONG-REFERENCE",
            captured_at=LATER,
        )
        wrong_reference = completed_maintenance_state(
            started,
            start_evidence,
            wrong_reference_evidence,
        )
        wrong_reference["events"][0]["maintenanceStartActionId"] = (
            "ACT-NOT-OPEN"
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                started,
                "production.maintenance.completed",
                wrong_reference,
                wrong_reference_evidence,
            )

        forged_time_evidence = action_evidence("ACT-MAINTENANCE-FORGED-TIME")
        forged_time = started_maintenance_state(current, forged_time_evidence)
        forged_time["events"][0]["createdAt"] = LATER
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                forged_time,
                forged_time_evidence,
            )

        submillisecond_evidence = action_evidence(
            "ACT-MAINTENANCE-SUBMILLISECOND",
            captured_at="2026-07-24T09:00:00.000500Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                started_maintenance_state(current, submillisecond_evidence),
                submillisecond_evidence,
            )

        unrelated_mutation_evidence = action_evidence(
            "ACT-MAINTENANCE-UNRELATED-MUTATION"
        )
        unrelated_mutation = started_maintenance_state(
            current,
            unrelated_mutation_evidence,
        )
        unrelated_mutation["jobs"][0]["line"] = "Unauthorized line change"
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                unrelated_mutation,
                unrelated_mutation_evidence,
            )

        completion_evidence = action_evidence(
            "ACT-MAINTENANCE-COMPLETE",
            captured_at=LATER,
        )
        completed = apply_event(
            started,
            "production.maintenance.completed",
            completed_maintenance_state(
                started,
                start_evidence,
                completion_evidence,
            ),
            completion_evidence,
        )

        second_completion_evidence = action_evidence(
            "ACT-MAINTENANCE-COMPLETE-AGAIN",
            captured_at=LATEST,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                completed,
                "production.maintenance.completed",
                completed_maintenance_state(
                    completed,
                    start_evidence,
                    second_completion_evidence,
                ),
                second_completion_evidence,
            )

        duplicate_action = started_maintenance_state(completed, start_evidence)
        with self.assertRaises(TrialValidationError):
            validate_production_state(duplicate_action)

        out_of_order_restart_evidence = action_evidence(
            "ACT-MAINTENANCE-OUT-OF-ORDER-RESTART",
            captured_at="2026-07-24T09:14:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                completed,
                "production.maintenance.started",
                started_maintenance_state(
                    completed,
                    out_of_order_restart_evidence,
                ),
                out_of_order_restart_evidence,
            )

        restart_evidence = action_evidence(
            "ACT-MAINTENANCE-RESTART",
            captured_at=LATEST,
        )
        restarted = apply_event(
            completed,
            "production.maintenance.started",
            started_maintenance_state(completed, restart_evidence),
            restart_evidence,
        )
        replay_reference_evidence = action_evidence(
            "ACT-MAINTENANCE-REPLAY-REFERENCE",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                restarted,
                "production.maintenance.completed",
                completed_maintenance_state(
                    restarted,
                    start_evidence,
                    replay_reference_evidence,
                ),
                replay_reference_evidence,
            )

        two_event_transition = completed_maintenance_state(
            started,
            start_evidence,
            completion_evidence,
        )
        with self.assertRaises(TrialValidationError):
            apply_event(
                current,
                "production.maintenance.started",
                two_event_transition,
                start_evidence,
            )

    def test_store_owns_versioning_replay_and_authenticated_audit_actor(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        principal = TrialPrincipal("workspace-a", ACTOR, "human")
        store.provision_membership(
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            actor_kind=principal.actor_kind,
            capabilities=("production.write",),
        )
        initialize_id = str(uuid4())
        initialize_payload = {
            "state": starting_workspace(),
            "evidence": action_evidence("ACT-STORE-INIT"),
        }
        spoofed_payload = deepcopy(initialize_payload)
        spoofed_payload["evidence"]["actor"] = "actor-spoofed"
        with self.assertRaises(TrialValidationError):
            store.apply_command(
                principal,
                command_id=str(uuid4()),
                surface="production",
                event_type="production.workspace.initialized",
                expected_version=0,
                payload=spoofed_payload,
            )
        initialized = store.apply_command(
            principal,
            command_id=initialize_id,
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload=initialize_payload,
        )
        replay = store.apply_command(
            principal,
            command_id=initialize_id,
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload=initialize_payload,
        )

        job_evidence = action_evidence(
            "ACT-STORE-JOB",
            captured_at=LATER,
        )
        job_state = deepcopy(dict(initialized.state))
        new_job = {
            "id": "JOB-REAL-002",
            "line": "Assembly team",
            "product": "Customer batch 002",
            "target": 50,
            "output": 0,
            "owner": "Assembly lead",
            "priority": "normal",
            "dueAt": "2026-07-25T09:00:00.000Z",
        }
        job_state["revision"] = 1
        job_state["jobs"] = [new_job, *job_state["jobs"]]
        job_state["events"] = [
            production_event(
                job_evidence,
                kind="job_created",
                subject_id=new_job["id"],
                summary="Created Customer batch 002 job for Assembly team",
                jobPriority=new_job["priority"],
                jobDueAt=new_job["dueAt"],
                jobOwner=new_job["owner"],
            )
        ]
        job_command_id = str(uuid4())
        job_created = store.apply_command(
            principal,
            command_id=job_command_id,
            surface="production",
            event_type="production.job.created",
            expected_version=initialized.version,
            payload={"state": job_state, "evidence": job_evidence},
        )
        job_replay = store.apply_command(
            principal,
            command_id=job_command_id,
            surface="production",
            event_type="production.job.created",
            expected_version=initialized.version,
            payload={"state": job_state, "evidence": job_evidence},
        )

        schedule_evidence = action_evidence(
            "ACT-STORE-JOB-SCHEDULE",
            captured_at="2026-07-24T09:20:00.000Z",
        )
        schedule_next_state = schedule_state(
            dict(job_created.state),
            "low",
            "2026-07-26T09:00:00.000Z",
            schedule_evidence,
            job_id=new_job["id"],
        )
        schedule_command_id = str(uuid4())
        job_scheduled = store.apply_command(
            principal,
            command_id=schedule_command_id,
            surface="production",
            event_type="production.job.schedule_updated",
            expected_version=job_created.version,
            payload={
                "state": schedule_next_state,
                "evidence": schedule_evidence,
            },
        )
        schedule_replay = store.apply_command(
            principal,
            command_id=schedule_command_id,
            surface="production",
            event_type="production.job.schedule_updated",
            expected_version=job_created.version,
            payload={
                "state": schedule_next_state,
                "evidence": schedule_evidence,
            },
        )

        output_evidence = action_evidence(
            "ACT-STORE-OUTPUT",
            captured_at=LATEST,
        )
        next_state = output_state(
            dict(job_scheduled.state),
            5,
            output_evidence,
        )
        recorded = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="production",
            event_type="production.output.recorded",
            expected_version=job_scheduled.version,
            payload={"state": next_state, "evidence": output_evidence},
        )
        material_evidence = action_evidence(
            "ACT-STORE-MATERIAL",
            captured_at="2026-07-24T09:45:00.000Z",
        )
        material_next_state = material_state(
            dict(recorded.state),
            3,
            material_evidence,
            material_unit="pack",
        )
        material_command_id = str(uuid4())
        material_recorded = store.apply_command(
            principal,
            command_id=material_command_id,
            surface="production",
            event_type="production.material.consumed",
            expected_version=recorded.version,
            payload={
                "state": material_next_state,
                "evidence": material_evidence,
            },
        )
        material_replay = store.apply_command(
            principal,
            command_id=material_command_id,
            surface="production",
            event_type="production.material.consumed",
            expected_version=recorded.version,
            payload={
                "state": material_next_state,
                "evidence": material_evidence,
            },
        )
        close_evidence = action_evidence(
            "ACT-STORE-JOB-CLOSE",
            captured_at="2026-07-24T10:00:00.000Z",
        )
        close_next_state = closed_job_state(
            dict(material_recorded.state),
            close_evidence,
            shift_ref="2026-07-24 Day",
        )
        close_command_id = str(uuid4())
        job_closed = store.apply_command(
            principal,
            command_id=close_command_id,
            surface="production",
            event_type="production.job.closed",
            expected_version=material_recorded.version,
            payload={"state": close_next_state, "evidence": close_evidence},
        )
        close_replay = store.apply_command(
            principal,
            command_id=close_command_id,
            surface="production",
            event_type="production.job.closed",
            expected_version=material_recorded.version,
            payload={"state": close_next_state, "evidence": close_evidence},
        )

        self.assertEqual(initialized.version, 1)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(job_created.version, 2)
        self.assertTrue(job_replay.idempotent_replay)
        self.assertEqual(job_scheduled.version, 3)
        self.assertTrue(schedule_replay.idempotent_replay)
        self.assertEqual(recorded.version, 4)
        self.assertEqual(material_recorded.version, 5)
        self.assertTrue(material_replay.idempotent_replay)
        self.assertEqual(job_closed.version, 6)
        self.assertTrue(close_replay.idempotent_replay)
        self.assertEqual(job_closed.state["jobs"][0]["closure"]["closedBy"], ACTOR)
        stored = store.get_state(principal, "production")
        self.assertEqual(stored.updated_by, principal.actor_id)
        self.assertEqual(stored.state, close_next_state)

        conflicting_close_state = closed_job_state(
            dict(material_recorded.state),
            close_evidence,
            shift_ref="Changed shift",
        )
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                principal,
                command_id=close_command_id,
                surface="production",
                event_type="production.job.closed",
                expected_version=material_recorded.version,
                payload={
                    "state": conflicting_close_state,
                    "evidence": close_evidence,
                },
            )

        conflicting_job_state = deepcopy(job_state)
        conflicting_job_state["jobs"][0]["target"] = 51
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                principal,
                command_id=job_command_id,
                surface="production",
                event_type="production.job.created",
                expected_version=initialized.version,
                payload={
                    "state": conflicting_job_state,
                    "evidence": job_evidence,
                },
            )

        conflicting_schedule_state = deepcopy(schedule_next_state)
        conflicting_schedule_state["jobs"][0]["priority"] = "urgent"
        conflicting_schedule_state["events"][0]["jobPriority"] = "urgent"
        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                principal,
                command_id=schedule_command_id,
                surface="production",
                event_type="production.job.schedule_updated",
                expected_version=job_created.version,
                payload={
                    "state": conflicting_schedule_state,
                    "evidence": schedule_evidence,
                },
            )

        with self.assertRaises(TrialIdempotencyConflict):
            store.apply_command(
                principal,
                command_id=initialize_id,
                surface="production",
                event_type="production.workspace.initialized",
                expected_version=0,
                payload={
                    "state": starting_workspace(target=101),
                    "evidence": action_evidence("ACT-STORE-INIT"),
                },
            )

    def test_store_rejects_nonhuman_production_commands_without_router(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        agent = TrialPrincipal("workspace-a", "actor-agent", "agent")
        store.provision_membership(
            workspace_id=agent.workspace_id,
            actor_id=agent.actor_id,
            actor_kind=agent.actor_kind,
            capabilities=("production.write",),
        )
        with self.assertRaises(TrialHumanApprovalRequired):
            store.apply_command(
                agent,
                command_id=str(uuid4()),
                surface="production",
                event_type="production.workspace.initialized",
                expected_version=0,
                payload={
                    "state": starting_workspace(),
                    "evidence": action_evidence(
                        "ACT-STORE-AGENT",
                        actor=agent.actor_id,
                    ),
                },
            )

    def test_api_binds_evidence_to_principal_and_requires_a_human(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        human = TrialPrincipal("workspace-a", ACTOR, "human")
        agent = TrialPrincipal("workspace-a", "actor-agent", "agent")
        for principal in (human, agent):
            store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("production.write",),
            )
        sessions = {"human-session": human, "agent-session": agent}

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(
                store=store,
                resolve_principal=resolve_principal,
            )
        )

        initialize_body = {
            "command_id": str(uuid4()),
            "surface": "production",
            "event_type": "production.workspace.initialized",
            "expected_version": 0,
            "payload": {
                "state": starting_workspace(),
                "evidence": action_evidence("ACT-API-INIT"),
            },
        }
        with TestClient(app) as client:
            bad_uuid = deepcopy(initialize_body)
            bad_uuid["command_id"] = "not-a-uuid"
            self.assertEqual(
                client.post(
                    "/api/trial/v1/commands",
                    headers={"x-test-session": "human-session"},
                    json=bad_uuid,
                ).status_code,
                422,
            )

            spoofed = deepcopy(initialize_body)
            spoofed["payload"]["evidence"]["actor"] = "actor-spoofed"
            response = client.post(
                "/api/trial/v1/commands",
                headers={"x-test-session": "human-session"},
                json=spoofed,
            )
            self.assertEqual(response.status_code, 422)
            self.assertEqual(
                response.json()["detail"]["code"],
                "production_actor_evidence_required",
            )

            for event_type in sorted(PRODUCTION_HUMAN_EVENTS):
                with self.subTest(event_type=event_type):
                    agent_body = deepcopy(initialize_body)
                    agent_body["command_id"] = str(uuid4())
                    agent_body["event_type"] = event_type
                    agent_body["payload"]["evidence"] = action_evidence(
                        f"ACT-AGENT-{event_type}",
                        actor=agent.actor_id,
                    )
                    response = client.post(
                        "/api/trial/v1/commands",
                        headers={"x-test-session": "agent-session"},
                        json=agent_body,
                    )
                    self.assertEqual(response.status_code, 403)
                    self.assertEqual(
                        response.json()["detail"]["code"],
                        "trial_human_approval_required",
                    )

            initialized = client.post(
                "/api/trial/v1/commands",
                headers={"x-test-session": "human-session"},
                json=initialize_body,
            )
            replay = client.post(
                "/api/trial/v1/commands",
                headers={"x-test-session": "human-session"},
                json=initialize_body,
            )
            self.assertEqual(initialized.status_code, 200)
            self.assertEqual(replay.status_code, 200)
            self.assertFalse(
                initialized.json()["result"]["idempotent_replay"]
            )
            self.assertTrue(replay.json()["result"]["idempotent_replay"])


if __name__ == "__main__":
    unittest.main()
