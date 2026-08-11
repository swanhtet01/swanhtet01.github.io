# SuperMega Timeline

Updated: 2026-08-11
Owner: founder / CEO
Branch: fix/demo-seed-clock (20 commits ahead of origin)

---

## North-star outcome

One real workflow where SuperMega keeps the record and a responsible owner resolves exceptions — measured by time-saved, correction effort, and a reconciled operating record.

---

## Current state (2026-08-11)

**Products**: Shop, Plant, Website, Ecommerce — all `release-candidate-local`. All four pass their full acceptance matrix (mobile, recovery, overflow, security, onboarding). No managed tenant. No live operators.

**Test baseline**: 106 Ecommerce + 342 Commerce + 327 Production + 10 Shop next-action + 109 Website + 95 security + 241 onboarding + 11 backup + 85 managed-import + 56 PostgreSQL + 58 AR receivables checks.

**Accounting export packet**: AP supplier payables handoff + AR customer receivables handoff, both digest-bound. Shop accounting packet surfaces daily-close CSV, payables CSV, and receivables CSV to the operator.

**Budget**: 2,814,563 / 2,822,000 bytes. Headroom: 7,437 bytes. Largest JS chunk: 392,412 / 500,000 bytes.

**Live**: Both domains serve `25cac2f5`. Live scheduler is `degraded`, managed persistence is not proven, security writes are off.

**Blockers**: Seven hosted-readiness gates, two unresolved founder decisions (approve_preview_branch_target, name_shop_pilot_operator). No named pilot customer or operator.

---

## Phase 1 — Baseline hardening (Aug 2026)

_No founder decision required. Zero bundle cost._

### Aug 11–15

- [x] OPS-155 complete — AR customer receivables handoff CSV (2026-08-11)
- [ ] R&D research docs: OpenTelemetry implementation plan, order-intake-agent evaluation, durable-workflows comparison
- [ ] Comprehensive agent team plan published (`hq/AGENT-TEAM-PLAN.md`)
- [ ] Comprehensive timeline published (this document)

### Aug 15–25

- [ ] Test coverage: raise Shop next-action checks from 10 → 30+ (cover reject, amend, return, handoff)
- [ ] Test coverage: raise backup checks from 11 → 25+ (cover incremental, restore-in-place, corrupt-header)
- [ ] Plant CAPA effectiveness review: add a time-gated "effectiveness-due" field so a corrective action does not close silently after one day
- [ ] Artifact budget: locate and remove any dead tree-shaking opportunity; target 2,000 bytes freed

### Aug 25–31

- [ ] R&D decision: durable-workflows gate → keep kernel queue, record Vercel Workflows as target for managed mode
- [ ] Portfolio update: record all three R&D evaluations as complete
- [ ] Branch push to origin and pull request opened for review (requires founder approval to merge)

---

## Phase 2 — Managed-mode proof (Sep–Oct 2026)

_Requires two founder decisions: approve_preview_branch_target + name_shop_pilot_operator._

### Sep 2026 — Isolated tenant setup

**Founder action required**: approve one named isolated Supabase tenant for the pilot operator.

Once approved:
- Apply migrations v8–v10 (currently code-only) to isolated tenant
- Prove Storage, RLS, and tenant isolation on the isolated tenant
- Prove exact restore from backup against the isolated tenant
- Open owner-console read-only audit on isolated tenant
- Pass the six-request owner-confirmed storage verifier with real credentials

Checkpoint: `managed-storage-proof` — zero writes proceed until this passes.

### Oct 2026 — First hosted operator

**Founder action required**: name one pilot Shop operator and approve their access.

Once named:
- Recruit the pilot operator through a protected preview (not a public URL)
- Walk through one authenticated order-to-close + return-exception on the isolated tenant
- Record baseline: time-saved, correction effort, exception count
- Verify no data leaks to public schema (27 security-advisor notices remain INFO-only)
- Schedule a five-day evidence plan with the operator

Checkpoint: `shop-pilot-evidence` — no marketing or growth activity until this passes.

---

## Phase 3 — Capability activation (Nov–Dec 2026)

_Requires managed-storage-proof + shop-pilot-evidence._

### Nov 2026 — AI and scheduling unlocks

Once managed persistence is proven:
- Activate hosted scheduling: sign the bundle, set worker URL, bind allowlist
- Begin Plant OEE pilot: one named operator + supervisor, order-bound OEE window, exact downtime source
- Begin Website brief pilot: one named business, brief through accepted responsive preview
- Begin Ecommerce hosted activation: Shop-linked catalogue, one order intent round-trip

Each activation follows the same pattern: isolated tenant, named operator, five-day evidence, no external handoffs until proof passes.

### Dec 2026 — AI assistance gate (gated R&D)

AI order intake (`ai-order-intake`) requires passing the server-only golden-set evaluation:
- Provenance on every field
- Zero side effects (no order until explicit confirm)
- Budget gate proven (spend cap per intake, monthly limit)
- Human review surface shipped and accepted
- 20-case fixture corpus passes at ≥ 95% no-correction rate

This gate is deliberately deferred until the operating record is proven without AI.

---

## Phase 4 — Growth (Q1 2027)

_Requires all Phase 3 evidence._

### Jan 2027 — Second operator

- Recruit one second pilot operator (a different business type from Phase 2)
- Measure correction-effort trend across 30 days
- Publish first public case study if operators consent

### Feb 2027 — Enterprise capabilities

Three enterprise tiers are defined but not yet activated:

1. **verified-statements** — financial/quality statement verification, digest-bound, owner-signed
2. **staff-roles** — operator-level permissions within a managed tenant (not just founder-level)
3. **shared-workspace** — cross-operator read-only views within a tenant group

Activation order: verified-statements → staff-roles → shared-workspace.
Each requires: isolated tenant proven, identity gate passed, one use case piloted before wide release.

### Mar 2027 — Marketing activation

- Public landing page updated with real case study
- Domain authority: supermega.dev + supermega.app both serving the live app
- Waitlist or contact form activated (not a self-serve signup — requires founder approval per new tenant)
- No paid acquisition until the second operator's evidence is in hand

---

## Phase 5 — Unicorn trajectory (2027)

_North-star: 10 operators, 3 business types, measured time-saved, zero data incidents._

### Mid-2027 — Platform foundations

- OpenTelemetry: activate with managed mode; scrubber passes 40-span golden corpus; no PII in 1,000 synthetic spans
- Durable workflows: adopt Vercel Workflows for the approval-wait pattern after managed persistence is proven; eight adoption conditions verified
- Cross-product reporting: Shop → Plant job tracking; Ecommerce → Shop reconciliation; Website → Ecommerce conversion path

### Late 2027 — AI-native workflows

- Order intake agent in production (requires full Phase 3 AI gate)
- Plant MRP with AI-assisted exception triage
- Ecommerce promotional pricing with AI-reviewed margin rules
- Website brief generation with AI-assisted responsive layout

Each is shipped as a reviewed, human-confirmed workflow — not autonomous action.

---

## Blocking decision registry

| Gate | Type | Who | What |
|------|------|-----|------|
| `approve_preview_branch_target` | Founder | Swan Htet | Approve the branch to deploy to preview domain |
| `name_shop_pilot_operator` | Founder | Swan Htet | Name one operator for the isolated Shop pilot |
| `approve_isolated_tenant` | Founder | Swan Htet | Approve one named Supabase tenant for the pilot |
| `approve_plant_oee_pilot` | Founder | Swan Htet | Approve Plant OEE pilot after Shop evidence passes |
| `approve_website_brief_pilot` | Founder | Swan Htet | Approve Website brief pilot after Storage is proven |
| `approve_ai_activation` | Founder | Swan Htet | Approve AI assistance after operating record is proven |
| `approve_marketing` | Founder | Swan Htet | Approve first public case study and growth activity |

All seven gates collapse to two: (1) approve one isolated tenant + (2) name one pilot operator. Everything else follows in sequence.

---

## R&D pipeline

| Track | Gate | Status | Document |
|-------|------|--------|----------|
| OpenTelemetry | adopt-with-managed-mode | research-ready | `hq/research/opentelemetry-implementation-plan-2026-08.md` |
| Durable workflows | evaluate | decided — keep kernel queue | `hq/research/durable-workflows-comparison-2026-08.md` |
| Order intake agent | evaluate | evaluation-design | `hq/research/order-intake-agent-evaluation-2026-08.md` |
| Verified statements | design | not started | enterprise-product-roadmap |
| Staff roles | design | not started | enterprise-product-roadmap |
| Cross-product reporting | design | not started | enterprise-product-roadmap |

---

## Artifact budget watchline

| Metric | Value | Gate |
|--------|-------|------|
| Total bytes | 2,814,563 | < 2,822,000 |
| Headroom | 7,437 bytes | |
| Largest JS chunk | 392,412 bytes | < 500,000 |
| Largest JS headroom | 107,588 bytes | |
| Status | tight | review every slice |

Every new product slice must pass `npm run app:verify` before commit. Any slice that brings headroom below 2,000 bytes requires an offsetting removal.
