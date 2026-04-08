# Codex HQ Sync

This sync keeps a durable founder mirror outside the temp worktree.

## BDA HQ location

The target folder is:
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`

This is the founder-facing mirror.
It is meant to survive temp worktree cleanup.

## What gets published

### Ops docs
- `Super Mega Inc/ops/*.md`
- `Super Mega Inc/ops/*.csv`
- `Super Mega Inc/ops/index.html`

### Machine-readable reports
- `pilot-data/ops/*-latest.json`

### Public-site evidence
- `showroom/public/site/*-screen.png`
- `showroom/public/brand/*.svg`
- `showroom/public/brand/*.html`

## Purpose of each folder

### `ops`
- founder-readable state
- release and incident logs
- daily brief and operator report

### `reports`
- machine-readable outputs from local cycles

### `site`
- the current rendered evidence for public systems and demos

### `brand`
- reusable brand and exported public assets

## Rule

Codex HQ is not the source of truth.

Source of truth remains:
- repo code
- live runtime
- repo ops files
- latest local report outputs

Codex HQ is the durable local mirror for the founder.

## Run

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\sync_supermega_codex_hq.ps1"
```

## Expected result

After sync, the founder should be able to open one local folder and see:
- what the agents just did
- whether the runtime is healthy
- what the public site currently shows
- what still needs attention
