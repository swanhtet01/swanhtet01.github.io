# HQ now

Updated: 2026-07-31
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `7c76b810d5eb466f3917e785ff1be6db4c9d8007`
Live state observed: `2026-07-31T12:30:15.683Z`
Live operating mode: `isolated_demo`
Live scheduler status: `degraded`
Live scheduler configured: `false`
Live managed persistence ready: `false`
Live security ready: `false`

## North-star outcome

Prove one measured workflow where SuperMega keeps the record and a responsible owner resolves exceptions.

## Portfolio correction

The active delivery focus is:

1. **Shop** — orders, stock, fulfilment, payment status, exceptions, and daily close.
2. **Plant** — jobs, output, problems, equipment, maintenance, and shift handoff.
3. **Website** — a local website builder and review workflow.
4. **Ecommerce** — a storefront builder with request receipt and Shop handoff.

AI assistance remains gated R&D; HQ, Work, Agents, R&D, Ops, and Console stay internal.

`Commerce` and `Production` are internal IDs. Ecommerce owns storefront/order intent; Shop owns the operating record.

## Implemented reality

- HQ retains 12 dormant role definitions but admits one active assignment, one specialist, and one cycle. `multi_agent = false`; one lease blocks duplicates, and unloaded roles/models consume no idle compute (`21afe44`).
- Hosted scheduling remains deliberately dormant; flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation (`07dd959`).
- Storage privacy now has a six-request owner-confirmed verifier and zero-network configuration preflight; hosted proof remains blocked (`be78a02`).
- Each CEO cycle selects one outcome. Exact disabled two-job live drift may admit local-only work, but any other failure blocks; Vercel, hosted scheduling, release, connectors, and external writes remain zero. Owner-send uncertainty retains claims and is never auto-retried (`34f601d8`).
- YTF identities cannot render in core operations. Managed workspaces retain exact requests in the Shop inbox; Shop confirmation alone creates an order.
- Client setup keeps one manifest-backed smart import, one shared launchpad, and browser-local four-product CSV preparation; missing data uses connected samples and installation stays review-gated (`ef9e2e7`, `3a56a7d`).
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancel releases, complete consumes, and sellable returns restore the exact fulfilled location/lot (`3cd4825`).
- Shop Sell hides the empty mobile cart, closes it after last-item removal or completion, and confirms with a receipt reference instead of an internal action UUID (`7e321378`).
- Shop keeps a balanced accounting-review CSV grouped by payment method and a human-approved versioned tax code, rate, and inclusive/exclusive treatment. Receiving separates accepted stock from rejected supplier units and measures defects; no posting occurs (`d47f5d9`, `39b7fc2`, `a37c933c`, `552ed20a`).
- Ecommerce return intent opens the exact completed Shop order; Shop alone records return and refund evidence.
- Ecommerce carries versioned contact/address snapshots through recovery and Shop handoff; hosted identity and provider execution remain absent.
- Shop owns versioned delivery zones, fee, promise, tax schedule, and payment-method eligibility/limits. Ecommerce draft v7 and the Shop order retain the exact tax decision; Shop rechecks authority and tax-inclusive payment limits before reserving stock (`ENG-136`, `ENG-137`, `ENG-138`, `9ff26ba3`).
- Shop Orders downloads digest-bound acknowledgements from exact evidence; no invoice, receipt, message, or provider action (`ENG-139`, `263434db`).
- Ecommerce post-order exceptions bind Shop evidence through cancellation, amendment, reschedule, return, support, balance review, and contact/address correction (`ENG-140`-`ENG-146`). Accepted orders stay immutable; Shop reviews a separate replacement.
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, replay, and rollback; operation/output requires exact authenticated Shop issue evidence. Shop remains stock authority for exact returns and substitution. Controlled batches bind reviewed productive time and closed downtime before Availability and OEE.
- Plant controls up to 20 job-bound order plans in one workspace. Priority-and-due MRP consumes Shop stock and open POs once, exposes per-order exceptions, and changes one managed order chain per reviewed command.
- Plant maintenance binds strategy, due work, structured results, evidence-linked finding problems, and corrective-action closeout with final human disposition. It performs no automatic problem opening, dispatch, control, telemetry, status, or parts action.
- Home keeps Shop and Plant exceptions above collapsed HQ work. Plant issues link to Problems; `/work/` stays labelled HQ.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.
- CEO status is output-free across weekly briefs. Company Week separates recorded from delivered and fails incomplete delivery to attention; Company Health shows receipt counts (`8d97d4d`, `ece46ce`).
- CEO brief startup is 13 files/250,926 bytes; unchanged evidence uses zero model work.

## Verified baseline

- Current local checkpoints: Ecommerce tax authority `b70d3412`, governed v7 Shop handoff `1975c550`, tax-inclusive limits `0eb180f9`, and order proof `9ff26ba3`; all gates pass.
- Checks pass: 105 Ecommerce, 310 Commerce, 274 Production including 93 Plant-order checks, 64 managed Commerce, 77 security, 233 onboarding, and 82 managed import.
- Both domains serve deployed `7c76b810d5eb466f3917e785ff1be6db4c9d8007`; paired brand, context, and catalog identities match, but local context drift and the deployed two-job scheduler ceiling block release readiness.
- Production remains an `isolated_demo`; managed data/security writes and hosted scheduling are not ready.
- Working-set trim is non-terminating; audit retains one frontend, backend, idle worker, zero models/subagents, and one-run admission. Rejected CEO outcomes remain quarantined without repair loops or hidden completion.
`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without owner approval.

## Blockers

- Website, Plant, Ecommerce, and AI budgets still lack hosted activation proof; model calls fail closed.
- `supermegabase` is not a trial target: it has existing records, one recorded migration, and 27 public RLS tables without policies. No isolated branch is verified, so managed writes remain off.
- The live products remain isolated samples; managed persistence and tenant security are unproven.
- Production `7c76b810` and the local candidate diverge from common base `5d1c5d7c`; direct release is unsafe. Integrate selectively from current `origin/main`; PR #258 is historical only.
- Live HQ reports `app_product_contract_drift`; preview, marketing, and managed activation remain blocked; any external handoff must pass `release:handoff:verify`.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Hosted scheduling has no signed bundle, credentials, worker URL, or allowlist and stays blocked until managed storage, security, recovery, and owner evidence pass.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve dormant roles, one cycle, one active assignment, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice must keep one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and human approval for consequential actions. Enterprise depth is added inside the four products, not as more pages or products.

## Next evidence

1. Rehearse founder-selected client CSVs across all four products, including reconciliation, rollback, mobile, reload, duplicate handoff, export, and reset.
2. On approved isolated Supabase, prove Storage, RLS, tenant isolation, and exact restore before writes.
3. Recruit one approved Shop design partner, then require protected preview, paired verification, observability, rollback, and fresh live HQ evidence before marketing. Keep AI and scheduling dormant until their gates pass.
