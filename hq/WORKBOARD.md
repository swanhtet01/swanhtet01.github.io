# SuperMega work board

Updated: 2026-07-24
Authority: founder / CEO
Canonical repository: `C:\Users\thesw\Projects\supermega-platform`
Integration branch: `agent/supermega-release-candidate`
Previous local checkpoint: `49bd36e91fe3590262160fb12061767798c2246c`

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
| UX-003 | Product UX Codex | done-local | Make Home operationally useful before exposing internal company machinery. | Shared shell, app metadata, focused verifier, and authority only | Shop stock, Plant problems, and Shop orders outrank HQ work; internal work is labelled HQ and collapsed; installed/link metadata uses current Shop, Plant, Website, and Ecommerce language; 375 px browser review passes. |
| RND-001 | Product R&D Codex | done-local | Define Ecommerce as a customer storefront and order-intent product distinct from Shop. | Read-only Git history audit | Keep the five deleted back-office files deleted; reuse only fingerprint, idempotency, publish, and intake-boundary patterns. |
| RND-002 | AI Product R&D Codex | done-local | Select the first real AI Agent Solution. | Read-only current-code audit | Order Intake is first: approved input to structured source-backed draft, human accept/discard, zero side effects, and a golden-set gate. |
| ENG-003 | Ecommerce Codex | done-local | Build Ecommerce slice 1: deterministic storefront configuration and responsive preview from a read-only Shop catalogue snapshot. | Focused Ecommerce maker, route, catalogue, styles, and verifier only; no Shop mutation | Lint, build, 11 runtime checks, full local release gates, and 1280/375 px browser review pass; no push or deploy. |
| ENG-006 | Ecommerce Codex | done-local | Build Ecommerce slice 2: a bounded customer order request that stops before Shop consequences. | Storefront request contract and local preview UI only | Immutable storefront digest and item/price snapshot; idempotent in-memory request receipt; 13 request-contract checks and 1280/375 px browser review pass; no stock, Shop order, payment, send, fulfilment, persistence, or external write. |
| ENG-007 | Shop + Ecommerce Codex | done-local | Add the human-confirmed Ecommerce-to-Shop draft handoff. | Local adapter, confirmation UI, idempotency record, and focused tests only | Exact retained receipt, full digest, SKU, name, variant, price, quantity, and availability are revalidated; 16 handoff checks and 1280/375 px journeys pass; the Shop draft remains behind payment choice and the existing accountable action gate; no order, stock, payment, send, persistence, or external write occurs during handoff. |
| ENG-008 | Platform + Ecommerce Codex | done-local | Add an authenticated Ecommerce request inbox without creating a second back office or bypassing Shop authority. | Existing revisioned Shop workspace contract, tenant command, recovery, fake-client tests, and UI adapter; no hosted write | Exact replay, conflicting-retry, stale-revision, action-identity, cross-tenant, and oversized-inbox rejection pass with bootstrap recovery and unchanged Shop ledgers; no automatic conversion, stock reservation, fulfilment, payment, send, hosted write, or production activation. |
| ENG-009 | Shop Codex | done-local | Replace the fixed `+10` shortcut with exact-quantity stock receiving. | Existing Stock tab, receipt event, accountable-action gate, focused CSS and verifier only | A 375 px journey proves `34 → 41`, no pre-confirmation mutation, cancel with retained draft, one exact `+7` movement and matching evidence; blank, zero, negative, decimal, overflow, and stale-state paths fail closed. |
| ENG-010 | Plant Codex | done-local | Let operators record any truthful distinct equipment observation instead of a forced cycle. | Existing Problems tab, machine-state event, mirrored runtime, and focused tests only | All six valid transitions and 117 Python tests pass; same-state, stale, unknown, and conflicting transitions fail closed. A 375 px journey records `Running → Stopped` directly with one attributed event, no pre-confirmation mutation, 44 px controls, and no overflow or browser errors. |
| ENG-011 | Website Codex | done-local | Stage Website edits behind one Save or Discard boundary. | Existing Website editor, session recovery, focused styles and verifier only | Twenty staged edits leave authoritative revision `0`; one Save creates revision/content revision `1`; Discard preserves the exact saved record; reload resumes the draft; a newer saved version disables Save and cannot be overwritten. Full app gates, 74 Website runtime checks, 117 Python tests, and a 375 px browser journey pass with 44 px actions, no overflow, zero accessibility findings, and no browser errors. |
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
- Ecommerce reads a versioned Shop catalogue projection and stops at `pending_shop_review`.
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

1. Accept ENG-008 as a completed local contract; its next step is an owner-approved isolated hosted rehearsal, and Shop consequences remain behind the existing accountable action gate.
2. Start ENG-005 only after the owner chooses whether to reuse or securely create the OpenAI API key; a provider run must pass ENG-004's evaluator before any Agents demo.
3. Run PILOT-001 only after the corrected Shop route and language pass.
4. Keep OPS-001 and all production release activity owner-gated.
