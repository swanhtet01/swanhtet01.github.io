# Founder Local Access Runbook

This runbook is for opening the company control layer without starting in Codex.

## Stable mirror
Stable mirror root:
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`

Updates and architecture land here:
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\index.html`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\00_company_scoreboard.md`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\01_daily_founder_brief.md`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\02_operator_report.md`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\27_supermega_platform_architecture.md`
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\28_tenant_identity_and_defaults.md`

## What works today

Use `live` mode if the goal is to operate the company right now.

That path already gives you:
- the deployed app on `https://app.supermega.dev`
- the synced BDA mirror
- founder reports
- agent/runtime visibility

Use `local` mode only if you want branch-only features that are not deployed yet.
That path currently depends on a real Python install being available on Windows `PATH`.

## How Swan opens it locally
Use one of these modes:

### 1. Live company control plane
Use this when you want the current deployed app:

`powershell -ExecutionPolicy Bypass -File C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_founder_workspace.ps1 -Mode live`

This opens:
- the BDA mirror
- the local ops hub
- live app surfaces on `https://app.supermega.dev`

What to open first:
- `/app/dev-desk`
- `/app/hq`
- `/app/agents`

### 2. Local branch control plane
Use this when you want the newer branch features on your PC:

`powershell -ExecutionPolicy Bypass -File C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_founder_workspace.ps1 -Mode local -BuildShowroom`

Requirements:
- Python on `PATH`
- Node.js / `npm` on `PATH`

This starts the local stack and opens:
- `http://localhost:8787/app/dev-desk`
- `http://localhost:8787/app/agents`
- `http://localhost:8787/app/deals`

If `python` is missing, this mode will not start.
That is a local workstation requirement, not an app failure.

### 3. Mirror only
Use this when you only want the synced control files and no browser pages:

`powershell -ExecutionPolicy Bypass -File C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_founder_workspace.ps1 -Mode mirror -NoBrowser`

Fast file path:
1. Open `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`
2. Open `ops\index.html`
3. Open the exact `.md` file if deeper detail is needed

## Current app login defaults
Current repo-side defaults:
- app: `https://app.supermega.dev`
- auth required: `1`
- username: `owner`
- password: `supermega-demo`
- display name: `Owner`
- workspace slug: `supermega-lab`

Important:
- live deployment can override these with environment variables
- the mirror is for visibility, not final credential authority
- these are still demo defaults and should not remain the long-term production access model

## What Swan should open first

If you are checking the company in under five minutes:
1. `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq\ops\index.html`
2. `https://app.supermega.dev/app/dev-desk`
3. `https://app.supermega.dev/app/deals`
4. `https://app.supermega.dev/app/agents`

If you are checking whether the company is actually running:
1. open the local ops hub
2. confirm the founder brief and operator report updated recently
3. confirm `Dev Desk` shows runtime health and current repo state
4. confirm `Deals` shows inbound and active companies

## What still depends on Codex vs the app

Use the app for:
- founder review
- runtime and tenant checks
- sales state
- approvals
- agent and loop visibility
- daily company operation

Use the stable mirror for:
- reading synced founder updates
- reading architecture and defaults outside the temp worktree

Use Codex for:
- code and UI changes
- release work
- infrastructure changes
- schema changes
- deep debugging
- branch-level product development

## Founder rule

Start in `Dev Desk`.

Open Codex only when:
- the app cannot answer the operational question
- code must change
- infrastructure must change
- a release or incident needs engineering work
