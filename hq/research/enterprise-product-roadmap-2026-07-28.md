# SuperMega enterprise product roadmap

Status: implementation authority for product-depth sequencing, not a claim that every module is live.

## Product rule

SuperMega is one business system with four focused products. Complexity belongs in shared records, state transitions, controls, and integrations; the operator interface should still show one next task, a small number of modules, and progressive disclosure.

The integrated operating loops are:

1. Website or Ecommerce interest -> Shop review -> order -> stock -> fulfilment -> payment status -> close.
2. Shop demand -> Plant plan -> material issue -> output -> quality release -> Shop available stock.
3. Shop shortage -> purchase -> receipt -> location or lot -> order allocation.
4. Product exception -> responsible owner -> evidence -> approval -> recovery -> audit trail.
5. Client profile -> industry blueprint -> product templates -> data preview -> accountable activation -> measurable pilot.

## Verified implementation baseline - 2026-07-29

This roadmap is now split between controls that exist in the product and capabilities that remain sequenced. Do not create a second module for an implemented lifecycle.

- **Client preparation:** five business presets, one-to-four product selection, shared client/owner/topology, product-specific CSV preview and correction, a digest-bound private package, local installation, and one evidence mission per selected product are implemented. Internal preparation can start either from an existing data-free setup kit or one private folder containing an exact `client.json` profile and selected product CSVs; missing selected CSVs remain explicit sample fixtures. The CLI and Settings installer fail before writes on invalid, oversized, stale, unselected-file, split-authority, or tampered packages. Checkpoint `ac61fd84` moves successful browser Create and Update directly to the unique next-demo action and retains stable focus for loaded kits. Checkpoint `d9acb58f` gives Reset and Restore one exact bounded record registry, excludes auth and managed identity, and removes the duplicate restore action. Checkpoint `efb1ccad` adds a v4 setup baseline: v1-v3 workspaces migrate conservatively, progress preserves the baseline, blueprint changes reset it, and only accountable product evidence recorded strictly after setup can prove a mission. Local and live desktop QA prove fresh setup at zero, counter-only Shop at zero, one fully prepared, reconciled, and completed order at one, reload persistence, and reset/recreate back to zero. Import correction, idempotent replay, and setup-kit export also pass live; mobile, managed persistence, and activation do not.
- **Shop:** order intake, allocation, location/lot stock, fulfilment, reconciled payments, immutable per-order payment terms, customer credit-policy revisions with limit/term/hold enforcement, receivables aging, append-only collection-contact history, effective-dated tax, correction notes, multi-part returns with disposition, refund evidence, supplier purchase orders with partial receipt/cancellation, accepted-versus-rejected receiving discrepancy evidence, daily close, counted settlement variance, and a balanced correction-aware accounting-review export with source-document traceability are implemented. External posting, filing, lending, automated collection, payment, refund, and supplier-return execution remain absent by design.
- **Plant:** reviewed BOM/routing, material and capacity checks, exact Shop issue handoff, routed WIP/time, output/scrap, inspection/hold, attributed rework/corrective action, reinspection/release, recurrence-linked problem CAPA, genealogy, effectiveness/OEE, standard-versus-actual MMK cost, and versioned work-centre calibration evidence are implemented. New v3 controlled plans block release, routed work, direct reinspection after failure, and rework without current calibration; legacy v1/v2 plans remain readable.
- **Website:** structured local editing, responsive preview, evidence review, approval, artifact binding, and local release history exist. A hosted domain/TLS promotion and measured live lead-analytics loop are not proven.
- **Ecommerce:** Shop-backed catalog projection, merchandising, cart/quote, versioned customer/contact and delivery-address snapshots, request receipt, Shop confirmation, request-to-order status, exact-contact order history, payment state, safe reorder-at-current-catalog, and completed-order return request-to-Shop review are implemented. Identity snapshots are digest-bound through local recovery and the managed Shop inbox; they do not yet constitute a hosted customer account or governed address book. A return request persists with exact order, SKU, quantity, customer reason, and evidence; Shop remains the only authority that records received goods, stock disposition, or refund evidence. Provider payment, carrier shipping, tax adapter, hosted identity governance, general support cases, and abuse recovery are not proven.
- **Workspace recovery control:** `supermega.workspace_recovery.v1` now creates one read-only, workspace-scoped, deterministic package for memberships, product state, immutable events, and approvals. It requires an explicit recovery-admin role, rejects cross-workspace rows and credential-shaped fields, refuses overwrite races, verifies per-section and whole-package digests offline, and produces a no-write restore plan. Hosted restore execution, encrypted portable custody, retention, and recovery-time evidence remain unproven.
- **Cross-product Home:** one read-only Today queue projects real local Shop balances/orders/stock, Plant issues/holds/jobs, Website readiness, and Ecommerce requests into one ranked next action per product. Product records retain all write authority; setup and activation controls are collapsed until requested.

The next enterprise slices must close the following true gaps inside existing task surfaces:

1. **Shared managed foundation:** isolated tenant, RLS, durable commands, hosted restore execution, encrypted custody/retention, observability, and role/capability proof. The local workspace export and restore-plan contract is implemented, but these hosted proofs still gate every integration claim.
2. **Shop control depth:** company/location account determination, supplier debit/physical-return execution, warranty/service case, automated collection only behind an approved external boundary, and an owner-approved duplicate-safe posting adapter. Customer credit-policy revisions, order-time limit/term/hold enforcement, and correction settlement roles are implemented and must not become another module.
3. **Plant control depth:** due-dated post-close CAPA effectiveness review and trend escalation, maintenance-to-order linkage, WIP valuation projection, training/document control, and governed recall execution remain. Item/BOM/routing effective dates, material return/substitution, recurrence-linked quality-problem CAPA, and a read-only multi-level batch recall trace/export are implemented; neither control blocks inventory, contacts customers, issues certificates, or decides a recall.
4. **Website hosted lifecycle:** exact-domain preview promotion, TLS/domain proof, rollback execution, consented lead attribution, and privacy-safe conversion reporting.
5. **Ecommerce post-request lifecycle:** Shop-reviewed shipping/tax/payment adapters, a hosted customer account/address book with consent, merge, retention, and deletion controls, general support cases, and abuse/rate-limit recovery. Versioned identity snapshots, shared request/order status, safe reorder, and the accountable return request-to-Shop record loop are implemented and should not become another module.
6. **Cross-product reporting:** the four-product Today queue, managed-state projection, permission-filtered exceptions, saved views, digest-bound exports, and counts-only shared registry projection are implemented without new top-level navigation. The registry preserves existing Shop inventory, Commerce, Plant, Website, and Ecommerce record authorities for customer, supplier, item, unit, currency, tax, account, location, lot, serial, and document identities. Managed registry persistence, governed cross-product master mutations, duplicate-resolution workflow, and client-facing reconciliation remain.

## Shared enterprise foundation

Every product should reuse these foundations instead of rebuilding them:

- Tenant, workspace, branch, location, role, and capability identity.
- Client, supplier, item, service, unit, tax, currency, location, lot, serial, and document master data.
- Versioned command and event records with optimistic concurrency, exact replay, human approval, evidence, and recovery.
- One import engine with column matching, dry-run totals, correction queue, duplicate control, provenance, and reversible activation.
- Global search, saved views, task inbox, exception routing, notifications, comments, attachments, and audit timeline.
- Myanmar-ready language, MMK, phone, address, payment-review, low-bandwidth, mobile, print, barcode, and offline-recovery behavior.
- Reporting dimensions, dashboards, exports, scheduled reports, API/webhook boundaries, observability, retention, backup, and restore.
- AI assistance only where it produces a source-backed draft, recommendation, explanation, or anomaly for human review.

## Shop

### Operating lifecycle

Lead or channel message -> customer and quote -> order -> availability and allocation -> pick or service -> fulfil -> payment status -> return or refund -> daily close -> accounting export.

### Module map

1. Sell and POS: visual counter, barcode, variants, units, discounts, taxes, receipts, split tender, suspended carts, shifts, cash drawer, offline queue.
2. Omnichannel orders: walk-in, phone, Messenger, Viber, Website, Ecommerce, preorder, wholesale, approval, promise, fulfilment, follow-up.
3. Catalog and pricing: categories, variants, bundles, price lists, customer tiers, promotions, effective dates, tax classes, images, lifecycle status.
4. Inventory and warehouse: locations, bins, lots, serials, ATP, reservation, transfer, count, adjustment, expiry, reorder, valuation projection.
5. Purchasing: requisition, supplier quote, purchase order, receipt, discrepancy, return-to-vendor, landed-cost evidence, supplier performance.
6. Customer operations: customer master, addresses, consent, credit terms, loyalty, membership, appointments, service history, support cases.
7. Payments and finance control: payment status, reconciliation, credit, refund approval, receivables aging, close, export to accounting.
8. Returns and after-sales: return authorization, reason, disposition, restock, replacement, warranty, service case, customer follow-up.
9. Workforce and branch operations: roles, shifts, targets, commissions, till responsibility, branch transfer, opening and closing checklist.
10. Insight: sales, margin projection, stock turns, fill rate, dead stock, supplier lead time, channel conversion, exceptions, audit.

### Implemented finance boundary

Checkpoint `369cb2b` adds `supermega.commerce.accounting-handoff.v1` inside the existing Last close disclosure. It derives balanced debit and credit control totals from the immutable close, groups debits by payment method, separates accepted sales revenue from legacy-unverified revenue, retains exception references, neutralizes spreadsheet formulas, and binds the artifact to the source-close digest. Account roles remain deliberately unmapped, status is `review_required`, posting authority is `none`, and no external accounting write occurs.

Checkpoint `39b7fc2` adds `supermega.commerce.order-calculation.v2`: append-only human-reviewed tax-code revisions, basis-point rates, inclusive or exclusive whole-MMK calculation, and immutable code/rate/mode snapshots on each future order. The compact control stays inside Close and exceptions; managed actor/time is server authoritative, old orders retain their original revision, and daily-close rows expose the frozen tax evidence without customer data.

Checkpoint `d47f5d9` upgrades that artifact to `supermega.commerce.accounting-handoff.v2` and adds append-only, human-reviewed mappings for payment clearing, accepted revenue, legacy-unverified revenue, and tax payable. Each close uses only a mapping effective before its close timestamp, so later configuration never rewrites historical exports. Mapping codes are explicit and source-owned; SuperMega still performs no external posting and retains review-required status.

Checkpoint `b738d05` adds immutable credit and debit correction notes inside completed Shop orders. Each note binds the original order-calculation digest, reuses its frozen tax revision/code/rate/mode, derives whole-MMK net/tax/total deterministically, preserves the original invoice and payment truth, caps credits at the current corrected balance, and carries accountable actor/time/reason/evidence. Stale reviews, reused IDs, backdating, malformed tax snapshots, post-close corrections, unrelated-state changes, and forged posting claims fail closed in browser and managed runtimes. Daily-close export advances to `supermega.commerce.daily-close-export.v2`, retains original and corrected totals plus minimized correction evidence, and corrected closes deliberately produce no accounting handoff until an approved adjustment-account and settlement adapter exists.

Checkpoint `479802b` makes every new tax revision a reviewed schedule with an explicit jurisdiction code and future effective time. Browser and managed runtimes choose only the newest revision effective at the accountable order time; pre-effective orders retain the prior revision, while the immutable order and correction snapshots carry exact jurisdiction and effective-time evidence. Legacy tax records remain readable but cannot be created anew. `supermega.commerce.daily-close-export.v3` exposes the frozen fields without customer data. This is configuration evidence only: it does not determine a legal rate, branch jurisdiction, filing, settlement account, or external posting. A measured core-app split reduces the largest JavaScript chunk from 484,817 to 295,449 bytes.

The current local finance checkpoint advances the review artifact to `supermega.commerce.accounting-handoff.v3`. A corrected close preserves the original payment-clearing entry, then records balanced sales-adjustment, tax, correction-receivable, or correction-payable lines against the immutable source order and correction document. New mappings require seven reviewed roles; historical four-role mappings remain readable and leave only the newer correction roles explicitly unmapped. The CSV remains deterministic, formula-safe, customer-minimal, review-required, and incapable of external posting. This closes the correction-settlement-account gap without adding a page or a second ledger.

Checkpoint `032dee49` fixes the downstream payment-truth boundary. `supermega.commerce.close-settlement.v2` counts the original reconciled payment while carrying net order value and correction receivable/payable separately; its exact invariant prevents a credit note that moved no money from disguising a cash shortage. Historical v1 settlements stay readable under their original rule. `supermega.commerce.daily-close-export.v4` now digest-binds the settlement lines, and `supermega.commerce.accounting-handoff.v4` exposes the same expected, counted, variance, net, receivable, and payable values beside source-order and correction-document entries. The next bounded finance slice is reviewed company and operating-location scope so a close cannot silently mix books before any posting adapter is considered.

Checkpoint `552ed20a` makes supplier discrepancies part of the existing Stock receiving review. One receipt separates accepted units from rejected units, requires a damaged/wrong-item/quality-failed reason, retains return-to-vendor disposition, closes delivered quantity without adding rejected units to stock, and feeds supplier accepted/rejected/defect metrics. Browser and managed runtimes reject incomplete discrepancy fields, unsupported dispositions, over-delivery, and cross-event mutation. This is accountable receiving evidence, not a supplier message, shipment, debit note, payment, or physical return claim.

This follows the enterprise pattern in current SAP guidance: tax codes are configuration records, while account-determination rules take configured document or organization fields as inputs and produce ledger accounts in a defined evaluation order. SuperMega must not invent a Myanmar rate, hidden default, or G/L account. The current seven-role mapping, review-only correction ledger, and effective-dated jurisdiction schedule are bounded layers, not a claim of complete condition-based account determination. The next finance slices require company/location and tax-code conditions plus an owner-approved duplicate-safe posting adapter before any posting claim.

Primary references: [SAP Configuration: Tax Codes](https://help.sap.com/docs/SAP_BUSINESS_BYDESIGN/0635ec3491974ad988be05d6b1dcf734/2d0f85c6722d101492eddec9ab33f6ec.html?locale=en-US), [SAP Configure Account Determination](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/f63dd39a28bb4b90adbf9e608aff58ea/f709ce5243afff25e10000000a4450e5.html), [SAP Revenue Account Determination](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/7b24a64d9d0941bda1afa753263d9e39/a270b6535fe6b74ce10000000a174cb4.html?locale=en-us), and [SAP S/4HANA Tax Codes](https://help.sap.com/docs/SAP_S4HANA_ON-PREMISE/238f821691174c1d9df721487e44deb0/3d7ec2531bb9b44ce10000000a174cb4.html).

### Template packs

- Retail and wholesale: POS, price tiers, purchasing, warehouse, returns, branch close.
- Cafe and restaurant: menu/modifiers, table or queue, kitchen ticket, preparation, handoff, wastage, close.
- Spa and salon: services, appointments, rooms, staff assignment, packages, commission, retail stock.
- Gym: memberships, recurring dues, check-in, classes, trainer schedule, retail stock.
- School: students, fee plans, attendance, classes, supplies, guardian contact.
- Social seller: message intake, catalog, order promise, delivery review, payment status, follow-up.

## Plant

### Operating lifecycle

Demand -> forecast or plan -> BOM and routing -> material and capacity check -> release -> execute -> inspect -> record output and scrap -> genealogy -> cost and variance -> shift close.

### Module map

1. Demand and planning: demand intake, MPS, MRP, finite-capacity view, priorities, constraints, reschedule evidence.
2. Product engineering: item versions, BOM, formula or recipe, routing, work instructions, approvals, effective dates, change control.
3. Production orders: release, operation queue, WIP, start/pause/complete, labor and machine time, output, scrap, rework.
4. Materials: reservations, issue, return, substitution approval, backflush, lot selection, shortage and Shop warehouse handoff.
5. Quality: incoming, in-process, final inspection, specifications, sampling, hold, deviation, CAPA, release, certificate.
6. Traceability: supplier lot -> material issue -> operation -> output lot or serial -> customer fulfilment, with recall search.
7. Maintenance: asset hierarchy, meter, preventive plan, work request, downtime, parts, repair, test, return to service.
8. Performance: availability, performance, quality, OEE, yield, cycle variance, downtime reasons, bottleneck, schedule attainment.
9. Cost control: standard material/labor/overhead, actual consumption, variance, scrap cost, WIP valuation projection.
10. Workforce, safety, and shift: skills, authorization, roster, handoff, incident, permit, checklist, escalation.
11. Compliance: calibration, document control, training evidence, retention, audit, lot genealogy export.
12. Insight: plan attainment, throughput, WIP age, first-pass yield, downtime, maintenance compliance, cost variance.

### Template packs

- General manufacturing, assembly, batch/process, food and beverage, apparel, and regulated quality/traceability.
- Each pack changes terminology, required master data, routing pattern, quality plan, dashboards, and acceptance tests without forking the core state model.

Checkpoint `3c87a842` makes a failed v3 inspection a real quality hold. Direct reinspection is rejected until the exact failed inspection has one attributed rework record with routing operation, rejected quantity, actual minutes, owner, cause, corrective action, proof, and current work-centre calibration. Rework time becomes actual routed time and therefore affects cost variance; only a later full passing reinspection can clear the hold. This is a controlled corrective-action gate, not a claim of a complete cross-batch CAPA recurrence program.

Checkpoint `8155e4b3` adds `supermega.production.quality-capa.v1` to the existing Problems workflow. New actionable quality problems cannot close without a stable failure mode, controlled cause category, verified root cause, corrective action, effectiveness evidence, and named owner. A deterministic Unicode-safe key links exact earlier CAPA records from immutable history in browser and managed runtimes; missing or forged links fail closed. This is recurrence classification and accountable closeout, not a due-dated post-close effectiveness review, trend escalation, batch release, inventory block, customer action, or certificate.

## Website

### Operating lifecycle

Brief -> information architecture -> content and assets -> responsive edit -> review -> approval -> artifact -> release -> lead capture -> analytics and iteration.

### Module map

1. Site and page structure: page tree, reusable sections, navigation, redirects, metadata, versioning.
2. Design system: brand tokens, typography, color, spacing, components, responsive rules, dark/light variants.
3. Content: structured copy, services, team, proof, FAQ, blog/news, legal pages, localization, scheduled publishing.
4. Assets: images, documents, alt text, crop, optimization, rights and expiry evidence.
5. Conversion: forms, calls, chat links, lead routing, spam protection, consent, source attribution, Shop handoff.
6. SEO and discovery: metadata, canonical URLs, sitemap, robots, structured data, social cards, search preview.
7. Quality: accessibility, performance budgets, broken links, safe destinations, mobile review, browser checks.
8. Release: environment, domain, TLS, preview, approval, immutable artifact, rollback, release history.
9. Analytics: privacy-safe events, goals, campaign attribution, funnel, content performance, export.
10. Governance: roles, comments, approval, evidence, audit, backup, restore, retention.

### Template packs

- Business presence, lead generation, catalog showcase, services, restaurant, school, real estate, professional firm, and campaign landing.

## Ecommerce

### Operating lifecycle

Shop catalog projection -> merchandising -> storefront -> cart -> customer and delivery intent -> price/payment review -> request receipt -> Shop confirmation -> status -> return or support.

### Module map

1. Catalog projection: Shop-owned SKU, availability, price, variants, media, collections, search, filters.
2. Merchandising: featured products, landing collections, badges, bundles, recommendations, content blocks, schedule.
3. Cart and checkout: multi-line cart, quantity rules, address, pickup, delivery zone, notes, consent, recoverable draft.
4. Pricing: price list, promotion, coupon, minimum order, wholesale break, tax and fee projection with Shop revalidation.
5. Customer: profile, address book, order history, reorder, wishlist, notification preferences, support request.
6. Payment review: method choice, manual or provider status, failure/retry, reconciliation evidence; no payment claim before connection proof.
7. Shipping and pickup: method, zone, fee, promise, slot, tracking handoff, exception and proof of fulfilment.
8. Returns and support: request, reason, evidence, Shop review, status, refund boundary, replacement.
9. Channel and marketplace: social links, campaign source, product feed, order intake adapter, webhook and idempotency controls.
10. Insight: traffic, product view, add-to-cart, request completion, Shop confirmation, fulfilment, repeat customer, abandonment.
11. Trust: policies, consent, privacy, fraud/risk review, rate limits, abuse controls, audit and recovery.

Checkpoint `4b8e4204` adds one validated read-only lifecycle projection over Ecommerce requests and their linked Shop order (`sourceRecordId`). The existing checkout now shows waiting, confirmed, preparing, ready, completed, or cancelled state, plus Shop payment state and promise evidence. Exact-contact history remains in the existing buying surface. Reorder reuses current Shop price and availability, skips unavailable lines with an explicit warning, and only prepares a new cart. Duplicate request IDs, malformed recovered requests, or multiple linked Shop orders fail closed; no parallel Ecommerce order ledger was added.

The current local candidate closes the first return loop inside that same buying surface. A customer can choose an exact completed Shop order line, remaining quantity, condition, and bounded reason. The request is stored under the existing digest-chained browser recovery, rejects orphan source requests, and opens the matching Shop return editor with its evidence. Shop review may change the stock disposition while retaining the request; a changed SKU or quantity drops the source binding. Ecommerce derives the recorded returned quantity from Shop and no longer labels exact recorded evidence as waiting. No refund, payment, stock, message, or order write runs from Ecommerce.

The current identity candidate replaces the overloaded free-text checkout reference with separate customer name, Myanmar phone, address line, township, city, and optional delivery instructions. Immutable versioned profile and address snapshots are digest-bound to the quote, request, browser recovery, managed Shop inbox, and Shop draft; address changes retain their prior revision while exact retries reuse it. Delivery requires a complete address, pickup forbids one, and nested identity tampering fails closed. This is workflow evidence, not a login, consent record, deduplicated customer master, hosted address book, or provider call.

### Template packs

- Social storefront, pickup/preorder, wholesale request, standard retail, subscription/replenishment, and limited campaign drop.

## Delivery levels

- Level 0 - believable sample: coherent synthetic data, complete happy path, mobile/desktop, reset and recovery.
- Level 1 - useful local product: real local records, imports, state transitions, reports, export, audit, and no fake external claims.
- Level 2 - managed pilot: isolated tenant, identity/RLS, durable commands, backup/restore, support runbook, measured operator evidence.
- Level 3 - production SaaS: billing, observability, SLOs, incident response, verified integrations, migration, retention, disaster recovery.
- Level 4 - enterprise: multi-entity, localization, advanced controls, configurable workflows, extension APIs, data warehouse, compliance packs.

No module moves up a level until its data authority, lifecycle, failure path, recovery, permission model, and acceptance tests pass at that level.

## Sequencing

1. Use the implemented internal client-demo blueprint and private-package path with founder-selected CSVs; do not build another setup surface.
2. Complete one measured quote-to-close pilot across Website/Ecommerce/Shop and one plan-to-stock pilot across Shop/Plant.
3. Use the implemented workspace package to rehearse an owner-approved isolated restore, then prove tenant security, recovery-time/point evidence, and durable commands before provider, hosted publish, or external posting work.
4. Add the true Shop and Plant control gaps listed above inside current Counter/Orders/Stock/Jobs/Problems surfaces.
5. Add shared master data and reporting before adding navigation or products.
6. Add Website hosted release/lead analytics and Ecommerce hosted identity governance, shipping adapters, and general support cases only after managed tenant security is proven.
7. Validate each template pack with one real operator and promote only measured, recoverable workflows.
