# Enterprise Workstation And Runner Standard

This file turns the enterprise controls in `31_enterprise_controls_and_gaps.md` into a concrete operating setup.

Use it for:
- founder workstation setup
- local operator machine setup
- self-hosted preview or release runner setup
- browser-worker isolation
- recovery on a new machine

The goal is simple:
- one secure workstation standard
- one repeatable runner standard
- one reproducible local mirror
- no ad hoc secret copies

## 1. Standard machine roles

SuperMega should use four machine roles:

### 1. Founder workstation
- main desktop used for product, release, and company review
- opens:
  - `https://supermega.dev`
  - `https://app.supermega.dev/app/director`
  - `https://app.supermega.dev/app/teams`
  - `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`

### 2. Engineering workstation
- used for repo work, previews, migrations, and incident handling
- may be the same machine as the founder workstation early on

### 3. Self-hosted runner
- used for preview verification, evidence capture, and release hardening
- should not depend on the founder being logged in interactively

### 4. Browser worker
- isolated browser automation host for login-bound or browser-only workflows
- not required for core runtime
- should be separate from the founder browsing profile

## 2. Required software baseline

Every workstation or runner should have:
- Windows 11 Pro or a managed Linux VM
- Git
- Node LTS and npm
- PowerShell 7 where practical
- Python 3.11+ for backend tools
- `gcloud` CLI
- Microsoft Edge or Chrome
- access to the repo and local BDA HQ path

Optional but useful:
- VS Code
- `gh` CLI
- a dedicated browser profile for automation

## 3. Identity and authentication standard

Rules:
- use named human identities for founder and operator access
- use service accounts for runtime and automation only
- do not run release operations from a shared personal browser session
- do not rely on fallback demo credentials in any production environment

Minimum standard:
- `gcloud auth login` with the founder or authorized operator account
- runtime secrets loaded from Secret Manager
- service accounts used for:
  - Cloud Run runtime
  - Cloud Tasks enqueue and worker execution
  - Scheduler triggers

Required next control:
- production startup should fail if default app credentials are still active

## 4. Secrets handling standard

Source of truth:
- Google Secret Manager

Allowed local use:
- ephemeral environment injection
- local machine cache only if needed for a bootstrap flow

Not allowed:
- secrets in repo files
- secrets in ops docs
- secrets in screenshots
- long-lived copies in `Downloads`, OneDrive notes, or ad hoc folders

Required secret classes:
- auth secrets
- app credentials
- database connection data
- email keys
- Sentry DSNs
- Google OAuth credentials

Operating rule:
- local files may bootstrap a flow
- Secret Manager must be the durable store

## 5. Founder workstation standard

The founder workstation must provide three things:

### Live control
- `app.supermega.dev` for runtime state, queues, and approvals

### Local mirror
- `C:\Users\swann\OneDrive - BDA\Super Mega Inc\codex_hq`
- expected folders:
  - `ops`
  - `reports`
  - `site`
  - `brand`

### Local automation
- scheduled founder and workstation cycles
- periodic HQ sync

Daily operating rule:
- phone for monitoring and approvals
- desktop for decisions, releases, and deep review

## 6. Self-hosted runner standard

The self-hosted runner is for repeatable proof, not ad hoc clicking.

It should run:
- build
- lint
- smoke
- screenshot capture
- release evidence packaging

It should not hold:
- founder browser session
- personal inbox access
- long-lived local secrets outside the approved store

Recommended shape:
- one dedicated machine or VM
- isolated working directory
- dedicated browser profile
- runner service account or tightly-scoped human operator

Release evidence should include:
- commit
- branch
- build result
- lint result
- smoke result
- screenshots for changed public or app surfaces
- rollback note

## 7. Browser worker standard

Browser automation is a sidecar, not the control plane.

Use it only for:
- preview screenshots
- browser-only internal workflows
- customer portal smoke checks
- login-bound admin work where no API exists

Isolation requirements:
- separate browser profile from the founder
- separate cookies and credentials
- clear audit trail for what the worker did
- concurrency kept low until queue behavior is proven

Do not use browser workers as:
- the only source of truth
- the main data integration path
- the core runtime for sales, ops, or founder state

## 8. Local-replicable rebuild standard

A new machine should be able to become operational with a short checklist.

Minimum rebuild steps:
1. install required software
2. authenticate `gcloud`
3. pull repo
4. verify access to Secret Manager and project
5. restore scheduled tasks or runner service
6. run founder workspace launcher or runner bootstrap
7. verify:
   - app access
   - smoke pass
   - HQ sync
   - report generation

If this cannot be done in under one hour with docs only, the setup is not yet enterprise-grade.

## 9. Backup and recovery expectations

Local setup is not a backup strategy.

Required recovery layers:
- Cloud SQL backups and PITR
- ops docs in repo
- local BDA HQ mirror for founder-readable continuity
- release and incident logs preserved outside the temp worktree

Recovery proof should answer:
- can we rebuild a workstation
- can we restore the database
- can we restore the local mirror
- can we see the last known state quickly

## 10. Acceptance checklist

The workstation and runner standard is complete when:
- founder can inspect the company in under 5 minutes
- a clean machine can be provisioned from docs
- release evidence is reproducible
- browser automation is isolated
- secrets are pulled from managed storage
- app/runtime checks work without Codex

If any of those are missing, the setup is still founder-dependent rather than company-grade.
