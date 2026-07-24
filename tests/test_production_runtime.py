from __future__ import annotations

from copy import deepcopy
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.production_runtime import (
    PRODUCTION_EVENTS,
    PRODUCTION_HUMAN_EVENTS,
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


def opened_issue_state(
    current: dict[str, object],
    evidence: dict[str, str],
    *,
    issue_id: str = "ISSUE-REAL-001",
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
    state["revision"] += 1
    state["issues"] = [issue, *state["issues"]]
    state["events"] = [
        production_event(
            evidence,
            kind="issue_opened",
            subject_id=issue_id,
            summary="Opened quality issue for Assembly team",
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
            "production.output.recorded",
            "production.issue.opened",
            "production.issue.resolved",
            "production.machine_state.changed",
        }
        self.assertEqual(PRODUCTION_EVENTS, expected_events)
        self.assertEqual(PRODUCTION_HUMAN_EVENTS, expected_events)

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

        self.assertEqual(initialized.version, 1)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(job_created.version, 2)
        self.assertTrue(job_replay.idempotent_replay)
        self.assertEqual(recorded.version, 3)
        stored = store.get_state(principal, "production")
        self.assertEqual(stored.updated_by, principal.actor_id)
        self.assertEqual(stored.state, next_state)

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
