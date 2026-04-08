# Daily Sales Sprint Runbook

Purpose:
- run one focused outbound batch per day
- keep one cohort, one shared problem, one demo angle, and one owner
- end the day with follow-up dates captured and qualified rows landed in `03_sales_pipeline.csv`

Daily shape:
- 12 to 25 targets in one cohort
- one shared problem for the whole batch
- one demo or product angle
- one outreach batch id
- one follow-up pass before close

## 1. Build today's target list

Use `34_daily_sales_sprint_today.csv`.

Rules:
- pick one cohort only
- fill `cohort`, `shared_problem`, and `demo_angle` before outreach starts
- reject rows with no real contact path or no reason they fit the cohort
- assign one owner and one `batch_id`

Good cohort examples:
- tyre dealers
- distributors
- warehouse-heavy SMEs
- service operators with messy inbound requests

## 2. Pick one shared problem

The whole sprint should point at one problem, not a mixed story.

Good problem statements:
- leads and follow-up are scattered across chat and sheets
- quote or order follow-up is not visible to the founder
- inbound requests do not become owned next actions

## 3. Pick one demo or product angle

Use one angle per cohort.

Default angles:
- `Distributor Sales Desk` for pipeline and follow-up
- `Operations Inbox` for inbound requests and ownership
- `Client Portal` for customer status and next-step visibility

Working format:
- problem: what is currently breaking
- angle: what single surface fixes it
- promise: what becomes visible by the end of day one

## 4. Run the outreach batch

Minimum operating rules:
- send 10 to 20 touches per `batch_id`
- personalize the first line only
- log `message_status` immediately after each touch
- stop cold outreach on any row that replies and move it into follow-up capture

Suggested `message_status` values:
- `queued`
- `sent`
- `replied`
- `skipped`
- `bad_fit`

## 5. Capture follow-up

Use `35_daily_sales_sprint_follow_up.csv` the same day.

Rules:
- every touched row gets `last_touch`, `last_result`, and either `next_follow_up` or `closed_reason`
- no reply lives only in email, chat, or memory
- use one exact next step, not a vague note

Suggested `last_result` values:
- `no_reply`
- `replied`
- `interested`
- `not_now`
- `meeting_booked`
- `bad_fit`

## 6. Land results in the shared sales pipeline

`03_sales_pipeline.csv` stays the shared company pipeline.

Add or update a pipeline row when:
- the target is worth tracking after first touch
- a reply creates a real next action
- a demo, proposal, or follow-up date exists

Field mapping into `03_sales_pipeline.csv`:
- `company` = company
- `owner` = sprint owner
- `stage` = `target`, `contacted`, `qualified`, `demo`, `proposal`, `won`, or `paused`
- `value` = expected first deal value or monthly value
- `next_step` = exact next action
- `next_date` = next promised touch date
- `source` = cohort plus channel
- `offer` = demo or product angle
- `risk` = main blocker
- `notes` = shared problem, reply summary, and `batch_id`

## Done for the day

The sprint is complete when:
- one cohort was used
- one shared problem was used
- one demo angle was used
- every target row has a message status
- every live row has a next follow-up or a closed reason
- qualified rows are visible in `03_sales_pipeline.csv`
