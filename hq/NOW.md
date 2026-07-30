# HQ now

Updated: 2026-07-30
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `df4d26ca3eb427578607c6a5016848d046bdb34f`
Live state observed: `2026-07-30T03:41:21.086Z`
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

- HQ keeps 12 registered roles and two active assignment records; each Ally cycle activates exactly one local specialist, and registered roles consume no idle compute. Ally stays zero-subagent: its audit requires exactly one `[features] multi_agent = false` declaration; no duplicate dev server or loaded local model. Idle Ollama hosts were stopped; one lease blocks duplicates (`21afe44`).
- Hosted scheduling remains deliberately dormant; flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation (`07dd959`).
- Storage privacy now has a six-request owner-confirmed verifier and zero-network configuration preflight; hosted proof remains blocked (`be78a02`).
- Each CEO cycle selects one outcome. Invalid identity/evidence stops before spend; owner-send uncertainty is explicit, retains claims, and is never auto-retried (`f1328a0`, `cafdafe`, `f626ee7`).
- YTF identities cannot render in core operations. Managed workspaces retain exact requests in the Shop inbox; Shop confirmation alone creates an order.
- Client setup uses one manifest-backed smart import with exception review (`ab9a89e`).
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancel releases, complete consumes, and sellable returns restore the exact fulfilled location/lot (`3cd4825`).
- Shop keeps a balanced accounting-review CSV grouped by payment method and a human-approved versioned tax code, rate, and inclusive/exclusive treatment. Receiving separates accepted stock from rejected supplier units and measures defects; no posting occurs (`d47f5d9`, `39b7fc2`, `a37c933c`, `552ed20a`).
- Ecommerce return intent opens the exact completed Shop order; Shop alone records return and refund evidence.
- Ecommerce carries versioned contact/address snapshots through recovery and Shop handoff; hosted identity and provider execution remain absent.
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, replay, and rollback; operation/output requires exact authenticated Shop issue evidence. Shop remains stock authority for exact returns and substitution. Controlled batches bind reviewed productive time and closed downtime before Availability and OEE.
- Plant maintenance binds strategy, due work, structured results, evidence-linked finding problems, and corrective-action closeout with final human disposition. It performs no automatic problem opening, dispatch, control, telemetry, status, or parts action.
- Home keeps Shop and Plant exceptions above collapsed HQ work. Plant issues link to Problems; `/work/` stays labelled HQ.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.
- CEO status is output-free across weekly briefs. Company Week separates recorded from delivered and fails incomplete delivery to attention; Company Health shows receipt counts (`8d97d4d`, `ece46ce`).
- CEO brief startup is 13 files/250,926 bytes; unchanged evidence uses zero model work.

## Verified baseline

- Current local checkpoints: workspace recovery `81c1db0`, database contracts `dd0d84a`, and Shop receivables `8402162`; the full app gate and all 359 Python tests pass.
- The candidate passes 387 Python, 290 Commerce, 274 Production, 77 security, lint, build, and the complete app gate. Checkpoints `73134144`, `f97c50f2`, and `ba9a9ef9` add controlled substitute approval, exact issue/genealogy, and Shop review. The webview did not attach; ENG-128 makes no rendered claim.
- Client preparation passes 186 onboarding, 74 security, six preparation, recovery, release, privacy, database, Vercel, HQ, approval, and tamper-before-write checks.
- Browser proof: one Manufacturing kit installed all four products, persisted prepared records, completed a Shop sale (OIL-1L 48 to 47; orders four to five), reset cleanly, and reprovisioned. Desktop/mobile had no overflow or browser warnings.
- First-action QA routes Shop, Plant, and Website blockers to the next task; mobile controls are 44 px and guide/review actions create no record (`36fa7dd`).
- Both domains serve deployed `df4d26ca3eb427578607c6a5016848d046bdb34f`; paired brand, context, and catalog identities match.
- Production remains an `isolated_demo`: managed database, schema, audit, security, and writes are not ready. The hosted scheduler is degraded and unconfigured by design, uses no Ally compute, and retains a zero-idle execution target.
- Ally cycles hash-bind one serial specialist to zero external/Vercel/scheduler actions, three local calls at most, 4,096/768 tokens, and `keep-alive 0s`. `supermega.ally-working-set-trim.v1` released 2,949.3 MB without Codex process stops; an unrelated six-role run was interrupted and reconciled without rerun. Audit retains one frontend, backend, idle worker, zero models/subagents, and one-run admission. Four CEO outcomes are accepted; Finance/Risk remains quarantined.
`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without owner approval.

## Blockers

- Website, Plant, Ecommerce, and AI budgets still lack hosted activation proof; model calls fail closed.
- `supermegabase` is not a trial target: it has existing records, one recorded migration, and 27 public RLS tables without policies. No isolated branch is verified, so managed writes remain off.
- The live products remain isolated samples; managed persistence and tenant security are unproven.
- Production `221c08ba` and the local candidate diverge from common base `5d1c5d7c`; the candidate is verified locally but is not a safe direct release. The histories now contain nine production-only and 191 candidate-only commits.
- Production `df4d26ca3eb427578607c6a5016848d046bdb34f` lacks the live launch-readiness context. Live HQ reports this drift without release acceptance. Preview, promotion, marketing readiness, and managed activation remain blocked; any external handoff must pass `release:handoff:verify`.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Hosted scheduling has no signed bundle, credentials, worker URL, or allowlist and stays blocked until managed storage, security, recovery, and owner evidence pass.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve dormant roles, one cycle, two active assignments, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice must keep one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and human approval for consequential actions. Enterprise depth is added inside the four products, not as more pages or products.

## Next evidence

1. Rehearse founder-selected client CSVs across all four products, including reconciliation, rollback, mobile, reload, duplicate handoff, export, and reset.
2. On approved isolated Supabase, prove Storage, RLS, tenant isolation, and exact restore before writes.
3. Recruit one approved Shop design partner, then require protected preview, paired verification, observability, rollback, and fresh live HQ evidence before marketing. Keep AI and scheduling dormant until their gates pass.
