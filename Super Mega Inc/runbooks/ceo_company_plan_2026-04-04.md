# SuperMega CEO Company Plan

Date: 2026-04-04

## One Company Story

SuperMega is not a broad AI platform.

SuperMega is a workflow company that sells a small number of AI-native work tools and managed pilots.

Public tools:

1. `Find Companies`
2. `Company List`
3. `Task List`

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

### Company List

Job:
- import a company list
- keep notes, stages, and next steps together
- run one sales task list daily

### Task List

Job:
- paste messy updates
- turn them into owned tasks
- keep the next step visible

## What We Sell

### Self-Serve

- `Find Companies`
  - target price: `$120` one-time sprint or tightly capped free demo
  - user: founders, operators, sales teams
  - promise: find companies and start follow-up faster

### Managed Pilots

- `Sales Setup`
  - target price: `$750 pilot`
  - scope: Find Companies plus Company List, one lead flow, one weekly review

- `Operations Setup`
  - target price: `$600` setup + `$250/month`
  - scope: Task List for one team update or ops issue flow, one weekly review

## AI Agent Team

Keep the internal agent team small and narrow.

### Revenue Scout
- rerun saved searches
- dedupe accounts
- score fit
- draft first outreach

Writes back:
- saved companies
- first follow-up task

### List Clerk
- turn imported company lists into a working company list
- clean, score, and seed the first follow-up work

Writes back:
- saved companies
- first tasks

### Task Triage
- turn pasted updates into tasks
- assign owner, priority, due window

Writes back:
- task rows

### Founder Brief
- summarize live queue, lead movement, aging work, and money due

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
