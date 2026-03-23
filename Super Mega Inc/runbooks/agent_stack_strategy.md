# SuperMega Agent Stack Strategy

## Core Rule

Do not put the whole company on top of one magic agent framework.

Use layers:
- deterministic workflow for critical business state
- LLM agents for triage, drafting, summarization, and recommendation
- computer-use agents only as sidecars with clear guardrails

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

## 2) Agent Orchestration Upgrade Path

Use when:
- workflows become long-running
- multiple agent states need to persist
- retries and checkpoints matter

Recommended direction:
- LangGraph or similar low-level orchestration layer

Role:
- durable workflow graph
- human approval nodes
- memory/state across steps

## 3) Crew/Role-Based Agents

Use when:
- doing research
- proposal building
- outbound market mapping
- internal product ideation

Recommended direction:
- CrewAI or similar crew-style layer

Role:
- research crew
- sales prep crew
- product review crew

Do not use as:
- source of truth for ERP state
- direct transactional write layer

## 4) Computer-Use Agents

Use when:
- browsing supplier portals
- collecting public market data
- checking web pages without APIs
- assisting internal operators

Recommended direction:
- OpenClaw or similar tools as isolated sidecars

Guardrails:
- separate machine or sandbox
- separate credentials
- read-only where possible
- human review before business-critical writes

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
