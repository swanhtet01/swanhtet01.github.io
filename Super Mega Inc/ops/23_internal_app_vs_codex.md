# Internal App vs Codex

This file answers the practical question:

What should happen in `app.supermega.dev`, and what still belongs in Codex?

## Use the app for these things now

Use `app.supermega.dev` for:
- founder status review
- agent and loop health
- queue review
- approval review
- sales and revenue-state review
- operational monitoring

This is the daily operating surface.

## Use local BDA HQ for these things

Use `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq` for:
- daily local review
- reading synced reports
- checking the durable local mirror
- opening human-facing ops docs outside the temp worktree

This is the durable local mirror.

## Use Codex for these things

Use Codex for:
- code changes
- UI changes
- infrastructure changes
- release hardening
- debugging deeper failures
- product restructuring
- schema changes

Codex is still the engineering plane.

## Do not use Codex for these things

Do not rely on Codex for:
- checking if the company is healthy
- reading founder brief
- checking agent loops
- checking queue state
- checking whether the app is up

If Codex is needed for those, the control plane is too weak.

## Phone access

From phone, use:
- `app.supermega.dev/app/director`
- `app.supermega.dev/app/teams`

Phone use is for:
- monitoring
- approvals
- escalation review

Phone is not the right place for:
- major release decisions
- editing operating docs
- engineering decisions

## Desktop access

From desktop, use:
- `app.supermega.dev`
- local `codex_hq`
- repo ops docs when editing is needed

Desktop is the right place for:
- daily founder review
- release review
- delivery and revenue review
- operating changes

## What still needs to be built to reduce Codex dependence

Highest priority:
1. stronger founder dashboard in the app
2. stronger revenue/deals view in the app
3. self-hosted preview and release runner
4. browser-worker sidecar for browser-only tasks
5. full alerting and mail delivery

## Blunt summary

Right now:
- app = live control plane
- BDA HQ = durable local mirror
- Codex = engineering and exceptional investigation

That is the right direction.

The remaining job is to keep shrinking the set of things that still require Codex.
