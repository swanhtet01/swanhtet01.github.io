# SuperMega OS Architecture

Generated: 2026-03-26

## Core position

SuperMega is not a custom AI project shop first.

SuperMega is an AI-native work software company with one wedge product and a ladder of adjacent modules:

- Wedge product: `Action OS`
- Free proof tools: `Lead Finder`, `News Brief`, `Action Board`
- Add-on utilities: `Attendance Check-In`, `Reply Draft`, `Document Intake`, `Director Flash`
- Core control modules: `Ops Intake`, `Supplier Watch`, `Receiving Control`, `Inventory Pulse`, `Quality Closeout`, `Cash Watch`, `Production Pulse`, `Sales Signal`
- Flagship: `SuperMega OS`

Yangon Tyre remains the pilot context and proof source. It is not the product definition.

The wedge is still `Action OS`, but the flagship should be broader than operations alone.

`SuperMega OS` should become a context-aware work OS that can sit across:

- Gmail and Google Workspace
- Drive and shared file systems
- Sheets and structured trackers
- browser research tools
- chat and prompt workspaces such as ChatGPT
- coding tools such as VS Code
- creative tools such as Canva, Photoshop, and Premiere

Publicly, we should still sell the wedge first. Internally, we should architect for the broader workspace model now.

## Product ladder

### Level 1: Free proof tools

These prove logic and lower the sales barrier.

- `Lead Finder`: public business search, contact extraction, shortlist creation
- `News Brief`: URL-backed brief generation from external market signals
- `Action Board`: turn messy updates into owners, due dates, and action lanes

### Level 2: Add-on utilities

These solve one narrow job fast.

- `Attendance Check-In`
- `Reply Draft`
- `Document Intake`
- `Director Flash`

### Level 3: Control modules

These are the real sellable modules.

- `Action OS`
- `Ops Intake`
- `Supplier Watch`
- `Receiving Control`
- `Inventory Pulse`
- `Quality Closeout`
- `Cash Watch`
- `Production Pulse`
- `Sales Signal`

### Level 4: Operating system

`SuperMega OS` is the layer that unifies action, records, approvals, role-based views, and cross-tool work context.

It should not be sold as a full ERP replacement on day one. It should be sold as the operating layer that gradually replaces fragmented manual ERP work, then expands into wider knowledge-work and creative-work use cases.

## System architecture

### 1. Ingestion layer

Sources:

- Gmail
- Google Drive
- Google Sheets
- local mirrored files
- public web sources
- browser sessions
- chat workspaces
- coding workspaces
- creative workspaces

Purpose:

- pull operational signals
- normalize data into reusable schemas
- preserve evidence links
- maintain context continuity across tools

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
- metric entries
- agent teams and units

This is the most important technical asset in the stack. It is the bridge from demo logic to actual software.

The long-term extension is not just more rows. It is a shared context graph for:

- work items
- files and evidence
- people and roles
- tool sessions
- drafts and outputs
- approvals
- memory of what has already been done

### 3. Orchestration layer

Current:

- CLI flows in `mark1_pilot/cli.py`
- service layer in `tools/serve_solution.py`
- supervisor loop in `mark1_pilot/supervisor.py`

Purpose:

- run recurring sync
- update canonical records
- expose structured APIs
- support local and containerized always-on execution

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
- every cross-tool agent action needs clear scope and allowed apps

Longer term, the agent layer should behave like coordinated specialist workspaces:

- operations agents
- research agents
- coding agents
- content and creative agents
- executive briefing agents

They should share context through the canonical state layer, not by copying giant chat histories around.

### 5. Interface layer

Public:

- enterprise website and product showroom

Private:

- workspace page
- product-specific module pages
- API endpoints

Longer term:

- personal workspaces
- team workspaces
- function workspaces
- creative workspaces
- cross-app command layer

Current real module interfaces:

- `Lead Finder`
- `News Brief`
- `Action Board`
- `Ops Intake`
- `Receiving Control`
- `Inventory Pulse`

## Technical stack

### Current working stack

- React + Vite + TypeScript
- FastAPI
- SQLite
- Google APIs
- PowerShell operator scripts
- Docker single-app deploy path

### Next integrations to add

1. `SQLModel`
   Use for typed persistence and cleaner migration from the current sqlite3 utility layer.

2. `Postgres`
   Replace local-file SQLite for shared multi-user deploys.

3. `Cloud Run`
   Host the full app service publicly and stop relying on local-only workspace hosting.

4. `Cloud Scheduler` and `Cloud Tasks`
   Move recurring jobs and retries into cloud execution.

5. `Secret Manager`
   Remove secret handling from ad hoc local patterns.

6. `Polars` and `DuckDB`
   Strengthen spreadsheet-heavy workflows and make ERP-style analysis faster and more reliable.

7. `LangGraph`
   Add durable multi-step orchestration once the core record model is stable.

8. `PydanticAI`
   Tighten structured agent outputs and validation.

9. `Playwright` or `Stagehand`
   Use as browser sidecars only, not as the core system of record.

### Things not to make the core

- vector database first
- CrewAI as the main transactional runtime
- OpenClaw or browser automation as the source of truth
- fully autonomous write loops without approval boundaries

## What still blocks scale

- auth and tenant boundaries are still missing
- Postgres and migrations are not in place yet
- public backend hosting exists as a path, but not as the default live environment
- approvals are still too thin
- inventory and receiving need deeper record workflows beyond first write paths
- contact and sales proof on the website still lag behind the backend
- role views are still shallow for director, manager, and operator
- there is no unified cross-tool session/context model yet
- chat, coding, and creative apps are not integrated yet

## Build order from here

1. Auth + workspace / tenant model
2. Postgres + migration layer
3. Approval Layer
4. Inventory Pulse deeper flows
5. Receiving Control write-back into shared operational sheets
6. Supplier Watch tighter escalation and reply support
7. Director / Manager / Operator role views
8. Cross-tool context layer for knowledge-work and creative-work apps

## Commercial framing

How SuperMega should sell:

- first sell one useful control layer
- then sell adjacent modules
- then unify them under `SuperMega OS`
- then expand the same OS into wider knowledge-work and creative-work use cases

How SuperMega should not sell:

- "we build any AI agent you want"
- "full ERP replacement in one shot"
- "autonomous company out of the box"
- "we replace every desktop app immediately"

Better public framing:

- `Action OS` = first product
- `SuperMega OS` = the broader context-aware work layer
- operations control proves trust first
- broader workspaces come after the first trusted system is live

## Success condition

SuperMega becomes valuable when a company can say:

- "I run the day from this board."
- "I know who owns the next step."
- "My supplier, quality, stock, and cash issues are visible before they become surprises."
- "My team can keep using their normal tools while the OS keeps the context straight."
- "I did not need a giant ERP rollout to get there."
