"""Fail-closed Commerce state and lifecycle validation for managed workspaces."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from supermega_runtime.trial_store import TrialValidationError


COMMERCE_SCHEMA = "supermega.commerce.workspace.v2"
COMMERCE_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.payment.reconciled",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.close.saved",
        "commerce.website_intake.created",
        "commerce.website_intake.converted",
    }
)
COMMERCE_HUMAN_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.payment.reconciled",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.close.saved",
        "commerce.website_intake.converted",
    }
)
_ORDER_STATUSES = ("confirmed", "preparing", "ready", "completed", "cancelled")
_NEXT_ORDER_STATUS = {"confirmed": "preparing", "preparing": "ready", "ready": "completed"}
_PAYMENT_STATUSES = ("pending", "reconciled")
_REFUND_STATUSES = ("none", "due", "settled")
_MOVEMENT_KINDS = ("opening", "reserve", "release", "receipt")
_WEBSITE_INTAKE_STATUSES = ("pending_confirmation", "converted")
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_WEBSITE_FINGERPRINT_PATTERN = re.compile(r"web-[a-f0-9]{8}")
_WEBSITE_INTAKE_ID_PATTERN = re.compile(r"WINT-[A-Z0-9-]{8,80}")

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
        "refundSettledAt",
        "refundSettlementActionId",
        "refundSettledBy",
        "refundSettlementReason",
        "refundEvidenceReference",
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
_CLOSE_REQUIRED_FIELDS = frozenset({"id", "createdAt", "total", "orders"})
_CLOSE_SNAPSHOT_FIELDS = frozenset(
    {
        "businessDate",
        "orderIds",
        "paymentExceptionOrderIds",
        "stockExceptionSkus",
        "actionId",
        "operator",
        "reason",
        "evidenceReference",
    }
)
_REFUND_SETTLEMENT_FIELDS = frozenset(
    {
        "refundSettledAt",
        "refundSettlementActionId",
        "refundSettledBy",
        "refundSettlementReason",
        "refundEvidenceReference",
    }
)
_CLOSE_ID_PATTERN = re.compile(
    r"^CLOSE-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$"
)
_CLOSE_ACTION_ID_PATTERN = re.compile(
    r"^ACT-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$"
)
_BUSINESS_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})
_WEBSITE_SOURCE_FIELDS = frozenset({"fingerprint", "approvalId", "snapshotId", "pageId", "siteName", "pagePath"})
_WEBSITE_INTAKE_REQUIRED_FIELDS = frozenset(
    {"id", "createdAt", "status", "source", "sku", "quantity", "itemName", "unitPrice", "total", "creation"}
)
_WEBSITE_INTAKE_OPTIONAL_FIELDS = frozenset({"itemVariant", "conversion"})
_WEBSITE_CONVERSION_FIELDS = _EVIDENCE_FIELDS | {"orderId"}


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


def _myanmar_business_date(timestamp: str) -> str:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    return (
        parsed.astimezone(timezone.utc) + timedelta(hours=6, minutes=30)
    ).date().isoformat()


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


def _action_proof(value: object, field: str, *, with_order_id: bool = False) -> dict[str, Any]:
    proof = _object(value, field)
    required = _WEBSITE_CONVERSION_FIELDS if with_order_id else _EVIDENCE_FIELDS
    _exact_fields(proof, field, required=required)
    _text(proof["actionId"], f"{field}.actionId", maximum=160)
    _timestamp(proof["capturedAt"], f"{field}.capturedAt")
    for key in ("actor", "reason", "evidenceReference"):
        _text(proof[key], f"{field}.{key}")
    if with_order_id:
        _text(proof["orderId"], f"{field}.orderId", maximum=160)
    return proof


def validate_commerce_state(value: object) -> dict[str, Any]:
    """Validate the complete managed Commerce snapshot without repairing it."""

    state = _object(value, "commerce state")
    _exact_fields(state, "commerce state", required=_STATE_FIELDS, optional=frozenset({"websiteIntakes"}))
    if state.get("schema") != COMMERCE_SCHEMA:
        raise TrialValidationError(f"commerce state schema must be {COMMERCE_SCHEMA}.")

    items = _list(state["items"], "commerce state.items")
    orders = _list(state["orders"], "commerce state.orders")
    movements = _list(state["movements"], "commerce state.movements")
    closes = _list(state["closes"], "commerce state.closes")
    website_intakes = _list(state.get("websiteIntakes", []), "commerce state.websiteIntakes")

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
    refund_settlement_action_ids: list[str] = []
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

        present_refund_settlement_fields = _REFUND_SETTLEMENT_FIELDS & set(order)
        if order["refundStatus"] == "settled":
            if present_refund_settlement_fields != _REFUND_SETTLEMENT_FIELDS:
                raise TrialValidationError(f"orders[{index}] requires complete refund settlement evidence.")
            _timestamp(order["refundSettledAt"], f"orders[{index}].refundSettledAt")
            refund_settlement_action_ids.append(
                _text(order["refundSettlementActionId"], f"orders[{index}].refundSettlementActionId", maximum=160)
            )
            _text(order["refundSettledBy"], f"orders[{index}].refundSettledBy")
            _text(order["refundSettlementReason"], f"orders[{index}].refundSettlementReason")
            _text(order["refundEvidenceReference"], f"orders[{index}].refundEvidenceReference")
        elif present_refund_settlement_fields:
            raise TrialValidationError(
                f"orders[{index}] cannot carry settlement evidence while refund is {order['refundStatus']}."
            )

        if order["refundStatus"] in {"due", "settled"} and not (
            order["status"] == "cancelled" and order["paymentStatus"] == "reconciled"
        ):
            raise TrialValidationError(f"orders[{index}] has an invalid refund exception.")
        if (
            order["status"] == "cancelled"
            and order["paymentStatus"] == "reconciled"
            and order["refundStatus"] not in {"due", "settled"}
        ):
            raise TrialValidationError(f"orders[{index}] must preserve a due or settled refund.")
        order_ids.append(order_id)
        order_by_id[order_id] = order
    _unique(order_ids, "Order ID")
    _unique(source_record_ids, "Order source record ID")
    _unique(reconciliation_action_ids, "Payment reconciliation action ID")
    _unique(refund_settlement_action_ids, "Refund settlement action ID")

    movement_ids: list[str] = []
    movement_action_ids: list[str] = []
    reserve_by_order: dict[str, int] = {}
    release_by_order: dict[str, int] = {}
    reserve_movement_by_order: dict[str, dict[str, Any]] = {}
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
        if kind == "opening":
            quantity_delta = _integer(movement["quantityDelta"], f"movements[{index}].quantityDelta")
        else:
            quantity_delta = _integer(abs(movement["quantityDelta"]) if isinstance(movement["quantityDelta"], int) and not isinstance(movement["quantityDelta"], bool) else movement["quantityDelta"], f"movements[{index}].quantityDelta", minimum=1)
            signed_delta = movement["quantityDelta"]
            if kind == "reserve" and signed_delta >= 0:
                raise TrialValidationError(f"movements[{index}] reserve must be negative.")
            if kind != "reserve" and signed_delta <= 0:
                raise TrialValidationError(f"movements[{index}] release or receipt must be positive.")
        if kind in {"opening", "receipt"}:
            if "orderId" in movement:
                raise TrialValidationError(f"movements[{index}] {kind} cannot reference an order.")
        else:
            order_id = _text(movement.get("orderId"), f"movements[{index}].orderId", maximum=160)
            order = order_by_id.get(order_id)
            if not order or order.get("itemSku") != sku or quantity_delta != order["quantity"]:
                raise TrialValidationError(f"movements[{index}] does not match its order reservation.")
            counter = reserve_by_order if kind == "reserve" else release_by_order
            counter[order_id] = counter.get(order_id, 0) + 1
            if kind == "reserve":
                reserve_movement_by_order[order_id] = movement
            if kind == "release" and order["status"] != "cancelled":
                raise TrialValidationError(f"movements[{index}] release requires a cancelled order.")
        movement_ids.append(movement_id)
        movement_action_ids.append(action_id)
    _unique(movement_ids, "Stock movement ID")
    _unique(movement_action_ids, "Stock movement action ID")
    for order_id, count in reserve_by_order.items():
        if count != 1:
            raise TrialValidationError(f"{order_id} has more than one reservation.")
    for order_id, count in release_by_order.items():
        if count != 1 or reserve_by_order.get(order_id) != 1:
            raise TrialValidationError(f"{order_id} has an unproven stock release.")

    close_ids: list[str] = []
    close_action_ids: list[str] = []
    close_business_dates: list[str] = []
    closed_order_ids: list[str] = []
    for index, candidate in enumerate(closes):
        close = _object(candidate, f"closes[{index}]")
        _exact_fields(
            close,
            f"closes[{index}]",
            required=_CLOSE_REQUIRED_FIELDS,
            optional=_CLOSE_SNAPSHOT_FIELDS,
        )
        close_ids.append(_text(close["id"], f"closes[{index}].id", maximum=160))
        _timestamp(close["createdAt"], f"closes[{index}].createdAt")
        _integer(close["total"], f"closes[{index}].total")
        _integer(close["orders"], f"closes[{index}].orders")
        present_snapshot_fields = set(close) & _CLOSE_SNAPSHOT_FIELDS
        if present_snapshot_fields and present_snapshot_fields != _CLOSE_SNAPSHOT_FIELDS:
            raise TrialValidationError(
                f"closes[{index}] requires complete exception and operator evidence."
            )
        if present_snapshot_fields:
            business_date = _text(
                close["businessDate"],
                f"closes[{index}].businessDate",
                maximum=10,
            )
            order_ids_for_close = [
                _text(value, f"closes[{index}].orderIds[{reference_index}]", maximum=160)
                for reference_index, value in enumerate(
                    _list(close["orderIds"], f"closes[{index}].orderIds")
                )
            ]
            payment_exception_order_ids = [
                _text(value, f"closes[{index}].paymentExceptionOrderIds[{reference_index}]", maximum=160)
                for reference_index, value in enumerate(
                    _list(
                        close["paymentExceptionOrderIds"],
                        f"closes[{index}].paymentExceptionOrderIds",
                    )
                )
            ]
            stock_exception_skus = [
                _text(value, f"closes[{index}].stockExceptionSkus[{reference_index}]", maximum=80)
                for reference_index, value in enumerate(
                    _list(
                        close["stockExceptionSkus"],
                        f"closes[{index}].stockExceptionSkus",
                    )
                )
            ]
            if (
                not _BUSINESS_DATE_PATTERN.fullmatch(business_date)
                or business_date != _myanmar_business_date(str(close["createdAt"]))
            ):
                raise TrialValidationError(
                    f"closes[{index}].businessDate must match its close timestamp."
                )
            _unique(order_ids_for_close, f"closes[{index}] order ID")
            _unique(payment_exception_order_ids, f"closes[{index}] payment exception order ID")
            _unique(stock_exception_skus, f"closes[{index}] stock exception SKU")
            if order_ids_for_close != sorted(order_ids_for_close):
                raise TrialValidationError(f"closes[{index}] order IDs must be sorted.")
            if payment_exception_order_ids != sorted(payment_exception_order_ids):
                raise TrialValidationError(f"closes[{index}] payment exception order IDs must be sorted.")
            if stock_exception_skus != sorted(stock_exception_skus):
                raise TrialValidationError(f"closes[{index}] stock exception SKUs must be sorted.")
            if any(order_id not in order_by_id for order_id in order_ids_for_close):
                raise TrialValidationError(f"closes[{index}] references an unknown closed order.")
            if any(order_id not in order_by_id for order_id in payment_exception_order_ids):
                raise TrialValidationError(f"closes[{index}] references an unknown payment exception order.")
            if any(sku not in item_by_sku for sku in stock_exception_skus):
                raise TrialValidationError(f"closes[{index}] references an unknown stock exception SKU.")
            member_orders = [order_by_id[order_id] for order_id in order_ids_for_close]
            if (
                any(
                    order["status"] != "completed"
                    or order["paymentStatus"] != "reconciled"
                    for order in member_orders
                )
                or close["orders"] != len(order_ids_for_close)
                or close["total"] != sum(order["total"] for order in member_orders)
            ):
                raise TrialValidationError(
                    f"closes[{index}] totals must match its completed, reconciled order membership."
                )
            if not _CLOSE_ID_PATTERN.fullmatch(str(close["id"])):
                raise TrialValidationError(f"closes[{index}].id must be a full close UUID.")
            close_action_id = _text(
                close["actionId"], f"closes[{index}].actionId", maximum=160
            )
            if not _CLOSE_ACTION_ID_PATTERN.fullmatch(close_action_id):
                raise TrialValidationError(
                    f"closes[{index}].actionId must be a full action UUID."
                )
            close_action_ids.append(close_action_id)
            close_business_dates.append(business_date)
            closed_order_ids.extend(order_ids_for_close)
            _text(close["operator"], f"closes[{index}].operator")
            _text(close["reason"], f"closes[{index}].reason")
            _text(close["evidenceReference"], f"closes[{index}].evidenceReference")
    _unique(close_ids, "Daily close ID")
    _unique(close_business_dates, "Daily close business date")
    _unique(closed_order_ids, "Closed order ID")

    intake_ids: list[str] = []
    intake_sources: list[str] = []
    intake_action_ids: list[str] = []
    conversion_action_ids: list[str] = []
    for index, candidate in enumerate(website_intakes):
        field = f"websiteIntakes[{index}]"
        intake = _object(candidate, field)
        _exact_fields(
            intake,
            field,
            required=_WEBSITE_INTAKE_REQUIRED_FIELDS,
            optional=_WEBSITE_INTAKE_OPTIONAL_FIELDS,
        )
        intake_id = _text(intake["id"], f"{field}.id", maximum=85)
        if _WEBSITE_INTAKE_ID_PATTERN.fullmatch(intake_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(intake["createdAt"], f"{field}.createdAt")
        if intake["status"] not in _WEBSITE_INTAKE_STATUSES:
            raise TrialValidationError(f"{field}.status is invalid.")

        source = _object(intake["source"], f"{field}.source")
        _exact_fields(source, f"{field}.source", required=_WEBSITE_SOURCE_FIELDS)
        fingerprint = _text(source["fingerprint"], f"{field}.source.fingerprint", maximum=12)
        if _WEBSITE_FINGERPRINT_PATTERN.fullmatch(fingerprint) is None:
            raise TrialValidationError(f"{field}.source.fingerprint must match web-[a-f0-9]{{8}}.")
        approval_id = _text(source["approvalId"], f"{field}.source.approvalId", maximum=160)
        snapshot_id = _text(source["snapshotId"], f"{field}.source.snapshotId", maximum=160)
        page_id = _text(source["pageId"], f"{field}.source.pageId", maximum=160)
        _text(source["siteName"], f"{field}.source.siteName", maximum=160)
        page_path = _text(source["pagePath"], f"{field}.source.pagePath", maximum=160)
        if not page_path.startswith("/"):
            raise TrialValidationError(f"{field}.source.pagePath must be absolute.")

        sku = _text(intake["sku"], f"{field}.sku", maximum=80)
        quantity = _integer(intake["quantity"], f"{field}.quantity", minimum=1)
        item = item_by_sku.get(sku)
        if item is None:
            raise TrialValidationError(f"{field}.sku is unknown.")
        item_name = _text(intake["itemName"], f"{field}.itemName")
        item_variant = _text(intake["itemVariant"], f"{field}.itemVariant") if "itemVariant" in intake else None
        unit_price = _integer(intake["unitPrice"], f"{field}.unitPrice", minimum=1)
        total = _integer(intake["total"], f"{field}.total", minimum=1)
        if (
            item_name != item["name"]
            or item_variant != item.get("variant")
            or unit_price != item["price"]
            or total != quantity * unit_price
        ):
            raise TrialValidationError(f"{field} does not match its Commerce catalog record.")

        creation = _action_proof(intake["creation"], f"{field}.creation")
        if creation["capturedAt"] != created_at:
            raise TrialValidationError(f"{field}.creation must be captured when the intake was created.")
        intake_action_ids.append(creation["actionId"])

        matching_source_orders = [
            order for order in order_by_id.values() if order.get("sourceRecordId") == intake_id
        ]
        if intake["status"] == "pending_confirmation":
            if "conversion" in intake or matching_source_orders:
                raise TrialValidationError(f"{field} pending intake cannot have conversion history.")
        else:
            if "conversion" not in intake:
                raise TrialValidationError(f"{field}.conversion is required after conversion.")
            conversion = _action_proof(intake["conversion"], f"{field}.conversion", with_order_id=True)
            order = order_by_id.get(conversion["orderId"])
            reserve = reserve_movement_by_order.get(conversion["orderId"])
            if (
                len(matching_source_orders) != 1
                or order is None
                or matching_source_orders[0].get("id") != order["id"]
                or order["createdAt"] != conversion["capturedAt"]
                or order["channel"] != "Website"
                or order["item"] != item_name
                or order.get("itemSku") != sku
                or order["quantity"] != quantity
                or order["total"] != total
                or order.get("evidenceReference") != conversion["evidenceReference"]
                or reserve is None
                or any(
                    reserve.get(movement_field) != conversion[proof_field]
                    for movement_field, proof_field in (
                        ("actionId", "actionId"),
                        ("createdAt", "capturedAt"),
                        ("actor", "actor"),
                        ("reason", "reason"),
                        ("evidenceReference", "evidenceReference"),
                    )
                )
            ):
                raise TrialValidationError(f"{field} does not match its converted Website order.")
            intake_action_ids.append(conversion["actionId"])
            conversion_action_ids.append(conversion["actionId"])

        intake_ids.append(intake_id)
        intake_sources.append("|".join((fingerprint, approval_id, snapshot_id, page_id)))

    _unique(intake_ids, "Website intake ID")
    _unique(intake_sources, "Website intake source")
    _unique(intake_action_ids, "Website intake action ID")
    _unique(
        [
            *(action_id for action_id in movement_action_ids if action_id not in conversion_action_ids),
            *reconciliation_action_ids,
            *refund_settlement_action_ids,
            *intake_action_ids,
            *close_action_ids,
        ],
        "Commerce action ID",
    )
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


def _proof_matches_evidence(proof: Mapping[str, Any], evidence: Mapping[str, str]) -> bool:
    return all(
        proof.get(proof_field) == evidence[evidence_field]
        for proof_field, evidence_field in (
            ("actionId", "actionId"),
            ("capturedAt", "capturedAt"),
            ("actor", "actor"),
            ("reason", "reason"),
            ("evidenceReference", "evidenceReference"),
        )
    )


def _validate_event_evidence(
    event_type: str,
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    evidence: Mapping[str, str],
) -> None:
    if event_type == "commerce.website_intake.created":
        creation = next_state["websiteIntakes"][0]["creation"]
        if not _proof_matches_evidence(creation, evidence):
            raise TrialValidationError("command evidence must match the Website intake creation proof.")
    elif event_type == "commerce.website_intake.converted":
        conversions = [
            intake["conversion"]
            for intake in next_state["websiteIntakes"]
            if intake.get("conversion", {}).get("actionId") == evidence["actionId"]
        ]
        if len(conversions) != 1 or not _proof_matches_evidence(conversions[0], evidence):
            raise TrialValidationError("command evidence must match the Website intake conversion proof.")

    movement_kind = {
        "commerce.item.created": "opening",
        "commerce.order.created": "reserve",
        "commerce.order.cancelled": "release",
        "commerce.stock.received": "receipt",
        "commerce.website_intake.converted": "reserve",
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
    elif event_type == "commerce.refund.settled":
        _, order = _one_changed(current["orders"], next_state["orders"], "orders")
        if (
            order.get("refundSettlementActionId") != evidence["actionId"]
            or order.get("refundSettledAt") != evidence["capturedAt"]
            or order.get("refundSettledBy") != evidence["actor"]
            or order.get("refundSettlementReason") != evidence["reason"]
            or order.get("refundEvidenceReference") != evidence["evidenceReference"]
        ):
            raise TrialValidationError("command evidence must match the refund settlement evidence.")
    elif event_type == "commerce.close.saved":
        close = next_state["closes"][0]
        if (
            close.get("actionId") != evidence["actionId"]
            or close.get("createdAt") != evidence["capturedAt"]
            or close.get("operator") != evidence["actor"]
            or close.get("reason") != evidence["reason"]
            or close.get("evidenceReference") != evidence["evidenceReference"]
        ):
            raise TrialValidationError("command evidence must match the daily close proof.")


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


def _website_intakes(state: Mapping[str, Any]) -> list[Any]:
    return state.get("websiteIntakes", [])


def _require_website_intakes_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if _website_intakes(current) != _website_intakes(next_state):
        raise TrialValidationError("event cannot change: websiteIntakes.")


def _validate_new_order_and_reservation(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    *,
    event_type: str,
) -> None:
    if len(next_state["orders"]) != len(current["orders"]) + 1 or next_state["orders"][1:] != current["orders"]:
        raise TrialValidationError(f"{event_type} must prepend exactly one order.")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError(f"{event_type} must prepend exactly one stock reservation.")
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


def _validate_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _validate_new_order_and_reservation(current, next_state, event_type="commerce.order.created")
    _require_website_intakes_unchanged(current, next_state)


def _validate_item_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    if len(next_state["items"]) != len(current["items"]) + 1 or next_state["items"][1:] != current["items"]:
        raise TrialValidationError("commerce.item.created must prepend exactly one catalog item.")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.item.created must prepend exactly one opening balance.")
    item = next_state["items"][0]
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "opening"
        or movement.get("sku") != item["sku"]
        or movement.get("quantityDelta") != item["onHand"]
        or "orderId" in movement
        or movement.get("id") != f"MOV-{movement.get('actionId')}"
    ):
        raise TrialValidationError("a new catalog item requires one exact attributable opening balance.")


def _validate_advanced(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if _without(before, frozenset({"status"})) != _without(after, frozenset({"status"})):
        raise TrialValidationError("order advancement may change only status.")
    if _NEXT_ORDER_STATUS.get(before["status"]) != after["status"]:
        raise TrialValidationError("order status must advance exactly one lifecycle step.")
    if before["status"] == "ready" and before["paymentStatus"] != "reconciled":
        raise TrialValidationError("payment must be reconciled before order completion.")


def _validate_cancelled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "closes")
    _require_website_intakes_unchanged(current, next_state)
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
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if before["status"] == "cancelled" or before["paymentStatus"] != "pending":
        raise TrialValidationError("only a pending payment on an active order can be reconciled.")
    if _without(before, frozenset({"paymentStatus"})) != _without(after, _RECONCILIATION_FIELDS | {"paymentStatus"}):
        raise TrialValidationError("payment reconciliation may change only payment status and evidence.")
    if after["paymentStatus"] != "reconciled" or not _RECONCILIATION_FIELDS.issubset(after):
        raise TrialValidationError("payment reconciliation requires complete evidence.")


def _validate_refund_settled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if before["refundStatus"] != "due" or after["refundStatus"] != "settled":
        raise TrialValidationError("only a due refund can be settled.")
    if _without(before, frozenset({"refundStatus"})) != _without(
        after,
        _REFUND_SETTLEMENT_FIELDS | {"refundStatus"},
    ):
        raise TrialValidationError("refund settlement may change only refund status and settlement evidence.")
    if not _REFUND_SETTLEMENT_FIELDS.issubset(after):
        raise TrialValidationError("refund settlement requires complete evidence.")


def _validate_received(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
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
    _require_website_intakes_unchanged(current, next_state)
    if len(next_state["closes"]) != len(current["closes"]) + 1 or next_state["closes"][1:] != current["closes"]:
        raise TrialValidationError("commerce.close.saved must prepend exactly one close snapshot.")
    if any(
        "orderIds" not in prior_close or "businessDate" not in prior_close
        for prior_close in current["closes"]
    ):
        raise TrialValidationError(
            "legacy daily closes must be migrated before another close can be saved."
        )
    previously_closed_order_ids = {
        order_id
        for prior_close in current["closes"]
        for order_id in prior_close.get("orderIds", [])
    }
    eligible = sorted(
        [
            order
            for order in current["orders"]
            if order["status"] == "completed"
            and order["paymentStatus"] == "reconciled"
            and order["id"] not in previously_closed_order_ids
        ],
        key=lambda order: order["id"],
    )
    close = next_state["closes"][0]
    if not _CLOSE_SNAPSHOT_FIELDS.issubset(close):
        raise TrialValidationError("new daily closes require exception and operator evidence.")
    if close["orderIds"] != [order["id"] for order in eligible]:
        raise TrialValidationError("daily close order membership must match unclosed completed orders.")
    if close["orders"] != len(eligible) or close["total"] != sum(order["total"] for order in eligible):
        raise TrialValidationError("daily close totals must match completed, reconciled orders.")
    if close["businessDate"] != _myanmar_business_date(close["createdAt"]) or any(
        prior_close.get("businessDate") == close["businessDate"]
        for prior_close in current["closes"]
    ):
        raise TrialValidationError("daily close requires one unique business date.")
    expected_payment_exceptions = sorted(
        order["id"]
        for order in current["orders"]
        if order["refundStatus"] == "due"
        or (order["status"] != "cancelled" and order["paymentStatus"] == "pending")
    )
    expected_stock_exceptions = sorted(
        item["sku"]
        for item in current["items"]
        if item["onHand"] <= item["reorderAt"]
    )
    if close["paymentExceptionOrderIds"] != expected_payment_exceptions:
        raise TrialValidationError("daily close payment exceptions must match current orders.")
    if close["stockExceptionSkus"] != expected_stock_exceptions:
        raise TrialValidationError("daily close stock exceptions must match current inventory.")


def _validate_website_intake_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    current_intakes = _website_intakes(current)
    next_intakes = _website_intakes(next_state)
    if len(next_intakes) != len(current_intakes) + 1 or next_intakes[1:] != current_intakes:
        raise TrialValidationError("commerce.website_intake.created must prepend exactly one Website intake.")
    if next_intakes[0]["status"] != "pending_confirmation":
        raise TrialValidationError("a new Website intake must await human confirmation.")


def _validate_website_intake_converted(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _validate_new_order_and_reservation(
        current,
        next_state,
        event_type="commerce.website_intake.converted",
    )
    before, after = _one_changed(
        _website_intakes(current),
        _website_intakes(next_state),
        "websiteIntakes",
    )
    if before["status"] != "pending_confirmation" or after["status"] != "converted":
        raise TrialValidationError("only a pending Website intake can be converted.")
    if "conversion" not in after or _without(before, frozenset({"status"})) != _without(
        after,
        frozenset({"status", "conversion"}),
    ):
        raise TrialValidationError("Website intake conversion may change only status and conversion proof.")
    order = next_state["orders"][0]
    if order.get("sourceRecordId") != after["id"] or after["conversion"]["orderId"] != order["id"]:
        raise TrialValidationError("Website intake conversion must create its attributable order.")


_TRANSITION_VALIDATORS = {
    "commerce.item.created": _validate_item_created,
    "commerce.order.created": _validate_created,
    "commerce.order.advanced": _validate_advanced,
    "commerce.order.cancelled": _validate_cancelled,
    "commerce.payment.reconciled": _validate_reconciled,
    "commerce.refund.settled": _validate_refund_settled,
    "commerce.stock.received": _validate_received,
    "commerce.close.saved": _validate_close,
    "commerce.website_intake.created": _validate_website_intake_created,
    "commerce.website_intake.converted": _validate_website_intake_converted,
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
        if (
            not next_state["items"]
            or next_state["orders"]
            or next_state["movements"]
            or next_state["closes"]
            or _website_intakes(next_state)
        ):
            raise TrialValidationError("Commerce initialization requires a non-empty catalog and no operating history.")
        return next_state

    current_state = validate_commerce_state(current)
    _TRANSITION_VALIDATORS[event_type](current_state, next_state)
    _validate_event_evidence(event_type, current_state, next_state, evidence)
    return next_state


__all__ = [
    "COMMERCE_EVENTS",
    "COMMERCE_HUMAN_EVENTS",
    "COMMERCE_SCHEMA",
    "reduce_commerce_state",
    "validate_commerce_state",
]
