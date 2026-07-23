"""Fail-closed Production state and event validation for managed workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime
from typing import Any

from supermega_runtime.trial_store import TrialValidationError


PRODUCTION_SCHEMA = "supermega.production.workspace.v2"
PRODUCTION_EVENTS = frozenset(
    {
        "production.workspace.initialized",
        "production.job.created",
        "production.output.recorded",
        "production.issue.opened",
        "production.issue.resolved",
        "production.machine.registered",
        "production.machine.state_changed",
    }
)
_ISSUE_KINDS = ("quality", "maintenance", "materials", "operations")
_MACHINE_STATES = ("running", "attention", "stopped")
_MACHINE_TRANSITIONS = {"running": "attention", "attention": "stopped", "stopped": "running"}
_EVENT_KINDS = (
    "job_created",
    "output_recorded",
    "issue_opened",
    "issue_resolved",
    "machine_registered",
    "machine_state_changed",
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991

_STATE_FIELDS = frozenset({"schema", "revision", "jobs", "issues", "machines", "events"})
_JOB_FIELDS = frozenset({"id", "line", "product", "target", "output"})
_ISSUE_FIELDS = frozenset({"id", "createdAt", "area", "kind", "summary", "status", "resolution"})
_RESOLUTION_FIELDS = frozenset({"actionId", "resolvedAt", "resolvedBy", "reason", "evidenceReference"})
_MACHINE_FIELDS = frozenset({"id", "name", "state"})
_EVENT_REQUIRED_FIELDS = frozenset(
    {"id", "actionId", "createdAt", "actor", "reason", "evidenceReference", "kind", "subjectId", "summary"}
)
_EVENT_OPTIONAL_FIELDS = frozenset({"quantity", "fromState", "toState"})
_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})


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


def _text(value: object, field: str, *, maximum: int = 240) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip() or len(value) > maximum:
        raise TrialValidationError(f"{field} must be canonical non-empty text of at most {maximum} characters.")
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
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= _MAX_SAFE_INTEGER:
        raise TrialValidationError(f"{field} must be a safe integer of at least {minimum}.")
    return value


def _list(value: object, field: str) -> list[Any]:
    if not isinstance(value, list):
        raise TrialValidationError(f"{field} must be an array.")
    return value


def _unique(values: Sequence[str], field: str) -> None:
    if len(set(values)) != len(values):
        raise TrialValidationError(f"{field} values must be unique.")


def validate_production_state(value: object) -> dict[str, Any]:
    """Validate the complete managed Production snapshot without repairing it."""

    state = _object(value, "production state")
    _exact_fields(state, "production state", required=_STATE_FIELDS)
    if state.get("schema") != PRODUCTION_SCHEMA:
        raise TrialValidationError(f"production state schema must be {PRODUCTION_SCHEMA}.")
    revision = _integer(state["revision"], "production state.revision")
    jobs = _list(state["jobs"], "production state.jobs")
    issues = _list(state["issues"], "production state.issues")
    machines = _list(state["machines"], "production state.machines")
    events = _list(state["events"], "production state.events")

    job_ids: list[str] = []
    job_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(jobs):
        job = _object(candidate, f"jobs[{index}]")
        _exact_fields(job, f"jobs[{index}]", required=_JOB_FIELDS)
        job_id = _text(job["id"], f"jobs[{index}].id", maximum=160)
        _text(job["line"], f"jobs[{index}].line", maximum=160)
        _text(job["product"], f"jobs[{index}].product", maximum=180)
        target = _integer(job["target"], f"jobs[{index}].target", minimum=1)
        output = _integer(job["output"], f"jobs[{index}].output")
        if output > target:
            raise TrialValidationError(f"jobs[{index}].output exceeds target.")
        job_ids.append(job_id)
        job_by_id[job_id] = job
    _unique(job_ids, "Production job ID")

    issue_ids: list[str] = []
    issue_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(issues):
        issue = _object(candidate, f"issues[{index}]")
        _exact_fields(
            issue,
            f"issues[{index}]",
            required=_ISSUE_FIELDS - {"resolution"},
            optional=frozenset({"resolution"}),
        )
        issue_id = _text(issue["id"], f"issues[{index}].id", maximum=160)
        _timestamp(issue["createdAt"], f"issues[{index}].createdAt")
        _text(issue["area"], f"issues[{index}].area", maximum=160)
        _text(issue["summary"], f"issues[{index}].summary")
        if issue["kind"] not in _ISSUE_KINDS:
            raise TrialValidationError(f"issues[{index}].kind is invalid.")
        if issue["status"] not in {"open", "resolved"}:
            raise TrialValidationError(f"issues[{index}].status is invalid.")
        if issue["status"] == "open" and "resolution" in issue:
            raise TrialValidationError(f"issues[{index}] is open but has resolution evidence.")
        if issue["status"] == "resolved" and "resolution" not in issue:
            raise TrialValidationError(f"issues[{index}] is resolved without evidence.")
        if "resolution" in issue:
            resolution = _object(issue["resolution"], f"issues[{index}].resolution")
            _exact_fields(resolution, f"issues[{index}].resolution", required=_RESOLUTION_FIELDS)
            _text(resolution["actionId"], f"issues[{index}].resolution.actionId", maximum=160)
            _timestamp(resolution["resolvedAt"], f"issues[{index}].resolution.resolvedAt")
            _text(resolution["resolvedBy"], f"issues[{index}].resolution.resolvedBy")
            _text(resolution["reason"], f"issues[{index}].resolution.reason")
            _text(resolution["evidenceReference"], f"issues[{index}].resolution.evidenceReference")
        issue_ids.append(issue_id)
        issue_by_id[issue_id] = issue
    _unique(issue_ids, "Production issue ID")

    machine_ids: list[str] = []
    machine_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(machines):
        machine = _object(candidate, f"machines[{index}]")
        _exact_fields(machine, f"machines[{index}]", required=_MACHINE_FIELDS)
        machine_id = _text(machine["id"], f"machines[{index}].id", maximum=160)
        _text(machine["name"], f"machines[{index}].name", maximum=180)
        if machine["state"] not in _MACHINE_STATES:
            raise TrialValidationError(f"machines[{index}].state is invalid.")
        machine_ids.append(machine_id)
        machine_by_id[machine_id] = machine
    _unique(machine_ids, "Production machine ID")

    event_ids: list[str] = []
    action_ids: list[str] = []
    for index, candidate in enumerate(events):
        event = _object(candidate, f"events[{index}]")
        _exact_fields(
            event,
            f"events[{index}]",
            required=_EVENT_REQUIRED_FIELDS,
            optional=_EVENT_OPTIONAL_FIELDS,
        )
        event_id = _text(event["id"], f"events[{index}].id", maximum=180)
        action_id = _text(event["actionId"], f"events[{index}].actionId", maximum=160)
        if event_id != f"EVT-{action_id}":
            raise TrialValidationError(f"events[{index}].id does not match its action.")
        _timestamp(event["createdAt"], f"events[{index}].createdAt")
        for field in ("actor", "reason", "evidenceReference", "subjectId", "summary"):
            _text(event[field], f"events[{index}].{field}")
        kind = event["kind"]
        if kind not in _EVENT_KINDS:
            raise TrialValidationError(f"events[{index}].kind is invalid.")
        if kind == "job_created":
            if event["subjectId"] not in job_by_id:
                raise TrialValidationError(f"events[{index}] references an unknown job.")
            if any(field in event for field in ("quantity", "fromState", "toState")):
                raise TrialValidationError(f"events[{index}] job event has unrelated fields.")
        elif kind == "output_recorded":
            if event["subjectId"] not in job_by_id:
                raise TrialValidationError(f"events[{index}] references an unknown job.")
            _integer(event.get("quantity"), f"events[{index}].quantity", minimum=1)
            if "fromState" in event or "toState" in event:
                raise TrialValidationError(f"events[{index}] output event has machine state fields.")
        elif kind == "machine_registered":
            if event["subjectId"] not in machine_by_id:
                raise TrialValidationError(f"events[{index}] references an unknown machine.")
            if any(field in event for field in ("quantity", "fromState", "toState")):
                raise TrialValidationError(f"events[{index}] equipment event has unrelated fields.")
        elif kind == "machine_state_changed":
            if event["subjectId"] not in machine_by_id:
                raise TrialValidationError(f"events[{index}] references an unknown machine.")
            if event.get("fromState") not in _MACHINE_STATES or event.get("toState") not in _MACHINE_STATES:
                raise TrialValidationError(f"events[{index}] has invalid machine states.")
            if _MACHINE_TRANSITIONS[event["fromState"]] != event["toState"]:
                raise TrialValidationError(f"events[{index}] has an invalid machine transition.")
            if "quantity" in event:
                raise TrialValidationError(f"events[{index}] machine event has a quantity.")
        else:
            if event["subjectId"] not in issue_by_id:
                raise TrialValidationError(f"events[{index}] references an unknown issue.")
            if any(field in event for field in ("quantity", "fromState", "toState")):
                raise TrialValidationError(f"events[{index}] issue event has unrelated fields.")
        event_ids.append(event_id)
        action_ids.append(action_id)
    _unique(event_ids, "Production event ID")
    _unique(action_ids, "Production action ID")
    if revision != len(events):
        raise TrialValidationError("Production revision must equal the append-only event count.")

    for issue_id, issue in issue_by_id.items():
        if issue["status"] != "resolved":
            continue
        resolution = issue["resolution"]
        matching = [
            event
            for event in events
            if event["kind"] == "issue_resolved"
            and event["subjectId"] == issue_id
            and event["actionId"] == resolution["actionId"]
        ]
        if len(matching) != 1:
            raise TrialValidationError(f"{issue_id} resolution is not backed by exactly one event.")
    for event in events:
        if event["kind"] != "issue_resolved":
            continue
        issue = issue_by_id[event["subjectId"]]
        if issue["status"] != "resolved" or issue["resolution"]["actionId"] != event["actionId"]:
            raise TrialValidationError(f"{event['id']} is not backed by matching issue resolution evidence.")
    for job_id, job in job_by_id.items():
        recorded = sum(
            event["quantity"]
            for event in events
            if event["kind"] == "output_recorded" and event["subjectId"] == job_id
        )
        if recorded > job["output"]:
            raise TrialValidationError(f"Output events exceed the stored output for {job_id}.")
    for machine_id, machine in machine_by_id.items():
        latest = next(
            (event for event in events if event["kind"] == "machine_state_changed" and event["subjectId"] == machine_id),
            None,
        )
        if latest and latest["toState"] != machine["state"]:
            raise TrialValidationError(f"Latest machine event does not match {machine_id}.")
    return deepcopy(state)


def _payload(payload: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    if set(payload) != {"state", "evidence"}:
        raise TrialValidationError("Production payload must contain exactly state and evidence objects.")
    evidence = _object(payload.get("evidence"), "evidence")
    _exact_fields(evidence, "evidence", required=_EVIDENCE_FIELDS)
    validated_evidence = {
        "actionId": _text(evidence["actionId"], "evidence.actionId", maximum=160),
        "capturedAt": _timestamp(evidence["capturedAt"], "evidence.capturedAt"),
        "actor": _text(evidence["actor"], "evidence.actor"),
        "reason": _text(evidence["reason"], "evidence.reason"),
        "evidenceReference": _text(evidence["evidenceReference"], "evidence.evidenceReference"),
    }
    return validate_production_state(payload.get("state")), validated_evidence


def _one_changed(current: list[Any], next_values: list[Any], field: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if len(current) != len(next_values):
        raise TrialValidationError(f"{field} must preserve its record count for this event.")
    changes = [index for index, pair in enumerate(zip(current, next_values, strict=True)) if pair[0] != pair[1]]
    if len(changes) != 1:
        raise TrialValidationError(f"{field} must change exactly one existing record.")
    index = changes[0]
    before = _object(current[index], f"current {field}[{index}]")
    after = _object(next_values[index], f"next {field}[{index}]")
    if before.get("id") != after.get("id"):
        raise TrialValidationError(f"{field} record identity cannot change.")
    return before, after


def _without(value: Mapping[str, Any], fields: frozenset[str]) -> dict[str, Any]:
    return {key: nested for key, nested in value.items() if key not in fields}


def _require_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any], *fields: str) -> None:
    changed = [field for field in fields if current[field] != next_state[field]]
    if changed:
        raise TrialValidationError(f"event cannot change: {', '.join(changed)}.")


def _new_event(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    evidence: Mapping[str, str],
    kind: str,
) -> dict[str, Any]:
    if next_state["revision"] != current["revision"] + 1:
        raise TrialValidationError("Production revision must increase exactly once per event.")
    if len(next_state["events"]) != len(current["events"]) + 1 or next_state["events"][1:] != current["events"]:
        raise TrialValidationError("Production commands must prepend exactly one immutable event.")
    event = next_state["events"][0]
    if event["kind"] != kind or event["id"] != f"EVT-{event['actionId']}":
        raise TrialValidationError(f"Production command requires one {kind} event.")
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
        raise TrialValidationError("command evidence must match the appended Production event.")
    return event


def _validate_job_created(current: Mapping[str, Any], next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    event = _new_event(current, next_state, evidence, "job_created")
    _require_unchanged(current, next_state, "issues", "machines")
    if len(next_state["jobs"]) != len(current["jobs"]) + 1 or next_state["jobs"][1:] != current["jobs"]:
        raise TrialValidationError("production.job.created must prepend exactly one job.")
    job = next_state["jobs"][0]
    if job["output"] != 0:
        raise TrialValidationError("a new Production job must start with zero output.")
    if event["subjectId"] != job["id"] or event["summary"] != f"Created {job['id']} for {job['line']}":
        raise TrialValidationError("job-created event must match the new Production job.")


def _validate_output(current: Mapping[str, Any], next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    event = _new_event(current, next_state, evidence, "output_recorded")
    _require_unchanged(current, next_state, "issues", "machines")
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    if _without(before, frozenset({"output"})) != _without(after, frozenset({"output"})):
        raise TrialValidationError("output recording may change only job output.")
    quantity = after["output"] - before["output"]
    if quantity < 1 or after["output"] > before["target"]:
        raise TrialValidationError("output must increase by a positive quantity within the job target.")
    if event.get("subjectId") != before["id"] or event.get("quantity") != quantity or event.get("summary") != f"Recorded {quantity} good units":
        raise TrialValidationError("output event must match the changed job and exact quantity.")


def _validate_issue_opened(current: Mapping[str, Any], next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    event = _new_event(current, next_state, evidence, "issue_opened")
    _require_unchanged(current, next_state, "jobs", "machines")
    if len(next_state["issues"]) != len(current["issues"]) + 1 or next_state["issues"][1:] != current["issues"]:
        raise TrialValidationError("production.issue.opened must prepend exactly one issue.")
    issue = next_state["issues"][0]
    if issue["status"] != "open" or "resolution" in issue:
        raise TrialValidationError("a new Production issue must start open without resolution evidence.")
    if event["subjectId"] != issue["id"] or event["summary"] != f"Opened {issue['kind']} issue for {issue['area']}":
        raise TrialValidationError("issue-opened event must match the new issue.")


def _validate_issue_resolved(current: Mapping[str, Any], next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    event = _new_event(current, next_state, evidence, "issue_resolved")
    _require_unchanged(current, next_state, "jobs", "machines")
    before, after = _one_changed(current["issues"], next_state["issues"], "issues")
    if before["status"] != "open" or "resolution" in before:
        raise TrialValidationError("only an open issue can be resolved.")
    expected_resolution = {
        "actionId": evidence["actionId"],
        "resolvedAt": evidence["capturedAt"],
        "resolvedBy": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
    }
    if after != {**before, "status": "resolved", "resolution": expected_resolution}:
        raise TrialValidationError("issue resolution may add only the attributed terminal evidence.")
    if event["subjectId"] != before["id"] or event["summary"] != f"Resolved {before['kind']} issue for {before['area']}":
        raise TrialValidationError("issue-resolved event must match the resolved issue.")


def _validate_machine(current: Mapping[str, Any], next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    event = _new_event(current, next_state, evidence, "machine_state_changed")
    _require_unchanged(current, next_state, "jobs", "issues")
    before, after = _one_changed(current["machines"], next_state["machines"], "machines")
    if _without(before, frozenset({"state"})) != _without(after, frozenset({"state"})):
        raise TrialValidationError("machine transition may change only recorded state.")
    if _MACHINE_TRANSITIONS[before["state"]] != after["state"]:
        raise TrialValidationError("machine state must advance exactly one recorded lifecycle step.")
    if (
        event["subjectId"] != before["id"]
        or event.get("fromState") != before["state"]
        or event.get("toState") != after["state"]
        or event["summary"] != f"{before['name']}: {before['state']} to {after['state']}"
    ):
        raise TrialValidationError("machine event must match the exact recorded state change.")


def _validate_machine_registered(current: Mapping[str, Any], next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    event = _new_event(current, next_state, evidence, "machine_registered")
    _require_unchanged(current, next_state, "jobs", "issues")
    if len(next_state["machines"]) != len(current["machines"]) + 1 or next_state["machines"][1:] != current["machines"]:
        raise TrialValidationError("production.machine.registered must prepend exactly one equipment record.")
    machine = next_state["machines"][0]
    if event["subjectId"] != machine["id"] or event["summary"] != f"Registered {machine['name']} in {machine['state']} state":
        raise TrialValidationError("machine-registered event must match the new equipment record.")


_TRANSITION_VALIDATORS = {
    "production.job.created": _validate_job_created,
    "production.output.recorded": _validate_output,
    "production.issue.opened": _validate_issue_opened,
    "production.issue.resolved": _validate_issue_resolved,
    "production.machine.registered": _validate_machine_registered,
    "production.machine.state_changed": _validate_machine,
}


def reduce_production_state(
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Accept only one declared Production lifecycle transition per command."""

    if event_type not in PRODUCTION_EVENTS:
        raise TrialValidationError("event_type must be a supported Production lifecycle event.")
    next_state, evidence = _payload(payload)
    if event_type == "production.workspace.initialized":
        if dict(current):
            raise TrialValidationError("managed Production is already initialized.")
        if (
            next_state["revision"] != 0
            or not next_state["jobs"]
            or not next_state["machines"]
            or next_state["issues"]
            or next_state["events"]
            or any(job["output"] != 0 for job in next_state["jobs"])
        ):
            raise TrialValidationError("Production initialization requires jobs and machines with no output or operating history.")
        return next_state

    current_state = validate_production_state(current)
    _TRANSITION_VALIDATORS[event_type](current_state, next_state, evidence)
    return next_state


__all__ = ["PRODUCTION_EVENTS", "PRODUCTION_SCHEMA", "reduce_production_state", "validate_production_state"]
