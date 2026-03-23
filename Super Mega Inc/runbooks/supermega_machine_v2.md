# SuperMega Machine V2

## Core Idea

SuperMega should run as one machine with three layers:

1. Public layer:
- `supermega.dev`
- simple product story
- live free tools
- contact and pilot capture

2. Pilot layer:
- one client workspace at a time
- current pilot is Yangon Tyre
- outputs must be owner-ready, not analyst-heavy

3. Core engine:
- ingest files, Gmail, sheets, and external watch
- normalize signals into actions
- publish role views and operating boards

## Product Stack

Public tools:
- Lead Finder
- News Brief
- Action Board

Paid modules:
- Supplier Watch
- Quality CAPA

Flagship:
- SuperMega OS

## Internal Runtime

Current local runtime:
- file mirror index
- Gmail connector
- Drive connector
- input-center sheets
- DQMS registers
- ERP file tracking
- action board
- product lab
- execution review

Current operator commands:
- `powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action daily -Config .\config.example.json`
- `powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action status -Config .\config.example.json`
- `powershell -ExecutionPolicy Bypass -File .\tools\run_solution.ps1 -Config .\config.example.json -Serve -BindHost 0.0.0.0 -Port 8787`

Related operating docs:
- `Super Mega Inc/runbooks/agent_stack_strategy.md`
- `Super Mega Inc/runbooks/agent_roles_operating_model.md`

## Design Rules

- Start from the company's current tools before forcing migration.
- Convert signals into actions with owner and due date.
- Keep managers inside one board, not ten reports.
- Allow human approval before writes to production records.
- Keep outputs evidence-linked.

## Recommended Technical Shape

Near-term:
- keep current Python CLI and static React showroom
- keep Google Drive and Sheets as rollout-friendly system of entry
- keep local mirror plus Drive index for evidence coverage

Next architecture step:
- use LangGraph as orchestration core for durable stateful workflows
- use CrewAI for bounded research, sales, and proposal sidecars
- use OpenClaw only for computer-use sidecars, not as the source of truth
- use LiteLLM for model routing and fallback
- use FastAPI for authenticated API surfaces

## What More Access Improves the System

Highest value:
- working Gmail OAuth token
- stable DNS and hosting control for `supermega.dev`
- Google Analytics or simple lead endpoint for website conversion events

For stronger ERP replacement:
- structured production plan vs actual
- stock on hand by plant and warehouse
- purchase orders and PI tracker
- payables and receivables tracker
- quality incident and CAPA closure evidence
- dispatch and delivery status

## What Staff Should Update

Keep manual input very small:
- Daily Ops Update
- Quality Incident Log
- Procurement Supplier Tracker
- Sales Market Signal

The goal is not to make staff do extra admin.
The goal is to capture the few fields that turn raw work into a usable action system.

## What Success Looks Like

- managers use Action Board daily
- directors read one brief, not scattered files
- supplier and quality issues move into tracked follow-up
- the same pilot setup becomes a template for the next client
