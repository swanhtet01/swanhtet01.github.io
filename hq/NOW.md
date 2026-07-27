# HQ now

Updated: 2026-07-27
Owner: founder / CEO
Mode: Codex-only guarded production release; managed operation remains isolated
Live state contract: `supermega.hq-live-state.v1`
Live release commit: `2b25e747c1818703031a3bfcb958f7669655a157`
Live state observed: `2026-07-27T21:13:48Z`
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
- Shop opens directly into a visual sell counter at `/shop/`; orders and stock remain one tap away. The shared app shell supports dark and light themes, with mobile-first controls across all four products (`2b25e747`).
- Plant is task-first at `/plant/` and controls no equipment.
- Website turns a five-field brief into a responsive, ready-page preview and standalone HTML download. Browser-local users skip managed release paperwork; connected workspaces retain evidence and approval controls. Download never deploys or changes a domain (`dfbe00b3`).
- Ecommerce uses versioned Shop data for a recoverable multi-line cart and deterministic quote. Managed workspaces retain exact requests in the Shop inbox; V1 requests stay readable, and only Shop confirmation creates an order (`aed737a`).
- AI remains gated; Order Intake passed 20 local cases, but provider execution still needs credentials.
- Client setup is two steps with one manifest-backed smart import; exact matches collapse and exceptions open for review (`ab9a89e`).
- Shop Stock has one Commerce authority. Orders and Website conversions reserve deterministic location/lots; cancel releases, complete consumes, and sellable returns restore the exact fulfilled location/lot. Counts reconcile physical balances above reservations; Plant issues consume deterministic fewest-lot ATP. Aggregate-only managed changes fail closed (`3cd4825`).
- Plant Jobs persists managed BOM/routing, WIP, minutes, genealogy, quality, release, replay, and rollback; operation/output requires exact authenticated Shop issue evidence (`3c885d8`).
- Home keeps Shop and Plant exceptions above collapsed HQ work. Purchases suppress duplicate stock tasks; a Plant issue badge links to Problems and otherwise the card opens Jobs. `/work/` stays labelled HQ; bottom navigation reads Home, HQ, and Products.
- `npm run dev` starts canonical FastAPI plus Vite on loopback with database, hosted-auth, model, worker, and write authority cleared. Records stay browser-local; hosted activation is not proven.

## Verified baseline

- Current checkpoints: product `17b458f`, release `2b25e747`, agent operations `a2e1b89`, operations `63a245f`, and security `98b8044`.
- App/local gates pass: 314 Python tests, lint/build, 54 Shop inventory/221 Commerce/258 Production checks, 69 security checks, and the complete release/database/Vercel/HQ suite.
- A 390 px Shop journey passed exact-lot reserve, fulfil, and sellable return with no overflow; managed count and Plant allocation remain model/runtime verified.
- First-action QA routes Shop, Plant, and Website blockers to the next task; mobile controls are 44 px and guide/review actions create no record (`36fa7dd`).
- Both `supermega.dev` and `app.supermega.dev` serve exact commit `2b25e747c1818703031a3bfcb958f7669655a157`. The public site exposes four direct product links with no template catalogue; the app opens Shop, Plant, Website, and Ecommerce into usable samples. The coordinated release, app guard, paired live verification, rollback rehearsal, and independent rendered-browser check pass at catalog `2026-07-28.1`.
- Production remains an `isolated_demo`: managed database, schema, audit, security, and writes are not ready. The hosted scheduler is degraded and unconfigured by design, uses no Ally compute, and retains a zero-idle execution target.

`hq/WORKBOARD.md` remains assignment authority for four bounded teams.

## Owner-gated actions

No external send, payment, refund, publish, domain change, connector write, merge, deployment, access change, production database write, paid resource, or revenue claim occurs without explicit owner approval.

## Blockers

- Website, Plant, and Ecommerce have tenant-bound persistence contracts but still lack hosted cross-device/activation proof.
- AI-budget SQL/RPCs pass local concurrency, indexed aggregate, redaction, and provisioning checks but lack approved hosted proof; model calls stay fail closed.
- `supermegabase` is not a trial target: it has existing records, one recorded migration, and 27 public RLS tables without policies. No isolated branch is verified, so managed writes remain off.
- The four products are live only as isolated sample workspaces; cross-device managed persistence and tenant security are not proven.
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
