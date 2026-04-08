# SuperMega Agent Architecture

This file defines the live agent system for SuperMega outside Codex.

## Purpose

SuperMega runs as:
- one public company site
- one shared operating app
- one queue-backed worker plane
- one founder workstation mirror

Codex is part of engineering. It is not the runtime.

## Runtime layers

### 1. Public layer

Purpose:
- explain what SuperMega builds
- collect inbound contact
- show examples and proof

Surface:
- `supermega.dev`

Owner:
- Revenue Pod

### 2. Control layer

Purpose:
- hold live company state
- give humans and agents one shared operating surface

Surface:
- `app.supermega.dev`

Primary surfaces:
- Sales
- Actions
- Approvals
- Exceptions
- Director
- Agent Ops

Owner:
- Founder Desk + Delivery Pod

### 3. Worker layer

Purpose:
- execute durable jobs
- drain queues
- retry safely
- keep loops moving 24/7

Runtime:
- Cloud Run
- Cloud Tasks
- Cloud Scheduler
- Cloud SQL

Owner:
- Agent Ops

### 4. Workstation mirror

Purpose:
- keep a local mirror of company state
- generate local reports
- support browser-heavy sidecar tasks
- let the founder inspect the company without opening Codex

Artifacts:
- `pilot-data/ops/*.json`
- `Super Mega Inc/ops/*.md`
- local ops hub

Owner:
- Founder Desk

## Agent teams

### Founder Desk

Owns:
- priorities
- roadmap direction
- release approval
- founder brief review

Core loops:
- Founder Brief
- Ops Watch

Human:
- founder

### Revenue Pod

Owns:
- inbound contact
- outbound pipeline
- list cleanup
- deal hygiene

Core loops:
- Revenue Scout
- List Clerk
- Deals Clerk

Human:
- founder or sales operator

### Delivery Pod

Owns:
- starter pack rollout
- implementation queue
- approvals and exceptions
- client delivery state

Core loops:
- Template Clerk
- Task Triage
- Delivery Watch

Human:
- operator or manager

### Agent Ops

Owns:
- queue health
- worker health
- release safety
- incident visibility

Core loops:
- Ops Watch
- Release Guard
- Browser Clerk

Human:
- founder or platform operator

## Live loops

Running now:
- Revenue Scout
- List Clerk
- Template Clerk
- Task Triage
- Ops Watch
- Founder Brief

Queued next:
- Deals Clerk
- Delivery Watch
- Release Guard
- Browser Clerk

## 24/7 rule

If a loop matters, it must run through:
- Cloud Scheduler trigger
- Cloud Tasks queue
- Cloud Run execution
- app-visible status
- local report output

If it only runs from a shell by hand, it is not yet operational.

## Output contract

Every agent loop must produce one or more of:
- lead
- deal
- task
- approval
- exception
- founder brief
- incident
- release check

Free-form text alone is not enough.

## Browser automation rule

Browser automation is sidecar-only.

Use it for:
- screenshots
- preview capture
- browser-only internal flows
- regression checks where no API exists

Do not use it as:
- the primary system of record
- the main worker runtime
- the only way to understand company state

## Manual vs automatic

Automatic now:
- scheduled worker runs
- queue draining
- local founder/operator/agent report generation
- public contact capture
- live app health and smoke checks

Still manual:
- product direction changes
- release approval
- client pricing and proposals
- final rollout signoff
- incident judgment when business context is unclear

## Architecture standard

The company is healthy when:
- public proof is clear
- app state is live
- worker loops are draining
- local ops files are current
- founder can see what matters in under five minutes

If one of those is missing, the architecture is incomplete.
