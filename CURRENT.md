# SuperMega current direction

Last confirmed: 2026-08-21
Authority: this file, `site-manifest.json`, and `hq/portfolio.json`

SuperMega builds simple operating products for Myanmar businesses. The customer portfolio is exactly **Shop**, **Plant**, **Website**, and **Ecommerce**. Bounded **AI assistance** is a shared capability inside those products, not a fifth product. SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal company systems.

## Product map

1. **Shop** — orders, stock, fulfilment, payment status, exceptions, and daily close.
2. **Plant** — jobs, output, materials, quality, equipment, maintenance, and shift exceptions.
3. **Website** — an approved brief to a finite responsive website, review, and retained site artifact.
4. **Ecommerce** — a simple storefront and ordering surface that sends structured order intent into Shop.

AI assistance may prepare work inside these four products only when it exposes inputs, output, evidence, and the responsible human approval boundary.

`commerce` and `production` remain stable internal runtime and database surface identifiers during migration. They are not customer-facing product names. Ecommerce is not a second Shop back office: it owns the customer storefront, product display, and order-intent experience; Shop owns the accountable order, stock, fulfilment, payment-status, and close records.

## Product status

- **Shop** — available at `/shop/` in the live isolated app under the stable internal `commerce` runtime. The reviewed local candidate adds native Spa prepaid packages whose reconciled sales and completed-treatment redemptions remain in the same accountable Shop record. `/operations/commerce/` is compatibility-only and resolves to the same records.
- **Plant** — available at `/plant/` in the live isolated app under the stable internal `production` runtime. `/operations/production/` is compatibility-only and resolves to the same records.
- **Website** — available at `/website/` in the live isolated app; it can produce a deterministic downloadable site artifact but cannot publish or change a domain.
- **Ecommerce** — available at `/ecommerce/` in the live isolated app. It reads versioned Shop catalogue data, builds a multi-item cart, produces a deterministic 15-minute quote, recovers across reload, and sends one duplicate-safe multi-line handoff into Shop. Tax, shipping, and payment remain explicit adapter boundaries; no charge occurs. Only Shop's accountable confirmation can create an order or reserve stock. Hosted managed persistence is not yet proven.
- **AI assistance** — shared, gated R&D capability. `/agents/` is compatibility-only and resolves to HQ's delegated roles. The first workflow is Order Intake: approved message or form input to a structured draft, with provenance, evaluation, human review, and zero side effects.

No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

## Canonical application

Canonical host: `app.supermega.dev`

- `/` — compact home: one accountable next action and direct entry to the four products according to truthful availability.
- `/shop/` — Shop Orders first; Stock second.
- `/plant/` — Plant Jobs first; Problems second.
- `/website/` — Website Site, Preview, and Publish workflow.
- `/ecommerce/` — Ecommerce storefront setup, responsive preview, local request receipt, optional authenticated Shop-inbox retention, and explicit handoff to a source-locked Shop draft; clearly non-publishing and without automatic operational consequences.
- `/agents/` — compatibility-only path to HQ's delegated roles; it is not a product route or separate workspace.
- `/work/` — internal SuperMega HQ work and agent-team coordination.
- `/settings/` — setup, evidence export, reset, and managed-readiness utility.

The old `/operations/commerce/` and `/operations/production/` routes are temporary compatibility paths for the stable runtime surfaces. They must resolve to the same records as Shop and Plant, never create duplicate apps or state.

Home, Products, and internal Work should reveal one clear task at a time. Desktop may use bounded panels; mobile uses list-to-detail or short linear flows. Do not add a route, tab, button, module, domain, or product card unless it owns a real user job and implemented state transition.

## Public company surface

- `supermega.dev` is one compact company page.
- The only support pages are `/contact/` and `/privacy/`.
- The page explains Shop, Plant, Website, Ecommerce, and bounded AI assistance without a catalogue, pricing theatre, or fake launch claims.
- The home page and each product landing page must show the product's first operating loop before advanced module lists, so a new owner can see the first useful job without learning the whole system.
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
- Website begins with Business presence, Lead generation, and Catalog showcase.
- Ecommerce begins with Social storefront, Pickup and preorder, and Wholesale request.
- Shared AI assistance starts with Order Intake. Website Brief and Plant Shift Handoff follow only if the first workflow improves the accepted product workflow.

All four products share one versioned browser-local CSV intake: downloadable template, explainable header mapping, row-level validation, Unicode handling, duplicate detection, deterministic digests, and a zero-write staging package. Product writes require a separate accountable confirmation.

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
- Product control rotates one UTC-day focus across Shop, Plant, Website, and Ecommerce. One dormant Delivery Planner becomes the only active specialist and must return one build-ready work order covering the user job, state transition, data contract, recovery, mobile, import reconciliation, security, and automated acceptance; the rotation adds no agent or idle compute.
- The supplied Codex operating-system and free-resource packs govern R&D discipline: discover, verify, test, compare, package, review, and monitor.
- Resource intelligence stays inside HQ until it produces verified implementation guidance for a real product. It must not become a public AI-tools directory.
- Social posts can provide discovery signals but cannot verify product, pricing, security, or market claims.

## Release authority

- Source branch: `main`
- Customer-facing Vercel project: `supermega-public` for both production domains
- Internal hosted runtime project: `megaos`; it is not public domain authority
- Coordinated workflow: `.github/workflows/supermega-public-release.yml`
- PR #258 is merged and is historical release evidence, not an active handoff target.
- Current production and `origin/main` resolve to `d268bd6366848e76e64ea2991048589f608984e3`; this candidate diverges from common base `5d1c5d7c903e9154cfa0af0f12991fea1071b51b` (54 main-only / 255 candidate-only commits at the 2026-07-30 audit) and must not be fast-forwarded.
- Both production domains must expose matching `__release.json` metadata for the reviewed commit and context versions.
- Direct local production deployment is blocked. The coordinated GitHub workflow is the only production release path.

## Current execution order

1. Start a fresh isolated integration branch from current `origin/main`, port only reviewed candidate checkpoints in bounded batches after owner authorization, run fresh checks, and review a protected `supermega-public` preview without changing production aliases. Never reuse merged PR #258 or fast-forward this divergent branch.
2. Prove the four products on a genuinely isolated managed tenant with RLS, recovery, server-only credentials, and no cross-tenant access.
3. Run one named Shop design-partner pilot, then validate Website and Ecommerce with the same accountable onboarding and evidence rules.
4. Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.
