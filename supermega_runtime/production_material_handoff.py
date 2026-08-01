"""Cross-surface evidence checks for Plant material and Shop stock authority."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from supermega_runtime.commerce_runtime import validate_commerce_state
from supermega_runtime.plant_order_foundation import (
    plant_order_evidence_digest,
    project_plant_order,
)
from supermega_runtime.production_runtime import validate_production_state
from supermega_runtime.trial_store import TrialValidationError


PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT = (
    "supermega.production.material_requirements.v1"
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991


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
    substitution_by_id = {
        approval["id"]: approval
        for approval in projection.get("materialSubstitutions", [])
    }
    requests: list[dict[str, Any]] = []
    for command in execution["commands"]:
        payload = command["payload"]
        if payload["kind"] not in {"issue_material", "issue_substitute_material"}:
            continue
        material = material_by_id.get(payload["materialId"])
        if material is None:
            raise TrialValidationError(
                "Plant material issue is not present in its immutable plan."
            )
        if payload["kind"] == "issue_material":
            physical_material_id = payload["materialId"]
            physical_quantity_milli = payload["quantityMilli"]
            physical_unit = material["unit"]
            substitution = None
        else:
            approval = substitution_by_id.get(payload["substitutionId"])
            if (
                approval is None
                or approval["materialId"] != payload["materialId"]
                or approval["substituteMaterialId"]
                != payload["substituteMaterialId"]
            ):
                raise TrialValidationError(
                    "Plant substitute issue does not reference its immutable approval."
                )
            physical_material_id = payload["substituteMaterialId"]
            physical_quantity_milli = payload["substituteQuantityMilli"]
            physical_unit = approval["substituteUnit"]
            original_quantity_milli = (
                physical_quantity_milli
                * approval["originalQuantityPerUnitMilli"]
                // approval["substituteQuantityPerUnitMilli"]
            )
            substitution = {
                "approvalId": approval["id"],
                "originalMaterialId": material["materialId"],
                "originalMaterialName": material["name"],
                "originalQuantityMilli": original_quantity_milli,
                "originalUnit": material["unit"],
                "approvalSourceDigest": approval["approvalSourceDigest"],
                "technicalBasis": approval["technicalBasis"],
            }
        requests.append(
            {
                "requestId": payload["id"],
                "sourceCommandDigest": command["digest"],
                "jobId": plan["job"]["jobId"],
                "materialId": physical_material_id,
                "inputLotId": payload["inputLotId"],
                "quantityMilli": physical_quantity_milli,
                "unit": physical_unit,
                "substitution": substitution,
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


def _safe_product(left: int, right: int, field: str) -> int:
    value = left * right
    if value > _MAX_SAFE_INTEGER:
        raise TrialValidationError(
            f"{field} exceeds the supported quantity range."
        )
    return value


def _stock_units_for(quantity_milli: int, material_per_stock_unit: int) -> int:
    if quantity_milli == 0:
        return 0
    return (quantity_milli + material_per_stock_unit - 1) // material_per_stock_unit


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _purchase_order_progress(
    commerce: Mapping[str, Any], purchase_order: Mapping[str, Any]
) -> dict[str, Any]:
    receipts = [
        movement
        for movement in commerce["movements"]
        if movement["kind"] == "receipt"
        and movement.get("purchaseOrderId") == purchase_order["id"]
    ]
    received = sum(movement["quantityDelta"] for movement in receipts)
    rejected = sum(movement.get("rejectedQuantity", 0) for movement in receipts)
    delivered = received + rejected
    remaining = purchase_order["quantityOrdered"] - delivered
    status = (
        "cancelled"
        if "cancellation" in purchase_order
        else "received_with_discrepancy"
        if remaining == 0 and rejected > 0
        else "received"
        if remaining == 0
        else "partially_received"
        if delivered > 0
        else "open"
    )
    return {"remaining": remaining, "status": status}


def project_production_material_requirements(
    production_value: Mapping[str, Any], commerce_value: Mapping[str, Any]
) -> dict[str, Any] | None:
    """Project order-bound BOM coverage without purchasing or issuing stock."""

    production = validate_production_state(production_value)
    execution = production.get("orderExecution")
    if not isinstance(execution, Mapping):
        return None
    projection = project_plant_order(execution)
    plan = projection.get("plan")
    if not isinstance(plan, Mapping):
        return None
    commerce = validate_commerce_state(commerce_value)
    requests = production_material_requests(production)
    relevant_skus = {
        material["shopSupply"]["sku"]
        for material in projection["materials"]
        if "shopSupply" in material
    }
    purchase_orders = []
    for order in commerce.get("purchaseOrders", []):
        if order["sku"] not in relevant_skus:
            continue
        progress = _purchase_order_progress(commerce, order)
        purchase_orders.append(
            {
                "id": order["id"],
                "sku": order["sku"],
                "remaining": progress["remaining"],
                "status": progress["status"],
                "expectedAt": order.get("expectedAt"),
            }
        )
    purchase_orders.sort(key=lambda order: order["id"])
    commerce_supply_digest = plant_order_evidence_digest(
        {
            "items": sorted(
                [
                    {
                        "sku": item["sku"],
                        "name": item["name"],
                        "onHand": item["onHand"],
                        "reorderAt": item["reorderAt"],
                    }
                    for item in commerce["items"]
                    if item["sku"] in relevant_skus
                ],
                key=lambda item: item["sku"],
            ),
            "purchaseOrders": purchase_orders,
            "productionIssues": sorted(
                [
                    {
                        "actionId": movement["actionId"],
                        "productionRequestId": movement.get("productionRequestId"),
                        "productionCommandDigest": movement.get("productionCommandDigest"),
                        "productionQuantityMilli": movement.get("productionQuantityMilli"),
                    }
                    for movement in commerce["movements"]
                    if movement["kind"] == "production_issue"
                    and movement.get("productionJobId") == plan["job"]["jobId"]
                ],
                key=lambda movement: movement.get("productionRequestId") or "",
            ),
        }
    )
    rows = []
    for material in projection["materials"]:
        fulfilled_quantity_milli = 0
        for request in requests:
            original_material_id = (
                request["substitution"]["originalMaterialId"]
                if request["substitution"] is not None
                else request["materialId"]
            )
            if original_material_id != material["materialId"] or not any(
                movement_matches_production_request(movement, request)
                for movement in commerce["movements"]
            ):
                continue
            fulfilled_quantity_milli += (
                request["substitution"]["originalQuantityMilli"]
                if request["substitution"] is not None
                else request["quantityMilli"]
            )
        remaining_quantity_milli = max(
            material["requiredQuantityMilli"] - fulfilled_quantity_milli, 0
        )
        base = {
            "materialId": material["materialId"],
            "materialName": material["name"],
            "unit": material["unit"],
            "requiredQuantityMilli": material["requiredQuantityMilli"],
            "fulfilledQuantityMilli": fulfilled_quantity_milli,
            "remainingQuantityMilli": remaining_quantity_milli,
        }
        mapping = material.get("shopSupply")
        matching_items = (
            [item for item in commerce["items"] if item["sku"] == mapping["sku"]]
            if mapping is not None
            else []
        )
        if remaining_quantity_milli == 0:
            shop_supply = None
            if mapping is not None and len(matching_items) == 1:
                item = matching_items[0]
                shop_supply = {
                    "sku": mapping["sku"],
                    "itemName": item["name"],
                    "materialQuantityMilliPerStockUnit": mapping[
                        "materialQuantityMilliPerStockUnit"
                    ],
                    "onHandStockUnits": item["onHand"],
                    "onHandQuantityMilli": _safe_product(
                        item["onHand"],
                        mapping["materialQuantityMilliPerStockUnit"],
                        f"on-hand supply for {material['materialId']}",
                    ),
                    "protectedStockUnits": item["reorderAt"],
                    "protectedStockQuantityMilli": _safe_product(
                        item["reorderAt"],
                        mapping["materialQuantityMilliPerStockUnit"],
                        f"protected stock for {material['materialId']}",
                    ),
                    "availableToIssueStockUnits": max(
                        item["onHand"] - item["reorderAt"], 0
                    ),
                    "availableToIssueQuantityMilli": _safe_product(
                        max(item["onHand"] - item["reorderAt"], 0),
                        mapping["materialQuantityMilliPerStockUnit"],
                        f"available stock for {material['materialId']}",
                    ),
                    "openPurchaseOrderStockUnits": 0,
                    "openPurchaseOrderQuantityMilli": 0,
                    "atRiskPurchaseOrderStockUnits": 0,
                    "atRiskPurchaseOrderQuantityMilli": 0,
                    "requiredStockUnits": 0,
                    "requiredSupplyStockUnits": 0,
                    "suggestedIssueStockUnits": 0,
                    "suggestedExpediteStockUnits": 0,
                    "suggestedOrderStockUnits": 0,
                    "nextExpectedAt": None,
                }
            rows.append({**base, "status": "fulfilled", "shopSupply": shop_supply})
            continue
        if mapping is None or len(matching_items) != 1:
            rows.append(
                {**base, "status": "mapping_required", "shopSupply": None}
            )
            continue
        item = matching_items[0]
        open_orders = [
            order
            for order in purchase_orders
            if order["sku"] == mapping["sku"]
            and order["remaining"] > 0
            and order["status"] != "cancelled"
        ]
        effective_from = plan.get("effectiveFrom")
        effective_until = plan.get("effectiveUntil")
        at_risk_orders = [
            order
            for order in open_orders
            if order["expectedAt"] is None
            or (
                effective_from is not None
                and _instant(order["expectedAt"]) < _instant(effective_from)
            )
            or (
                effective_until is not None
                and _instant(order["expectedAt"]) >= _instant(effective_until)
            )
        ]
        scheduled_orders = [order for order in open_orders if order not in at_risk_orders]
        open_po_stock_units = sum(order["remaining"] for order in open_orders)
        at_risk_po_stock_units = sum(order["remaining"] for order in at_risk_orders)
        scheduled_po_stock_units = open_po_stock_units - at_risk_po_stock_units
        material_per_stock_unit = mapping["materialQuantityMilliPerStockUnit"]
        protected_stock_units = item["reorderAt"]
        available_to_issue_stock_units = max(
            item["onHand"] - protected_stock_units, 0
        )
        on_hand_quantity_milli = _safe_product(
            item["onHand"],
            material_per_stock_unit,
            f"on-hand supply for {material['materialId']}",
        )
        protected_stock_quantity_milli = _safe_product(
            protected_stock_units,
            material_per_stock_unit,
            f"protected stock for {material['materialId']}",
        )
        available_to_issue_quantity_milli = _safe_product(
            available_to_issue_stock_units,
            material_per_stock_unit,
            f"available stock for {material['materialId']}",
        )
        open_po_quantity_milli = _safe_product(
            open_po_stock_units,
            material_per_stock_unit,
            f"open purchase-order supply for {material['materialId']}",
        )
        at_risk_po_quantity_milli = _safe_product(
            at_risk_po_stock_units,
            material_per_stock_unit,
            f"at-risk purchase-order supply for {material['materialId']}",
        )
        required_stock_units = _stock_units_for(
            remaining_quantity_milli, material_per_stock_unit
        )
        required_supply_stock_units = protected_stock_units + required_stock_units
        dependable_supply_stock_units = item["onHand"] + scheduled_po_stock_units
        total_supply_stock_units = (
            dependable_supply_stock_units + at_risk_po_stock_units
        )
        dependable_gap_stock_units = max(
            required_supply_stock_units - dependable_supply_stock_units, 0
        )
        total_gap_stock_units = max(
            required_supply_stock_units - total_supply_stock_units, 0
        )
        status = (
            "ready_to_issue"
            if available_to_issue_stock_units >= required_stock_units
            else "covered_by_open_po"
            if dependable_gap_stock_units == 0
            else "supply_at_risk"
            if total_gap_stock_units == 0
            else "shortage"
        )
        rows.append(
            {
                **base,
                "status": status,
                "shopSupply": {
                    "sku": mapping["sku"],
                    "itemName": item["name"],
                    "materialQuantityMilliPerStockUnit": material_per_stock_unit,
                    "onHandStockUnits": item["onHand"],
                    "onHandQuantityMilli": on_hand_quantity_milli,
                    "protectedStockUnits": protected_stock_units,
                    "protectedStockQuantityMilli": protected_stock_quantity_milli,
                    "availableToIssueStockUnits": available_to_issue_stock_units,
                    "availableToIssueQuantityMilli": available_to_issue_quantity_milli,
                    "openPurchaseOrderStockUnits": open_po_stock_units,
                    "openPurchaseOrderQuantityMilli": open_po_quantity_milli,
                    "atRiskPurchaseOrderStockUnits": at_risk_po_stock_units,
                    "atRiskPurchaseOrderQuantityMilli": at_risk_po_quantity_milli,
                    "requiredStockUnits": required_stock_units,
                    "requiredSupplyStockUnits": required_supply_stock_units,
                    "suggestedIssueStockUnits": min(
                        available_to_issue_stock_units, required_stock_units
                    ),
                    "suggestedExpediteStockUnits": min(
                        at_risk_po_stock_units,
                        dependable_gap_stock_units,
                    ),
                    "suggestedOrderStockUnits": total_gap_stock_units,
                    "nextExpectedAt": next(
                        iter(
                            sorted(
                                order["expectedAt"]
                                for order in scheduled_orders
                                if order["expectedAt"] is not None
                            )
                        ),
                        None,
                    ),
                },
            }
        )
    summary = {
        "materials": len(rows),
        "mappingRequired": sum(row["status"] == "mapping_required" for row in rows),
        "shortages": sum(row["status"] == "shortage" for row in rows),
        "supplyAtRisk": sum(row["status"] == "supply_at_risk" for row in rows),
        "coveredByOpenPo": sum(row["status"] == "covered_by_open_po" for row in rows),
        "readyToIssue": sum(row["status"] == "ready_to_issue" for row in rows),
        "fulfilled": sum(row["status"] == "fulfilled" for row in rows),
    }
    status = (
        "mapping_required"
        if summary["mappingRequired"]
        else "shortage"
        if summary["shortages"]
        else "supply_at_risk"
        if summary["supplyAtRisk"]
        else "covered_by_open_po"
        if summary["coveredByOpenPo"]
        else "ready_to_issue"
        if summary["readyToIssue"]
        else "fulfilled"
    )
    body = {
        "contract": PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT,
        "source": {
            "plantRevision": projection["revision"],
            "plantHeadDigest": projection["headDigest"],
            "commerceSupplyDigest": commerce_supply_digest,
        },
        "job": {
            "jobId": plan["job"]["jobId"],
            "product": plan["job"]["product"],
            "targetQuantity": plan["job"]["targetQuantity"],
            "effectiveFrom": plan.get("effectiveFrom"),
            "effectiveUntil": plan.get("effectiveUntil"),
        },
        "status": status,
        "rows": rows,
        "summary": summary,
        "authority": {
            "purchaseCreated": False,
            "supplierContacted": False,
            "inventoryIssued": False,
            "productionChanged": False,
            "providerCalled": False,
        },
    }
    return {**body, "digest": plant_order_evidence_digest(body)}


def validate_production_material_requirements(
    value: object,
    production: Mapping[str, Any],
    commerce: Mapping[str, Any],
) -> dict[str, Any]:
    expected = project_production_material_requirements(production, commerce)
    if (
        expected is None
        or not isinstance(value, Mapping)
        or value.get("contract") != PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT
        or plant_order_evidence_digest(value)
        != plant_order_evidence_digest(expected)
    ):
        raise TrialValidationError(
            "Production material requirements do not match their current Plant and Shop evidence."
        )
    return expected


__all__ = [
    "PRODUCTION_MATERIAL_REQUIREMENTS_CONTRACT",
    "movement_matches_production_request",
    "project_production_material_requirements",
    "production_material_requests",
    "require_shop_issue_before_plant_progress",
    "require_shop_issue_matches_plant",
    "validate_production_material_requirements",
]
