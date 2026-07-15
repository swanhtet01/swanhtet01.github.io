# Agent Company Registry

Date: 2026-05-21

Status: ready

Thesis: SuperMega sells Custom Workflow App, Factory Operations App, Restaurant POS + Inventory, and shared Source Intake as simple business apps; private pilots stay private until source evidence, role access, and UAT prove them.

## Summary

- Registered units: 7
- Public offers: 3
- Private pilots: 1
- Internal machines: 2
- Private client proofs: 1
- Sell-now units: 3
- Build-next units: 2
- Workcells: 5
- Framework lanes: 9
- Adopt-now frameworks: 4
- Policies: 4

## Public Offers

### Factory Operations App

Status: sell-now

Buyer: Factory owner, COO, plant manager, facilities lead, distributor operator

First workflow: One factory issue, meter reading, receiving gap, maintenance risk, or manager decision becomes one daily control screen.

Modules: Factory State, Meter Readings, CAPA Review, Maintenance Risk, Manager Action Board

Agents: Source Cartographer, Telemetry Analyst, Anomaly Reviewer, Approval Guard

Gate: No hardware, meter, writeback, or customer-facing claim without source evidence and owner approval.

Routes: /products/factory-operations / /app/factory-operations

### Custom Workflow App

Status: sell-now

Buyer: Owner-led business with one painful manual workflow

First workflow: Send one file, sheet, screenshot, email thread, or Drive folder; receive one useful screen and action queue.

Modules: Workflow Intake, Source Table, Task Queue, Proof Pack, Owner Brief

Agents: Intake Analyst, Data Cleaner, Workflow Mapper, Proof Writer

Gate: No outbound, billing, production deploy, or external writeback without founder approval.

Routes: /products/custom-workflow / /app/custom-workflow

### Restaurant POS + Inventory

Status: pilot

Buyer: Restaurant, cafe, retail food, or service counter owner

First workflow: Menu/items, orders, payment proof, stock notes, shift handover, and daily close stay on one screen.

Modules: Menu Items, Orders and Payments, Payment Proof, Stock Notes, Daily Close

Agents: Menu Clerk, Shift Reviewer, Owner Brief Writer

Gate: Payment claims, QR ordering, loyalty, and accounting export wait for review and reconciliation checks.

Routes: /products/restaurant-pos-menu-inventory / /app/restaurant-pos

## Private Pilots

### SuperMega Operations Ledger

Status: pilot

Buyer: Factory, distributor, restaurant group, service business, operator-led SME

First workflow: Start with inventory, purchase, service, or daily-close control before claiming full ERP replacement.

Gate: Transaction-grade modules require reconciliation, role permissions, audit trail, and customer UAT sign-off.

Routes: /products / /app/erp

## Internal Machines

### Founder Growth Control Loop

Status: build-next

First workflow: Approve one post, send or log outreach, capture reply, attach lead, request proof, and schedule follow-up.

Modules: Daily Growth Cockpit, Approval Queue, Published URL Log, Reply Ledger, Proof Request

Gate: No social post, outbound email, DM, ad, or public claim without founder approval.

Routes: /proof / /app/revenue

### SuperMega Machine

Status: build-next

First workflow: One internal control surface that manages products, workcells, cloud runs, approvals, proof, and growth.

Modules: Agent Company Registry, Cloud Execution Gateway, Founder Growth Loop, Build Queue, Proof Ledger

Gate: No external actions from the machine without policy, evidence, and human approval.

Routes: /app/founder-machine / /app/workforce

## Private Client Proofs

### Yangon Tyre private proof

Host: ytf.supermega.dev

Purpose: Private factory operations proof for manager workspaces, KPI cards, action boards, and ERP handoff.

Rule: Do not list YTF as a public product. Reuse anonymized patterns only after approval.

Reusable template: Factory Operations App private pilot template

## Workcells

### Source Intelligence Workcell

Mission: Turn Drive, Sheets, files, screenshots, emails, telemetry, and exports into source contracts.

Agents: Source Cartographer, Document Parser, Record Cleaner, Freshness Watcher

Tools: Google Drive, Gmail, Sheets, PDF/OCR, LlamaIndex, n8n read-only workflows

Allowed: read approved sources, stage extracted records, score quality, draft source maps

Blocked: delete source files, overwrite production records, share client data externally

Evidence: source id, file path, extracted row count, freshness timestamp, review owner

### Factory Operations App Builders

Mission: Convert source contracts into role screens, KPIs, and manager action queues.

Agents: Factory Operations App Architect, KPI Analyst, Workflow Mapper, UX Builder

Tools: Factory Operations App, Portal Factory, Vercel preview, Codex build lane

Allowed: create module briefs, draft routes, stage UI patches, run audits

Blocked: deploy production, claim live customer result without proof, skip QA

Evidence: changed files, route link, audit output, before/after screenshot, rollback note

### Operations Ledger Clerks

Mission: Build lightweight ERP/POS/CRM modules from proven workflows instead of cloning giant suites.

Agents: Inventory Clerk, Daily Close Clerk, Purchase Reviewer, CRM Follow-up Agent

Tools: ERP contract, POS module, CRM queue, Neon/Supabase, CSV import

Allowed: stage transactions, reconcile records, draft exceptions, prepare exports

Blocked: post financial transaction, change inventory balance, send invoice, modify customer system

Evidence: source row, diff, approval state, reconciliation check, rollback path

### Cloud Execution Guard

Mission: Run cloud agent work through policy, approvals, evidence, and blocked action handling.

Agents: Policy Gate, Run Ledger Clerk, Queue Processor, Security Reviewer

Tools: Vercel Workflow, Cloud Tasks, EnterpriseAgentRun, OpenAI Agents SDK, Cloudflare Agents

Allowed: claim queued run, dry-run policy, execute internal-ledger work, record blocked action

Blocked: external writeback, credentialed browser action, billing activation, production deploy

Evidence: run id, policy decision, tool scope, risk class, approval record

### Growth and Proof Workcell

Mission: Convert platform work into approved offers, proof packs, outreach drafts, replies, and expansion proposals.

Agents: Growth Operator, Proof Writer, ICP Analyst, Customer Success Analyst

Tools: Sales Desk, Lead Pipeline, Marketing queue, Proof packs, LinkedIn/Facebook drafts

Allowed: draft content, score leads, prepare proof packs, log replies

Blocked: publish post, send outreach, make client-facing claim, activate payment link

Evidence: approved text, published URL, reply count, lead id, proof request

## Framework Stack

- adopt-now: OpenAI Agents SDK - Primary coded agent runtime (https://developers.openai.com/api/docs/guides/agents)
- adopt-now: Vercel Workflow + AI SDK - Durable app-agent orchestration (https://vercel.com/docs/workflow)
- prototype: Cloudflare Agents - Stateful edge agent rooms (https://developers.cloudflare.com/agents/api-reference/agents-api/)
- adopt-now: LangGraph - Deterministic business workflow graphs (https://www.langchain.com/agents)
- adopt-now: LlamaIndex - Knowledge and retrieval layer (https://docs.llamaindex.ai/)
- prototype: n8n - Connector workflow workbench (https://github.com/n8n-io/n8n)
- watch: OpenHands - Software-agent benchmark and optional builder lane (https://github.com/OpenHands/OpenHands)
- watch: Microsoft Agent Framework / AutoGen lineage - Enterprise multi-agent orchestration comparison (https://github.com/microsoft/autogen)
- prototype: CrewAI - Role-crew experimentation lane (https://github.com/crewAIInc/crewAI)

## Policies

- Agents can prepare work, but cannot perform external side effects without approval.
- Every operational answer must point to the source contract it used.
- Do not build random SaaS clones; build reusable modules from proven workflows.
- Do not claim autonomous cloud workforce until queue, policy, evidence, and approval gates are live.

## Next Build Order

- Build SuperMega Machine as the internal operating control plane.
- Build Cloud Agent Execution Gateway and dry-run policy smoke.
- Build Founder Growth Control Loop with traction logging.
- Keep YTF on ytf.supermega.dev as a private proof and convert only anonymized lessons into generic product modules.
