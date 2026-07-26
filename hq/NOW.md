# HQ now

Updated: 2026-07-27
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
- Kernel has four owner-bound slots with 120-second stale recovery; a fifth cycle stops before model use and failed work returns for retry (`ca5070e`).
- The Ally runs one 4,096-token, 30-second scale-to-zero worker; unchanged evidence-bound direct missions reuse for 24 hours. Live check: idle, no queue, schedule, or loaded model.
- All seven company jobs use SuperMega Agent Operations or core GitHub. Catalogs are exact-tenant scoped, so YTF identities cannot render in core operations (`b46c386`).
- Hosted scheduling is dormant with zero registered crons and a second runtime activation gate. After five managed-security proofs, the reviewed plan is hourly plus daily, at most 25 invocations/day instead of 97 (`2472c2f`).
- Shop covers guarded orders, stock, purchasing, fulfilment, payment/refund, returns, and close at `/shop/`.
- Plant stays task-first at `/plant/` and controls no equipment.
- Website turns a brief into Preview, guarded Save/Review, a release package, and an owner-gated plan at `/website/`; it never deploys.
- Ecommerce reads versioned Shop data and now provides a multi-item cart, deterministic 15-minute quote, explicit tax/shipping/payment boundaries, reload recovery, and a duplicate-safe multi-line Shop handoff. Only accountable Shop confirmation can create an order (`52917c5`).
- AI assistance remains gated shared infrastructure; Order Intake passed 20 local cases, but the provider runner remains at the credential gate.
- Client setup now uses one manifest-backed two-step flow, stable template IDs, detail-preserving switches/deep links, and one smart-import path. Exact matches collapse detail; exceptions open for review; the duplicate Shop importer is gone (`ab9a89e`).
- Shop Stock now has a lazy-loaded two-location layer in its existing tab: masters, lot/serial evidence, paired transfers, reservations, ATP, exact replay, digest validation, locked writes, and rollback (`5fa93a9`, `2790f9d`).
- Plant Jobs now has a lazy order-execution layer: immutable plan, shortfall gate, lot genealogy, quality hold/reinspection, human release, exact replay, and locked write/rollback (`0831ad7`, `920c13d`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback while clearing database, hosted-auth, model, worker, and write authority; the full local command proxies canonical FastAPI while keeping managed data disconnected and writes locked. Records stay browser-local by default; hosted production activation is not proven.

## Verified baseline

- Current local checkpoints: product `52917c5`, agent operations `2472c2f`, operations `63a245f`, and security `98b8044`.
- App and local contracts pass: 275 Python tests, frontend lint/build, 14 Ecommerce buying checks, 16 Shop-handoff checks, and the guarded release suite. Kernel retains 262 tests, 69 connectors/993 calls, and 15 crews/214 checks.
- Rendered setup and four phone-width product routes have no horizontal overflow or error overlay. Plant additionally passes a seven-step 1280x720 lifecycle, reload persistence, and a 390x844 first-run/released-state audit with its primary action visible.
- Core first-action QA leads Shop Stock, incomplete orders to Promise or Payment, Plant alerts to Problems or output, and invalid Website briefs to their first error. Mobile controls are at least 44 px with focus-safe fixed navigation (`36fa7dd`); guide and review actions create no record.
- Product checkpoint `52917c5` is on a clean fast-forward descendant of open draft PR #258 head `338b6fd`. Vercel `supermega-public` serves both domains at live `6885c320`; it is healthy but intentionally reports `isolated_demo`, zero managed coverage, and database/schema/audit/writes disabled. No grouped seven-day runtime errors were reported; remote checks exclude the local delta.

`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce and Website lack hosted cross-device/activation proof; managed setup and commands stay digest-bound.
- Supabase `supermegabase` is active on Postgres 17.6, but it is not an accepted trial target: it contains existing enterprise records, has only one recorded migration, and the security advisor reports 27 public tables with RLS enabled but no policies. No isolated branch was verified, so managed writes remain off.
- The candidate is not on GitHub or Vercel; live remains `6885c320` and PR #258 remains `338b6fd`. The next external action is an approved fast-forward-only push of the clean release branch.
- Preview remains blocked until the exact `supermega-public` project is linked to the clean candidate commit; no fallback project or domain is allowed.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Local scheduler authority now emits no crons. Live `megaos` cron/environment cleanup remains unverified because grouped log reads timed out then returned 403; no provider state changed.
- The products target SAP-grade accountability, not feature parity. Shop still needs managed proof, receiving/count reconciliation, pricing/tax, and accounting adapters; Plant needs managed persistence, multi-material import UI, warehouse/cost/accounting adapters, calibration, and OEE; Website needs versioned content/release operations; Ecommerce needs catalog, checkout, tax, shipping, payment, and returns depth.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve roster roles, four active assignments, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice must keep one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and human approval for consequential actions. Enterprise depth is added inside the four products, not as more pages or products.

## Next evidence

1. After an approved fast-forward-only push, review PR #258 from clean commit `52917c5` and rerun the coordinated remote checks.
2. Link that exact commit to a protected `supermega-public` preview and repeat desktop/mobile Shop, Plant, Website, Ecommerce, reload, and duplicate-handoff journeys without mutating aliases.
3. On an approved isolated Supabase target, prove private Storage, RLS, replay/isolation, recovery, and one real managed tenant before enabling writes.
4. Repeat the 12-profile rehearsal with one founder-approved named pilot company and measure import correction, setup, human review, and first-value time.
5. Only after preview, managed-security, rollback, and observability evidence passes, approve production promotion; begin public marketing after the live release re-verifies the same commit and one pilot can complete onboarding.
