# Managed-Tier Billing Rail — Design (audit gate 9)

Status: design + minimal manual tooling. No payment processor integration. No price is set
anywhere in this design or its tooling; pricing is a founder decision the design parameterizes.

This document PREPARES founder actions. Nothing here requires founder credentials, touches
Supabase, or performs a network mutation. The managed-pilot readiness ledger keeps `payment`
in `founderDecision.doesNotAuthorize` and `controls.forbiddenUntilReady`
(`kernel/managed-pilot-readiness.mjs`), and this design does not change that: every billing
event is a founder-manual, owner-approved action until a separate founder decision.

## 1. Grounding (what the repo already establishes)

- **Payment adapters are deliberately deferred and manual.** The ecommerce lifecycle accepts
  only manual adapters — `_PAYMENT_ADAPTERS = {"pay_on_pickup", "cash_on_delivery",
  "kbzpay_manual"}` (`supermega_runtime/ecommerce_buying_lifecycle.py`), mirrored in
  `showroom/src/core/commerce-workspace.ts` (`CommercePaymentAdapter`) and
  `showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts`. The portfolio gate for
  ecommerce reads: "add tax, shipping, and payment adapters only behind accountable approval
  and duplicate-safe recovery" (`hq/portfolio.json`, pinned by `tools/verify_hq_contract.mjs`).
- **Customer payment reality as reflected in the repo** is manual rails: `KBZPay`, `WavePay`,
  `Cash`, `Cash on delivery`, `Card` (`showroom/src/core/channel-order-intake.ts`,
  `supermega_runtime/order_intake.py`), plus `manual_qr` and `manual_bank_transfer` on the
  website order form (`showroom/src/products/WebsiteCommerceIntake.tsx`,
  `showroom/src/products/product-handoff.ts`). This design uses only the generic categories
  those imply: **mobile money, bank transfer, cash** — with concrete channel labels supplied
  by founder config, never hardcoded.
- **The public offer is free-vs-managed with no prices.** "Free product. Managed
  intelligence." — and "No prices — the public site carries none" is the approved framing
  (`tools/create_public_vercel_output.mjs`, `tools/verify_public_vercel_output.mjs`,
  `docs/demo-playbooks/*.md`; `hq/NOW.md`: four browser-local products stay free; managed adds
  approved company intelligence after identity, tenant, recovery, and write controls pass).
- **The kernel already has the storage and approval model billing needs.** Control records are
  versioned envelopes — `record_key` (typed prefix), `tenant_id`, `status`, `plan_hash`
  (64-hex sha256), `payload`, `payload_hash` (sha256 of stable JSON), `revision` — with
  compare-and-set transitions via `transitionControlRecord(recordKey, expected, payload)`
  (`kernel/store.mjs`). Owner approval proofs already have a canonical shape:
  `{ actionId, capturedAt, actor, reason, evidenceReference }`
  (`supermega_runtime/ecommerce_buying_lifecycle.py` `_payment_policy(...).proof`;
  `showroom/src/core/commerce-workspace.ts` demo payment-policy proof).
- **Managed activation is fail-closed and owner-named** (`supermega_runtime/managed_activation.py`):
  named workspace, named owner, exact owner review. Billing inherits that posture.

## 2. Design principles

1. **Manual-first.** The founder issues every invoice; the customer pays out-of-band
   (bank transfer / mobile money / cash); the founder verifies receipt and marks paid.
   The software's job is records, determinism, and approval evidence — not money movement.
2. **Parameterized, never defaulted.** Amounts, currency, currency exponent, payment-channel
   labels, and tax lines come only from founder-supplied config. The tooling has no default
   price, no default currency, and refuses to fabricate any monetary value.
3. **Every charge event is an owner-approved control record.** An invoice and each of its
   status transitions map onto the kernel control-record model with an explicit approval proof.
4. **Digest-bound.** The invoice core is canonicalized (stable key order) and bound by sha256;
   the digest is the `plan_hash` for storage and the cross-reference on the printable copy.
5. **Fail-closed validation, duplicate-safe by construction.** Strict schemas, bounded text,
   `wx` file writes (never overwrite), idempotent verification.

## 3. Manual-first billing lifecycle

```
founder writes invoice config (amounts/currency are founder decisions)
        │
        ▼
tools/prepare_managed_invoice.mjs  → deterministic invoice packet (JSON + printable text), status: draft
        │  (local, zero network, wx-writes)
        ▼
founder reviews packet → approves → records issued transition, sends invoice to customer  [founder action]
        │
        ▼
customer pays by bank transfer / mobile money / cash  [entirely outside this system]
        │
        ▼
founder verifies funds against the named channel reference → records paid transition
   (or records void with a reason at draft/issued)         [founder action]
```

The tool prepares; the founder acts. No step in this repo sends an invoice, requests money,
or confirms payment on its own.

## 4. Data model — contract `supermega.managed-billing.v1` (proposal)

### 4.1 Invoice record (immutable core)

| Field | Type | Notes |
| --- | --- | --- |
| `contract` | `"supermega.managed-billing.v1"` | Version pin. |
| `invoiceId` | string, `^INV-[A-Za-z0-9-]{4,40}$` | Founder-assigned, unique per workspace. |
| `workspace` | `{ id, name }` | `id` must satisfy the kernel tenant id rule `^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$` (`kernel/store.mjs` `CONTROL_ID_RE`). |
| `customer` | `{ name, contact? }` | Bounded text; contact optional, never required for the record to be valid. |
| `period` | `{ label: "YYYY-MM", start: "YYYY-MM-DD", end: "YYYY-MM-DD" }` | The service period billed. `start <= end`, both inside `label`'s month unless the founder deliberately bills a custom span (then `label` is free-form bounded text plus explicit dates). |
| `lineItems[]` | `{ description, amountMinor }` | 1–20 items; integer minor units; each ≥ 0; at least one > 0. |
| `amount` | `{ currency, exponent, totalMinor }` | `currency` = 3-letter uppercase code from config; `exponent` = integer 0–4 from config (positions of the minor-unit point); `totalMinor` must equal the line-item sum. **No default currency, exponent, or amount exists anywhere.** |
| `tax` | `{ decided: false }` or `{ decided: true, description, amountMinor }` | Tax treatment is undecided by default and stays a founder decision; when decided it is one explicit line, included in `totalMinor`. |
| `paymentChannels[]` | `{ category, label, reference }` | 1–5 entries. `category` ∈ `bank_transfer \| mobile_money \| cash` (the generic categories the repo's manual rails imply). `label`/`reference` are founder-supplied strings (e.g. an account name/number or wallet handle) — never emitted by default. |
| `issuedToPayBy` | `{ issuedAt: ISO instant, dueDate: "YYYY-MM-DD" }` | Both from config; the tool never reads the wall clock for record content, so packets are deterministic. |
| `issuer` | `{ name }` | Bounded text. |
| `notes?` | string | Optional bounded text. |

### 4.2 Digest binding

`invoiceDigest = "sha256:" + hex(sha256(stableJson(invoiceCore)))` where `stableJson` is
recursive sorted-key serialization exactly as in `kernel/store.mjs` / `readinessDigest`
(`kernel/managed-pilot-readiness.mjs`). The packet also records `configDigest` — sha256 of the
exact founder config bytes (CRLF normalized to LF) — so any packet can be re-derived and
byte-compared from its inputs. The printable text copy carries the digest so a paper/PDF copy
cross-references the record.

### 4.3 Status lifecycle

`draft → issued → paid` with `void` reachable from `draft` and `issued`. `paid` and `void`
are terminal. No other transition is legal.

| Transition | Meaning | Required proof evidence |
| --- | --- | --- |
| `draft → issued` | Founder approved the packet and sent it to the customer. | How it was delivered (evidenceReference: message/thread/handover reference). |
| `issued → paid` | Founder verified funds arrived on a named channel. | `paymentReference` — the transfer/mobile-money/cash receipt reference, plus `paidAt` instant and channel category. |
| `draft → void`, `issued → void` | Founder cancels (error, renegotiation, non-payment). | Reason text. |

Every transition carries an owner-approval proof in the repo's canonical shape:
`{ actionId, capturedAt, actor, reason, evidenceReference }` — the same fields the ecommerce
payment policy requires (`supermega_runtime/ecommerce_buying_lifecycle.py`). The actor is the
founder (or a founder-named delegate); there is no automated transition.

### 4.4 Control-record storage (per the kernel model)

When billing is wired into the kernel store, each invoice lives as one control record:

- `record_key`: `managed-billing-invoice:<workspace.id>:<invoiceId>` — requires adding
  `['managed-billing-invoice:', 'managed_billing_invoice']` to `CONTROL_RECORD_PREFIXES` in
  `kernel/store.mjs` so billing records are typed control-plane records and can never be
  read or written through the response-cache APIs (which reject control-plane keys).
- `tenant_id`: `workspace.id`; `status`: the lifecycle status; `plan_hash`: the invoice
  digest hex (satisfies `CONTROL_HASH_RE`); `payload`: the invoice core + current status +
  the append-only `transitions[]` list (each with its proof); `payload_hash`/`revision` as the
  envelope computes today.
- Transitions use `transitionControlRecord(recordKey, expectedStatus, nextPayload)` — the
  existing compare-and-set — so a double "mark paid" or a stale issue attempt fails closed
  (duplicate-safe recovery, the same property the ecommerce gate demands of future adapters).

That storage wiring is intentionally **not** part of this change: it is a kernel change that
should ride with the managed-persistence gates. Until then, the invoice packet JSON produced
by the CLI **is** the record, kept in founder-controlled storage, and its
`proposedControlRecord` block spells out exactly the envelope above so the later wiring is a
transcription, not a design step.

## 5. Upgrade path to automated adapters (later, founder-gated)

The manual rail is the v1 adapter. A future `billing adapter` interface slots in beneath the
same lifecycle without changing the record model:

1. **Adapter contract**: an adapter may only (a) deliver an `issued` invoice to a customer
   channel and (b) *propose* an `issued → paid` transition with machine-collected evidence
   (e.g. a provider webhook reference). The founder approval proof remains mandatory on every
   transition until a separate founder decision explicitly delegates it per-workspace.
2. **Same records, same digests**: adapters emit the identical control-record transitions;
   automation changes who *collects* evidence, never the record shape. This mirrors how the
   ecommerce product treats adapters — manual now, "tax, shipping, and payment adapters only
   behind accountable approval and duplicate-safe recovery" later (`hq/portfolio.json`).
3. **Sequencing**: no adapter work starts before the managed-pilot readiness gates pass
   (`hq/readiness/managed-pilot-readiness.json` — all seven hosted gates are currently
   blocked) and the founder separately approves a billing adapter decision. `payment` stays in
   the readiness forbidden-actions list until that decision.

## 6. Explicitly NOT decided here

- **Price.** No amount for the managed tier exists in this repo, and this design does not
  create one. The config schema forces the founder to supply every monetary value per invoice.
- **Currency mix.** Whether managed billing is MMK-only, USD-only, or mixed is open;
  the model parameterizes `currency` + `exponent` per invoice so any mix works.
- **Tax.** Whether/what tax applies is undecided; the record carries `tax.decided: false`
  until the founder decides, and the tool refuses implicit tax lines.
- **Payment processor.** No processor, gateway, or API integration is chosen or implied.
- **Billing cadence and dunning.** Period granularity is parameterized (`period`); reminder
  or escalation flows are out of scope for the manual rail.

## 7. Minimal manual tooling shipped with this design

`tools/prepare_managed_invoice.mjs` — local CLI, zero network, deterministic, `wx`-writes:

- `node tools/prepare_managed_invoice.mjs --config <config.json> --out <dir>` reads a
  founder-supplied config (schema `supermega.managed-billing.invoice-config.v1`, section 4
  fields), validates fail-closed, and writes `<invoiceId>.json` (packet, status `draft`,
  digest-bound, with the `proposedControlRecord` envelope) and `<invoiceId>.txt` (printable
  invoice carrying the digest). Existing files are never overwritten (`wx`).
- `node tools/prepare_managed_invoice.mjs --verify <packet.json>` recomputes the digest from
  the packet's own invoice core and fails on any mismatch or shape violation.
- `node tools/prepare_managed_invoice.mjs --self-test` runs the built-in test (validation
  rejections including missing/zero/defaulted amounts, deterministic double-build digest
  equality, wx overwrite refusal, verify round-trip) in a temp directory.

npm scripts (standalone; no existing verify chain was modified — the guard-pinned chains in
`package.json` are asserted by substring in `tools/verify_hq_contract.mjs` and stay intact):

- `billing:invoice:prepare` → `node tools/prepare_managed_invoice.mjs`
- `billing:invoice:self-test` → `node tools/prepare_managed_invoice.mjs --self-test`

Because `package.json` is a digest-bound readiness source
(`tools/manage_managed_pilot_readiness.mjs`), this change regenerates
`hq/readiness/managed-pilot-readiness.json` and re-proves `npm run hq:verify`.
