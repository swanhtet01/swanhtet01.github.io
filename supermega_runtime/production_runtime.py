"""Fail-closed Production state and lifecycle validation for managed workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from decimal import Decimal, InvalidOperation
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Callable

from supermega_runtime.plant_order_foundation import (
    PlantOrderValidationError,
    create_empty_plant_order_state,
    plant_order_evidence_digest,
    project_plant_order,
    validate_plant_order_state,
)
from supermega_runtime.trial_store import TrialValidationError


PRODUCTION_SCHEMA = "supermega.production.workspace.v2"
PRODUCTION_EVENTS = frozenset(
    {
        "production.workspace.initialized",
        "production.job.created",
        "production.job.schedule_updated",
        "production.job.closed",
        "production.output.recorded",
        "production.material.consumed",
        "production.issue.opened",
        "production.issue.resolved",
        "production.quality_hold.placed",
        "production.quality_hold.released",
        "production.machine_state.changed",
        "production.equipment_master.imported",
        "production.equipment.commissioned",
        "production.equipment_maintenance_strategy.saved",
        "production.order_execution.recorded",
        "production.downtime.started",
        "production.downtime.ended",
        "production.maintenance.started",
        "production.maintenance.completed",
    }
)
PRODUCTION_HUMAN_EVENTS = PRODUCTION_EVENTS

_ISSUE_KINDS = frozenset({"quality", "maintenance", "materials", "operations"})
_ISSUE_SEVERITIES = frozenset({"critical", "high", "medium", "low"})
_JOB_PRIORITIES = frozenset({"urgent", "normal", "low"})
_MACHINE_STATES = frozenset({"running", "attention", "stopped"})
_OUTPUT_KINDS = frozenset({"good", "scrap"})
_MATERIAL_UNITS = frozenset(
    {"kg", "g", "l", "ml", "pcs", "pack", "bag", "roll", "sheet", "m", "cm"}
)
_EVENT_KIND_BY_TYPE = {
    "production.job.created": "job_created",
    "production.job.schedule_updated": "job_schedule_updated",
    "production.job.closed": "job_closed",
    "production.output.recorded": "output_recorded",
    "production.material.consumed": "material_consumed",
    "production.issue.opened": "issue_opened",
    "production.issue.resolved": "issue_resolved",
    "production.quality_hold.placed": "quality_hold_placed",
    "production.quality_hold.released": "quality_hold_released",
    "production.machine_state.changed": "machine_state_changed",
    "production.equipment_master.imported": "equipment_master_imported",
    "production.equipment.commissioned": "equipment_commissioned",
    "production.equipment_maintenance_strategy.saved": "equipment_maintenance_strategy_saved",
    "production.downtime.started": "downtime_started",
    "production.downtime.ended": "downtime_ended",
    "production.maintenance.started": "maintenance_started",
    "production.maintenance.completed": "maintenance_completed",
}
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_JOBS = 100
_MAX_ISSUES = 500
_MAX_MACHINES = 100
_MAX_EQUIPMENT = 100

_STATE_FIELDS = frozenset({"schema", "revision", "jobs", "issues", "machines", "events"})
_STATE_OPTIONAL_FIELDS = frozenset({"openingPlan", "orderExecution", "equipmentMaster"})
_OPENING_PLAN_FIELDS = frozenset(
    {"contract", "packageDigest", "confirmedAt", "jobIds", "machineIds"}
)
_OPENING_PLAN_OPTIONAL_FIELDS = frozenset({"industryPackId"})
_PLANT_INDUSTRY_PACK_IDS = frozenset(
    {"general-manufacturing", "batch-process", "food-beverage", "apparel", "assembly"}
)
_OPENING_PLAN_CONTRACT = "supermega.production.opening-plan.v1"
_SHOP_DEMAND_SOURCE_CONTRACT = "supermega.production.shop-demand-source.v1"
_SHOP_DEMAND_SCHEMA = "supermega.shop_production_demand.v1"
_DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
_JOB_REQUIRED_FIELDS = frozenset({"id", "line", "product", "target", "output"})
_JOB_SCHEDULE_FIELDS = frozenset({"priority", "dueAt"})
_JOB_OPTIONAL_FIELDS = _JOB_SCHEDULE_FIELDS | {
    "owner",
    "scrap",
    "qualityHold",
    "closure",
    "shopDemandSource",
}
_SHOP_DEMAND_SOURCE_FIELDS = frozenset(
    {"contract", "sourceDigest", "evidenceReference", "snapshot"}
)
_SHOP_DEMAND_SNAPSHOT_FIELDS = frozenset(
    {
        "schema",
        "operatingUnitLocationId",
        "sku",
        "productName",
        "sourceOrderIds",
        "activeDemandUnits",
        "uncoveredDemandUnits",
        "availableToPromiseUnits",
        "reorderAtUnits",
        "replenishmentGapUnits",
        "recommendedBatchUnits",
    }
)
_QUALITY_HOLD_FIELDS = frozenset(
    {"actionId", "heldAt", "heldBy", "reason", "evidenceReference"}
)
_JOB_CLOSURE_FIELDS = frozenset(
    {
        "actionId",
        "closedAt",
        "closedBy",
        "reason",
        "evidenceReference",
        "shiftRef",
        "remainingUnits",
    }
)
_ISSUE_REQUIRED_FIELDS = frozenset({"id", "createdAt", "area", "kind", "summary", "status"})
_ISSUE_ACTION_FIELDS = frozenset({"severity", "owner", "dueAt", "containment"})
_ISSUE_OPTIONAL_FIELDS = _ISSUE_ACTION_FIELDS | {"maintenanceFindingSource", "resolution"}
_MAINTENANCE_FINDING_SOURCE_FIELDS = frozenset(
    {
        "contract",
        "equipmentId",
        "equipmentName",
        "maintenanceOwner",
        "completionActionId",
        "completedAt",
        "strategyActionId",
        "strategyRevision",
        "returnToService",
        "findings",
        "evidenceReference",
    }
)
_MACHINE_FIELDS = frozenset({"id", "name", "state"})
_EQUIPMENT_MASTER_CONTRACT = "supermega.production.equipment-master.v1"
_EQUIPMENT_MASTER_FIELDS = frozenset({"contract", "assets"})
_EQUIPMENT_ASSET_FIELDS = frozenset(
    {
        "id",
        "name",
        "workCentreId",
        "criticality",
        "owner",
        "commissioningStatus",
        "sourceActionId",
        "sourcePackageDigest",
        "importedAt",
    }
)
_EQUIPMENT_ASSET_OPTIONAL_FIELDS = frozenset({"commissioning", "maintenanceStrategy"})
_EQUIPMENT_COMMISSIONING_FIELDS = frozenset(
    {
        "actionId",
        "commissionedAt",
        "commissionedBy",
        "installedAt",
        "initialState",
        "safetyBaselineReference",
    }
)
_EQUIPMENT_COMMISSION_FIELDS = frozenset(
    {"equipmentId", "installedAt", "initialState", "safetyBaselineReference"}
)
_EQUIPMENT_MAINTENANCE_STRATEGY_FIELDS = frozenset(
    {
        "revision",
        "actionId",
        "savedAt",
        "savedBy",
        "maintenanceOwner",
        "intervalDays",
        "nextDueAt",
        "procedureReference",
        "safetyBaselineReference",
    }
)
_EQUIPMENT_MAINTENANCE_STRATEGY_PAYLOAD_FIELDS = frozenset(
    {
        "equipmentId",
        "maintenanceOwner",
        "intervalDays",
        "nextDueAt",
        "procedureReference",
        "safetyBaselineReference",
    }
)
_EQUIPMENT_IMPORT_FIELDS = frozenset(
    {"id", "name", "workCentreId", "criticality", "owner"}
)
_EQUIPMENT_CRITICALITIES = frozenset({"critical", "high", "medium", "low"})
_EQUIPMENT_ID_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._/-]{0,79}$")
_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})
_RESOLUTION_FIELDS = frozenset({"actionId", "resolvedAt", "resolvedBy", "reason", "evidenceReference"})
_RESOLUTION_OPTIONAL_FIELDS = frozenset({"maintenanceCorrectiveAction"})
_MAINTENANCE_CORRECTIVE_ACTION_FIELDS = frozenset(
    {"contract", "correctiveAction", "verificationResult", "finalDisposition"}
)
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
_JOB_CREATED_EVENT_FIELDS = frozenset({"jobPriority", "jobDueAt"})
_JOB_OWNER_EVENT_FIELDS = frozenset({"jobOwner"})
_JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS = frozenset(
    {"fromJobPriority", "fromJobDueAt"}
)
_JOB_OWNER_UPDATE_PREVIOUS_FIELDS = frozenset({"fromJobOwner"})
_JOB_CLOSE_EVENT_FIELDS = frozenset({"shiftRef", "remainingQuantity"})
_MATERIAL_EVENT_FIELDS = frozenset(
    {"materialRef", "quantity", "materialUnit", "shiftRef"}
)
_MATERIAL_EVENT_OPTIONAL_FIELDS = frozenset({"materialLot"})
_MAINTENANCE_STRATEGY_BINDING_FIELDS = frozenset(
    {
        "maintenanceStrategyActionId",
        "maintenanceStrategyRevision",
        "maintenanceProcedureReference",
        "maintenancePlannedDueAt",
    }
)
_MAINTENANCE_RESULT_FIELDS = frozenset(
    {
        "maintenanceOutcome",
        "maintenanceFindings",
        "maintenanceProcedureCompleted",
        "maintenanceReturnToService",
    }
)
_MAINTENANCE_COMPLETION_STRATEGY_FIELDS = (
    _MAINTENANCE_STRATEGY_BINDING_FIELDS | _MAINTENANCE_RESULT_FIELDS | {"nextDueAt"}
)
_MAINTENANCE_OUTCOMES = frozenset({"completed", "completed_with_findings"})
_MAINTENANCE_RETURN_TO_SERVICE = frozenset(
    {"recommended", "restricted", "not_recommended"}
)
_TIMESTAMP_PATTERN = re.compile(
    r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})"
    r"(?:\.([0-9]{1,6}))?(Z|([+-])([0-9]{2}):([0-9]{2}))$"
)
_ISSUE_EVENT_FIELDS = frozenset(
    {"issueSeverity", "issueOwner", "issueDueAt", "issueContainment"}
)
_ISSUE_EVENT_OPTIONAL_FIELDS = _ISSUE_EVENT_FIELDS | {"maintenanceFindingSource"}
_ISSUE_RESOLVED_EVENT_OPTIONAL_FIELDS = frozenset({"maintenanceCorrectiveAction"})
_EQUIPMENT_COMMISSION_EVENT_FIELDS = frozenset(
    {"installedAt", "toState", "workCentreId"}
)
_EQUIPMENT_MAINTENANCE_STRATEGY_EVENT_FIELDS = frozenset(
    {
        "strategyRevision",
        "maintenanceOwner",
        "intervalDays",
        "nextDueAt",
        "procedureReference",
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


def _lifecycle_timestamp(value: object, field: str, lifecycle: str) -> str:
    timestamp = _timestamp(value, field)
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    canonical = (
        parsed.astimezone(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    if timestamp != canonical:
        raise TrialValidationError(
            f"{field} must be a canonical UTC millisecond timestamp for {lifecycle}."
        )
    return timestamp


def _downtime_timestamp(value: object, field: str) -> str:
    return _lifecycle_timestamp(value, field, "downtime")


def _maintenance_timestamp(value: object, field: str) -> str:
    return _lifecycle_timestamp(value, field, "maintenance")


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


def _maintenance_corrective_action(candidate: object, field: str) -> dict[str, Any]:
    action = _object(candidate, field)
    _exact_fields(action, field, required=_MAINTENANCE_CORRECTIVE_ACTION_FIELDS)
    if action["contract"] != "supermega.production.maintenance-corrective-action.v1":
        raise TrialValidationError(f"{field}.contract is unsupported.")
    _text(action["correctiveAction"], f"{field}.correctiveAction", maximum=360)
    _text(action["verificationResult"], f"{field}.verificationResult", maximum=360)
    if action["finalDisposition"] not in _MAINTENANCE_RETURN_TO_SERVICE:
        raise TrialValidationError(f"{field}.finalDisposition is unsupported.")
    return action


def _resolution(value: object, field: str) -> dict[str, Any]:
    resolution = _object(value, field)
    _exact_fields(
        resolution,
        field,
        required=_RESOLUTION_FIELDS,
        optional=_RESOLUTION_OPTIONAL_FIELDS,
    )
    _text(resolution["actionId"], f"{field}.actionId", maximum=160)
    _timestamp(resolution["resolvedAt"], f"{field}.resolvedAt")
    _text(resolution["resolvedBy"], f"{field}.resolvedBy")
    _text(resolution["reason"], f"{field}.reason")
    _text(resolution["evidenceReference"], f"{field}.evidenceReference")
    if "maintenanceCorrectiveAction" in resolution:
        _maintenance_corrective_action(
            resolution["maintenanceCorrectiveAction"],
            f"{field}.maintenanceCorrectiveAction",
        )
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


def _job_closure(value: object, field: str) -> dict[str, Any]:
    closure = _object(value, field)
    _exact_fields(closure, field, required=_JOB_CLOSURE_FIELDS)
    _text(closure["actionId"], f"{field}.actionId", maximum=160)
    _timestamp(closure["closedAt"], f"{field}.closedAt")
    _text(closure["closedBy"], f"{field}.closedBy")
    _text(closure["reason"], f"{field}.reason")
    _text(closure["evidenceReference"], f"{field}.evidenceReference")
    _text(closure["shiftRef"], f"{field}.shiftRef", maximum=80)
    _integer(closure["remainingUnits"], f"{field}.remainingUnits", minimum=1)
    return closure


def _shop_demand_source(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field)
    _exact_fields(source, field, required=_SHOP_DEMAND_SOURCE_FIELDS)
    if source["contract"] != _SHOP_DEMAND_SOURCE_CONTRACT:
        raise TrialValidationError(f"{field}.contract is unsupported.")
    snapshot_field = f"{field}.snapshot"
    snapshot = _object(source["snapshot"], snapshot_field)
    _exact_fields(snapshot, snapshot_field, required=_SHOP_DEMAND_SNAPSHOT_FIELDS)
    if snapshot["schema"] != _SHOP_DEMAND_SCHEMA:
        raise TrialValidationError(f"{snapshot_field}.schema is unsupported.")
    if snapshot["operatingUnitLocationId"] != "LOC-MAIN":
        raise TrialValidationError(f"{snapshot_field} operating unit is unsupported.")
    _text(snapshot["sku"], f"{snapshot_field}.sku", maximum=80)
    _text(snapshot["productName"], f"{snapshot_field}.productName")
    source_order_ids = snapshot["sourceOrderIds"]
    if not isinstance(source_order_ids, list) or len(source_order_ids) > 100:
        raise TrialValidationError(f"{snapshot_field}.sourceOrderIds must be a bounded list.")
    canonical_order_ids = [
        _text(order_id, f"{snapshot_field}.sourceOrderIds[{index}]", maximum=80)
        for index, order_id in enumerate(source_order_ids)
    ]
    if len(set(canonical_order_ids)) != len(canonical_order_ids):
        raise TrialValidationError(f"{snapshot_field}.sourceOrderIds must be unique.")
    if canonical_order_ids != sorted(canonical_order_ids):
        raise TrialValidationError(f"{snapshot_field}.sourceOrderIds must be sorted.")
    metric_fields = (
        "activeDemandUnits",
        "uncoveredDemandUnits",
        "availableToPromiseUnits",
        "reorderAtUnits",
        "replenishmentGapUnits",
        "recommendedBatchUnits",
    )
    for metric in metric_fields:
        _integer(
            snapshot[metric],
            f"{snapshot_field}.{metric}",
            minimum=1 if metric == "recommendedBatchUnits" else 0,
        )
    if (
        snapshot["uncoveredDemandUnits"]
        != max(0, snapshot["activeDemandUnits"] - snapshot["availableToPromiseUnits"])
        or snapshot["replenishmentGapUnits"]
        != max(0, snapshot["reorderAtUnits"] - snapshot["availableToPromiseUnits"])
        or snapshot["recommendedBatchUnits"]
        != max(
            1,
            snapshot["uncoveredDemandUnits"],
            snapshot["replenishmentGapUnits"],
        )
    ):
        raise TrialValidationError(f"{snapshot_field} demand metrics are inconsistent.")
    source_digest = _text(source["sourceDigest"], f"{field}.sourceDigest", maximum=71)
    if (
        _DIGEST_PATTERN.fullmatch(source_digest) is None
        or source_digest != plant_order_evidence_digest(snapshot)
    ):
        raise TrialValidationError(
            f"{field}.sourceDigest does not match its canonical snapshot."
        )
    evidence_reference = _text(
        source["evidenceReference"], f"{field}.evidenceReference"
    )
    if evidence_reference != f"SHOP-DEMAND:{source_digest}:LOC-MAIN":
        raise TrialValidationError(f"{field}.evidenceReference is invalid.")
    return source


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
    if "owner" in job:
        _text(job["owner"], f"{field}.owner", maximum=120)
    schedule_fields = _JOB_SCHEDULE_FIELDS.intersection(job)
    if schedule_fields and schedule_fields != _JOB_SCHEDULE_FIELDS:
        raise TrialValidationError(
            f"{field} schedule fields must be complete or absent for legacy records."
        )
    if schedule_fields:
        priority = job["priority"]
        if not isinstance(priority, str) or priority not in _JOB_PRIORITIES:
            raise TrialValidationError(f"{field}.priority is unsupported.")
        _timestamp(job["dueAt"], f"{field}.dueAt")
    scrap = _integer(job.get("scrap", 0), f"{field}.scrap")
    if output + scrap > target:
        raise TrialValidationError(f"{field} good plus scrap cannot exceed its target.")
    if "qualityHold" in job:
        _quality_hold(job["qualityHold"], f"{field}.qualityHold")
    if "closure" in job:
        closure = _job_closure(job["closure"], f"{field}.closure")
        if closure["remainingUnits"] != target - output - scrap:
            raise TrialValidationError(
                f"{field}.closure remaining units must match its output."
            )
    if "shopDemandSource" in job:
        source = _shop_demand_source(job["shopDemandSource"], f"{field}.shopDemandSource")
        snapshot = source["snapshot"]
        if job["product"].lower() not in {
            snapshot["sku"].lower(),
            snapshot["productName"].lower(),
        }:
            raise TrialValidationError(f"{field} product does not match its Shop demand source.")
        if target != snapshot["recommendedBatchUnits"]:
            raise TrialValidationError(f"{field} target does not match its Shop demand source.")
    return job


def _maintenance_finding_source(candidate: object, field: str) -> dict[str, Any]:
    source = _object(candidate, field)
    _exact_fields(source, field, required=_MAINTENANCE_FINDING_SOURCE_FIELDS)
    if source["contract"] != "supermega.production.maintenance-finding-source.v1":
        raise TrialValidationError(f"{field}.contract is unsupported.")
    _text(source["equipmentId"], f"{field}.equipmentId", maximum=80)
    _text(source["equipmentName"], f"{field}.equipmentName", maximum=120)
    _text(source["maintenanceOwner"], f"{field}.maintenanceOwner", maximum=120)
    _text(source["completionActionId"], f"{field}.completionActionId", maximum=160)
    _maintenance_timestamp(source["completedAt"], f"{field}.completedAt")
    _text(source["strategyActionId"], f"{field}.strategyActionId", maximum=160)
    _integer(source["strategyRevision"], f"{field}.strategyRevision", minimum=1)
    if source["returnToService"] not in {"restricted", "not_recommended"}:
        raise TrialValidationError(f"{field}.returnToService is unsupported.")
    _text(source["findings"], f"{field}.findings", maximum=360)
    _text(source["evidenceReference"], f"{field}.evidenceReference")
    return source


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
    if "maintenanceFindingSource" in issue:
        source = _maintenance_finding_source(
            issue["maintenanceFindingSource"],
            f"{field}.maintenanceFindingSource",
        )
        if issue["kind"] != "maintenance":
            raise TrialValidationError(
                f"{field} maintenance finding source requires a maintenance issue."
            )
        if datetime.fromisoformat(created_at.replace("Z", "+00:00")) < datetime.fromisoformat(
            source["completedAt"].replace("Z", "+00:00")
        ):
            raise TrialValidationError(
                f"{field} cannot predate its maintenance finding."
            )
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
        resolution = _resolution(issue["resolution"], f"{field}.resolution")
        if ("maintenanceFindingSource" in issue) != (
            "maintenanceCorrectiveAction" in resolution
        ):
            raise TrialValidationError(
                f"{field} maintenance finding resolution requires one structured corrective action only."
            )
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


def _validate_equipment_asset(candidate: object, index: int) -> dict[str, Any]:
    field = f"production state.equipmentMaster.assets[{index}]"
    asset = _object(candidate, field)
    _exact_fields(
        asset,
        field,
        required=_EQUIPMENT_ASSET_FIELDS,
        optional=_EQUIPMENT_ASSET_OPTIONAL_FIELDS,
    )
    equipment_id = _text(asset["id"], f"{field}.id", maximum=80)
    work_centre_id = _text(
        asset["workCentreId"], f"{field}.workCentreId", maximum=80
    )
    if (
        _EQUIPMENT_ID_PATTERN.fullmatch(equipment_id) is None
        or _EQUIPMENT_ID_PATTERN.fullmatch(work_centre_id) is None
    ):
        raise TrialValidationError(
            f"{field} IDs must use canonical uppercase equipment identifiers."
        )
    _text(asset["name"], f"{field}.name", maximum=180)
    _text(asset["owner"], f"{field}.owner", maximum=120)
    if asset["criticality"] not in _EQUIPMENT_CRITICALITIES:
        raise TrialValidationError(f"{field}.criticality is unsupported.")
    commissioning_status = asset["commissioningStatus"]
    if commissioning_status not in {"not_commissioned", "commissioned"}:
        raise TrialValidationError(f"{field}.commissioningStatus is unsupported.")
    _text(asset["sourceActionId"], f"{field}.sourceActionId", maximum=160)
    package_digest = _text(
        asset["sourcePackageDigest"],
        f"{field}.sourcePackageDigest",
        maximum=71,
    )
    if _DIGEST_PATTERN.fullmatch(package_digest) is None:
        raise TrialValidationError(f"{field}.sourcePackageDigest must use SHA-256.")
    imported_at = _lifecycle_timestamp(
        asset["importedAt"], f"{field}.importedAt", "equipment import"
    )
    commissioning = asset.get("commissioning")
    if commissioning_status == "not_commissioned":
        if commissioning is not None or asset.get("maintenanceStrategy") is not None:
            raise TrialValidationError(
                f"{field} cannot retain commissioning or maintenance strategy evidence before commissioning."
            )
        return asset
    commissioning_record = _object(commissioning, f"{field}.commissioning")
    _exact_fields(
        commissioning_record,
        f"{field}.commissioning",
        required=_EQUIPMENT_COMMISSIONING_FIELDS,
    )
    _text(
        commissioning_record["actionId"],
        f"{field}.commissioning.actionId",
        maximum=160,
    )
    commissioned_at = _lifecycle_timestamp(
        commissioning_record["commissionedAt"],
        f"{field}.commissioning.commissionedAt",
        "equipment commissioning",
    )
    _text(
        commissioning_record["commissionedBy"],
        f"{field}.commissioning.commissionedBy",
        maximum=120,
    )
    installed_at = _lifecycle_timestamp(
        commissioning_record["installedAt"],
        f"{field}.commissioning.installedAt",
        "equipment installation",
    )
    if commissioned_at < imported_at or installed_at > commissioned_at:
        raise TrialValidationError(
            f"{field} commissioning chronology is invalid."
        )
    if commissioning_record["initialState"] not in _MACHINE_STATES:
        raise TrialValidationError(
            f"{field}.commissioning.initialState is unsupported."
        )
    _text(
        commissioning_record["safetyBaselineReference"],
        f"{field}.commissioning.safetyBaselineReference",
        maximum=240,
    )
    strategy = asset.get("maintenanceStrategy")
    if strategy is not None:
        strategy_record = _object(strategy, f"{field}.maintenanceStrategy")
        _exact_fields(
            strategy_record,
            f"{field}.maintenanceStrategy",
            required=_EQUIPMENT_MAINTENANCE_STRATEGY_FIELDS,
        )
        _integer(
            strategy_record["revision"],
            f"{field}.maintenanceStrategy.revision",
            minimum=1,
        )
        _text(
            strategy_record["actionId"],
            f"{field}.maintenanceStrategy.actionId",
            maximum=160,
        )
        saved_at = _lifecycle_timestamp(
            strategy_record["savedAt"],
            f"{field}.maintenanceStrategy.savedAt",
            "equipment maintenance strategy",
        )
        _text(
            strategy_record["savedBy"],
            f"{field}.maintenanceStrategy.savedBy",
            maximum=120,
        )
        _text(
            strategy_record["maintenanceOwner"],
            f"{field}.maintenanceStrategy.maintenanceOwner",
            maximum=120,
        )
        interval_days = _integer(
            strategy_record["intervalDays"],
            f"{field}.maintenanceStrategy.intervalDays",
            minimum=1,
        )
        if interval_days > 3650:
            raise TrialValidationError(
                f"{field}.maintenanceStrategy.intervalDays cannot exceed 3650."
            )
        next_due_at = _lifecycle_timestamp(
            strategy_record["nextDueAt"],
            f"{field}.maintenanceStrategy.nextDueAt",
            "equipment maintenance strategy",
        )
        if next_due_at <= saved_at:
            raise TrialValidationError(
                f"{field}.maintenanceStrategy.nextDueAt must follow strategy save time."
            )
        _text(
            strategy_record["procedureReference"],
            f"{field}.maintenanceStrategy.procedureReference",
            maximum=240,
        )
        _text(
            strategy_record["safetyBaselineReference"],
            f"{field}.maintenanceStrategy.safetyBaselineReference",
            maximum=240,
        )
    return asset


def _validate_equipment_master(candidate: object) -> dict[str, Any]:
    master = _object(candidate, "production state.equipmentMaster")
    _exact_fields(
        master,
        "production state.equipmentMaster",
        required=_EQUIPMENT_MASTER_FIELDS,
    )
    if master["contract"] != _EQUIPMENT_MASTER_CONTRACT:
        raise TrialValidationError(
            f"production state.equipmentMaster.contract must be {_EQUIPMENT_MASTER_CONTRACT}."
        )
    assets_raw = _list(
        master["assets"],
        "production state.equipmentMaster.assets",
        maximum=_MAX_EQUIPMENT,
    )
    if not assets_raw:
        raise TrialValidationError(
            "production state.equipmentMaster must retain at least one reviewed asset."
        )
    assets = [
        _validate_equipment_asset(candidate, index)
        for index, candidate in enumerate(assets_raw)
    ]
    _unique([asset["id"] for asset in assets], "Production equipment ID")
    return master


def _validate_opening_plan(
    candidate: object,
    *,
    jobs: Sequence[dict[str, Any]],
    machines: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    plan = _object(candidate, "production state.openingPlan")
    _exact_fields(
        plan,
        "production state.openingPlan",
        required=_OPENING_PLAN_FIELDS,
        optional=_OPENING_PLAN_OPTIONAL_FIELDS,
    )
    if plan["contract"] != _OPENING_PLAN_CONTRACT:
        raise TrialValidationError(
            f"production state.openingPlan.contract must be {_OPENING_PLAN_CONTRACT}."
        )
    if "industryPackId" in plan and plan["industryPackId"] not in _PLANT_INDUSTRY_PACK_IDS:
        raise TrialValidationError(
            "production state.openingPlan.industryPackId is unsupported."
        )
    package_digest = _text(
        plan["packageDigest"],
        "production state.openingPlan.packageDigest",
        maximum=71,
    )
    if _DIGEST_PATTERN.fullmatch(package_digest) is None:
        raise TrialValidationError(
            "production state.openingPlan.packageDigest must use SHA-256."
        )
    _lifecycle_timestamp(
        plan["confirmedAt"],
        "production state.openingPlan.confirmedAt",
        "opening plan",
    )
    job_ids_raw = _list(
        plan["jobIds"],
        "production state.openingPlan.jobIds",
        maximum=_MAX_JOBS,
    )
    machine_ids_raw = _list(
        plan["machineIds"],
        "production state.openingPlan.machineIds",
        maximum=_MAX_MACHINES,
    )
    if not job_ids_raw:
        raise TrialValidationError(
            "production state.openingPlan must retain its jobs."
        )
    job_ids = [
        _text(value, f"production state.openingPlan.jobIds[{index}]", maximum=80)
        for index, value in enumerate(job_ids_raw)
    ]
    machine_ids = [
        _text(
            value,
            f"production state.openingPlan.machineIds[{index}]",
            maximum=80,
        )
        for index, value in enumerate(machine_ids_raw)
    ]
    _unique(job_ids, "Production opening job ID")
    _unique(machine_ids, "Production opening machine ID")
    current_job_ids = [job["id"] for job in jobs]
    if current_job_ids[-len(job_ids) :] != job_ids:
        raise TrialValidationError(
            "production state.openingPlan jobs must remain the immutable job suffix."
        )
    retained_machine_ids = [machine["id"] for machine in machines]
    if retained_machine_ids[: len(machine_ids)] != machine_ids:
        raise TrialValidationError(
            "production state.openingPlan machines must remain the immutable machine prefix."
        )
    return plan


def _validate_order_execution(candidate: object) -> dict[str, Any]:
    try:
        return validate_plant_order_state(candidate)
    except PlantOrderValidationError as exc:
        raise TrialValidationError(
            f"production state.orderExecution is invalid: {exc}"
        ) from exc


def _validate_event(
    candidate: object,
    index: int,
    *,
    job_ids: frozenset[str],
    issue_ids: frozenset[str],
    machine_ids: frozenset[str],
    equipment_ids: frozenset[str],
) -> dict[str, Any]:
    field = f"events[{index}]"
    event = _object(candidate, field)
    kind = event.get("kind")
    if not isinstance(kind, str):
        raise TrialValidationError(f"{field}.kind is unsupported.")
    if kind == "job_closed":
        required = _EVENT_FIELDS | _JOB_CLOSE_EVENT_FIELDS
    elif kind == "job_schedule_updated":
        required = _EVENT_FIELDS | _JOB_CREATED_EVENT_FIELDS
    elif kind == "output_recorded":
        required = _EVENT_FIELDS | {"quantity"}
    elif kind == "material_consumed":
        required = _EVENT_FIELDS | _MATERIAL_EVENT_FIELDS
    elif kind == "machine_state_changed":
        required = _EVENT_FIELDS | {"fromState", "toState"}
    elif kind == "downtime_ended":
        required = _EVENT_FIELDS | {"downtimeStartActionId"}
    elif kind == "maintenance_started":
        required = _EVENT_FIELDS | {"maintenanceOwner"}
    elif kind == "maintenance_completed":
        required = _EVENT_FIELDS | {"maintenanceStartActionId"}
    elif kind == "equipment_master_imported":
        required = _EVENT_FIELDS | {"equipmentIds"}
    elif kind == "equipment_commissioned":
        required = _EVENT_FIELDS | _EQUIPMENT_COMMISSION_EVENT_FIELDS
    elif kind == "equipment_maintenance_strategy_saved":
        required = _EVENT_FIELDS | _EQUIPMENT_MAINTENANCE_STRATEGY_EVENT_FIELDS
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
            else _JOB_CREATED_EVENT_FIELDS | _JOB_OWNER_EVENT_FIELDS
            if kind == "job_created"
            else (
                _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS
                | _JOB_OWNER_EVENT_FIELDS
                | _JOB_OWNER_UPDATE_PREVIOUS_FIELDS
            )
            if kind == "job_schedule_updated"
            else _MATERIAL_EVENT_OPTIONAL_FIELDS
            if kind == "material_consumed"
            else _ISSUE_EVENT_OPTIONAL_FIELDS
            if kind == "issue_opened"
            else _ISSUE_RESOLVED_EVENT_OPTIONAL_FIELDS
            if kind == "issue_resolved"
            else _MAINTENANCE_STRATEGY_BINDING_FIELDS
            if kind == "maintenance_started"
            else _MAINTENANCE_COMPLETION_STRATEGY_FIELDS
            if kind == "maintenance_completed"
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

    if kind == "equipment_master_imported":
        if subject_id != "equipment-master":
            raise TrialValidationError(
                f"{field} must reference the equipment master authority."
            )
        equipment_ids_raw = _list(
            event["equipmentIds"],
            f"{field}.equipmentIds",
            maximum=_MAX_EQUIPMENT,
        )
        if not equipment_ids_raw:
            raise TrialValidationError(f"{field}.equipmentIds cannot be empty.")
        imported_ids = [
            _text(value, f"{field}.equipmentIds[{position}]", maximum=80)
            for position, value in enumerate(equipment_ids_raw)
        ]
        _unique(imported_ids, "Production equipment import ID")
        if any(equipment_id not in equipment_ids for equipment_id in imported_ids):
            raise TrialValidationError(
                f"{field} references an unknown equipment master record."
            )
        if event["summary"] != f"Imported {len(imported_ids)} equipment master records":
            raise TrialValidationError(f"{field}.summary is not canonical.")
        if _DIGEST_PATTERN.fullmatch(event["evidenceReference"]) is None:
            raise TrialValidationError(
                f"{field}.evidenceReference must bind the reviewed package digest."
            )
    elif kind == "equipment_commissioned":
        if subject_id not in equipment_ids or subject_id not in machine_ids:
            raise TrialValidationError(
                f"{field} must reference one retained equipment and runtime machine."
            )
        installed_at = _lifecycle_timestamp(
            event["installedAt"], f"{field}.installedAt", "equipment installation"
        )
        commissioned_at = _lifecycle_timestamp(
            event["createdAt"], f"{field}.createdAt", "equipment commissioning"
        )
        if installed_at > commissioned_at:
            raise TrialValidationError(
                f"{field}.installedAt cannot follow commissioning."
            )
        if event["toState"] not in _MACHINE_STATES:
            raise TrialValidationError(f"{field}.toState is unsupported.")
        work_centre_id = _text(
            event["workCentreId"], f"{field}.workCentreId", maximum=80
        )
        if _EQUIPMENT_ID_PATTERN.fullmatch(work_centre_id) is None:
            raise TrialValidationError(
                f"{field}.workCentreId must use a canonical equipment identifier."
            )
    elif kind == "equipment_maintenance_strategy_saved":
        if subject_id not in equipment_ids or subject_id not in machine_ids:
            raise TrialValidationError(
                f"{field} must reference one commissioned equipment runtime."
            )
        strategy_revision = _integer(
            event["strategyRevision"],
            f"{field}.strategyRevision",
            minimum=1,
        )
        interval_days = _integer(
            event["intervalDays"], f"{field}.intervalDays", minimum=1
        )
        if interval_days > 3650:
            raise TrialValidationError(f"{field}.intervalDays cannot exceed 3650.")
        saved_at = _lifecycle_timestamp(
            event["createdAt"], f"{field}.createdAt", "equipment maintenance strategy"
        )
        next_due_at = _lifecycle_timestamp(
            event["nextDueAt"], f"{field}.nextDueAt", "equipment maintenance strategy"
        )
        saved_time = datetime.fromisoformat(saved_at.replace("Z", "+00:00"))
        due_time = datetime.fromisoformat(next_due_at.replace("Z", "+00:00"))
        if due_time <= saved_time or due_time > saved_time + timedelta(days=interval_days):
            raise TrialValidationError(
                f"{field}.nextDueAt must follow save time within its interval."
            )
        owner = _text(event["maintenanceOwner"], f"{field}.maintenanceOwner", maximum=120)
        procedure = _text(event["procedureReference"], f"{field}.procedureReference", maximum=240)
        if event["summary"] != f"Saved maintenance strategy R{strategy_revision} for {subject_id}":
            raise TrialValidationError(f"{field}.summary is not canonical.")
        if not owner or not procedure:
            raise TrialValidationError(f"{field} maintenance strategy is incomplete.")
    elif kind == "output_recorded":
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
        _integer(event["quantity"], f"{field}.quantity", minimum=1)
        output_kind = event.get("outputKind", "good")
        if not isinstance(output_kind, str) or output_kind not in _OUTPUT_KINDS:
            raise TrialValidationError(f"{field}.outputKind is unsupported.")
        if "shiftRef" in event:
            _text(event["shiftRef"], f"{field}.shiftRef", maximum=80)
    elif kind == "job_closed":
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
        _text(event["shiftRef"], f"{field}.shiftRef", maximum=80)
        _integer(
            event["remainingQuantity"],
            f"{field}.remainingQuantity",
            minimum=1,
        )
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
    elif kind in {"job_created", "job_schedule_updated"}:
        if subject_id not in job_ids:
            raise TrialValidationError(f"{field} references an unknown job.")
        schedule_fields = _JOB_CREATED_EVENT_FIELDS.intersection(event)
        if (
            kind == "job_created"
            and schedule_fields
            and schedule_fields != _JOB_CREATED_EVENT_FIELDS
        ):
            raise TrialValidationError(
                f"{field} job schedule fields must be complete or absent "
                "for legacy events."
            )
        if schedule_fields:
            priority = event["jobPriority"]
            if not isinstance(priority, str) or priority not in _JOB_PRIORITIES:
                raise TrialValidationError(f"{field}.jobPriority is unsupported.")
            due_at = _timestamp(event["jobDueAt"], f"{field}.jobDueAt")
            created_at = _timestamp(event["createdAt"], f"{field}.createdAt")
            if due_at <= created_at:
                raise TrialValidationError(
                    f"{field}.jobDueAt must follow confirmation."
                )
        if "jobOwner" in event:
            _text(event["jobOwner"], f"{field}.jobOwner", maximum=120)
        if (
            kind == "job_created"
            and "jobOwner" in event
            and schedule_fields != _JOB_CREATED_EVENT_FIELDS
        ):
            raise TrialValidationError(
                f"{field} a job owner requires the complete opening plan."
            )
        if kind == "job_schedule_updated":
            previous_fields = _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS.intersection(event)
            if (
                previous_fields
                and previous_fields != _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS
            ):
                raise TrialValidationError(
                    f"{field} previous job schedule fields must be complete or absent."
                )
            if previous_fields:
                previous_priority = event["fromJobPriority"]
                if (
                    not isinstance(previous_priority, str)
                    or previous_priority not in _JOB_PRIORITIES
                ):
                    raise TrialValidationError(
                        f"{field}.fromJobPriority is unsupported."
                    )
                _timestamp(event["fromJobDueAt"], f"{field}.fromJobDueAt")
            if "fromJobOwner" in event:
                _text(event["fromJobOwner"], f"{field}.fromJobOwner", maximum=120)
                if "jobOwner" not in event:
                    raise TrialValidationError(
                        f"{field} previous job owner requires a current owner."
                    )
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
    elif kind in {"maintenance_started", "maintenance_completed"}:
        if subject_id not in machine_ids:
            raise TrialValidationError(f"{field} references an unknown machine.")
        _maintenance_timestamp(event["createdAt"], f"{field}.createdAt")
        if kind == "maintenance_started":
            _text(
                event["maintenanceOwner"],
                f"{field}.maintenanceOwner",
                maximum=120,
            )
        else:
            _text(
                event["maintenanceStartActionId"],
                f"{field}.maintenanceStartActionId",
                maximum=160,
            )
        binding_fields = _MAINTENANCE_STRATEGY_BINDING_FIELDS.intersection(event)
        if binding_fields and binding_fields != _MAINTENANCE_STRATEGY_BINDING_FIELDS:
            raise TrialValidationError(
                f"{field} maintenance strategy binding must be complete or absent."
            )
        if kind == "maintenance_completed" and (
            ("nextDueAt" in event) != bool(binding_fields)
        ):
            raise TrialValidationError(
                f"{field} strategy-bound completion requires one next due timestamp."
            )
        result_fields = _MAINTENANCE_RESULT_FIELDS.intersection(event)
        if result_fields and result_fields != _MAINTENANCE_RESULT_FIELDS:
            raise TrialValidationError(
                f"{field} maintenance result must be complete or absent."
            )
        if result_fields and (
            kind != "maintenance_completed" or not binding_fields
        ):
            raise TrialValidationError(
                f"{field} maintenance result requires strategy-bound completion."
            )
        if binding_fields:
            _text(
                event["maintenanceStrategyActionId"],
                f"{field}.maintenanceStrategyActionId",
                maximum=160,
            )
            _integer(
                event["maintenanceStrategyRevision"],
                f"{field}.maintenanceStrategyRevision",
                minimum=1,
            )
            _text(
                event["maintenanceProcedureReference"],
                f"{field}.maintenanceProcedureReference",
                maximum=240,
            )
            _maintenance_timestamp(
                event["maintenancePlannedDueAt"],
                f"{field}.maintenancePlannedDueAt",
            )
            if kind == "maintenance_completed":
                next_due_at = _parsed_timestamp(
                    event["nextDueAt"], f"{field}.nextDueAt"
                )[1]
                completed_at = _parsed_timestamp(
                    event["createdAt"], f"{field}.createdAt"
                )[1]
                if next_due_at <= completed_at:
                    raise TrialValidationError(
                        f"{field}.nextDueAt must follow reviewed completion."
                    )
                if result_fields:
                    if event["maintenanceOutcome"] not in _MAINTENANCE_OUTCOMES:
                        raise TrialValidationError(
                            f"{field}.maintenanceOutcome is unsupported."
                        )
                    _text(
                        event["maintenanceFindings"],
                        f"{field}.maintenanceFindings",
                        maximum=360,
                    )
                    if event["maintenanceProcedureCompleted"] is not True:
                        raise TrialValidationError(
                            f"{field}.maintenanceProcedureCompleted must be confirmed."
                        )
                    if (
                        event["maintenanceReturnToService"]
                        not in _MAINTENANCE_RETURN_TO_SERVICE
                    ):
                        raise TrialValidationError(
                            f"{field}.maintenanceReturnToService is unsupported."
                        )
                    if (
                        event["maintenanceOutcome"] == "completed"
                        and event["maintenanceReturnToService"] != "recommended"
                    ):
                        raise TrialValidationError(
                            f"{field} completed maintenance must recommend return to service."
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
        if "maintenanceFindingSource" in event:
            _maintenance_finding_source(
                event["maintenanceFindingSource"],
                f"{field}.maintenanceFindingSource",
            )
    elif kind == "issue_resolved":
        if subject_id not in issue_ids:
            raise TrialValidationError(f"{field} references an unknown issue.")
        if "maintenanceCorrectiveAction" in event:
            _maintenance_corrective_action(
                event["maintenanceCorrectiveAction"],
                f"{field}.maintenanceCorrectiveAction",
            )
    elif subject_id not in issue_ids:
        raise TrialValidationError(f"{field} references an unknown issue.")
    return event


def _validate_issue_history(
    issues: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
    machines: Sequence[dict[str, Any]],
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
        issue_source = (
            _maintenance_finding_source(
                issue["maintenanceFindingSource"],
                f"issues[{index}].maintenanceFindingSource",
            )
            if "maintenanceFindingSource" in issue
            else None
        )
        event_source = (
            _maintenance_finding_source(
                opening_event["maintenanceFindingSource"],
                f"issues[{index}] opening maintenanceFindingSource",
            )
            if "maintenanceFindingSource" in opening_event
            else None
        )
        if issue_source != event_source:
            raise TrialValidationError(
                f"issues[{index}] maintenance finding source does not match its immutable opening event."
            )
        if issue_source is not None:
            completions = [
                event
                for event in events
                if event["kind"] == "maintenance_completed"
                and event["actionId"] == issue_source["completionActionId"]
            ]
            if len(completions) != 1:
                raise TrialValidationError(
                    f"issues[{index}] maintenance finding source requires exactly one reviewed completion."
                )
            completion = completions[0]
            starts = [
                event
                for event in events
                if event["kind"] == "maintenance_started"
                and event["actionId"] == completion["maintenanceStartActionId"]
            ]
            source_machines = [
                machine
                for machine in machines
                if machine["id"] == issue_source["equipmentId"]
            ]
            if len(starts) != 1 or len(source_machines) != 1:
                raise TrialValidationError(
                    f"issues[{index}] maintenance finding source is not bound to one asset and start record."
            )
            start = starts[0]
            machine = source_machines[0]
            if (
                completion["subjectId"] != issue_source["equipmentId"]
                or machine["name"] != issue_source["equipmentName"]
                or start["maintenanceOwner"] != issue_source["maintenanceOwner"]
                or completion["createdAt"] != issue_source["completedAt"]
                or completion.get("maintenanceStrategyActionId")
                != issue_source["strategyActionId"]
                or completion.get("maintenanceStrategyRevision")
                != issue_source["strategyRevision"]
                or completion.get("maintenanceReturnToService")
                != issue_source["returnToService"]
                or completion.get("maintenanceFindings") != issue_source["findings"]
                or completion["evidenceReference"]
                != issue_source["evidenceReference"]
            ):
                raise TrialValidationError(
                    f"issues[{index}] maintenance finding source does not match reviewed completion evidence."
                )
            if events.index(opening_event) >= events.index(completion):
                raise TrialValidationError(
                    f"issues[{index}] maintenance finding problem must follow its reviewed completion."
                )
            duplicates = sum(
                1
                for candidate in issues
                if candidate.get("maintenanceFindingSource", {}).get(
                    "completionActionId"
                )
                == issue_source["completionActionId"]
            )
            if duplicates != 1:
                raise TrialValidationError(
                    f"issues[{index}] duplicates a maintenance finding problem."
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
            or event.get("maintenanceCorrectiveAction")
            != resolution.get("maintenanceCorrectiveAction")
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
            if event["kind"] == "job_schedule_updated":
                if good_at_event + scrap_at_event >= job["target"]:
                    raise TrialValidationError(
                        f"jobs[{index}] schedule changed after the job reached target."
                    )
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
    opening_job_ids: Sequence[str] | None = None,
) -> None:
    if not jobs:
        raise TrialValidationError("Production must retain its initial job.")
    retained_opening_job_ids = tuple(opening_job_ids or (jobs[-1]["id"],))
    retained_opening_job_id_set = frozenset(retained_opening_job_ids)
    created_events = [
        event for event in events if event["kind"] == "job_created"
    ]
    if len(created_events) != len(jobs) - len(retained_opening_job_ids):
        raise TrialValidationError(
            "Every job after the opening plan requires one immutable creation event."
        )
    for index, job in enumerate(jobs):
        matches = [
            event
            for event in created_events
            if event["subjectId"] == job["id"]
        ]
        if job["id"] in retained_opening_job_id_set:
            if matches:
                raise TrialValidationError(
                    "An opening Production job cannot have a later creation event."
                )
            creation_event = None
        elif len(matches) != 1:
            raise TrialValidationError(
                f"jobs[{index}] must be backed by exactly one creation event."
            )
        else:
            creation_event = matches[0]

        if "shopDemandSource" in job:
            source = _shop_demand_source(
                job["shopDemandSource"], f"jobs[{index}].shopDemandSource"
            )
            if creation_event is None:
                raise TrialValidationError(
                    f"jobs[{index}] Shop demand source requires immutable creation evidence."
                )
            if creation_event["evidenceReference"] != source["evidenceReference"]:
                raise TrialValidationError(
                    f"jobs[{index}] Shop demand source does not match its creation evidence."
                )

        schedule_events = [
            event
            for event in events
            if event["kind"] == "job_schedule_updated"
            and event["subjectId"] == job["id"]
        ]
        job_schedule_fields = _JOB_SCHEDULE_FIELDS.intersection(job)
        expected_priority: object | None = None
        expected_due_at: object | None = None
        expected_owner: object | None = None
        owner_history_started = False
        previous_activity_at: datetime | None = None
        schedule_history_exists = creation_event is not None or bool(schedule_events)

        if creation_event is not None:
            event_schedule_fields = _JOB_CREATED_EVENT_FIELDS.intersection(
                creation_event
            )
            if event_schedule_fields:
                expected_priority = creation_event["jobPriority"]
                expected_due_at = creation_event["jobDueAt"]
            if "jobOwner" in creation_event:
                expected_owner = creation_event["jobOwner"]
                owner_history_started = True
            previous_activity_at = datetime.fromisoformat(
                creation_event["createdAt"].replace("Z", "+00:00")
            )
        elif schedule_events:
            opening_event = schedule_events[-1]
            opening_fields = _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS.intersection(
                opening_event
            )
            if opening_fields:
                expected_priority = opening_event["fromJobPriority"]
                expected_due_at = opening_event["fromJobDueAt"]
            opening_owner_event = next(
                (
                    event
                    for event in reversed(schedule_events)
                    if "jobOwner" in event
                ),
                None,
            )
            if (
                opening_owner_event is not None
                and "fromJobOwner" in opening_owner_event
            ):
                expected_owner = opening_owner_event["fromJobOwner"]
                owner_history_started = True

        for event in reversed(schedule_events):
            activity_at = datetime.fromisoformat(
                event["createdAt"].replace("Z", "+00:00")
            )
            if (
                creation_event is not None
                and events.index(event) >= events.index(creation_event)
            ):
                raise TrialValidationError(
                    f"jobs[{index}] schedule update predates job creation."
                )
            if (
                previous_activity_at is not None
                and activity_at < previous_activity_at
            ):
                raise TrialValidationError(
                    f"jobs[{index}] schedule update timestamps contradict "
                    "lifecycle order."
                )
            previous_activity_at = activity_at
            previous_fields = _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS.intersection(
                event
            )
            expected_exists = (
                expected_priority is not None and expected_due_at is not None
            )
            if expected_exists:
                if (
                    previous_fields != _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS
                    or event["fromJobPriority"] != expected_priority
                    or event["fromJobDueAt"] != expected_due_at
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] schedule update does not continue its "
                        "immutable history."
                    )
            elif previous_fields:
                raise TrialValidationError(
                    f"jobs[{index}] legacy schedule update invents a prior plan."
                )
            schedule_unchanged = (
                expected_exists
                and event["jobPriority"] == expected_priority
                and event["jobDueAt"] == expected_due_at
            )
            if "jobOwner" not in event:
                if owner_history_started:
                    raise TrialValidationError(
                        f"jobs[{index}] plan update drops its immutable owner history."
                    )
                if schedule_unchanged:
                    raise TrialValidationError(
                        f"jobs[{index}] schedule update does not change the plan."
                    )
                if event["summary"] != (
                    f"Updated {job['product']} schedule for {job['line']}"
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] legacy schedule update summary is not canonical."
                    )
            else:
                if expected_owner is not None:
                    if event.get("fromJobOwner") != expected_owner:
                        raise TrialValidationError(
                            f"jobs[{index}] plan update does not continue its "
                            "immutable owner history."
                        )
                elif "fromJobOwner" in event:
                    raise TrialValidationError(
                        f"jobs[{index}] first owner assignment invents a previous owner."
                    )
                if (
                    schedule_unchanged
                    and owner_history_started
                    and event["jobOwner"] == expected_owner
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] plan update does not change the plan."
                    )
                if event["summary"] != (
                    f"Updated {job['product']} plan for {job['line']}"
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] plan update summary is not canonical."
                    )
                expected_owner = event["jobOwner"]
                owner_history_started = True
            expected_priority = event["jobPriority"]
            expected_due_at = event["jobDueAt"]

        if schedule_history_exists:
            expected_exists = (
                expected_priority is not None and expected_due_at is not None
            )
            if expected_exists:
                if (
                    job_schedule_fields != _JOB_SCHEDULE_FIELDS
                    or job["priority"] != expected_priority
                    or job["dueAt"] != expected_due_at
                ):
                    raise TrialValidationError(
                        f"jobs[{index}] schedule does not match its immutable "
                        "event history."
                    )
            elif job_schedule_fields:
                raise TrialValidationError(
                    f"jobs[{index}] legacy creation event cannot acquire a "
                    "schedule without an update."
                )
            if owner_history_started:
                if job.get("owner") != expected_owner:
                    raise TrialValidationError(
                        f"jobs[{index}] owner does not match its immutable plan history."
                    )
            elif "owner" in job:
                raise TrialValidationError(
                    f"jobs[{index}] legacy history cannot acquire an owner "
                    "without a plan update."
                )

        if creation_event is None:
            continue
        creation_index = events.index(creation_event)
        if any(
            events.index(event) >= creation_index
            for event in events
            if event["kind"]
            in {
                "job_schedule_updated",
                "job_closed",
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
            < datetime.fromisoformat(
                creation_event["createdAt"].replace("Z", "+00:00")
            )
            for event in events
            if event["kind"] == "material_consumed"
            and event["subjectId"] == job["id"]
        ):
            raise TrialValidationError(
                f"jobs[{index}] material use timestamp cannot predate its creation event."
            )


def _validate_job_closure_history(
    jobs: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, job in enumerate(jobs):
        close_events = [
            event
            for event in events
            if event["kind"] == "job_closed" and event["subjectId"] == job["id"]
        ]
        closure = job.get("closure")
        if closure is None:
            if close_events:
                raise TrialValidationError(
                    f"jobs[{index}] has a close event without closure proof."
                )
            continue
        if len(close_events) != 1 or close_events[0]["actionId"] != closure["actionId"]:
            raise TrialValidationError(
                f"jobs[{index}] closure must be backed by exactly one event."
            )
        event = close_events[0]
        expected_closure = {
            "actionId": event["actionId"],
            "closedAt": event["createdAt"],
            "closedBy": event["actor"],
            "reason": event["reason"],
            "evidenceReference": event["evidenceReference"],
            "shiftRef": event["shiftRef"],
            "remainingUnits": event["remainingQuantity"],
        }
        if closure != expected_closure:
            raise TrialValidationError(
                f"jobs[{index}] closure does not match its immutable event."
            )
        if event["summary"] != (
            f"Closed {job['product']} short with "
            f"{closure['remainingUnits']} units remaining"
        ):
            raise TrialValidationError(
                f"jobs[{index}] close summary is not canonical."
            )
        close_index = events.index(event)
        creation_event = next(
            (
                candidate
                for candidate in events
                if candidate["kind"] == "job_created"
                and candidate["subjectId"] == job["id"]
            ),
            None,
        )
        if creation_event is not None and (
            close_index >= events.index(creation_event)
            or datetime.fromisoformat(event["createdAt"].replace("Z", "+00:00"))
            < datetime.fromisoformat(
                creation_event["createdAt"].replace("Z", "+00:00")
            )
        ):
            raise TrialValidationError(
                f"jobs[{index}] closure predates job creation."
            )
        if any(
            event_index < close_index
            and candidate["subjectId"] == job["id"]
            and candidate["kind"]
            in {
                "job_schedule_updated",
                "output_recorded",
                "material_consumed",
                "quality_hold_placed",
            }
            for event_index, candidate in enumerate(events)
        ):
            raise TrialValidationError(
                f"jobs[{index}] has scheduling, output, material use, or a new "
                "quality hold after closure."
            )
        closed_at = datetime.fromisoformat(event["createdAt"].replace("Z", "+00:00"))
        if any(
            event_index < close_index
            and candidate["subjectId"] == job["id"]
            and datetime.fromisoformat(
                candidate["createdAt"].replace("Z", "+00:00")
            )
            < closed_at
            for event_index, candidate in enumerate(events)
        ):
            raise TrialValidationError(
                f"jobs[{index}] activity appended after closure predates the "
                "close timestamp."
            )
        if any(
            event_index > close_index
            and candidate["subjectId"] == job["id"]
            and candidate["kind"] != "job_created"
            and datetime.fromisoformat(
                candidate["createdAt"].replace("Z", "+00:00")
            )
            > closed_at
            for event_index, candidate in enumerate(events)
        ):
            raise TrialValidationError(
                f"jobs[{index}] closure timestamp contradicts earlier activity."
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
        commissioning_events = [
            event
            for event in events
            if event["kind"] == "equipment_commissioned"
            and event["subjectId"] == machine["id"]
        ]
        if len(commissioning_events) > 1:
            raise TrialValidationError(
                f"machines[{index}] has duplicate commissioning history."
            )
        commissioning_event = commissioning_events[0] if commissioning_events else None
        initial_state = (
            commissioning_event["toState"]
            if commissioning_event is not None
            else "running"
        )
        newest_first = [
            event
            for event in events
            if event["kind"] == "machine_state_changed"
            and event["subjectId"] == machine["id"]
        ]
        if not newest_first:
            if machine["state"] != initial_state:
                raise TrialValidationError(
                    f"machines[{index}] must match its initial observed state."
                )
            continue
        oldest_first = list(reversed(newest_first))
        if oldest_first[0]["fromState"] != initial_state:
            raise TrialValidationError(
                f"machines[{index}] history must begin from its initial observed state."
            )
        if (
            commissioning_event is not None
            and _timestamp(oldest_first[0]["createdAt"], "machine event createdAt")
            < _timestamp(commissioning_event["createdAt"], "commissioning createdAt")
        ):
            raise TrialValidationError(
                f"machines[{index}] state history predates commissioning."
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


def _validate_maintenance_history(
    machines: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    for index, machine in enumerate(machines):
        newest_first = [
            event
            for event in events
            if event["kind"] in {"maintenance_started", "maintenance_completed"}
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
                    f"machines[{index}] maintenance timestamps contradict "
                    "lifecycle order."
                )
            previous_activity_at = activity_at
            if event["kind"] == "maintenance_started":
                if active_start is not None:
                    raise TrialValidationError(
                        f"machines[{index}] has a second open maintenance record."
                    )
                if event["summary"] != f"Started maintenance for {machine['name']}":
                    raise TrialValidationError(
                        f"machines[{index}] maintenance start summary is not canonical."
                    )
                active_start = event
                continue
            if active_start is None:
                raise TrialValidationError(
                    f"machines[{index}] completes maintenance that is not open."
                )
            if event["maintenanceStartActionId"] != active_start["actionId"]:
                raise TrialValidationError(
                    f"machines[{index}] maintenance completion does not reference "
                    "its open record."
                )
            if event["summary"] != f"Completed maintenance for {machine['name']}":
                raise TrialValidationError(
                    f"machines[{index}] maintenance completion summary is not canonical."
                )
            start_is_bound = "maintenanceStrategyActionId" in active_start
            completion_is_bound = "maintenanceStrategyActionId" in event
            if start_is_bound != completion_is_bound:
                raise TrialValidationError(
                    f"machines[{index}] maintenance completion strategy binding is inconsistent."
                )
            if start_is_bound and any(
                event[field] != active_start[field]
                for field in _MAINTENANCE_STRATEGY_BINDING_FIELDS
            ):
                raise TrialValidationError(
                    f"machines[{index}] maintenance completion does not match its reviewed strategy."
                )
            active_start = None


def _validate_equipment_import_history(
    equipment_master: Mapping[str, Any] | None,
    machines: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
) -> None:
    import_events = [
        event for event in events if event["kind"] == "equipment_master_imported"
    ]
    assets = equipment_master["assets"] if equipment_master is not None else []
    if not assets:
        if import_events:
            raise TrialValidationError(
                "Equipment import history requires retained equipment master records."
            )
        return
    machine_ids = {machine["id"] for machine in machines}
    if any(
        asset["commissioningStatus"] == "not_commissioned"
        and asset["id"] in machine_ids
        for asset in assets
    ):
        raise TrialValidationError(
            "Uncommissioned equipment master records cannot appear as runtime machines."
        )
    if len(import_events) > len(assets):
        raise TrialValidationError(
            "Equipment import history contains more events than retained assets."
        )
    seen_asset_ids: set[str] = set()
    for event in import_events:
        matching_assets = [
            asset for asset in assets if asset["sourceActionId"] == event["actionId"]
        ]
        matching_ids = [asset["id"] for asset in matching_assets]
        if not matching_assets or matching_ids != event["equipmentIds"]:
            raise TrialValidationError(
                "Equipment master records must match one immutable import event."
            )
        for asset in matching_assets:
            if (
                asset["sourcePackageDigest"] != event["evidenceReference"]
                or asset["importedAt"] != event["createdAt"]
            ):
                raise TrialValidationError(
                    "Equipment master source evidence does not match its import event."
                )
            if asset["id"] in seen_asset_ids:
                raise TrialValidationError(
                    "Equipment master records cannot reuse import evidence."
                )
            seen_asset_ids.add(asset["id"])
    if len(seen_asset_ids) != len(assets):
        raise TrialValidationError(
            "Every equipment master record requires one immutable import event."
        )


def _validate_equipment_commissioning_history(
    equipment_master: Mapping[str, Any] | None,
    machines: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
    opening_plan: Mapping[str, Any] | None,
) -> None:
    assets = equipment_master["assets"] if equipment_master is not None else []
    machine_by_id = {machine["id"]: machine for machine in machines}
    commission_events = [
        event for event in events if event["kind"] == "equipment_commissioned"
    ]
    commissioned_ids: set[str] = set()
    for asset in assets:
        matches = [
            event
            for event in commission_events
            if event["subjectId"] == asset["id"]
        ]
        machine = machine_by_id.get(asset["id"])
        if asset["commissioningStatus"] == "not_commissioned":
            if matches or machine is not None:
                raise TrialValidationError(
                    "Uncommissioned equipment cannot retain runtime commissioning history."
                )
            continue
        if len(matches) != 1 or machine is None:
            raise TrialValidationError(
                "Commissioned equipment requires one runtime machine and one immutable event."
            )
        event = matches[0]
        commissioning = asset["commissioning"]
        if (
            commissioning["actionId"] != event["actionId"]
            or commissioning["commissionedAt"] != event["createdAt"]
            or commissioning["commissionedBy"] != event["actor"]
            or commissioning["installedAt"] != event["installedAt"]
            or commissioning["initialState"] != event["toState"]
            or commissioning["safetyBaselineReference"]
            != event["evidenceReference"]
            or asset["workCentreId"] != event["workCentreId"]
            or machine["name"] != asset["name"]
            or event["summary"]
            != f"Commissioned {asset['name']} at {asset['workCentreId']}"
        ):
            raise TrialValidationError(
                "Equipment commissioning record does not match its immutable event."
            )
        commissioned_at = _timestamp(
            event["createdAt"], "equipment commissioning createdAt"
        )
        later_lifecycle = [
            candidate
            for candidate in events
            if candidate["subjectId"] == asset["id"]
            and candidate["kind"]
            in {
                "machine_state_changed",
                "downtime_started",
                "downtime_ended",
                "maintenance_started",
                "maintenance_completed",
                "equipment_maintenance_strategy_saved",
            }
        ]
        if any(
            _timestamp(candidate["createdAt"], "equipment lifecycle createdAt")
            < commissioned_at
            for candidate in later_lifecycle
        ):
            raise TrialValidationError(
                "Equipment lifecycle history cannot predate commissioning."
            )
        commissioned_ids.add(asset["id"])
    if len(commission_events) != len(commissioned_ids):
        raise TrialValidationError(
            "Equipment commissioning history contains an unknown or duplicate event."
        )
    if opening_plan is not None:
        opening_count = len(opening_plan["machineIds"])
        post_opening_ids = [machine["id"] for machine in machines[opening_count:]]
        if set(post_opening_ids) != commissioned_ids or len(post_opening_ids) != len(
            commissioned_ids
        ):
            raise TrialValidationError(
                "Every runtime machine added after opening requires equipment commissioning."
            )


def _validate_equipment_maintenance_strategy_history(
    equipment_master: Mapping[str, Any] | None,
    events: Sequence[dict[str, Any]],
) -> None:
    assets = equipment_master["assets"] if equipment_master is not None else []
    strategy_events = [
        event
        for event in events
        if event["kind"] == "equipment_maintenance_strategy_saved"
    ]
    maintenance_events = [
        event
        for event in events
        if event["kind"] in {"maintenance_started", "maintenance_completed"}
    ]
    retained_events = 0
    for asset in assets:
        matches = [
            event for event in strategy_events if event["subjectId"] == asset["id"]
        ]
        asset_maintenance_events = [
            event for event in maintenance_events if event["subjectId"] == asset["id"]
        ]
        for maintenance_event in asset_maintenance_events:
            maintenance_at = _parsed_timestamp(
                maintenance_event["createdAt"], "maintenance execution createdAt"
            )[1]
            applicable_strategy = next(
                (
                    strategy_event
                    for strategy_event in matches
                    if _parsed_timestamp(
                        strategy_event["createdAt"],
                        "maintenance strategy createdAt",
                    )[1]
                    <= maintenance_at
                ),
                None,
            )
            is_bound = "maintenanceStrategyActionId" in maintenance_event
            if (applicable_strategy is not None) != is_bound:
                raise TrialValidationError(
                    "Commissioned equipment maintenance must bind the strategy active at execution time."
                )
            if applicable_strategy is None:
                continue
            if (
                maintenance_event["maintenanceStrategyActionId"]
                != applicable_strategy["actionId"]
                or maintenance_event["maintenanceStrategyRevision"]
                != applicable_strategy["strategyRevision"]
                or maintenance_event["maintenanceProcedureReference"]
                != applicable_strategy["procedureReference"]
                or maintenance_event["maintenancePlannedDueAt"]
                != applicable_strategy["nextDueAt"]
                or (
                    maintenance_event["kind"] == "maintenance_started"
                    and maintenance_event["maintenanceOwner"]
                    != applicable_strategy["maintenanceOwner"]
                )
            ):
                raise TrialValidationError(
                    "Equipment maintenance execution does not match its immutable strategy revision."
                )
            if maintenance_event["kind"] == "maintenance_completed":
                expected_next_due = (
                    maintenance_at
                    + timedelta(days=applicable_strategy["intervalDays"])
                ).astimezone(timezone.utc).isoformat(
                    timespec="milliseconds"
                ).replace(
                    "+00:00", "Z"
                )
                if maintenance_event["nextDueAt"] != expected_next_due:
                    raise TrialValidationError(
                        "Equipment maintenance completion next due does not match its strategy interval."
                    )
        strategy = asset.get("maintenanceStrategy")
        if strategy is None:
            if matches:
                raise TrialValidationError(
                    "Equipment without a maintenance strategy cannot retain strategy history."
                )
            continue
        if asset["commissioningStatus"] != "commissioned":
            raise TrialValidationError(
                "Only commissioned equipment can retain a maintenance strategy."
            )
        expected_revisions = list(range(strategy["revision"], 0, -1))
        if [event["strategyRevision"] for event in matches] != expected_revisions:
            raise TrialValidationError(
                "Equipment maintenance strategy revisions must be complete and newest first."
            )
        commissioning = asset["commissioning"]
        commissioned_at = _timestamp(
            commissioning["commissionedAt"], "equipment commissionedAt"
        )
        if any(
            _timestamp(event["createdAt"], "maintenance strategy createdAt")
            < commissioned_at
            for event in matches
        ):
            raise TrialValidationError(
                "Equipment maintenance strategy history cannot predate commissioning."
            )
        latest = matches[0]
        latest_completion = next(
            (
                event
                for event in asset_maintenance_events
                if event["kind"] == "maintenance_completed"
                and event.get("maintenanceStrategyActionId") == latest["actionId"]
            ),
            None,
        )
        expected_current_next_due = (
            latest_completion["nextDueAt"]
            if latest_completion is not None
            else latest["nextDueAt"]
        )
        if (
            strategy["actionId"] != latest["actionId"]
            or strategy["savedAt"] != latest["createdAt"]
            or strategy["savedBy"] != latest["actor"]
            or strategy["maintenanceOwner"] != latest["maintenanceOwner"]
            or strategy["intervalDays"] != latest["intervalDays"]
            or strategy["nextDueAt"] != expected_current_next_due
            or strategy["procedureReference"] != latest["procedureReference"]
            or strategy["safetyBaselineReference"] != latest["evidenceReference"]
        ):
            raise TrialValidationError(
                "Equipment maintenance strategy does not match its latest immutable event."
            )
        retained_events += len(matches)
    if retained_events != len(strategy_events):
        raise TrialValidationError(
            "Equipment maintenance strategy history contains an unknown event."
        )


def validate_production_state(value: object) -> dict[str, Any]:
    """Validate a complete managed Production workspace without repairing it."""

    state = _object(value, "production state")
    _exact_fields(
        state,
        "production state",
        required=_STATE_FIELDS,
        optional=_STATE_OPTIONAL_FIELDS,
    )
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
    equipment_master = (
        _validate_equipment_master(state["equipmentMaster"])
        if "equipmentMaster" in state
        else None
    )
    job_ids = [job["id"] for job in jobs]
    issue_ids = [issue["id"] for issue in issues]
    machine_ids = [machine["id"] for machine in machines]
    equipment_ids = [
        asset["id"] for asset in equipment_master["assets"]
    ] if equipment_master is not None else []
    _unique(job_ids, "Production job ID")
    _unique(issue_ids, "Production issue ID")
    _unique(machine_ids, "Production machine ID")
    opening_plan = (
        _validate_opening_plan(
            state["openingPlan"],
            jobs=jobs,
            machines=machines,
        )
        if "openingPlan" in state
        else None
    )
    order_execution = (
        _validate_order_execution(state["orderExecution"])
        if "orderExecution" in state
        else None
    )

    events = [
        _validate_event(
            candidate,
            index,
            job_ids=frozenset(job_ids),
            issue_ids=frozenset(issue_ids),
            machine_ids=frozenset(machine_ids),
            equipment_ids=frozenset(equipment_ids),
        )
        for index, candidate in enumerate(events_raw)
    ]
    _unique([event["id"] for event in events], "Production event ID")
    _unique([event["actionId"] for event in events], "Production action ID")
    if order_execution is not None:
        execution_action_ids = {
            command["payload"]["proof"]["actionId"]
            for command in order_execution["commands"]
        }
        if execution_action_ids.intersection(event["actionId"] for event in events):
            raise TrialValidationError(
                "Production order execution action IDs cannot reuse operating event evidence."
            )
    if revision != len(events):
        raise TrialValidationError(
            "Production revision must equal the append-only event count."
        )

    _validate_job_history(
        jobs,
        events,
        opening_plan["jobIds"] if opening_plan is not None else None,
    )
    _validate_job_closure_history(jobs, events)
    _validate_output_history(jobs, events)
    _validate_material_history(jobs, events)
    _validate_quality_hold_history(jobs, events)
    _validate_issue_history(issues, events, machines)
    _validate_machine_history(machines, events)
    _validate_downtime_history(machines, events)
    _validate_maintenance_history(machines, events)
    _validate_equipment_import_history(equipment_master, machines, events)
    _validate_equipment_commissioning_history(
        equipment_master,
        machines,
        events,
        opening_plan,
    )
    _validate_equipment_maintenance_strategy_history(equipment_master, events)
    return deepcopy(state)


def project_production_maintenance_due_queue(
    value: object,
    as_of: object,
) -> dict[str, Any]:
    """Project reviewed preventive-maintenance due work without dispatching it."""

    state = validate_production_state(value)
    as_of_value = _maintenance_timestamp(as_of, "maintenance due queue asOf")
    as_of_time = datetime.fromisoformat(as_of_value.replace("Z", "+00:00"))
    criticality_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    items: list[dict[str, Any]] = []
    equipment_master = state.get("equipmentMaster")
    assets = equipment_master["assets"] if equipment_master is not None else []
    for asset in assets:
        strategy = asset.get("maintenanceStrategy")
        if asset["commissioningStatus"] != "commissioned" or strategy is None:
            continue
        due_time = datetime.fromisoformat(strategy["nextDueAt"].replace("Z", "+00:00"))
        remaining_ms = int((due_time - as_of_time).total_seconds() * 1000)
        latest_completion = next(
            (
                event
                for event in state["events"]
                if event["kind"] == "maintenance_completed"
                and event["subjectId"] == asset["id"]
                and event.get("maintenanceStrategyActionId") == strategy["actionId"]
            ),
            None,
        )
        item = {
            "assetId": asset["id"],
            "assetName": asset["name"],
            "criticality": asset["criticality"],
            "owner": strategy["maintenanceOwner"],
            "strategyActionId": strategy["actionId"],
            "strategyRevision": strategy["revision"],
            "procedureReference": strategy["procedureReference"],
            "dueAt": strategy["nextDueAt"],
            "status": (
                "overdue"
                if remaining_ms <= 0
                else "due_soon"
                if remaining_ms <= 7 * 86_400_000
                else "planned"
            ),
            "daysUntilDue": -(-remaining_ms // 86_400_000),
        }
        if latest_completion is not None:
            item["lastCompletionActionId"] = latest_completion["actionId"]
            item["lastCompletedAt"] = latest_completion["createdAt"]
        items.append(item)
    items.sort(
        key=lambda item: (
            0 if item["status"] == "overdue" else 1,
            item["dueAt"],
            criticality_rank[item["criticality"]],
            item["assetId"],
        )
    )
    return {
        "contract": "supermega.production.maintenance-due-queue.v1",
        "asOf": as_of_value,
        "items": items,
    }


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
    if "closure" in before:
        raise TrialValidationError("closed Production jobs cannot receive output.")
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
    if "closure" in job or job["output"] + job.get("scrap", 0) >= job["target"]:
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


def _validate_job_schedule_updated(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "issues", "machines")
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    if (
        "closure" in before
        or before["output"] + before.get("scrap", 0) >= before["target"]
    ):
        raise TrialValidationError(
            "job schedule can only change for an active Production job."
        )
    if event["subjectId"] != before["id"]:
        raise TrialValidationError(
            "job plan event must reference the one changed job."
        )
    if "jobOwner" not in event:
        raise TrialValidationError(
            "a new job plan update must name its responsible owner."
        )
    expected = {
        **before,
        "priority": event["jobPriority"],
        "dueAt": event["jobDueAt"],
        "owner": event["jobOwner"],
    }
    if after != expected:
        raise TrialValidationError(
            "job plan may change only the exact owner, priority, and due time."
        )
    if (
        before.get("priority") == event["jobPriority"]
        and before.get("dueAt") == event["jobDueAt"]
        and before.get("owner") == event["jobOwner"]
    ):
        raise TrialValidationError("job plan update must change the plan.")
    before_schedule_fields = _JOB_SCHEDULE_FIELDS.intersection(before)
    previous_fields = _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS.intersection(event)
    if before_schedule_fields == _JOB_SCHEDULE_FIELDS:
        if (
            previous_fields != _JOB_SCHEDULE_UPDATE_PREVIOUS_FIELDS
            or event["fromJobPriority"] != before["priority"]
            or event["fromJobDueAt"] != before["dueAt"]
        ):
            raise TrialValidationError(
                "job schedule update must freeze the exact previous plan."
            )
    elif previous_fields:
        raise TrialValidationError(
            "an unscheduled legacy job cannot invent a previous plan."
        )
    if "owner" in before:
        if event.get("fromJobOwner") != before["owner"]:
            raise TrialValidationError(
                "job plan update must freeze the exact previous owner."
            )
    elif "fromJobOwner" in event:
        raise TrialValidationError(
            "an unassigned legacy job cannot invent a previous owner."
        )
    latest_job_event = next(
        (
            candidate
            for candidate in current["events"]
            if candidate["subjectId"] == before["id"]
        ),
        None,
    )
    if latest_job_event is not None and datetime.fromisoformat(
        event["createdAt"].replace("Z", "+00:00")
    ) < datetime.fromisoformat(
        latest_job_event["createdAt"].replace("Z", "+00:00")
    ):
        raise TrialValidationError(
            "job plan confirmation cannot predate its latest activity."
        )
    if event["summary"] != (
        f"Updated {before['product']} plan for {before['line']}"
    ):
        raise TrialValidationError("job plan summary is not canonical.")


def _validate_job_closed(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "issues", "machines")
    before, after = _one_changed(current["jobs"], next_state["jobs"], "jobs")
    remaining = before["target"] - before["output"] - before.get("scrap", 0)
    if "closure" in before or remaining < 1:
        raise TrialValidationError("only an unfinished open job can close short.")
    closure = {
        "actionId": event["actionId"],
        "closedAt": event["createdAt"],
        "closedBy": event["actor"],
        "reason": event["reason"],
        "evidenceReference": event["evidenceReference"],
        "shiftRef": event["shiftRef"],
        "remainingUnits": event["remainingQuantity"],
    }
    if event["subjectId"] != before["id"]:
        raise TrialValidationError("job close event must reference the one changed job.")
    if event["remainingQuantity"] != remaining:
        raise TrialValidationError(
            "job close must freeze the exact remaining quantity."
        )
    if after != {**before, "closure": closure}:
        raise TrialValidationError(
            "job close may add only exact command evidence to one job."
        )
    if event["summary"] != (
        f"Closed {before['product']} short with {remaining} units remaining"
    ):
        raise TrialValidationError("job close summary is not canonical.")


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
    if (
        job["output"] != 0
        or _JOB_SCHEDULE_FIELDS.intersection(job) != _JOB_SCHEDULE_FIELDS
        or "owner" not in job
        or "scrap" in job
        or "qualityHold" in job
        or "closure" in job
    ):
        raise TrialValidationError(
            "a new Production job must name one owner and begin at zero good "
            "and scrap output without a quality hold or closure."
        )
    if (
        _JOB_CREATED_EVENT_FIELDS.intersection(event)
        != _JOB_CREATED_EVENT_FIELDS
        or event["jobPriority"] != job["priority"]
        or event["jobDueAt"] != job["dueAt"]
        or event.get("jobOwner") != job["owner"]
    ):
        raise TrialValidationError(
            "job creation must freeze the exact owner, priority, and due time."
        )
    if event["subjectId"] != job["id"]:
        raise TrialValidationError("job creation event must reference the new job.")
    if (
        "shopDemandSource" in job
        and event["evidenceReference"]
        != job["shopDemandSource"]["evidenceReference"]
    ):
        raise TrialValidationError(
            "Shop demand source must match the immutable job creation evidence."
        )
    expected_summary = f"Created {job['product']} job for {job['line']}"
    if event["summary"] != expected_summary:
        raise TrialValidationError("job creation summary is not canonical.")


def _validate_issue_opened(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "machines")
    if current.get("equipmentMaster") != next_state.get("equipmentMaster"):
        raise TrialValidationError(
            "opening a Production issue cannot change the equipment master."
        )
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
    if issue.get("maintenanceFindingSource") != event.get("maintenanceFindingSource"):
        raise TrialValidationError(
            "new Production issue maintenance source must match the opening event."
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
    if current.get("equipmentMaster") != next_state.get("equipmentMaster"):
        raise TrialValidationError(
            "resolving a Production issue cannot change the equipment master."
        )
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
        **(
            {"maintenanceCorrectiveAction": event["maintenanceCorrectiveAction"]}
            if "maintenanceCorrectiveAction" in event
            else {}
        ),
    }
    if ("maintenanceFindingSource" in before) != (
        "maintenanceCorrectiveAction" in event
    ):
        raise TrialValidationError(
            "maintenance finding resolution requires one structured corrective action only."
        )
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
    if "qualityHold" in before or "closure" in before:
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


def _open_maintenance_event(
    events: Sequence[Mapping[str, Any]],
    machine_id: str,
) -> Mapping[str, Any] | None:
    latest = next(
        (
            event
            for event in events
            if event["subjectId"] == machine_id
            and event["kind"] in {"maintenance_started", "maintenance_completed"}
        ),
        None,
    )
    return (
        latest
        if latest is not None and latest["kind"] == "maintenance_started"
        else None
    )


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


def _validate_maintenance_started(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    event: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "jobs", "issues", "machines")
    if current.get("equipmentMaster") != next_state.get("equipmentMaster"):
        raise TrialValidationError(
            "maintenance start cannot change the equipment master."
        )
    machine = next(
        (
            candidate
            for candidate in current["machines"]
            if candidate["id"] == event["subjectId"]
        ),
        None,
    )
    if machine is None:
        raise TrialValidationError("maintenance start must reference one machine.")
    if _open_maintenance_event(current["events"], machine["id"]) is not None:
        raise TrialValidationError(
            "a machine can have at most one open maintenance record."
        )
    if event["summary"] != f"Started maintenance for {machine['name']}":
        raise TrialValidationError("maintenance start summary is not canonical.")
    asset = next(
        (
            candidate
            for candidate in current.get("equipmentMaster", {}).get("assets", [])
            if candidate["id"] == machine["id"]
        ),
        None,
    )
    strategy = asset.get("maintenanceStrategy") if asset is not None else None
    is_bound = "maintenanceStrategyActionId" in event
    if (strategy is not None) != is_bound:
        raise TrialValidationError(
            "commissioned equipment maintenance must bind its current strategy."
        )
    if strategy is not None and (
        event["maintenanceOwner"] != strategy["maintenanceOwner"]
        or event["maintenanceStrategyActionId"] != strategy["actionId"]
        or event["maintenanceStrategyRevision"] != strategy["revision"]
        or event["maintenanceProcedureReference"]
        != strategy["procedureReference"]
        or event["maintenancePlannedDueAt"] != strategy["nextDueAt"]
    ):
        raise TrialValidationError(
            "maintenance start does not match the current reviewed strategy."
        )


def _validate_maintenance_completed(
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
        raise TrialValidationError("maintenance completion must reference one machine.")
    open_event = _open_maintenance_event(current["events"], machine["id"])
    if open_event is None:
        raise TrialValidationError("only open maintenance can be completed.")
    if event["maintenanceStartActionId"] != open_event["actionId"]:
        raise TrialValidationError(
            "maintenance completion must reference the exact open record."
        )
    if event["summary"] != f"Completed maintenance for {machine['name']}":
        raise TrialValidationError("maintenance completion summary is not canonical.")
    start_is_bound = "maintenanceStrategyActionId" in open_event
    completion_is_bound = "maintenanceStrategyActionId" in event
    if start_is_bound != completion_is_bound:
        raise TrialValidationError(
            "maintenance completion must retain the open strategy binding."
        )
    if not start_is_bound:
        if current.get("equipmentMaster") != next_state.get("equipmentMaster"):
            raise TrialValidationError(
                "legacy maintenance completion cannot change the equipment master."
            )
        return
    if not _MAINTENANCE_RESULT_FIELDS.issubset(event):
        raise TrialValidationError(
            "new strategy-bound maintenance completion requires one structured reviewed result."
        )
    assets = current.get("equipmentMaster", {}).get("assets", [])
    asset_index = next(
        (
            index
            for index, candidate in enumerate(assets)
            if candidate["id"] == machine["id"]
        ),
        None,
    )
    if asset_index is None:
        raise TrialValidationError(
            "strategy-bound maintenance must reference commissioned equipment."
        )
    strategy = assets[asset_index].get("maintenanceStrategy")
    if strategy is None or any(
        event[field] != open_event[field]
        for field in _MAINTENANCE_STRATEGY_BINDING_FIELDS
    ) or (
        event["maintenanceStrategyActionId"] != strategy["actionId"]
        or event["maintenanceStrategyRevision"] != strategy["revision"]
        or event["maintenanceProcedureReference"]
        != strategy["procedureReference"]
        or event["maintenancePlannedDueAt"] != strategy["nextDueAt"]
    ):
        raise TrialValidationError(
            "maintenance completion does not match its open reviewed strategy."
        )
    completed_at = _parsed_timestamp(
        event["createdAt"], "maintenance completion createdAt"
    )[1]
    expected_next_due = (
        completed_at + timedelta(days=strategy["intervalDays"])
    ).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )
    if event["nextDueAt"] != expected_next_due:
        raise TrialValidationError(
            "maintenance completion next due does not match its strategy interval."
        )
    expected_master = deepcopy(current["equipmentMaster"])
    expected_master["assets"][asset_index]["maintenanceStrategy"][
        "nextDueAt"
    ] = expected_next_due
    if next_state.get("equipmentMaster") != expected_master:
        raise TrialValidationError(
            "maintenance completion may advance only the selected strategy next due."
        )


def _reduce_equipment_master_import(
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    if set(payload) != {"equipment", "evidence"}:
        raise TrialValidationError(
            "Equipment master import must contain exactly equipment and evidence."
        )
    current_state = validate_production_state(current)
    evidence = _evidence(payload.get("evidence"))
    if evidence["reason"] != "Imported reviewed Plant equipment master":
        raise TrialValidationError("Equipment master import reason is not canonical.")
    if _DIGEST_PATTERN.fullmatch(evidence["evidenceReference"]) is None:
        raise TrialValidationError(
            "Equipment master import must reference the reviewed package digest."
        )
    equipment_raw = _list(
        payload.get("equipment"),
        "equipment",
        maximum=_MAX_EQUIPMENT,
    )
    if not equipment_raw:
        raise TrialValidationError("Equipment master import cannot be empty.")
    existing_assets = (
        current_state.get("equipmentMaster", {}).get("assets", [])
    )
    if len(existing_assets) + len(equipment_raw) > _MAX_EQUIPMENT:
        raise TrialValidationError("Equipment master exceeds its record limit.")
    existing_ids = {asset["id"] for asset in existing_assets}
    existing_ids.update(machine["id"] for machine in current_state["machines"])
    imported_ids: list[str] = []
    imported_assets: list[dict[str, Any]] = []
    for index, candidate in enumerate(equipment_raw):
        field = f"equipment[{index}]"
        equipment = _object(candidate, field)
        _exact_fields(equipment, field, required=_EQUIPMENT_IMPORT_FIELDS)
        equipment_id = _text(equipment["id"], f"{field}.id", maximum=80)
        work_centre_id = _text(
            equipment["workCentreId"], f"{field}.workCentreId", maximum=80
        )
        if (
            _EQUIPMENT_ID_PATTERN.fullmatch(equipment_id) is None
            or _EQUIPMENT_ID_PATTERN.fullmatch(work_centre_id) is None
        ):
            raise TrialValidationError(
                f"{field} IDs must use canonical uppercase equipment identifiers."
            )
        if equipment_id in existing_ids or equipment_id in imported_ids:
            raise TrialValidationError(
                "Equipment master import cannot replace or duplicate an equipment ID."
            )
        name = _text(equipment["name"], f"{field}.name", maximum=180)
        owner = _text(equipment["owner"], f"{field}.owner", maximum=120)
        criticality = equipment["criticality"]
        if criticality not in _EQUIPMENT_CRITICALITIES:
            raise TrialValidationError(f"{field}.criticality is unsupported.")
        imported_ids.append(equipment_id)
        imported_assets.append(
            {
                "id": equipment_id,
                "name": name,
                "workCentreId": work_centre_id,
                "criticality": criticality,
                "owner": owner,
                "commissioningStatus": "not_commissioned",
                "sourceActionId": evidence["actionId"],
                "sourcePackageDigest": evidence["evidenceReference"],
                "importedAt": evidence["capturedAt"],
            }
        )
    event = {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "equipment_master_imported",
        "subjectId": "equipment-master",
        "summary": f"Imported {len(imported_ids)} equipment master records",
        "equipmentIds": imported_ids,
    }
    next_state = deepcopy(current_state)
    next_state["revision"] += 1
    next_state["events"] = [event, *current_state["events"]]
    next_state["equipmentMaster"] = {
        "contract": _EQUIPMENT_MASTER_CONTRACT,
        "assets": [*existing_assets, *imported_assets],
    }
    return validate_production_state(next_state)


def _reduce_equipment_commission(
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    if set(payload) != _EQUIPMENT_COMMISSION_FIELDS | {"evidence"}:
        raise TrialValidationError(
            "Equipment commissioning must contain exactly one asset, installation, "
            "initial observation, safety baseline, and evidence."
        )
    current_state = validate_production_state(current)
    evidence = _evidence(payload.get("evidence"))
    if evidence["reason"] != "Commissioned reviewed Plant equipment":
        raise TrialValidationError("Equipment commissioning reason is not canonical.")
    equipment_id = _text(payload["equipmentId"], "equipmentId", maximum=80)
    asset = next(
        (
            candidate
            for candidate in current_state.get("equipmentMaster", {}).get("assets", [])
            if candidate["id"] == equipment_id
        ),
        None,
    )
    if asset is None:
        raise TrialValidationError(
            "Equipment commissioning requires one reviewed master record."
        )
    if asset["commissioningStatus"] != "not_commissioned":
        raise TrialValidationError("Equipment is already commissioned.")
    if any(machine["id"] == equipment_id for machine in current_state["machines"]):
        raise TrialValidationError(
            "Equipment commissioning cannot replace a runtime machine."
        )
    if len(current_state["machines"]) >= _MAX_MACHINES:
        raise TrialValidationError("Production runtime machine limit is reached.")
    installed_at_text = _text(payload["installedAt"], "installedAt", maximum=40)
    installed_at = _lifecycle_timestamp(
        installed_at_text, "installedAt", "equipment installation"
    )
    commissioned_at = _lifecycle_timestamp(
        evidence["capturedAt"],
        "evidence.capturedAt",
        "equipment commissioning",
    )
    imported_at = _lifecycle_timestamp(
        asset["importedAt"], "equipment.importedAt", "equipment import"
    )
    if installed_at > commissioned_at or commissioned_at < imported_at:
        raise TrialValidationError("Equipment commissioning chronology is invalid.")
    initial_state = payload["initialState"]
    if initial_state not in _MACHINE_STATES:
        raise TrialValidationError("initialState is unsupported.")
    safety_reference = _text(
        payload["safetyBaselineReference"],
        "safetyBaselineReference",
        maximum=240,
    )
    if evidence["evidenceReference"] != safety_reference:
        raise TrialValidationError(
            "Equipment commissioning evidence must match the safety baseline."
        )
    commissioned_asset = {
        **asset,
        "commissioningStatus": "commissioned",
        "commissioning": {
            "actionId": evidence["actionId"],
            "commissionedAt": evidence["capturedAt"],
            "commissionedBy": evidence["actor"],
            "installedAt": installed_at_text,
            "initialState": initial_state,
            "safetyBaselineReference": safety_reference,
        },
    }
    event = {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "equipment_commissioned",
        "subjectId": equipment_id,
        "summary": f"Commissioned {asset['name']} at {asset['workCentreId']}",
        "installedAt": installed_at_text,
        "toState": initial_state,
        "workCentreId": asset["workCentreId"],
    }
    next_state = deepcopy(current_state)
    next_state["revision"] += 1
    next_state["events"] = [event, *current_state["events"]]
    next_state["machines"] = [
        *current_state["machines"],
        {"id": equipment_id, "name": asset["name"], "state": initial_state},
    ]
    next_state["equipmentMaster"] = {
        "contract": _EQUIPMENT_MASTER_CONTRACT,
        "assets": [
            commissioned_asset if candidate["id"] == equipment_id else candidate
            for candidate in current_state["equipmentMaster"]["assets"]
        ],
    }
    return validate_production_state(next_state)


def _reduce_equipment_maintenance_strategy(
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    if set(payload) != _EQUIPMENT_MAINTENANCE_STRATEGY_PAYLOAD_FIELDS | {"evidence"}:
        raise TrialValidationError(
            "Equipment maintenance strategy must contain exactly one asset, owner, "
            "interval, next due time, procedure, safety baseline, and evidence."
        )
    current_state = validate_production_state(current)
    evidence = _evidence(payload.get("evidence"))
    if evidence["reason"] != "Saved reviewed preventive maintenance strategy":
        raise TrialValidationError(
            "Equipment maintenance strategy reason is not canonical."
        )
    equipment_id = _text(payload["equipmentId"], "equipmentId", maximum=80)
    asset = next(
        (
            candidate
            for candidate in current_state.get("equipmentMaster", {}).get("assets", [])
            if candidate["id"] == equipment_id
        ),
        None,
    )
    if asset is None or asset["commissioningStatus"] != "commissioned":
        raise TrialValidationError(
            "Maintenance strategy requires one commissioned equipment master record."
        )
    if not any(machine["id"] == equipment_id for machine in current_state["machines"]):
        raise TrialValidationError(
            "Maintenance strategy requires the retained equipment runtime."
        )
    if _open_maintenance_event(current_state["events"], equipment_id) is not None:
        raise TrialValidationError(
            "Complete open maintenance before revising its preventive strategy."
        )
    saved_at_text = _lifecycle_timestamp(
        evidence["capturedAt"],
        "evidence.capturedAt",
        "equipment maintenance strategy",
    )
    saved_at = datetime.fromisoformat(saved_at_text.replace("Z", "+00:00"))
    commissioned_at = datetime.fromisoformat(
        asset["commissioning"]["commissionedAt"].replace("Z", "+00:00")
    )
    if saved_at < commissioned_at:
        raise TrialValidationError(
            "Equipment maintenance strategy cannot predate commissioning."
        )
    maintenance_owner = _text(
        payload["maintenanceOwner"], "maintenanceOwner", maximum=120
    )
    interval_days = _integer(payload["intervalDays"], "intervalDays", minimum=1)
    if interval_days > 3650:
        raise TrialValidationError("intervalDays cannot exceed 3650.")
    next_due_at_text = _lifecycle_timestamp(
        payload["nextDueAt"], "nextDueAt", "equipment maintenance strategy"
    )
    next_due_at = datetime.fromisoformat(next_due_at_text.replace("Z", "+00:00"))
    if next_due_at <= saved_at or next_due_at > saved_at + timedelta(days=interval_days):
        raise TrialValidationError(
            "nextDueAt must follow strategy save time within intervalDays."
        )
    procedure_reference = _text(
        payload["procedureReference"], "procedureReference", maximum=240
    )
    safety_reference = _text(
        payload["safetyBaselineReference"],
        "safetyBaselineReference",
        maximum=240,
    )
    if evidence["evidenceReference"] != safety_reference:
        raise TrialValidationError(
            "Maintenance strategy evidence must match the safety baseline."
        )
    strategy_revision = asset.get("maintenanceStrategy", {}).get("revision", 0) + 1
    strategy = {
        "revision": strategy_revision,
        "actionId": evidence["actionId"],
        "savedAt": saved_at_text,
        "savedBy": evidence["actor"],
        "maintenanceOwner": maintenance_owner,
        "intervalDays": interval_days,
        "nextDueAt": next_due_at_text,
        "procedureReference": procedure_reference,
        "safetyBaselineReference": safety_reference,
    }
    event = {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": saved_at_text,
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "equipment_maintenance_strategy_saved",
        "subjectId": equipment_id,
        "summary": f"Saved maintenance strategy R{strategy_revision} for {equipment_id}",
        "strategyRevision": strategy_revision,
        "maintenanceOwner": maintenance_owner,
        "intervalDays": interval_days,
        "nextDueAt": next_due_at_text,
        "procedureReference": procedure_reference,
    }
    next_state = deepcopy(current_state)
    next_state["revision"] += 1
    next_state["events"] = [event, *current_state["events"]]
    next_state["equipmentMaster"] = {
        "contract": _EQUIPMENT_MASTER_CONTRACT,
        "assets": [
            {**candidate, "maintenanceStrategy": strategy}
            if candidate["id"] == equipment_id
            else candidate
            for candidate in current_state["equipmentMaster"]["assets"]
        ],
    }
    return validate_production_state(next_state)


def _validate_order_execution_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    evidence: Mapping[str, str],
) -> None:
    _require_unchanged(
        current,
        next_state,
        "revision",
        "jobs",
        "issues",
        "machines",
        "events",
    )
    before = current.get("orderExecution", create_empty_plant_order_state())
    after = next_state.get("orderExecution")
    if not isinstance(after, Mapping):
        raise TrialValidationError(
            "production.order_execution.recorded must retain one Plant execution state."
        )
    if (
        after["revision"] != before["revision"] + 1
        or after["commands"][:-1] != before["commands"]
        or len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][-1]["previousDigest"] != before["headDigest"]
    ):
        raise TrialValidationError(
            "production.order_execution.recorded must append exactly one chained command."
        )
    command = after["commands"][-1]
    if command["payload"]["proof"] != dict(evidence):
        raise TrialValidationError(
            "Plant execution command proof must match the authenticated Production evidence."
        )
    projection = project_plant_order(after)
    plan = projection["plan"]
    if not isinstance(plan, Mapping):
        raise TrialValidationError("Plant execution must retain one reviewed plan.")
    matching_jobs = [job for job in current["jobs"] if job["id"] == plan["job"]["jobId"]]
    if len(matching_jobs) != 1:
        raise TrialValidationError("Plant execution must bind one current Production job.")
    job = matching_jobs[0]
    remaining = job["target"] - job["output"] - job.get("scrap", 0)
    if (
        "closure" in job
        or "qualityHold" in job
        or remaining < 1
        or plan["job"]["product"] != job["product"]
        or plan["job"]["targetQuantity"] != remaining
    ):
        raise TrialValidationError(
            "Plant execution no longer matches the current open Production job."
        )


_TRANSITION_VALIDATORS: dict[
    str,
    Callable[
        [Mapping[str, Any], Mapping[str, Any], Mapping[str, Any]],
        None,
    ],
] = {
    "production.job.created": _validate_job_created,
    "production.job.schedule_updated": _validate_job_schedule_updated,
    "production.job.closed": _validate_job_closed,
    "production.output.recorded": _validate_output_recorded,
    "production.material.consumed": _validate_material_consumed,
    "production.issue.opened": _validate_issue_opened,
    "production.issue.resolved": _validate_issue_resolved,
    "production.quality_hold.placed": _validate_quality_hold_placed,
    "production.quality_hold.released": _validate_quality_hold_released,
    "production.machine_state.changed": _validate_machine_state_changed,
    "production.downtime.started": _validate_downtime_started,
    "production.downtime.ended": _validate_downtime_ended,
    "production.maintenance.started": _validate_maintenance_started,
    "production.maintenance.completed": _validate_maintenance_completed,
}


def create_production_job_from_intent(
    current_value: Mapping[str, Any],
    intent_value: Mapping[str, Any],
    evidence_value: Mapping[str, Any],
) -> dict[str, Any]:
    """Create one scheduled Plant job from a narrow server-owned intent."""

    current = validate_production_state(current_value)
    intent = _object(intent_value, "production job intent")
    _exact_fields(
        intent,
        "production job intent",
        required=frozenset(
            {"jobId", "line", "product", "target", "owner", "priority", "dueAt"}
        ),
    )
    evidence = _evidence(evidence_value)
    job_id = _text(intent["jobId"], "production job intent.jobId", maximum=80)
    line = _text(intent["line"], "production job intent.line", maximum=120)
    product = _text(intent["product"], "production job intent.product")
    target = _integer(intent["target"], "production job intent.target", minimum=1)
    owner = _text(intent["owner"], "production job intent.owner", maximum=120)
    priority = intent["priority"]
    if not isinstance(priority, str) or priority not in _JOB_PRIORITIES:
        raise TrialValidationError("production job intent.priority is unsupported.")
    due_at = _timestamp(intent["dueAt"], "production job intent.dueAt")
    if _parsed_timestamp(due_at, "production job intent.dueAt")[1] <= _parsed_timestamp(
        evidence["capturedAt"],
        "evidence.capturedAt",
    )[1]:
        raise TrialValidationError("production job intent.dueAt must remain in the future.")
    if any(job["id"] == job_id for job in current["jobs"]):
        raise TrialValidationError("production job intent.jobId is already in use.")
    job = {
        "id": job_id,
        "line": line,
        "product": product,
        "target": target,
        "output": 0,
        "owner": owner,
        "priority": priority,
        "dueAt": due_at,
    }
    event = {
        "id": f"EVT-{evidence['actionId']}",
        "actionId": evidence["actionId"],
        "createdAt": evidence["capturedAt"],
        "actor": evidence["actor"],
        "reason": evidence["reason"],
        "evidenceReference": evidence["evidenceReference"],
        "kind": "job_created",
        "subjectId": job_id,
        "summary": f"Created {product} job for {line}",
        "jobPriority": priority,
        "jobDueAt": due_at,
        "jobOwner": owner,
    }
    return validate_production_state(
        {
            **current,
            "revision": current["revision"] + 1,
            "jobs": [job, *current["jobs"]],
            "events": [event, *current["events"]],
        }
    )


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
    if event_type == "production.equipment_master.imported":
        return _reduce_equipment_master_import(current, payload)
    if event_type == "production.equipment.commissioned":
        return _reduce_equipment_commission(current, payload)
    if event_type == "production.equipment_maintenance_strategy.saved":
        return _reduce_equipment_maintenance_strategy(current, payload)
    if event_type == "production.job.created" and isinstance(payload.get("intent"), Mapping):
        payload = {
            "state": create_production_job_from_intent(
                current,
                payload["intent"],
                payload.get("evidence", {}),
            ),
            "evidence": payload.get("evidence"),
        }
    next_state, evidence = _payload(payload)
    if event_type == "production.workspace.initialized":
        if dict(current):
            raise TrialValidationError("managed Production is already initialized.")
        opening_plan = next_state.get("openingPlan")
        legacy_shape_is_valid = (
            opening_plan is None
            and len(next_state["jobs"]) == 1
            and len(next_state["machines"]) == 1
        )
        managed_plan_shape_is_valid = (
            opening_plan is not None
            and bool(next_state["jobs"])
        )
        jobs_are_pristine = all(
            job["output"] == 0
            and _JOB_SCHEDULE_FIELDS.intersection(job) == _JOB_SCHEDULE_FIELDS
            and "owner" in job
            and "scrap" not in job
            and "qualityHold" not in job
            and "closure" not in job
            for job in next_state["jobs"]
        )
        order_execution = next_state.get("orderExecution")
        if (
            next_state["revision"] != 0
            or not (legacy_shape_is_valid or managed_plan_shape_is_valid)
            or next_state["issues"]
            or next_state["events"]
            or (
                order_execution is not None
                and order_execution != create_empty_plant_order_state()
            )
            or not jobs_are_pristine
            or any(
                machine["state"] != "running"
                for machine in next_state["machines"]
            )
        ):
            raise TrialValidationError(
                "Production initialization requires owned, scheduled zero-output "
                "jobs, any declared machines to be running, and no copied operating "
                "history. Multiple opening records require one immutable opening plan."
            )
        if opening_plan is not None and (
            opening_plan["confirmedAt"] != evidence["capturedAt"]
            or opening_plan["packageDigest"] != evidence["evidenceReference"]
        ):
            raise TrialValidationError(
                "The Production opening plan must match the exact confirmation "
                "time and reviewed package digest."
            )
        confirmed_at = _parsed_timestamp(
            evidence["capturedAt"],
            "evidence.capturedAt",
        )[1]
        for index, job in enumerate(next_state["jobs"]):
            if _parsed_timestamp(job["dueAt"], f"jobs[{index}].dueAt")[1] <= confirmed_at:
                raise TrialValidationError(
                    "Every opening Production job due time must follow confirmation."
                )
        return next_state

    current_state = validate_production_state(current)
    if current_state.get("openingPlan") != next_state.get("openingPlan"):
        raise TrialValidationError(
            "Production opening plan evidence is immutable after initialization."
        )
    if event_type == "production.order_execution.recorded":
        _validate_order_execution_recorded(current_state, next_state, evidence)
        return next_state
    if current_state.get("orderExecution") != next_state.get("orderExecution"):
        raise TrialValidationError(
            "Production order execution can change only through its dedicated event."
        )
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
    "create_production_job_from_intent",
    "project_production_maintenance_due_queue",
    "reduce_production_state",
    "validate_production_state",
]
