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
ECOMMERCE_CUSTOMER_PROFILE_SCHEMA = "supermega.ecommerce.customer_profile_snapshot.v1"
ECOMMERCE_DELIVERY_ADDRESS_SCHEMA = "supermega.ecommerce.delivery_address_snapshot.v1"
ECOMMERCE_REQUEST_SCHEMA = "supermega.ecommerce.order_request.v2"
ECOMMERCE_SHOP_DRAFT_SCHEMA = "supermega.ecommerce.shop_draft.v6"
ECOMMERCE_RETURN_INTENT_SCHEMA = "supermega.ecommerce.return_intent.v1"
ECOMMERCE_SUPPORT_INTENT_SCHEMA = "supermega.ecommerce.support_intent.v1"
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
    total_mmk = promotion["netSubtotalMmk"] + shipping["feeMmk"]
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
            "tax": _canonical_copy(quote["tax"]),
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
            f"{shipping['feeMmk']}:payment:{payment['status']}:"
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


def create_empty_ecommerce_lifecycle_state(scope: str) -> dict[str, Any]:
    return {
        "schema": ECOMMERCE_LIFECYCLE_STATE_SCHEMA,
        "scope": _token(scope, "scope"),
        "revision": 0,
        "headDigest": EMPTY_ECOMMERCE_LIFECYCLE_DIGEST,
        "requests": [],
        "returnIntents": [],
        "supportIntents": [],
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
    if action not in {"request_recorded", "return_intent_recorded", "support_intent_recorded"}:
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
    if frozenset(value) not in {legacy_fields, current_fields}:
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
    events = [
        _event(candidate, f"lifecycle state.events[{index}]")
        for index, candidate in enumerate(
            _array(source["events"], "lifecycle state.events", maximum=_MAX_RECORDS * 3)
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
    records = [*requests, *return_intents, *support_intents]
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
    all_records = [*state["requests"], *state["returnIntents"], *state["supportIntents"]]
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
