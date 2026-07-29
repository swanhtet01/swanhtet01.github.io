# HQ now

Updated: 2026-07-29
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `d38cdbb8031395c851470edb3b10bf97dbdcf681`
Live state observed: `2026-07-29T02:23:10Z`
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

- HQ caps 12 roles, four jobs, and zero idle compute; overrides fail closed and duplicate ceilings are removed. Ally stays zero-subagent: its audit requires exactly one `[features] multi_agent = false` declaration and reports a zero ceiling; no duplicate dev server or loaded local model. Idle Ollama hosts were stopped; one lease blocks duplicate cycles (`21afe44`).
- Hosted scheduling remains deliberately dormant; flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation (`07dd959`).
- Storage privacy now has a six-request owner-confirmed verifier and zero-network configuration preflight; hosted proof remains blocked (`be78a02`).
- Each CEO cycle selects one outcome. Invalid identity/evidence stops before spend; owner-send uncertainty is explicit, retains claims, and is never auto-retried (`f1328a0`, `cafdafe`, `f626ee7`).
- YTF identities cannot render in core operations. Managed workspaces retain exact requests in the Shop inbox; Shop confirmation alone creates an order.
- Client setup uses one manifest-backed smart import with exception review (`ab9a89e`).
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancel releases, complete consumes, and sellable returns restore the exact fulfilled location/lot (`3cd4825`).
- Shop keeps a balanced accounting-review CSV grouped by payment method and a human-approved versioned tax code, rate, and inclusive/exclusive treatment. Receiving separates accepted stock from rejected supplier units and measures defects; no posting occurs (`d47f5d9`, `39b7fc2`, `a37c933c`, `552ed20a`).
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, release, replay, and rollback; operation/output requires exact authenticated Shop issue evidence. Controlled batches bind reviewed productive time and closed downtime before Availability and OEE. Cost, calibration, rework, and local handoff scope fail closed (`3c885d8`, `b78a3248`, `3c87a842`, `932636be`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. Plant issues link to Problems; `/work/` stays labelled HQ.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.
- CEO status is output-free across weekly briefs. Company Week separates recorded from delivered and fails incomplete delivery to attention; Company Health shows receipt counts (`8d97d4d`, `ece46ce`).
- CEO brief startup is 13 files/245,202 bytes; operations and eight connectors are deferred (`006070f`, `c508983`). Fixed HQ synthesis keeps report time in evidence but outside cache keys, so unchanged evidence uses zero model work (`1c62d45`).
- Company Health separates registered roles from running compute and rejects malformed counts (`adde4a09`). CEO errors preserve only recognized redacted live-contract categories (`cd53a31`).

## Verified baseline

- Current local checkpoints: workspace recovery `81c1db0`, database contracts `dd0d84a`, and Shop receivables `8402162`; the full app gate and all 351 Python tests pass.
- Client preparation passes 186 onboarding, 74 security, six preparation, recovery, release, privacy, database, Vercel, HQ, approval, and tamper-before-write checks.
- Browser proof: one Manufacturing kit installed all four products, persisted prepared records, completed a Shop sale (OIL-1L 48 to 47; orders four to five), reset cleanly, and reprovisioned. Desktop/mobile had no overflow or browser warnings.
- First-action QA routes Shop, Plant, and Website blockers to the next task; mobile controls are 44 px and guide/review actions create no record (`36fa7dd`).
- Both domains serve deployed `d38cdbb8031395c851470edb3b10bf97dbdcf681`; four direct samples open and paired brand/catalog identities match.
- Production remains an `isolated_demo`: managed database, schema, audit, security, and writes are not ready. The hosted scheduler is degraded and unconfigured by design, uses no Ally compute, and retains a zero-idle execution target.
- `supermega.ally-working-set-trim.v1` released 2,270.7 MB without process stops; admission opened at 81.3% RAM. A post-gate 1,685.2 MB trim leaves admission open at 84.6% RAM with zero loaded models and one idle worker. The CEO period retains four accepted outcomes and one quarantined Finance/Risk artifact; repair stops at missing live launch-readiness context before knowledge, queue, or model work.
`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without owner approval.

## Blockers

- Website, Plant, Ecommerce, and AI budgets still lack hosted activation proof; model calls fail closed.
- `supermegabase` is not a trial target: it has existing records, one recorded migration, and 27 public RLS tables without policies. No isolated branch is verified, so managed writes remain off.
- The live products remain isolated samples; managed persistence and tenant security are unproven.
- Local integration now combines deployed `d38cdbb` Settings v23 and richer product controls with recovery, Shop operating flow, receivables, service scheduling, production demand, and settlement work; it is verified locally but not released.
- Production `d38cdbb8031395c851470edb3b10bf97dbdcf681` lacks launch-readiness, so live HQ and CEO repair fail closed. The external handoff packet binds current candidate, remote/live identity, workflow authority, ancestry, and no-deploy controls and must pass `release:handoff:verify`; mutable counts stay out.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Hosted scheduling has no signed bundle, credentials, worker URL, or allowlist and stays blocked until managed storage, security, recovery, and owner evidence pass.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve roster roles, four active assignments, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice must keep one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and human approval for consequential actions. Enterprise depth is added inside the four products, not as more pages or products.

## Next evidence

1. Repeat the proven private-package path with founder-selected client CSVs for all four products and validate reconciliation, correction, and rollback evidence.
2. On approved isolated Supabase, use the workspace package to prove Storage, RLS, isolation, exact restore, and one tenant before writes.
3. Repeat all 12 profiles live, including mobile, reload, import repair, duplicate handoff, export, and reset.
4. Recruit one founder-approved Shop design partner with a named operator, baseline, five-day evidence plan, and explicit acceptance criteria.
5. Keep AI and hosted scheduling dormant until the managed-security, durable-budget, recovery, and owner-approval gates pass; registered roles must continue to consume zero idle compute.
6. Review and integrate the exact current candidate through current `main`, then require protected preview, paired live verification, observability, rollback, and fresh `hq:verify:live` before marketing or another CEO repair.
