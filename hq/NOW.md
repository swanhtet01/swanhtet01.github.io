# HQ now

Updated: 2026-07-24
Owner: founder / CEO
Mode: Codex-only guarded release candidate; production remains isolated

## North-star outcome

Prove one measured workflow where SuperMega keeps the record and a responsible owner resolves exceptions.

## Portfolio correction

The customer product map is:

1. **Shop** — the implemented order, stock, fulfilment, payment-status, exception, and daily-close product.
2. **Plant** — the implemented job, output, quality, materials, equipment, maintenance, and shift-exception product.
3. **Website** — the implemented local website-making workflow.
4. **Ecommerce** — the implemented local storefront maker and request receipt; the controlled Shop handoff is next.
5. **AI Agent Solutions** — bounded product assistance, beginning with Order Intake.

`Commerce` and `Production` remain internal runtime/database surface IDs only. The earlier decision to make them public product names and to retire Ecommerce is superseded by the founder’s confirmed direction. Ecommerce must not duplicate Shop: Ecommerce owns the customer-facing storefront and order intent; Shop owns the operational record and close.

SuperMega HQ, Work, Agent Teams, R&D, Ops, Console, and machine coordination are internal systems, not extra public products.

## Current outcomes

1. **Identity** — restore Shop and Plant in the public site, app labels, canonical routes, and verification contracts without changing their stable stored data.
2. **Ecommerce** — carry the local pending request receipt into a human-confirmed, idempotent Shop draft without creating stock or payment consequences.
3. **Agents** — run the completed Order Intake evaluator against real server-only provider outputs, then build the first review/edit/accept-discard demo only if its quality gates pass.
4. **Website** — validate one named-business brief through an accepted responsive artifact.
5. **Managed persistence** — repeat the passing PostgreSQL 17 contract on one isolated hosted Supabase target before production activation.

## Implemented reality

- Shop runs at `/shop/` with Orders and Stock while retaining the stable internal `commerce` state contract. `/operations/commerce/` is compatibility-only and canonicalizes to the same records. Shop has guarded intake, reservation, fulfilment, payment reconciliation, cancellation, refund-due and refund-settled evidence, stock movements, and daily close.
- Plant runs at `/plant/` with Jobs and Problems while retaining the stable internal `production` state contract. `/operations/production/` is compatibility-only and canonicalizes to the same records. Plant has recurring job creation, output, quality/material/maintenance issues, equipment-state observations, attributed events, and managed command gates.
- Website runs at `/products/website/` with Site, Preview, and Publish. It retains revisioned evidence and a deterministic downloadable site file without deployment or domain mutation.
- `/products/ecommerce/` now provides a focused local storefront maker and responsive customer preview from a read-only Shop catalogue snapshot. It emits a deterministic SHA-256 preview digest and can create one idempotent in-memory receipt marked `pending_shop_review`. The receipt is not durable and does not create a Shop order, reserve stock, take payment, send, publish, or mutate Shop.
- `/agents/` currently resolves to the compact Products planned state because Agent Teams are internal coordination records and Order Intake has not yet passed the evaluation gate.
- Home, Work, Products, and Settings exist in one app shell. Mobile uses focused task flows; no separate app domain is required.
- The default app is browser-local. Authenticated Shop, Plant, and Website commands exist, but hosted production activation is not proven.

## Verified baseline

- Local implementation head before this authority sync is `7fea173`; it contains the corrected portfolio, completed Order Intake evaluator, Ecommerce preview, and local request-receipt slices.
- The corrected candidate passed all 114 Python tests, Showroom lint and build, app, release, security, migration, Vercel, HQ, generated-public, artifact-budget, and contact-function checks.
- The Ecommerce candidate passes 11 deterministic/read-only storefront checks and 13 request-contract checks. Fresh 1280 px and 375 px browser review covers the pending receipt, has no horizontal overflow or undersized visible controls, and reports no browser errors while Shop remains untouched.
- PostgreSQL 17.10 passed 24 local migration, authority, journey, isolation, retry, recovery, and validator checks across two clean TLS clusters.
- Fresh 1280 px and 375 px browser audits of the corrected candidate passed for Home, Shop, Plant, Products, Website, and Ecommerce without horizontal overflow, undersized actionable controls, error overlay, warning, or console error. Compatibility URLs canonicalized to `/shop/` and `/plant/` while preserving query state.
- No Vercel deployment was created. Current production still references `main` commit `6885c3201d523d42d176c3dcd91de28dc1e17f6f`.
- The connected `supermegabase` project is healthy, but the private application schema and runtime role are not installed; this is not application readiness proof.

## Coordination

- This Codex task owns portfolio authority and integration.
- Bounded Codex subagents may inspect, test, or patch disjoint files. They cannot redefine the portfolio or perform owner-gated actions.
- Visible Codex task creation is unavailable in the current session, so no separate sidebar task may be claimed as created.
- Claude coordination is paused by founder direction.
- `hq/WORKBOARD.md` remains assignment authority.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce captures customer order intent only as an in-memory receipt. It has no durable request ledger and does not yet hand a human-confirmed draft to Shop.
- Agent Teams is not a production agent runtime. Order Intake has a strict 20-case local evaluator for schema validity, source coverage, required-field accuracy, unsafe-ready results, latency, tokens, estimated cost, retries, refusals, and correction rate; it still needs a server-only provider run and a three-minute human review workflow.
- No isolated hosted Supabase branch or separate non-production project has repeated the local database proof.
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

1. Keep the passing `/shop/`, `/plant/`, compatibility, and mobile journeys as regression evidence.
2. Revalidate the Ecommerce digest, SKU, price, and availability at a human confirmation step; then create one idempotent Shop draft with no stock or payment consequence.
3. Generate server-only Order Intake results with no operational tools, score all 20 fixtures, and expose a human review demo only after every quality and zero-side-effect gate passes.
4. Provision and validate one isolated hosted Supabase rehearsal target before any production write enablement.
