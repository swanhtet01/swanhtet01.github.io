# SuperMega Agent Scheduler

Live app:
- `https://app.supermega.dev` once SSL is issued
- fallback current app host: `https://supermega-app-kr5v7kj3xa-as.a.run.app`

## Internal scheduler endpoint

Use:

`POST /api/internal/agent-runs/run-defaults`

Headers:

- `x-supermega-cron-token: <SUPERMEGA_INTERNAL_CRON_TOKEN>`

Body:

```json
{
  "source": "scheduler",
  "job_types": ["revenue_scout", "list_clerk", "task_triage", "template_clerk"]
}
```

If `job_types` is omitted, the app runs every registered default job.

## Current live scheduler split

Use:

`powershell -ExecutionPolicy Bypass -File .\tools\ensure_supermega_scheduler.ps1`

This script:

- ensures `SUPERMEGA_INTERNAL_CRON_TOKEN` exists in Secret Manager
- updates Cloud Run to consume that secret
- creates or updates these Cloud Scheduler jobs:
  - `supermega-default-agent-jobs` every 2 hours
  - `supermega-ops-watch` every 15 minutes
  - `supermega-founder-brief-daily` every day at 08:00 Asia/Yangon

## Active loop set

- `Revenue Scout`: monitor sales pipeline and hunt pressure
- `List Clerk`: audit company data quality and gaps
- `Template Clerk`: turn inbound requests into rollout-ready follow-up tasks
- `Task Triage`: review queue pressure and weak ownership
- `Ops Watch`: catch stale loops, runtime drift, and queue pressure
- `Founder Brief`: summarize the operating state

## Next upgrade

Move the internal endpoint behind Cloud Tasks so each job becomes retryable and isolated instead of running in one request.
