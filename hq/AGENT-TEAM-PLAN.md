# SuperMega Agent Team Plan

Updated: 2026-08-11
Owner: founder / CEO
Operating model: bounded-demand-driven
Agent authority: read-only evidence + code-only local writes; no external sends without founder approval

---

## Operating constraints (non-negotiable)

These are hardcoded in `hq/portfolio.json` and must never be overridden:

- `maxAgentsPerCycle: 1` — one specialist per CEO cycle
- `activeAssignmentLimit: 1` — one active assignment across the whole company at a time
- `dynamicDelegation: false` — agents do not spawn sub-agents autonomously
- `recursiveDelegation: false` — no agent chains
- `consequentialAuthority: "founder"` — any external send, payment, publish, or write requires founder approval
- `scaleToZero: true` — unloaded roles consume no compute
- `companyAiBudgetDefaultUnits: 500,000` per UTC day (hard max 2,000,000)

These constraints exist because the system is in `isolated_demo` mode. They will relax incrementally as each managed-mode proof passes. Do not attempt to route around them.

---

## Team structure

Four teams. Twelve registered roles (one active at a time). Each team owns a delivery lane.

### Product team

Drives the four product lanes: Shop, Plant, Website, Ecommerce.

| Role | Function | Current status |
|------|----------|---------------|
| product-lead | Owns the product lifecycle; sets acceptance criteria; writes the work order | dormant |
| delivery-planner | Active specialist for the current cycle; selects the next slice within the active lane | **active** |
| ux-researcher | Researches user jobs; writes JTBD evidence; synthesises field observations | dormant |

**Delivery-planner** is the only currently loaded role. Its job is to select one outcome per CEO cycle that advances the highest-priority product lane, using only evidence already in the system (no external API calls, no new data collection).

### Engineering team

Builds, verifies, and maintains the codebase.

| Role | Function | Current status |
|------|----------|---------------|
| senior-engineer | Implements product slices; writes tests; maintains budget | dormant |
| security-reviewer | Reviews security surface; runs the 95-check security suite; audits new tenant boundaries | dormant |
| infra-engineer | Manages Supabase tenant, migrations, backup/restore, and Vercel deployment | dormant |

**senior-engineer** is the workhorse for implementation tasks. It operates at the level of a senior TypeScript/React/FastAPI engineer. It never merges, pushes, or deploys without a founder-approved gate.

### Growth team

Handles operator relationships, case studies, and eventual marketing.

| Role | Function | Current status |
|------|----------|---------------|
| growth-lead | Manages pilot operator relationships; tracks correction-effort evidence; prepares case studies | dormant |
| content-writer | Writes operator-facing documentation, onboarding guides, and help copy | dormant |
| brand-designer | Maintains visual identity; reviews public-facing artifacts | dormant |

All growth-team roles are dormant until `shop-pilot-evidence` passes. No external sends are possible from these roles without founder approval.

### Finance-risk team

Handles accounting correctness, compliance posture, and risk assessment.

| Role | Function | Current status |
|------|----------|---------------|
| finance-lead | Reviews accounting handoff artifacts (daily close, payables, receivables); maintains tax code | dormant |
| risk-reviewer | Reviews security advisor notices; maintains the six-request storage verifier; assesses new capability gates | dormant |
| compliance-analyst | Tracks CAPA effectiveness; reviews plant quality evidence; maintains audit trail | dormant |

---

## Assignment protocol

One assignment is active at a time. The CEO cycle follows this sequence:

```
1. CEO reads the current HQ evidence (13 files, ~251 KB) — zero model calls if unchanged
2. CEO selects one outcome from the highest-priority available lane
3. CEO assigns to one specialist
4. Specialist executes the work order (code, research, or documentation)
5. Specialist delivers evidence
6. CEO evaluates delivery against acceptance dimensions:
   user_job | state_transition | data_contract | failure_recovery |
   mobile_acceptance | import_reconciliation | security_boundary | automated_test
7. If all eight pass → outcome is complete; workboard updated
8. If any fail → outcome stays in-progress; specialist corrects
9. Outcome is quarantined (not auto-retried) if delivery transport is uncertain
```

The cycle repeats. Each cycle selects the single highest-value next outcome.

---

## Lane priorities (current)

| Priority | Lane | Status | Blocking gate |
|----------|------|--------|--------------|
| 80 | Shop — managed order-close pilot | owner-gated | founder decision: name_shop_pilot_operator |
| 70 | Plant — managed OEE pilot | owner-gated | follows Shop pilot |
| 60 | Website — managed brief acceptance | owner-gated | follows Storage proof |
| 50 | Ecommerce — managed hosted activation | owner-gated | follows Shop + Website |

All four lanes are blocked on the same two founder decisions. Until those decisions land, the agent cycle works within the local-only lanes:

| Priority | Lane | Status | Notes |
|----------|------|--------|-------|
| 40 | Test coverage | open | Raise Shop next-action, backup, CAPA effectiveness checks |
| 35 | R&D documentation | open | OpenTelemetry, order-intake-agent, durable-workflows |
| 30 | Budget trimming | open | Free bytes before next product slice |
| 25 | Planning artifacts | open | Timeline, agent team plan, enterprise design |

---

## What each agent can do autonomously

### Allowed without any approval

- Read any file in the repo
- Write TypeScript, tests, or documentation to the local branch
- Run `npm run app:build`, `npm run app:verify`, `npm run app:lint`, and test files
- Write R&D research documents
- Update HQ planning documents (WORKBOARD, NOW, TIMELINE, this file)
- Update portfolio.json research gate statuses

### Requires founder review before merge

- Any code change to `showroom/src/core/`
- Any migration change to `supabase/migrations/`
- Any security surface change (capability tiers, RLS policies, auth flows)
- Any change to the live branch target

### Requires explicit founder approval (never autonomous)

- Pushing to origin or merging a pull request
- Applying any migration to the live Supabase project
- Any external send (email, webhook, Slack, GitHub issue)
- Any payment, purchase, or subscription change
- Any change to production infrastructure (Vercel project settings, Supabase policies)
- Activating managed persistence, hosted scheduling, or hosted AI
- Naming or onboarding a new pilot operator

---

## Agent delegation format

When the CEO selects an outcome and assigns it to a specialist, the work order follows this format:

```json
{
  "schema": "supermega.ceo-outcome-operation.v2",
  "cycle": "<date>",
  "outcome": "<outcome title>",
  "specialist": "<role-id>",
  "lane": "<product-id or planning>",
  "priority": <number>,
  "workOrder": "<one sentence describing what the specialist must deliver>",
  "acceptanceDimensions": ["<which of the 8 dimensions apply>"],
  "evidenceExpected": "<what file or test output constitutes delivery>",
  "blockedBy": "<gate name or null>"
}
```

The specialist must deliver against all listed acceptance dimensions. If a dimension cannot be satisfied (e.g., `mobile_acceptance` is not applicable for a pure test file), the specialist records `not_applicable` with a one-line reason.

---

## Batch mode (current session)

The current autonomous session operates in `/batch` mode: multiple outcomes per session, no pause between assignments, specialists run in parallel where the work order permits.

Parallel execution rules:
- Research documents for different R&D tracks may run in parallel (no shared file)
- Test files for different modules may run in parallel (no shared file)
- Code changes to `showroom/src/core/` and HQ documents may NOT run in parallel (risk of merge conflict)
- Build verification must be sequential (only one build at a time)

---

## R&D agent protocol

R&D tasks follow the portfolio research gate format. Each evaluation must produce:

1. A concrete research document in `hq/research/`
2. A portfolio gate status update (evaluate → decided)
3. A specific adoption condition list (what must be true before activating)
4. A go/no-go recommendation with one-line rationale

R&D agents do not implement — they research, compare, and decide. Implementation follows in a separate product-lane work order after the gate closes.

---

## Company week structure

The CEO weekly cycle produces exactly five read-only outcomes from the company operations view:
1. Product: highest-priority lane status
2. Engineering: build health, test count, budget
3. Growth: pipeline status (currently: no named operators)
4. Finance-risk: accounting handoff artifact status
5. Summary: blockers, next founder decision required

The weekly brief is not sent externally. It is written to the console (Owner Console) and retained in HQ evidence. External delivery resumes only after managed persistence is proven.

---

## Escalation matrix

| Condition | Action | Who |
|-----------|--------|-----|
| Outcome is blocked by a founder decision | Quarantine; do not retry; surface in weekly brief | CEO → founder |
| Delivery transport uncertain (e.g. push fails) | Hold; do not auto-retry; flag explicitly | CEO → founder |
| Artifact budget below 2,000 bytes headroom | Halt product slices; initiate budget trimming | senior-engineer |
| Test suite regression (any check fails) | Block the outcome; fix before committing | senior-engineer |
| Security surface change detected | Route to security-reviewer before merge | security-reviewer → founder |
| Live site drift from local commit | Surface in weekly brief; do not auto-correct | CEO → founder |
| New capability gate proposed | Run through finance-risk + security review before portfolio update | risk-reviewer |

---

## Agent company as AI-native operating model

SuperMega itself is an AI agent company — meaning the agent operating model is the product proof-of-concept. The way the CEO cycle selects outcomes, the specialist executes them, and the founder approves the consequential steps is a working demonstration of how any small business could operate with AI agents handling the back-office record while humans handle the exception.

The four products (Shop, Plant, Website, Ecommerce) are the commercial surface. The agent team (CEO + twelve roles) is the operating model that maintains the record. The thesis is: when both work together, one operator can do the work of five.

Every improvement to the agent team plan is also a product improvement — we eat our own cooking.
