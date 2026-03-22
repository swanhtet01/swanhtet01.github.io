# SuperMega Quickstart

This is the shortest path to get value from the repo today.

## 1) Run the Yangon Tyre pilot solution (ERP + DQMS)

From repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -Profile ytf_personal
```

Main outputs:
- `swan-intelligence-hub/index.html` (dashboard)
- `pilot-data/pilot_solution.md` (director brief)
- `pilot-data/dqms_weekly_summary.md` (quality/CAPA summary)
- `pilot-data/TODAY.md` (daily execution recap)

## 2) Fix Gmail if email coverage is degraded

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 gmail-auth --config .\config.example.json --host 127.0.0.1 --port 8765
```

Then run the main solution command again.

## 3) Serve locally for phone/laptop testing

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -Profile ytf_personal -SkipRun -Serve -BindHost 0.0.0.0 -Port 8787
```

Open on this machine:
- `http://127.0.0.1:8787`

Open from other devices on same network:
- `http://<this-computer-ip>:8787`

## 4) Build the public showroom (supermega.dev source)

```powershell
cd .\showroom
npm ci
npm run build
npm run lint
```

Deployment target:
- GitHub Pages workflow: `.github/workflows/showroom-pages.yml`
- Domain: `https://supermega.dev`

## 5) Create another setup profile (for new company/client)

List current profiles:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 config-profiles --config .\config.example.json
```

Create a new profile from template:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 config-profile-create --config .\config.example.json --profile my_new_client --from-profile smb_template
```

Run with that profile:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -Profile my_new_client
```
