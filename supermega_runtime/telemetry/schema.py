"""Span-name constants and the attribute allowlist for SuperMega tracing.

Source of truth: ``hq/research/opentelemetry-implementation-plan-2026-08.md``,
section 4 (span taxonomy) and section 3 (redaction rules). Do not add a span
name or attribute here unless it is already listed in that document — the
plan's own risk mitigation is explicit: "the scrubber whitelist is opt-in
(only listed attributes pass through); any new attribute not on the list is
dropped by default" (section 7, "Data leakage" risk).

This module has zero OpenTelemetry imports on purpose: it is pure data, so
it can be imported (and unit tested) without the OTEL SDK installed.
"""

from __future__ import annotations


# ---------------------------------------------------------------------------
# Span names — product.noun.verb, exactly as written in plan section 4.
# ---------------------------------------------------------------------------

# Shop order lifecycle
SHOP_ORDER_INTAKE = "shop.order.intake"
SHOP_ORDER_CONFIRM = "shop.order.confirm"
SHOP_STOCK_RESERVE = "shop.stock.reserve"
SHOP_STOCK_RELEASE = "shop.stock.release"
SHOP_FULFILMENT_ADVANCE = "shop.fulfilment.advance"
SHOP_PAYMENT_RECONCILE = "shop.payment.reconcile"
SHOP_DAILY_CLOSE = "shop.daily.close"

# Plant job lifecycle
PLANT_JOB_PLAN = "plant.job.plan"
PLANT_JOB_RELEASE = "plant.job.release"
PLANT_MATERIAL_ISSUE = "plant.material.issue"
PLANT_OUTPUT_RECORD = "plant.output.record"
PLANT_QUALITY_INSPECT = "plant.quality.inspect"
PLANT_QUALITY_REWORK = "plant.quality.rework"
PLANT_SHIFT_CLOSE = "plant.shift.close"

# Ecommerce checkout flow
ECOMMERCE_CART_BUILD = "ecommerce.cart.build"
ECOMMERCE_QUOTE_CAPTURE = "ecommerce.quote.capture"
ECOMMERCE_IDENTITY_SNAPSHOT = "ecommerce.identity.snapshot"
ECOMMERCE_REQUEST_SUBMIT = "ecommerce.request.submit"
ECOMMERCE_SHOP_HANDOFF = "ecommerce.shop.handoff"

# AI model call (gated R&D)
AI_INVOCATION = "ai.invocation"
AI_OUTPUT_PARSE = "ai.output.parse"
AI_REVIEW_SUBMITTED = "ai.review.submitted"

# Database query (auto, via opentelemetry-instrumentation-psycopg)
DB_QUERY = "db.query"

# File upload / Storage
STORAGE_UPLOAD = "storage.upload"
STORAGE_VERIFY = "storage.verify"

# Background worker
WORKER_CYCLE_START = "worker.cycle.start"
WORKER_TASK_EXECUTE = "worker.task.execute"
WORKER_CYCLE_END = "worker.cycle.end"


# ---------------------------------------------------------------------------
# Attribute allowlist — the opt-in list the RedactingSpanProcessor enforces.
#
# Grouped by the plan section 4 table each attribute is drawn from, plus the
# "Safe to include in spans" table in section 3. An attribute key that is not
# in this frozenset is dropped by the scrubber, no matter which span carries
# it or what value it holds.
# ---------------------------------------------------------------------------

_SHOP_ATTRIBUTES = frozenset(
    {
        "order.channel",
        "order.line_count",
        "order.idempotency_key",
        "order.state_from",
        "order.state_to",
        "stock.sku_count",
        "stock.location",
        "stock.trigger",
        "fulfilment.state_from",
        "fulfilment.state_to",
        "payment.method_label",
        "payment.status_to",
        "close.order_count",
        "close.exception_count",
    }
)

_PLANT_ATTRIBUTES = frozenset(
    {
        "job.work_centre",
        "job.line_count",
        "job.bom_version",
        "job.routing_version",
        "material.line_count",
        "output.quantity_good",
        "output.quantity_scrap",
        "quality.result",
        "quality.inspection_type",
        "rework.routing_operation",
        "rework.quantity",
        "shift.job_count",
        "shift.open_issue_count",
    }
)

_ECOMMERCE_ATTRIBUTES = frozenset(
    {
        "cart.line_count",
        "cart.catalogue_snapshot_version",
        "quote.delivery_method",
        "identity.profile_version",
        "identity.address_version",
        "request.idempotency_key",
        "request.digest_version",
        "handoff.shop_inbox_written",
    }
)

_AI_ATTRIBUTES = frozenset(
    {
        "ai.model",
        "ai.operation",
        "ai.provider",
        "ai.input_tokens",
        "ai.output_tokens",
        "ai.schema_valid",
        "ai.refusal",
        "ai.parse_errors",
        "review.outcome",
    }
)

_DB_ATTRIBUTES = frozenset(
    {
        # Plan-literal names (section 4, "Database query" table).
        "db.collection",
        "db.operation",
        "db.rows_affected",
        # Semantic-convention attributes the auto instrumentation also sets
        # (old and new OTEL DB semconv spellings; harmless structural
        # metadata — never a query parameter or SQL text).
        "db.system",
        "db.name",
        "db.namespace",
        "db.operation.name",
    }
)

_STORAGE_ATTRIBUTES = frozenset(
    {
        "storage.bucket",
        "storage.mime_type",
        "storage.size_bytes",
        "storage.digest_matched",
    }
)

_WORKER_ATTRIBUTES = frozenset(
    {
        "worker.cycle_name",
        "worker.trigger",
        "worker.task_name",
        "worker.outcome",
        "worker.task_count",
        "worker.error_count",
        "worker.duration_ms",
    }
)

# Section 3 "Safe to include in spans" table: correlation IDs, HTTP/route
# metadata, and generic structural labels shared across every span type.
_CORRELATION_ID_ATTRIBUTES = frozenset(
    {
        "trace_id",
        "span_id",
        "parent_span_id",
        "workspace_id",
        "order_id",
        "movement_id",
        "job_id",
        "output_id",
        "inspection_id",
        "rework_id",
        "shift_id",
        "close_id",
        "draft_id",
        "request_id",
        "shop_draft_id",
        "invocation_id",
        "workflow_span_id",
        "decision_packet_id",
        "upload_id",
        "cycle_id",
        "task_id",
        # This runtime's own command envelope — an opaque idempotency key
        # chosen client-side, not customer content.
        "command_id",
    }
)

_GENERIC_STRUCTURAL_ATTRIBUTES = frozenset(
    {
        "http.method",
        "http.route",
        "http.status_code",
        "error.type",
        "error.code",
        "duration_ms",
        "lines_count",
        "rows_affected",
        "product",
        "workflow",
        "surface",
        "event_type",
    }
)

ATTRIBUTE_WHITELIST: frozenset[str] = frozenset().union(
    _SHOP_ATTRIBUTES,
    _PLANT_ATTRIBUTES,
    _ECOMMERCE_ATTRIBUTES,
    _AI_ATTRIBUTES,
    _DB_ATTRIBUTES,
    _STORAGE_ATTRIBUTES,
    _WORKER_ATTRIBUTES,
    _CORRELATION_ID_ATTRIBUTES,
    _GENERIC_STRUCTURAL_ATTRIBUTES,
)

# Attribute keys that must never survive the scrubber even if a future edit
# accidentally adds them to ATTRIBUTE_WHITELIST above. This is the explicit,
# named defense for the plan's single highest-severity concern: "Attribute
# db.statement is explicitly disabled — it would contain SQL with parameter
# values that may include amounts or IDs traceable to customers" (section 4).
FORBIDDEN_ATTRIBUTE_KEYS: frozenset[str] = frozenset(
    {
        "db.statement",
        "db.query.text",
        "db.statement.parameters",
    }
)

assert FORBIDDEN_ATTRIBUTE_KEYS.isdisjoint(ATTRIBUTE_WHITELIST), (
    "A forbidden attribute key leaked into the allowlist."
)


__all__ = [
    "SHOP_ORDER_INTAKE",
    "SHOP_ORDER_CONFIRM",
    "SHOP_STOCK_RESERVE",
    "SHOP_STOCK_RELEASE",
    "SHOP_FULFILMENT_ADVANCE",
    "SHOP_PAYMENT_RECONCILE",
    "SHOP_DAILY_CLOSE",
    "PLANT_JOB_PLAN",
    "PLANT_JOB_RELEASE",
    "PLANT_MATERIAL_ISSUE",
    "PLANT_OUTPUT_RECORD",
    "PLANT_QUALITY_INSPECT",
    "PLANT_QUALITY_REWORK",
    "PLANT_SHIFT_CLOSE",
    "ECOMMERCE_CART_BUILD",
    "ECOMMERCE_QUOTE_CAPTURE",
    "ECOMMERCE_IDENTITY_SNAPSHOT",
    "ECOMMERCE_REQUEST_SUBMIT",
    "ECOMMERCE_SHOP_HANDOFF",
    "AI_INVOCATION",
    "AI_OUTPUT_PARSE",
    "AI_REVIEW_SUBMITTED",
    "DB_QUERY",
    "STORAGE_UPLOAD",
    "STORAGE_VERIFY",
    "WORKER_CYCLE_START",
    "WORKER_TASK_EXECUTE",
    "WORKER_CYCLE_END",
    "ATTRIBUTE_WHITELIST",
    "FORBIDDEN_ATTRIBUTE_KEYS",
]
