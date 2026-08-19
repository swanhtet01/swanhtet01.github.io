# HQ now

Updated: 2026-08-11
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `12ade3db2a73a586f244dd4e3e26cc4d9bb868fc`
Live state observed: `2026-08-03T14:46:45.695Z`
Live operating mode: `isolated_demo`
Live scheduler status: `degraded`
Live scheduler configured: `false`
Live managed persistence ready: `false`
Live security ready: `false`

## North-star outcome

Prove one measured workflow where SuperMega keeps the record and a responsible owner resolves exceptions.

## Portfolio correction

The active delivery focus is:

1. **Shop** Ã¢â‚¬â€ orders, stock, fulfilment, payment status, exceptions, and daily close.
2. **Plant** Ã¢â‚¬â€ jobs, output, problems, equipment, maintenance, and shift handoff.
3. **Website** Ã¢â‚¬â€ a local website builder and review workflow.
4. **Ecommerce** Ã¢â‚¬â€ a storefront builder with request receipt and Shop handoff.

AI assistance remains gated R&D; HQ, Work, Agents, R&D, Ops, and Console stay internal.

`Commerce` and `Production` are internal IDs. Ecommerce owns storefront/order intent; Shop owns the operating record.

## Implemented reality

- Hosted scheduling remains deliberately dormant; flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation.
- Storage privacy now has a six-request owner-confirmed verifier and zero-network configuration preflight; hosted proof remains blocked.
- HQ retains 12 dormant role definitions but admits one active assignment, one specialist, and one cycle; unloaded roles/models consume no idle compute. `multi_agent = false`; one lease blocks duplicates. Each CEO cycle selects one outcome. Owner-send uncertainty retains claims and is never auto-retried. CEO status is output-free across weekly briefs; Company Week separates recorded from delivered and fails incomplete delivery to attention. CEO brief startup is 14 files/324,497 bytes; unchanged evidence uses zero model work.
- YTF identities cannot render in core operations. Managed workspaces retain exact requests in the Shop inbox; Shop confirmation alone creates an order.
- Client setup keeps one smart import and launchpad; create/update focuses `Open next demo`; reset/restore share one bounded scope. A v4 setup baseline rejects seeded or pre-setup history as mission proof; installation stays review-gated.
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancellation releases, completion consumes, and sellable returns restore the exact fulfilled location/lot.
- Shop keeps a balanced accounting-review CSV grouped by payment method and a human-approved versioned tax code, rate, and inclusive/exclusive treatment. Receiving separates accepted from rejected units; no posting occurs. The accounting export packet now includes both an AP supplier payables handoff CSV (`supermega.commerce.supplier-payables-handoff.v1`) and an AR customer receivables handoff CSV (`supermega.commerce.customer-receivables-handoff.v1`); both are digest-bound, formula-safe, and carry explicit no-payment and no-collection-authority controls.
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, replay, and rollback; operation/output requires exact authenticated Shop issue evidence. Controlled batches bind reviewed productive time and closed downtime before Availability and OEE.
- Plant quality problems now require structured CAPA evidence before an actionable record can close.
- Home keeps Shop and Plant exceptions above collapsed HQ work. Plant issues link to Problems; `/work/` stays labelled HQ.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.

## R&D decisions (2026-08-11)

Five research documents in `hq/research/`: opentelemetry (adopt-with-managed-mode), durable-workflows (adopt-with-managed-mode), order-intake-agent (evaluate), analytics (adopt, implementation-steps-ready), enterprise-capabilities (evaluate, design-ready). Roadmap: `hq/TIMELINE.md`. Agent plan: `hq/AGENT-TEAM-PLAN.md`.

## Verified baseline

- Product: four-product setup handoff, recovery, and Plant CAPA release gates pass.
- The deterministic 12-profile rehearsal passes 24 rows. Rendered mobile Website and Ecommerce mission acceptance is complete.
- Proof baseline: a counter sale alone remains unproven; a completed and reconciled Shop lifecycle is `1 proven` across reload; reset returns to zero.
- Both domains serve deployed `12ade3db2a73a586f244dd4e3e26cc4d9bb868fc` after guarded release `31941210015`; paired brand, context, and catalog identities match, the scheduler ceiling is one job, and exact live verification passes.
- Working-set trim is non-terminating and stops no process. Rejected CEO outcomes remain quarantined without repair loops or hidden completion.
`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, or paid resource occurs without owner approval.

## Blockers

- Website, Plant, Ecommerce, and AI budgets still lack hosted activation proof; model calls fail closed.
- Read-only hosted audit: `supermegabase` is PostgreSQL 17.6 at private schema v10 with 15 private policies, metadata RLS, and zero workspace data. The public browser quarantine is applied: zero browser-privileged objects remain, the Security Advisor is clear (27 INFO-only accepted default-deny notices), and writes stay off pending storage/recovery proof and owner authorization.
- The live products remain isolated samples; managed persistence and tenant security are unproven.
- Live HQ and both domains agree on `12ade3db`; no release drift is present. Two hosted-readiness gates still block managed activation/marketing (hosted PG17, security, storage privacy, managed persistence, and the live product contract prerequisites are ready-hosted); external handoffs require `release:handoff:verify`.
- No self-serve pilot tenant, managed tenant, revenue result, or time-saved baseline is verified. Founder decision 2026-08-12: pilots are self-serve; the user names themselves.
- Self-serve tenant creation is proven six-for-six on a deleted isolated v11 branch (`hq/readiness/self-serve-pilot-proof.json`): window refusal, isolated owner tenant, idempotent replay, cross-actor `claim_code_conflict`, event immutability, cross-tenant invisibility — all through the session pooler under real RLS. It is not live: production stays at v10 behind the 503 window, so a real tenant awaits the founder `production_activation` decision (`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`).
- Hosted scheduling has no signed bundle, credentials, worker URL, or allowlist and stays blocked until managed storage, security, recovery, and owner evidence pass.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve dormant roles, one cycle, one active assignment, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice keeps one primary action, progressive disclosure, mobile acceptance, recovery evidence, tenant isolation, and human approval. Add depth inside the four products, not as more pages or products.

## Next evidence

1. Land the reviewed branch and promote it.
2. Fund one isolated branch; finish the four OPS-001 gates — recovery and exact
   restore, Storage denial, a server-only backend login role, tenant separation.
3. Enable managed writes for one named Shop operator; measure setup time, daily
   completion, review effort, recovery.
4. Then open sign-up: an identity, a workspace bound to it, four products reading
   it — the unactivated `app_private` v10 model, not new architecture.
5. Custom work and further SaaS follow one client carried through a portal.
