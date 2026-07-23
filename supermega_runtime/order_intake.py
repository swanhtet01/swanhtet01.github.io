"""Typed, source-backed AI order-intake contracts.

This module deliberately contains no model client, storage call, command, or
operational mutation. It validates a provider's structured extraction against
the exact source message and the server-owned Commerce catalog, then returns an
ephemeral draft that still requires the existing human order confirmation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ORDER_INTAKE_SCHEMA = "supermega.order_intake.draft.v1"
ORDER_INTAKE_PROMPT_VERSION = "supermega.order_intake.extract.v1"
MAX_ORDER_MESSAGE_LENGTH = 4_000
MAX_ORDER_QUANTITY = 10_000

OrderIntakeField = Literal[
    "customer_reference",
    "channel",
    "sku",
    "quantity",
    "payment",
    "fulfilment",
]
OrderIntakeChannel = Literal["messenger", "viber", "phone", "website", "walk_in"]
OrderIntakePayment = Literal["kbzpay", "wavepay", "cash_on_delivery", "cash", "card"]
OrderIntakeFulfilment = Literal["delivery", "pickup"]
OrderIntakeScope = Literal[
    "single_item_order",
    "multiple_item_order",
    "not_an_order",
    "ambiguous",
]
OrderIntakeStatus = Literal["ready_for_review", "needs_clarification"]
OrderIntakeBlocker = Literal[
    "not_an_order",
    "multiple_items",
    "ambiguous_order",
    "incomplete_required_fields",
    "uncertain_fields",
    "unknown_sku",
    "insufficient_stock",
]

_FIELD_ORDER: tuple[OrderIntakeField, ...] = (
    "customer_reference",
    "channel",
    "sku",
    "quantity",
    "payment",
    "fulfilment",
)
_REQUIRED_ORDER_FIELDS: tuple[OrderIntakeField, ...] = (
    "channel",
    "sku",
    "quantity",
    "payment",
)


class OrderIntakeContractError(ValueError):
    """Raised when provider output is not safely grounded in the source."""


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OrderIntakeDraftRequest(_StrictModel):
    message: str = Field(min_length=1, max_length=MAX_ORDER_MESSAGE_LENGTH)

    @field_validator("message")
    @classmethod
    def require_visible_message(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must contain visible text")
        return value


class OrderIntakeCatalogItem(_StrictModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=180)
    variant: str | None = Field(default=None, max_length=180)
    on_hand: int = Field(ge=0)
    unit_price_mmk: int = Field(ge=1)

    @field_validator("sku", "name", "variant")
    @classmethod
    def require_canonical_catalog_text(cls, value: str | None) -> str | None:
        if value is not None and value != value.strip():
            raise ValueError("catalog text must not have surrounding whitespace")
        return value


class OrderIntakeSourceSpan(_StrictModel):
    start: int = Field(ge=0)
    end: int = Field(ge=1)
    quote: str = Field(min_length=1, max_length=280)

    @model_validator(mode="after")
    def require_ordered_span(self) -> "OrderIntakeSourceSpan":
        if self.end <= self.start:
            raise ValueError("source span end must be greater than start")
        if not self.quote.strip():
            raise ValueError("source span quote must contain visible text")
        return self


class OrderIntakeSourceQuote(_StrictModel):
    """Provider evidence that the server resolves to an exact source span."""

    quote: str = Field(min_length=1, max_length=280)
    occurrence: int = Field(ge=1, le=20)

    @field_validator("quote")
    @classmethod
    def require_visible_quote(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("source quote must contain visible text")
        return value


class OrderIntakeFieldProvenance(_StrictModel):
    field: OrderIntakeField
    source_spans: list[OrderIntakeSourceSpan] = Field(min_length=1, max_length=4)


class OrderIntakeModelFieldProvenance(_StrictModel):
    field: OrderIntakeField
    source_quotes: list[OrderIntakeSourceQuote] = Field(min_length=1, max_length=4)


class OrderIntakeModelExtraction(_StrictModel):
    """The only structured data the model is allowed to propose."""

    scope: OrderIntakeScope
    customer_reference: str | None = Field(max_length=80)
    channel: OrderIntakeChannel | None
    sku: str | None = Field(max_length=80)
    quantity: int | None = Field(ge=1, le=MAX_ORDER_QUANTITY)
    payment: OrderIntakePayment | None
    fulfilment: OrderIntakeFulfilment | None
    uncertain_fields: list[OrderIntakeField] = Field(max_length=len(_FIELD_ORDER))
    provenance: list[OrderIntakeModelFieldProvenance] = Field(
        max_length=len(_FIELD_ORDER)
    )

    @field_validator("customer_reference", "sku")
    @classmethod
    def require_canonical_extracted_text(cls, value: str | None) -> str | None:
        if value is not None and (not value.strip() or value != value.strip()):
            raise ValueError("extracted text must be canonical non-empty text")
        return value

    @field_validator("uncertain_fields")
    @classmethod
    def require_unique_uncertain_fields(
        cls,
        value: list[OrderIntakeField],
    ) -> list[OrderIntakeField]:
        if len(value) != len(set(value)):
            raise ValueError("uncertain fields must be unique")
        return value


class OrderIntakeGeneration(_StrictModel):
    provider: Literal["openai"] = "openai"
    response_id: str = Field(min_length=1, max_length=160)
    model: str = Field(min_length=1, max_length=120)
    prompt_version: Literal["supermega.order_intake.extract.v1"] = (
        ORDER_INTAKE_PROMPT_VERSION
    )


class OrderIntakeDraft(_StrictModel):
    schema_version: Literal["supermega.order_intake.draft.v1"] = ORDER_INTAKE_SCHEMA
    request_id: str = Field(pattern=r"^OID-[0-9a-f]{32}$")
    generated_at: str
    message_digest: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    generation: OrderIntakeGeneration
    status: OrderIntakeStatus
    scope: OrderIntakeScope
    customer_reference: str | None
    channel: OrderIntakeChannel | None
    sku: str | None
    quantity: int | None
    payment: OrderIntakePayment | None
    fulfilment: OrderIntakeFulfilment | None
    catalog_item: OrderIntakeCatalogItem | None
    total_mmk: int | None = Field(ge=1)
    missing_fields: list[OrderIntakeField]
    uncertain_fields: list[OrderIntakeField]
    blockers: list[OrderIntakeBlocker]
    provenance: list[OrderIntakeFieldProvenance]


def _field_value(
    extraction: OrderIntakeModelExtraction,
    field: OrderIntakeField,
) -> object:
    return getattr(extraction, field)


def _resolve_source_quote(
    message: str,
    source: OrderIntakeSourceQuote,
) -> OrderIntakeSourceSpan:
    search_from = 0
    start = -1
    for _ in range(source.occurrence):
        start = message.find(source.quote, search_from)
        if start < 0:
            raise OrderIntakeContractError(
                f"source quote occurrence {source.occurrence} is not present"
            )
        search_from = start + 1
    return OrderIntakeSourceSpan(
        start=start,
        end=start + len(source.quote),
        quote=source.quote,
    )


def _resolve_provenance(
    message: str,
    extraction: OrderIntakeModelExtraction,
) -> list[OrderIntakeFieldProvenance]:
    provenance_by_field: dict[OrderIntakeField, OrderIntakeFieldProvenance] = {}
    resolved: list[OrderIntakeFieldProvenance] = []
    for record in extraction.provenance:
        if record.field in provenance_by_field:
            raise OrderIntakeContractError(
                f"duplicate provenance for {record.field}"
            )
        spans = [
            _resolve_source_quote(message, source)
            for source in record.source_quotes
        ]
        if len({(span.start, span.end) for span in spans}) != len(spans):
            raise OrderIntakeContractError(
                f"duplicate source quote for {record.field}"
            )
        final_record = OrderIntakeFieldProvenance(
            field=record.field,
            source_spans=spans,
        )
        provenance_by_field[record.field] = final_record
        resolved.append(final_record)

    uncertain = set(extraction.uncertain_fields)
    for field in _FIELD_ORDER:
        value = _field_value(extraction, field)
        has_provenance = field in provenance_by_field
        if value is not None and not has_provenance:
            raise OrderIntakeContractError(
                f"{field} is not backed by a source span"
            )
        if value is None and has_provenance and field not in uncertain:
            raise OrderIntakeContractError(
                f"null {field} has provenance but is not marked uncertain"
            )
    return resolved


def _append_unique(
    values: list[OrderIntakeBlocker],
    value: OrderIntakeBlocker,
) -> None:
    if value not in values:
        values.append(value)


def build_order_intake_draft(
    *,
    message: str,
    catalog: list[OrderIntakeCatalogItem],
    extraction: OrderIntakeModelExtraction,
    response_id: str,
    model: str,
    request_id: str | None = None,
    generated_at: datetime | None = None,
) -> OrderIntakeDraft:
    """Validate one model extraction and construct a non-operational draft."""

    request = OrderIntakeDraftRequest(message=message)
    if len(catalog) != len({item.sku for item in catalog}):
        raise OrderIntakeContractError("catalog SKUs must be unique")
    provenance = _resolve_provenance(request.message, extraction)

    catalog_item = next(
        (item for item in catalog if item.sku == extraction.sku),
        None,
    )
    missing_fields = [
        field
        for field in _REQUIRED_ORDER_FIELDS
        if _field_value(extraction, field) is None
    ]
    blockers: list[OrderIntakeBlocker] = []
    if extraction.scope == "not_an_order":
        _append_unique(blockers, "not_an_order")
    elif extraction.scope == "multiple_item_order":
        _append_unique(blockers, "multiple_items")
    elif extraction.scope == "ambiguous":
        _append_unique(blockers, "ambiguous_order")
    if missing_fields:
        _append_unique(blockers, "incomplete_required_fields")
    if extraction.uncertain_fields:
        _append_unique(blockers, "uncertain_fields")
    if extraction.sku is not None and catalog_item is None:
        _append_unique(blockers, "unknown_sku")
    if (
        catalog_item is not None
        and extraction.quantity is not None
        and extraction.quantity > catalog_item.on_hand
    ):
        _append_unique(blockers, "insufficient_stock")

    total_mmk = (
        catalog_item.unit_price_mmk * extraction.quantity
        if catalog_item is not None and extraction.quantity is not None
        else None
    )
    ready = extraction.scope == "single_item_order" and not blockers
    captured = generated_at or datetime.now(UTC)
    if captured.tzinfo is None:
        raise OrderIntakeContractError("generated_at must include a timezone")

    return OrderIntakeDraft(
        request_id=request_id or f"OID-{uuid4().hex}",
        generated_at=captured.isoformat().replace("+00:00", "Z"),
        message_digest=f"sha256:{sha256(request.message.encode('utf-8')).hexdigest()}",
        generation=OrderIntakeGeneration(
            response_id=response_id,
            model=model,
        ),
        status="ready_for_review" if ready else "needs_clarification",
        scope=extraction.scope,
        customer_reference=extraction.customer_reference,
        channel=extraction.channel,
        sku=extraction.sku,
        quantity=extraction.quantity,
        payment=extraction.payment,
        fulfilment=extraction.fulfilment,
        catalog_item=catalog_item,
        total_mmk=total_mmk,
        missing_fields=missing_fields,
        uncertain_fields=[
            field for field in _FIELD_ORDER if field in extraction.uncertain_fields
        ],
        blockers=blockers,
        provenance=provenance,
    )


__all__ = [
    "MAX_ORDER_MESSAGE_LENGTH",
    "ORDER_INTAKE_PROMPT_VERSION",
    "ORDER_INTAKE_SCHEMA",
    "OrderIntakeCatalogItem",
    "OrderIntakeContractError",
    "OrderIntakeDraft",
    "OrderIntakeDraftRequest",
    "OrderIntakeFieldProvenance",
    "OrderIntakeModelFieldProvenance",
    "OrderIntakeModelExtraction",
    "OrderIntakeSourceQuote",
    "OrderIntakeSourceSpan",
    "build_order_intake_draft",
]
