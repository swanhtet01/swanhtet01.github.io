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

1. **Identity** — restore Shop and Plant in the public site, app labels, canonical routes, and verification contracts without changing their stable stored data.
2. **Ecommerce** — take the completed authenticated, revisioned storefront-setup and request-inbox contracts through one owner-approved isolated hosted rehearsal while preserving the human-confirmed Shop action boundary.
3. **Agents** — run the completed Order Intake evaluator against real server-only provider outputs, then build the first review/edit/accept-discard demo only if its quality gates pass.
4. **Website** — validate one named-business brief through an accepted responsive artifact.
5. **Managed persistence** — repeat the passing PostgreSQL 17 contract on one isolated hosted Supabase target before production activation.

## Implemented reality

- Shop runs at `/shop/` with guarded Orders and Stock records on internal `commerce`; the old operations URL is compatibility-only. Intake, reservation, fulfilment, payment, cancellation, refunds, movements, close, and supplier purchase orders with partial receipt or remainder cancellation are recorded. Supplier messaging, payment, and accounting remain outside the workflow.
- Plant runs at `/plant/` with Jobs and Problems on internal `production`; the old operations URL is compatibility-only. Its accountable record covers jobs, good/scrap output, job-linked material use, quality, issues, equipment observations, downtime, and shift handoff. Material use does not adjust inventory, purchasing, costing, accounting, or equipment.
- Website runs at `/products/website/` with Site, Preview, and Review. Drafts survive reload, reject stale overwrite, and use backup-first repair. `?view=publish` resumes Review; invalid links or recovered edits safely return to Edit. Review creates a deterministic site file, not a deployment.
- Ecommerce builds from read-only Shop data. Managed setup is revisioned and catalogue-bound; receipts require the saved storefront, current catalogue, selected available SKU, and exact preview digest to agree. Local setup stays on-device. Shop revalidates and gates every consequence.
- `/agents/` currently resolves to the compact Products planned state because Agent Teams are internal coordination records. Order Intake has passed its local 20-case evaluator, but the server-only provider runner is held at the OpenAI credential gate and no provider-backed demo is claimed.
- Home now prioritizes unfinished Shop and Plant operating records before internal company tasks. The internal `/work/` route is labelled HQ, its activity is collapsed on Home, and Products remains the direct launcher. The bottom navigation reads Home, HQ, and Products.
- The default app is browser-local. Authenticated Shop, Plant, Website, and Ecommerce-inbox commands exist, but hosted production activation is not proven.

## Verified baseline

- Checkpoint `d077b9b` is the accepted local product and database-authority baseline.
- App lint/build, the full local release/security/database/HQ contracts, and all 136 Python tests pass for the current product checkpoint.
- The complete Showroom dependency audit reports zero known vulnerabilities. React Router is on the patched v8 line, the app declares Node `>=22.22.0`, and the lint toolchain preserves caught error causes.
- HQ remains its own route chunk; the largest JavaScript chunk is 474,467 bytes, leaving 25,533 bytes under the hard gate.
- Focused app-build coverage includes 124 Shop, 184 Plant, 74 Website, 11 managed-Website, 12 storefront, 15 request, 16 managed-storefront, and 16 Ecommerce handoff runtime checks.
- A rendered isolated Shop journey creates an internal order for 10 units, receives 4, then cancels the remaining 6 with exact stock and ledger changes. Desktop and 390 px layouts have no horizontal overflow, mobile actions are 44 px, column headers remain accessible, drafts and focus are preserved, and confirmation copy creates no supplier, payment, or accounting claim.
- A rendered Plant journey records fractional material use with lot and shift evidence, derives handoff totals, and preserves a named stale-job draft. Desktop and 390 px layouts have no horizontal overflow; mobile controls are 44 px.
- PostgreSQL 17.10 passed 32 checks across two TLS clusters, including exact approval/event restore equality and the explicit trusted-server identity boundary.
- Local `d077b9b` is +140 over cached `origin/main` `6885c320` and +94 over cached integration `338b6fd`. Live GitHub/Vercel state was not refreshed; no push, merge, or deployment occurred.
- Both canonical domains serve matching Vercel release identity from `supermega-public`. `demo.supermega.dev` returns 404; `shop.supermega.dev` has no DNS record.
- `supermegabase` is healthy PostgreSQL 17.6 but has one older migration, no `app_private`, and none of the six private-trial migrations. Its 27 public tables have RLS and no policies; it is not an activated rehearsal target.

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
- The locally tracked canonical main ref is 136 commits behind this candidate. Production correctly follows GitHub `main`, so the live app cannot contain the validated local work until an owner-approved integration and coordinated release occurs.
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
2. Review the 136-commit release-candidate delta, then obtain explicit owner approval before any push, merge, deployment, or canonical-domain correction.
3. Rehearse revisioned Ecommerce setup persistence and request retention on an owner-approved isolated non-production tenant and capture cross-device, replay, tenant-isolation, conflict, recovery, and zero-conversion evidence.
4. Generate server-only Order Intake results with no operational tools, score all 20 fixtures, and expose a human review demo only after every quality and zero-side-effect gate passes.
5. Provision and validate one isolated hosted Supabase rehearsal target before any production write enablement.
