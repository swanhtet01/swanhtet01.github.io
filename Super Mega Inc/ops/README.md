# SuperMega Ops

This folder is the live operating layer for SuperMega.

Rule:
- If a file here exists, it is current.
- If a dated runbook conflicts with a file here, this folder wins.
- Agents and humans update these files first, then publish summaries elsewhere.

Core files:
- `index.html`
- `00_company_scoreboard.md`
- `01_daily_founder_brief.md`
- `02_operator_report.md`
- `03_sales_pipeline.csv`
- `04_delivery_tracker.csv`
- `05_incident_log.csv`
- `06_release_log.csv`
- `07_product_roadmap.md`
- `08_case_study_program.csv`
- `09_solution_catalog.md`
- `10_team_map.md`
- `11_client_setup_playbook.md`
- `12_autonomy_requirements.md`
- `13_myanmar_market_focus.md`
- `14_updates_and_alerts.md`
- `15_agent_architecture.md`
- `16_next_gen_company_stack.md`
- `17_release_workflow.md`
- `18_self_hosted_company_loop.md`

Ownership:
- Founder Desk: scoreboard, founder brief, roadmap, solution catalog
- Revenue Pod: sales pipeline, case-study program
- Delivery Pod: delivery tracker, release log
- Agent Ops: operator report, incident log

Cadence:
- Daily: founder brief, operator report, sales pipeline, delivery tracker
- Weekly: company scoreboard, product roadmap, case-study program
- Every release: release log
- Every incident: incident log
- Every workstation cycle: `index.html`

Open the local ops hub with:
- `powershell -ExecutionPolicy Bypass -File "C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_ops_hub.ps1"`

Open the founder workspace with:
- `powershell -ExecutionPolicy Bypass -File "C:\Users\swann\AppData\Local\Temp\supermega-promote-20260404-1\tools\open_supermega_founder_workspace.ps1"`
