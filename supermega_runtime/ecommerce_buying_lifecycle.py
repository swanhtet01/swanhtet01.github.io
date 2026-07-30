"""Deterministic, no-I/O Ecommerce buying-lifecycle foundation.

The module prepares a versioned PIM projection, multi-line cart quote, pending
Shop request, review-only Shop handoff, and return intent.  It never reserves
stock, creates an order, authorizes or captures payment, books tax or shipping,
issues a refund, or calls a provider.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from hashlib import sha256
import json
import re
import unicodedata
from typing import Any


ECOMMERCE_PIM_SCHEMA = "supermega.ecommerce.pim_projection.v1"
ECOMMERCE_QUOTE_SCHEMA = "supermega.ecommerce.checkout_quote.v1"
ECOMMERCE_TAX_DECISION_SCHEMA = "supermega.ecommerce.tax-decision.v1"
ECOMMERCE_CUSTOMER_PROFILE_SCHEMA = "supermega.ecommerce.customer_profile_snapshot.v1"
ECOMMERCE_DELIVERY_ADDRESS_SCHEMA = "supermega.ecommerce.delivery_address_snapshot.v1"
ECOMMERCE_REQUEST_SCHEMA = "supermega.ecommerce.order_request.v2"
ECOMMERCE_SHOP_DRAFT_SCHEMA = "supermega.ecommerce.shop_draft.v7"
ECOMMERCE_RETURN_INTENT_SCHEMA = "supermega.ecommerce.return_intent.v1"
ECOMMERCE_RETURN_OUTCOME_SCHEMA = "supermega.ecommerce.return_outcome.v1"
ECOMMERCE_SUPPORT_INTENT_SCHEMA = "supermega.ecommerce.support_intent.v1"
ECOMMERCE_SUPPORT_OUTCOME_SCHEMA = "supermega.ecommerce.support_outcome.v1"
ECOMMERCE_CANCELLATION_INTENT_SCHEMA = "supermega.ecommerce.cancellation_intent.v1"
ECOMMERCE_CANCELLATION_DECISION_SCHEMA = "supermega.ecommerce.cancellation_decision.v1"
ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA = "supermega.ecommerce.order_amendment_intent.v1"
ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA = "supermega.ecommerce.order_reschedule_intent.v1"
ECOMMERCE_LIFECYCLE_STATE_SCHEMA = "supermega.ecommerce.buying_lifecycle.v1"
ECOMMERCE_LIFECYCLE_EVENT_SCHEMA = "supermega.ecommerce.buying_event.v1"
EMPTY_ECOMMERCE_LIFECYCLE_DIGEST = f"sha256:{'0' * 64}"

_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,179}$")
_UUID = r"[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}"
_QUOTE_ID = re.compile(rf"^ECQ-{_UUID}$")
_REQUEST_ID = re.compile(rf"^ECR-{_UUID}$")
_CHECKOUT_KEY = re.compile(rf"^ECI-{_UUID}$")
_CUSTOMER_ID = re.compile(rf"^CUS-{_UUID}$")
_ADDRESS_ID = re.compile(rf"^ADR-{_UUID}$")
_RETURN_ID = re.compile(rf"^ERR-{_UUID}$")
_RETURN_KEY = re.compile(rf"^ERI-{_UUID}$")
_SUPPORT_ID = re.compile(rf"^ESR-{_UUID}$")
_SUPPORT_KEY = re.compile(rf"^ESI-{_UUID}$")
_CANCELLATION_ID = re.compile(rf"^ECN-{_UUID}$")
_CANCELLATION_KEY = re.compile(rf"^CNI-{_UUID}$")
_CANCELLATION_DECISION_ID = re.compile(rf"^ECD-{_UUID}$")
_CANCELLATION_DECISION_KEY = re.compile(rf"^CDI-{_UUID}$")
_AMENDMENT_ID = re.compile(rf"^EAM-{_UUID}$")
_AMENDMENT_KEY = re.compile(rf"^AMI-{_UUID}$")
_RESCHEDULE_ID = re.compile(rf"^ERS-{_UUID}$")
_RESCHEDULE_KEY = re.compile(rf"^RSI-{_UUID}$")
_ISO_TIMESTAMP = re.compile(
    r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$"
)
_MAX_SAFE_INTEGER = 9_007_199_254_740_991
_MAX_LINES = 20
_MAX_QUANTITY = 99
_MAX_RECORDS = 100
_PAYMENT_ADAPTERS = frozenset(
    {"pay_on_pickup", "cash_on_delivery", "kbzpay_manual"}
)
_FULFILMENT_METHODS = frozenset({"pickup", "delivery"})
_RETURN_DISPOSITIONS = frozenset({"restock", "not_restocked"})
_SUPPORT_CATEGORIES = frozenset(
    {"order_status", "delivery_issue", "payment_question", "item_issue", "other"}
)
_SUPPORT_PRIORITIES = frozenset({"urgent", "high", "normal", "low"})
_SUPPORT_RESOLUTION_OUTCOMES = frozenset(
    {"information_provided", "replacement_review_required", "refund_review_required", "no_action"}
)
_CANCELLATION_REASON_CODES = frozenset(
    {"changed_mind", "duplicate_order", "order_error", "delivery_too_slow", "other"}
)
_PHONE = re.compile(r"^\+?[0-9][0-9 ()-]{5,31}$")


class EcommerceLifecycleValidationError(ValueError):
    """Raised when buying-lifecycle evidence cannot be proved consistent."""


def _fail(message: str) -> EcommerceLifecycleValidationError:
    return EcommerceLifecycleValidationError(message)


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


def _text(
    value: object,
    field: str,
    *,
    maximum: int = 240,
    allow_blank: bool = False,
) -> str:
    if not isinstance(value, str) or value != value.strip() or (not allow_blank and not value):
        raise _fail(f"{field} must be trimmed text.")
    if unicodedata.normalize("NFC", value) != value:
        raise _fail(f"{field} must use normalized Unicode text.")
    if any(ord(character) <= 31 or ord(character) == 127 for character in value):
        raise _fail(f"{field} contains a control character.")
    if len(value.encode("utf-16-le")) // 2 > maximum:
        raise _fail(f"{field} exceeds its supported length.")
    return value


def _optional_text(value: object, field: str, *, maximum: int) -> str | None:
    if value is None:
        return None
    return _text(value, field, maximum=maximum)


def _token(value: object, field: str) -> str:
    candidate = _text(value, field, maximum=180)
    if _TOKEN.fullmatch(candidate) is None:
        raise _fail(f"{field} must be a canonical token.")
    return candidate


def _integer(
    value: object,
    field: str,
    *,
    minimum: int = 0,
    maximum: int = _MAX_SAFE_INTEGER,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise _fail(f"{field} must be a supported integer.")
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


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _canonical_json(value: object) -> str:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise _fail("Ecommerce lifecycle evidence is not canonical JSON.") from exc


def _canonical_digest(value: object) -> str:
    return f"sha256:{sha256(_canonical_json(value).encode('utf-8')).hexdigest()}"


def _canonical_copy(value: object) -> Any:
    return json.loads(_canonical_json(value))


def ecommerce_lifecycle_digest(value: object) -> str:
    """Return the cross-runtime SHA-256 digest for lifecycle evidence."""

    return _canonical_digest(value)


def ecommerce_payment_matches_fulfilment(
    fulfilment: str,
    payment_adapter: str,
) -> bool:
    """Return whether a checkout payment makes sense for its handoff method."""

    return (
        fulfilment == "pickup"
        and payment_adapter in {"pay_on_pickup", "kbzpay_manual"}
    ) or (
        fulfilment == "delivery"
        and payment_adapter in {"cash_on_delivery", "kbzpay_manual"}
    )


def _pim_item(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        ("sku", "name", "variant", "unitPriceMmk", "availability"),
    )
    availability = source["availability"]
    if availability not in {"available", "sold_out"}:
        raise _fail(f"{field}.availability is unsupported.")
    return {
        "sku": _token(source["sku"], f"{field}.sku"),
        "name": _text(source["name"], f"{field}.name", maximum=180),
        "variant": _optional_text(source["variant"], f"{field}.variant", maximum=180),
        "unitPriceMmk": _integer(
            source["unitPriceMmk"], f"{field}.unitPriceMmk", minimum=1
        ),
        "availability": availability,
    }


def build_ecommerce_pim_projection(
    *,
    scope: str,
    source_preview_digest: str,
    items: Sequence[Mapping[str, object]],
) -> dict[str, Any]:
    """Freeze the customer-visible Shop variants and prices in canonical order."""

    canonical_items = [
        _pim_item(candidate, f"items[{index}]")
        for index, candidate in enumerate(
            _array(list(items), "items", minimum=1, maximum=100)
        )
    ]
    canonical_items.sort(key=lambda candidate: candidate["sku"])
    if len({candidate["sku"] for candidate in canonical_items}) != len(canonical_items):
        raise _fail("PIM item SKUs must be unique.")
    projection: dict[str, Any] = {
        "schema": ECOMMERCE_PIM_SCHEMA,
        "scope": _token(scope, "scope"),
        "sourcePreviewDigest": _digest(
            source_preview_digest, "sourcePreviewDigest"
        ),
        "items": canonical_items,
    }
    projection["pimDigest"] = _canonical_digest(projection)
    return projection


def validate_ecommerce_pim_projection(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "PIM projection",
        ("schema", "scope", "sourcePreviewDigest", "items", "pimDigest"),
    )
    if source["schema"] != ECOMMERCE_PIM_SCHEMA:
        raise _fail("PIM projection schema is invalid.")
    expected = build_ecommerce_pim_projection(
        scope=_token(source["scope"], "PIM projection.scope"),
        source_preview_digest=_digest(
            source["sourcePreviewDigest"], "PIM projection.sourcePreviewDigest"
        ),
        items=_array(source["items"], "PIM projection.items", minimum=1, maximum=100),
    )
    if _digest(source["pimDigest"], "PIM projection.pimDigest") != expected["pimDigest"]:
        raise _fail("PIM projection digest is invalid.")
    return expected


def _customer_phone(value: object, field: str) -> str:
    phone = _text(value, field, maximum=32)
    digit_count = sum(character.isdigit() for character in phone)
    if _PHONE.fullmatch(phone) is None or not 6 <= digit_count <= 15:
        raise _fail(f"{field} must be a usable phone number.")
    return phone


def validate_ecommerce_customer_profile(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "customer profile",
        ("schema", "id", "revision", "name", "phone", "savedAt", "previousDigest", "profileDigest"),
    )
    profile_id = _text(source["id"], "customer profile.id", maximum=40)
    if source["schema"] != ECOMMERCE_CUSTOMER_PROFILE_SCHEMA or _CUSTOMER_ID.fullmatch(profile_id) is None:
        raise _fail("Customer profile identity is invalid.")
    core = {
        "schema": ECOMMERCE_CUSTOMER_PROFILE_SCHEMA,
        "id": profile_id,
        "revision": _integer(source["revision"], "customer profile.revision", minimum=1),
        "name": _text(source["name"], "customer profile.name", maximum=80),
        "phone": _customer_phone(source["phone"], "customer profile.phone"),
        "savedAt": _timestamp(source["savedAt"], "customer profile.savedAt"),
        "previousDigest": None if source["previousDigest"] is None else _digest(source["previousDigest"], "customer profile.previousDigest"),
    }
    profile_digest = _digest(source["profileDigest"], "customer profile.profileDigest")
    if profile_digest != _canonical_digest(core):
        raise _fail("Customer profile digest is invalid.")
    return {**core, "profileDigest": profile_digest}


def validate_ecommerce_delivery_address(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "delivery address",
        (
            "schema", "id", "revision", "line1", "township", "city", "instructions",
            "savedAt", "previousDigest", "addressDigest",
        ),
    )
    address_id = _text(source["id"], "delivery address.id", maximum=40)
    if source["schema"] != ECOMMERCE_DELIVERY_ADDRESS_SCHEMA or _ADDRESS_ID.fullmatch(address_id) is None:
        raise _fail("Delivery address identity is invalid.")
    core = {
        "schema": ECOMMERCE_DELIVERY_ADDRESS_SCHEMA,
        "id": address_id,
        "revision": _integer(source["revision"], "delivery address.revision", minimum=1),
        "line1": _text(source["line1"], "delivery address.line1", maximum=120),
        "township": _text(source["township"], "delivery address.township", maximum=80),
        "city": _text(source["city"], "delivery address.city", maximum=80),
        "instructions": _optional_text(source["instructions"], "delivery address.instructions", maximum=160),
        "savedAt": _timestamp(source["savedAt"], "delivery address.savedAt"),
        "previousDigest": None if source["previousDigest"] is None else _digest(source["previousDigest"], "delivery address.previousDigest"),
    }
    address_digest = _digest(source["addressDigest"], "delivery address.addressDigest")
    if address_digest != _canonical_digest(core):
        raise _fail("Delivery address digest is invalid.")
    return {**core, "addressDigest": address_digest}


def build_ecommerce_customer_profile(
    *, name: str, phone: str, saved_at: str, idempotency_key: str,
    previous: Mapping[str, object] | None = None,
) -> dict[str, Any]:
    key = _text(idempotency_key, "customer profile.idempotencyKey", maximum=40)
    if _CHECKOUT_KEY.fullmatch(key) is None:
        raise _fail("Customer profile checkout identity is invalid.")
    prior = validate_ecommerce_customer_profile(previous) if previous is not None else None
    canonical_name = _text(name, "customer profile.name", maximum=80)
    canonical_phone = _customer_phone(phone, "customer profile.phone")
    if prior and prior["name"] == canonical_name and prior["phone"] == canonical_phone:
        return prior
    core = {
        "schema": ECOMMERCE_CUSTOMER_PROFILE_SCHEMA,
        "id": prior["id"] if prior else f"CUS-{key[4:]}",
        "revision": (prior["revision"] if prior else 0) + 1,
        "name": canonical_name,
        "phone": canonical_phone,
        "savedAt": _timestamp(saved_at, "customer profile.savedAt"),
        "previousDigest": prior["profileDigest"] if prior else None,
    }
    return validate_ecommerce_customer_profile({**core, "profileDigest": _canonical_digest(core)})


def build_ecommerce_delivery_address(
    *, line1: str, township: str, city: str, instructions: str | None,
    saved_at: str, idempotency_key: str,
    previous: Mapping[str, object] | None = None,
) -> dict[str, Any]:
    key = _text(idempotency_key, "delivery address.idempotencyKey", maximum=40)
    if _CHECKOUT_KEY.fullmatch(key) is None:
        raise _fail("Delivery address checkout identity is invalid.")
    prior = validate_ecommerce_delivery_address(previous) if previous is not None else None
    values = {
        "line1": _text(line1, "delivery address.line1", maximum=120),
        "township": _text(township, "delivery address.township", maximum=80),
        "city": _text(city, "delivery address.city", maximum=80),
        "instructions": _optional_text(instructions, "delivery address.instructions", maximum=160),
    }
    if prior and all(prior[key] == value for key, value in values.items()):
        return prior
    core = {
        "schema": ECOMMERCE_DELIVERY_ADDRESS_SCHEMA,
        "id": prior["id"] if prior else f"ADR-{key[4:]}",
        "revision": (prior["revision"] if prior else 0) + 1,
        **values,
        "savedAt": _timestamp(saved_at, "delivery address.savedAt"),
        "previousDigest": prior["addressDigest"] if prior else None,
    }
    return validate_ecommerce_delivery_address({**core, "addressDigest": _canonical_digest(core)})


def _quote_line(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        ("sku", "name", "variant", "quantity", "unitPriceMmk", "lineTotalMmk"),
    )
    quantity = _integer(
        source["quantity"], field=f"{field}.quantity", minimum=1, maximum=_MAX_QUANTITY
    )
    unit_price = _integer(
        source["unitPriceMmk"], field=f"{field}.unitPriceMmk", minimum=1
    )
    line_total = _integer(source["lineTotalMmk"], f"{field}.lineTotalMmk", minimum=1)
    if line_total != quantity * unit_price:
        raise _fail(f"{field}.lineTotalMmk is invalid.")
    return {
        "sku": _token(source["sku"], f"{field}.sku"),
        "name": _text(source["name"], f"{field}.name", maximum=180),
        "variant": _optional_text(source["variant"], f"{field}.variant", maximum=180),
        "quantity": quantity,
        "unitPriceMmk": unit_price,
        "lineTotalMmk": line_total,
    }


def _quote_core(value: object) -> dict[str, Any]:
    base_fields = (
        "schema", "scope", "quoteId", "idempotencyKey", "quotedAt", "expiresAt",
        "sourcePreviewDigest", "pimDigest", "currency", "customerReference", "fulfilment",
        "lines", "subtotalMmk", "promotion", "tax", "shipping", "payment", "totalMmk",
    )
    structured_fields = ("customerProfile", "deliveryAddress")
    structured = isinstance(value, Mapping) and any(field in value for field in structured_fields)
    source = _object(
        value,
        "checkout quote",
        (*base_fields, *structured_fields) if structured else base_fields,
    )
    if source["schema"] != ECOMMERCE_QUOTE_SCHEMA:
        raise _fail("Checkout quote schema is invalid.")
    quote_id = _text(source["quoteId"], "checkout quote.quoteId", maximum=40)
    key = _text(source["idempotencyKey"], "checkout quote.idempotencyKey", maximum=40)
    if _QUOTE_ID.fullmatch(quote_id) is None or _CHECKOUT_KEY.fullmatch(key) is None:
        raise _fail("Checkout quote identity is invalid.")
    if quote_id[4:] != key[4:]:
        raise _fail("Checkout quote identity is not idempotency-bound.")
    quoted_at = _timestamp(source["quotedAt"], "checkout quote.quotedAt")
    expires_at = _timestamp(source["expiresAt"], "checkout quote.expiresAt")
    if _instant(expires_at) <= _instant(quoted_at):
        raise _fail("Checkout quote expiry must be after its quote time.")
    if _instant(expires_at).timestamp() - _instant(quoted_at).timestamp() > 30 * 60:
        raise _fail("Checkout quote validity cannot exceed 30 minutes.")
    fulfilment = source["fulfilment"]
    if fulfilment not in _FULFILMENT_METHODS:
        raise _fail("Checkout fulfilment is unsupported.")
    customer_profile = (
        validate_ecommerce_customer_profile(source["customerProfile"])
        if structured else None
    )
    delivery_address = (
        None if source["deliveryAddress"] is None
        else validate_ecommerce_delivery_address(source["deliveryAddress"])
    ) if structured else None
    if structured and (
        _instant(customer_profile["savedAt"]) > _instant(quoted_at)
        or delivery_address is not None and _instant(delivery_address["savedAt"]) > _instant(quoted_at)
        or (fulfilment == "delivery") != (delivery_address is not None)
    ):
        raise _fail("Checkout customer and delivery identity are inconsistent.")
    lines = [
        _quote_line(candidate, f"checkout quote.lines[{index}]")
        for index, candidate in enumerate(
            _array(source["lines"], "checkout quote.lines", minimum=1, maximum=_MAX_LINES)
        )
    ]
    if [line["sku"] for line in lines] != sorted(line["sku"] for line in lines):
        raise _fail("Checkout quote lines must use canonical SKU order.")
    if len({line["sku"] for line in lines}) != len(lines):
        raise _fail("Checkout quote line SKUs must be unique.")
    subtotal = _integer(source["subtotalMmk"], "checkout quote.subtotalMmk", minimum=1)
    if subtotal != sum(line["lineTotalMmk"] for line in lines):
        raise _fail("Checkout quote subtotal is invalid.")

    promotion_source = _object(
        source["promotion"],
        "checkout quote.promotion",
        ("adapter", "status", "code", "amountMmk"),
    )
    promotion_code = _optional_text(
        promotion_source["code"], "checkout quote.promotion.code", maximum=40
    )
    expected_promotion_status = "pending_shop_review" if promotion_code else "not_requested"
    if (
        promotion_source["adapter"] != "shop_promotion_review"
        or promotion_source["status"] != expected_promotion_status
        or promotion_source["amountMmk"] != 0
    ):
        raise _fail("Checkout promotion boundary is invalid.")

    tax_source = _object(
        source["tax"], "checkout quote.tax", ("adapter", "status", "amountMmk")
    )
    if tax_source != {
        "adapter": "price_inclusive",
        "status": "included",
        "amountMmk": 0,
    }:
        raise _fail("Checkout tax boundary is invalid.")

    shipping_source = _object(
        source["shipping"],
        "checkout quote.shipping",
        ("adapter", "status", "amountMmk"),
    )
    expected_shipping = (
        {"adapter": "pickup", "status": "included", "amountMmk": 0}
        if fulfilment == "pickup"
        else {
            "adapter": "shop_delivery_review",
            "status": "pending_shop_review",
            "amountMmk": 0,
        }
    )
    if shipping_source != expected_shipping:
        raise _fail("Checkout shipping boundary is invalid.")

    payment_source = _object(
        source["payment"],
        "checkout quote.payment",
        ("adapter", "status", "amountMmk"),
    )
    if (
        payment_source["adapter"] not in _PAYMENT_ADAPTERS
        or payment_source["status"] != "not_authorized"
        or payment_source["amountMmk"] != 0
    ):
        raise _fail("Checkout payment boundary is invalid.")
    if not ecommerce_payment_matches_fulfilment(
        fulfilment, payment_source["adapter"]
    ):
        raise _fail("Checkout payment does not match how the customer receives the order.")

    total = _integer(source["totalMmk"], "checkout quote.totalMmk", minimum=1)
    if total != subtotal:
        raise _fail("Checkout total must remain the product subtotal until Shop review.")
    if source["currency"] != "MMK":
        raise _fail("Checkout currency must be MMK.")
    return {
        "schema": ECOMMERCE_QUOTE_SCHEMA,
        "scope": _token(source["scope"], "checkout quote.scope"),
        "quoteId": quote_id,
        "idempotencyKey": key,
        "quotedAt": quoted_at,
        "expiresAt": expires_at,
        "sourcePreviewDigest": _digest(
            source["sourcePreviewDigest"], "checkout quote.sourcePreviewDigest"
        ),
        "pimDigest": _digest(source["pimDigest"], "checkout quote.pimDigest"),
        "currency": "MMK",
        "customerReference": _text(
            source["customerReference"], "checkout quote.customerReference", maximum=80
        ),
        **({
            "customerProfile": customer_profile,
            "deliveryAddress": delivery_address,
        } if customer_profile is not None else {}),
        "fulfilment": fulfilment,
        "lines": lines,
        "subtotalMmk": subtotal,
        "promotion": {
            "adapter": "shop_promotion_review",
            "status": expected_promotion_status,
            "code": promotion_code,
            "amountMmk": 0,
        },
        "tax": dict(tax_source),
        "shipping": dict(shipping_source),
        "payment": dict(payment_source),
        "totalMmk": total,
    }


def build_ecommerce_checkout_quote(
    *,
    pim: Mapping[str, object],
    cart: Sequence[Mapping[str, object]],
    customer_reference: str,
    fulfilment: str,
    payment_adapter: str,
    promotion_code: str | None,
    idempotency_key: str,
    quoted_at: str,
    expires_at: str,
    customer_profile_input: Mapping[str, object] | None = None,
    delivery_address_input: Mapping[str, object] | None = None,
) -> dict[str, Any]:
    """Build one deterministic quote without financial or operational effects."""

    projection = validate_ecommerce_pim_projection(pim)
    key = _text(idempotency_key, "idempotencyKey", maximum=40)
    if _CHECKOUT_KEY.fullmatch(key) is None:
        raise _fail("Checkout idempotency key is invalid.")
    if fulfilment not in _FULFILMENT_METHODS:
        raise _fail("Checkout fulfilment is unsupported.")
    if payment_adapter not in _PAYMENT_ADAPTERS:
        raise _fail("Checkout payment adapter is unsupported.")
    if not ecommerce_payment_matches_fulfilment(fulfilment, payment_adapter):
        raise _fail("Checkout payment does not match how the customer receives the order.")
    code = _optional_text(promotion_code, "promotionCode", maximum=40)
    item_by_sku = {item["sku"]: item for item in projection["items"]}
    cart_rows = _array(list(cart), "cart", minimum=1, maximum=_MAX_LINES)
    quantities: dict[str, int] = {}
    for index, candidate in enumerate(cart_rows):
        row = _object(candidate, f"cart[{index}]", ("sku", "quantity"))
        sku = _token(row["sku"], f"cart[{index}].sku")
        if sku in quantities:
            raise _fail("Cart SKUs must be unique.")
        quantities[sku] = _integer(
            row["quantity"], f"cart[{index}].quantity", minimum=1, maximum=_MAX_QUANTITY
        )
    lines: list[dict[str, Any]] = []
    for sku in sorted(quantities):
        item = item_by_sku.get(sku)
        if item is None:
            raise _fail(f"Cart SKU {sku} is not in the PIM projection.")
        if item["availability"] != "available":
            raise _fail(f"Cart SKU {sku} is sold out.")
        quantity = quantities[sku]
        line_total = quantity * item["unitPriceMmk"]
        if line_total > _MAX_SAFE_INTEGER:
            raise _fail("Cart line exceeds the supported whole-MMK range.")
        lines.append(
            {
                "sku": sku,
                "name": item["name"],
                "variant": item["variant"],
                "quantity": quantity,
                "unitPriceMmk": item["unitPriceMmk"],
                "lineTotalMmk": line_total,
            }
        )
    subtotal = sum(line["lineTotalMmk"] for line in lines)
    if subtotal > _MAX_SAFE_INTEGER:
        raise _fail("Cart exceeds the supported whole-MMK range.")
    customer_profile = None
    delivery_address = None
    if customer_profile_input is not None:
        profile_input = _object(
            customer_profile_input,
            "customerProfileInput",
            ("name", "phone", "previous"),
        )
        customer_profile = build_ecommerce_customer_profile(
            name=profile_input["name"],
            phone=profile_input["phone"],
            saved_at=quoted_at,
            idempotency_key=key,
            previous=profile_input["previous"],
        )
        if fulfilment == "delivery":
            address_input = _object(
                delivery_address_input,
                "deliveryAddressInput",
                ("line1", "township", "city", "instructions", "previous"),
            )
            delivery_address = build_ecommerce_delivery_address(
                line1=address_input["line1"],
                township=address_input["township"],
                city=address_input["city"],
                instructions=address_input["instructions"],
                saved_at=quoted_at,
                idempotency_key=key,
                previous=address_input["previous"],
            )
        elif delivery_address_input is not None:
            raise _fail("Pickup checkout cannot retain a delivery address.")
    elif delivery_address_input is not None:
        raise _fail("Delivery address requires a customer profile.")
    quote: dict[str, Any] = {
        "schema": ECOMMERCE_QUOTE_SCHEMA,
        "scope": projection["scope"],
        "quoteId": f"ECQ-{key[4:]}",
        "idempotencyKey": key,
        "quotedAt": _timestamp(quoted_at, "quotedAt"),
        "expiresAt": _timestamp(expires_at, "expiresAt"),
        "sourcePreviewDigest": projection["sourcePreviewDigest"],
        "pimDigest": projection["pimDigest"],
        "currency": "MMK",
        "customerReference": _text(
            customer_reference, "customerReference", maximum=80
        ),
        **({
            "customerProfile": customer_profile,
            "deliveryAddress": delivery_address,
        } if customer_profile is not None else {}),
        "fulfilment": fulfilment,
        "lines": lines,
        "subtotalMmk": subtotal,
        "promotion": {
            "adapter": "shop_promotion_review",
            "status": "pending_shop_review" if code else "not_requested",
            "code": code,
            "amountMmk": 0,
        },
        "tax": {
            "adapter": "price_inclusive",
            "status": "included",
            "amountMmk": 0,
        },
        "shipping": (
            {"adapter": "pickup", "status": "included", "amountMmk": 0}
            if fulfilment == "pickup"
            else {
                "adapter": "shop_delivery_review",
                "status": "pending_shop_review",
                "amountMmk": 0,
            }
        ),
        "payment": {
            "adapter": payment_adapter,
            "status": "not_authorized",
            "amountMmk": 0,
        },
        "totalMmk": subtotal,
    }
    core = _quote_core(quote)
    core["quoteDigest"] = _canonical_digest(core)
    return core


def validate_ecommerce_checkout_quote(value: object) -> dict[str, Any]:
    base_fields = (
        "schema", "scope", "quoteId", "idempotencyKey", "quotedAt", "expiresAt",
        "sourcePreviewDigest", "pimDigest", "currency", "customerReference", "fulfilment",
        "lines", "subtotalMmk", "promotion", "tax", "shipping", "payment", "totalMmk",
        "quoteDigest",
    )
    structured_fields = ("customerProfile", "deliveryAddress")
    structured = isinstance(value, Mapping) and any(field in value for field in structured_fields)
    source = _object(
        value,
        "checkout quote",
        (*base_fields, *structured_fields) if structured else base_fields,
    )
    core = _quote_core({key: source[key] for key in source if key != "quoteDigest"})
    if _digest(source["quoteDigest"], "checkout quote.quoteDigest") != _canonical_digest(core):
        raise _fail("Checkout quote digest is invalid.")
    core["quoteDigest"] = source["quoteDigest"]
    return core


def build_ecommerce_order_request(
    quote_value: Mapping[str, object],
    *,
    source_storefront_revision: int | None = None,
    source_storefront_action_id: str | None = None,
) -> dict[str, Any]:
    """Freeze a valid quote as intent awaiting accountable Shop review."""

    quote = validate_ecommerce_checkout_quote(quote_value)
    if (source_storefront_revision is None) != (source_storefront_action_id is None):
        raise _fail("Storefront provenance must be complete or absent.")
    revision = (
        None
        if source_storefront_revision is None
        else _integer(source_storefront_revision, "sourceStorefrontRevision", minimum=1)
    )
    action_id = (
        None
        if source_storefront_action_id is None
        else _token(source_storefront_action_id, "sourceStorefrontActionId")
    )
    request = {
        "schema": ECOMMERCE_REQUEST_SCHEMA,
        "mode": "browser-local-request",
        "state": "pending_shop_review",
        "scope": quote["scope"],
        "id": f"ECR-{quote['idempotencyKey'][4:]}",
        "idempotencyKey": quote["idempotencyKey"],
        "createdAt": quote["quotedAt"],
        "sourcePreviewDigest": quote["sourcePreviewDigest"],
        "sourceStorefrontRevision": revision,
        "sourceStorefrontActionId": action_id,
        "customerReference": quote["customerReference"],
        **({
            "customerProfile": _canonical_copy(quote["customerProfile"]),
            "deliveryAddress": _canonical_copy(quote["deliveryAddress"]),
        } if "customerProfile" in quote else {}),
        "fulfilment": quote["fulfilment"],
        "currency": "MMK",
        "lines": _canonical_copy(quote["lines"]),
        "quote": quote,
        "totalMmk": quote["totalMmk"],
    }
    return validate_ecommerce_order_request(request)


def validate_ecommerce_order_request(value: object) -> dict[str, Any]:
    base_fields = (
        "schema", "mode", "state", "scope", "id", "idempotencyKey", "createdAt",
        "sourcePreviewDigest", "sourceStorefrontRevision", "sourceStorefrontActionId",
        "customerReference", "fulfilment", "currency", "lines", "quote", "totalMmk",
    )
    structured_fields = ("customerProfile", "deliveryAddress")
    structured = isinstance(value, Mapping) and any(field in value for field in structured_fields)
    source = _object(
        value,
        "Ecommerce request",
        (*base_fields, *structured_fields) if structured else base_fields,
    )
    if (
        source["schema"] != ECOMMERCE_REQUEST_SCHEMA
        or source["mode"] != "browser-local-request"
        or source["state"] != "pending_shop_review"
    ):
        raise _fail("Ecommerce request boundary is invalid.")
    request_id = _text(source["id"], "Ecommerce request.id", maximum=40)
    key = _text(source["idempotencyKey"], "Ecommerce request.idempotencyKey", maximum=40)
    if (
        _REQUEST_ID.fullmatch(request_id) is None
        or _CHECKOUT_KEY.fullmatch(key) is None
        or request_id[4:] != key[4:]
    ):
        raise _fail("Ecommerce request identity is invalid.")
    quote = validate_ecommerce_checkout_quote(source["quote"])
    lines = [
        _quote_line(candidate, f"Ecommerce request.lines[{index}]")
        for index, candidate in enumerate(
            _array(source["lines"], "Ecommerce request.lines", minimum=1, maximum=_MAX_LINES)
        )
    ]
    revision = source["sourceStorefrontRevision"]
    action_id = source["sourceStorefrontActionId"]
    if (revision is None) != (action_id is None):
        raise _fail("Ecommerce request storefront provenance is incomplete.")
    if revision is not None:
        revision = _integer(revision, "sourceStorefrontRevision", minimum=1)
        action_id = _token(action_id, "sourceStorefrontActionId")
    customer_profile = (
        validate_ecommerce_customer_profile(source["customerProfile"])
        if structured else None
    )
    delivery_address = (
        None if source["deliveryAddress"] is None
        else validate_ecommerce_delivery_address(source["deliveryAddress"])
    ) if structured else None
    request = {
        "schema": ECOMMERCE_REQUEST_SCHEMA,
        "mode": "browser-local-request",
        "state": "pending_shop_review",
        "scope": _token(source["scope"], "Ecommerce request.scope"),
        "id": request_id,
        "idempotencyKey": key,
        "createdAt": _timestamp(source["createdAt"], "Ecommerce request.createdAt"),
        "sourcePreviewDigest": _digest(
            source["sourcePreviewDigest"], "Ecommerce request.sourcePreviewDigest"
        ),
        "sourceStorefrontRevision": revision,
        "sourceStorefrontActionId": action_id,
        "customerReference": _text(
            source["customerReference"], "Ecommerce request.customerReference", maximum=80
        ),
        **({
            "customerProfile": customer_profile,
            "deliveryAddress": delivery_address,
        } if customer_profile is not None else {}),
        "fulfilment": source["fulfilment"],
        "currency": source["currency"],
        "lines": lines,
        "quote": quote,
        "totalMmk": _integer(source["totalMmk"], "Ecommerce request.totalMmk", minimum=1),
    }
    if (
        request["scope"] != quote["scope"]
        or request["createdAt"] != quote["quotedAt"]
        or request["idempotencyKey"] != quote["idempotencyKey"]
        or request["sourcePreviewDigest"] != quote["sourcePreviewDigest"]
        or request["customerReference"] != quote["customerReference"]
        or request.get("customerProfile") != quote.get("customerProfile")
        or request.get("deliveryAddress") != quote.get("deliveryAddress")
        or request["fulfilment"] != quote["fulfilment"]
        or request["currency"] != quote["currency"]
        or request["lines"] != quote["lines"]
        or request["totalMmk"] != quote["totalMmk"]
    ):
        raise _fail("Ecommerce request does not preserve its exact quote.")
    return request


def _current_catalog_item(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, ("sku", "name", "variant", "price", "onHand"))
    return {
        "sku": _token(source["sku"], f"{field}.sku"),
        "name": _text(source["name"], f"{field}.name", maximum=180),
        "variant": _optional_text(source["variant"], f"{field}.variant", maximum=180),
        "price": _integer(source["price"], f"{field}.price", minimum=1),
        "onHand": _integer(source["onHand"], f"{field}.onHand"),
    }


def _tax_configuration(
    value: object,
    field: str,
    *,
    expected_revision: int,
) -> dict[str, Any]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise _fail(f"{field} must be an object.")
    legacy_keys = frozenset(("revision", "code", "label", "rateBasisPoints", "mode", "proof"))
    scheduled_keys = legacy_keys | frozenset(("jurisdictionCode", "effectiveFrom"))
    keys = frozenset(value)
    if keys not in {legacy_keys, scheduled_keys}:
        raise _fail(f"{field} fields do not match the contract.")
    revision = _integer(value["revision"], f"{field}.revision", minimum=1)
    if revision != expected_revision:
        raise _fail(f"{field}.revision breaks the newest-first sequence.")
    code = _text(value["code"], f"{field}.code", maximum=12)
    if re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{0,11}", code) is None:
        raise _fail(f"{field}.code is invalid.")
    mode = value["mode"]
    if mode not in {"exclusive", "inclusive"}:
        raise _fail(f"{field}.mode is invalid.")
    proof = _object(
        value["proof"],
        f"{field}.proof",
        ("actionId", "capturedAt", "actor", "reason", "evidenceReference"),
    )
    captured_at = _timestamp(proof["capturedAt"], f"{field}.proof.capturedAt")
    configuration: dict[str, Any] = {
        "revision": revision,
        "code": code,
        "label": _text(value["label"], f"{field}.label", maximum=80),
        "rateBasisPoints": _integer(
            value["rateBasisPoints"],
            f"{field}.rateBasisPoints",
            maximum=10_000,
        ),
        "mode": mode,
        "proof": {
            "actionId": _text(proof["actionId"], f"{field}.proof.actionId", maximum=160),
            "capturedAt": captured_at,
            "actor": _text(proof["actor"], f"{field}.proof.actor", maximum=180),
            "reason": _text(proof["reason"], f"{field}.proof.reason", maximum=180),
            "evidenceReference": _text(
                proof["evidenceReference"],
                f"{field}.proof.evidenceReference",
                maximum=180,
            ),
        },
    }
    if keys == scheduled_keys:
        jurisdiction_code = _text(
            value["jurisdictionCode"],
            f"{field}.jurisdictionCode",
            maximum=16,
        )
        if re.fullmatch(r"[A-Z0-9][A-Z0-9_-]{1,15}", jurisdiction_code) is None:
            raise _fail(f"{field}.jurisdictionCode is invalid.")
        effective_from = _timestamp(value["effectiveFrom"], f"{field}.effectiveFrom")
        if _instant(effective_from) < _instant(captured_at):
            raise _fail(f"{field}.effectiveFrom precedes its review proof.")
        configuration["jurisdictionCode"] = jurisdiction_code
        configuration["effectiveFrom"] = effective_from
    return configuration


def _round_ecommerce_tax(numerator: int, denominator: int) -> int:
    return (numerator * 2 + denominator) // (denominator * 2)


def review_ecommerce_tax(
    configurations: Sequence[Mapping[str, object]],
    listed_subtotal_mmk: int,
    reviewed_at: str,
    catalog_revision: int,
) -> dict[str, Any]:
    """Resolve one exact Shop-owned tax revision without filing or posting."""

    listed = _integer(listed_subtotal_mmk, "listedSubtotalMmk", minimum=1)
    reviewed = _timestamp(reviewed_at, "reviewedAt")
    catalog = _integer(catalog_revision, "catalogRevision")
    rows = [
        _tax_configuration(
            candidate,
            f"taxConfigurations[{index}]",
            expected_revision=len(configurations) - index,
        )
        for index, candidate in enumerate(configurations)
    ]
    for index, candidate in enumerate(rows[1:], start=1):
        newer = rows[index - 1]
        if (
            _instant(newer["proof"]["capturedAt"])
            < _instant(candidate["proof"]["capturedAt"])
            or _instant(newer.get("effectiveFrom", newer["proof"]["capturedAt"]))
            < _instant(candidate.get("effectiveFrom", candidate["proof"]["capturedAt"]))
        ):
            raise _fail(f"taxConfigurations[{index}] breaks newest-first chronology.")
    configuration = next(
        (
            candidate
            for candidate in rows
            if _instant(candidate["proof"]["capturedAt"]) <= _instant(reviewed)
            and _instant(candidate.get("effectiveFrom", candidate["proof"]["capturedAt"]))
            <= _instant(reviewed)
        ),
        None,
    )
    if configuration is None:
        return {
            "schema": ECOMMERCE_TAX_DECISION_SCHEMA,
            "status": "not_configured",
            "catalogRevision": catalog,
            "taxConfigurationRevision": None,
            "taxCode": None,
            "taxJurisdictionCode": None,
            "taxEffectiveFrom": None,
            "taxRateBasisPoints": 0,
            "taxMode": "not_configured",
            "listedSubtotalMmk": listed,
            "subtotalMmk": listed,
            "taxMmk": 0,
            "totalMmk": listed,
            "policyActionId": None,
            "reviewedAt": reviewed,
        }
    rate = configuration["rateBasisPoints"]
    tax = (
        _round_ecommerce_tax(listed * rate, 10_000)
        if configuration["mode"] == "exclusive"
        else _round_ecommerce_tax(listed * rate, 10_000 + rate)
    )
    subtotal = listed if configuration["mode"] == "exclusive" else listed - tax
    total = listed + tax if configuration["mode"] == "exclusive" else listed
    if subtotal < 0 or tax < 0 or not 1 <= total <= _MAX_SAFE_INTEGER:
        raise _fail("The Shop tax decision exceeds the safe whole-MMK boundary.")
    return {
        "schema": ECOMMERCE_TAX_DECISION_SCHEMA,
        "status": "configured",
        "catalogRevision": catalog,
        "taxConfigurationRevision": configuration["revision"],
        "taxCode": configuration["code"],
        "taxJurisdictionCode": configuration.get("jurisdictionCode"),
        "taxEffectiveFrom": configuration.get("effectiveFrom"),
        "taxRateBasisPoints": rate,
        "taxMode": configuration["mode"],
        "listedSubtotalMmk": listed,
        "subtotalMmk": subtotal,
        "taxMmk": tax,
        "totalMmk": total,
        "policyActionId": configuration["proof"]["actionId"],
        "reviewedAt": reviewed,
    }


def validate_ecommerce_tax_decision(
    value: object,
    configurations: Sequence[Mapping[str, object]],
) -> dict[str, Any]:
    """Reject stale or forged tax evidence by exact deterministic replay."""

    source = _object(value, "taxDecision", (
        "schema", "status", "catalogRevision", "taxConfigurationRevision", "taxCode",
        "taxJurisdictionCode", "taxEffectiveFrom", "taxRateBasisPoints", "taxMode",
        "listedSubtotalMmk", "subtotalMmk", "taxMmk", "totalMmk", "policyActionId",
        "reviewedAt",
    ))
    if source["status"] not in {"configured", "not_configured"}:
        raise _fail("taxDecision.status is invalid.")
    if source["taxMode"] not in {"exclusive", "inclusive", "not_configured"}:
        raise _fail("taxDecision.taxMode is invalid.")
    decision = {
        "schema": source["schema"],
        "status": source["status"],
        "catalogRevision": _integer(source["catalogRevision"], "taxDecision.catalogRevision"),
        "taxConfigurationRevision": None if source["taxConfigurationRevision"] is None else _integer(
            source["taxConfigurationRevision"], "taxDecision.taxConfigurationRevision", minimum=1
        ),
        "taxCode": _optional_text(source["taxCode"], "taxDecision.taxCode", maximum=12),
        "taxJurisdictionCode": _optional_text(
            source["taxJurisdictionCode"], "taxDecision.taxJurisdictionCode", maximum=16
        ),
        "taxEffectiveFrom": None if source["taxEffectiveFrom"] is None else _timestamp(
            source["taxEffectiveFrom"], "taxDecision.taxEffectiveFrom"
        ),
        "taxRateBasisPoints": _integer(
            source["taxRateBasisPoints"], "taxDecision.taxRateBasisPoints", maximum=10_000
        ),
        "taxMode": source["taxMode"],
        "listedSubtotalMmk": _integer(
            source["listedSubtotalMmk"], "taxDecision.listedSubtotalMmk", minimum=1
        ),
        "subtotalMmk": _integer(source["subtotalMmk"], "taxDecision.subtotalMmk"),
        "taxMmk": _integer(source["taxMmk"], "taxDecision.taxMmk"),
        "totalMmk": _integer(source["totalMmk"], "taxDecision.totalMmk", minimum=1),
        "policyActionId": _optional_text(
            source["policyActionId"], "taxDecision.policyActionId", maximum=160
        ),
        "reviewedAt": _timestamp(source["reviewedAt"], "taxDecision.reviewedAt"),
    }
    expected = review_ecommerce_tax(
        configurations,
        decision["listedSubtotalMmk"],
        decision["reviewedAt"],
        decision["catalogRevision"],
    )
    if decision["schema"] != ECOMMERCE_TAX_DECISION_SCHEMA or decision != expected:
        raise _fail(
            "The Ecommerce tax decision is stale, forged, or inconsistent with the Shop tax schedule."
        )
    return decision


def _promotion_policy(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, (
        "revision", "code", "discountBasisPoints", "minimumSubtotalMmk",
        "maximumDiscountMmk", "status", "effectiveFrom", "effectiveUntil", "proof",
    ))
    code = _text(source["code"], f"{field}.code", maximum=40)
    if re.fullmatch(r"[A-Z0-9][A-Z0-9-]{2,39}", code) is None:
        raise _fail(f"{field}.code is invalid.")
    proof = _object(source["proof"], f"{field}.proof", ("actionId", "capturedAt", "actor", "reason", "evidenceReference"))
    effective_from = _timestamp(source["effectiveFrom"], f"{field}.effectiveFrom")
    effective_until = None if source["effectiveUntil"] is None else _timestamp(source["effectiveUntil"], f"{field}.effectiveUntil")
    if effective_until is not None and _instant(effective_until) <= _instant(effective_from):
        raise _fail(f"{field} effective window is invalid.")
    captured_at = _timestamp(proof["capturedAt"], f"{field}.proof.capturedAt")
    if _instant(captured_at) > _instant(effective_from):
        raise _fail(f"{field}.proof is later than its effective start.")
    status = source["status"]
    if status not in {"active", "inactive"}:
        raise _fail(f"{field}.status is invalid.")
    return {
        "revision": _integer(source["revision"], f"{field}.revision", minimum=1),
        "code": code,
        "discountBasisPoints": _integer(source["discountBasisPoints"], f"{field}.discountBasisPoints", minimum=1, maximum=10_000),
        "minimumSubtotalMmk": _integer(source["minimumSubtotalMmk"], f"{field}.minimumSubtotalMmk"),
        "maximumDiscountMmk": _integer(source["maximumDiscountMmk"], f"{field}.maximumDiscountMmk", minimum=1),
        "status": status,
        "effectiveFrom": effective_from,
        "effectiveUntil": effective_until,
        "proof": {
            "actionId": _text(proof["actionId"], f"{field}.proof.actionId", maximum=160),
            "capturedAt": captured_at,
            "actor": _text(proof["actor"], f"{field}.proof.actor", maximum=180),
            "reason": _text(proof["reason"], f"{field}.proof.reason", maximum=180),
            "evidenceReference": _text(proof["evidenceReference"], f"{field}.proof.evidenceReference", maximum=180),
        },
    }


def _promotion_decision(
    policies: Sequence[Mapping[str, object]],
    code_value: object,
    gross_subtotal_mmk: int,
    reviewed_at: str,
) -> dict[str, Any]:
    code = _optional_text(code_value, "promotionCode", maximum=40)
    if code is not None:
        code = code.upper()
        if re.fullmatch(r"[A-Z0-9][A-Z0-9-]{2,39}", code) is None:
            raise _fail("promotionCode is invalid.")
    rows = [_promotion_policy(value, f"promotionPolicies[{index}]") for index, value in enumerate(policies)]
    policy = next((row for row in rows if row["code"] == code and _instant(row["proof"]["capturedAt"]) <= _instant(reviewed_at)), None)
    base = {"schema": "supermega.commerce.promotion-decision.v1", "code": code, "grossSubtotalMmk": gross_subtotal_mmk, "reviewedAt": reviewed_at}
    if code is None:
        return {**base, "status": "not_requested", "policyRevision": None, "policyActionId": None, "discountBasisPoints": 0, "discountMmk": 0, "netSubtotalMmk": gross_subtotal_mmk, "reason": "not_requested"}

    def rejected(reason: str) -> dict[str, Any]:
        return {**base, "status": "rejected", "policyRevision": policy["revision"] if policy else None, "policyActionId": policy["proof"]["actionId"] if policy else None, "discountBasisPoints": policy["discountBasisPoints"] if policy else 0, "discountMmk": 0, "netSubtotalMmk": gross_subtotal_mmk, "reason": reason}

    if policy is None:
        return rejected("not_found")
    if policy["status"] != "active":
        return rejected("inactive")
    if (_instant(policy["effectiveFrom"]) > _instant(reviewed_at)
            or policy["effectiveUntil"] is not None and _instant(policy["effectiveUntil"]) < _instant(reviewed_at)):
        return rejected("not_effective")
    if gross_subtotal_mmk < policy["minimumSubtotalMmk"]:
        return rejected("minimum_not_met")
    discount = min(gross_subtotal_mmk * policy["discountBasisPoints"] // 10_000, policy["maximumDiscountMmk"], gross_subtotal_mmk - 1)
    if discount < 1:
        return rejected("minimum_not_met")
    return {**base, "status": "approved", "policyRevision": policy["revision"], "policyActionId": policy["proof"]["actionId"], "discountBasisPoints": policy["discountBasisPoints"], "discountMmk": discount, "netSubtotalMmk": gross_subtotal_mmk - discount, "reason": "approved"}


def validate_ecommerce_promotion_policy(value: object, field: str = "promotionPolicy") -> dict[str, Any]:
    return _promotion_policy(value, field)


def _shipping_policy(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, (
        "revision", "zoneCode", "townships", "feeMmk", "promiseMinutes",
        "status", "effectiveFrom", "effectiveUntil", "proof",
    ))
    zone_code = _text(source["zoneCode"], f"{field}.zoneCode", maximum=40)
    if re.fullmatch(r"[A-Z0-9][A-Z0-9-]{2,39}", zone_code) is None:
        raise _fail(f"{field}.zoneCode is invalid.")
    townships = [
        _text(value, f"{field}.townships[{index}]", maximum=80)
        for index, value in enumerate(_array(source["townships"], f"{field}.townships", minimum=1, maximum=50))
    ]
    if len({township.casefold() for township in townships}) != len(townships) or townships != sorted(townships, key=str.casefold):
        raise _fail(f"{field}.townships must use unique canonical order.")
    proof = _object(source["proof"], f"{field}.proof", ("actionId", "capturedAt", "actor", "reason", "evidenceReference"))
    effective_from = _timestamp(source["effectiveFrom"], f"{field}.effectiveFrom")
    effective_until = None if source["effectiveUntil"] is None else _timestamp(source["effectiveUntil"], f"{field}.effectiveUntil")
    if effective_until is not None and _instant(effective_until) <= _instant(effective_from):
        raise _fail(f"{field} effective window is invalid.")
    captured_at = _timestamp(proof["capturedAt"], f"{field}.proof.capturedAt")
    if _instant(captured_at) > _instant(effective_from):
        raise _fail(f"{field}.proof is later than its effective start.")
    if source["status"] not in {"active", "inactive"}:
        raise _fail(f"{field}.status is invalid.")
    return {
        "revision": _integer(source["revision"], f"{field}.revision", minimum=1),
        "zoneCode": zone_code,
        "townships": townships,
        "feeMmk": _integer(source["feeMmk"], f"{field}.feeMmk"),
        "promiseMinutes": _integer(source["promiseMinutes"], f"{field}.promiseMinutes", minimum=15, maximum=10_080),
        "status": source["status"],
        "effectiveFrom": effective_from,
        "effectiveUntil": effective_until,
        "proof": {
            "actionId": _text(proof["actionId"], f"{field}.proof.actionId", maximum=160),
            "capturedAt": captured_at,
            "actor": _text(proof["actor"], f"{field}.proof.actor", maximum=180),
            "reason": _text(proof["reason"], f"{field}.proof.reason", maximum=180),
            "evidenceReference": _text(proof["evidenceReference"], f"{field}.proof.evidenceReference", maximum=180),
        },
    }


def validate_ecommerce_shipping_policy(value: object, field: str = "shippingPolicy") -> dict[str, Any]:
    return _shipping_policy(value, field)


def review_ecommerce_shipping(
    policies: Sequence[Mapping[str, object]],
    fulfilment: str,
    township_value: object,
    reviewed_at: str,
) -> dict[str, Any]:
    reviewed = _timestamp(reviewed_at, "reviewedAt")
    if fulfilment == "pickup":
        return {"schema": "supermega.commerce.shipping-decision.v1", "status": "pickup", "reason": "pickup", "township": None, "zoneCode": None, "policyRevision": None, "policyActionId": None, "feeMmk": 0, "promiseMinutes": None, "reviewedAt": reviewed}
    if fulfilment != "delivery":
        raise _fail("fulfilment is invalid.")
    township = _text(township_value, "township", maximum=80)
    rows = [_shipping_policy(value, f"shippingPolicies[{index}]") for index, value in enumerate(policies)]
    policy = next((row for row in rows if any(entry.casefold() == township.casefold() for entry in row["townships"]) and _instant(row["proof"]["capturedAt"]) <= _instant(reviewed)), None)
    base = {"schema": "supermega.commerce.shipping-decision.v1", "township": township, "zoneCode": policy["zoneCode"] if policy else None, "policyRevision": policy["revision"] if policy else None, "policyActionId": policy["proof"]["actionId"] if policy else None, "reviewedAt": reviewed}
    if policy is None:
        return {**base, "status": "rejected", "reason": "not_found", "feeMmk": 0, "promiseMinutes": None}
    if policy["status"] != "active":
        return {**base, "status": "rejected", "reason": "inactive", "feeMmk": 0, "promiseMinutes": None}
    if _instant(policy["effectiveFrom"]) > _instant(reviewed) or policy["effectiveUntil"] is not None and _instant(reviewed) >= _instant(policy["effectiveUntil"]):
        return {**base, "status": "rejected", "reason": "not_effective", "feeMmk": 0, "promiseMinutes": None}
    return {**base, "status": "approved", "reason": "approved", "feeMmk": policy["feeMmk"], "promiseMinutes": policy["promiseMinutes"]}


def review_ecommerce_promotion(
    policies: Sequence[Mapping[str, object]],
    code: object,
    gross_subtotal_mmk: int,
    reviewed_at: str,
) -> dict[str, Any]:
    return _promotion_decision(policies, code, gross_subtotal_mmk, _timestamp(reviewed_at, "reviewedAt"))


def _payment_policy(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, (
        "revision", "adapter", "allowedFulfilments", "maximumOrderMmk", "instructions",
        "status", "effectiveFrom", "effectiveUntil", "proof",
    ))
    adapter = source["adapter"]
    if adapter not in {"pay_on_pickup", "cash_on_delivery", "kbzpay_manual"}:
        raise _fail(f"{field}.adapter is invalid.")
    allowed_fulfilments = [
        _text(candidate, f"{field}.allowedFulfilments[{index}]", maximum=8)
        for index, candidate in enumerate(_array(source["allowedFulfilments"], f"{field}.allowedFulfilments", minimum=1, maximum=2))
    ]
    if any(candidate not in {"delivery", "pickup"} for candidate in allowed_fulfilments) or allowed_fulfilments != sorted(set(allowed_fulfilments)):
        raise _fail(f"{field}.allowedFulfilments must use unique canonical order.")
    maximum_order_mmk = None if source["maximumOrderMmk"] is None else _integer(source["maximumOrderMmk"], f"{field}.maximumOrderMmk", minimum=1)
    proof = _object(source["proof"], f"{field}.proof", ("actionId", "capturedAt", "actor", "reason", "evidenceReference"))
    effective_from = _timestamp(source["effectiveFrom"], f"{field}.effectiveFrom")
    effective_until = None if source["effectiveUntil"] is None else _timestamp(source["effectiveUntil"], f"{field}.effectiveUntil")
    if effective_until is not None and _instant(effective_until) <= _instant(effective_from):
        raise _fail(f"{field} effective window is invalid.")
    captured_at = _timestamp(proof["capturedAt"], f"{field}.proof.capturedAt")
    if _instant(captured_at) > _instant(effective_from):
        raise _fail(f"{field}.proof is later than its effective start.")
    if source["status"] not in {"active", "inactive"}:
        raise _fail(f"{field}.status is invalid.")
    return {
        "revision": _integer(source["revision"], f"{field}.revision", minimum=1),
        "adapter": adapter,
        "allowedFulfilments": allowed_fulfilments,
        "maximumOrderMmk": maximum_order_mmk,
        "instructions": _text(source["instructions"], f"{field}.instructions", maximum=240),
        "status": source["status"],
        "effectiveFrom": effective_from,
        "effectiveUntil": effective_until,
        "proof": {
            "actionId": _text(proof["actionId"], f"{field}.proof.actionId", maximum=160),
            "capturedAt": captured_at,
            "actor": _text(proof["actor"], f"{field}.proof.actor", maximum=180),
            "reason": _text(proof["reason"], f"{field}.proof.reason", maximum=180),
            "evidenceReference": _text(proof["evidenceReference"], f"{field}.proof.evidenceReference", maximum=180),
        },
    }


def validate_ecommerce_payment_policy(value: object, field: str = "paymentPolicy") -> dict[str, Any]:
    return _payment_policy(value, field)


def review_ecommerce_payment(
    policies: Sequence[Mapping[str, object]],
    adapter_value: object,
    fulfilment: str,
    order_amount_mmk: int,
    reviewed_at: str,
) -> dict[str, Any]:
    reviewed = _timestamp(reviewed_at, "reviewedAt")
    adapter = _text(adapter_value, "paymentAdapter", maximum=40)
    if adapter not in {"pay_on_pickup", "cash_on_delivery", "kbzpay_manual"}:
        raise _fail("paymentAdapter is invalid.")
    if fulfilment not in {"pickup", "delivery"}:
        raise _fail("fulfilment is invalid.")
    amount = _integer(order_amount_mmk, "orderAmountMmk", minimum=1)
    rows = [_payment_policy(value, f"paymentPolicies[{index}]") for index, value in enumerate(policies)]
    policy = next((row for row in rows if row["adapter"] == adapter and _instant(row["proof"]["capturedAt"]) <= _instant(reviewed)), None)
    base = {
        "schema": "supermega.commerce.payment-decision.v1",
        "adapter": adapter,
        "policyRevision": policy["revision"] if policy else None,
        "policyActionId": policy["proof"]["actionId"] if policy else None,
        "maximumOrderMmk": policy["maximumOrderMmk"] if policy else None,
        "instructions": policy["instructions"] if policy else None,
        "reviewedAt": reviewed,
        "authorized": False,
    }
    if policy is None:
        return {**base, "status": "rejected", "reason": "not_found"}
    if policy["status"] != "active":
        return {**base, "status": "rejected", "reason": "inactive"}
    if _instant(policy["effectiveFrom"]) > _instant(reviewed) or policy["effectiveUntil"] is not None and _instant(reviewed) >= _instant(policy["effectiveUntil"]):
        return {**base, "status": "rejected", "reason": "not_effective"}
    if fulfilment not in policy["allowedFulfilments"]:
        return {**base, "status": "rejected", "reason": "fulfilment_not_allowed"}
    if policy["maximumOrderMmk"] is not None and amount > policy["maximumOrderMmk"]:
        return {**base, "status": "rejected", "reason": "amount_exceeded"}
    return {**base, "status": "approved", "reason": "approved"}


def prepare_ecommerce_shop_handoff(
    request_value: Mapping[str, object],
    *,
    current_catalog: Sequence[Mapping[str, object]],
    current_promotion_policies: Sequence[Mapping[str, object]],
    current_shipping_policies: Sequence[Mapping[str, object]],
    current_payment_policies: Sequence[Mapping[str, object]],
    current_tax_configurations: Sequence[Mapping[str, object]],
    catalog_revision: int,
    confirmed_at: str,
) -> dict[str, Any]:
    """Revalidate quote intent and prepare one review-only Shop draft."""

    request = validate_ecommerce_order_request(request_value)
    confirmed = _timestamp(confirmed_at, "confirmedAt")
    quote = request["quote"]
    if _instant(confirmed) < _instant(request["createdAt"]):
        raise _fail("Shop handoff confirmation precedes the request.")
    if _instant(confirmed) > _instant(quote["expiresAt"]):
        raise _fail("Checkout quote expired before Shop review.")
    catalog_rows = [
        _current_catalog_item(candidate, f"currentCatalog[{index}]")
        for index, candidate in enumerate(
            _array(list(current_catalog), "currentCatalog", minimum=1, maximum=1000)
        )
    ]
    by_sku = {item["sku"]: item for item in catalog_rows}
    if len(by_sku) != len(catalog_rows):
        raise _fail("Current Shop catalog SKUs must be unique.")
    for line in request["lines"]:
        item = by_sku.get(line["sku"])
        if (
            item is None
            or item["name"] != line["name"]
            or item["variant"] != line["variant"]
            or item["price"] != line["unitPriceMmk"]
            or item["onHand"] < line["quantity"]
        ):
            raise _fail("A quoted item, variant, price, or availability changed.")
    promotion = _promotion_decision(
        current_promotion_policies,
        quote["promotion"]["code"],
        quote["subtotalMmk"],
        confirmed,
    )
    shipping = review_ecommerce_shipping(
        current_shipping_policies,
        request["fulfilment"],
        request.get("deliveryAddress", {}).get("township") if isinstance(request.get("deliveryAddress"), Mapping) else None,
        confirmed,
    )
    if shipping["status"] == "rejected":
        raise _fail(f"Shop delivery is unavailable for {shipping['township']} ({shipping['reason']}).")
    listed_subtotal_mmk = promotion["netSubtotalMmk"] + shipping["feeMmk"]
    tax = review_ecommerce_tax(
        current_tax_configurations,
        listed_subtotal_mmk,
        confirmed,
        catalog_revision,
    )
    total_mmk = tax["totalMmk"]
    payment = review_ecommerce_payment(
        current_payment_policies,
        quote["payment"]["adapter"],
        request["fulfilment"],
        total_mmk,
        confirmed,
    )
    if payment["status"] == "rejected":
        raise _fail(f"Shop payment method is unavailable ({payment['reason']}).")
    draft = {
        "schema": ECOMMERCE_SHOP_DRAFT_SCHEMA,
        "mode": "browser-memory-shop-draft",
        "state": "review_required",
        "id": f"ESD-{request['id'][4:]}",
        "sourceRequestId": request["id"],
        "sourcePreviewDigest": request["sourcePreviewDigest"],
        "quoteDigest": quote["quoteDigest"],
        "quoteExpiresAt": quote["expiresAt"],
        "createdAt": request["createdAt"],
        "confirmedAt": confirmed,
        "customerReference": request["customerReference"],
        **({
            "customerProfile": _canonical_copy(request["customerProfile"]),
            "deliveryAddress": _canonical_copy(request["deliveryAddress"]),
        } if "customerProfile" in request else {}),
        "fulfilment": request["fulfilment"],
        "currency": "MMK",
        "operatingContext": {
            "organizationScope": request["scope"],
            "operatingUnitLocationId": "LOC-MAIN",
            "sourceAuthority": "ecommerce",
            "targetAuthority": "commerce",
            "recordType": "order_request",
            "writePolicy": "human_review_required",
        },
        "lines": _canonical_copy(request["lines"]),
        "pricing": {
            "subtotalMmk": quote["subtotalMmk"],
            "promotion": promotion,
            "tax": tax,
            "shipping": shipping,
            "payment": payment,
            "totalMmk": total_mmk,
        },
        "totalMmk": total_mmk,
        "evidenceReference": (
            f"ECOMMERCE:{request['id']}:{request['sourcePreviewDigest']}:"
            f"{quote['quoteDigest']}:{request['scope']}:LOC-MAIN:"
            f"ecommerce>commerce:human_review_required:{promotion['status']}:"
            f"{promotion['policyRevision'] if promotion['policyRevision'] is not None else 'none'}:"
            f"{promotion['discountMmk']}:shipping:{shipping['status']}:"
            f"{shipping['policyRevision'] if shipping['policyRevision'] is not None else 'none'}:"
            f"{shipping['feeMmk']}:tax:{tax['status']}:"
            f"{tax['taxConfigurationRevision'] if tax['taxConfigurationRevision'] is not None else 'none'}:"
            f"{tax['policyActionId'] if tax['policyActionId'] is not None else 'none'}:"
            f"{tax['taxMode']}:{tax['taxMmk']}:{tax['totalMmk']}:payment:{payment['status']}:"
            f"{payment['policyRevision'] if payment['policyRevision'] is not None else 'none'}:"
            f"{payment['adapter']}"
        ),
    }
    return _canonical_copy(draft)


def _order_line(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, ("sku", "quantity"))
    return {
        "sku": _token(source["sku"], f"{field}.sku"),
        "quantity": _integer(
            source["quantity"], f"{field}.quantity", minimum=1, maximum=_MAX_QUANTITY
        ),
    }


def _return_record(value: object, field: str) -> dict[str, Any]:
    source = _object(value, field, ("sku", "quantity"))
    return {
        "sku": _token(source["sku"], f"{field}.sku"),
        "quantity": _integer(
            source["quantity"], f"{field}.quantity", minimum=1, maximum=_MAX_QUANTITY
        ),
    }


def build_ecommerce_return_intent(
    *,
    scope: str,
    order_snapshot: Mapping[str, object],
    sku: str,
    quantity: int,
    disposition: str,
    reason: str,
    idempotency_key: str,
    created_at: str,
) -> dict[str, Any]:
    """Prepare return intent for Shop; no stock, refund, or order change occurs."""

    order = _object(
        order_snapshot,
        "orderSnapshot",
        ("id", "status", "sourceRecordId", "lines", "returns", "completion"),
    )
    order_id = _token(order["id"], "orderSnapshot.id")
    source_request_id = _text(
        order["sourceRecordId"], "orderSnapshot.sourceRecordId", maximum=40
    )
    if order["status"] != "completed" or not isinstance(order["completion"], Mapping):
        raise _fail("Returns require a completed Shop order with completion proof.")
    if _REQUEST_ID.fullmatch(source_request_id) is None:
        raise _fail("Return order is not attributable to an Ecommerce request.")
    lines = [
        _order_line(candidate, f"orderSnapshot.lines[{index}]")
        for index, candidate in enumerate(
            _array(order["lines"], "orderSnapshot.lines", minimum=1, maximum=_MAX_LINES)
        )
    ]
    returns = [
        _return_record(candidate, f"orderSnapshot.returns[{index}]")
        for index, candidate in enumerate(
            _array(order["returns"], "orderSnapshot.returns", maximum=100)
        )
    ]
    canonical_sku = _token(sku, "sku")
    matching = [line for line in lines if line["sku"] == canonical_sku]
    if len(matching) != 1:
        raise _fail("Return SKU is not one exact sold line.")
    returned = sum(record["quantity"] for record in returns if record["sku"] == canonical_sku)
    canonical_quantity = _integer(
        quantity, "quantity", minimum=1, maximum=_MAX_QUANTITY
    )
    if canonical_quantity > matching[0]["quantity"] - returned:
        raise _fail("Return quantity exceeds the remaining sold quantity.")
    if disposition not in _RETURN_DISPOSITIONS:
        raise _fail("Return disposition is unsupported.")
    key = _text(idempotency_key, "idempotencyKey", maximum=40)
    if _RETURN_KEY.fullmatch(key) is None:
        raise _fail("Return idempotency key is invalid.")
    intent = {
        "schema": ECOMMERCE_RETURN_INTENT_SCHEMA,
        "state": "pending_shop_review",
        "scope": _token(scope, "scope"),
        "id": f"ERR-{key[4:]}",
        "idempotencyKey": key,
        "createdAt": _timestamp(created_at, "createdAt"),
        "orderId": order_id,
        "sourceRequestId": source_request_id,
        "sku": canonical_sku,
        "quantity": canonical_quantity,
        "disposition": disposition,
        "reason": _text(reason, "reason", maximum=300),
        "refundStatus": "not_started",
        "evidenceReference": f"ECOMMERCE-RETURN:{key[4:]}:{order_id}:{source_request_id}",
    }
    return validate_ecommerce_return_intent(intent)


def validate_ecommerce_return_intent(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "return intent",
        (
            "schema",
            "state",
            "scope",
            "id",
            "idempotencyKey",
            "createdAt",
            "orderId",
            "sourceRequestId",
            "sku",
            "quantity",
            "disposition",
            "reason",
            "refundStatus",
            "evidenceReference",
        ),
    )
    return_id = _text(source["id"], "return intent.id", maximum=40)
    key = _text(source["idempotencyKey"], "return intent.idempotencyKey", maximum=40)
    request_id = _text(source["sourceRequestId"], "return intent.sourceRequestId", maximum=40)
    if (
        source["schema"] != ECOMMERCE_RETURN_INTENT_SCHEMA
        or source["state"] != "pending_shop_review"
        or _RETURN_ID.fullmatch(return_id) is None
        or _RETURN_KEY.fullmatch(key) is None
        or return_id[4:] != key[4:]
        or _REQUEST_ID.fullmatch(request_id) is None
        or source["refundStatus"] != "not_started"
        or source["disposition"] not in _RETURN_DISPOSITIONS
    ):
        raise _fail("Return intent boundary is invalid.")
    order_id = _token(source["orderId"], "return intent.orderId")
    expected_reference = f"ECOMMERCE-RETURN:{key[4:]}:{order_id}:{request_id}"
    if source["evidenceReference"] != expected_reference:
        raise _fail("Return intent evidence reference is invalid.")
    return {
        "schema": ECOMMERCE_RETURN_INTENT_SCHEMA,
        "state": "pending_shop_review",
        "scope": _token(source["scope"], "return intent.scope"),
        "id": return_id,
        "idempotencyKey": key,
        "createdAt": _timestamp(source["createdAt"], "return intent.createdAt"),
        "orderId": order_id,
        "sourceRequestId": request_id,
        "sku": _token(source["sku"], "return intent.sku"),
        "quantity": _integer(
            source["quantity"], "return intent.quantity", minimum=1, maximum=_MAX_QUANTITY
        ),
        "disposition": source["disposition"],
        "reason": _text(source["reason"], "return intent.reason", maximum=300),
        "refundStatus": "not_started",
        "evidenceReference": expected_reference,
    }


def project_ecommerce_return_outcome(
    intent_value: Mapping[str, object],
    order_value: Mapping[str, object],
) -> dict[str, Any] | None:
    """Project one exact Shop return record without creating refund authority."""

    try:
        intent = validate_ecommerce_return_intent(intent_value)
        if (
            not isinstance(order_value, Mapping)
            or order_value.get("id") != intent["orderId"]
            or order_value.get("status") != "completed"
            or not isinstance(order_value.get("completion"), Mapping)
            or order_value.get("sourceRecordId") != intent["sourceRequestId"]
            or order_value.get("refundStatus") not in {"none", "due", "settled"}
            or not isinstance(order_value.get("returns"), list)
        ):
            return None
        matching_evidence = [
            record
            for record in order_value["returns"]
            if isinstance(record, Mapping)
            and record.get("evidenceReference") == intent["evidenceReference"]
        ]
        if len(matching_evidence) != 1:
            return None
        record = matching_evidence[0]
        if (
            record.get("sku") != intent["sku"]
            or record.get("quantity") != intent["quantity"]
            or record.get("disposition") != intent["disposition"]
        ):
            return None
        reviewed_at = _timestamp(record.get("createdAt"), "return outcome.reviewedAt")
        reviewed_by = _text(record.get("actor"), "return outcome.reviewedBy", maximum=180)
        return_action_id = _token(record.get("actionId"), "return outcome.returnActionId")
        if datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")) < datetime.fromisoformat(
            intent["createdAt"].replace("Z", "+00:00")
        ):
            return None
        refund_status = order_value["refundStatus"]
        refund_settled_at = None
        refund_settled_by = None
        refund_evidence_reference = None
        if refund_status == "settled":
            refund_settled_at = _timestamp(
                order_value.get("refundSettledAt"), "return outcome.refundSettledAt"
            )
            refund_settled_by = _text(
                order_value.get("refundSettledBy"),
                "return outcome.refundSettledBy",
                maximum=180,
            )
            refund_evidence_reference = _text(
                order_value.get("refundEvidenceReference"),
                "return outcome.refundEvidenceReference",
                maximum=180,
            )
            if datetime.fromisoformat(
                refund_settled_at.replace("Z", "+00:00")
            ) < datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")):
                return None
        return {
            "schema": ECOMMERCE_RETURN_OUTCOME_SCHEMA,
            "state": "accepted",
            "scope": intent["scope"],
            "intentId": intent["id"],
            "orderId": intent["orderId"],
            "sourceRequestId": intent["sourceRequestId"],
            "sku": intent["sku"],
            "quantity": intent["quantity"],
            "disposition": intent["disposition"],
            "stockOutcome": (
                "restocked" if intent["disposition"] == "restock" else "not_restocked"
            ),
            "reviewedAt": reviewed_at,
            "reviewedBy": reviewed_by,
            "returnActionId": return_action_id,
            "returnEvidenceReference": intent["evidenceReference"],
            "refundStatus": refund_status,
            "refundSettledAt": refund_settled_at,
            "refundSettledBy": refund_settled_by,
            "refundEvidenceReference": refund_evidence_reference,
            "automaticRefundPerformed": False,
            "customerMessageSent": False,
            "providerCalled": False,
        }
    except (EcommerceLifecycleValidationError, TypeError, ValueError):
        return None


def build_ecommerce_support_intent(
    *,
    scope: str,
    order_snapshot: Mapping[str, object],
    category: str,
    description: str,
    idempotency_key: str,
    created_at: str,
) -> dict[str, Any]:
    """Prepare order-bound support evidence; no message or refund occurs."""

    if not isinstance(order_snapshot, Mapping) or not {
        "id", "status", "sourceRecordId", "completion"
    }.issubset(order_snapshot):
        raise _fail("orderSnapshot must retain completed Ecommerce order evidence.")
    order = order_snapshot
    if order["status"] != "completed" or not isinstance(order["completion"], Mapping):
        raise _fail("Support requests require a completed Shop order with completion proof.")
    order_id = _token(order["id"], "orderSnapshot.id")
    request_id = _text(
        order["sourceRecordId"], "orderSnapshot.sourceRecordId", maximum=40
    )
    if _REQUEST_ID.fullmatch(request_id) is None:
        raise _fail("Support order is not attributable to an Ecommerce request.")
    if category not in _SUPPORT_CATEGORIES:
        raise _fail("Support category is unsupported.")
    key = _text(idempotency_key, "idempotencyKey", maximum=40)
    if _SUPPORT_KEY.fullmatch(key) is None:
        raise _fail("Support idempotency key is invalid.")
    return validate_ecommerce_support_intent(
        {
            "schema": ECOMMERCE_SUPPORT_INTENT_SCHEMA,
            "state": "pending_shop_review",
            "scope": _token(scope, "scope"),
            "id": f"ESR-{key[4:]}",
            "idempotencyKey": key,
            "createdAt": _timestamp(created_at, "createdAt"),
            "orderId": order_id,
            "sourceRequestId": request_id,
            "category": category,
            "description": _text(description, "description", maximum=300),
            "externalMessageSent": False,
            "refundStarted": False,
            "evidenceReference": f"ECOMMERCE-SUPPORT:{key[4:]}:{order_id}:{request_id}",
        }
    )


def validate_ecommerce_support_intent(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "support intent",
        (
            "schema", "state", "scope", "id", "idempotencyKey", "createdAt",
            "orderId", "sourceRequestId", "category", "description",
            "externalMessageSent", "refundStarted", "evidenceReference",
        ),
    )
    support_id = _text(source["id"], "support intent.id", maximum=40)
    key = _text(source["idempotencyKey"], "support intent.idempotencyKey", maximum=40)
    request_id = _text(source["sourceRequestId"], "support intent.sourceRequestId", maximum=40)
    order_id = _token(source["orderId"], "support intent.orderId")
    expected_reference = f"ECOMMERCE-SUPPORT:{key[4:]}:{order_id}:{request_id}"
    if (
        source["schema"] != ECOMMERCE_SUPPORT_INTENT_SCHEMA
        or source["state"] != "pending_shop_review"
        or _SUPPORT_ID.fullmatch(support_id) is None
        or _SUPPORT_KEY.fullmatch(key) is None
        or support_id[4:] != key[4:]
        or _REQUEST_ID.fullmatch(request_id) is None
        or source["category"] not in _SUPPORT_CATEGORIES
        or source["externalMessageSent"] is not False
        or source["refundStarted"] is not False
        or source["evidenceReference"] != expected_reference
    ):
        raise _fail("Support intent boundary is invalid.")
    return {
        "schema": ECOMMERCE_SUPPORT_INTENT_SCHEMA,
        "state": "pending_shop_review",
        "scope": _token(source["scope"], "support intent.scope"),
        "id": support_id,
        "idempotencyKey": key,
        "createdAt": _timestamp(source["createdAt"], "support intent.createdAt"),
        "orderId": order_id,
        "sourceRequestId": request_id,
        "category": source["category"],
        "description": _text(source["description"], "support intent.description", maximum=300),
        "externalMessageSent": False,
        "refundStarted": False,
        "evidenceReference": expected_reference,
    }


def project_ecommerce_support_outcome(
    intent_value: Mapping[str, object],
    order_value: Mapping[str, object],
) -> dict[str, Any] | None:
    """Project one exact Shop case without claiming customer delivery or refund."""

    try:
        intent = validate_ecommerce_support_intent(intent_value)
        if (
            not isinstance(order_value, Mapping)
            or order_value.get("id") != intent["orderId"]
            or order_value.get("status") != "completed"
            or order_value.get("sourceRecordId") != intent["sourceRequestId"]
            or not isinstance(order_value.get("supportCases"), list)
        ):
            return None
        matches = [
            case
            for case in order_value["supportCases"]
            if isinstance(case, Mapping) and case.get("sourceIntentId") == intent["id"]
        ]
        if len(matches) != 1:
            return None
        case = matches[0]
        opening = case.get("opening")
        if not isinstance(opening, Mapping):
            return None
        reopen = case.get("reopen")
        service_events = case.get("followUpServiceEvents") if isinstance(reopen, Mapping) else case.get("serviceEvents")
        latest_service = service_events[0] if isinstance(service_events, list) and service_events else None
        service = latest_service if isinstance(latest_service, Mapping) else reopen if isinstance(reopen, Mapping) else case
        owner = _text(service.get("owner"), "support outcome.owner", maximum=120)
        priority = service.get("priority")
        due_at = _timestamp(service.get("dueAt"), "support outcome.dueAt")
        if (
            priority not in _SUPPORT_PRIORITIES
            or case.get("caseId") != f"CASE-{intent['id'][4:]}"
            or case.get("sourceRequestId") != intent["sourceRequestId"]
            or case.get("customerRequestedAt") != intent["createdAt"]
            or case.get("category") != intent["category"]
            or case.get("customerDescription") != intent["description"]
            or opening.get("evidenceReference") != intent["evidenceReference"]
            or case.get("externalMessageSent") is not False
            or case.get("refundStarted") is not False
        ):
            return None
        opened_at = _timestamp(opening.get("capturedAt"), "support outcome.openedAt")
        opened_by = _text(opening.get("actor"), "support outcome.openedBy", maximum=180)
        if datetime.fromisoformat(opened_at.replace("Z", "+00:00")) < datetime.fromisoformat(
            intent["createdAt"].replace("Z", "+00:00")
        ):
            return None
        current_resolution = case.get("followUpResolution") if isinstance(reopen, Mapping) else case.get("resolution")
        resolution_outcome = None
        resolved_at = None
        resolved_by = None
        resolution_evidence_reference = None
        if case.get("status") == "resolved":
            if not isinstance(current_resolution, Mapping):
                return None
            proof = current_resolution.get("proof")
            if (
                current_resolution.get("outcome") not in _SUPPORT_RESOLUTION_OUTCOMES
                or not isinstance(proof, Mapping)
            ):
                return None
            resolution_outcome = current_resolution["outcome"]
            resolved_at = _timestamp(proof.get("capturedAt"), "support outcome.resolvedAt")
            resolved_by = _text(proof.get("actor"), "support outcome.resolvedBy", maximum=180)
            resolution_evidence_reference = _text(
                proof.get("evidenceReference"),
                "support outcome.resolutionEvidenceReference",
                maximum=180,
            )
            if datetime.fromisoformat(resolved_at.replace("Z", "+00:00")) < datetime.fromisoformat(
                opened_at.replace("Z", "+00:00")
            ):
                return None
        elif case.get("status") != "open" or current_resolution is not None:
            return None
        return {
            "schema": ECOMMERCE_SUPPORT_OUTCOME_SCHEMA,
            "state": case["status"],
            "scope": intent["scope"],
            "intentId": intent["id"],
            "orderId": intent["orderId"],
            "sourceRequestId": intent["sourceRequestId"],
            "caseId": case["caseId"],
            "category": intent["category"],
            "openedAt": opened_at,
            "openedBy": opened_by,
            "owner": owner,
            "priority": priority,
            "dueAt": due_at,
            "resolutionOutcome": resolution_outcome,
            "resolvedAt": resolved_at,
            "resolvedBy": resolved_by,
            "resolutionEvidenceReference": resolution_evidence_reference,
            "externalMessageSent": False,
            "refundStarted": False,
            "providerCalled": False,
        }
    except (EcommerceLifecycleValidationError, TypeError, ValueError):
        return None


def build_ecommerce_cancellation_intent(
    *,
    scope: str,
    commerce_state: Mapping[str, object],
    order_id: str,
    reason_code: str,
    reason: str,
    idempotency_key: str,
    created_at: str,
) -> dict[str, Any]:
    """Prepare a Shop-reviewed cancellation request without changing the order."""

    from supermega_runtime.commerce_runtime import commerce_order_acknowledgement

    canonical_order_id = _token(order_id, "orderId")
    orders = commerce_state.get("orders")
    if not isinstance(orders, list):
        raise _fail("Cancellation requests require a Commerce order collection.")
    order = next(
        (
            candidate
            for candidate in orders
            if isinstance(candidate, Mapping) and candidate.get("id") == canonical_order_id
        ),
        None,
    )
    acknowledgement = commerce_order_acknowledgement(commerce_state, canonical_order_id)
    if (
        order is None
        or acknowledgement is None
        or acknowledgement.get("schema") != "supermega.commerce.order-acknowledgement.v1"
        or order.get("status") not in {"confirmed", "preparing", "ready"}
        or acknowledgement.get("status") != order.get("status")
        or acknowledgement.get("cancellation", {}).get("state") != "not_cancelled"
        or acknowledgement.get("payment", {}).get("status") != order.get("paymentStatus")
        or acknowledgement.get("payment", {}).get("refundStatus") != "none"
        or acknowledgement.get("totalMmk") != order.get("total")
    ):
        raise _fail(
            "Cancellation requests require one attributable active Shop order acknowledgement."
        )
    request_id = _text(
        acknowledgement["evidence"].get("sourceRecordId"),
        "order acknowledgement sourceRecordId",
        maximum=40,
    )
    if _REQUEST_ID.fullmatch(request_id) is None:
        raise _fail("Cancellation order is not attributable to an Ecommerce request.")
    if reason_code not in _CANCELLATION_REASON_CODES:
        raise _fail("Cancellation reason code is unsupported.")
    key = _text(idempotency_key, "idempotencyKey", maximum=40)
    if _CANCELLATION_KEY.fullmatch(key) is None:
        raise _fail("Cancellation idempotency key is invalid.")
    canonical_created_at = _timestamp(created_at, "createdAt")
    order_created_at = _timestamp(order.get("createdAt"), "order.createdAt")
    if datetime.fromisoformat(canonical_created_at.replace("Z", "+00:00")) < datetime.fromisoformat(
        order_created_at.replace("Z", "+00:00")
    ):
        raise _fail("Cancellation request cannot predate the Shop order.")
    acknowledgement_digest = _digest(
        acknowledgement.get("digest"), "order acknowledgement digest"
    )
    return validate_ecommerce_cancellation_intent(
        {
            "schema": ECOMMERCE_CANCELLATION_INTENT_SCHEMA,
            "state": "pending_shop_review",
            "scope": _token(scope, "scope"),
            "id": f"ECN-{key[4:]}",
            "idempotencyKey": key,
            "createdAt": canonical_created_at,
            "orderId": canonical_order_id,
            "sourceRequestId": request_id,
            "sourceAcknowledgementDigest": acknowledgement_digest,
            "orderStatus": order["status"],
            "paymentStatus": order["paymentStatus"],
            "refundStatus": "none",
            "totalMmk": acknowledgement["totalMmk"],
            "reasonCode": reason_code,
            "reason": _text(reason, "reason", maximum=300),
            "customerMessageSent": False,
            "orderCancelled": False,
            "refundStarted": False,
            "evidenceReference": (
                f"ECOMMERCE-CANCELLATION:{key[4:]}:{canonical_order_id}:"
                f"{request_id}:{acknowledgement_digest[7:15]}"
            ),
        }
    )


def validate_ecommerce_cancellation_intent(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "cancellation intent",
        (
            "schema", "state", "scope", "id", "idempotencyKey", "createdAt",
            "orderId", "sourceRequestId", "sourceAcknowledgementDigest",
            "orderStatus", "paymentStatus", "refundStatus", "totalMmk",
            "reasonCode", "reason", "customerMessageSent", "orderCancelled",
            "refundStarted", "evidenceReference",
        ),
    )
    cancellation_id = _text(source["id"], "cancellation intent.id", maximum=40)
    key = _text(
        source["idempotencyKey"], "cancellation intent.idempotencyKey", maximum=40
    )
    request_id = _text(
        source["sourceRequestId"], "cancellation intent.sourceRequestId", maximum=40
    )
    order_id = _token(source["orderId"], "cancellation intent.orderId")
    acknowledgement_digest = _digest(
        source["sourceAcknowledgementDigest"],
        "cancellation intent.sourceAcknowledgementDigest",
    )
    expected_reference = (
        f"ECOMMERCE-CANCELLATION:{key[4:]}:{order_id}:"
        f"{request_id}:{acknowledgement_digest[7:15]}"
    )
    if (
        source["schema"] != ECOMMERCE_CANCELLATION_INTENT_SCHEMA
        or source["state"] != "pending_shop_review"
        or _CANCELLATION_ID.fullmatch(cancellation_id) is None
        or _CANCELLATION_KEY.fullmatch(key) is None
        or cancellation_id[4:] != key[4:]
        or _REQUEST_ID.fullmatch(request_id) is None
        or source["orderStatus"] not in {"confirmed", "preparing", "ready"}
        or source["paymentStatus"] not in {"pending", "reconciled"}
        or source["refundStatus"] != "none"
        or source["reasonCode"] not in _CANCELLATION_REASON_CODES
        or source["customerMessageSent"] is not False
        or source["orderCancelled"] is not False
        or source["refundStarted"] is not False
        or source["evidenceReference"] != expected_reference
    ):
        raise _fail("Cancellation intent boundary is invalid.")
    return {
        "schema": ECOMMERCE_CANCELLATION_INTENT_SCHEMA,
        "state": "pending_shop_review",
        "scope": _token(source["scope"], "cancellation intent.scope"),
        "id": cancellation_id,
        "idempotencyKey": key,
        "createdAt": _timestamp(source["createdAt"], "cancellation intent.createdAt"),
        "orderId": order_id,
        "sourceRequestId": request_id,
        "sourceAcknowledgementDigest": acknowledgement_digest,
        "orderStatus": source["orderStatus"],
        "paymentStatus": source["paymentStatus"],
        "refundStatus": "none",
        "totalMmk": _integer(
            source["totalMmk"],
            "cancellation intent.totalMmk",
            minimum=1,
            maximum=_MAX_SAFE_INTEGER,
        ),
        "reasonCode": source["reasonCode"],
        "reason": _text(source["reason"], "cancellation intent.reason", maximum=300),
        "customerMessageSent": False,
        "orderCancelled": False,
        "refundStarted": False,
        "evidenceReference": expected_reference,
    }


def _ecommerce_cancellation_matches_shop(
    commerce_state: Mapping[str, object], intent: Mapping[str, object]
) -> bool:
    from supermega_runtime.commerce_runtime import commerce_order_acknowledgement

    orders = commerce_state.get("orders")
    if not isinstance(orders, list):
        return False
    order = next(
        (
            candidate
            for candidate in orders
            if isinstance(candidate, Mapping) and candidate.get("id") == intent["orderId"]
        ),
        None,
    )
    acknowledgement = commerce_order_acknowledgement(commerce_state, intent["orderId"])
    return bool(
        order
        and acknowledgement
        and order.get("sourceRecordId") == intent["sourceRequestId"]
        and acknowledgement.get("digest") == intent["sourceAcknowledgementDigest"]
        and acknowledgement.get("status") == intent["orderStatus"]
        and acknowledgement.get("payment", {}).get("status") == intent["paymentStatus"]
        and acknowledgement.get("payment", {}).get("refundStatus") == intent["refundStatus"]
        and acknowledgement.get("totalMmk") == intent["totalMmk"]
        and acknowledgement.get("cancellation", {}).get("state") == "not_cancelled"
    )


def build_ecommerce_cancellation_decision(
    *,
    scope: str,
    commerce_state: Mapping[str, object],
    intent: Mapping[str, object],
    proof: Mapping[str, object],
) -> dict[str, Any]:
    """Record a Shop decision to keep the order without mutating Commerce."""

    canonical_intent = validate_ecommerce_cancellation_intent(intent)
    if _token(scope, "scope") != canonical_intent["scope"]:
        raise _fail("Cancellation decision belongs to a different Ecommerce workspace.")
    if not _ecommerce_cancellation_matches_shop(commerce_state, canonical_intent):
        raise _fail(
            "Cancellation decision requires the exact active Shop order reviewed by the customer request."
        )
    canonical_proof = _object(
        proof,
        "cancellation decision proof",
        ("actionId", "capturedAt", "actor", "reason", "evidenceReference"),
    )
    created_at = _timestamp(
        canonical_proof["capturedAt"], "cancellation decision proof.capturedAt"
    )
    if datetime.fromisoformat(created_at.replace("Z", "+00:00")) < datetime.fromisoformat(
        canonical_intent["createdAt"].replace("Z", "+00:00")
    ):
        raise _fail("Cancellation decision cannot predate the customer request.")
    if canonical_proof["evidenceReference"] != canonical_intent["evidenceReference"]:
        raise _fail("Cancellation decision evidence must remain fixed to the customer request.")
    suffix = canonical_intent["id"][4:]
    return validate_ecommerce_cancellation_decision(
        {
            "schema": ECOMMERCE_CANCELLATION_DECISION_SCHEMA,
            "state": "kept_by_shop",
            "scope": canonical_intent["scope"],
            "id": f"ECD-{suffix}",
            "idempotencyKey": f"CDI-{suffix}",
            "createdAt": created_at,
            "intentId": canonical_intent["id"],
            "intentDigest": _canonical_digest(canonical_intent),
            "orderId": canonical_intent["orderId"],
            "sourceRequestId": canonical_intent["sourceRequestId"],
            "sourceAcknowledgementDigest": canonical_intent["sourceAcknowledgementDigest"],
            "orderStatus": canonical_intent["orderStatus"],
            "paymentStatus": canonical_intent["paymentStatus"],
            "refundStatus": "none",
            "totalMmk": canonical_intent["totalMmk"],
            "actor": _text(canonical_proof["actor"], "cancellation decision proof.actor", maximum=120),
            "reason": _text(canonical_proof["reason"], "cancellation decision proof.reason", maximum=180),
            "evidenceReference": canonical_intent["evidenceReference"],
            "customerMessageSent": False,
            "orderCancelled": False,
            "refundStarted": False,
            "providerCalled": False,
        }
    )


def validate_ecommerce_cancellation_decision(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "cancellation decision",
        (
            "schema", "state", "scope", "id", "idempotencyKey", "createdAt",
            "intentId", "intentDigest", "orderId", "sourceRequestId",
            "sourceAcknowledgementDigest", "orderStatus", "paymentStatus",
            "refundStatus", "totalMmk", "actor", "reason", "evidenceReference",
            "customerMessageSent", "orderCancelled", "refundStarted", "providerCalled",
        ),
    )
    decision_id = _text(source["id"], "cancellation decision.id", maximum=40)
    key = _text(source["idempotencyKey"], "cancellation decision.idempotencyKey", maximum=40)
    intent_id = _text(source["intentId"], "cancellation decision.intentId", maximum=40)
    request_id = _text(source["sourceRequestId"], "cancellation decision.sourceRequestId", maximum=40)
    if (
        source["schema"] != ECOMMERCE_CANCELLATION_DECISION_SCHEMA
        or source["state"] != "kept_by_shop"
        or _CANCELLATION_DECISION_ID.fullmatch(decision_id) is None
        or _CANCELLATION_DECISION_KEY.fullmatch(key) is None
        or _CANCELLATION_ID.fullmatch(intent_id) is None
        or decision_id[4:] != key[4:]
        or decision_id[4:] != intent_id[4:]
        or _REQUEST_ID.fullmatch(request_id) is None
        or source["orderStatus"] not in {"confirmed", "preparing", "ready"}
        or source["paymentStatus"] not in {"pending", "reconciled"}
        or source["refundStatus"] != "none"
        or source["customerMessageSent"] is not False
        or source["orderCancelled"] is not False
        or source["refundStarted"] is not False
        or source["providerCalled"] is not False
    ):
        raise _fail("Cancellation decision boundary is invalid.")
    return {
        "schema": ECOMMERCE_CANCELLATION_DECISION_SCHEMA,
        "state": "kept_by_shop",
        "scope": _token(source["scope"], "cancellation decision.scope"),
        "id": decision_id,
        "idempotencyKey": key,
        "createdAt": _timestamp(source["createdAt"], "cancellation decision.createdAt"),
        "intentId": intent_id,
        "intentDigest": _digest(source["intentDigest"], "cancellation decision.intentDigest"),
        "orderId": _token(source["orderId"], "cancellation decision.orderId"),
        "sourceRequestId": request_id,
        "sourceAcknowledgementDigest": _digest(
            source["sourceAcknowledgementDigest"],
            "cancellation decision.sourceAcknowledgementDigest",
        ),
        "orderStatus": source["orderStatus"],
        "paymentStatus": source["paymentStatus"],
        "refundStatus": "none",
        "totalMmk": _integer(
            source["totalMmk"], "cancellation decision.totalMmk", minimum=1, maximum=_MAX_SAFE_INTEGER
        ),
        "actor": _text(source["actor"], "cancellation decision.actor", maximum=120),
        "reason": _text(source["reason"], "cancellation decision.reason", maximum=180),
        "evidenceReference": _text(
            source["evidenceReference"], "cancellation decision.evidenceReference", maximum=180
        ),
        "customerMessageSent": False,
        "orderCancelled": False,
        "refundStarted": False,
        "providerCalled": False,
    }


def _commerce_order_has_releasable_reservation(
    commerce_state: Mapping[str, object], order: Mapping[str, object]
) -> bool:
    lines = order.get("lines")
    movements = commerce_state.get("movements")
    if not isinstance(lines, list) or not lines or not isinstance(movements, list):
        return False
    order_id = order.get("id")
    reserves = [
        movement
        for movement in movements
        if isinstance(movement, Mapping)
        and movement.get("kind") == "reserve"
        and movement.get("orderId") == order_id
    ]
    releases = [
        movement
        for movement in movements
        if isinstance(movement, Mapping)
        and movement.get("kind") == "release"
        and movement.get("orderId") == order_id
    ]
    if len(reserves) != len(lines) or releases:
        return False
    return all(
        isinstance(line, Mapping)
        and len(
            [
                movement
                for movement in reserves
                if movement.get("sku") == line.get("sku")
                and movement.get("quantityDelta") == -line.get("quantity", 0)
            ]
        )
        == 1
        for line in lines
    )


def build_ecommerce_order_amendment_intent(
    *,
    scope: str,
    commerce_state: Mapping[str, object],
    order_id: str,
    replacement_request: Mapping[str, object],
    reason: str,
    idempotency_key: str,
    created_at: str,
) -> dict[str, Any]:
    """Prepare a replacement request bound to one releasable Shop order."""

    from supermega_runtime.commerce_runtime import commerce_order_acknowledgement

    canonical_scope = _token(scope, "scope")
    canonical_order_id = _token(order_id, "orderId")
    orders = commerce_state.get("orders")
    if not isinstance(orders, list):
        raise _fail("Order changes require a Commerce order collection.")
    order = next(
        (
            candidate
            for candidate in orders
            if isinstance(candidate, Mapping) and candidate.get("id") == canonical_order_id
        ),
        None,
    )
    acknowledgement = commerce_order_acknowledgement(commerce_state, canonical_order_id)
    canonical_replacement = validate_ecommerce_order_request(replacement_request)
    if (
        order is None
        or acknowledgement is None
        or order.get("status") != "confirmed"
        or order.get("paymentStatus") != "pending"
        or order.get("refundStatus") != "none"
        or acknowledgement.get("status") != order.get("status")
        or acknowledgement.get("payment", {}).get("status") != order.get("paymentStatus")
        or acknowledgement.get("payment", {}).get("refundStatus") != order.get("refundStatus")
        or acknowledgement.get("cancellation", {}).get("state") != "not_cancelled"
        or acknowledgement.get("totalMmk") != order.get("total")
        or not _commerce_order_has_releasable_reservation(commerce_state, order)
    ):
        raise _fail(
            "Order changes require one confirmed, unpaid, uncancelled Ecommerce order with exact reserved stock."
        )
    source_request_id = _text(
        acknowledgement.get("evidence", {}).get("sourceRecordId"),
        "order acknowledgement sourceRecordId",
        maximum=40,
    )
    if (
        _REQUEST_ID.fullmatch(source_request_id) is None
        or canonical_replacement["scope"] != canonical_scope
        or canonical_replacement["id"] == source_request_id
    ):
        raise _fail(
            "Order change is not attributable to distinct Ecommerce requests in one workspace."
        )
    original_lines = sorted(
        (
            {
                "sku": _token(line.get("sku"), "order acknowledgement line.sku"),
                "name": _text(line.get("name"), "order acknowledgement line.name", maximum=180),
                "quantity": _integer(
                    line.get("quantity"),
                    "order acknowledgement line.quantity",
                    minimum=1,
                    maximum=_MAX_QUANTITY,
                ),
            }
            for line in acknowledgement.get("lines", [])
            if isinstance(line, Mapping)
        ),
        key=lambda line: line["sku"],
    )
    replacement_lines = sorted(
        (
            {"sku": line["sku"], "name": line["name"], "quantity": line["quantity"]}
            for line in canonical_replacement["lines"]
        ),
        key=lambda line: line["sku"],
    )
    if (
        len(original_lines) != len(replacement_lines)
        or any(
            original["sku"] != replacement_lines[index]["sku"]
            for index, original in enumerate(original_lines)
        )
    ):
        raise _fail(
            "This amendment version can change quantities or fulfilment, but cannot add or remove SKUs."
        )
    line_changes = [
        {
            "sku": original["sku"],
            "name": original["name"],
            "fromQuantity": original["quantity"],
            "toQuantity": replacement_lines[index]["quantity"],
        }
        for index, original in enumerate(original_lines)
        if original["quantity"] != replacement_lines[index]["quantity"]
    ]
    from_fulfilment = order.get("fulfilment")
    if (
        from_fulfilment not in _FULFILMENT_METHODS
        or (not line_changes and from_fulfilment == canonical_replacement["fulfilment"])
    ):
        raise _fail("Change at least one quantity or the fulfilment method before Shop review.")
    key = _text(idempotency_key, "idempotencyKey", maximum=40)
    if _AMENDMENT_KEY.fullmatch(key) is None:
        raise _fail("Order amendment idempotency key is invalid.")
    canonical_created_at = _timestamp(created_at, "createdAt")
    created_dt = datetime.fromisoformat(canonical_created_at.replace("Z", "+00:00"))
    order_dt = datetime.fromisoformat(
        _timestamp(order.get("createdAt"), "order.createdAt").replace("Z", "+00:00")
    )
    replacement_dt = datetime.fromisoformat(
        canonical_replacement["createdAt"].replace("Z", "+00:00")
    )
    if created_dt < order_dt or created_dt < replacement_dt:
        raise _fail("Order amendment cannot predate its order or replacement request.")
    replacement_digest = _canonical_digest(canonical_replacement)
    return validate_ecommerce_order_amendment_intent(
        {
            "schema": ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA,
            "state": "pending_shop_review",
            "scope": canonical_scope,
            "id": f"EAM-{key[4:]}",
            "idempotencyKey": key,
            "createdAt": canonical_created_at,
            "orderId": canonical_order_id,
            "sourceRequestId": source_request_id,
            "sourceAcknowledgementDigest": acknowledgement["digest"],
            "orderStatus": "confirmed",
            "paymentStatus": "pending",
            "refundStatus": "none",
            "originalTotalMmk": acknowledgement["totalMmk"],
            "replacementRequestId": canonical_replacement["id"],
            "replacementRequestDigest": replacement_digest,
            "lineChanges": line_changes,
            "fromFulfilment": from_fulfilment,
            "toFulfilment": canonical_replacement["fulfilment"],
            "reason": _text(reason, "reason", maximum=300),
            "customerMessageSent": False,
            "orderChanged": False,
            "stockChanged": False,
            "paymentChanged": False,
            "refundStarted": False,
            "providerCalled": False,
            "evidenceReference": (
                f"ECOMMERCE-AMENDMENT:{key[4:]}:{canonical_order_id}:"
                f"{source_request_id}:{canonical_replacement['id']}:{replacement_digest[7:15]}"
            ),
        }
    )


def validate_ecommerce_order_amendment_intent(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "order amendment intent",
        (
            "schema", "state", "scope", "id", "idempotencyKey", "createdAt",
            "orderId", "sourceRequestId", "sourceAcknowledgementDigest",
            "orderStatus", "paymentStatus", "refundStatus", "originalTotalMmk",
            "replacementRequestId", "replacementRequestDigest", "lineChanges",
            "fromFulfilment", "toFulfilment", "reason", "customerMessageSent",
            "orderChanged", "stockChanged", "paymentChanged", "refundStarted",
            "providerCalled", "evidenceReference",
        ),
    )
    amendment_id = _text(source["id"], "order amendment intent.id", maximum=40)
    key = _text(source["idempotencyKey"], "order amendment intent.idempotencyKey", maximum=40)
    order_id = _token(source["orderId"], "order amendment intent.orderId")
    request_id = _text(source["sourceRequestId"], "order amendment intent.sourceRequestId", maximum=40)
    replacement_id = _text(
        source["replacementRequestId"],
        "order amendment intent.replacementRequestId",
        maximum=40,
    )
    replacement_digest = _digest(
        source["replacementRequestDigest"],
        "order amendment intent.replacementRequestDigest",
    )
    line_changes: list[dict[str, Any]] = []
    for index, candidate in enumerate(
        _array(source["lineChanges"], "order amendment intent.lineChanges", maximum=_MAX_LINES)
    ):
        line = _object(
            candidate,
            f"order amendment intent.lineChanges[{index}]",
            ("sku", "name", "fromQuantity", "toQuantity"),
        )
        from_quantity = _integer(
            line["fromQuantity"],
            f"order amendment intent.lineChanges[{index}].fromQuantity",
            minimum=1,
            maximum=_MAX_QUANTITY,
        )
        to_quantity = _integer(
            line["toQuantity"],
            f"order amendment intent.lineChanges[{index}].toQuantity",
            minimum=1,
            maximum=_MAX_QUANTITY,
        )
        if from_quantity == to_quantity:
            raise _fail("Order amendment line change must alter quantity.")
        line_changes.append(
            {
                "sku": _token(line["sku"], f"order amendment intent.lineChanges[{index}].sku"),
                "name": _text(
                    line["name"],
                    f"order amendment intent.lineChanges[{index}].name",
                    maximum=180,
                ),
                "fromQuantity": from_quantity,
                "toQuantity": to_quantity,
            }
        )
    line_changes.sort(key=lambda line: line["sku"])
    from_fulfilment = source["fromFulfilment"]
    to_fulfilment = source["toFulfilment"]
    expected_reference = (
        f"ECOMMERCE-AMENDMENT:{key[4:]}:{order_id}:"
        f"{request_id}:{replacement_id}:{replacement_digest[7:15]}"
    )
    if (
        source["schema"] != ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA
        or source["state"] != "pending_shop_review"
        or _AMENDMENT_ID.fullmatch(amendment_id) is None
        or _AMENDMENT_KEY.fullmatch(key) is None
        or amendment_id[4:] != key[4:]
        or _REQUEST_ID.fullmatch(request_id) is None
        or _REQUEST_ID.fullmatch(replacement_id) is None
        or request_id == replacement_id
        or source["orderStatus"] != "confirmed"
        or source["paymentStatus"] != "pending"
        or source["refundStatus"] != "none"
        or from_fulfilment not in _FULFILMENT_METHODS
        or to_fulfilment not in _FULFILMENT_METHODS
        or (not line_changes and from_fulfilment == to_fulfilment)
        or len({line["sku"] for line in line_changes}) != len(line_changes)
        or source["customerMessageSent"] is not False
        or source["orderChanged"] is not False
        or source["stockChanged"] is not False
        or source["paymentChanged"] is not False
        or source["refundStarted"] is not False
        or source["providerCalled"] is not False
        or source["evidenceReference"] != expected_reference
    ):
        raise _fail("Order amendment intent boundary is invalid.")
    return {
        "schema": ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA,
        "state": "pending_shop_review",
        "scope": _token(source["scope"], "order amendment intent.scope"),
        "id": amendment_id,
        "idempotencyKey": key,
        "createdAt": _timestamp(source["createdAt"], "order amendment intent.createdAt"),
        "orderId": order_id,
        "sourceRequestId": request_id,
        "sourceAcknowledgementDigest": _digest(
            source["sourceAcknowledgementDigest"],
            "order amendment intent.sourceAcknowledgementDigest",
        ),
        "orderStatus": "confirmed",
        "paymentStatus": "pending",
        "refundStatus": "none",
        "originalTotalMmk": _integer(
            source["originalTotalMmk"],
            "order amendment intent.originalTotalMmk",
            minimum=1,
            maximum=_MAX_SAFE_INTEGER,
        ),
        "replacementRequestId": replacement_id,
        "replacementRequestDigest": replacement_digest,
        "lineChanges": line_changes,
        "fromFulfilment": from_fulfilment,
        "toFulfilment": to_fulfilment,
        "reason": _text(source["reason"], "order amendment intent.reason", maximum=300),
        "customerMessageSent": False,
        "orderChanged": False,
        "stockChanged": False,
        "paymentChanged": False,
        "refundStarted": False,
        "providerCalled": False,
        "evidenceReference": expected_reference,
    }


def build_ecommerce_order_reschedule_intent(
    *,
    scope: str,
    commerce_state: Mapping[str, object],
    order_id: str,
    replacement_request: Mapping[str, object],
    requested_promised_at: str,
    reason: str,
    idempotency_key: str,
    created_at: str,
) -> dict[str, Any]:
    """Prepare an evidence-bound request to replace one promised Shop order."""

    from supermega_runtime.commerce_runtime import commerce_order_acknowledgement

    canonical_scope = _token(scope, "scope")
    canonical_order_id = _token(order_id, "orderId")
    orders = commerce_state.get("orders")
    if not isinstance(orders, list):
        raise _fail("Order rescheduling requires a Commerce order collection.")
    order = next(
        (
            candidate
            for candidate in orders
            if isinstance(candidate, Mapping) and candidate.get("id") == canonical_order_id
        ),
        None,
    )
    acknowledgement = commerce_order_acknowledgement(commerce_state, canonical_order_id)
    canonical_replacement = validate_ecommerce_order_request(replacement_request)
    if (
        order is None
        or acknowledgement is None
        or order.get("status") != "confirmed"
        or order.get("paymentStatus") != "pending"
        or order.get("refundStatus") != "none"
        or acknowledgement.get("status") != order.get("status")
        or acknowledgement.get("payment", {}).get("status") != order.get("paymentStatus")
        or acknowledgement.get("payment", {}).get("refundStatus") != order.get("refundStatus")
        or acknowledgement.get("cancellation", {}).get("state") != "not_cancelled"
        or acknowledgement.get("totalMmk") != order.get("total")
        or not order.get("promisedAt")
        or not _commerce_order_has_releasable_reservation(commerce_state, order)
    ):
        raise _fail(
            "Rescheduling requires one confirmed, unpaid, uncancelled Ecommerce order with exact reserved stock and promise evidence."
        )
    source_request_id = _text(
        acknowledgement.get("evidence", {}).get("sourceRecordId"),
        "order acknowledgement sourceRecordId",
        maximum=40,
    )
    if (
        _REQUEST_ID.fullmatch(source_request_id) is None
        or canonical_replacement["scope"] != canonical_scope
        or canonical_replacement["id"] == source_request_id
    ):
        raise _fail(
            "Order reschedule is not attributable to distinct Ecommerce requests in one workspace."
        )
    original_lines = sorted(
        (
            {
                "sku": _token(line.get("sku"), "order acknowledgement line.sku"),
                "quantity": _integer(
                    line.get("quantity"),
                    "order acknowledgement line.quantity",
                    minimum=1,
                    maximum=_MAX_QUANTITY,
                ),
            }
            for line in acknowledgement.get("lines", [])
            if isinstance(line, Mapping)
        ),
        key=lambda line: line["sku"],
    )
    replacement_lines = sorted(
        (
            {"sku": line["sku"], "quantity": line["quantity"]}
            for line in canonical_replacement["lines"]
        ),
        key=lambda line: line["sku"],
    )
    if (
        _canonical_json(original_lines) != _canonical_json(replacement_lines)
        or canonical_replacement["fulfilment"] != order.get("fulfilment")
    ):
        raise _fail(
            "A reschedule must preserve every SKU, quantity, and fulfilment method; use Change order for other corrections."
        )
    key = _text(idempotency_key, "idempotencyKey", maximum=40)
    if _RESCHEDULE_KEY.fullmatch(key) is None:
        raise _fail("Order reschedule idempotency key is invalid.")
    canonical_created_at = _timestamp(created_at, "createdAt")
    original_promised_at = _timestamp(order.get("promisedAt"), "order.promisedAt")
    canonical_requested_at = _timestamp(requested_promised_at, "requestedPromisedAt")
    created_dt = datetime.fromisoformat(canonical_created_at.replace("Z", "+00:00"))
    order_dt = datetime.fromisoformat(
        _timestamp(order.get("createdAt"), "order.createdAt").replace("Z", "+00:00")
    )
    replacement_dt = datetime.fromisoformat(
        canonical_replacement["createdAt"].replace("Z", "+00:00")
    )
    requested_dt = datetime.fromisoformat(canonical_requested_at.replace("Z", "+00:00"))
    if (
        created_dt < order_dt
        or created_dt < replacement_dt
        or requested_dt <= created_dt
        or canonical_requested_at == original_promised_at
    ):
        raise _fail(
            "Requested promise must be a different future time and the request cannot predate its order or replacement quote."
        )
    replacement_digest = _canonical_digest(canonical_replacement)
    return validate_ecommerce_order_reschedule_intent(
        {
            "schema": ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA,
            "state": "pending_shop_review",
            "scope": canonical_scope,
            "id": f"ERS-{key[4:]}",
            "idempotencyKey": key,
            "createdAt": canonical_created_at,
            "orderId": canonical_order_id,
            "sourceRequestId": source_request_id,
            "sourceAcknowledgementDigest": acknowledgement["digest"],
            "orderStatus": "confirmed",
            "paymentStatus": "pending",
            "refundStatus": "none",
            "originalTotalMmk": acknowledgement["totalMmk"],
            "originalPromisedAt": original_promised_at,
            "replacementRequestId": canonical_replacement["id"],
            "replacementRequestDigest": replacement_digest,
            "requestedPromisedAt": canonical_requested_at,
            "fulfilment": canonical_replacement["fulfilment"],
            "reason": _text(reason, "reason", maximum=300),
            "customerMessageSent": False,
            "orderChanged": False,
            "stockChanged": False,
            "paymentChanged": False,
            "refundStarted": False,
            "riderBooked": False,
            "providerCalled": False,
            "evidenceReference": (
                f"ECOMMERCE-RESCHEDULE:{key[4:]}:{canonical_order_id}:"
                f"{source_request_id}:{canonical_replacement['id']}:"
                f"{replacement_digest[7:15]}:{canonical_requested_at}"
            ),
        }
    )


def validate_ecommerce_order_reschedule_intent(value: object) -> dict[str, Any]:
    source = _object(
        value,
        "order reschedule intent",
        (
            "schema", "state", "scope", "id", "idempotencyKey", "createdAt",
            "orderId", "sourceRequestId", "sourceAcknowledgementDigest",
            "orderStatus", "paymentStatus", "refundStatus", "originalTotalMmk",
            "originalPromisedAt", "replacementRequestId", "replacementRequestDigest",
            "requestedPromisedAt", "fulfilment", "reason", "customerMessageSent",
            "orderChanged", "stockChanged", "paymentChanged", "refundStarted",
            "riderBooked", "providerCalled", "evidenceReference",
        ),
    )
    intent_id = _text(source["id"], "order reschedule intent.id", maximum=40)
    key = _text(
        source["idempotencyKey"],
        "order reschedule intent.idempotencyKey",
        maximum=40,
    )
    order_id = _token(source["orderId"], "order reschedule intent.orderId")
    request_id = _text(
        source["sourceRequestId"],
        "order reschedule intent.sourceRequestId",
        maximum=40,
    )
    replacement_id = _text(
        source["replacementRequestId"],
        "order reschedule intent.replacementRequestId",
        maximum=40,
    )
    replacement_digest = _digest(
        source["replacementRequestDigest"],
        "order reschedule intent.replacementRequestDigest",
    )
    canonical_created_at = _timestamp(
        source["createdAt"], "order reschedule intent.createdAt"
    )
    original_promised_at = _timestamp(
        source["originalPromisedAt"], "order reschedule intent.originalPromisedAt"
    )
    requested_promised_at = _timestamp(
        source["requestedPromisedAt"], "order reschedule intent.requestedPromisedAt"
    )
    if datetime.fromisoformat(requested_promised_at.replace("Z", "+00:00")) <= datetime.fromisoformat(
        canonical_created_at.replace("Z", "+00:00")
    ):
        raise _fail("Order reschedule requested promise must remain after its request.")
    fulfilment = source["fulfilment"]
    expected_reference = (
        f"ECOMMERCE-RESCHEDULE:{key[4:]}:{order_id}:{request_id}:"
        f"{replacement_id}:{replacement_digest[7:15]}:{requested_promised_at}"
    )
    if (
        source["schema"] != ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA
        or source["state"] != "pending_shop_review"
        or _RESCHEDULE_ID.fullmatch(intent_id) is None
        or _RESCHEDULE_KEY.fullmatch(key) is None
        or intent_id[4:] != key[4:]
        or _REQUEST_ID.fullmatch(request_id) is None
        or _REQUEST_ID.fullmatch(replacement_id) is None
        or request_id == replacement_id
        or source["orderStatus"] != "confirmed"
        or source["paymentStatus"] != "pending"
        or source["refundStatus"] != "none"
        or fulfilment not in _FULFILMENT_METHODS
        or requested_promised_at == original_promised_at
        or source["customerMessageSent"] is not False
        or source["orderChanged"] is not False
        or source["stockChanged"] is not False
        or source["paymentChanged"] is not False
        or source["refundStarted"] is not False
        or source["riderBooked"] is not False
        or source["providerCalled"] is not False
        or source["evidenceReference"] != expected_reference
    ):
        raise _fail("Order reschedule intent boundary is invalid.")
    return {
        "schema": ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA,
        "state": "pending_shop_review",
        "scope": _token(source["scope"], "order reschedule intent.scope"),
        "id": intent_id,
        "idempotencyKey": key,
        "createdAt": canonical_created_at,
        "orderId": order_id,
        "sourceRequestId": request_id,
        "sourceAcknowledgementDigest": _digest(
            source["sourceAcknowledgementDigest"],
            "order reschedule intent.sourceAcknowledgementDigest",
        ),
        "orderStatus": "confirmed",
        "paymentStatus": "pending",
        "refundStatus": "none",
        "originalTotalMmk": _integer(
            source["originalTotalMmk"],
            "order reschedule intent.originalTotalMmk",
            minimum=1,
            maximum=_MAX_SAFE_INTEGER,
        ),
        "originalPromisedAt": original_promised_at,
        "replacementRequestId": replacement_id,
        "replacementRequestDigest": replacement_digest,
        "requestedPromisedAt": requested_promised_at,
        "fulfilment": fulfilment,
        "reason": _text(source["reason"], "order reschedule intent.reason", maximum=300),
        "customerMessageSent": False,
        "orderChanged": False,
        "stockChanged": False,
        "paymentChanged": False,
        "refundStarted": False,
        "riderBooked": False,
        "providerCalled": False,
        "evidenceReference": expected_reference,
    }


def create_empty_ecommerce_lifecycle_state(scope: str) -> dict[str, Any]:
    return {
        "schema": ECOMMERCE_LIFECYCLE_STATE_SCHEMA,
        "scope": _token(scope, "scope"),
        "revision": 0,
        "headDigest": EMPTY_ECOMMERCE_LIFECYCLE_DIGEST,
        "requests": [],
        "returnIntents": [],
        "supportIntents": [],
        "cancellationIntents": [],
        "cancellationDecisions": [],
        "amendmentIntents": [],
        "rescheduleIntents": [],
        "events": [],
    }


def _event(value: object, field: str) -> dict[str, Any]:
    source = _object(
        value,
        field,
        (
            "schema",
            "sequence",
            "action",
            "subjectId",
            "idempotencyKey",
            "payloadDigest",
            "previousDigest",
            "eventDigest",
        ),
    )
    action = source["action"]
    if action not in {
        "request_recorded",
        "return_intent_recorded",
        "support_intent_recorded",
        "cancellation_intent_recorded",
        "cancellation_decision_recorded",
        "order_amendment_intent_recorded",
        "order_reschedule_intent_recorded",
    }:
        raise _fail(f"{field}.action is unsupported.")
    core = {
        "schema": ECOMMERCE_LIFECYCLE_EVENT_SCHEMA,
        "sequence": _integer(source["sequence"], f"{field}.sequence", minimum=1),
        "action": action,
        "subjectId": _token(source["subjectId"], f"{field}.subjectId"),
        "idempotencyKey": _text(
            source["idempotencyKey"], f"{field}.idempotencyKey", maximum=40
        ),
        "payloadDigest": _digest(source["payloadDigest"], f"{field}.payloadDigest"),
        "previousDigest": _digest(source["previousDigest"], f"{field}.previousDigest"),
    }
    digest = _digest(source["eventDigest"], f"{field}.eventDigest")
    if digest != _canonical_digest(core):
        raise _fail(f"{field}.eventDigest is invalid.")
    core["eventDigest"] = digest
    return core


def validate_ecommerce_lifecycle_state(value: object) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        raise _fail("lifecycle state must be an object.")
    legacy_fields = frozenset(
        {"schema", "scope", "revision", "headDigest", "requests", "returnIntents", "events"}
    )
    current_fields = frozenset({*legacy_fields, "supportIntents"})
    cancellation_fields = frozenset({*current_fields, "cancellationIntents"})
    decision_fields = frozenset({*cancellation_fields, "cancellationDecisions"})
    amendment_fields = frozenset({*decision_fields, "amendmentIntents"})
    latest_fields = frozenset({*amendment_fields, "rescheduleIntents"})
    if frozenset(value) not in {
        legacy_fields,
        current_fields,
        cancellation_fields,
        decision_fields,
        amendment_fields,
        latest_fields,
    }:
        raise _fail("lifecycle state fields do not match the contract.")
    source = value
    if source["schema"] != ECOMMERCE_LIFECYCLE_STATE_SCHEMA:
        raise _fail("Lifecycle state schema is invalid.")
    scope = _token(source["scope"], "lifecycle state.scope")
    requests = [
        validate_ecommerce_order_request(candidate)
        for candidate in _array(
            source["requests"], "lifecycle state.requests", maximum=_MAX_RECORDS
        )
    ]
    return_intents = [
        validate_ecommerce_return_intent(candidate)
        for candidate in _array(
            source["returnIntents"], "lifecycle state.returnIntents", maximum=_MAX_RECORDS
        )
    ]
    support_intents = [
        validate_ecommerce_support_intent(candidate)
        for candidate in _array(
            source.get("supportIntents", []),
            "lifecycle state.supportIntents",
            maximum=_MAX_RECORDS,
        )
    ]
    cancellation_intents = [
        validate_ecommerce_cancellation_intent(candidate)
        for candidate in _array(
            source.get("cancellationIntents", []),
            "lifecycle state.cancellationIntents",
            maximum=_MAX_RECORDS,
        )
    ]
    cancellation_decisions = [
        validate_ecommerce_cancellation_decision(candidate)
        for candidate in _array(
            source.get("cancellationDecisions", []),
            "lifecycle state.cancellationDecisions",
            maximum=_MAX_RECORDS,
        )
    ]
    amendment_intents = [
        validate_ecommerce_order_amendment_intent(candidate)
        for candidate in _array(
            source.get("amendmentIntents", []),
            "lifecycle state.amendmentIntents",
            maximum=_MAX_RECORDS,
        )
    ]
    reschedule_intents = [
        validate_ecommerce_order_reschedule_intent(candidate)
        for candidate in _array(
            source.get("rescheduleIntents", []),
            "lifecycle state.rescheduleIntents",
            maximum=_MAX_RECORDS,
        )
    ]
    events = [
        _event(candidate, f"lifecycle state.events[{index}]")
        for index, candidate in enumerate(
            _array(source["events"], "lifecycle state.events", maximum=_MAX_RECORDS * 7)
        )
    ]
    revision = _integer(source["revision"], "lifecycle state.revision")
    if revision != len(events):
        raise _fail("Lifecycle state revision does not match its event history.")
    previous = EMPTY_ECOMMERCE_LIFECYCLE_DIGEST
    for index, event in enumerate(events):
        if event["sequence"] != index + 1 or event["previousDigest"] != previous:
            raise _fail("Lifecycle event chain is invalid.")
        previous = event["eventDigest"]
    head = _digest(source["headDigest"], "lifecycle state.headDigest")
    if head != previous:
        raise _fail("Lifecycle state head digest is invalid.")
    records = [
        *requests,
        *return_intents,
        *support_intents,
        *cancellation_intents,
        *cancellation_decisions,
        *amendment_intents,
        *reschedule_intents,
    ]
    if len({record["id"] for record in records}) != len(records):
        raise _fail("Lifecycle record IDs must be unique.")
    if len({record["idempotencyKey"] for record in records}) != len(records):
        raise _fail("Lifecycle idempotency keys must be unique.")
    if any(record["scope"] != scope for record in records):
        raise _fail("Lifecycle record scope does not match the state.")
    request_ids = {request["id"] for request in requests}
    if any(intent["sourceRequestId"] not in request_ids for intent in return_intents):
        raise _fail("Return intent is not attributable to one recovered Ecommerce request.")
    if any(intent["sourceRequestId"] not in request_ids for intent in support_intents):
        raise _fail("Support intent is not attributable to one recovered Ecommerce request.")
    if any(intent["sourceRequestId"] not in request_ids for intent in cancellation_intents):
        raise _fail("Cancellation intent is not attributable to one recovered Ecommerce request.")
    if len({intent["orderId"] for intent in cancellation_intents}) != len(cancellation_intents):
        raise _fail("Only one cancellation request may exist for an Ecommerce order.")
    if len({decision["intentId"] for decision in cancellation_decisions}) != len(cancellation_decisions):
        raise _fail("Only one Shop decision may exist for an Ecommerce cancellation request.")
    cancellation_by_id = {intent["id"]: intent for intent in cancellation_intents}
    for decision in cancellation_decisions:
        intent = cancellation_by_id.get(decision["intentId"])
        if (
            intent is None
            or decision["scope"] != intent["scope"]
            or decision["orderId"] != intent["orderId"]
            or decision["sourceRequestId"] != intent["sourceRequestId"]
            or decision["sourceAcknowledgementDigest"] != intent["sourceAcknowledgementDigest"]
            or decision["orderStatus"] != intent["orderStatus"]
            or decision["paymentStatus"] != intent["paymentStatus"]
            or decision["refundStatus"] != intent["refundStatus"]
            or decision["totalMmk"] != intent["totalMmk"]
            or decision["evidenceReference"] != intent["evidenceReference"]
            or decision["intentDigest"] != _canonical_digest(intent)
        ):
            raise _fail("Cancellation decision is not bound to its exact recovered request.")
    if len({intent["orderId"] for intent in amendment_intents}) != len(amendment_intents):
        raise _fail("Only one amendment request may exist for an Ecommerce order.")
    request_by_id = {request["id"]: request for request in requests}
    for intent in amendment_intents:
        source_request = request_by_id.get(intent["sourceRequestId"])
        replacement_request = request_by_id.get(intent["replacementRequestId"])
        source_profile = source_request.get("customerProfile") if source_request else None
        replacement_profile = (
            replacement_request.get("customerProfile") if replacement_request else None
        )
        source_phone = source_profile.get("phone") if isinstance(source_profile, Mapping) else None
        replacement_phone = (
            replacement_profile.get("phone") if isinstance(replacement_profile, Mapping) else None
        )
        if (
            source_request is None
            or replacement_request is None
            or source_request["id"] == replacement_request["id"]
            or intent["replacementRequestDigest"] != _canonical_digest(replacement_request)
            or replacement_request["scope"] != intent["scope"]
            or source_request["scope"] != intent["scope"]
            or source_request["customerReference"] != replacement_request["customerReference"]
            or source_phone != replacement_phone
            or source_request["fulfilment"] != intent["fromFulfilment"]
            or replacement_request["fulfilment"] != intent["toFulfilment"]
        ):
            raise _fail(
                "Order amendment is not bound to its original and replacement Ecommerce requests."
            )
    if len({intent["orderId"] for intent in reschedule_intents}) != len(reschedule_intents):
        raise _fail("Only one reschedule request may exist for an Ecommerce order.")
    replacement_orders = [
        *(intent["orderId"] for intent in amendment_intents),
        *(intent["orderId"] for intent in reschedule_intents),
    ]
    if len(set(replacement_orders)) != len(replacement_orders):
        raise _fail("Only one replacement workflow may exist for an Ecommerce order.")
    for intent in reschedule_intents:
        source_request = request_by_id.get(intent["sourceRequestId"])
        replacement_request = request_by_id.get(intent["replacementRequestId"])
        source_profile = source_request.get("customerProfile") if source_request else None
        replacement_profile = (
            replacement_request.get("customerProfile") if replacement_request else None
        )
        source_phone = source_profile.get("phone") if isinstance(source_profile, Mapping) else None
        replacement_phone = (
            replacement_profile.get("phone") if isinstance(replacement_profile, Mapping) else None
        )
        if (
            source_request is None
            or replacement_request is None
            or source_request["id"] == replacement_request["id"]
            or intent["replacementRequestDigest"] != _canonical_digest(replacement_request)
            or replacement_request["scope"] != intent["scope"]
            or source_request["scope"] != intent["scope"]
            or source_request["customerReference"] != replacement_request["customerReference"]
            or source_phone != replacement_phone
            or source_request["fulfilment"] != intent["fulfilment"]
            or replacement_request["fulfilment"] != intent["fulfilment"]
        ):
            raise _fail(
                "Order reschedule is not bound to its original and replacement Ecommerce requests."
            )
    by_id = {record["id"]: record for record in records}
    if len(events) != len(records):
        raise _fail("Lifecycle history must contain one event per record.")
    for event in events:
        record = by_id.get(event["subjectId"])
        if (
            record is None
            or record["idempotencyKey"] != event["idempotencyKey"]
            or _canonical_digest(record) != event["payloadDigest"]
        ):
            raise _fail("Lifecycle event does not match its record.")
    return {
        "schema": ECOMMERCE_LIFECYCLE_STATE_SCHEMA,
        "scope": scope,
        "revision": revision,
        "headDigest": head,
        "requests": requests,
        "returnIntents": return_intents,
        "supportIntents": support_intents,
        "cancellationIntents": cancellation_intents,
        "cancellationDecisions": cancellation_decisions,
        "amendmentIntents": amendment_intents,
        "rescheduleIntents": reschedule_intents,
        "events": events,
    }


def _record_lifecycle_value(
    state_value: Mapping[str, object],
    record: dict[str, Any],
    *,
    collection: str,
    action: str,
    expected_head_digest: str,
) -> dict[str, Any]:
    state = validate_ecommerce_lifecycle_state(state_value)
    expected = _digest(expected_head_digest, "expectedHeadDigest")
    if expected != state["headDigest"]:
        raise _fail("Lifecycle state changed before this record was applied.")
    if record["scope"] != state["scope"]:
        raise _fail("Lifecycle record belongs to a different scope.")
    all_records = [
        *state["requests"],
        *state["returnIntents"],
        *state["supportIntents"],
        *state["cancellationIntents"],
        *state["cancellationDecisions"],
        *state["amendmentIntents"],
        *state["rescheduleIntents"],
    ]
    existing = next(
        (
            candidate
            for candidate in all_records
            if candidate["id"] == record["id"]
            or candidate["idempotencyKey"] == record["idempotencyKey"]
        ),
        None,
    )
    if existing is not None:
        if _canonical_json(existing) != _canonical_json(record):
            raise _fail("Lifecycle idempotency key conflicts with a different record.")
        return state
    if len(state[collection]) >= _MAX_RECORDS:
        raise _fail("Lifecycle record limit is reached.")
    event_core = {
        "schema": ECOMMERCE_LIFECYCLE_EVENT_SCHEMA,
        "sequence": state["revision"] + 1,
        "action": action,
        "subjectId": record["id"],
        "idempotencyKey": record["idempotencyKey"],
        "payloadDigest": _canonical_digest(record),
        "previousDigest": state["headDigest"],
    }
    event = {**event_core, "eventDigest": _canonical_digest(event_core)}
    next_state = {
        **state,
        "revision": state["revision"] + 1,
        "headDigest": event["eventDigest"],
        collection: [record, *state[collection]],
        "events": [*state["events"], event],
    }
    return validate_ecommerce_lifecycle_state(next_state)


def record_ecommerce_order_request(
    state: Mapping[str, object],
    request: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    return _record_lifecycle_value(
        state,
        validate_ecommerce_order_request(request),
        collection="requests",
        action="request_recorded",
        expected_head_digest=expected_head_digest,
    )


def record_ecommerce_return_intent(
    state: Mapping[str, object],
    intent: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    return _record_lifecycle_value(
        state,
        validate_ecommerce_return_intent(intent),
        collection="returnIntents",
        action="return_intent_recorded",
        expected_head_digest=expected_head_digest,
    )


def record_ecommerce_support_intent(
    state: Mapping[str, object],
    intent: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    return _record_lifecycle_value(
        state,
        validate_ecommerce_support_intent(intent),
        collection="supportIntents",
        action="support_intent_recorded",
        expected_head_digest=expected_head_digest,
    )


def record_ecommerce_cancellation_intent(
    state: Mapping[str, object],
    intent: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    return _record_lifecycle_value(
        state,
        validate_ecommerce_cancellation_intent(intent),
        collection="cancellationIntents",
        action="cancellation_intent_recorded",
        expected_head_digest=expected_head_digest,
    )


def record_ecommerce_cancellation_decision(
    state: Mapping[str, object],
    decision: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    return _record_lifecycle_value(
        state,
        validate_ecommerce_cancellation_decision(decision),
        collection="cancellationDecisions",
        action="cancellation_decision_recorded",
        expected_head_digest=expected_head_digest,
    )


def record_ecommerce_order_amendment(
    state: Mapping[str, object],
    replacement_request: Mapping[str, object],
    intent: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    canonical_request = validate_ecommerce_order_request(replacement_request)
    canonical_intent = validate_ecommerce_order_amendment_intent(intent)
    if (
        canonical_intent["replacementRequestId"] != canonical_request["id"]
        or canonical_intent["replacementRequestDigest"] != _canonical_digest(canonical_request)
    ):
        raise _fail("Order amendment does not match its replacement request.")
    with_request = _record_lifecycle_value(
        state,
        canonical_request,
        collection="requests",
        action="request_recorded",
        expected_head_digest=expected_head_digest,
    )
    return _record_lifecycle_value(
        with_request,
        canonical_intent,
        collection="amendmentIntents",
        action="order_amendment_intent_recorded",
        expected_head_digest=with_request["headDigest"],
    )


def record_ecommerce_order_reschedule(
    state: Mapping[str, object],
    replacement_request: Mapping[str, object],
    intent: Mapping[str, object],
    *,
    expected_head_digest: str,
) -> dict[str, Any]:
    canonical_request = validate_ecommerce_order_request(replacement_request)
    canonical_intent = validate_ecommerce_order_reschedule_intent(intent)
    if (
        canonical_intent["replacementRequestId"] != canonical_request["id"]
        or canonical_intent["replacementRequestDigest"] != _canonical_digest(canonical_request)
    ):
        raise _fail("Order reschedule does not match its replacement request.")
    with_request = _record_lifecycle_value(
        state,
        canonical_request,
        collection="requests",
        action="request_recorded",
        expected_head_digest=expected_head_digest,
    )
    return _record_lifecycle_value(
        with_request,
        canonical_intent,
        collection="rescheduleIntents",
        action="order_reschedule_intent_recorded",
        expected_head_digest=with_request["headDigest"],
    )
