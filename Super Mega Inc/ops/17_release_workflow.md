# Release Workflow

SuperMega should not treat `main` as the workshop.

## Branches

- `main`
  - production only
- `develop`
  - integration branch for finished work that is not released yet
- `release/<version-or-date>`
  - release hardening branch
- `codex/<task>`
  - short-lived task branches for AI agents and feature work

## Rules

- no direct pushes to `main`
- every user-facing change should land on a `codex/*` branch first
- frontend changes should have a preview and screenshots before merge
- unfinished experiments stay off `main`
- `main` changes only during a release step

## AI team workflow

### Revenue Pod
- content and public proof
- sales pipeline logic
- contact intake flow

### Delivery Pod
- templates
- client onboarding
- operations workflows

### Platform Pod
- infra
- auth
- queues
- telemetry

### Release Guard
- build
- lint
- smoke
- release notes
- rollback check

## Default path

1. create `codex/<task>`
2. build and verify locally
3. preview the change
4. review screenshots or demo links
5. merge into `develop`
6. cut `release/<date>`
7. run final smoke
8. merge release into `main`

## Immediate practical use

This site reset is being developed on:
- `codex/public-product-reset`
