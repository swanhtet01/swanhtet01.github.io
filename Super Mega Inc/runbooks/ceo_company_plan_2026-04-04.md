# SuperMega CEO Company Plan

Date: 2026-04-04

## One Company Story

SuperMega is not a broad AI platform.

SuperMega is a workflow company that sells a small number of AI-native work tools and managed pilots.

Public tools:

1. `Find Companies`
2. `Sales List`
3. `Team Tasks`

Managed offers:

1. `Sales Desk`
2. `Ops Desk`

Private delivery modules:

1. `Issues`
2. `Approvals`
3. `Director`
4. `Inventory`
5. `Receiving`

## What Each Public Tool Does

### Find Companies

Job:
- search a market
- keep the right companies
- create the first follow-up

Why it beats plain search:
- it turns search into a shortlist
- it creates the first follow-up task
- it saves work into the operating list

### Sales List

Job:
- import a company list
- keep notes, stages, and next steps together
- run one sales task list daily

### Team Tasks

Job:
- paste messy updates
- turn them into owned tasks
- keep the next step visible

## What We Sell

### Self-Serve

- `Find Companies`
  - target price: `$79/mo`
  - user: founders, operators, sales teams
  - promise: find companies and start follow-up faster

### Managed Pilots

- `Sales Setup`
  - target price: `$750 pilot`
  - scope: one lead flow, one list, one weekly review

- `Operations Setup`
  - target price: `$1,500 pilot`
  - scope: one team update or ops issue flow, one task list, one weekly review

## AI Agent Team

Keep the internal agent team small and narrow.

### Hunt Agent
- rerun saved searches
- dedupe accounts
- score fit
- draft first outreach

Writes back:
- saved companies
- first follow-up task

### Queue Builder Agent
- turn pasted updates into tasks
- assign owner, priority, due window

Writes back:
- task rows

### Approval Packager Agent
- turn blocked work into a clear approval request

Writes back:
- approval rows

### Decision Scribe Agent
- turn founder and manager calls into durable decisions

Writes back:
- decision rows

### Product Feedback Triage Agent
- normalize product complaints into actionable backlog items

Writes back:
- structured product feedback rows

### Director Brief Agent
- summarize live queue, issues, approvals, and lead movement

Writes back:
- daily brief snapshots

## Company Operating Loops

1. `Search -> shortlist -> save -> first follow-up`
2. `Paste updates -> task list -> owner -> due date`
3. `Blocked item -> issue -> approval -> decision`
4. `Aging tasks -> director brief -> escalation`

If a tool or agent does not strengthen one of those loops, it is not a priority.

## Stack To Equip The Team With

### Runtime

- [Cloud Run](https://cloud.google.com/run/docs)
- [Cloud Tasks](https://cloud.google.com/tasks/docs)
- [Cloud Scheduler](https://cloud.google.com/scheduler/docs)
- [Secret Manager](https://cloud.google.com/secret-manager/docs)

### Data

- PostgreSQL
- SQLModel
- Alembic

### Product Ops

- [PostHog](https://posthog.com/docs)
- [Stripe Billing](https://docs.stripe.com/billing)
- [Resend](https://resend.com/docs)

### AI Layer

- [OpenAI Responses API](https://platform.openai.com/docs/guides/responses)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)
- [LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)
- [PydanticAI](https://ai.pydantic.dev/)

### QA

- [Playwright](https://playwright.dev/docs/intro)

## What Still Blocks Market Readiness

1. Public site still runs on GitHub Pages while the real shared app is separate.
2. Shared save is not the only public path yet.
3. Recoverable onboarding is not the default.
4. Billing is not live.
5. Telemetry is not live.
6. Support ops are not live.

## Next 10 Moves

1. Make public save require `company + work email`.
2. Default public save to shared backend persistence.
3. Put the real app on Cloud Run.
4. Point public app flows at the live app host.
5. Add Stripe billing.
6. Add PostHog analytics.
7. Add Resend or Gmail transactional mail.
8. Add background jobs for saved hunts and daily briefs.
9. Keep public product to the three public tools only.
10. Keep private modules private until they are equally clean.
