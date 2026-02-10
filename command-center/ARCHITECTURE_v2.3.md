# SuperMega Mark 1 Machine — Architecture Document

**Version:** 2.3.0  
**Author:** Swan Htet, Founder & CEO, supermega.dev  
**Date:** February 10, 2026  
**Classification:** Internal — Core Infrastructure  
**Status:** INITIALIZING → OPERATIONAL  
**Identity:** The New Workspace — Manus Replacement

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The New Workspace — Why Mark 1 Replaces Manus](#2-the-new-workspace)
3. [Design Philosophy](#3-design-philosophy)
4. [The LLM-on-LLM Paradigm](#4-the-llm-on-llm-paradigm)
5. [Workspace Types Catalog](#5-workspace-types-catalog)
6. [System Architecture Overview](#6-system-architecture-overview)
7. [Layer 1: Presentation Layer](#7-layer-1-presentation-layer)
8. [Layer 2: Agent Orchestration Layer](#8-layer-2-agent-orchestration-layer)
9. [Layer 3: Core Services Layer](#9-layer-3-core-services-layer)
10. [Layer 4: Infrastructure Layer](#10-layer-4-infrastructure-layer)
11. [Layer 5: Security & Observability Layer](#11-layer-5-security--observability-layer)
12. [Agent Fleet Specification](#12-agent-fleet-specification)
13. [Autonomous Operation Loop](#13-autonomous-operation-loop)
14. [Self-Updating Architecture](#14-self-updating-architecture)
15. [Data Flow Architecture](#15-data-flow-architecture)
16. [n8n Workflow Catalog](#16-n8n-workflow-catalog)
17. [Deployment Blueprint](#17-deployment-blueprint)
18. [Scaling Strategy](#18-scaling-strategy)
19. [Cost Architecture](#19-cost-architecture)
20. [Handover from Manus](#20-handover-from-manus)
21. [Roadmap & Milestones](#21-roadmap--milestones)
22. [Standards & Compliance](#22-standards--compliance)
23. [Computer Use Layer — The Core Manus Capability](#23-computer-use-layer)
24. [Agent Team Coordination](#24-agent-team-coordination)
25. [Browser Automation & Web Agents](#25-browser-automation--web-agents)
26. [Comprehensive Agent Toolkit (60+ Tools)](#26-comprehensive-agent-toolkit)
27. [Appendix: Technology Stack Reference](#27-appendix-technology-stack-reference)

---

## 1. Executive Summary

The **SuperMega Mark 1 Machine** is Swan Htet's new workspace — the definitive replacement for Manus. It is an autonomous, AI-native operating system designed to run 24/7, where LLMs use LLMs, agents build agents, and the entire system continuously rewrites and improves itself through vibe coding at maximum intensity.

The Mark 1 is not a single application. It is a **machine** — an interconnected system of 8 specialized AI agents, cloud infrastructure, automation workflows, a command center dashboard, and multiple workspace types that together form a self-sustaining, self-evolving digital workforce. The machine senses its environment (email, files, APIs, metrics), analyzes signals, makes decisions, executes tasks, learns from outcomes, and then upgrades its own capabilities based on what it learned.

This is the workspace that replaces Manus. Where Manus is a session-based tool that requires human initiation, the Mark 1 is a persistent, always-on machine that operates autonomously. It does not wait to be asked. It senses, decides, and acts. It spawns new workspace types as needed — a coding workspace, a research workspace, a data workspace, a communications workspace — each optimized for its domain, each accessible to the AI agents that need them.

This document serves as the definitive architectural blueprint. Every component, every integration, every workflow is documented here. When the Mark 1 runs, it runs from this specification.

**v2.3 Additions:** Computer Use Layer (the core Manus capability), Agent Team Coordination (6 orchestration patterns), Browser Automation stack (Browser-Use, Stagehand, Playwright), and expanded toolkit from 40 to 60+ tools including OpenManus, Magentic-One, MetaGPT, Temporal, Codex CLI, and more.

**Key Metrics at Launch:**

| Metric | Value |
|--------|-------|
| Specialized Agents | 8 |
| Agent Frameworks | CrewAI, LangGraph, Google ADK, n8n, Custom |
| Cloud Region | GCP asia-southeast1 (Singapore) ||
| Automation Workflows | 12 templates ready |
| GitHub Actions Pipelines | 3 active (Heartbeat, Health Check, Weekly Digest) |
| Monitored Google Drive Folders | 7+ |
| Priority Email Domains | 3 domains, 2 named senders |
| Target Uptime | 99.95% |
| Workspace Types | 8 specialized environments |
| Self-Update Cycle | Continuous (every 6 hours) |
| LLM Layers | 3 (Meta-LLM → Orchestrator-LLM → Worker-LLM) |

---

## 2. The New Workspace — Why Mark 1 Replaces Manus

Manus is powerful. It can research, code, deploy, automate, and manage complex multi-step tasks. But Manus has fundamental limitations that the Mark 1 is designed to overcome:

| Limitation of Manus | How Mark 1 Solves It |
|---------------------|---------------------|
| Session-based — stops when you close the tab | Always-on — runs 24/7 on GCP Cloud Run, GitHub Actions, n8n |
| Requires human initiation for every task | Autonomous — senses signals and acts without prompting |
| No persistent memory between sessions | Knowledge Base with pgvector — remembers everything forever |
| Cannot spawn its own sub-agents | CEO Proxy spawns and manages 8+ specialist agents |
| Limited to one workspace at a time | Multiple concurrent workspace types running in parallel |
| Cannot modify its own code or architecture | Self-updating — agents rewrite their own configs and workflows |
| No native integration with your GCP/Google/GitHub | Deep integration — lives inside your infrastructure |
| Cannot vibe-code autonomously | LLM-on-LLM paradigm — models prompt models to generate code |

The Mark 1 is what Manus would be if Manus could run forever, own its own infrastructure, remember everything, and improve itself. Manus builds the Mark 1. Then the Mark 1 runs independently. Manus becomes the occasional architect for major upgrades; the Mark 1 is the permanent workforce.

> **The transition is not a migration. It is an evolution.** The Mark 1 inherits everything Manus knows about Swan's business, codifies it into persistent knowledge, and then operates on that knowledge autonomously.

---

## 3. Design Philosophy

The Mark 1 Machine is built on six non-negotiable principles:

### 3.1 Autonomous

Every component must operate without human intervention under normal conditions. Agents self-heal, workflows self-trigger, infrastructure self-scales. Human involvement is reserved for strategic decisions, not operational tasks. The machine runs while Swan sleeps.

### 3.2 Adaptive

The system learns from every interaction. Agent performance data feeds back into optimization loops. Workflow efficiency is measured and improved automatically. The machine that runs tomorrow is better than the machine that runs today.

### 3.3 Infinitely Scaling

No component is a bottleneck. Every service is containerized. Every agent can be replicated. Every workflow can be parallelized. Adding capacity is a configuration change, not an architecture change. The machine grows with the business.

### 3.4 Independent

The Mark 1 runs outside of Manus. It lives on Swan's own GCP infrastructure, GitHub repositories, and Google Workspace. Manus is the architect and builder; the Mark 1 is the building that stands on its own. Full data sovereignty, full operational independence.

### 3.5 Self-Updating

The Mark 1 does not wait for a human to update it. It continuously monitors its own performance, identifies bottlenecks, and rewrites its own configurations, workflows, and even agent prompts. Every 6 hours, the self-update cycle runs: analyze metrics, identify improvements, generate code changes, test in staging, deploy to production. The machine that runs at midnight is different from the machine that ran at noon — it is better.

### 3.6 Vibe-Coded at Maximum

The Mark 1 embraces vibe coding as a core methodology. Instead of rigid, hand-written specifications, agents describe what they need in natural language and LLMs generate the implementation. This is not sloppy — it is hyper-productive. The LLM-on-LLM paradigm means that a meta-LLM reviews and improves the code that worker-LLMs generate. Quality emerges from iteration speed, not from upfront specification.

> **Core Mantra:** Systems for AI agents, by AI agents, with AI agents. LLMs using LLMs. Workspaces spawning workspaces. The machine builds itself.

---

## 4. The LLM-on-LLM Paradigm

The most disruptive architectural decision in the Mark 1 is the **LLM-on-LLM paradigm** — a three-layer hierarchy where language models orchestrate, supervise, and execute through other language models.

### 4.1 The Three Layers

```
┌─────────────────────────────────────────────────┐
│  META-LLM (Layer 3)                             │
│  Claude Opus / Gemini Pro                       │
│  Role: Strategic reasoning, architecture review,│
│        self-improvement decisions, prompt        │
│        engineering for lower layers              │
│  Frequency: Every 6 hours + on-demand           │
├─────────────────────────────────────────────────┤
│  ORCHESTRATOR-LLM (Layer 2)                     │
│  Claude Sonnet / GPT-4o                         │
│  Role: Task decomposition, agent coordination,  │
│        quality review, error correction          │
│  Frequency: Continuous                          │
├─────────────────────────────────────────────────┤
│  WORKER-LLM (Layer 1)                           │
│  Gemini Flash / Claude Haiku / Local models     │
│  Role: Code generation, data processing,        │
│        classification, summarization             │
│  Frequency: High-volume, low-latency            │
└─────────────────────────────────────────────────┘
```

**How it works in practice:** When the Coder Agent needs to build a new feature, the Worker-LLM (Gemini Flash) generates the initial code. The Orchestrator-LLM (Claude Sonnet) reviews it for correctness, security, and style. If the feature is architecturally significant, the Meta-LLM (Claude Opus) evaluates whether it aligns with the overall system design and suggests structural improvements. The result is code that is generated fast, reviewed thoroughly, and architecturally sound — all without human involvement.

### 4.2 Vibe Coding Protocol

Vibe coding in the Mark 1 is not ad-hoc. It follows a structured protocol:

1. **Intent Declaration** — An agent or the CEO Proxy describes what is needed in natural language
2. **Context Assembly** — The Knowledge Base provides relevant code, docs, and past decisions via RAG
3. **Generation** — Worker-LLM generates the implementation with full context
4. **Review** — Orchestrator-LLM reviews for correctness, tests, and edge cases
5. **Integration** — Code is committed, tested in CI, and deployed if passing
6. **Learning** — The outcome (success/failure/performance) is logged for future improvement

This protocol applies to everything: new agent configurations, n8n workflow modifications, dashboard updates, infrastructure changes, and even updates to this architecture document itself.

### 4.3 Prompt Engineering as Infrastructure

In the Mark 1, prompts are not throwaway strings. They are versioned, tested, and deployed like code. Every agent has a prompt repository stored in the Knowledge Base. The Meta-LLM periodically reviews and optimizes these prompts based on agent performance data. A prompt that produces 95% accuracy today will be rewritten to produce 97% accuracy tomorrow.

| Prompt Category | Storage | Review Cycle | Owner |
|----------------|---------|-------------|-------|
| Agent system prompts | pgvector + Git | Weekly (Meta-LLM) | CEO Proxy |
| Workflow templates | n8n + Git | On performance drop | DevOps Agent |
| Code generation prompts | Git | Per-task (Orchestrator) | Coder Agent |
| Classification prompts | pgvector | Daily (Meta-LLM) | Data Analyst |
| Communication templates | Git | Monthly | Comms Agent |

---

## 5. Workspace Types Catalog

The Mark 1 is not a single workspace. It is a **workspace factory** — a system that spawns, manages, and optimizes multiple specialized workspace types. Each workspace is a containerized environment with its own tools, LLM configurations, and data access patterns. Agents move between workspaces as their tasks require.

### 5.1 Workspace Architecture

Every workspace follows a standard template:

```json
{
  "workspace_id": "ws-coding-01",
  "type": "coding",
  "status": "active",
  "container": "supermega/ws-coding:latest",
  "llm_config": {
    "primary": "gemini-flash",
    "reviewer": "claude-sonnet",
    "architect": "claude-opus"
  },
  "tools": ["github", "docker", "terminal", "browser", "file_system"],
  "data_access": ["knowledge_base", "git_repos", "npm_registry"],
  "auto_scale": true,
  "max_concurrent_agents": 4
}
```

### 5.2 The Eight Workspace Types

| # | Workspace Type | Purpose | Primary Agents | Key Tools |
|---|---------------|---------|---------------|----------|
| 1 | **Coding Workspace** | Software development, code review, testing, deployment | Coder, DevOps | GitHub, Docker, Terminal, CI/CD, npm |
| 2 | **Research Workspace** | Deep research, competitive analysis, technology scouting | Data Analyst, Content | Web browser, academic APIs, RAG, document processing |
| 3 | **Data Workspace** | ETL pipelines, analytics, ML training, visualization | Data Analyst | Pandas, SQL, Jupyter, S3, Vertex AI |
| 4 | **Communications Workspace** | Email management, calendar, notifications, outreach | Communications, Lead Gen | Gmail API, Calendar API, CRM, templates |
| 5 | **ERP Workspace** | Business operations, inventory, manufacturing, billing | ERP, Finance | Odoo API, PostgreSQL, reporting tools |
| 6 | **Creative Workspace** | Content creation, design, social media, video scripts | Content Creator | Image gen APIs, social APIs, design tools |
| 7 | **Infrastructure Workspace** | GCP management, monitoring, security, cost optimization | DevOps | GCP SDK, Terraform, Prometheus, Grafana |
| 8 | **Meta Workspace** | Self-improvement, architecture review, prompt optimization | CEO Proxy (Meta-LLM) | All workspaces (read access), Knowledge Base (write) |

### 5.3 Workspace Lifecycle

Workspaces are dynamic. They are created on demand, scaled based on load, and destroyed when idle. The Meta Workspace is always active — it is the workspace that monitors and improves all other workspaces.

```
IDLE → PROVISIONING → ACTIVE → SCALING → ACTIVE → IDLE → TERMINATED
                                  ↑                    |
                                  └────────────────────┘
                                  (reactivated on demand)
```

### 5.4 Future Workspace Types

The architecture is designed to support unlimited workspace types. As the business grows, new workspaces will be spawned:

- **Client Workspace** — Isolated environment per client project with dedicated agents
- **Training Workspace** — Fine-tuning and evaluating custom models
- **Compliance Workspace** — Audit trails, regulatory reporting, document management
- **Sales Workspace** — Pipeline management, proposal generation, contract automation
- **Integration Workspace** — API development, webhook management, third-party connectors

Each new workspace type is defined by a JSON specification, built as a Docker image, and registered with the CEO Proxy. The machine grows by spawning new workspace types — not by making existing workspaces more complex.

---

## 6. System Architecture Overview

The Mark 1 is organized into five horizontal layers, each with distinct responsibilities:

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 1: PRESENTATION                                  │
│  Command Center Dashboard · supermega.dev · Mobile PWA   │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: AGENT ORCHESTRATION                           │
│  CEO Proxy · CrewAI · LangGraph · AutoGen · n8n         │
├─────────────────────────────────────────────────────────┤
│  LAYER 3: CORE SERVICES                                 │
│  Odoo ERP · AI Intelligence Fabric · Google Workspace    │
│  Stripe Payments · Knowledge Base (pgvector)            │
├─────────────────────────────────────────────────────────┤
│  LAYER 4: INFRASTRUCTURE                                │
│  GCP (Cloud Run, Cloud SQL, Cloud Storage, Cloud Functions, Vertex AI) · Docker/Cloud Run     │
│  GitHub Actions · Bangkok Local Node                    │
├─────────────────────────────────────────────────────────┤
│  LAYER 5: SECURITY & OBSERVABILITY                      │
│  Secrets Manager · Prometheus/Grafana · Cloud Monitoring       │
│  Backup/DR · IAM · Encryption                           │
└─────────────────────────────────────────────────────────┘
```

**Data flows downward** for execution and **upward** for reporting. Each layer communicates only with its adjacent layers through well-defined APIs and event buses. This strict layering ensures that changes in one layer do not cascade unpredictably through the system.

---

## 7. Layer 1: Presentation Layer

The presentation layer is how humans interact with the machine. It provides visibility into system state, agent activity, and business metrics.

### 4.1 Command Center Dashboard

The primary interface. A React 19 + Tailwind CSS 4 application built with the "Mission Control" design system — deep space blacks, electric cyan signals, information-dense tile grids. Hosted on Manus infrastructure during development, deployable to GitHub Pages for production.

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React 19 + TypeScript | Component architecture |
| Styling | Tailwind CSS 4 + shadcn/ui | Mission Control theme |
| Routing | Wouter | Lightweight client-side routing |
| Animation | Framer Motion | Boot sequences, transitions |
| Charts | Recharts | KPI visualization |
| Data Source | machine-status.json | Static JSON on GitHub Pages |

**Pages:**
- **Command Center** (/) — KPI overview, agent fleet summary, infrastructure status, email intelligence, Drive monitor, product pipeline, action queue
- **Agent Fleet** (/agents) — Detailed cards for each agent with capabilities, health, current tasks
- **Infrastructure** (/infrastructure) — Service topology with status indicators for GCP, GitHub Pages, Google Workspace, Odoo, n8n
- **Products** (/products) — Product pipeline with progress tracking and tech stack details
- **Architecture** (/architecture) — Interactive five-layer architecture visualization

### 4.2 supermega.dev Website

The public-facing website. Hosted on GitHub Pages (swanhtet01/swanhtet01.github.io) with DNS managed through Squarespace. This is the commercial face of the platform — product demos, landing pages, and contact-to-calendar integration.

### 4.3 Mobile PWA (Planned)

A Progressive Web App for on-the-go monitoring and approval workflows. Push notifications for critical alerts. Offline-capable for basic status viewing.

---

## 8. Layer 2: Agent Orchestration Layer

This is the brain of the machine. Eight specialized agents, each with distinct roles, tools, and frameworks, coordinated by a CEO Proxy agent.

### 5.1 CEO Proxy Agent

The strategic coordinator. Runs on GCP Cloud Run. Receives high-level directives and decomposes them into tasks for specialist agents. Manages priority queues, resource allocation, and escalation paths.

**Responsibilities:**
- Task decomposition and delegation
- Priority management across the fleet
- Conflict resolution between agents
- Escalation to human (Swan) when confidence is low
- Performance monitoring and agent rebalancing

### 5.2 Agent Communication Protocol

Agents communicate through a message bus (initially Redis Pub/Sub, scaling to GCP SQS/SNS). Every message follows a standard envelope:

```json
{
  "from": "agent-coder-01",
  "to": "agent-ops-01",
  "type": "TASK_REQUEST",
  "priority": "HIGH",
  "payload": { ... },
  "timestamp": "2026-02-10T12:00:00Z",
  "correlation_id": "uuid-v4"
}
```

### 5.3 Framework Selection Matrix

| Framework | Use Case | Agents Using It |
|-----------|----------|-----------------|
| CrewAI | Multi-agent collaboration, role-based tasks | Coder, Content, Finance |
| LangGraph | Stateful workflows, complex decision trees | Data Analyst, ERP |
| AutoGen | Conversational agents, iterative refinement | Lead Generation |
| n8n | Event-driven automation, webhook processing | Communications |
| Custom | Specialized monitoring, health checks | DevOps |

---

## 9. Layer 3: Core Services Layer

The services that agents use to do their work.

### 6.1 Odoo ERP

The business backbone. Manages manufacturing, inventory, CRM, and billing. Deployed on GCP Cloud Run with PostgreSQL on Cloud SQL. Agents interact through Odoo's XML-RPC and REST APIs.

**Modules:** Manufacturing, Inventory, CRM, Billing, Purchase, Sales

### 6.2 AI Intelligence Fabric

A multi-LLM routing layer that selects the optimal model for each task based on cost, latency, and capability requirements.

| Model | Provider | Use Case | Cost Tier |
|-------|----------|----------|-----------|
| Gemini 2.5 Flash | Google | Fast analysis, classification | Low |
| Claude 3.5 Sonnet | Anthropic | Complex reasoning, code generation | Medium |
| GPT-4o | OpenAI | General purpose, vision tasks | Medium |
| Gemini 2.5 Pro | Google | Deep research, long context | High |
| Claude 3 Opus | Anthropic | Strategic analysis, architecture | High |

The fabric routes requests based on task complexity, required capabilities (vision, code, reasoning), and budget constraints. Simple classification tasks go to Flash; complex multi-step reasoning goes to Opus.

### 6.3 Google Workspace Integration

| Service | Integration Method | Purpose |
|---------|-------------------|---------|
| Google Drive | Drive API v3 + Webhooks | File monitoring, sync, OCR pipeline |
| Gmail | Gmail API + MCP | Priority filtering, email intelligence |
| Google Calendar | Calendar API + MCP | Scheduling, briefings, follow-ups |
| Google Docs | Docs API | Report generation, document automation |

### 6.4 Knowledge Base (pgvector)

A PostgreSQL database with the pgvector extension for storing document embeddings. New documents added to Google Drive are automatically processed: text extracted, chunked, embedded (using OpenAI or Gemini embeddings), and stored for RAG (Retrieval-Augmented Generation) queries.

---

## 10. Layer 4: Infrastructure Layer

### 7.1 Google Cloud Platform (asia-southeast1)

| Service | Purpose | Configuration |
|---------|---------|---------------|
| Cloud Run | Agent runtime, Odoo, n8n | t3.medium → c5.xlarge (auto-scale) |
| Cloud SQL | PostgreSQL for Odoo + Knowledge Base | db.t3.medium, Multi-AZ |
| Cloud Storage | File storage, backups, static assets | Standard + Glacier for archives |
| Cloud Functions | Event-driven functions, webhooks | Node.js 20 / Python 3.11 |
| Vertex AI | ML model training and inference | On-demand instances |
| ECR | Docker image registry | Private registry |
| Cloud Run/Cloud Run | Container orchestration | Auto-scaling task definitions |
| SQS/SNS | Message queue, notifications | Standard queues |
| Secrets Manager | API keys, credentials | Automatic rotation |
| Cloud Monitoring | Logging, monitoring, alarms | Custom metrics + dashboards |

**Account:** 770031531585  
**Region:** asia-southeast1 (Singapore) — chosen for proximity to Myanmar

### 7.2 Bangkok Local Node

A physical machine for development, testing, and GPU-accelerated tasks.

| Component | Specification |
|-----------|--------------|
| CPU | AMD Ryzen 5 3600X |
| GPU | AMD RX 6600 (8GB VRAM) |
| RAM | 32GB DDR4 |
| Storage | 1TB NVMe SSD |
| OS | Ubuntu 22.04 LTS |
| Role | Dev environment, local inference, gaming |

### 7.3 GitHub Actions CI/CD

Three autonomous pipelines run without human intervention:

**Machine Heartbeat** — Every 6 hours, updates machine-status.json with the latest timestamp and system state. This is the pulse of the machine.

**Health Check** — Daily at 03:00 UTC. Validates the machine-status.json schema, checks supermega.dev availability, verifies GCP status, and generates a health report. Auto-commits results.

**Weekly Digest** — Every Monday at 06:00 UTC. Counts commits, tracks changed files, summarizes agent status, and creates a GitHub Issue with the weekly report.

### 7.4 Docker Container Strategy

Every service runs in a Docker container. This ensures reproducibility, isolation, and portability.

```
docker-compose.yml (production)
├── agent-ceo-proxy      (Python 3.11, CrewAI)
├── agent-coder           (Python 3.11, CrewAI)
├── agent-data            (Python 3.11, LangGraph, pandas)
├── agent-leadgen         (Python 3.11, AutoGen)
├── agent-content         (Python 3.11, CrewAI)
├── agent-erp             (Python 3.11, LangGraph)
├── agent-finance         (Python 3.11, CrewAI)
├── agent-ops             (Python 3.11, Custom)
├── agent-comms           (Node.js 20, n8n)
├── odoo                  (Odoo 17, PostgreSQL)
├── n8n                   (n8n latest)
├── redis                 (Redis 7, message bus)
├── postgres              (PostgreSQL 16, pgvector)
├── prometheus            (Prometheus latest)
└── grafana               (Grafana latest)
```

---

## 11. Layer 5: Security & Observability Layer

### 8.1 Security Architecture

**Principle:** Least privilege, defense in depth, encrypt everything.

| Domain | Implementation |
|--------|---------------|
| Secrets | GCP Secret Manager with automatic rotation |
| IAM | Role-based access, no root credentials in code |
| Network | VPC with private subnets, security groups, NACLs |
| Encryption | TLS 1.3 in transit, AES-256 at rest |
| Authentication | OAuth 2.0 for user access, API keys for agents |
| Audit | CloudTrail for all API calls, centralized logging |

### 8.2 Observability Stack

**Prometheus** collects metrics from all containers every 15 seconds. **Grafana** provides dashboards for agent health, infrastructure costs, task throughput, and error rates. **Cloud Monitoring** handles GCP-native logging and alarms.

**Alert Escalation Path:**
1. Automated self-healing (restart container)
2. DevOps Agent investigates and fixes
3. CEO Proxy Agent escalates to Swan via email/push notification
4. Swan intervenes manually (last resort)

### 8.3 Backup & Disaster Recovery

| Data | Backup Frequency | Retention | Storage |
|------|------------------|-----------|---------|
| PostgreSQL (Odoo + KB) | Daily automated | 30 days | Cloud Storage Standard |
| Configuration files | On every change | Unlimited | Git |
| Google Drive sync | Real-time | N/A | Google Drive |
| Machine status | Every 6 hours | Git history | GitHub |
| Cloud Storage objects | Cross-region replication | Indefinite | Cloud Storage Archive |

**RTO (Recovery Time Objective):** 4 hours  
**RPO (Recovery Point Objective):** 6 hours

---

## 12. Agent Fleet Specification

### Agent 1: Coder Agent
- **ID:** agent-coder-01
- **Framework:** CrewAI
- **Role:** Software development, code review, testing, CI/CD pipeline management
- **Tools:** GitHub API, Docker, Python/TypeScript runtimes, code analysis tools
- **Capabilities:** Python, TypeScript, Docker, CI/CD, Code Review, Testing
- **Autonomy Level:** High — can commit code, create PRs, run tests independently

### Agent 2: Data Analyst Agent
- **ID:** agent-data-01
- **Framework:** LangGraph
- **Role:** Data extraction from complex spreadsheets, KPI generation, feature engineering, ML model training
- **Tools:** Pandas, SQL, Scikit-learn, Matplotlib, Google Sheets API
- **Capabilities:** Pandas, SQL, ML/AI, Visualization, ETL, Forecasting
- **Autonomy Level:** High — can process data and generate reports independently

### Agent 3: Lead Generation Agent
- **ID:** agent-leadgen-01
- **Framework:** AutoGen
- **Role:** B2B lead discovery via Google Maps, LinkedIn enrichment, CRM entry, outreach drafting
- **Tools:** Google Maps API, LinkedIn API, CRM API, Email drafting
- **Capabilities:** Google Maps API, LinkedIn, CRM, Email Outreach, Scoring
- **Autonomy Level:** Medium — drafts require human approval before sending

### Agent 4: Content Creator Agent
- **ID:** agent-content-01
- **Framework:** CrewAI
- **Role:** Marketing content, social media posts, video scripts, blog articles
- **Tools:** LLM APIs, image generation, social media APIs
- **Capabilities:** Copywriting, Video, Social Media, SEO, Design
- **Autonomy Level:** Medium — content requires review before publishing

### Agent 5: ERP Agent
- **ID:** agent-erp-01
- **Framework:** LangGraph
- **Role:** Odoo management — manufacturing orders, inventory tracking, CRM updates, billing
- **Tools:** Odoo XML-RPC API, PostgreSQL, reporting tools
- **Capabilities:** Odoo, Inventory, Manufacturing, Procurement, Reporting
- **Autonomy Level:** High — can create/update records, generate reports

### Agent 6: Finance Agent
- **ID:** agent-finance-01
- **Framework:** CrewAI
- **Role:** Invoice processing, payment tracking, Stripe management, financial reporting
- **Tools:** Stripe API, Odoo Billing, PDF generation, email
- **Capabilities:** Stripe, Invoicing, Insurance, Budgeting, Compliance
- **Autonomy Level:** Medium — payments require approval above threshold

### Agent 7: DevOps Agent
- **ID:** agent-ops-01
- **Framework:** Custom Python
- **Role:** Infrastructure monitoring, container management, security scanning, backup verification
- **Tools:** GCP SDK, Docker API, Prometheus API, shell access
- **Capabilities:** GCP, Docker, Monitoring, Security, Backup, DNS
- **Autonomy Level:** High — can restart services, scale infrastructure, apply patches

### Agent 8: Communications Agent
- **ID:** agent-comms-01
- **Framework:** n8n
- **Role:** Email filtering, calendar management, notification routing, daily briefings
- **Tools:** Gmail API, Calendar API, Slack/Discord webhooks, push notifications
- **Capabilities:** Gmail API, Calendar, Slack, Notifications, Filtering
- **Autonomy Level:** High — filters and routes automatically, escalates priority items

---

## 13. Autonomous Operation Loop

The Mark 1 operates on a continuous five-step loop:

```
    ┌──────────┐
    │  SENSE   │ ← Monitor email, Drive, APIs, metrics
    └────┬─────┘
         │
    ┌────▼─────┐
    │ ANALYZE  │ ← AI agents process signals, extract insights
    └────┬─────┘
         │
    ┌────▼─────┐
    │  DECIDE  │ ← CEO Proxy prioritizes and delegates
    └────┬─────┘
         │
    ┌────▼─────┐
    │ EXECUTE  │ ← Specialist agents perform tasks
    └────┬─────┘
         │
    ┌────▼─────┐
    │  LEARN   │ ← Results feed back into knowledge base
    └────┬─────┘
         │
         └──────→ (loop back to SENSE)
```

**Sense:** The Communications Agent monitors Gmail for priority emails. The DevOps Agent monitors GCP metrics. n8n workflows watch Google Drive for file changes. GitHub Actions check system health.

**Analyze:** The Data Analyst Agent processes incoming data. The AI Intelligence Fabric classifies signals by urgency and type. Embeddings are generated for new documents.

**Decide:** The CEO Proxy Agent receives analyzed signals and decides which specialist agent should handle each task. Priority is determined by business impact, urgency, and agent availability.

**Execute:** Specialist agents perform their assigned tasks using their tools. The Coder Agent writes code. The ERP Agent updates Odoo. The Content Agent drafts posts. Each agent reports completion status.

**Learn:** Task outcomes are logged. Success/failure patterns are analyzed. The knowledge base is updated with new information. Agent performance metrics are recorded for optimization.

---

## 14. Self-Updating Architecture

The Mark 1 does not degrade over time. It improves. This section defines the mechanisms by which the machine continuously rewrites, optimizes, and evolves itself.

### 14.1 The Self-Update Cycle

Every 6 hours, the Meta Workspace activates and runs the following sequence:

```
1. COLLECT METRICS
   → Agent task completion rates
   → LLM cost per task
   → Error rates and failure patterns
   → Workflow execution times
   → Infrastructure utilization

2. ANALYZE PERFORMANCE
   → Meta-LLM reviews metrics against baselines
   → Identifies underperforming agents, workflows, or prompts
   → Ranks improvement opportunities by impact

3. GENERATE IMPROVEMENTS
   → Meta-LLM writes new prompts, configs, or workflow definitions
   → Orchestrator-LLM reviews changes for safety
   → Changes are staged in a test environment

4. TEST
   → Automated test suite validates changes
   → Regression tests ensure no existing functionality breaks
   → Performance benchmarks confirm improvement

5. DEPLOY
   → Approved changes are committed to Git
   → Docker images are rebuilt if needed
   → Agents are hot-reloaded with new configurations
   → Dashboard is updated to reflect changes

6. LOG
   → All changes are recorded in the Knowledge Base
   → Before/after metrics are stored for trend analysis
   → The self-update cycle itself is evaluated for efficiency
```

### 14.2 What Gets Self-Updated

| Component | Update Mechanism | Frequency | Safety Check |
|-----------|-----------------|-----------|-------------|
| Agent prompts | Meta-LLM rewrites based on performance | Every 6 hours | Orchestrator review + A/B test |
| n8n workflows | Meta-LLM generates workflow JSON | On performance drop | Staging environment test |
| LLM routing rules | Cost/performance analysis | Daily | Budget threshold check |
| Dashboard data | GitHub Actions + agent reports | Every 6 hours | Schema validation |
| Docker configs | DevOps Agent optimizes | Weekly | Canary deployment |
| Knowledge Base | Continuous ingestion | Real-time | Embedding quality check |
| This document | Meta-LLM proposes updates | Monthly | Human review (Swan) |

### 14.3 Guardrails

Self-updating is powerful but dangerous without constraints. The Mark 1 enforces these guardrails:

1. **Budget Ceiling** — No self-update can increase monthly LLM costs by more than 20% without human approval
2. **Rollback Window** — Every change has a 24-hour automatic rollback if error rates increase
3. **Human Veto** — Swan receives a daily digest of all self-updates and can veto any change
4. **Architecture Lock** — The five-layer architecture and agent fleet structure cannot be modified by self-update; only Swan or Manus can change these
5. **Test Coverage** — No change deploys without passing the automated test suite

---

## 15. Data Flow Architecture

### 11.1 Email Intelligence Pipeline

```
Gmail Inbox
  → Communications Agent (n8n)
    → Filter by domain (yangontyre.com, evergreenmyanmar, supermega.dev)
    → Filter by sender (KIIC, Junky)
    → Classify priority (HIGH / MEDIUM / LOW)
    → Extract attachments → OCR if needed
    → Route to appropriate agent
    → Update machine-status.json
    → Daily digest to Swan
```

### 11.2 Google Drive Sync Pipeline

```
Google Drive (monitored folders)
  → Webhook notification
    → n8n workflow triggers
      → Download new/modified file
      → Extract text (PDF/DOCX/Image OCR)
      → Chunk and embed (pgvector)
      → Index in knowledge base
      → Notify relevant agent
      → Update machine-status.json
```

### 11.3 Agent Task Pipeline

```
Task Request (from CEO Proxy or external trigger)
  → Message Bus (Redis/SQS)
    → Specialist Agent picks up task
      → Agent executes with tools
      → Agent reports result
    → CEO Proxy validates outcome
  → Knowledge Base updated
  → Dashboard updated
  → Metrics recorded
```

---

## 16. n8n Workflow Catalog

Twelve automation workflows are templated and ready for deployment:

| # | Workflow | Trigger | Key Integrations |
|---|---------|---------|-----------------|
| 1 | Daily Email Digest | Schedule (07:00 MMT) | Gmail, AI, GitHub |
| 2 | Google Drive File Monitor | Webhook | Drive, OCR, PostgreSQL |
| 3 | Invoice Auto-Processor | Gmail attachment | Gmail, Vision, Odoo |
| 4 | Lead Generation Pipeline | Weekly schedule | Maps, LinkedIn, CRM |
| 5 | Content Calendar | Weekly schedule | AI, Meta, Calendar |
| 6 | Automated System Backup | Daily (02:00 UTC) | PostgreSQL, S3, Odoo |
| 7 | GCP Cost Monitor | Daily (08:00 UTC) | GCP Billing, Gmail |
| 8 | Calendar Intelligence | Daily (06:30 MMT) | Calendar, Gmail, Odoo |
| 9 | GitHub Activity Tracker | Webhook | GitHub API |
| 10 | Agent Health Monitor | Every 5 minutes | Docker, Cloud Run, Gmail |
| 11 | Stripe Reconciliation | Webhook + Monthly | Stripe, Odoo, Sheets |
| 12 | Knowledge Base Ingestion | Drive Webhook | Drive, Embeddings, pgvector |

---

## 17. Deployment Blueprint

### Phase 1: Foundation (Week 1-2)

1. Provision GCP Cloud Run instance (t3.medium) in asia-southeast1
2. Install Docker and Docker Compose
3. Deploy PostgreSQL 16 with pgvector extension
4. Deploy Redis 7 for message bus
5. Deploy n8n with Docker
6. Configure GCP Secret Manager for all API keys
7. Set up VPC with private subnets

### Phase 2: Agent Deployment (Week 3-4)

1. Deploy CEO Proxy Agent container
2. Deploy Coder Agent + DevOps Agent (highest priority)
3. Deploy Communications Agent (n8n workflows)
4. Deploy Data Analyst Agent
5. Configure agent-to-agent communication via Redis
6. Set up Prometheus + Grafana monitoring

### Phase 3: Integration (Week 5-6)

1. Connect Gmail API for email intelligence
2. Connect Google Drive API for file monitoring
3. Deploy Odoo on Cloud Run with Cloud SQL backend
4. Connect ERP Agent to Odoo
5. Deploy remaining agents (Lead Gen, Content, Finance)
6. Activate all 12 n8n workflows

### Phase 4: Optimization (Week 7-8)

1. Tune agent performance based on metrics
2. Optimize LLM routing for cost efficiency
3. Set up auto-scaling policies
4. Complete backup and DR testing
5. Deploy Command Center to GitHub Pages
6. Full system integration test

---

## 18. Scaling Strategy

### Horizontal Scaling

Every agent runs in a Docker container. To handle more load, deploy additional container instances behind a load balancer. Cloud Run Cloud Run handles this automatically based on CPU/memory thresholds.

### Vertical Scaling

For compute-intensive tasks (ML training, large document processing), scale up Cloud Run service types. Vertex AI provides on-demand GPU instances for training jobs.

### Agent Scaling

New agents can be added to the fleet by:
1. Defining the agent specification (role, tools, framework)
2. Building the Docker image
3. Adding to docker-compose.yml
4. Registering with the CEO Proxy Agent
5. Deploying via GitHub Actions

The architecture supports unlimited agents. The message bus and CEO Proxy handle routing regardless of fleet size.

### Workspace Scaling

New workspace types can be spawned on demand. Each workspace is a Docker container with a standard interface. The Meta Workspace monitors utilization and automatically provisions or terminates workspace instances based on demand. During peak coding periods, 4 Coding Workspaces might run simultaneously. During quiet periods, only the Meta Workspace and Communications Workspace remain active.

---

## 19. Cost Architecture

### Estimated Monthly Costs (Initial)

| Service | Configuration | Est. Monthly Cost |
|---------|--------------|-------------------|
| Cloud Run (agents + Odoo) | t3.medium, reserved | $30-50 |
| Cloud SQL (PostgreSQL) | db.t3.micro | $15-25 |
| Cloud Storage (storage + backups) | ~50GB | $2-5 |
| Cloud Functions (event functions) | ~100K invocations | $1-3 |
| Secrets Manager | ~20 secrets | $8 |
| LLM API costs | Gemini Flash primary | $20-50 |
| n8n (self-hosted) | Docker on Cloud Run | $0 (included in Cloud Run) |
| GitHub Actions | Free tier | $0 |
| Domain (supermega.dev) | Squarespace | ~$12/year |
| **Total** | | **$80-150/month** |

### Cost Optimization Rules

1. Use Gemini Flash for 80% of LLM tasks (cheapest)
2. Reserve Cloud Run services for 1-year savings
3. Use Cloud Storage Autoclass for automatic cost optimization
4. Cloud Functions for event-driven tasks instead of always-on services
5. Spot instances for non-critical batch processing

---

## 20. Handover from Manus

The Mark 1 Machine is designed as the definitive transition from using Manus as the primary workspace to an independent, self-sustaining system. This handover is structured in three stages:

### Stage 1: Build (Current)

Manus architects and builds the Mark 1 infrastructure, dashboard, workflows, and documentation. All code is committed to Swan's GitHub repository. All data lives in Swan's Google Drive and GCP account.

### Stage 2: Transfer

The Mark 1 begins operating autonomously. GitHub Actions run on schedule. n8n workflows process events. Agents execute tasks. Manus shifts from builder to advisor — reviewing architecture decisions, optimizing performance, and adding new capabilities.

### Stage 3: Independence

The Mark 1 operates fully independently. Swan interacts with the machine through the Command Center dashboard, email briefings, and calendar events. Manus is available for major upgrades and new feature development, but the machine runs on its own.

**What transfers:**
- All source code → GitHub (swanhtet01/swanhtet01.github.io)
- All documentation → Google Drive (SuperMega_Mark1/)
- All automation → GitHub Actions + n8n on GCP
- All data → PostgreSQL on Cloud SQL + S3
- All secrets → GCP Secret Manager
- All monitoring → Prometheus/Grafana on GCP

**What stays with Manus:**
- Nothing critical. The machine is fully portable and sovereign.

---

## 21. Roadmap & Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Architecture Document v1.0 | Feb 10, 2026 | COMPLETE |
| Command Center Dashboard v1.0 | Feb 10, 2026 | COMPLETE |
| GitHub Actions (3 pipelines) | Feb 10, 2026 | COMPLETE |
| Google Drive workspace structure | Feb 10, 2026 | COMPLETE |
| Calendar automations | Feb 10, 2026 | COMPLETE |
| n8n workflow templates | Feb 10, 2026 | COMPLETE |
| GCP Cloud Run provisioning | Feb 17, 2026 | PLANNED |
| Docker deployment | Feb 17, 2026 | PLANNED |
| First 2 agents live (Coder + DevOps) | Feb 24, 2026 | PLANNED |
| n8n live on GCP | Feb 24, 2026 | PLANNED |
| Odoo deployment | Mar 3, 2026 | PLANNED |
| Full 8-agent fleet operational | Mar 10, 2026 | PLANNED |
| Prometheus/Grafana monitoring | Mar 10, 2026 | PLANNED |
| Command Center on GitHub Pages | Mar 17, 2026 | PLANNED |
| Full system integration test | Mar 24, 2026 | PLANNED |
| Mark 1 v1.0 — OPERATIONAL | Mar 31, 2026 | PLANNED |
| Workspace Types v1.0 (8 types) | Apr 7, 2026 | PLANNED |
| LLM-on-LLM pipeline live | Apr 14, 2026 | PLANNED |
| Self-Update Cycle v1.0 | Apr 21, 2026 | PLANNED |
| First autonomous self-improvement | Apr 28, 2026 | PLANNED |
| Mark 1 v2.0 — FULLY AUTONOMOUS | May 15, 2026 | PLANNED |

---

## 22. Standards & Compliance

### Code Standards

- All Python code follows PEP 8 with Black formatter
- All TypeScript code follows ESLint + Prettier
- Every function has docstrings/JSDoc comments
- Every module has unit tests (minimum 80% coverage)
- All commits follow Conventional Commits format
- All PRs require automated CI checks to pass

### Documentation Standards

- Architecture documents follow this template
- All decisions are recorded in ADR (Architecture Decision Records) format
- API documentation uses OpenAPI 3.0 specification
- Runbooks exist for every operational procedure

### Operational Standards

- Every service has health check endpoints
- Every container has resource limits defined
- Every secret is stored in GCP Secret Manager (never in code)
- Every deployment is automated (no manual SSH deployments)
- Every incident triggers a post-mortem within 48 hours

### Logging Standards

- Structured JSON logging for all services
- Correlation IDs across all agent communications
- Log levels: DEBUG, INFO, WARN, ERROR, FATAL
- Logs retained for 90 days in Cloud Monitoring
- Critical logs forwarded to alerting pipeline

---

## 23. Computer Use Layer — The Core Manus Capability

This is what makes Manus, Manus — the ability to control a computer like a human. Clicking, typing, browsing, reading screens, executing code in sandboxes, and coordinating teams of agents that delegate work to each other. Mark 1 replicates this with open-source and commercial tools.

### 23.1 What Manus Does Internally

Manus operates through a sandboxed Ubuntu VM (E2B Firecracker microVM) with Chromium browser, Python 3.11, Node.js 22, and 27+ integrated tools. It reads screens via vision LLMs, controls browsers via Playwright, executes code in isolation, and coordinates parallel subtasks through an internal multi-agent system. The key insight: **all of this can be replicated with open-source tools**.

### 23.2 Mark 1 Computer Use Stack

| Layer | Tools | Purpose | Status |
|-------|-------|---------|--------|
| **Vision & Understanding** | Gemini 2.5 Pro Vision, Claude Vision, Screen-Pipe | Read screenshots, interpret UI elements, OCR, persistent visual memory | API_READY |
| **Browser Control** | Browser-Use, Stagehand, Playwright, Browserbase, AgentQL | Navigate web, fill forms, extract data, handle authentication | NOT_DEPLOYED |
| **Desktop Control** | Anthropic Computer Use API, OpenAI CUA, Microsoft UFO | Click, type, scroll on any application — not just browsers | API_READY |
| **Sandboxed Execution** | E2B, Scrapybara, Docker, Cloud Run | Full OS sandbox with filesystem, network, process isolation | NOT_DEPLOYED |

### 23.3 Manus vs Mark 1 Capability Comparison

| Capability | How Manus Does It | How Mark 1 Will Do It | Priority |
|-----------|-------------------|----------------------|----------|
| Sandboxed VM | E2B Firecracker microVMs | E2B + Docker on Cloud Run + Bangkok node | CRITICAL |
| Browser Automation | Playwright + Chromium headless | Playwright + Browser-Use + Stagehand + Browserbase | CRITICAL |
| Screen Reading | Screenshot → Vision LLM | Screenshot → Gemini 2.5 Pro Vision + Claude Vision | CRITICAL |
| Mouse & Keyboard | Anthropic Computer Use coordinates | Claude CUA + OpenAI CUA + UFO | CRITICAL |
| File System | Full sandbox filesystem + rclone | Cloud Storage + local FS + Google Drive MCP | PARTIAL |
| Code Execution | Python 3.11 + Node.js 22 + shell | E2B sandbox + Docker + Bangkok node | CRITICAL |
| Multi-Step Planning | Internal planner agent | CEO Proxy (Meta-LLM) + LangGraph state machine | CRITICAL |
| Tool Integration | 27+ built-in tools | MCP servers + Composio (500+) + n8n (400+) | HIGH |
| Agent Coordination | Internal multi-agent parallel | CrewAI + LangGraph + AutoGen + Magentic-One | CRITICAL |
| Persistent State | Sandbox persists across hibernation | Cloud SQL + Redis + Cloud Storage + Firestore | HIGH |

### 23.4 Computer Use Agent Architecture

The computer use agent follows a **screenshot → reason → act** loop:

1. **Capture**: Take screenshot of current screen state (E2B sandbox or Browserbase session)
2. **Understand**: Send screenshot to Gemini 2.5 Pro Vision for UI element identification
3. **Plan**: CEO Proxy decomposes the visual state into actionable steps
4. **Execute**: Browser-Use or Anthropic CUA performs the action (click, type, scroll, navigate)
5. **Verify**: Take new screenshot, compare with expected outcome
6. **Iterate**: If outcome doesn't match, retry with adjusted strategy

This loop runs at approximately 2-5 actions per second, matching Manus's operational speed.

---

## 24. Agent Team Coordination

Single agents are limited. The real power is **teams of agents** that delegate, debate, and refine work — like Manus's internal parallel subtask system, but with multiple orchestration patterns.

### 24.1 Coordination Patterns

| Pattern | Framework | How It Works | Mark 1 Use Case |
|---------|-----------|-------------|------------------|
| **Hierarchical** | CrewAI | CEO → Specialists. Manager agent delegates to role-based specialists. | Primary: Coder Crew, Research Crew, DevOps Crew |
| **Graph-based** | LangGraph | State machine with cycles. Agents are nodes, edges define control flow. | Complex: Data pipeline, multi-step research, error recovery |
| **Conversational** | AutoGen | Debate & refine. SelectorGroupChat picks best agent per turn. | Quality: Code review, architecture decisions, strategy |
| **Orchestrator + Specialists** | Magentic-One | WebSurfer + FileSurfer + Coder + Terminal, coordinated by Orchestrator. | General: Open-ended tasks, closest to Manus internally |
| **Full Workspace** | OpenManus | Complete Manus-like agent with sandbox, browser, file system, tools. | Core: The 'inner Manus' that runs inside Mark 1 |
| **Software Company** | MetaGPT | PM → Architect → Engineer → QA. One-line requirement → complete codebase. | Development: Autonomous software development |

### 24.2 How Agent Teams Communicate

All agent teams communicate through a standardized message bus (Redis Pub/Sub → GCP Pub/Sub at scale):

```
User Intent → CEO Proxy → Task Decomposition → Agent Assignment
                                                      ↓
                                              CrewAI Crew (parallel)
                                              ├── Coder Agent (Gemini CLI)
                                              ├── Reviewer Agent (Claude Code)
                                              └── DevOps Agent (Aider)
                                                      ↓
                                              Results Aggregation
                                                      ↓
                                              CEO Proxy → Quality Check
                                                      ↓
                                              Delivery (commit, email, report)
```

### 24.3 OpenManus — The Inner Manus

OpenManus is the most direct Manus replacement. It provides:

- **Sandbox environment** with full OS, file system, and network
- **Browser automation** with Playwright-based web interaction
- **Code execution** in Python, Node.js, and shell
- **Tool calling** via MCP protocol
- **Multi-step planning** with task decomposition

Mark 1 deploys OpenManus as the core workspace agent — the agent that other agents delegate to when they need full computer use capabilities. It runs inside an E2B sandbox on Cloud Run, with persistent state in Cloud SQL.

---

## 25. Browser Automation & Web Agents

Browser automation is the second most critical Manus capability after sandboxed execution. Mark 1 uses a layered approach:

### 25.1 Browser Automation Stack

| Tool | Type | Strength | When to Use |
|------|------|----------|-------------|
| **Browser-Use** | AI-driven | Natural language browser control, no scripting needed | Default for most web tasks |
| **Stagehand** | Hybrid AI + Code | Combines NL commands with precise selectors for robustness | Complex multi-step web workflows |
| **Playwright** | Programmatic | Fastest, most reliable for known workflows | Scripted automation, testing |
| **Browserbase** | Infrastructure | Managed headless Chrome at scale, stealth mode | High-volume scraping, anti-bot bypass |
| **AgentQL** | Data extraction | Self-healing selectors that adapt when websites change | Web scraping that doesn't break |

### 25.2 Browser Agent Architecture

The browser agent operates through Browser-Use as the primary interface:

1. **Agent receives task**: "Find the pricing page of competitor X and extract their plans"
2. **Browser-Use interprets**: Converts natural language to browser actions
3. **Stagehand fallback**: If Browser-Use fails, Stagehand provides more precise control
4. **Playwright base**: Both tools use Playwright under the hood for actual browser control
5. **Browserbase hosting**: For production workloads, browsers run on Browserbase infrastructure
6. **AgentQL extraction**: Structured data extraction from any page, self-healing when layouts change

### 25.3 Anti-Detection & Stealth

For web scraping and data collection, agents use:
- **Browserbase stealth mode**: Fingerprint randomization, proxy rotation
- **Session persistence**: Maintain login states across agent restarts
- **Rate limiting**: Respect robots.txt and implement polite crawling
- **Headless detection bypass**: Realistic browser fingerprints via Browserbase

---

## 26. Comprehensive Agent Toolkit (60+ Tools)

This section catalogs every tool available to Mark 1 agents — expanded from 40 to 60+ tools with the addition of computer use agents, browser automation, agent coordination frameworks, and workflow orchestration. These are not hypothetical — each tool is production-ready, has active development, and is selected for specific capabilities that complement the Mark 1 architecture.

### 26.1 CLI Coding Agents

The core vibe-coding engines. These tools operate autonomously in the terminal, reading codebases, editing files, running commands, and completing entire features without human intervention.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **Gemini CLI** | Google's terminal agent | Connects Gemini models to shell, file system, and MCP tools. Supports agent skills and interactive tool calling. | PRIMARY |
| **Claude Code** | Anthropic's agentic coding tool | Reads codebases, edits files, runs commands. Supports agent teams — multiple instances collaborate on complex tasks. | PRIMARY |
| **Aider** | Git-native AI pair programmer | Autonomous feature completion, refactoring, multi-file edits. Pioneered the Repository Map pattern. | PRIMARY |
| **Cline** | VS Code autonomous agent | Breaks large tasks into executable steps, reads documentation, executes with human-in-the-loop option. | SECONDARY |
| **Goose** | Open-source autonomous agent | Builds entire projects from descriptions, writes/executes/debugs code end-to-end. | SECONDARY |
| **OpenAI Codex CLI** | OpenAI's Rust-based terminal agent | Reads, changes, and runs code with image inputs and MCP support. | PRIMARY |
| **SWE-agent** | Princeton's research agent | Specialized for software engineering tasks, bug fixing, and feature implementation from issue descriptions. | SECONDARY |
| **Mentat** | GitHub issue automation | AI coding assistant tagged in GitHub issues — automates code reviews, bug fixes, and PR creation. | SECONDARY |

### 26.2 Agent Frameworks

Orchestration frameworks for building multi-agent systems. Each framework has different strengths — CrewAI for role-based crews, LangGraph for stateful workflows, AutoGen for conversational collaboration.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **CrewAI** | Role-based multi-agent collaboration | Define crews of specialized agents that work together. Used for Coder, Content, Finance, and CEO Proxy agents. | PRIMARY |
| **LangGraph** | Stateful agent workflows | Complex decision trees, long-running processes, cycles and branching. Used for Data Analyst and ERP agents. | PRIMARY |
| **AutoGen** | Microsoft's conversational agents | Agents debate, iterate, and refine solutions through dialogue. Used for Lead Generation agent. | PRIMARY |
| **Google ADK** | Agent Development Kit | Build agents with Gemini models, MCP tools, and structured tool calling. | SECONDARY |
| **PydanticAI** | Type-safe agent framework | Structured outputs, dependency injection, streaming. Production-grade with validation. | SECONDARY |
| **OpenHands** | Autonomous SWE platform | CodeAct pattern for complex software engineering tasks. Full development environment. | SECONDARY |
| **OpenManus** | Open-source Manus alternative | Full workspace agent with sandbox, browser, file system, code execution, and tool use. The 'inner Manus'. | PRIMARY |
| **Magentic-One** | Microsoft's generalist multi-agent | Orchestrator delegates to WebSurfer, FileSurfer, Coder, and Terminal agents. Closest to Manus. | PRIMARY |
| **MetaGPT** | Software company simulation | PM → Architect → Engineer → QA. Takes one-line requirement and produces complete codebase. | SECONDARY |

### 26.3 Tool Integration & MCP

Connect agents to 500+ external tools and services via standardized protocols. MCP (Model Context Protocol) is the open standard that makes this possible.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **Composio** | Agent tool hub | 500+ agent-ready tools with managed auth. Connects to GitHub, Slack, Gmail, Jira, Salesforce via MCP. | PRIMARY |
| **MCP Servers** | Model Context Protocol | Open standard for AI tool calling. GitHub, Stripe, Vercel, Ansible, and 100+ official servers. | PRIMARY |
| **n8n** | Visual workflow automation | 400+ integrations, webhook triggers, AI nodes. Self-hosted on GCP for full control. | PRIMARY |
| **Ansible MCP** | IT automation | Red Hat's MCP server for infrastructure automation. Agents manage servers via natural language. | SECONDARY |
| **Zapier AI Actions** | 7,000+ app connections | Agents describe what they need in natural language and Zapier executes across any connected app. | SECONDARY |
| **Temporal** | Durable execution | Ensures long-running agent workflows complete even after failures. The reliability backbone. | PRIMARY |
| **Trigger.dev** | TypeScript background jobs | Long-running AI agent tasks with retries, scheduling, and observability. | SECONDARY |

### 26.4 Sandboxes & Execution

Secure, isolated environments for agents to execute code safely. Every agent runs in its own sandbox — no shared state, no contamination.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **E2B** | Cloud sandboxes for AI agents | Firecracker microVMs with full OS, file system, and network. Agents run code in complete isolation. | PRIMARY |
| **Docker** | Container runtime | Every agent and workspace runs in its own container with defined resource limits and network policies. | PRIMARY |
| **Cloud Functions** | Serverless execution | Event-driven agent functions. Auto-scales, pay-per-invocation. Ideal for webhook handlers and light tasks. | PRIMARY |
| **Scrapybara** | Managed virtual desktops | Ubuntu + Browser instances for computer use agents. Full desktop environment in the cloud. | SECONDARY |
| **Modal** | Serverless cloud for AI | GPU access, container orchestration, scheduled jobs. For ML training and compute-heavy agent tasks. | SECONDARY |

### 26.5 Browser Automation

The core Manus capability — giving agents the ability to browse the web autonomously.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **Browser-Use** | AI-driven browser control | Python library that lets agents control browsers with natural language — AI-driven, not scripted. | PRIMARY |
| **Stagehand** | Hybrid AI + Code | Browserbase's framework — combines natural language commands with precise code for robust web agents. | PRIMARY |
| **Playwright** | Programmatic automation | Microsoft's browser automation — controls Chromium headless, handles navigation, forms, downloads. | PRIMARY |
| **Browserbase** | Browser infrastructure | Serverless managed headless Chrome at scale, stealth mode, session persistence. | SECONDARY |
| **AgentQL** | Data extraction | AI-powered web data extraction — self-healing selectors that adapt when websites change. | SECONDARY |

### 26.6 Observability & AgentOps

Monitor, trace, and optimize agent performance in production. Without observability, autonomous agents are black boxes. With it, they are manageable employees.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **AgentOps** | Agent observability platform | Captures reasoning traces, tool calls, session state, caching behavior, and cost metrics. | PRIMARY |
| **LangSmith** | LangChain's tracing platform | Debug agent chains, compare runs, measure quality. Essential for prompt optimization. | PRIMARY |
| **Braintrust** | AI product evaluation | A/B test prompts, score outputs, track regressions across agent versions. | SECONDARY |
| **Prometheus + Grafana** | Infrastructure monitoring | Custom metrics for agent health, task throughput, resource utilization. Self-hosted on GCP. | PRIMARY |

### 26.7 Knowledge & Search

Give agents access to information, memory, and web intelligence. The knowledge layer is what makes agents useful beyond simple code generation.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **pgvector** | PostgreSQL vector extension | Store and query document embeddings for RAG. The machine's long-term memory. | PRIMARY |
| **Tavily** | Search API for AI agents | Returns clean, structured results optimized for LLM consumption. Built specifically for agents. | PRIMARY |
| **Firecrawl** | Web scraping API for AI | Converts any URL to clean markdown for agent consumption. Handles JavaScript rendering. | PRIMARY |
| **Perplexity API** | AI-powered search | Researched answers with source attribution. Agents get cited information, not hallucinations. | SECONDARY |

### 26.8 Security & Auth

Protect the machine, manage secrets, and control access. Security is not optional — it is the foundation.

| Tool | Role | Key Capability | Integration Priority |
|------|------|----------------|---------------------|
| **GCP Secret Manager** | Centralized secret storage | Automatic rotation, no API keys in code. Every agent retrieves secrets at runtime. | PRIMARY |
| **GCP IAM** | Role-based access control | Every agent gets minimum required permissions. Principle of least privilege enforced. | PRIMARY |
| **HashiCorp Vault** | Dynamic secrets | Encryption as a service, identity-based access for multi-cloud environments. | SECONDARY |

### 26.9 AI Models & APIs

The intelligence layer. Multiple models for different tasks and budgets. The LLM-on-LLM paradigm means the right model is selected for each task automatically.

| Model | Layer | Role | Cost Tier |
|-------|-------|------|----------|
| **Gemini 2.5 Flash** | Worker | 80% of agent tasks — classification, summarization, simple code gen | LOW |
| **Claude Opus 4.6** | Meta | Strategic reasoning, complex architecture, long-running agentic tasks | HIGH |
| **Claude Sonnet 4** | Orchestrator | Code review, task coordination, quality assurance | MEDIUM |
| **GPT-4o** | Orchestrator | Vision tasks, general purpose, broad tool support | MEDIUM |
| **Llama 3.3 70B** | Worker (local) | Runs on Bangkok node for zero-cost inference on non-sensitive tasks | FREE |
| **Qwen 2.5 Coder** | Worker (local) | Coding-specialized, runs locally for cost optimization | FREE |

---

## 27. Appendix: Technology Stack Reference

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| CLI Agent | Gemini CLI | Latest | Terminal-based AI agent with MCP support |
| CLI Agent | Claude Code | Latest | Agentic coding with team collaboration |
| CLI Agent | Aider | Latest | Git-native AI pair programming |
| Integration | Composio | Latest | 500+ agent-ready tools with managed auth |
| Integration | MCP Servers | Latest | Open standard for AI tool calling |
| Sandbox | E2B | Latest | Firecracker microVMs for agent execution |
| Observability | AgentOps | Latest | Agent reasoning traces and cost metrics |
| Observability | LangSmith | Latest | Agent chain debugging and evaluation |
| Search | Tavily | Latest | AI-optimized search API |
| Search | Firecrawl | Latest | Web-to-markdown for agent consumption |
| Language | Python | 3.11 | Agent runtime, ML, automation |
| Language | TypeScript | 5.x | Dashboard, Cloud Functions |
| Framework | React | 19 | Command Center UI |
| Framework | CrewAI | Latest | Multi-agent collaboration |
| Framework | LangGraph | Latest | Stateful agent workflows |
| Framework | AutoGen | Latest | Conversational agents |
| Automation | n8n | Latest | Event-driven workflows |
| Database | PostgreSQL | 16 | Primary data store |
| Extension | pgvector | Latest | Vector embeddings for RAG |
| Cache/Bus | Redis | 7 | Message bus, caching |
| ERP | Odoo | 17 | Business management |
| Cloud | GCP | N/A | Infrastructure platform |
| Container | Docker | Latest | Service isolation |
| Orchestration | Cloud Run Cloud Run | N/A | Container management |
| CI/CD | GitHub Actions | N/A | Automation pipelines |
| Monitoring | Prometheus | Latest | Metrics collection |
| Dashboards | Grafana | Latest | Visualization |
| Payments | Stripe | Latest | Payment processing |
| LLM | Gemini 2.5 | Flash/Pro | Primary AI model |
| LLM | Claude 3.5 | Sonnet/Opus | Complex reasoning |
| DNS | Squarespace | N/A | Domain management |
| Hosting | GitHub Pages | N/A | Static site hosting |
| Workspace | Docker containers | Latest | Isolated agent environments |
| Meta-LLM | Claude Opus / Gemini Pro | Latest | Self-improvement, architecture |
| Orchestrator-LLM | Claude Sonnet / GPT-4o | Latest | Task coordination, review |
| Worker-LLM | Gemini Flash / Haiku | Latest | High-volume execution |
| Vibe Coding | LLM-on-LLM pipeline | Custom | Autonomous code generation |

---

*This document is a living artifact. It is continuously updated — not just by humans, but by the Mark 1 Machine itself through the Meta Workspace's self-update cycle. Every change to the architecture must be reflected here first, then implemented. The document is the source of truth. The machine reads this document. The machine updates this document. The machine IS this document.*

**SuperMega Mark 1 Machine — Built to run. Built to scale. Built to last. Built to build itself.**
