# SuperMega Company Rebuild

## One Truth

SuperMega is not a broad AI platform.

SuperMega is a small company that sells a few hard workflow tools:

1. `Find Leads`
2. `Follow-Up List`
3. managed pilots built on top of those tools

Everything else stays private until it is as clear and usable as those two.

## Public Tools

### 1. Find Leads

Job:
- search a place or niche
- keep the right businesses
- create the first follow-up

Why it beats plain search:
- it does not stop at discovery
- it saves the lead
- it creates the next action
- it drafts the first outreach

### 2. Follow-Up List

Job:
- take a lead list, messy team notes, or receiving issues
- turn them into a short working queue
- keep stages, notes, and next steps together

Why it matters:
- this is the real operating surface
- not a dashboard
- not a report
- one place to work the next step

## What We Sell

### Self-Serve

- `Lead Finder`
  - price target: `$79/month`
  - who: founders, small sales teams, market scouts
  - deliverable: saved shortlist plus first outreach

### Managed Pilots

- `Sales Desk`
  - price target: `$750 pilot`
  - scope: one lead flow, one queue, one weekly review
  - convert to monthly if the workflow sticks

- `Ops Desk`
  - price target: `$1,500 pilot`
  - scope: one operating flow such as daily blockers, receiving issues, or payment follow-up
  - convert to monthly after the first working review loop

## Private Expansion Products

Do not put these on the front door yet:

- `Commercial Control`
- `Factory Control`
- `Director Brief`
- `Exception Queue`
- `Approvals`
- `Inventory Pulse`

These are delivery and expansion modules after a customer is active.

## Agent Company Model

SuperMega should run a small human-led company with narrow agent loops.

### Revenue

- `Hunt Agent`
  - refresh saved searches
  - dedupe target accounts
  - rank new leads

- `Outreach Draft Agent`
  - write first-pass outreach
  - write follow-up drafts
  - summarize replies

### Delivery

- `Intake Agent`
  - turn pasted notes, files, and email dumps into structured leads, tasks, and issue rows

- `Queue Builder Agent`
  - propose next actions, owners, priorities, and due windows

- `Exception Watch Agent`
  - monitor receiving, supplier, stock, and workflow exceptions
  - open escalation-ready items

- `Briefing Agent`
  - generate the founder/director daily brief

- `Solution Architect Agent`
  - draft pilot scopes
  - recommend the next module or upsell

## 30-Day CEO Operating Rhythm

### Daily

- `08:45` command huddle
  - top 3 deals
  - top 3 customer blockers
  - top 1 ship

- `17:30` hygiene close
  - update the CRM
  - update delivery board
  - assign tomorrow's next steps

### Weekly

- `Monday`
  - pipeline review
- `Tuesday`
  - delivery review
- `Wednesday`
  - founder sales day
- `Thursday`
  - product truth review
- `Friday`
  - CEO scorecard

## What To Stop Doing

- stop selling a generic AI platform
- stop exposing internal module names publicly
- stop building public surface area before a workflow is finished
- stop unpaid custom demos after the first diagnostic
- stop switching stories between platform, ERP, AI OS, and tool suite

## What To Equip The Team With

### Runtime

- [`Cloud Run`](https://cloud.google.com/run/docs/overview/what-is-cloud-run)
- [`Cloud Tasks`](https://cloud.google.com/tasks/docs)
- [`Cloud Scheduler`](https://cloud.google.com/scheduler/docs)
- [`Secret Manager`](https://cloud.google.com/secret-manager/docs)

### State

- `Postgres`
- `SQLModel`
- `Alembic`

### Product Ops

- [`PostHog`](https://posthog.com/docs) for product analytics
- [`Stripe Billing`](https://docs.stripe.com/billing) for billing
- [`Resend`](https://resend.com/docs) or Gmail API for transactional mail

### AI Layer

- [`OpenAI Responses API`](https://platform.openai.com/docs/guides/responses)
- [`OpenAI Agents SDK`](https://openai.github.io/openai-agents-python/)
- [`LangGraph`](https://docs.langchain.com/oss/python/langgraph/overview)
- [`PydanticAI`](https://ai.pydantic.dev/)

### Automation And QA

- [`Playwright`](https://playwright.dev/docs/intro)
- [`Google Places API`](https://developers.google.com/maps/documentation/places/web-service)
- `DuckDuckGo / public web fallback`

## Build Order

1. make `Find Leads` and `Follow-Up List` the only public tools
2. make first shared save recoverable with `email + company`
3. move public saved work to shared backend persistence by default
4. add billing, telemetry, and support ops
5. keep deeper ERP and multi-agent workflows private until they are equally clean

## Hard Truth

SuperMega is still not market-ready as a broad public software company.

It can become market-ready faster by:

- narrowing the public offer
- charging for managed pilots
- running everything from one queue-first delivery model
- using agents only where they create a durable work item, draft, or brief
