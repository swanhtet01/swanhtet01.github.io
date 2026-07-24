# HQ now

Updated: 2026-07-24
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
2. **Ecommerce** — take the completed authenticated, revisioned request-inbox contract through one owner-approved isolated hosted rehearsal while preserving the human-confirmed Shop action boundary.
3. **Agents** — run the completed Order Intake evaluator against real server-only provider outputs, then build the first review/edit/accept-discard demo only if its quality gates pass.
4. **Website** — validate one named-business brief through an accepted responsive artifact.
5. **Managed persistence** — repeat the passing PostgreSQL 17 contract on one isolated hosted Supabase target before production activation.

## Implemented reality

- Shop runs at `/shop/` with guarded Orders and Stock records on internal `commerce`; the old operations URL is compatibility-only. Intake, reservation, fulfilment, payment, cancellation, refunds, movements, close, and exact positive stock receipts are recorded.
- Plant runs at `/plant/` with Jobs and Problems on internal `production`; the old operations URL is compatibility-only. Jobs, output, issues, events, and managed commands are recorded, and operators can submit any truthful distinct equipment observation without a forced cycle.
- Website runs at `/products/website/` with Site, Preview, and Publish. Drafts use one Save/Discard boundary, survive same-tab reload, refuse stale overwrite, and block release actions until resolved. Its retained site file is deterministic; no deployment or domain changes occur.
- Ecommerce builds a customer preview from read-only Shop data. Available cards focus `Request an item` with the exact SKU; its digest and receipt are deterministic and idempotent. Managed mode retains the receipt with conflict/recovery checks, while Shop revalidates the catalogue and keeps order or stock consequences behind human confirmation. Mobile now presents Setup and Preview as one clear two-step workspace instead of stacking both full interfaces.
- `/agents/` currently resolves to the compact Products planned state because Agent Teams are internal coordination records and Order Intake has not yet passed the evaluation gate.
- Home now prioritizes unfinished Shop and Plant operating records before internal company tasks. The internal `/work/` route is labelled HQ, its activity is collapsed on Home, and Products remains the direct launcher for Shop, Plant, Website, and Ecommerce.
- The default app is browser-local. Authenticated Shop, Plant, Website, and Ecommerce-inbox commands exist, but hosted production activation is not proven.

## Verified baseline

- Checkpoint `04e30c7` contains the current corrected portfolio plus the accepted Shop, Plant, Website, Ecommerce, and Order Intake local work.
- Ecommerce lint/build, the full app contracts, and all 122 Python tests pass for the current product checkpoint.
- HQ now loads as its own 25,057-byte route chunk; the largest JavaScript chunk fell from 484,878 to 459,968 bytes.
- Focused coverage reports 96 Shop runtime, 157 Plant runtime, 74 Website runtime, 11 storefront, 13 request, and 16 Ecommerce handoff checks, including managed replay, conflict, tenant-isolation, recovery, and unchanged-ledger proof.
- Fresh 1280 px and 375 px journeys cover Shop receipt, Plant observation, Website draft boundaries, and Ecommerce request receipt with no mobile overflow or browser errors and no pre-confirmation mutation.
- PostgreSQL 17.10 passed 24 local migration, authority, journey, isolation, retry, recovery, and validator checks across two clean TLS clusters.
- A fresh 375 px Home audit proves the first card is a Shop or Plant operating record, the bottom navigation reads Home, HQ, and Products, internal company activity stays collapsed, and the page has no horizontal overflow or browser errors.
- Live release audit: `supermega.dev` and `app.supermega.dev` still serve `main` commit `6885c320`; checkpoint `04e30c7` is 101 commits ahead of `origin/main` and 55 ahead of the remote integration branch. The separate Vercel project named `supermega-platform` builds `swanhtet01.github.io` commit `3d1d9e32` and has no canonical domain. No external state changed.
- `supermegabase` is healthy on PostgreSQL 17 but has only the older public-schema system, no `app_private` tables, no verified development branch, and 27 informational no-policy notices. The production ref is unset; this is not the isolated rehearsal target.

## Coordination

- This Codex task owns portfolio authority and integration.
- Bounded Codex subagents may inspect, test, or patch disjoint files. They cannot redefine the portfolio or perform owner-gated actions.
- Visible Codex task creation is unavailable in the current session, so no separate sidebar task may be claimed as created.
- Claude coordination is paused by founder direction.
- `hq/WORKBOARD.md` remains assignment authority.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce now has a local authenticated tenant-inbox contract and recovery path, but it has no isolated hosted rehearsal or cross-device production proof. The pilot intentionally caps retention at 100 entries inside the revisioned Shop workspace envelope; a normalized indexed queue remains gated on measured volume, retention, and query needs.
- Agent Teams is not a production agent runtime. Order Intake has a strict 20-case local evaluator for schema validity, source coverage, required-field accuracy, unsafe-ready results, latency, tokens, estimated cost, retries, refusals, and correction rate; it still needs a server-only provider run and a three-minute human review workflow.
- No isolated hosted Supabase branch or separate non-production project has repeated the local database proof.
- The canonical domains are 101 local commits behind the release candidate, and the similarly named Vercel project is linked to the wrong repository for this app. Push, merge, deployment, and domain correction remain owner-gated.
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
2. Review the 101-commit release-candidate delta, then obtain explicit owner approval before any push, merge, deployment, or canonical-domain correction.
3. Rehearse the completed revisioned Ecommerce request inbox on an owner-approved isolated non-production tenant and capture hosted replay, tenant-isolation, recovery, and zero-conversion evidence.
4. Generate server-only Order Intake results with no operational tools, score all 20 fixtures, and expose a human review demo only after every quality and zero-side-effect gate passes.
5. Provision and validate one isolated hosted Supabase rehearsal target before any production write enablement.
