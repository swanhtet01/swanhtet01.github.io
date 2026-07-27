"""Cross-surface evidence checks for Plant material and Shop stock authority."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from supermega_runtime.commerce_runtime import validate_commerce_state
from supermega_runtime.plant_order_foundation import project_plant_order
from supermega_runtime.production_runtime import validate_production_state
from supermega_runtime.trial_store import TrialValidationError


def production_material_requests(value: object) -> list[dict[str, Any]]:
    production = validate_production_state(value)
    execution = production.get("orderExecution")
    if not isinstance(execution, Mapping):
        return []
    projection = project_plant_order(execution)
    plan = projection.get("plan")
    if not isinstance(plan, Mapping):
        return []
    material_by_id = {
        material["materialId"]: material for material in plan["materials"]
    }
    requests: list[dict[str, Any]] = []
    for command in execution["commands"]:
        payload = command["payload"]
        if payload["kind"] != "issue_material":
            continue
        material = material_by_id.get(payload["materialId"])
        if material is None:
            raise TrialValidationError(
                "Plant material issue is not present in its immutable plan."
            )
        requests.append(
            {
                "requestId": payload["id"],
                "sourceCommandDigest": command["digest"],
                "jobId": plan["job"]["jobId"],
                "materialId": payload["materialId"],
                "inputLotId": payload["inputLotId"],
                "quantityMilli": payload["quantityMilli"],
                "unit": material["unit"],
            }
        )
    return requests


def movement_matches_production_request(
    movement: Mapping[str, Any], request: Mapping[str, Any]
) -> bool:
    return (
        movement.get("kind") == "production_issue"
        and movement.get("productionRequestId") == request["requestId"]
        and movement.get("productionCommandDigest")
        == request["sourceCommandDigest"]
        and movement.get("productionJobId") == request["jobId"]
        and movement.get("productionMaterialId") == request["materialId"]
        and movement.get("productionInputLotId") == request["inputLotId"]
        and movement.get("productionQuantityMilli") == request["quantityMilli"]
        and movement.get("productionUnit") == request["unit"]
    )


def require_shop_issue_matches_plant(
    current_commerce: Mapping[str, Any],
    next_commerce: Mapping[str, Any],
    production: Mapping[str, Any],
) -> None:
    current = validate_commerce_state(current_commerce)
    requests = production_material_requests(production)
    next_movements = next_commerce.get("movements")
    if (
        not isinstance(next_movements, list)
        or len(next_movements) != len(current["movements"]) + 1
        or next_movements[1:] != current["movements"]
        or not isinstance(next_movements[0], Mapping)
    ):
        raise TrialValidationError(
            "Shop material issue must prepend one stock movement before cross-surface review."
        )
    movement = next_movements[0]
    matching = [
        request
        for request in requests
        if movement_matches_production_request(movement, request)
    ]
    if len(matching) != 1:
        raise TrialValidationError(
            "Shop material issue must match one immutable Plant material request."
        )
    request_id = matching[0]["requestId"]
    if any(
        retained.get("productionRequestId") == request_id
        for retained in current["movements"]
    ):
        raise TrialValidationError(
            "Plant material request was already issued by Shop."
        )


def require_shop_issue_before_plant_progress(
    next_production: Mapping[str, Any], commerce: Mapping[str, Any]
) -> None:
    production = validate_production_state(next_production)
    execution = production.get("orderExecution")
    if not isinstance(execution, Mapping) or not execution["commands"]:
        return
    latest_kind = execution["commands"][-1]["payload"]["kind"]
    if latest_kind not in {"record_operation", "record_output"}:
        return
    requests = production_material_requests(production)
    shop = validate_commerce_state(commerce)
    missing = [
        request["requestId"]
        for request in requests
        if not any(
            movement_matches_production_request(movement, request)
            for movement in shop["movements"]
        )
    ]
    if missing:
        raise TrialValidationError(
            "Plant operation or output requires Shop issue evidence for every "
            f"material request: {', '.join(missing)}."
        )


__all__ = [
    "movement_matches_production_request",
    "production_material_requests",
    "require_shop_issue_before_plant_progress",
    "require_shop_issue_matches_plant",
]
