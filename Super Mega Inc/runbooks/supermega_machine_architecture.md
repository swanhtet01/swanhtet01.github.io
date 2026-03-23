# SuperMega Machine Architecture (Internal + Public + Products)

## Purpose
Build one coherent machine with three connected layers:

1. Internal platform (non-client-facing control tower)
2. Public website (`supermega.dev`) for positioning + conversion
3. Product agent modules (reusable, testable, sellable)

## Layer 1: Internal Platform (Private)

### What it does
- Pulls signals from Gmail, Drive mirror, structured sheets, and external sources.
- Produces daily operational outputs:
  - executive brief
  - action tracker
  - DQMS incident/CAPA register
  - ERP-style file activity and watchlist changes

### Runtime
- Python CLI orchestration: `mark1_pilot/cli.py`
- Daily execution wrapper: `tools/run_solution.ps1`
- Unified machine wrapper: `tools/supermega_machine.ps1 -Action daily`

### Data plane
- Local file mirror (primary source of truth)
- Google Drive and Shared Drive probes/sync
- Gmail profile extraction
- Input Center sheets (team updates)

### Storage
- Local JSON/Markdown artifacts in `pilot-data/`
- Local dashboards in `swan-intelligence-hub/`
- SQLite search index in inventory output path

## Layer 2: Product Agent Modules (Client-facing IP)

Current product set (aligned to website):
- Lead Finder Agent
- Daily News Brief Agent
- Action Planner Agent

### Productization rule
- Every product must have:
  - free testable example
  - deployable internal version
  - owner KPI (time saved, lead quality, closure rate, etc.)

### Execution model
- Example tier runs in browser with fallback behavior.
- Production tier runs from internal platform pipeline and scheduled jobs.

## Layer 3: Public Website (`supermega.dev`)

### What it does
- Shows product positioning and working examples.
- Captures inbound lead requests.
- Routes visitors to pilot onboarding.

### Hosting and delivery
- React/Tailwind app in `showroom/`
- GitHub Pages deploy workflow: `.github/workflows/showroom-pages.yml`
- DNS + TLS on custom domain: `supermega.dev`

### Website reliability control
- Use `tools/website_diagnose.ps1` for DNS + HTTPS diagnostics.
- Use `tools/supermega_machine.ps1 -Action website-check` for fast checks.

## Platform Combination Strategy

Use this tool mix by default:

- Core orchestration: Python + existing `mark1_pilot` pipeline
- Public frontend: React + Vite + Tailwind
- Hosting: GitHub Pages (public), local/LAN + optional Cloud Run for private services
- Agent intelligence: model APIs through connector layer (OpenAI/Google as needed)
- Automation: scheduled PowerShell + CLI jobs (`autopilot-run`)

Avoid over-fragmentation:
- Keep one primary orchestrator (current Python pipeline).
- Add LangGraph/CrewAI only when a module requires explicit multi-step agent state.
- Use browser automation selectively for sources without clean APIs.

## Operating Modes

### Mode A: Daily operator mode (internal)
- `tools/supermega_machine.ps1 -Action daily`

### Mode B: Serve to phone/laptop (internal)
- `tools/supermega_machine.ps1 -Action serve -BindHost 0.0.0.0 -Port 8787`

### Mode C: Public website maintenance
- `tools/supermega_machine.ps1 -Action website-check`
- `tools/supermega_machine.ps1 -Action website-deploy`

## Immediate Next Engineering Steps

1. Move Lead Finder and News Brief from browser-fallback to dedicated backend endpoints.
2. Add product-level analytics (example usage, conversion to pilot request).
3. Add one internal “product KPI board” into the private dashboard.
4. Add weekly automated architecture drift review via execution-review command.
