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

- Shop runs at `/shop/` with guarded Orders and Stock records. It covers intake, reservations, fulfilment, payment/refund evidence, counts, movements, daily close, purchase orders, attributable completion, and partial returns. Only restock disposition changes stock; returns never alter payment or order totals. Supplier messaging, payment, and accounting remain outside the workflow.
- Plant runs at `/plant/` with Jobs and Problems; the old operations URL is compatibility-only. Its record covers jobs, short closes, output, job-linked materials, quality/problems, equipment observations, downtime, owned maintenance start/completion, and handoff. Maintenance is evidence-only: no machine, job, downtime, purchasing, parts, costing, or accounting side effects.
- Website runs at `/products/website/` with a named-business starter, Preview, and gated Review. Five business fields become one unsaved page, then Preview and Save. Review stays hidden until the saved page is ready and creates a deterministic site file, never a deployment. Draft recovery and stale-overwrite protection remain.
- Ecommerce builds from read-only Shop data. Managed setup is revisioned and catalogue-bound; receipts require the saved storefront, current catalogue, selected available SKU, and exact preview digest to agree. Local setup stays on-device. Shop revalidates and gates every consequence.
- `/agents/` currently resolves to the compact Products planned state because Agent Teams are internal coordination records. Order Intake has passed its local 20-case evaluator, but the server-only provider runner is held at the OpenAI credential gate and no provider-backed demo is claimed.
- Home now prioritizes unfinished Shop and Plant operating records before internal company tasks. The internal `/work/` route is labelled HQ, its activity is collapsed on Home, and Products remains the direct launcher. The bottom navigation reads Home, HQ, and Products.
- The default app is browser-local. Authenticated Shop, Plant, Website, and Ecommerce-inbox commands exist, but hosted production activation is not proven.

## Verified baseline

- Checkpoint `906d064` is the accepted local product and database-authority baseline.
- App lint/build, the full local release/security/database/HQ contracts, and all 146 Python tests pass for the current product checkpoint.
- The complete Showroom dependency audit reports zero known vulnerabilities. React Router is on the patched v8 line, the app declares Node `>=22.22.0`, and the lint toolchain preserves caught error causes.
- HQ remains its own route chunk; the largest JavaScript chunk is 495,020 bytes, leaving 4,980 bytes under the hard gate.
- Focused app-build coverage includes 160 Shop, 224 Plant, 94 Website, 11 managed-Website, 12 storefront, 15 request, 16 managed-storefront, and 16 Ecommerce handoff checks.
- Rendered Shop journeys prove purchase `0/10 → 4/10 → cancelled 6`, count `8 → 6`, and returns: sellable `21 → 22`, not-restocked stays `34`, then sellable `34 → 35`. A stale desktop confirmation loses safely to mobile. At 390/1280 px there is no horizontal overflow; the return editor uses one workspace scroll and mobile controls are 44 px.
- Rendered Plant journeys prove fractional material use, a `340`-unit short close, and attributed maintenance start/completion. Open maintenance enters handoff; completed work drops out. Desktop and 390 px layouts have no overflow, undersized controls, or browser errors.
- Website QA proves named setup → preview → Save → ready → 6/6 Review at 390/1280 px, with 44 px actions, attached errors, and no horizontal overflow. Device-local and managed records are labelled separately.
- PostgreSQL 17.10 passed 32 checks across two TLS clusters, including exact approval/event restore equality and the explicit trusted-server identity boundary.
- Local `906d064` is +150 over cached `origin/main` `6885c320` and +104 over cached release-candidate tracking `338b6fd`. Live GitHub/Vercel state was not refreshed; no push, merge, or deployment occurred.
- Last live audit: canonical domains matched `supermega-public`; `demo.supermega.dev` was 404, `shop.supermega.dev` had no DNS, and `supermegabase` lacked `app_private` plus the six trial migrations.

## Coordination

- This Codex task owns portfolio authority and integration.
- Bounded Codex subagents may inspect, test, or patch disjoint files. They cannot redefine the portfolio or perform owner-gated actions.
- `hq/WORKBOARD.md` remains assignment authority.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce has authenticated setup and inbox contracts, but no isolated hosted rehearsal or cross-device proof. Request retention stays capped at 100 until measured volume justifies an indexed queue.
- Agent Teams is not a production runtime. Order Intake passed its 20-case evaluator, but no usable local OpenAI API key was found; the provider runner awaits a secure founder decision and still needs a three-minute human review workflow.
- No isolated hosted Supabase branch or separate non-production project has repeated the local database proof.
- Browser-local Website records cannot authenticate out-of-band storage edits; managed commands use the locked prior state and separate ledger. Hosted activation remains unproven.
- The locally tracked canonical main ref is 150 commits behind this product checkpoint. Production correctly follows GitHub `main`, so the live app cannot contain the validated local work until an owner-approved integration and coordinated release occurs.
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
2. Review the 150-commit release-candidate delta, then obtain explicit owner approval before any push, merge, deployment, or canonical-domain correction.
3. Rehearse revisioned Ecommerce setup persistence and request retention on an owner-approved isolated non-production tenant and capture cross-device, replay, tenant-isolation, conflict, recovery, and zero-conversion evidence.
4. Generate server-only Order Intake results with no operational tools, score all 20 fixtures, and expose a human review demo only after every quality and zero-side-effect gate passes.
5. Provision and validate one isolated hosted Supabase rehearsal target before any production write enablement.
