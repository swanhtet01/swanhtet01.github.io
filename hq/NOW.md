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

- HQ caps 12 dormant roles, four active/batch jobs, two Kernel agents per cycle, and zero idle compute; overrides fail closed and duplicate ceilings are removed.
- Kernel has four owner-bound slots with 120-second stale recovery; a fifth cycle stops before model use and failed work returns for retry (`ca5070e`).
- Ally audit after a non-terminating trim: RAM 77.1%, Codex 1.21 GB, zero models, one worker, no dev server/duplicate listener, and no stopped process. Multi-agent remains disabled; dormant plugins are off for next restart (`72853ac`).
- All seven company jobs use SuperMega Agent Operations or core GitHub. Catalogs are exact-tenant scoped, so YTF identities cannot render in core operations (`b46c386`).
- Hosted scheduling is dormant with zero registered crons. A signed seven-day bundle now binds five proof digests, tenant, owner decision, canonical project, production, and exact commit; flag-only, preview, stale, incomplete, or tampered attempts stop before worker invocation (`07dd959`).
- Storage privacy now has a six-request owner-confirmed verifier, zero-network configuration preflight, and secret-free owner handoff. It rejects privileged keys, redirects, proxies, oversized/duplicate JSON, and unconfirmed targets; 13 focused tests and an 11-case self-test pass (`be78a02`). Hosted proof remains blocked.
- Each CEO cycle selects at most one HQ-authorized outcome. Hosted Storage proof, protected preview, and named pilot work remain blocked; completed, in-flight, duplicate, or invalid work stops before claims, models, or sends. The owner brief uses four fixed reads and one synthesis call (`cdd925a`).
- CEO completion metadata persists before notification; acceptance is a separate immutable owner/operator verdict. Reports store no brief/provider rows and publish efficiency only with durable, complete, valid usage and evaluation coverage (`78f2297`).
- Shop covers orders, stock, purchasing, fulfilment, payments, returns, and close at `/shop/`; rows distinguish trusted from legacy totals, and attributable closes export formula-safe accounting CSV (`8f3114e`).
- Plant is task-first at `/plant/` and controls no equipment.
- Website builds a guarded preview, approved site file, and tenant-bound release plan at `/website/`; it never deploys (`a400a86`).
- Ecommerce uses versioned Shop data for a recoverable multi-line cart and deterministic quote. Managed workspaces retain exact requests in the Shop inbox; V1 requests stay readable, and only Shop confirmation creates an order (`aed737a`).
- AI remains gated; Order Intake passed 20 local cases, but provider execution still needs credentials.
- Client setup is two steps with one manifest-backed smart import; exact matches collapse and exceptions open for review (`ab9a89e`).
- Shop Stock adds two-location masters, lot/serial evidence, transfers, reservations, ATP, replay, locked writes, and rollback in its existing tab (`5fa93a9`, `2790f9d`).
- Plant Jobs persists a managed 12-material BOM/routing chain with multi-operation WIP, actual minutes, genealogy, quality gates, releases, replay, and rollback (`a625b4a`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.

## Verified baseline

- Current local checkpoints: product `a625b4a`, agent operations `be78a02`, operations `63a245f`, and security `98b8044`.
- App/local contracts pass: 302 Python/50 Commerce tests, 216 Commerce/42 Plant/258 Production/94 Website/18 Ecommerce buying checks, lint/build, 64 security checks, and a 479,728-byte largest chunk. Kernel remains separately gated at 277 tests.
- Rendered setup and four phone-width products have no overflow or error overlay. Plant also passes desktop lifecycle, reload, and phone first-run/released-state checks.
- Core first-action QA leads Shop Stock, incomplete orders to Promise or Payment, Plant alerts to Problems or output, and invalid Website briefs to their first error. Mobile controls are at least 44 px with focus-safe fixed navigation (`36fa7dd`); guide and review actions create no record.
- Product checkpoint `a625b4a` is on a clean fast-forward descendant of open draft PR #258 head `338b6fd`. Vercel `supermega-public` serves both domains from live `6885c320` in `isolated_demo` with zero managed coverage and database/schema/audit/writes disabled; remote checks exclude the local delta.

`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Website, Plant, and Ecommerce have tenant-bound persistence contracts but still lack hosted cross-device/activation proof.
- Supabase `supermegabase` is active on Postgres 17.6, but it is not an accepted trial target: it contains existing enterprise records, has only one recorded migration, and the security advisor reports 27 public tables with RLS enabled but no policies. No isolated branch was verified, so managed writes remain off.
- The candidate is not on GitHub or Vercel; live remains `6885c320` and PR #258 remains `338b6fd`. The next external action is an approved fast-forward-only push of the clean release branch.
- Preview remains blocked until the exact `supermega-public` project is linked to the clean candidate commit; no fallback project or domain is allowed.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Local scheduler authority emits no crons and no signed activation bundle exists. Live `megaos` cron/environment cleanup remains unverified because grouped log reads timed out then returned 403; no provider state changed.
- SAP-grade gaps remain: Shop tax/accounting posting; Plant warehouse/cost, calibration, OEE; Website hosted CMS/media and release execution; Ecommerce payment, shipping, tax, returns.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve roster roles, four active assignments, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice must keep one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and human approval for consequential actions. Enterprise depth is added inside the four products, not as more pages or products.

## Next evidence

1. After an approved fast-forward-only push, review PR #258 from clean commit `a625b4a` and rerun the coordinated remote checks.
2. Link that exact commit to a protected `supermega-public` preview and repeat desktop/mobile Shop, Plant, Website, Ecommerce, reload, and duplicate-handoff journeys without mutating aliases.
3. On an approved isolated Supabase target, prove private Storage, RLS, replay/isolation, recovery, and one real managed tenant before enabling writes.
4. Repeat the 12-profile rehearsal with one founder-approved named pilot company and measure import correction, setup, human review, and first-value time.
5. Only after preview, managed-security, rollback, and observability evidence passes, approve production promotion; begin public marketing after the live release re-verifies the same commit and one pilot can complete onboarding.
