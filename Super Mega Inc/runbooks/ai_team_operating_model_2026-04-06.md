# SuperMega AI Team Operating Model - April 6, 2026

## Purpose

SuperMega should operate like a small AI-native company with:

- a few simple public tools
- one shared live app
- durable agent loops
- a founder who approves direction, pricing, and client commitments

This is not a generic "AI agent platform" story.

It is a control model.

## Public products

Keep the public layer narrow:

1. Find clients
2. Clean list
3. Log receiving

These are proof tools and lead generators.

## Paid templates

Sell only a few repeatable setups first:

- Sales Setup
- Company Cleanup
- Receiving Control

## Shared app

Use `app.supermega.dev` as the saved team app.

The app should hold:

- saved companies
- tasks
- approvals
- issues
- briefs
- agent runs

## AI team

### Leadership Core

- Founder Brief
- Release Guard
- Product Triage

Purpose:

- keep the company focused
- keep releases safe
- remove drift

### Revenue Pod

- Revenue Scout
- List Clerk
- Outreach Drafter

Purpose:

- keep prospecting alive
- convert search into saved companies
- keep lists clean and usable

### Operations Pod

- Task Triage
- Receiving Clerk

Purpose:

- turn messy notes into short next-step tasks
- keep inbound issues visible

### Client Rollout Pod

- Rollout Architect
- Template Clerk

Purpose:

- take one client workflow
- fit it into one template
- avoid platform sprawl

### Research Lab

- Tool Scout
- Browser Sidecar

Purpose:

- evaluate new tools without destabilizing production
- keep browser automation sidecar-only

## Tooling decision

### Adopt now

- OpenAI Responses API
- OpenAI Agents SDK
- Cloud Run
- Cloud SQL Postgres
- Cloud Scheduler
- Cloud Tasks
- Playwright
- Browser Use as sidecar only
- PostHog
- Sentry
- Resend

### Defer

- LangGraph as the main orchestrator
- PydanticAI as the main agent framework
- OpenClaw-class browser agents as the main runtime

Reason:

The company does not need a second control plane yet.

It needs:

- durable jobs
- typed state
- observability
- simple human approval points

## Daily founder cycle

1. Run production check.
2. Run founder cycle.
3. Read Founder Brief.
4. Check new companies, tasks, and approvals.
5. Ship one improvement to product or one client template.

## Rule

Every agent output must become one of:

- saved company
- task
- issue
- approval
- brief

If it does not map to one of those, it is probably noise.
