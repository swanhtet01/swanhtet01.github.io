# OpenTelemetry implementation plan — SuperMega

Date: 2026-08-11
Status: research-ready
Source: `portfolio.json` gate — `adopt-with-managed-mode`
Gate: Redact customer content and correlate request, workflow, model, tool, and database operations.
Reference: https://vercel.com/docs/tracing/instrumentation

---

## 1. Why this matters — correlation gaps today

SuperMega's four products each generate meaningful server-side operations, but today no unified request ID threads a user action through FastAPI, Postgres, and the background worker. The observable consequences:

**Shop order lifecycle.** A counter sale or Ecommerce request can touch the FastAPI inbox, one or more Postgres write commands, a stock reservation row, and a daily-close snapshot. When an order fails to close or a stock reservation is orphaned, there is no trace ID to correlate the four operations. Debugging requires grepping logs by timestamp and guessing.

**Plant job lifecycle.** A job release calls FastAPI, writes to `workspace_events`, locks a BOM/routing row, and may trigger an MRP pass. A failed quality inspection that should create a hold has no shared span to confirm every required step ran in order and committed.

**Ecommerce checkout flow.** Cart → quote → contact snapshot → Shop inbox handoff crosses four distinct state transitions. A partial handoff (request stored, Shop inbox not written) today leaves no parent span to prove at what point the flow stopped.

**AI model calls (gated R&D).** When Order Intake or a future AI demo calls a model, the latency, token count, schema validation result, and human-review step need to live under one parent span so cost and quality are attributable to the workflow that invoked them. Without this, model cost cannot be allocated per workflow or per product.

**Database queries.** Slow Postgres queries are visible in Supabase advisor output but not attributed to which product, workflow, or user action triggered them.

**Background worker.** The bounded scheduler runs triage, ops watch, and release watch cycles. When a scheduled cycle produces no evidence or times out, there is no parent span to distinguish a slow query from a network failure from an empty result.

The R&D decision (`adopt-with-managed-mode`) means: build the instrumentation and redaction machinery locally and prove it works before attaching any hosted trace collector that would receive real workspace data.

---

## 2. Architecture — layers to instrument

| Layer | What it does today | Instrumentation target |
| --- | --- | --- |
| **Vite / React 19 SPA** | Browser-local product UIs; no managed writes today | Browser Performance API marks for user-initiated actions; parent trace ID injected into API fetch headers |
| **FastAPI** | `/api/trial/v1` and managed endpoints; Pydantic request models; Psycopg 3 connection | OTEL Python SDK middleware; auto-instrument ASGI; manual spans for domain commands |
| **Psycopg 3 / Postgres** | `app_private` schema; workspace_state, workspace_events, approvals | `opentelemetry-instrumentation-psycopg` for query spans; attribute: table name, operation type, row count |
| **Vercel Edge** | CDN, static asset serving, edge functions for public routes | Vercel-native OTEL integration (`@vercel/otel`); propagate `traceparent` header; edge spans for routing decisions |
| **AI gateway** | Model calls (gated R&D; local Ollama loopback or hosted) | Manual span wrapping the model call; attributes: model name, operation name, token counts, schema validation result |
| **Kernel worker** | Bounded scheduler; triage, ops watch, release watch | Root span per cycle; child spans per task; propagate context into any downstream API call |

The trace propagation format is W3C `traceparent` / `tracestate` headers throughout. The frontend sets a root span before the fetch; FastAPI extracts and continues it.

---

## 3. Customer data redaction rules

### Must never appear in span attributes, span names, or log fields

| Data class | Examples | Why |
| --- | --- | --- |
| Customer names | Buyer name on Ecommerce request, contact name on Shop order | PII; Myanmar names may uniquely identify small businesses |
| Myanmar phone numbers | Contact phone on checkout, Viber/Messenger source reference | Personal identifier; also the primary login proxy for many operators |
| MMK order amounts | Individual order total, line price, correction note amount | Financial PII; must not be traceable to a customer or operator |
| Supplier names and references | Supplier on purchase order, supplier lot reference | Commercial sensitivity |
| Delivery addresses | Township, city, address line on customer snapshot | Personal address data |
| Customer reason text | Return reason, support note, correction reason | Free-text; may contain names, phone numbers, or complaint details |
| Product formula / recipe content | BOM ingredients, routing instructions | Commercial IP; also may contain batch-linked quality data |
| Quality CAPA content | Root cause text, corrective action note | May contain operator names, equipment serials, regulatory evidence |
| Shift and handoff notes | Shift supervisor note, handoff observation text | May contain names, personal observations, equipment identifiers |
| Auth tokens and secrets | Supabase JWT, API keys, service-role credentials | Obvious; never in any span |
| Workspace member identifiers | Email addresses used as actor IDs | PII even if internal |

### Safe to include in spans

| Data class | Examples | Why safe |
| --- | --- | --- |
| Request / trace / span IDs | `trace_id`, `span_id`, `parent_span_id` | Opaque identifiers; no customer content |
| Workspace IDs | `workspace_id` (UUID) | Opaque; not linked to a person without a separate lookup |
| Operation names | `shop.order.confirm`, `plant.output.record` | Describes the workflow step, not its content |
| HTTP method and route | `POST /api/v1/commerce/orders` | Structural metadata |
| HTTP status codes | `200`, `409`, `422` | Outcome class; no content |
| Error type / code | `stock_conflict`, `schema_validation_failed` | Error taxonomy; not free text |
| Duration / latency | `duration_ms: 142` | Timing only |
| Bucket counts | `lines_count: 3`, `rows_affected: 1` | Cardinality; no content |
| Product and workflow names | `product: shop`, `workflow: daily_close` | Structural label |
| Table name | `db.collection: workspace_events` | Schema metadata |
| Model name and operation | `ai.model: gpt-4o-mini`, `ai.operation: order_intake` | Configuration metadata; no prompt/response content |
| Token counts | `ai.input_tokens: 340`, `ai.output_tokens: 88` | Cost telemetry; no text content |
| Schema validation result | `ai.schema_valid: true`, `ai.refusal: false` | Outcome flag; no content |
| Worker cycle name | `worker.cycle: ops_watch` | Structural label |

### Redaction rule

Before any span is exported, a scrubber function runs over all string-typed attribute values. The scrubber rejects spans that contain:

1. Any value that was present in the request body's customer-content fields (name, phone, address, reason, note, amount).
2. Any string matching Myanmar phone patterns (`09\d{7,9}` and variants) or MMK amount patterns (`[0-9,]+\s*MMK` or numeric fields named `total`, `amount`, `price`).
3. Any value longer than 200 characters in a non-whitelisted attribute (likely contains free text).

The scrubber is implemented as a Python `SpanProcessor` that runs before the OTEL exporter. It must have a passing golden test corpus before any hosted export is enabled.

---

## 4. Span taxonomy

All span names use dot-separated `product.noun.verb` form. Attributes follow OTEL semantic conventions where a standard exists (`http.*`, `db.*`, `ai.*`).

### Shop order lifecycle

| Span name | Key attributes | Correlation IDs |
| --- | --- | --- |
| `shop.order.intake` | `order.channel`, `order.line_count`, `order.idempotency_key` | `trace_id`, `order_id` (UUID), `workspace_id` |
| `shop.order.confirm` | `order.state_from: awaiting_confirmation`, `order.state_to: confirmed` | `trace_id`, `order_id` |
| `shop.stock.reserve` | `stock.sku_count`, `stock.location`, `db.rows_affected` | `trace_id`, `order_id`, `movement_id` |
| `shop.stock.release` | `stock.trigger: cancellation\|return`, `db.rows_affected` | `trace_id`, `order_id` |
| `shop.fulfilment.advance` | `fulfilment.state_from`, `fulfilment.state_to` | `trace_id`, `order_id` |
| `shop.payment.reconcile` | `payment.method_label`, `payment.status_to` | `trace_id`, `order_id` |
| `shop.daily.close` | `close.order_count`, `close.exception_count` | `trace_id`, `close_id` |

### Plant job lifecycle

| Span name | Key attributes | Correlation IDs |
| --- | --- | --- |
| `plant.job.plan` | `job.work_centre`, `job.line_count` | `trace_id`, `job_id`, `workspace_id` |
| `plant.job.release` | `job.bom_version`, `job.routing_version` | `trace_id`, `job_id` |
| `plant.material.issue` | `material.line_count`, `db.rows_affected` | `trace_id`, `job_id` |
| `plant.output.record` | `output.quantity_good`, `output.quantity_scrap` | `trace_id`, `job_id`, `output_id` |
| `plant.quality.inspect` | `quality.result: pass\|fail\|hold`, `quality.inspection_type` | `trace_id`, `job_id`, `inspection_id` |
| `plant.quality.rework` | `rework.routing_operation`, `rework.quantity` | `trace_id`, `job_id`, `rework_id` |
| `plant.shift.close` | `shift.job_count`, `shift.open_issue_count` | `trace_id`, `shift_id` |

### Ecommerce checkout flow

| Span name | Key attributes | Correlation IDs |
| --- | --- | --- |
| `ecommerce.cart.build` | `cart.line_count`, `cart.catalogue_snapshot_version` | `trace_id`, `draft_id`, `workspace_id` |
| `ecommerce.quote.capture` | `quote.delivery_method: delivery\|pickup` | `trace_id`, `draft_id` |
| `ecommerce.identity.snapshot` | `identity.profile_version`, `identity.address_version` | `trace_id`, `draft_id` |
| `ecommerce.request.submit` | `request.idempotency_key`, `request.digest_version` | `trace_id`, `request_id` |
| `ecommerce.shop.handoff` | `handoff.shop_inbox_written: true\|false` | `trace_id`, `request_id`, `shop_draft_id` |

### AI model call (gated R&D)

| Span name | Key attributes | Correlation IDs |
| --- | --- | --- |
| `ai.invocation` | `ai.model`, `ai.operation`, `ai.provider`, `ai.input_tokens`, `ai.output_tokens` | `trace_id`, `invocation_id`, `workflow_span_id` (links to parent workflow) |
| `ai.output.parse` | `ai.schema_valid: true\|false`, `ai.refusal: true\|false`, `ai.parse_errors` | `trace_id`, `invocation_id` |
| `ai.review.submitted` | `review.outcome: accepted\|discarded\|pending` | `trace_id`, `invocation_id`, `decision_packet_id` |

### Database query

Provided by `opentelemetry-instrumentation-psycopg`. Spans inherit from the calling domain span.

| Span name | Key attributes |
| --- | --- |
| `db.query` (auto) | `db.system: postgresql`, `db.collection: <table_name>`, `db.operation: SELECT\|INSERT\|UPDATE`, `db.rows_affected` |

Attribute `db.statement` is explicitly disabled — it would contain SQL with parameter values that may include amounts or IDs traceable to customers.

### File upload / Storage

| Span name | Key attributes | Correlation IDs |
| --- | --- | --- |
| `storage.upload` | `storage.bucket`, `storage.mime_type`, `storage.size_bytes` | `trace_id`, `upload_id`, `workspace_id` |
| `storage.verify` | `storage.digest_matched: true\|false` | `trace_id`, `upload_id` |

### Background worker

| Span name | Key attributes | Correlation IDs |
| --- | --- | --- |
| `worker.cycle.start` | `worker.cycle_name`, `worker.trigger: scheduled\|manual` | `trace_id`, `cycle_id`, `workspace_id` |
| `worker.task.execute` | `worker.task_name`, `worker.outcome: completed\|skipped\|error` | `trace_id`, `cycle_id`, `task_id` |
| `worker.cycle.end` | `worker.task_count`, `worker.error_count`, `worker.duration_ms` | `trace_id`, `cycle_id` |

---

## 5. Managed-mode gate conditions

These conditions must all be demonstrably true before any OTEL exporter is configured to send spans to a hosted collector. Satisfying them locally (console exporter or local Jaeger) does not meet this gate.

**Gate 1: Isolated tenant proven.**
The Supabase `app_private` schema must have RLS verified on a non-production instance. Row-level security must be confirmed to prevent workspace A from reading workspace B's rows. This is already listed as NOW.md blocker #1. OTel data is tenant-scoped; without this, a multi-tenant trace store could expose one workspace's operation names to another.

**Gate 2: Customer content scrubber verified.**
The Python `SpanProcessor` scrubber must pass a golden test corpus containing at least 40 span examples: 20 that should pass through unchanged and 20 that contain customer PII and must be dropped or redacted. The corpus must cover Myanmar phone patterns, MMK amounts, free-text reason fields, and name fields. Zero false-negatives (PII reaching the exporter) is the threshold.

**Gate 3: Trace data retention and access policy documented and owner-approved.**
The hosted OTEL collector (e.g., Vercel tracing backend or a self-managed OTLP endpoint) must have an explicit retention window (recommended: 7 days for traces, 30 days for aggregated metrics), an access policy (who can query raw spans), and a deletion path. This requires a founder decision before activation.

**Gate 4: Trace store tenant isolation verified.**
If using Vercel's OTEL integration, confirm that traces from one Vercel project/environment cannot be read from another. If using a self-managed collector (e.g., Grafana Tempo), verify the tenant-scoping header or label is enforced at read time. A single failed assertion is a blocker.

**Gate 5: No customer-content field in any exported span.**
Run the scrubber against 1,000 synthetic spans covering all seven span types (generated from fixture data that includes realistic MMK amounts, customer names, and phone numbers). Zero leaked values. This is an automated CI check, not a manual review.

---

## 6. Implementation steps

### Phase A — local only (no hosted collector, no managed writes required)

These steps can run today under `npm run dev` with a local OTLP collector (e.g., Jaeger all-in-one or `otelcol-contrib` with a file exporter).

**Step 1. Define the span schema as a Python module.**
Create `supermega_runtime/telemetry/schema.py` with constants for span names and required attributes from section 4. Include the attribute whitelist that the scrubber will enforce.

**Step 2. Add OTEL SDK dependencies.**
Add to `pyproject.toml` or `requirements.txt`:
- `opentelemetry-sdk`
- `opentelemetry-instrumentation-fastapi`
- `opentelemetry-instrumentation-psycopg`
- `opentelemetry-exporter-otlp-proto-grpc` (for later export; configure console exporter first)

**Step 3. Add the `TraceparentMiddleware` to FastAPI.**
Configure `OpenTelemetryMiddleware` to extract `traceparent` from incoming requests and attach the span to the request state. The span name must follow section 4 naming (not the raw HTTP path which could contain IDs).

**Step 4. Instrument Psycopg 3.**
Call `PsycopgInstrumentor().instrument()` at app startup. Disable `db.statement` attribute capture. Confirm that span names contain table and operation but not SQL text or parameter values.

**Step 5. Build the customer content scrubber.**
Implement `RedactingSpanProcessor` in `supermega_runtime/telemetry/redact.py`. It wraps the downstream exporter and calls `_scrub(span)` before forwarding. The scrub function checks all string attribute values against the redaction rules in section 3.

**Step 6. Write the scrubber golden corpus.**
Create `tests/telemetry/test_redact.py` with 40+ span fixtures. Parametrize the test: pass-through spans assert no attribute is modified; PII spans assert the span is dropped or the offending attribute is replaced with `[REDACTED]`. This test must be in CI before any export is enabled.

**Step 7. Add frontend trace ID injection.**
In the React fetch wrapper (wherever the app calls FastAPI), generate a `traceparent` header using the W3C format: `00-{32-hex-trace-id}-{16-hex-span-id}-01`. Use `crypto.randomUUID()` with formatting. Log the trace ID to the browser console in development mode only.

**Step 8. Run with a local OTLP collector.**
Add a `docker-compose.dev.yml` or a `justfile` target that runs `jaegertracing/all-in-one:latest` (OTLP gRPC on 4317, UI on 16686). Configure the OTEL exporter to point there when `OTEL_LOCAL=1` is set. Default behavior (no env var) uses the console exporter.

**Step 9. Add manual domain spans.**
For the five workflows that span multiple database calls (shop order confirm, plant job release, ecommerce request submit, AI invocation, worker cycle), add explicit `tracer.start_as_current_span(...)` blocks around the domain command function. Use span names from section 4.

**Step 10. Validate end-to-end locally.**
Run the Ecommerce checkout fixture. Confirm the Jaeger UI shows: one root span (`ecommerce.cart.build`), child spans for each step through `ecommerce.shop.handoff`, with Postgres `db.query` spans nested under each. Confirm no customer name or MMK amount appears in any span attribute.

### Phase B — managed-mode (requires gate conditions in section 5)

**Step 11. Configure Vercel OTEL integration.**
Add `instrumentation.ts` to the Vercel project root using `@vercel/otel`. This enables edge-layer spans (CDN routing, edge function invocations). Confirm the trace propagation header reaches the FastAPI origin.

**Step 12. Enable hosted OTLP export.**
Set `OTEL_EXPORTER_OTLP_ENDPOINT` in Vercel environment variables pointing to the approved collector. Enable only after gates 1–5 pass. The `RedactingSpanProcessor` must be in the chain before the OTLP exporter.

**Step 13. Configure trace retention and alert rules.**
In the hosted collector (Vercel tracing dashboard or Tempo), set retention to 7 days. Create alert rules for: p95 request latency > 2 s on `shop.order.confirm`, error rate > 5% on `ecommerce.shop.handoff`, any span where `ai.schema_valid = false` for more than 3 consecutive invocations.

**Step 14. Add AI workflow spans (when AI R&D gate opens).**
When Order Intake moves to a guided demo, wrap the model call in `ai.invocation`, validate the output schema in `ai.output.parse`, and record the human review outcome in `ai.review.submitted`. Token counts and model name are safe. Input text, output draft text, and source record content are not.

---

## 7. Risk assessment

### Data leakage — high severity, mitigable

**Risk.** A scrubber gap passes a customer name or MMK amount to the hosted collector. The OTEL dashboard then shows real customer data to anyone with collector access.

**Controls.** The golden corpus test (step 6) catches known patterns. The 200-character string-length check catches unknown free text. The scrubber defaults to dropping the attribute rather than passing it. A CI gate blocks deployment if the scrubber tests fail.

**Residual risk.** New free-text fields added to the domain model without updating the scrubber whitelist. Mitigation: the scrubber whitelist is opt-in (only listed attributes pass through); any new attribute not on the list is dropped by default.

### Performance overhead — low to moderate severity

**Risk.** Synchronous span creation and the scrubber's string inspection add latency per API call.

**Expected overhead.** OTEL Python SDK with an async OTLP exporter adds 1–3 ms per request for span creation. The scrubber adds < 1 ms for typical span attribute counts. Psycopg instrumentation adds no measurable overhead beyond an extra function call per query.

**Threshold.** If p95 FastAPI response time increases by more than 10 ms after enabling instrumentation, disable the synchronous scrubber check and move it to a background processor. The exporter should already be async.

### False redaction — low severity

**Risk.** The scrubber drops a legitimate span because a safe attribute value matches a PII pattern (e.g., a workspace UUID that starts with `09` being caught by the phone regex).

**Controls.** The scrubber operates on the attribute value not the attribute name alone. The phone regex requires the full `09` prefix followed by 7–9 digits with no non-digit suffix. UUIDs include hyphens and are not ambiguous. The golden corpus includes UUID values to verify no false positives.

**Residual risk.** Low. False positives lose a span; they do not leak data. Acceptable.

### Trace store access control failure — high severity, conditional

**Risk.** The hosted OTEL collector is misconfigured to allow unauthenticated read access, exposing operation-name patterns (not customer content, but workflow metadata).

**Controls.** This is a gate condition (gate 4). Activation is blocked until access policy is verified. The Vercel OTEL integration uses the same project-level auth as the deployment; it is not separately exposable without Vercel project access.

### Managed-mode activation sequence — moderate severity

**Risk.** Steps 11–13 are activated before gate 1 (RLS isolation) is proven. Trace data from a shared demo tenant flows alongside real pilot workspace data.

**Control.** The gate conditions in section 5 are strict prerequisites, not guidelines. Steps 11–13 must not be executed until a founder decision explicitly authorizes managed-mode activation after all five gates pass. The `OTEL_EXPORTER_OTLP_ENDPOINT` variable must not be set in any Vercel environment until that decision is recorded.

### Agent SDK tracing content — low severity while AI remains gated

**Risk.** If the OpenAI Agents SDK is adopted before the trace-content gate is evaluated, its default tracing may capture model input/output and store it in a third-party trace store without redaction.

**Control.** The existing portfolio decision defers the Agents SDK. If adopted: disable sensitive trace content at SDK initialization (`OPENAI_AGENTS_DISABLE_TRACING=1` or the SDK-documented trace-disable flag), then build a custom exporter that routes through the SuperMega scrubber. Do not rely on default SDK tracing behavior.

---

## What this unlocks

When all seven span types are instrumented and the scrubber passes its corpus:

- A failed Shop order can be reproduced from trace ID to the exact Postgres statement that conflicted.
- An Ecommerce handoff gap is visible as a `shop.handoff` span with `handoff.shop_inbox_written: false` — the root cause is identifiable without log-grepping.
- AI model cost per workflow is derivable from `ai.input_tokens` and `ai.output_tokens` summed by `ai.operation`, without storing any draft content.
- Worker cycle failures show exactly which task produced an error and how long the preceding database call took.

This closes the correlation gap and produces the evidence baseline needed before the first pilot customer is onboarded to a managed tenant.
