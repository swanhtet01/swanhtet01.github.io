# Founder Local Access Runbook

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

## How Swan opens it locally
Fast path:
1. Open `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`
2. Open `ops\index.html`
3. Open the exact `.md` file if deeper detail is needed

Repo helper:
- `powershell -ExecutionPolicy Bypass -File C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_founder_workspace.ps1`

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

## What still depends on Codex vs the app
Use the app for:
- founder review
- sales state
- approvals
- Agent Ops and loop visibility

Use the stable mirror for:
- reading synced founder updates
- reading architecture and defaults outside the temp worktree

Use Codex for:
- code and UI changes
- release work
- infrastructure changes
- schema changes
- deep debugging
