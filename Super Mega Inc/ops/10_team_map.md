# Team Map

SuperMega runs through functional pods, not vague personas.

## 1. Founder Control

Purpose:
- set direction
- approve releases
- approve pricing, contracts, and major tenant changes
- decide which problems become products

Primary surfaces:
- `/app/dev-desk`
- `/app/hq`
- `/app/company`

Owns:
- `00_company_scoreboard.md`
- `01_daily_founder_brief.md`
- `07_product_roadmap.md`
- `09_solution_catalog.md`

Equipped resources:
- founder brief
- runtime and tenant view
- decision journal
- release and incident visibility

Human seat:
- Swan

## 2. Revenue Pod

Purpose:
- capture inbound
- find and qualify opportunities
- clean lists
- move deals to the next action

Primary surfaces:
- `/app/deals`
- public contact flow

Owns:
- `03_sales_pipeline.csv`
- `08_case_study_program.csv`

Equipped resources:
- `Revenue Scout`
- `List Clerk`
- Gmail outreach draft flow
- contact submissions
- deal queue

Human seat:
- founder or sales operator

## 3. Delivery Pod

Purpose:
- provision starter packs
- translate client workflows into usable systems
- keep implementation state, approvals, and blockers visible

Primary surfaces:
- `/app/workflows`
- `/app/approvals`
- `/app/exceptions`

Owns:
- `04_delivery_tracker.csv`
- `06_release_log.csv`

Equipped resources:
- `Template Clerk`
- `Task Triage`
- task queue
- approval queue
- exception queue

Human seat:
- operator or delivery manager

## 4. Runtime Pod

Purpose:
- keep services, queues, schedulers, and loops healthy
- detect drift
- recover failed runs
- hold release guardrails

Primary surfaces:
- `/app/dev-desk`
- `/app/agents`

Owns:
- `02_operator_report.md`
- `05_incident_log.csv`

Equipped resources:
- `Ops Watch`
- queue processor
- scheduler state
- health checks
- release guard workflow

Human seat:
- founder or platform operator

## 5. Knowledge Pod

Purpose:
- turn messy updates, documents, and research into usable company state
- keep reusable templates improving across tenants

Primary surfaces:
- `/app/workflows`
- document and intake routes as they mature

Owns:
- product notes
- template improvement backlog
- structured operating context

Equipped resources:
- document intake
- research synthesis
- KPI and brief inputs
- template library

Human seat:
- founder plus delivery support

## Pod rules

- Every pod writes durable state, not loose chat.
- Every queue item has one owner and one next step.
- Cross-pod handoff happens through deals, tasks, approvals, incidents, briefs, or decisions.
- Founder Control is the only approval authority for pricing, releases, and major customer promises.
- If work exists only in chat, it does not exist.
