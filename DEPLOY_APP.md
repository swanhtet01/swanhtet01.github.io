# SuperMega App Deploy

This is the cleanest way to run SuperMega as one connected system:

- public website
- private app and login
- API
- saved state
- supervisor loop

## What is actually live in this setup

- public:
  - `/`
  - `/platform`
  - `/solutions`
  - `/products`
  - `/lead-finder`
  - `/contact`
- private:
  - `/login`
  - `/app`
  - `/app/actions`
  - `/app/intake`
  - `/app/receiving`
  - `/app/inventory`

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
- `SUPERMEGA_WORKSPACE_SLUG`
- `SUPERMEGA_WORKSPACE_NAME`
- `SUPERMEGA_WORKSPACE_PLAN`
- `SUPERMEGA_DATABASE_URL`
- `SUPERMEGA_CORS_ORIGINS`
- `SUPERMEGA_CLOUDSQL_INSTANCE`
- `VITE_BOOKING_URL`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_WORKSPACE_APP_BASE`
- `VITE_WORKSPACE_API_BASE`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `VITE_GOOGLE_MAPS_API_KEY`

## Workspace-aware app core

The app now keeps the login/session path and lead pipeline in a separate workspace-aware enterprise store.

That means:

- one user can belong to multiple workspaces
- each session is tied to a workspace
- saved leads are scoped to the active workspace
- the default local runtime still works on SQLite
- a customer deployment can move that store to Postgres by setting `SUPERMEGA_DATABASE_URL`

## Cloud Run deploy

Workflow:

- `.github/workflows/supermega-app-cloud-run.yml`

Required secret:

- `GCP_SA_KEY`

Recommended secrets and vars for a real app host:

- secrets:
  - `SUPERMEGA_APP_USERNAME`
  - `SUPERMEGA_APP_PASSWORD`
  - `SUPERMEGA_DATABASE_URL`
  - `OPENAI_API_KEY`
  - `RESEND_API_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `VITE_GOOGLE_MAPS_API_KEY`
- vars:
  - `SUPERMEGA_APP_DISPLAY_NAME`
  - `SUPERMEGA_APP_ROLE`
  - `SUPERMEGA_WORKSPACE_SLUG`
  - `SUPERMEGA_WORKSPACE_NAME`
  - `SUPERMEGA_WORKSPACE_PLAN`
  - `SUPERMEGA_SESSION_HOURS`
  - `SUPERMEGA_CORS_ORIGINS`
  - `SUPERMEGA_CLOUDSQL_INSTANCE`
  - `VITE_BOOKING_URL`
  - `VITE_POSTHOG_KEY`
  - `VITE_POSTHOG_HOST`
  - `VITE_WORKSPACE_APP_BASE`
  - `VITE_WORKSPACE_API_BASE`

Current note:

- Cloud Run can host the app shell and API well
- but SQLite is not durable there by itself
- for a real customer deployment, set `SUPERMEGA_DATABASE_URL` to Cloud SQL for PostgreSQL or use a host with persistent disk
- if `SUPERMEGA_CLOUDSQL_INSTANCE` is set, the Cloud Run workflow will mount the Cloud SQL instance during deploy

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
