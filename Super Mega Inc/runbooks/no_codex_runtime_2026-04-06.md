# SuperMega No-Codex Runtime

## Principle

Codex should not be the runtime.

Codex is for:

- design
- implementation
- review
- debugging

The company should keep moving without an attached Codex session.

## Live cloud runtime

Shared app:

- `https://app.supermega.dev`

Public site:

- `https://supermega.dev`

Cloud scheduler jobs:

- `supermega-default-agent-jobs`
- `supermega-ops-watch`
- `supermega-founder-brief-daily`

Core live loops:

- `Revenue Scout`
- `List Clerk`
- `Template Clerk`
- `Task Triage`
- `Ops Watch`
- `Founder Brief`

The cloud side is the real 24/7 runtime. It does not consume Codex credits.

## Local workstation layer

Local scripts:

- `tools\run_supermega_workstation_cycle.ps1`
- `tools\install_supermega_workstation.ps1`
- `tools\run_supermega_founder_cycle.ps1`
- `tools\run_supermega_operator_cycle.ps1`

Local report output:

- `pilot-data\ops\workstation-latest.json`
- `pilot-data\ops\operator-cycle-latest.json`
- `pilot-data\ops\founder-cycle-latest.json`
- `pilot-data\ops\agent-cycle-latest.json`

Installed scheduled tasks:

- `SuperMega Workstation Cycle`
- `SuperMega Founder Daily`

Purpose:

- keep a local workstation pulling health and operator reports
- keep founder snapshots updating on schedule
- preserve operating evidence even with no Codex session open

## Next runtime upgrade

The next real step is queue-backed execution:

1. API enqueues jobs only.
2. Cloud Tasks owns retries and isolation.
3. Worker process claims queued jobs from Postgres.
4. Agent Ops shows queue depth, stale jobs, and last successful batch.

That is the path from “scheduled loops” to a real scalable AI-native control plane.
