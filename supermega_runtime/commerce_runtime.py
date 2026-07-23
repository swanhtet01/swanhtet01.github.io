"""Fail-closed Commerce state and lifecycle validation for managed workspaces."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime
from typing import Any

from supermega_runtime.trial_store import TrialValidationError


COMMERCE_SCHEMA = "supermega.commerce.workspace.v2"
COMMERCE_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.payment.reconciled",
        "commerce.stock.received",
        "commerce.close.saved",
    }
)
_ORDER_STATUSES = ("confirmed", "preparing", "ready", "completed", "cancelled")
_NEXT_ORDER_STATUS = {"confirmed": "preparing", "preparing": "ready", "ready": "completed"}
_PAYMENT_STATUSES = ("pending", "reconciled")
_REFUND_STATUSES = ("none", "due")
_MOVEMENT_KINDS = ("reserve", "release", "receipt")
_MAX_SAFE_INTEGER = 9_007_199_254_740_991

_STATE_FIELDS = frozenset({"schema", "items", "orders", "movements", "closes"})
_ITEM_FIELDS = frozenset({"sku", "name", "variant", "onHand", "reorderAt", "price"})
_ORDER_REQUIRED_FIELDS = frozenset(
    {
        "id",
        "createdAt",
        "customer",
        "channel",
        "item",
        "quantity",
        "payment",
        "paymentStatus",
        "refundStatus",
        "total",
        "status",
    }
)
_ORDER_OPTIONAL_FIELDS = frozenset(
    {
        "itemSku",
        "paymentReconciledAt",
        "paymentReconciliationActionId",
        "paymentReconciledBy",
        "paymentReconciliationReason",
        "paymentEvidenceReference",
        "fulfilment",
        "sourceRecordId",
        "evidenceReference",
    }
)
_RECONCILIATION_FIELDS = frozenset(
    {
        "paymentReconciledAt",
        "paymentReconciliationActionId",
        "paymentReconciledBy",
        "paymentReconciliationReason",
        "paymentEvidenceReference",
    }
)
_MOVEMENT_FIELDS = frozenset(
    {"id", "actionId", "createdAt", "actor", "reason", "evidenceReference", "kind", "sku", "quantityDelta", "orderId"}
)
_CLOSE_FIELDS = frozenset({"id", "createdAt", "total", "orders"})
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


def _text(value: object, field: str, *, maximum: int = 180) -> str:
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


def validate_commerce_state(value: object) -> dict[str, Any]:
    """Validate the complete managed Commerce snapshot without repairing it."""

    state = _object(value, "commerce state")
    _exact_fields(state, "commerce state", required=_STATE_FIELDS)
    if state.get("schema") != COMMERCE_SCHEMA:
        raise TrialValidationError(f"commerce state schema must be {COMMERCE_SCHEMA}.")

    items = _list(state["items"], "commerce state.items")
    orders = _list(state["orders"], "commerce state.orders")
    movements = _list(state["movements"], "commerce state.movements")
    closes = _list(state["closes"], "commerce state.closes")

    item_skus: list[str] = []
    item_by_sku: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(items):
        item = _object(candidate, f"items[{index}]")
        _exact_fields(item, f"items[{index}]", required=_ITEM_FIELDS - {"variant"}, optional=frozenset({"variant"}))
        sku = _text(item["sku"], f"items[{index}].sku", maximum=80)
        _text(item["name"], f"items[{index}].name")
        if "variant" in item:
            _text(item["variant"], f"items[{index}].variant")
        _integer(item["onHand"], f"items[{index}].onHand")
        _integer(item["reorderAt"], f"items[{index}].reorderAt")
        _integer(item["price"], f"items[{index}].price", minimum=1)
        item_skus.append(sku)
        item_by_sku[sku] = item
    _unique(item_skus, "Item SKU")

    order_ids: list[str] = []
    source_record_ids: list[str] = []
    reconciliation_action_ids: list[str] = []
    order_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(orders):
        order = _object(candidate, f"orders[{index}]")
        _exact_fields(order, f"orders[{index}]", required=_ORDER_REQUIRED_FIELDS, optional=_ORDER_OPTIONAL_FIELDS)
        order_id = _text(order["id"], f"orders[{index}].id", maximum=160)
        _timestamp(order["createdAt"], f"orders[{index}].createdAt")
        for field in ("customer", "channel", "item", "payment"):
            _text(order[field], f"orders[{index}].{field}")
        item_sku = order.get("itemSku")
        if item_sku is not None:
            item_sku = _text(item_sku, f"orders[{index}].itemSku", maximum=80)
            if item_sku not in item_by_sku:
                raise TrialValidationError(f"orders[{index}].itemSku is unknown.")
        _integer(order["quantity"], f"orders[{index}].quantity", minimum=1)
        _integer(order["total"], f"orders[{index}].total")
        if order["status"] not in _ORDER_STATUSES:
            raise TrialValidationError(f"orders[{index}].status is invalid.")
        if order["paymentStatus"] not in _PAYMENT_STATUSES:
            raise TrialValidationError(f"orders[{index}].paymentStatus is invalid.")
        if order["refundStatus"] not in _REFUND_STATUSES:
            raise TrialValidationError(f"orders[{index}].refundStatus is invalid.")
        for field in ("fulfilment", "sourceRecordId", "evidenceReference"):
            if field in order:
                value_text = _text(order[field], f"orders[{index}].{field}")
                if field == "sourceRecordId":
                    source_record_ids.append(value_text)

        present_reconciliation_fields = _RECONCILIATION_FIELDS & set(order)
        if order["paymentStatus"] == "reconciled":
            if present_reconciliation_fields != _RECONCILIATION_FIELDS:
                raise TrialValidationError(f"orders[{index}] requires complete payment reconciliation evidence.")
            _timestamp(order["paymentReconciledAt"], f"orders[{index}].paymentReconciledAt")
            reconciliation_action_ids.append(
                _text(order["paymentReconciliationActionId"], f"orders[{index}].paymentReconciliationActionId", maximum=160)
            )
            _text(order["paymentReconciledBy"], f"orders[{index}].paymentReconciledBy")
            _text(order["paymentReconciliationReason"], f"orders[{index}].paymentReconciliationReason")
            _text(order["paymentEvidenceReference"], f"orders[{index}].paymentEvidenceReference")
        elif present_reconciliation_fields:
            raise TrialValidationError(f"orders[{index}] cannot carry reconciliation evidence while payment is pending.")

        if order["refundStatus"] == "due" and not (
            order["status"] == "cancelled" and order["paymentStatus"] == "reconciled"
        ):
            raise TrialValidationError(f"orders[{index}] has an invalid refund exception.")
        if (
            order["status"] == "cancelled"
            and order["paymentStatus"] == "reconciled"
            and order["refundStatus"] != "due"
        ):
            raise TrialValidationError(f"orders[{index}] must preserve the refund due exception.")
        order_ids.append(order_id)
        order_by_id[order_id] = order
    _unique(order_ids, "Order ID")
    _unique(source_record_ids, "Order source record ID")
    _unique(reconciliation_action_ids, "Payment reconciliation action ID")

    movement_ids: list[str] = []
    movement_action_ids: list[str] = []
    reserve_by_order: dict[str, int] = {}
    release_by_order: dict[str, int] = {}
    for index, candidate in enumerate(movements):
        movement = _object(candidate, f"movements[{index}]")
        _exact_fields(
            movement,
            f"movements[{index}]",
            required=_MOVEMENT_FIELDS - {"orderId"},
            optional=frozenset({"orderId"}),
        )
        movement_id = _text(movement["id"], f"movements[{index}].id", maximum=180)
        action_id = _text(movement["actionId"], f"movements[{index}].actionId", maximum=160)
        _timestamp(movement["createdAt"], f"movements[{index}].createdAt")
        for field in ("actor", "reason", "evidenceReference"):
            _text(movement[field], f"movements[{index}].{field}")
        sku = _text(movement["sku"], f"movements[{index}].sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"movements[{index}].sku is unknown.")
        kind = movement["kind"]
        if kind not in _MOVEMENT_KINDS:
            raise TrialValidationError(f"movements[{index}].kind is invalid.")
        quantity_delta = _integer(abs(movement["quantityDelta"]) if isinstance(movement["quantityDelta"], int) and not isinstance(movement["quantityDelta"], bool) else movement["quantityDelta"], f"movements[{index}].quantityDelta", minimum=1)
        signed_delta = movement["quantityDelta"]
        if kind == "reserve" and signed_delta >= 0:
            raise TrialValidationError(f"movements[{index}] reserve must be negative.")
        if kind != "reserve" and signed_delta <= 0:
            raise TrialValidationError(f"movements[{index}] release or receipt must be positive.")
        if kind == "receipt":
            if "orderId" in movement:
                raise TrialValidationError(f"movements[{index}] receipt cannot reference an order.")
        else:
            order_id = _text(movement.get("orderId"), f"movements[{index}].orderId", maximum=160)
            order = order_by_id.get(order_id)
            if not order or order.get("itemSku") != sku or quantity_delta != order["quantity"]:
                raise TrialValidationError(f"movements[{index}] does not match its order reservation.")
            counter = reserve_by_order if kind == "reserve" else release_by_order
            counter[order_id] = counter.get(order_id, 0) + 1
            if kind == "release" and order["status"] != "cancelled":
                raise TrialValidationError(f"movements[{index}] release requires a cancelled order.")
        movement_ids.append(movement_id)
        movement_action_ids.append(action_id)
    _unique(movement_ids, "Stock movement ID")
    _unique(movement_action_ids, "Stock movement action ID")
    _unique([*movement_action_ids, *reconciliation_action_ids], "Commerce action ID")
    for order_id, count in reserve_by_order.items():
        if count != 1:
            raise TrialValidationError(f"{order_id} has more than one reservation.")
    for order_id, count in release_by_order.items():
        if count != 1 or reserve_by_order.get(order_id) != 1:
            raise TrialValidationError(f"{order_id} has an unproven stock release.")

    close_ids: list[str] = []
    for index, candidate in enumerate(closes):
        close = _object(candidate, f"closes[{index}]")
        _exact_fields(close, f"closes[{index}]", required=_CLOSE_FIELDS)
        close_ids.append(_text(close["id"], f"closes[{index}].id", maximum=160))
        _timestamp(close["createdAt"], f"closes[{index}].createdAt")
        _integer(close["total"], f"closes[{index}].total")
        _integer(close["orders"], f"closes[{index}].orders")
    _unique(close_ids, "Daily close ID")
    return deepcopy(state)


def _payload(payload: Mapping[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    if set(payload) != {"state", "evidence"}:
        raise TrialValidationError("Commerce payload must contain exactly state and evidence objects.")
    evidence = _object(payload.get("evidence"), "evidence")
    _exact_fields(evidence, "evidence", required=_EVIDENCE_FIELDS)
    validated_evidence = {
        "actionId": _text(evidence["actionId"], "evidence.actionId", maximum=160),
        "capturedAt": _timestamp(evidence["capturedAt"], "evidence.capturedAt"),
        "actor": _text(evidence["actor"], "evidence.actor"),
        "reason": _text(evidence["reason"], "evidence.reason"),
        "evidenceReference": _text(evidence["evidenceReference"], "evidence.evidenceReference"),
    }
    return validate_commerce_state(payload.get("state")), validated_evidence


def _validate_event_evidence(event_type: str, next_state: Mapping[str, Any], evidence: Mapping[str, str]) -> None:
    movement_kind = {
        "commerce.order.created": "reserve",
        "commerce.order.cancelled": "release",
        "commerce.stock.received": "receipt",
    }.get(event_type)
    if movement_kind:
        movement = next_state["movements"][0]
        if movement.get("kind") != movement_kind or any(
            movement.get(movement_field) != evidence[evidence_field]
            for movement_field, evidence_field in (
                ("actionId", "actionId"),
                ("createdAt", "capturedAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        ):
            raise TrialValidationError("command evidence must match the attributable stock movement.")
    elif event_type == "commerce.payment.reconciled":
        matches = [
            order
            for order in next_state["orders"]
            if order.get("paymentReconciliationActionId") == evidence["actionId"]
        ]
        if len(matches) != 1:
            raise TrialValidationError("command evidence must identify the reconciled payment.")
        order = matches[0]
        if (
            order.get("paymentReconciledAt") != evidence["capturedAt"]
            or order.get("paymentReconciledBy") != evidence["actor"]
            or order.get("paymentReconciliationReason") != evidence["reason"]
            or order.get("paymentEvidenceReference") != evidence["evidenceReference"]
        ):
            raise TrialValidationError("command evidence must match the payment reconciliation evidence.")


def _one_changed(current: list[Any], next_values: list[Any], field: str) -> tuple[dict[str, Any], dict[str, Any]]:
    if len(current) != len(next_values):
        raise TrialValidationError(f"{field} must preserve its record count for this event.")
    changes = [index for index, (before, after) in enumerate(zip(current, next_values, strict=True)) if before != after]
    if len(changes) != 1:
        raise TrialValidationError(f"{field} must change exactly one existing record.")
    index = changes[0]
    before = _object(current[index], f"current {field}[{index}]")
    after = _object(next_values[index], f"next {field}[{index}]")
    identity_field = "sku" if field == "items" else "id"
    if before.get(identity_field) != after.get(identity_field):
        raise TrialValidationError(f"{field} record identity cannot change.")
    return before, after


def _without(value: Mapping[str, Any], fields: frozenset[str]) -> dict[str, Any]:
    return {key: nested for key, nested in value.items() if key not in fields}


def _require_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any], *fields: str) -> None:
    changed = [field for field in fields if current[field] != next_state[field]]
    if changed:
        raise TrialValidationError(f"event cannot change: {', '.join(changed)}.")


def _validate_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if len(next_state["orders"]) != len(current["orders"]) + 1 or next_state["orders"][1:] != current["orders"]:
        raise TrialValidationError("commerce.order.created must prepend exactly one order.")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.order.created must prepend exactly one stock reservation.")
    _require_unchanged(current, next_state, "closes")
    before_item, after_item = _one_changed(current["items"], next_state["items"], "items")
    order = next_state["orders"][0]
    movement = next_state["movements"][0]
    if order.get("status") != "confirmed" or order.get("paymentStatus") != "pending" or order.get("refundStatus") != "none":
        raise TrialValidationError("a new order must start confirmed with pending payment and no refund exception.")
    if not order.get("itemSku") or order["itemSku"] != before_item["sku"]:
        raise TrialValidationError("a new order must reference the changed inventory item.")
    if order["total"] != before_item["price"] * order["quantity"]:
        raise TrialValidationError("a new order total must equal the current item price times quantity.")
    if after_item != {**before_item, "onHand": before_item["onHand"] - order["quantity"]}:
        raise TrialValidationError("a new order must reserve its exact quantity from stock.")
    if movement != {
        **{key: movement[key] for key in ("id", "actionId", "createdAt", "actor", "reason", "evidenceReference")},
        "kind": "reserve",
        "sku": order["itemSku"],
        "quantityDelta": -order["quantity"],
        "orderId": order["id"],
    } or movement["id"] != f"MOV-{movement['actionId']}":
        raise TrialValidationError("a new order requires one attributable stock reservation.")


def _validate_advanced(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if _without(before, frozenset({"status"})) != _without(after, frozenset({"status"})):
        raise TrialValidationError("order advancement may change only status.")
    if _NEXT_ORDER_STATUS.get(before["status"]) != after["status"]:
        raise TrialValidationError("order status must advance exactly one lifecycle step.")
    if before["status"] == "ready" and before["paymentStatus"] != "reconciled":
        raise TrialValidationError("payment must be reconciled before order completion.")


def _validate_cancelled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "closes")
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    before_item, after_item = _one_changed(current["items"], next_state["items"], "items")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.order.cancelled must prepend exactly one stock release.")
    if before_order["status"] in {"completed", "cancelled"}:
        raise TrialValidationError("completed or cancelled orders cannot be cancelled.")
    expected_refund = "due" if before_order["paymentStatus"] == "reconciled" else "none"
    if after_order != {**before_order, "status": "cancelled", "refundStatus": expected_refund}:
        raise TrialValidationError("cancellation may change only order status and the required refund exception.")
    if before_order.get("itemSku") != before_item["sku"]:
        raise TrialValidationError("cancellation must release the order inventory item.")
    if after_item != {**before_item, "onHand": before_item["onHand"] + before_order["quantity"]}:
        raise TrialValidationError("cancellation must release the exact reserved quantity.")
    movement = next_state["movements"][0]
    if movement.get("kind") != "release" or movement.get("sku") != before_item["sku"] or movement.get("orderId") != before_order["id"] or movement.get("quantityDelta") != before_order["quantity"] or movement.get("id") != f"MOV-{movement.get('actionId')}":
        raise TrialValidationError("cancellation requires one attributable stock release.")
    reserves = [entry for entry in current["movements"] if entry.get("kind") == "reserve" and entry.get("orderId") == before_order["id"]]
    releases = [entry for entry in current["movements"] if entry.get("kind") == "release" and entry.get("orderId") == before_order["id"]]
    if len(reserves) != 1 or releases:
        raise TrialValidationError("cancellation requires exactly one unmatched reservation.")


def _validate_reconciled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if before["status"] == "cancelled" or before["paymentStatus"] != "pending":
        raise TrialValidationError("only a pending payment on an active order can be reconciled.")
    if _without(before, frozenset({"paymentStatus"})) != _without(after, _RECONCILIATION_FIELDS | {"paymentStatus"}):
        raise TrialValidationError("payment reconciliation may change only payment status and evidence.")
    if after["paymentStatus"] != "reconciled" or not _RECONCILIATION_FIELDS.issubset(after):
        raise TrialValidationError("payment reconciliation requires complete evidence.")


def _validate_received(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    before_item, after_item = _one_changed(current["items"], next_state["items"], "items")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.stock.received must prepend exactly one receipt.")
    movement = next_state["movements"][0]
    if movement.get("kind") != "receipt" or movement.get("sku") != before_item["sku"] or "orderId" in movement or movement.get("id") != f"MOV-{movement.get('actionId')}":
        raise TrialValidationError("stock receipt requires one attributable receipt movement.")
    if after_item != {**before_item, "onHand": before_item["onHand"] + movement["quantityDelta"]}:
        raise TrialValidationError("stock receipt must increase the matching item by its exact quantity.")


def _validate_close(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements")
    if len(next_state["closes"]) != len(current["closes"]) + 1 or next_state["closes"][1:] != current["closes"]:
        raise TrialValidationError("commerce.close.saved must prepend exactly one close snapshot.")
    eligible = [
        order
        for order in current["orders"]
        if order["status"] == "completed" and order["paymentStatus"] == "reconciled"
    ]
    close = next_state["closes"][0]
    if close["orders"] != len(eligible) or close["total"] != sum(order["total"] for order in eligible):
        raise TrialValidationError("daily close totals must match completed, reconciled orders.")


_TRANSITION_VALIDATORS = {
    "commerce.order.created": _validate_created,
    "commerce.order.advanced": _validate_advanced,
    "commerce.order.cancelled": _validate_cancelled,
    "commerce.payment.reconciled": _validate_reconciled,
    "commerce.stock.received": _validate_received,
    "commerce.close.saved": _validate_close,
}


def reduce_commerce_state(
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Accept only one declared Commerce lifecycle transition per command."""

    if event_type not in COMMERCE_EVENTS:
        raise TrialValidationError("event_type must be a supported Commerce lifecycle event.")
    next_state, evidence = _payload(payload)
    if event_type == "commerce.workspace.initialized":
        if dict(current):
            raise TrialValidationError("managed Commerce is already initialized.")
        if not next_state["items"] or next_state["orders"] or next_state["movements"] or next_state["closes"]:
            raise TrialValidationError("Commerce initialization requires a non-empty catalog and no operating history.")
        return next_state

    current_state = validate_commerce_state(current)
    _TRANSITION_VALIDATORS[event_type](current_state, next_state)
    _validate_event_evidence(event_type, next_state, evidence)
    return next_state


__all__ = ["COMMERCE_EVENTS", "COMMERCE_SCHEMA", "reduce_commerce_state", "validate_commerce_state"]
