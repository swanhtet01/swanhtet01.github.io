"""Fail-closed Production state and lifecycle validation for managed workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime
from typing import Any, Callable

from supermega_runtime.trial_store import TrialValidationError


PRODUCTION_SCHEMA = "supermega.production.workspace.v2"
PRODUCTION_EVENTS = frozenset(
    {
        "production.workspace.initialized",
        "production.job.created",
        "production.output.recorded",
        "production.issue.opened",
        "production.issue.resolved",
        "production.machine_state.changed",
    }
)
PRODUCTION_HUMAN_EVENTS = PRODUCTION_EVENTS

_ISSUE_KINDS = frozenset({"quality", "maintenance", "materials", "operations"})
_MACHINE_STATES = frozenset({"running", "attention", "stopped"})
_EVENT_KIND_BY_TYPE = {
    "production.job.created": "job_created",
    "production.output.recorded": "output_recorded",
    "production.issue.opened": "issue_opened",
    "production.issue.resolved": "issue_resolved",
    "production.machine_state.changed": "machine_state_changed",
}
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_JOBS = 100
_MAX_ISSUES = 500
_MAX_MACHINES = 100
_MAX_EVENTS = 500

_STATE_FIELDS = frozenset({"schema", "revision", "jobs", "issues", "machines", "events"})
_JOB_FIELDS = frozenset({"id", "line", "product", "target", "output"})
_ISSUE_REQUIRED_FIELDS = frozenset({"id", "createdAt", "area", "kind", "summary", "status"})
_ISSUE_OPTIONAL_FIELDS = frozenset({"resolution"})
_MACHINE_FIELDS = frozenset({"id", "name", "state"})
_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})
_RESOLUTION_FIELDS = frozenset({"actionId", "resolvedAt", "resolvedBy", "reason", "evidenceReference"})
_EVENT_FIELDS = frozenset(
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
    }
)


def _object(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise TrialValidationError(f"{field} must be an object.")
    if any(not isinstance(key, str) for key in value):
        raise TrialValidationError(f"{field} keys must be strings.")
    return dict(value)


def _exact_fields(
    value: Mapping[str, Any],
    field: str,
    *,
    required: frozenset[str],
    optional: frozenset[str] = frozenset(),
) -> None:
    fields = set(value)
    missing = sorted(required - fields)
    extra = sorted(fields - required - optional)
    if missing:
        raise TrialValidationError(f"{field} is missing fields: {', '.join(missing)}.")
    if extra:
        raise TrialValidationError(f"{field} has unsupported fields: {', '.join(extra)}.")


def _text(value: object, field: str, *, maximum: int = 180) -> str:
    if (
        not isinstance(value, str)
        or not value.strip()
        or value != value.strip()
        or len(value) > maximum
    ):
        raise TrialValidationError(
            f"{field} must be canonical non-empty text of at most {maximum} characters."
        )
    return value


def _timestamp(value: object, field: str) -> str:
    timestamp = _text(value, field, maximum=40)
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise TrialValidationError(f"{field} must be an ISO-8601 timestamp.") from exc
    if parsed.tzinfo is None:
        raise TrialValidationError(f"{field} must include a timezone.")
    return timestamp


def _integer(value: object, field: str, *, minimum: int = 0) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not minimum <= value <= _MAX_SAFE_INTEGER
    ):
        raise TrialValidationError(f"{field} must be a safe integer of at least {minimum}.")
    return value


def _list(value: object, field: str, *, maximum: int) -> list[Any]:
    if not isinstance(value, list):
        raise TrialValidationError(f"{field} must be an array.")
    if len(value) > maximum:
        raise TrialValidationError(f"{field} exceeds the {maximum}-record limit.")
    return value


def _unique(values: Sequence[str], field: str) -> None:
    if len(set(values)) != len(values):
        raise TrialValidationError(f"{field} values must be unique.")


def _evidence(value: object) -> dict[str, str]:
    evidence = _object(value, "evidence")
    _exact_fields(evidence, "evidence", required=_EVIDENCE_FIELDS)
    return {
        "actionId": _text(
            evidence["actionId"],
            "evidence.actionId",
            maximum=160,
        ),
        "capturedAt": _timestamp(evidence["capturedAt"], "evidence.capturedAt"),
        "actor": _text(evidence["actor"], "evidence.actor"),
        "reason": _text(evidence["reason"], "evidence.reason"),
        "evidenceReference": _text(
            evidence["evidenceReference"],
            "evidence.evidenceReference",
        ),
    }


def _resolution(value: object, field: str) -> dict[str, Any]:
    resolution = _object(value, field)
    _exact_fields(resolution, field, required=_RESOLUTION_FIELDS)
    _text(resolution["actionId"], f"{field}.actionId", maximum=160)
    _timestamp(resolution["resolvedAt"], f"{field}.resolvedAt")
    _text(resolution["resolvedBy"], f"{field}.resolvedBy")
    _text(resolution["reason"], f"{field}.reason")
    _text(resolution["evidenceReference"], f"{field}.evidenceReference")
    return resolution


def _validate_job(candidate: object, index: int) -> dict[str, Any]:
    field = f"jobs[{index}]"
    job = _object(candidate, field)
    _exact_fields(job, field, required=_JOB_FIELDS)
    _text(job["id"], f"{field}.id", maximum=80)
    _text(job["line"], f"{field}.line", maximum=120)
    _text(job["product"], f"{field}.product")
    target = _integer(job["target"], f"{field}.target", minimum=1)
    output = _integer(job["output"], f"{field}.output")
    if output > target:
        raise TrialValidationError(f"{field}.output cannot exceed its target.")
    return job


def _validate_issue(candidate: object, index: int) -> dict[str, Any]:
    field = f"issues[{index}]"
    issue = _object(candidate, field)
    _exact_fields(
        issue,
        field,
        required=_ISSUE_REQUIRED_FIELDS,
        optional=_ISSUE_OPTIONAL_FIELDS,
    )
    _text(issue["id"], f"{field}.id", maximum=80)
    _timestamp(issue["createdAt"], f"{field}.createdAt")
    _text(issue["area"], f"{field}.area", maximum=120)
    _text(issue["summary"], f"{field}.summary", maximum=240)
    if not isinstance(issue["kind"], str) or issue["kind"] not in _ISSUE_KINDS:
        raise TrialValidationError(f"{field}.kind is unsupported.")
    if (
        not isinstance(issue["status"], str)
        or issue["status"] not in {"open", "resolved"}
    ):
        raise TrialValidationError(f"{field}.status must be open or resolved.")
    if issue["status"] == "open":
        if "resolution" in issue:
            raise TrialValidationError(f"{field} is open but has resolution evidence.")
    elif "resolution" not in issue:
        raise TrialValidationError(f"{field} is resolved without resolution evidence.")
    else:
        _resolution(issue["resolution"], f"{field}.resolution")
    return issue


def _validate_machine(candidate: object, index: int) -> dict[str, Any]:
    field = f"machines[{index}]"
    machine = _object(candidate, field)
    _exact_fields(machine, field, required=_MACHINE_FIELDS)
    _text(machine["id"], f"{field}.id", maximum=80)
    _text(machine["name"], f"{field}.name")
    if (
        not isinstance(machine["state"], str)
        or machine["state"] not in _MACHINE_STATES
    ):
        raise TrialValidationError(f"{field}.state is unsupported.")
    return machine


def _validate_event(
    candidate: object,
    index: int,
    *,
    job_ids: frozenset[str],
    issue_ids: frozenset[str],
    machine_ids: frozenset[str],
) -> dict[str, Any]:
    field = f"events[{index}]"
    event = _object(candidate, field)
    kind = event.get("kind")
    if not isinstance(kind, str):
        raise TrialValidationError(f"{field}.kind is unsupported.")
    if kind == "output_recorded":
        required = _EVENT_FIELDS | {"quantity"}
    elif kind == "machine_state_changed":
        required = _EVENT_FIELDS | {"fromState", "toState"}
    elif kind in {"job_created", "issue_opened", "issue_resolved"}:
        required = _EVENT_FIELDS
    else:
        raise TrialValidationError(f"{field}.kind is unsupported.")
    _exact_fields(event, field, required=frozenset(required))

    action_id = _text(event["actionId"], f"{field}.actionId", maximum=160)
    event_id = _text(event["id"], f"{field}.id", maximum=164)
    if event_id != f"EVT-{action_id}":
        raise TrialValidationError(f"{field}.id must be derived from its actionId.")
    _timestamp(event["createdAt"], f"{field}.createdAt")
    for name in ("actor", "reason", "evidenceReference"):
        _text(event[name], f"{field}.{name}")
    _text(event["summary"], f"{field}.summary", maximum=360)
    subject_id = _text(event["subjectId"], f"{field}.subjectId", maximum=80)

    if kind == "output_recorded":
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
        _integer(event["quantity"], f"{field}.quantity", minimum=1)
    elif kind == "job_created":
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
    elif kind == "machine_state_changed":
        if subject_id not in machine_ids:
            raise TrialValidationError(f"{field} references an unknown machine.")
        before = event["fromState"]
        after = event["toState"]
        if (
            not isinstance(before, str)
            or not isinstance(after, str)
            or before not in _MACHINE_STATES
            or after not in _MACHINE_STATES
        ):
            raise TrialValidationError(f"{field} has unsupported machine states.")
        if before == after:
            raise TrialValidationError(
                f"{field} must record a distinct machine observation."
            )
    elif subject_id not in issue_ids:
        raise TrialValidationError(f"{field} references an unknown issue.")
    return event


def _validate_issue_history(
    issues: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, issue in enumerate(issues):
        opened = [
            event
            for event in events
            if event["kind"] == "issue_opened" and event["subjectId"] == issue["id"]
        ]
        resolved = [
            event
            for event in events
            if event["kind"] == "issue_resolved" and event["subjectId"] == issue["id"]
        ]
        if len(opened) != 1:
            raise TrialValidationError(
                f"issues[{index}] must be backed by exactly one opening event."
            )
        if issue["status"] == "open":
            if resolved:
                raise TrialValidationError(
                    f"issues[{index}] is open but has a resolution event."
                )
            continue
        if len(resolved) != 1:
            raise TrialValidationError(
                f"issues[{index}] must be backed by exactly one resolution event."
            )
        resolution = issue["resolution"]
        event = resolved[0]
        if (
            event["actionId"] != resolution["actionId"]
            or event["createdAt"] != resolution["resolvedAt"]
            or event["actor"] != resolution["resolvedBy"]
            or event["reason"] != resolution["reason"]
            or event["evidenceReference"] != resolution["evidenceReference"]
        ):
            raise TrialValidationError(
                f"issues[{index}] resolution does not match its immutable event."
            )
        if events.index(event) >= events.index(opened[0]):
            raise TrialValidationError(
                f"issues[{index}] resolution must follow its opening event."
            )


def _validate_output_history(
    jobs: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, job in enumerate(jobs):
        recorded = sum(
            event["quantity"]
            for event in events
            if event["kind"] == "output_recorded" and event["subjectId"] == job["id"]
        )
        if recorded != job["output"]:
            raise TrialValidationError(
                f"jobs[{index}].output must equal its immutable output event total."
            )


def _validate_job_history(
    jobs: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    if not jobs:
        raise TrialValidationError("Production must retain its initial job.")
    initial_job_id = jobs[-1]["id"]
    created_events = [
        event for event in events if event["kind"] == "job_created"
    ]
    if len(created_events) != len(jobs) - 1:
        raise TrialValidationError(
            "Every job after the initial job requires one immutable creation event."
        )
    for index, job in enumerate(jobs):
        matches = [
            event
            for event in created_events
            if event["subjectId"] == job["id"]
        ]
        if job["id"] == initial_job_id:
            if matches:
                raise TrialValidationError(
                    "The initial Production job cannot have a later creation event."
                )
            continue
        if len(matches) != 1:
            raise TrialValidationError(
                f"jobs[{index}] must be backed by exactly one creation event."
            )
        creation_index = events.index(matches[0])
        if any(
            events.index(event) >= creation_index
            for event in events
            if event["kind"] == "output_recorded"
            and event["subjectId"] == job["id"]
        ):
            raise TrialValidationError(
                f"jobs[{index}] output cannot predate its creation event."
            )


def _validate_machine_history(
    machines: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, machine in enumerate(machines):
        newest_first = [
            event
            for event in events
            if event["kind"] == "machine_state_changed"
            and event["subjectId"] == machine["id"]
        ]
        if not newest_first:
            if machine["state"] != "running":
                raise TrialValidationError(
                    f"machines[{index}] must begin running before state changes."
                )
            continue
        oldest_first = list(reversed(newest_first))
        if oldest_first[0]["fromState"] != "running":
            raise TrialValidationError(
                f"machines[{index}] history must begin from running."
            )
        for before, after in zip(oldest_first, oldest_first[1:], strict=False):
            if before["toState"] != after["fromState"]:
                raise TrialValidationError(
                    f"machines[{index}] history contains a state gap."
                )
        if newest_first[0]["toState"] != machine["state"]:
            raise TrialValidationError(
                f"machines[{index}] state must match its latest immutable event."
            )


def validate_production_state(value: object) -> dict[str, Any]:
    """Validate a complete managed Production workspace without repairing it."""

    state = _object(value, "production state")
    _exact_fields(state, "production state", required=_STATE_FIELDS)
    if state.get("schema") != PRODUCTION_SCHEMA:
        raise TrialValidationError(
            f"production state schema must be {PRODUCTION_SCHEMA}."
        )
    revision = _integer(state["revision"], "production state.revision")
    jobs_raw = _list(state["jobs"], "production state.jobs", maximum=_MAX_JOBS)
    issues_raw = _list(
        state["issues"],
        "production state.issues",
        maximum=_MAX_ISSUES,
    )
    machines_raw = _list(
        state["machines"],
        "production state.machines",
        maximum=_MAX_MACHINES,
    )
    events_raw = _list(
        state["events"],
        "production state.events",
        maximum=_MAX_EVENTS,
    )

    jobs = [_validate_job(candidate, index) for index, candidate in enumerate(jobs_raw)]
    issues = [
        _validate_issue(candidate, index)
        for index, candidate in enumerate(issues_raw)
    ]
    machines = [
        _validate_machine(candidate, index)
        for index, candidate in enumerate(machines_raw)
    ]
    job_ids = [job["id"] for job in jobs]
    issue_ids = [issue["id"] for issue in issues]
    machine_ids = [machine["id"] for machine in machines]
    _unique(job_ids, "Production job ID")
    _unique(issue_ids, "Production issue ID")
    _unique(machine_ids, "Production machine ID")

    events = [
        _validate_event(
            candidate,
            index,
            job_ids=frozenset(job_ids),
            issue_ids=frozenset(issue_ids),
            machine_ids=frozenset(machine_ids),
        )
        for index, candidate in enumerate(events_raw)
    ]
    _unique([event["id"] for event in events], "Production event ID")
    _unique([event["actionId"] for event in events], "Production action ID")
    if revision != len(events):
        raise TrialValidationError(
            "Production revision must equal the append-only event count."
        )

    _validate_job_history(jobs, events)
    _validate_output_history(jobs, events)
    _validate_issue_history(issues, events)
    _validate_machine_history(machines, events)
    return deepcopy(state)


def _payload(
    payload: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, str]]:
    if set(payload) != {"state", "evidence"}:
        raise TrialValidationError(
            "Production payload must contain exactly state and evidence objects."
        )
    return validate_production_state(payload.get("state")), _evidence(
        payload.get("evidence")
    )


def _require_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    *fields: str,
) -> None:
    changed = [field for field in fields if current[field] != next_state[field]]
    if changed:
        raise TrialValidationError(f"event cannot change: {', '.join(changed)}.")


def _one_changed(
    current: Sequence[Any],
    next_values: Sequence[Any],
    field: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    if len(current) != len(next_values):
        raise TrialValidationError(
            f"{field} must preserve its record count for this event."
        )
    changes = [
        index
        for index, (before, after) in enumerate(
            zip(current, next_values, strict=True)
        )
        if before != after
    ]
    if len(changes) != 1:
        raise TrialValidationError(
            f"{field} must change exactly one existing record."
        )
    index = changes[0]
    before = _object(current[index], f"current {field}[{index}]")
    after = _object(next_values[index], f"next {field}[{index}]")
    if before.get("id") != after.get("id"):
        raise TrialValidationError(f"{field} record identity cannot change.")
    return before, after


def _appended_event(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    *,
    event_type: str,
    evidence: Mapping[str, str],
) -> dict[str, Any]:
    if next_state["revision"] != current["revision"] + 1:
        raise TrialValidationError(
            "Production event must advance revision by exactly one."
        )
    if (
        len(next_state["events"]) != len(current["events"]) + 1
        or next_state["events"][1:] != current["events"]
    ):
        raise TrialValidationError(
            "Production event must prepend exactly one record and preserve history."
        )
    event = next_state["events"][0]
    expected_kind = _EVENT_KIND_BY_TYPE[event_type]
    if event["kind"] != expected_kind:
        raise TrialValidationError(
            f"{event_type} requires one {expected_kind} event."
        )
    if any(
        event[event_field] != evidence[evidence_field]
        for event_field, evidence_field in (
            ("actionId", "actionId"),
            ("createdAt", "capturedAt"),
            ("actor", "actor"),
            ("reason", "reason"),
            ("evidenceReference", "evidenceReference"),
        )
    ):
        raise TrialValidationError(
            "command evidence must match the appended Production event."
        )
    return event


def _validate_output_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "issues", "machines")
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    quantity = event["quantity"]
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "output event must reference the one changed job."
        )
    if after != {**before, "output": before["output"] + quantity}:
        raise TrialValidationError(
            "output event may only add its exact quantity to one job."
        )
    if event["summary"] != f"Recorded {quantity} good units":
        raise TrialValidationError("output event summary is not canonical.")


def _validate_job_created(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "issues", "machines")
    if (
        len(next_state["jobs"]) != len(current["jobs"]) + 1
        or next_state["jobs"][1:] != current["jobs"]
    ):
        raise TrialValidationError(
            "production.job.created must prepend exactly one job."
        )
    job = next_state["jobs"][0]
    if job["output"] != 0:
        raise TrialValidationError("a new Production job must begin at zero output.")
    if event["subjectId"] != job["id"]:
        raise TrialValidationError("job creation event must reference the new job.")
    expected_summary = f"Created {job['product']} job for {job['line']}"
    if event["summary"] != expected_summary:
        raise TrialValidationError("job creation summary is not canonical.")


def _validate_issue_opened(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "machines")
    if (
        len(next_state["issues"]) != len(current["issues"]) + 1
        or next_state["issues"][1:] != current["issues"]
    ):
        raise TrialValidationError(
            "production.issue.opened must prepend exactly one issue."
        )
    issue = next_state["issues"][0]
    if issue["status"] != "open" or "resolution" in issue:
        raise TrialValidationError("a new Production issue must begin open.")
    if event["subjectId"] != issue["id"]:
        raise TrialValidationError("opening event must reference the new issue.")
    expected_summary = f"Opened {issue['kind']} issue for {issue['area']}"
    if event["summary"] != expected_summary:
        raise TrialValidationError("issue opening summary is not canonical.")


def _validate_issue_resolved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "machines")
    before, after = _one_changed(
        current["issues"],
        next_state["issues"],
        "issues",
    )
    if before["status"] != "open" or "resolution" in before:
        raise TrialValidationError("only an open issue can be resolved.")
    resolution = {
        "actionId": event["actionId"],
        "resolvedAt": event["createdAt"],
        "resolvedBy": event["actor"],
        "reason": event["reason"],
        "evidenceReference": event["evidenceReference"],
    }
    if after != {**before, "status": "resolved", "resolution": resolution}:
        raise TrialValidationError(
            "issue resolution may change only status and exact command evidence."
        )
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "resolution event must reference the one changed issue."
        )
    expected_summary = f"Resolved {before['kind']} issue for {before['area']}"
    if event["summary"] != expected_summary:
        raise TrialValidationError("issue resolution summary is not canonical.")


def _validate_machine_state_changed(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "issues")
    before, after = _one_changed(
        current["machines"],
        next_state["machines"],
        "machines",
    )
    observed_state = event["toState"]
    if (
        event["fromState"] != before["state"]
        or observed_state == before["state"]
    ):
        raise TrialValidationError(
            "machine observation must start from the current recorded state "
            "and change it."
        )
    if after != {**before, "state": observed_state}:
        raise TrialValidationError(
            "machine observation may change only the one recorded state."
        )
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "machine event must describe the one exact state transition."
        )
    expected_summary = (
        f"{before['name']}: {before['state']} to {observed_state}"
    )
    if event["summary"] != expected_summary:
        raise TrialValidationError("machine state summary is not canonical.")


_TRANSITION_VALIDATORS: dict[
    str,
    Callable[
        [Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]],
        None,
    ],
] = {
    "production.job.created": _validate_job_created,
    "production.output.recorded": _validate_output_recorded,
    "production.issue.opened": _validate_issue_opened,
    "production.issue.resolved": _validate_issue_resolved,
    "production.machine_state.changed": _validate_machine_state_changed,
}


def reduce_production_state(
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Accept exactly one declared Production lifecycle transition per command."""

    if event_type not in PRODUCTION_EVENTS:
        raise TrialValidationError(
            "event_type must be a supported Production lifecycle event."
        )
    next_state, evidence = _payload(payload)
    if event_type == "production.workspace.initialized":
        if dict(current):
            raise TrialValidationError("managed Production is already initialized.")
        if (
            next_state["revision"] != 0
            or len(next_state["jobs"]) != 1
            or len(next_state["machines"]) != 1
            or next_state["issues"]
            or next_state["events"]
            or next_state["jobs"][0]["output"] != 0
            or next_state["machines"][0]["state"] != "running"
        ):
            raise TrialValidationError(
                "Production initialization requires one real zero-output job, "
                "one running machine, and no copied operating history."
            )
        return next_state

    current_state = validate_production_state(current)
    event = _appended_event(
        current_state,
        next_state,
        event_type=event_type,
        evidence=evidence,
    )
    _TRANSITION_VALIDATORS[event_type](current_state, next_state, event)
    return next_state


__all__ = [
    "PRODUCTION_EVENTS",
    "PRODUCTION_HUMAN_EVENTS",
    "PRODUCTION_SCHEMA",
    "reduce_production_state",
    "validate_production_state",
]
