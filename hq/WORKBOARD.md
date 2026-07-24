# SuperMega work board

Updated: 2026-07-24
Authority: founder / CEO
Canonical repository: `C:\Users\thesw\Projects\supermega-platform`
Integration branch: `agent/supermega-release-candidate`
Last committed local baseline: `d9382c16ec7f8ce0b4e599f837e21bbcb08d858d`

## One operating model

SuperMega uses one accountable Codex work system. The founder defines the product and retains consequential authority. The integrator selects and accepts work; bounded workers inspect, implement, or verify non-overlapping slices.

Add a worker only when its assignment has:

1. one observable outcome;
2. no more than five in-scope paths;
3. a non-overlapping write set;
4. one explicit acceptance check; and
5. a named integrator.

Visible Codex sidebar task creation is not exposed in the current session. Do not claim a task was created there. Until that control becomes available, this board is assignment authority and internal subagents are used only for bounded work.

Claude coordination is paused by founder direction.

## Active board

| ID | Team / worker | Status | Outcome | Write authority | Acceptance |
| --- | --- | --- | --- | --- | --- |
| CEO-006 | CEO / Codex integrator | done-local | Correct the portfolio to Shop, Plant, Website, Ecommerce, and AI Agent Solutions while preserving stable runtime data. | Authority, manifest, app shell, public generator, and verifiers in bounded slices | HQ, app-build, and public-output contracts passed; desktop/mobile routes preserved existing state; no push or deploy. |
| QA-002 | Product / QA Codex | done-local | Prove `/shop/` and `/plant/` are canonical, understandable, mobile-safe, and compatibility-preserving. | Read-only browser and contract checks | 1280 px and 375 px journeys passed; old operation paths canonicalized to the same records; no overflow, browser errors, or state reset. |
| RND-001 | Product R&D Codex | done-local | Define Ecommerce as a customer storefront and order-intent product distinct from Shop. | Read-only Git history audit | Keep the five deleted back-office files deleted; reuse only fingerprint, idempotency, publish, and intake-boundary patterns. |
| RND-002 | AI Product R&D Codex | done-local | Select the first real AI Agent Solution. | Read-only current-code audit | Order Intake is first: approved input to structured source-backed draft, human accept/discard, zero side effects, and a golden-set gate. |
| ENG-003 | Ecommerce Codex | queued | Build Ecommerce slice 1: deterministic storefront configuration and responsive preview from a read-only Shop catalogue snapshot. | New focused Ecommerce maker files only; no Shop mutation | Same input produces same artifact digest; invalid or duplicate SKUs fail; price/stock are not editable; no order, stock, payment, send, or external write. |
| ENG-004 | Agent Solutions Codex | done-local | Complete the Order Intake evaluation gate before model or UI integration. | Order-intake evaluator, CLI, and tests only | The 20-case multilingual/adversarial harness requires latency, token, estimated-cost, retry, refusal, correction, schema-validity, provenance, fabricated-fact, and unsafe-ready evidence; 114 tests pass. |
| ENG-005 | Agent Solutions Codex | queued | Add a server-only Order Intake provider runner with no operational tools or durable raw-message retention. | Provider adapter, API boundary, fake-client tests, and sanitized result writer only | No client secret exposure; strict structured output; one model call; no tools; bounded input/output; every result satisfies the evaluator document contract; failures produce no draft. |
| OPS-001 | Platform / owner | blocked-owner | Repeat the private trial on one isolated hosted Supabase target. | Hosted write only after explicit approval | Five migrations, runtime role, isolation, revocation, recovery, Security Advisor, and pooler evidence. |
| PILOT-001 | Product / founder | blocked-prerequisite | Name one Shop operator and one safe pilot tenant after QA-002. | Founder decision | Baseline, authority boundary, five-day evidence plan, and review date are recorded. |
| GROWTH-001 | Growth Codex | gated | Prepare onboarding and outreach for the verified Shop pilot only. | Draft-only until founder approves sends | One audience, one offer, one onboarding path, and every claim backed by pilot evidence. |
| ENG-001 | Claude Code | paused-founder | Historical Website-to-Shop test assignment. | None while paused | Resume only on explicit founder direction. |

Statuses: `ready`, `active`, `queued`, `review`, `blocked-owner`, `blocked-prerequisite`, `paused-founder`, `done-local`, `released`.

## Product boundaries

### Shop

- Customer-facing name: Shop.
- Stable runtime surface: `commerce`.
- Owns orders, stock, fulfilment, payment status, cancellation, refunds, and close.
- Canonical route: `/shop/`; `/operations/commerce/` is compatibility only.

### Plant

- Customer-facing name: Plant.
- Stable runtime surface: `production`.
- Owns jobs, output, quality, materials, equipment observations, maintenance, and shift problems.
- Canonical route: `/plant/`; `/operations/production/` is compatibility only.

### Website and Ecommerce

- Website owns general pages, navigation, responsive review, approval, and site artifact.
- Ecommerce owns storefront presentation and customer order intent.
- Ecommerce reads a versioned Shop catalogue projection and stops at `pending_confirmation`.
- Shop revalidates and owns every operational consequence.

### AI Agent Solutions

- First solution: Order Intake inside Shop Orders.
- `/agents/` is a future launcher, not a second runtime.
- The assistant prepares a draft from approved or synthetic input, shows exact source provenance, and lets a named human correct, accept for manual entry, or discard.
- It does not create an order, reserve stock, send a reply, initiate payment, publish, deploy, change access, or write externally.

## Integrator rules

- Own `hq/NOW.md`, this board, portfolio authority, integration decisions, and go/no-go evidence.
- Do not duplicate an active worker assignment.
- Review every worker handoff and rerun proportionate checks.
- Do not push, merge, deploy, enable hosted writes, send messages, spend money, publish, or change access without the relevant owner gate.
- Keep internal runtime names when they protect data compatibility; use customer names in routes, UI, and public claims.

## Handoff contract

Every worker handoff contains:

1. work item ID and observable outcome;
2. base SHA, final SHA, branch, and workspace;
3. changed paths and confirmation that no other paths changed;
4. commands run and exact pass/fail results;
5. remaining risks and anything not tested; and
6. one recommended next action.

## Execution order

1. Finish CEO-006 and QA-002; commit one reviewed identity correction.
2. Start ENG-005 before exposing an Agents demo; a provider run must pass ENG-004's evaluator first.
3. Start ENG-003 with only storefront maker and preview; customer submission and Shop handoff are later slices.
4. Run PILOT-001 only after the corrected Shop route and language pass.
5. Keep OPS-001 and all production release activity owner-gated.
