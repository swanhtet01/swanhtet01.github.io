# Billing Rail v1 — Manual-First Design (Gate 9 successor)

Status: design proposal for founder review. Successor to the design on
`origin/design/managed-billing-rail` (commit `3aab5edc`, PR #413) — section 2 states exactly
what is reused and what is superseded. Nothing in this document authorizes sending an
invoice, requesting money, confirming a payment, or granting access. It defines records and
state transitions; every act remains a founder action with evidence.

Gate statement being closed (COORDINATION-BOARD 2026-08-06, rev 12): "Gate 9 (CODE-MISSING):
no billing/payment rail exists for the managed tier — revenue is blocked on this even after
all gates pass." PRODUCT-CATALOG-AND-PRICING.md section 4 sharpens it: `premiumUnlocked`
exists in `showroom/src/core/capability-tiers.ts` with no grant, billing, or entitlement
mechanism behind it — and no consumer wiring anywhere else in showroom.

---

## 1. One-page summary

SuperMega's premium and enterprise tiers cannot take payment. The rails that exist in Myanmar
are manual: KBZPay / WavePay transfer and bank transfer, verified by a human reading a
transfer reference. At the current scale — tens of customers, every one known to the founder —
the correct billing system is not a payment integration; it is a **ledger of founder actions
with evidence**, stored the way this repo already stores everything that matters:
digest-sealed, append-only, fail-closed, server-side.

**v1 in one paragraph.** The founder drafts an invoice packet locally with the (reused)
`tools/prepare_managed_invoice.mjs` CLI — deterministic, digest-bound, no default price or
currency anywhere. That draft is the quote. When the customer agrees, the founder records
`issued` and hands the invoice over out-of-band. The customer pays by KBZPay/WavePay/bank
transfer entirely outside the system. The founder checks the transfer against the named
channel reference and records `billing.payment.confirmed` with the payment evidence (same
proof shape as `commerce.refund.settled`). Then — as a **separate** founder action — the
founder grants premium entitlement on the managed tenant, referencing the paid invoice's
digest. The tenant runtime derives `premiumUnlocked` from that server-side entitlement row;
the client merely receives the flag and `currentCapabilityTier(...)` unlocks premium
capabilities. Revoke, void, and refund-recording are the same machinery run in reverse, each
its own evidenced transition. No price literal ever enters app code; the capability-tiers
no-amount guard is untouched.

**What changes vs PR #413:** storage moves from kernel control records to the managed
tenant's trial-store schema (where the premium runtime can actually read it), and the missing
half — entitlement — is designed. PR #413 stopped at "invoice paid"; a paid invoice that
unlocks nothing does not close Gate 9.

### Founder decision asks (nothing below proceeds without these)

| # | Decision | Options / recommendation |
| --- | --- | --- |
| D1 | **Pricing shape and amounts.** | Three shapes in section 7. Amounts are yours alone; no number appears in this document or in code. |
| D2 | **Payment channels.** | Which KBZPay/WavePay wallets and bank accounts appear on invoices, with the exact labels and references. Config-supplied per invoice, never hardcoded. |
| D3 | **Currency posture.** | Recommend v1 = MMK, integer amounts, exponent 0. The contract stays parameterized (currency + exponent per invoice) so a USD design-partner deal remains possible — but mixing is your call. |
| D4 | **Tax posture.** | Recommend `tax.decided: false` on every v1 invoice and no tax-invoice claims of any kind until you decide otherwise (claims boundary: nothing implies compliance). |
| D5 | **Entitlement lapse policy.** | Recommend NO automatic expiry in v1: you review monthly and revoke manually. Auto-expiry is an automated entitlement change — it would breach the founder-gated rule, so it is out unless you explicitly delegate it later. |
| D6 | **Apply the entitlement-read migration.** | `supabase/migrations/20260818090000_private_trial_backend_v13_billing_entitlement_read.sql` is written, reviewed, and locally verified (`node tools/verify_private_trial_migrations.mjs` green) — exactly the DEVIATION this document called out: one narrow, GUC-scoped, read-only SELECT policy on `billing_entitlements` for the runtime role, nothing on `billing_invoices`/`billing_events`. Not yet proven on a hosted branch and not applied anywhere. Recommend: prove it on a disposable branch (same protocol as v11) before it rides the production runbook alongside v12 — this is the migration that makes `premiumUnlocked` actually resolve true for a granted workspace instead of staying fail-closed dark. |

---

## 2. Relationship to PR #413 (`design/managed-billing-rail`, `3aab5edc`)

**Kept, verbatim or near-verbatim** (this work was sound; do not redo it):

- `tools/prepare_managed_invoice.mjs` — zero-network, deterministic, `wx`-writes, no default
  monetary values, `--verify` and `--self-test` modes. Cherry-pick as-is, with its
  `billing:invoice:prepare` / `billing:invoice:self-test` npm scripts.
- The invoice core schema and contract `supermega.managed-billing.v1` (section 4.1 here
  abbreviates it): founder-assigned `invoiceId`, workspace id under the kernel tenant-id
  rule, integer minor-unit `lineItems`, `amount {currency, exponent, totalMinor}` with no
  defaults, `tax.decided` gate, `paymentChannels[]` limited to
  `bank_transfer | mobile_money | cash` with founder-supplied labels.
- Digest binding: `invoiceDigest = sha256(stableJson(core))` plus `configDigest` of the exact
  config bytes, digest printed on the paper/PDF copy.
- Status lifecycle `draft → issued → paid`, `void` from draft/issued, terminal paid/void.
- The principle set: manual-first, parameterized-never-defaulted, every transition an
  owner-approved evidence record, fail-closed validation, duplicate-safe.

**Superseded, with reasons:**

1. **Storage target.** #413 planned invoices as kernel control records
   (`managed-billing-invoice:` prefix in `kernel/store.mjs`, `transitionControlRecord`
   compare-and-set). Superseded: the kernel console is the wrong trust domain for the record
   that must gate premium serving. The premium runtime (AI order-intake) is served from the
   **managed tenant runtime**, and `capability-tiers.ts` law says entitlement is never stored
   where the device can edit it — the natural home is the tenant's own `app_private` schema,
   which already has immutability triggers, RLS, idempotent commands, and the founder
   activation machinery. The CAS discipline #413 wanted from `transitionControlRecord` is
   reproduced by the trial store's version-guard pattern (section 4.4).
2. **No entitlement model.** #413's lifecycle ends at `paid`. This design adds the
   entitlement half — the actual `premiumUnlocked` grant path — as first-class records.
3. **Currency left fully open.** Kept parameterized in the contract, but this doc pins a
   recommended v1 operating posture (D3: MMK, exponent 0) so the first invoice is not blocked
   on an abstract decision.
4. **Readiness ledger side-effects** (#413 regenerated `hq/readiness/managed-pilot-readiness.json`
   for its package.json change) — re-derive against current main; the branch predates v11.

`payment` stays in `founderDecision.doesNotAuthorize` / `controls.forbiddenUntilReady`
(`kernel/managed-pilot-readiness.mjs`). This design does not move it; shipping this code
changes nothing about what is authorized.

---

## 3. v1 flow end-to-end

```
D1/D2 decided (pricing shape, amounts, channels)                     [founder decision]
   │
   ▼
QUOTE  = draft invoice packet, prepare_managed_invoice.mjs            [founder, local CLI]
   │      deterministic JSON + printable text, digest-bound, status: draft
   │      (renegotiation = void the draft, prepare a new invoiceId — packets are immutable)
   ▼
ISSUE  = billing.invoice.issued event on the tenant                   [founder action]
   │      packet stored server-side; evidence: how it was delivered to the customer
   ▼
PAY    = customer transfers via KBZPay / WavePay / bank / cash        [outside the system]
   │
   ▼
VERIFY = founder checks funds against the named channel reference     [founder action]
   │      billing.payment.confirmed event; evidence carries paymentReference,
   │      channel category, paidAt  →  invoice status: paid
   ▼
GRANT  = billing.entitlement.granted event                            [founder action]
   │      separate from VERIFY by design; references the paid invoiceDigest
   │      entitlement row on tenant: none → granted
   ▼
UNLOCK = runtime derives premiumUnlocked from the entitlement row     [no action; a read]
          session/workspace payload carries the flag; capability-tiers.ts unchanged
```

Reverse paths, each an evidenced founder action: `billing.invoice.voided` (draft/issued),
`billing.entitlement.revoked` (granted → revoked; re-grant later is allowed — every
transition is CAS-guarded and appended, never edited), `billing.refund.recorded` (records
that money moved back, in the settle-refund evidence shape; it does **not** auto-revoke —
revoking service is its own decision).

Two founder actions between "money arrived" and "service on" is deliberate: confirming a
payment is a statement of fact about money; granting entitlement is a decision about service.
Collapsing them would automate an entitlement change the moment a fact is recorded.

---

## 4. Data model — event-sourced, trial-store style

### 4.1 Invoice record

The #413 core, unchanged (contract `supermega.managed-billing.v1`): `invoiceId`,
`workspace {id, name}`, `customer`, `period`, `lineItems[] {description, amountMinor}`,
`amount {currency, exponent, totalMinor}` (sum-checked), `tax`, `paymentChannels[]`,
`issuedToPayBy`, `issuer`, `notes?`. Sealed by `invoiceDigest`. Prices exist only inside
these records and the founder's local config files — config files with real amounts stay in
founder storage (OneDrive), never committed; only digests appear in evidence.

Pattern reused: `stableJson`/sha256 digesting exactly as `kernel/store.mjs` and
`kernel/managed-pilot-readiness.mjs` (`readinessDigest`); bounded-text and exact-keys
validation as `managed_activation.py` (`_exact`, `_visible_text`).

### 4.2 Billing event log (the evidence spine)

Every transition is one append-only event with the repo's canonical proof shape
`{actionId, capturedAt, actor, reason, evidenceReference}` — the same five fields
`commerce_runtime.py` enforces on `commerce.payment.reconciled` and
`commerce.refund.settled` (`_validate_refund_settled`, field-for-field match between event
evidence and the record it changes; billing validators mirror that check).

| Event | Extra payload | Evidence must carry |
| --- | --- | --- |
| `billing.invoice.issued` | full invoice packet + digest | delivery reference (message/handover) |
| `billing.payment.confirmed` | `paymentReference`, channel category, `paidAt` | the transfer/receipt reference the founder verified |
| `billing.invoice.voided` | — | reason |
| `billing.entitlement.granted` | tier (`premium`), `invoiceDigest` of the paid invoice | grant rationale |
| `billing.entitlement.revoked` | tier, reason class | revoke rationale |
| `billing.refund.recorded` | `amountMinor`, channel, `refundReference`, `invoiceDigest` | settle-refund evidence, exactly as `commerce.refund.settled` |

Patterns reused from `app_private.workspace_events` (trial store, migration v6–v10 lineage):
immutability trigger (`workspace_events_immutable` → `billing_events_immutable`),
server-timestamp trigger, `command_id` idempotency with fingerprint
(`TrialIdempotencyConflict` on divergent replay), deterministic command ids via `uuid5` as
`_self_serve_command_identity` does.

### 4.3 Entitlement state

One row per workspace, a **projection of the event log**, never hand-set:

```
billing_entitlements: workspace_id (PK) | tier ('premium') | status ('none'|'granted'|'revoked')
                      | granted_event_id | invoice_digest | revision | updated_at
```

Legal transitions: `none → granted`, `granted → revoked`, `revoked → granted`. Each is a
founder command that appends the event AND advances the row under a version guard in the same
transaction (pattern: `workspace_state_version_guard` / `guard_workspace_state_update`).
A stale or duplicate grant fails closed — the same CAS property #413 wanted from
`transitionControlRecord`, delivered by the tenant schema's existing idiom. Clean, reversible,
replayable from events.

Read path: the runtime consults `billing_entitlements.status` when serving premium endpoints
(fail closed on absence — exactly how the AI intake path fails closed today pending
activation), and the workspace/session payload (`ManagedWorkspaceAccess` /
`TrialReadiness.to_dict` style) carries `premiumUnlocked: true` only when status is
`granted`. `capability-tiers.ts` needs **zero changes**: `currentCapabilityTier({...,
premiumUnlocked})` already exists; the device never stores the decision; the no-price guard
never sees a number.

### 4.4 Tables and RLS posture

Migration v12 adds `app_private.billing_invoices` (invoice_id, workspace_id, status,
invoice_digest, payload jsonb, revision — version-guarded), `app_private.billing_events`
(append-only, triggers as 4.2), `app_private.billing_entitlements` (4.3). Deny-by-default
RLS like every v6+ table: no anon/authenticated access, no member capability reaches billing
(operators must never see or write invoices), writes only via the founder-run path (4.6/6).
Customers receive their invoice as the printable packet, out-of-band — no customer-facing
billing UI in v1.

---

## 5. Deliberately NOT in v1

- **No auto-charge, no processor, no gateway, no provider API.** No KBZPay/WavePay/bank
  integration of any kind; those are delivery channels for humans, not endpoints.
- **No subscription engine.** No recurring schedule, no proration, no plan objects. A month
  of service is one founder-issued invoice; cadence is a habit, not a scheduler.
- **No dunning.** No reminders, no escalation, no automated consequence of non-payment.
  Non-payment is a founder conversation, then (if decided) a founder revoke with evidence.
- **No tax invoicing claims.** Records can carry a founder-decided tax line; nothing claims
  compliance with any tax regime (claims boundary, sales kit).
- **No automatic entitlement change of any kind** — grant, revoke, expiry, or downgrade
  (D5). No customer self-serve purchase path. No prices on the public site ("No prices — the
  public site carries none" stays true).
- **No new currency machinery.** Integer minor units only; no FX, no decimals.

Upgrade path (unchanged from #413 section 5): a future adapter may *deliver* an issued
invoice or *propose* a paid transition with machine-collected evidence — the founder proof
stays mandatory on every transition until a separate founder decision delegates it. Same
records, same digests; automation changes who collects evidence, never the record shape.

---

## 6. Build estimate and placement argument

**The question:** trial-store methods + migration, or a new `workspace_state` surface?

**Answer: dedicated module + migration — the `managed_activation.py` pattern, not the
surface pattern.** The precedent is exact: when the repo needed founder authorization
records, it did NOT add an "activation" surface to `TRIAL_SURFACES`. It gave
`ManagedWorkspaceProvisioner` its own tables (v6 migration,
`20260730113000_private_trial_backend_v6_managed_activation.sql`), direct SQL with advisory
locks, `decision_packet.v1` authorization projections (`_authorization_projection`,
`managed_activation.py:872`), and idempotent replay that byte-compares the stored
authorization against the plan. Billing is the same class of record: **control-plane facts
about the commercial relationship, written by the founder, read by the runtime** — not
operational state written by workspace members.

Why the surface route is wrong here, concretely:

- Surfaces (`company|commerce|production|website|setup`) are member-facing;
  `SURFACE_WRITE_CAPABILITIES` grants them to workspace operators. A `billing` surface would
  need founder-only capability plumbing bolted onto a model built for members — more code to
  prevent access than to grant it.
- `workspace_state` is whole-JSON-per-version operational state. Invoices need per-record
  digest sealing and an entitlement row the premium gate can read in one cheap lookup, not a
  JSON blob replay.
- Touching `TRIAL_SURFACES` ripples through every member path, permission check, and surface
  test; a dedicated module's blast radius is three new tables and one new file.

**Itemized estimate (repo units):**

| Item | Size |
| --- | --- |
| Migration `..._private_trial_backend_v12_billing_rail.sql` (3 tables, triggers, RLS, version guard) | 1 migration, v6-shaped; register in `tools/verify_private_trial_migrations.mjs` |
| `supermega_runtime/billing_rail.py` — `BillingLedger` in the provisioner style: `issue_invoice`, `confirm_payment`, `void_invoice`, `grant_entitlement`, `revoke_entitlement`, `record_refund`, `get_billing_state` (~7 methods, direct SQL, idempotent replay, evidence validation reusing `_exact`/`_visible_text`/proof-shape checks) | roughly half the managed-activation slice; the validation idioms are all imports or copies |
| Trial-store read-path touch: entitlement in the workspace/session payload (one query + one field; `TrialStore` protocol gains `get_entitlement` or `readiness` carries it) | small; the only member-path change |
| Cherry-pick `tools/prepare_managed_invoice.mjs` + npm scripts from `3aab5edc`; regenerate the readiness ledger (package.json is a digest-bound readiness source) and re-prove `npm run hq:verify` | mostly mechanical |
| Showroom plumbing: pass server-supplied `premiumUnlocked` into `currentCapabilityTier` at the call sites that today pass nothing | small; `capability-tiers.ts` itself untouched, guard intact |
| Tests: python suite for `billing_rail` (lifecycle, CAS conflicts, evidence-mismatch rejections, replay), migration verifier, CLI `--self-test` already exists | the usual: tests ≈ the module in size |

Total: comparable to the v6 managed-activation slice — **on the order of one focused working
day of implementation plus one of adversarial verification**, in this repo's demonstrated
cadence. Nothing blocks on hosted credentials until the migration is applied; everything
above it is local, testable, and gate-runnable later with v12 riding the same runbook step
that applies v11.

---

## 7. Pricing shapes — FOUNDER DECISION REQUIRED (D1)

Restated from the sales kit's unapproved tests. None is approved; no amounts exist; choosing
one (or none) is yours. All three produce identical records — the shape only changes what
the line items say, so this decision does not block the build, only the first invoice.

**Option A — Fixed 30-day pilot fee.** One invoice: one workflow, named users, defined
support window, agreed evidence report.
*For:* cleanest evidence loop (one invoice, one payment, one grant, day-30 go/no-go);
matches the pilot-first sales motion; easiest willingness-to-pay signal.
*Against:* no recurring revenue signal; re-quote friction at conversion; risks anchoring the
pilot price as the product price.

**Option B — Setup fee + monthly subscription.** Invoice 1: onboarding effort. Then one
invoice per month of service.
*For:* separates one-time effort from continuing value; the monthly invoice cadence is
exactly what this rail is built for; honest recurring-revenue signal from customer one.
*Against:* commits you to monthly verify-and-grant labor per customer (fine at tens; the
scaling pressure will arrive as invoice count, and that pressure is the trigger for the
adapter decision, not a reason to automate now); a subscription framing invites uptime/term
expectations the claims boundary does not yet permit.

**Option C — Design-partner arrangement.** Discounted or deferred fee for scheduled operator
access and structured feedback; never trading away privacy, approval, or evidence controls.
*For:* strongest fit for customer #1 (the named Shop design partner the readiness ledger
points at); buys the operator access the eval gates need; low price-anchoring risk if
labeled clearly.
*Against:* deferred fee may mean the rail's first real payment confirmation happens late
(consider a nominal non-zero invoice so the full record path is exercised with real money
once, early); feedback obligations need their own written bounds.

Before any number: record delivery hours, support load, hosting and recovery cost, customer
baseline value, currency, taxes, payment method, cancellation terms, and your minimum margin
(sales kit rule). Any quoted figure requires your approval; this design gives that figure a
place to live — a founder-issued invoice record — and nowhere else.

---

## 8. Constraint compliance

- Myanmar rails only (KBZPay/WavePay/bank/cash), MMK integers recommended posture — 3, D2, D3.
- Manual-first, tens of customers, no provider API — 5.
- Founder-gated with actor/reason/reference evidence on every transition — 3, 4.2.
- Digest-sealed, append-only; entitlement server-side on the tenant, never on-device;
  no price literals in app code — 4.1–4.4.
- Reversible entitlement; refund recording via the settle-refund pattern — 4.3, 4.2.
- This document authorizes no send and no charge; `payment` remains a forbidden action in
  the readiness contract until a separate founder decision — 2.
