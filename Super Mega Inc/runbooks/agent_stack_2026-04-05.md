# SuperMega agent stack - April 5, 2026

## Decision

SuperMega should stop adding random agent frameworks in parallel.

The working stack is:

- OpenAI Responses API
- OpenAI Agents SDK
- Cloud Run
- Cloud SQL Postgres
- Cloud Tasks
- Cloud Scheduler
- Browser Use as a browser sidecar
- PostHog
- Sentry
- Resend
- Stripe

## Why this stack

### Core reasoning and tool use

Use OpenAI Responses API and Agents SDK as the main agent layer.

This is the best fit because:

- it is the current OpenAI direction for new agentic work
- it supports tools, MCP, tracing, guardrails, handoffs, and structured outputs
- it fits the existing FastAPI and Cloud Run app without introducing a second main runtime

### Durable execution

Use Cloud Tasks and Cloud Scheduler instead of adding a separate orchestration platform first.

This is the best fit because:

- SuperMega already runs on GCP
- the current missing capability is durable queued work, not more abstractions
- Cloud Tasks plus Postgres is enough for the first real agent loops

### Data and state

Use Cloud SQL Postgres as the source of truth.

This is the best fit because:

- the live Cloud Run app is already attached to Cloud SQL
- browser-local and SQLite fallback paths should stop being the default
- agent runs, task runs, approvals, and briefs need durable shared state

### Browser automation

Use Browser Use only as a sidecar worker for websites without APIs.

This is the best fit because:

- browser automation should not sit in the main request path
- it is useful for enrichment, vendor portals, and edge scraping
- OpenClaw-style desktop/browser agents are fine as experiments, but they should not become the main production runtime

### Typed outputs

Use PydanticAI selectively for high-value typed extraction workflows.

Do not make it the main orchestration framework yet.

### Frameworks to defer

Defer LangGraph for now.

Only add it if SuperMega reaches:

- multi-day paused workflows
- explicit human approval in the middle of long-running graphs
- branch-heavy agent flows that are awkward in queue plus database form

## Internal AI team

### Revenue Scout

Purpose:

- run saved lead hunts
- qualify companies
- recommend the right SuperMega offer
- draft first outreach

Inputs:

- search query
- kept companies
- company notes

Outputs:

- saved companies
- follow-up tasks
- outreach draft

### List Clerk

Purpose:

- normalize imported company lists
- dedupe rows
- map company records into the shared pipeline

Inputs:

- CSV
- pasted lists
- saved companies

Outputs:

- clean saved company rows
- stage and owner defaults

### Task Triage

Purpose:

- turn messy updates into daily tasks
- assign owner, due, and type
- route receiving and ops issues into the queue

Inputs:

- team updates
- issue logs
- receiving notes

Outputs:

- daily tasks
- receiving follow-up
- exception candidates

### Founder Brief

Purpose:

- summarize daily state
- show what moved, what stalled, what is risky

Inputs:

- queue
- approvals
- exceptions
- pipeline

Outputs:

- one brief
- top priorities
- follow-up prompts

### Release Guard

Purpose:

- run build, lint, smoke, and live checks
- stop broken deploys from drifting into production unnoticed

Inputs:

- repo state
- workflow runs
- app health

Outputs:

- release pass/fail
- exact blocker

## Concrete next integrations

1. Add an `agent_runs` table in Postgres.
2. Add Cloud Tasks queues:
   - `agent-default`
   - `agent-browser`
   - `agent-priority`
3. Add Cloud Scheduler jobs:
   - saved lead hunt run
   - founder brief
   - stale queue review
4. Add backend Sentry and production PostHog wiring.
5. Move shared public save to Postgres by default.
6. Require `company + work email` on first shared save.

## Current product focus

Public tools:

- Find Companies
- Saved Companies
- Daily Tasks

Paid offers:

- Sales Setup
- Operations Setup

Everything else stays behind the private app until it is as clear as the public loop.

## References

- OpenAI Responses API: https://developers.openai.com/api/docs/guides/migrate-to-responses
- OpenAI Agents SDK: https://developers.openai.com/api/docs/guides/agents-sdk
- Agents SDK docs: https://openai.github.io/openai-agents-python/
- Cloud Tasks: https://docs.cloud.google.com/tasks/docs
- Cloud Scheduler: https://docs.cloud.google.com/scheduler/docs/overview
- LangGraph: https://docs.langchain.com/oss/python/langgraph/overview
- PydanticAI: https://ai.pydantic.dev/
- Browser Use: https://docs.browser-use.com/
