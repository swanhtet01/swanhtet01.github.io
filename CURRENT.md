# SuperMega current direction

Last confirmed: 2026-07-25
Authority: this file, `site-manifest.json`, and `hq/portfolio.json`

SuperMega builds simple operating products for Myanmar businesses. The customer portfolio is **Shop**, **Plant**, **Website**, **Ecommerce**, and a bounded **AI Agent Solutions** layer. SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal company systems.

## Product map

1. **Shop** — orders, stock, fulfilment, payment status, exceptions, and daily close.
2. **Plant** — jobs, output, materials, quality, equipment, maintenance, and shift exceptions.
3. **Website** — an approved brief to a finite responsive website, review, and retained site artifact.
4. **Ecommerce** — a simple storefront and ordering surface that sends structured order intent into Shop.
5. **AI Agent Solutions** — bounded assistants that prepare work inside the four products and always expose their inputs, output, evidence, and approval boundary.

`commerce` and `production` remain stable internal runtime and database surface identifiers during migration. They are not customer-facing product names. Ecommerce is not a second Shop back office: it owns the customer storefront, product display, and order-intent experience; Shop owns the accountable order, stock, fulfilment, payment-status, and close records.

## Product status

- **Shop** — implemented local release candidate at `/shop/` under the stable internal `commerce` runtime. `/operations/commerce/` is compatibility-only and resolves to the same records.
- **Plant** — implemented local release candidate at `/plant/` under the stable internal `production` runtime. `/operations/production/` is compatibility-only and resolves to the same records.
- **Website** — implemented local release candidate at `/products/website/`; it can produce a deterministic downloadable site artifact but cannot publish or change a domain.
- **Ecommerce** — implemented local and managed storefront maker at `/products/ecommerce/`. It reads a Shop catalogue snapshot without changing it, lets the operator choose customer-visible products and copy, produces a deterministic preview digest, and creates an idempotent request receipt marked `pending_shop_review`. Browser-local mode saves setup only on that device. Authenticated managed mode saves the storefront configuration against the exact Shop catalogue digest in the revisioned tenant workspace, recovers it through bootstrap, preserves edits on version conflict, and can retain the exact request receipt in Shop. A Shop operator must still open and revalidate a source-locked draft; only Shop's separate accountable action gate can create an order or reserve stock.
- **AI Agent Solutions** — planned real prototype at `/agents/`. The first solution is Order Intake: approved message or form input to a structured draft, with provenance, evaluation, human review, and zero side effects.

No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

## Canonical application

Canonical host: `app.supermega.dev`

- `/` — compact home: one accountable next action and direct entry to Shop, Plant, Website, Ecommerce, and Agents according to truthful availability.
- `/shop/` — Shop Orders first; Stock second.
- `/plant/` — Plant Jobs first; Problems second.
- `/products/website/` — Website Site, Preview, and Publish workflow.
- `/products/ecommerce/` — Ecommerce storefront setup, responsive preview, local request receipt, optional authenticated Shop-inbox retention, and explicit handoff to a source-locked Shop draft; clearly non-publishing and without automatic operational consequences.
- `/agents/` — reserved Agent Solutions workspace; do not present it as available until Order Intake passes evaluation and review gates.
- `/work/` — internal SuperMega HQ work and agent-team coordination.
- `/settings/` — setup, evidence export, reset, and managed-readiness utility.

The old `/operations/commerce/` and `/operations/production/` routes are temporary compatibility paths for the stable runtime surfaces. They must resolve to the same records as Shop and Plant, never create duplicate apps or state.

Home, Products, and internal Work should reveal one clear task at a time. Desktop may use bounded panels; mobile uses list-to-detail or short linear flows. Do not add a route, tab, button, module, domain, or product card unless it owns a real user job and implemented state transition.

## Public company surface

- `supermega.dev` is one compact company page.
- The only support pages are `/contact/` and `/privacy/`.
- The page explains Shop, Plant, Website, Ecommerce, and bounded AI assistance without a catalogue, pricing theatre, or fake launch claims.
- The brand is SuperMega with the jade `>_` terminal mark on a warm light interface, dark ink, and restrained status colors.
- Historical products, demos, client deployments, YTF material, and case-specific routes are not current SuperMega public context.

## Product lifecycle

Every product uses one evidence-backed lifecycle:

1. **Discover** — name the user, problem, current workaround, and evidence.
2. **Define** — set the outcome, owner, scope, authority boundary, and acceptance test.
3. **Build** — implement the smallest complete workflow with tests and recovery.
4. **Release** — preserve release identity and pass security, data, mobile, and rollback checks.
5. **Learn** — measure usage, corrections, time, exceptions, and the next decision.

A prototype remains labelled as such. A product becomes available only after the workflow, persistence boundary, failure modes, evidence, and named-user acceptance are proven.

## Templates and customization

Templates configure records, roles, vocabulary, starting data, and workflow steps on one shared product foundation. They are not separate brands, code forks, domains, or demo pages.

- Shop begins with Social commerce, Retail and wholesale, and Restaurant ordering.
- Plant begins with Production control, Maintenance and downtime, and Quality and traceability.
- Website and Ecommerce start with one validated base workflow before industry templates are added.
- Agent solutions start with Order Intake. Website Brief and Plant Shift Handoff follow only if the first agent improves the accepted workflow.

`site-manifest.json` remains the machine-readable public and template contract. Internal runtime IDs may remain `commerce` and `production` while names, routes, and customer language use Shop and Plant.

## AI and agent boundary

AI may inspect approved records, classify, extract, organize, summarize, draft, compare, and escalate. Every generated result must retain provenance, model and prompt version, evaluation state, and a responsible human review step.

AI and delegated agents may not independently send customer messages, charge or refund money, publish a site, change a domain, merge, deploy, change access, operate machinery, or write to production. Agent Teams in HQ are coordination records, not proof of autonomous employees or a production agent runtime.

## Data and managed-mode boundary

- The default app remains an isolated browser-local trial.
- Shop and Plant currently use the stable `commerce` and `production` state contracts; renaming the interface must not migrate, fork, or silently reset those records.
- Website retains revisioned content, evidence, approval, deterministic artifact generation, recovery, and a controlled handoff.
- Ecommerce may retain a catalogue-bound storefront configuration and structured order intent until a responsible Shop operator confirms the intent. Managed setup and inbox writes use the existing tenant-scoped identity, revision, idempotency, event, and bootstrap contracts; neither owns stock, fulfilment, reconciliation, refund, or daily-close authority.
- Managed mode remains locked behind authenticated tenant identity, least-privilege capabilities, private schema migrations, isolation, immutable events, backup, recovery, runtime-role checks, and confirmed writes.
- External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved and auditable.
- The only approved database handoff is the read-only, fail-closed process in `docs/supermega-enterprise-activation.md`.

## Internal company system and R&D

- `hq/` is the active machine-readable company authority.
- `hq/NOW.md` is the short daily operating brief; `hq/WORKBOARD.md` is assignment authority.
- SuperMega HQ coordinates Product, Engineering, Growth, Finance, evidence, exceptions, and bounded agents. It is internal machinery, not another customer product.
- The supplied Codex operating-system and free-resource packs govern R&D discipline: discover, verify, test, compare, package, review, and monitor.
- Resource intelligence stays inside HQ until it produces verified implementation guidance for a real product. It must not become a public AI-tools directory.
- Social posts can provide discovery signals but cannot verify product, pricing, security, or market claims.

## Release authority

- Source branch: `main`
- App Vercel project: `megaos`
- Public Vercel project: `supermega-public`
- Coordinated workflow: `.github/workflows/supermega-public-release.yml`
- Both production domains must expose matching `__release.json` metadata for the reviewed commit and context versions.
- Direct local production deployment is blocked. The coordinated GitHub workflow is the only production release path.

## Current execution order

1. Rehearse authenticated Ecommerce setup persistence and request-inbox retention on one owner-approved isolated non-production tenant; preserve the separate Shop action gate and collect cross-device, replay, conflict, recovery, and zero-conversion evidence.
2. Run Order Intake through a real server-only provider and expose review UI only if the completed evaluator passes.
3. Validate Website with one named business and accepted artifact.
4. Repeat Shop and Plant on one isolated hosted tenant before any production write activation.
