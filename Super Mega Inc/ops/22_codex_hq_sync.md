# Codex HQ Sync

This file explains the local founder mirror.

## What it is

Codex HQ is the durable local folder at:
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`

It exists so the founder has a stable place to inspect the company outside the temp worktree and outside Codex.

## What it should contain

### `ops`
- founder-readable docs
- scoreboards
- briefs
- release and incident logs

### `reports`
- latest machine-readable cycle outputs
- workstation
- founder
- operator
- agent

### `brand`
- business card assets
- QR assets
- founder-facing brand outputs

## What it is not

Codex HQ is not:
- the source of truth for code
- the source of truth for runtime state
- a replacement for the app

It is a durable founder mirror.

## What should use it

Use Codex HQ for:
- local founder review
- quick daily checks
- durable handoff outside the temp worktree
- archived human-facing outputs

Do not use Codex HQ for:
- making code changes
- editing production state
- deciding whether the runtime itself is healthy without checking the app

## Current role in the control plane

The current control plane split should be:
- public site: `supermega.dev`
- live operating app: `app.supermega.dev`
- local founder mirror: `codex_hq`
- engineering and deep changes: Codex + repo

## Next improvement

Codex HQ should keep getting better, but it should stay a mirror.

The app should become the main live control plane.
