# Enterprise Upgrade Review

Date: 2026-03-27

## Current repo reality

The repo already carries modern foundations:

- React 19
- Vite 7
- Tailwind 4
- FastAPI
- SQLModel
- DuckDB
- Polars
- LangGraph

The main gap was not missing libraries. The gap was that auth, workspaces, and the saved lead pipeline were still effectively single-tenant pilot code.

## What changed in this pass

- Added a workspace-aware enterprise store in `mark1_pilot/enterprise_store.py`
- Moved login/session handling in `tools/serve_solution.py` onto that store
- Moved the saved lead pipeline and lead activity flow onto that store
- Added support for workspace-aware runtime settings:
  - `SUPERMEGA_WORKSPACE_SLUG`
  - `SUPERMEGA_WORKSPACE_NAME`
  - `SUPERMEGA_WORKSPACE_PLAN`
  - `SUPERMEGA_DATABASE_URL`
- Added Postgres driver support via `psycopg[binary]`

## Why this matters

This is the first step from:

- one local owner app

to:

- one app that can support multiple client workspaces

without rewriting the whole platform first.

## Best stack choices now

### Keep

- FastAPI for the app/API boundary
- SQLModel for new relational app state
- Polars and DuckDB for messy spreadsheet-heavy client data
- LangGraph for multi-step business workflows when the workflow is truly stateful

### Add next

- Postgres as the real shared database target
- Cloud Run for the app host
- Cloud SQL for Postgres
- Cloud Tasks and Cloud Scheduler for durable recurring jobs
- Secret Manager for runtime secrets

### Use carefully

- OpenAI Responses API for tool-using flows
- OpenAI Agents SDK or LangGraph for orchestrated agent systems
- PydanticAI for stricter typed agent output

These should support the platform, not replace the product model.

## Product direction

### Main wedge

- `Action OS`

### Core modules

- `Supplier Watch`
- `Receiving Control`
- `Inventory Pulse`
- `Quality Closeout`
- `Cash Watch`
- `Production Pulse`
- `Sales Signal`

### Intake bridge

- `Ops Intake`

### Growth wedge

- `Lead Finder` -> `Lead-to-Pilot` -> pipeline -> outreach -> discovery

## Biggest remaining gaps

1. Public backend hosting is still not fully closed.
2. Website UX is still too text-heavy and not yet at the reference quality bar.
3. Workspace switching exists in the data model, but the private app still needs stronger role- and workspace-aware UI.
4. Lead pipeline needs direct outreach and scheduling actions, not just save/export.
5. Approval layer and deeper inventory/receiving exception flow are still not complete.

## Next build order

1. Public backend deploy with the same workspace-aware config model.
2. Inventory exception queue and approval layer.
3. Lead pipeline comms actions and scheduling integration.
4. UI simplification pass around one message:
   - public site sells `Action OS`
   - private app runs the real system
