# SuperMega AI Agents Business Model

Date: 2026-07-01

Use this as the operating decision for SuperMega's AI-agent business. It resolves the free SaaS question, the paid agent business, the blue-ocean position, and the load-control rules.

## Decision

SuperMega is not a free SaaS company and not a generic AI agency.

SuperMega is an AI workcell company: we give business owners a plug-and-play room where messy source data becomes a useful screen, reviewed agent output, approval trail, and then a managed workflow that can keep improving.

Free tools are acquisition and source-normalization. Paid workcells are the business.

## One-Line Offer

Send one messy workflow. SuperMega turns it into one useful screen, one reviewed agent output, and one approval-gated workflow your team can use.

## Blue Ocean Position

The red ocean is:

- Legacy SaaS: fixed screens, per-seat tax, poor localization, slow fit.
- Agencies: custom builds, slow delivery, no reusable operating system.
- Automation shops: brittle Zapier/n8n flows without proof, QA, or owner controls.
- Agent demos: impressive but unsafe, no source evidence, no business handoff.

The blue ocean is:

- Client-specific work software that starts from one source sample.
- AI agents that prepare work but need approval before external sends, connector writes, payment actions, browser actions, or production changes.
- A reusable workcell operating system behind every custom client deployment.
- Free tools that convert anonymous pain into structured source packs and paid workcell opportunities.

## ERRC

### Eliminate

- Unlimited free AI runs.
- Selling vague "AI agents" without a buyer workflow.
- Building heavy traditional SaaS before proof.
- Raw autonomous external sending, billing, browser actions, or connector writes.
- Public fake case studies and demos presented as real customer proof.

### Reduce

- Product catalog complexity.
- Custom one-off engineering per client.
- Model calls for low-value free users.
- Human delivery labor by reusing workcell templates, source schemas, and proof gates.
- Support burden through client rooms, status ledgers, and approval packets.

### Raise

- Time-to-first-useful-output.
- Source trace and evidence quality.
- Owner trust, audit logs, and approval states.
- Localization for Myanmar, SEA, and regional business habits.
- Enterprise delivery quality: tenant boundaries, role controls, QA evidence, and deployment proof.

### Create

- Free source-to-screen tools that become qualified client source packs.
- Managed AI workcells sold after proof.
- A client room for source intake, proof review, payment proof, first-run acceptance, and handoff.
- A private operator cockpit that turns client actions into gated work.
- A workcell template library that improves from schemas and patterns, not from leaking raw client data.

## Free SaaS Role

Free mode is a feeder, not the business.

The free product should let a business owner upload or paste a small sample and get one useful artifact:

- Daily close summary from POS/export/chat.
- Inbox or chat lead follow-up list.
- Document extraction ledger.
- Inventory or supplier issue queue.
- Sales quote or proposal draft.
- Staff task cleanup board.

Free users should see value in under 5 minutes, but exports, repeated runs, team collaboration, connector sync, custom rules, private tenant setup, and managed operations should be paid.

## Free Load Control

Use these rules before promoting any free tool:

- Static page first; no model call until the user submits a clear source sample.
- Local parsing and deterministic rules before LLM calls.
- Small limits: file size, rows, monthly runs, and output length.
- Queue all free AI jobs; never run unlimited synchronous expensive jobs.
- Cache repeated runs by source hash.
- Use cheap models for free extraction and reserve stronger models for paid proof packs.
- Require account/contact for second run or export.
- Watermark free outputs as draft.
- No free connectors, browser automation, scheduled runs, or team seats.
- Abuse guard: rate limit by IP, email, workspace, and source hash.
- Clear retention: free samples expire unless the user converts to a paid workspace.

## Data Policy

The data moat is not "train on everyone's private data."

The moat is:

- Tenant memory: each paid client gets better inside their own workspace.
- Template memory: SuperMega improves schemas, checks, prompts, QA tests, and workflow patterns across clients.
- Market memory: aggregate metadata such as workflow category, requested output, missing fields, setup blockers, and conversion stage.

Rules:

- Do not use raw client data to train shared models without explicit written permission.
- Default to tenant-isolated storage for paid work.
- Free samples should be short-lived and minimized.
- Shared learning must use anonymized schemas, field maps, checklist patterns, and failure modes.
- Every paid workcell must show source trace, approval state, and what the agent is blocked from doing.

## Paid AI Agents Business

Sell workcells, not agents.

Each paid workcell includes:

- Source intake.
- Private client room.
- First useful screen.
- Agent draft or first production run.
- Approval policy.
- Operator proof packet.
- Deployment QA evidence.
- Managed improvement path.

The first four paid workcells should be:

1. Owner Sales Follow-Up Workcell
   - Buyer: owner-led SMBs using Messenger, Viber, WhatsApp, Gmail, Sheets, or manual call notes.
   - Output: hot leads, reply drafts, lost-deal reasons, next follow-up queue.
   - Paid expansion: connector sync, weekly pipeline brief, managed campaign experiments.

2. Admin Document Ledger Workcell
   - Buyer: finance/admin teams drowning in invoices, receipts, PDFs, forms, screenshots, and spreadsheets.
   - Output: clean ledger with source evidence, missing fields, confidence, and approval states.
   - Paid expansion: recurring document intake, reconciliation packet, export to accounting/POS/ERP.

3. Daily Close and Operations Workcell
   - Buyer: restaurants, shops, spas, clinics, and local chains.
   - Output: daily close board, cash variance, stock issues, staff follow-ups, owner summary.
   - Paid expansion: DeskPOS, manager approval flow, monthly improvement brief.

4. Factory and Inventory Issue Workcell
   - Buyer: factories, warehouses, distributors, maintenance-heavy businesses.
   - Output: issue queue with owner, machine/line, source evidence, CAPA/receiving decision, next action.
   - Paid expansion: Factory & Operations App, maintenance ledger, supplier quality lane.

## Sales Motion

Do not sell "AI agents" first. Sell the first useful output.

1. Free entry: "Paste one messy workflow or upload one sample."
2. First proof: "Here is the screen/queue/report your team can judge."
3. Paid setup: "We turn this into your private workcell."
4. Managed run: "We keep it running, reviewed, and improving."
5. Expansion: "Add the next workflow only after the first one proves value."

The close question is:

"If this output saves your team time or catches money leaking, do you want us to turn it into your private workflow room?"

## Enterprise Quality Bar

An AI workcell is enterprise-grade only if it has:

- Source scope.
- Tenant boundary.
- Role and permission model.
- Run ledger.
- Approval gates.
- Human-readable proof packet.
- Error state and retry policy.
- Cost cap.
- Data retention policy.
- Deployment evidence.
- Customer-success renewal reason.

No workcell is allowed to claim real recurring revenue until payment proof and renewal proof are recorded.

## Reference Architecture

```mermaid
flowchart LR
  A["Free source-to-screen tool"] --> B["Source pack"]
  B --> C["Client room"]
  C --> D["Operator cockpit"]
  D --> E["First useful screen"]
  E --> F["Client proof review"]
  F --> G["Paid private workcell"]
  G --> H["First production run"]
  H --> I["Client first-run acceptance"]
  I --> J["Owner approval"]
  J --> K["Connector policy"]
  K --> L["Managed operations"]
  L --> M["Retainer renewal proof"]
```

Runtime choices:

- Vercel/Next-style public surface for free tools, client rooms, and operator UI.
- Vercel Blob or object storage for low-friction queue fallback and proof packets.
- Postgres for the canonical ledger when available.
- OpenAI Agents SDK for Python-first multi-agent runs, tracing, handoffs, and guardrails.
- LangGraph when durable pause/resume and human-in-the-loop state are needed.
- n8n queue mode for connector-heavy automations that need worker scaling.
- Vercel AI SDK for TypeScript app agents and UI-side streaming/tool patterns.
- Langfuse or equivalent tracing/evals when paid workcells need quality monitoring.

## What To Build Next

1. Make the free source-to-screen entry work for one workcell: Document Ledger or Daily Close.
2. Route every free run into the same source-pack and client-room pipeline.
3. Add cost counters and quotas before opening free traffic.
4. Convert one accepted first-run into an owner-approved production policy.
5. Package the paid workcell as the default sales offer, with pricing read from `pricing.json`.
6. Build one customer-success renewal proof packet so recurring revenue has a visible job.

## Operating Rule

Free SaaS creates demand and normalized source packs. AI workcells create revenue. Managed operations create retention.
