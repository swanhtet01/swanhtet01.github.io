# Self-Hosted Company Loop

This file answers one question:

How does SuperMega keep running when Codex is closed?

## Where the founder operates now

The founder should operate from four places only:

### 1. Public company site
- `https://supermega.dev`
- purpose: what prospects see

### 2. Shared app
- `https://app.supermega.dev/app/director`
- `https://app.supermega.dev/app/teams`
- `https://app.supermega.dev/app/sales`
- purpose: live company state, queues, loop health, revenue state

### 3. Local BDA HQ
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`
- purpose: durable local mirror of reports, ops docs, and founder-readable status

### 4. Repo ops folder
- `Super Mega Inc/ops`
- purpose: editable operating docs in the active worktree

If the founder needs chat to understand the current company state, the loop is still incomplete.

## What works without Codex right now

Running already:
- Cloud Run web app
- Cloud Run worker execution
- Cloud Tasks queues
- Cloud Scheduler triggers
- Cloud SQL state
- app surfaces on `app.supermega.dev`
- local workstation cycle
- local founder/operator/agent report refresh
- local BDA HQ sync

That means SuperMega already has a working runtime outside this chat.

## What still requires Codex

Codex is still needed for:
- code changes
- UI changes
- product restructuring
- infra changes
- schema changes
- release hardening
- deep incident debugging

Codex should not be needed for:
- checking loop health
- seeing priorities
- reading founder/operator reports
- checking queues
- syncing local HQ

## Desktop operating path

Use desktop for:
- release decisions
- product decisions
- delivery review
- revenue review
- ops file review

Default desktop path:
1. open local BDA HQ
2. open `app.supermega.dev/app/director`
3. open `app.supermega.dev/app/teams`
4. open `app.supermega.dev/app/sales` if revenue needs action

## Phone or anywhere access

Phone access is for monitoring and approvals, not full operating changes.

Bookmark:
- `https://app.supermega.dev/app/director`
- `https://app.supermega.dev/app/teams`
- `https://supermega.dev`

Use phone for:
- quick health check
- queue check
- approval check
- founder brief check

Use desktop for:
- release work
- report review
- delivery changes
- content or product decisions

## What the self-hosted loop must provide

The founder should be able to answer these questions in under five minutes:
- is the runtime healthy
- what did the agents do
- what is blocked
- what needs approval
- what changed on the public side

If the current app or BDA HQ cannot answer those, the loop still depends too much on Codex.

## Current gap list

Still incomplete:
- richer founder dashboard inside the app
- better revenue/deals visibility
- email delivery and alerting fully working
- cleaner team invite and role views
- self-hosted preview/release runner
- browser-worker sidecar for browser-only automations

## Next step to reduce Codex dependence

Priority order:
1. make the app the default founder control plane
2. make BDA HQ the default local mirror
3. move release checks into a self-hosted runner
4. move browser-only tasks into a browser worker
5. leave Codex for engineering and exceptional investigation only
