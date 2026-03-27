# Enterprise Upgrade Review

Date: 2026-03-27

## What the stack already has

- Frontend: React 19, Vite 7, Tailwind 4
- Backend: FastAPI
- Data tools: Polars, DuckDB, OpenPyXL, PyPDF
- State/persistence: SQLite today
- Workflow framework available: LangGraph
- Google connectors: Gmail, Drive, Sheets-adjacent exports

## Latest tool decisions worth using now

### 1. OpenAI Responses API as the default LLM runtime

Use this for new LLM-backed product flows instead of designing around older chat-only patterns.

Why:
- OpenAI recommends the Responses API for new projects and says the Agents SDK works with it.
- Good fit for lead qualification, document analysis, briefing, and structured workflow steps.

Use for:
- lead qualification
- outreach draft generation
- document intake classification
- director brief synthesis

### 2. LangGraph for multi-step workflow orchestration

LangGraph is the best fit for SuperMega where workflows are stateful and often need:
- branching
- retries
- human review
- persistence
- handoff between product steps

Use for:
- Lead Finder -> offer builder -> pipeline save -> outreach prep
- Ops Intake -> exception detection -> action creation
- Receiving -> variance -> owner assignment -> escalation

### 3. PydanticAI for typed agent outputs

Use this once we start using real LLM-backed agent steps in production.

Why:
- It keeps outputs typed and easier to test.
- It fits the need for structured records instead of free-form prose.

Use for:
- typed lead packs
- typed issue classification
- typed risk scoring payloads
- typed director brief blocks

### 4. FastAPI + SQLModel + Postgres for enterprise state

FastAPI is already the right app/API layer. The current weakness is persistence, not the web framework.

Next move:
- keep FastAPI
- migrate state from raw sqlite tables to a clearer SQLModel/Postgres path
- use SQLite only for local/dev

### 5. Cloud Run + Cloud Tasks + Cloud Scheduler + Secret Manager

This is the best practical Google Cloud operating stack for SuperMega right now.

Use for:
- public app hosting
- background pipeline cycles
- scheduled refresh jobs
- secret storage

### 6. Stagehand as a browser sidecar only

Use computer/browser automation only as a helper for browser tasks.

Do not make it the core product runtime.

Use for:
- lead capture from public websites
- data collection from sources without APIs
- browser-side workflow helpers

## What to implement next

### Now

- Simplify the public site into:
  - Product
  - Use cases
  - Lead Finder
  - Book demo
- Keep the real work in the private app:
  - `/app`
  - `/app/actions`
  - `/app/intake`
  - `/app/receiving`
  - `/app/inventory`

### Next

- Public backend hosting
- Lead pipeline communication activity UI
- booking/calendar integration
- workspace/tenant model

### After that

- LangGraph workflow for lead-to-pilot and ops exception handling
- SQLModel + Postgres migration
- role-specific app surfaces for:
  - owner/director
  - manager
  - operator

## What not to do

- Do not keep exposing internal app surfaces as public marketing pages.
- Do not keep adding static product copy without strengthening the saved workflows.
- Do not treat browser/computer use as the source of truth.
- Do not market SuperMega as a giant ERP replacement first.

## SuperMega product rule

Start with:
- Action OS

Then add:
- Supplier Watch
- Receiving Control
- Inventory Pulse
- Cash Watch

That is the clearest enterprise path.

## Primary sources

- OpenAI Responses migration guide: https://developers.openai.com/api/docs/guides/migrate-to-responses
- OpenAI Agents SDK: https://developers.openai.com/api/docs/guides/agents-sdk
- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- PydanticAI docs: https://ai.pydantic.dev/
- FastAPI security: https://fastapi.tiangolo.com/tutorial/security/first-steps/
- SQLModel with FastAPI: https://sqlmodel.tiangolo.com/tutorial/fastapi/
- Cloud Run overview: https://cloud.google.com/run/docs/overview/what-is-cloud-run
- Cloud Tasks docs: https://cloud.google.com/tasks/docs
- Cloud Scheduler docs: https://cloud.google.com/scheduler/docs
- Secret Manager docs: https://cloud.google.com/secret-manager/docs
- Stagehand docs: https://docs.stagehand.dev/
