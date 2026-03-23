# AI Agent ERP Architecture (V2, Simplified)

## Design Principle

Classic ERP fails because UX is rigid and updates are delayed.  
AI Agent ERP must be:
- action-first
- evidence-linked
- role-based (`CEO`, `Director`, `Manager`, `Operator`)
- modular (buy one module first, expand later)

## Core Architecture

## Layer 1: System of Record

Single source for structured records:
- `ops_updates`
- `supplier_events`
- `sales_signals`
- `quality_incidents`
- `capa_actions`
- `decision_log`

Recommended storage:
- Postgres for core records
- Drive/blob storage for file evidence

Rule:
- agents can recommend, but record state changes must be explicit and auditable

## Layer 2: Ingestion and Normalization

Connectors:
- Google Drive
- Gmail
- Input Center Sheets
- external market/news feeds

Normalizer responsibilities:
- map raw inputs into standard entities
- assign `owner`, `priority`, `due_date`, `source_refs`
- detect duplicates and stale records

## Layer 3: Agent Orchestration

Agent families:
- `Triage Agent`: classify and route incoming signals
- `Control Agent`: monitor SLA/breaches/escalations
- `Briefing Agent`: generate role-based summaries
- `Quality Agent`: incident to CAPA chain and supplier trend
- `Commercial Agent`: lead/proposal/pipeline guidance

Execution model:
- deterministic workflow first
- LLM for summarization, prioritization, draft output
- human checkpoint for high-risk actions

## Layer 4: Experience Surfaces

- Role Control Towers (CEO/Director/Manager)
- Daily action board
- Weekly executive brief
- Public showroom and lead capture

## Product Modules

ERP Core modules:
- Core Command Center
- Operations Pulse
- Procurement and Supplier Control
- Sales and Collections Control
- DQMS Quality Add-On

Standalone modules:
- Executive Brief Agent
- Supplier Control Agent
- Quality CAPA Agent
- Sales Intelligence Agent

## Repeatable Multi-Client Pattern

- one codebase
- per-client profile config
- isolated credentials and data partitions
- standard template pack with optional module toggles

Mandatory per-client artifacts:
- source map
- role map
- KPI baseline
- weekly operating cadence

## Why This Disrupts Traditional ERP

- faster deployment (days/weeks, not months)
- starts from current tools (Drive/Gmail/Sheets) instead of forced migration
- role-native outputs instead of menu-heavy UI
- AI acts as execution layer, not only reporting layer

