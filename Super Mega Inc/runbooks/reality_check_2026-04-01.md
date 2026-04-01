# SuperMega Reality Check

Date: 2026-04-01

## Core problem

The project has spent too much time trying to look like a platform before the public product and live runtime were actually connected.

That created three different failure modes:

1. The public website looked like software, but it was mostly a static shell.
2. The local app had real features, but they were hidden behind a deployment gap.
3. "Agents" were described as a system before there was a real control plane, job queue, or eval layer.

## What is real right now

- Local app runtime works.
- Login works locally.
- Lead Finder works locally with live external search.
- Lead pipeline, outreach compose, activity history, exceptions, approvals, and insights work locally.
- The smoke test proves a real local workflow end to end.

## What is still fake or not ready

- `supermega.dev` is still mainly a static shell until the backend is publicly hosted.
- Public login and signup are misleading unless the live app host exists.
- Agent teams are mostly a manifest and reporting layer, not a real job system.
- Autonomous lead hunts are synchronous request handlers, not background jobs.
- Enterprise claims are ahead of reality because state is still single-tenant and demo-credential based.

## Why this has felt like wasted time

- Too many routes were exposed before one clear product was finished.
- Marketing and app behavior were mixed together.
- Too many modules were started before the main path was trusted.
- Smoke tests proved server responses, but not product quality or autonomy quality.
- The system shipped "explanations of software" faster than it shipped software.

## Product reset

Keep only two public ideas:

1. `Action OS`
   One board for owners, due dates, blockers, approvals, and exceptions.

2. `Lead Finder`
   Search a market, shortlist real companies, build the first outreach.

Everything else should be private under `/app`.

## Public site rules

- Public routes: `/`, `/action-os`, `/lead-finder`, `/book`
- No public app claims unless the backend host is live.
- No public login or signup unless the live app host is configured.
- The homepage should explain one sentence and one buyer flow only.

## Private app rules

- `/app` is the saved workspace.
- `/app/leads` is private CRM and hunt management.
- `/app/actions` is the core board.
- `/app/exceptions`, `/app/approvals`, `/app/director`, and `/app/insights` are supporting role views.

## What to build next

### Phase 1: Make one real public product

- Publicly host the backend.
- Point public login/app to that host only.
- Make public Lead Finder use live browser search or the live backend, never a fake placeholder.
- Add real booking/calendar.

### Phase 2: Make one real private product

- Keep `Action OS` as the core product.
- Keep `Lead Finder` as the acquisition tool.
- Stop adding new modules until the public handoff and private app feel consistent.

### Phase 3: Make agents real

- Add `agent_jobs`, `agent_runs`, and `agent_outcomes` tables.
- Move lead hunts, insights refresh, and board sync into background jobs.
- Add durable scheduling and retries.
- Add eval packs for Lead Finder, Action OS, Supplier Watch, and Quality Closeout.

## Stack upgrades

Use these next:

- FastAPI
- SQLModel
- PostgreSQL
- OpenAI Responses API
- LangGraph
- PydanticAI
- Cloud Run
- Cloud Tasks
- Cloud Scheduler
- Secret Manager

Use these only as sidecars:

- Stagehand
- Playwright

## Definition of done

SuperMega is not "ready" until all of these are true:

- Public site is simple and credible.
- Public Lead Finder works on the live domain.
- Public login only appears when the live app host exists.
- `/app` is publicly hosted and usable with real auth.
- Lead pipeline, outreach, and saved hunts work on the live host.
- Agent jobs write durable run records and can be evaluated.

Until then, the right framing is:

"working local product, incomplete public deployment"
