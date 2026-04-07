# Team Map

## Founder Desk
- Uses: `/app/director`
- Owns:
  - `00_company_scoreboard.md`
  - `01_daily_founder_brief.md`
  - `07_product_roadmap.md`
  - `09_solution_catalog.md`
- Job:
  - decide priorities
  - approve product cuts
  - approve pricing and client commitments

## Revenue Pod
- Uses: `/app/sales`
- Owns:
  - `03_sales_pipeline.csv`
  - `08_case_study_program.csv`
- Job:
  - run company hunts
  - clean inbound lead lists
  - move opportunities to next step

## Delivery Pod
- Uses:
  - `/app/receiving`
  - `/app/approvals`
- Owns:
  - `04_delivery_tracker.csv`
  - `06_release_log.csv`
- Job:
  - provision starter packs
  - map client workflow into the smallest usable system
  - track rollout progress and blockers

## Agent Ops
- Uses:
  - `/app/teams`
  - `/app/exceptions`
- Owns:
  - `02_operator_report.md`
  - `05_incident_log.csv`
- Job:
  - watch runtime health
  - check scheduler and queue state
  - escalate failures

## Shared rules
- Every agent output should become a saved company, task, issue, approval, or brief.
- No second control plane.
- Human approval stays with deploys, pricing, and client commitments.
