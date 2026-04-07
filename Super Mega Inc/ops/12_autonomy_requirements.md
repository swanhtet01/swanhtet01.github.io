# Autonomy Requirements

These are the remaining external pieces that materially increase independence.

## Already in place
- Cloud Run app
- Cloud Tasks
- Cloud Scheduler
- Cloud SQL
- Sentry backend DSN
- Resend runtime wiring

## Still needed or still settling
- Resend domain fully verified so contact and invite emails deliver
- frontend Sentry baked into the next rebuilt frontend artifact
- Chrome-capable browser worker or Browser Use account for browser-heavy sidecar tasks

## Useful but optional
- external product analytics
- better release visibility dashboards
- dedicated worker split:
  - web
  - worker
  - later browser worker

## What autonomy means here
- jobs continue outside this chat
- the app remains the control plane
- reports and queues are visible to humans
- failures become incidents, not silent breakage
