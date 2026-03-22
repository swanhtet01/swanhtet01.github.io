# Personal Pilot Architecture

## Positioning

This system is a **single-tenant personal intelligence and execution layer** for Swan.

It is not a manufacturing suite in v1.
It is not a generic DQMS product in v1.
It is not a plant manager replacement in v1.

The first real deployment is Swan's own data, tools, documents, and workflows. If this works for Swan, those patterns can later be extracted into reusable client templates.

## What V1 Should Actually Do

The pilot should solve a narrow set of high-value problems:

- search and retrieve across Swan's files and notes
- summarize and compare spreadsheets, PDFs, docs, and meeting materials
- maintain persistent memory about projects, contacts, priorities, and decisions
- generate daily and weekly briefs from new data
- draft emails, reports, plans, and presentations from grounded context
- run repeatable browser and desktop tasks only when APIs are missing
- support coding and workspace automation for the Mark 1 repo itself

## Recommended V1 Stack

### Core orchestration

Use **LangGraph** as the primary runtime.

Why:

- strong fit for stateful workflows
- built-in checkpointing, persistence, and human review patterns
- better fit than roleplay-heavy crews when the real problem is "ingest data, route work, keep state, recover cleanly"

### Workflow triggers

Use **n8n** for event wiring and operational automations.

Examples:

- new file added to a watched folder
- daily digest generation
- inbox triage
- scheduled research refresh

### Data and memory

Use:

- **PostgreSQL + pgvector** for memory and retrieval metadata
- object storage or local file mirrors for original documents
- a simple document ingestion pipeline for PDFs, Office files, markdown, email exports, and web captures

### Model layer

Use a routed model stack instead of one provider:

- **Gemini Flash** for high-volume classification, extraction, and cheap routing work
- **Claude Sonnet** for writing, planning, and coding review
- **OpenAI** optionally for specific tool use or computer-use workloads

Keep the router simple in v1. Do not build a complicated model marketplace before the data pipeline is stable.

## Vertex, ADK, LangGraph, CrewAI

### What to use now

Recommended default:

- **LangGraph** for the main product runtime
- **n8n** for triggers and glue
- **Vertex AI** only where Google-native deployment, grounding, or data access clearly helps

### When Vertex AI makes sense

Use **Vertex AI Agent Engine / ADK** if you want:

- managed deployment on Google Cloud
- strong Google ecosystem integration
- Google-native grounding and search
- future expansion into enterprise controls

### What not to make the foundation

Do **not** make **Agent Garden** or the **ADK Visual Builder** the foundation of the system.

Reason:

- Agent Garden is mainly a sample library
- the Visual Builder is experimental
- the no-code config path is useful for fast exploration, but the pilot needs a code-first system you can inspect, version, and repair

### CrewAI

CrewAI is acceptable when you want role-based delegation patterns.

For this pilot, it should be optional, not foundational.

Reason:

- the core problem is persistent knowledge plus reliable task execution
- a graph/state model is a better center of gravity than a "crew of personas"

If you want a specialist team later, add CrewAI around specific flows, not at the center of the whole architecture.

## Computer Use

Computer use should be a **fallback capability**, not the backbone.

Use it for:

- websites with no API
- repetitive form entry
- scraping or navigation that cannot be solved cleanly with direct HTTP or structured connectors
- regression testing for web flows

Do not use it first for:

- core knowledge ingestion
- critical accounting or banking actions
- high-trust logins unless a human approves the exact action

### Recommended computer-use approach

Layer it:

1. **Playwright** for deterministic browser flows you already understand.
2. **Stagehand** or **Browser Use** when you need AI-assisted browser actions.
3. **Anthropic or OpenAI computer-use models** only inside an isolated sandbox for harder visual workflows.

### Why this order matters

- deterministic automation is cheaper and easier to debug
- AI browser agents are flexible but less predictable
- computer-use models are still beta/preview and should not hold the keys to your entire life

## Proposed V1 Architecture

### Layer 1: Sources

- local folders
- OneDrive synced files
- Google Drive exports or direct connectors
- email exports / inbox feeds
- Git repos
- manually uploaded datasets

### Layer 2: Ingestion

- file watcher jobs
- parsers for PDF, Office, markdown, HTML, CSV, XLSX
- metadata extraction
- embeddings and chunking
- document classification

### Layer 3: Knowledge and memory

- normalized document catalog
- project memory
- people/contact memory
- task memory
- decision log

### Layer 4: Agent runtime

- LangGraph workers
- task router
- summarizer
- analyst
- researcher
- writer
- coder
- browser worker

## Multi-scale agent pattern

The pilot should not behave like a single vague assistant.

For unusual file estates such as Yangon Tyre, every serious workflow should produce both broad and granular views from the same evidence.

Recommended working pattern:

1. **Scout**
Maps the terrain, finds the relevant folders, email threads, time periods, and entities.

2. **Auditor**
Reads the file-level details, catches naming oddities, duplicated monthly books, and document-specific signals.

3. **Synthesizer**
Turns those fragments into a business read: what changed, what matters, what looks inconsistent, what needs follow-up.

4. **Planner**
Formats the output into next actions, open questions, and source-linked evidence packs.

### Required output levels

Every important brief should include:

- a director view for the big picture
- an operational readout for what is happening in the working data
- a granular evidence section with exact file or email references
- a planning section with next actions and gaps

This is especially important here because the file estate is messy, repetitive, and not structured like a clean product database.

### Layer 5: Delivery

- command center UI
- daily digest
- search/chat interface
- report generator
- task queue and notifications

## Practical Build Order

1. Build ingestion for Swan's existing folders and chosen cloud sources.
2. Stand up search plus grounded chat over that corpus.
3. Add recurring brief generation and task memory.
4. Add specialist agents for writing, research, and coding.
5. Add browser automation only for workflows that truly need it.
6. Add managed cloud deployment after local reliability is proven.

## Security

The API keys shown in the screenshots should be treated as compromised if they are real.

Immediate action:

- rotate every exposed key
- move secrets into Secret Manager, 1Password, or `.env` files that are never committed
- never store credentials in screenshots, docs, or demo assets

Computer-use agents must run in a sandbox with minimum privileges and isolated credentials.

## Decision Summary

If the question is "should we build this around Vertex Builder or LangChain/CrewAI?" the answer for this repo is:

- use **LangGraph as the main runtime**
- use **Vertex selectively**, not as the whole product definition
- use **CrewAI only when a crew pattern is clearly useful**
- use **computer use as a controlled fallback layer**

That is the most defensible v1 for a personal pilot built around Swan's own data.
