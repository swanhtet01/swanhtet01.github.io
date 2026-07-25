# HQ now

Updated: 2026-07-25
Owner: founder / CEO
Mode: Codex-only guarded release candidate; production remains isolated

## North-star outcome

Prove one measured workflow where SuperMega keeps the record and a responsible owner resolves exceptions.

## Portfolio correction

The customer product map is:

1. **Shop** — orders, stock, fulfilment, payment status, exceptions, and daily close.
2. **Plant** — jobs, output, problems, equipment, maintenance, and shift handoff.
3. **Website** — a local website builder and review workflow.
4. **Ecommerce** — a storefront builder with request receipt and Shop handoff.
5. **AI Agent Solutions** — bounded assistance, beginning with Order Intake.

`Commerce` and `Production` remain internal IDs. Ecommerce owns the customer storefront and order intent; Shop owns the operating record and close.

SuperMega HQ, Work, Agent Teams, R&D, Ops, Console, and machine coordination are internal systems, not extra public products.

## Current outcomes

1. **Ecommerce** — take authenticated storefront setup and request inbox through one owner-approved isolated hosted rehearsal while preserving the human-confirmed Shop boundary.
2. **Agents** — run the Order Intake evaluator against real server-only provider outputs, then build a review demo only if its quality gates pass.
3. **Website** — repeat the named-business lifecycle in an authenticated managed workspace.
4. **Managed persistence** — repeat the PostgreSQL 17 contract on one isolated hosted Supabase target before production activation.

## Implemented reality

- Shop runs at `/shop/` with guarded Orders and Stock: multi-item intake/recovery, reservation, fulfilment, payment/refund status, counts, purchasing, close, partial returns, and review-gated price/reorder edits. Stock and historical orders stay unchanged; every edit has an anchored opening value and accountable proof.
- Plant runs at `/plant/` with Jobs and Problems; the old operations URL is compatibility-only. It covers scheduled and rescheduled jobs, short closes, output, materials, quality, equipment observations, downtime, owned maintenance, and handoff. Priority and due time set one evidence-bound run order without controlling equipment or changing purchasing, costing, or accounting.
- Website runs at `/products/website/` with a named-business starter, Preview, and gated Review. Five business fields become one unsaved page, then Preview and Save. Review stays hidden until the saved page is ready and creates a deterministic site file, never a deployment. Draft recovery and stale-overwrite protection remain.
- Ecommerce reads Shop data. Save advances to Preview; requests stay disabled until saved and current, stale receipts cannot hand off, and Shop shows payment before Review. Website request snapshots are digest-bound; legacy unbound records remain readable but cannot convert. Shop revalidates every consequence.
- `/agents/` resolves to the compact Products plan because Agent Teams are internal. Order Intake passed its local 20-case evaluator; the server-only provider runner remains at the OpenAI credential gate.
- Home now prioritizes unfinished Shop and Plant operating records before internal company tasks. The internal `/work/` route is labelled HQ; bottom navigation reads Home, HQ, and Products.
- The default app is browser-local. Authenticated Shop, Plant, Website, and Ecommerce-inbox commands exist, but hosted production activation is not proven.

## Verified baseline

- Checkpoint `352ac7d` is the accepted local product and database-authority baseline.
- App lint/build, all local release/security/database/HQ contracts, and all 154 Python tests pass. Security coverage is 58 checks.
- The Showroom dependency audit reports zero known vulnerabilities; React Router is on patched v8 and Node is `>=22.22.0`.
- HQ remains its own route chunk; the largest JavaScript chunk is 490,705 bytes, leaving 9,295 bytes under the hard gate.
- Focused coverage includes 178 Shop, 32 order-recovery, 245 Plant, 94 Website, 11 managed-Website, 27 storefront-draft, 14 storefront, 15 request, 17 managed-storefront, and 16 Ecommerce handoff checks.
- Rendered Shop QA covers purchasing, counts, returns, stale confirmation, order recovery, and catalog editing. At 390 px, both first-anchor and existing-anchor price/reorder edits persist with stock unchanged; reset restores the clean seed.
- Rendered Plant QA covers material use, short close, maintenance, creation, and `JOB-201` rescheduling. At 390 px the 44 px action, legacy first schedule, exact review, reload, no-op block, and focus return pass; wide layout has no overflow and browser logs are clean.
- Website QA proves named setup → preview → Save → ready → 6/6 Review at 390/1280 px, with 44 px actions, attached errors, and no horizontal overflow. Device-local and managed records are labelled separately.
- Ecommerce QA proves v1 → v2 upgrade, reload, unsaved → Save → Preview → request → Shop payment → accountable confirmation, plus real cross-tab Shop availability invalidation. No order or stock change was confirmed outside the reset QA origin; actions are at least 44 px, with no horizontal overflow or browser errors.
- PostgreSQL 17.10 passed 32 checks across two TLS clusters, including exact approval/event restore equality and the explicit trusted-server identity boundary.
- Local `352ac7d` is +162 over cached `origin/main` `6885c320` and +116 over cached release-candidate tracking `338b6fd`. Live GitHub/Vercel state was not refreshed; no push, merge, or deployment occurred.
- Last live audit: canonical domains matched `supermega-public`; `demo.supermega.dev` was 404, `shop.supermega.dev` had no DNS, and `supermegabase` lacked `app_private` plus the six trial migrations.

## Coordination

- This Codex task owns portfolio authority and integration.
- Subagents get one outcome, at most five logical paths, disjoint write scopes, and a short evidence handoff. They cannot redefine the portfolio or perform owner-gated actions.
- `hq/WORKBOARD.md` remains assignment authority.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce lacks an isolated hosted/cross-device rehearsal. Local v2 now binds saved setup to a currentness fingerprint, upgrades v1 additively, and invalidates on cross-tab Shop changes; that fingerprint is not authenticated approval evidence. Managed setup remains digest-bound.
- Agent Teams is not a production runtime. Order Intake passed its 20-case evaluator, but no usable local OpenAI API key was found; the provider runner awaits a secure founder decision and still needs a three-minute human review workflow.
- No isolated hosted Supabase branch or separate non-production project has repeated the local database proof.
- Browser-local Website records cannot authenticate out-of-band storage edits; managed commands use the locked prior state and separate ledger. Hosted activation remains unproven.
- Cached GitHub `main` is 162 commits behind this product checkpoint. The live app cannot contain the validated local work until an owner-approved integration and coordinated release.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.

## Decisions in force

- Shop and Plant are the two core operating products.
- Website and Ecommerce are distinct maker products; Ecommerce feeds Shop and never duplicates its back office.
- AI Agent Solutions are real bounded workflows, not employee theatre or a public agent catalogue.
- Internal technical IDs may remain `commerce` and `production` until a separately tested data migration is justified.
- One app, one identity foundation, one evidence/approval model, and one coordinated release path.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.
- R&D resources become verified implementation assets, not public directory pages.

## Next evidence

1. Keep the passing `/shop/`, `/plant/`, Website, Ecommerce, compatibility, and mobile journeys as regression evidence.
2. Review the 162-commit release-candidate delta, then obtain explicit owner approval before any push, merge, deployment, or canonical-domain correction.
3. Rehearse revisioned Ecommerce setup persistence and request retention on an owner-approved isolated non-production tenant and capture cross-device, replay, tenant-isolation, conflict, recovery, and zero-conversion evidence.
4. Generate server-only Order Intake results with no operational tools, score all 20 fixtures, and expose a human review demo only after every quality and zero-side-effect gate passes.
5. Provision and validate one isolated hosted Supabase rehearsal target before any production write enablement.
