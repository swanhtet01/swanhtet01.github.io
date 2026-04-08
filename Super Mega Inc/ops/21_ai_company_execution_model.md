# AI Company Execution Model

This is the execution model for SuperMega as an AI-native company.

## Core model

Do not think in terms of one super-agent.

SuperMega runs on:
- one shared control plane
- one local founder mirror
- queue-backed worker loops
- a small number of named pods
- explicit human approvals

## Pods

### Founder Desk
Owns:
- priorities
- release approval
- scope approval
- escalation judgment

Main surfaces:
- `app.supermega.dev/app/director`
- local BDA HQ `ops`

### Revenue Pod
Owns:
- inbound contact handling
- prospecting and follow-up
- deal movement

Main surfaces:
- `app.supermega.dev/app/sales`
- `app.supermega.dev/app/teams`

### Delivery Pod
Owns:
- starter pack rollout
- implementation status
- blockers and handoffs

Main surfaces:
- shared app queues
- local reports

### Agent Ops
Owns:
- queue health
- scheduler health
- worker execution
- incident visibility

Main surfaces:
- `app.supermega.dev/app/teams`
- local BDA HQ `reports`

## Runtime layers

### Cloud
- Cloud Scheduler enqueues recurring work
- Cloud Tasks stores queued work
- Cloud Run workers drain queues
- Cloud Run web serves app and APIs
- Cloud SQL stores operating state

### Local founder layer
- BDA HQ mirror
- founder workspace launcher
- workstation cycle
- report refresh

## What agents do

Agents should create durable operating state:
- leads
- tasks
- incidents
- approvals
- briefs

Agents should not produce loose chat output as the main artifact.

## What remains human

Keep these manual:
- product direction
- customer promises
- pricing
- release approval
- ambiguous business judgment

## How the founder inspects the company

### On desktop
- open BDA HQ
- open Director
- open Agent Ops
- review Sales only when revenue needs action

### On phone
- use Director for a short status view
- use Agent Ops for queue and loop health

The phone path is for monitoring.
The desktop path is for operating decisions.

## What counts as autonomous

Autonomous means:
- queues continue without Codex
- reports refresh without Codex
- founder can inspect status locally
- incidents are visible
- the next action is visible

Autonomous does not mean:
- no human judgment
- no approvals
- no release gate

## Scaling rule

Scale by:
- separating web and worker execution
- increasing queue-backed work
- structuring outputs
- tightening operating surfaces

Do not scale by inventing more vague agent roles.
