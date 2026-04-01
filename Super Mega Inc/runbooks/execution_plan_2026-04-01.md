# SuperMega Execution Plan

Date: 2026-04-01

## Goal

Ship SuperMega as one simple, credible product:

- Public: `Lead Finder`
- Core product: `Action OS`
- Private app: `/app`

Everything else is secondary until this path works live.

## Phase 1: Make the public site honest

- Keep only `Home`, `Action OS`, `Lead Finder`, and `Book`.
- Do not expose public login or signup unless the app host is live.
- Make `Lead Finder` work without the private app by using browser-side search or the live backend.
- Fail builds if the public search key is missing.

## Phase 2: Make the app public

- Enable Cloud Run and deploy the backend.
- Set:
  - `VITE_WORKSPACE_APP_BASE`
  - `VITE_WORKSPACE_API_BASE`
  - `VITE_BOOKING_URL`
  - `VITE_GOOGLE_MAPS_API_KEY`
- Point all app entry paths to the live app host.

## Phase 3: Make the product real

- Keep `Lead Finder` public and useful.
- Keep `/app/leads` private for pipeline, hunts, and activity.
- Keep `Action OS` as the only core product page.
- Keep `Director`, `Exceptions`, `Approvals`, and `Insights` inside `/app`.

## Phase 4: Make agents real

- Add `agent_jobs`
- Add `agent_runs`
- Add `agent_outcomes`
- Move lead hunts and refresh loops into background jobs
- Add retries, job status, and run history

## Phase 5: Make it enterprise

- Move from SQLite to PostgreSQL
- Add real tenant/workspace separation
- Replace demo credentials with production auth
- Add audit trail and approval policy

## Recommended stack

### Use now

- FastAPI
- SQLModel
- PostgreSQL
- OpenAI Responses API
- OpenAI Agents SDK
- Cloud Run
- Cloud Tasks
- Cloud Scheduler
- Secret Manager

### Add next

- LangGraph for long-running stateful workflows
- PydanticAI for typed agent outputs and validation

### Use only as sidecars

- Playwright
- Stagehand

## Definition of done

SuperMega is ready only when:

- `supermega.dev` has a real live Lead Finder
- `/book` has a real scheduler
- `/app` is publicly hosted
- login works on the live host
- lead pipeline is saved on the live host
- autonomous jobs run in the background and write durable run records
