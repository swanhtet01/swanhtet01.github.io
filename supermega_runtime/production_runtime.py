"""Fail-closed Production state and lifecycle validation for managed workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Callable

from supermega_runtime.trial_store import TrialValidationError


PRODUCTION_SCHEMA = "supermega.production.workspace.v2"
PRODUCTION_EVENTS = frozenset(
    {
        "production.workspace.initialized",
        "production.job.created",
        "production.output.recorded",
        "production.material.consumed",
        "production.issue.opened",
        "production.issue.resolved",
        "production.quality_hold.placed",
        "production.quality_hold.released",
        "production.machine_state.changed",
        "production.downtime.started",
        "production.downtime.ended",
    }
)
PRODUCTION_HUMAN_EVENTS = PRODUCTION_EVENTS

_ISSUE_KINDS = frozenset({"quality", "maintenance", "materials", "operations"})
_ISSUE_SEVERITIES = frozenset({"critical", "high", "medium", "low"})
_MACHINE_STATES = frozenset({"running", "attention", "stopped"})
_OUTPUT_KINDS = frozenset({"good", "scrap"})
_MATERIAL_UNITS = frozenset(
    {"kg", "g", "l", "ml", "pcs", "pack", "bag", "roll", "sheet", "m", "cm"}
)
_EVENT_KIND_BY_TYPE = {
    "production.job.created": "job_created",
    "production.output.recorded": "output_recorded",
    "production.material.consumed": "material_consumed",
    "production.issue.opened": "issue_opened",
    "production.issue.resolved": "issue_resolved",
    "production.quality_hold.placed": "quality_hold_placed",
    "production.quality_hold.released": "quality_hold_released",
    "production.machine_state.changed": "machine_state_changed",
    "production.downtime.started": "downtime_started",
    "production.downtime.ended": "downtime_ended",
}
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_JOBS = 100
_MAX_ISSUES = 500
_MAX_MACHINES = 100

_STATE_FIELDS = frozenset({"schema", "revision", "jobs", "issues", "machines", "events"})
_JOB_REQUIRED_FIELDS = frozenset({"id", "line", "product", "target", "output"})
_JOB_OPTIONAL_FIELDS = frozenset({"scrap", "qualityHold"})
_QUALITY_HOLD_FIELDS = frozenset(
    {"actionId", "heldAt", "heldBy", "reason", "evidenceReference"}
)
_ISSUE_REQUIRED_FIELDS = frozenset({"id", "createdAt", "area", "kind", "summary", "status"})
_ISSUE_ACTION_FIELDS = frozenset({"severity", "owner", "dueAt", "containment"})
_ISSUE_OPTIONAL_FIELDS = _ISSUE_ACTION_FIELDS | {"resolution"}
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
_OUTPUT_EVENT_OPTIONAL_FIELDS = frozenset({"shiftRef", "outputKind"})
_MATERIAL_EVENT_FIELDS = frozenset(
    {"materialRef", "quantity", "materialUnit", "shiftRef"}
)
_MATERIAL_EVENT_OPTIONAL_FIELDS = frozenset({"materialLot"})
_TIMESTAMP_PATTERN = re.compile(
    r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})"
    r"(?:\.([0-9]{1,6}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$"
)
_ISSUE_EVENT_FIELDS = frozenset(
    {"issueSeverity", "issueOwner", "issueDueAt", "issueContainment"}
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


def _parsed_timestamp(value: object, field: str) -> tuple[str, datetime]:
    timestamp = _text(value, field, maximum=40)
    match = _TIMESTAMP_PATTERN.fullmatch(timestamp)
    if match is None:
        raise TrialValidationError(
            f"{field} must be a canonical ISO-8601 timestamp."
        )
    fraction = (match.group(7) or "").ljust(6, "0")
    offset_hours = int(match.group(10) or 0)
    offset_minutes = int(match.group(11) or 0)
    offset_direction = -1 if match.group(9) == "-" else 1
    try:
        offset = timezone(
            offset_direction * timedelta(
                hours=offset_hours,
                minutes=offset_minutes,
            )
        )
        parsed = datetime(
            int(match.group(1)),
            int(match.group(2)),
            int(match.group(3)),
            int(match.group(4)),
            int(match.group(5)),
            int(match.group(6)),
            int(fraction),
            tzinfo=offset,
        )
    except ValueError as exc:
        raise TrialValidationError(
            f"{field} must be a canonical ISO-8601 timestamp."
        ) from exc
    return timestamp, parsed


def _timestamp(value: object, field: str) -> str:
    return _parsed_timestamp(value, field)[0]


def _downtime_timestamp(value: object, field: str) -> str:
    timestamp = _timestamp(value, field)
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    canonical = (
        parsed.astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    if timestamp != canonical:
        raise TrialValidationError(
            f"{field} must be a canonical UTC millisecond timestamp for downtime."
        )
    return timestamp


def _integer(value: object, field: str, *, minimum: int = 0) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not minimum <= value <= _MAX_SAFE_INTEGER
    ):
        raise TrialValidationError(f"{field} must be a safe integer of at least {minimum}.")
    return value


def _material_quantity(value: object, field: str) -> tuple[int, str]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TrialValidationError(
            f"{field} must be positive with at most three decimal places."
        )
    try:
        quantity = Decimal(str(value))
    except InvalidOperation as exc:
        raise TrialValidationError(
            f"{field} must be positive with at most three decimal places."
        ) from exc
    scaled = quantity * 1_000
    if (
        not quantity.is_finite()
        or scaled != scaled.to_integral_value()
        or scaled < 1
        or scaled > _MAX_SAFE_INTEGER
    ):
        raise TrialValidationError(
            f"{field} must be positive with at most three decimal places."
        )
    return int(scaled), format(quantity.normalize(), "f")


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


def _quality_hold(value: object, field: str) -> dict[str, Any]:
    quality_hold = _object(value, field)
    _exact_fields(quality_hold, field, required=_QUALITY_HOLD_FIELDS)
    _text(quality_hold["actionId"], f"{field}.actionId", maximum=160)
    _timestamp(quality_hold["heldAt"], f"{field}.heldAt")
    _text(quality_hold["heldBy"], f"{field}.heldBy")
    _text(quality_hold["reason"], f"{field}.reason")
    _text(
        quality_hold["evidenceReference"],
        f"{field}.evidenceReference",
    )
    return quality_hold


def _validate_job(candidate: object, index: int) -> dict[str, Any]:
    field = f"jobs[{index}]"
    job = _object(candidate, field)
    _exact_fields(
        job,
        field,
        required=_JOB_REQUIRED_FIELDS,
        optional=_JOB_OPTIONAL_FIELDS,
    )
    _text(job["id"], f"{field}.id", maximum=80)
    _text(job["line"], f"{field}.line", maximum=120)
    _text(job["product"], f"{field}.product")
    target = _integer(job["target"], f"{field}.target", minimum=1)
    output = _integer(job["output"], f"{field}.output")
    scrap = _integer(job.get("scrap", 0), f"{field}.scrap")
    if output + scrap > target:
        raise TrialValidationError(f"{field} good plus scrap cannot exceed its target.")
    if "qualityHold" in job:
        _quality_hold(job["qualityHold"], f"{field}.qualityHold")
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
    created_at = _timestamp(issue["createdAt"], f"{field}.createdAt")
    _text(issue["area"], f"{field}.area", maximum=120)
    _text(issue["summary"], f"{field}.summary", maximum=240)
    if not isinstance(issue["kind"], str) or issue["kind"] not in _ISSUE_KINDS:
        raise TrialValidationError(f"{field}.kind is unsupported.")
    action_fields = _ISSUE_ACTION_FIELDS.intersection(issue)
    if action_fields and action_fields != _ISSUE_ACTION_FIELDS:
        raise TrialValidationError(
            f"{field} action fields must be complete or absent for legacy records."
        )
    if action_fields:
        if (
            not isinstance(issue["severity"], str)
            or issue["severity"] not in _ISSUE_SEVERITIES
        ):
            raise TrialValidationError(f"{field}.severity is unsupported.")
        _text(issue["owner"], f"{field}.owner", maximum=120)
        due_at = _timestamp(issue["dueAt"], f"{field}.dueAt")
        if datetime.fromisoformat(due_at.replace("Z", "+00:00")) <= datetime.fromisoformat(
            created_at.replace("Z", "+00:00")
        ):
            raise TrialValidationError(f"{field}.dueAt must follow its creation time.")
        _text(issue["containment"], f"{field}.containment", maximum=240)
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
    elif kind == "material_consumed":
        required = _EVENT_FIELDS | _MATERIAL_EVENT_FIELDS
    elif kind == "machine_state_changed":
        required = _EVENT_FIELDS | {"fromState", "toState"}
    elif kind == "downtime_ended":
        required = _EVENT_FIELDS | {"downtimeStartActionId"}
    elif kind in {
        "job_created",
        "issue_opened",
        "issue_resolved",
        "quality_hold_placed",
        "quality_hold_released",
        "downtime_started",
    }:
        required = _EVENT_FIELDS
    else:
        raise TrialValidationError(f"{field}.kind is unsupported.")
    _exact_fields(
        event,
        field,
        required=frozenset(required),
        optional=(
            _OUTPUT_EVENT_OPTIONAL_FIELDS
            if kind == "output_recorded"
            else _MATERIAL_EVENT_OPTIONAL_FIELDS
            if kind == "material_consumed"
            else _ISSUE_EVENT_FIELDS
            if kind == "issue_opened"
            else frozenset()
        ),
    )

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
        output_kind = event.get("outputKind", "good")
        if not isinstance(output_kind, str) or output_kind not in _OUTPUT_KINDS:
            raise TrialValidationError(f"{field}.outputKind is unsupported.")
        if "shiftRef" in event:
            _text(event["shiftRef"], f"{field}.shiftRef", maximum=80)
    elif kind == "material_consumed":
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
        _, quantity_text = _material_quantity(
            event["quantity"],
            f"{field}.quantity",
        )
        material_ref = _text(
            event["materialRef"],
            f"{field}.materialRef",
            maximum=120,
        )
        if "materialLot" in event:
            _text(event["materialLot"], f"{field}.materialLot", maximum=120)
        material_unit = event["materialUnit"]
        if not isinstance(material_unit, str) or material_unit not in _MATERIAL_UNITS:
            raise TrialValidationError(f"{field}.materialUnit is unsupported.")
        _text(event["shiftRef"], f"{field}.shiftRef", maximum=80)
        lot_summary = (
            f" · lot {event['materialLot']}" if "materialLot" in event else ""
        )
        if (
            event["summary"]
            != f"Used {quantity_text} {material_unit} {material_ref}{lot_summary}"
        ):
            raise TrialValidationError(f"{field}.summary is not canonical.")
    elif kind == "job_created":
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
    elif kind in {"quality_hold_placed", "quality_hold_released"}:
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
    elif kind in {"downtime_started", "downtime_ended"}:
        if subject_id not in machine_ids:
            raise TrialValidationError(f"{field} references an unknown machine.")
        _downtime_timestamp(event["createdAt"], f"{field}.createdAt")
        if kind == "downtime_ended":
            _text(
                event["downtimeStartActionId"],
                f"{field}.downtimeStartActionId",
                maximum=160,
            )
    elif kind == "issue_opened":
        if subject_id not in issue_ids:
            raise TrialValidationError(f"{field} references an unknown issue.")
        snapshot_fields = _ISSUE_EVENT_FIELDS.intersection(event)
        if snapshot_fields and snapshot_fields != _ISSUE_EVENT_FIELDS:
            raise TrialValidationError(
                f"{field} issue snapshot fields must be complete or absent for legacy events."
            )
        if snapshot_fields:
            if (
                not isinstance(event["issueSeverity"], str)
                or event["issueSeverity"] not in _ISSUE_SEVERITIES
            ):
                raise TrialValidationError(f"{field}.issueSeverity is unsupported.")
            _text(event["issueOwner"], f"{field}.issueOwner", maximum=120)
            due_at = _timestamp(event["issueDueAt"], f"{field}.issueDueAt")
            if datetime.fromisoformat(due_at.replace("Z", "+00:00")) <= datetime.fromisoformat(
                event["createdAt"].replace("Z", "+00:00")
            ):
                raise TrialValidationError(
                    f"{field}.issueDueAt must follow confirmation."
                )
            _text(
                event["issueContainment"],
                f"{field}.issueContainment",
                maximum=240,
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
        opening_event = opened[0]
        if datetime.fromisoformat(
            opening_event["createdAt"].replace("Z", "+00:00")
        ) < datetime.fromisoformat(issue["createdAt"].replace("Z", "+00:00")):
            raise TrialValidationError(
                f"issues[{index}] opening event predates the issue record."
            )
        action_fields = _ISSUE_ACTION_FIELDS.intersection(issue)
        snapshot_fields = _ISSUE_EVENT_FIELDS.intersection(opening_event)
        if snapshot_fields:
            expected_snapshot = {
                "issueSeverity": issue.get("severity"),
                "issueOwner": issue.get("owner"),
                "issueDueAt": issue.get("dueAt"),
                "issueContainment": issue.get("containment"),
            }
            if action_fields != _ISSUE_ACTION_FIELDS or any(
                opening_event[field] != value
                for field, value in expected_snapshot.items()
            ):
                raise TrialValidationError(
                    f"issues[{index}] action fields do not match their immutable opening event."
                )
        elif action_fields:
            raise TrialValidationError(
                f"issues[{index}] legacy opening event cannot acquire action fields."
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
    shift_totals: dict[tuple[str, str], int] = {}
    for event in events:
        shift_ref = event.get("shiftRef")
        if event["kind"] != "output_recorded" or shift_ref is None:
            continue
        output_kind = event.get("outputKind", "good")
        shift_key = (shift_ref, output_kind)
        next_total = shift_totals.get(shift_key, 0) + event["quantity"]
        if next_total > _MAX_SAFE_INTEGER:
            raise TrialValidationError(
                f"{output_kind.title()} output for {shift_ref} exceeds the safe integer limit."
            )
        shift_totals[shift_key] = next_total
    for index, job in enumerate(jobs):
        recorded_good = sum(
            event["quantity"]
            for event in events
            if event["kind"] == "output_recorded"
            and event["subjectId"] == job["id"]
            and event.get("outputKind", "good") == "good"
        )
        recorded_scrap = sum(
            event["quantity"]
            for event in events
            if event["kind"] == "output_recorded"
            and event["subjectId"] == job["id"]
            and event.get("outputKind") == "scrap"
        )
        if recorded_good != job["output"]:
            raise TrialValidationError(
                f"jobs[{index}].output must equal its immutable output event total."
            )
        if recorded_scrap != job.get("scrap", 0):
            raise TrialValidationError(
                f"jobs[{index}].scrap must equal its immutable scrap event total."
            )


def _validate_material_history(
    jobs: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    totals: dict[tuple[str, str, str], int] = {}
    for index, event in enumerate(events):
        if event["kind"] != "material_consumed":
            continue
        quantity_milli, _ = _material_quantity(
            event["quantity"],
            f"events[{index}].quantity",
        )
        key = (event["shiftRef"], event["materialRef"], event["materialUnit"])
        next_total = totals.get(key, 0) + quantity_milli
        if next_total > _MAX_SAFE_INTEGER:
            raise TrialValidationError(
                f"Material total for {event['materialRef']} in "
                f"{event['shiftRef']} exceeds the safe fixed-precision limit."
            )
        totals[key] = next_total
    for index, job in enumerate(jobs):
        good_at_event = 0
        scrap_at_event = 0
        for event in reversed(events):
            if event["subjectId"] != job["id"]:
                continue
            if event["kind"] == "material_consumed":
                if good_at_event + scrap_at_event >= job["target"]:
                    raise TrialValidationError(
                        f"jobs[{index}] material use occurred after the job reached target."
                    )
                continue
            if event["kind"] != "output_recorded":
                continue
            if event.get("outputKind", "good") == "scrap":
                scrap_at_event += event["quantity"]
            else:
                good_at_event += event["quantity"]


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
            if event["kind"]
            in {
                "output_recorded",
                "material_consumed",
                "quality_hold_placed",
                "quality_hold_released",
            }
            and event["subjectId"] == job["id"]
        ):
            raise TrialValidationError(
                f"jobs[{index}] activity cannot predate its creation event."
            )
        if any(
            datetime.fromisoformat(event["createdAt"].replace("Z", "+00:00"))
            < datetime.fromisoformat(matches[0]["createdAt"].replace("Z", "+00:00"))
            for event in events
            if event["kind"] == "material_consumed"
            and event["subjectId"] == job["id"]
        ):
            raise TrialValidationError(
                f"jobs[{index}] material use timestamp cannot predate its creation event."
            )


def _validate_quality_hold_history(
    jobs: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, job in enumerate(jobs):
        newest_first = [
            event
            for event in events
            if event["kind"]
            in {"quality_hold_placed", "quality_hold_released"}
            and event["subjectId"] == job["id"]
        ]
        creation_event = next(
            (
                event
                for event in events
                if event["kind"] == "job_created"
                and event["subjectId"] == job["id"]
            ),
            None,
        )
        if creation_event is not None and any(
            datetime.fromisoformat(
                event["createdAt"].replace("Z", "+00:00")
            )
            < datetime.fromisoformat(
                creation_event["createdAt"].replace("Z", "+00:00")
            )
            for event in newest_first
        ):
            raise TrialValidationError(
                f"jobs[{index}] quality hold timestamp predates job creation."
            )
        active_hold: dict[str, Any] | None = None
        previous_activity_at: datetime | None = None
        for event in reversed(newest_first):
            activity_at = datetime.fromisoformat(
                event["createdAt"].replace("Z", "+00:00")
            )
            if (
                previous_activity_at is not None
                and activity_at < previous_activity_at
            ):
                raise TrialValidationError(
                    f"jobs[{index}] quality hold timestamps contradict lifecycle order."
                )
            previous_activity_at = activity_at
            if event["kind"] == "quality_hold_placed":
                if active_hold is not None:
                    raise TrialValidationError(
                        f"jobs[{index}] has a second active quality hold."
                    )
                if event["summary"] != (
                    f"Held {job['product']} for quality review"
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] quality hold summary is not canonical."
                    )
                active_hold = event
            else:
                if active_hold is None:
                    raise TrialValidationError(
                        f"jobs[{index}] releases an unheld quality hold."
                    )
                if event["summary"] != (
                    f"Released {job['product']} from quality hold"
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] quality release summary is not canonical."
                    )
                active_hold = None

        if active_hold is None:
            if "qualityHold" in job:
                raise TrialValidationError(
                    f"jobs[{index}] quality hold has no unmatched hold event."
                )
            continue
        expected_hold = {
            "actionId": active_hold["actionId"],
            "heldAt": active_hold["createdAt"],
            "heldBy": active_hold["actor"],
            "reason": active_hold["reason"],
            "evidenceReference": active_hold["evidenceReference"],
        }
        if job.get("qualityHold") != expected_hold:
            raise TrialValidationError(
                f"jobs[{index}] quality hold does not match its immutable event."
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


def _validate_downtime_history(
    machines: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, machine in enumerate(machines):
        newest_first = [
            event
            for event in events
            if event["kind"] in {"downtime_started", "downtime_ended"}
            and event["subjectId"] == machine["id"]
        ]
        active_start: dict[str, Any] | None = None
        previous_activity_at: datetime | None = None
        for event in reversed(newest_first):
            activity_at = datetime.fromisoformat(
                event["createdAt"].replace("Z", "+00:00")
            )
            if (
                previous_activity_at is not None
                and activity_at < previous_activity_at
            ):
                raise TrialValidationError(
                    f"machines[{index}] downtime timestamps contradict lifecycle order."
                )
            previous_activity_at = activity_at
            if event["kind"] == "downtime_started":
                if active_start is not None:
                    raise TrialValidationError(
                        f"machines[{index}] has a second open downtime interval."
                    )
                if event["summary"] != f"Started downtime for {machine['name']}":
                    raise TrialValidationError(
                        f"machines[{index}] downtime start summary is not canonical."
                    )
                active_start = event
                continue
            if active_start is None:
                raise TrialValidationError(
                    f"machines[{index}] ends downtime that is not open."
                )
            if event["downtimeStartActionId"] != active_start["actionId"]:
                raise TrialValidationError(
                    f"machines[{index}] downtime end does not reference its open interval."
                )
            if event["summary"] != f"Ended downtime for {machine['name']}":
                raise TrialValidationError(
                    f"machines[{index}] downtime end summary is not canonical."
                )
            active_start = None


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
    events_value = state["events"]
    if not isinstance(events_value, list):
        raise TrialValidationError("production state.events must be an array.")
    events_raw = events_value

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
    _validate_material_history(jobs, events)
    _validate_quality_hold_history(jobs, events)
    _validate_issue_history(issues, events)
    _validate_machine_history(machines, events)
    _validate_downtime_history(machines, events)
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
    if "shiftRef" not in event:
        raise TrialValidationError(
            "new output events require one canonical shift reference."
        )
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    quantity = event["quantity"]
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "output event must reference the one changed job."
        )
    output_kind = event.get("outputKind", "good")
    expected = (
        {**before, "scrap": before.get("scrap", 0) + quantity}
        if output_kind == "scrap"
        else {**before, "output": before["output"] + quantity}
    )
    if after != expected:
        raise TrialValidationError(
            f"{output_kind} output may only add its exact quantity to one job."
        )
    if event["summary"] != f"Recorded {quantity} {output_kind} units":
        raise TrialValidationError("output event summary is not canonical.")


def _validate_material_consumed(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "issues", "machines")
    job = next(
        (candidate for candidate in current["jobs"] if candidate["id"] == event["subjectId"]),
        None,
    )
    if job is None:
        raise TrialValidationError("material use must reference one existing job.")
    if job["output"] + job.get("scrap", 0) >= job["target"]:
        raise TrialValidationError("material use can only be recorded for an active job.")
    _, quantity_text = _material_quantity(
        event["quantity"],
        "material use quantity",
    )
    lot_summary = f" · lot {event['materialLot']}" if "materialLot" in event else ""
    expected_summary = (
        f"Used {quantity_text} {event['materialUnit']} {event['materialRef']}"
        f"{lot_summary}"
    )
    if event["summary"] != expected_summary:
        raise TrialValidationError("material use event summary is not canonical.")


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
    if job["output"] != 0 or "scrap" in job or "qualityHold" in job:
        raise TrialValidationError(
            "a new Production job must begin at zero good and scrap output without a quality hold."
        )
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
    if not _ISSUE_ACTION_FIELDS.issubset(issue):
        raise TrialValidationError(
            "a new Production issue requires severity, owner, dueAt, and containment."
        )
    expected_snapshot = {
        "issueSeverity": issue["severity"],
        "issueOwner": issue["owner"],
        "issueDueAt": issue["dueAt"],
        "issueContainment": issue["containment"],
    }
    if any(event.get(field) != value for field, value in expected_snapshot.items()):
        raise TrialValidationError(
            "new Production issue action fields must match the opening event."
        )
    if datetime.fromisoformat(event["createdAt"].replace("Z", "+00:00")) < datetime.fromisoformat(
        issue["createdAt"].replace("Z", "+00:00")
    ):
        raise TrialValidationError(
            "a new Production issue confirmation cannot predate its issue record."
        )
    if datetime.fromisoformat(issue["dueAt"].replace("Z", "+00:00")) <= datetime.fromisoformat(
        event["createdAt"].replace("Z", "+00:00")
    ):
        raise TrialValidationError(
            "a new Production issue due time must follow confirmation."
        )
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


def _validate_quality_hold_placed(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "issues", "machines")
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    if "qualityHold" in before:
        raise TrialValidationError("only an unheld job can receive a quality hold.")
    quality_hold = {
        "actionId": event["actionId"],
        "heldAt": event["createdAt"],
        "heldBy": event["actor"],
        "reason": event["reason"],
        "evidenceReference": event["evidenceReference"],
    }
    if after != {**before, "qualityHold": quality_hold}:
        raise TrialValidationError(
            "quality hold may add only exact command evidence to one job."
        )
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "quality hold event must reference the one changed job."
        )
    if event["summary"] != f"Held {before['product']} for quality review":
        raise TrialValidationError("quality hold summary is not canonical.")


def _validate_quality_hold_released(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "issues", "machines")
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    if "qualityHold" not in before:
        raise TrialValidationError("only a held job can be released.")
    expected = dict(before)
    expected.pop("qualityHold")
    if after != expected:
        raise TrialValidationError(
            "quality release may remove only the current hold from one job."
        )
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "quality release event must reference the one changed job."
        )
    if event["summary"] != f"Released {before['product']} from quality hold":
        raise TrialValidationError("quality release summary is not canonical.")


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


def _open_downtime_event(
    events: Sequence[Mapping[str, Any]],
    machine_id: str,
) -> Mapping[str, Any] | None:
    latest = next(
        (
            event
            for event in events
            if event["subjectId"] == machine_id
            and event["kind"] in {"downtime_started", "downtime_ended"}
        ),
        None,
    )
    return latest if latest is not None and latest["kind"] == "downtime_started" else None


def _validate_downtime_started(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "issues", "machines")
    machine = next(
        (
            candidate
            for candidate in current["machines"]
            if candidate["id"] == event["subjectId"]
        ),
        None,
    )
    if machine is None:
        raise TrialValidationError("downtime start must reference one machine.")
    if _open_downtime_event(current["events"], machine["id"]) is not None:
        raise TrialValidationError(
            "a machine can have at most one open downtime interval."
        )
    if event["summary"] != f"Started downtime for {machine['name']}":
        raise TrialValidationError("downtime start summary is not canonical.")


def _validate_downtime_ended(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "issues", "machines")
    machine = next(
        (
            candidate
            for candidate in current["machines"]
            if candidate["id"] == event["subjectId"]
        ),
        None,
    )
    if machine is None:
        raise TrialValidationError("downtime end must reference one machine.")
    open_event = _open_downtime_event(current["events"], machine["id"])
    if open_event is None:
        raise TrialValidationError("only open downtime can be ended.")
    if event["downtimeStartActionId"] != open_event["actionId"]:
        raise TrialValidationError(
            "downtime end must reference the exact open interval."
        )
    if event["summary"] != f"Ended downtime for {machine['name']}":
        raise TrialValidationError("downtime end summary is not canonical.")


_TRANSITION_VALIDATORS: dict[
    str,
    Callable[
        [Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]],
        None,
    ],
] = {
    "production.job.created": _validate_job_created,
    "production.output.recorded": _validate_output_recorded,
    "production.material.consumed": _validate_material_consumed,
    "production.issue.opened": _validate_issue_opened,
    "production.issue.resolved": _validate_issue_resolved,
    "production.quality_hold.placed": _validate_quality_hold_placed,
    "production.quality_hold.released": _validate_quality_hold_released,
    "production.machine_state.changed": _validate_machine_state_changed,
    "production.downtime.started": _validate_downtime_started,
    "production.downtime.ended": _validate_downtime_ended,
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
            or "scrap" in next_state["jobs"][0]
            or "qualityHold" in next_state["jobs"][0]
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
