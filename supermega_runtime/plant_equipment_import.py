"""Strict, zero-commissioning Plant equipment-master import contracts."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any


PLANT_EQUIPMENT_IMPORT_SCHEMA = "supermega.production.equipment-import.v1"
PLANT_EQUIPMENT_VALIDATION_SCHEMA = (
    "supermega.production.equipment-import-validation.v1"
)
PLANT_EQUIPMENT_MASTER_SCHEMA = "supermega.production.equipment-master.v1"
PLANT_EQUIPMENT_MAX_PACKAGE_BYTES = 512 * 1024
PLANT_EQUIPMENT_MAX_ROWS = 100
PLANT_EQUIPMENT_CRITICALITIES = frozenset({"critical", "high", "medium", "low"})

_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_IDENTIFIER = re.compile(r"^[A-Z0-9][A-Z0-9._/-]{0,79}$")
_FORMULA_PREFIX = re.compile(r"^[=+\-@]")


class PlantEquipmentImportError(ValueError):
    """Raised when equipment master data is not safe to review or apply."""


@dataclass(frozen=True)
class PlantEquipmentImportValidation:
    package_digest: str
    row_count: int

    def to_dict(self) -> dict[str, object]:
        return {
            "contract": PLANT_EQUIPMENT_VALIDATION_SCHEMA,
            "status": "valid",
            "package_digest": self.package_digest,
            "row_count": self.row_count,
            "checks": [
                "contract",
                "source_digest",
                "row_schema",
                "field_values",
                "unique_equipment_ids",
                "source_rows",
                "package_digest",
                "zero_commissioning",
            ],
            "activation": {
                "status": "not_applied",
                "target_surface": "production",
                "required_capability": "production.write",
                "human_approval_required": True,
                "atomic_adapter_ready": True,
                "external_writes_performed": False,
                "commissioning_performed": False,
            },
        }


def _fail(message: str) -> PlantEquipmentImportError:
    return PlantEquipmentImportError(message)


def _exact_object(value: object, field: str, expected: Sequence[str]) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail(f"{field} must be an object.")
    if (
        frozenset(str(key) for key in value) != frozenset(expected)
        or any(not isinstance(key, str) for key in value)
    ):
        raise _fail(f"{field} fields do not match the equipment import contract.")
    return value


def _has_control_character(value: str) -> bool:
    return any(ord(character) <= 31 or ord(character) == 127 for character in value)


def _text(
    value: object,
    field: str,
    *,
    maximum: int,
    formula_safe: bool = True,
) -> str:
    if not isinstance(value, str) or not value:
        raise _fail(f"{field} is required.")
    if value != value.strip():
        raise _fail(f"{field} must not have leading or trailing whitespace.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if _has_control_character(value):
        raise _fail(f"{field} contains a control character.")
    if formula_safe and _FORMULA_PREFIX.match(value):
        raise _fail(f"{field} begins like a spreadsheet formula.")
    if len(value.encode("utf-16-le")) // 2 > maximum:
        raise _fail(f"{field} is longer than the supported limit.")
    return value


def _package_size(value: Mapping[str, Any]) -> int:
    try:
        return len(
            json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
        )
    except (TypeError, ValueError) as exc:
        raise _fail("The equipment import package must be finite JSON.") from exc


def _digest(value: Mapping[str, Any]) -> str:
    canonical = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(canonical).hexdigest()}"


def validate_plant_equipment_import(
    value: object,
) -> tuple[PlantEquipmentImportValidation, dict[str, Any]]:
    """Return one canonical package after strict, zero-write validation."""

    package = _exact_object(
        value,
        "package",
        ("contract", "workspace", "owner", "source", "rows", "controls"),
    )
    if _package_size(package) > PLANT_EQUIPMENT_MAX_PACKAGE_BYTES:
        raise _fail("The equipment import package exceeds the validation limit.")
    if package["contract"] != PLANT_EQUIPMENT_IMPORT_SCHEMA:
        raise _fail("The equipment import contract is unsupported.")

    workspace = _text(package["workspace"], "package.workspace", maximum=120, formula_safe=False)
    owner = _text(package["owner"], "package.owner", maximum=120, formula_safe=False)
    source = _exact_object(package["source"], "package.source", ("name", "digest"))
    source_name = _text(source["name"], "package.source.name", maximum=180, formula_safe=False)
    source_digest = _text(source["digest"], "package.source.digest", maximum=71)
    if _DIGEST.fullmatch(source_digest) is None:
        raise _fail("package.source.digest must use SHA-256.")

    rows = package["rows"]
    if not isinstance(rows, list) or not 1 <= len(rows) <= PLANT_EQUIPMENT_MAX_ROWS:
        raise _fail(
            f"package.rows must contain between 1 and {PLANT_EQUIPMENT_MAX_ROWS} rows."
        )
    normalized_rows: list[dict[str, Any]] = []
    equipment_ids: set[str] = set()
    source_rows: set[int] = set()
    previous_source_row = 1
    for index, candidate in enumerate(rows):
        path = f"package.rows[{index}]"
        row = _exact_object(candidate, path, ("sourceRow", "key", "values"))
        source_row = row["sourceRow"]
        if type(source_row) is not int or not 2 <= source_row <= 1_000_000:
            raise _fail(f"{path}.sourceRow is invalid.")
        if source_row in source_rows or source_row <= previous_source_row:
            raise _fail("Equipment source rows must be unique and increasing.")
        source_rows.add(source_row)
        previous_source_row = source_row
        values = _exact_object(
            row["values"],
            f"{path}.values",
            ("equipmentId", "name", "workCentreId", "criticality"),
        )
        equipment_id = _text(
            values["equipmentId"], f"{path}.values.equipmentId", maximum=80
        )
        if _IDENTIFIER.fullmatch(equipment_id) is None:
            raise _fail(f"{path}.values.equipmentId is not a canonical identifier.")
        key = _text(row["key"], f"{path}.key", maximum=80)
        if key != equipment_id:
            raise _fail(f"{path}.key does not match equipmentId.")
        if equipment_id in equipment_ids:
            raise _fail("Equipment IDs must be unique.")
        equipment_ids.add(equipment_id)
        name = _text(values["name"], f"{path}.values.name", maximum=180)
        work_centre_id = _text(
            values["workCentreId"], f"{path}.values.workCentreId", maximum=80
        )
        if _IDENTIFIER.fullmatch(work_centre_id) is None:
            raise _fail(f"{path}.values.workCentreId is not a canonical identifier.")
        criticality = _text(
            values["criticality"], f"{path}.values.criticality", maximum=8
        )
        if criticality not in PLANT_EQUIPMENT_CRITICALITIES:
            raise _fail(f"{path}.values.criticality is unsupported.")
        normalized_rows.append(
            {
                "sourceRow": source_row,
                "key": equipment_id,
                "values": {
                    "equipmentId": equipment_id,
                    "name": name,
                    "workCentreId": work_centre_id,
                    "criticality": criticality,
                },
            }
        )

    controls = _exact_object(
        package["controls"],
        "package.controls",
        (
            "rowCount",
            "humanReviewRequired",
            "externalWritesPerformed",
            "commissioningPerformed",
            "activationStatus",
        ),
    )
    if type(controls["rowCount"]) is not int or controls["rowCount"] != len(rows):
        raise _fail("package.controls.rowCount does not match the reviewed rows.")
    if controls["humanReviewRequired"] is not True:
        raise _fail("Equipment import must retain human review.")
    if controls["externalWritesPerformed"] is not False:
        raise _fail("A reviewed equipment package cannot claim an external write.")
    if controls["commissioningPerformed"] is not False:
        raise _fail("Equipment master review cannot claim commissioning.")
    if controls["activationStatus"] != "staged_not_applied":
        raise _fail("Equipment master review must remain not applied.")

    canonical = {
        "contract": PLANT_EQUIPMENT_IMPORT_SCHEMA,
        "workspace": workspace,
        "owner": owner,
        "source": {"name": source_name, "digest": source_digest},
        "rows": normalized_rows,
        "controls": {
            "rowCount": len(normalized_rows),
            "humanReviewRequired": True,
            "externalWritesPerformed": False,
            "commissioningPerformed": False,
            "activationStatus": "staged_not_applied",
        },
    }
    package_digest = _digest(canonical)
    return PlantEquipmentImportValidation(package_digest, len(rows)), canonical


__all__ = [
    "PLANT_EQUIPMENT_CRITICALITIES",
    "PLANT_EQUIPMENT_IMPORT_SCHEMA",
    "PLANT_EQUIPMENT_MASTER_SCHEMA",
    "PLANT_EQUIPMENT_MAX_PACKAGE_BYTES",
    "PLANT_EQUIPMENT_MAX_ROWS",
    "PLANT_EQUIPMENT_VALIDATION_SCHEMA",
    "PlantEquipmentImportError",
    "PlantEquipmentImportValidation",
    "validate_plant_equipment_import",
]
