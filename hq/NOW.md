# HQ now

Updated: 2026-07-26
Owner: founder / CEO
Mode: Codex-only guarded release candidate; production remains isolated

## North-star outcome

Prove one measured workflow where SuperMega keeps the record and a responsible owner resolves exceptions.

## Portfolio correction

The active delivery focus is:

1. **Shop** — orders, stock, fulfilment, payment status, exceptions, and daily close.
2. **Plant** — jobs, output, problems, equipment, maintenance, and shift handoff.
3. **Website** — a local website builder and review workflow.
4. **Ecommerce** — a storefront builder with request receipt and Shop handoff.

AI assistance stays gated R&D until these four pass onboarding, import, recovery, security, and pilot evidence.

`Commerce` and `Production` remain internal IDs. Ecommerce owns the customer storefront and order intent; Shop owns the operating record and close.

HQ, Work, Agent Teams, R&D, Ops, Console, and machine coordination are internal, not customer products.

## Implemented reality

- HQ uses four teams. One contract caps 12 roles, four active/batch jobs, two Kernel agents per cycle, and zero idle compute; overrides fail closed, and the default workspace no longer duplicates a 256-role ceiling.
- Kernel company execution now uses four atomic, owner-bound capacity claims with 120-second stale recovery. A fifth cycle stops before model use, queued work returns to planned for retry, and every admitted path releases its slot. Scheduler command failures capture raw native streams and never interpolate secret-bearing arguments (`ca5070e`).
- One checked manifest now makes Vercel production the sole recurring scheduler for `megaos`: a 15-minute queue route plus a 00:45 UTC daily route, bounded to 97 invocations/day. Cloud Tasks dispatches only on demand; Google Cloud Scheduler mutation is retired. Production-only protected credentials, exact path/cadence, and duplicate/conflicting/retired state are enforced before release (`6c19084`).
- Shop covers guarded orders, stock, purchasing, fulfilment, payment/refund, returns, and close at `/shop/`.
- Plant covers jobs, output/material evidence, problems, holds, handoff, equipment, downtime, and maintenance at `/plant/`; it controls no equipment.
- Website turns one brief into Preview, guarded Save, and Review at `/website/`; it never deploys.
- Ecommerce reads versioned Shop data. Setup, Save, receipt, and handoff focus the next step. Review exposes source and consequence; Cancel restores the exact prepared draft. Only accountable Shop confirmation can create an order.
- AI assistance remains gated shared infrastructure; Order Intake passed 20 local cases, but the provider runner remains at the credential gate.
- Client setup now uses one manifest-backed two-step flow, stable template IDs, detail-preserving switches/deep links, and one smart-import path. Exact matches collapse detail; exceptions open for review; the duplicate Shop importer is gone (`ab9a89e`).
- Shop `social-commerce` now has a deterministic, versioned recipe bound to the trusted importer and human-approved Commerce lifecycle. Fresh, upgrade, and rollback plans perform no writes (`9ba8569`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback while clearing database, hosted-auth, model, worker, and write authority; the full local command proxies canonical FastAPI while keeping managed data disconnected and writes locked. Records stay browser-local by default; hosted production activation is not proven.

## Verified baseline

- Current local checkpoints: product `9ba8569`, agent operations `6c19084`, operations `63a245f`, and security `98b8044`.
- App build and all local contracts pass; the Kernel passes 262 tests, 69 connectors/993 calls, and 15 crews/214 checks. The provisioning contract passes 12 focused adversarial tests and all Python coverage passes 227 tests.
- React Router is isolated in a 43,870-byte cacheable chunk. The current product checkpoint's largest JavaScript chunk is 471,580 bytes and remains below the build gate.
- Focused coverage includes 205 Shop, 256 Plant, 94 Website, 109 client-onboarding, 54 managed-import, and 17 trusted-server import tests.
- Rendered 390x844/1440x900 setup and all four phone-width product routes have no horizontal overflow or error overlay; switches preserve client details and exact imports collapse review detail.
- Core first-action QA leads Shop Stock with the exact shortage, guides incomplete orders to Promise or Payment, sends Plant alerts to Problems and jobs to output, puts open Problems before Equipment, and moves invalid Website briefs to their first error. Mobile controls are at least 44 px; fixed navigation now preserves focus and click clearance (`36fa7dd`), and guide or review actions create no record.
- Last remote release snapshot: `b67db94` is 0 behind / 230 ahead of open draft PR #258 head `338b6fd`; `megaos` production is READY at `6885c320` with no 24-hour runtime errors; remote checks exclude the local delta. See `hq/research/release-reconciliation-2026-07-26.md`.

`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce and Website lack hosted cross-device/activation proof; managed setup and commands stay digest-bound.
- No isolated hosted Supabase target has repeated database and private Storage proof.
- The candidate is not on GitHub or Vercel; live remains `6885c320` and PR #258 remains `338b6fd`. The next external action is an approved fast-forward-only push.
- Preview remains blocked until the exact `megaos` project and credentials are linked; no fallback domain is allowed.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Read-only Vercel observability reports zero production Agent Run projects in both 30 and 90 days. Local contracts now select Vercel production alone and retire Google Cloud Scheduler mutation, but the available connector did not expose live cron definitions or environment metadata. Hosted cadence and production-only secret scope therefore remain unverified until an owner-approved credentialed read; no provider state was changed.
- The products have SAP-grade accountability goals, not SAP feature parity. Shop still needs multi-location/master-data depth; Plant needs BOM, routing, planning, genealogy, quality, and maintenance depth; Website needs versioned content and release operations; Ecommerce needs full catalog, checkout, tax, shipping, payment, and order lifecycle.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve roster roles, four active assignments, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Enterprise quality sequence

1. **Provisioning** — version roles, objects, states, mappings, permissions, checks, upgrades, and rollback.
2. **Shop** — masters, locations, lots/serials, available-to-promise, purchasing, pricing/tax, and accounting boundaries.
3. **Plant** — BOM/routing, MRP/capacity, genealogy, quality, maintenance, calibration, and OEE.
4. **Website** — versioned blocks/tokens, CMS/media/localisation, roles, forms/leads/analytics, deploy and rollback evidence.
5. **Ecommerce** — PIM, cart/checkout, tax/payment/shipping boundaries, order/return lifecycle, and Shop handoff.

Each slice must keep the interface task-first: one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and no consequential AI action without human approval.

## Next evidence

1. Prove ENG-075's two-location stock lifecycle, then extend the accepted recipe to the other eleven profiles without new setup pages.
2. Repeat the 12-profile rehearsal with one founder-approved named pilot company and measure import correction, setup, and human review time.
3. After an approved push and exact Vercel link, review that clean commit without deploying or mutating aliases.
4. On an approved isolated Supabase target, prove private Storage, RLS, replay/isolation, and recovery.
5. With owner-approved credentialed read access, compare live `megaos` cron and environment metadata against checkpoint `6c19084`; keep every provider mutation behind a separate owner decision.
