# SuperMega Company Operating Model

Date: 2026-04-04

## What SuperMega Is

SuperMega should not present itself as a generic AI platform.

SuperMega should be a small software-and-service company that sells a few AI-native work tools:

1. `Find Companies`
2. `Company List`
3. `Task List`

These three tools are enough to start revenue.

## What SuperMega Sells

### 1. Find Companies

Job:
- search a market
- keep the right companies
- draft first outreach
- create the first follow-up task

Why it matters:
- Google and Facebook stop at discovery
- Find Companies closes the first operating loop

### 2. Company List

Job:
- import a company list
- store notes, stage, and next step
- keep the follow-up list moving

Price direction:
- self-serve after the public shared backend is stable
- managed setup before that

### 3. Task List

Job:
- paste messy updates
- turn them into owned tasks
- review the short list every day

Best first markets:
- owner-led teams
- sales teams
- procurement and receiving teams
- small factories and distributors

## What Not To Sell Yet

Do not sell these publicly yet:

- broad AI OS language
- public ERP suite
- multi-agent platform
- director dashboards as a front-door product
- public approvals/issues/inventory screens

Those are delivery layers, not front-door offers.

## The Real Advantage

The advantage is not “better search.”

The advantage is:

1. `Search -> shortlist -> save -> first task`
2. `Paste updates -> tasks -> owner -> due date`
3. `One short list to run every day`

That is the disruptive part: less software, less setup, faster operating value.

## AI Agent Team

Keep the internal agent team small and operational.

### Revenue Scout
- rerun saved searches
- dedupe companies
- score fit
- draft first outreach
- create first follow-up tasks

### List Clerk
- turn a client list or pasted updates into the first working list
- dedupe, tag, and score imported records
- prepare the first weekly review

### Task Triage
- clean incoming notes
- merge duplicates
- assign owner and due window

### Founder Brief
- summarize pipeline movement
- summarize open tasks
- highlight blockers, aging work, and money due

## What To Equip The Team With

### Product runtime
- Cloud Run
- Cloud Tasks
- Cloud Scheduler
- Secret Manager

### Data layer
- PostgreSQL
- SQLModel
- Alembic

### Product ops
- PostHog
- Stripe Billing
- Resend

### AI layer
- OpenAI Responses API
- OpenAI Agents SDK
- LangGraph
- PydanticAI

### QA
- Playwright

## Operating Metrics

Track these every week:

1. searches run
2. companies saved
3. first follow-up tasks created
4. task completion rate
5. demo requests
6. pilots started
7. paid pilots live
8. weeks to first usable list

If a feature does not move one of those metrics, it is not a priority.

## Cost Discipline

Keep the first stack cheap:

- GitHub Pages for brochure-only public shell
- Cloud Run for the shared app and API
- Postgres on a managed small-tier service
- OpenAI only for high-value transforms
- rules-first fallback for everything else

Use AI only where it creates or speeds up a real row:
- lead
- task
- issue
- approval
- brief

## Next 30-Day Execution

### Week 1
- make public shared save require `company + work email`
- make shared backend persistence the default public path
- remove remaining public dead surfaces

### Week 2
- deploy shared app/backend to Cloud Run
- wire PostHog
- wire Resend for recoverable onboarding

### Week 3
- add Stripe billing
- add saved hunts on a schedule
- add daily director brief

### Week 4
- run SuperMega itself from Find Companies + Company List + Task List
- close the first pilots from the same stack

## CEO Rule

SuperMega is allowed to feel smaller.

A smaller product that closes one real loop is more credible than a larger product map that explains ten future loops.
