# Self-Hosted Company Loop

This is how SuperMega stops depending on Codex as the day-to-day control plane.

## What Codex should become

Codex should become:
- one engineering agent
- one review agent
- one design/research agent when needed

Codex should not remain:
- the company control plane
- the only place where work is visible
- the only place where product direction lives

## What the company should run on instead

### 1. Public layer
- `supermega.dev`
- system pages
- demos
- contact intake

### 2. Control plane
- `app.supermega.dev`
- sales
- deals
- delivery
- founder brief
- agent ops

### 3. Worker plane
- Cloud Run worker
- Cloud Tasks queues
- Cloud Scheduler
- browser sidecar only when no API exists

### 4. Founder workstation
- local ops hub
- live reports
- release notes
- roadmap
- local launch scripts

## What to add now

### Dedicated services
- `supermega-web`
- `supermega-worker`
- later `supermega-browser-worker`

### Dedicated agent roles
- `Research Clerk`
- `Dev Clerk`
- `Preview Builder`
- `Release Guard`
- `Deals Clerk`
- `Delivery Watch`

### Dedicated infrastructure
- one self-hosted GitHub runner for previews and release jobs
- one Chrome-capable worker VM or workstation for browser-heavy tasks
- one shared secret store and queue-backed runtime

## How coding work should run without Codex

### Minimum viable setup
- Keep GitHub as the source of truth
- Keep Cloud Run and queues as runtime
- Use self-hosted runners for build, preview, smoke, and release
- Use SuperMega app plus local ops hub as the control plane

### Coding agent stack
- OpenAI Responses / Agents for cloud-based coding and review loops, if you want frontier performance
- or open-weight coding models behind your own infra when cost/privacy matters more than top-end output
- either way, the company still needs:
  - branch rules
  - previews
  - release gates
  - logs

## What each machine should do

### Founder machine
- read updates
- approve releases
- inspect sales and delivery state
- optionally run browser sidecar tasks

### Runner machine or VM
- build branches
- run tests
- create previews
- collect screenshots
- run smoke

### Browser worker
- execute browser-only automations
- collect screenshots and recordings
- avoid becoming the main system of record

## What "fully autonomous" really means

It does not mean one giant AI replacing all judgment.

It means:
- work is queued
- work is visible
- work is assigned
- previews are created automatically
- founder gets briefed automatically
- releases are gated automatically

## Immediate implementation order

1. Keep the public site reset on a branch until it is reviewable.
2. Add a Deals / Revenue surface to the app.
3. Add a self-hosted runner for previews and smoke.
4. Add Browser Use or a dedicated Chrome worker only for browser tasks.
5. Route contact, deals, delivery, and release work through the app instead of this chat.

## Current rule

If something only exists in Codex messages, it is not operational enough yet.
