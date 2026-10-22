"""Validated native Shop sale outbox envelope and stable server acknowledgements."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
import unicodedata
from typing import Any, Mapping
from uuid import UUID


SHOP_SALE_SYNC_CONTRACT = "supermega.shop.sale_operation.v1"
SHOP_SALE_SYNC_SCHEMA_VERSION = 1
_PAYMENT_EVENTS = {
    "cash": "shop.cash_sale.completed.v1",
    "kbzpay": "shop.mobile_money_sale.completed.v1",
    "wavepay": "shop.mobile_money_sale.completed.v1",
}


class ShopSyncValidationError(ValueError):
    pass


class ShopSyncWrongWorkspace(ValueError):
    pass


class ShopSyncDeviceConflict(ValueError):
    pass


class ShopSyncDeviceNotBound(ValueError):
    pass


class ShopSyncOperationConflict(ValueError):
    pass


def _exact_object(value: object, fields: set[str], *, optional: set[str] = frozenset()) -> dict[str, Any]:
    if not isinstance(value, dict) or not fields <= value.keys() or set(value) - fields - optional:
        raise ShopSyncValidationError("Shop sale operation fields do not match the contract.")
    return value


def _text(value: object, maximum: int) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or len(value) > maximum
        or unicodedata.normalize("NFC", value) != value
        or any(
            ord(character) < 32 or ord(character) == 127
            or 0xD800 <= ord(character) <= 0xDFFF
            for character in value
        )
    ):
        raise ShopSyncValidationError("Shop sale operation contains invalid text.")
    return value


def _integer(value: object, maximum: int, *, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ShopSyncValidationError("Shop sale operation contains an invalid integer.")
    return value


def parse_device_binding(value: object, *, workspace_id: str) -> str:
    body = _exact_object(value, {"schemaVersion", "workspaceId", "deviceId", "confirmWorkspace"})
    if type(body["schemaVersion"]) is not int or body["schemaVersion"] != SHOP_SALE_SYNC_SCHEMA_VERSION:
        raise ShopSyncValidationError("Unsupported Shop sale sync schema version.")
    if body["workspaceId"] != workspace_id:
        raise ShopSyncWrongWorkspace("Shop sale workspace does not match the authenticated workspace.")
    if body["confirmWorkspace"] is not True:
        raise ShopSyncValidationError("Explicit workspace confirmation is required.")
    return _device_id(body["deviceId"])


def _device_id(value: object) -> str:
    candidate = _text(value, 36)
    try:
        parsed = str(UUID(candidate))
    except ValueError as exc:
        raise ShopSyncValidationError("Device ID must be a canonical UUID.") from exc
    if candidate != parsed:
        raise ShopSyncValidationError("Device ID must be a canonical UUID.")
    return parsed


@dataclass(frozen=True, slots=True)
class ShopSaleOperation:
    workspace_id: str
    device_id: str
    operation_id: str
    event_type: str
    sale_id: str
    payment_method: str
    total_mmk: int
    created_at_millis: int
    shift_id: str | None
    lines: tuple[dict[str, Any], ...]
    fingerprint: str


def parse_sale_operation(value: object, *, workspace_id: str) -> ShopSaleOperation:
    body = _exact_object(value, {"schemaVersion", "workspaceId", "deviceId", "operationId", "eventType", "payload"})
    if type(body["schemaVersion"]) is not int or body["schemaVersion"] != SHOP_SALE_SYNC_SCHEMA_VERSION:
        raise ShopSyncValidationError("Unsupported Shop sale sync schema version.")
    if body["workspaceId"] != workspace_id:
        raise ShopSyncWrongWorkspace("Shop sale workspace does not match the authenticated workspace.")
    device_id = _device_id(body["deviceId"])
    operation_id = _text(body["operationId"], 120)
    event_type = _text(body["eventType"], 64)
    payload = _exact_object(
        body["payload"],
        {"saleId", "totalMmk", "paymentMethod", "createdAtMillis", "lines"},
        optional={"shiftId"},
    )
    sale_id = _text(payload["saleId"], 120)
    if sale_id != operation_id:
        raise ShopSyncValidationError("Native sale ID must equal its outbox operation ID.")
    payment_method = _text(payload["paymentMethod"], 20)
    if _PAYMENT_EVENTS.get(payment_method) != event_type:
        raise ShopSyncValidationError("Sale event and payment method disagree.")
    total_mmk = _integer(payload["totalMmk"], 200_000_000_000_000)
    created_at_millis = _integer(payload["createdAtMillis"], 9_007_199_254_740_991, minimum=1)
    shift_id = _text(payload["shiftId"], 120) if "shiftId" in payload else None
    raw_lines = payload["lines"]
    if not isinstance(raw_lines, list) or not 1 <= len(raw_lines) <= 100:
        raise ShopSyncValidationError("A Shop sale must contain 1 to 100 lines.")
    lines: list[dict[str, Any]] = []
    seen_products: set[str] = set()
    calculated_total = 0
    for raw_line in raw_lines:
        line = _exact_object(
            raw_line,
            {"productId", "productName", "unitPriceMmk", "quantity", "lineTotalMmk"},
        )
        product_id = _text(line["productId"], 100)
        if product_id in seen_products:
            raise ShopSyncValidationError("A sale cannot repeat a product ID.")
        seen_products.add(product_id)
        name = _text(line["productName"], 160)
        price = _integer(line["unitPriceMmk"], 2_000_000_000)
        quantity = _integer(line["quantity"], 1000, minimum=1)
        line_total = _integer(line["lineTotalMmk"], 2_000_000_000_000)
        if price * quantity != line_total:
            raise ShopSyncValidationError("Sale line total does not match price and quantity.")
        calculated_total += line_total
        lines.append({
            "productId": product_id,
            "productName": name,
            "unitPriceMmk": price,
            "quantity": quantity,
            "lineTotalMmk": line_total,
        })
    if calculated_total != total_mmk:
        raise ShopSyncValidationError("Sale total does not match its lines.")
    lines.sort(key=lambda line: line["productId"])
    canonical = {
        "schemaVersion": SHOP_SALE_SYNC_SCHEMA_VERSION,
        "workspaceId": workspace_id,
        "deviceId": device_id,
        "operationId": operation_id,
        "eventType": event_type,
        "payload": {
            "saleId": sale_id,
            "paymentMethod": payment_method,
            "totalMmk": total_mmk,
            "createdAtMillis": created_at_millis,
            "shiftId": shift_id,
            "lines": lines,
        },
    }
    fingerprint = sha256(json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return ShopSaleOperation(
        workspace_id, device_id, operation_id, event_type, sale_id,
        payment_method, total_mmk, created_at_millis, shift_id, tuple(lines), fingerprint,
    )


def sale_acknowledgement(operation: ShopSaleOperation, *, server_revision: int, accepted_at: object, replay: bool) -> dict[str, Any]:
    if isinstance(accepted_at, datetime):
        accepted = accepted_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        accepted = str(accepted_at)
    return {
        "acknowledgement": {
            "contract": SHOP_SALE_SYNC_CONTRACT,
            "workspaceId": operation.workspace_id,
            "deviceId": operation.device_id,
            "operationId": operation.operation_id,
            "saleId": operation.sale_id,
            "serverRevision": server_revision,
            "acceptedAt": accepted,
        },
        "idempotentReplay": replay,
    }
