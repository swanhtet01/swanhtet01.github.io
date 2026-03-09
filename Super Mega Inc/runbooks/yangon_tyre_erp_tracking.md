# Yangon Tyre ERP Tracking Runbook

Purpose: turn the Yangon Tyre Drive mirror and email signal into an ERP-style change register you can review daily.

## Data model in this repo

- File inventory snapshot: `pilot-data/erp_snapshot.json`
- Change register (machine): `pilot-data/erp_change_register.json`
- Change register (human): `pilot-data/erp_change_register.md`
- Director view with ERP highlights: `pilot-data/pilot_solution.md`

## Configure watch scope

Edit `config.example.json` (or your real config) under `erp.watch_patterns`.

Recommended starting patterns:

- `kcm/**`
- `sales/**`
- `strategy/**`
- `**/*invoice*`
- `**/*quotation*`
- `**/*shipment*`
- `**/*claim*`

Add module keywords in `erp.module_keywords` so each file change is auto-tagged to:

- finance
- sales
- procurement
- quality
- production
- management

## Daily execution

From repo root, run:

```powershell
.\tools\pilot.ps1 erp-sync --config config.example.json
.\tools\pilot.ps1 pilot-solution --config config.example.json
```

To run full daily pipeline:

```powershell
.\tools\pilot.ps1 autopilot-run --config config.example.json
```

## Track specific files or folders quickly

Use ad hoc watch patterns:

```powershell
.\tools\pilot.ps1 erp-sync --config config.example.json --watch-pattern "sales/2026/**" --watch-pattern "**/*KIIC*"
```

## Interpretation

- `added`: new file entered tracked scope
- `modified`: existing tracked file changed hash/size/modified time
- `removed`: tracked file is no longer present

Each change includes:

- inferred module
- pattern matches
- recommended next action

## Ops rule

Review `erp_change_register.md` every morning.
If critical file changes appear (cash, invoice, claim, supplier shipment), create or update a DQMS/CAPA action the same day.
