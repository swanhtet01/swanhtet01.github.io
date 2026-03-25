# SuperMega OS Architecture

Generated: 2026-03-26

## Core position

SuperMega is not a custom AI project shop first.

SuperMega is an AI-native operations software company with one wedge product and a ladder of adjacent modules:

- Wedge product: `Action OS`
- Semi-products: `Lead Finder`, `News Brief`, `Action Board`, `Attendance Check-In`, `Reply Draft`, `Document Intake`, `Director Flash`
- Core control modules: `Supplier Watch`, `Receiving Control`, `Inventory Pulse`, `Quality Closeout`, `Cash Watch`, `Production Pulse`, `Sales Signal`
- Flagship: `SuperMega OS`

Yangon Tyre remains the pilot context and proof source. It is not the product definition.

## Product ladder

### Level 1: Free proof tools

These prove logic and lower the sales barrier.

- `Lead Finder`: public business search, contact extraction, shortlist creation
- `News Brief`: URL-backed brief generation from external market signals
- `Action Board`: turn messy updates into owners, due dates, and action lanes

### Level 2: Semi-products

These solve one narrow job fast.

- `Attendance Check-In`
- `Reply Draft`
- `Document Intake`
- `Director Flash`

### Level 3: Control modules

These are the real sellable modules.

- `Action OS`
- `Supplier Watch`
- `Receiving Control`
- `Inventory Pulse`
- `Quality Closeout`
- `Cash Watch`
- `Production Pulse`
- `Sales Signal`

### Level 4: Operating system

`SuperMega OS` is the layer that unifies action, records, approvals, and role-based views.

It should not be sold as a full ERP replacement on day one. It should be sold as the operating layer that gradually replaces fragmented manual ERP work.

## System architecture

### 1. Ingestion layer

Sources:

- Gmail
- Google Drive
- Google Sheets
- local mirrored files
- public web sources

Purpose:

- pull operational signals
- normalize data into reusable schemas
- preserve evidence links

### 2. Canonical state layer

Current:

- SQLite via `mark1_pilot/state_store.py`

Current canonical records:

- actions
- contact submissions
- attendance events
- quality incidents
- CAPA actions
- supplier risks
- receiving records
- inventory records
- agent teams and units

This is the most important technical asset in the stack. It is the bridge from “AI demo” to “actual software.”

### 3. Orchestration layer

Current:

- CLI flows in `mark1_pilot/cli.py`
- service layer in `tools/serve_solution.py`
- supervisor loop in `mark1_pilot/supervisor.py`

Purpose:

- run recurring sync
- update canonical records
- expose structured APIs
- support local always-on execution

### 4. Agent layer

Current teams:

- `Command Office`
- `Control Tower`
- `Client Delivery`
- `Growth Studio`
- `R&D Lab`
- `Platform Engineering`

Agent rules:

- read agents do not write business state
- write agents only write into canonical records
- every stateful action needs evidence or source reference
- every production workflow needs an owner and due window

### 5. Interface layer

Public:

- GitHub Pages showroom on `supermega.dev`

Private:

- workspace page
- product-specific module pages
- API endpoints

Current real module interfaces:

- `Lead Finder`
- `News Brief`
- `Action Board`
- `Receiving Control`
- `Inventory Pulse`

## Technical stack

### Current working stack

- React + Vite + TypeScript
- FastAPI
- SQLite
- Google APIs
- PowerShell operator scripts

### Next integrations to add

1. `SQLModel`
   Use for typed persistence and cleaner migration from the current sqlite3 utility layer.

2. `Cloud Run`
   Host the backend service publicly and stop relying on local-only workspace hosting.

3. `Cloud Scheduler` and `Cloud Tasks`
   Move recurring jobs and retries into cloud execution.

4. `Secret Manager`
   Remove secret handling from ad hoc local patterns.

5. `Polars` and `DuckDB`
   Strengthen spreadsheet-heavy workflows and make ERP-style analysis faster and more reliable.

6. `LangGraph`
   Add durable multi-step orchestration once the core record model is stable.

7. `PydanticAI`
   Tighten structured agent outputs and validation.

8. `Playwright` or `Stagehand`
   Use as browser sidecars only, not as the core system of record.

### Things not to make the core

- vector database first
- CrewAI as the main transactional runtime
- OpenClaw or browser automation as the source of truth
- fully autonomous write loops without approval boundaries

## What still blocks scale

- public backend is not yet hosted as a stable cloud service
- approvals are still too thin
- inventory and receiving need deeper record workflows beyond first write paths
- contact and sales proof on the website still lag behind the backend
- role views are still shallow for director, manager, and operator

## Build order from here

1. `Approval Layer`
2. `Inventory Pulse` deeper flows
3. `Receiving Control` write-back into shared operational sheets
4. `Supplier Watch` tighter escalation and reply support
5. `Director OS` / `Manager OS` / `Operator OS` role views
6. Cloud hosting and scheduled orchestration

## Commercial framing

How SuperMega should sell:

- first sell one useful control layer
- then sell adjacent modules
- then unify them under `SuperMega OS`

How SuperMega should not sell:

- “we build any AI agent you want”
- “full ERP replacement in one shot”
- “autonomous company out of the box”

## Success condition

SuperMega becomes valuable when a company can say:

- “I run the day from this board.”
- “I know who owns the next step.”
- “My supplier, quality, stock, and cash issues are visible before they become surprises.”
- “I did not need a giant ERP rollout to get there.”
