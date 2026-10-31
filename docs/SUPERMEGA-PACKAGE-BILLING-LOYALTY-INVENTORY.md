# SuperMega package, billing, membership, and agent inventory

Status: source inventory, 24 October 2026. This document approves no price,
provider, migration, public offer, or production activation.

## Package direction

The current proposal is:

- **Starter:** Shop POS, catalog, stock, receipts, basic reporting, encrypted
  backup; member card and points only after the native identity/ledger contract
  is implemented and verified.
- **Growth:** advanced loyalty, promotions, insights, staff controls, and
  multi-location only as each capability earns evidence.
- **Custom/Enterprise:** separately scoped Sites/Ecommerce, integrations, and
  support with server-enforced tenant entitlements.

Monthly and annual are billing variants, not different capability claims. No
quota, numeric price, renewal promise, or package availability is approved.
Shop remains offline-first; this proposal does not create a shopper login or
online checkout system.

## Billing boundaries

| Boundary | Verified state | Evidence |
| --- | --- | --- |
| Merchant pays SuperMega | Founder-operated immutable invoice/payment/refund/void and premium grant/revoke rail; payment is recorded only after out-of-band verification | `supermega_runtime/billing_rail.py`, billing migrations v12/v13, `tools/prepare_managed_invoice.mjs`; 65 billing/entitlement tests and 20 invoice self-checks pass |
| Logged-in billing history | Partial source projection | `BillingLedger.get_billing_state()` now emits an allowlisted `merchantSummary`: workspace-bound invoice status, sealed amount, due date, refunded/outstanding totals, and pending-manual versus confirmed-out-of-band payment state. It exposes no founder actions, customer contact, channel reference, evidence or provider claim. No authenticated merchant endpoint or screen exists yet; receipt, package term and renewal remain explicitly unavailable. |
| Package enforcement | Partial | Product activation grants and capability intersection are server enforced. Billing has only a generic `premium` grant; invoice lines do not bind a package, add-on, term, or capability matrix. |
| Paid AI order intake | Guarded locally | `supermega_runtime/trial_runtime.py` now requires the exact authenticated workspace's active premium grant before the provider call. Absent, wrong-workspace, and revoked grants fail 403 with zero provider calls; 4 focused tests pass. |
| Merchant receives customer payment | Separate local record | Native cash/KBZPay/WavePay records and wallet recovery are merchant-recorded tender state, never SuperMega subscription billing or provider-confirmed settlement. |

Static plan badges are presentation only. `capability-tiers.ts` and managed
identity labels do not authorize paid actions. Server readiness and immutable
workspace entitlement remain the authority.

## Member cards and loyalty

| Capability | State |
| --- | --- |
| Native durable member identity | Missing. Native sales contain no customer/member key. Held-ticket names are free text. |
| Member barcode/QR card | Missing. Native scan resolves product barcode/SKU only; payment QR is not member identity. |
| Browser loyalty | Partial, device-local. It projects points from completed/reconciled Commerce orders using a mutable customer-name string. |
| Redemption | Partial browser post-sale credit correction, not a native checkout discount. Existing action ID supplies replay identity. |
| Refund/reversal effect | Partial. Browser adjusted value reduces accrual; native audited full-sale reversal has no points clawback. Partial/item refunds remain deferred. |
| Offline conflict safety | Sale/correction primitives are idempotent, but loyalty settings are per-device and multi-register consistency is unsupported. |
| Backup/export | Browser backup includes local loyalty settings. Native backup has no member tables. The operational CSV reference has no member/points fields. |

Before native points UI or tables, define a stable workspace-bound member
contract: opaque member ID, versioned non-PII card payload, leading-zero-safe
scanner input, tamper/duplicate/foreign-workspace/stale rejection, and backup
round-trip. The later points ledger must append auditable earn/redeem/clawback
events, bind each sale/reversal exactly once, forbid double redemption, and
state an explicit safe offline conflict rule. Mutable names cannot be authority.

`tools/shop_member_loyalty_reference.mjs` now makes that boundary executable as
a **reference contract only**. It uses a versioned, non-PII, workspace-bound
member token and an append-only earn/redeem/full-sale-clawback projection. It
rejects stale cards, replay, double earning, double clawback, overspend, foreign
workspaces, sequence gaps, and multi-writer redemption without coordination.
The synthetic HMAC test key is not production key management, the token is an
identifier rather than redemption authority, and no native table, UI, backup
integration, package entitlement, or production signing key exists yet.
`single_writer_offline` is a caller assertion in this reference, not a proven
device lease or register epoch; production redemption must not rely on it until
the native storage boundary can establish exclusive authorship. Exact command
retry behavior is defined by the reference append helper, but durable atomic
storage remains unimplemented.

## AI-agent operations inventory

Existing controls are sufficient for the current lane; no new framework is
approved:

- Cloud is the sole integration writer; delegated reviewers are read-only by
  default. Consequential actions remain human-owned (`AGENTS.md`).
- Twelve role definitions are dormant by default; the operating ceiling is one
  active assignment, one specialist, one batch job, and one agent per cycle
  (`hq/NOW.md`, `hq/AGENT-TEAM-PLAN.md`).
- Dynamic and recursive delegation are disabled in the retained team plan.
- Hosted model work requires the gateway's tenant budget reservation and
  company daily ceiling; durable-spend mode must commit the reservation before
  a model call (`hq/research/durable-workflows-comparison-2026-08.md`).
- Agents may draft, test, summarize, and propose. They do not deploy, publish,
  pay, send customer messages, change access, or mutate production by
  implication.
- Recovery ownership remains with the named technical/operations owners and
  the applicable runbook. Current credential-owner metadata was not reverified
  by this source-only inventory.

## Next bounded work

1. Expose the reviewed merchant-safe billing projection only through an
   authenticated exact-workspace account endpoint and read-only hub screen.
   Enforce merchant role/capability checks; loading, empty, denial and failure
   states must not reveal founder commands or cross-tenant existence.
2. Bind approved package/version/term and invoice lines to server-enforced
   capabilities before any Starter/Growth/Custom UI becomes authoritative.
3. Land and review the member identity/card contract before native loyalty
   storage, then require pinned Flutter tests before calling loyalty ready.
4. Keep Shop sale/stock integrity, operational export, backup/restore, signing,
   hardware evidence, and merchant acceptance ahead of broader packages.
