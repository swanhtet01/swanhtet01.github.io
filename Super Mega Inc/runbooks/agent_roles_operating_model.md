# SuperMega Agent Roles Operating Model

## Purpose

SuperMega should use small focused agents with clear roles.
Do not ask one giant agent to do everything.

## Core Roles

### 1. Product Strategist

Use for:
- deciding what products to ship
- simplifying the offer stack
- deciding free tool vs paid module vs flagship OS

Expected outputs:
- product ladder
- package scope
- positioning notes
- backlog priorities

### 2. Showroom Optimizer

Use for:
- website review
- conversion path cleanup
- copy simplification
- visual and interaction refinement

Expected outputs:
- page-level review
- concrete code/file targets
- CTA and flow recommendations

### 3. Client Ops Architect

Use for:
- client operating system design
- ERP replacement path
- DQMS and workflow mapping
- form and sheet structure

Expected outputs:
- data model
- workflow design
- action board structure
- manager/director views

### 4. Data and Integrations Engineer

Use for:
- Gmail, Drive, Sheets, API, and external source connectors
- ingestion reliability
- sync and publishing jobs

Expected outputs:
- connector fixes
- schema updates
- sync diagnostics
- deployment notes

### 5. Workflow Builder

Use for:
- turning design into live modules
- action board logic
- role dashboards
- write-back flows

Expected outputs:
- working code
- testable outputs
- implementation notes

### 6. Market Watch Researcher

Use for:
- market/news source review
- supplier and sector monitoring
- client vertical intelligence

Expected outputs:
- source pack
- watchlist
- structured summaries

### 7. Sales and Packaging Researcher

Use for:
- qualification criteria
- proposal structure
- tier definition
- case study shaping

Expected outputs:
- package definitions
- pilot scope templates
- proposal notes

## Working Rules

- each agent gets one bounded task
- each agent returns artifacts, not vague advice
- write ownership must be explicit
- source-of-truth state stays in the main runtime, not in a side agent
- risky writes require human approval

## Knowledge and Memory Rules

- every agent should read the latest relevant artifact before starting
- useful findings become runbooks, product docs, or code changes
- repeated lessons must move into shared templates, not stay inside one agent run
- the main runtime owns durable memory; side agents contribute notes and artifacts

## Review Cadence

- per task:
  - define scope
  - inspect sources
  - return artifact
  - review whether it improved the system
- daily:
  - product lab refresh
  - action board refresh
  - blocker review
- weekly:
  - product ladder review
  - framework review
  - template and SOP cleanup

## Default Execution Loop

1. Main rollout defines the target outcome.
2. Research agents inspect one narrow slice each.
3. Main rollout chooses what is worth implementing.
4. Builder agent or main rollout makes the change.
5. Machine reruns outputs.
6. Review agent checks whether the result is actually better.

## Mapping To Current System

Public side:
- Showroom Optimizer
- Product Strategist
- Sales and Packaging Researcher

Client pilot side:
- Client Ops Architect
- Data and Integrations Engineer
- Workflow Builder
- Market Watch Researcher

Core company side:
- Product Strategist
- Workflow Builder
- Sales and Packaging Researcher

## What To Avoid

- too many agents on overlapping write scopes
- letting research agents make product promises directly
- using browser/computer-use agents as the source of truth
- agent outputs with no owner, no file target, and no next step
