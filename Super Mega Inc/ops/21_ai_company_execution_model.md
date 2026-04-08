# AI Company Execution Model

This is the practical execution model for SuperMega.

## The model

SuperMega is not a chat-first company.

It should run on:
- one public site
- one internal app
- one worker runtime
- one local founder mirror
- one release workflow

## Where work happens

### Public site
- `supermega.dev`
- shows the company
- collects contact
- proves product shape

### Internal app
- `app.supermega.dev`
- this should become the main control plane
- holds live operating state

### Worker runtime
- Cloud Scheduler
- Cloud Tasks
- Cloud Run workers
- this keeps loops running 24/7

### Local founder mirror
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`
- this keeps a durable local copy of the human-facing outputs

## What the app can do now

The app can already do:
- show director/founder state
- show agent/loop state
- show sales state
- hold queue-backed operational state
- reflect live worker activity

That makes it the right place for daily operating visibility.

## What the app still does not replace

The app does not yet fully replace:
- engineering work
- release hardening
- deep incident debugging
- large product changes
- schema or infrastructure changes

That is still Codex plus the repo workflow.

## Team model

### Founder Desk
- priorities
- approvals
- final judgment

### Revenue Pod
- contact
- pipeline
- follow-up

### Delivery Pod
- rollout
- implementation
- blockers

### Agent Ops
- worker health
- scheduler health
- queue health
- release safety

## Agent rule

Agents should create durable state:
- leads
- deals
- tasks
- approvals
- incidents
- briefs

Agents should not create the company as loose chat output.

## Human rule

Humans still own:
- product direction
- pricing
- customer promises
- release approval
- ambiguous business decisions

## Anywhere access

### Phone
Use for:
- quick status
- approvals
- queue check
- founder brief

### Desktop
Use for:
- full operating review
- BDA HQ review
- release review
- product and delivery decisions

## Replacement path

To replace Codex as the control plane:
1. keep founder visibility in the app
2. keep local visibility in BDA HQ
3. move preview/release checks to a self-hosted runner
4. move browser-only tasks to a browser worker
5. leave Codex only for engineering and exceptional investigation

## Blunt rule

If the founder needs chat to know whether the company is healthy, the execution model is not finished yet.
