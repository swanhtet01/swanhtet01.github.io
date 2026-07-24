# SuperMega work board

Updated: 2026-07-24
Authority: founder / CEO
Canonical repository: `C:\Users\thesw\Projects\supermega-platform`
Integration branch: `agent/supermega-release-candidate`
Product implementation head before this coordination update: `f2aaa82`
Coordination setup commit: `7fb4daf`

## One operating model

SuperMega uses one accountable work system. Agents are workers inside it, not separate companies or competing authorities.

1. The founder sets consequential authority and approves external actions.
2. The CEO / integrator task selects one outcome, protects the canonical branch, and accepts or rejects handoffs.
3. Product and QA workers inspect workflows, evidence, and customer usefulness.
4. Engineering workers implement one bounded assignment in an isolated branch or worktree.
5. Growth and Operations work from verified product and pilot evidence; they do not invent traction, customers, or revenue.

Add another worker only when its assignment has a measurable outcome, a non-overlapping write set, an acceptance check, and a named integrator.

## Active board

| ID | Team / worker | Status | Outcome | Write authority | Acceptance |
| --- | --- | --- | --- | --- | --- |
| CEO-004 | CEO / Codex integrator | done-local | Make Commerce daily close attributable, non-duplicating, stale-safe, and Myanmar-date aware. | Canonical branch, five scoped files | Commit `f2aaa82`; 110 Python tests, lint, build, and `app:verify` pass. |
| CEO-005 | CEO / Codex integrator | done-local | Establish the multi-agent operating board and safe handoffs. | `hq/`, root `CLAUDE.md` | Commit `7fb4daf`; HQ contract and diff check pass; no push or deploy. |
| QA-001 | Product / QA Codex worker | done-local | Select Commerce order-to-close as the first pilot workflow. | Read-only; no repository writes | Same-day attributable close rate; target at least 90% across five pilot days; review 2026-07-31. |
| ENG-001 | Claude Code engineering | blocked-auth | Prove a two-item Website-to-Commerce journey from isolated worktree `supermega-claude-website-commerce-journey`. | One new test file in an isolated worktree | Focused test and full Python suite pass; no product, HQ, hosted, push, or deploy changes. |
| ENG-002 | Engineering | queued | Record an externally completed refund as human-attributable and settled. | Commerce workspace, UI, and focused tests only | Idempotent due-to-settled transition with actor, time, reason, and external reference; no payment integration. |
| OPS-001 | Platform / owner | blocked-owner | Repeat the private trial on an isolated hosted Supabase target. | Hosted write only after explicit approval | Five migrations, runtime role, isolation, revocation, recovery, Security Advisor, and pooler evidence. |
| PILOT-001 | Product / founder | ready | Name one Commerce shift supervisor and one safe pilot tenant. | Founder decision | Baseline, authority boundary, five-day evidence plan, and 2026-07-31 review are recorded. |
| GROWTH-001 | Growth | gated | Prepare onboarding and outreach for the selected pilot only. | Draft-only until founder approves sends | One audience, one offer, one onboarding path, and claims backed by pilot evidence. |

Statuses: `ready`, `active`, `blocked-auth`, `blocked-owner`, `queued`, `review`, `done-local`, `released`.

## Lane boundaries

### CEO / integrator task

- Owns `hq/NOW.md`, this board, integration decisions, and go/no-go evidence.
- May inspect all work but does not duplicate a worker's active assignment.
- Is the only task allowed to port or commit a worker handoff to the canonical branch.
- Does not push, merge, deploy, enable writes, send messages, or spend money without the relevant owner gate.

### Product / QA Codex task

- Uses [`CODEX-PRODUCT-QA-BRIEF.md`](CODEX-PRODUCT-QA-BRIEF.md).
- Remains read-only and returns a decision packet to the CEO / integrator task.
- Does not redesign every product, create another backlog, or edit HQ authority files.

### Claude Code engineering

- Uses [`../CLAUDE.md`](../CLAUDE.md).
- Works from the exact assigned base in an isolated worktree and writes only the declared file.
- Stops on a product-code requirement and returns the smallest blocker instead of expanding scope.
- May make one local commit in its own branch; it may not push, merge, deploy, or use hosted credentials.

## Handoff contract

Every worker handoff must contain:

1. Work item ID and observable outcome.
2. Base SHA, final SHA, branch, and worktree path.
3. Changed paths and confirmation that no other paths changed.
4. Commands run and exact pass/fail results.
5. Remaining risks, assumptions, and anything not tested.
6. One recommended next action for the CEO / integrator.

The integrator independently reviews the diff and reruns proportionate checks before accepting it.

## Daily company cadence

- **Start:** select at most one active outcome per worker and record its acceptance check.
- **During work:** update only when state changes: ready, active, blocked, review, done-local, released.
- **Handoff:** attach evidence, not activity narration.
- **Review:** founder or responsible owner accepts consequential decisions.
- **End:** update `hq/NOW.md` only with verified facts and the next evidence gate.

Google Workspace may mirror this board for human visibility later, but this repository remains canonical until a separately approved sync is implemented.
