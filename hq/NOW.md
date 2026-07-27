# HQ now

Updated: 2026-07-27
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `f00b1e3ee163714e7c6f1db4a7f17c3cac73de46`
Live state observed: `2026-07-27T17:34:43Z`
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

AI assistance stays gated R&D until these four pass onboarding, import, recovery, security, and pilot evidence.

`Commerce` and `Production` remain internal IDs. Ecommerce owns the customer storefront and order intent; Shop owns the operating record and close.

HQ, Work, Agent Teams, R&D, Ops, Console, and machine coordination are internal, not customer products.

## Implemented reality

- HQ caps 12 roles, four jobs, and zero idle compute; overrides fail closed and duplicate ceilings are removed.
- Ally stays zero-subagent; multi-agent is disabled. One coordinator listener remains, with no duplicate dev server or loaded local model. Idle Ollama hosts were stopped.
- Seven jobs use Agent Operations or core GitHub; exact-tenant catalogs mean YTF identities cannot render in core operations (`b46c386`).
- Hosted scheduling remains deliberately dormant; flag-only, preview, stale, incomplete, or tampered activation attempts stop before worker invocation (`07dd959`).
- Storage privacy now has a six-request owner-confirmed verifier and zero-network configuration preflight; hosted proof remains blocked (`be78a02`).
- Each CEO cycle selects at most one HQ-authorized outcome; blocked, duplicate, or invalid work stops before model or send (`cdd925a`).
- Model calls reserve before provider I/O. All tenants and retries share one atomic UTC-day ceiling; failures stay charged, cache hits reserve nothing, hosted memory state fails closed, and the hard maximum is 2,000,000 units (`a2e1b89`).
- Shop covers its operating lifecycle at `/shop/`; message intake stays lazy and initial JavaScript is 477,717 bytes (`3cd4825`).
- Plant is task-first at `/plant/` and controls no equipment.
- Website builds a guarded preview, approved site file, and tenant-bound release plan at `/website/`; it never deploys (`a400a86`).
- Ecommerce uses versioned Shop data for a recoverable multi-line cart and deterministic quote. Managed workspaces retain exact requests in the Shop inbox; V1 requests stay readable, and only Shop confirmation creates an order (`aed737a`).
- AI remains gated; Order Intake passed 20 local cases, but provider execution still needs credentials.
- Client setup is two steps with one manifest-backed smart import; exact matches collapse and exceptions open for review (`ab9a89e`).
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancel releases, complete consumes, and sellable returns restore the exact fulfilled location/lot. Counts reconcile physical balances above reservations; Plant issues consume deterministic fewest-lot ATP. Aggregate-only managed changes fail closed (`3cd4825`).
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, release, replay, and rollback; operation/output requires exact authenticated Shop issue evidence (`3c885d8`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.

## Verified baseline

- Current local checkpoints: product `3cd4825`, agent operations `a2e1b89`, operations `63a245f`, and security `98b8044`.
- App/local gates pass: 314 Python tests, lint/build, 54 Shop inventory/221 Commerce checks, 66 security checks, and a 477,717-byte largest chunk. Kernel passes 282 tests, 69 connectors/993 adversarial calls, and 15 crews/214 checks.
- Desktop/mobile Shop passes. A rendered 390 px flow set up two locations, reserved and fulfilled one order, previewed `Main store / OPENING-001`, and returned the unit to that exact lot with no overflow or crash overlay. Managed count and Plant allocation remain model/runtime verified.
- Core first-action QA leads Shop Stock, incomplete orders to Promise or Payment, Plant alerts to Problems or output, and invalid Website briefs to their first error. Mobile controls are at least 44 px with focus-safe fixed navigation (`36fa7dd`); guide and review actions create no record.
- PR #264 merged the trustworthy Ecommerce checkout and payment/fulfilment contract. Both `supermega.dev` and `app.supermega.dev` serve exact commit `f00b1e3e`; paired live verifiers, release guard, and independent live health pass with brand `jade-v2-2026-07` and context/catalog `2026-07-27.1`.
- Production remains an `isolated_demo`: managed database, schema, audit, security, and writes are not ready. The hosted scheduler is degraded and unconfigured by design, uses no Ally compute, and retains a zero-idle execution target.

`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Website, Plant, and Ecommerce have tenant-bound persistence contracts but still lack hosted cross-device/activation proof.
- AI-budget SQL/RPCs pass local concurrency, indexed aggregate, redaction, and provisioning checks but lack approved hosted proof; model calls stay fail closed.
- `supermegabase` is not a trial target: it has existing records, one recorded migration, and 27 public RLS tables without policies. No isolated branch is verified, so managed writes remain off.
- The four products are live only as isolated sample workspaces; cross-device managed persistence and tenant security are not proven.
- The next release still needs an exact-commit protected preview before alias promotion; no fallback project or domain is allowed.
- No named pilot customer, managed tenant, revenue result, or time-saved baseline is verified.
- Hosted scheduler activation is blocked correctly: no signed activation bundle, cron token, cron secret, worker URL, or worker allowlist is configured. Do not activate it before managed storage, security, recovery, and owner evidence pass.
- SAP-grade gaps remain in Shop tax/location accounting and external refund settlement, Plant costing/OEE/calibration, Website hosted CMS/release, and Ecommerce payment/shipping/tax/returns.

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
