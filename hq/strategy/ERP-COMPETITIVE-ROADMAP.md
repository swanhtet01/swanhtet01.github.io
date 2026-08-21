# ERP Competitive Roadmap: SuperMega vs Odoo (primary) and SAP Business One (aspirational)

Date: 2026-08-14
Refreshed: 2026-08-19 (factual refresh only — §1 cells and §2 re-verified
against live source after PR #459 (camera barcode scanning, device-local
product photos, Shop mobile task nav, Telegram/TikTok intake channels),
PR #465 (merchant payment QR), and PRs #469/#472 (customer loyalty points
accrual + redemption) shipped to main.)
Re-scanned: 2026-08-20 — see §6, appended below. That section is the current
read on competitive position; where §1/§2/§5 conflict with it, §6 wins. The
2026-08-19 refresh above was written before PR #482 (loyalty tax-spend fix),
#483 (photo-first storefront cards), #484 (Plant visual job board), and #489
(Plant shop-floor scanning) landed, and before any competitor feature set was
re-checked against what those vendors ship today.

**Document status.** `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` (2026-08-19,
amended continuously) is the LIVE feature-gap queue and the document to act
from. Other lanes are editing it and PRs are open against it, so this document
does not duplicate or restructure it. What THIS document is for: the
Odoo/SAP-B1 framing reference (§1-§3), the AI sequencing bound (§4), the
90-day gate list (§5), and now the periodic outside-in competitive re-scan
(§6). Read §6 first; read PRODUCT-SUPREMACY-ROADMAP.md for what to build next.
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
| Point of Sale | Sell surface (portfolio.json shop.surfaces), in-progress counter draft + remembered operator (local-workspace-storage.ts), Cash/KBZPay/WavePay payments (products/shop/business-templates.ts ShopBusinessSamplePayment), daily close with settlement variance (core/shop-daily-close-summary.ts); camera barcode scanning at the counter (core/BarcodeScanButton.tsx, PR #459); phone bottom task nav sharing one tab source with the workspace toolbar (core/commerce-tabs.ts + CoreShell.tsx .mobile-nav, PR #459); merchant payment QR — owner-uploaded static Wave MMQR / MyanMyanPay / KBZPay merchant image shown full-screen at amount-due and on the receipt, display-only, device-local, workspace-scoped, no payment API (core/payment-qr-store.ts, core/PaymentQr.tsx, PR #465); customer loyalty points — opt-in accrual as a pure projection over completed+reconciled orders, redemption as a credit order correction with the `ACT-LOYREDEEM-` actionId prefix, 1 point = 1 MMK of listed credit (core/shop-loyalty.ts, PRs #469/#472) | No receipt printer / cash drawer hardware integration, no per-register sessions. ~~No barcode~~ closed 2026-08-19 (#459). **Superseded in part 2026-08-20 (§6 G2):** "no receipt printer integration" is right, but the framing was wrong. `window.print()` on Android reaches the system print framework, which a third-party ESC/POS print service already serves — what is actually missing is receipt-roll page geometry, a CSS-sized gap, not the whole Web-Bluetooth build | Med → **High**. Of the Myanmar-local POS apps checked on 2026-08-20, every one whose listing states a printing capability names thermal/receipt printing, and Loyverse has added Burmese to its receipt-printing languages — it reads as table stakes in this market, not a nice-to-have (§6.1) |
| Manufacturing | Jobs, good/scrap output, job-linked material consumption, OEE, downtime, machine states, maintenance strategies + corrective actions, CAPA, quality holds, shift close/handoff, equipment master with criticality and commissioning (core/production-workspace.ts, 3,811 lines; plant-oee-summary.ts, plant-downtime-summary.ts; PRODUCTION_QUALITY_CAPA_SCHEMA); Shop->Plant demand and material handoff (core/shop-production-demand.ts, production-material-handoff.ts, shop-production-reconciliation.ts) | No multi-level BOM (verified 2026-08-20: BOM material rows in `core/plant-order-foundation.ts` are a flat per-plan list, no nested plan reference), no routing-based scheduling, no MO costing (portfolio.json plant nextGate explicitly defers costing adapters until correction effort is measured). **Added 2026-08-20:** the due-date job board shipped (#484) but is display-only — Katana's signature is drag-and-drop rescheduling, so this is a narrowed gap, not a closed one (§6.2) | Med. Small factories run jobs, not MRP II; batch genealogy + recall trace + CAPA actually exceed Odoo Community quality tooling |
| Accounting | Deliberately NOT a ledger. Balanced review-only accounting handoff v3, daily close export v3, supplier payables + customer receivables handoffs, close settlement, account-role mapping (payment_clearing, sales_revenue, tax_payable, ... in commerce-workspace.ts lines 22-26, 126); AR/AP aging (core/shop-ar-aging-summary.ts, shop-ap-aging-summary.ts); versioned per-order tax calc, inclusive/exclusive modes | No general ledger, no journal entries, no financial statements, no bank reconciliation. Biggest single parity gap vs both Odoo and SAP B1 | Low-Med for shops (most hand books to an external accountant; a balanced handoff serves that reality better than a GL the owner will not keep), High the day a customer wants statements in-product |
| Website | Brief -> finite reviewable site -> deterministic downloadable file (portfolio.json website.job); leads capture (core/website-leads.ts, website-lead-summary.ts); publish readiness (website-publish-readiness-summary.ts); trade-specific first drafts so owners never face blank boxes (products/website/website-trade-brief.ts) | No hosted publishing or domain connect (owner-gated, portfolio.json website nextGate), thin SEO (one website-seo brief) | Low now. Zero-install download-a-site is the differentiator; hosting is a gate, not a build |
| eCommerce | Storefront from read-only Shop catalogue, recoverable cart, quote, structured order intent into Shop; returns, amendments, cancellations, corrections, delivery reschedules all as accountable intents with customer-safe messaging (products/ecommerce/ecommerce-buying-lifecycle.ts; ENG-130..146 complete, portfolio.json completedLocalAutomations); storefront items render the owner's product photos with artwork fallback (ProductPhoto in products/ecommerce/EcommerceProduct.tsx ~2197, backed by core/product-image-store.ts, PR #459) | No online card/gateway payment (kbzpay_manual is manual-reference, commerce-workspace.ts line 214), no hosted checkout yet | Low. Myanmar buys via bank-app transfer + screenshot; manual KBZPay/WavePay reference IS the local payment model. Hosted checkout is gated, not missing by design |
| CRM | Explicit non-goal ("Duplicate CRM or workflow suite", portfolio.json nonGoals; second-queue-or-crm researchGate: reject). What exists: customer credit policies and reviews (commerce-workspace.ts), repeat-customer and SKU-demand summaries (core/ecommerce-customer-repeat-summary.ts, ecommerce-sku-demand-summary.ts), website leads; customer loyalty points keyed off the existing order `customer` field — deliberately narrow, a points ledger, NOT a reversal of the CRM non-goal (core/shop-loyalty.ts, PRs #469/#472) | No pipeline, no lead scoring, no activity scheduling | Low for shops. Revisit only if a factory sales team becomes a real segment; the rejection gate already defines the reversal condition |
| Purchasing | Purchase requisitions, purchase orders, receipt (portfolio.json shop.job "purchasing and receipt"), supplier sourcing, budget envelopes, replenishment (core/shop-purchase-requisition-summary.ts, shop-purchase-order-summary.ts, shop-supplier-sourcing-summary.ts, shop-budget-envelope-summary.ts) | No RFQ comparison, no supplier price agreements, no formal three-way match | Med. Sourcing comparison matters for hardware/auto-parts trades; requisition->PO->receipt covers the daily loop |

Verdict (2026-08-14, re-graded 2026-08-20 in §6.6 — the re-grade is the
current one): for the first customer (one shop, one owner, one device) the practical
loop -- sell, stock, buy, close, hand to accountant -- is complete and deeper than
an Odoo starter install. The honest gaps are hardware receipt printing (barcode
closed 2026-08-19 via the camera, PR #459; ESC/POS thermal printing remains,
PRODUCT-SUPREMACY-ROADMAP.md S4), GL, and anything requiring a server, which is
gated rather than absent.

---

## 2. Where SuperMega is already ahead

1. Zero-install, offline-first, free-forever. **Partly superseded 2026-08-20 —
   read §6 G1 before repeating the "offline-first" claim in any customer-facing
   copy.** The offline app shell is real (a precaching service worker is
   generated by `tools/write_app_release_metadata.mjs` ~168-215), but its
   precache list covers only `/` plus the assets named in `index.html`, and
   `/shop/` and `/plant/` are served by a lazy chunk (`showroom/src/App.tsx:9`
   → `core/OperationsPageRoute.tsx` → `CoreApp`) that is NOT in that list. Also
   superseded on the comparative half: Odoo 19 POS now ships full offline
   operation with local caching and sync-on-reconnect, and Square enabled
   offline payments on every device in every country — offline selling is no
   longer a thing only we do. What survives as ours is offline selling with no
   account and no server, which neither of them offers. The full product runs from browser
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
   to main). **Downgraded 2026-08-20 (§6.2): this is parity, not a moat.**
   Camera barcode scanning, points-based loyalty, and product photos are each
   shipped by at least one free-tier competitor a Myanmar shop can install
   today. The claim that survives is the *combination* running with no account
   and no server, and the last sentence of this item — which was and remains
   accurate. Do not write items 8's components up as differentiators. Camera barcode scanning through the platform BarcodeDetector API
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

---

## 6. Competitive re-scan, 2026-08-20

Why this section exists: the last full pass was 2026-08-19 and predates PR #482
(loyalty tax-spend fix), #483 (photo-first storefront cards), #484 (Plant visual
job board), and #489 (Plant shop-floor scanning). It also relied on the
competitor feature sets recorded on 2026-08-14. Both halves were re-checked on
2026-08-20: competitor capability against live vendor and market sources,
our capability against live `main` source.

Rule applied, unchanged from the top of this document and inherited by
`PRODUCT-SUPREMACY-ROADMAP.md`: every claim cites a repo file or an external
source, or names the gap outright. **Repo-side claims cite inline; source-side
claims cite §6.7, with access dates and a confidence grade per claim.** The
first revision of this section asserted that competitor capability had been
checked against live sources but printed none of them — caught in review on this
PR, and a real defect: the unsourced claims were exactly the time-sensitive ones
that set the G1/G2 priority order, so nobody could reproduce the scan or tell
when it had gone stale. §6.7 also flags, rather than drops, the claims that rest
on weak evidence. Nothing below was carried over from the
earlier passes without re-tracing. That rule earns its keep — the 2026-08-20
gap-correction pass on `PRODUCT-CATALOG-AND-PRICING.md` found six false gap
claims, three of which were wrong when written rather than merely stale.

This section sets no price and recommends none; pricing is founder-gated
(D1-D5). Competitor commercial *shape* is described (free tier / paid add-on /
hosted-and-consultant); no figures appear here by the same rule that keeps
prices out of `capability-tiers.ts`.

### 6.1 The competitor set was wrong, and that changes the ranking

The 2026-08-19 framing benchmarks Shop against "Loyverse/Square/Odoo/Shopify".
Two of those are not competitors for the buyer we are actually selling to:

- **Square does not operate in Myanmar.** Square card acceptance runs in eight
  countries — US, Canada, Australia, Japan, UK, Ireland, France, Spain — and
  Square states it does not support processing outside them. A Yangon shop
  cannot become a Square seller. Square is a useful *feature benchmark* and
  nothing more; do not treat a Square feature as a competitive threat.
- **TikTok Shop does not operate in Myanmar either.** Local seller access
  exists in 24 markets as of August 2026, none of them Myanmar. This is an
  important negative result: it means there is no TikTok Shop API, order feed,
  or seller centre for us to integrate with, and TikTok commerce in Myanmar
  runs through live video plus DM order collection. Our #459 decision — add
  Telegram and TikTok as **manual intake channel labels** in
  `core/channel-order-intake.ts` and leave the managed AI enum alone — is
  therefore the correct shape and not a placeholder to upgrade later.

Who actually competes for a Myanmar shop owner's install:

| Competitor | What it is here | The commercial shape |
|---|---|---|
| **Loyverse** | The real one. Free core POS app with offline selling and points-based loyalty, an active Myanmar service presence in Yangon, Burmese app interface, and Burmese added to its receipt-printing languages | Free core; employee management, advanced inventory, and extended sales history are paid per-store add-ons |
| **Myanmar-local POS apps** (Yangon POS, MharMal POS, Mini POS, Smart POS, Global Eco Suite) | Burmese-first Android apps with MMK, barcode, low-stock alerts, and thermal-printer support. Shallow back office, no manufacturing, no ledger | Local licence/subscription, local support |
| **Odoo** | Community is genuinely free, open-source, and self-hostable, and **it does cover the whole four-product span** (Sales, Inventory, POS, Manufacturing, Website, eCommerce, Purchase, invoicing) — see §6.3 item 3, which got this wrong once. What Community lacks is the retail and depth layer: **no loyalty/gift cards, no robust offline POS, no official IoT support for printers/scanners/cash drawers, no Barcode or Shopfloor app, manufacturing limited to basic MOs (Work Centers/PLM/Maintenance are Enterprise), and Invoicing rather than full balance-sheet/P&L reporting**. Odoo 19 Enterprise added full offline POS operation, redesigned loyalty, self-order kiosks, and barcodes with embedded price/weight/loyalty | Community free + your own server, sysadmin, and usually an integrator; Enterprise per-user + partner |
| **Shopify / Wix** | Technically reachable from Myanmar, with sanctions-compliance friction and no local acquiring — Shopify guidance for Myanmar sellers points at KBZPay/Wave and COD, not card gateways | Subscription in foreign currency |
| **Katana** | Plant's only real comparator. Shop Floor app, batch tracking, and **drag-and-drop visual production scheduling** | Paid SaaS per user, no free tier |

Two consequences the earlier passes missed:

1. **The Myanmar-local apps are the ones to study, not Square.** They are what
   a shop owner is actually shown by a reseller, and they are Burmese-first and
   thermal-printer-first. Those two properties are exactly our two largest
   verified gaps (§6.4 G1, G2). This is not a coincidence; it is what the local
   market has already priced in as table stakes.
2. **Odoo Community is a weaker competitor than the 2026-08-14 framing assumes,
   and Odoo Enterprise is a stronger one.** The features we shipped this cycle
   (loyalty, offline selling, camera scanning) are precisely the ones Odoo
   *Community* does not have. Against Community we are now clearly ahead on the
   retail layer. Against Enterprise we are at parity on features and ahead only
   on cost, install friction, and offline-without-an-account.

### 6.2 Parity, not moat — say so out loud

Everything in this list shipped this cycle and is good work. None of it is a
differentiator, because a Myanmar shop owner can get each one free or cheap
today. Writing any of these up as a moat would be an overclaim.

| What we shipped | Who else has it |
|---|---|
| Camera barcode scanning (#459, `core/BarcodeScanButton.tsx`) | Loyverse, Odoo, and the Myanmar-local Android POS apps. Odoo 19 goes further: price/weight/loyalty embedded in the barcode |
| Loyalty points (#469/#472/#482, `core/shop-loyalty.ts`) | Loyverse ships points in its **free** tier and markets it as a headline draw. Odoo 19 redesigned loyalty (Enterprise) |
| Product photos (#459/#483, `core/product-image-store.ts`) | Universal. Shopify, Wix, and every local app are photo-first already |
| Merchant payment QR display (#465, `core/payment-qr-store.ts`) | Showing an image is not a capability anyone lacks. MMQR is a Central-Bank-of-Myanmar interoperability standard, not a product feature — Wave, AYA, and others enrol merchants directly |
| Offline selling | Odoo 19 POS now caches menu, customers, and price rules locally with sync-on-reconnect; Square enabled offline payments on all devices in all countries. Loyverse always had it |
| Plant visual job board (#484) | Katana's version is drag-and-drop rescheduling; ours is a display-only due-date board by deliberate scope. On this specific feature we narrowed a gap and are still behind |

The honest summary of the last two days: **we closed a parity deficit, quickly
and cleanly. We did not open a lead.** That is still the right work — the
deficit was blocking demos — but it should be described accurately internally
so the next cycle is spent on things that are actually ours.

### 6.3 What is genuinely differentiated

Each of these was re-checked against live source on 2026-08-20, and no
competitor equivalent turned up in the scan.

1. **Evidence-gated mutation.** Every domain write carries actor, reason, and
   evidence reference and is idempotent on `actionId`; corrections post
   reversals and never edits. No POS or MRP product in the scan records who did
   what, why, and against what evidence, per write.
2. **A general ledger that cannot disagree with operations.** The GL is a pure
   projection over evidence-gated events with no manual journal entry possible
   (`PRODUCT-CATALOG-AND-PRICING.md` §2.1). SAP B1 has automatic postings but
   still permits manual JEs; the structural impossibility is ours.
3. **Four products on one core, with real cross-product handoffs.** Shop↔Plant
   demand, material handoff, and reconciliation (`core/shop-production-demand.ts`,
   `production-material-handoff.ts`, `shop-production-reconciliation.ts`);
   Ecommerce request → Shop order intent; Website intake → Shop. Loyverse and
   Square have no manufacturing at all. Katana has no POS. **Against Odoo,
   however, span is NOT a differentiator and must not be sold as one** — this
   item said "Odoo has the span but only hosted, paid, and integrator-assisted"
   in the first revision of this section, and that was wrong, caught in review
   on this PR. Odoo **Community** is free, open-source, and self-hostable, and
   it includes Sales, Inventory, POS, Manufacturing, Website, eCommerce,
   Purchase, and invoicing-level accounting — the same span, at no licence cost.
   What Community does *not* include, and this is the correctly scoped claim:
   POS offline operation, loyalty and gift cards, official IoT support for
   printers/scanners/cash drawers, the Barcode and Shopfloor apps, manufacturing
   beyond basic manufacturing orders (Work Centers, PLM, Maintenance are
   Enterprise), and full financial reporting — Community gives Invoicing, not
   balance sheet and P&L. So the honest statement against Odoo is: Community
   matches the span and beats us on nothing we care about only if the owner can
   run a server; Enterprise matches us on retail features at subscription cost.
   Our differentiation against either is items 1, 2, 4, 6, and 7 of this list —
   accountability and ownership — plus needing no server, no sysadmin, and no
   account. Note what this correction is: exactly the overclaim §6.2 exists to
   prevent, made in the same document that diagnoses it. It is recorded rather
   than quietly fixed for that reason.
4. **Free-forever as a build-checked invariant.** `FREE_FOREVER` in
   `showroom/src/core/capability-tiers.ts:43` fails the build if a local
   capability is moved behind a tier. Odoo Community is free but needs a server;
   Loyverse's free tier is real but account-bound and cloud-backed, with its
   most-wanted features as paid add-ons. Nobody else has made "we cannot
   paywall this later" mechanically true.
5. **Batch genealogy, recall trace, calibration-gated release, and CAPA in a
   free tier** (`core/production-workspace.ts`). This exceeds Odoo Community's
   quality tooling outright and is a serious answer to Katana's traceability
   positioning.
6. **Encrypted, user-owned, portable backup** (`core/company-backup.ts`,
   600k KDF iterations). The customer can leave with their data. Against
   lock-in-priced ERP this is a sales weapon, not a feature.
7. **Guided samples that structurally cannot fabricate a proof counter**
   (seeding identified by `actionId` prefix). Every competitor's demo data is
   indistinguishable from real data. Ours is provably not.

Note the shape of that list: it is almost entirely about **accountability and
ownership**, not about features. That is the moat. It is also the hardest thing
to put on a comparison grid, which is a distribution problem (§6.6), not a
product one.

### 6.4 Three verified gaps that would change a purchase decision

Ranked by how much each would move a Myanmar shop owner or small-factory owner
from "interesting" to "I will use this". Each was traced to live source on
2026-08-20; each names its size and whether it is founder-gated.

---

**G1 — The operator surface is English. (Largest. Founder-gated on sign-off, not on engineering.)**

Verified state. Burmese script appears in exactly **7 of the app's source
files**: `core/shop-service-scheduling.ts`, `core/i18n-actions.ts`,
`core/shop-ledger-accounts.ts`, `products/shop/business-templates.ts`,
`core/client-onboarding.ts`, `products/plant/business-templates.ts`, and two
characters in `products/website/website-export.ts`. Every one of those except
`i18n-actions.ts` is a **data-layer noun** — a service name, a ledger account, a
trade template — which the header comment in `core/i18n-actions.ts:4-7` states
outright. The bilingual action-verb table added in design phase 2 holds 47
entries, 33 of them `confirmed`, and `bi()` renders English-only for anything
not confirmed. It is imported by two files and called at **four sites total**
(`core/CoreApp.tsx:972`, `core/SettingsPage.tsx:2084/2105/2233`). There is no
language setting anywhere. The counter, the order list, the stock screens, the
close, the error text, and the printed receipt are English.

Why it decides purchases. Loyverse ships a Burmese app interface *and* Burmese
receipt printing, and runs an active Myanmar service presence in Yangon. The
Myanmar-local apps are Burmese-first by construction — MharMal advertises a
fully localised interface and Burmese printing; Mini POS advertises full
Burmese support. A shop owner does not evaluate this; a cashier who cannot read
English simply cannot run the till, and the evaluation ends there. Nothing else
in this document outranks that.

Size. **L** for the whole app. **M** for the slice that matters: the four Shop
bottom-nav work modes (`core/commerce-tabs.ts`), the counter, and the receipt —
i.e. everything a cashier touches, leaving the back office English for now. The
engineering pattern already exists and is safe by design (`bi()` falls back to
English for unconfirmed strings, so a partial pass can never surface an
unreviewed guess).

Founder gate. **Yes, but only on sign-off.** `i18n-actions.ts`'s
`pending_native_review` status requires a native Burmese speaker to check each
string before it renders, and `DESIGN-PROGRAM.md` P3.8 already established that
customer-facing sentences need founder sign-off. The build can be staged
entirely behind that gate: ship the wiring and the table with strings pending,
and flipping statuses becomes a review task rather than an engineering task.
That sequencing is the recommendation.

STATUS 2026-08-21 — batch 1 of the counter slice is wired. Read the limits below
before scheduling anything on it; the short version is that **G1 is not one
review pass from resolved.**

WHAT IS WIRED. 31 drafted full-phrase entries at `pending_native_review` (see
DESIGN-PROGRAM.md "Batch 3 — the counter slice"), covering the four Shop work
modes in both navigations, the counter's headings, states and controls, the
payment-QR dialog, and the receipt dialog's labels and actions. For those,
sign-off is a status flip per line and no call site moves. The counts in the
paragraph above are superseded: the table is 92 entries (47 at the scan, +14
from batch 2, +31 here), still 33 confirmed and now 59 pending, and `bi()` is
called across seven files rather than two.

WHAT IS STILL ENGLISH ON THE COUNTER ITSELF, measured in source after this
batch — this is the part that needs FURTHER BATCHES, not further review:
  - Every `aria-label` and `placeholder` on the counter: "Search or scan SKU",
    "Find or scan an item", "Scan a barcode with the camera", "Add {name} to
    this sale", "Remove one {name}", "Close current sale", "Sales counter",
    "Current sale". `bi()` returns a ReactNode and cannot enter a string
    attribute at all, so these need a different mechanism, not a table entry.
  - Every parameterised string: "{n} in stock", "{n} open orders", "{n} low
    stock", "{n} item/items", "{price} each". Exact-match Option B cannot cover
    these by construction — the design note says so, and this is where that
    limitation actually bites a cashier.
  - Loose text the batch left alone: "optional", the "Guest" placeholder, the
    empty-catalog sentence, and the counter footer's "Confirm to create the
    order. Finish payment and handoff in Orders."
  A Burmese-first cashier after full sign-off of this batch still meets English
  across roughly half the counter's words. That is progress, not resolution.

  MECHANISM DECIDED 2026-08-21, not yet built: `hq/strategy/G1-STRING-MECHANISM-DECISION.md`
  (attributes = 14 sites, not a class; 10 reachable with no new mechanism, and
  the WIRING for them is ungated. Only 1 of the 4 remaining sites is actually an
  accessible name. Parameterised = template-pair entries. Both mechanisms ship
  ahead of sign-off. Two things gate the first CONFIRMED flip rather than the
  build: the numeral-script question, and — because every mechanism computes the
  same flat accessible name — whether a screen reader should read a name in two
  languages. That second one is OVERDUE, not upcoming: 7 already-confirmed
  strings render inside controls on merged main, 4 on the cashier path, so their
  accessible names are mixed-language today. Wants a real-device AT check;
  remediation if negative is a one-line status flip back to pending.)

ALSO NOT CLOSED:
  - Every string is drafted, none is reviewed. Until a native speaker signs them
    off the till reads English, which is the whole point of the gate.
  - The PRINTED receipt is still English and deliberately so — what this app
    prints is the order acknowledgement (an evidence document carrying action
    ids and digests), not a shop's customer slip. A Burmese customer slip is a
    separate artifact this product does not have; see the scope note at the top
    of `ReceiptDialog.tsx`.
  - Back office, Settings, onboarding, Plant, Website and Ecommerce are all
    still English. This is part of the M slice, not the L.
  - No language setting exists and none was added; the reasoning is recorded in
    DESIGN-PROGRAM.md's batch-3 entry.

---

**G2 — Receipts are laid out for a sheet of paper, not a roll. (Cheapest high-value fix. Not founder-gated for the fix; the hardware claim still is.)**

Verified state. `core/ReceiptDialog.tsx:21-46` builds a blob HTML document and
calls `window.print()`. The style block is `body { padding: 1rem 2rem; ... }`
and `@media print { @page { margin: 1cm } }` — **no `size` declaration**, so
the page is whatever the print target defaults to.

Why the existing framing was wrong. `PRODUCT-SUPREMACY-ROADMAP.md` S4 records
this as "fine with OS print services, dead-end for raw-byte thermal printers"
and routes the fix through Web Bluetooth ESC/POS, which is founder-gated on a
hardware test. The 2026-08-20 scan says the practical Android path is the
**system print framework**, which third-party ESC/POS print-service apps
already serve for any app that can print — including a browser. True Web
Bluetooth support for these printers remains limited. So the likely reality is
that our receipts can *already* reach a common Myanmar Bluetooth thermal
printer via an installed print service, and what makes the output unusable is
that it is A4-shaped: centimetre margins and two-rem body padding on a 58mm or
80mm roll.

Size. **S** for the fix — but read the next paragraph before writing the rule,
because the obvious form of it does not work.

**Do not write `@page { size: 58mm auto }`.** This document said that in its
first revision and it is **invalid CSS**, caught in review on this PR. The
`size` grammar is `<length>{1,2} | auto | [ <page-size> || [ portrait |
landscape ] ]` — `auto` stands alone, and a length paired with `auto` is not a
valid production. The parser drops the whole declaration and the sheet geometry
is unchanged, so an engineer copying it would ship something that looks done,
passes every gate, changes nothing on a real printer, and closes the ticket.
That is worse than leaving the gap open. Two valid shapes exist:

- **Recommended: declare no `size` at all.** Set the page margin to near-zero,
  remove the body's horizontal padding, and constrain content width in
  millimetres. On the Android system-print path the media geometry comes from
  the printer the print service selects, so the roll defines the page and the
  document should not fight it. This is also the only form that behaves
  sensibly when the owner prints to an ordinary sheet printer instead.
- If a fixed page is genuinely wanted, the valid form is **two lengths**
  (`size: <width> <height>`). It pins the receipt to a fixed height, so it
  either paginates a long receipt or wastes roll on a short one. Worse default;
  use only if the recommended form is measured to fail.

**The 58mm and 80mm figures in the paragraph above are unverified.** Nothing in
this scan establishes which roll widths Myanmar shops actually run — they are
the common sizes generally, not a sourced finding about this market — and no
SuperMega receipt has ever been printed on a thermal printer at all. Treat roll
width as an owner setting or as something to measure on the founder device
test, not as a constant to hardcode. **S4's Web Bluetooth ESC/POS build
stays FD and stays deprioritised** — it is a large build for the last mile of a
problem a CSS rule may close most of.

Founder gate. **No** for the CSS. **Yes** to *claim* it works: nobody has
printed a SuperMega receipt on a thermal printer. Build it, then ask the
founder for one device test — the same open item S1 and P2 already carry for
the camera. Do not put thermal printing in sales copy before that test.

---

**G3 — "Offline-first" has a hole, and every release re-opens it. (Cheapest of the three. Not founder-gated. Defends the headline claim.)**

Verified state. The service worker is generated in
`tools/write_app_release_metadata.mjs` ~168-215. Its `precacheAll()` caches
`/`, the favicon, the webmanifest, three icons, and then only the
`/assets/...` URLs it can scrape out of the cached `index.html`. Everything
else is cached opportunistically: the `fetch` handler is cache-first for
`/assets/` and populates on demand — **while online**. But `/shop/` and
`/plant/` are not in `index.html`; they are a lazy chunk
(`showroom/src/App.tsx:9` → `core/OperationsPageRoute.tsx`, which re-exports
`OperationsPage` from `CoreApp`). So the till itself is not precached.

Two consequences follow directly from that code:

1. A first-run offline visit to `/shop/` cannot load the till. It fails into
   `core/RouteErrorBoundary.tsx`, whose copy tells the user to reload — advice
   that cannot work offline, because the two causes that file was written for
   (a stale asset hash, a dropped request) are both online failures.
2. **Every release re-opens the hole.** The cache key is
   `supermega-app-${version}`, and the `activate` handler deletes every cache
   whose key is not the current one. After a release, an owner who has not
   re-opened `/shop/` while online has lost the till chunk again.

Why it matters here specifically. Myanmar small business runs through hours-long
power cuts and repeated regional internet blackouts; ISPs there sell
battery-backed CPE precisely for this. "It works when the internet does not" is
our headline claim and the one thing Odoo Community cannot answer. It should be
true on first run and after every release, not only for a device that happened
to visit the right route while connected.

Size. **S-M.** Extend the precache list to the emitted route chunks. Two real
constraints: the install-time payload grows, so it interacts with the artifact
byte budget (`tools/verify_app_build.mjs` ~18858, and note that budget only
trips on a fresh `dist/`); and the asset list must be derived from the build
output rather than hardcoded. Worth pairing with the app-shell skeleton already
identified as the only remaining FCP lever in
`hq/strategy/ANDROID-PERFORMANCE-BASELINE.md`. Needs its own planning pass —
do not blind-implement from this paragraph.

Founder gate. **No.**

---

Everything else the scan surfaced was either already tracked in
`PRODUCT-SUPREMACY-ROADMAP.md` §1, correctly closed, or a deliberate scope call
recorded elsewhere. Notably **not** listed as gaps, having been checked and
found already handled: cash-on-delivery (a first-class payment method across
Shop, Website intake, and Ecommerce —
`products/product-handoff.ts:75`, `core/commerce-workspace.ts:229`), delivery
versus pickup fulfilment, MMK-only pricing (correct for this market), and
TikTok/Telegram channel intake (§6.1).

### 6.5 What we should not build — including the tempting one

The standing non-goals are unchanged: no autonomous processors, no Messenger
bot, no unreviewed external actions, no CRM or workflow-suite duplication
(`portfolio.json` nonGoals). The scan turned up one candidate that violates one
of them and would have been easy to omit quietly, so it is named first.

1. **A Telegram order bot. Tempting, and we should not build it.** The scan
   found that Myanmar Telegram commerce in 2026 runs on group selling plus
   chatbot automation for catalogue browsing, order collection, and payment
   confirmation — and that Telegram and TikTok stay reachable while Facebook
   needs a VPN. That is a real, growing, well-documented channel where we have
   just added intake labels, and a bot is the obvious next step. It is also
   **the Messenger-bot non-goal wearing a different channel's clothes**: an
   autonomous processor taking unreviewed external actions on a customer's
   behalf. Nothing about the channel changes the argument. If chat-channel
   volume becomes the constraint, the sanctioned answer already exists and is
   ranked first in §4 and in `PRODUCT-SUPREMACY-ROADMAP.md` §2 — order intake
   from a **pasted** message, source-quoted, draft-only, human-approved. Paste
   is the feature. The bot is the non-goal.
2. **A TikTok Shop integration.** Not a non-goal violation, just wasted work:
   TikTok Shop has no Myanmar seller market (§6.1), so there is nothing to
   integrate against for the buyer we are selling to.
3. **A KBZPay / WavePay / MMQR payment API.** MMQR interoperability is genuinely
   accelerating small-merchant acceptance and it is tempting to move from
   displaying the owner's QR to taking payment. That is a founder decision about
   becoming a payment participant — merchant agreements, credentials, settlement
   liability — not an engineering slice, and #465's display-only construction
   was the right call. Leave it.
4. **Loyalty → campaigns.** The obvious "next" after points is segments,
   campaigns, and broadcast messaging. That is CRM duplication plus outbound
   messaging, two non-goals at once. The points ledger is deliberately narrow
   and should stay that way.
5. **Multi-level BOM, MRP II scheduling, multi-warehouse.** Still correctly
   out of scope. Small Myanmar factories run jobs, not MRP II, and one-site
   shops do not need locations. Drag-and-drop rescheduling on the #484 board is
   the one Plant item worth revisiting, and only on a real client ask.

### 6.6 The honest verdict: the binding constraint is distribution

The remaining verified product gaps are small. G3 is a precache list. G2 is a
print-media rule. G1 is the only one with real weight, and its engineering half
is a medium slice against a pattern that already exists — its expensive half is
native-speaker review, which is founder time, not build time. There is no
twelve-week feature program standing between this product and a Myanmar shop
that wants it.

What is actually standing in the way is on the other side of the ledger, and
none of it is code: zero managed tenants, zero real leads, zero revenue
(`AI-NATIVE-ARCHITECTURE.md` §5); production activation waiting on one founder
switch (`PRODUCTION-ACTIVATION-RUNBOOK.md`); no price ever approved (D1-D5); the
PG17 rehearsal cascade blocked on a Windows toolchain, not on Supabase access
(CLAUDE.md, gate section); and the per-client founder steps catalogued in
`FOUNDER-BOTTLENECK-STUDY.md`. Meanwhile Loyverse — free, Burmese, offline,
with loyalty — already has a service presence in Yangon. We are not losing on
capability. We are not present.

So: **distribution, with one product precondition.** The precondition is G1. An
English-only till cannot be distributed to Burmese-speaking cashiers no matter
how good the ledger underneath it is, so the counter-surface Burmese slice is
the one build that has to land before distribution effort can convert. G2 and
G3 are cheap enough to ride along in the same cycle. After those three, further
feature work has sharply diminishing returns against the actual bottleneck, and
the next honest thing to do is put the product in front of one real Myanmar shop
— which is founder work, and which §5 items 3, 4, and 9 already describe.


### 6.7 Sources

All accessed **2026-08-20** via web search from an agent sandbox. No competitor
software was installed, purchased, or tested; every capability claim below is a
**documentary** claim about what a vendor or market source says, not an
observation of the software running. Prices are deliberately omitted (§6 preamble).

Confidence grades: **[A]** primary — the vendor's own documentation, help
centre, or release notes. **[B]** secondary — trade press, review aggregators,
or partner/integrator blogs; directionally reliable, individual details may be
wrong. **[C]** weak — app-store listings (vendor self-description, untested),
social pages, or general knowledge with no source located. A **[C]** claim is
kept only where it is flagged in the body text too.

**Square market availability** (§6.1 — underpins removing Square from the
competitor set)
- [A] https://squareup.com/help/us/en/article/4956-international-availability
- [A] https://developer.squareup.com/docs/international-development
- [B] https://squareup.com/us/en/press/square-brings-offline-payments — offline
  payments on all devices in all countries (§6.2)

**TikTok Shop market availability** (§6.1 — underpins "no Myanmar seller
centre, so nothing to integrate with")
- [B] https://dpl.company/countries-with-access-to-tiktok-shop-seller-center/
- [B] https://quicksync.pro/blog/tiktok-shop-countries-where-can-you-sell-and-what-you-need-to-know/
- [B] https://en.wikipedia.org/wiki/TikTok_Shop
- Note: the market list is consistent across three secondary sources but was
  **not** confirmed against TikTok's own seller centre, which is the primary
  source and was not reachable from this sandbox. Grade [B], not [A]. This is
  the weakest link under a §6.1 conclusion, and it is a negative claim
  ("Myanmar is absent from the list"), which is the harder kind to verify.

**Loyverse capability and Myanmar presence** (§6.1, §6.2, and G1's ranking)
- [A] https://help.loyverse.com/help/how-change-language — interface languages
- [A] https://loyverse.town/blogs/entry/113-new-languages-for-receipt-printing/
  — Burmese among receipt-printing languages
- [C] https://apps.apple.com/mu/app/loyverse-pos-point-of-sale/id1070865387 —
  store listing naming Burmese support
- [B] https://www.getapp.com/retail-consumer-services-software/a/loyverse-pos/
  and https://www.posusa.com/loyverse-pos-review/ — free core apps, offline
  mode, points loyalty, paid per-store add-ons
- [C] https://www.facebook.com/loyverse.mm/ — **soft.** The "active Yangon
  service presence" claim rests on Facebook pages operated by a local
  reseller/service provider, not on any Loyverse corporate statement. It is
  plausible and consistent with the Burmese localisation, but it is not firm.
  G1's ranking does **not** depend on it: the Burmese-interface claim carries
  G1 on its own, at [A].

**Odoo edition split and Odoo 19 POS** (§6.1, §6.2, §6.3 item 3)
- [A] https://www.odoo.com/odoo-19-release-notes
- [A] https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale.html
- [B] https://oec.sh/odoo-pricing/community and
  https://theledgerlabs.com/odoo-community-edition-guide/ — Community app set
- [B] https://www.farishtatech.com/odoo-community-edition-pos-point-of-sale-features-required-modules/
  and https://www.odoo.com/forum/help-1/difference-between-enterprise-and-community-for-the-pos-module-220572
  — Community POS limits: no loyalty/gift cards, no robust offline, no official
  IoT
- [B] https://ecosire.com/blog/odoo-19-pos-self-order-loyalty-tip-splitting —
  Odoo 19 offline POS, loyalty redesign, barcode-embedded price/weight/loyalty
- Note: the edition-by-edition module split is drawn mostly from partner and
  integrator blogs rather than an official Odoo feature matrix. Grade [B]. The
  specific claims that matter — Community lacks loyalty and robust offline POS,
  Enterprise added full offline in 19 — are consistent across independent
  secondary sources, but a reader planning to *depend* on the split should check
  Odoo's own pricing page.

**Android ESC/POS print-service behaviour** (G2 — this is what reframes S4)
- [C] https://loopedlabs.com/esc-pos-bluetooth-print-service/ and
  https://play.google.com/store/apps/details?id=com.loopedlabs.escposprintservice
  — a third-party Android print service that renders any printable app's output
  to an ESC/POS Bluetooth printer
- [C] https://whizz-tech.com/support/printers/escpos-web-printing-without-drivers-test-page/
  — browser-to-ESC/POS without drivers
- **Soft, and flagged in G2 itself.** These are third-party app vendors
  describing their own products. Nobody has printed a SuperMega receipt this
  way. G2's *fix* (roll-appropriate print CSS) is worth doing regardless,
  because A4 geometry is wrong for a receipt on any path; G2's *reframing* of
  S4 — "the Android print path may already reach the printer, so the Web
  Bluetooth build is the expensive last mile" — is the part that rests on [C]
  and should be settled by the founder device test before S4 is formally
  deprioritised.

**Myanmar-local POS apps** (§6.1, and the "thermal printing is table stakes"
claim)
- [C] https://play.google.com/store/apps/details?id=com.pyaephyonyo.pos (Mini
  POS — Burmese interface, barcode, thermal printer support)
- [C] https://play.google.com/store/apps/details?id=com.mharmal.possystem
  (MharMal — localised interface and printing, EN + Burmese)
- [C] https://play.google.com/store/apps/details?id=com.yangonpos.mm (Yangon
  POS — MMK and Myanmar language)
- [C] https://globalecosuite.com/
- **All [C]: these are vendor self-descriptions in store listings, not tested.**
  The §1 POS row states the softened form — every listing that mentions printing
  names thermal/receipt printing — rather than "every local app ships it".

**Myanmar payments (MMQR)** (§6.5 item 3)
- [A] https://www.wavemoney.com.mm/media-center/mmqr-with-wave/ and
  https://www.wavemoney.com.mm/partner/myanmar-pay-merchant/
- [A] https://ayapay.com/myanmarpay_mmqr/
- [B] https://en.wikipedia.org/wiki/MyanmarPay

**Myanmar channel reality — Facebook/VPN, Telegram, TikTok** (§6.1, §6.5 item 1)
- [B] https://marketingmyanmar.com/social-media-marketing-in-myanmar-2026-platforms-trends-what-works/
  — TikTok Shop, Telegram group selling with chatbot automation, Messenger
  livestream selling; this is the source behind the non-goal named in §6.5
- [B] https://www.accessnow.org/myanmar-vpn-ban/
- [B] https://restofworld.org/2024/myanmar-internet-blackouts-app-vpn-bans-starlink/

**Myanmar connectivity and power** (G3's justification)
- [B] https://pulse.internetsociety.org/en/shutdowns/events-in-myanmar/
- [B] https://telecomlead.com/broadband/best-isps-in-myanmar-2026-mpt-myanmar-net-atom-power-or-5bb-which-broadband-provider-is-best-for-internet-customers-126031
  — battery-backed CPE sold specifically for outage resilience
- [B] https://asiafoundation.org/wp-content/uploads/2023/12/Myanmar-Adapting-to-Electricity-Shortages-Learning-from-Yangon-Households-and-Small-Businesses.pdf
  — dated 2023; the electricity-shortage pattern is long-running, but treat the
  specifics as historical

**Shopify in Myanmar** (§6.1)
- [A] https://help.shopify.com/en/manual/payments/third-party-providers/payment-gateway-availability
- [B] https://easyappsecom.com/guides/selling-on-shopify-myanmar — sanctions
  friction, no local acquiring, KBZPay/Wave/COD in practice

**Katana** (§6.2, Plant comparison)
- [A] https://katanamrp.com/features/manufacturing/shop-floor-control/ —
  drag-and-drop production scheduling and the Shop Floor app

**Unsourced and marked as such in the body:** the 58mm/80mm roll widths in G2
(general knowledge, no Myanmar-specific source located); the CSS `size` grammar
in G2 is a specification fact, not a market claim, and needs no source beyond
CSS Paged Media.

**Staleness.** The volatile entries are Square and TikTok Shop market lists,
the Odoo edition split, and anything about Myanmar platform access — all four
can change without notice. Re-run this scan before any customer-facing claim is
built on §6, and treat it as stale after roughly one quarter.

---

End of document.
