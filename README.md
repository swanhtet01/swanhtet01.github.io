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
- `QUICKSTART.md` - fastest path to run pilot, fix Gmail, and test on phone/laptop
- `TODO.md` - current delegated workstreams
- `Super Mega Inc/runbooks/` - domain cutover and showroom operations runbooks
- `Super Mega Inc/runbooks/ai_native_erp_architecture_v1.md` - production blueprint for AI-native ERP rollout from single-tenant to multi-tenant
- `Super Mega Inc/runbooks/supermega_machine_architecture.md` - unified architecture for internal platform + website + product modules
- `Super Mega Inc/sales/` - package one-pagers and proposal/discovery collateral

Quick commands:

```powershell
# Personal pilot
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 platform-publish --config .\config.example.json --email-max-results 12

# Manus inventory
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 manus-catalog --config .\config.example.json

# DQMS starter registers
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 dqms-sync --config .\config.example.json

# ERP sync + critical file focus tracking
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 erp-sync --config .\config.example.json
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 erp-focus --config .\config.example.json

# Team input center sheets (one-time template setup)
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 input-center-setup --config .\config.example.json

# Team input center sync (daily)
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 input-center-sync --config .\config.example.json

# Daily autopilot run
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 autopilot-run --config .\config.example.json --skip-drive --run-domain-check

# Continuous autonomous loop (hourly, 0 = unlimited runs)
.\tools\autopilot_loop.ps1 -Config .\config.example.json -IntervalMinutes 60 -MaxRuns 0 -SkipDrive

# Data coverage scorecard (what data is missing and what teams should update)
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 coverage-report --config .\config.example.json

# List reusable client/setup profiles
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 config-profiles --config .\config.example.json

# Create a new setup profile from template (multi-client bootstrap)
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 config-profile-create --config .\config.example.json --profile my_new_client --from-profile smb_template

# One-page execution recap across website + YTF pilot + SuperMega R&D
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 execution-review --config .\config.example.json

# Re-auth Gmail if token expired/revoked
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 gmail-auth --config .\config.example.json --host 127.0.0.1 --port 8765

# Manual fallback if localhost callback fails
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 gmail-auth-start --config .\config.example.json
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 gmail-auth-finish --config .\config.example.json --callback-url "<paste-full-callback-url>"

# Full one-command run + open outputs
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipDrive

# Unified machine status (website + internal platform health)
powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action status -Config .\config.example.json

# Unified daily run
powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action daily -Config .\config.example.json

# Unified website DNS/HTTPS diagnose
powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action website-check

# Run against a profile overlay (multi-client setup)
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -Profile smb_template -SkipDrive

# Skip website domain check if you only want local pipeline speed
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipDrive -SkipDomainCheck

# Serve dashboard/API for phone/laptop access on LAN
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -SkipRun -Serve -BindHost 0.0.0.0 -Port 8787

# Deploy website via GitHub Actions (sync secret + dispatch Pages/Cloud Run)
powershell -ExecutionPolicy Bypass -File .\tools\deploy_website_actions.ps1 -ProjectId supermega-468612 -Region asia-southeast1 -Service supermega-showroom

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
