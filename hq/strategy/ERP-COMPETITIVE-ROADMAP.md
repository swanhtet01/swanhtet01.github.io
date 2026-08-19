# ERP Competitive Roadmap: SuperMega vs Odoo (primary) and SAP Business One (aspirational)

Date: 2026-08-14
Refreshed: 2026-08-19 (factual refresh only — §1 cells and §2 re-verified
against live source after PR #459 (camera barcode scanning, device-local
product photos, Shop mobile task nav, Telegram/TikTok intake channels),
PR #465 (merchant payment QR), and PRs #469/#472 (customer loyalty points
accrual + redemption) shipped to main. The LIVE feature-gap queue is now
hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md (2026-08-19); this document remains
the Odoo/SAP framing reference.)
Author: R&D Codex
Status: analysis (no deploy, write, or gate change authorized by this document)
Market: Myanmar small shops and factories first. Practical beats complete.
Sources: hq/portfolio.json, showroom/src/core/ (616 modules, 454 *brief* analytics
files), showroom/src/products/{shop,plant,website,ecommerce}, kernel/README.md,
hq/strategy/AI-NATIVE-ARCHITECTURE.md, hq/strategy/SELF-SERVE-ONBOARDING-SPEC.md,
hq/research/order-intake-agent-evaluation-2026-08.md,
hq/research/enterprise-capabilities-design-2026-08.md

Rule for this document: every claim cites a repo file or names the gap outright.
Current honest state (AI-NATIVE-ARCHITECTURE.md sec 5): zero managed tenants, zero
real leads, all four products release-candidate-local (portfolio.json), 7 hosted
gates blocked, three founder decisions received.

---

## 1. Feature parity vs Odoo Community

Legend: MM = does the gap matter for a Myanmar shop/factory (High/Med/Low).

| Odoo module | SuperMega today (file-grounded) | Gap vs Odoo | MM |
|---|---|---|---|
| Sales | Full order lifecycle confirmed->preparing->ready->completed/cancelled with payment, refund, return, correction, credit-decision, promotion, shipping, and versioned tax state per order (core/commerce-workspace.ts, 10,390 lines; 29 shop-order briefs); channel intake across Messenger/Viber/Telegram/TikTok/Phone (core/channel-order-intake.ts `channelOrderChannels`; Telegram + TikTok added PR #459 — manual intake only, the managed AI enum stays unextended until its golden-set eval reruns); counter sale draft (supermega.shop.counter_draft.v1, core/local-workspace-storage.ts) | No printable quotation document flow, no price lists, no salesperson attribution, MMK single currency only | Low. Myanmar shops sell in MMK at counter or via chat; quote docs exist on the Ecommerce side (quote -> Shop order intent) |
| Inventory | Available-stock counts, movements, replenishment with reorderAt, inventory risk profile, catalog import/baseline (core/shop-inventory-foundation.ts, shop-replenishment.ts, shop-inventory-movement-summary.ts, shop-catalog-import.ts); camera barcode scanning on the counter search and both catalog SKU fields via the platform BarcodeDetector API, zero added dependencies, keyboard-wedge path unchanged as fallback (core/BarcodeScanButton.tsx, PR #459); device-local product photos per SKU, IndexedDB with downscale-on-ingest (core/product-image-store.ts, core/ProductPhoto.tsx, PR #459) | No multi-warehouse/locations, no lots/serials in Shop (Plant has batch genealogy + recall trace: PRODUCTION_BATCH_GENEALOGY_SCHEMA, PRODUCTION_RECALL_TRACE_SCHEMA in core/production-workspace.ts), no landed cost. ~~No barcode scanning~~ closed 2026-08-19 (#459) | Med. Barcode (mini-marts, pharmacies) shipped; multi-warehouse rarely matters for a one-site shop |
| Point of Sale | Sell surface (portfolio.json shop.surfaces), in-progress counter draft + remembered operator (local-workspace-storage.ts), Cash/KBZPay/WavePay payments (products/shop/business-templates.ts ShopBusinessSamplePayment), daily close with settlement variance (core/shop-daily-close-summary.ts); camera barcode scanning at the counter (core/BarcodeScanButton.tsx, PR #459); phone bottom task nav sharing one tab source with the workspace toolbar (core/commerce-tabs.ts + CoreShell.tsx .mobile-nav, PR #459); merchant payment QR — owner-uploaded static Wave MMQR / MyanMyanPay / KBZPay merchant image shown full-screen at amount-due and on the receipt, display-only, device-local, workspace-scoped, no payment API (core/payment-qr-store.ts, core/PaymentQr.tsx, PR #465); customer loyalty points — opt-in accrual as a pure projection over completed+reconciled orders, redemption as a credit order correction with the `ACT-LOYREDEEM-` actionId prefix, 1 point = 1 MMK of listed credit (core/shop-loyalty.ts, PRs #469/#472) | No receipt printer / cash drawer hardware integration, no per-register sessions. ~~No barcode~~ closed 2026-08-19 (#459) | Med. Paper receipt printing is expected in urban shops; the remaining hardware gap is ESC/POS thermal printing (PRODUCT-SUPREMACY-ROADMAP.md S4, founder device test required) |
| Manufacturing | Jobs, good/scrap output, job-linked material consumption, OEE, downtime, machine states, maintenance strategies + corrective actions, CAPA, quality holds, shift close/handoff, equipment master with criticality and commissioning (core/production-workspace.ts, 3,811 lines; plant-oee-summary.ts, plant-downtime-summary.ts; PRODUCTION_QUALITY_CAPA_SCHEMA); Shop->Plant demand and material handoff (core/shop-production-demand.ts, production-material-handoff.ts, shop-production-reconciliation.ts) | No multi-level BOM, no routing-based scheduling, no MO costing (portfolio.json plant nextGate explicitly defers costing adapters until correction effort is measured) | Med. Small factories run jobs, not MRP II; batch genealogy + recall trace + CAPA actually exceed Odoo Community quality tooling |
| Accounting | Deliberately NOT a ledger. Balanced review-only accounting handoff v3, daily close export v3, supplier payables + customer receivables handoffs, close settlement, account-role mapping (payment_clearing, sales_revenue, tax_payable, ... in commerce-workspace.ts lines 22-26, 126); AR/AP aging (core/shop-ar-aging-summary.ts, shop-ap-aging-summary.ts); versioned per-order tax calc, inclusive/exclusive modes | No general ledger, no journal entries, no financial statements, no bank reconciliation. Biggest single parity gap vs both Odoo and SAP B1 | Low-Med for shops (most hand books to an external accountant; a balanced handoff serves that reality better than a GL the owner will not keep), High the day a customer wants statements in-product |
| Website | Brief -> finite reviewable site -> deterministic downloadable file (portfolio.json website.job); leads capture (core/website-leads.ts, website-lead-summary.ts); publish readiness (website-publish-readiness-summary.ts); trade-specific first drafts so owners never face blank boxes (products/website/website-trade-brief.ts) | No hosted publishing or domain connect (owner-gated, portfolio.json website nextGate), thin SEO (one website-seo brief) | Low now. Zero-install download-a-site is the differentiator; hosting is a gate, not a build |
| eCommerce | Storefront from read-only Shop catalogue, recoverable cart, quote, structured order intent into Shop; returns, amendments, cancellations, corrections, delivery reschedules all as accountable intents with customer-safe messaging (products/ecommerce/ecommerce-buying-lifecycle.ts; ENG-130..146 complete, portfolio.json completedLocalAutomations); storefront items render the owner's product photos with artwork fallback (ProductPhoto in products/ecommerce/EcommerceProduct.tsx ~2197, backed by core/product-image-store.ts, PR #459) | No online card/gateway payment (kbzpay_manual is manual-reference, commerce-workspace.ts line 214), no hosted checkout yet | Low. Myanmar buys via bank-app transfer + screenshot; manual KBZPay/WavePay reference IS the local payment model. Hosted checkout is gated, not missing by design |
| CRM | Explicit non-goal ("Duplicate CRM or workflow suite", portfolio.json nonGoals; second-queue-or-crm researchGate: reject). What exists: customer credit policies and reviews (commerce-workspace.ts), repeat-customer and SKU-demand summaries (core/ecommerce-customer-repeat-summary.ts, ecommerce-sku-demand-summary.ts), website leads; customer loyalty points keyed off the existing order `customer` field — deliberately narrow, a points ledger, NOT a reversal of the CRM non-goal (core/shop-loyalty.ts, PRs #469/#472) | No pipeline, no lead scoring, no activity scheduling | Low for shops. Revisit only if a factory sales team becomes a real segment; the rejection gate already defines the reversal condition |
| Purchasing | Purchase requisitions, purchase orders, receipt (portfolio.json shop.job "purchasing and receipt"), supplier sourcing, budget envelopes, replenishment (core/shop-purchase-requisition-summary.ts, shop-purchase-order-summary.ts, shop-supplier-sourcing-summary.ts, shop-budget-envelope-summary.ts) | No RFQ comparison, no supplier price agreements, no formal three-way match | Med. Sourcing comparison matters for hardware/auto-parts trades; requisition->PO->receipt covers the daily loop |

Verdict: for the first customer (one shop, one owner, one device) the practical
loop -- sell, stock, buy, close, hand to accountant -- is complete and deeper than
an Odoo starter install. The honest gaps are hardware receipt printing (barcode
closed 2026-08-19 via the camera, PR #459; ESC/POS thermal printing remains,
PRODUCT-SUPREMACY-ROADMAP.md S4), GL, and anything requiring a server, which is
gated rather than absent.

---

## 2. Where SuperMega is already ahead

1. Zero-install, offline-first, free-forever. The full product runs from browser
   storage with no account and no server write (AI-NATIVE-ARCHITECTURE.md 3.1);
   capability-tiers.ts encodes FREE_FOREVER as a checked invariant -- a local
   capability can never be retroactively paywalled, and a guard asserts no price
   appears in the file. Odoo needs a hosted instance; SAP B1 needs a consultant
   engagement. Trial user growth costs zero marginal server spend.
2. Evidence-gated actions and accountable operators. Every mutation carries an
   action proof (CommerceActionProof, ProductionActionProof), the behavior trail
   is a registered store (core/behavior-trail.ts), and external side effects are
   FORBIDDEN_ACTIONS until separately approved (SELF-SERVE-ONBOARDING-SPEC.md
   sec 5). Neither competitor records who did what with a frozen payload hash.
3. Per-trade packs. 8 shop templates (mini-mart, pharmacy, phone-electronics,
   fashion, hardware, tea-coffee, auto-parts, restaurant --
   products/shop/business-templates.ts), 6 service packs with Burmese display
   names (core/shop-service-scheduling.ts), 5 plant industry packs
   (core/plant-industry-packs.ts), and website drafts derived from the trade the
   shop already declared (website-trade-brief.ts). First value in minutes, in
   the owner's own trade language.
4. The brief/analytics lattice. 454 *brief*.ts modules plus ~60 summary
   projections in showroom/src/core/ compute AR/AP aging, OEE, close variance,
   sales velocity, demand, and cross-product pulse directly from the operating
   record, on device, with no BI server. Odoo sells dashboards; SAP sells
   HANA-backed reporting. SuperMega ships the lattice free because it is pure
   projection code.
5. Myanmar-first correctness. MMK everywhere (totalMmk fields throughout
   commerce-workspace.ts), KBZPay/WavePay as first-class payments, Burmese
   script in the AI fixture corpus (order-intake-agent-evaluation fixtures
   3-6), Burmese pack names carried without invalidating saved workspaces.
6. The AI-agent operating model. The company itself runs on budgeted,
   draft-only, approval-gated agents (kernel/README.md: gateway tiers,
   durable UTC-day budget reservation, 15 validated crews idle by default,
   ClickUp as the only approval-backed write). This is both a structural cost
   advantage and the delivery rail for every future in-product AI feature.
7. Encrypted user-owned backup. Passphrase-encrypted portable snapshot with
   600,000 KDF iterations and strict size bounds (core/company-backup.ts).
   The customer can leave with their data; that is a trust weapon against
   lock-in-priced ERP.
8. Hardware-free counter capture (added in the 2026-08-19 refresh; all shipped
   to main). Camera barcode scanning through the platform BarcodeDetector API
   with zero added dependencies and the keyboard-wedge path intact as fallback
   (core/BarcodeScanButton.tsx, PR #459); device-local product photos with
   downscale-on-ingest, shown on inventory rows, counter tiles, and the
   Ecommerce storefront (core/product-image-store.ts, PR #459); display-only
   merchant payment QR at amount-due — no payment API, workspace-scoped so two
   companies on one browser can never show each other's QR
   (core/payment-qr-store.ts, PR #465); and loyalty points whose balance is a
   pure projection over settled orders and whose redemption is a credit order
   correction, so refunds reverse structurally and managed sync needs zero
   server change (core/shop-loyalty.ts, PRs #469/#472). Odoo POS delivers the
   equivalent counter loop only with a hosted instance plus paired hardware;
   here it runs on the owner's phone, offline, free.

---

## 3. The enterprise checklist ("enterprise level", concretely)

| Requirement | Repo capability today | Gate / gap |
|---|---|---|
| SSO / MFA | Not present. Sessions are one-use tenant codes -> role-scoped HttpOnly cookies with owner revocation (kernel/README.md, agent-company-operator-auth) | kernel/README.md Next step 2: SSO/MFA only after first delivery proof, where a tenant requires it |
| Audit trail | Strong local: action proofs on every mutation, behavior trail store, append-only supermega_control_transitions, digest-based verified statements (core/enterprise-verified-statements.ts, sha256 verification records) | Hosted immutability unproven until managed persistence rehearsal passes |
| RBAC | Built, gated: 10 staff roles cashier->owner with required-authority schema (core/enterprise-staff-roles.ts); RLS on every managed table, browser roles denied (AI-NATIVE-ARCHITECTURE.md 4.3) | enterprise-capabilities researchGate Tier 2: staff-roles requires verified-statements proven in production plus a named operator |
| Backup / restore | Local: encrypted company backup + restore + device reset covering all registered keys (core/company-backup.ts, local-workspace-storage.ts) | Hosted: storage/recovery proof is one of the 7 blocked gates (managed-pilot-readiness); restore on managed tenant unproven |
| SLAs | Internal operator targets only: queue p90, execution p90, evaluation coverage -- explicitly "not a contractual customer SLA" (kernel/README.md) | Contractual SLA requires the durable dispatcher, alerts, and real tenant volume (kernel Next step 3); do not promise before then |
| Data residency | Best possible today by accident of architecture: trial data never leaves the device. Hosted: one Supabase project, single region | Stage 3 regional design opens only on a measured residency requirement through researchGates (AI-NATIVE-ARCHITECTURE.md 3.3) |

Honest summary: "enterprise level" is a sequenced ladder already designed
(verified-statements -> staff-roles -> shared-workspace, portfolio.json
enterprise-capabilities gate), not a checkbox sprint. Nothing on this ladder
should ship before the managed persistence rehearsal, because every tier
depends on hosted proof. SAP B1 parity is aspiration, not a 90-day target.

---

## 4. AI-native roadmap: what AI should do FIRST for a shop owner

Bound by the ai-assistance gate (portfolio.json sharedCapabilities): server-only
golden-set evaluation, provenance, zero side effects, human review, measured
correction effort BEFORE any interactive capability. Surfaces are fixed: choose
approved input -> review source-backed draft -> approve or discard.

Ranked by practicality:

1. Order Intake from chat (design complete, evaluate gate). Paste a Messenger/
   Viber/WhatsApp message, get a draft Shop order where every field quotes the
   source text and ambiguity is flagged instead of guessed
   (hq/research/order-intake-agent-evaluation-2026-08.md; 20-fixture golden set
   covering Burmese script, mixed script, ambiguous quantity, "same as last
   time"). This attacks pure transcription overhead in the channel Myanmar
   commerce actually uses. First and only until its eval passes.
2. Daily close owner brief (new candidate, needs a researchGate entry). Draft a
   plain-language end-of-day narrative from data that already exists on device:
   close settlement variance (shop-daily-close-summary.ts), AR aging
   (shop-ar-aging-summary.ts), exceptions (shop-order-exception-summary.ts).
   Zero new data collection, read-only input, draft-only output; the internal
   ceo-operating-brief.ts pattern proves the shape. High trust value: the owner
   checks the numbers against their own till.
3. Replenishment draft (after 1 passes). Turn shop-replenishment.ts reorder
   signals plus sales velocity (shop-sales-velocity.ts) and supplier sourcing
   (shop-supplier-sourcing-summary.ts) into a draft purchase requisition for
   review. Never a sent PO -- purchasing writes stay behind the approval path.

Non-goals restated: no autonomous processors, no Messenger bot, no unreviewed
external actions (portfolio.json nonGoals; order-intake eval "What this is not").

---

## 5. 90-day priority list

Tags: [product] / [platform] / [gate]. FD = requires a founder decision.

1.  [platform][gate] FD-approved: execute the bounded preview-branch rehearsal
    (v8-v10 + browser quarantine, 24h lifetime, delete after evidence) per
    hq/readiness/managed-pilot-readiness.json. Unblocks everything hosted.
2.  [platform][gate] FD: on green rehearsal, propose the production migration.
    On red, fix locally and repeat; production stays untouched.
3.  [shop][platform][gate] FD (infra only): wire claim-code -> self-serve tenant
    provisioning per SELF-SERVE-ONBOARDING-SPEC.md step D. Blocked until the 27
    advisor findings clear and quarantine is applied hosted; ship the
    this-sprint client items (door copy, terms field, activation request) now.
4.  [shop][gate] Run the five-day order-to-close + return-exception evidence
    plan on tenant #1 (portfolio.json shop nextGate); baseline auto-measured,
    operator self-named per the self-serve gate redefinition.
5.  [ai][gate] Run the Order Intake golden-set evaluation server-only against
    the 20-fixture corpus; record correction effort. No operator exposure
    until pass (portfolio.json ai-assistance nextGate).
6.  [ecommerce][gate] Prove cart -> Shop handoff and customer-safe
    acknowledgement on protected preview + isolated tenant (priority 95,
    ENG-146 done, portfolio.json ecommerce localAutomation).
    **Decision, recorded 2026-08-17 (was previously an unowned gap — a company
    review flagged that local-mode's checkout-to-Shop handoff limitation had
    no tracked fix owner anywhere):** the LOCAL-mode limitation (checkout
    drafts travel as one-shot navigation state, so Shop's persistent request
    inbox never receives them off-device) is deliberately NOT being fixed on
    its own. The managed-mode path above is the real answer — a persistent,
    multi-session request needs a server-side inbox, which local mode
    structurally cannot offer without becoming a different product. Building
    a local-mode-only patch (e.g. writing the draft into the same
    localStorage key Shop reads) would work for a single device/browser but
    would silently break the moment the customer and the shop operator are on
    different devices, which is the common case this gap actually matters
    for — so a local patch would trade a visible gap for an invisible one.
    Tracked here explicitly so it reads as a scope call, not an oversight;
    revisit only if local-mode Ecommerce becomes a real go-to-market surface
    on its own (currently it is not — Ecommerce's stated wedge in
    `PRODUCT-CATALOG-AND-PRICING.md` is the Shop-connected storefront).
7.  [plant][gate] FD (tenant approval): one order-bound OEE window with named
    operator and supervisor; reconcile exact downtime source before any
    costing adapter (portfolio.json plant nextGate).
8.  [platform][gate] Activate enterprise Tier 1 verified-statements on the
    managed tenant once storage proof exists (enterprise-capabilities gate
    sequence); Tier 2 staff-roles only after Tier 1 is proven in production.
9.  [shop] Accountant field test: put one real accounting-handoff v3 export in
    front of one real accountant; measure corrections. This is the cheapest
    way to validate the no-GL bet before anyone asks for a ledger.
10. [platform][gate] FD (PII review): implement the adopted analytics gate --
    no-PII MetricEvent, aggregate schema approval, device-reset key clearing
    (portfolio.json researchGates: analytics) -- so tenant triggers in
    AI-NATIVE-ARCHITECTURE.md sec 5 fire on data, not guesses.

Items 1-4 are the critical path; 5 can run in parallel today because it is
server-only and spends no hosted gate. Nothing above authorizes a deploy,
push, provider write, or production change (hq/NOW.md remains authoritative).

---

End of document.
