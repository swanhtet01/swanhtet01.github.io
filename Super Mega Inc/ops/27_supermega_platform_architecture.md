# SuperMega Platform Architecture

This is the target platform architecture for SuperMega as an AI-native company.

It defines:
- what is general SuperMega
- what is YTF-specific
- what runs now
- what is next
- which services belong to each layer

## 1. Platform shape

SuperMega should run as six layers:
1. public site
2. internal HQ app
3. tenant modules
4. agent runtime
5. memory and learning layers
6. release and development plane

Codex is not one of the runtime layers.
Codex is part of the development plane.

## 2. Public site

### General SuperMega
- domain: `supermega.dev`
- purpose:
  - show the company
  - show systems and examples
  - collect contact

### Services
- GitHub Pages or equivalent static host
- static assets
- contact form posting into the backend

### Runs now
- live public site
- contact submission path

### Next
- stronger examples/case-study proof
- cleaner system catalog tied directly to internal starter packs

## 3. Internal HQ app

### General SuperMega
- domain: `app.supermega.dev`
- purpose:
  - founder control plane
  - live company state
  - shared operating surface for humans and agents

### Main surfaces
- Director
- Sales
- Actions
- Approvals
- Exceptions
- Agent Ops

### Services
- React/Vite frontend
- Python backend APIs
- Cloud Run web service

### Runs now
- live app
- founder and agent surfaces
- queue-backed state

### Next
- stronger founder dashboard
- stronger deals/revenue view
- better team and role views

## 4. Tenant modules

### General SuperMega modules
- Sales OS
- Operations OS
- Founder Brief
- Approval Flow
- Client Portal
- Learning Hub
- Document Intake
- KPI Review

These are reusable product modules for multiple clients.

### YTF-specific vertical OS
- receiving control
- exception queue
- KPI review
- planning
- approvals
- founder and manager review

YTF is a tenant built on the same platform, not a separate codebase by default.

## 5. Identity and auth layer

### General SuperMega
- primary identity source: Google accounts
- likely auth shape:
  - Google Sign-In for users
  - app roles stored in platform database

### Services
- Google auth / OAuth
- session management in backend
- role and tenant mapping in database

### Runs now
- app auth path exists

### Next
- stronger team invite flow
- tenant-aware role assignment
- clean manager/operator/founder role separation

## 6. Agent runtime

### Trigger layer
- Cloud Scheduler
- purpose:
  - enqueue recurring jobs

### Queue layer
- Cloud Tasks
- purpose:
  - retryable work
  - backoff
  - queue separation

### Execution layer
- Cloud Run worker service
- purpose:
  - drain queues
  - run durable jobs
  - write durable state

### Current loops
- Revenue Scout
- List Clerk
- Template Clerk
- Task Triage
- Ops Watch
- Founder Brief

### Next loops
- Deals Clerk
- Delivery Watch
- Release Guard
- Browser Clerk

### Runs now
- Scheduler
- Tasks
- worker execution

### Next
- cleaner web vs worker separation
- dedicated browser-worker sidecar

## 7. Google Drive and Gmail ingestion

### General SuperMega
Use Google connectors for client source material where the business already lives in Google Workspace.

### Google Drive ingestion
Inputs:
- folders
- Docs
- Sheets
- uploaded files

Processing:
1. discover source files
2. extract structured text and metadata
3. classify by workflow
4. attach to records, approvals, KPI entries, or queues
5. preserve source link back to Drive

### Gmail ingestion
Inputs:
- inbound contact
- sales threads
- client updates
- approval or issue threads

Processing:
1. detect relevant messages
2. classify by workflow
3. create or update lead, deal, task, approval, or incident
4. keep thread reference

### Runs now
- Gmail draft/outreach path exists

### Next
- stronger inbound Gmail sync
- stronger Drive-to-record ingestion

## 8. Memory and knowledge layers

### Operational memory
- service: Cloud SQL Postgres
- holds:
  - leads
  - deals
  - tasks
  - approvals
  - incidents
  - founder brief outputs
  - tenant records

### Knowledge graph layer
- initial implementation:
  - relational records plus explicit relationship tables
- relationships:
  - company -> contact -> deal -> task
  - shipment -> receiving issue -> action
  - document -> approval -> decision
  - KPI -> target -> owner -> review

This should be graph-like in behavior, not necessarily a separate graph database on day one.

## 9. Behavioral learning layer

### Purpose
Learn how the organization actually behaves.

Track:
- who updates on time
- where approvals stall
- which issues repeat
- which queues go stale
- which metrics matter most to a founder or manager

Use for:
- routing
- escalation
- founder brief prioritization
- manager review prioritization

### Runs now
- basic runtime reports and queue state

### Next
- explicit behavioral scoring and review signals

## 10. Metrics and KPI layer

### Inputs
- direct app entry
- imported Google Sheets
- manager updates
- queue state
- tenant-specific operational values

### Processing
- normalize values
- compare to targets
- mark late or missing updates
- generate trend and exception signals

### Outputs
- KPI review
- founder brief
- manager review
- risk flags

### Runs now
- partial founder/operator reporting

### Next
- stronger KPI surface in the app
- tenant-specific scorecards

## 11. Browser sidecars

### Purpose
Run browser-only tasks where no API exists.

Use for:
- screenshots
- preview capture
- browser-only automation
- UI verification

### Services
- Playwright or Browser Use
- later dedicated browser worker

### Rule
- browser automation is sidecar-only
- it does not hold business truth

## 12. Local BDA HQ mirror

### Location
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`

### Purpose
- durable founder-readable mirror outside the temp worktree

### Contents
- `ops`
- `reports`
- `brand`

### Services and scripts
- workstation cycle
- founder cycle
- operator cycle
- HQ sync script

### Runs now
- local HQ sync
- local latest reports

### Next
- richer founder evidence and release view

## 13. Release and development plane

### Branch model
- `codex/<task>`
- `develop`
- `release/<version-or-date>`
- `main`

### Release path
1. build on `codex/*`
2. verify locally
3. gather screenshots or proof
4. merge to `develop`
5. cut `release/*`
6. run smoke and release checks
7. merge to `main`

### Services
- Git
- GitHub
- CI
- local or self-hosted runner later

### Codex belongs here
Use Codex for:
- engineering
- restructuring
- platform changes
- release hardening
- deep debugging

## 14. Phone vs desktop vs Codex

### Phone
Use for:
- quick founder checks
- approvals
- queue health
- escalation review

Primary surfaces:
- Director
- Agent Ops

### Desktop
Use for:
- full operating review
- sales and delivery review
- BDA HQ review
- release review

### Codex
Use for:
- changing the system
- not for daily operating visibility

## 15. General SuperMega vs YTF-specific

### General SuperMega
- public site
- internal HQ app
- auth layer
- queue runtime
- knowledge and KPI layers
- founder control plane
- reusable modules

### YTF-specific
- receiving-heavy workflows
- plant or warehouse issues
- YTF Drive/Docs/Sheets ingestion
- YTF KPI definitions
- YTF planning and approvals
- YTF founder/manager review rules

YTF should stay a tenant on the platform, not a separate system unless scale or compliance later forces it.

## 16. What runs now

Running now:
- public site
- internal app
- Cloud Run runtime
- Cloud Scheduler
- Cloud Tasks
- worker loops
- local BDA HQ mirror
- founder/operator/agent reports

## 17. What is next

Next implementation priorities:
1. stronger team and role-based auth
2. stronger Drive and Gmail ingestion
3. stronger KPI and manager review surfaces
4. cleaner worker/browser-worker split
5. richer founder console inside the app
6. self-hosted preview and release runner

## 18. Blunt rule

The platform is correct when:
- the founder can run the company from the app and local HQ
- tenants share one strong platform
- workers keep moving without Codex
- Codex is only needed to change the system, not to inspect it
