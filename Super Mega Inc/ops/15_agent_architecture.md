# SuperMega Agent Architecture

This is the live AI company architecture.

Codex is engineering support. It is not the runtime.

## Runtime layers

### 1. Public layer

Purpose:
- explain what SuperMega does
- collect inbound requests
- show proof

Surface:
- `supermega.dev`

### 2. Control layer

Purpose:
- hold live company state
- give the founder and operators one control plane

Surface:
- `app.supermega.dev`

Core modules:
- `Dev Desk`
- `HQ`
- `Deals`
- `Workflows`
- `Agents`
- `Company`

### 3. Worker layer

Purpose:
- run durable loops
- process queue-backed jobs
- retry safely

Runtime:
- Cloud Run
- Cloud Scheduler
- queue processor now, Cloud Tasks next
- Cloud SQL

### 4. Local mirror

Purpose:
- keep founder-readable and machine-readable outputs outside the app
- preserve visibility when the browser is closed

Artifacts:
- `pilot-data/ops/*.json`
- `Super Mega Inc/ops/*.md`

## Functional pods and loops

### Founder Control

Loops:
- `Founder Brief`
- founder decision review
- strategic priority setting

Writes:
- brief rows
- decisions
- release approval state

### Revenue Pod

Loops:
- `Revenue Scout`
- `List Clerk`
- outreach and deal movement

Writes:
- prospects
- deals
- follow-up tasks

### Delivery Pod

Loops:
- `Template Clerk`
- `Task Triage`
- rollout follow-up

Writes:
- implementation tasks
- approvals
- exceptions

### Runtime Pod

Loops:
- `Ops Watch`
- queue processing
- release and health checks

Writes:
- incidents
- loop status
- runtime alerts

### Knowledge Pod

Loops:
- document and update ingestion
- template improvement inputs
- KPI and brief inputs

Writes:
- structured records
- reusable template changes
- founder brief inputs

## Equipped resources

Every pod should have:
- one app surface
- one state model
- one queue
- one loop set
- one escalation path

### Founder Control resources
- Dev Desk
- HQ
- decision log
- release and tenant view

### Revenue Pod resources
- Deals
- contact intake
- search/list cleanup tools
- Gmail draft flow

### Delivery Pod resources
- workflow queue
- approvals
- exceptions
- template provisioning

### Runtime Pod resources
- Agents surface
- scheduler status
- queue processor
- health checks

### Knowledge Pod resources
- documents
- notes and updates
- brief inputs
- template library

## Output contract

Every loop must produce one or more of:
- deal
- task
- approval
- exception
- decision
- brief
- incident

Free-form text alone is not enough.

## Browser automation rule

Browser automation is sidecar-only.

Use it for:
- screenshots
- preview verification
- browser-only admin flows
- regression checks where there is no API

Do not use it as:
- the system of record
- the main company runtime
- the only path for critical work

## Operational standard

The architecture is healthy when:
- the founder can understand company state in under five minutes
- pods hand off through durable records
- loops continue without Codex
- runtime failures are visible
- tenant identity and auth mode are visible in-app
