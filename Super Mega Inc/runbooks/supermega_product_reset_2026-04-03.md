# SuperMega Product Reset

## Core reality

SuperMega should not sell a broad "AI operating system for everything" yet.

It should sell three things:

1. `Action OS Starter`
   One queue, one owner map, one director view.
2. `Commercial Control`
   Lead Finder + saved pipeline + follow-up queue + outreach support.
3. `Factory Control`
   Action OS Starter + Receiving Control + Inventory Pulse + exception queue.

Everything else is an add-on or delivery-layer capability.

## Public product

Public website should do one job: prove the wedge and book the next step.

Public pages:

- `Home`
- `Lead Finder`
- `Book`

Optional:

- `Workspace`
  Only if it stays extremely simple: shortlist + follow-up queue.

Do not market the public site as the full saved app.

## Private app

Private app should do operations, not explanation.

Primary screens:

- `Queue`
- `Pipeline`
- `Exceptions`
- `Approvals`
- `Director`
- `Receiving`

Everything else should be secondary until these screens are stable.

## Why Lead Finder exists

Lead Finder is not better than Google because it finds more websites.

Lead Finder is better when it closes the loop:

- search
- shortlist
- save
- create first follow-up
- track the stage
- hand off to queue

Google and Facebook stop at discovery.
SuperMega should continue into execution.

## Resellable templates

Templates should be workflow templates, not page variations.

Resell now:

1. `Commercial Control Template`
   For agencies, distributors, service businesses, owner-led sales teams.
   Output: lead pipeline, follow-up queue, discovery tracking.

2. `Factory Control Template`
   For plants, warehouses, procurement-led operations.
   Output: receiving board, inventory watch, exception queue.

3. `Director Brief Template`
   For owners, directors, and GMs.
   Output: top blockers, overdue items, key approvals, next decisions.

## Mechanisms that actually automate work

The useful automation model is not "one super agent".

It is durable loops:

1. `Lead hunt loop`
   Saved searches run on a schedule and add qualified leads.
2. `Queue loop`
   New leads create the first follow-up automatically.
3. `Aging loop`
   Stalled items escalate based on due date and stage age.
4. `Exception loop`
   Receiving, quality, inventory, and supplier issues create queue items.
5. `Director brief loop`
   One daily brief is generated from live queue and exception state.
6. `Approval loop`
   Threshold-based items wait for approval instead of silently moving.

## Production architecture

Target architecture:

- `FastAPI`
- `Postgres`
- `Cloud Run`
- `Cloud Tasks`
- `Cloud Scheduler`
- `Secret Manager`

Only add richer agent orchestration after runtime is stable:

- `OpenAI Responses API`
- `Agents SDK`
- `LangGraph`
- `PydanticAI`

Do not add more agent complexity before:

- one live backend host
- one durable database
- one recoverable account flow
- one stable public-to-private handoff

## Execution order

1. Make `Lead Finder -> save -> first task` one backend action.
2. Make the public workspace recoverable, not cookie-only.
3. Put the real backend on one live host.
4. Move public saved state off browser-local storage.
5. Keep only the core products above on the front door.
