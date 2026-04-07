# SuperMega Autonomy Stack

This is the minimum stack required for SuperMega to operate with less manual intervention and less reliance on live Codex sessions.

## What already exists

- `supermega.dev` public site
- `app.supermega.dev` shared app
- Cloud Run runtime
- Cloud SQL Postgres
- Cloud Scheduler jobs
- durable agent run model

## What still needs provisioning

### 1. Cloud Tasks

Purpose:
- move agent execution from direct HTTP calls to queued work
- give retries, backoff, dead-letter handling, and cleaner scaling

What to create:
- queue: `supermega-agent-default`
- queue: `supermega-agent-browser`
- queue: `supermega-founder-brief`

Recommended region:
- `asia-southeast1`

Recommended routing:
- all queues target the worker service, not the public web service

Recommended IAM:
- service account running the web app can enqueue tasks
- Cloud Tasks service agent can invoke the worker

Recommended settings:
- `supermega-agent-default`
  - max dispatches per second: `2`
  - max concurrent dispatches: `4`
  - max attempts: `10`
  - min backoff: `10s`
  - max backoff: `600s`
- `supermega-agent-browser`
  - max dispatches per second: `0.5`
  - max concurrent dispatches: `1`
  - max attempts: `5`
  - min backoff: `30s`
  - max backoff: `1800s`
- `supermega-founder-brief`
  - max dispatches per second: `0.2`
  - max concurrent dispatches: `1`
  - max attempts: `5`
  - min backoff: `60s`
  - max backoff: `3600s`

Future env names to use:
- `SUPERMEGA_CLOUD_TASKS_LOCATION`
- `SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT`
- `SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER`
- `SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF`
- `SUPERMEGA_CLOUD_TASKS_SERVICE_ACCOUNT`
- `SUPERMEGA_CLOUD_TASKS_WORKER_URL`

### 2. PostHog

Purpose:
- show what users actually do
- measure funnel drop-off
- feed Growth Loop and Product Loop

What to collect:
- homepage CTA clicks
- contact submissions
- system/example page opens
- proof tool opens
- shared-app onboarding start and finish
- agent-run success and duration

Repo env names already supported:
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

### 3. Sentry

Purpose:
- runtime errors
- performance traces
- release guard signal
- AI/API tracing support

Repo env names already supported:
- `SENTRY_DSN`
- `SUPERMEGA_SENTRY_TRACES`
- `VITE_SENTRY_DSN`

Optional but useful later:
- `SENTRY_AUTH_TOKEN`

### 4. Resend

Purpose:
- contact confirmations
- recovery mail
- invite mail
- rollout notifications

Repo env name already supported:
- `RESEND_API_KEY`

Operational requirements:
- verified sending domain on `supermega.dev`
- sender address such as `hello@supermega.dev`

### 5. Browser sidecar

Purpose:
- narrow browser tasks where there is no API
- persistent sessions for repeated internal work

Preferred options:
1. Browser Use cloud account and API key
2. dedicated Chrome-capable workstation or VM

Recommended future env names:
- `BROWSER_USE_API_KEY`
- `BROWSER_USE_PROFILE_ID`
- `SUPERMEGA_BROWSER_WORKER_URL`

## What else materially improves autonomy

### Observability

- `Logs Viewer`
- `Monitoring Viewer`
- `Error Reporting Viewer`

### Delivery

- one worker service separate from the web service
- one browser worker separate from the normal worker
- queue-first execution path

### Team runtime

- manager invite flow
- role-based workspaces
- automated founder brief
- automated release guard

### Control plane

The company should run as four layers:

1. public company site
2. shared operator app
3. worker services and queues
4. telemetry and alerting

## Procurement order

1. Cloud Tasks
2. PostHog
3. Sentry
4. Resend
5. Browser Use or dedicated browser VM

## Engineering order after provisioning

1. add Cloud Tasks enqueue path
2. deploy dedicated worker service
3. move scheduler jobs from direct execution to queue creation
4. add PostHog events
5. add Sentry browser and backend instrumentation
6. add Resend invite and contact mail
7. add browser-worker path for `Template Clerk` and future automation
