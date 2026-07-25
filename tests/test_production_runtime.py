from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from decimal import Decimal
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.production_runtime import (
    PRODUCTION_EVENTS,
    PRODUCTION_HUMAN_EVENTS,
    validate_production_state,
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


def action_evidence(
    action_id: str,
    *,
    actor: str = ACTOR,
    captured_at: str = NOW,
) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": captured_at,
        "actor": actor,
        "reason": "Verified against the accountable operating record.",
        "evidenceReference": f"evidence://production/{action_id}",
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
    state["issues"][index] = {
        **issue,
        "status": "resolved",
        "resolution": {
            "actionId": evidence["actionId"],
            "resolvedAt": evidence["capturedAt"],
            "resolvedBy": evidence["actor"],
            "reason": evidence["reason"],
            "evidenceReference": evidence["evidenceReference"],
        },
    }
    state["revision"] += 1
    state["events"] = [
        production_event(
            evidence,
            kind="issue_resolved",
            subject_id=issue_id,
            summary=f"Resolved {issue['kind']} issue for {issue['area']}",
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
    def test_event_contract_and_real_workspace_initialization(self) -> None:
        expected_events = {
            "production.workspace.initialized",
            "production.job.created",
            "production.job.closed",
            "production.output.recorded",
            "production.material.consumed",
            "production.issue.opened",
            "production.issue.resolved",
            "production.quality_hold.placed",
            "production.quality_hold.released",
            "production.machine_state.changed",
            "production.downtime.started",
            "production.downtime.ended",
            "production.maintenance.started",
            "production.maintenance.completed",
        }
        self.assertEqual(PRODUCTION_EVENTS, expected_events)
        self.assertEqual(PRODUCTION_HUMAN_EVENTS, expected_events)

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
        }
        created["revision"] = 1
        created["jobs"] = [precise_job, *created["jobs"]]
        created["events"] = [
            production_event(
                creation_evidence,
                kind="job_created",
                subject_id=precise_job["id"],
                summary="Created Precision batch job for Precision line",
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
        }
        created["revision"] = 1
        created["jobs"] = [job, *created["jobs"]]
        created["events"] = [
            production_event(
                evidence,
                kind="job_created",
                subject_id=job["id"],
                summary="Created Customer batch 002 job for Assembly team",
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
        }
        job_state["revision"] = 1
        job_state["jobs"] = [new_job, *job_state["jobs"]]
        job_state["events"] = [
            production_event(
                job_evidence,
                kind="job_created",
                subject_id=new_job["id"],
                summary="Created Customer batch 002 job for Assembly team",
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

        output_evidence = action_evidence(
            "ACT-STORE-OUTPUT",
            captured_at=LATEST,
        )
        next_state = output_state(
            dict(job_created.state),
            5,
            output_evidence,
        )
        recorded = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="production",
            event_type="production.output.recorded",
            expected_version=job_created.version,
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
        self.assertEqual(recorded.version, 3)
        self.assertEqual(material_recorded.version, 4)
        self.assertTrue(material_replay.idempotent_replay)
        self.assertEqual(job_closed.version, 5)
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
