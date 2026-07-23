from __future__ import annotations

from copy import deepcopy
import unittest
from uuid import uuid4

from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialValidationError


NOW = "2026-07-23T10:00:00.000Z"


def production_state() -> dict[str, object]:
    return {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [{"id": "JOB-1", "line": "Line 01", "product": "Product A", "target": 100, "output": 0}],
        "issues": [],
        "machines": [{"id": "MC-1", "name": "Machine 01", "state": "stopped"}],
        "events": [],
    }


def evidence(action_id: str) -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": NOW,
        "actor": "Accountable operator",
        "reason": "Verified against the shift record.",
        "evidenceReference": f"EV-{action_id}",
    }


def production_event(action_id: str, kind: str, subject_id: str, summary: str, **details: object) -> dict[str, object]:
    proof = evidence(action_id)
    return {
        "id": f"EVT-{action_id}",
        "actionId": action_id,
        "createdAt": proof["capturedAt"],
        "actor": proof["actor"],
        "reason": proof["reason"],
        "evidenceReference": proof["evidenceReference"],
        "kind": kind,
        "subjectId": subject_id,
        "summary": summary,
        **details,
    }


def apply_event(
    current: dict[str, object],
    event_type: str,
    next_state: dict[str, object],
    action_id: str,
) -> dict[str, object]:
    return dict(
        reduce_trial_state(
            "production",
            event_type,
            current,
            {"state": next_state, "evidence": evidence(action_id)},
        )
    )


def output_state(current: dict[str, object], action_id: str = "ACT-OUTPUT", quantity: int = 10) -> dict[str, object]:
    state = deepcopy(current)
    state["revision"] = int(current["revision"]) + 1
    state["jobs"][0]["output"] += quantity  # type: ignore[index,operator]
    state["events"] = [
        production_event(action_id, "output_recorded", "JOB-1", f"Recorded {quantity} good units", quantity=quantity),
        *current["events"],  # type: ignore[misc]
    ]
    return state


class ProductionRuntimeTests(unittest.TestCase):
    def test_initialization_requires_real_jobs_and_machines_without_history(self) -> None:
        initialized = apply_event({}, "production.workspace.initialized", production_state(), "ACT-INITIALIZE")
        self.assertEqual(initialized, production_state())

        missing_machine = production_state()
        missing_machine["machines"] = []
        with self.assertRaises(TrialValidationError):
            apply_event({}, "production.workspace.initialized", missing_machine, "ACT-INITIALIZE")
        invented_output = production_state()
        invented_output["jobs"][0]["output"] = 1  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event({}, "production.workspace.initialized", invented_output, "ACT-INITIALIZE")

    def test_output_changes_one_job_with_one_matching_event(self) -> None:
        current = production_state()
        accepted = apply_event(current, "production.output.recorded", output_state(current), "ACT-OUTPUT")
        self.assertEqual(accepted["jobs"][0]["output"], 10)  # type: ignore[index]

        over_target = output_state(current, quantity=101)
        with self.assertRaises(TrialValidationError):
            apply_event(current, "production.output.recorded", over_target, "ACT-OUTPUT")
        with self.assertRaises(TrialValidationError):
            apply_event(current, "production.output.recorded", output_state(current), "ACT-WRONG")

    def test_job_and_machine_registration_prepend_one_attributed_record(self) -> None:
        current = production_state()
        new_job = {"id": "JOB-2", "line": "Line 02", "product": "Product B", "target": 80, "output": 0}
        with_job = deepcopy(current)
        with_job["revision"] = 1
        with_job["jobs"] = [new_job, *current["jobs"]]  # type: ignore[misc]
        with_job["events"] = [production_event("ACT-JOB", "job_created", "JOB-2", "Created JOB-2 for Line 02")]
        accepted_job = apply_event(current, "production.job.created", with_job, "ACT-JOB")
        self.assertEqual(accepted_job["jobs"][0], new_job)  # type: ignore[index]

        invented_output = deepcopy(with_job)
        invented_output["jobs"][0]["output"] = 1  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "production.job.created", invented_output, "ACT-JOB")

        new_machine = {"id": "MC-2", "name": "Machine 02", "state": "stopped"}
        with_machine = deepcopy(accepted_job)
        with_machine["revision"] = 2
        with_machine["machines"] = [new_machine, *accepted_job["machines"]]  # type: ignore[misc]
        with_machine["events"] = [
            production_event("ACT-REGISTER", "machine_registered", "MC-2", "Registered Machine 02 in stopped state"),
            *accepted_job["events"],  # type: ignore[misc]
        ]
        accepted_machine = apply_event(
            accepted_job,
            "production.machine.registered",
            with_machine,
            "ACT-REGISTER",
        )
        self.assertEqual(accepted_machine["machines"][0], new_machine)  # type: ignore[index]

        changed_existing = deepcopy(with_machine)
        changed_existing["machines"][1]["name"] = "Rewritten machine"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(accepted_job, "production.machine.registered", changed_existing, "ACT-REGISTER")

    def test_issue_open_and_resolution_preserve_attributed_terminal_evidence(self) -> None:
        current = output_state(production_state())
        issue = {
            "id": "ISS-1",
            "createdAt": NOW,
            "area": "Line 01",
            "kind": "quality",
            "summary": "Measured defect requires review",
            "status": "open",
        }
        opened = deepcopy(current)
        opened["revision"] = int(current["revision"]) + 1
        opened["issues"] = [issue]
        opened["events"] = [
            production_event("ACT-OPEN", "issue_opened", "ISS-1", "Opened quality issue for Line 01"),
            *current["events"],  # type: ignore[misc]
        ]
        current = apply_event(current, "production.issue.opened", opened, "ACT-OPEN")

        resolved = deepcopy(current)
        resolved["revision"] = int(current["revision"]) + 1
        resolved["issues"][0].update(  # type: ignore[index]
            {
                "status": "resolved",
                "resolution": {
                    "actionId": "ACT-RESOLVE",
                    "resolvedAt": NOW,
                    "resolvedBy": "Accountable operator",
                    "reason": "Verified against the shift record.",
                    "evidenceReference": "EV-ACT-RESOLVE",
                },
            }
        )
        resolved["events"] = [
            production_event("ACT-RESOLVE", "issue_resolved", "ISS-1", "Resolved quality issue for Line 01"),
            *current["events"],  # type: ignore[misc]
        ]
        accepted = apply_event(current, "production.issue.resolved", resolved, "ACT-RESOLVE")
        self.assertEqual(accepted["issues"][0]["status"], "resolved")  # type: ignore[index]

        changed_summary = deepcopy(resolved)
        changed_summary["issues"][0]["summary"] = "Rewritten history"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "production.issue.resolved", changed_summary, "ACT-RESOLVE")

    def test_machine_state_records_but_does_not_skip_lifecycle_steps(self) -> None:
        current = production_state()
        running = deepcopy(current)
        running["revision"] = 1
        running["machines"][0]["state"] = "running"  # type: ignore[index]
        running["events"] = [
            production_event(
                "ACT-MACHINE",
                "machine_state_changed",
                "MC-1",
                "Machine 01: stopped to running",
                fromState="stopped",
                toState="running",
            )
        ]
        accepted = apply_event(current, "production.machine.state_changed", running, "ACT-MACHINE")
        self.assertEqual(accepted["machines"][0]["state"], "running")  # type: ignore[index]

        skipped = deepcopy(running)
        skipped["machines"][0]["state"] = "attention"  # type: ignore[index]
        skipped["events"][0]["toState"] = "attention"  # type: ignore[index]
        skipped["events"][0]["summary"] = "Machine 01: stopped to attention"  # type: ignore[index]
        with self.assertRaises(TrialValidationError):
            apply_event(current, "production.machine.state_changed", skipped, "ACT-MACHINE")

    def test_store_preserves_versions_replay_and_authenticated_actor(self) -> None:
        store = InMemoryTrialStore(reducer=reduce_trial_state)
        principal = TrialPrincipal("workspace-a", "user-a", "human")
        store.provision_membership(
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            actor_kind=principal.actor_kind,
            capabilities=("production.write",),
        )
        initialize_id = str(uuid4())
        initialized = store.apply_command(
            principal,
            command_id=initialize_id,
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload={"state": production_state(), "evidence": evidence("ACT-INITIALIZE")},
        )
        replay = store.apply_command(
            principal,
            command_id=initialize_id,
            surface="production",
            event_type="production.workspace.initialized",
            expected_version=0,
            payload={"state": production_state(), "evidence": evidence("ACT-INITIALIZE")},
        )
        recorded_state = output_state(production_state())
        recorded = store.apply_command(
            principal,
            command_id=str(uuid4()),
            surface="production",
            event_type="production.output.recorded",
            expected_version=initialized.version,
            payload={"state": recorded_state, "evidence": evidence("ACT-OUTPUT")},
        )
        self.assertEqual(initialized.version, 1)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(recorded.version, 2)
        stored = store.get_state(principal, "production")
        self.assertEqual(stored.updated_by, principal.actor_id)
        self.assertEqual(stored.state, recorded_state)

    def test_legacy_snapshot_and_unknown_fields_fail_closed(self) -> None:
        invalid = production_state()
        invalid["telemetry_controlled"] = True
        with self.assertRaises(TrialValidationError):
            apply_event({}, "production.workspace.initialized", invalid, "ACT-INITIALIZE")
        with self.assertRaises(TrialValidationError):
            apply_event({}, "production.snapshot.saved", production_state(), "ACT-INITIALIZE")


if __name__ == "__main__":
    unittest.main()
