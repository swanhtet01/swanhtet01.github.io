# SuperMega Agent Stack Strategy

## Core Rule

Do not put the whole company on top of one magic agent framework.

Use layers:
- deterministic workflow for critical business state
- LLM agents for triage, drafting, summarization, and recommendation
- computer-use agents only as sidecars with clear guardrails

Build the system in layers so each layer can be upgraded without rewriting the whole company.

## Recommended Stack

## 1) Core Runtime

Use for:
- ERP-style signal ingestion
- DQMS registers
- action board generation
- daily operating loops

Current choice:
- existing `mark1_pilot` Python runtime
- structured JSON outputs
- Google Drive, Gmail, and Sheets connectors

Why:
- easiest to audit
- easiest to customize per client
- lowest risk for early production

### Upgrade now

- keep the existing `mark1_pilot` runtime as the orchestration shell
- add a canonical API layer with `FastAPI`
- add a canonical state layer with `SQLModel` + SQLite first, then PostgreSQL

Use this layer for:
- action items
- incidents
- CAPA records
- supplier risk records
- cash-control records
- client context metadata

Rule:
- Google Sheets remains a client-friendly input and review surface
- the database becomes the source of truth for workflow state

## 2) Data and Analytics Layer

Use for:
- spreadsheet-heavy client environments
- ad hoc analysis over many files
- data cleanup and normalization before LLM use

Recommended additions:
- `Polars`
- `DuckDB`
- `openpyxl`
- `pyxlsb`

Why:
- most early clients will still run on Excel and Google Sheets
- the system needs strong file-native ingestion before fancy dashboards matter
- this gives us fast data shaping without waiting for a full warehouse

## 3) Agent Orchestration Upgrade Path

Use when:
- workflows become long-running
- multiple agent states need to persist
- retries and checkpoints matter

Recommended direction:
- `LangGraph`

Role:
- durable workflow graph
- human approval nodes
- memory/state across steps

Use this layer for:
- multi-step supplier risk reviews
- incident-to-CAPA workflows
- director brief generation with approvals
- escalation flows with retries and checkpoints

Do not use it as:
- the primary datastore
- a replacement for explicit schemas and action records

## 4) LLM and Tool Layer

Use for:
- summarization
- classification
- extraction
- draft generation
- browser and retrieval sidecars

Recommended direction:
- `OpenAI Responses API` for tool-using agent calls
- `Pydantic` or `PydanticAI` for typed outputs and validation

Role:
- generate structured outputs against strict schemas
- use built-in or wrapped tools only where they help
- stay above the deterministic business workflow layer

Rule:
- every non-trivial agent output should validate into a typed model
- free-form prose alone should never be the source of business state

## 5) Queue and Job Layer

Use for:
- scheduled refreshes
- retries
- long-running connector jobs
- delayed follow-ups

Recommended direction now:
- `Cloud Run`
- `Cloud Scheduler`
- `Cloud Tasks`

Recommended direction later:
- `Temporal` when job count, retries, and durability become a bigger concern

Role:
- move automation out of one local machine
- make client loops repeatable and observable

## 6) Crew/Role-Based Agents

Use when:
- doing research
- proposal building
- outbound market mapping
- internal product ideation

Recommended direction:
- `CrewAI` or a similar crew-style layer

Role:
- research crew
- sales prep crew
- product review crew

Do not use as:
- source of truth for ERP state
- direct transactional write layer

## 7) Computer-Use Agents

Use when:
- browsing supplier portals
- collecting public market data
- checking web pages without APIs
- assisting internal operators

Recommended direction:
- `Playwright` or `Stagehand` for browser automation
- OpenAI computer-use tools or `OpenClaw` only as isolated sidecars

Guardrails:
- separate machine or sandbox
- separate credentials
- read-only where possible
- human review before business-critical writes

Rule:
- browser agents are helpers
- they are not the system of record

## 8) Secrets and Environment Management

Use for:
- OAuth secrets
- API keys
- client-specific credentials

Recommended direction:
- `Google Secret Manager`
- local `.secrets` only for development

Rule:
- no client credentials in repo-tracked files
- production agents should pull secrets from a managed secret store

## What To Add Now

### Immediate adds

- `FastAPI`
- `SQLModel` + SQLite
- `Polars`
- `DuckDB`
- `openpyxl`
- `pyxlsb`
- `Cloud Run`
- `Cloud Scheduler`
- `Cloud Tasks`
- `Google Secret Manager`

### Next adds

- `LangGraph`
- `PydanticAI`
- `Playwright` or `Stagehand`

### Later adds

- `Temporal`
- PostgreSQL / Cloud SQL
- vector search only when retrieval quality actually needs it

## Default Service Architecture

1. Gmail / Drive / Sheets / files feed into ingestion jobs.
2. Ingestion normalizes everything into typed records.
3. Records are written to the canonical action and control store.
4. Agents read scoped context from that store.
5. Agents return typed outputs only.
6. Approved outputs write back to review surfaces:
   - Google Sheets
   - director brief
   - dashboards
   - reply drafts

## Agent Equipment Standard

Every serious agent should have:

- a clear role
- a bounded task
- an allowed tool list
- a typed output schema
- a scoped retrieval pack
- a write policy
- a reviewer or approval rule
- a test set
- a quality metric

### Minimum equipment per agent

- `role`: what it owns
- `inputs`: which data it may read
- `tools`: exact tools it may call
- `output_schema`: strict shape
- `write_scope`: where it may write
- `approval_gate`: required or not
- `eval_set`: sample tasks and expected outputs

## Agent Effectiveness Rules

### 1. Schema first

Agents should output into strict models before they output polished prose.

### 2. Context packs, not giant memory

Give the agent the smallest relevant pack:
- client context
- owner map
- module taxonomy
- current records
- last review notes

### 3. Separate read agents from write agents

- read agents inspect and summarize
- write agents update state only after validation or approval

### 4. Force evidence links

Every action, incident, or risk item should point back to:
- email
- file
- sheet row
- source URL

### 5. Add eval loops early

Every important agent should be tested against:
- golden examples
- failure cases
- ambiguous cases

### 6. Track cost and latency

Each agent should have:
- timeout
- token budget
- fallback path

### 7. Review before expansion

Do not launch more agents until:
- the current one is measurable
- the output is useful
- the write path is safe

## Product Mapping

Lead Scraper Agent:
- browser + extraction sidecar
- deterministic scoring/export

News Brief Agent:
- fetch + summarize
- optional browser agent for difficult sources

Action Board Agent:
- deterministic parser + LLM cleanup

Supplier Risk Agent:
- Gmail/Drive ingest
- structured risk rules
- LLM summary on top

Quality CAPA Agent:
- structured incident/CAPA chain first
- LLM for summary and root-cause draft

SuperMega OS:
- structured system of record
- agent layer above it

## Operating Principle

Agents should improve the operating system.
They should not replace the operating system.
