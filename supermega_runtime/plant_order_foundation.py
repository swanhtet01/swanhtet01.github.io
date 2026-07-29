"""Deterministic, no-I/O Plant order execution foundation.

The foundation binds one reviewed production plan to an append-only execution
chain.  It intentionally records human decisions and observations only: it
does not control equipment, move inventory, post accounting, or release a
batch without attributable approval.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any


PLANT_ORDER_STATE_SCHEMA = "supermega.plant.order_foundation.v1"
PLANT_ORDER_PLAN_CONTRACT = "supermega.plant.reviewed_plan.v1"
PLANT_ORDER_EXECUTION_PLAN_CONTRACT = "supermega.plant.reviewed_plan.v2"
PLANT_ORDER_CONTROLLED_PLAN_CONTRACT = "supermega.plant.reviewed_plan.v3"
PLANT_ORDER_PROJECTION_CONTRACT = "supermega.plant.order_projection.v1"
EMPTY_PLANT_ORDER_DIGEST = f"sha256:{'0' * 64}"

_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_BUSINESS_ID = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$")
_ISO_TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$"
)
_MATERIAL_UNITS = frozenset(
    {"kg", "g", "l", "ml", "pcs", "pack", "bag", "roll", "sheet", "m", "cm"}
)
_COMMAND_KINDS = frozenset(
    {
        "import_plan",
        "availability_check",
        "release_order",
        "record_calibration",
        "issue_material",
        "record_effectiveness",
        "record_operation",
        "record_output",
        "inspect_output",
        "release_batch",
    }
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_COMMANDS = 2_000
_MAX_MATERIALS = 100
_MAX_WORK_CENTRES = 50
_MAX_ROUTING_STEPS = 100


class PlantOrderValidationError(ValueError):
    """Raised when Plant order evidence cannot be proved internally consistent."""


def _fail(message: str) -> PlantOrderValidationError:
    return PlantOrderValidationError(message)


def _object(value: object, field: str, keys: Sequence[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    if any(not isinstance(key, str) for key in value) or frozenset(value) != frozenset(keys):
        raise _fail(f"{field} fields do not match the contract.")
    return value


def _array(
    value: object,
    field: str,
    *,
    minimum: int = 0,
    maximum: int,
) -> list[Any]:
    if not isinstance(value, list) or not minimum <= len(value) <= maximum:
        raise _fail(f"{field} must contain between {minimum} and {maximum} items.")
    return value


def _text(value: object, field: str, *, maximum: int = 180) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise _fail(f"{field} must be nonblank trimmed text.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if any(ord(character) <= 31 or ord(character) == 127 for character in value):
        raise _fail(f"{field} contains a control character.")
    if len(value.encode("utf-16-le")) // 2 > maximum:
        raise _fail(f"{field} exceeds its supported length.")
    return value


def _identifier(value: object, field: str, prefix: str | None = None) -> str:
    candidate = _text(value, field, maximum=80)
    if _BUSINESS_ID.fullmatch(candidate) is None or (
        prefix is not None and not candidate.startswith(f"{prefix}-")
    ):
        label = f"{prefix} " if prefix else "business "
        raise _fail(f"{field} must be a canonical {label}identifier.")
    return candidate


def _integer(value: object, field: str, *, minimum: int = 0) -> int:
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or value < minimum
        or value > _MAX_SAFE_INTEGER
    ):
        raise _fail(f"{field} must be a supported integer quantity.")
    return value


def _safe_product(left: int, right: int, field: str) -> int:
    value = left * right
    if value > _MAX_SAFE_INTEGER:
        raise _fail(f"{field} exceeds the supported quantity range.")
    return value


def _digest(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=71)
    if _DIGEST.fullmatch(candidate) is None:
        raise _fail(f"{field} must be a SHA-256 digest.")
    return candidate


def _timestamp(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=40)
    if _ISO_TIMESTAMP.fullmatch(candidate) is None:
        raise _fail(f"{field} must be an ISO timestamp with an explicit offset.")
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise _fail(f"{field} must be a real calendar timestamp.") from exc
    if parsed.utcoffset() is None:
        raise _fail(f"{field} must include a UTC offset.")
    return candidate


def _unique(values: Sequence[str], field: str) -> None:
    if len(values) != len(set(values)):
        raise _fail(f"{field} contains duplicates.")


def _sorted(values: Sequence[str], field: str) -> None:
    if list(values) != sorted(values):
        raise _fail(f"{field} must use canonical identifier order.")


def _canonical_digest(value: object) -> str:
    try:
        encoded = json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise _fail("Plant order evidence is not canonical JSON.") from exc
    return f"sha256:{sha256(encoded).hexdigest()}"


def _canonical_copy(value: object) -> Any:
    try:
        return json.loads(
            json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)
        )
    except (TypeError, ValueError) as exc:
        raise _fail("Plant order evidence is not detached canonical JSON.") from exc


def plant_order_evidence_digest(value: object) -> str:
    """Return the cross-runtime canonical digest used by reviewed evidence."""

    return _canonical_digest(value)


def _proof(value: object, field: str) -> dict[str, str]:
    source = _object(
        value,
        field,
        ("actionId", "capturedAt", "actor", "reason", "evidenceReference"),
    )
    return {
        "actionId": _identifier(source["actionId"], f"{field}.actionId", "ACT"),
        "capturedAt": _timestamp(source["capturedAt"], f"{field}.capturedAt"),
        "actor": _text(source["actor"], f"{field}.actor", maximum=120),
        "reason": _text(source["reason"], f"{field}.reason", maximum=300),
        "evidenceReference": _text(
            source["evidenceReference"],
            f"{field}.evidenceReference",
            maximum=180,
        ),
    }


def _job(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        ("jobId", "product", "targetQuantity", "outputBatchId"),
    )
    return {
        "jobId": _identifier(source["jobId"], f"{field}.jobId", "JOB"),
        "product": _text(source["product"], f"{field}.product"),
        "targetQuantity": _integer(
            source["targetQuantity"], f"{field}.targetQuantity", minimum=1
        ),
        "outputBatchId": _identifier(
            source["outputBatchId"], f"{field}.outputBatchId", "BATCH"
        ),
    }


def _materials(value: object, field: str) -> list[dict[str, Any]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_MATERIALS)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            ("materialId", "name", "unit", "quantityPerUnitMilli"),
        )
        unit = source["unit"]
        if not isinstance(unit, str) or unit not in _MATERIAL_UNITS:
            raise _fail(f"{row_field}.unit is unsupported.")
        result.append(
            {
                "materialId": _identifier(
                    source["materialId"], f"{row_field}.materialId", "MAT"
                ),
                "name": _text(source["name"], f"{row_field}.name"),
                "unit": unit,
                "quantityPerUnitMilli": _integer(
                    source["quantityPerUnitMilli"],
                    f"{row_field}.quantityPerUnitMilli",
                    minimum=1,
                ),
            }
        )
    ids = [row["materialId"] for row in result]
    _unique(ids, f"{field} material IDs")
    _sorted(ids, f"{field} material IDs")
    return result


def _work_centres(value: object, field: str) -> list[dict[str, str]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_WORK_CENTRES)
    result: list[dict[str, str]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(candidate, row_field, ("workCentreId", "name"))
        result.append(
            {
                "workCentreId": _identifier(
                    source["workCentreId"], f"{row_field}.workCentreId", "WC"
                ),
                "name": _text(source["name"], f"{row_field}.name"),
            }
        )
    ids = [row["workCentreId"] for row in result]
    _unique(ids, f"{field} work-centre IDs")
    _sorted(ids, f"{field} work-centre IDs")
    return result


def _routing(
    value: object,
    field: str,
    *,
    work_centre_ids: frozenset[str],
) -> list[dict[str, Any]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_ROUTING_STEPS)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            (
                "operationId",
                "sequence",
                "name",
                "workCentreId",
                "minutesPerUnitMilli",
            ),
        )
        work_centre_id = _identifier(
            source["workCentreId"], f"{row_field}.workCentreId", "WC"
        )
        if work_centre_id not in work_centre_ids:
            raise _fail(f"{row_field}.workCentreId is unknown.")
        sequence = _integer(source["sequence"], f"{row_field}.sequence", minimum=1)
        if sequence != index + 1:
            raise _fail(f"{row_field}.sequence must be contiguous and ordered.")
        result.append(
            {
                "operationId": _identifier(
                    source["operationId"], f"{row_field}.operationId", "OP"
                ),
                "sequence": sequence,
                "name": _text(source["name"], f"{row_field}.name"),
                "workCentreId": work_centre_id,
                "minutesPerUnitMilli": _integer(
                    source["minutesPerUnitMilli"],
                    f"{row_field}.minutesPerUnitMilli",
                    minimum=1,
                ),
            }
        )
    _unique([row["operationId"] for row in result], f"{field} operation IDs")
    return result


def _validate_plan_package(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "plan package",
        (
            "contract",
            "planId",
            "sourceDigest",
            "job",
            "materials",
            "workCentres",
            "routing",
            "packageDigest",
        ),
    )
    if source["contract"] not in {
        PLANT_ORDER_PLAN_CONTRACT,
        PLANT_ORDER_EXECUTION_PLAN_CONTRACT,
        PLANT_ORDER_CONTROLLED_PLAN_CONTRACT,
    }:
        raise _fail("plan package.contract is unsupported.")
    contract = source["contract"]
    plan_id = _identifier(source["planId"], "plan package.planId", "PLN")
    source_digest = _digest(source["sourceDigest"], "plan package.sourceDigest")
    job = _job(source["job"], "plan package.job")
    materials = _materials(source["materials"], "plan package.materials")
    work_centres = _work_centres(source["workCentres"], "plan package.workCentres")
    routing = _routing(
        source["routing"],
        "plan package.routing",
        work_centre_ids=frozenset(row["workCentreId"] for row in work_centres),
    )
    for row in materials:
        _safe_product(
            job["targetQuantity"],
            row["quantityPerUnitMilli"],
            f"plan package material requirement for {row['materialId']}",
        )
    for row in routing:
        _safe_product(
            job["targetQuantity"],
            row["minutesPerUnitMilli"],
            f"plan package capacity requirement for {row['operationId']}",
        )
    canonical = {
        "contract": contract,
        "planId": plan_id,
        "sourceDigest": source_digest,
        "job": job,
        "materials": materials,
        "workCentres": work_centres,
        "routing": routing,
    }
    package_digest = _digest(source["packageDigest"], "plan package.packageDigest")
    if package_digest != _canonical_digest(canonical):
        raise _fail("plan package.packageDigest does not match its reviewed contents.")
    return {**canonical, "packageDigest": package_digest}


def build_plant_order_plan(
    *,
    plan_id: object,
    source_digest: object,
    job: object,
    materials: object,
    work_centres: object,
    routing: object,
) -> dict[str, Any]:
    """Build and validate one immutable BOM/routing execution package."""

    candidate = {
        "contract": PLANT_ORDER_PLAN_CONTRACT,
        "planId": plan_id,
        "sourceDigest": source_digest,
        "job": job,
        "materials": materials,
        "workCentres": work_centres,
        "routing": routing,
    }
    candidate["packageDigest"] = _canonical_digest(candidate)
    return _validate_plan_package(candidate)


def build_plant_order_execution_plan(
    *,
    plan_id: object,
    source_digest: object,
    job: object,
    materials: object,
    work_centres: object,
    routing: object,
) -> dict[str, Any]:
    """Build a v2 package that requires operation evidence before output."""

    candidate = {
        "contract": PLANT_ORDER_EXECUTION_PLAN_CONTRACT,
        "planId": plan_id,
        "sourceDigest": source_digest,
        "job": job,
        "materials": materials,
        "workCentres": work_centres,
        "routing": routing,
    }
    candidate["packageDigest"] = _canonical_digest(candidate)
    return _validate_plan_package(candidate)


def build_plant_order_controlled_plan(
    *,
    plan_id: object,
    source_digest: object,
    job: object,
    materials: object,
    work_centres: object,
    routing: object,
) -> dict[str, Any]:
    """Build a v3 package with routed calibration controls."""

    candidate = {
        "contract": PLANT_ORDER_CONTROLLED_PLAN_CONTRACT,
        "planId": plan_id,
        "sourceDigest": source_digest,
        "job": job,
        "materials": materials,
        "workCentres": work_centres,
        "routing": routing,
    }
    candidate["packageDigest"] = _canonical_digest(candidate)
    return _validate_plan_package(candidate)


def create_empty_plant_order_state() -> dict[str, Any]:
    return {
        "schema": PLANT_ORDER_STATE_SCHEMA,
        "revision": 0,
        "headDigest": EMPTY_PLANT_ORDER_DIGEST,
        "commands": [],
    }


def _material_availability(value: object, field: str) -> list[dict[str, Any]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_MATERIALS)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            ("materialId", "inputLotId", "availableQuantityMilli"),
        )
        result.append(
            {
                "materialId": _identifier(
                    source["materialId"], f"{row_field}.materialId", "MAT"
                ),
                "inputLotId": _identifier(
                    source["inputLotId"], f"{row_field}.inputLotId", "LOT"
                ),
                "availableQuantityMilli": _integer(
                    source["availableQuantityMilli"],
                    f"{row_field}.availableQuantityMilli",
                ),
            }
        )
    ids = [row["materialId"] for row in result]
    _unique(ids, f"{field} material IDs")
    _sorted(ids, f"{field} material IDs")
    return result


def _capacity_availability(value: object, field: str) -> list[dict[str, Any]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_WORK_CENTRES)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(candidate, row_field, ("workCentreId", "availableMinutes"))
        result.append(
            {
                "workCentreId": _identifier(
                    source["workCentreId"], f"{row_field}.workCentreId", "WC"
                ),
                "availableMinutes": _integer(
                    source["availableMinutes"],
                    f"{row_field}.availableMinutes",
                ),
            }
        )
    ids = [row["workCentreId"] for row in result]
    _unique(ids, f"{field} work-centre IDs")
    _sorted(ids, f"{field} work-centre IDs")
    return result


def _effectiveness_work_centres(value: object, field: str) -> list[dict[str, Any]]:
    rows = _array(value, field, minimum=1, maximum=_MAX_WORK_CENTRES)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate, row_field, ("workCentreId", "plannedProductiveMinutesMilli")
        )
        result.append(
            {
                "workCentreId": _identifier(
                    source["workCentreId"], f"{row_field}.workCentreId", "WC"
                ),
                "plannedProductiveMinutesMilli": _integer(
                    source["plannedProductiveMinutesMilli"],
                    f"{row_field}.plannedProductiveMinutesMilli",
                    minimum=1,
                ),
            }
        )
    ids = [row["workCentreId"] for row in result]
    _unique(ids, f"{field} work-centre IDs")
    _sorted(ids, f"{field} work-centre IDs")
    return result


def _duration_minutes_milli(started_at: object, ended_at: object, field: str) -> int:
    started = datetime.fromisoformat(
        _timestamp(started_at, f"{field}.startedAt").replace("Z", "+00:00")
    )
    ended = datetime.fromisoformat(
        _timestamp(ended_at, f"{field}.endedAt").replace("Z", "+00:00")
    )
    delta = ended - started
    duration_micros = (
        delta.days * 86_400_000_000
        + delta.seconds * 1_000_000
        + delta.microseconds
    )
    if duration_micros <= 0:
        raise _fail(f"{field}.endedAt must follow startedAt.")
    if duration_micros % 60_000:
        raise _fail(
            f"{field} duration must resolve to whole thousandths of a minute."
        )
    duration = duration_micros // 60_000
    if duration > _MAX_SAFE_INTEGER:
        raise _fail(f"{field} duration exceeds the supported range.")
    return duration


def _downtime_intervals(value: object, field: str) -> list[dict[str, Any]]:
    rows = _array(value, field, maximum=200)
    result: list[dict[str, Any]] = []
    for index, candidate in enumerate(rows):
        row_field = f"{field}[{index}]"
        source = _object(
            candidate,
            row_field,
            ("downtimeId", "workCentreId", "startedAt", "endedAt"),
        )
        row = {
            "downtimeId": _identifier(
                source["downtimeId"], f"{row_field}.downtimeId", "DT"
            ),
            "workCentreId": _identifier(
                source["workCentreId"], f"{row_field}.workCentreId", "WC"
            ),
            "startedAt": _timestamp(source["startedAt"], f"{row_field}.startedAt"),
            "endedAt": _timestamp(source["endedAt"], f"{row_field}.endedAt"),
        }
        _duration_minutes_milli(row["startedAt"], row["endedAt"], row_field)
        result.append(row)
    ids = [row["downtimeId"] for row in result]
    _unique(ids, f"{field} downtime IDs")
    _sorted(ids, f"{field} downtime IDs")
    return result


def _effectiveness_command(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        (
            "kind",
            "id",
            "planId",
            "jobId",
            "windowStart",
            "windowEnd",
            "sourceDigest",
            "workCentres",
            "downtimeIntervals",
            "proof",
        ),
    )
    plan_id = _identifier(source["planId"], f"{field}.planId", "PLN")
    job_id = _identifier(source["jobId"], f"{field}.jobId", "JOB")
    window_start = _timestamp(source["windowStart"], f"{field}.windowStart")
    window_end = _timestamp(source["windowEnd"], f"{field}.windowEnd")
    window_duration = _duration_minutes_milli(window_start, window_end, field)
    work_centres = _effectiveness_work_centres(
        source["workCentres"], f"{field}.workCentres"
    )
    downtime_intervals = _downtime_intervals(
        source["downtimeIntervals"], f"{field}.downtimeIntervals"
    )
    source_digest = _digest(source["sourceDigest"], f"{field}.sourceDigest")
    evidence = {
        "planId": plan_id,
        "jobId": job_id,
        "windowStart": window_start,
        "windowEnd": window_end,
        "workCentres": work_centres,
        "downtimeIntervals": downtime_intervals,
    }
    if source_digest != _canonical_digest(evidence):
        raise _fail(
            f"{field}.sourceDigest does not match its order-bound effectiveness evidence."
        )
    centre_ids = {row["workCentreId"] for row in work_centres}
    window_start_dt = datetime.fromisoformat(window_start.replace("Z", "+00:00"))
    window_end_dt = datetime.fromisoformat(window_end.replace("Z", "+00:00"))
    by_centre: dict[str, list[tuple[datetime, datetime, int]]] = {}
    for index, interval in enumerate(downtime_intervals):
        if interval["workCentreId"] not in centre_ids:
            raise _fail(
                f"{field}.downtimeIntervals[{index}].workCentreId is not in the effectiveness work centres."
            )
        start = datetime.fromisoformat(interval["startedAt"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(interval["endedAt"].replace("Z", "+00:00"))
        if start < window_start_dt or end > window_end_dt:
            raise _fail(
                f"{field}.downtimeIntervals[{index}] falls outside the effectiveness window."
            )
        by_centre.setdefault(interval["workCentreId"], []).append(
            (
                start,
                end,
                _duration_minutes_milli(
                    interval["startedAt"],
                    interval["endedAt"],
                    f"{field}.downtimeIntervals[{index}]",
                ),
            )
        )
    for centre in work_centres:
        centre_id = centre["workCentreId"]
        if centre["plannedProductiveMinutesMilli"] > window_duration:
            raise _fail(
                f"{field} planned productive time for {centre_id} exceeds the evidence window."
            )
        intervals = sorted(by_centre.get(centre_id, []), key=lambda row: row[0])
        if any(intervals[index][0] < intervals[index - 1][1] for index in range(1, len(intervals))):
            raise _fail(f"{field} downtime overlaps for {centre_id}.")
        downtime = sum(row[2] for row in intervals)
        if downtime > centre["plannedProductiveMinutesMilli"]:
            raise _fail(
                f"{field} downtime exceeds planned productive time for {centre_id}."
            )
    proof = _proof(source["proof"], f"{field}.proof")
    proof_time = datetime.fromisoformat(proof["capturedAt"].replace("Z", "+00:00"))
    if proof_time < window_end_dt:
        raise _fail(
            f"{field}.proof.capturedAt must be at or after the closed effectiveness window."
        )
    return {
        "kind": "record_effectiveness",
        "id": _identifier(source["id"], f"{field}.id", "OEE"),
        **evidence,
        "sourceDigest": source_digest,
        "proof": proof,
    }


def _command_payload(value: object, field: str) -> dict[str, Any]:
    if not isinstance(value, Mapping) or not isinstance(value.get("kind"), str):
        raise _fail(f"{field}.kind is unsupported.")
    kind = value["kind"]
    if kind not in _COMMAND_KINDS:
        raise _fail(f"{field}.kind is unsupported.")

    if kind == "import_plan":
        source = _object(value, field, ("kind", "id", "package", "proof"))
        package = _validate_plan_package(source["package"])
        command_id = _identifier(source["id"], f"{field}.id", "PLN")
        if command_id != package["planId"]:
            raise _fail(f"{field}.id must equal its reviewed plan ID.")
        return {
            "kind": kind,
            "id": command_id,
            "package": package,
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "availability_check":
        source = _object(
            value,
            field,
            ("kind", "id", "sourceDigest", "materials", "workCentres", "proof"),
        )
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "CHK"),
            "sourceDigest": _digest(source["sourceDigest"], f"{field}.sourceDigest"),
            "materials": _material_availability(source["materials"], f"{field}.materials"),
            "workCentres": _capacity_availability(
                source["workCentres"], f"{field}.workCentres"
            ),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "release_order":
        source = _object(
            value, field, ("kind", "id", "availabilityCheckId", "proof")
        )
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "REL"),
            "availabilityCheckId": _identifier(
                source["availabilityCheckId"],
                f"{field}.availabilityCheckId",
                "CHK",
            ),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "issue_material":
        source = _object(
            value,
            field,
            ("kind", "id", "materialId", "inputLotId", "quantityMilli", "proof"),
        )
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "ISSUE"),
            "materialId": _identifier(
                source["materialId"], f"{field}.materialId", "MAT"
            ),
            "inputLotId": _identifier(
                source["inputLotId"], f"{field}.inputLotId", "LOT"
            ),
            "quantityMilli": _integer(
                source["quantityMilli"], f"{field}.quantityMilli", minimum=1
            ),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "record_calibration":
        source = _object(
            value,
            field,
            (
                "kind",
                "id",
                "workCentreId",
                "certificateId",
                "calibratedAt",
                "validUntil",
                "standardReference",
                "proof",
            ),
        )
        calibrated_at = _timestamp(source["calibratedAt"], f"{field}.calibratedAt")
        valid_until = _timestamp(source["validUntil"], f"{field}.validUntil")
        calibration_proof = _proof(source["proof"], f"{field}.proof")
        calibrated_time = datetime.fromisoformat(calibrated_at.replace("Z", "+00:00"))
        valid_time = datetime.fromisoformat(valid_until.replace("Z", "+00:00"))
        proof_time = datetime.fromisoformat(calibration_proof["capturedAt"].replace("Z", "+00:00"))
        if calibrated_time > proof_time:
            raise _fail(f"{field}.calibratedAt cannot follow its review.")
        if valid_time <= proof_time:
            raise _fail(f"{field}.validUntil must follow its review.")
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "CAL"),
            "workCentreId": _identifier(source["workCentreId"], f"{field}.workCentreId", "WC"),
            "certificateId": _identifier(source["certificateId"], f"{field}.certificateId", "CERT"),
            "calibratedAt": calibrated_at,
            "validUntil": valid_until,
            "standardReference": _text(source["standardReference"], f"{field}.standardReference"),
            "proof": calibration_proof,
        }

    if kind == "record_effectiveness":
        return _effectiveness_command(value, field)

    if kind == "record_operation":
        source = _object(
            value,
            field,
            ("kind", "id", "operationId", "quantity", "actualMinutesMilli", "proof"),
        )
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "OPRUN"),
            "operationId": _identifier(
                source["operationId"], f"{field}.operationId", "OP"
            ),
            "quantity": _integer(source["quantity"], f"{field}.quantity", minimum=1),
            "actualMinutesMilli": _integer(
                source["actualMinutesMilli"],
                f"{field}.actualMinutesMilli",
                minimum=1,
            ),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "record_output":
        source = _object(
            value, field, ("kind", "id", "outputBatchId", "quantity", "proof")
        )
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "OUT"),
            "outputBatchId": _identifier(
                source["outputBatchId"], f"{field}.outputBatchId", "BATCH"
            ),
            "quantity": _integer(source["quantity"], f"{field}.quantity", minimum=1),
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    if kind == "inspect_output":
        source = _object(
            value,
            field,
            (
                "kind",
                "id",
                "outputBatchId",
                "inspectedQuantity",
                "acceptedQuantity",
                "rejectedQuantity",
                "result",
                "proof",
            ),
        )
        result = source["result"]
        if result not in {"pass", "fail"}:
            raise _fail(f"{field}.result is unsupported.")
        inspected = _integer(
            source["inspectedQuantity"], f"{field}.inspectedQuantity", minimum=1
        )
        accepted = _integer(source["acceptedQuantity"], f"{field}.acceptedQuantity")
        rejected = _integer(source["rejectedQuantity"], f"{field}.rejectedQuantity")
        if accepted + rejected != inspected:
            raise _fail(f"{field} accepted and rejected quantities must equal inspected output.")
        if (result == "pass" and rejected != 0) or (result == "fail" and rejected == 0):
            raise _fail(f"{field}.result contradicts its rejected quantity.")
        return {
            "kind": kind,
            "id": _identifier(source["id"], f"{field}.id", "INSP"),
            "outputBatchId": _identifier(
                source["outputBatchId"], f"{field}.outputBatchId", "BATCH"
            ),
            "inspectedQuantity": inspected,
            "acceptedQuantity": accepted,
            "rejectedQuantity": rejected,
            "result": result,
            "proof": _proof(source["proof"], f"{field}.proof"),
        }

    source = _object(
        value, field, ("kind", "id", "outputBatchId", "inspectionId", "proof")
    )
    return {
        "kind": kind,
        "id": _identifier(source["id"], f"{field}.id", "QREL"),
        "outputBatchId": _identifier(
            source["outputBatchId"], f"{field}.outputBatchId", "BATCH"
        ),
        "inspectionId": _identifier(
            source["inspectionId"], f"{field}.inspectionId", "INSP"
        ),
        "proof": _proof(source["proof"], f"{field}.proof"),
    }


def _availability_projection(
    plan: Mapping[str, Any], command: Mapping[str, Any]
) -> dict[str, Any]:
    job = plan["job"]
    material_plan = {row["materialId"]: row for row in plan["materials"]}
    observed_materials = {row["materialId"]: row for row in command["materials"]}
    if frozenset(observed_materials) != frozenset(material_plan):
        raise _fail("availability check must cover every and only planned material.")

    work_centres = {row["workCentreId"]: row for row in plan["workCentres"]}
    observed_capacity = {row["workCentreId"]: row for row in command["workCentres"]}
    required_work_centres = frozenset(row["workCentreId"] for row in plan["routing"])
    if frozenset(observed_capacity) != required_work_centres:
        raise _fail("availability check must cover every and only routed work centre.")

    material_rows: list[dict[str, Any]] = []
    shortfalls: list[dict[str, Any]] = []
    for material_id in sorted(material_plan):
        planned = material_plan[material_id]
        observed = observed_materials[material_id]
        required = _safe_product(
            job["targetQuantity"],
            planned["quantityPerUnitMilli"],
            f"material requirement for {material_id}",
        )
        available = observed["availableQuantityMilli"]
        row = {
            **planned,
            "inputLotId": observed["inputLotId"],
            "requiredQuantityMilli": required,
            "availableQuantityMilli": available,
            "shortfallQuantityMilli": max(required - available, 0),
        }
        material_rows.append(row)
        if available < required:
            shortfalls.append(
                {
                    "kind": "material",
                    "subjectId": material_id,
                    "required": required,
                    "available": available,
                }
            )

    required_by_centre = {work_centre_id: 0 for work_centre_id in required_work_centres}
    for operation in plan["routing"]:
        required_by_centre[operation["workCentreId"]] += _safe_product(
            job["targetQuantity"],
            operation["minutesPerUnitMilli"],
            f"capacity requirement for {operation['operationId']}",
        )
        if required_by_centre[operation["workCentreId"]] > _MAX_SAFE_INTEGER:
            raise _fail(
                f"capacity requirement for {operation['workCentreId']} exceeds the supported range."
            )

    capacity_rows: list[dict[str, Any]] = []
    for work_centre_id in sorted(required_work_centres):
        available_milli = _safe_product(
            observed_capacity[work_centre_id]["availableMinutes"],
            1_000,
            f"available capacity for {work_centre_id}",
        )
        required_milli = required_by_centre[work_centre_id]
        capacity_rows.append(
            {
                **work_centres[work_centre_id],
                "requiredMinutesMilli": required_milli,
                "availableMinutes": observed_capacity[work_centre_id]["availableMinutes"],
                "shortfallMinutesMilli": max(required_milli - available_milli, 0),
            }
        )
        if available_milli < required_milli:
            shortfalls.append(
                {
                    "kind": "capacity",
                    "subjectId": work_centre_id,
                    "required": required_milli,
                    "available": available_milli,
                }
            )

    return {
        "checkId": command["id"],
        "sourceDigest": command["sourceDigest"],
        "proof": command["proof"],
        "passed": not shortfalls,
        "materials": material_rows,
        "workCentres": capacity_rows,
        "shortfalls": shortfalls,
    }


def _calibration_covers(command: Mapping[str, Any], captured_at: str) -> bool:
    observed = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    calibrated = datetime.fromisoformat(command["calibratedAt"].replace("Z", "+00:00"))
    valid_until = datetime.fromisoformat(command["validUntil"].replace("Z", "+00:00"))
    return calibrated <= observed < valid_until


def _empty_projection() -> dict[str, Any]:
    return {
        "plan": None,
        "status": "unplanned",
        "latestAvailability": None,
        "orderRelease": None,
        "calibrations": [],
        "effectivenessWindow": None,
        "materials": [],
        "routing": [],
        "operations": [],
        "workCentres": [],
        "outputEntries": [],
        "totalOutput": 0,
        "inspections": [],
        "latestInspection": None,
        "qualityHold": None,
        "batchRelease": None,
        "genealogy": [],
        "metrics": {
            "targetQuantity": 0,
            "issuedMaterialCount": 0,
            "completedOperationCount": 0,
            "actualOperationMinutesMilli": 0,
            "outputQuantity": 0,
            "acceptedQuantity": 0,
        },
    }


def _replay_commands(commands: list[dict[str, Any]]) -> dict[str, Any]:
    if not commands:
        return _empty_projection()

    plan: dict[str, Any] | None = None
    latest_availability: dict[str, Any] | None = None
    order_release: dict[str, Any] | None = None
    effectiveness_window: dict[str, Any] | None = None
    calibrations: dict[str, dict[str, Any]] = {}
    issued: dict[str, int] = {}
    operation_quantities: dict[str, int] = {}
    operation_minutes: dict[str, int] = {}
    material_issue_commands: list[dict[str, Any]] = []
    operation_commands: list[dict[str, Any]] = []
    output_entries: list[dict[str, Any]] = []
    inspections: list[dict[str, Any]] = []
    batch_release: dict[str, Any] | None = None
    total_output = 0

    for index, command in enumerate(commands):
        field = f"commands[{index}].payload"
        kind = command["kind"]
        if index == 0 and kind != "import_plan":
            raise _fail("The first Plant order command must be the reviewed plan.")
        if kind == "import_plan":
            if plan is not None or index != 0:
                raise _fail(f"{field} attempts to replace the immutable reviewed plan.")
            plan = command["package"]
            issued = {row["materialId"]: 0 for row in plan["materials"]}
            operation_quantities = {
                row["operationId"]: 0 for row in plan["routing"]
            }
            operation_minutes = {
                row["operationId"]: 0 for row in plan["routing"]
            }
            continue
        if plan is None:
            raise _fail(f"{field} has no reviewed plan.")
        job = plan["job"]

        if kind == "availability_check":
            if order_release is not None:
                raise _fail(f"{field} cannot replace availability after order release.")
            latest_availability = _availability_projection(plan, command)
            continue

        if kind == "record_calibration":
            if plan["contract"] != PLANT_ORDER_CONTROLLED_PLAN_CONTRACT:
                raise _fail(f"{field} requires a version 3 controlled plan.")
            if batch_release is not None:
                raise _fail(f"{field} follows final batch release.")
            work_centre_id = command["workCentreId"]
            if not any(row["workCentreId"] == work_centre_id for row in plan["routing"]):
                raise _fail(f"{field}.workCentreId is not in the reviewed routing.")
            previous = calibrations.get(work_centre_id)
            if previous is not None:
                calibrated = datetime.fromisoformat(command["calibratedAt"].replace("Z", "+00:00"))
                valid_until = datetime.fromisoformat(command["validUntil"].replace("Z", "+00:00"))
                previous_calibrated = datetime.fromisoformat(previous["calibratedAt"].replace("Z", "+00:00"))
                previous_valid_until = datetime.fromisoformat(previous["validUntil"].replace("Z", "+00:00"))
                if calibrated <= previous_calibrated or valid_until <= previous_valid_until:
                    raise _fail(f"{field} does not advance the retained calibration.")
            calibrations[work_centre_id] = command
            continue

        if kind == "release_order":
            if order_release is not None:
                raise _fail(f"{field} attempts to release the order twice.")
            if latest_availability is None:
                raise _fail(f"{field} requires a current availability check.")
            if command["availabilityCheckId"] != latest_availability["checkId"]:
                raise _fail(f"{field} references a stale availability check.")
            if not latest_availability["passed"]:
                raise _fail(f"{field} cannot release an order with a shortfall.")
            if plan["contract"] == PLANT_ORDER_CONTROLLED_PLAN_CONTRACT:
                routed_centres = sorted({row["workCentreId"] for row in plan["routing"]})
                missing = [
                    work_centre_id
                    for work_centre_id in routed_centres
                    if work_centre_id not in calibrations
                    or not _calibration_covers(calibrations[work_centre_id], command["proof"]["capturedAt"])
                ]
                if missing:
                    raise _fail(f"{field} requires current calibration for {', '.join(missing)}.")
            order_release = command
            continue

        if order_release is None:
            raise _fail(f"{field} requires human order release.")
        if kind == "record_effectiveness":
            if command["planId"] != plan["planId"] or command["jobId"] != job["jobId"]:
                raise _fail(f"{field} is not bound to the reviewed order.")
            routed_centres = sorted({row["workCentreId"] for row in plan["routing"]})
            observed_centres = [row["workCentreId"] for row in command["workCentres"]]
            if routed_centres != observed_centres:
                raise _fail(f"{field} must cover every and only routed work centre.")
            effectiveness_window = command
            continue
        if batch_release is not None:
            raise _fail(f"{field} follows final batch release.")

        latest_inspection = inspections[-1] if inspections else None
        current_hold = bool(
            latest_inspection
            and latest_inspection["inspectedQuantity"] == total_output
            and latest_inspection["result"] == "fail"
        )

        if kind == "issue_material":
            if current_hold:
                raise _fail(f"{field} is blocked by the failed current inspection.")
            material_plan = {row["materialId"]: row for row in plan["materials"]}
            material_id = command["materialId"]
            if material_id not in material_plan:
                raise _fail(f"{field}.materialId is not in the reviewed BOM.")
            if latest_availability is None:
                raise _fail(f"{field} has no released availability evidence.")
            availability = next(
                row
                for row in latest_availability["materials"]
                if row["materialId"] == material_id
            )
            if command["inputLotId"] != availability["inputLotId"]:
                raise _fail(f"{field}.inputLotId differs from the released lot.")
            next_issued = issued[material_id] + command["quantityMilli"]
            if next_issued > availability["requiredQuantityMilli"]:
                raise _fail(f"{field} exceeds the reviewed BOM requirement.")
            if next_issued > availability["availableQuantityMilli"]:
                raise _fail(f"{field} exceeds released material availability.")
            issued[material_id] = next_issued
            material_issue_commands.append(command)
            continue

        if kind == "record_operation":
            if current_hold:
                raise _fail(f"{field} is blocked by the failed current inspection.")
            if plan["contract"] not in {
                PLANT_ORDER_EXECUTION_PLAN_CONTRACT,
                PLANT_ORDER_CONTROLLED_PLAN_CONTRACT,
            }:
                raise _fail(f"{field} requires a version 2 or 3 execution plan.")
            operation_index = next(
                (
                    route_index
                    for route_index, row in enumerate(plan["routing"])
                    if row["operationId"] == command["operationId"]
                ),
                -1,
            )
            if operation_index < 0:
                raise _fail(f"{field}.operationId is not in the reviewed routing.")
            if plan["contract"] == PLANT_ORDER_CONTROLLED_PLAN_CONTRACT:
                work_centre_id = plan["routing"][operation_index]["workCentreId"]
                calibration = calibrations.get(work_centre_id)
                if calibration is None or not _calibration_covers(calibration, command["proof"]["capturedAt"]):
                    raise _fail(f"{field} requires current calibration for {work_centre_id}.")
            completed_quantity = operation_quantities[command["operationId"]]
            next_completed_quantity = completed_quantity + command["quantity"]
            if next_completed_quantity > job["targetQuantity"]:
                raise _fail(f"{field} exceeds the reviewed operation target.")
            available_input_quantity = (
                job["targetQuantity"]
                if operation_index == 0
                else operation_quantities[
                    plan["routing"][operation_index - 1]["operationId"]
                ]
            )
            if next_completed_quantity > available_input_quantity:
                raise _fail(
                    f"{field} exceeds quantity completed by the prior operation."
                )
            for material in plan["materials"]:
                required_for_progress = _safe_product(
                    next_completed_quantity,
                    material["quantityPerUnitMilli"],
                    f"material issue requirement for {material['materialId']}",
                )
                if issued[material["materialId"]] < required_for_progress:
                    raise _fail(
                        f"{field} lacks issued {material['materialId']} for operation progress."
                    )
            next_minutes = (
                operation_minutes[command["operationId"]]
                + command["actualMinutesMilli"]
            )
            if next_minutes > _MAX_SAFE_INTEGER:
                raise _fail(f"{field}.actualMinutesMilli exceeds the supported range.")
            operation_quantities[command["operationId"]] = next_completed_quantity
            operation_minutes[command["operationId"]] = next_minutes
            operation_commands.append(command)
            continue

        if kind == "record_output":
            if current_hold:
                raise _fail(f"{field} is blocked by the failed current inspection.")
            if command["outputBatchId"] != job["outputBatchId"]:
                raise _fail(f"{field}.outputBatchId differs from the reviewed batch.")
            next_output = total_output + command["quantity"]
            if next_output > job["targetQuantity"]:
                raise _fail(f"{field} exceeds the reviewed order target.")
            if plan["contract"] in {
                PLANT_ORDER_EXECUTION_PLAN_CONTRACT,
                PLANT_ORDER_CONTROLLED_PLAN_CONTRACT,
            }:
                final_operation_id = plan["routing"][-1]["operationId"]
                if operation_quantities[final_operation_id] < next_output:
                    raise _fail(
                        f"{field} exceeds completed final-operation quantity."
                    )
            for material in plan["materials"]:
                required_for_output = _safe_product(
                    next_output,
                    material["quantityPerUnitMilli"],
                    f"material issue requirement for {material['materialId']}",
                )
                if issued[material["materialId"]] < required_for_output:
                    raise _fail(
                        f"{field} lacks issued {material['materialId']} for the recorded output."
                    )
            total_output = next_output
            output_entries.append(command)
            continue

        if kind == "inspect_output":
            if command["outputBatchId"] != job["outputBatchId"]:
                raise _fail(f"{field}.outputBatchId differs from the reviewed batch.")
            if total_output < 1 or command["inspectedQuantity"] != total_output:
                raise _fail(f"{field} must inspect all currently recorded output.")
            inspections.append(command)
            continue

        if command["outputBatchId"] != job["outputBatchId"]:
            raise _fail(f"{field}.outputBatchId differs from the reviewed batch.")
        if total_output != job["targetQuantity"]:
            raise _fail(f"{field} requires the complete reviewed output target.")
        if not inspections or command["inspectionId"] != inspections[-1]["id"]:
            raise _fail(f"{field} requires the latest current inspection.")
        latest_inspection = inspections[-1]
        if (
            latest_inspection["result"] != "pass"
            or latest_inspection["inspectedQuantity"] != total_output
            or latest_inspection["acceptedQuantity"] != total_output
        ):
            raise _fail(f"{field} cannot release output that is unaccepted or held.")
        batch_release = command

    if plan is None:
        raise _fail("Plant order command history lacks its reviewed plan.")

    material_plan = {row["materialId"]: row for row in plan["materials"]}
    availability_rows = {
        row["materialId"]: row
        for row in (latest_availability["materials"] if latest_availability else [])
    }
    material_rows = []
    genealogy = []
    for material_id in sorted(material_plan):
        row = material_plan[material_id]
        required = _safe_product(
            plan["job"]["targetQuantity"],
            row["quantityPerUnitMilli"],
            f"material requirement for {material_id}",
        )
        availability = availability_rows.get(material_id)
        material_rows.append(
            {
                **row,
                "requiredQuantityMilli": required,
                "issuedQuantityMilli": issued[material_id],
                "remainingToIssueMilli": required - issued[material_id],
                "inputLotId": availability["inputLotId"] if availability else None,
                "availableQuantityMilli": (
                    availability["availableQuantityMilli"] if availability else None
                ),
            }
        )
        if issued[material_id] and availability:
            genealogy.append(
                {
                    "materialId": material_id,
                    "inputLotId": availability["inputLotId"],
                    "outputBatchId": plan["job"]["outputBatchId"],
                    "issuedQuantityMilli": issued[material_id],
                    "unit": row["unit"],
                }
            )

    operations = []
    for index, row in enumerate(plan["routing"]):
        completed_quantity = operation_quantities[row["operationId"]]
        available_input_quantity = (
            plan["job"]["targetQuantity"]
            if index == 0
            else operation_quantities[plan["routing"][index - 1]["operationId"]]
        )
        operation_status = (
            "complete"
            if completed_quantity == plan["job"]["targetQuantity"]
            else "in_progress"
            if completed_quantity
            else "ready"
            if available_input_quantity > 0
            else "blocked"
        )
        operations.append(
            {
                **row,
                "completedQuantity": completed_quantity,
                "remainingQuantity": plan["job"]["targetQuantity"]
                - completed_quantity,
                "plannedMinutesMilli": _safe_product(
                    plan["job"]["targetQuantity"],
                    row["minutesPerUnitMilli"],
                    f"planned operation minutes for {row['operationId']}",
                ),
                "actualMinutesMilli": operation_minutes[row["operationId"]],
                "status": operation_status,
            }
        )

    latest_inspection = inspections[-1] if inspections else None
    inspection_is_current = bool(
        latest_inspection and latest_inspection["inspectedQuantity"] == total_output
    )
    quality_hold = (
        {
            "inspectionId": latest_inspection["id"],
            "rejectedQuantity": latest_inspection["rejectedQuantity"],
            "proof": latest_inspection["proof"],
        }
        if inspection_is_current and latest_inspection["result"] == "fail"
        else None
    )
    if batch_release:
        status = "released_to_stock"
    elif quality_hold:
        status = "quality_hold"
    elif order_release is None:
        status = (
            "planned"
            if latest_availability is None
            else "ready"
            if latest_availability["passed"]
            else "shortfall"
        )
    elif total_output == plan["job"]["targetQuantity"]:
        status = (
            "ready_to_release"
            if inspection_is_current and latest_inspection["result"] == "pass"
            else "inspection_due"
        )
    elif total_output or material_issue_commands or operation_commands:
        status = "in_process"
    else:
        status = "released"

    return {
        "plan": plan,
        "status": status,
        "latestAvailability": latest_availability,
        "orderRelease": order_release,
        "calibrations": [calibrations[key] for key in sorted(calibrations)],
        "effectivenessWindow": effectiveness_window,
        "materials": material_rows,
        "routing": plan["routing"],
        "operations": operations,
        "workCentres": latest_availability["workCentres"] if latest_availability else [],
        "outputEntries": output_entries,
        "totalOutput": total_output,
        "inspections": inspections,
        "latestInspection": latest_inspection,
        "qualityHold": quality_hold,
        "batchRelease": batch_release,
        "genealogy": genealogy,
        "metrics": {
            "targetQuantity": plan["job"]["targetQuantity"],
            "issuedMaterialCount": sum(1 for quantity in issued.values() if quantity),
            "completedOperationCount": sum(
                1 for operation in operations if operation["status"] == "complete"
            ),
            "actualOperationMinutesMilli": sum(operation_minutes.values()),
            "outputQuantity": total_output,
            "acceptedQuantity": (
                latest_inspection["acceptedQuantity"]
                if inspection_is_current and latest_inspection
                else 0
            ),
        },
    }


def validate_plant_order_state(value: object) -> dict[str, Any]:
    """Validate a complete digest-chained Plant order snapshot without repair."""

    source = _object(
        value,
        "Plant order state",
        ("schema", "revision", "headDigest", "commands"),
    )
    if source["schema"] != PLANT_ORDER_STATE_SCHEMA:
        raise _fail("Plant order state.schema is unsupported.")
    revision = _integer(source["revision"], "Plant order state.revision")
    head_digest = _digest(source["headDigest"], "Plant order state.headDigest")
    raw_commands = _array(
        source["commands"], "Plant order state.commands", maximum=_MAX_COMMANDS
    )
    if revision != len(raw_commands):
        raise _fail("Plant order state.revision must equal its retained command count.")

    commands: list[dict[str, Any]] = []
    command_ids: list[str] = []
    action_ids: list[str] = []
    prior_digest = EMPTY_PLANT_ORDER_DIGEST
    prior_timestamp: datetime | None = None
    for index, candidate in enumerate(raw_commands):
        field = f"Plant order state.commands[{index}]"
        envelope = _object(
            candidate,
            field,
            ("sequence", "previousDigest", "payload", "digest"),
        )
        sequence = _integer(envelope["sequence"], f"{field}.sequence", minimum=1)
        if sequence != index + 1:
            raise _fail(f"{field}.sequence is not contiguous.")
        previous_digest = _digest(
            envelope["previousDigest"], f"{field}.previousDigest"
        )
        if previous_digest != prior_digest:
            raise _fail(f"{field}.previousDigest breaks the command chain.")
        payload = _command_payload(envelope["payload"], f"{field}.payload")
        payload_timestamp = datetime.fromisoformat(
            payload["proof"]["capturedAt"].replace("Z", "+00:00")
        )
        if prior_timestamp is not None and payload_timestamp < prior_timestamp:
            raise _fail(f"{field}.payload.proof.capturedAt moves backwards.")
        body = {
            "sequence": sequence,
            "previousDigest": previous_digest,
            "payload": payload,
        }
        digest = _digest(envelope["digest"], f"{field}.digest")
        if digest != _canonical_digest(body):
            raise _fail(f"{field}.digest does not match its command evidence.")
        commands.append({**body, "digest": digest})
        command_ids.append(payload["id"])
        action_ids.append(payload["proof"]["actionId"])
        prior_digest = digest
        prior_timestamp = payload_timestamp

    _unique(command_ids, "Plant order command IDs")
    _unique(action_ids, "Plant order action IDs")
    expected_head = prior_digest if commands else EMPTY_PLANT_ORDER_DIGEST
    if head_digest != expected_head:
        raise _fail("Plant order state.headDigest does not match its command chain.")
    _replay_commands([command["payload"] for command in commands])
    return _canonical_copy(
        {
            "schema": PLANT_ORDER_STATE_SCHEMA,
            "revision": revision,
            "headDigest": head_digest,
            "commands": commands,
        }
    )


def project_plant_order(state: object) -> dict[str, Any]:
    """Derive readiness, execution, quality, and genealogy from immutable commands."""

    validated = validate_plant_order_state(state)
    projection = _replay_commands(
        [command["payload"] for command in validated["commands"]]
    )
    return _canonical_copy(
        {
            "contract": PLANT_ORDER_PROJECTION_CONTRACT,
            "revision": validated["revision"],
            "headDigest": validated["headDigest"],
            **projection,
        }
    )


def _append_command(
    state: object,
    payload: object,
    *,
    expected_head_digest: object,
) -> dict[str, Any]:
    current = validate_plant_order_state(state)
    canonical_payload = _command_payload(payload, "command payload")
    for command in current["commands"]:
        existing = command["payload"]
        if existing["id"] != canonical_payload["id"]:
            continue
        if existing != canonical_payload:
            raise _fail("The Plant order command ID was already used with different evidence.")
        return {"state": current, "replayed": True}
    expected = _digest(expected_head_digest, "expected_head_digest")
    if expected != current["headDigest"]:
        raise _fail("The Plant order snapshot changed before this command was applied.")
    sequence = current["revision"] + 1
    body = {
        "sequence": sequence,
        "previousDigest": current["headDigest"],
        "payload": canonical_payload,
    }
    envelope = {**body, "digest": _canonical_digest(body)}
    candidate = {
        "schema": PLANT_ORDER_STATE_SCHEMA,
        "revision": sequence,
        "headDigest": envelope["digest"],
        "commands": [*current["commands"], envelope],
    }
    return {"state": validate_plant_order_state(candidate), "replayed": False}


def apply_plant_order_plan(
    state: object,
    package: object,
    proof: object,
    *,
    expected_head_digest: object,
) -> dict[str, Any]:
    reviewed = _validate_plan_package(package)
    return _append_command(
        state,
        {
            "kind": "import_plan",
            "id": reviewed["planId"],
            "package": reviewed,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def check_plant_order_availability(
    state: object,
    *,
    check_id: object,
    source_digest: object,
    materials: object,
    work_centres: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "availability_check",
            "id": check_id,
            "sourceDigest": source_digest,
            "materials": materials,
            "workCentres": work_centres,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def release_plant_order(
    state: object,
    *,
    release_id: object,
    availability_check_id: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "release_order",
            "id": release_id,
            "availabilityCheckId": availability_check_id,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def issue_plant_order_material(
    state: object,
    *,
    issue_id: object,
    material_id: object,
    input_lot_id: object,
    quantity_milli: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "issue_material",
            "id": issue_id,
            "materialId": material_id,
            "inputLotId": input_lot_id,
            "quantityMilli": quantity_milli,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def record_plant_order_calibration(
    state: object,
    *,
    calibration_id: object,
    work_centre_id: object,
    certificate_id: object,
    calibrated_at: object,
    valid_until: object,
    standard_reference: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "record_calibration",
            "id": calibration_id,
            "workCentreId": work_centre_id,
            "certificateId": certificate_id,
            "calibratedAt": calibrated_at,
            "validUntil": valid_until,
            "standardReference": standard_reference,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def record_plant_order_effectiveness(
    state: object,
    *,
    effectiveness_id: object,
    plan_id: object,
    job_id: object,
    window_start: object,
    window_end: object,
    source_digest: object,
    work_centres: object,
    downtime_intervals: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "record_effectiveness",
            "id": effectiveness_id,
            "planId": plan_id,
            "jobId": job_id,
            "windowStart": window_start,
            "windowEnd": window_end,
            "sourceDigest": source_digest,
            "workCentres": work_centres,
            "downtimeIntervals": downtime_intervals,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def record_plant_order_operation(
    state: object,
    *,
    operation_run_id: object,
    operation_id: object,
    quantity: object,
    actual_minutes_milli: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "record_operation",
            "id": operation_run_id,
            "operationId": operation_id,
            "quantity": quantity,
            "actualMinutesMilli": actual_minutes_milli,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def record_plant_order_output(
    state: object,
    *,
    output_id: object,
    output_batch_id: object,
    quantity: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "record_output",
            "id": output_id,
            "outputBatchId": output_batch_id,
            "quantity": quantity,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def inspect_plant_order_output(
    state: object,
    *,
    inspection_id: object,
    output_batch_id: object,
    inspected_quantity: object,
    accepted_quantity: object,
    rejected_quantity: object,
    result: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "inspect_output",
            "id": inspection_id,
            "outputBatchId": output_batch_id,
            "inspectedQuantity": inspected_quantity,
            "acceptedQuantity": accepted_quantity,
            "rejectedQuantity": rejected_quantity,
            "result": result,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


def release_plant_order_batch(
    state: object,
    *,
    quality_release_id: object,
    output_batch_id: object,
    inspection_id: object,
    proof: object,
    expected_head_digest: object,
) -> dict[str, Any]:
    return _append_command(
        state,
        {
            "kind": "release_batch",
            "id": quality_release_id,
            "outputBatchId": output_batch_id,
            "inspectionId": inspection_id,
            "proof": _proof(proof, "proof"),
        },
        expected_head_digest=expected_head_digest,
    )


__all__ = (
    "EMPTY_PLANT_ORDER_DIGEST",
    "PLANT_ORDER_CONTROLLED_PLAN_CONTRACT",
    "PLANT_ORDER_EXECUTION_PLAN_CONTRACT",
    "PLANT_ORDER_PLAN_CONTRACT",
    "PLANT_ORDER_PROJECTION_CONTRACT",
    "PLANT_ORDER_STATE_SCHEMA",
    "PlantOrderValidationError",
    "apply_plant_order_plan",
    "build_plant_order_execution_plan",
    "build_plant_order_controlled_plan",
    "build_plant_order_plan",
    "check_plant_order_availability",
    "create_empty_plant_order_state",
    "inspect_plant_order_output",
    "issue_plant_order_material",
    "plant_order_evidence_digest",
    "project_plant_order",
    "record_plant_order_effectiveness",
    "record_plant_order_calibration",
    "record_plant_order_operation",
    "record_plant_order_output",
    "release_plant_order",
    "release_plant_order_batch",
    "validate_plant_order_state",
)
