# Mark 1 Documentation Index

## Active docs

### 1. `personal-pilot-architecture.md`
Primary architecture brief for the current product direction:

- single-tenant personal pilot
- Swan's own data as the first deployment
- recommended stack and build order
- guidance on Vertex, LangGraph, CrewAI, and computer use

### 2. `mark1_pilot/README.md`
Working scaffold for the actual v1 pilot:

- Yangon Tyre local/Drive inventory
- Gmail connector boundaries
- secure config and secret file handling
- minimal LangGraph entry point
- search, briefing, and evidence-pack commands

### 3. `showroom/`
Public SuperMega showroom app:

- React + TypeScript + Tailwind implementation
- route-level IA for Home/Solutions/Packages/Case Studies/DQMS/About/Contact
- GitHub Pages deployment workflow
- conversion-focused CTA and lead form flow

### 4. `Super Mega Inc/runbooks/`
Operations runbooks:

- domain cutover, DNS/TLS, and validation flow
- showroom operating cadence and release path
- autopilot scheduler setup for daily execution
- Yangon Tyre ERP-style file change tracking runbook

### 5. `Super Mega Inc/sales/`
Commercial assets:

- package one-pagers
- proposal template
- discovery call script
- qualification checklist

### 6. `Super Mega Inc/PROGRAM_TRACKS.md`
Program-level split across:

- website (`supermega.dev`)
- Yangon Tyre personal ERP pilot
- SuperMega R&D and commercialization track

### 7. `command-center/ARCHITECTURE_v2.3.md`
Long-form Mark 1 machine vision:

- persistent multi-workspace operating model
- agent fleet and orchestration patterns
- browser automation and computer-use concepts
- long-term scaling direction

### 8. `TODO.md`
Current delegated workstreams for the personal pilot.

### 9. `README.md`
Repo entry point and current positioning.

### 10. `tools/pilot.ps1`
Windows-friendly command wrapper for `mark1_pilot.cli`:

- auto-fallback interpreter resolution
- supports WSL Python fallback for this workspace layout
- reduces local run friction for ERP/DQMS daily operations

### 11. `Super Mega Inc/ytf_ai_native_management_plan.md`
Target operating model for Yangon Tyre:

- AI-native ERP + DQMS integration
- plant-manager and director workflow outputs
- RAG grounding model over Drive + Gmail evidence

### 12. `Super Mega Inc/manus_catalog/showroom_reference_shortlist.md`
Manus-derived shortlist for website refinement:

- identifies highest-value prior showroom sample bundle
- lists reusable content/proof assets to import into `showroom/`

### 13. `Super Mega Inc/MY_SOLUTION.md`
Operator-facing entry doc:

- where your live Yangon Tyre solution outputs are
- one-command daily run path
- immediate practical value and current known limitation

### 14. `tools/gmail_finish.ps1`
OAuth finish helper:

- completes Gmail token bootstrap from clipboard callback URL
- avoids manual long command typing

## Supporting docs

### 15. `agent-setup-guide.md`
Legacy but still useful setup material for agent hosts, model routing, telemetry, and autonomy patterns.

## Legacy or template docs

These remain useful as references, demos, or future template material, but they are not the primary product definition for v1:

- `aws-deployment-architecture.md`
- `yangon-tyre-deployment.md`
- `manufacturing-template.md`
- `ytf-demo.html`
- `ytf-dqms/`

## Current direction

The repo now has a clear hierarchy:

1. personal pilot first
2. reusable patterns second
3. industry templates later

If a document conflicts with `personal-pilot-architecture.md`, treat the personal pilot doc as the active source of truth for v1.
