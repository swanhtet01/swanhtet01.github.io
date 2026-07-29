"""Fail-closed Commerce state and lifecycle validation for managed workspaces."""

from __future__ import annotations

import re
from hashlib import sha256
import json
from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import quote

from supermega_runtime.client_import_runtime import (
    ClientImportValidationError,
    validate_client_import_staging_package,
)
from supermega_runtime.ecommerce_buying_lifecycle import (
    EcommerceLifecycleValidationError,
    validate_ecommerce_order_request,
)
from supermega_runtime.shop_inventory_runtime import (
    ShopInventoryValidationError,
    shop_inventory_available_balances,
    shop_inventory_balances,
    shop_inventory_sku_available_to_promise,
    shop_inventory_sku_totals,
    validate_shop_inventory_state,
)
from supermega_runtime.trial_store import TrialValidationError


COMMERCE_SCHEMA = "supermega.commerce.workspace.v2"
COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA = "supermega.commerce.daily-close-export.v3"
COMMERCE_ACCOUNTING_HANDOFF_SCHEMA = "supermega.commerce.accounting-handoff.v2"
COMMERCE_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.item.updated",
        "commerce.tax_configuration.saved",
        "commerce.account_mapping.saved",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.order.return_recorded",
        "commerce.order.correction_recorded",
        "commerce.payment.reconciled",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_batch.received",
        "commerce.inventory.initialized",
        "commerce.inventory.transferred",
        "commerce.purchase_order.created",
        "commerce.purchase_order.received",
        "commerce.purchase_order.cancelled",
        "commerce.close.saved",
        "commerce.website_intake.created",
        "commerce.website_intake.converted",
        "commerce.storefront.configuration.saved",
        "commerce.storefront.merchandising.imported",
        "commerce.storefront_request.received",
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
    }
)
COMMERCE_HUMAN_EVENTS = frozenset(
    {
        "commerce.workspace.initialized",
        "commerce.item.created",
        "commerce.item.updated",
        "commerce.tax_configuration.saved",
        "commerce.account_mapping.saved",
        "commerce.order.created",
        "commerce.order.advanced",
        "commerce.order.cancelled",
        "commerce.order.return_recorded",
        "commerce.order.correction_recorded",
        "commerce.payment.reconciled",
        "commerce.refund.settled",
        "commerce.stock.received",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_batch.received",
        "commerce.inventory.initialized",
        "commerce.inventory.transferred",
        "commerce.purchase_order.created",
        "commerce.purchase_order.received",
        "commerce.purchase_order.cancelled",
        "commerce.close.saved",
        "commerce.website_intake.converted",
        "commerce.storefront.configuration.saved",
        "commerce.storefront.merchandising.imported",
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
    }
)
_ORDER_STATUSES = ("confirmed", "preparing", "ready", "completed", "cancelled")
_NEXT_ORDER_STATUS = {"confirmed": "preparing", "preparing": "ready", "ready": "completed"}
_PAYMENT_STATUSES = ("pending", "reconciled")
_REFUND_STATUSES = ("none", "due", "settled")
_MOVEMENT_KINDS = (
    "opening",
    "reserve",
    "release",
    "receipt",
    "count",
    "return",
    "production_issue",
    "production_receipt",
)
_PRODUCTION_MATERIAL_UNITS = frozenset(
    {"kg", "g", "l", "ml", "pcs", "pack", "bag", "roll", "sheet", "m", "cm"}
)
_RETURN_DISPOSITIONS = ("restock", "not_restocked")
_CORRECTION_KINDS = ("credit", "debit")
_CORRECTION_REASON_CODES = ("pricing_error", "service_recovery", "fee_adjustment", "other")
_WEBSITE_INTAKE_STATUSES = ("pending_confirmation", "converted")
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_WEBSITE_FINGERPRINT_PATTERN = re.compile(r"web-[a-f0-9]{8}")
_WEBSITE_INTAKE_ID_PATTERN = re.compile(r"WINT-[A-Z0-9-]{8,80}")
_STOREFRONT_REQUEST_ID_PATTERN = re.compile(
    r"ECR-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_STOREFRONT_IDEMPOTENCY_PATTERN = re.compile(
    r"ECI-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_SHA256_DIGEST_PATTERN = re.compile(r"sha256:[a-f0-9]{64}")
_COMMAND_ID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)
_STOREFRONT_PREVIEW_SCHEMA = "supermega.ecommerce.storefront_preview.v1"
_MAX_STOREFRONT_REQUESTS = 100
_MAX_PURCHASE_ORDERS = 100
_MAX_CATALOG_BASELINES = 500
_MAX_CATALOG_CHANGES = 500
_MAX_TAX_CONFIGURATIONS = 100
_MAX_ACCOUNT_MAPPING_CONFIGURATIONS = 100
_MAX_ORDER_LINES = 20
_MAX_RETURNS_PER_ORDER = 100
_MAX_CORRECTIONS_PER_ORDER = 100
_MAX_MOVEMENT_ID_LENGTH = 2_000
_SERVICE_SCHEDULE_SCHEMA = "supermega.shop.service_schedule.v2"
_SERVICE_SCHEDULE_PACKS = frozenset({"retail", "cafe", "restaurant", "spa", "gym", "school"})
_SERVICE_SCHEDULE_EVENT_TYPES = frozenset(
    {"service_registered", "resource_registered", "booking_scheduled", "booking_advanced", "booking_cancelled"}
)
_SERVICE_SCHEDULE_BOOKING_STATUSES = frozenset(
    {"held", "confirmed", "checked_in", "completed", "cancelled"}
)
_PURCHASE_ORDER_ID_PATTERN = re.compile(
    r"PO-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
)
_TAX_CODE_PATTERN = re.compile(r"[A-Z0-9][A-Z0-9_-]{0,11}")
_TAX_JURISDICTION_CODE_PATTERN = re.compile(r"[A-Z0-9][A-Z0-9_-]{1,15}")
_EXTERNAL_ACCOUNT_CODE_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,39}")
_ACCOUNT_ROLES = (
    "payment_clearing",
    "sales_revenue",
    "sales_revenue_unverified",
    "tax_payable",
)
_ISO_TIMESTAMP_PATTERN = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])"
)

_STATE_FIELDS = frozenset({"schema", "items", "orders", "movements", "closes"})
_SERVICE_SCHEDULE_FIELDS = frozenset(
    {"schema", "industryPackId", "revision", "services", "resources", "bookings", "events"}
)
_ITEM_FIELDS = frozenset({"sku", "name", "variant", "onHand", "reorderAt", "price"})
_CATALOG_CHANGE_FIELDS = frozenset(
    {
        "sku",
        "previousPrice",
        "nextPrice",
        "previousReorderAt",
        "nextReorderAt",
        "proof",
    }
)
_CATALOG_BASELINE_FIELDS = frozenset(
    {"sku", "price", "reorderAt", "proof", "anchorDigest"}
)
_TAX_CONFIGURATION_FIELDS = frozenset(
    {"revision", "code", "label", "rateBasisPoints", "mode", "proof"}
)
_TAX_CONFIGURATION_SCHEDULE_FIELDS = frozenset({"jurisdictionCode", "effectiveFrom"})
_ACCOUNT_MAPPING_CONFIGURATION_FIELDS = frozenset({"revision", "mappings", "proof"})
_ACCOUNT_MAPPING_FIELDS = frozenset({"accountRole", "externalAccountCode"})
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
        "fulfilmentReference",
        "promisedAt",
        "owner",
        "sourceRecordId",
        "evidenceReference",
        "lines",
        "advancementActionIds",
        "completion",
        "returns",
        "corrections",
        "calculation",
    }
)
_ORDER_LINE_REQUIRED_FIELDS = frozenset({"sku", "name", "quantity", "unitPriceMmk"})
_ORDER_LINE_OPTIONAL_FIELDS = frozenset({"variant"})
_ORDER_CALCULATION_SCHEMA = "supermega.commerce.order-calculation.v1"
_ORDER_CALCULATION_V2_SCHEMA = "supermega.commerce.order-calculation.v2"
_ORDER_CALCULATION_FIELDS = frozenset(
    {
        "schema",
        "currency",
        "catalogRevision",
        "subtotalMmk",
        "taxMode",
        "taxMmk",
        "totalMmk",
    }
)
_ORDER_CALCULATION_V2_FIELDS = frozenset(
    {
        "schema",
        "currency",
        "catalogRevision",
        "taxConfigurationRevision",
        "taxCode",
        "taxRateBasisPoints",
        "taxMode",
        "listedSubtotalMmk",
        "subtotalMmk",
        "taxMmk",
        "totalMmk",
    }
)
_ORDER_CALCULATION_V2_SCHEDULE_FIELDS = frozenset(
    {"taxJurisdictionCode", "taxEffectiveFrom"}
)
_ORDER_RETURN_FIELDS = frozenset(
    {
        "actionId",
        "createdAt",
        "actor",
        "reason",
        "evidenceReference",
        "sku",
        "quantity",
        "disposition",
    }
)
_ORDER_CORRECTION_FIELDS = frozenset(
    {
        "documentId",
        "actionId",
        "createdAt",
        "actor",
        "reason",
        "evidenceReference",
        "kind",
        "reasonCode",
        "sourceCalculationDigest",
        "calculation",
        "balanceAfterMmk",
        "financialStatus",
        "postingAuthority",
        "externalPostingPerformed",
    }
)
_CORRECTION_CALCULATION_FIELDS = frozenset(
    {
        "currency",
        "taxConfigurationRevision",
        "taxCode",
        "taxRateBasisPoints",
        "taxMode",
        "listedAmountMmk",
        "subtotalMmk",
        "taxMmk",
        "totalMmk",
    }
)
_CORRECTION_CALCULATION_SCHEDULE_FIELDS = frozenset(
    {"taxJurisdictionCode", "taxEffectiveFrom"}
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
    {
        "id",
        "actionId",
        "createdAt",
        "actor",
        "reason",
        "evidenceReference",
        "kind",
        "sku",
        "quantityDelta",
        "orderId",
        "purchaseOrderId",
        "expectedQuantity",
        "countedQuantity",
        "productionRequestId",
        "productionCommandDigest",
        "productionJobId",
        "productionMaterialId",
        "productionInputLotId",
        "productionQuantityMilli",
        "productionUnit",
        "conversionNote",
        "productionReleaseId",
        "productionOutputBatchId",
        "productionReleasedAt",
    }
)
_PRODUCTION_ISSUE_FIELDS = frozenset(
    {
        "productionRequestId",
        "productionCommandDigest",
        "productionJobId",
        "productionMaterialId",
        "productionInputLotId",
        "productionQuantityMilli",
        "productionUnit",
        "conversionNote",
    }
)
_PURCHASE_ORDER_REQUIRED_FIELDS = frozenset(
    {"id", "createdAt", "supplier", "sku", "quantityOrdered", "creation"}
)
_PURCHASE_ORDER_OPTIONAL_FIELDS = frozenset({"expectedAt", "cancellation"})
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
_BUSINESS_DATE_PATTERN = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
_EVIDENCE_FIELDS = frozenset({"actionId", "capturedAt", "actor", "reason", "evidenceReference"})
_WEBSITE_SOURCE_FIELDS = frozenset({"fingerprint", "approvalId", "snapshotId", "pageId", "siteName", "pagePath"})
_WEBSITE_INTAKE_REQUIRED_FIELDS = frozenset(
    {"id", "createdAt", "status", "source", "sku", "quantity", "itemName", "unitPrice", "total", "creation"}
)
_WEBSITE_INTAKE_OPTIONAL_FIELDS = frozenset(
    {"itemVariant", "snapshotDigest", "conversion"}
)
_WEBSITE_CONVERSION_FIELDS = _EVIDENCE_FIELDS | {"orderId"}
_STOREFRONT_REQUEST_FIELDS = frozenset(
    {
        "schema",
        "mode",
        "state",
        "id",
        "idempotencyKey",
        "createdAt",
        "sourcePreviewDigest",
        "customerReference",
        "fulfilment",
        "currency",
        "line",
        "totalMmk",
    }
)
_STOREFRONT_REQUEST_PROVENANCE_FIELDS = frozenset(
    {"sourceStorefrontRevision", "sourceStorefrontActionId"}
)
_STOREFRONT_REQUEST_LINE_FIELDS = frozenset(
    {"sku", "name", "variant", "quantity", "unitPriceMmk"}
)
_STOREFRONT_CONFIGURATION_FIELDS = frozenset(
    {
        "schema",
        "revision",
        "shopCatalogSnapshotRevision",
        "shopCatalogDigest",
        "storeName",
        "summary",
        "selectedSkus",
        "saved",
    }
)
_STOREFRONT_CONFIGURATION_OPTIONAL_FIELDS = frozenset({"activation", "merchandising"})
_STOREFRONT_MERCHANDISING_FIELDS = frozenset(
    {"sku", "featured", "collection", "displayName", "note"}
)
_PRODUCTION_RECEIPT_FIELDS = frozenset(
    {
        "productionReleaseId",
        "productionCommandDigest",
        "productionJobId",
        "productionOutputBatchId",
        "productionReleasedAt",
    }
)
_PRODUCTION_ISSUE_EXCLUSIVE_FIELDS = frozenset(
    {
        "productionRequestId",
        "productionMaterialId",
        "productionInputLotId",
        "productionQuantityMilli",
        "productionUnit",
        "conversionNote",
    }
)
_PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS = frozenset(
    {"productionReleaseId", "productionOutputBatchId", "productionReleasedAt"}
)
_STOREFRONT_ACTIVATION_FIELDS = frozenset(
    {"contract", "packageDigest", "workflowTemplateId", "confirmedAt", "skus"}
)
_ECOMMERCE_TEMPLATE_IDS = frozenset(
    {"social-storefront", "pickup-preorder", "wholesale-request"}
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
    if not isinstance(value, str) or not value.strip() or value != value.strip() or len(value) > maximum:
        raise TrialValidationError(f"{field} must be canonical non-empty text of at most {maximum} characters.")
    return value


def _blankable_text(value: object, field: str, *, maximum: int) -> str:
    if not isinstance(value, str) or value != value.strip() or len(value) > maximum:
        raise TrialValidationError(
            f"{field} must be canonical text of at most {maximum} characters or empty."
        )
    return value


def _timestamp(value: object, field: str) -> str:
    timestamp = _text(value, field, maximum=40)
    if _ISO_TIMESTAMP_PATTERN.fullmatch(timestamp) is None:
        raise TrialValidationError(
            f"{field} must be an ISO-8601 timestamp with seconds, timezone, and at most microsecond precision."
        )
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


def _order_item_summary(lines: Sequence[Mapping[str, Any]]) -> str:
    return str(lines[0]["name"]) if len(lines) == 1 else f"{len(lines)} items"


def _reservation_lines(order: Mapping[str, Any]) -> list[dict[str, Any]]:
    if "lines" in order:
        return [
            {"sku": line["sku"], "quantity": line["quantity"]}
            for line in order["lines"]
        ]
    item_sku = order.get("itemSku")
    return [{"sku": item_sku, "quantity": order["quantity"]}] if item_sku else []


def _movement_id(action_id: str, suffix: str | None = None) -> str:
    encoded_action_id = quote(action_id, safe="-_.!~*'()")
    return f"MOV2:{encoded_action_id}{f':{suffix}' if suffix else ''}"


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


def _storefront_request(value: object, field: str) -> dict[str, Any]:
    request = _object(value, field)
    if request.get("schema") == "supermega.ecommerce.order_request.v2":
        try:
            return validate_ecommerce_order_request(request)
        except EcommerceLifecycleValidationError as exc:
            raise TrialValidationError(f"{field} is invalid: {exc}") from exc
    _exact_fields(
        request,
        field,
        required=_STOREFRONT_REQUEST_FIELDS,
        optional=_STOREFRONT_REQUEST_PROVENANCE_FIELDS,
    )
    if request["schema"] != "supermega.ecommerce.order_request.v1":
        raise TrialValidationError(f"{field}.schema is invalid.")
    if request["mode"] != "browser-local-request" or request["state"] != "pending_shop_review":
        raise TrialValidationError(f"{field} must retain its pending browser receipt boundary.")
    request_id = _text(request["id"], f"{field}.id", maximum=40)
    idempotency_key = _text(request["idempotencyKey"], f"{field}.idempotencyKey", maximum=40)
    if (
        _STOREFRONT_REQUEST_ID_PATTERN.fullmatch(request_id) is None
        or _STOREFRONT_IDEMPOTENCY_PATTERN.fullmatch(idempotency_key) is None
        or request_id[4:] != idempotency_key[4:]
    ):
        raise TrialValidationError(f"{field} request identity is invalid.")
    _timestamp(request["createdAt"], f"{field}.createdAt")
    digest = _text(request["sourcePreviewDigest"], f"{field}.sourcePreviewDigest", maximum=71)
    if _SHA256_DIGEST_PATTERN.fullmatch(digest) is None:
        raise TrialValidationError(f"{field}.sourcePreviewDigest is invalid.")
    source_revision = request.get("sourceStorefrontRevision")
    source_action_id = request.get("sourceStorefrontActionId")
    if (
        ("sourceStorefrontRevision" in request)
        != ("sourceStorefrontActionId" in request)
        or (source_revision is None) != (source_action_id is None)
    ):
        raise TrialValidationError(f"{field} storefront provenance is incomplete.")
    if source_revision is not None:
        _integer(source_revision, f"{field}.sourceStorefrontRevision", minimum=1)
        _text(source_action_id, f"{field}.sourceStorefrontActionId", maximum=160)
    _text(request["customerReference"], f"{field}.customerReference", maximum=80)
    if request["fulfilment"] not in ("pickup", "delivery") or request["currency"] != "MMK":
        raise TrialValidationError(f"{field} fulfilment or currency is invalid.")
    line = _object(request["line"], f"{field}.line")
    _exact_fields(line, f"{field}.line", required=_STOREFRONT_REQUEST_LINE_FIELDS)
    _text(line["sku"], f"{field}.line.sku", maximum=80)
    _text(line["name"], f"{field}.line.name")
    if line["variant"] is not None:
        _text(line["variant"], f"{field}.line.variant")
    quantity = _integer(line["quantity"], f"{field}.line.quantity", minimum=1)
    if quantity > 99:
        raise TrialValidationError(f"{field}.line.quantity must be at most 99.")
    unit_price = _integer(line["unitPriceMmk"], f"{field}.line.unitPriceMmk", minimum=1)
    total = _integer(request["totalMmk"], f"{field}.totalMmk", minimum=1)
    if total != quantity * unit_price:
        raise TrialValidationError(f"{field}.totalMmk must equal quantity times unit price.")
    return request


def _validate_service_schedule(value: object) -> dict[str, Any]:
    schedule = _object(value, "commerce state.serviceSchedule")
    _exact_fields(
        schedule,
        "commerce state.serviceSchedule",
        required=_SERVICE_SCHEDULE_FIELDS,
    )
    if schedule.get("schema") != _SERVICE_SCHEDULE_SCHEMA:
        raise TrialValidationError(
            f"commerce state.serviceSchedule.schema must be {_SERVICE_SCHEDULE_SCHEMA}."
        )
    if schedule.get("industryPackId") not in _SERVICE_SCHEDULE_PACKS:
        raise TrialValidationError("commerce state.serviceSchedule industry pack is unsupported.")
    revision = _integer(
        schedule.get("revision"),
        "commerce state.serviceSchedule.revision",
    )
    services = _list(schedule.get("services"), "commerce state.serviceSchedule.services")
    resources = _list(schedule.get("resources"), "commerce state.serviceSchedule.resources")
    bookings = _list(schedule.get("bookings"), "commerce state.serviceSchedule.bookings")
    events = _list(schedule.get("events"), "commerce state.serviceSchedule.events")
    if len(services) > 100 or len(resources) > 100 or len(bookings) > 500 or len(events) > 1000:
        raise TrialValidationError("commerce state.serviceSchedule exceeds managed workspace limits.")

    service_ids: list[str] = []
    for index, candidate in enumerate(services):
        field = f"commerce state.serviceSchedule.services[{index}]"
        service = _object(candidate, field)
        _exact_fields(
            service,
            field,
            required=frozenset({"id", "name", "durationMinutes", "priceMmk", "active"}),
        )
        service_ids.append(_text(service.get("id"), f"{field}.id", maximum=80))
        _text(service.get("name"), f"{field}.name", maximum=160)
        duration = _integer(service.get("durationMinutes"), f"{field}.durationMinutes", minimum=1)
        _integer(service.get("priceMmk"), f"{field}.priceMmk", minimum=1)
        if duration > 1440 or not isinstance(service.get("active"), bool):
            raise TrialValidationError(f"{field} duration or active state is invalid.")
    _unique(service_ids, "commerce state.serviceSchedule service ID")
    service_by_id = {service["id"]: service for service in services}

    resource_ids: list[str] = []
    for index, candidate in enumerate(resources):
        field = f"commerce state.serviceSchedule.resources[{index}]"
        resource = _object(candidate, field)
        _exact_fields(
            resource,
            field,
            required=frozenset({"id", "name", "kind", "active"}),
        )
        resource_ids.append(_text(resource.get("id"), f"{field}.id", maximum=80))
        _text(resource.get("name"), f"{field}.name", maximum=160)
        if resource.get("kind") not in {"staff", "room", "equipment"} or not isinstance(
            resource.get("active"), bool
        ):
            raise TrialValidationError(f"{field} kind or active state is invalid.")
    _unique(resource_ids, "commerce state.serviceSchedule resource ID")

    booking_ids: list[str] = []
    normalized_bookings: list[dict[str, Any]] = []
    for index, candidate in enumerate(bookings):
        field = f"commerce state.serviceSchedule.bookings[{index}]"
        booking = _object(candidate, field)
        _exact_fields(
            booking,
            field,
            required=frozenset(
                {
                    "id", "customerName", "contact", "serviceId", "resourceId", "startsAt",
                    "endsAt", "status", "note", "createdAt", "updatedAt",
                }
            ),
        )
        booking_id = _text(booking.get("id"), f"{field}.id", maximum=80)
        booking_ids.append(booking_id)
        _text(booking.get("customerName"), f"{field}.customerName", maximum=160)
        _text(booking.get("contact"), f"{field}.contact", maximum=160)
        if booking.get("serviceId") not in service_ids or booking.get("resourceId") not in resource_ids:
            raise TrialValidationError(f"{field} references an unknown service or resource.")
        starts_at = _timestamp(booking.get("startsAt"), f"{field}.startsAt")
        ends_at = _timestamp(booking.get("endsAt"), f"{field}.endsAt")
        if datetime.fromisoformat(ends_at.replace("Z", "+00:00")) <= datetime.fromisoformat(
            starts_at.replace("Z", "+00:00")
        ):
            raise TrialValidationError(f"{field} must end after it starts.")
        expected_end = datetime.fromisoformat(starts_at.replace("Z", "+00:00")) + timedelta(
            minutes=service_by_id[booking["serviceId"]]["durationMinutes"]
        )
        if datetime.fromisoformat(ends_at.replace("Z", "+00:00")) != expected_end:
            raise TrialValidationError(f"{field} duration must match its service.")
        if booking.get("status") not in _SERVICE_SCHEDULE_BOOKING_STATUSES:
            raise TrialValidationError(f"{field}.status is invalid.")
        _blankable_text(booking.get("note"), f"{field}.note", maximum=300)
        _timestamp(booking.get("createdAt"), f"{field}.createdAt")
        _timestamp(booking.get("updatedAt"), f"{field}.updatedAt")
        normalized_bookings.append(booking)
    _unique(booking_ids, "commerce state.serviceSchedule booking ID")
    blocking = [booking for booking in normalized_bookings if booking["status"] != "cancelled"]
    for left, first in enumerate(blocking):
        for second in blocking[left + 1 :]:
            if (
                first["resourceId"] == second["resourceId"]
                and datetime.fromisoformat(first["startsAt"].replace("Z", "+00:00"))
                < datetime.fromisoformat(second["endsAt"].replace("Z", "+00:00"))
                and datetime.fromisoformat(second["startsAt"].replace("Z", "+00:00"))
                < datetime.fromisoformat(first["endsAt"].replace("Z", "+00:00"))
            ):
                raise TrialValidationError("commerce state.serviceSchedule contains overlapping bookings.")

    if len(events) != revision:
        raise TrialValidationError("commerce state.serviceSchedule evidence is incomplete.")
    for index, candidate in enumerate(events):
        field = f"commerce state.serviceSchedule.events[{index}]"
        event = _object(candidate, field)
        _exact_fields(
            event,
            field,
            required=frozenset({"revision", "type", "subjectId", "actor", "reason", "happenedAt"}),
        )
        if event.get("revision") != index + 1 or event.get("type") not in _SERVICE_SCHEDULE_EVENT_TYPES:
            raise TrialValidationError(f"{field} revision or type is invalid.")
        subject_id = _text(event.get("subjectId"), f"{field}.subjectId", maximum=80)
        if (
            (event["type"] == "service_registered" and subject_id not in service_ids)
            or (event["type"] == "resource_registered" and subject_id not in resource_ids)
            or (event["type"].startswith("booking_") and subject_id not in booking_ids)
        ):
            raise TrialValidationError(f"{field} references an unknown subject.")
        _text(event.get("actor"), f"{field}.actor", maximum=120)
        _text(event.get("reason"), f"{field}.reason", maximum=240)
        _timestamp(event.get("happenedAt"), f"{field}.happenedAt")
    return schedule


def validate_commerce_state(value: object) -> dict[str, Any]:
    """Validate the complete managed Commerce snapshot without repairing it."""

    state = _object(value, "commerce state")
    _exact_fields(
        state,
        "commerce state",
        required=_STATE_FIELDS,
        optional=frozenset(
            {
                "websiteIntakes",
                "storefrontRequests",
                "storefrontConfiguration",
                "purchaseOrders",
                "catalogBaselines",
                "catalogChanges",
                "taxConfigurations",
                "accountMappingConfigurations",
                "inventoryFoundation",
                "serviceSchedule",
            }
        ),
    )
    if state.get("schema") != COMMERCE_SCHEMA:
        raise TrialValidationError(f"commerce state schema must be {COMMERCE_SCHEMA}.")

    items = _list(state["items"], "commerce state.items")
    orders = _list(state["orders"], "commerce state.orders")
    movements = _list(state["movements"], "commerce state.movements")
    closes = _list(state["closes"], "commerce state.closes")
    website_intakes = _list(state.get("websiteIntakes", []), "commerce state.websiteIntakes")
    storefront_requests = _list(
        state.get("storefrontRequests", []),
        "commerce state.storefrontRequests",
    )
    purchase_orders = _list(
        state.get("purchaseOrders", []),
        "commerce state.purchaseOrders",
    )
    catalog_baselines = _list(
        state.get("catalogBaselines", []),
        "commerce state.catalogBaselines",
    )
    catalog_changes = _list(
        state.get("catalogChanges", []),
        "commerce state.catalogChanges",
    )
    tax_configurations = _list(
        state.get("taxConfigurations", []),
        "commerce state.taxConfigurations",
    )
    account_mapping_configurations = _list(
        state.get("accountMappingConfigurations", []),
        "commerce state.accountMappingConfigurations",
    )
    if "serviceSchedule" in state:
        _validate_service_schedule(state["serviceSchedule"])
    if "storefrontConfiguration" in state and state["storefrontConfiguration"] is None:
        raise TrialValidationError(
            "commerce state.storefrontConfiguration must be an object when present."
        )
    storefront_configuration = state.get("storefrontConfiguration")
    if len(storefront_requests) > _MAX_STOREFRONT_REQUESTS:
        raise TrialValidationError(
            f"commerce state.storefrontRequests cannot exceed {_MAX_STOREFRONT_REQUESTS}."
        )
    if len(purchase_orders) > _MAX_PURCHASE_ORDERS:
        raise TrialValidationError(
            f"commerce state.purchaseOrders cannot exceed {_MAX_PURCHASE_ORDERS}."
        )
    if len(catalog_baselines) > _MAX_CATALOG_BASELINES:
        raise TrialValidationError(
            f"commerce state.catalogBaselines cannot exceed {_MAX_CATALOG_BASELINES}."
        )
    if len(catalog_changes) > _MAX_CATALOG_CHANGES:
        raise TrialValidationError(
            f"commerce state.catalogChanges cannot exceed {_MAX_CATALOG_CHANGES}."
        )
    if len(tax_configurations) > _MAX_TAX_CONFIGURATIONS:
        raise TrialValidationError(
            f"commerce state.taxConfigurations cannot exceed {_MAX_TAX_CONFIGURATIONS}."
        )
    if len(account_mapping_configurations) > _MAX_ACCOUNT_MAPPING_CONFIGURATIONS:
        raise TrialValidationError(
            "commerce state.accountMappingConfigurations cannot exceed "
            f"{_MAX_ACCOUNT_MAPPING_CONFIGURATIONS}."
        )

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
    if "inventoryFoundation" in state:
        try:
            validate_shop_inventory_state(state["inventoryFoundation"], item_skus)
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(
                f"commerce state.inventoryFoundation is invalid: {exc}"
            ) from exc

    catalog_baseline_skus: list[str] = []
    catalog_baseline_action_ids: list[str] = []
    catalog_baseline_by_sku: dict[str, dict[str, Any]] = {}
    catalog_baseline_proof_by_action: dict[str, dict[str, str]] = {}
    for index, candidate in enumerate(catalog_baselines):
        field = f"catalogBaselines[{index}]"
        baseline = _object(candidate, field)
        _exact_fields(baseline, field, required=_CATALOG_BASELINE_FIELDS)
        sku = _text(baseline["sku"], f"{field}.sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"{field}.sku is unknown.")
        _integer(baseline["price"], f"{field}.price", minimum=1)
        _integer(baseline["reorderAt"], f"{field}.reorderAt")
        proof = _action_proof(baseline["proof"], f"{field}.proof")
        anchor_digest = _text(
            baseline["anchorDigest"],
            f"{field}.anchorDigest",
            maximum=71,
        )
        if (
            _SHA256_DIGEST_PATTERN.fullmatch(anchor_digest) is None
            or anchor_digest != commerce_catalog_baseline_digest(baseline)
        ):
            raise TrialValidationError(f"{field}.anchorDigest is invalid.")
        prior_proof = catalog_baseline_proof_by_action.get(proof["actionId"])
        if prior_proof is not None and prior_proof != proof:
            raise TrialValidationError(
                f"{field}.proof conflicts with its shared catalog command."
            )
        catalog_baseline_skus.append(sku)
        catalog_baseline_action_ids.append(proof["actionId"])
        catalog_baseline_by_sku[sku] = baseline
        catalog_baseline_proof_by_action[proof["actionId"]] = proof
    _unique(catalog_baseline_skus, "Catalog baseline SKU")

    catalog_change_action_ids: list[str] = []
    newest_change_by_sku: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(catalog_changes):
        field = f"catalogChanges[{index}]"
        change = _object(candidate, field)
        _exact_fields(change, field, required=_CATALOG_CHANGE_FIELDS)
        sku = _text(change["sku"], f"{field}.sku", maximum=80)
        item = item_by_sku.get(sku)
        if item is None:
            raise TrialValidationError(f"{field}.sku is unknown.")
        previous_price = _integer(
            change["previousPrice"],
            f"{field}.previousPrice",
            minimum=1,
        )
        next_price = _integer(
            change["nextPrice"],
            f"{field}.nextPrice",
            minimum=1,
        )
        previous_reorder_at = _integer(
            change["previousReorderAt"],
            f"{field}.previousReorderAt",
        )
        next_reorder_at = _integer(
            change["nextReorderAt"],
            f"{field}.nextReorderAt",
        )
        if (
            previous_price == next_price
            and previous_reorder_at == next_reorder_at
        ):
            raise TrialValidationError(
                f"{field} must change price or reorder point."
            )
        proof = _action_proof(change["proof"], f"{field}.proof")
        newer_change = newest_change_by_sku.get(sku)
        if newer_change is None:
            if (
                item["price"] != next_price
                or item["reorderAt"] != next_reorder_at
            ):
                raise TrialValidationError(
                    f"{field} newest values must match the current catalog item."
                )
        else:
            if (
                newer_change["previousPrice"] != next_price
                or newer_change["previousReorderAt"] != next_reorder_at
            ):
                raise TrialValidationError(
                    f"{field} does not continue the newest-first catalog change chain."
                )
            newer_captured_at = datetime.fromisoformat(
                str(newer_change["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(
                proof["capturedAt"].replace("Z", "+00:00")
            )
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} catalog changes must be newest first per SKU."
                )
        newest_change_by_sku[sku] = change
        catalog_change_action_ids.append(proof["actionId"])
    _unique(catalog_change_action_ids, "Catalog change action ID")
    for sku, oldest_change in newest_change_by_sku.items():
        baseline = catalog_baseline_by_sku.get(sku)
        if baseline is None:
            raise TrialValidationError(
                f"Catalog change history for {sku} has no anchored baseline."
            )
        if (
            baseline["price"] != oldest_change["previousPrice"]
            or baseline["reorderAt"] != oldest_change["previousReorderAt"]
            or datetime.fromisoformat(
                str(baseline["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            > datetime.fromisoformat(
                str(oldest_change["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
        ):
            raise TrialValidationError(
                f"Catalog change history for {sku} does not start from its anchored baseline."
            )
    for sku, baseline in catalog_baseline_by_sku.items():
        if sku in newest_change_by_sku:
            continue
        item = item_by_sku[sku]
        if item["price"] != baseline["price"] or item["reorderAt"] != baseline["reorderAt"]:
            raise TrialValidationError(
                f"Catalog baseline for {sku} does not match the unchanged catalog item."
            )

    tax_configuration_action_ids: list[str] = []
    newer_tax_configuration: dict[str, Any] | None = None
    for index, candidate in enumerate(tax_configurations):
        field = f"taxConfigurations[{index}]"
        configuration = _object(candidate, field)
        _exact_fields(
            configuration,
            field,
            required=_TAX_CONFIGURATION_FIELDS,
            optional=_TAX_CONFIGURATION_SCHEDULE_FIELDS,
        )
        revision = _integer(configuration["revision"], f"{field}.revision", minimum=1)
        if revision != len(tax_configurations) - index:
            raise TrialValidationError(
                f"{field}.revision breaks the newest-first sequence."
            )
        code = _text(configuration["code"], f"{field}.code", maximum=12)
        if _TAX_CODE_PATTERN.fullmatch(code) is None:
            raise TrialValidationError(f"{field}.code is invalid.")
        _text(configuration["label"], f"{field}.label", maximum=80)
        rate_basis_points = _integer(
            configuration["rateBasisPoints"],
            f"{field}.rateBasisPoints",
        )
        if rate_basis_points > 10_000:
            raise TrialValidationError(
                f"{field}.rateBasisPoints must be at most 10000."
            )
        if configuration["mode"] not in {"exclusive", "inclusive"}:
            raise TrialValidationError(f"{field}.mode is invalid.")
        proof = _action_proof(configuration["proof"], f"{field}.proof")
        schedule_fields = _TAX_CONFIGURATION_SCHEDULE_FIELDS.intersection(configuration)
        if schedule_fields and schedule_fields != _TAX_CONFIGURATION_SCHEDULE_FIELDS:
            raise TrialValidationError(
                f"{field} must include jurisdictionCode and effectiveFrom together."
            )
        effective_at = datetime.fromisoformat(
            proof["capturedAt"].replace("Z", "+00:00")
        )
        if schedule_fields:
            jurisdiction_code = _text(
                configuration["jurisdictionCode"],
                f"{field}.jurisdictionCode",
                maximum=16,
            )
            if _TAX_JURISDICTION_CODE_PATTERN.fullmatch(jurisdiction_code) is None:
                raise TrialValidationError(f"{field}.jurisdictionCode is invalid.")
            effective_at = datetime.fromisoformat(
                _timestamp(
                    configuration["effectiveFrom"],
                    f"{field}.effectiveFrom",
                ).replace("Z", "+00:00")
            )
            if effective_at < datetime.fromisoformat(
                proof["capturedAt"].replace("Z", "+00:00")
            ):
                raise TrialValidationError(
                    f"{field}.effectiveFrom must be at or after its review proof."
                )
        if newer_tax_configuration is not None:
            newer_captured_at = datetime.fromisoformat(
                str(newer_tax_configuration["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(
                proof["capturedAt"].replace("Z", "+00:00")
            )
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} tax configurations must be newest first."
                )
            newer_effective_at = datetime.fromisoformat(
                str(
                    newer_tax_configuration.get(
                        "effectiveFrom",
                        newer_tax_configuration["proof"]["capturedAt"],
                    )
                ).replace("Z", "+00:00")
            )
            if effective_at > newer_effective_at:
                raise TrialValidationError(
                    f"{field} tax configurations must be newest first by effective time."
                )
        newer_tax_configuration = configuration
        tax_configuration_action_ids.append(proof["actionId"])

    account_mapping_configuration_action_ids: list[str] = []
    newer_account_mapping_configuration: dict[str, Any] | None = None
    for index, candidate in enumerate(account_mapping_configurations):
        field = f"accountMappingConfigurations[{index}]"
        configuration = _object(candidate, field)
        _exact_fields(
            configuration,
            field,
            required=_ACCOUNT_MAPPING_CONFIGURATION_FIELDS,
        )
        revision = _integer(configuration["revision"], f"{field}.revision", minimum=1)
        if revision != len(account_mapping_configurations) - index:
            raise TrialValidationError(
                f"{field}.revision breaks the newest-first sequence."
            )
        mappings = _list(configuration["mappings"], f"{field}.mappings")
        if len(mappings) != len(_ACCOUNT_ROLES):
            raise TrialValidationError(
                f"{field}.mappings must cover every account role exactly once."
            )
        for mapping_index, account_role in enumerate(_ACCOUNT_ROLES):
            mapping_field = f"{field}.mappings[{mapping_index}]"
            mapping = _object(mappings[mapping_index], mapping_field)
            _exact_fields(mapping, mapping_field, required=_ACCOUNT_MAPPING_FIELDS)
            if mapping["accountRole"] != account_role:
                raise TrialValidationError(
                    f"{mapping_field} must use the canonical account role order."
                )
            code = _text(
                mapping["externalAccountCode"],
                f"{mapping_field}.externalAccountCode",
                maximum=40,
            )
            if _EXTERNAL_ACCOUNT_CODE_PATTERN.fullmatch(code) is None:
                raise TrialValidationError(
                    f"{mapping_field}.externalAccountCode is invalid."
                )
        proof = _action_proof(configuration["proof"], f"{field}.proof")
        if newer_account_mapping_configuration is not None:
            newer_captured_at = datetime.fromisoformat(
                str(newer_account_mapping_configuration["proof"]["capturedAt"]).replace("Z", "+00:00")
            )
            captured_at = datetime.fromisoformat(proof["capturedAt"].replace("Z", "+00:00"))
            if captured_at > newer_captured_at:
                raise TrialValidationError(
                    f"{field} account mapping configurations must be newest first."
                )
        newer_account_mapping_configuration = configuration
        account_mapping_configuration_action_ids.append(proof["actionId"])

    purchase_order_ids: list[str] = []
    purchase_order_action_ids: list[str] = []
    purchase_order_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(purchase_orders):
        field = f"purchaseOrders[{index}]"
        purchase_order = _object(candidate, field)
        _exact_fields(
            purchase_order,
            field,
            required=_PURCHASE_ORDER_REQUIRED_FIELDS,
            optional=_PURCHASE_ORDER_OPTIONAL_FIELDS,
        )
        purchase_order_id = _text(
            purchase_order["id"],
            f"{field}.id",
            maximum=80,
        )
        if _PURCHASE_ORDER_ID_PATTERN.fullmatch(purchase_order_id) is None:
            raise TrialValidationError(f"{field}.id is invalid.")
        created_at = _timestamp(purchase_order["createdAt"], f"{field}.createdAt")
        if "expectedAt" in purchase_order:
            expected_at = _timestamp(
                purchase_order["expectedAt"],
                f"{field}.expectedAt",
            )
            if datetime.fromisoformat(
                expected_at.replace("Z", "+00:00")
            ) <= datetime.fromisoformat(created_at.replace("Z", "+00:00")):
                raise TrialValidationError(
                    f"{field}.expectedAt must be later than creation."
                )
        _text(purchase_order["supplier"], f"{field}.supplier", maximum=120)
        sku = _text(purchase_order["sku"], f"{field}.sku", maximum=80)
        if sku not in item_by_sku:
            raise TrialValidationError(f"{field}.sku is unknown.")
        _integer(
            purchase_order["quantityOrdered"],
            f"{field}.quantityOrdered",
            minimum=1,
        )
        creation = _action_proof(purchase_order["creation"], f"{field}.creation")
        if creation["capturedAt"] != created_at:
            raise TrialValidationError(
                f"{field}.creation must be captured when the purchase order was created."
            )
        purchase_order_action_ids.append(creation["actionId"])
        if "cancellation" in purchase_order:
            cancellation = _action_proof(
                purchase_order["cancellation"],
                f"{field}.cancellation",
            )
            if datetime.fromisoformat(
                cancellation["capturedAt"].replace("Z", "+00:00")
            ) < datetime.fromisoformat(created_at.replace("Z", "+00:00")):
                raise TrialValidationError(
                    f"{field}.cancellation cannot precede creation."
                )
            purchase_order_action_ids.append(cancellation["actionId"])
        purchase_order_ids.append(purchase_order_id)
        purchase_order_by_id[purchase_order_id] = purchase_order
    _unique(purchase_order_ids, "Purchase order ID")

    storefront_configuration_action_id = ""
    if storefront_configuration is not None:
        configuration = _object(
            storefront_configuration,
            "commerce state.storefrontConfiguration",
        )
        _exact_fields(
            configuration,
            "commerce state.storefrontConfiguration",
            required=_STOREFRONT_CONFIGURATION_FIELDS,
            optional=_STOREFRONT_CONFIGURATION_OPTIONAL_FIELDS,
        )
        if configuration["schema"] != "supermega.ecommerce.storefront.v1":
            raise TrialValidationError("commerce state.storefrontConfiguration.schema is invalid.")
        revision = _integer(
            configuration["revision"],
            "commerce state.storefrontConfiguration.revision",
            minimum=1,
        )
        _integer(
            configuration["shopCatalogSnapshotRevision"],
            "commerce state.storefrontConfiguration.shopCatalogSnapshotRevision",
            minimum=1,
        )
        digest = _text(
            configuration["shopCatalogDigest"],
            "commerce state.storefrontConfiguration.shopCatalogDigest",
            maximum=71,
        )
        if _SHA256_DIGEST_PATTERN.fullmatch(digest) is None:
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.shopCatalogDigest is invalid."
            )
        _text(
            configuration["storeName"],
            "commerce state.storefrontConfiguration.storeName",
            maximum=60,
        )
        _text(
            configuration["summary"],
            "commerce state.storefrontConfiguration.summary",
            maximum=180,
        )
        selected_skus = _list(
            configuration["selectedSkus"],
            "commerce state.storefrontConfiguration.selectedSkus",
        )
        if not 1 <= len(selected_skus) <= 8:
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.selectedSkus must contain 1 to 8 Shop SKUs."
            )
        normalized_selected_skus = [
            _text(
                sku,
                f"commerce state.storefrontConfiguration.selectedSkus[{index}]",
                maximum=80,
            )
            for index, sku in enumerate(selected_skus)
        ]
        _unique(normalized_selected_skus, "Storefront selected SKU")
        if (
            normalized_selected_skus != sorted(normalized_selected_skus)
            or any(sku not in item_by_sku for sku in normalized_selected_skus)
        ):
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.selectedSkus must be sorted current Shop SKUs."
            )
        if "merchandising" in configuration:
            merchandising = _list(
                configuration["merchandising"],
                "commerce state.storefrontConfiguration.merchandising",
            )
            if len(merchandising) != len(normalized_selected_skus):
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.merchandising must cover every selected Shop SKU exactly once."
                )
            merchandising_skus: list[str] = []
            for index, candidate in enumerate(merchandising):
                row = _object(
                    candidate,
                    f"commerce state.storefrontConfiguration.merchandising[{index}]",
                )
                _exact_fields(
                    row,
                    f"commerce state.storefrontConfiguration.merchandising[{index}]",
                    required=_STOREFRONT_MERCHANDISING_FIELDS,
                )
                merchandising_skus.append(
                    _text(
                        row["sku"],
                        f"commerce state.storefrontConfiguration.merchandising[{index}].sku",
                        maximum=80,
                    )
                )
                if not isinstance(row["featured"], bool):
                    raise TrialValidationError(
                        f"commerce state.storefrontConfiguration.merchandising[{index}].featured must be boolean."
                    )
                _text(
                    row["collection"],
                    f"commerce state.storefrontConfiguration.merchandising[{index}].collection",
                    maximum=120,
                )
                _blankable_text(
                    row["displayName"],
                    f"commerce state.storefrontConfiguration.merchandising[{index}].displayName",
                    maximum=180,
                )
                _blankable_text(
                    row["note"],
                    f"commerce state.storefrontConfiguration.merchandising[{index}].note",
                    maximum=300,
                )
            if merchandising_skus != normalized_selected_skus:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.merchandising must follow the canonical selected SKU order."
                )
        if "activation" in configuration:
            activation = _object(
                configuration["activation"],
                "commerce state.storefrontConfiguration.activation",
            )
            _exact_fields(
                activation,
                "commerce state.storefrontConfiguration.activation",
                required=_STOREFRONT_ACTIVATION_FIELDS,
            )
            if activation["contract"] != "supermega.ecommerce.activation.v1":
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.contract is invalid."
                )
            package_digest = _text(
                activation["packageDigest"],
                "commerce state.storefrontConfiguration.activation.packageDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(package_digest) is None:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.packageDigest is invalid."
                )
            template_id = _text(
                activation["workflowTemplateId"],
                "commerce state.storefrontConfiguration.activation.workflowTemplateId",
                maximum=60,
            )
            if template_id not in _ECOMMERCE_TEMPLATE_IDS:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.workflowTemplateId is invalid."
                )
            _timestamp(
                activation["confirmedAt"],
                "commerce state.storefrontConfiguration.activation.confirmedAt",
            )
            activation_skus = _list(
                activation["skus"],
                "commerce state.storefrontConfiguration.activation.skus",
            )
            if activation_skus != normalized_selected_skus:
                raise TrialValidationError(
                    "commerce state.storefrontConfiguration.activation.skus must match the current imported storefront."
                )
        saved = _action_proof(
            configuration["saved"],
            "commerce state.storefrontConfiguration.saved",
        )
        if saved["evidenceReference"] != f"ECOMMERCE-STOREFRONT:{digest}:R{revision}":
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.saved evidence is invalid."
            )
        expected_action_id = _storefront_configuration_action_id(revision, digest)
        if saved["actionId"] != expected_action_id:
            raise TrialValidationError(
                "commerce state.storefrontConfiguration.saved action ID is invalid."
            )
        storefront_configuration_action_id = saved["actionId"]

    order_ids: list[str] = []
    source_record_ids: list[str] = []
    reconciliation_action_ids: list[str] = []
    refund_settlement_action_ids: list[str] = []
    advancement_action_ids: list[str] = []
    completion_action_ids: list[str] = []
    return_action_ids: list[str] = []
    correction_action_ids: list[str] = []
    order_returns: list[tuple[str, dict[str, Any]]] = []
    order_by_id: dict[str, dict[str, Any]] = {}
    for index, candidate in enumerate(orders):
        order = _object(candidate, f"orders[{index}]")
        _exact_fields(order, f"orders[{index}]", required=_ORDER_REQUIRED_FIELDS, optional=_ORDER_OPTIONAL_FIELDS)
        order_id = _text(order["id"], f"orders[{index}].id", maximum=160)
        _timestamp(order["createdAt"], f"orders[{index}].createdAt")
        for field in ("customer", "channel", "item", "payment"):
            _text(order[field], f"orders[{index}].{field}")
        if "owner" in order:
            _text(order["owner"], f"orders[{index}].owner", maximum=120)
        item_sku = order.get("itemSku")
        if item_sku is not None:
            item_sku = _text(item_sku, f"orders[{index}].itemSku", maximum=80)
            if item_sku not in item_by_sku:
                raise TrialValidationError(f"orders[{index}].itemSku is unknown.")
        _integer(order["quantity"], f"orders[{index}].quantity", minimum=1)
        _integer(order["total"], f"orders[{index}].total")
        captured_total: int | None = None
        if "lines" in order:
            lines = _list(order["lines"], f"orders[{index}].lines")
            if not 1 <= len(lines) <= _MAX_ORDER_LINES:
                raise TrialValidationError(
                    f"orders[{index}].lines must contain 1 to {_MAX_ORDER_LINES} entries."
                )
            line_skus: list[str] = []
            captured_quantity = 0
            captured_total = 0
            validated_lines: list[dict[str, Any]] = []
            for line_index, line_candidate in enumerate(lines):
                line_field = f"orders[{index}].lines[{line_index}]"
                line = _object(line_candidate, line_field)
                _exact_fields(
                    line,
                    line_field,
                    required=_ORDER_LINE_REQUIRED_FIELDS,
                    optional=_ORDER_LINE_OPTIONAL_FIELDS,
                )
                line_sku = _text(line["sku"], f"{line_field}.sku", maximum=80)
                if line_sku not in item_by_sku:
                    raise TrialValidationError(f"{line_field}.sku is unknown.")
                _text(line["name"], f"{line_field}.name")
                if "variant" in line:
                    _text(line["variant"], f"{line_field}.variant")
                line_quantity = _integer(
                    line["quantity"],
                    f"{line_field}.quantity",
                    minimum=1,
                )
                unit_price = _integer(
                    line["unitPriceMmk"],
                    f"{line_field}.unitPriceMmk",
                    minimum=1,
                )
                line_total = line_quantity * unit_price
                captured_quantity += line_quantity
                captured_total += line_total
                if (
                    line_total > _MAX_SAFE_INTEGER
                    or captured_quantity > _MAX_SAFE_INTEGER
                    or captured_total > _MAX_SAFE_INTEGER
                ):
                    raise TrialValidationError(
                        f"orders[{index}].lines exceed the safe integer limit."
                    )
                line_skus.append(line_sku)
                validated_lines.append(line)
            _unique(line_skus, f"orders[{index}] line SKU")
            expected_item_sku = validated_lines[0]["sku"] if len(validated_lines) == 1 else None
            if (
                order["item"] != _order_item_summary(validated_lines)
                or order.get("itemSku") != expected_item_sku
                or order["quantity"] != captured_quantity
            ):
                raise TrialValidationError(
                    f"orders[{index}] does not match its immutable line snapshots."
                )
        calculation_candidate = order.get("calculation")
        if calculation_candidate is not None:
            calculation = _object(
                calculation_candidate,
                f"orders[{index}].calculation",
            )
            calculation_schema = calculation.get("schema")
            if calculation_schema == _ORDER_CALCULATION_SCHEMA:
                _exact_fields(
                    calculation,
                    f"orders[{index}].calculation",
                    required=_ORDER_CALCULATION_FIELDS,
                )
            elif calculation_schema == _ORDER_CALCULATION_V2_SCHEMA:
                _exact_fields(
                    calculation,
                    f"orders[{index}].calculation",
                    required=_ORDER_CALCULATION_V2_FIELDS,
                    optional=_ORDER_CALCULATION_V2_SCHEDULE_FIELDS,
                )
                schedule_fields = _ORDER_CALCULATION_V2_SCHEDULE_FIELDS.intersection(calculation)
                if schedule_fields and schedule_fields != _ORDER_CALCULATION_V2_SCHEDULE_FIELDS:
                    raise TrialValidationError(
                        f"orders[{index}].calculation must retain jurisdiction and effective time together."
                    )
            else:
                raise TrialValidationError(
                    f"orders[{index}].calculation schema is invalid."
                )
            catalog_revision = _integer(
                calculation["catalogRevision"],
                f"orders[{index}].calculation.catalogRevision",
            )
            subtotal_mmk = _integer(
                calculation["subtotalMmk"],
                f"orders[{index}].calculation.subtotalMmk",
                minimum=1 if calculation_schema == _ORDER_CALCULATION_SCHEMA else 0,
            )
            tax_mmk = _integer(
                calculation["taxMmk"],
                f"orders[{index}].calculation.taxMmk",
            )
            total_mmk = _integer(
                calculation["totalMmk"],
                f"orders[{index}].calculation.totalMmk",
                minimum=1,
            )
            if calculation["currency"] != "MMK" or catalog_revision > len(catalog_changes) or order["total"] != total_mmk:
                raise TrialValidationError(
                    f"orders[{index}].calculation totals are invalid."
                )
            if calculation_schema == _ORDER_CALCULATION_SCHEMA:
                if (
                    calculation["taxMode"] != "not_configured"
                    or tax_mmk != 0
                    or total_mmk != subtotal_mmk
                    or (
                        captured_total is not None
                        and subtotal_mmk != captured_total
                    )
                ):
                    raise TrialValidationError(
                        f"orders[{index}].calculation must preserve its deterministic untaxed MMK subtotal."
                    )
            else:
                tax_revision = _integer(
                    calculation["taxConfigurationRevision"],
                    f"orders[{index}].calculation.taxConfigurationRevision",
                    minimum=1,
                )
                _integer(
                    calculation["taxRateBasisPoints"],
                    f"orders[{index}].calculation.taxRateBasisPoints",
                )
                _integer(
                    calculation["listedSubtotalMmk"],
                    f"orders[{index}].calculation.listedSubtotalMmk",
                    minimum=1,
                )
                configuration = next(
                    (
                        row
                        for row in tax_configurations
                        if isinstance(row, Mapping)
                        and row.get("revision") == tax_revision
                    ),
                    None,
                )
                expected = (
                    _configured_order_calculation(
                        configuration,
                        captured_total,
                        catalog_revision,
                    )
                    if configuration is not None and captured_total is not None
                    else None
                )
                if (
                    expected is None
                    or datetime.fromisoformat(
                        str(configuration["proof"]["capturedAt"]).replace("Z", "+00:00")
                    )
                    > datetime.fromisoformat(
                        str(order["createdAt"]).replace("Z", "+00:00")
                    )
                    or datetime.fromisoformat(
                        str(
                            configuration.get(
                                "effectiveFrom",
                                configuration["proof"]["capturedAt"],
                            )
                        ).replace("Z", "+00:00")
                    )
                    > datetime.fromisoformat(
                        str(order["createdAt"]).replace("Z", "+00:00")
                    )
                    or calculation != expected
                ):
                    raise TrialValidationError(
                        f"orders[{index}].calculation does not match its immutable tax configuration."
                    )
        elif captured_total is not None and order["total"] != captured_total:
            raise TrialValidationError(
                f"orders[{index}] legacy total does not match its immutable line snapshots."
            )
        if order["status"] not in _ORDER_STATUSES:
            raise TrialValidationError(f"orders[{index}].status is invalid.")
        if order["paymentStatus"] not in _PAYMENT_STATUSES:
            raise TrialValidationError(f"orders[{index}].paymentStatus is invalid.")
        if order["refundStatus"] not in _REFUND_STATUSES:
            raise TrialValidationError(f"orders[{index}].refundStatus is invalid.")
        if "advancementActionIds" in order:
            order_advancement_action_ids = _list(
                order["advancementActionIds"],
                f"orders[{index}].advancementActionIds",
            )
            status_limit = {
                "confirmed": 0,
                "preparing": 1,
                "ready": 2,
                "completed": 2,
                "cancelled": 2,
            }[order["status"]]
            if len(order_advancement_action_ids) > status_limit:
                raise TrialValidationError(
                    f"orders[{index}].advancementActionIds is invalid."
                )
            validated_advancement_action_ids = [
                _text(
                    action_id,
                    f"orders[{index}].advancementActionIds[{action_index}]",
                    maximum=160,
                )
                for action_index, action_id in enumerate(
                    order_advancement_action_ids
                )
            ]
            _unique(
                validated_advancement_action_ids,
                f"orders[{index}] advancement action ID",
            )
            advancement_action_ids.extend(validated_advancement_action_ids)
        for field in ("fulfilment", "fulfilmentReference", "sourceRecordId", "evidenceReference"):
            if field in order:
                value_text = (
                    _text(order[field], f"orders[{index}].{field}", maximum=160)
                    if field == "fulfilmentReference"
                    else _text(order[field], f"orders[{index}].{field}")
                )
                if field == "sourceRecordId":
                    source_record_ids.append(value_text)
        if "promisedAt" in order:
            promised_at = datetime.fromisoformat(
                _timestamp(
                    order["promisedAt"],
                    f"orders[{index}].promisedAt",
                ).replace("Z", "+00:00")
            )
            created_at = datetime.fromisoformat(
                str(order["createdAt"]).replace("Z", "+00:00")
            )
            if promised_at <= created_at:
                raise TrialValidationError(
                    f"orders[{index}].promisedAt must be after its creation time."
                )

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

        completion: dict[str, Any] | None = None
        if "completion" in order:
            if order["status"] != "completed":
                raise TrialValidationError(
                    f"orders[{index}].completion requires a completed order."
                )
            completion = _action_proof(
                order["completion"],
                f"orders[{index}].completion",
            )
            completion_at = datetime.fromisoformat(
                completion["capturedAt"].replace("Z", "+00:00")
            )
            order_created_at = datetime.fromisoformat(
                str(order["createdAt"]).replace("Z", "+00:00")
            )
            payment_reconciled_at = (
                datetime.fromisoformat(
                    str(order["paymentReconciledAt"]).replace("Z", "+00:00")
                )
                if "paymentReconciledAt" in order
                else order_created_at
            )
            if completion_at < max(order_created_at, payment_reconciled_at):
                raise TrialValidationError(
                    f"orders[{index}].completion is outside the order chronology."
                )
            completion_action_ids.append(completion["actionId"])

        if "returns" in order:
            records = _list(order["returns"], f"orders[{index}].returns")
            if (
                not 1 <= len(records) <= _MAX_RETURNS_PER_ORDER
                or order["status"] != "completed"
                or completion is None
            ):
                raise TrialValidationError(
                    f"orders[{index}].returns requires 1 to "
                    f"{_MAX_RETURNS_PER_ORDER} records and completion proof."
                )
            sold_by_sku = {
                line["sku"]: line["quantity"]
                for line in _reservation_lines(order)
            }
            returned_by_sku: dict[str, int] = {}
            newer_return_at: datetime | None = None
            completion_at = datetime.fromisoformat(
                completion["capturedAt"].replace("Z", "+00:00")
            )
            for return_index, return_candidate in enumerate(records):
                field = f"orders[{index}].returns[{return_index}]"
                return_record = _object(return_candidate, field)
                _exact_fields(return_record, field, required=_ORDER_RETURN_FIELDS)
                action_id = _text(
                    return_record["actionId"],
                    f"{field}.actionId",
                    maximum=160,
                )
                created_at = datetime.fromisoformat(
                    _timestamp(
                        return_record["createdAt"],
                        f"{field}.createdAt",
                    ).replace("Z", "+00:00")
                )
                for proof_field in ("actor", "reason", "evidenceReference"):
                    _text(return_record[proof_field], f"{field}.{proof_field}")
                sku = _text(return_record["sku"], f"{field}.sku", maximum=80)
                quantity = _integer(
                    return_record["quantity"],
                    f"{field}.quantity",
                    minimum=1,
                )
                if return_record["disposition"] not in _RETURN_DISPOSITIONS:
                    raise TrialValidationError(f"{field}.disposition is invalid.")
                if (
                    created_at < completion_at
                    or (
                        newer_return_at is not None
                        and created_at > newer_return_at
                    )
                ):
                    raise TrialValidationError(
                        f"{field}.createdAt is outside the order chronology."
                    )
                newer_return_at = created_at
                returned = returned_by_sku.get(sku, 0) + quantity
                if (
                    sku not in sold_by_sku
                    or returned > sold_by_sku[sku]
                    or returned > _MAX_SAFE_INTEGER
                ):
                    raise TrialValidationError(
                        f"orders[{index}].returns exceed the sold quantity for {sku}."
                    )
                returned_by_sku[sku] = returned
                return_action_ids.append(action_id)
                order_returns.append((order_id, return_record))
        if "corrections" in order:
            corrections = _list(order["corrections"], f"orders[{index}].corrections")
            if (
                not 1 <= len(corrections) <= _MAX_CORRECTIONS_PER_ORDER
                or order["status"] != "completed"
                or order["paymentStatus"] != "reconciled"
                or completion is None
                or not isinstance(order.get("calculation"), Mapping)
            ):
                raise TrialValidationError(
                    f"orders[{index}].corrections requires 1 to "
                    f"{_MAX_CORRECTIONS_PER_ORDER} records on a calculated, "
                    "reconciled, completed order."
                )
            source_digest = commerce_order_calculation_digest(order)
            expected_balance = int(order["total"])
            previous_created_at = datetime.fromisoformat(
                completion["capturedAt"].replace("Z", "+00:00")
            )
            for reverse_index, correction_candidate in enumerate(reversed(corrections)):
                correction_index = len(corrections) - reverse_index - 1
                field = f"orders[{index}].corrections[{correction_index}]"
                correction = _object(correction_candidate, field)
                _exact_fields(correction, field, required=_ORDER_CORRECTION_FIELDS)
                action_id = _text(correction["actionId"], f"{field}.actionId", maximum=160)
                if correction["documentId"] != f"COR2:{quote(action_id, safe='')}" :
                    raise TrialValidationError(f"{field}.documentId is invalid.")
                created_at = datetime.fromisoformat(
                    _timestamp(correction["createdAt"], f"{field}.createdAt").replace("Z", "+00:00")
                )
                if created_at < previous_created_at:
                    raise TrialValidationError(f"{field}.createdAt is outside the order chronology.")
                previous_created_at = created_at
                for proof_field in ("actor", "reason", "evidenceReference"):
                    _text(correction[proof_field], f"{field}.{proof_field}")
                if correction["kind"] not in _CORRECTION_KINDS or correction["reasonCode"] not in _CORRECTION_REASON_CODES:
                    raise TrialValidationError(f"{field} classification is invalid.")
                if correction["sourceCalculationDigest"] != source_digest:
                    raise TrialValidationError(
                        f"{field}.sourceCalculationDigest does not bind the original order calculation."
                    )
                calculation = _object(correction["calculation"], f"{field}.calculation")
                _exact_fields(
                    calculation,
                    f"{field}.calculation",
                    required=_CORRECTION_CALCULATION_FIELDS,
                    optional=_CORRECTION_CALCULATION_SCHEDULE_FIELDS,
                )
                schedule_fields = _CORRECTION_CALCULATION_SCHEDULE_FIELDS.intersection(calculation)
                if schedule_fields and schedule_fields != _CORRECTION_CALCULATION_SCHEDULE_FIELDS:
                    raise TrialValidationError(
                        f"{field}.calculation must retain jurisdiction and effective time together."
                    )
                listed_amount = _integer(
                    calculation["listedAmountMmk"],
                    f"{field}.calculation.listedAmountMmk",
                    minimum=1,
                )
                expected_calculation = _correction_calculation(order, listed_amount)
                if calculation != expected_calculation:
                    raise TrialValidationError(
                        f"{field}.calculation is not deterministic from the original tax snapshot."
                    )
                expected_balance += (
                    int(calculation["totalMmk"])
                    if correction["kind"] == "debit"
                    else -int(calculation["totalMmk"])
                )
                if (
                    not 0 <= expected_balance <= _MAX_SAFE_INTEGER
                    or correction["balanceAfterMmk"] != expected_balance
                ):
                    raise TrialValidationError(f"{field}.balanceAfterMmk is invalid.")
                if (
                    correction["financialStatus"] != "review_required"
                    or correction["postingAuthority"] != "none"
                    or correction["externalPostingPerformed"] is not False
                ):
                    raise TrialValidationError(f"{field} overclaims posting authority.")
                correction_action_ids.append(action_id)
        order_ids.append(order_id)
        order_by_id[order_id] = order
    _unique(order_ids, "Order ID")
    _unique(source_record_ids, "Order source record ID")
    _unique(reconciliation_action_ids, "Payment reconciliation action ID")
    _unique(refund_settlement_action_ids, "Refund settlement action ID")
    _unique(advancement_action_ids, "Order advancement action ID")
    _unique(completion_action_ids, "Order completion action ID")
    _unique(return_action_ids, "Order return action ID")
    _unique(correction_action_ids, "Order correction action ID")

    movement_ids: list[str] = []
    movement_action_ids: list[str] = []
    reserve_by_order: dict[str, int] = {}
    release_by_order: dict[str, int] = {}
    reserve_actions_by_order: dict[str, set[str]] = {}
    release_actions_by_order: dict[str, set[str]] = {}
    reserve_movement_by_order: dict[str, dict[str, Any]] = {}
    movements_by_action: dict[str, list[dict[str, Any]]] = {}
    receipt_quantity_by_purchase_order: dict[str, int] = {}
    latest_receipt_at_by_purchase_order: dict[str, datetime] = {}
    production_request_ids: list[str] = []
    production_release_ids: list[str] = []
    for index, candidate in enumerate(movements):
        movement = _object(candidate, f"movements[{index}]")
        _exact_fields(
            movement,
            f"movements[{index}]",
            required=_MOVEMENT_FIELDS
            - (
                {
                    "orderId",
                    "purchaseOrderId",
                    "expectedQuantity",
                    "countedQuantity",
                }
                | _PRODUCTION_ISSUE_FIELDS
                | _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS
            ),
            optional=frozenset(
                {
                    "orderId",
                    "purchaseOrderId",
                    "expectedQuantity",
                    "countedQuantity",
                }
            )
            | _PRODUCTION_ISSUE_FIELDS
            | _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS,
        )
        movement_id = _text(
            movement["id"],
            f"movements[{index}].id",
            maximum=_MAX_MOVEMENT_ID_LENGTH,
        )
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
        retained_production_fields = _PRODUCTION_ISSUE_FIELDS.intersection(movement)
        retained_production_receipt_fields = _PRODUCTION_RECEIPT_FIELDS.intersection(movement)
        if kind == "production_issue":
            if (
                retained_production_fields != _PRODUCTION_ISSUE_FIELDS
                or _PRODUCTION_RECEIPT_EXCLUSIVE_FIELDS.intersection(movement)
                or "orderId" in movement
                or "purchaseOrderId" in movement
                or "expectedQuantity" in movement
                or "countedQuantity" in movement
            ):
                raise TrialValidationError(
                    f"movements[{index}] production issue fields are incomplete."
                )
            production_request_ids.append(
                _text(
                    movement["productionRequestId"],
                    f"movements[{index}].productionRequestId",
                    maximum=80,
                )
            )
            production_command_digest = _text(
                movement["productionCommandDigest"],
                f"movements[{index}].productionCommandDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(production_command_digest) is None:
                raise TrialValidationError(
                    f"movements[{index}].productionCommandDigest is invalid."
                )
            for field in (
                "productionJobId",
                "productionMaterialId",
                "productionInputLotId",
            ):
                _text(movement[field], f"movements[{index}].{field}", maximum=80)
            _integer(
                movement["productionQuantityMilli"],
                f"movements[{index}].productionQuantityMilli",
                minimum=1,
            )
            if movement["productionUnit"] not in _PRODUCTION_MATERIAL_UNITS:
                raise TrialValidationError(
                    f"movements[{index}].productionUnit is invalid."
                )
            _text(
                movement["conversionNote"],
                f"movements[{index}].conversionNote",
                maximum=240,
            )
        elif kind == "production_receipt":
            if (
                retained_production_receipt_fields != _PRODUCTION_RECEIPT_FIELDS
                or _PRODUCTION_ISSUE_EXCLUSIVE_FIELDS.intersection(movement)
                or "orderId" in movement
                or "purchaseOrderId" in movement
                or "expectedQuantity" in movement
                or "countedQuantity" in movement
            ):
                raise TrialValidationError(
                    f"movements[{index}] production receipt fields are incomplete."
                )
            production_release_ids.append(
                _text(
                    movement["productionReleaseId"],
                    f"movements[{index}].productionReleaseId",
                    maximum=80,
                )
            )
            production_command_digest = _text(
                movement["productionCommandDigest"],
                f"movements[{index}].productionCommandDigest",
                maximum=71,
            )
            if _SHA256_DIGEST_PATTERN.fullmatch(production_command_digest) is None:
                raise TrialValidationError(
                    f"movements[{index}].productionCommandDigest is invalid."
                )
            _text(
                movement["productionJobId"],
                f"movements[{index}].productionJobId",
                maximum=80,
            )
            _text(
                movement["productionOutputBatchId"],
                f"movements[{index}].productionOutputBatchId",
                maximum=80,
            )
            released_at = datetime.fromisoformat(
                _timestamp(
                    movement["productionReleasedAt"],
                    f"movements[{index}].productionReleasedAt",
                ).replace("Z", "+00:00")
            )
            received_at = datetime.fromisoformat(
                _timestamp(
                    movement["createdAt"], f"movements[{index}].createdAt"
                ).replace("Z", "+00:00")
            )
            if received_at < released_at:
                raise TrialValidationError(
                    f"movements[{index}] predates its Plant release."
                )
        elif retained_production_fields or retained_production_receipt_fields:
            raise TrialValidationError(
                f"movements[{index}] production fields are unsupported for {kind}."
            )
        movements_by_action.setdefault(action_id, []).append(movement)
        if kind == "count":
            if "orderId" in movement or "purchaseOrderId" in movement:
                raise TrialValidationError(
                    f"movements[{index}] count cannot reference an order."
                )
            expected_quantity = _integer(
                movement.get("expectedQuantity"),
                f"movements[{index}].expectedQuantity",
            )
            counted_quantity = _integer(
                movement.get("countedQuantity"),
                f"movements[{index}].countedQuantity",
            )
            signed_delta = movement["quantityDelta"]
            if (
                isinstance(signed_delta, bool)
                or not isinstance(signed_delta, int)
                or not -_MAX_SAFE_INTEGER <= signed_delta <= _MAX_SAFE_INTEGER
                or signed_delta != counted_quantity - expected_quantity
            ):
                raise TrialValidationError(
                    f"movements[{index}] count variance is invalid."
                )
        else:
            if "expectedQuantity" in movement or "countedQuantity" in movement:
                raise TrialValidationError(
                    f"movements[{index}] count fields are unsupported for {kind}."
                )
        if kind == "opening":
            quantity_delta = _integer(movement["quantityDelta"], f"movements[{index}].quantityDelta")
        elif kind != "count":
            quantity_delta = _integer(abs(movement["quantityDelta"]) if isinstance(movement["quantityDelta"], int) and not isinstance(movement["quantityDelta"], bool) else movement["quantityDelta"], f"movements[{index}].quantityDelta", minimum=1)
            signed_delta = movement["quantityDelta"]
            if kind in {"reserve", "production_issue"} and signed_delta >= 0:
                raise TrialValidationError(
                    f"movements[{index}] {kind} must be negative."
                )
            if kind not in {"reserve", "production_issue"} and signed_delta <= 0:
                raise TrialValidationError(
                    f"movements[{index}] release, receipt, or return must be positive."
                )
        if kind in {"production_issue", "production_receipt"}:
            movement_ids.append(movement_id)
            movement_action_ids.append(action_id)
            continue
        if kind in {"opening", "receipt", "count"}:
            if "orderId" in movement:
                raise TrialValidationError(f"movements[{index}] {kind} cannot reference an order.")
            if kind == "opening" and "purchaseOrderId" in movement:
                raise TrialValidationError(
                    f"movements[{index}] opening cannot reference a purchase order."
                )
            if kind == "receipt" and "purchaseOrderId" in movement:
                purchase_order_id = _text(
                    movement["purchaseOrderId"],
                    f"movements[{index}].purchaseOrderId",
                    maximum=80,
                )
                purchase_order = purchase_order_by_id.get(purchase_order_id)
                receipt_at = datetime.fromisoformat(
                    str(movement["createdAt"]).replace("Z", "+00:00")
                )
                if (
                    purchase_order is None
                    or purchase_order["sku"] != sku
                    or receipt_at
                    < datetime.fromisoformat(
                        str(purchase_order["createdAt"]).replace("Z", "+00:00")
                    )
                    or (
                        "cancellation" in purchase_order
                        and receipt_at
                        > datetime.fromisoformat(
                            str(
                                purchase_order["cancellation"]["capturedAt"]
                            ).replace("Z", "+00:00")
                        )
                    )
                ):
                    raise TrialValidationError(
                        f"movements[{index}] does not match its purchase order."
                    )
                received = (
                    receipt_quantity_by_purchase_order.get(purchase_order_id, 0)
                    + quantity_delta
                )
                if (
                    received > purchase_order["quantityOrdered"]
                    or received > _MAX_SAFE_INTEGER
                ):
                    raise TrialValidationError(
                        f"movements[{index}] exceeds its purchase order quantity."
                    )
                receipt_quantity_by_purchase_order[purchase_order_id] = received
                latest_receipt_at_by_purchase_order[purchase_order_id] = max(
                    latest_receipt_at_by_purchase_order.get(
                        purchase_order_id,
                        datetime.min.replace(tzinfo=timezone.utc),
                    ),
                    receipt_at,
                )
        else:
            if "purchaseOrderId" in movement:
                raise TrialValidationError(
                    f"movements[{index}] sales movement cannot reference a purchase order."
                )
            order_id = _text(movement.get("orderId"), f"movements[{index}].orderId", maximum=160)
            if kind == "return":
                matching_returns = [
                    record
                    for return_order_id, record in order_returns
                    if return_order_id == order_id
                    and record["actionId"] == action_id
                ]
                if len(matching_returns) != 1:
                    raise TrialValidationError(
                        f"movements[{index}] does not match one order return."
                    )
                return_record = matching_returns[0]
                if (
                    return_record["disposition"] != "restock"
                    or movement["sku"] != return_record["sku"]
                    or movement["quantityDelta"] != return_record["quantity"]
                    or movement["id"] != _movement_id(action_id)
                    or movement["createdAt"] != return_record["createdAt"]
                    or movement["actor"] != return_record["actor"]
                    or movement["reason"] != return_record["reason"]
                    or movement["evidenceReference"]
                    != return_record["evidenceReference"]
                ):
                    raise TrialValidationError(
                        f"movements[{index}] does not match one sellable order return."
                    )
            else:
                order = order_by_id.get(order_id)
                matching_lines = [
                    line
                    for line in (_reservation_lines(order) if order else [])
                    if line["sku"] == sku
                ]
                if not order or len(matching_lines) != 1 or quantity_delta != matching_lines[0]["quantity"]:
                    raise TrialValidationError(f"movements[{index}] does not match its order reservation.")
                counter = reserve_by_order if kind == "reserve" else release_by_order
                counter[order_id] = counter.get(order_id, 0) + 1
                actions = (
                    reserve_actions_by_order
                    if kind == "reserve"
                    else release_actions_by_order
                )
                actions.setdefault(order_id, set()).add(action_id)
                if kind == "reserve":
                    reserve_movement_by_order.setdefault(order_id, movement)
                if kind == "release" and order["status"] != "cancelled":
                    raise TrialValidationError(f"movements[{index}] release requires a cancelled order.")
        movement_ids.append(movement_id)
        movement_action_ids.append(action_id)
    _unique(movement_ids, "Stock movement ID")
    _unique(production_request_ids, "Production material request ID")
    _unique(production_release_ids, "Production batch release ID")
    for order_id, return_record in order_returns:
        order = order_by_id.get(order_id)
        lines = _reservation_lines(order) if order else []
        reserves = [
            movement
            for movement in movements
            if movement.get("kind") == "reserve"
            and movement.get("orderId") == order_id
        ]
        releases = [
            movement
            for movement in movements
            if movement.get("kind") == "release"
            and movement.get("orderId") == order_id
        ]
        if (
            order is None
            or order["status"] != "completed"
            or "completion" not in order
            or not lines
            or len(reserves) != len(lines)
            or releases
            or any(
                len(
                    [
                        reserve
                        for reserve in reserves
                        if reserve["sku"] == line["sku"]
                        and reserve["quantityDelta"] == -line["quantity"]
                    ]
                )
                != 1
                for line in lines
            )
        ):
            raise TrialValidationError(
                f"Order return {return_record['actionId']} is not bound "
                "to one completed, reserved sale."
            )
        latest_basis = max(
            [
                datetime.fromisoformat(
                    str(order["createdAt"]).replace("Z", "+00:00")
                ),
                datetime.fromisoformat(
                    str(order["completion"]["capturedAt"]).replace("Z", "+00:00")
                ),
                *(
                    [
                        datetime.fromisoformat(
                            str(order["paymentReconciledAt"]).replace(
                                "Z",
                                "+00:00",
                            )
                        )
                    ]
                    if "paymentReconciledAt" in order
                    else []
                ),
                *[
                    datetime.fromisoformat(
                        str(reserve["createdAt"]).replace("Z", "+00:00")
                    )
                    for reserve in reserves
                ],
            ]
        )
        if datetime.fromisoformat(
            str(return_record["createdAt"]).replace("Z", "+00:00")
        ) < latest_basis:
            raise TrialValidationError(
                f"Order return {return_record['actionId']} predates its sale."
            )
        action_movements = movements_by_action.get(
            str(return_record["actionId"]),
            [],
        )
        matching_restock = (
            len(action_movements) == 1
            and action_movements[0]["kind"] == "return"
            and action_movements[0].get("orderId") == order_id
            and action_movements[0]["sku"] == return_record["sku"]
            and action_movements[0]["quantityDelta"] == return_record["quantity"]
            and action_movements[0]["createdAt"] == return_record["createdAt"]
            and action_movements[0]["actor"] == return_record["actor"]
            and action_movements[0]["reason"] == return_record["reason"]
            and action_movements[0]["evidenceReference"]
            == return_record["evidenceReference"]
        )
        if (
            return_record["disposition"] == "restock"
            and not matching_restock
        ) or (
            return_record["disposition"] == "not_restocked"
            and action_movements
        ):
            raise TrialValidationError(
                f"Order return {return_record['actionId']} has invalid stock linkage."
            )
    for action_id, action_movements in movements_by_action.items():
        if len(action_movements) < 2:
            continue
        first = action_movements[0]
        if (
            first["kind"] not in {"reserve", "release"}
            or not first.get("orderId")
            or len({movement["sku"] for movement in action_movements}) != len(action_movements)
            or any(
                movement["kind"] != first["kind"]
                or movement.get("orderId") != first["orderId"]
                or movement["createdAt"] != first["createdAt"]
                or movement["actor"] != first["actor"]
                or movement["reason"] != first["reason"]
                or movement["evidenceReference"] != first["evidenceReference"]
                for movement in action_movements
            )
        ):
            raise TrialValidationError(
                f"Stock movement action {action_id} is not one exact order reservation group."
            )
    for sku, item in item_by_sku.items():
        sku_movements = [
            movement for movement in movements if movement["sku"] == sku
        ]
        count_indexes = [
            index
            for index, movement in enumerate(sku_movements)
            if movement["kind"] == "count"
        ]
        if not count_indexes:
            continue
        balance = item["onHand"]
        for movement in sku_movements[: count_indexes[-1] + 1]:
            if (
                movement["kind"] == "count"
                and movement["countedQuantity"] != balance
            ):
                raise TrialValidationError(
                    f"Stock count {movement['actionId']} does not match "
                    f"the later movement history for {sku}."
                )
            prior_balance = balance - movement["quantityDelta"]
            _integer(prior_balance, f"Stock movement history for {sku}")
            if (
                movement["kind"] == "count"
                and movement["expectedQuantity"] != prior_balance
            ):
                raise TrialValidationError(
                    f"Stock count {movement['actionId']} does not match "
                    f"its expected balance for {sku}."
                )
            balance = prior_balance
    for order_id, count in reserve_by_order.items():
        order = order_by_id.get(order_id)
        reservation = reserve_movement_by_order.get(order_id)
        if (
            not order
            or count != len(_reservation_lines(order))
            or len(reserve_actions_by_order.get(order_id, set())) != 1
            or (
                "owner" in order
                and (not reservation or reservation["actor"] != order["owner"])
            )
        ):
            raise TrialValidationError(
                f"{order_id} does not have one owner-bound reservation action covering every order line."
            )
    for order_id, count in release_by_order.items():
        order = order_by_id.get(order_id)
        expected = len(_reservation_lines(order)) if order else 0
        if (
            not expected
            or count != expected
            or reserve_by_order.get(order_id) != expected
            or len(release_actions_by_order.get(order_id, set())) != 1
        ):
            raise TrialValidationError(f"{order_id} has an unproven stock release.")

    active_purchase_order_skus: list[str] = []
    for purchase_order_id, purchase_order in purchase_order_by_id.items():
        received = receipt_quantity_by_purchase_order.get(purchase_order_id, 0)
        if "cancellation" in purchase_order:
            cancellation_at = datetime.fromisoformat(
                str(purchase_order["cancellation"]["capturedAt"]).replace(
                    "Z",
                    "+00:00",
                )
            )
            if (
                received >= purchase_order["quantityOrdered"]
                or cancellation_at
                < latest_receipt_at_by_purchase_order.get(
                    purchase_order_id,
                    datetime.fromisoformat(
                        str(purchase_order["createdAt"]).replace("Z", "+00:00")
                    ),
                )
            ):
                raise TrialValidationError(
                    f"{purchase_order_id} has an invalid cancellation boundary."
                )
        elif received < purchase_order["quantityOrdered"]:
            active_purchase_order_skus.append(purchase_order["sku"])
    _unique(active_purchase_order_skus, "Active purchase order SKU")

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
            member_adjusted_totals = [_order_adjusted_total(order) for order in member_orders]
            if (
                any(
                    order["status"] != "completed"
                    or order["paymentStatus"] != "reconciled"
                    for order in member_orders
                )
                or any(total is None for total in member_adjusted_totals)
                or close["orders"] != len(order_ids_for_close)
                or close["total"] != sum(total or 0 for total in member_adjusted_totals)
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
            or total != quantity * unit_price
        ):
            raise TrialValidationError(
                f"{field} does not match its retained Commerce snapshot."
            )

        creation = _action_proof(intake["creation"], f"{field}.creation")
        if creation["capturedAt"] != created_at:
            raise TrialValidationError(f"{field}.creation must be captured when the intake was created.")
        if "snapshotDigest" in intake:
            snapshot_digest = _text(
                intake["snapshotDigest"],
                f"{field}.snapshotDigest",
                maximum=71,
            )
            if (
                _SHA256_DIGEST_PATTERN.fullmatch(snapshot_digest) is None
                or snapshot_digest != commerce_website_intake_snapshot_digest(intake)
            ):
                raise TrialValidationError(f"{field}.snapshotDigest is invalid.")
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
    storefront_request_ids: list[str] = []
    storefront_idempotency_keys: list[str] = []
    storefront_action_ids: list[str] = []
    for index, candidate in enumerate(storefront_requests):
        request = _storefront_request(candidate, f"storefrontRequests[{index}]")
        storefront_request_ids.append(request["id"])
        storefront_idempotency_keys.append(request["idempotencyKey"])
        storefront_action_ids.append(f"ACT-{request['id'][4:]}")
    _unique(storefront_request_ids, "Storefront request ID")
    _unique(storefront_idempotency_keys, "Storefront request idempotency key")
    catalog_baseline_action_set = set(catalog_baseline_action_ids)
    for action_id in catalog_baseline_action_set:
        baselines = [
            baseline
            for baseline in catalog_baseline_by_sku.values()
            if baseline["proof"]["actionId"] == action_id
        ]
        matching_changes = [
            change
            for change in catalog_changes
            if change["proof"]["actionId"] == action_id
        ]
        matching_movements = movements_by_action.get(action_id, [])
        if matching_changes and matching_movements:
            raise TrialValidationError(
                f"Catalog baseline action {action_id} cannot anchor two event types."
            )
        if matching_changes:
            baseline = baselines[0] if len(baselines) == 1 else None
            change = matching_changes[0] if len(matching_changes) == 1 else None
            if (
                baseline is None
                or change is None
                or newest_change_by_sku.get(baseline["sku"]) != change
                or change["sku"] != baseline["sku"]
                or change["proof"] != baseline["proof"]
            ):
                raise TrialValidationError(
                    f"Catalog baseline action {action_id} does not match its first catalog change."
                )
        if matching_movements:
            baseline = baselines[0] if len(baselines) == 1 else None
            movement = (
                matching_movements[0]
                if len(matching_movements) == 1
                else None
            )
            proof = baseline["proof"] if baseline is not None else {}
            if (
                baseline is None
                or movement is None
                or movement["kind"] != "opening"
                or movement["sku"] != baseline["sku"]
                or any(
                    movement[movement_field] != proof[proof_field]
                    for movement_field, proof_field in (
                        ("actionId", "actionId"),
                        ("createdAt", "capturedAt"),
                        ("actor", "actor"),
                        ("reason", "reason"),
                        ("evidenceReference", "evidenceReference"),
                    )
                )
            ):
                raise TrialValidationError(
                    f"Catalog baseline action {action_id} does not match its opening balance."
                )
    _unique(
        [
            *(
                action_id
                for action_id in dict.fromkeys(movement_action_ids)
                if action_id not in conversion_action_ids
                and action_id not in return_action_ids
                and action_id not in catalog_baseline_action_set
            ),
            *reconciliation_action_ids,
            *refund_settlement_action_ids,
            *advancement_action_ids,
            *completion_action_ids,
            *return_action_ids,
            *correction_action_ids,
            *intake_action_ids,
            *close_action_ids,
            *purchase_order_action_ids,
            *(
                action_id
                for action_id in catalog_change_action_ids
                if action_id not in catalog_baseline_action_set
            ),
            *catalog_baseline_action_set,
            *tax_configuration_action_ids,
            *account_mapping_configuration_action_ids,
            *storefront_action_ids,
            *(
                [storefront_configuration_action_id]
                if storefront_configuration_action_id
                else []
            ),
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


def _apply_storefront_merchandising_import(
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    if set(payload) != {"commandId", "package", "evidence"}:
        raise TrialValidationError(
            "Ecommerce merchandising import must contain exactly commandId, package, and evidence."
        )
    command_id = _text(payload.get("commandId"), "commandId", maximum=36)
    if _COMMAND_ID_PATTERN.fullmatch(command_id) is None:
        raise TrialValidationError("commandId must be a canonical UUID.")
    try:
        validation = validate_client_import_staging_package(payload.get("package"))
    except ClientImportValidationError as exc:
        raise TrialValidationError("Ecommerce merchandising import package is invalid.") from exc
    if validation.product != "ecommerce" or validation.object_id != "storefront_merchandising":
        raise TrialValidationError("Ecommerce merchandising import package has the wrong product boundary.")
    if not 1 <= validation.row_count <= 8:
        raise TrialValidationError("Ecommerce merchandising import must contain 1 to 8 Shop SKUs.")

    evidence = _object(payload.get("evidence"), "evidence")
    _exact_fields(evidence, "evidence", required=_EVIDENCE_FIELDS)
    validated_evidence = {
        "actionId": _text(evidence["actionId"], "evidence.actionId", maximum=160),
        "capturedAt": _timestamp(evidence["capturedAt"], "evidence.capturedAt"),
        "actor": _text(evidence["actor"], "evidence.actor"),
        "reason": _text(evidence["reason"], "evidence.reason"),
        "evidenceReference": _text(
            evidence["evidenceReference"],
            "evidence.evidenceReference",
        ),
    }
    if (
        validated_evidence["actionId"] != f"ACT-IMPORT-{command_id}"
        or validated_evidence["reason"]
        != "Apply the reviewed Ecommerce merchandising import."
        or validated_evidence["evidenceReference"] != validation.package_digest
    ):
        raise TrialValidationError(
            "Ecommerce merchandising import evidence does not match the reviewed package."
        )

    current_state = validate_commerce_state(current)
    configuration = _storefront_configuration(current_state)
    if configuration is None:
        raise TrialValidationError(
            "Save the Ecommerce storefront name and summary before importing merchandising."
        )
    if configuration["revision"] >= _MAX_SAFE_INTEGER:
        raise TrialValidationError("Ecommerce storefront revision is exhausted.")

    package = payload["package"]
    rows = package["rows"]
    merchandising = sorted(
        (
            {
                "sku": row["values"]["sku"],
                "featured": row["values"]["featured"] == "true",
                "collection": row["values"]["collection"],
                "displayName": row["values"]["displayName"],
                "note": row["values"]["note"],
            }
            for row in rows
        ),
        key=lambda row: row["sku"],
    )
    selected_skus = [row["sku"] for row in merchandising]
    item_skus = {item["sku"] for item in current_state["items"]}
    if any(sku not in item_skus for sku in selected_skus):
        raise TrialValidationError(
            "Every imported Ecommerce SKU must exist in the current Shop catalog."
        )

    catalog_digest = commerce_catalog_digest(current_state)
    if (
        configuration["shopCatalogDigest"] == catalog_digest
        and configuration["selectedSkus"] == selected_skus
        and configuration.get("merchandising") == merchandising
    ):
        raise TrialValidationError(
            "The reviewed Ecommerce merchandising import does not change the storefront."
        )
    revision = configuration["revision"] + 1
    catalog_revision = configuration["shopCatalogSnapshotRevision"]
    if configuration["shopCatalogDigest"] != catalog_digest:
        if catalog_revision >= _MAX_SAFE_INTEGER:
            raise TrialValidationError("Shop catalog snapshot revision is exhausted.")
        catalog_revision += 1
    next_state = deepcopy(current_state)
    next_state["storefrontConfiguration"] = {
        "schema": "supermega.ecommerce.storefront.v1",
        "revision": revision,
        "shopCatalogSnapshotRevision": catalog_revision,
        "shopCatalogDigest": catalog_digest,
        "storeName": configuration["storeName"],
        "summary": configuration["summary"],
        "selectedSkus": selected_skus,
        "merchandising": merchandising,
        "activation": {
            "contract": "supermega.ecommerce.activation.v1",
            "packageDigest": validation.package_digest,
            "workflowTemplateId": validation.workflow_template_id,
            "confirmedAt": validated_evidence["capturedAt"],
            "skus": selected_skus,
        },
        "saved": {
            "actionId": _storefront_configuration_action_id(revision, catalog_digest),
            "capturedAt": validated_evidence["capturedAt"],
            "actor": validated_evidence["actor"],
            "reason": validated_evidence["reason"],
            "evidenceReference": f"ECOMMERCE-STOREFRONT:{catalog_digest}:R{revision}",
        },
    }
    return validate_commerce_state(next_state)


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
    if (
        event_type
        in {"commerce.order.created", "commerce.website_intake.converted"}
        and next_state["orders"][0].get("owner") != evidence["actor"]
    ):
        raise TrialValidationError(
            "command evidence actor must be the new order owner."
        )
    if event_type == "commerce.item.updated":
        changes = _catalog_changes(next_state)
        proof = changes[0]["proof"] if changes else {}
        if not isinstance(proof, Mapping) or not _proof_matches_evidence(
            proof,
            evidence,
        ):
            raise TrialValidationError(
                "command evidence must match the catalog change proof."
            )
    elif event_type == "commerce.website_intake.created":
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
    elif event_type == "commerce.storefront_request.received":
        request = next_state["storefrontRequests"][0]
        if (
            evidence["actionId"] != f"ACT-{request['id'][4:]}"
            or evidence["capturedAt"] != request["createdAt"]
            or evidence["evidenceReference"]
            != f"ECOMMERCE:{request['id']}:{request['sourcePreviewDigest']}"
        ):
            raise TrialValidationError("command evidence must match the retained Ecommerce request receipt.")
    elif event_type == "commerce.storefront.configuration.saved":
        saved = next_state["storefrontConfiguration"]["saved"]
        if not _proof_matches_evidence(saved, evidence):
            raise TrialValidationError(
                "command evidence must match the saved Ecommerce storefront configuration."
            )
    elif event_type == "commerce.tax_configuration.saved":
        proof = next_state["taxConfigurations"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved tax configuration proof."
            )
    elif event_type == "commerce.account_mapping.saved":
        proof = next_state["accountMappingConfigurations"][0]["proof"]
        if not _proof_matches_evidence(proof, evidence):
            raise TrialValidationError(
                "command evidence must match the saved account mapping proof."
            )
    elif event_type == "commerce.service_schedule.initialized":
        schedule = next_state["serviceSchedule"]
        pack_id = schedule["industryPackId"]
        if (
            evidence["actionId"] != f"ACT-SERVICE-SCHEDULE-INIT-{pack_id.upper()}"
            or evidence["reason"] != f"Initialize the reviewed {pack_id} Shop industry pack."
            or evidence["evidenceReference"] != f"SHOP-SERVICE-SCHEDULE:{pack_id}:R0"
        ):
            raise TrialValidationError(
                "command evidence must match the initialized service schedule pack."
            )
    elif event_type == "commerce.service_schedule.saved":
        schedule = next_state["serviceSchedule"]
        latest = schedule["events"][-1]
        revision = schedule["revision"]
        if (
            latest["actor"] != evidence["actor"]
            or latest["reason"] != evidence["reason"]
            or latest["happenedAt"] != evidence["capturedAt"]
            or evidence["actionId"] != f"ACT-SERVICE-SCHEDULE-R{revision}"
            or evidence["evidenceReference"] != f"SHOP-SERVICE-SCHEDULE:R{revision}"
        ):
            raise TrialValidationError(
                "command evidence must match the saved service schedule revision."
            )
    elif event_type == "commerce.purchase_order.created":
        creation = next_state["purchaseOrders"][0]["creation"]
        if not _proof_matches_evidence(creation, evidence):
            raise TrialValidationError(
                "command evidence must match the purchase order creation proof."
            )
    elif event_type == "commerce.purchase_order.cancelled":
        _, cancelled_purchase_order = _one_changed(
            _purchase_orders(current),
            _purchase_orders(next_state),
            "purchaseOrders",
        )
        cancellation = cancelled_purchase_order.get("cancellation")
        if not isinstance(cancellation, Mapping) or not _proof_matches_evidence(
            cancellation,
            evidence,
        ):
            raise TrialValidationError(
                "command evidence must match the purchase order cancellation proof."
            )
    elif event_type == "commerce.order.advanced":
        _, advanced_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        completion = advanced_order.get("completion")
        if advanced_order["status"] == "completed":
            if (
                not isinstance(completion, Mapping)
                or not _proof_matches_evidence(completion, evidence)
            ):
                raise TrialValidationError(
                    "command evidence must match the order completion proof."
                )
        else:
            advancement_action_ids = advanced_order.get(
                "advancementActionIds"
            )
            if (
                not isinstance(advancement_action_ids, list)
                or not advancement_action_ids
                or advancement_action_ids[-1] != evidence["actionId"]
            ):
                raise TrialValidationError(
                    "command evidence must match the order advancement action ID."
                )
    elif event_type == "commerce.order.return_recorded":
        _, returned_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        returns = returned_order.get("returns")
        record = returns[0] if isinstance(returns, list) and returns else {}
        if any(
            record.get(record_field) != evidence[evidence_field]
            for record_field, evidence_field in (
                ("actionId", "actionId"),
                ("createdAt", "capturedAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        ):
            raise TrialValidationError(
                "command evidence must match the order return proof."
            )
    elif event_type == "commerce.order.correction_recorded":
        _, corrected_order = _one_changed(
            current["orders"],
            next_state["orders"],
            "orders",
        )
        corrections = corrected_order.get("corrections")
        record = corrections[0] if isinstance(corrections, list) and corrections else {}
        if any(
            record.get(record_field) != evidence[evidence_field]
            for record_field, evidence_field in (
                ("actionId", "actionId"),
                ("createdAt", "capturedAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        ):
            raise TrialValidationError(
                "command evidence must match the order correction proof."
            )
    elif event_type in {
        "commerce.inventory.initialized",
        "commerce.inventory.transferred",
        "commerce.stock.counted",
    } and (
        event_type != "commerce.stock.counted"
        or _inventory_foundation(current) is not None
    ):
        foundation = _inventory_foundation(next_state)
        commands = foundation.get("commands") if foundation is not None else None
        expected_location_kind = {
            "commerce.inventory.initialized": "import",
            "commerce.inventory.transferred": "transfer",
            "commerce.stock.counted": "count",
        }[event_type]
        latest_payload = (
            commands[-1].get("payload", {})
            if isinstance(commands, list)
            and commands
            and isinstance(commands[-1], Mapping)
            else {}
        )
        proof = (
            latest_payload.get("proof", {})
            if isinstance(latest_payload, Mapping)
            else {}
        )
        if (
            not isinstance(latest_payload, Mapping)
            or latest_payload.get("kind") != expected_location_kind
            or not isinstance(proof, Mapping)
            or not _proof_matches_evidence(proof, evidence)
        ):
            raise TrialValidationError(
                "command evidence must match the location inventory proof."
            )

    location_order_kind = {
        "commerce.order.created": "order_reserve",
        "commerce.order.cancelled": "order_release",
        "commerce.website_intake.converted": "order_reserve",
    }.get(event_type)
    if event_type == "commerce.order.advanced":
        _, advanced_order = _one_changed(
            current["orders"], next_state["orders"], "orders"
        )
        if advanced_order["status"] == "completed":
            location_order_kind = "order_fulfil"
    if location_order_kind and _inventory_foundation(current) is not None:
        foundation = _inventory_foundation(next_state)
        commands = foundation.get("commands") if foundation is not None else None
        payload = (
            commands[-1].get("payload", {})
            if isinstance(commands, list)
            and commands
            and isinstance(commands[-1], Mapping)
            else {}
        )
        location_proof = payload.get("proof") if isinstance(payload, Mapping) else None
        if (
            not isinstance(payload, Mapping)
            or payload.get("kind") != location_order_kind
            or not isinstance(location_proof, Mapping)
            or not _proof_matches_evidence(location_proof, evidence)
        ):
            raise TrialValidationError(
                "command evidence must match the order location proof."
            )

    movement_kind = {
        "commerce.item.created": "opening",
        "commerce.order.created": "reserve",
        "commerce.order.cancelled": "release",
        "commerce.stock.received": "receipt",
        "commerce.stock.counted": "count",
        "commerce.production_material.issued": "production_issue",
        "commerce.production_batch.received": "production_receipt",
        "commerce.purchase_order.received": "receipt",
        "commerce.website_intake.converted": "reserve",
    }.get(event_type)
    if movement_kind:
        added_count = len(next_state["movements"]) - len(current["movements"])
        added_movements = next_state["movements"][:added_count]
        if not added_movements or any(
            movement.get("kind") != movement_kind
            or any(
                movement.get(movement_field) != evidence[evidence_field]
                for movement_field, evidence_field in (
                    ("actionId", "actionId"),
                    ("createdAt", "capturedAt"),
                    ("actor", "actor"),
                    ("reason", "reason"),
                    ("evidenceReference", "evidenceReference"),
                )
            )
            for movement in added_movements
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


def _changed_records(
    current: list[Any],
    next_values: list[Any],
    field: str,
) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    if len(current) != len(next_values):
        raise TrialValidationError(
            f"{field} must preserve its record count for this event."
        )
    changes: list[tuple[dict[str, Any], dict[str, Any]]] = []
    identity_field = "sku" if field == "items" else "id"
    for index, (before_value, after_value) in enumerate(
        zip(current, next_values, strict=True)
    ):
        before = _object(before_value, f"current {field}[{index}]")
        after = _object(after_value, f"next {field}[{index}]")
        if before.get(identity_field) != after.get(identity_field):
            raise TrialValidationError(f"{field} record identity cannot change.")
        if before != after:
            changes.append((before, after))
    return changes


def _without(value: Mapping[str, Any], fields: frozenset[str]) -> dict[str, Any]:
    return {key: nested for key, nested in value.items() if key not in fields}


def _require_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any], *fields: str) -> None:
    changed = [field for field in fields if current[field] != next_state[field]]
    if changed:
        raise TrialValidationError(f"event cannot change: {', '.join(changed)}.")


def _website_intakes(state: Mapping[str, Any]) -> list[Any]:
    return state.get("websiteIntakes", [])


def _storefront_requests(state: Mapping[str, Any]) -> list[Any]:
    return state.get("storefrontRequests", [])


def _storefront_configuration(state: Mapping[str, Any]) -> Mapping[str, Any] | None:
    configuration = state.get("storefrontConfiguration")
    return configuration if isinstance(configuration, Mapping) else None


def _purchase_orders(state: Mapping[str, Any]) -> list[Any]:
    return state.get("purchaseOrders", [])


def _catalog_changes(state: Mapping[str, Any]) -> list[Any]:
    return state.get("catalogChanges", [])


def _tax_configurations(state: Mapping[str, Any]) -> list[Any]:
    return state.get("taxConfigurations", [])


def _effective_tax_configuration(
    state: Mapping[str, Any],
    at_time: str,
) -> Mapping[str, Any] | None:
    at = datetime.fromisoformat(at_time.replace("Z", "+00:00"))
    for candidate in _tax_configurations(state):
        if not isinstance(candidate, Mapping):
            continue
        effective_at = datetime.fromisoformat(
            str(
                candidate.get(
                    "effectiveFrom",
                    candidate["proof"]["capturedAt"],
                )
            ).replace("Z", "+00:00")
        )
        if effective_at <= at:
            return candidate
    return None


def _account_mapping_configurations(state: Mapping[str, Any]) -> list[Any]:
    return state.get("accountMappingConfigurations", [])


def _round_tax(numerator: int, denominator: int) -> int:
    return (numerator * 2 + denominator) // (denominator * 2)


def _configured_order_calculation(
    configuration: Mapping[str, Any],
    listed_subtotal_mmk: int,
    catalog_revision: int,
) -> dict[str, Any] | None:
    if not 1 <= listed_subtotal_mmk <= _MAX_SAFE_INTEGER:
        return None
    rate = int(configuration["rateBasisPoints"])
    mode = str(configuration["mode"])
    tax_mmk = (
        _round_tax(listed_subtotal_mmk * rate, 10_000)
        if mode == "exclusive"
        else _round_tax(listed_subtotal_mmk * rate, 10_000 + rate)
    )
    subtotal_mmk = listed_subtotal_mmk if mode == "exclusive" else listed_subtotal_mmk - tax_mmk
    total_mmk = listed_subtotal_mmk + tax_mmk if mode == "exclusive" else listed_subtotal_mmk
    if subtotal_mmk < 0 or tax_mmk < 0 or not 1 <= total_mmk <= _MAX_SAFE_INTEGER:
        return None
    calculation = {
        "schema": _ORDER_CALCULATION_V2_SCHEMA,
        "currency": "MMK",
        "catalogRevision": catalog_revision,
        "taxConfigurationRevision": configuration["revision"],
        "taxCode": configuration["code"],
        "taxRateBasisPoints": rate,
        "taxMode": mode,
        "listedSubtotalMmk": listed_subtotal_mmk,
        "subtotalMmk": subtotal_mmk,
        "taxMmk": tax_mmk,
        "totalMmk": total_mmk,
    }
    if "jurisdictionCode" in configuration and "effectiveFrom" in configuration:
        calculation["taxJurisdictionCode"] = configuration["jurisdictionCode"]
        calculation["taxEffectiveFrom"] = configuration["effectiveFrom"]
    return calculation


def _catalog_baselines(state: Mapping[str, Any]) -> list[Any]:
    return state.get("catalogBaselines", [])


def _storefront_configuration_action_id(revision: int, digest: str) -> str:
    return f"ACT-STOREFRONT-R{revision}-{digest.removeprefix('sha256:')}"


def _proof_digest_projection(proof: Mapping[str, Any]) -> list[Any]:
    return [
        proof["actionId"],
        proof["capturedAt"],
        proof["actor"],
        proof["reason"],
        proof["evidenceReference"],
    ]


def _projection_digest(projection: Sequence[Any]) -> str:
    encoded = json.dumps(
        projection,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def commerce_order_calculation_digest(order: Mapping[str, Any]) -> str | None:
    calculation = order.get("calculation")
    if not isinstance(calculation, Mapping):
        return None
    return _projection_digest(
        [
            "supermega.commerce.order-calculation.snapshot.v1",
            order["id"],
            calculation,
        ]
    )


def _correction_calculation(
    order: Mapping[str, Any],
    listed_amount_mmk: int,
) -> dict[str, Any] | None:
    calculation = order.get("calculation")
    if (
        not isinstance(calculation, Mapping)
        or isinstance(listed_amount_mmk, bool)
        or not isinstance(listed_amount_mmk, int)
        or not 1 <= listed_amount_mmk <= _MAX_SAFE_INTEGER
    ):
        return None
    if calculation.get("schema") == _ORDER_CALCULATION_SCHEMA:
        return {
            "currency": "MMK",
            "taxConfigurationRevision": None,
            "taxCode": None,
            "taxRateBasisPoints": None,
            "taxMode": "not_configured",
            "listedAmountMmk": listed_amount_mmk,
            "subtotalMmk": listed_amount_mmk,
            "taxMmk": 0,
            "totalMmk": listed_amount_mmk,
        }
    configured = _configured_order_calculation(
        {
            "revision": calculation["taxConfigurationRevision"],
            "code": calculation["taxCode"],
            "rateBasisPoints": calculation["taxRateBasisPoints"],
            "mode": calculation["taxMode"],
            **(
                {
                    "jurisdictionCode": calculation["taxJurisdictionCode"],
                    "effectiveFrom": calculation["taxEffectiveFrom"],
                }
                if "taxJurisdictionCode" in calculation
                and "taxEffectiveFrom" in calculation
                else {}
            ),
        },
        listed_amount_mmk,
        int(calculation["catalogRevision"]),
    )
    if configured is None:
        return None
    result = {
        "currency": configured["currency"],
        "taxConfigurationRevision": configured["taxConfigurationRevision"],
        "taxCode": configured["taxCode"],
        "taxRateBasisPoints": configured["taxRateBasisPoints"],
        "taxMode": configured["taxMode"],
        "listedAmountMmk": configured["listedSubtotalMmk"],
        "subtotalMmk": configured["subtotalMmk"],
        "taxMmk": configured["taxMmk"],
        "totalMmk": configured["totalMmk"],
    }
    if "taxJurisdictionCode" in configured and "taxEffectiveFrom" in configured:
        result["taxJurisdictionCode"] = configured["taxJurisdictionCode"]
        result["taxEffectiveFrom"] = configured["taxEffectiveFrom"]
    return result


def _order_adjusted_total(order: Mapping[str, Any]) -> int | None:
    total = int(order["total"])
    for correction in order.get("corrections", []):
        amount = int(correction["calculation"]["totalMmk"])
        total += amount if correction["kind"] == "debit" else -amount
        if not 0 <= total <= _MAX_SAFE_INTEGER:
            return None
    return total


def commerce_catalog_baseline_digest(baseline: Mapping[str, Any]) -> str:
    """Bind one opening price and reorder snapshot to its accountable proof."""

    return _projection_digest(
        [
            "supermega.commerce.catalog-baseline.v1",
            baseline["sku"],
            baseline["price"],
            baseline["reorderAt"],
            _proof_digest_projection(baseline["proof"]),
        ]
    )


def commerce_website_intake_snapshot_digest(intake: Mapping[str, Any]) -> str:
    """Bind the immutable Website intake fields retained for later review."""

    source = intake["source"]
    return _projection_digest(
        [
            "supermega.commerce.website-intake.snapshot.v1",
            intake["id"],
            intake["createdAt"],
            [
                source["fingerprint"],
                source["approvalId"],
                source["snapshotId"],
                source["pageId"],
                source["siteName"],
                source["pagePath"],
            ],
            intake["sku"],
            intake["quantity"],
            intake["itemName"],
            intake.get("itemVariant"),
            intake["unitPrice"],
            intake["total"],
            _proof_digest_projection(intake["creation"]),
        ]
    )


def commerce_catalog_digest(state: Mapping[str, Any]) -> str:
    projection = [
        [
            item["sku"],
            item["name"],
            item.get("variant"),
            item["price"],
        ]
        for item in sorted(state["items"], key=lambda item: item["sku"])
    ]
    encoded = json.dumps(
        projection,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def commerce_daily_close_export(
    state: Mapping[str, Any],
    close_id: str,
) -> dict[str, Any] | None:
    """Project one attributable close into a deterministic, PII-minimised ledger artifact."""

    current = validate_commerce_state(state)
    close = next(
        (candidate for candidate in current["closes"] if candidate["id"] == close_id),
        None,
    )
    if close is None or not _CLOSE_SNAPSHOT_FIELDS.issubset(close):
        return None
    order_by_id = {order["id"]: order for order in current["orders"]}
    close_at = datetime.fromisoformat(close["createdAt"].replace("Z", "+00:00"))
    if any(
        _commerce_order_close_basis(order_by_id[order_id]) > close_at
        for order_id in close["orderIds"]
    ):
        return None
    rows: list[dict[str, Any]] = []
    for order_id in close["orderIds"]:
        order = order_by_id[order_id]
        calculation = order.get("calculation")
        accepted_calculation = isinstance(calculation, Mapping)
        corrections = [
            {
                "documentId": correction["documentId"],
                "kind": correction["kind"],
                "reasonCode": correction["reasonCode"],
                "createdAt": correction["createdAt"],
                "actor": correction["actor"],
                "evidenceReference": correction["evidenceReference"],
                "sourceCalculationDigest": correction["sourceCalculationDigest"],
                "listedAmountMmk": correction["calculation"]["listedAmountMmk"],
                "subtotalMmk": correction["calculation"]["subtotalMmk"],
                "taxMmk": correction["calculation"]["taxMmk"],
                "totalMmk": correction["calculation"]["totalMmk"],
                "balanceAfterMmk": correction["balanceAfterMmk"],
                "financialStatus": correction["financialStatus"],
                "postingAuthority": correction["postingAuthority"],
                "externalPostingPerformed": correction["externalPostingPerformed"],
            }
            for correction in order.get("corrections", [])
        ]
        adjusted_total = _order_adjusted_total(order)
        if adjusted_total is None:
            return None
        rows.append(
            {
                "orderId": order["id"],
                "orderCreatedAt": order["createdAt"],
                "paymentMethod": order["payment"],
                "paymentReconciledAt": order.get("paymentReconciledAt"),
                "paymentEvidenceReference": order.get("paymentEvidenceReference"),
                "currency": calculation["currency"] if accepted_calculation else "MMK",
                "catalogRevision": calculation["catalogRevision"] if accepted_calculation else None,
                "taxConfigurationRevision": (
                    calculation.get("taxConfigurationRevision")
                    if accepted_calculation
                    else None
                ),
                "taxCode": calculation.get("taxCode") if accepted_calculation else None,
                "taxJurisdictionCode": (
                    calculation.get("taxJurisdictionCode")
                    if accepted_calculation
                    else None
                ),
                "taxEffectiveFrom": (
                    calculation.get("taxEffectiveFrom")
                    if accepted_calculation
                    else None
                ),
                "taxRateBasisPoints": (
                    calculation.get("taxRateBasisPoints")
                    if accepted_calculation
                    else None
                ),
                "listedSubtotalMmk": (
                    calculation.get("listedSubtotalMmk")
                    if accepted_calculation
                    else None
                ),
                "subtotalMmk": calculation["subtotalMmk"] if accepted_calculation else None,
                "taxMode": calculation["taxMode"] if accepted_calculation else "not_recorded",
                "taxMmk": calculation["taxMmk"] if accepted_calculation else None,
                "originalTotalMmk": order["total"],
                "totalMmk": adjusted_total,
                "corrections": corrections,
                "calculationStatus": "accepted" if accepted_calculation else "legacy_unverified",
            }
        )
    artifact: dict[str, Any] = {
        "schema": COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA,
        "closeId": close["id"],
        "businessDate": close["businessDate"],
        "closedAt": close["createdAt"],
        "actionId": close["actionId"],
        "operator": close["operator"],
        "reason": close["reason"],
        "evidenceReference": close["evidenceReference"],
        "totalMmk": close["total"],
        "orderCount": close["orders"],
        "paymentExceptionOrderIds": list(close["paymentExceptionOrderIds"]),
        "stockExceptionSkus": list(close["stockExceptionSkus"]),
        "orders": rows,
    }
    artifact["digest"] = _projection_digest(
        [
            artifact["schema"],
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            artifact["actionId"],
            artifact["operator"],
            artifact["reason"],
            artifact["evidenceReference"],
            artifact["totalMmk"],
            artifact["orderCount"],
            artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"],
            [
                [
                    row["orderId"],
                    row["orderCreatedAt"],
                    row["paymentMethod"],
                    row["paymentReconciledAt"],
                    row["paymentEvidenceReference"],
                    row["currency"],
                    row["catalogRevision"],
                    row["taxConfigurationRevision"],
                    row["taxCode"],
                    row["taxJurisdictionCode"],
                    row["taxEffectiveFrom"],
                    row["taxRateBasisPoints"],
                    row["listedSubtotalMmk"],
                    row["subtotalMmk"],
                    row["taxMode"],
                    row["taxMmk"],
                    row["originalTotalMmk"],
                    row["totalMmk"],
                    [
                        [
                            correction["documentId"],
                            correction["kind"],
                            correction["reasonCode"],
                            correction["createdAt"],
                            correction["actor"],
                            correction["evidenceReference"],
                            correction["sourceCalculationDigest"],
                            correction["listedAmountMmk"],
                            correction["subtotalMmk"],
                            correction["taxMmk"],
                            correction["totalMmk"],
                            correction["balanceAfterMmk"],
                            correction["financialStatus"],
                            correction["postingAuthority"],
                            correction["externalPostingPerformed"],
                        ]
                        for correction in row["corrections"]
                    ],
                    row["calculationStatus"],
                ]
                for row in rows
            ],
        ]
    )
    return artifact


def _commerce_csv_cell(value: Any) -> str:
    if isinstance(value, list):
        raw = ";".join(str(entry) for entry in value)
    elif value is None:
        raw = ""
    else:
        raw = str(value)
    if raw.startswith(("=", "+", "-", "@")):
        raw = f"'{raw}"
    return f'"{raw.replace(chr(34), chr(34) * 2)}"'


def commerce_daily_close_csv(
    state: Mapping[str, Any],
    close_id: str,
) -> str | None:
    """Render the trusted close projection as a formula-safe deterministic CSV."""

    artifact = commerce_daily_close_export(state, close_id)
    if artifact is None:
        return None
    header = [
        "schema",
        "record_type",
        "close_id",
        "business_date",
        "closed_at",
        "operator",
        "evidence_reference",
        "order_id",
        "order_created_at",
        "payment_method",
        "payment_reconciled_at",
        "payment_evidence_reference",
        "currency",
        "catalog_revision",
        "tax_configuration_revision",
        "tax_code",
        "tax_jurisdiction_code",
        "tax_effective_from",
        "tax_rate_basis_points",
        "listed_subtotal_mmk",
        "subtotal_mmk",
        "tax_mode",
        "tax_mmk",
        "original_total_mmk",
        "total_mmk",
        "corrections_json",
        "calculation_status",
        "payment_exception_order_ids",
        "stock_exception_skus",
        "artifact_digest",
    ]
    rows: list[list[Any]] = [
        [
            artifact["schema"],
            "close",
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            artifact["operator"],
            artifact["evidenceReference"],
            None,
            None,
            None,
            None,
            None,
            "MMK",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            artifact["totalMmk"],
            None,
            None,
            artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"],
            artifact["digest"],
        ]
    ]
    rows.extend(
        [
            artifact["schema"],
            "order",
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            None,
            None,
            row["orderId"],
            row["orderCreatedAt"],
            row["paymentMethod"],
            row["paymentReconciledAt"],
            row["paymentEvidenceReference"],
            row["currency"],
            row["catalogRevision"],
            row["taxConfigurationRevision"],
            row["taxCode"],
            row["taxJurisdictionCode"],
            row["taxEffectiveFrom"],
            row["taxRateBasisPoints"],
            row["listedSubtotalMmk"],
            row["subtotalMmk"],
            row["taxMode"],
            row["taxMmk"],
            row["originalTotalMmk"],
            row["totalMmk"],
            json.dumps(row["corrections"], ensure_ascii=False, separators=(",", ":")),
            row["calculationStatus"],
            None,
            None,
            artifact["digest"],
        ]
        for row in artifact["orders"]
    )
    return "\r\n".join(
        ",".join(_commerce_csv_cell(cell) for cell in row)
        for row in [header, *rows]
    ) + "\r\n"


def commerce_accounting_handoff(
    state: Mapping[str, Any],
    close_id: str,
) -> dict[str, Any] | None:
    """Create a balanced, review-only accounting handoff using close-effective mappings."""

    current = validate_commerce_state(state)
    close_export = commerce_daily_close_export(current, close_id)
    if close_export is None:
        return None
    if any(order["corrections"] for order in close_export["orders"]):
        return None
    closed_at = datetime.fromisoformat(close_export["closedAt"].replace("Z", "+00:00"))
    account_mapping = next(
        (
            configuration
            for configuration in _account_mapping_configurations(current)
            if datetime.fromisoformat(
                configuration["proof"]["capturedAt"].replace("Z", "+00:00")
            )
            <= closed_at
        ),
        None,
    )
    account_code_by_role = {
        mapping["accountRole"]: mapping["externalAccountCode"]
        for mapping in account_mapping["mappings"]
    } if account_mapping is not None else {}
    mapping_status = "mapped" if account_mapping is not None else "unmapped"
    payment_groups: dict[str, dict[str, Any]] = {}
    accepted_subtotal_mmk = 0
    accepted_tax_mmk = 0
    legacy_unverified_mmk = 0
    accepted_order_count = 0
    legacy_unverified_order_count = 0
    tax_configured_order_count = 0
    for order in close_export["orders"]:
        payment = payment_groups.setdefault(
            order["paymentMethod"],
            {"amountMmk": 0, "statuses": set()},
        )
        payment["amountMmk"] += order["totalMmk"]
        payment["statuses"].add(order["calculationStatus"])
        if (
            order["calculationStatus"] == "accepted"
            and order["subtotalMmk"] is not None
            and order["taxMmk"] is not None
        ):
            accepted_order_count += 1
            accepted_subtotal_mmk += order["subtotalMmk"]
            accepted_tax_mmk += order["taxMmk"]
            if order["taxMode"] != "not_configured":
                tax_configured_order_count += 1
        else:
            legacy_unverified_order_count += 1
            legacy_unverified_mmk += order["totalMmk"]

    entries: list[dict[str, Any]] = []
    for index, payment_method in enumerate(sorted(payment_groups), start=1):
        group = payment_groups[payment_method]
        statuses = group["statuses"]
        entries.append(
            {
                "lineId": f"DEBIT-{index:03d}",
                "side": "debit",
                "accountRole": "payment_clearing",
                "externalAccountCode": account_code_by_role.get("payment_clearing"),
                "paymentMethod": payment_method,
                "calculationStatus": "mixed" if len(statuses) > 1 else next(iter(statuses)),
                "amountMmk": group["amountMmk"],
                "mappingStatus": mapping_status,
            }
        )
    credits: list[dict[str, Any]] = []
    if accepted_subtotal_mmk:
        credits.append(
            {
                "side": "credit",
                "accountRole": "sales_revenue",
                "externalAccountCode": account_code_by_role.get("sales_revenue"),
                "paymentMethod": None,
                "calculationStatus": "accepted",
                "amountMmk": accepted_subtotal_mmk,
                "mappingStatus": mapping_status,
            }
        )
    if accepted_tax_mmk:
        credits.append(
            {
                "side": "credit",
                "accountRole": "tax_payable",
                "externalAccountCode": account_code_by_role.get("tax_payable"),
                "paymentMethod": None,
                "calculationStatus": "accepted",
                "amountMmk": accepted_tax_mmk,
                "mappingStatus": mapping_status,
            }
        )
    if legacy_unverified_mmk:
        credits.append(
            {
                "side": "credit",
                "accountRole": "sales_revenue_unverified",
                "externalAccountCode": account_code_by_role.get("sales_revenue_unverified"),
                "paymentMethod": None,
                "calculationStatus": "legacy_unverified",
                "amountMmk": legacy_unverified_mmk,
                "mappingStatus": mapping_status,
            }
        )
    entries.extend(
        {**entry, "lineId": f"CREDIT-{index:03d}"}
        for index, entry in enumerate(credits, start=1)
    )
    total_debit_mmk = sum(entry["amountMmk"] for entry in entries if entry["side"] == "debit")
    total_credit_mmk = sum(entry["amountMmk"] for entry in entries if entry["side"] == "credit")
    if total_debit_mmk != close_export["totalMmk"] or total_credit_mmk != close_export["totalMmk"]:
        return None
    artifact: dict[str, Any] = {
        "schema": COMMERCE_ACCOUNTING_HANDOFF_SCHEMA,
        "status": "review_required",
        "postingAuthority": "none",
        "externalPostingPerformed": False,
        "currency": "MMK",
        "closeId": close_export["closeId"],
        "businessDate": close_export["businessDate"],
        "closedAt": close_export["closedAt"],
        "sourceCloseDigest": close_export["digest"],
        "accountMappingRevision": account_mapping["revision"] if account_mapping else None,
        "accountMappingEvidenceReference": account_mapping["proof"]["evidenceReference"] if account_mapping else None,
        "totalDebitMmk": total_debit_mmk,
        "totalCreditMmk": total_credit_mmk,
        "acceptedOrderCount": accepted_order_count,
        "legacyUnverifiedOrderCount": legacy_unverified_order_count,
        "taxConfiguredOrderCount": tax_configured_order_count,
        "paymentExceptionOrderIds": list(close_export["paymentExceptionOrderIds"]),
        "stockExceptionSkus": list(close_export["stockExceptionSkus"]),
        "entries": entries,
    }
    artifact["digest"] = _projection_digest(
        [
            artifact["schema"],
            artifact["status"],
            artifact["postingAuthority"],
            artifact["externalPostingPerformed"],
            artifact["currency"],
            artifact["closeId"],
            artifact["businessDate"],
            artifact["closedAt"],
            artifact["sourceCloseDigest"],
            artifact["accountMappingRevision"],
            artifact["accountMappingEvidenceReference"],
            artifact["totalDebitMmk"],
            artifact["totalCreditMmk"],
            artifact["acceptedOrderCount"],
            artifact["legacyUnverifiedOrderCount"],
            artifact["taxConfiguredOrderCount"],
            artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"],
            [
                [
                    entry["lineId"],
                    entry["side"],
                    entry["accountRole"],
                    entry["externalAccountCode"],
                    entry["paymentMethod"],
                    entry["calculationStatus"],
                    entry["amountMmk"],
                    entry["mappingStatus"],
                ]
                for entry in entries
            ],
        ]
    )
    return artifact


def commerce_accounting_handoff_csv(artifact: Mapping[str, Any]) -> str:
    """Render one derived accounting handoff as a formula-safe deterministic CSV."""

    header = [
        "schema", "status", "posting_authority", "external_posting_performed",
        "close_id", "business_date", "closed_at", "currency", "source_close_digest",
        "account_mapping_revision", "account_mapping_evidence_reference", "line_id",
        "side", "account_role", "external_account_code", "payment_method",
        "calculation_status", "amount_mmk", "mapping_status", "accepted_order_count",
        "legacy_unverified_order_count", "tax_configured_order_count",
        "payment_exception_order_ids", "stock_exception_skus", "artifact_digest",
    ]
    rows = [
        [
            artifact["schema"], artifact["status"], artifact["postingAuthority"],
            str(artifact["externalPostingPerformed"]).lower(), artifact["closeId"],
            artifact["businessDate"], artifact["closedAt"], artifact["currency"],
            artifact["sourceCloseDigest"], artifact["accountMappingRevision"],
            artifact["accountMappingEvidenceReference"], entry["lineId"], entry["side"],
            entry["accountRole"], entry["externalAccountCode"], entry["paymentMethod"],
            entry["calculationStatus"], entry["amountMmk"], entry["mappingStatus"],
            artifact["acceptedOrderCount"], artifact["legacyUnverifiedOrderCount"],
            artifact["taxConfiguredOrderCount"], artifact["paymentExceptionOrderIds"],
            artifact["stockExceptionSkus"], artifact["digest"],
        ]
        for entry in artifact["entries"]
    ]
    return "\r\n".join(
        ",".join(_commerce_csv_cell(cell) for cell in row)
        for row in [header, *rows]
    ) + "\r\n"


def _configured_storefront_preview_digest(
    state: Mapping[str, Any],
    configuration: Mapping[str, Any],
) -> str:
    item_by_sku = {item["sku"]: item for item in state["items"]}
    merchandising_by_sku = {
        row["sku"]: row for row in configuration.get("merchandising", [])
    }

    def preview_item(sku: str) -> dict[str, Any]:
        item = item_by_sku[sku]
        merchandising = merchandising_by_sku.get(sku)
        projected = {
            "sku": item["sku"],
            "name": item["name"],
            "variant": item.get("variant"),
            "unitPriceMmk": item["price"],
            "availability": "available" if item["onHand"] > 0 else "sold_out",
        }
        if merchandising is not None:
            projected["merchandising"] = {
                "featured": merchandising["featured"],
                "collection": merchandising["collection"],
                "displayName": merchandising["displayName"],
                "note": merchandising["note"],
            }
        return projected

    preview = {
        "schema": _STOREFRONT_PREVIEW_SCHEMA,
        "mode": "browser-local-preview",
        "sourceCatalogSchema": COMMERCE_SCHEMA,
        "storeName": configuration["storeName"],
        "summary": configuration["summary"],
        "currency": "MMK",
        "items": [preview_item(sku) for sku in configuration["selectedSkus"]],
    }
    encoded = json.dumps(
        preview,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def commerce_storefront_preview_digest(state: Mapping[str, Any]) -> str:
    """Return the digest of the saved storefront rendered from the current Shop state."""

    current = validate_commerce_state(state)
    configuration = _storefront_configuration(current)
    if configuration is None:
        raise TrialValidationError(
            "a saved storefront configuration is required before its preview can be bound."
        )
    if configuration["shopCatalogDigest"] != commerce_catalog_digest(current):
        raise TrialValidationError(
            "the saved storefront configuration does not match the current Shop catalog."
        )
    return _configured_storefront_preview_digest(current, configuration)


def _require_website_intakes_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if _website_intakes(current) != _website_intakes(next_state):
        raise TrialValidationError("event cannot change: websiteIntakes.")


def _require_storefront_requests_unchanged(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    if _storefront_requests(current) != _storefront_requests(next_state):
        raise TrialValidationError("event cannot change: storefrontRequests.")


def _require_storefront_configuration_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _storefront_configuration(current) != _storefront_configuration(next_state):
        raise TrialValidationError("event cannot change: storefrontConfiguration.")


def _require_purchase_orders_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _purchase_orders(current) != _purchase_orders(next_state):
        raise TrialValidationError("event cannot change: purchaseOrders.")


def _require_catalog_changes_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _catalog_changes(current) != _catalog_changes(next_state):
        raise TrialValidationError("event cannot change: catalogChanges.")


def _require_catalog_baselines_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _catalog_baselines(current) != _catalog_baselines(next_state):
        raise TrialValidationError("event cannot change: catalogBaselines.")


def _require_tax_configurations_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _tax_configurations(current) != _tax_configurations(next_state):
        raise TrialValidationError("event cannot change: taxConfigurations.")


def _require_account_mapping_configurations_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _account_mapping_configurations(current) != _account_mapping_configurations(next_state):
        raise TrialValidationError(
            "event cannot change: accountMappingConfigurations."
        )


def _inventory_foundation(state: Mapping[str, Any]) -> Mapping[str, Any] | None:
    foundation = state.get("inventoryFoundation")
    return foundation if isinstance(foundation, Mapping) else None


def _require_inventory_foundation_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _inventory_foundation(current) != _inventory_foundation(next_state):
        raise TrialValidationError("event cannot change: inventoryFoundation.")


def _inventory_item_totals(state: Mapping[str, Any]) -> dict[str, int]:
    return {
        str(item["sku"]): int(item["onHand"])
        for item in state["items"]
        if int(item["onHand"]) > 0
    }


def _order_inventory_digest(value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def _order_inventory_command_id(prefix: str, order_id: str) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.order-inventory-command.v1",
            "kind": prefix,
            "orderId": order_id,
        }
    )
    return f"{prefix}-{identity[7:39].upper()}"


def _production_inventory_command_id(request_id: str) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.production-issue-inventory-command.v1",
            "requestId": request_id,
        }
    )
    return f"PIS-{identity[7:39].upper()}"


def _production_receipt_command_id(release_id: str) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.production-receipt-inventory-command.v1",
            "releaseId": release_id,
        }
    )
    return f"PRC-{identity[7:39].upper()}"


def _order_return_inventory_command_id(
    order_id: str, sku: str, action_id: str
) -> str:
    identity = _order_inventory_digest(
        {
            "contract": "supermega.shop.order-return-inventory-command.v1",
            "orderId": order_id,
            "sku": sku,
            "actionId": action_id,
        }
    )
    return f"ORT-{identity[7:39].upper()}"


def _order_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    order: Mapping[str, Any],
    lines: list[dict[str, Any]],
    *,
    kind: str,
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "an order cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "an order cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != kind
    ):
        raise TrialValidationError(
            f"the order must append exactly one {kind} location command."
        )
    command = after["commands"][-1]["payload"]
    prefix = {
        "order_reserve": "ORS",
        "order_release": "ORL",
        "order_fulfil": "ORF",
    }[kind]
    if (
        command.get("orderId") != order["id"]
        or command.get("id") != _order_inventory_command_id(prefix, str(order["id"]))
    ):
        raise TrialValidationError(
            "the location command must use the deterministic changed-order identity."
        )
    expected_lines = {str(line["sku"]): int(line["quantity"]) for line in lines}
    reserve_commands = [
        entry["payload"]
        for entry in (after["commands"] if kind == "order_reserve" else before["commands"])
        if entry["payload"].get("kind") == "order_reserve"
        and entry["payload"].get("orderId") == order["id"]
    ]
    if len(reserve_commands) != 1:
        raise TrialValidationError(
            "the order requires one attributable location reservation command."
        )
    reserve = reserve_commands[0]
    allocations = reserve.get("allocations")
    if not isinstance(allocations, list):
        raise TrialValidationError("the order location allocations are missing.")
    allocated: dict[str, int] = {}
    for allocation in allocations:
        allocation_identity = _order_inventory_digest(
            {
                "contract": "supermega.shop.order-allocation.v1",
                "orderId": order["id"],
                "sku": allocation["sku"],
                "stockUnitId": allocation["stockUnitId"],
                "locationId": allocation["locationId"],
                "quantity": allocation["quantity"],
            }
        )
        if allocation["reservationId"] != f"RES-ORD-{allocation_identity[7:39].upper()}":
            raise TrialValidationError(
                "the order location reservation identity is not deterministic."
            )
        allocated[str(allocation["sku"])] = allocated.get(
            str(allocation["sku"]), 0
        ) + int(allocation["quantity"])
    if kind == "order_reserve":
        expected_allocations: list[dict[str, Any]] = []
        try:
            available_balances = shop_inventory_available_balances(
                before, catalog_skus
            )
        except ShopInventoryValidationError as exc:
            raise TrialValidationError(str(exc)) from exc
        for sku, line_quantity in sorted(expected_lines.items()):
            remaining = line_quantity
            candidates = sorted(
                (
                    balance
                    for balance in available_balances
                    if balance["sku"] == sku
                    and balance["availableToPromise"] > 0
                ),
                key=lambda balance: (
                    -int(balance["availableToPromise"]),
                    f"{balance['locationId']}|{balance['stockUnitId']}",
                ),
            )
            for balance in candidates:
                if remaining == 0:
                    break
                allocated_quantity = min(
                    remaining, int(balance["availableToPromise"])
                )
                expected_allocations.append(
                    {
                        "sku": sku,
                        "stockUnitId": balance["stockUnitId"],
                        "locationId": balance["locationId"],
                        "quantity": allocated_quantity,
                    }
                )
                remaining -= allocated_quantity
            if remaining:
                raise TrialValidationError(
                    f"location stock cannot allocate the complete {sku} order line."
                )
        expected_allocations.sort(
            key=lambda allocation: (
                f"{allocation['sku']}|{allocation['locationId']}|{allocation['stockUnitId']}"
            )
        )
        for allocation in expected_allocations:
            identity = _order_inventory_digest(
                {
                    "contract": "supermega.shop.order-allocation.v1",
                    "orderId": order["id"],
                    **allocation,
                }
            )
            allocation["reservationId"] = f"RES-ORD-{identity[7:39].upper()}"
        if allocations != expected_allocations:
            raise TrialValidationError(
                "the order must use the deterministic fewest-lot location allocation."
            )
    if (
        reserve.get("customerReference") != order["customer"]
        or allocated != expected_lines
    ):
        raise TrialValidationError(
            "the location allocation must match every order line and customer."
        )
    reservation_ids = sorted(
        str(allocation["reservationId"]) for allocation in allocations
    )
    if kind != "order_reserve" and command.get("reservationIds") != reservation_ids:
        raise TrialValidationError(
            "the order closure must identify every original location reservation."
        )
    if before_available != _inventory_item_totals(current):
        raise TrialValidationError(
            "location ATP drifted from aggregate Shop stock before the order action."
        )
    if after_available != _inventory_item_totals(next_state):
        raise TrialValidationError(
            "the order action must conserve aggregate Shop stock against location ATP."
        )
    if kind in {"order_reserve", "order_release"}:
        if before_physical != after_physical:
            raise TrialValidationError(
                "order reserve or release cannot change physical location stock."
            )
    else:
        expected_physical = dict(before_physical)
        for sku, quantity in expected_lines.items():
            retained = expected_physical.get(sku, 0) - quantity
            if retained < 0:
                raise TrialValidationError(
                    "order fulfilment exceeds physical location stock."
                )
            if retained:
                expected_physical[sku] = retained
            else:
                expected_physical.pop(sku, None)
        if after_physical != expected_physical:
            raise TrialValidationError(
                "order fulfilment must consume every allocated line exactly once."
            )


def _order_return_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    order: Mapping[str, Any],
    record: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "an order return cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "a sellable return cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != "order_return"
    ):
        raise TrialValidationError(
            "a sellable return must append exactly one order return location command."
        )
    command = after["commands"][-1]["payload"]
    if (
        command.get("id")
        != _order_return_inventory_command_id(
            str(order["id"]), str(record["sku"]), str(record["actionId"])
        )
        or command.get("orderId") != order["id"]
        or command.get("sku") != record["sku"]
        or command.get("quantity") != record["quantity"]
        or any(
            command["proof"].get(proof_field) != record[record_field]
            for proof_field, record_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the order return location command must match the exact inspected return evidence."
        )
    expected_physical = dict(before_physical)
    expected_physical[str(record["sku"])] = (
        expected_physical.get(str(record["sku"]), 0) + int(record["quantity"])
    )
    if (
        before_available != _inventory_item_totals(current)
        or after_available != _inventory_item_totals(next_state)
        or after_physical != expected_physical
    ):
        raise TrialValidationError(
            "the sellable return must conserve aggregate Shop ATP and exact location stock."
        )


def _validate_inventory_initialized(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if any(
        order["status"] not in {"completed", "cancelled"}
        for order in current["orders"]
    ):
        raise TrialValidationError(
            "active aggregate-stock orders must finish before location inventory setup."
        )
    if _inventory_foundation(current) is not None:
        raise TrialValidationError("Shop location inventory is already initialized.")
    if _without(current, frozenset({"inventoryFoundation"})) != _without(
        next_state, frozenset({"inventoryFoundation"})
    ):
        raise TrialValidationError(
            "commerce.inventory.initialized may change only inventoryFoundation."
        )
    foundation = _inventory_foundation(next_state)
    if foundation is None:
        raise TrialValidationError("Shop location inventory state is required.")
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        validated = validate_shop_inventory_state(
            foundation,
            catalog_skus,
            require_current_catalog_digest=True,
        )
        totals = shop_inventory_sku_totals(validated, catalog_skus)
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        validated["revision"] != 1
        or validated["commands"][0]["payload"]["kind"] != "import"
    ):
        raise TrialValidationError(
            "commerce.inventory.initialized must record exactly one opening import."
        )
    if totals != _inventory_item_totals(current):
        raise TrialValidationError(
            "location opening totals must equal current positive Shop stock."
        )


def _validate_inventory_transferred(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _without(current, frozenset({"inventoryFoundation"})) != _without(
        next_state, frozenset({"inventoryFoundation"})
    ):
        raise TrialValidationError(
            "commerce.inventory.transferred may change only inventoryFoundation."
        )
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None or next_foundation is None:
        raise TrialValidationError("Shop location inventory must be initialized first.")
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_totals = shop_inventory_sku_totals(before, catalog_skus)
        after_totals = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        after["revision"] != before["revision"] + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"]["kind"] != "transfer"
    ):
        raise TrialValidationError(
            "commerce.inventory.transferred must append exactly one transfer command."
        )
    expected = _inventory_item_totals(current)
    if (
        before_totals != after_totals
        or before_available != expected
        or after_available != expected
    ):
        raise TrialValidationError(
            "location ATP drifted from aggregate Shop stock; reconcile before transfer."
        )


def _validate_new_order_and_reservation(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    *,
    event_type: str,
) -> None:
    if len(next_state["orders"]) != len(current["orders"]) + 1 or next_state["orders"][1:] != current["orders"]:
        raise TrialValidationError(f"{event_type} must prepend exactly one order.")
    _require_unchanged(current, next_state, "closes")
    order = next_state["orders"][0]
    calculation = order.get("calculation")
    effective_tax_configuration = _effective_tax_configuration(
        current,
        str(order["createdAt"]),
    )
    expected_calculation_schema = (
        _ORDER_CALCULATION_V2_SCHEMA
        if effective_tax_configuration is not None
        else _ORDER_CALCULATION_SCHEMA
    )
    if (
        not isinstance(calculation, Mapping)
        or calculation.get("catalogRevision") != len(_catalog_changes(current))
        or calculation.get("schema") != expected_calculation_schema
        or (
            effective_tax_configuration is not None
            and calculation.get("taxConfigurationRevision")
            != effective_tax_configuration.get("revision")
        )
    ):
        raise TrialValidationError(
            "a new order requires the current deterministic pricing calculation."
        )
    if order.get("status") != "confirmed" or order.get("paymentStatus") != "pending" or order.get("refundStatus") != "none":
        raise TrialValidationError("a new order must start confirmed with pending payment and no refund exception.")
    if order.get("fulfilment") not in {"pickup", "delivery"}:
        raise TrialValidationError("a new order requires pickup or delivery fulfilment.")
    _text(order.get("owner"), "new order.owner", maximum=120)
    _text(order.get("fulfilmentReference"), "new order.fulfilmentReference", maximum=160)
    promised_at = datetime.fromisoformat(
        _timestamp(order.get("promisedAt"), "new order.promisedAt").replace(
            "Z", "+00:00"
        )
    )
    lines = _reservation_lines(order)
    if not lines:
        raise TrialValidationError("a new order must reference at least one inventory item.")
    if (
        len(next_state["movements"]) != len(current["movements"]) + len(lines)
        or next_state["movements"][len(lines):] != current["movements"]
    ):
        raise TrialValidationError(
            f"{event_type} must prepend one stock reservation per order line."
        )

    item_changes = _changed_records(current["items"], next_state["items"], "items")
    changed_by_sku = {before["sku"]: (before, after) for before, after in item_changes}
    if set(changed_by_sku) != {line["sku"] for line in lines}:
        raise TrialValidationError(
            "a new order may change only the inventory items in its lines."
        )

    captured_lines = {
        line["sku"]: line
        for line in order.get("lines", [])
    }
    for line in lines:
        before_item, after_item = changed_by_sku[line["sku"]]
        captured_line = captured_lines.get(line["sku"])
        if captured_line is not None and (
            captured_line["name"] != before_item["name"]
            or captured_line.get("variant") != before_item.get("variant")
            or captured_line["unitPriceMmk"] != before_item["price"]
        ):
            raise TrialValidationError(
                "a new order line must freeze the current item name, variant, and MMK price."
            )
        if captured_line is None and (
            len(lines) != 1
            or order.get("itemSku") != before_item["sku"]
            or order["item"] != before_item["name"]
            or order["total"] != before_item["price"] * order["quantity"]
        ):
            raise TrialValidationError(
                "a legacy single-item order must match the current catalog item."
            )
        if after_item != {
            **before_item,
            "onHand": before_item["onHand"] - line["quantity"],
        }:
            raise TrialValidationError(
                "a new order must reserve every line's exact quantity from stock."
            )

    added_movements = next_state["movements"][:len(lines)]
    if any(
        promised_at
        <= datetime.fromisoformat(
            str(movement["createdAt"]).replace("Z", "+00:00")
        )
        for movement in added_movements
    ):
        raise TrialValidationError(
            "a new order promise must remain in the future when stock is reserved."
        )
    for index, (line, movement) in enumerate(
        zip(lines, added_movements, strict=True)
    ):
        expected_id = _movement_id(
            movement["actionId"],
            f"L{index + 1}" if len(lines) > 1 else None,
        )
        if (
            movement.get("kind") != "reserve"
            or movement.get("sku") != line["sku"]
            or movement.get("quantityDelta") != -line["quantity"]
            or movement.get("orderId") != order["id"]
            or movement.get("id") != expected_id
        ):
            raise TrialValidationError(
                "a new order requires one exact attributable reservation per line."
            )
    _order_inventory_transition(
        current,
        next_state,
        order,
        lines,
        kind="order_reserve",
    )


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
    if _inventory_foundation(current) is not None and item["onHand"] > 0:
        raise TrialValidationError(
            "location-managed Shop items must start at zero and receive stock through a location."
        )
    movement = next_state["movements"][0]
    current_baselines = _catalog_baselines(current)
    next_baselines = _catalog_baselines(next_state)
    if (
        len(next_baselines) != len(current_baselines) + 1
        or next_baselines[1:] != current_baselines
    ):
        raise TrialValidationError(
            "commerce.item.created must prepend exactly one catalog baseline."
        )
    baseline = next_baselines[0]
    if (
        movement.get("kind") != "opening"
        or movement.get("sku") != item["sku"]
        or movement.get("quantityDelta") != item["onHand"]
        or "orderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError("a new catalog item requires one exact attributable opening balance.")
    if (
        baseline["sku"] != item["sku"]
        or baseline["price"] != item["price"]
        or baseline["reorderAt"] != item["reorderAt"]
        or baseline["proof"]["actionId"] != movement["actionId"]
        or baseline["proof"]["capturedAt"] != movement["createdAt"]
        or baseline["proof"]["actor"] != movement["actor"]
        or baseline["proof"]["reason"] != movement["reason"]
        or baseline["proof"]["evidenceReference"] != movement["evidenceReference"]
    ):
        raise TrialValidationError(
            "a new catalog item baseline must match its exact opening proof."
        )


def _validate_item_updated(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["items"], next_state["items"], "items")
    mutable_fields = frozenset({"price", "reorderAt"})
    if _without(before, mutable_fields) != _without(after, mutable_fields):
        raise TrialValidationError(
            "commerce.item.updated may change only price and reorderAt."
        )

    current_changes = _catalog_changes(current)
    next_changes = _catalog_changes(next_state)
    if (
        len(next_changes) != len(current_changes) + 1
        or next_changes[1:] != current_changes
    ):
        raise TrialValidationError(
            "commerce.item.updated must prepend exactly one catalog change."
        )
    change = next_changes[0]
    if (
        change["sku"] != before["sku"]
        or change["previousPrice"] != before["price"]
        or change["nextPrice"] != after["price"]
        or change["previousReorderAt"] != before["reorderAt"]
        or change["nextReorderAt"] != after["reorderAt"]
    ):
        raise TrialValidationError(
            "catalog change values must match the exact item transition."
        )
    current_baselines = _catalog_baselines(current)
    next_baselines = _catalog_baselines(next_state)
    current_baseline = next(
        (
            baseline
            for baseline in current_baselines
            if baseline["sku"] == before["sku"]
        ),
        None,
    )
    if current_baseline is not None:
        if next_baselines != current_baselines:
            raise TrialValidationError(
                "commerce.item.updated cannot rewrite an existing catalog baseline."
            )
    else:
        if (
            len(next_baselines) != len(current_baselines) + 1
            or next_baselines[1:] != current_baselines
        ):
            raise TrialValidationError(
                "the first catalog update must prepend one anchored baseline."
            )
        baseline = next_baselines[0]
        if (
            baseline["sku"] != before["sku"]
            or baseline["price"] != before["price"]
            or baseline["reorderAt"] != before["reorderAt"]
            or baseline["proof"] != change["proof"]
        ):
            raise TrialValidationError(
                "the first catalog update baseline must match the reviewed prior values and proof."
            )


def _validate_advanced(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before, after = _one_changed(current["orders"], next_state["orders"], "orders")
    if _NEXT_ORDER_STATUS.get(before["status"]) != after["status"]:
        raise TrialValidationError("order status must advance exactly one lifecycle step.")
    if before["status"] == "ready" and before["paymentStatus"] != "reconciled":
        raise TrialValidationError("payment must be reconciled before order completion.")
    if before["status"] == "ready":
        if (
            "completion" not in after
            or _without(before, frozenset({"status"}))
            != _without(after, frozenset({"status", "completion"}))
        ):
            raise TrialValidationError(
                "order completion may add only status and attributable completion proof."
            )
        completion = _action_proof(after["completion"], "completed order.completion")
        latest_basis = max(
            [
                datetime.fromisoformat(
                    str(before["createdAt"]).replace("Z", "+00:00")
                ),
                datetime.fromisoformat(
                    str(before["paymentReconciledAt"]).replace("Z", "+00:00")
                ),
                *[
                    datetime.fromisoformat(
                        str(movement["createdAt"]).replace("Z", "+00:00")
                    )
                    for movement in current["movements"]
                    if movement.get("orderId") == before["id"]
                ],
            ]
        )
        if datetime.fromisoformat(
            completion["capturedAt"].replace("Z", "+00:00")
        ) < latest_basis:
            raise TrialValidationError(
                "order completion proof cannot predate its order activity."
            )
        _order_inventory_transition(
            current,
            next_state,
            before,
            _reservation_lines(before),
            kind="order_fulfil",
        )
    else:
        _require_inventory_foundation_unchanged(current, next_state)
        before_action_ids = list(before.get("advancementActionIds", []))
        after_action_ids = list(after.get("advancementActionIds", []))
        if (
            len(after_action_ids) != len(before_action_ids) + 1
            or after_action_ids[:-1] != before_action_ids
            or _without(
                before,
                frozenset({"status", "advancementActionIds"}),
            )
            != _without(
                after,
                frozenset({"status", "advancementActionIds"}),
            )
        ):
            raise TrialValidationError(
                "order advancement must append one unique action ID."
            )


def _validate_cancelled(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "closes")
    _require_website_intakes_unchanged(current, next_state)
    before_order, after_order = _one_changed(current["orders"], next_state["orders"], "orders")
    if before_order["status"] in {"completed", "cancelled"}:
        raise TrialValidationError("completed or cancelled orders cannot be cancelled.")
    expected_refund = "due" if before_order["paymentStatus"] == "reconciled" else "none"
    if after_order != {**before_order, "status": "cancelled", "refundStatus": expected_refund}:
        raise TrialValidationError("cancellation may change only order status and the required refund exception.")
    lines = _reservation_lines(before_order)
    if not lines:
        raise TrialValidationError(
            "cancellation requires an attributable order reservation."
        )
    if (
        len(next_state["movements"]) != len(current["movements"]) + len(lines)
        or next_state["movements"][len(lines):] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.order.cancelled must prepend one stock release per order line."
        )
    item_changes = _changed_records(current["items"], next_state["items"], "items")
    changed_by_sku = {before["sku"]: (before, after) for before, after in item_changes}
    if set(changed_by_sku) != {line["sku"] for line in lines}:
        raise TrialValidationError(
            "cancellation may change only the inventory items in its order lines."
        )
    for line in lines:
        before_item, after_item = changed_by_sku[line["sku"]]
        if after_item != {
            **before_item,
            "onHand": before_item["onHand"] + line["quantity"],
        }:
            raise TrialValidationError(
                "cancellation must release every line's exact reserved quantity."
            )
    added_movements = next_state["movements"][:len(lines)]
    for index, (line, movement) in enumerate(
        zip(lines, added_movements, strict=True)
    ):
        expected_id = _movement_id(
            str(movement.get("actionId")),
            f"L{index + 1}" if len(lines) > 1 else None,
        )
        if (
            movement.get("kind") != "release"
            or movement.get("sku") != line["sku"]
            or movement.get("orderId") != before_order["id"]
            or movement.get("quantityDelta") != line["quantity"]
            or movement.get("id") != expected_id
        ):
            raise TrialValidationError(
                "cancellation requires one exact attributable stock release per line."
            )
    reserves = [entry for entry in current["movements"] if entry.get("kind") == "reserve" and entry.get("orderId") == before_order["id"]]
    releases = [entry for entry in current["movements"] if entry.get("kind") == "release" and entry.get("orderId") == before_order["id"]]
    if (
        len(reserves) != len(lines)
        or releases
        or any(
            len(
                [
                    reserve
                    for reserve in reserves
                    if reserve.get("sku") == line["sku"]
                    and reserve.get("quantityDelta") == -line["quantity"]
                ]
            )
            != 1
            for line in lines
        )
    ):
        raise TrialValidationError(
            "cancellation requires one unmatched reservation per order line."
        )
    _order_inventory_transition(
        current,
        next_state,
        before_order,
        lines,
        kind="order_release",
    )


def _validate_return_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(
        current["orders"],
        next_state["orders"],
        "orders",
    )
    if before_order["status"] != "completed" or "completion" not in before_order:
        raise TrialValidationError(
            "returns require an order with attributable completion proof."
        )
    before_returns = before_order.get("returns", [])
    after_returns = after_order.get("returns")
    if (
        not isinstance(after_returns, list)
        or len(after_returns) != len(before_returns) + 1
        or after_returns[1:] != before_returns
        or _without(before_order, frozenset({"returns"}))
        != _without(after_order, frozenset({"returns"}))
    ):
        raise TrialValidationError(
            "commerce.order.return_recorded must prepend exactly one immutable return."
        )
    record = after_returns[0]
    if record["disposition"] == "restock":
        before_item, after_item = _one_changed(
            current["items"],
            next_state["items"],
            "items",
        )
        if (
            before_item["sku"] != record["sku"]
            or after_item
            != {
                **before_item,
                "onHand": before_item["onHand"] + record["quantity"],
            }
        ):
            raise TrialValidationError(
                "a sellable return must increase only its matching stock item."
            )
        if (
            len(next_state["movements"]) != len(current["movements"]) + 1
            or next_state["movements"][1:] != current["movements"]
        ):
            raise TrialValidationError(
                "a sellable return must prepend exactly one return movement."
            )
        movement = next_state["movements"][0]
        if (
            movement.get("kind") != "return"
            or movement.get("orderId") != before_order["id"]
            or movement.get("sku") != record["sku"]
            or movement.get("quantityDelta") != record["quantity"]
            or movement.get("actionId") != record["actionId"]
            or movement.get("createdAt") != record["createdAt"]
            or movement.get("actor") != record["actor"]
            or movement.get("reason") != record["reason"]
            or movement.get("evidenceReference")
            != record["evidenceReference"]
            or movement.get("id")
            != _movement_id(str(record["actionId"]))
        ):
            raise TrialValidationError(
                "a sellable return requires one exact attributable stock movement."
            )
        _order_return_inventory_transition(
            current,
            next_state,
            before_order,
            record,
        )
    elif record["disposition"] == "not_restocked":
        _require_unchanged(current, next_state, "items", "movements")
        _require_inventory_foundation_unchanged(current, next_state)
    else:
        raise TrialValidationError("return disposition is invalid.")


def _validate_correction_recorded(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_order, after_order = _one_changed(
        current["orders"],
        next_state["orders"],
        "orders",
    )
    closed_order_ids = {
        order_id
        for close in current["closes"]
        if isinstance(close, Mapping)
        for order_id in close.get("orderIds", [])
    }
    if (
        before_order["status"] != "completed"
        or before_order["paymentStatus"] != "reconciled"
        or "completion" not in before_order
        or "calculation" not in before_order
        or before_order["id"] in closed_order_ids
    ):
        raise TrialValidationError(
            "corrections require an unclosed, calculated, reconciled, completed order."
        )
    before_corrections = before_order.get("corrections", [])
    after_corrections = after_order.get("corrections")
    if (
        not isinstance(after_corrections, list)
        or len(after_corrections) != len(before_corrections) + 1
        or after_corrections[1:] != before_corrections
        or _without(before_order, frozenset({"corrections"}))
        != _without(after_order, frozenset({"corrections"}))
    ):
        raise TrialValidationError(
            "commerce.order.correction_recorded must prepend exactly one immutable correction."
        )


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
    if _inventory_foundation(current) is not None:
        raise TrialValidationError(
            "location-managed stock must be received through a linked purchase order."
        )
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    before_item, after_item = _one_changed(current["items"], next_state["items"], "items")
    if len(next_state["movements"]) != len(current["movements"]) + 1 or next_state["movements"][1:] != current["movements"]:
        raise TrialValidationError("commerce.stock.received must prepend exactly one receipt.")
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "receipt"
        or movement.get("sku") != before_item["sku"]
        or "orderId" in movement
        or "purchaseOrderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError("stock receipt requires one attributable receipt movement.")
    if after_item != {**before_item, "onHand": before_item["onHand"] + movement["quantityDelta"]}:
        raise TrialValidationError("stock receipt must increase the matching item by its exact quantity.")


def _validate_counted(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.stock.counted must prepend exactly one count movement."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "count"
        or "orderId" in movement
        or "purchaseOrderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "stock count requires one attributable count movement."
        )
    matching_indexes = [
        index
        for index, item in enumerate(current["items"])
        if item["sku"] == movement["sku"]
    ]
    if len(matching_indexes) != 1 or len(next_state["items"]) != len(
        current["items"]
    ):
        raise TrialValidationError("stock count must reference one existing item.")
    item_index = matching_indexes[0]
    before_item = current["items"][item_index]
    before_foundation = _inventory_foundation(current)
    after_foundation = _inventory_foundation(next_state)
    counted_quantity = movement["countedQuantity"]
    if before_foundation is not None:
        if after_foundation is None:
            raise TrialValidationError(
                "location-managed stock count cannot remove its inventory record."
            )
        before_commands = before_foundation["commands"]
        after_commands = after_foundation["commands"]
        if (
            len(after_commands) != len(before_commands) + 1
            or after_commands[:-1] != before_commands
        ):
            raise TrialValidationError(
                "location-managed stock count must append exactly one location count."
            )
        location_count = after_commands[-1]["payload"]
        if location_count.get("kind") != "count":
            raise TrialValidationError(
                "location-managed stock count requires one count command."
            )
        catalog_skus = sorted(item["sku"] for item in current["items"])
        matching_balances = [
            balance
            for balance in shop_inventory_balances(
                before_foundation, catalog_skus
            )
            if balance["stockUnitId"] == location_count["stockUnitId"]
            and balance["locationId"] == location_count["locationId"]
        ]
        if len(matching_balances) != 1:
            raise TrialValidationError(
                "location count must reference one existing stock-unit balance."
            )
        balance = matching_balances[0]
        if (
            balance["sku"] != movement["sku"]
            or location_count["expectedQuantity"] != balance["onHand"]
            or location_count["countedQuantity"] < balance["reserved"]
        ):
            raise TrialValidationError(
                "location count must match its SKU, physical balance, and reservations."
            )
        counted_quantity = (
            before_item["onHand"]
            + location_count["countedQuantity"]
            - balance["onHand"]
        )
    elif after_foundation is not None:
        raise TrialValidationError(
            "commerce.stock.counted cannot initialize location inventory."
        )
    expected_after = {
        **before_item,
        "onHand": counted_quantity,
    }
    if (
        movement["expectedQuantity"] != before_item["onHand"]
        or movement["quantityDelta"]
        != counted_quantity - before_item["onHand"]
        or movement["countedQuantity"] != counted_quantity
        or next_state["items"][item_index] != expected_after
        or any(
            before != after
            for index, (before, after) in enumerate(
                zip(current["items"], next_state["items"], strict=True)
            )
            if index != item_index
        )
    ):
        raise TrialValidationError(
            "stock count may only set one matching item to its exact counted quantity."
        )


def _validate_production_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    movement: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "a production issue cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "a production issue cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
        available_balances = shop_inventory_available_balances(before, catalog_skus)
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind") != "production_issue"
    ):
        raise TrialValidationError(
            "the Plant request must append exactly one production issue location command."
        )
    command = after["commands"][-1]["payload"]
    request_id = str(movement["productionRequestId"])
    if (
        command.get("id") != _production_inventory_command_id(request_id)
        or command.get("productionRequestId") != request_id
        or command.get("productionCommandDigest")
        != movement["productionCommandDigest"]
        or command.get("productionJobId") != movement["productionJobId"]
        or command.get("productionMaterialId") != movement["productionMaterialId"]
        or command.get("productionInputLotId") != movement["productionInputLotId"]
        or command.get("productionQuantityMilli")
        != movement["productionQuantityMilli"]
        or command.get("productionUnit") != movement["productionUnit"]
        or command.get("sku") != movement["sku"]
        or command.get("stockQuantity") != -movement["quantityDelta"]
        or command.get("conversionNote") != movement["conversionNote"]
        or any(
            command["proof"].get(proof_field) != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the production location command must match the exact Shop and Plant evidence."
        )
    remaining = int(command["stockQuantity"])
    expected_allocations: list[dict[str, Any]] = []
    candidates = sorted(
        (
            balance
            for balance in available_balances
            if balance["sku"] == movement["sku"]
            and balance["availableToPromise"] > 0
        ),
        key=lambda balance: (
            -int(balance["availableToPromise"]),
            f"{balance['locationId']}|{balance['stockUnitId']}",
        ),
    )
    for balance in candidates:
        if remaining == 0:
            break
        allocated = min(remaining, int(balance["availableToPromise"]))
        expected_allocations.append(
            {
                "stockUnitId": balance["stockUnitId"],
                "locationId": balance["locationId"],
                "quantity": allocated,
            }
        )
        remaining -= allocated
    if remaining:
        raise TrialValidationError(
            "location stock cannot allocate the complete Plant material issue."
        )
    expected_allocations.sort(
        key=lambda allocation: (
            f"{allocation['locationId']}|{allocation['stockUnitId']}"
        )
    )
    if command.get("allocations") != expected_allocations:
        raise TrialValidationError(
            "the Plant material issue must use deterministic available location stock."
        )

    def decreased(source: Mapping[str, int]) -> dict[str, int]:
        retained = dict(source)
        next_quantity = retained.get(str(movement["sku"]), 0) + int(
            movement["quantityDelta"]
        )
        if next_quantity < 0:
            raise TrialValidationError(
                "the Plant material issue exceeds location stock."
            )
        if next_quantity:
            retained[str(movement["sku"])] = next_quantity
        else:
            retained.pop(str(movement["sku"]), None)
        return retained

    if after_physical != decreased(before_physical):
        raise TrialValidationError(
            "the Plant material issue must consume exact physical location stock."
        )
    if after_available != decreased(before_available):
        raise TrialValidationError(
            "the Plant material issue must reduce exact location available-to-promise."
        )


def _validate_production_material_issued(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.production_material.issued must prepend exactly one stock issue."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "production_issue"
        or movement.get("quantityDelta", 0) >= 0
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "production material issue requires one attributable negative stock movement."
        )
    _validate_production_inventory_transition(current, next_state, movement)
    before_item, after_item = _one_changed(
        current["items"], next_state["items"], "items"
    )
    if (
        before_item["sku"] != movement["sku"]
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "production material issue must decrease only its matching Shop item."
        )


def _validate_production_receipt_inventory_transition(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
    movement: Mapping[str, Any],
) -> None:
    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "a Plant batch receipt cannot create location inventory implicitly."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "a Plant batch receipt cannot remove the location inventory record."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before = validate_shop_inventory_state(current_foundation, catalog_skus)
        after = validate_shop_inventory_state(next_foundation, catalog_skus)
        before_physical = shop_inventory_sku_totals(before, catalog_skus)
        after_physical = shop_inventory_sku_totals(after, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        len(after["commands"]) != len(before["commands"]) + 1
        or after["commands"][:-1] != before["commands"]
        or after["commands"][-1]["payload"].get("kind")
        != "production_receipt"
    ):
        raise TrialValidationError(
            "the Plant batch receipt must append exactly one location receipt command."
        )
    command = after["commands"][-1]["payload"]
    release_id = str(movement["productionReleaseId"])
    if (
        command.get("id") != _production_receipt_command_id(release_id)
        or command.get("productionReleaseId") != release_id
        or command.get("productionCommandDigest")
        != movement["productionCommandDigest"]
        or command.get("productionJobId") != movement["productionJobId"]
        or command.get("productionOutputBatchId")
        != movement["productionOutputBatchId"]
        or command.get("productionReleasedAt")
        != movement["productionReleasedAt"]
        or command.get("sku") != movement["sku"]
        or command.get("quantity") != movement["quantityDelta"]
        or any(
            command["proof"].get(proof_field) != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "the Plant receipt location command must match the exact release evidence."
        )

    def increased(source: Mapping[str, int]) -> dict[str, int]:
        retained = dict(source)
        sku = str(movement["sku"])
        retained[sku] = retained.get(sku, 0) + int(movement["quantityDelta"])
        return retained

    if after_physical != increased(before_physical):
        raise TrialValidationError(
            "the Plant batch receipt must increase exact physical location stock."
        )
    if after_available != increased(before_available):
        raise TrialValidationError(
            "the Plant batch receipt must increase exact location available-to-promise."
        )


def _validate_production_batch_received(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.production_batch.received must prepend exactly one stock receipt."
        )
    movement = next_state["movements"][0]
    if (
        movement.get("kind") != "production_receipt"
        or movement.get("quantityDelta", 0) <= 0
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "Plant batch receipt requires one attributable positive stock movement."
        )
    _validate_production_receipt_inventory_transition(current, next_state, movement)
    before_item, after_item = _one_changed(
        current["items"], next_state["items"], "items"
    )
    if (
        before_item["sku"] != movement["sku"]
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "Plant batch receipt must increase only its matching Shop item."
        )


def _validate_purchase_order_created(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    current_orders = _purchase_orders(current)
    next_orders = _purchase_orders(next_state)
    if len(next_orders) != len(current_orders) + 1 or next_orders[1:] != current_orders:
        raise TrialValidationError(
            "commerce.purchase_order.created must prepend exactly one purchase order."
        )
    if "expectedAt" not in next_orders[0]:
        raise TrialValidationError(
            "a new purchase order requires an expected arrival."
        )
    if "cancellation" in next_orders[0]:
        raise TrialValidationError("a new purchase order cannot start cancelled.")


def _validate_purchase_order_received(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "orders", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    before_item, after_item = _one_changed(
        current["items"],
        next_state["items"],
        "items",
    )
    if (
        len(next_state["movements"]) != len(current["movements"]) + 1
        or next_state["movements"][1:] != current["movements"]
    ):
        raise TrialValidationError(
            "commerce.purchase_order.received must prepend exactly one receipt."
        )
    movement = next_state["movements"][0]
    purchase_order_id = movement.get("purchaseOrderId")
    purchase_order = next(
        (
            candidate
            for candidate in _purchase_orders(current)
            if candidate["id"] == purchase_order_id
        ),
        None,
    )
    if (
        purchase_order is None
        or "cancellation" in purchase_order
        or movement.get("kind") != "receipt"
        or movement.get("sku") != purchase_order["sku"]
        or movement.get("sku") != before_item["sku"]
        or "orderId" in movement
        or movement.get("id") != _movement_id(str(movement.get("actionId")))
    ):
        raise TrialValidationError(
            "purchase receipt requires one open matching purchase order."
        )
    previously_received = sum(
        prior["quantityDelta"]
        for prior in current["movements"]
        if prior.get("purchaseOrderId") == purchase_order_id
    )
    if (
        movement["quantityDelta"] > purchase_order["quantityOrdered"] - previously_received
        or after_item
        != {
            **before_item,
            "onHand": before_item["onHand"] + movement["quantityDelta"],
        }
    ):
        raise TrialValidationError(
            "purchase receipt must increase stock by no more than the outstanding quantity."
        )

    current_foundation = _inventory_foundation(current)
    next_foundation = _inventory_foundation(next_state)
    if current_foundation is None:
        if next_foundation is not None:
            raise TrialValidationError(
                "a purchase receipt cannot initialize location inventory."
            )
        return
    if next_foundation is None:
        raise TrialValidationError(
            "managed location stock requires a linked receipt allocation."
        )
    catalog_skus = [str(item["sku"]) for item in current["items"]]
    try:
        before_foundation = validate_shop_inventory_state(
            current_foundation, catalog_skus
        )
        after_foundation = validate_shop_inventory_state(
            next_foundation, catalog_skus
        )
        before_totals = shop_inventory_sku_totals(
            before_foundation, catalog_skus
        )
        after_totals = shop_inventory_sku_totals(after_foundation, catalog_skus)
        before_available = shop_inventory_sku_available_to_promise(
            before_foundation, catalog_skus
        )
        after_available = shop_inventory_sku_available_to_promise(
            after_foundation, catalog_skus
        )
    except ShopInventoryValidationError as exc:
        raise TrialValidationError(str(exc)) from exc
    if (
        after_foundation["revision"] != before_foundation["revision"] + 1
        or after_foundation["commands"][:-1] != before_foundation["commands"]
        or after_foundation["commands"][-1]["payload"]["kind"] != "receipt"
    ):
        raise TrialValidationError(
            "managed purchase receipt must append exactly one location receipt."
        )
    location_receipt = after_foundation["commands"][-1]["payload"]
    location_proof = location_receipt["proof"]
    if (
        location_receipt["purchaseOrderId"] != purchase_order_id
        or location_receipt["sku"] != movement["sku"]
        or location_receipt["quantity"] != movement["quantityDelta"]
        or any(
            location_proof[proof_field] != movement[movement_field]
            for proof_field, movement_field in (
                ("actionId", "actionId"),
                ("capturedAt", "createdAt"),
                ("actor", "actor"),
                ("reason", "reason"),
                ("evidenceReference", "evidenceReference"),
            )
        )
    ):
        raise TrialValidationError(
            "location receipt must match its aggregate purchase receipt exactly."
        )
    expected_physical = dict(before_totals)
    expected_physical[movement["sku"]] = (
        expected_physical.get(movement["sku"], 0) + movement["quantityDelta"]
    )
    if (
        before_available != _inventory_item_totals(current)
        or after_available != _inventory_item_totals(next_state)
        or after_totals != expected_physical
    ):
        raise TrialValidationError(
            "location receipt must conserve aggregate Shop ATP and physical stock."
        )


def _validate_purchase_order_cancelled(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(
        current,
        next_state,
        "items",
        "orders",
        "movements",
        "closes",
    )
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    before, after = _one_changed(
        _purchase_orders(current),
        _purchase_orders(next_state),
        "purchaseOrders",
    )
    previously_received = sum(
        movement["quantityDelta"]
        for movement in current["movements"]
        if movement.get("purchaseOrderId") == before["id"]
    )
    if (
        "cancellation" in before
        or "cancellation" not in after
        or previously_received >= before["quantityOrdered"]
        or _without(before, frozenset()) != _without(
            after,
            frozenset({"cancellation"}),
        )
    ):
        raise TrialValidationError(
            "purchase order cancellation may only add proof to an order with an outstanding remainder."
        )


def _commerce_order_close_basis(order: Mapping[str, Any]) -> datetime:
    timestamps = [str(order["createdAt"])]
    if order.get("paymentReconciledAt"):
        timestamps.append(str(order["paymentReconciledAt"]))
    completion = order.get("completion")
    if isinstance(completion, Mapping):
        timestamps.append(str(completion["capturedAt"]))
    timestamps.extend(
        str(correction["createdAt"])
        for correction in order.get("corrections", [])
        if isinstance(correction, Mapping)
    )
    return max(
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        for timestamp in timestamps
    )


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
    close_at = datetime.fromisoformat(str(close["createdAt"]).replace("Z", "+00:00"))
    if any(_commerce_order_close_basis(order) > close_at for order in eligible):
        raise TrialValidationError("daily close cannot predate included order evidence.")
    adjusted_totals = [_order_adjusted_total(order) for order in eligible]
    if (
        any(total is None for total in adjusted_totals)
        or close["orders"] != len(eligible)
        or close["total"] != sum(total or 0 for total in adjusted_totals)
    ):
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


def _require_website_intake_matches_current_catalog(
    intake: Mapping[str, Any],
    state: Mapping[str, Any],
    *,
    field: str,
) -> None:
    item = next(
        (candidate for candidate in state["items"] if candidate["sku"] == intake["sku"]),
        None,
    )
    if (
        item is None
        or intake["itemName"] != item["name"]
        or intake.get("itemVariant") != item.get("variant")
        or intake["unitPrice"] != item["price"]
    ):
        raise TrialValidationError(
            f"{field} must match the current Commerce catalog record."
        )


def _validate_website_intake_created(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    current_intakes = _website_intakes(current)
    next_intakes = _website_intakes(next_state)
    if len(next_intakes) != len(current_intakes) + 1 or next_intakes[1:] != current_intakes:
        raise TrialValidationError("commerce.website_intake.created must prepend exactly one Website intake.")
    if next_intakes[0]["status"] != "pending_confirmation":
        raise TrialValidationError("a new Website intake must await human confirmation.")
    if "snapshotDigest" not in next_intakes[0]:
        raise TrialValidationError(
            "a new Website intake requires an immutable snapshot digest."
        )
    _require_website_intake_matches_current_catalog(
        next_intakes[0],
        current,
        field="new Website intake",
    )


def _validate_website_intake_converted(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    current_intakes = _website_intakes(current)
    next_intakes = _website_intakes(next_state)
    before, after = _one_changed(
        current_intakes,
        next_intakes,
        "websiteIntakes",
    )
    _require_website_intake_matches_current_catalog(
        before,
        current,
        field="Website intake conversion",
    )
    if "snapshotDigest" not in before:
        raise TrialValidationError(
            "legacy Website intakes without a snapshot digest cannot be converted."
        )
    _validate_new_order_and_reservation(
        current,
        next_state,
        event_type="commerce.website_intake.converted",
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


def _validate_storefront_request_received(current: Mapping[str, Any], next_state: Mapping[str, Any]) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    current_requests = _storefront_requests(current)
    next_requests = _storefront_requests(next_state)
    if len(next_requests) != len(current_requests) + 1 or next_requests[1:] != current_requests:
        raise TrialValidationError(
            "commerce.storefront_request.received must prepend exactly one Ecommerce request."
        )
    request = next_requests[0]
    lines = (
        request["lines"]
        if request["schema"] == "supermega.ecommerce.order_request.v2"
        else [request["line"]]
    )
    configuration = _storefront_configuration(current)
    if configuration is None:
        raise TrialValidationError(
            "an Ecommerce request requires a saved storefront configuration."
        )
    if configuration["shopCatalogDigest"] != commerce_catalog_digest(current):
        raise TrialValidationError(
            "the Ecommerce request cannot use a storefront with a stale Shop catalog."
        )
    if any(line["sku"] not in configuration["selectedSkus"] for line in lines):
        raise TrialValidationError(
            "every Ecommerce request SKU must be included in the saved storefront."
        )
    if (
        request.get("sourceStorefrontRevision") != configuration["revision"]
        or request.get("sourceStorefrontActionId") != configuration["saved"]["actionId"]
        or datetime.fromisoformat(request["createdAt"].replace("Z", "+00:00"))
        < datetime.fromisoformat(
            configuration["saved"]["capturedAt"].replace("Z", "+00:00")
        )
    ):
        raise TrialValidationError(
            "the Ecommerce request does not reference the current saved storefront revision."
        )
    if request["sourcePreviewDigest"] != _configured_storefront_preview_digest(
        current,
        configuration,
    ):
        raise TrialValidationError(
            "the Ecommerce request does not match the current saved storefront preview."
        )
    def line_matches_catalog(line: Mapping[str, Any]) -> bool:
        matching_items = [item for item in current["items"] if item["sku"] == line["sku"]]
        return (
            len(matching_items) == 1
            and matching_items[0]["name"] == line["name"]
            and matching_items[0].get("variant") == line["variant"]
            and matching_items[0]["price"] == line["unitPriceMmk"]
            and matching_items[0]["onHand"] >= 1
        )

    if (
        any(not line_matches_catalog(line) for line in lines)
        or any(order.get("sourceRecordId") == request["id"] for order in current["orders"])
    ):
        raise TrialValidationError(
            "the Ecommerce request receipt does not match the current Shop catalog boundary."
        )


def _validate_storefront_configuration_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    before = _storefront_configuration(current)
    after = _storefront_configuration(next_state)
    if after is None:
        raise TrialValidationError(
            "commerce.storefront.configuration.saved requires one storefront configuration."
        )
    if after["shopCatalogDigest"] != commerce_catalog_digest(current):
        raise TrialValidationError(
            "the storefront configuration must bind to the current Shop catalog."
        )
    if before is None:
        if after["revision"] != 1 or after["shopCatalogSnapshotRevision"] != 1:
            raise TrialValidationError(
                "the first storefront configuration must start at revision one."
            )
        return
    content_fields = ("storeName", "summary", "selectedSkus", "shopCatalogDigest")
    if all(before[field] == after[field] for field in content_fields) and before.get(
        "merchandising"
    ) == after.get("merchandising"):
        raise TrialValidationError("an unchanged storefront configuration cannot advance.")
    if after["revision"] != before["revision"] + 1:
        raise TrialValidationError("storefront configuration revision must advance exactly once.")
    expected_catalog_revision = before["shopCatalogSnapshotRevision"] + (
        1 if before["shopCatalogDigest"] != after["shopCatalogDigest"] else 0
    )
    if after["shopCatalogSnapshotRevision"] != expected_catalog_revision:
        raise TrialValidationError(
            "Shop catalog snapshot revision must advance only when its digest changes."
        )
    same_imported_content = (
        before["selectedSkus"] == after["selectedSkus"]
        and before.get("merchandising") == after.get("merchandising")
    )
    if same_imported_content and before.get("activation") != after.get("activation"):
        raise TrialValidationError(
            "Ecommerce activation provenance is immutable while imported content is retained."
        )
    if not same_imported_content and "activation" in after:
        raise TrialValidationError(
            "Ecommerce activation provenance must be cleared when imported content changes."
        )


def _validate_tax_configuration_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    _require_catalog_changes_unchanged(current, next_state)
    _require_catalog_baselines_unchanged(current, next_state)
    _require_inventory_foundation_unchanged(current, next_state)
    before = _tax_configurations(current)
    after = _tax_configurations(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError(
            "commerce.tax_configuration.saved must prepend exactly one tax configuration."
        )
    configuration = after[0]
    if configuration["revision"] != len(before) + 1:
        raise TrialValidationError("tax configuration revision must advance exactly once.")
    if not _TAX_CONFIGURATION_SCHEDULE_FIELDS.issubset(configuration):
        raise TrialValidationError(
            "new tax configurations require reviewed jurisdiction and effective time."
        )
    if before and all(
        configuration.get(field) == before[0].get(field)
        for field in (
            "code",
            "label",
            "rateBasisPoints",
            "mode",
            "jurisdictionCode",
            "effectiveFrom",
        )
    ):
        raise TrialValidationError("an unchanged tax configuration cannot advance.")


def _validate_account_mapping_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    _require_unchanged(current, next_state, "items", "orders", "movements", "closes")
    _require_website_intakes_unchanged(current, next_state)
    _require_storefront_requests_unchanged(current, next_state)
    _require_storefront_configuration_unchanged(current, next_state)
    _require_purchase_orders_unchanged(current, next_state)
    _require_catalog_changes_unchanged(current, next_state)
    _require_catalog_baselines_unchanged(current, next_state)
    _require_tax_configurations_unchanged(current, next_state)
    _require_inventory_foundation_unchanged(current, next_state)
    before = _account_mapping_configurations(current)
    after = _account_mapping_configurations(next_state)
    if len(after) != len(before) + 1 or after[1:] != before:
        raise TrialValidationError(
            "commerce.account_mapping.saved must prepend exactly one account mapping configuration."
        )
    configuration = after[0]
    if configuration["revision"] != len(before) + 1:
        raise TrialValidationError(
            "account mapping configuration revision must advance exactly once."
        )
    if before and configuration["mappings"] == before[0]["mappings"]:
        raise TrialValidationError(
            "an unchanged account mapping configuration cannot advance."
        )


def _service_schedule(state: Mapping[str, Any]) -> dict[str, Any] | None:
    value = state.get("serviceSchedule")
    return _validate_service_schedule(value) if value is not None else None


def _require_service_schedule_unchanged(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if current.get("serviceSchedule") != next_state.get("serviceSchedule"):
        raise TrialValidationError(
            "commerce service schedule can change only through commerce.service_schedule.saved."
        )


def _validate_service_schedule_saved(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    current_without_schedule = dict(current)
    current_without_schedule.pop("serviceSchedule", None)
    next_without_schedule = dict(next_state)
    next_without_schedule.pop("serviceSchedule", None)
    if current_without_schedule != next_without_schedule:
        raise TrialValidationError(
            "commerce.service_schedule.saved cannot change other Commerce records."
        )
    before = _service_schedule(current)
    after = _service_schedule(next_state)
    if after is None or after["revision"] < 1:
        raise TrialValidationError(
            "commerce.service_schedule.saved requires a reviewed schedule change."
        )
    if before is None:
        return
    if after["industryPackId"] != before["industryPackId"]:
        raise TrialValidationError("an active service schedule cannot change industry pack.")
    if after["revision"] != before["revision"] + 1:
        raise TrialValidationError("service schedule revision must advance exactly once.")
    if after["events"][:-1] != before["events"]:
        raise TrialValidationError("service schedule evidence history is immutable.")
    latest = after["events"][-1]
    event_type = latest["type"]
    if event_type == "service_registered":
        valid_change = (
            len(after["services"]) == len(before["services"]) + 1
            and after["services"][:-1] == before["services"]
            and latest["subjectId"] == after["services"][-1]["id"]
            and after["services"][-1]["active"] is True
            and after["resources"] == before["resources"]
            and after["bookings"] == before["bookings"]
        )
    elif event_type == "resource_registered":
        valid_change = (
            len(after["resources"]) == len(before["resources"]) + 1
            and after["resources"][:-1] == before["resources"]
            and latest["subjectId"] == after["resources"][-1]["id"]
            and after["resources"][-1]["active"] is True
            and after["services"] == before["services"]
            and after["bookings"] == before["bookings"]
        )
    elif event_type == "booking_scheduled":
        valid_change = (
            len(after["bookings"]) == len(before["bookings"]) + 1
            and after["bookings"][:-1] == before["bookings"]
            and latest["subjectId"] == after["bookings"][-1]["id"]
            and after["bookings"][-1]["status"] == "held"
            and after["bookings"][-1]["createdAt"] == latest["happenedAt"]
            and after["bookings"][-1]["updatedAt"] == latest["happenedAt"]
            and after["services"] == before["services"]
            and after["resources"] == before["resources"]
        )
    else:
        before_by_id = {booking["id"]: booking for booking in before["bookings"]}
        changed_bookings = [
            booking
            for booking in after["bookings"]
            if before_by_id.get(booking["id"]) != booking
        ]
        changed = changed_bookings[0] if len(changed_bookings) == 1 else None
        prior = before_by_id.get(changed["id"]) if changed else None
        expected_status = (
            {"held": "confirmed", "confirmed": "checked_in", "checked_in": "completed"}.get(
                prior["status"]
            )
            if prior and event_type == "booking_advanced"
            else (
                "cancelled"
                if prior and prior["status"] not in {"completed", "cancelled"}
                else None
            )
        )
        expected_booking = (
            {
                **prior,
                "status": expected_status,
                "updatedAt": latest["happenedAt"],
            }
            if prior and expected_status
            else None
        )
        valid_change = (
            len(after["bookings"]) == len(before["bookings"])
            and {booking["id"] for booking in after["bookings"]} == set(before_by_id)
            and len(changed_bookings) == 1
            and changed == expected_booking
            and changed["id"] == latest["subjectId"]
            and after["services"] == before["services"]
            and after["resources"] == before["resources"]
        )
    if not valid_change:
        raise TrialValidationError(
            "service schedule change does not match its latest evidence event."
        )


def _validate_service_schedule_initialized(
    current: Mapping[str, Any],
    next_state: Mapping[str, Any],
) -> None:
    if _service_schedule(current) is not None:
        raise TrialValidationError("managed Commerce already has a service schedule.")
    current_without_schedule = dict(current)
    current_without_schedule.pop("serviceSchedule", None)
    next_without_schedule = dict(next_state)
    next_without_schedule.pop("serviceSchedule", None)
    if current_without_schedule != next_without_schedule:
        raise TrialValidationError(
            "commerce.service_schedule.initialized cannot change other Commerce records."
        )
    schedule = _service_schedule(next_state)
    if schedule is None or schedule["revision"] != 0 or schedule["events"]:
        raise TrialValidationError(
            "service schedule initialization requires a clean industry pack without operating evidence."
        )
    if not schedule["services"] or not schedule["resources"] or schedule["bookings"]:
        raise TrialValidationError(
            "service schedule initialization requires services and resources but no bookings."
        )


_TRANSITION_VALIDATORS = {
    "commerce.item.created": _validate_item_created,
    "commerce.item.updated": _validate_item_updated,
    "commerce.order.created": _validate_created,
    "commerce.order.advanced": _validate_advanced,
    "commerce.order.cancelled": _validate_cancelled,
    "commerce.order.return_recorded": _validate_return_recorded,
    "commerce.order.correction_recorded": _validate_correction_recorded,
    "commerce.payment.reconciled": _validate_reconciled,
    "commerce.refund.settled": _validate_refund_settled,
    "commerce.stock.received": _validate_received,
    "commerce.stock.counted": _validate_counted,
    "commerce.production_material.issued": _validate_production_material_issued,
    "commerce.production_batch.received": _validate_production_batch_received,
    "commerce.inventory.initialized": _validate_inventory_initialized,
    "commerce.inventory.transferred": _validate_inventory_transferred,
    "commerce.purchase_order.created": _validate_purchase_order_created,
    "commerce.purchase_order.received": _validate_purchase_order_received,
    "commerce.purchase_order.cancelled": _validate_purchase_order_cancelled,
    "commerce.close.saved": _validate_close,
    "commerce.website_intake.created": _validate_website_intake_created,
    "commerce.website_intake.converted": _validate_website_intake_converted,
    "commerce.storefront.configuration.saved": _validate_storefront_configuration_saved,
    "commerce.storefront_request.received": _validate_storefront_request_received,
    "commerce.tax_configuration.saved": _validate_tax_configuration_saved,
    "commerce.account_mapping.saved": _validate_account_mapping_saved,
    "commerce.service_schedule.initialized": _validate_service_schedule_initialized,
    "commerce.service_schedule.saved": _validate_service_schedule_saved,
}


def reduce_commerce_state(
    event_type: str,
    current: Mapping[str, Any],
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Accept only one declared Commerce lifecycle transition per command."""

    if event_type not in COMMERCE_EVENTS:
        raise TrialValidationError("event_type must be a supported Commerce lifecycle event.")
    if event_type == "commerce.storefront.merchandising.imported":
        return _apply_storefront_merchandising_import(current, payload)
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
            or _storefront_requests(next_state)
            or _storefront_configuration(next_state)
            or _purchase_orders(next_state)
            or _catalog_changes(next_state)
            or _tax_configurations(next_state)
            or _account_mapping_configurations(next_state)
        ):
            raise TrialValidationError("Commerce initialization requires a non-empty catalog and no operating history.")
        return next_state

    current_state = validate_commerce_state(current)
    if event_type != "commerce.item.updated":
        _require_catalog_changes_unchanged(current_state, next_state)
    if event_type not in {"commerce.item.created", "commerce.item.updated"}:
        _require_catalog_baselines_unchanged(current_state, next_state)
    if event_type != "commerce.storefront_request.received":
        _require_storefront_requests_unchanged(current_state, next_state)
    if event_type != "commerce.storefront.configuration.saved":
        _require_storefront_configuration_unchanged(current_state, next_state)
    if event_type != "commerce.tax_configuration.saved":
        _require_tax_configurations_unchanged(current_state, next_state)
    if event_type != "commerce.account_mapping.saved":
        _require_account_mapping_configurations_unchanged(current_state, next_state)
    if event_type not in {
        "commerce.service_schedule.initialized",
        "commerce.service_schedule.saved",
    }:
        _require_service_schedule_unchanged(current_state, next_state)
    if event_type not in {
        "commerce.purchase_order.created",
        "commerce.purchase_order.cancelled",
    }:
        _require_purchase_orders_unchanged(current_state, next_state)
    if event_type not in {
        "commerce.inventory.initialized",
        "commerce.inventory.transferred",
        "commerce.stock.counted",
        "commerce.production_material.issued",
        "commerce.production_batch.received",
        "commerce.purchase_order.received",
        "commerce.order.created",
        "commerce.order.cancelled",
        "commerce.order.advanced",
        "commerce.order.return_recorded",
        "commerce.website_intake.converted",
    }:
        _require_inventory_foundation_unchanged(current_state, next_state)
    _TRANSITION_VALIDATORS[event_type](current_state, next_state)
    _validate_event_evidence(event_type, current_state, next_state, evidence)
    return next_state


__all__ = [
    "COMMERCE_ACCOUNTING_HANDOFF_SCHEMA",
    "COMMERCE_DAILY_CLOSE_EXPORT_SCHEMA",
    "COMMERCE_EVENTS",
    "COMMERCE_HUMAN_EVENTS",
    "COMMERCE_SCHEMA",
    "commerce_catalog_baseline_digest",
    "commerce_catalog_digest",
    "commerce_order_calculation_digest",
    "commerce_accounting_handoff",
    "commerce_accounting_handoff_csv",
    "commerce_daily_close_csv",
    "commerce_daily_close_export",
    "commerce_storefront_preview_digest",
    "commerce_website_intake_snapshot_digest",
    "reduce_commerce_state",
    "validate_commerce_state",
]
