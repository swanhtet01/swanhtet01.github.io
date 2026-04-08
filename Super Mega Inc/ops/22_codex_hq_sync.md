# Codex HQ Sync

This sync publishes the human-facing SuperMega outputs from the temp worktree into a durable BDA folder.

## Purpose

Keep the founder-readable operating layer in:
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`

That folder should remain usable even if the temp worktree changes or is removed.

## What gets synced

### Ops
- `Super Mega Inc/ops/*.md`
- `Super Mega Inc/ops/*.csv`
- `Super Mega Inc/ops/index.html`

### Reports
- `pilot-data/ops/*-latest.json`

### Brand
- `showroom/public/brand/*.svg`
- `showroom/public/brand/*.html`

## Script

Run:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\sync_supermega_codex_hq.ps1"
```

## Rule

This is a publish mirror, not the source of truth.

Source of truth remains:
- repo code
- live runtime
- repo ops files
- latest local reports

The BDA HQ folder is the durable handoff layer for the founder.
