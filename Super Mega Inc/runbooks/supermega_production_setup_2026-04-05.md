# SuperMega production setup

## Purpose

This is the single production setup checklist for the shared SuperMega deployment.

## Infrastructure

- Google Cloud Run
- Cloud SQL Postgres
- Artifact Registry
- Secret Manager
- GitHub Actions

## GitHub repository secrets

- `GCP_SA_KEY`
- `SUPERMEGA_APP_USERNAME`
- `SUPERMEGA_APP_PASSWORD`
- `SUPERMEGA_DATABASE_URL`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_POSTHOG_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SENTRY_DSN`

## GitHub repository variables

- `VITE_BOOKING_URL`
- `VITE_POSTHOG_HOST`
- `VITE_SENTRY_DSN`
- `VITE_WORKSPACE_APP_BASE`
- `VITE_WORKSPACE_API_BASE`
- `SUPERMEGA_CLOUDSQL_INSTANCE`
- `SUPERMEGA_APP_DISPLAY_NAME`
- `SUPERMEGA_APP_ROLE`
- `SUPERMEGA_WORKSPACE_SLUG`
- `SUPERMEGA_WORKSPACE_NAME`
- `SUPERMEGA_WORKSPACE_PLAN`
- `SUPERMEGA_SESSION_HOURS`
- `SUPERMEGA_CORS_ORIGINS`
- `SUPERMEGA_SENTRY_TRACES`

## Minimum first market

- owner-led distributors and importers in Myanmar
- then factories

## Public tools

- `Find Companies`
- `Company List`
- `Task List`

## Managed offers

- `Sales Setup`
- `Operations Setup`

## Runtime checks

- Cloud Run service returns `200` on `/api/health`
- public pages return `200`
- auth works
- first shared save works
- analytics key is present
- Sentry DSN is present
- recovery mail sender is configured

## Delivery rule

One deploy mechanism only:

- Cloud Run for the real app and API
- GitHub Pages only for the public brochure shell until Cloud Run becomes the primary public host
