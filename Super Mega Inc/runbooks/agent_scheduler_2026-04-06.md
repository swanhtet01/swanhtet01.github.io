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
  "job_types": ["revenue_scout", "list_clerk", "task_triage", "founder_brief"]
}
```

If `job_types` is omitted, the app runs all four default jobs.

## Recommended Cloud Scheduler setup

1. Create a random token and store it as `SUPERMEGA_INTERNAL_CRON_TOKEN` in Secret Manager / Cloud Run env.
2. Create one Cloud Scheduler HTTP job.
3. Target:
   - `https://app.supermega.dev/api/internal/agent-runs/run-defaults`
4. Method:
   - `POST`
5. Header:
   - `x-supermega-cron-token: <token>`
6. Body:

```json
{
  "source": "scheduler"
}
```

## Default loop

- `Revenue Scout`: monitor sales pipeline and hunt pressure
- `List Clerk`: audit company data quality and gaps
- `Task Triage`: review queue pressure and weak ownership
- `Founder Brief`: summarize the operating state

## Next upgrade

Move the internal endpoint behind Cloud Tasks so each job becomes retryable and isolated instead of running in one request.
