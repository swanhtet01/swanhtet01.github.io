# SuperMega CEO product goal

Updated: 2026-08-05
Owner: SuperMega CEO / Product
Status: active operating charter

## Goal

Make each SuperMega product deliver one verified business outcome in a first session, on mobile or desktop, while the shared platform underneath provides durable data, governed actions, recovery, security, and reusable client templates.

SuperMega succeeds when:

1. `supermega.dev` explains four separate customer products: Shop, Plant, Website, and Ecommerce.
2. A visitor can open a useful sample before completing setup.
3. Setup asks only for information needed to create the first useful outcome.
4. Each product shows one next task and hides advanced controls until they are relevant.
5. Browser-local claims, managed-service claims, and external side effects remain truthful and visibly distinct.
6. Real workspaces persist safely, recover cleanly, isolate tenants, and preserve an attributed evidence trail.
7. New features, libraries, and integrations ship only when they measurably improve customer value or operating leverage.

This charter refines the active company goal; it does not declare the current release complete.

## 2026-08-05 enterprise execution reset

### Adapted objective

Within 30 days of receiving an owner-approved isolated managed target and a named pilot operator, deliver one protected managed-pilot release in which:

1. Shop completes sale or order intake through fulfilment, payment review, exception handling, and close.
2. Plant completes demand or job release through material use, output, quality disposition, and traceable close.
3. Website completes approved brief through responsive review, retained release artifact, and a governed publish handoff.
4. Ecommerce completes Shop-backed catalog through cart, order request, Shop acceptance, customer-safe status, and return or support request.
5. All four products use authenticated tenant-isolated persistence, durable commands, immutable evidence, private files, backup and tested restore.
6. A new user enters one product, sees one next task, and reaches its first verified value without seeing HQ, agents, readiness machinery, or unrelated products.

The 90-day objective is four validated industry templates, one measured operator cohort per product, one shared import and configuration engine, server-side observability, and one evaluated AI assistance workflow. Matching Odoo, ERPNext, SAP, or Salesforce feature-for-feature is not a credible 30-day claim. SuperMega competes first through simpler operation, stronger workflow integrity, Myanmar-ready delivery, and faster configuration for the selected verticals.

This adapted objective is the execution goal beneath the broader company goal. It replaces feature-count expansion as the operating priority.

### Why the product still feels incomplete

The repository contains substantial local domain behavior, but five fractures prevent it from behaving like a finished product:

| Fracture | Current evidence | Decision |
| --- | --- | --- |
| Release truth | The current branch retains integration base `0e9883ea`, while both live domains still identify older release `25cac2f5`; exact candidate identity and commit counts are receipt-bound because HEAD continues to advance | Regenerate and verify one current-head runtime-truth receipt plus exact release handoff before any protected preview or public UI work |
| Persistence truth | The four products are rich browser-local release candidates; seven managed-pilot gates remain blocked | Managed identity, persistence, RLS, private Storage, backup, restore, and hosted proof are P0 |
| Source truth | `CURRENT.md`, `hq/NOW.md`, `hq/WORKBOARD.md`, branch history, and live metadata contain different historical checkpoints | Generate one runtime-truth receipt and treat dated narrative records as evidence, not competing current state |
| UI ownership | `CoreApp.tsx` is 9,194 lines and mixes Shop, Plant, cross-product navigation, setup, and internal controls | Split by product domain while preserving the verified routes and contracts; do not redesign from scratch |
| Acceptance truth | Automated local gates are strong, but there is no named pilot, production cohort, retention baseline, or supported operating run | Stop calling module count readiness; graduate only on named operator evidence and recovery proof |

The next constraint is therefore not another page, agent team, framework, or speculative module. It is turning the existing local workflows into one coherent, managed, supportable system.

## Target enterprise architecture

### Architecture decision

Use a **modular monolith** until measured scale, isolation, or team-ownership evidence justifies a service split.

- React, React Router, Vite, and the existing product tokens remain the experience layer.
- FastAPI remains the server boundary for domain commands, queries, imports, approvals, files, and AI requests.
- Supabase Auth, Postgres, and private Storage become the managed identity and data foundation only after the isolated hosted gates pass.
- Vercel remains the paired public/app release and runtime-observability boundary.
- Postgres is the only SuperMega system of record. Browser state is an offline/sample cache, not managed write authority.
- Odoo, ERPNext, Medusa, Saleor, and Puck are reference or bounded-evaluation sources; none becomes a second business authority by default.
- A queue, workflow engine, analytics SDK, model provider, and integration adapter each require one measured job and one accepted authority. Duplicates are rejected.

```text
supermega.dev
  concise company promise + four product entry links + contact/privacy
             |
             v
app.supermega.dev
  Shop | Plant | Website | Ecommerce
  product-specific shell; one next task; optional advanced tools
             |
             v
FastAPI application boundary
  queries | commands | approvals | imports | files | AI drafts | adapters
             |
             v
Domain modules in one deployable system
  shop | plant | website | ecommerce | shared platform
             |
             v
Supabase managed foundation
  Auth | private Postgres | RLS/grants | Storage | backup/restore
             |
             +--> outbox/work queue --> approved external adapters

Internal only: HQ + R&D + release + support + bounded agent coordination
```

### Customer information architecture

Public pages remain `/`, `/contact/`, and `/privacy/`. Product cards deep-link to a useful sample. The app root resumes the last product or opens Shop at the counter; product selection is explicit, not a dashboard.

| Product | Primary surface | Secondary surface | Advanced surface | Hidden from first use |
| --- | --- | --- | --- | --- |
| Shop | Counter | Orders | Stock | purchasing, CRM, finance, reports, integrations, and setup until relevant |
| Plant | Jobs | Problems | Plan and trace | engineering, maintenance, costing, compliance, and setup until relevant |
| Website | Pages | Preview | Release | SEO, assets, localization, analytics, domains, and governance until relevant |
| Ecommerce | Store | Orders | Configure | promotions, accounts, shipping, payment, tax, channels, and analytics until relevant |

Each product owns its navigation, empty state, next-action policy, search, and mobile flow. Cross-product links appear only when a real record crosses a boundary. HQ, agent teams, system readiness, setup baselines, and internal evidence contracts never appear in normal customer navigation.

### Shared platform modules

1. **Identity and tenancy** — organization, workspace, company, branch, location, membership, role, capability, session, and revocation.
2. **Master data** — customer, supplier, item or service, variant, unit, currency, tax class, account role, location, lot, serial, asset, document, and source identity.
3. **Command and event control** — versioned command, expected revision, idempotency key, actor, capability, reason, evidence, immutable event, and conflict result.
4. **Workflow and approval** — state machine, task owner, due state, exception, approval policy, decision, and escalation.
5. **Import and Blueprint** — source snapshot, field inference, versioned mapping, no-write preview, row repair, duplicate review, digest, activation packet, and rollback.
6. **Files and evidence** — private object, checksum, classification, retention, access grant, version, and attachment link.
7. **Search and views** — permission-filtered search, saved filters, task inbox, timeline, comments, and notification preferences.
8. **Reporting** — canonical dimensions, operational projections, exported evidence, scheduled report request, and accounting or BI handoff.
9. **Integration control** — adapter registry, credentials reference, webhook receipt, outbox, retry, dead letter, rate limit, and reconciliation.
10. **Operations** — release identity, feature flag, health, trace, metric, audit, backup, restore, incident, support case, and data export or deletion request.

The canonical write path is:

```text
authenticated intent
-> capability and tenant check
-> schema and business validation
-> idempotency and expected-revision check
-> optional named-human approval
-> atomic domain write + immutable event + outbox record
-> permission-filtered projection
-> adapter execution and reconciliation, when separately authorized
```

### Product domain ownership

| Domain | Owns | Reads or projects | Must never own |
| --- | --- | --- | --- |
| Shop | customer commitment, order, reservation, stock movement, fulfilment, payment status, return/refund evidence, purchase/receipt, close | Ecommerce request, Website lead, Plant output handoff | Website content, Plant execution, provider settlement truth |
| Plant | demand plan, BOM/routing revision, work order, material issue/use, WIP, output/scrap, quality, CAPA, maintenance, genealogy, shift close | Shop demand and inventory availability | retail sale, customer payment, machine command without a separate safety system |
| Website | site brief, page/section content, assets, review, artifact, release request, lead form definition | approved brand/master data and lead-routing destination | Ecommerce checkout, Shop stock, unapproved DNS or publish action |
| Ecommerce | storefront configuration, Shop catalog projection, cart, quote, customer intent, status projection, support/return request | Shop price, availability, order, fulfilment, payment-status truth | independent stock, order, refund, close, or payment ledger |

Cross-product work uses explicit versioned handoff contracts and source IDs. Domains do not mutate one another's tables directly.

## Product module architecture and lifecycle

The detailed capability catalogue below is a sequencing map, not a promise that every item is live. A module is sellable only at the delivery level it has passed.

### Shop

Core lifecycle: `lead or channel -> quote/order -> reserve -> fulfil/service -> payment review -> return/exception -> close -> accounting handoff`.

- Sell and POS: visual catalog, barcode, variants, units, discounts, taxes, receipts, split tender, suspended carts, shifts, offline queue, printer/scanner adapters.
- Orders and fulfilment: walk-in, phone, social, Website, Ecommerce, preorder, wholesale, promise, allocation, pick/prepare, delivery/pickup, cancellation, amendment, return.
- Inventory and purchasing: warehouse/location/bin, ATP, reservation, lot/serial/expiry, count, adjustment, transfer, replenishment, supplier, RFQ/PO, receipt, discrepancy, return-to-vendor.
- Customer operations: profiles, addresses/consent, price and credit terms, loyalty/membership, booking, service history, support/warranty.
- Finance controls: payment status, reconciliation, receivables, tax snapshots, close, counted settlement, correction documents, balanced review export, future posting adapter.
- Management: branch/shift responsibility, permissions, exception inbox, margin projection, stock turns, fill rate, supplier performance, channel conversion, audit.

Pilot exit: one authenticated operator completes a full operating day with durable records, explained inventory and payment variance, one return exception, export, backup, and restore.

### Plant

Core lifecycle: `demand -> MPS/MRP -> BOM/routing -> material/capacity check -> release -> execute -> inspect -> output/scrap -> genealogy -> cost/variance -> shift close`.

- Planning: demand, forecast, MPS, MRP, capacity, constraints, priorities, reschedule evidence, purchase/transfer suggestions.
- Product engineering: item revision, BOM/recipe/formula, routing, work instruction, effective dates, engineering change and approval.
- Execution: work order, operation queue, WIP, labor/machine time, material issue/return/substitution, output, by-product, scrap, rework.
- Quality and trace: specifications, sampling, incoming/in-process/final inspection, hold, deviation, NCR/CAPA, release, lot/serial genealogy, recall dossier.
- Maintenance and assets: hierarchy, meter, preventive plan, work request/order, downtime, parts, findings, calibration, return-to-service.
- Cost and performance: standard/actual material, labor and overhead, WIP valuation projection, variance, yield, throughput, plan attainment, OEE and bottleneck evidence.
- Workforce/compliance: skill authorization, roster, shift handoff, safety/permit, training, document control, retention and audit.

Pilot exit: one authenticated operator and supervisor complete one order-bound production window with material genealogy, quality disposition, downtime source, close, recovery, and measured correction effort.

### Website

Core lifecycle: `brief -> structure -> content/assets -> responsive preview -> review -> approval -> immutable artifact -> publish request -> lead learning`.

- Structure/editor: site/page tree, reusable typed sections, navigation, redirects, tokens, responsive rules, light/dark variants, bounded custom fields.
- Content/assets: structured copy, proof, FAQ/news/legal, localization, image/document library, alt text, crop/optimization, rights/expiry.
- Discovery/conversion: metadata, canonical URL, sitemap/robots, structured data, social cards, forms, spam/consent, source attribution, Shop lead handoff.
- Quality/release: WCAG and performance budgets, broken-link checks, preview environment, approval, artifact digest, domain/TLS readiness, publish adapter, rollback, release history.
- Learning/governance: privacy-safe outcomes, campaign attribution, roles, comments, version history, backup, restore, retention.

Pilot exit: one named business moves from brief to accepted responsive artifact, protected preview, approved publish/rollback rehearsal, working lead receipt, and recovery evidence.

### Ecommerce

Core lifecycle: `Shop catalog projection -> merchandising -> cart -> checkout intent -> Shop acceptance -> fulfilment/status -> return or support`.

- Catalog/merchandising: Shop-owned SKU/price/availability projection, variants/media, collections, search/filter, badges, bundles, recommendations, schedules.
- Cart/checkout: durable draft, quantities, customer/contact, pickup/delivery, address/zone, notes, consent, quote, duplicate-safe request and acknowledgement.
- Commercial rules: price lists, promotions/coupons, wholesale breaks, fees and tax projection with Shop revalidation.
- Account/service: governed identity, address book, order history, reorder, preferences, return/support/correction request, abuse/rate-limit recovery.
- Provider boundaries: payment method/status, shipping quote/tracking, tax calculation, channel feed and webhook, all reconciled through Shop authority.
- Learning/trust: view-to-request funnel, abandonment, Shop confirmation, fulfilment, repeat use, policy, privacy, fraud review, audit and recovery.

Pilot exit: a named customer and Shop operator complete request, acknowledgement, acceptance, fulfilment status, correction or return, duplicate recovery, and tenant-safe restore without Ecommerce creating a parallel ledger.

## Template and onboarding architecture

A template is a versioned configuration package, never a code fork or separate product. Every package contains:

- product and industry identity;
- enabled capabilities and terminology;
- roles, capabilities, approvals, thresholds, and exception owners;
- required master data and default records;
- workflow states and allowed transitions;
- page/dashboard composition and progressive-disclosure rules;
- CSV/spreadsheet mappings, transforms, duplicate keys, and repair rules;
- sample records isolated from real records;
- connector requirements and disabled-by-default external authority;
- acceptance mission, expected evidence, migration version, and rollback plan.

Initial validated packs are Shop retail, restaurant/cafe, service/booking, and social seller; Plant discrete assembly, batch/process, food, and quality/traceability; Website business presence and lead generation; Ecommerce social storefront and pickup/preorder. Gym, school, wholesale, multi-branch, regulated production, and B2B storefront packs remain candidate configurations until one named workflow validates each.

Onboarding is one branch:

```text
open product sample
-> choose use sample, import data, or start empty
-> preview exactly what will be created
-> repair only blocking rows
-> name responsible owner
-> activate reversible workspace
-> complete first task
```

No company questionnaire, readiness dashboard, agent roster, or full module selector precedes the sample. Internal client preparation uses the same template package and import engine, then produces a private review packet rather than a customer-facing setup maze.

## AI and agent architecture

AI assistance is a governed platform capability. “Agents” are roles and bounded runs, not always-on processes or a fifth product.

```text
approved record set
-> context compiler and data minimizer
-> provider-neutral model adapter
-> typed draft with source spans, confidence, prompt/model version
-> deterministic validation and policy check
-> named human review: accept, edit, reject
-> ordinary domain command, if authorized
-> outcome/evaluation/trace record
```

### Customer assistance roles

- Shop: order-intake draft, product/import mapping, replenishment suggestion, exception summary, customer-response draft, close explanation.
- Plant: production-plan suggestion, material exception summary, quality/CAPA draft, maintenance prioritization, shift handoff.
- Website: brief extraction, page plan, source-backed copy draft, SEO/accessibility checklist, localization draft.
- Ecommerce: merchandising draft, catalog cleanup, support triage, abandoned-request recovery draft, promotion analysis.

### Internal company roles

- CEO/integrator selects one measurable outcome and accepts evidence.
- Product defines the user job, workflow, scope, template, and KPI.
- Engineering implements domain contracts, migration, UI, and tests.
- QA/security/release verifies routes, permissions, failure, recovery, performance, and exact artifact identity.
- R&D evaluates one resource or competitor pattern against a product KPI.
- Onboarding/support prepares imports, guides operators, records failures, and updates templates.
- Growth drafts positioning, demos, leads, and follow-up; external contact remains owner-approved.
- Finance/risk reviews pricing, claims, data handling, payments, and consequential authority.

On this ROG Ally, these are dormant capabilities with one active assignment and zero local subagents by default. One role can execute several serial checks; role count must never be confused with running processes. A company work item requires an outcome, owner, source receipts, no more than five write paths, authority class, acceptance check, and stop condition.

### AI production gates

1. At least 20 representative fixtures, including ambiguous, malicious, missing, multilingual, and unsupported inputs.
2. Typed schema validity, source coverage, critical-field accuracy, refusal behavior, and zero fabricated consequential facts.
3. Zero direct payment, message, publish, access, stock, production, release, or machine authority.
4. Tenant-bound context minimization, retention decision, redacted traces, rate/cost budget, and deletion behavior.
5. Named-user evidence that the assistance reduces time or correction effort versus the deterministic workflow.

Order Intake remains the first evaluated workflow. Do not add an agent marketplace, autonomous employee UI, or orchestration framework until that gate passes.

## Fast delivery sequence

### First 48 hours — one source of truth

- Generate a current-state receipt from Git HEAD, origin/main, live release metadata, managed-readiness JSON, route inventory, migrations, and test gates.
- Resolve the canonical checkout/branch and prepare one exact protected preview candidate; do not copy another historical branch wholesale.
- Replace contradictory “current” prose with generated references and archive only after its useful decisions are retained.
- Freeze new product/module/UI expansion while P0 is open.

Exit: one candidate commit, one diff, one rollback target, one source register, and no unresolved release identity.

### Days 3–7 — managed foundation

- Rehearse migrations v8–v10 and the public-browser quarantine on an owner-approved isolated Supabase target.
- Prove Auth/session revocation, membership/capability binding, RLS and grants, tenant denial, private Storage, idempotent commands, conflict behavior, backup, and restore.
- Expose one server-mediated managed workspace bootstrap and command path; keep browser-local sample mode separate and visibly labelled.
- Add request/command/DB traces with redaction using existing Vercel observability before a second vendor.

Exit: seven managed-readiness gates have evidence or an explicit failing receipt; no protected production mutation.

### Days 8–14 — Shop managed vertical

- Bind Counter, Orders, Stock, customer, purchasing, return, payment review, and close to the managed command/event path.
- Preserve the current simple counter-first UI and move advanced controls behind the exact task that needs them.
- Run import, offline/retry, duplicate, concurrent-stock, return, close, export, backup, and restore tests.
- Complete five moderated sessions with one named Shop operator and record time-to-first-sale, corrections, variance, and repeat use.

Exit: one complete managed Shop operating day with zero unexplained stock/payment variance and a tested restore.

### Days 15–21 — Plant and cross-product integrity

- Bind demand, job, material, output, quality, maintenance, genealogy, and shift close to managed commands.
- Prove Shop demand-to-Plant and Plant output-to-Shop handoffs without direct cross-domain table writes.
- Validate one order-bound production window, downtime source, quality exception, and recall trace with named roles.

Exit: one plan-to-stock loop with exact genealogy, recovery, and operator evidence.

### Days 22–30 — Website and Ecommerce delivery

- Bind Website content, evidence, artifact, preview, release request, lead receipt, and rollback record to managed state.
- Bind Ecommerce storefront configuration, account/contact intent, quote/request, Shop status, correction, return, and support to managed state.
- Rehearse one publish adapter and one payment/shipping/tax adapter in simulated or no-write mode; activate none without separate authority.
- Verify all four products at 390 px and desktop, with one first task, no dead controls, no internal navigation, and full recovery.

Exit: one protected four-product managed-pilot candidate and an evidence-backed go/no-go packet.

### Days 31–90 — validated enterprise v1

- Validate four template packs and the shared import engine against real operator files.
- Add role administration, saved views, notification preferences, support/incident workflow, data export/deletion, SLOs, and disaster-recovery rehearsal.
- Evaluate Order Intake; keep or reject it using quality, correction, latency, cost, and user-time evidence.
- Add at most one durable job authority and at most one analytics implementation after their measured gates.
- Promote only adapters demanded by accepted pilots; publish support and migration documentation.

Exit: four managed workflows, four accepted templates, measured retention, tested recovery, support ownership, and truthful production readiness.

## Enterprise acceptance contract

A product is not enterprise-ready until all of these are evidenced for its current release:

- complete primary lifecycle plus cancellation, correction, and failure paths;
- authenticated tenant isolation and least-privilege roles;
- atomic idempotent writes, optimistic concurrency, audit events, and external outbox reconciliation;
- import preview, correction, export, backup, restore, retention, and deletion behavior;
- mobile/desktop keyboard and screen-reader usability, performance budget, and no dead controls;
- release identity, protected preview, rollback, observability, incident owner, and support runbook;
- one named operator cohort with first-value, completion, correction, exception, and repeat-use evidence;
- truthful capability labels: sample, local, managed pilot, production, and integrated never collapse into one claim.

Primary pilot measures are median time to first verified value, core-loop completion, correction effort, unexplained variance, recovery success, cross-tenant denial, crash-free sessions, and four-week repeat use. Module count is a coverage measure, not a customer outcome.

## Source and resource authority

Use sources in this order:

1. **Live and executable truth:** live `__release.json`, current Git commit and diff, route/action audit, tests, migration receipts, managed-readiness receipt, and runtime observations.
2. **Current product authority:** `CURRENT.md`, `site-manifest.json`, `hq/portfolio.json`, this charter, and the enterprise product roadmap after reconciling their dates against executable truth.
3. **User-supplied operating packs:** the two identical `supermega-codex-operating-system.zip` files and `supermega-free-resource-sources-and-rnd.zip`. Their enduring rules—provenance, private/public separation, decision-ready outputs, verification, and reusable R&D—are adopted. Their older public resource-directory roadmap is internal R&D history, not a fifth customer product.
4. **Primary external references:** official Odoo, ERPNext, SAP, Supabase, Vercel, Playwright, W3C, OWASP, Medusa, Saleor, Puck, GS1, and OPC Foundation documentation.
5. **Discovery only:** the supplied ChatGPT share and social posts. They may identify questions or patterns but cannot verify product, market, pricing, security, or architecture claims.

### Resource adoption register

| Resource | Use | Decision |
| --- | --- | --- |
| Odoo 19 and ERPNext | Functional lifecycle and module coverage benchmark | Reference only; do not import a second ERP authority |
| SAP S/4HANA / Digital Manufacturing | Control, accounting, traceability, quality, and manufacturing reference | Reference only; implement only client-required controls |
| Supabase Auth/Postgres/Storage | Managed identity, data, RLS, private files, backup foundation | Adopt after isolated hosted proof |
| Vercel | Paired release, protected previews, runtime and trace visibility | Keep; no second deploy authority |
| Playwright plus axe | Route, workflow, mobile, accessibility, and browser regression evidence | Keep as release gate |
| Medusa and Saleor | Ecommerce domain, reservation, channel, payment, fulfillment, and extension patterns | Reference; adapter only for a named merchant requirement |
| Puck | Typed React block editor and permission model | One Website spike only if the finite editor blocks a measured workflow |
| Supabase Queues versus Vercel Workflow | Durable import, adapter retry, or approval-wait jobs | Compare one job after managed proof; select at most one orchestration authority |
| OpenTelemetry / Vercel tracing | Server-side request, command, model, adapter, and DB correlation | Adopt incrementally with customer-content redaction |
| PostHog | Product outcome events | Defer until consent, identity, retention, and deletion are proven |
| Provider-neutral structured AI | Bounded source-backed drafts and recommendations | Evaluate Order Intake first; no direct domain authority |

The R&D rule is one candidate, one user job, one KPI, one reversible experiment, one failure/recovery test, and one adopt/revise/reject decision. GitHub stars and feature lists are discovery signals, not adoption evidence.

## Current CEO decision

The local candidate now proves that Shop, Plant, Website, and Ecommerce each move from a one-field product setup to the correct separate workspace and one useful first task on mobile and desktop. The complete local browser matrix has fourteen workflow gates and 98 deterministic checkpoints. First-value timing is now bound to the latest product-onboarding journey, so an old demo completion cannot make a new workspace appear activated.

Production does not yet serve the current candidate. On 2026-08-05 both canonical release endpoints still identified `25cac2f50dfcc210d29dd1fd794ac194083f90d1`. Integration commit `0e9883eaa1a2a936c3e77d057b598f9956d2557c` remains an ancestor of the advancing candidate, but it is no longer used as the current release label. A fresh `supermega.runtime-truth.v1` receipt binds clean HEAD, remote main, both live identities, routes, migrations, and managed blockers; `supermega.release-handoff.v2` independently binds the exact candidate and complete app verification. The hosted app root still opens the older multi-product and support-helper dashboard; the candidate root opens the current product directly and keeps the four-product chooser behind an explicit switch action. The remaining customer-facing issue is release drift rather than a missing domain.

The company constraint is no longer a missing fifth product, framework, or menu. Seven managed-pilot gates remain blocked: hosted Postgres rehearsal, private storage proof, live managed product contract, managed persistence, security, a named pilot, and production activation. The local foundation now also has a digest-bound public Data API quarantine: it covers the exact 27-table/two-sequence legacy catalog, removes browser grants and risky future-object defaults, preserves the server contact path, rejects drift, and survives PostgreSQL 17 backup/restore. This is local evidence only. The current CEO priority is therefore:

1. Retain integration base `0e9883ea` in current-head ancestry, then require fresh runtime-truth and exact-commit handoff receipts, a protected preview, owner-authorized paired app/public promotion, rollback target, matching release metadata, and a fresh live browser matrix before calling the redesign live.
2. Preserve the simple four-product first session and its browser evidence while that integration is reviewed; do not add another product, shell, framework, or navigation layer.
3. On an approved isolated Supabase clone, apply the digest-bound public browser quarantine plus v8-v10 and prove identity binding, tenant isolation, explicit grants/RLS, idempotency, conflict, active-session revocation, private Storage, backup, restore, and observability. Local PostgreSQL 17 already proves the exact Auth project/session/user contract and immediate denial after session deletion; repeat it under hosted Supabase before any managed claim.
4. Run five named operator sessions and measure first value, time to value, correction effort, and repeat useful work.
5. Fund only the product depth or adapter that the evidence identifies as the next constraint.

Production, provider, connector, payment, publish, and customer-message authority remain separately gated.

The resource strategy is deliberate: keep the current React/Vite product shell, use Supabase Auth/Postgres/Storage as the managed data foundation, and keep serial deterministic browser/database release gates. After hosted security and one named pilot exist, compare Supabase Queues and Vercel Workflow against one tenant-bound durable job, evaluate privacy-minimized first-party/PostHog outcome events, and add provider-neutral AI only behind the existing evidence and human-approval contracts. Do not add a framework, analytics SDK, queue, or model provider while the current bottleneck is hosted proof and operator evidence.

## Portfolio boundary

SuperMega has four customer products. Do not add a fifth product until all four pass the activation and reliability gates below.

| Product | First verified value | Core operating loop | What it must not duplicate |
| --- | --- | --- | --- |
| Shop | Complete a sample sale or accept an order and see stock/fulfilment state update | Sell or accept -> fulfil -> collect -> close | Plant production, Website publishing, or Ecommerce storefront editing |
| Plant | Record output plus same-shift material trace for one job | Demand -> plan -> produce -> inspect -> trace -> close | Shop selling, accounting claims, or machine control |
| Website | Create a client-specific page, preview it, and produce a reviewable release | Brief -> compose -> preview -> approve -> publish handoff | Ecommerce checkout, Shop stock, or an unsupported deployment claim |
| Ecommerce | Submit a storefront request that becomes a reviewable Shop order | Catalog -> storefront -> request -> Shop acceptance -> fulfilment | Independent stock, payment, fulfilment, refund, or close ledgers |

AI assistance is a shared capability, not a fifth customer product. HQ, agents, teams, R&D, Ops, and Console are internal operating surfaces and must not appear in customer navigation.

## The innovation: four shared platform capabilities

The disruptive advantage should come from a simple surface over a capable shared system, not from exposing ERP menus.

### 1. SuperMega Blueprint

Turn a spreadsheet, document, existing catalog, or short business interview into a reviewable product-specific workspace.

- Detect columns and likely record types.
- Map data to a versioned template without writing immediately.
- Explain missing or conflicting fields in plain language.
- Generate realistic sample records where source data is absent.
- Produce an import preview, repair list, and reversible activation packet.
- Reuse industry packs without forking the product codebase.

### 2. SuperMega Sync

Make Shop and Plant dependable where connectivity and hardware are imperfect.

- Persist work locally before network-dependent work.
- Queue writes in an append-only outbox.
- Show sync, conflict, retry, and recovery state in user language.
- Preserve idempotency keys and attributed evidence.
- Reconcile to the managed workspace without silent overwrites.
- Keep backup/export and restore independently verifiable.

### 3. SuperMega Actions

Embed AI where it reduces work, while deterministic policy owns consequential transitions.

- Summarize the next task and explain why it matters.
- Draft imports, replies, reorder suggestions, schedules, and exception reviews.
- Detect anomalies and incomplete records.
- Require named human review for money, stock, production, publishing, customer contact, and external side effects.
- Record recommendation, evidence, approval, execution, and outcome separately.
- Run locally by default when practical; paid providers remain optional and evaluation-gated.

### 4. SuperMega Connect

Use adapters to connect channels, payments, devices, and enterprise systems without polluting the core UI.

- Channel adapters feed structured requests into Ecommerce or Shop.
- Payment adapters report provider state without inventing settlement.
- Hardware adapters isolate printers, scanners, scales, and customer displays.
- Plant adapters begin read-only and observational; direct machine control is out of scope.
- Import/export adapters preserve stable IDs, source evidence, and versioned mappings.

These capabilities are internal platform layers. Customers should still see only the product they chose and the task in front of them.

## Product depth sequence

### Shop

1. Counter, orders, stock, customers, returns/refunds, cash shift, and close.
2. Suppliers, purchase orders, receiving, invoice matching, and replenishment.
3. Service scheduling and memberships for salon, spa, gym, school, and repair packs.
4. Restaurant/cafe tables, kitchen/preparation status, modifiers, and split payment packs.
5. Offline write queue, hardware adapters, multi-location transfers, and governed reporting.

### Plant

1. Jobs, output, scrap, material trace, quality holds, problems, and shift close.
2. Bills of material, routings, work centers, capacity, downtime, and maintenance.
3. Demand planning, purchasing handoff, lot genealogy, recall trace, and quality dossiers.
4. Costing evidence, variance, OEE, subcontracting, and multi-site planning.
5. GS1-compatible identifiers/events and read-only OPC UA observations for qualifying clients.

### Website

1. Industry template, content blocks, responsive preview, leads, and release review.
2. Domain readiness, SEO/schema, accessibility, analytics consent, and form routing.
3. Version history, approvals, localization, asset library, and reusable sections.
4. Governed publish adapter with rollback evidence and environment separation.

### Ecommerce

1. Shop-backed catalog, storefront, cart/request, delivery choice, and Shop acceptance.
2. Promotions, customer accounts, order status, returns request, and abandoned-request recovery.
3. Channel adapters, delivery zones, payment-provider adapters, and merchant analytics.
4. B2B pricing/approval packs and multi-storefront support without duplicating Shop ledgers.

## Resource decisions

### Investment scorecard

| Resource or integration | Customer job and KPI | Smallest useful experiment | Decision now |
| --- | --- | --- | --- |
| Supabase Auth, Postgres, Storage, and RLS | Durable managed workspaces; verified first value without identity confusion, cross-tenant access, or data loss | Apply reviewed v8-v10 plus the digest-bound public browser quarantine, private Storage, restore, tenant denial, and the locally proven active-session revocation contract on one isolated non-production target | Highest priority managed foundation; do not touch protected production before every hosted gate passes |
| Playwright Core and system browser | Prevent release regressions in first-session completion, mobile usability, and recovery | Keep the 14-workflow, 98-checkpoint matrix serial and deterministic | Adopted release authority for browser behavior |
| Existing Vercel paired release, deployment identity, and function observability | Prevent a verified local candidate from drifting away from what customers actually receive; diagnose latency, failure, and cost without adding client complexity | Require exact app/public release metadata, matching static artifacts, protected preview, rollback target, and live route proof for the selected commit | Immediate release priority; use before adding a second observability vendor or browser SDK |
| PostHog custom product events | Verified first-value funnel, time to value, and retention | Mirror only the approved first-party event schema in an isolated consented pilot; no autocapture or session replay | Defer until hosted identity, consent, retention, and privacy review exist |
| Supabase Queues versus Vercel Workflow | Durable server-owned import, connector retry, or release-package job | Run the same idempotent, tenant-bound, failure-injected job on each candidate | Prototype after managed security; select at most one orchestration authority |
| OpenAI Agents SDK or another model provider | Source-backed drafts and recommendations that reduce operator effort | One read-only or draft-only workflow with explicit approval, rejection, cost, and quality evidence | Provider-neutral prototype only; deterministic product contracts retain authority |
| React Aria, XState, and PGlite | Better complex controls, transition safety, or relational offline behavior | Replace or model one measured problem, benchmark bundle/startup/device cost, then remove the losing path | Trigger-based evaluation, never a broad migration |
| Messenger, Viber, payment, delivery, hardware, GS1, and read-only OPC UA adapters | Faster request intake and fewer duplicate or manual records | One versioned no-write import or simulated adapter with provenance and duplicate recovery | Defer live connection until managed identity, privacy, safety, and named-operator proof pass |

An integration does not become strategy merely because it is capable. It must improve one primary KPI or driver, replace existing complexity, preserve a clean product surface, and pass a failure-and-recovery test. If two tools would own the same queue, workflow, analytics, or system-of-record responsibility, SuperMega chooses one authority and removes the duplicate.

### Adopt now

- Keep React, React Router, Vite, TypeScript, and the current design tokens. A framework migration would not fix the present information-architecture problem.
- Add Playwright route/action contracts and ARIA snapshots to the release gate. Playwright supports accessibility-tree snapshots and targeted assertions.
- Use React Aria selectively when replacing repeated complex primitives such as dialogs, menus, selects, and comboboxes. Do not restyle or migrate the whole app at once.
- Continue the Supabase/Postgres managed foundation with Auth, tenant-scoped RLS, grants, idempotent commands, and auditable migrations. Hosted activation remains gated until production evidence exists.
- Instrument a small first-party behavior trail for activation and task outcomes before adding a broad analytics SDK.
- Use explicit Data API grants as well as RLS in every managed migration. Supabase's 2026 exposure-default change makes grants a separate, deliberate contract; it does not repair existing broad grants or replace tenant policies.
- Use existing Vercel release, function, and cost observability before adding another monitoring SDK. Add a second tool only for a measured diagnostic gap.

### Prototype behind an adapter

- Preserve the now-proven native IndexedDB write-ahead outbox for reviewed local Shop actions. It stages an attributed, digest-bound intent before the local write, reconciles interrupted acknowledgement on reload, and fails closed on conflicting state. Extend it to Plant only after measuring storage growth, startup time, low-end Android behavior, and a bounded receipt-retention policy. Compare PGlite only if a measured relational/offline requirement justifies its payload and startup cost; its browser IndexedDB filesystem loads database files into memory and flushes changed files, while its OPFS path still has a material Safari compatibility constraint.
- Keep workflow transitions as explicit TypeScript contracts. Evaluate XState when at least three independently complex flows need the same state-machine semantics or current transition bugs justify the dependency.
- Model Shop/Plant item, lot, location, and trace events so a future GS1 adapter does not require a data rewrite.
- Evaluate Supabase Queues only for server-owned durable import, connector-retry, and release-package jobs after managed tenant security is proven. Keep its default private boundary, require idempotent consumers, and do not expose queue functions to customer browsers; Data API exposure would add queue-table RLS and function-grant obligations SuperMega does not presently need.
- Keep AI execution provider-neutral. The OpenAI Agents SDK is only an optional managed adapter candidate for resumable, human-approved work after privacy, cost, quality, and local-fallback evaluation; product contracts remain the authority and models receive no direct consequential write permission. Version, encrypt, tenant-bind, and minimize any serialized run state because it can include application context as well as approval state.
- Evaluate Vercel Workflow only for managed, long-running, resumable tasks after hosted activation and cost limits are defined. Benchmark its persisted steps, retries, versioning, and observability against the same bounded server-owned job as Supabase Queues, then adopt at most one orchestration authority for that job.
- Evaluate privacy-minimized PostHog custom events only after the first-party event contract, consent, retention, tenant identity, and deletion behavior are proven. Autocapture and session replay remain off by default because product screens can contain customer, order, payment-status, and production data.
- Prototype conversational commerce as a `SuperMega Connect` adapter that produces the existing Ecommerce request contract with source-message provenance and duplicate-safe recovery. Start with a no-send import fixture; Messenger, Viber, or other live channel authority remains gated.

### Defer or reject for now

- No new component library, broad design-system rewrite, or framework migration.
- No standalone AI-agent customer product.
- No client-side queue may authorize or automatically replay a managed-tenant write, customer message, payment, publish, stock, or production transition. The bounded local recovery outbox has local-workspace authority only.
- No direct OPC UA machine commands; Plant may ingest read-only observations only after a client-specific safety review.
- No experimental browser-wide OpenTelemetry rollout. Prefer server-side observability and bounded first-party product events until browser support and privacy requirements justify it.
- No fifth customer product, public HQ dashboard, or agent-team navigation.

## CEO KPI contract

Production instrumentation is not yet available, so targets below are provisional and must not be reported as achieved.

### Primary outcomes

1. **Verified first-value rate**
   New product workspaces that complete the product's defined first-value event in the first session / new product workspaces that started onboarding. Initial target: at least 70% in moderated pilot sessions.

2. **Median time to first verified value**
   Time from opening the product onboarding route to the first attributed outcome record. Initial target: at most 5 minutes with sample data and at most 30 minutes with a valid supported import.

3. **Four-week useful-workspace retention**
   Activated workspaces that complete at least one core operating loop in week four / activated workspaces eligible for week-four measurement. Set a target only after the first cohort produces a baseline.

### Drivers

- Steps and required fields before first value.
- Import preview-to-activation completion rate.
- Next-task completion rate.
- Workspaces completing three or more core workflow transitions in seven days.
- Share of AI recommendations accepted, revised, or rejected with a recorded reason.

### Guardrails

- Zero consequential external actions without the required attributed review.
- Zero customer routes with horizontal overflow, console errors, broken focus recovery, or visible mobile controls below 44 px in the release matrix.
- Zero cross-tenant reads/writes in RLS and managed-runtime tests.
- No deployment, payment, machine-control, provider-quality, or production-persistence claim without matching evidence.
- Measure crash-free sessions, sync recovery, and data-loss incidents before setting reliability targets.

## Current UX evidence baseline

The strict 2026-08-04 integrated audit used Edge at 390 x 844 and 1280 x 900. It passed 28 route checks and fourteen end-to-end workflow checks with no route, workflow, simplicity-target, console, page, external-request, unnamed-action, horizontal-overflow, disclosure, or mobile touch-target failures. Report digest: `sha256:736bab5afec8648a9507c7b4dace44d7685fc439e6fc2be7643af18fb490ce71`.

`Visible actions` counts settled interactive elements. `Mobile first viewport` counts controls visible without scrolling. These budgets protect simplicity; they do not imply every visible control deserves equal emphasis.

| Candidate route | Mobile visible actions | Desktop visible actions | Mobile first viewport | Mobile controls below 44 px |
| --- | ---: | ---: | ---: | ---: |
| Shop orders | 22 | 23 | 16 | 0 |
| Plant jobs | 19 | 20 | 9 | 0 |
| Website | 14 | 18 | 10 | 0 |
| Ecommerce | 18 | 19 | 9 | 0 |
| Shop setup | 8 | 9 | 7 | 0 |

The candidate root now resumes Shop by default and exposes fourteen settled mobile actions, thirteen in the first viewport. The explicit `/?choose=1` switcher shows only four product cards with one action each. Production still serves the older `Start with one product` multi-product/support-helper root from `25cac2f5`; live density is therefore not accepted as current-candidate evidence.

## Release and investment gates

A feature or resource enters implementation only if its one-page decision record answers all of these:

1. Which of the four products and which user job does it improve?
2. Which primary KPI or driver should move?
3. What is the smallest reversible prototype?
4. What customer data, external authority, cost, security, or support obligation does it add?
5. What existing control, page, or dependency can it replace?
6. What evidence will cause adoption, revision, or rejection?

A product release is not ready because the build passes. It is ready only when the route/action matrix, first-value journey, mobile/accessibility checks, security boundaries, persistence/recovery checks, and truthful live-release evidence all pass for that release.

## Immediate sequence

1. Retain integration base `0e9883ea` in the advancing candidate ancestry. Regenerate and verify `supermega.runtime-truth.v1` and `supermega.release-handoff.v2` for the same clean current HEAD; no stale packet, force push, or direct deployment from this checkout.
2. After separate owner authorization, use the protected coordinated workflow for one paired app/public release. Capture rollback targets first; then require matching `__release.json`, current static assets, all public product routes, and the mobile/desktop first-session matrix against the promoted commit.
3. Preserve Ecommerce-to-Shop, Shop sale-to-fulfilment-to-close, Plant reviewed-import-to-output-to-quality-close, and Website brief-to-responsive-preview-to-review-file proof at both viewports.
4. Preserve the now-proven Blueprint no-write preview inside each product's existing `Next steps` data tool. Keep its deterministic mapping, repair, digest, review lock, and `staged_not_applied` contracts; do not create another public setup page.
5. Preserve the now-proven current-journey first-value attribution and four-product one-field onboarding-to-first-task browser gate. Instrument the three CEO KPIs around those records, then run five moderated Shop/Plant sessions before expanding product scope.
6. Preserve the now-proven Shop local write-ahead and reload-recovery contract at both viewports. Measure receipt growth, startup cost, conflict frequency, and low-end Android behavior before extending the same bounded contract to Plant.
7. Close managed-persistence evidence on one owner-approved isolated clone: verify the signed public catalog, apply the digest-bound browser quarantine and v8-v10, then prove tenant isolation, authenticated tenant-bound idempotency, active-session revocation, conflict handling, private Storage, server-path retention, backup/restore, and only then production activation readiness. Never treat browser-stored outbox state as managed write authority. Provider writes and live activation remain owner-gated.
8. Only after those gates pass, compare private Supabase Queues and Vercel Workflow against one bounded durable-job contract; adopt at most one execution path for that job and keep customer browsers away from queue authority.

## Evidence and references

- Local implementation and browser audit: `showroom/src`, `tools/verify_app_build.mjs`, `tools/audit_product_routes.mjs`, and `PRODUCT-QUALITY.md`.
- Playwright ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- React Aria: https://react-spectrum.adobe.com/react-aria/getting-started.html
- PGlite: https://pglite.dev/docs/about
- XState: https://stately.ai/docs
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase explicit Data API grants change: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- Supabase Queues: https://supabase.com/docs/guides/queues
- OpenAI Agents SDK human approval and resumable state: https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- PostHog product analytics and privacy controls: https://posthog.com/docs/product-analytics and https://posthog.com/docs/session-replay/privacy
- GS1 Global Traceability Standard: https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard
- OPC UA: https://opcfoundation.org/about/opc-technologies/opc-ua/
- Vercel Workflows: https://vercel.com/workflows
- Odoo 19 POS and ecommerce scope: https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale.html and https://www.odoo.com/documentation/19.0/applications/websites/ecommerce.html

## Assumptions and unresolved evidence

- No production activation, retention, revenue, support-volume, or cohort dataset was available for this decision. KPI targets are provisional pilot targets.
- The 2026-08-04 local route audit is historical evidence rooted at integration commit `0e9883ea`, not proof for a later HEAD. Production remains paired at `25cac2f5`; each advancing candidate must rerun the complete route gate and produce fresh runtime-truth and release-handoff receipts before protected preview, paired promotion, rollback, and live evidence.
- Myanmar-specific payment, tax, data-residency, language, hardware, and channel requirements require client and legal discovery before an adapter can be called production-ready.
- Framework and integration adoption remains conditional on measured device performance, operating cost, security review, and the release gates above.
