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

This follows the enterprise pattern in current SAP guidance: tax codes are configuration records, while account-determination rules take configured document or organization fields as inputs and produce ledger accounts in a defined evaluation order. SuperMega must not invent a Myanmar rate, hidden default, or G/L account. The current four-role mapping is the first bounded layer, not a claim of complete condition-based account determination. The next finance slices require correction documents, jurisdiction/effective-date handling, company/location and tax-code conditions, and an owner-approved duplicate-safe posting adapter before any posting claim.

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

1. Build one internal client demo blueprint spanning selected products, templates, import objects, and integration handoffs.
2. Make quote-to-cash complete across Website/Ecommerce/Shop, then make plan-to-produce complete across Shop/Plant.
3. Add shared master data and reporting before adding more navigation.
4. Add Shop purchasing/returns/finance controls and Plant planning/quality/maintenance depth inside existing task surfaces.
5. Add Website release/lead analytics and Ecommerce customer/shipping/returns after managed tenant security is proven.
6. Validate each template pack with one real operator and promote only measured, recoverable workflows.
