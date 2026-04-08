# Self-Hosted Company Loop

This is the practical loop that lets SuperMega keep operating when Codex is closed.

## Source of truth

### Code
- Git branches
- GitHub repo

### Runtime
- Cloud Run
- Cloud Tasks
- Cloud Scheduler
- Cloud SQL

### Operating state
- `app.supermega.dev`
- `pilot-data/ops/*.json`
- `Super Mega Inc/ops/*.md`

If something exists only in chat, it is not operational enough yet.

## Branch model

Use the branch rules from `17_release_workflow.md`.

Working branches:
- `codex/<task>`
- `develop`
- `release/<date-or-version>`
- `main`

Rule:
- `main` is production only
- all product and infra work starts on `codex/*`
- release hardening happens on `release/*`

## Preview and release flow

### Default path
1. build on `codex/<task>`
2. run local verification
3. generate preview evidence
4. merge into `develop`
5. cut `release/*`
6. run final smoke and release checks
7. merge to `main`
8. update local ops files

### Minimum preview evidence
- build passes
- lint passes
- smoke passes
- screenshots or demo proof for user-facing changes

### Release gate

Do not release if any of these fail:
- app health
- queue worker
- critical public routes
- founder/operator report generation
- contact flow

## What runs in the cloud

24/7 cloud runtime:
- web app on Cloud Run
- worker execution on Cloud Run
- Cloud Tasks queues
- Cloud Scheduler triggers
- live app surfaces

This is the real runtime.

## What runs on the founder machine

Local workstation runtime:
- workstation cycle
- founder cycle
- operator cycle
- local ops hub refresh
- browser sidecar tasks later when needed

This machine is the mirror and oversight layer, not the primary production system.

## What runs every cycle

Every workstation cycle should refresh:
- `pilot-data/ops/workstation-latest.json`
- `pilot-data/ops/operator-cycle-latest.json`
- `pilot-data/ops/founder-cycle-latest.json`
- `pilot-data/ops/agent-cycle-latest.json`

Every cloud cycle should keep moving:
- queue depth
- loop execution
- app health
- incident visibility

## What is automatic now

- scheduled cloud triggers
- queued worker execution
- local report refresh
- app-visible agent status
- contact submission capture
- production smoke support

## What is still manual

- deciding which product gets built next
- approving releases
- approving pricing and proposals
- final client delivery signoff
- incident judgment when business context is missing

## What gets promoted out of Codex next

The following should live in the company loop, not in chat:
- release checks
- deal updates
- delivery watch
- founder summaries
- incident tracking
- browser capture jobs

## Self-hosted runner model

SuperMega should use one self-hosted runner or dedicated build machine for:
- preview build
- smoke
- screenshot capture
- release verification

That runner should not hold production truth. It should only build, verify, and report.

## Local folder rule

The founder should be able to inspect the company from:
- `Super Mega Inc/ops`

That folder should answer:
- what changed
- what is blocked
- what is due today
- whether the runtime is healthy

If it cannot answer those questions, the loop is incomplete.
