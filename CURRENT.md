# SuperMega current direction

Last confirmed: 2026-07-22
Authority: this file, `site-manifest.json`, and `hq/portfolio.json`

SuperMega is operating software for real company work. It connects accountable company delivery, channel-to-fulfilment commerce, production control, evidence, and owner decisions without turning every capability into a separate product or page.

## Product thesis

SuperMega competes on implementation readiness, local operating context, evidence, and controlled execution—not on the size of a tool catalogue.

The product has three customer-facing capabilities inside one application:

1. **Company system** — Today plus Product, Engineering, Growth, and Finance team workspaces.
2. **Commerce** — customer channel, order, stock, fulfilment, payment, follow-up, and close.
3. **Production** — plan, output, materials, quality, equipment, maintenance, exceptions, and shift handoff.

AI is an embedded execution capability. It may inspect approved records, organize, summarize, draft, and escalate. It is not a separate public product, fake employee page, or substitute system of record.

## Public company surface

- `supermega.dev` is one compact product page.
- The only support pages are `/contact/` and `/privacy/`.
- The page explains the company system, Product lifecycle, Commerce, Production, configurable templates, and authority boundary without a long catalogue or public pricing theatre.
- The brand is SuperMega with the green `>_` terminal mark on a dark, dense operating interface.
- Historical product, demo, trust, agent, catalogue, and case-specific routes redirect to the relevant section or canonical application.

## Canonical application

Canonical host: `app.supermega.dev`

- `/` — **Today**: company work, customer orders, production exceptions, release readiness, briefs, and owner decisions.
- `/work/?team=product&view=board` — **Teams**: Product, Engineering, Growth, and Finance workspaces.
- `/operations/commerce/?tab=today` — **Commerce**: channel orders, fulfilment, stock, local payment, and daily close.
- `/operations/production/?tab=today` — **Production**: plan versus actual, output, quality, maintenance, equipment, and issues.
- `/settings/` — pilot definition, evidence export, reset, and managed-readiness status.

Settings is a utility, not a primary product area. Routes stay few; deeper capability is organized through internal tabs and bounded panels. Desktop workspaces fit the available viewport and use panel scrolling. Mobile layouts use a short linear flow.

Before activation, the pilot definition captures the entry point, current record, baseline, target outcome, responsible owner, human authority boundary, and acceptance evidence. An incomplete pilot remains visible as an owner exception on Today.

## Product team lifecycle

Product is the first complete company-team workspace:

1. **Discover** — capture customer signal and problem evidence.
2. **Define** — name the outcome, owner, priority, and acceptance boundary.
3. **Build** — deliver with tests and implementation evidence.
4. **Release** — pass explicit checks and preserve release identity.
5. **Learn** — record usage evidence and the next decision.

Every team uses the same work contract: observable outcome, named owner, explicit state, structured evidence with provenance and verification status, reviewable brief, and human approval for consequential action. A work record cannot become done and a release check cannot become complete without verified evidence. Product proposals cannot become accepted decisions without a named human reviewer, decision note, and evidence reference.

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
- Team, Commerce, Production, approval, and setup records can be exercised locally and exported for review; evidence export v8 includes the exact workflow profile, structured team evidence, API-compatible decision packets with provenance and named human decisions, and the human-confirmed before/after action ledger used for the pilot.
- Managed readiness must not be implied until tenant persistence, identity, workspace isolation, source coverage, backup, recovery, audit, and runtime-role checks pass.
- External sends, payments, publishing, access changes, and production writes remain owner-approved and auditable.
- The managed trial contract is `/api/trial/v1`; it fails closed until additive private schema v2, a high-entropy v2 signed actor identity, matching typed membership, audit, capability, and write gates pass. Approval proposals must use `decision_packet.v1` with a versioned subject, fact-or-analysis claims, source and capture provenance, verification state, uncertainty, visibility, baseline, target, current result, acceptance rule, and artifact reference. Verified claims require a digest; terminal decisions require a named human and a trimmed nonblank note; agent, service, unknown, and legacy identities cannot make them.
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
