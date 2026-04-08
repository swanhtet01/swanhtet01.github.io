# Updates And Alerts

## Where to look first

### Live app
- `app.supermega.dev/app/teams`
- `app.supermega.dev/app/director`
- `app.supermega.dev/app/sales`

### Local ops reports
- `pilot-data/ops/workstation-latest.json`
- `pilot-data/ops/operator-cycle-latest.json`
- `pilot-data/ops/founder-cycle-latest.json`
- `pilot-data/ops/agent-cycle-latest.json`

### Live ops files
- `Super Mega Inc/ops/00_company_scoreboard.md`
- `Super Mega Inc/ops/01_daily_founder_brief.md`
- `Super Mega Inc/ops/02_operator_report.md`

### Fastest local view
- `Super Mega Inc/ops/index.html`
- open with:
  - `powershell -ExecutionPolicy Bypass -File "C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_ops_hub.ps1"`

## Current alert path
- local workstation cycle updates reports and ops files
- cloud scheduler and cloud tasks keep jobs running
- app control room shows loop state

## Next alert path
- Resend domain completion so email alerts actually send
- founder brief to inbox
- contact submission alerts to inbox
- invite failure alerts to inbox

## Rule
- if an update is important, it should appear in the app, the local report files, or the live ops folder
- if it appears nowhere, it is not operational enough yet
