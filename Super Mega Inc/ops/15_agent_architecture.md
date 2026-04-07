# SuperMega Agent Architecture

This is the operating architecture for SuperMega as an AI-native software company.

## Goal

Run a small company with:
- one public proof layer
- one shared operating app
- one durable worker layer
- one local workstation mirror

The target is not a chat demo. The target is a company that keeps moving when this Codex session is closed.

## Layers

### 1. Public Layer

Purpose:
- show products
- prove the system shape
- collect inbound contact

Surface:
- `supermega.dev`

Public story:
- three starter packs
- one short contact path
- proof tools are secondary

### 2. Control Layer

Purpose:
- give humans and agents one operating surface
- hold lists, queues, approvals, delivery state, and founder review

Surface:
- `app.supermega.dev`

Main working views:
- Sales
- Director
- Agent Ops
- Actions
- Approvals
- Exceptions

### 3. Worker Layer

Purpose:
- run durable jobs outside user requests
- retry safely
- keep loops moving on schedule

Infrastructure:
- Cloud Scheduler
- Cloud Tasks
- Cloud Run worker execution

Current loops:
- Revenue Scout
- List Clerk
- Template Clerk
- Task Triage
- Ops Watch
- Founder Brief

Next loops:
- Release Guard
- Deals Clerk
- Delivery Watch
- Browser Clerk

### 4. Local Workstation Mirror

Purpose:
- keep a human-readable mirror on the founder machine
- store latest reports locally
- allow future browser-heavy sidecar work without making browser automation the core runtime

Current behavior:
- scheduled workstation cycle
- founder report
- operator report
- agent run report
- ops sync into `Super Mega Inc\ops`
- local HTML ops hub

## Teams

### Founder Desk

Owns:
- company priorities
- product direction
- market focus
- founder brief

Human role:
- founder

Agent support:
- Founder Brief
- Ops Watch

### Revenue Pod

Owns:
- prospecting
- contact intake
- pipeline cleanliness
- next follow-up

Human role:
- founder or sales operator

Agent support:
- Revenue Scout
- List Clerk
- Deals Clerk

### Delivery Pod

Owns:
- starter pack rollout
- task ownership
- live client queue state
- issue and approval control

Human role:
- operator / manager

Agent support:
- Template Clerk
- Task Triage
- Delivery Watch

### Agent Ops

Owns:
- runtime health
- queue health
- failed jobs
- release safety

Human role:
- operator / founder

Agent support:
- Ops Watch
- Release Guard

## Rules

1. A new feature is not a product until it has:
- a named buyer
- a starter workflow
- a setup path
- a queue owner

2. Browser automation is sidecar-only.
- Use it when there is no API.
- Do not make it the system of record.

3. Public tools are proof, not the company.
- The company sells starter packs and working systems.

4. Every agent output must become one of:
- lead
- task
- approval
- exception
- founder brief

5. The company should be inspectable from one local folder.
- `Super Mega Inc\ops`

## What “Autonomous” Means Here

It does not mean one giant agent doing everything.

It means:
- schedules keep running
- queues keep draining
- summaries keep updating
- failures surface visibly
- humans intervene only on priority, approvals, and ambiguous delivery work

## Immediate Next Steps

1. Add a dedicated revenue view inside the app.
2. Route contact submissions directly into tracked deals.
3. Finish email delivery so briefs and alerts leave the system.
4. Add Release Guard and Deals Clerk.
5. Keep tightening the public site around products, not capability claims.
