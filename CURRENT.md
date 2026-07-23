# SuperMega current direction

Last confirmed: 2026-07-24
Authority: this file, `site-manifest.json`, and `hq/portfolio.json`

SuperMega is operating software for real company work. It connects accountable company delivery, website delivery, ecommerce and channel-to-fulfilment operations, production control, evidence, and owner decisions without turning every capability into a separate public page or deployment.

## Product thesis

SuperMega competes on implementation readiness, local operating context, evidence, and controlled execution—not on the size of a tool catalogue.

The portfolio has three operating products and one local product prototype inside one application:

1. **Company system** — Home, accountable Work, Products, and a Settings utility, including Product, Engineering, Growth, and Finance workspaces plus an internal bounded-agent roster.
2. **Website** — finite page/content workflow, responsive preview, attributed evidence, evidence-bound human approval, and a deterministic downloadable site file; managed persistence is available only to authenticated v3 workspaces, with a clearly labelled local fallback.
3. **Commerce** — Website and customer-channel intake, order confirmation, stock, fulfilment, payment status, follow-up, and close.
4. **Production** — plan, output, materials, quality, equipment, maintenance, exceptions, and shift handoff.

AI is an embedded execution capability. It may inspect approved records, organize, summarize, draft, and escalate. It is not a separate public product, fake employee page, or substitute system of record.

## Public company surface

- `supermega.dev` is one compact product page.
- The only support pages are `/contact/` and `/privacy/`.
- The page explains the company system, Product lifecycle, Commerce, Production, configurable templates, and authority boundary without a long catalogue or public pricing theatre.
- The brand is SuperMega with the jade `>_` terminal mark on a warm, light operating interface with ink text and restrained status color.
- Historical product, demo, trust, agent, catalogue, and case-specific routes redirect to the relevant section or canonical application.

## Canonical application

Canonical host: `app.supermega.dev`

- `/` — **Home**: one accountable next action followed by direct entry to Commerce, Production, and Website.
- `/work/?team=product&view=work` — **Work**: accountable records for Product, Engineering, Growth, and Finance. On mobile, opening new work or selecting a work or agent record hides repeated overview controls, moves the focused task to the top, and restores the full team overview through its Back action. New work appears only in Work, and each view explains its current task.
- `/work/?team=engineering&view=agents` — **Agent Teams**: internal role, capability, assignment, evidence, human-owner, and approval-boundary records inside Teams; not another product or public route.
- `/products/website/` — **Website**: mobile opens one task-first editor with Edit and Publish, a compact page/Preview row, and page, navigation, or search controls inside Site settings; desktop retains Pages, Navigation, Publish, and Split preview. Revisioned evidence, approval, and a retained self-contained HTML site file remain unchanged; authenticated v3 workspaces sync through the managed API and all other sessions remain local or fail closed. Invalid local Website records stay unchanged, expose one Recovery settings path, and require the existing two-step reset before Website or Website-to-Commerce handoff records are removed.
- `/operations/commerce/?tab=orders` — **Commerce**: Orders opens first, Stock is the only second task, and close or exception controls stay collapsed inside Orders. Website and channel intake, fulfilment, attributable payment reconciliation, safe cancellation, stock movements, and daily close share one record. On desktop, Review order remains visible below the bounded field scroller; mobile retains normal page flow. The retired `/products/ecommerce/` path redirects to Commerce Orders.
- `/operations/production/?tab=production` — **Production**: Jobs opens first with completion and open-problem context; Problems is the only second task. Recurring job creation, output, quality, maintenance, equipment, issues, and one attributed event record stay within those two tasks. Authenticated workspaces use versioned tenant commands; the clearly labelled browser demo stays local.
- `/settings/` — pilot definition, evidence export, reset, and managed-readiness status.

Settings is a utility, not a primary product area. Home, Work, and Products are the only primary navigation. Website is the only addressable `/products/` prototype and is linked from the Commerce order intake. Deeper capability stays in internal tabs and bounded panels. Desktop workspaces fit the available viewport and use panel scrolling. Mobile Work and Agents use list-to-detail navigation; product tasks use short linear flows.

Before activation, the pilot definition captures the entry point, current record, baseline, target outcome, responsible owner, human authority boundary, and acceptance evidence. An incomplete pilot remains visible as an owner exception on Home.

## Product team lifecycle

Product is the first complete company-team workspace:

1. **Discover** — capture customer signal and problem evidence.
2. **Define** — name the outcome, owner, priority, and acceptance boundary.
3. **Build** — deliver with tests and implementation evidence.
4. **Release** — pass explicit checks and preserve release identity.
5. **Learn** — record usage evidence and the next decision.

Every team uses the same work contract: observable outcome, named owner, explicit state, structured evidence with provenance and verification status, reviewable brief, and human approval for consequential action. A work record cannot become done and a release check cannot become complete without evidence verified by an attributed human reviewer. Product proposals cannot become accepted decisions without a named human reviewer, decision note, and evidence reference. Delegated roles can be assigned existing team work and prepare evidence; they cannot send, pay, publish, merge, deploy, change access, or write to production from the browser-local roster.

## Template model

Templates configure the starting records and workflow while preserving the shared identity, evidence, approval, audit, and recovery foundation.

- `site-manifest.json` is the shared, machine-readable template contract. Each profile declares its valid entry points, real workflow stages, and default measurement.
- Commerce starts from Social commerce, Retail and wholesale, or Restaurant ordering.
- Production starts from Production control, Maintenance and downtime, or Quality and traceability.
- Service booking and material-receiving templates remain unadvertised until their records and actions exist in the product.
- Selecting a profile changes the Operations context and the exported pilot evidence; it does not create another page or code fork.
- A template is not a new brand, public page, code fork, or isolated demo domain.

## Data and authority boundary

- The default application remains an isolated browser-local trial, not a customer system of record.
- Team, bounded-agent, Website, Commerce, Production, approval, and setup records can be exercised locally. Website, Commerce, and Production can sync for an authenticated member with the matching least-privilege capability only after the complete private schema v4 contract is activated; core evidence export v9 includes the team roster and operating records while preserving the isolated-demo boundary when managed gates are unavailable.
- Website workspace v2 deterministically migrates valid v1 and metadata-only browser records without inventing a downloadable file or reopening historical approvals. A new approved record retains only ready public content, binds its own deterministic digest, and generates one self-contained responsive HTML file with escaped copy, safe internal or HTTPS destinations, and no evidence, reviewer, actor, or source metadata. Local mode uses a Web Lock for reread, transition, validation, write, and readback confirmation. Managed mode uses six explicit lifecycle events, optimistic server versions, authenticated actor evidence, exact UTF-16-compatible content fingerprints, append-only release history, and human-only evidence, approval, and site-file commands. Concurrent initialization or edits refresh from the authoritative workspace; artifact tampering, malformed state, stale versions, missing capability, unavailable storage, and unconfirmed writes fail closed without replacing the last valid screen.
- The Website-to-Commerce handoff carries only an approved local revision reference, SKU, and quantity. Commerce revalidates the source, requires a bounded human operator ID, and atomically records one accepted local intake plus its audit event. It then creates one deterministic browser-local `ecommerce_order_draft.v1` with an immutable MMK catalogue snapshot and visible missing customer, fulfilment, and payment fields. A locked, attributable completion migrates that valid draft to one `ecommerce_order_record.v1` in `ready_for_confirmation`, using a system-generated opaque customer reference, bounded fulfilment/payment methods, exact-retry idempotency, conflict rejection, and a second audit event. A separate accountable Commerce confirmation rechecks the item, immutable price, quantity, and stock before inserting the order and reserving local stock once. Commerce workspace v2 serializes browser writes, preserves its append-only stock-movement ledger, requires an unmatched attributed reservation before cancellation releases stock, keeps payment reconciliation immutable, and records a separate refund-due exception for a reconciled cancellation. Malformed v2 data fails closed instead of restoring stale v1 data, and storage failure cannot advance the interface. No customer confirmation, payment initiation, refund, delivery request, message, or external write occurs.
- Production workspace v2 deterministically migrates valid local v1 records without inventing historical events. Locked local writes reread the latest record, advance one revision, and atomically append one attributed job-create, output, issue-open, issue-resolution, or machine-state event. Managed mode initializes from one real zero-output job and one running machine, copies no demo records, binds evidence to the authenticated human, checks capability and expected version, preserves exact-retry idempotency, and refreshes after conflicts. Operators can create the next job inside Jobs without another route or tab, then record output against its hard target. Conflicting or stale transitions, duplicate jobs, malformed v2, target overflow, missing browser locks, and unconfirmed writes fail closed. Issue resolution retains its operator and evidence. Machine state is an operating record only: no telemetry, machine command, or external production write is connected.
- Managed readiness must not be implied until tenant persistence, identity, workspace isolation, source coverage, backup, recovery, audit, and runtime-role checks pass.
- The repeatable local PostgreSQL 17.10 rehearsal now runs the actual `PostgresTrialStore` with explicit non-autocommit transactions and proves the five migrations, v1 upgrade, exact runtime authority, TLS, tenant and browser-role isolation, transaction-local identity, revocation, immutable events, and backup/restore across two clean clusters. Its sanitized record is `hq/research/postgres17-rehearsal.json`; hosted Supabase, transaction-pool, Security Advisor, and production gates remain separate and incomplete.
- External sends, payments, publishing, access changes, and production writes remain owner-approved and auditable.
- The managed trial contract is `/api/trial/v1`; it fails closed until additive private schema v4, a high-entropy v2 signed actor identity, matching typed membership, audit, capability, runtime-role, and write gates pass. Schema v3 adds Website without granting `website.write` to existing members; schema v4 hardens role membership, event/surface binding, database-authored timestamps, trigger behavior, constraints, grants, and indexes. Approval proposals must use `decision_packet.v1` with a versioned subject, fact-or-analysis claims, source and capture provenance, verification state, uncertainty, visibility, baseline, target, current result, acceptance rule, and artifact reference. Verified claims require a digest; terminal decisions require a named human and a trimmed nonblank note; agent, service, unknown, and legacy identities cannot make them.
- The only approved database handoff is the read-only, fail-closed process in `docs/supermega-enterprise-activation.md`.

## Infrastructure adoption gates

Research does not automatically become a dependency.

- Evaluate durable workflow execution against the existing Cloud Tasks runtime before introducing Vercel Workflows.
- Add OpenTelemetry when managed workflow execution is activated; telemetry is diagnostic, not the authoritative audit ledger.
- Keep native tables until measured row volume or interaction complexity justifies TanStack Table or virtualization.
- Defer realtime fan-out until simultaneous operators create a measured need.
- Do not add a second CRM, queueing system, general workflow suite, or agent runtime without a proven gap.
- Keep resource intelligence and recommendation research inside HQ until it becomes verified implementation guidance; it is not another public catalogue or current product route.

## Internal HQ

- `hq/` in this repository is the active, machine-readable company authority.
- `hq/NOW.md` is the current operating brief and must be short enough to review daily.
- `hq/portfolio.json` defines the product portfolio, lifecycle, adoption gates, and explicit non-goals.
- The OneDrive `codex_hq` folder is a historical archive and intake source while it remains offline/unpinned on the Ally. It does not override the repository authority.
- Foundry, Ops, Console, agent runtimes, lead operations, and machine coordination remain internal capabilities rather than public products.

## Release authority

- Source branch: `main`
- App guard workflow: `.github/workflows/supermega-app-deploy.yml` (validation only; it cannot deploy)
- App Vercel project: `megaos`
- Coordinated production workflow: `.github/workflows/supermega-public-release.yml`
- Public Vercel project: `supermega-public`
- Both live domains must expose matching `__release.json` metadata for the released commit and context versions.
- The app guard validates contracts without mutation. The coordinated workflow verifies both Vercel projects, production environment-name contracts, candidates, promotion, post-promotion controls, and paired rollback without exposing secret values.
- Direct local production deployment is blocked. The coordinated GitHub workflow is the only production release path for both canonical domains.
