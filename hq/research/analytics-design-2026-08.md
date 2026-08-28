# Local analytics design — SuperMega

Date: 2026-08-11; implementation boundary revised 2026-08-28
Status: local recorder implemented; narrow production outcome bridge is a release candidate
Author: HQ R&D
Related: `hq/research/opentelemetry-implementation-plan-2026-08.md`
Portfolio gate: not yet registered (register after go/no-go section passes)

---

## Context

SuperMega runs four browser-local products (Shop, Plant, Website, Ecommerce) on the owner's device. No managed persistence is active. The device-local metric recorder remains the authoritative free evidence layer and does not depend on a provider.

The original 2026-08-11 design prohibited all outbound analytics. The 2026-08-28 implementation boundary supersedes only that prohibition: on a production `supermega.dev` hostname, an explicit outcome-proof transition may also queue one `supermega_local_outcome` event through the already-present Vercel Web Analytics script. The event name deliberately classifies the count as local interaction evidence, never managed, customer, or commercial proof. Its data is exactly two low-cardinality strings, `product` and `stage`. Localhost and preview hosts queue nothing. Names, contacts, amounts, paths, URLs, record IDs, timestamps, hashes, free text, and private evidence are excluded structurally.

The production bridge is optional, receipt-deduplicated, session-capped, and fail-open. Vercel custom events are plan-dependent (Pro or Enterprise as of 2026-08-28), so a queued event is not proof of provider ingestion. External visibility remains `not_observed` until a commit-bound production operations receipt verifies the exact event. The existing `client_error` event is a separate prior implementation whose four-property payload exceeds the standard Pro two-property limit; that compatibility gap is not copied into or widened by the outcome bridge.

The operating constraint is written in `capability-tiers.ts`: every capability that works locally today is free forever. Anything local analytics does must be consistent with that promise. Metrics never gate a capability or affect action success. The optional production bridge reports only the closed outcome stage; the full device-local record stays local and remains available even when Vercel custom events are unsupported.

---

## 1. What we can measure locally

All of the following are derivable from browser state without external calls. The browser already tracks these transitions; we are naming them and counting them.

### Page and surface visits

The app routes on URL hash (e.g. `#/shop/`, `#/plant/jobs`, `#/ecommerce/store`). Each hash change is a measurable page visit. Hash routing fires a `hashchange` or `popstate` DOM event at no cost. We record which surface was visited, not what the owner saw on it.

Safe surface labels (from `portfolio.json` and `capability-tiers.ts`):
- Shop: `sell`, `orders`, `stock`
- Plant: `jobs`, `problems`
- Website: `preview`, `edit`, `download`
- Ecommerce: `store`, `edit-store`, `cart`, `quote`, `shop-review`
- HQ: `home`, `work`, `settings`

### Feature usage events

Each of the eleven free-forever capabilities maps to at least one observable user action:

| Capability ID | Observable actions |
|---|---|
| `shop-counter` | sale completed (counter confirmed), payment method selected |
| `shop-inventory` | stock item viewed, reorder level set, stock count saved |
| `shop-orders` | order created, order confirmed, fulfilment state advanced, return raised |
| `shop-appointments` | appointment booked, appointment cancelled |
| `shop-daily-close` | close started, close confirmed, discrepancy recorded |
| `shop-accounting-handoff` | export generated, export downloaded |
| `plant-production` | job planned, job released, output recorded, shift close initiated, shift close confirmed, CAPA opened, CAPA resolved |
| `website-builder` | preview opened, edit saved, file downloaded |
| `ecommerce-storefront` | store viewed, cart built, quote captured, order request submitted, shop handoff reached |
| `local-backup` | backup initiated, backup completed, restore initiated |
| `device-reset` | reset initiated |

These names are structural. None of them contain what the owner typed, who the customer was, or what the amounts were.

### Error signals

`console.error` calls are countable without knowing their content. The browser exposes uncaught errors via `window.onerror` and unhandled promise rejections via `window.onunhandledrejection`. We count by error type label (e.g. `stock_conflict`, `schema_validation_failed`, `setup_incomplete`) where the label is assigned by the app at throw time. We do not capture the error message text — it may contain PII.

### Onboarding progress

Setup completion is already tracked in local state. We can derive milestones without reading private data:
- Setup wizard step reached (numeric index, not content)
- First feature action per product (first sale, first job, first store visit)
- First daily close
- First export generated

### Time-to-first-value metrics

Time-to-first-value (TTFV) measures how long between setup completion and the first meaningful outcome per product. This is a duration computed from two timestamps — both under the owner's control, both already stored locally. No customer data is involved.

| Metric | Computation |
|---|---|
| TTFV Shop | `first_sale_ts - setup_complete_ts` |
| TTFV Plant | `first_shift_close_ts - setup_complete_ts` |
| TTFV Website | `first_download_ts - setup_complete_ts` |
| TTFV Ecommerce | `first_order_request_ts - setup_complete_ts` |

---

## 2. Instrumentation design

### Emitter pattern

No tracking library is added. Events are dispatched on the global `window` object using the standard `CustomEvent` API. Any component in the React tree can call this without importing a shared module or creating a circular dependency.

```ts
// Pattern — call from any React component or event handler
window.dispatchEvent(
  new CustomEvent('supermega:metric', {
    detail: {
      product: 'shop',          // 'shop' | 'plant' | 'website' | 'ecommerce' | 'hq'
      capability: 'shop-counter', // capability ID from capability-tiers.ts FREE_FOREVER
      action: 'sale.completed',   // dot-separated noun.verb
      ts: Date.now(),             // unix ms; no user timezone info needed
    },
  })
)
```

The `detail` shape is a discriminated union. The fields are:
- `product`: one of the five product IDs
- `capability`: a string from `FREE_FOREVER` or `null` for HQ-level actions
- `action`: dot-separated `noun.verb` (e.g. `sale.completed`, `shift.close.confirmed`, `capa.resolved`)
- `ts`: `Date.now()` at emit time

No `customerId`, `orderId`, `amount`, `name`, `phone`, or free-text fields ever appear in the detail.

### Collector

A single `MetricsCollector` module registers a listener on `window` at app startup. It runs in memory only during the session. It does not write to `localStorage` unless the owner explicitly navigates to a metrics page or the go/no-go conditions for retention are met (see section 8).

```ts
// metrics-collector.ts (sketch — not a library, ~60 lines)

export type MetricEvent = {
  product: string
  capability: string | null
  action: string
  ts: number
}

const SESSION_EVENTS: MetricEvent[] = []

export function startMetricsCollector() {
  window.addEventListener('supermega:metric', (e) => {
    const evt = (e as CustomEvent<MetricEvent>).detail
    // Validate shape; drop anything that does not match the schema
    if (!evt.product || !evt.action || typeof evt.ts !== 'number') return
    SESSION_EVENTS.push(evt)
  })
}

export function getSessionEvents(): readonly MetricEvent[] {
  return SESSION_EVENTS
}
```

`startMetricsCollector()` is called once in the app root. The implemented collector keeps a bounded session array and a bounded device-local record under `supermega.hq.local-metrics.v1`; this supersedes the earlier in-memory-only sketch. That local record is independent from the optional outcome bridge.

### Where to add emit calls

Emit sites are placed at outcome moments, not at render moments. This avoids double-counting from re-renders.

Priority emit sites by product:

**Shop**
- `sale.completed` — after the counter confirms payment and the order record is written to local state
- `shift.close.confirmed` — after the daily close record commits
- `order.created`, `order.confirmed`, `return.raised` — at each Shop order state transition
- `accounting.export.downloaded` — when the export file is handed to the browser download API

**Plant**
- `job.released` — when a job transitions from planned to released
- `output.recorded` — when good/scrap quantities are saved
- `shift.close.confirmed` — after the shift close record commits
- `capa.opened`, `capa.resolved` — at CAPA lifecycle transitions

**Website**
- `preview.opened`, `edit.saved`, `file.downloaded`

**Ecommerce**
- `cart.built`, `quote.captured`, `order.request.submitted`, `shop.handoff.reached`

**Onboarding** (HQ-level)
- `setup.step.advanced` (with step index as a safe integer, not step content)
- `setup.completed`

---

## 3. Local aggregation

The implemented collector keeps the newest 500 closed-shape `MetricEvent` records in device-local storage so evidence survives a reload. This differs from the historical aggregate-only proposal below; the record remains non-portable, bounded, and independent from Vercel.

### On-demand computation

On navigation to `/work/?view=local-metrics` (the metrics page, step 5 below), the app reads `SESSION_EVENTS`, reads any retained aggregate from `localStorage`, and computes:

| Metric | Computation |
|---|---|
| Daily active feature counts | Count unique `capability` values in events from today's UTC date |
| Feature use frequency | Count events per `action` string over the retained window |
| Order completion rate | `sale.completed` count / `order.created` count for Shop |
| Shift close frequency | `shift.close.confirmed` events per day |
| CAPA resolution rate | `capa.resolved` / `capa.opened` |
| First-value latencies | `first_sale_ts - setup_complete_ts`, etc. (see section 1) |
| Error count by type | Count of `console.error` interceptions, grouped by error type label |

The last 30 days of derived aggregates (not raw events) are the retention target. One row per UTC day per metric. The structure is designed so that deleting all of it at any time leaves the product fully functional.

### Retained aggregate schema (localStorage key: `supermega.hq.local-metrics.v1`)

```json
{
  "schemaVersion": "supermega.hq.local-metrics.v1",
  "retentionDays": 30,
  "generatedAt": "2026-08-11",
  "days": [
    {
      "date": "2026-08-11",
      "featureCounts": {
        "shop-counter": 3,
        "shop-daily-close": 1,
        "plant-production": 5
      },
      "actionCounts": {
        "sale.completed": 3,
        "shift.close.confirmed": 2,
        "capa.resolved": 1
      },
      "errorCounts": {
        "stock_conflict": 0,
        "schema_validation_failed": 0
      },
      "onboardingMilestones": {
        "setup_complete": true,
        "first_sale": true,
        "first_shift_close": true,
        "first_website_download": false,
        "first_order_request": false
      }
    }
  ],
  "ttfv": {
    "shop_ms": 14400000,
    "plant_ms": null,
    "website_ms": null,
    "ecommerce_ms": null
  }
}
```

The aggregate is written at end-of-day (triggered by a daily close event or by a page visibility change when the date crosses midnight). Entries older than 30 days are dropped before writing. The write is idempotent — re-running the computation for the same date replaces the row.

Only the four-field closed local event shape is retained; no order IDs, customer contact details, item names, amounts, operator names, or free text are written. The aggregate schema below remains a future reporting target rather than the current storage shape.

---

## 4. CEO cycle integration

The weekly CEO brief already reads evidence from multiple sources. The local metrics artifact becomes one more evidence source — readable in the brief's fixed read-only evidence plan without requiring a network call.

### Artifact identifier

`supermega.hq.local-metrics.v1` (the `localStorage` key above)

### How the CEO brief reads it

The CEO brief startup sequence (13 files, ~251 KB, unchanged evidence uses zero model work) can include local metrics as a structured evidence file. The current `fixedReadOnlyEvidencePlan: true` constraint means the evidence plan does not change between cycles unless a founder decision updates it.

The brief reads the aggregate and produces a section like:

```
## Local product usage (30 days, browser-local, no outbound data)

Feature activity: Shop counter used 3 days of 7, daily close run 3 days of 7.
Plant: 5 shift close events recorded; 1 CAPA resolved.
Website: 0 downloads (not yet used this week).
Ecommerce: 0 order requests (not yet used this week).
Onboarding: setup complete, first sale achieved, first shift close achieved.
Errors: 0 stock conflicts, 0 schema validation failures.
Time to first Shop value: 4 hours after setup.
```

This is evidence of actual product use, derived entirely from the owner's own device, summarized without customer data.

### Evidence status flag

The aggregate carries a `generatedAt` date. If `generatedAt` is older than 8 days when the brief reads it (i.e., no metrics have been computed this week), the brief notes `local-metrics: stale` rather than failing. Stale metrics are not an error condition during the pre-managed period.

---

## 5. Managed mode path

When managed mode is proven (the five gate conditions in `opentelemetry-implementation-plan-2026-08.md` section 5 all pass), server-side OTel spans replace the need for browser-local event counting for most operational questions. The local analytics layer does not need to be removed — it becomes the session-level complement to server-side traces.

The relationship:

| Question | Pre-managed answer | Managed-mode answer |
|---|---|---|
| Was the counter used today? | Local feature count (section 3) | `shop.order.confirm` span count in Jaeger/Tempo |
| Did the shift close run? | Local `shift.close.confirmed` count | `plant.shift.close` span in trace |
| How long did setup take? | TTFV from `localStorage` | `setup.completed` span with start time |
| What errors occurred? | Local error type count | Error spans with `db.error` or `http.status: 5xx` |

Local analytics handles the browser-only question ("did the owner use this feature on this device"). OTel handles the server-correlated question ("what did the server do when they did"). They are not duplicates.

**No migration is needed.** When OTel is active, both layers run. The CEO brief reads both. The local metrics artifact remains the privacy-safe summary; OTel provides the correlation depth for operational triage.

---

## 6. Privacy constraints

### Must never appear in local metrics

These rules match the OTel redaction rules in `opentelemetry-implementation-plan-2026-08.md` section 3. Local analytics applies the same constraints at the point of emission — not as a post-processing scrubber, but as an architectural rule: if the field is not in the allowed list below, it does not enter the event at all.

| Data class | Specific examples | Why excluded |
|---|---|---|
| Customer names | Buyer name on order, contact name, Ecommerce customer | PII |
| Myanmar phone numbers | KBZ, Wave, Viber, Messenger contact numbers | Personal identifier; also primary login proxy |
| MMK order amounts | Sale total, line price, refund amount, correction note | Financial PII |
| Order IDs and reference numbers | Shop order ID, Ecommerce request ID | Traceable to a specific transaction |
| Supplier names and references | PO supplier, lot references | Commercial sensitivity |
| Delivery addresses | Township, address line, city | Personal address data |
| Free-text fields | Return reason, CAPA note, shift note, quality observation | May contain names, numbers, or PII |
| Product formula content | BOM ingredients, routing instructions | Commercial IP |
| Operator names and staff identifiers | Name field on shift record or CAPA | PII |
| Auth tokens or session identifiers | Any JWT or API key fragment | Obvious |

### Safe to record in local metrics

| Data class | Examples | Why safe |
|---|---|---|
| Feature names (capability IDs) | `shop-counter`, `plant-production` | Structural labels; no content |
| Action names | `sale.completed`, `capa.resolved` | Verb labels; no content |
| Event timestamps (ms) | `Date.now()` | Timing only; no party information |
| Step indices | Setup step 3 of 6 | Integer; no step content |
| Count values | 3 sales, 1 close, 0 errors | Cardinality; no content |
| Duration values | TTFV in milliseconds | Timing only |
| Error type labels | `stock_conflict`, `schema_validation_failed` | Taxonomy; not free text |
| Product and surface labels | `shop`, `sell`, `jobs` | Structural routing labels |
| Boolean milestones | `setup_complete: true`, `first_sale: true` | State flags; no content |

### Enforcement rule

The `MetricEvent` type is a closed discriminated union. Any emit site that attempts to add a field not in the type definition is a TypeScript compile error. The type is defined with `satisfies` against a schema constant so that new fields cannot be added without a deliberate change to the schema. This is the enforcement mechanism — the constraint lives in the type system, not in runtime scrubbing.

---

## 7. Implementation steps

Ordered from smallest useful thing to full integration.

### Step 1 — Event dispatcher and in-memory collector (1–2 hours)

Create `showroom/src/analytics/metrics-collector.ts` with:
- The `MetricEvent` type (closed, no PII fields)
- `startMetricsCollector()` that registers the `supermega:metric` listener
- `getSessionEvents()` that returns the in-memory array (read-only)
- A `emitMetric(detail: MetricEvent)` helper that calls `window.dispatchEvent`

Call `startMetricsCollector()` in the app root (`App.tsx` or equivalent), after the React tree mounts, as a side effect with no state.

No localStorage, no UI, no persistence. This is the minimum: events can now be emitted and counted in the browser console.

**Acceptance:** Open the app, perform a sale in Shop, open the browser console, and confirm a `supermega:metric` event appears with `action: 'sale.completed'` and no PII fields.

### Step 2 — Hash-based page visit tracking (1 hour)

In the collector, add a `hashchange` / `popstate` listener that emits a `page.visit` event with the surface label derived from the hash. Use a static map from hash prefixes to surface labels. Do not store the full hash (it may contain IDs in some routing patterns).

**Acceptance:** Navigate between Shop, Plant, Website, and Ecommerce. Confirm one `page.visit` event per navigation, with the correct surface label, and no URL parameters in the event.

### Step 3 — Emit sites for Shop (2–3 hours)

Add `emitMetric(...)` calls at the four highest-value Shop outcomes:
- `sale.completed` after the counter confirms payment
- `shift.close.confirmed` after the daily close record commits
- `order.created` when a new order record is saved
- `accounting.export.downloaded` when the export file is handed to the browser

These are one-line additions at existing outcome points. They do not change the data flow.

**Acceptance:** Run a Shop counter sale, close the shift, create an order, and download the accounting export. Confirm four distinct metric events, each with correct `capability` and `action`, no amount or order ID.

### Step 4 — Emit sites for Plant, Website, Ecommerce (2–3 hours)

Add emit calls at the next-tier outcomes:
- Plant: `job.released`, `output.recorded`, `shift.close.confirmed`, `capa.opened`, `capa.resolved`
- Website: `preview.opened`, `edit.saved`, `file.downloaded`
- Ecommerce: `cart.built`, `quote.captured`, `order.request.submitted`, `shop.handoff.reached`

**Acceptance:** Run the existing product acceptance flows. All fourteen action names appear in the in-memory event array.

### Step 5 — Metrics page at `/work/?view=local-metrics` (2–3 hours)

Add a read-only page under `/work/` that:
- Reads `SESSION_EVENTS` from the collector
- Reads any retained aggregate from `localStorage` (if present)
- Computes and displays the key metrics table (section 3)
- Shows TTFV values where available
- Shows 30-day feature-count history as a simple text table (no chart library needed)

The page is HQ-internal only. It does not appear in the product navigation. It is accessible via the URL parameter and from the HQ Work area.

**Acceptance:** Navigate to `/work/?view=local-metrics`. Confirm the page renders without errors, shows today's event counts, and shows no PII.

### Step 6 — Local aggregate retention (2–3 hours)

When the go/no-go conditions in section 8 pass:

Add a `persistDailyAggregate()` function in the collector that:
- Computes the day's aggregate from `SESSION_EVENTS` plus the previous retained value
- Prunes entries older than 30 days
- Writes to `localStorage` under key `supermega.hq.local-metrics.v1`
- Is called on `shift.close.confirmed` (daily close = natural end of day) and on `visibilitychange` when the date has advanced

This function is the only code that touches `localStorage`. Nothing else in the analytics layer reads or writes storage.

**Acceptance:** Perform a daily close. Reload the tab. Open `/work/?view=local-metrics`. Confirm the previous session's counts appear, sourced from `localStorage`, and that no PII is present in the stored JSON.

### Step 7 — CEO brief integration (1 hour, after step 6)

Update the CEO brief startup evidence plan to include the local metrics artifact:
- Read `supermega.hq.local-metrics.v1` from `localStorage`
- If absent or stale (older than 8 days), note `local-metrics: not-yet-available`
- If present, produce the usage summary block described in section 4

Register `analytics-design-2026-08.md` as a research gate in `portfolio.json` with `decision: "adopt"` and `evaluationStatus: "implementation-complete"` when step 6 passes.

### Step 8 — Error type counting (1 hour, after step 1)

In the collector, add:
- An `onerror` handler that reads `e.type` (not `e.message`) and emits `error.uncaught` with `errorType: classifyError(e)`
- An `onunhandledrejection` handler similarly
- A `classifyError(e)` function that maps known error patterns to a small taxonomy of safe labels: `stock_conflict`, `schema_validation_failed`, `setup_incomplete`, `network_unavailable`, `unknown`

The taxonomy is a closed list. Any error that does not match a known pattern is classified `unknown`. The original message is never stored.

**Acceptance:** Trigger a known validation error in Shop. Confirm the error event shows `errorType: 'schema_validation_failed'` and no message text.

---

## 8. Historical go/no-go for persistence and CEO brief integration

This section records the original pre-implementation gate. The subsequently reviewed collector now uses the bounded device-local record described above; these conditions remain privacy rationale, not a current claim that events disappear when the tab closes. CEO-brief and provider ingestion still require their own current evidence gates.

The following conditions must be true before any metric is written to `localStorage` or read by the CEO brief:

**Condition 1: No PII path in the event schema.**
A TypeScript compile check (`tsc --noEmit`) with the closed `MetricEvent` type must pass with no type errors. No string field in `MetricEvent` may have a name matching the PII field list in section 6. This is enforced at build time.

**Condition 2: Emit sites reviewed against the PII list.**
Each emit call in steps 3–4 is reviewed in a PR against the "must never appear" list in section 6. The review confirms that no variable containing customer data is passed as a `detail` field. One reviewer (founder or engineering lead) signs off.

**Condition 3: The metrics page renders without errors on a fresh setup.**
The `/work/?view=local-metrics` page (step 5) renders correctly on a device that has no prior analytics data. No undefined access, no empty-state errors, no exception. Confirmed by the standard `npm run dev` smoke test.

**Condition 4: The aggregate schema is approved by the founder.**
The `supermega.hq.local-metrics.v1` schema (section 3) is reviewed and the founder confirms: (a) the stored fields contain no PII, (b) storage in `localStorage` is acceptable for the pre-managed period, and (c) the 30-day retention window is appropriate.

**Condition 5: A reset path exists.**
The device reset capability (`device-reset`) must clear the `supermega.hq.local-metrics.v1` key from `localStorage` as part of its scope. Confirm this is wired before step 6 ships.

The old in-memory-only placeholder is superseded by the implemented bounded local recorder. Nothing in that local implementation establishes managed, customer, commercial, or provider proof.

---

## What this does not do

- The local `MetricEvent` recorder sends nothing outbound. The only outcome exception is the production-host Vercel queue described in the 2026-08-28 boundary above; it carries exactly `product` and `stage` and makes no ingestion or commercial-proof claim.
- Does not identify the owner. No device fingerprint, no install ID, no email.
- Does not measure customer behavior. The products are used by business owners, not their customers. Local analytics measures owner/operator actions.
- Does not replace OTel. When managed mode is proven, OTel provides server-side correlation and aggregate metrics at the workspace level. Local analytics provides the browser-local session view that OTel cannot see.
- Does not add a tracking library. No GA, Mixpanel, Amplitude, PostHog, or equivalent is introduced. The existing Vercel script queue is reused, and the outcome dedupe ledger is bounded to one session-storage key.
- Does not affect the free-forever guarantee. Capabilities in `FREE_FOREVER` are not gated, counted against a quota, or changed by this layer. Analytics is observational.
