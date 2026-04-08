# Meta-Tools And Company Stack

This is the management stack for running SuperMega as a small AI-native software company.

The rule is simple:
- one company control plane
- one founder inbox
- one shared intelligence layer
- queue-backed agents
- local mirror outside Codex

## 1. Founder inbox

The founder inbox is not email.

It is the short operating view across:
- priorities
- revenue
- delivery
- incidents
- release state

Primary surfaces:
- `https://app.supermega.dev/app/director`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\reports`

Daily founder rule:
- phone = check status, approvals, escalation
- desktop = make decisions, review releases, change direction

What must be visible in the founder inbox:
- top 3 priorities
- queue health
- overdue approvals
- blocked delivery items
- new contact / deal movement
- release go/no-go

## 2. Company control plane

The company control plane is:
- `https://app.supermega.dev`

It should hold:
- sales state
- action and approval queues
- agent status
- delivery state
- founder brief
- incident and release state

Rule:
- if a workflow matters, it must land in the control plane
- if a workflow only exists in chat or ad hoc notes, it is not operational

## 3. Agent comms and memory

Agent communication should not depend on chat threads.

Use these layers:

### Durable memory
- Cloud SQL Postgres for live state
- `pilot-data/ops/*-latest.json` for local machine-readable mirror
- `Super Mega Inc/ops/*.md` for founder-readable operating state

### Shared context
- one queue per business function
- one owner per item
- one explicit next action
- one status model per workflow

### Agent-to-agent handoff
Agents should hand off through:
- task rows
- incident rows
- approval rows
- brief records
- delivery records

Not through free-form prose alone.

## 4. Release and preview workflow

Use one release path:

1. work on `codex/<task>`
2. build and lint locally
3. capture proof
4. preview or direct verify
5. release hardening
6. merge to `main`
7. refresh BDA HQ

Minimum preview proof:
- build passes
- lint passes
- smoke passes
- screenshots for changed public surfaces
- runtime check for changed app flows

Release control should live in:
- `Super Mega Inc/ops/06_release_log.csv`
- `Super Mega Inc/ops/05_incident_log.csv`
- BDA HQ mirror after sync

## 5. Browser sidecars

Browser automation is sidecar-only.

Use it for:
- screenshot capture
- preview verification
- browser-only internal workflows
- regression checks where there is no API
- later customer-portal smoke or commerce admin checks

Do not use it as:
- the system of record
- the main agent runtime
- the only place work exists

Recommended sidecar model:
- primary: local Edge / Chrome on the founder workstation
- later: dedicated browser-worker VM if browser jobs become regular

## 6. Research stack

Research should feed product and sales, not become a dead note pile.

Use:
- public web research
- account and prospect research
- deployment and runtime documentation
- product and competitor notes

Research outputs should become:
- a prospect row
- a backlog item
- a template change
- a case-study note
- a founder brief input

Keep research in:
- the shared app when it becomes work
- `Super Mega Inc/ops/07_product_roadmap.md` when it changes direction
- BDA HQ only as a mirror, not the source of truth

## 7. Customer support stack

Use one small support model:

### Intake
- contact form
- shared support email
- later client portal requests

### Triage
- convert inbound request into:
  - task
  - incident
  - approval
  - rollout item

### Visibility
- founder sees escalations
- delivery pod sees active client blockers
- agent ops sees repeated runtime failures

Recommended stack:
- contact flow on `supermega.dev`
- `Resend` for delivery
- app queue for support/implementation follow-up
- incident log for anything affecting runtime or delivery

## 8. Shared intelligence layer

There must be one shared intelligence layer across:
- phone
- desktop
- app
- Codex

That layer is not a separate app.
It is the combination of:
- Cloud SQL live state
- app control plane
- local BDA HQ mirror
- structured report outputs

### Phone
Use:
- Director
- Agent Ops
- approvals

### Desktop
Use:
- full app surfaces
- BDA HQ
- preview and release checks

### Codex
Use only for:
- engineering work
- restructuring
- releases
- one-off investigations

Codex should consume the same state, not create a parallel truth layer.

## 9. Recommended management stack

### Runtime
- Cloud Run web
- Cloud Run worker
- Cloud Tasks
- Cloud Scheduler
- Cloud SQL
- Secret Manager

### Visibility
- Sentry
- Cloud Logging
- Cloud Monitoring
- local ops mirror

### Customer delivery
- contact intake
- support email via Resend
- shared app queues

### Local HQ
- `codex_hq\ops`
- `codex_hq\reports`
- `codex_hq\site`
- `codex_hq\brand`

## 10. Operating standard

SuperMega is running efficiently when:
- the founder can inspect the company in under 5 minutes
- agents keep moving work without Codex
- releases have proof and gates
- support becomes tracked work, not chat fragments
- one shared intelligence layer exists across phone, desktop, app, and local HQ

If one of those is missing, the stack is still incomplete.
