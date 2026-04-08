# Self-Hosted Company Loop

This is the operating path when Codex is closed.

## Founder control points

The founder should only need four surfaces:

### 1. Public company site
- `https://supermega.dev`
- what prospects and clients see

### 2. Shared control plane
- `https://app.supermega.dev/app/director`
- `https://app.supermega.dev/app/teams`
- `https://app.supermega.dev/app/sales`
- live queues, agent status, approvals, revenue state

### 3. Local BDA HQ
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`
- durable local mirror of ops docs, reports, and site evidence

### 4. Repo ops folder
- `Super Mega Inc/ops`
- editable operating docs inside the active worktree

If something is only visible in chat, it is not part of the company loop yet.

## What runs without Codex

Cloud runtime:
- Cloud Run web service
- Cloud Run worker execution
- Cloud Tasks queues
- Cloud Scheduler triggers
- Cloud SQL state
- `app.supermega.dev`

Founder workstation runtime:
- `run_supermega_workstation_cycle.ps1`
- `run_supermega_founder_cycle.ps1`
- `run_supermega_operator_cycle.ps1`
- `sync_supermega_codex_hq.ps1`

These are the real runtime layers.

## What still depends on Codex

Codex is still used for:
- product and infra changes
- release hardening
- schema and workflow changes
- UI rewrites
- one-off incident investigation when the current loops are not enough

Codex is not required for:
- scheduled agent runs
- queue draining
- founder brief refresh
- local BDA HQ sync
- opening the founder control surfaces

## Daily operating path

### Desktop
1. Run `open_supermega_founder_workspace.ps1`
2. Review local BDA HQ
3. Review Director
4. Review Agent Ops
5. Review Sales only if revenue needs direct attention

### Phone
Bookmark:
- `https://app.supermega.dev/app/director`
- `https://app.supermega.dev/app/teams`

Phone is for monitoring, approvals, and escalation review.
Desktop is for release decisions and operating changes.

## Local BDA HQ

The BDA HQ mirror should answer:
- is the runtime healthy
- what changed today
- what is blocked
- what the agents just did
- what the public site currently looks like

Expected subfolders:
- `ops`
- `reports`
- `site`

If BDA HQ cannot answer those questions, the sync path is incomplete.

## Release path

1. build on `codex/<task>`
2. verify locally
3. publish proof
4. merge toward release
5. release to `main`
6. refresh BDA HQ

`main` is production only.

## Rule

The founder should be able to close Codex and still:
- inspect the company
- see agent progress
- review runtime health
- decide what gets approved next

That is the standard for a self-hosted company loop.
