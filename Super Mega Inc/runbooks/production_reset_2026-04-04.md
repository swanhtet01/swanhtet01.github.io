# SuperMega Production Reset

Date: 2026-04-04

## What To Sell

Sell one simple chain:

1. `Find Companies`
2. `Company List`
3. `Task List`

Everything else stays private until it is equally clear.

## What Each Product Does

### Find Companies

Use when a team needs new prospects or partner targets.

Input:
- place
- business type
- fit keywords

Output:
- shortlist
- first outreach
- first follow-up task

### Company List

Use when a team already has a messy list of leads or accounts.

Input:
- pasted company list
- notes
- stage

Output:
- one clean list
- next step per company
- follow-up tasks

### Task List

Use when a team has messy updates, blockers, or receiving issues.

Input:
- pasted updates
- blockers
- receiving notes

Output:
- short task list
- owner
- priority
- due window

## What To Hide

Do not use these as public front-door products yet:

- Action OS
- workspace
- platform
- ERP
- approvals
- exceptions
- director dashboards
- lab
- multi-agent system

Those are internal or managed delivery layers.

## Revenue Motion

### Wedge

`Find Companies`

Why it matters:
- it produces visible output fast
- it leads directly into a paid list or pilot
- it is easier to explain than a broad AI product

### First Upsell

`Company List`

This converts dead spreadsheets and chat lists into one working follow-up tool.

### Second Upsell

`Task List`

This converts messy daily work into owned tasks and visible progress.

## Packaging

### Self-Serve / Light Offer

- `Find Companies`
- price target: `$120` one-time sprint or tightly limited free mode

### Managed Pilot

- `Sales Setup`
- price target: `$750` pilot
- scope:
  - Find Companies
  - Company List
  - one weekly review

### Managed Pilot

- `Operations Setup`
- price target: `$600 setup + $250/month`
- scope:
  - Task List
  - one ops update flow
  - one weekly review

## Internal AI Agent Team

### Revenue Scout
- rerun saved searches
- score fit
- propose outreach
- create first tasks

### List Clerk
- import lists
- clean duplicates
- normalize records
- seed follow-up

### Task Triage
- convert pasted updates into tasks
- assign owner, priority, due

### Founder Brief
- summarize leads moved
- summarize overdue work
- summarize blocked items
- summarize money due

### Product Triage
- turn complaints into specific fixes
- track route, severity, friction

## Technical Reset

### Use Now

- Cloud Run
- Cloud SQL PostgreSQL
- Secret Manager
- Cloud Scheduler
- Cloud Tasks
- SQLModel
- Alembic
- PostHog
- Resend
- Stripe Billing
- OpenAI Responses API
- OpenAI Agents SDK
- LangGraph
- PydanticAI
- Playwright

### Stop Treating As Runtime

- GitHub Pages as the real app host
- browser-local fallback as the main persistence path
- public self-signup with demo-grade credentials

## Next Implementation Order

1. Make `company + work email` mandatory on first shared save.
2. Make shared backend persistence the default path for Company List and Task List.
3. Deploy the real app/API host on Cloud Run.
4. Move shared persistence onto Cloud SQL PostgreSQL.
5. Add PostHog events:
   - search run
   - company kept
   - list created
   - task created
   - booking click
6. Add Resend for onboarding/recovery email.
7. Add Stripe billing for pilot conversion and monthly plans.

## CEO Rule

Do not add another product until:

- a new user can understand the first screen in under 10 seconds
- the product produces one useful row on the first session
- the product can be sold in one sentence
- the product can be supported without manual explanation every time
