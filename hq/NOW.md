# HQ now

Updated: 2026-07-28
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `af3f45c22b13e5edccdf87214608817fc3499e4d`
Live state observed: `2026-07-28T09:43:03Z`
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

AI assistance remains gated R&D pending onboarding, import, recovery, security, and pilot evidence.

`Commerce` and `Production` are internal IDs. Ecommerce owns storefront/order intent; Shop owns the operating record.

HQ, Work, Agent Teams, R&D, Ops, Console, and machine coordination are internal only.

## Implemented reality

- HQ caps 12 roles, four jobs, and zero idle compute; overrides fail closed and duplicate ceilings are removed.
- Ally stays zero-subagent; multi-agent is disabled. One coordinator listener remains, with no duplicate dev server or loaded local model. Idle Ollama hosts were stopped. A named single-flight lease blocks duplicate company cycles and releases in `finally` (`21afe44`).
- Seven jobs use Agent Operations or core GitHub; exact-tenant catalogs mean YTF identities cannot render in core operations (`b46c386`).
- Hosted scheduling remains deliberately dormant; flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation (`07dd959`).
- Storage privacy now has a six-request owner-confirmed verifier and zero-network configuration preflight; hosted proof remains blocked (`be78a02`).
- Each CEO cycle selects one outcome. Invalid identity/evidence stops before spend; owner-send uncertainty is explicit, retains claims, and is never auto-retried (`f1328a0`, `cafdafe`, `f626ee7`).
- AI attempts reserve before provider I/O under a 2,000,000-unit hard daily cap; failures stay charged and cache hits spend zero (`a2e1b89`). A shared rejection records later specialists as `not_run`; replay spends zero (`44dfba9`).
- Ecommerce uses versioned Shop data. Managed workspaces retain exact requests in the Shop inbox; only Shop confirmation creates an order (`aed737a`).
- All four browser-local imports activate only after review: Shop stock, Plant jobs/BOM/routing, Website content, and Ecommerce merchandising through Shop authority (`7ae8c80`).
- Client setup is two steps with one manifest-backed smart import; exact matches collapse and exceptions open for review (`ab9a89e`).
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancel releases, complete consumes, and sellable returns restore the exact fulfilled location/lot (`3cd4825`).
- Shop close keeps a balanced accounting-review CSV grouped by payment method and freezes a human-approved versioned tax code, rate, and inclusive/exclusive treatment into future orders. Owner-reviewed account mappings apply only to later closes; history stays unchanged and no filing or posting occurs (`d47f5d9`, `39b7fc2`, `369cb2b`).
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, release, replay, and rollback; operation/output requires exact authenticated Shop issue evidence (`3c885d8`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. When present, a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.
- CEO status is output-free across weekly briefs. Company Week separates recorded from delivered and fails incomplete delivery to attention; Company Health shows receipt counts (`8d97d4d`, `ece46ce`).
- CEO brief startup is 13 files/240,190 bytes; operations and eight connectors are deferred (`006070f`, `c508983`). Fixed HQ synthesis keeps report time in evidence but outside cache keys, so unchanged evidence uses zero model work (`1c62d45`).

## Verified baseline

- Current checkpoints: product `7ae8c80`, CEO preflight `f1328a0`, delivery `cafdafe`/`f626ee7`, CEO operations `909807d`, performance `6bad4e7`, release `39642eb`, Shop finance `d47f5d9`/`39b7fc2`/`369cb2b`, agent operations `a2e1b89`, operations `63a245f`, security `98b8044`, and Ally dispatch `21afe44`.
- App gates pass: 332 Python, production build, 54 Shop inventory/245 Commerce/265 Production, 70 security, and release/database/Vercel/HQ checks.
- PostgreSQL 17.10 rehearsal passes twice: migrations, isolation, four-product journeys, human approvals, TLS, backup/restore, and cleanup. Hosted Storage privacy remains unproven (`2930ecf`).
- First-action QA routes Shop, Plant, and Website blockers to the next task; mobile controls are 44 px and guide/review actions create no record (`36fa7dd`).
- Both `supermega.dev` and `app.supermega.dev` serve exact remote `main` commit `af3f45c22b13e5edccdf87214608817fc3499e4d`. The public site exposes four direct product links with no template catalogue; the app opens all four samples directly. Paired release identity is current at catalog `2026-07-28.1`.
- Production remains an `isolated_demo`: managed database, schema, audit, security, and writes are not ready. The hosted scheduler is degraded and unconfigured by design, uses no Ally compute, and retains a zero-idle execution target.
- Ally: 80.0% RAM, zero models, one worker/frontend, eligible dispatch, and no process stops.

`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without owner approval.

## Blockers

- Website, Plant, and Ecommerce still lack hosted cross-device activation proof.
- AI-budget controls pass local checks but lack hosted proof; model calls fail closed.
- `supermegabase` is not a trial target: it has existing records, one recorded migration, and 27 public RLS tables without policies. No isolated branch is verified, so managed writes remain off.
- The four live products are isolated samples; managed persistence and tenant security are unproven.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Hosted scheduling stays blocked: no signed bundle, cron credentials, worker URL, or allowlist exists. Activate only after managed storage, security, recovery, and owner evidence pass.
- Enterprise gaps: Shop corrections, jurisdiction packs, condition rules, and approved posting adapters; Plant costing/OEE/calibration; Website hosted CMS/release; Ecommerce payment/shipping/tax/returns.

## Decisions in force

- Delivery stays on Shop, Plant, Website, and Ecommerce; Ecommerce feeds Shop, and AI remains gated R&D.
- Use one app, identity foundation, evidence/approval model, and release path.
- Keep four teams, twelve roster roles, four active assignments, and zero idle compute.
- New modules require a real user job, an implemented state transition, a failure/recovery path, and an acceptance test.

## Build rule

Every slice must keep one primary action, progressive disclosure, mobile acceptance, import/recovery evidence, tenant isolation, and human approval for consequential actions. Enterprise depth is added inside the four products, not as more pages or products.

## Next evidence

1. On an approved isolated Supabase target, prove private Storage, RLS, replay/isolation, recovery, and one real managed tenant before enabling writes.
2. Repeat the 12-profile rehearsal against the live isolated release, including mobile, reload, import correction, duplicate handoff, export, and reset recovery.
3. Recruit one founder-approved Shop design partner with a named operator, baseline, five-day evidence plan, and explicit acceptance criteria.
4. Keep AI and hosted scheduling dormant until the managed-security, durable-budget, recovery, and owner-approval gates pass; registered roles must continue to consume zero idle compute.
5. For the next release, require exact-commit protected preview, paired live verification, observability, rollback evidence, and an updated `hq:verify:live` snapshot before broader marketing.
