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

1. **Four client templates** — versioned, explainable dry-run imports for Shop catalog, Plant jobs, Website pages, and Ecommerce merchandising; no silent writes.
2. **Maker flow** — Website and Ecommerce use starters, Preview, Review, and deterministic handoff.
3. **Shared controls** — roles, audit/recovery, imports, and gated AI suggestions only after evaluation.

## Implemented reality

- HQ uses four teams. At `d2900ad`, runtime and environment policy cap the roster at 12, active work at four, and idle work at zero; 13 and 175 fail closed.
- Shop runs at `/shop/`: guarded multi-item orders, stock, purchasing, fulfilment, payment/refund, returns, and close, with accountable owner/promise, recovery, and evidence.
- Plant runs at `/plant/`: jobs, output/material evidence, problems, holds, handoff, equipment observations, downtime, and maintenance. It dispatches nothing and controls no equipment.
- Website runs at `/website/`: one brief becomes an unsaved Preview, guarded Save, and deterministic Review artifact, never a deployment; recovery and stale-write denial remain.
- Ecommerce reads versioned Shop data. Setup, Save, receipt, and handoff focus the next step. Review exposes source and consequence; Cancel restores the exact prepared draft. Only accountable Shop confirmation can create an order.
- Products says `Choose a product`; Website promises review, not publishing. AI assistance is shared gated infrastructure with no product card or customer control: Order Intake passed 20 local cases, but the provider runner remains at the credential gate.
- Settings supports all four CSV intakes: exact templates, explainable local mapping and validation, and digest-bound zero-write staging.
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback while clearing database, hosted-auth, model, worker, and write authority; the full local command proxies canonical FastAPI while keeping managed data disconnected and writes locked. Records stay browser-local by default; hosted production activation is not proven.

## Verified baseline

- Checkpoint `5d7b217` is the accepted local product baseline; `69dfb09` governs agents, `98b8044` closes legacy gaps, and `d2900ad` enforces the roster cap.
- App lint/build, all local contracts, eight focused governor tests, and all 189 Python tests pass. Security coverage is 58 checks.
- Dependency audit previously reported zero known vulnerabilities; this slice did not refresh external package or hosted-state inventories.
- React Router is isolated in a 43,870-byte cacheable chunk. The accepted product baseline's largest JavaScript chunk is 463,892 bytes; checkpoint `69dfb09` is 478,287 bytes and remains below the build gate.
- Focused coverage: 202 Shop, 34 order-recovery, 250 Plant, 94 Website, 11 managed-Website, 44 client-onboarding, 27 storefront-draft, 14 storefront, 15 request, 17 managed-storefront, and 16 handoff checks.
- Existing 390/1280 px product QA remains valid. Fresh HQ Agent Teams QA has no overflow or browser warning/error and no visible mobile control below 44 px.
- Core first-action QA leads Shop Stock with the exact shortage, guides incomplete orders to Promise or Payment, sends Plant alerts to Problems and jobs to output, puts open Problems before Equipment, and moves invalid Website briefs to their first error. Mobile actions are at least 44 px with no overflow; guide actions create no record.
- PostgreSQL 17.10 passed 32 TLS checks, including exact approval/event restore and the trusted-server identity boundary.
- At the prior release audit, local `5d7b217` was a fast-forward 164 commits beyond remote PR #258 head `338b6fd`; existing green checks cover only the remote head. GitHub, Vercel, domain, and deployment observations are historical until refreshed; see `hq/research/release-reconciliation-2026-07-25.md`.

## Coordination

- This task owns portfolio/integration; bounded subagents get one disjoint outcome and no owner-gated authority.
- Four standing AI teams share one work board. A role is added only for a concrete assignment, one owner, bounded capabilities, acceptance evidence, and an explicit approval boundary; idle specialists do not consume runtime capacity.
- `hq/WORKBOARD.md` remains assignment authority.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Ecommerce lacks an isolated hosted/cross-device rehearsal. Local v2 now binds saved setup to a currentness fingerprint, upgrades v1 additively, and invalidates on cross-tab Shop changes; that fingerprint is not authenticated approval evidence. Managed setup remains digest-bound.
- Agent Teams is not proven hosted. Local authority, destination, roster, and idle controls pass; hosted scheduler, recovery, and observability proof is missing.
- No isolated hosted Supabase branch or separate non-production project has repeated the local database proof.
- Storage privacy is local-contract evidence only; hosted bucket inventory and object-listing denial remain required.
- Browser-local Website records cannot authenticate out-of-band storage edits; managed commands use the locked prior state and separate ledger. Hosted activation remains unproven.
- Live GitHub and Vercel state were not refreshed. The live app cannot be claimed to contain `69dfb09` until read-only reconciliation and separately approved integration/release.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.

## Decisions in force

- Shop and Plant are the two core operating products.
- Website and Ecommerce are distinct maker products; Ecommerce feeds Shop and never duplicates its back office.
- Delivery stays on Shop, Plant, Website, and Ecommerce; AI assistance remains gated R&D until these four pass client onboarding and pilot gates.
- Internal technical IDs may remain `commerce` and `production` until a separately tested data migration is justified.
- One app, one identity foundation, one evidence/approval model, and one coordinated release path.
- One lean AI company model: four standing teams, at most twelve local roster roles, at most four active company assignments, and zero worker compute while idle. Add specialists only when measured demand and acceptance evidence justify them.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.
- R&D resources become verified implementation assets, not public directory pages.

## Next evidence

1. Audit hosted agent configuration read-only for idle schedules or oversized rosters.
2. Rehearse lease expiry, retry, recovery, and human release review in isolation.
3. Run all four client-data templates with one named company and measure correction, review time, and recovery before any write adapter.
4. On one approved isolated Supabase target, prove private Storage, RLS, Ecommerce replay/isolation, and database recovery.
5. Refresh GitHub/Vercel/DNS read-only, then run the gated 20-case Order Intake provider review only after owner-approved credentials and four-product onboarding evidence.
