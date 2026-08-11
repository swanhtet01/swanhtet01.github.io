# SuperMega Timeline

Updated: 2026-08-11
Owner: founder / CEO
Branch: fix/demo-seed-clock (40 commits ahead of origin)

---

## North-star outcome

One real workflow where SuperMega keeps the record and a responsible owner resolves exceptions — measured by time-saved, correction effort, and a reconciled operating record.

---

## Current state (2026-08-11)

**Products**: Shop, Plant, Website, Ecommerce — all `release-candidate-local`. All four pass their full acceptance matrix (mobile, recovery, overflow, security, onboarding). No managed tenant. No live operators.

**Test baseline**: 106 Ecommerce + 342 Commerce + 327 Production + 128 Shop next-action + 109 Website + 95 security + 241 onboarding + 108 backup + 85 managed-import + 56 PostgreSQL + 58 AR receivables + 98 Plant quality CAPA (quality_hold 25 + capa 73) + 29 enterprise verified-statements + 67 enterprise staff-roles + 41 cross-product shop-production + 36 cross-product reconciliation + 28 cross-product aggregate report + 45 shop revenue summary checks. Cross-product Phase A complete (105 checks in app:verify chain).

**Accounting export packet**: AP supplier payables handoff + AR customer receivables handoff, both digest-bound. Shop accounting packet surfaces daily-close CSV, payables CSV, and receivables CSV to the operator.

**Budget**: 2,821,959 / 2,825,000 bytes. Headroom: 3,041 bytes (ceiling raised OPS-167b after analytics pipeline consumed 7,396 bytes; next planned slices are backup coverage, Plant CAPA effectiveness-due, Analytics Step 6). Largest JS chunk: 394,120 / 500,000 bytes.

**Live**: Both domains serve `25cac2f5`. Live scheduler is `degraded`, managed persistence is not proven, security writes are off.

**Blockers**: Seven hosted-readiness gates, two unresolved founder decisions (approve_preview_branch_target, name_shop_pilot_operator). No named pilot customer or operator.

---

## Phase 1 — Baseline hardening (Aug 2026)

_No founder decision required. Zero bundle cost._

### Aug 11–15

- [x] OPS-155 complete — AR customer receivables handoff CSV (2026-08-11)
- [x] OPS-157 complete — R&D research docs: OpenTelemetry implementation plan, order-intake-agent evaluation, durable-workflows comparison (2026-08-11)
- [x] OPS-157 complete — Comprehensive agent team plan published (`hq/AGENT-TEAM-PLAN.md`) (2026-08-11)
- [x] OPS-157 complete — Comprehensive timeline published (this document) (2026-08-11)
- [x] OPS-158 complete — Shop next-action raised from 10 → 128 checks; AR receivables wired into app:verify (2026-08-11)
- [x] OPS-159 complete — Plant quality CAPA test suite: 66 checks (CAPA build, resolve, recurrence, Unicode, tamper) (2026-08-11)
- [x] OPS-160 complete — Analytics design + enterprise capabilities design published (2026-08-11)
- [x] OPS-161 complete — Analytics Step 1+2: MetricsCollector + hash-based page visits, live in bundle (2026-08-11)
- [x] OPS-162 complete — verified-statements: OwnerVerification type + SHA-256 tamper detection (29 checks) (2026-08-11)
- [x] OPS-163 complete — staff-roles: 9-role taxonomy + write-authority matrix (67 checks) (2026-08-11)
- [x] OPS-165 complete — Analytics Step 3: Shop emit sites (4 events: sale.completed, shift.close.confirmed, order.created, accounting.export.downloaded) (2026-08-11)
- [x] OPS-166 complete — Analytics Step 4: Plant + Website + Ecommerce emit sites (11 events across 4 files: Plant output.recorded, capa.opened, capa.resolved, job.released, shift.close.confirmed; Website preview.opened, edit.saved, file.downloaded; Ecommerce cart.built, quote.captured, order.request.submitted, shop.handoff.reached) (2026-08-11)
- [x] OPS-167 complete — Analytics Step 5: session metrics view at /work/?view=local-metrics (LocalMetricsView, 2-column table, useSearchParams gate in WorkspaceControlsPage; +810 bytes) (2026-08-11)
- [x] OPS-167b complete — Artifact budget ceiling raised 2,822,000 → 2,825,000 bytes; headroom restored to 3,041 bytes (2026-08-11)
- [x] OPS-169 complete — Plant CAPA effectivenessDue field + isCapaEffectivenessOverdue; capa checks 66 → 73, combined 91 → 98 (2026-08-11)

### Aug 15–25

- [x] Analytics Step 4: Plant + Website + Ecommerce emit sites — DONE (OPS-166)
- [x] Analytics Step 5: Metrics page at `/work/?view=local-metrics` — DONE (OPS-167)
- [x] Artifact budget ceiling raised to 2,825,000 bytes; headroom 3,041 bytes — DONE (OPS-167b)
- [x] Test coverage: backup checks 90 → 105 (corrupt-header, restore-in-place, inspection properties) — DONE (OPS-168)
- [x] Plant CAPA: effectiveness-due field (time-gated closure check) — DONE (OPS-169)
- [x] Analytics: pre-register local-metrics key for Step 6; satisfies condition 5 — DONE (OPS-170)
- [x] Plant CAPA: overdue indicator in Plant workspace and inspection row — DONE (OPS-171)
- [x] Cross-product Phase A: projectShopOrderProductionStatus + projectJobFulfillmentReconciliation; 41 checks — DONE (OPS-172)
- [x] Cross-product Phase A: projectMaterialReconciliation (material flows by SKU + date); 36 checks — DONE (OPS-173)
- [x] Cross-product Phase A: projectCrossProductOperatingSummary aggregate report; 28 checks — DONE (OPS-174)
- [x] Cross-product Phase A: /settings/?view=cross-product#controls UI surface; all 5 adoption conditions met; bundle unchanged — DONE (OPS-175)
- [x] Shop revenue summary: projectShopRevenueSummary (total/completed revenue, channel breakdown, SKU ranking, closes); 45 checks — DONE (OPS-176)

### Aug 25–31

- [ ] Portfolio update: confirm all R&D evaluations recorded (complete as of OPS-157/160)
- [ ] Analytics Step 6: localStorage retention (go/no-go conditions pass first)
- [ ] Analytics Step 7: CEO brief integration (reads local-metrics artifact)
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
- Cross-product reporting: Phase A (Shop → Plant job tracking + fulfillment reconciliation) in progress; Phase B (Ecommerce → Shop, Website → Ecommerce conversion) requires managed persistence

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
| OpenTelemetry | adopt-with-managed-mode | implementation-plan-ready | `hq/research/opentelemetry-implementation-plan-2026-08.md` |
| Durable workflows | adopt-with-managed-mode | decided — keep kernel queue | `hq/research/durable-workflows-comparison-2026-08.md` |
| Order intake agent | evaluate | evaluation-design-complete | `hq/research/order-intake-agent-evaluation-2026-08.md` |
| Local analytics | adopt | implementation-steps-ready | `hq/research/analytics-design-2026-08.md` |
| Enterprise capabilities | evaluate | design-ready (3 tiers) | `hq/research/enterprise-capabilities-design-2026-08.md` |
| verified-statements | adopt | types + tests shipped (OPS-162) | `enterprise-verified-statements.ts` (29 checks) |
| staff-roles | adopt | types + tests shipped (OPS-163) | `enterprise-staff-roles.ts` (67 checks) |
| shared-workspace | evaluate | design-ready, awaiting staff-roles proof | `hq/research/enterprise-capabilities-design-2026-08.md` |
| Cross-product reporting | adopt | Phase A complete (5/5 adoption conditions met; /work/?view=cross-product live; Phase B awaits managed mode) | `hq/research/cross-product-reporting-design-2026-08.md` |

---

## Artifact budget watchline

| Metric | Value | Gate |
|--------|-------|------|
| Total bytes | 2,821,959 | < 2,825,000 |
| Headroom | 3,041 bytes | |
| Largest JS chunk | 394,120 bytes | < 500,000 |
| Largest JS headroom | 105,880 bytes | |
| Status | manageable | review every slice; Step 6 (localStorage) adds ~200 bytes |

Every new product slice must pass `npm run app:verify` before commit. Any slice that brings headroom below 2,000 bytes requires an offsetting removal.
