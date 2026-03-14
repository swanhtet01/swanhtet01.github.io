# SuperMega Mark 1

This repo is the control surface for **Swan's personal AI operating system**.

The primary deployment is not a generic DQMS, plant manager, or multi-tenant manufacturing product. The primary deployment is **one user, one data estate, one pilot client: Swan**.

Current focus:

- ingest and reason over Swan's own files, notes, spreadsheets, documents, and workspace data
- run a persistent agent stack that can research, summarize, plan, draft, code, and automate repeatable workflows
- keep manufacturing and client-specific assets as legacy demos or future templates, not the core product story

Core docs:

- `personal-pilot-architecture.md` - v1 architecture and stack decision for the personal pilot
- `mark1_pilot/README.md` - runnable pilot scaffold for Yangon Tyre plus Gmail
- `showroom/` - React + TypeScript + Tailwind public showroom for `supermega.dev`
- `showroom/DEPLOY_CLOUD_RUN.md` - fallback hosting path when GitHub Pages connectivity is blocked
- `command-center/ARCHITECTURE_v2.3.md` - broader Mark 1 machine vision and long-term architecture
- `DOCUMENTATION-INDEX.md` - map of active vs legacy docs
- `TODO.md` - current delegated workstreams
- `Super Mega Inc/runbooks/` - domain cutover and showroom operations runbooks
- `Super Mega Inc/sales/` - package one-pagers and proposal/discovery collateral

Quick commands:

```powershell
# Personal pilot
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli platform-publish --config .\config.example.json --email-max-results 12

# Manus inventory
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli manus-catalog --config .\config.example.json

# DQMS starter registers
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli dqms-sync --config .\config.example.json

# ERP sync + critical file focus tracking
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli erp-sync --config .\config.example.json
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli erp-focus --config .\config.example.json

# Team input center sheets (one-time template setup)
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli input-center-setup --config .\config.example.json

# Team input center sync (daily)
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli input-center-sync --config .\config.example.json

# Daily autopilot run
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli autopilot-run --config .\config.example.json --skip-drive --run-domain-check

# Continuous autonomous loop (hourly, 0 = unlimited runs)
.\tools\autopilot_loop.ps1 -Config .\config.example.json -IntervalMinutes 60 -MaxRuns 0 -SkipDrive

# Data coverage scorecard (what data is missing and what teams should update)
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli coverage-report --config .\config.example.json

# One-page execution recap across website + YTF pilot + SuperMega R&D
& "C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe" -m mark1_pilot.cli execution-review --config .\config.example.json

# Showroom
cd showroom
npm ci
npm run build
```

Legacy/template materials still live here for reference:

- `aws-deployment-architecture.md`
- `yangon-tyre-deployment.md`
- `manufacturing-template.md`
- `ytf-dqms/`

These are no longer the main product definition for v1.
