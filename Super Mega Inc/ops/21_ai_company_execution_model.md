# AI Company Execution Model

This file defines how SuperMega executes work as an AI-native software company outside Codex.

## Core principle

SuperMega does not run on one giant agent.

It runs on:
- a small number of named teams
- a queue-backed runtime
- one shared app
- one local founder mirror
- one release flow

## Teams and responsibilities

### Founder Desk

Mission:
- decide priorities
- approve releases
- review revenue and delivery
- keep the company focused

Primary inputs:
- founder brief
- scoreboard
- release status
- delivery blockers

Primary outputs:
- top priorities
- approvals
- direction changes

### Revenue Pod

Mission:
- create and clean pipeline
- convert inbound interest into tracked work
- keep next follow-up visible

Primary inputs:
- contact submissions
- market search
- imported lists
- existing pipeline

Primary outputs:
- leads
- deals
- follow-up tasks

### Delivery Pod

Mission:
- provision starter packs
- keep rollout state current
- prevent work from stalling after sale

Primary inputs:
- sold pack
- client setup data
- implementation tasks
- approvals and exceptions

Primary outputs:
- active delivery queue
- rollout status
- blocked-item escalation

### Agent Ops

Mission:
- keep the runtime alive
- keep queues draining
- keep releases safe

Primary inputs:
- task queues
- scheduler runs
- smoke results
- incidents

Primary outputs:
- worker status
- incident records
- release go/no-go

## Execution surfaces

### Public site
- `supermega.dev`
- company story
- examples
- contact

### Shared app
- `app.supermega.dev`
- sales
- actions
- approvals
- exceptions
- agent ops
- director

### Local ops folder
- `Super Mega Inc/ops`
- founder-readable operating state

### Local report mirror
- `pilot-data/ops`
- machine-readable report outputs

## Run loop

### Continuous
- Cloud Scheduler triggers work
- Cloud Tasks queues jobs
- Cloud Run workers execute jobs
- app state updates
- local workstation mirror refreshes on cadence

### Daily
- founder brief refresh
- delivery and operator state refresh
- release and incident review

### Per release
- preview
- smoke
- review
- release
- log update

## Automatic file updates

These should update without chat:

### Local machine-readable files
- `pilot-data/ops/workstation-latest.json`
- `pilot-data/ops/operator-cycle-latest.json`
- `pilot-data/ops/founder-cycle-latest.json`
- `pilot-data/ops/agent-cycle-latest.json`

### Local operating docs
- `Super Mega Inc/ops/00_company_scoreboard.md`
- `Super Mega Inc/ops/01_daily_founder_brief.md`
- `Super Mega Inc/ops/02_operator_report.md`
- `Super Mega Inc/ops/06_release_log.csv`
- `Super Mega Inc/ops/05_incident_log.csv`

## What must stay manual

These are founder or operator decisions:
- final product direction
- pricing
- release approval
- scope changes
- customer promises
- ambiguous incident judgment

## What should move out of Codex first

Priority order:
1. release checks
2. founder brief delivery
3. deal creation from inbound contact
4. delivery watch
5. incident escalation

## What scaling looks like

Do not scale by adding random agent roles.

Scale by:
- separating web and worker services
- adding queues, not more chat loops
- making outputs structured
- making review and release gates explicit
- keeping one clean control plane

## Definition of operational

SuperMega is operational when:
- cloud workers run without this session
- the founder can inspect the company locally
- the app reflects live state
- releases are gated
- incidents are visible
- contact can become deal, task, and rollout without manual copy/paste

If one of those is missing, the company is still partly manual.
