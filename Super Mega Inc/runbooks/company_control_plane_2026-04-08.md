# Company Control Plane

This is the live operating structure for SuperMega.

## Public layer

- `supermega.dev`
  - company site
  - simple explanation of what we build
  - composite rollout examples
  - contact intake

## Operating layer

- `app.supermega.dev`
  - shared team app
  - agent ops
  - sales queue
  - approvals, exceptions, and manager views

## Runtime layer

- Cloud Run web service
- Cloud Run worker path
- Cloud Scheduler recurring jobs
- Cloud Tasks queues

## Source of truth

Use `Super Mega Inc/ops/` for live operating files:
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

## Agent team model

- Founder Desk
  - owns scoreboard, founder brief, roadmap, solution catalog
- Revenue Pod
  - owns sales pipeline and case-study program
- Delivery Pod
  - owns delivery tracker and release log
- Agent Ops
  - owns operator report and incident log

## Update channels

- App control room: `app.supermega.dev/app/teams`
- Local ops reports: `pilot-data/ops/`
- Live ops files: `Super Mega Inc/ops/`
- Public company site: `supermega.dev`

## Publishing rule

Do not present composite examples as named client work.

Use wording like:
- `Composite rollout example`
- `Simulated client system`
- `Based on recurring workflows`

That keeps the site useful without making false claims.
