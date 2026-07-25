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

## Current outcomes

1. **Four-product client setup** — versioned workflow templates and dry-run CSV intake for Shop catalog, Plant jobs, Website pages, and Ecommerce merchandising; explainable mapping, row errors, deterministic staging, and no silent writes.
2. **Website + Ecommerce** — industry starters, Preview, Review, and deterministic handoff.
3. **Shared foundation** — roles, audit/recovery, imports, and isolated hosted PostgreSQL proof.
4. **AI support later** — source-backed mapping suggestions only after evaluation; no autonomous writes.

## Implemented reality

- Shop runs at `/shop/` with guarded Orders and Stock: multi-item order recovery, accountable owner/promise, fulfilment, payment/refund, close, counts, purchasing, returns, and catalog edits. The mobile order footer now guides a missing promise or payment directly to its field. Legacy records remain readable without invented facts; every edit has proof.
- Plant runs at `/plant/` with Jobs and Problems; the old operations URL is compatibility-only. Jobs carry owner, priority, due time, short close, and append-only output/material evidence. Problems now lead with open work, then holds, handoff, equipment observations, downtime, and maintenance. These records dispatch nothing, control no equipment, and do not handle purchasing, costing, or accounting.
- Website runs at `/website/` with a named-business starter, Preview, and gated Review. Five business fields become one unsaved page, then Preview and Save. Invalid first-run submission centers and focuses the first field to fix without repeating the same errors. Review stays hidden until the saved page is ready and creates a deterministic site file, never a deployment. Draft recovery and stale-overwrite protection remain.
- Ecommerce reads Shop data. Setup, Save, receipt, and handoff focus the next step. Review labels source, customer, SKU/price, payment, promise, fulfilment, order ID, and stock delta; Cancel restores the exact prepared draft. Stale or legacy requests fail closed; only accountable confirmation can create an order.
- Products says `Choose a product`; Website promises review, not publishing. AI assistance is shared gated infrastructure with no product card or customer control: Order Intake passed 20 local cases, but the provider runner remains at the credential gate.
- Settings supports all four CSV intakes: exact templates, explainable local mapping and validation, and digest-bound zero-write staging.
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback while clearing database, hosted-auth, model, worker, and write authority. Records stay browser-local by default; hosted production activation is not proven.

## Verified baseline

- Checkpoint `5d7b217` is the accepted local product and database-authority baseline.
- App lint/build, all local release/security/database/HQ contracts, and all 156 Python tests pass. Security coverage is 58 checks.
- Dependency audit reports zero known vulnerabilities; React Router is patched v8 and Node is `>=22.22.0`.
- React Router is isolated in a 43,870-byte cacheable chunk; the largest JavaScript chunk is 463,892 bytes, leaving 36,108 bytes under the hard gate.
- Focused coverage: 202 Shop, 34 order-recovery, 250 Plant, 94 Website, 11 managed-Website, 44 client-onboarding, 27 storefront-draft, 14 storefront, 15 request, 17 managed-storefront, and 16 handoff checks.
- Rendered 390/1280 px QA covers all four products and compatibility routes without overflow or unintended data changes. Vite-only health is truthfully isolated; the full local command proxies canonical FastAPI while keeping managed data disconnected and writes locked.
- Core first-action QA leads Shop Stock with the exact shortage, guides incomplete orders to Promise or Payment, sends Plant alerts to Problems and jobs to output, puts open Problems before Equipment, and moves invalid Website briefs to their first error. Mobile actions are at least 44 px with no overflow; guide actions create no record.
- PostgreSQL 17.10 passed 32 TLS checks, including exact approval/event restore and the trusted-server identity boundary.
- Current local `5d7b217` is a fast-forward 164 commits beyond remote PR #258 head `338b6fd`; existing green checks cover only the remote head, not later local checkpoints.
- Domain and deployment observations are historical snapshots until refreshed. Mapping evidence and the push-only decision remain in `hq/research/release-reconciliation-2026-07-25.md`.

## Coordination

- This task owns portfolio/integration; bounded subagents get one disjoint outcome and no owner-gated authority.
- `hq/WORKBOARD.md` remains assignment authority.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce lacks an isolated hosted/cross-device rehearsal. Local v2 now binds saved setup to a currentness fingerprint, upgrades v1 additively, and invalidates on cross-tab Shop changes; that fingerprint is not authenticated approval evidence. Managed setup remains digest-bound.
- Agent Teams is not a production runtime. Order Intake passed its 20-case evaluator, but no usable local OpenAI API key was found; the provider runner awaits a secure founder decision and still needs a three-minute human review workflow.
- No isolated hosted Supabase branch or separate non-production project has repeated the local database proof.
- Browser-local Website records cannot authenticate out-of-band storage edits; managed commands use the locked prior state and separate ledger. Hosted activation remains unproven.
- Live GitHub `main` is 210 commits behind the accepted local product checkpoint, while draft PR #258 is 164 commits behind it. The live app cannot contain the validated local work until owner-approved integration and a later coordinated release.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.

## Decisions in force

- Shop and Plant are the two core operating products.
- Website and Ecommerce are distinct maker products; Ecommerce feeds Shop and never duplicates its back office.
- Delivery stays on Shop, Plant, Website, and Ecommerce; AI assistance remains gated R&D until these four pass client onboarding and pilot gates.
- Internal technical IDs may remain `commerce` and `production` until a separately tested data migration is justified.
- One app, one identity foundation, one evidence/approval model, and one coordinated release path.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.
- R&D resources become verified implementation assets, not public directory pages.

## Next evidence

1. Run the four client-data templates with one named company and measure mapping corrections, invalid rows, operator review time, and staging-package recovery before authorizing any product write adapter.
2. Obtain explicit owner approval for one fast-forward-only update of draft PR #258, then require fresh checks and human review before any separate merge or release decision.
3. Rehearse revisioned Ecommerce setup persistence and request retention on an owner-approved isolated non-production tenant and capture cross-device, replay, tenant-isolation, conflict, recovery, and zero-conversion evidence.
4. Generate server-only Order Intake results with no operational tools, score all 20 fixtures, and expose a human review demo only after every quality and zero-side-effect gate passes.
5. Provision and validate one isolated hosted Supabase rehearsal target before any production write enablement.
