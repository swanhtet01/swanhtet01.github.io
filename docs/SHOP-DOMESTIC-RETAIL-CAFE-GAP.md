# Shop competitive parity and R&D contract

Status: maintained product contract, 3 November 2026. `CURRENT.md` remains the
only volatile delivery ledger. This document does not authorize publication,
production enablement, spending, credentials, customer contact, or a release
claim.

## Purpose

SuperMega Shop should match the operating reliability merchants reasonably
expect from strong Myanmar/regional products and global POS incumbents, then
differentiate where local merchant needs justify it. Parity means an operator
can complete the task with comparable correctness and recovery. It does not
mean copying every module, matching a marketing checklist, or claiming that a
source-tested capability works on installed hardware.

Evidence advances through these levels:

`source contract -> exact-head CI -> signed artifact -> installed device ->
physical hardware -> merchant acceptance -> production observation`

The weakest required level controls every claim. Vendor documentation below is
benchmark input only; SuperMega has not independently tested those products.

## Benchmark evidence reviewed

| Benchmark | Official material reviewed | Relevant documented behavior |
|---|---|---|
| KMO POS | [Product site](https://kmopos.com/) | Inventory and barcode workflows, multi-unit packaging, split checkout, returns with stock restoration, cashier shift reconciliation, supplier/customer credit records, and backup/restore |
| ZayTap | [Product page](https://www.hextechsoftware.com/zaytap.php) | Online/offline retail operation, orders/receipts/checkout, inventory, multiple staff roles, and reporting |
| Shopify POS | [Offline features](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-features) and [POS permissions](https://help.shopify.com/en/manual/your-account/users/roles/permissions/pos-permissions) | Cash/manual offline selling with explicit limitations; connected returns/exchanges, location-aware order handling, transfers, and granular approval-required permissions |
| Square | [Offline payments](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode) | Explicit pending state, staff permission, transaction limits, merchant risk disclosure, and bounded upload deadline for offline card payments |
| Toast | [Offline mode with local sync](https://dev.toasttab.com/doc/platformguide/platformOfflineModeLocalSync.html) | One local hub, POS/KDS communication over the restaurant LAN, offline payments/receipts with documented topology and feature limitations |
| Lightspeed Retail | [Employee roles and access](https://retail-support.lightspeedhq.com/hc/en-us/articles/229129608-Setting-up-employee-roles-and-access) | Location-scoped roles and granular inventory, counts, purchase-order, vendor-return, transfer, cost, and reporting permissions |
| Oracle Simphony | [Online and offline communication modes](https://docs.oracle.com/en/industries/food-beverage/simphony/19.7/sipou/c_workstation_online_offline_modes.htm) | Distinct peer-connected and isolated offline modes, local transaction storage, and explicit offline reporting limitations |

These pages can change. Revalidate the source and date before turning a gap into
a release requirement or public comparison.

## Pilot parity contract

The following capabilities are required for the agreed two-merchant connected
pilot. `Built` means the current source contains an implementation and focused
tests; it is not installed or merchant proof. Current identities and results
belong in `CURRENT.md`.

| Merchant outcome | Current SuperMega boundary | Required proof before a parity claim |
|---|---|---|
| Fast retail catalog, search, and leading-zero barcode | Built and source-tested; scanner adapters retained | Exact signed artifact, named Android/Windows device timing, repeated scans, lowest supported device, physical scanner separately |
| Correct cash sale, change, immutable receipt, and reprint | Built and source-tested, including duplicate-submission and restart paths | Installed sale/restart/reprint with one financial and stock effect; EN/MY operator observation |
| Inventory movement and final-unit contention | Local stock and default-off connected reservation contracts are source-tested | Two installed devices, final-unit race, cancel/timeout release, restart and reconnect reconciliation |
| Shift open, cash movements, close, and variance | Built and source-tested with explicit close guidance | Installed full-shift journey, drawer totals, restart, export, and merchant reconciliation |
| Encrypted backup and fresh-target restore | Built and extensively source-tested | Exact artifact, fresh target, retained IDs/counts/totals, no duplicate sale/stock/outbox effects, named custodian |
| Cafe table/order, modifiers, kitchen/bar routing, status, and cashier handoff | Device-local and default-off connected contracts exist; some routes require injected entitlement | Separate installed waiter/KDS/cashier devices, LAN outage/restart/lost-reply tests, entitlement evidence, merchant observation |
| Private-Wi-Fi multi-device continuity | Versioned coordinator, pairing, lease, command/event, trusted-time, and recovery foundations are default-off | Pinned TLS, platform key custody, installed coordinator lifecycle, no split brain, exact-once reconnect, signed issuer, two-tenant denial |
| Roles and approval boundaries | Source-tested capabilities and managed-command boundaries exist | Named enrolled identities, revocation, staff-attributed audit, owner approval, installed denial tests, tenant isolation |
| Digital receipts and truthful payment state | Saved receipt and cash/local-wallet records exist; wallet never proves settlement | Installed digital receipt/reprint, payment/print/sync states remain distinct, merchant comprehension |
| EN/MY operation and accessible touch UI | Focused widget/source tests pass | Installed text scaling, TalkBack/Narrator, Burmese operator comprehension, named screen sizes |

Hard pilot exclusions remain deliberate: partial returns/exchanges, split tender,
automatic coordinator failover, multi-site, loyalty redemption, offline correction
authority, and general hardware compatibility. They are gaps, not hidden parity.
Vivian and Swan must explicitly decide whether any gap becomes a pilot gate.

## Expansion parity backlog

These capabilities matter for broader market parity but must not displace the
pilot's money, stock, recovery, identity, and installed-device gates.

| Priority | Capability | Why it matters | Entry test | Current status |
|---|---|---|---|---|
| P0 after pilot | Item-level returns and exchanges with explicit restock | KMO, Shopify, and Lightspeed set a mature retail expectation | Original receipt lineage; partial quantity; price/tax/tender preservation; restock choice; repeated/restarted request is idempotent | **NOT IMPLEMENTED / product decision required** |
| P0 after pilot | Split tender and truthful wallet/cash reconciliation | Common retail/cafe expectation; mistakes affect drawer and settlement truth | Two tenders sum exactly; no tender implies external settlement; reversal and shift totals reconstruct after restart/restore | **NOT IMPLEMENTED** |
| P1 | Purchase orders, suppliers, receiving, transfer, and vendor returns | Required for deeper inventory operations and Lightspeed/KMO parity | Ordered/received/short/damaged states; actor attribution; cost visibility; transfer race; export/restore | **PARTIAL DOMAIN SUPPORT / acceptance not established** |
| P1 | Recipe/BOM depletion and production yield | Cafe and prepared-goods operators need ingredient truth | Versioned recipe, modifier substitution, wastage, negative-stock policy, simultaneous sale, restore | **NOT ESTABLISHED** |
| P1 | Multi-location management and transfer | Global incumbents provide location-aware roles and stock | Explicit tenant/site authority; in-transit stock; conflict handling; no cross-site leakage; per-site close | **OUTSIDE PILOT** |
| P1 | Customer/member lifecycle and controlled loyalty | Repeat-business workflows need identity without weakening privacy | Consent, merge/duplicate handling, expiry/redemption accounting, offline limits, export/delete, tenant denial | **IDENTITY/CARD FOUNDATION ONLY; redemption NOT PROVEN** |
| P2 | Accounting/export connectors and reconciliation | Reduces duplicate bookkeeping | Immutable export version; retry-safe delivery; mapped accounts; period lock; exception queue; no autonomous posting | **EXPORT EXISTS; connectors NOT IMPLEMENTED** |
| P2 | Hardware breadth | Merchants expect scanners, printers, drawers, scales, and payment devices | Named model/firmware/transport, failure/recovery, EN/MY output, supported matrix | **INTERFACES RETAINED; PHYSICAL EVIDENCE NOT RUN** |

## Enterprise engineering standard

Competitive feature breadth is not sufficient. A release must satisfy these
engineering contracts:

1. **Money and stock correctness:** immutable originals, idempotent commands,
   atomic command/event/projection/stock/audit/ack effects, explicit uncertainty,
   no last-write-wins for financial conflicts.
2. **Offline clarity:** show internet, LAN/coordinator, lease, sync, backup,
   payment, and print states separately. State exactly what stops and what keeps
   working. No silent authority downgrade.
3. **Recovery first:** crash points before commit, after commit/before reply,
   and after reply loss; encrypted backup; fresh-target restore; retained event
   and acknowledgement identity; rehearsed forward-fix rollback.
4. **Identity and isolation:** named users, least privilege, device enrollment,
   revocation generation, tenant/site binding, two-tenant denial, no raw bearer
   token over the LAN, no raw payment/customer payload in diagnostics.
5. **Supply-chain integrity:** exact source/tree/toolchain/artifact identities,
   reviewed migrations, dependency and secret gates, signed promotion artifacts,
   SBOM/provenance where supported, no stale evidence reuse.
6. **Operability:** bounded logs and metrics without merchant content, health
   and queue age, backup age, sync/conflict status, actionable incident owner,
   restore and support runbooks.
7. **Performance and accessibility:** named-device p50/p95/p99, realistic 1k
   and 10k catalogs, four-hour soak, 48dp targets, text scaling, keyboard,
   TalkBack/Narrator, and native-reader Burmese review.
8. **Release discipline:** default-off incomplete capability, one exact
   candidate, independent review, progressive pilot rollout, stop conditions,
   and evidence-bound claims.

## Differentiation and R&D portfolio

R&D does not weaken the pilot gates. Every experiment starts with synthetic or
consented data, a deterministic baseline, an owner, a bounded budget, a
falsifiable hypothesis, and a stop condition. AI may propose; it must not
autonomously mutate money, stock, prices, authority, settlement, or published
merchant content.

### Near-term differentiators

| Hypothesis | Safe first experiment | Success evidence | Stop condition |
|---|---|---|---|
| Myanmar-first setup can beat generic global onboarding | EN/MY resumable wizard for template, catalog, staff, practice sale, printer check, and backup confirmation | Lower operator correction time and successful teach-back on two consented pilots | Operator cannot explain offline/payment/backup boundaries or needs staff to recover |
| Local-first connected operation can provide stronger continuity than cloud-only POS | Default-off coordinator on one site with visible pause, signed lease, pinned TLS, explicit replay/conflict handling | Installed WAN-loss/LAN-intact journey, exact-once reconnect, restore, zero unexplained variance | Split brain, silent role downgrade, unbounded conflict, or unrecoverable coordinator loss |
| Recovery transparency can be a premium product feature | Persistent receipt-bound completion and backup/sync health states | Operators distinguish saved/payment/print/sync states and recover without another sale | State language causes duplicate action or hides uncertainty |

### Bounded AI research

| Research lane | Guarded prototype | Required evaluation before product entry |
|---|---|---|
| Catalog intake assistant | OCR/voice/photo proposes item name, unit, barcode and category into a reviewable draft | Field-level precision/recall, correction time, Burmese readability, no invented price/unit, explicit human save |
| Replenishment assistant | Deterministic reorder baseline plus optional forecast using sales/lead-time history | Backtest against baseline, stockout/overstock cost, uncertainty display, never auto-orders |
| Variance investigator | Explainable candidate causes for stock/cash discrepancies using local audit events | Known synthetic incidents, ranked evidence links, false-positive rate, no accusation or mutation |
| Bilingual receipt/support copilot | Draft plain-language EN/MY explanations from source-owned status codes | Native-reader review, factuality, privacy, clear escalation; no promise of settlement or SLA |
| Menu/catalog normalization | Suggest duplicate items, units and modifier mappings | Accepted mapping rate and correction burden against deterministic importer; ambiguous mappings rejected |

### Longer-horizon systems research

- Cryptographically verifiable offline receipts and event-chain checkpoints for
  dispute resolution, without exposing customer/payment content.
- Privacy-preserving cross-merchant benchmarks using aggregated, thresholded
  metrics only after a reviewed consent and re-identification threat model.
- A separately approved coordinator-failover protocol. The current pilot
  intentionally has no automatic election; safe failover requires a formal
  fencing/consensus design and installed partition testing.
- An extension SDK for accounting, delivery, ecommerce and payment adapters
  with capability-scoped permissions, deterministic retries and conformance
  tests. No plugin receives raw authority by default.

## Review cadence and decision rule

At each release checkpoint:

1. Reconcile the matrix against the exact candidate and `CURRENT.md`.
2. Promote a row only when its named evidence level advances.
3. Compare the first failed merchant outcome, not total feature count.
4. Admit at most one new parity gap and one bounded R&D experiment per cycle.
5. Stop or defer work that lacks an observed merchant problem, owner,
   acceptance test, rollback, or capacity.
6. Never describe a roadmap item, vendor claim, source test, emulator run, or
   unsigned artifact as installed or merchant-proven parity.
