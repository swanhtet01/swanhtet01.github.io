# SuperMega App Deploy

This is the cleanest way to run SuperMega as one connected system:

- public website
- private app and login
- API
- saved state
- supervisor loop

## What is actually live in this setup

- public website:
  - `/`
  - `/find-companies`
  - `/company-list`
  - `/task-list`
  - `/receiving-log`
  - `/book`
- shared app host:
  - `/login`
  - `/app`
  - `/app/sales`
  - `/app/actions`
  - `/app/exceptions`
  - `/app/approvals`

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
- `SUPERMEGA_INTERNAL_CRON_TOKEN`
- `SUPERMEGA_ENV`
- `SUPERMEGA_SENTRY_TRACES`
- `SENTRY_DSN`
- `VITE_BOOKING_URL`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_SENTRY_DSN`
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
- direct script:
  - `powershell -ExecutionPolicy Bypass -File .\tools\deploy_supermega_gcp.ps1`
- repo/bootstrap sync:
  - `powershell -ExecutionPolicy Bypass -File .\tools\bootstrap_supermega_ops.ps1 -UseLiveRunUrl -DeployApp -DeployWebsite`

Required secret:

- `GCP_SA_KEY`

Recommended secrets and vars for a real app host:

- secrets:
  - `SUPERMEGA_APP_USERNAME`
  - `SUPERMEGA_APP_PASSWORD`
  - `SUPERMEGA_DATABASE_URL`
  - `SUPERMEGA_INTERNAL_CRON_TOKEN`
  - `OPENAI_API_KEY`
  - `RESEND_API_KEY`
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `SENTRY_DSN`
  - `VITE_GOOGLE_MAPS_API_KEY`
  - `VITE_POSTHOG_KEY`
- vars:
  - `SUPERMEGA_APP_DISPLAY_NAME`
  - `SUPERMEGA_APP_ROLE`
  - `SUPERMEGA_WORKSPACE_SLUG`
  - `SUPERMEGA_WORKSPACE_NAME`
  - `SUPERMEGA_WORKSPACE_PLAN`
  - `SUPERMEGA_SESSION_HOURS`
  - `SUPERMEGA_CORS_ORIGINS`
  - `SUPERMEGA_CLOUDSQL_INSTANCE`
  - `SUPERMEGA_SENTRY_TRACES`
  - `VITE_BOOKING_URL`
  - `VITE_POSTHOG_HOST`
  - `VITE_SENTRY_DSN`
  - `VITE_WORKSPACE_APP_BASE`
  - `VITE_WORKSPACE_API_BASE`

## Durable agent jobs

The app now has durable shared agent runs persisted in the enterprise store:

- `Revenue Scout`
- `List Clerk`
- `Task Triage`
- `Founder Brief`

Routes:

- `GET /api/agent-runs`
- `POST /api/agent-runs`
- `POST /api/agent-runs/run-defaults`
- `POST /api/ops/agent-jobs/run-defaults`
- `POST /api/internal/agent-runs/run-defaults`

The internal defaults endpoint is intended for Cloud Scheduler or an internal operator script.

Auth for `POST /api/internal/agent-runs/run-defaults`:

- `x-supermega-cron-token` header matching `SUPERMEGA_INTERNAL_CRON_TOKEN`

Auth for `POST /api/agent-runs/run-defaults`:

- authenticated app session

Operator script:

```powershell
C:\Users\swann\OneDrive - BDA\.venv\Scripts\python.exe .\tools\run_supermega_agent_jobs.py --base-url https://supermega-app-kr5v7kj3xa-as.a.run.app
```

Current note:

- Cloud Run can host the app shell and API well
- but SQLite is not durable there by itself
- for a real customer deployment, set `SUPERMEGA_DATABASE_URL` to Cloud SQL for PostgreSQL or use a host with persistent disk
- if `SUPERMEGA_CLOUDSQL_INSTANCE` is set, the Cloud Run workflow will mount the Cloud SQL instance during deploy
- the Cloud Run workflow now also accepts PostHog and Sentry envs for frontend and backend visibility
- the direct deploy script now provisions:
  - Artifact Registry repository
  - Cloud SQL instance
  - app database and user
  - Secret Manager values
  - Cloud Run deploy inputs

## Current infra status

As of April 5, 2026:

- Cloud SQL instance `supermega-app-db` exists
- database `supermega` exists
- app user `supermega_app` exists
- Secret Manager has:
  - `supermega-app-username`
  - `supermega-app-password`
  - `supermega-openai-api-key`
  - `supermega-google-maps-api-key`
  - `supermega-google-places-api-key`
  - `supermega-database-url`
- `supermega-google-service-account-json`
- Cloud Run service is live:
  - [supermega-app-kr5v7kj3xa-as.a.run.app](https://supermega-app-kr5v7kj3xa-as.a.run.app)
- GitHub Actions app deploy is live and working
- GitHub Pages is wired to the live app host via `VITE_WORKSPACE_APP_BASE` and `VITE_WORKSPACE_API_BASE`

Remaining custom-domain blocker:

- `app.supermega.dev` must finish DNS and SSL propagation
- once Google marks the mapping ready, use `app.supermega.dev` as the main shared app host

## Current production gap

This repo is now good enough for:

- serious pilot
- internal team use
- one-client single-tenant app

It is not yet full enterprise SaaS because it still needs:

- recoverable onboarding
- billing
- support and recovery email
- telemetry keys
- tenant/workspace separation
- stronger audit and approval layers
