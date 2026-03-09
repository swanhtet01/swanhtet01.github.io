# Yangon Tyre AI-Native Management Plan

Scope: director and plant-manager operating system for Yangon Tyre, not a generic template.

## Business target

Build one system that combines:

- ERP-like operational visibility
- DQMS quality controls
- director-level decision briefs
- manager-level task and follow-up workflow

## Data foundation

1. Source layers
- Yangon Tyre Drive mirror (full folder corpus)
- Gmail profiles (internal, supplier, quality)
- external market watch (GNLM, Eleven, MRPPA, selected social sources)

2. Knowledge layers
- File change register (`erp_change_register.*`)
- Full-text retrieval index (`search_index.sqlite`)
- Quality registers (`dqms_incidents.json`, `dqms_capa_actions.json`, `dqms_supplier_nonconformance.json`)

3. Management output layers
- director brief (`pilot_solution.md`)
- operations digest (`platform_digest.md`, dashboard html)
- quality weekly summary (`dqms_weekly_summary.md`)

## AI-native ERP model (practical v1)

Treat files and email as events, then map into business objects:

- sales order signal
- quotation signal
- shipment/procurement signal
- cash/payment signal
- quality incident signal
- CAPA action signal

Each signal should carry:

- source evidence link
- owner
- due date
- status
- risk level

## DQMS integration model

- Incident intake from quality emails and quality-tagged files
- Auto-link incident to supplier and related shipment/order evidence
- Auto-create CAPA with owner + due date
- Weekly unresolved CAPA escalation to director view

## Plant-manager workflow surface

Daily:

- overnight file/email changes
- blocked shipments/payments
- open quality incidents
- CAPA due this week

Weekly:

- supplier quality trend
- late CAPA trend
- major production/quality risk list

## RAG architecture for this system

1. Retrieval index
- current: SQLite FTS over full Drive mirror
- next: add metadata filters (`module`, `supplier`, `month`, `status`)

2. Grounding contract
- every answer must include evidence files/emails
- no recommendation without linked source artifacts

3. Multi-scale response format
- Director view: 5 decisions
- Manager view: execution checklist
- Analyst view: evidence rows and links

## Build sequence

Phase A (now)
- keep search index and ERP change register updated daily
- enforce DQMS incident -> CAPA chain
- publish daily director brief

Phase B
- add canonical business tables (SQLite): `orders`, `shipments`, `payments`, `incidents`, `capa_actions`
- add confidence score and review queue for auto-extracted records

Phase C
- role-based portals (director, plant manager, quality manager)
- workflow actions: assign, due-date change, close, escalate

## Immediate commands

```powershell
.\tools\pilot.ps1 search-index --config config.example.json
.\tools\pilot.ps1 erp-sync --config config.example.json
.\tools\pilot.ps1 brief-query --config config.example.json --query "KIIC OR shipment OR claim" --top-k 8 --title "Yangon Tyre Ops Signal Brief"
.\tools\pilot.ps1 pilot-solution --config config.example.json --email-max-results 12
```
