# SuperMega CEO product goal

Updated: 2026-08-04
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

### Adopt now

- Keep React, React Router, Vite, TypeScript, and the current design tokens. A framework migration would not fix the present information-architecture problem.
- Add Playwright route/action contracts and ARIA snapshots to the release gate. Playwright supports accessibility-tree snapshots and targeted assertions.
- Use React Aria selectively when replacing repeated complex primitives such as dialogs, menus, selects, and comboboxes. Do not restyle or migrate the whole app at once.
- Continue the Supabase/Postgres managed foundation with Auth, tenant-scoped RLS, grants, idempotent commands, and auditable migrations. Hosted activation remains gated until production evidence exists.
- Instrument a small first-party behavior trail for activation and task outcomes before adding a broad analytics SDK.

### Prototype behind an adapter

- Preserve the now-proven native IndexedDB write-ahead outbox for reviewed local Shop actions. It stages an attributed, digest-bound intent before the local write, reconciles interrupted acknowledgement on reload, and fails closed on conflicting state. Extend it to Plant only after measuring storage growth, startup time, low-end Android behavior, and a bounded receipt-retention policy. Compare PGlite only if a measured relational/offline requirement justifies its payload and startup cost; its browser IndexedDB filesystem loads database files into memory and flushes changed files, while its OPFS path still has a material Safari compatibility constraint.
- Keep workflow transitions as explicit TypeScript contracts. Evaluate XState when at least three independently complex flows need the same state-machine semantics or current transition bugs justify the dependency.
- Model Shop/Plant item, lot, location, and trace events so a future GS1 adapter does not require a data rewrite.
- Evaluate Supabase Queues only for server-owned durable import, connector-retry, and release-package jobs after managed tenant security is proven. Keep its default private boundary, require idempotent consumers, and do not expose queue functions to customer browsers; Data API exposure would add queue-table RLS and function-grant obligations SuperMega does not presently need.
- Keep AI execution provider-neutral. The OpenAI Agents SDK is only an optional managed adapter candidate for resumable, human-approved work after privacy, cost, quality, and local-fallback evaluation; product contracts remain the authority and models receive no direct consequential write permission. Version, encrypt, tenant-bind, and minimize any serialized run state because it can include application context as well as approval state.
- Evaluate Vercel Workflow only for managed, long-running, resumable tasks after hosted activation and cost limits are defined. Benchmark its persisted steps, retries, versioning, and observability against the same bounded server-owned job as Supabase Queues, then adopt at most one orchestration authority for that job.

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

Captured before the current Plant focus-drawer and touch-target slice on 2026-08-04 from settled route DOMs. `Visible actions` counts interactive elements visible after the route settled; `mobile first viewport` counts visible controls in a 390 x 844 audit viewport. Counts describe interface density, not feature completeness, and remain the comparison baseline for the next automated inventory.

| Product | Live visible actions | Local candidate visible actions | Mobile first viewport controls | Mobile controls below 44 px |
| --- | ---: | ---: | ---: | ---: |
| Shop | 13 | 26 | 16 | 0 |
| Plant | 53 | 50 | 20 | 9 |
| Website | 29 | 26 | 11 | 0 |
| Ecommerce | 59 | 55 | 10 | 0 |

The same audit found 18 visible actions on the live app root and a multi-product sidebar during product setup. The local Shop setup had nine visible actions and one field, but its help link measured 35 px before the current fix. These numbers show that Plant and Ecommerce carry the highest total action density, while the production onboarding flow still exposes company-wide concepts too early.

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

1. Preserve Ecommerce-to-Shop, Shop sale-to-fulfilment-to-close, Plant reviewed-import-to-output-to-quality-close, and Website brief-to-responsive-preview-to-review-file proof at both viewports.
2. Preserve the now-proven Blueprint no-write preview inside each product's existing `Next steps` data tool. Keep its deterministic mapping, repair, digest, review lock, and `staged_not_applied` contracts; do not create another public setup page.
3. Instrument the three CEO KPIs around the existing useful samples and first-value records, then run five moderated Shop/Plant sessions before expanding product scope.
4. Preserve the now-proven Shop local write-ahead and reload-recovery contract at both viewports. Measure receipt growth, startup cost, conflict frequency, and low-end Android behavior before extending the same bounded contract to Plant.
5. Close managed-persistence evidence in this order: tenant isolation, authenticated tenant-bound idempotency, conflict handling, backup/restore rehearsal, then production activation readiness. Never treat browser-stored outbox state as managed write authority. Provider writes and live activation remain owner-gated.
6. Only after those gates pass, compare private Supabase Queues and Vercel Workflow against one bounded durable-job contract; adopt at most one execution path for that job and keep customer browsers away from queue authority.

## Evidence and references

- Local implementation and browser audit: `showroom/src`, `tools/verify_app_build.mjs`, `tools/audit_product_routes.mjs`, and `PRODUCT-QUALITY.md`.
- Playwright ARIA snapshots: https://playwright.dev/docs/aria-snapshots
- React Aria: https://react-spectrum.adobe.com/react-aria/getting-started.html
- PGlite: https://pglite.dev/docs/about
- XState: https://stately.ai/docs
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Queues: https://supabase.com/docs/guides/queues
- OpenAI Agents SDK human approval and resumable state: https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- GS1 Global Traceability Standard: https://www.gs1.org/standards/gs1-global-traceability-standard/current-standard
- OPC UA: https://opcfoundation.org/about/opc-technologies/opc-ua/
- Vercel Workflows: https://vercel.com/workflows
- Odoo 19 POS and ecommerce scope: https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale.html and https://www.odoo.com/documentation/19.0/applications/websites/ecommerce.html

## Assumptions and unresolved evidence

- No production activation, retention, revenue, support-volume, or cohort dataset was available for this decision. KPI targets are provisional pilot targets.
- The local route audit is current to the working tree on 2026-08-04; production remains a separate, stale release until live evidence proves otherwise.
- Myanmar-specific payment, tax, data-residency, language, hardware, and channel requirements require client and legal discovery before an adapter can be called production-ready.
- Framework and integration adoption remains conditional on measured device performance, operating cost, security review, and the release gates above.
