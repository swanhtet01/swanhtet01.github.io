# SuperMega App Deploy

This is the cleanest way to run SuperMega as one connected system:

- public website shell
- private app and login
- API
- saved state
- supervisor loop

## What is actually live in this setup

- `Lead Finder` with saved pipeline support
- `Action OS` private workspace
- `Ops Intake`
- `Receiving Control`
- `Inventory Pulse`
- product feedback/workbench loop

## Fastest local start

### Option 1: Windows stack runner

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\start_supermega_stack.ps1 -BuildShowroom
```

That will:

- build the showroom
- start the supervisor loop in the background
- start the app server
- open the login page

Default app URL:

- `http://localhost:8787/login/`

### Default demo login

- username: `owner`
- password: `supermega-demo`

Change those before sharing outside your own machine.

## Docker run

```powershell
docker compose -f .\docker-compose.app.yml up --build
```

That now starts:

- `supermega-app`
- `supermega-supervisor`

Saved data is stored in the named Docker volume `supermega-app-data`.

## Environment

Use `.env.app.example` as the starting point for runtime settings.

Main values:

- `SUPERMEGA_AUTH_REQUIRED`
- `SUPERMEGA_APP_USERNAME`
- `SUPERMEGA_APP_PASSWORD`
- `SUPERMEGA_APP_DISPLAY_NAME`
- `SUPERMEGA_APP_ROLE`
- `SUPERMEGA_CORS_ORIGINS`
- `VITE_BOOKING_URL`

## Cloud Run deploy

Workflow:

- `.github/workflows/supermega-app-cloud-run.yml`

Required secret:

- `GCP_SA_KEY`

Current note:

- Cloud Run can host the app shell and API well
- but SQLite is not durable there by itself
- for a real customer deployment, move the state layer to Postgres or use a host with persistent disk

## Current production gap

This repo is now good enough for:

- serious pilot
- internal team use
- one-client single-tenant app

It is not yet full enterprise SaaS because it still needs:

- Postgres
- tenant/workspace separation
- stronger audit and approval layers
- public backend hosting fully verified
