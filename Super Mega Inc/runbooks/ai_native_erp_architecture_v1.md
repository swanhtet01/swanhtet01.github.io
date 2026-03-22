# AI-Native ERP Architecture (V1)

## Objective

Build one production-grade system for Yangon Tyre first, then replicate as a reusable product for similar companies.

This is not a chatbot-only product.  
This is an operations system with AI on top of structured business workflows.

## Product Shape

### Core modules

- Operations Pulse (daily plant and management update)
- Procurement and Supplier Control
- Sales and Collections Control
- Quality (DQMS incidents, CAPA, supplier nonconformance)
- Director Briefing and Decision Log

### System boundaries

- Source-of-truth records must be structured and queryable.
- AI can summarize, classify, and recommend, but cannot become the source-of-truth.
- Every action must map back to owner, due date, and evidence.

## Technical Architecture

### Layer 1: Connectors

- Google Drive (documents and file metadata)
- Gmail (signals, supplier threads, payment and quality communication)
- Google Sheets Input Center (daily structured updates)
- External feeds (news, market, policy watch)

### Layer 2: Ingestion and normalization

- Event workers parse and normalize raw inputs into standard records.
- Key entities:
  - `incident`
  - `capa_action`
  - `supplier_event`
  - `sales_event`
  - `collection_event`
  - `operation_update`
  - `decision_log`

### Layer 3: Operational data store

- Postgres is the control-plane database.
- Optional vector index stores embeddings for semantic retrieval.
- Document blobs stay in Drive/object storage; indexed references stay in Postgres.

### Layer 4: Workflow runtime

- Deterministic workflow engine for approvals/escalations/SLA tracking.
- Agent runtime for:
  - summarization
  - routing
  - anomaly explanation
  - draft outputs
- Human-in-the-loop checkpoints for sensitive actions.

### Layer 5: Application surfaces

- Internal operations dashboard (manager/director roles)
- Weekly report generator (PDF/Doc)
- Public showroom (`supermega.dev`) for lead conversion

## Multi-tenant rollout path

### Phase A (single-tenant)

- Yangon Tyre only
- one database schema
- harden workflows and operational metrics

### Phase B (controlled multi-tenant)

- add `tenant_id` to all core entities
- isolate credentials and connector configs per tenant
- profile-based setup bootstraps from shared templates

### Phase C (productized agency platform)

- package tiers with fixed module bundles
- onboarding scripts for new tenants
- standardized migration and handover playbooks

## Data contract for scale

Each module record should minimally include:

- `tenant_id`
- `record_id`
- `status`
- `owner`
- `due_date`
- `priority`
- `source_refs` (Drive/Gmail links)
- `created_at`
- `updated_at`

This contract enables reusable dashboards, analytics, and LLM prompts across clients.

## Website-to-delivery connection

The showroom is not just marketing. It must map directly into delivery:

- CTA -> lead intake
- lead intake -> qualification
- qualification -> discovery checklist
- discovery -> package-specific implementation plan
- implementation -> module-level outcomes and metrics

## Delivery metrics (must-have)

- incident-to-CAPA closure cycle time
- supplier response delay
- overdue payment follow-up cycle
- number of unresolved high-priority updates
- weekly execution completion rate by owner

## Tooling guidance

- LangGraph for durable workflow/agent state
- Postgres as operational backbone
- OpenClaw/Playwright as controlled computer-use fallback
- Vertex/managed services only where they reduce ops burden in production

## Non-negotiables

- No secrets in repo or screenshots
- Every automated recommendation must be evidence-linked
- No auto-closing incidents/CAPA without explicit owner validation
- Default to simple modules first; avoid premature full-ERP scope
