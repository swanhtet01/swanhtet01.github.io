# SuperMega access and launch checklist

## Objective

Give the SuperMega dev/deploy loop enough control to operate as a real company:

- live backend
- durable database
- booking
- analytics
- recovery and outbound email
- billing

## Already done

- GCP IAM for the deployment service account
- core Google Cloud APIs
- Cloud SQL instance:
  - `supermega-app-db`
- Cloud SQL database:
  - `supermega`
- Cloud SQL app user:
  - `supermega_app`
- Secret Manager values for:
  - app username
  - app password
  - OpenAI key
  - Google Maps key
  - Google Places key
  - database URL

## Actual blocker now

The service account can reach Cloud Run, Cloud SQL, Artifact Registry, and Secret Manager.

The current hard blocker is Cloud Build source upload:

- `gcloud builds submit` is failing because the service account cannot write to the Cloud Build staging bucket

What to add to `super-mega-dev-team@supermega-468612.iam.gserviceaccount.com`:

- `Storage Admin`

If you want the narrower version instead:

- grant object write access on the Cloud Build staging bucket that backs `supermega-468612_cloudbuild`

## What to set next in GitHub

### Repository secrets

- `GCP_SA_KEY`
- `SUPERMEGA_APP_USERNAME`
- `SUPERMEGA_APP_PASSWORD`
- `SUPERMEGA_DATABASE_URL`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `VITE_GOOGLE_MAPS_API_KEY`

### Repository variables

- `VITE_BOOKING_URL`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_WORKSPACE_APP_BASE`
- `VITE_WORKSPACE_API_BASE`
- `SUPERMEGA_APP_DISPLAY_NAME`
- `SUPERMEGA_APP_ROLE`
- `SUPERMEGA_WORKSPACE_SLUG`
- `SUPERMEGA_WORKSPACE_NAME`
- `SUPERMEGA_WORKSPACE_PLAN`
- `SUPERMEGA_SESSION_HOURS`
- `SUPERMEGA_CORS_ORIGINS`
- `SUPERMEGA_CLOUDSQL_INSTANCE`

## Cloud SQL target

Recommended first production database:

- engine: PostgreSQL
- region: `asia-southeast1`
- db name: `supermega`
- app user: `supermega_app`

Connection string format:

- `postgresql+psycopg://USER:PASSWORD@/DBNAME?host=/cloudsql/PROJECT:REGION:INSTANCE`

## Domain and DNS

### What is needed

- control of `supermega.dev`
- ability to add:
  - `CNAME`
  - `TXT`
  - any Google verification records needed for custom domain mapping

### Suggested split

- `supermega.dev`: public website
- `app.supermega.dev`: shared live app host
- customer subdomains later:
  - `ytf.supermega.dev`
  - other customer-specific subdomains only after the shared app host is stable

## Google Workspace

Need one real sender identity:

- `hello@supermega.dev` or `ops@supermega.dev`

Need:

- SPF
- DKIM
- later DMARC

Use cases:

- onboarding recovery mail
- support replies
- rollout mail

## Stripe

Need:

- test secret key
- webhook signing secret

Use first for:

- one-off setup payment
- later recurring plans

## PostHog

Need:

- project API key
- host

Use to measure:

- first-use funnel
- company search runs
- kept companies
- company list imports
- task list imports
- booking clicks

## Recommended first ICP and offers

### ICP

1. owner-led distributors/importers in Myanmar
2. factories after that

### First public tools

1. `Find Companies`
2. `Company List`
3. `Task List`

### First paid offers

1. `Sales Setup`
2. `Operations Setup`

## Sample data to collect

Drop 3-5 anonymized examples into:

- `C:\\Users\\swann\\OneDrive - BDA\\SuperMega Onboarding\\sample-data\\company-lists`
- `C:\\Users\\swann\\OneDrive - BDA\\SuperMega Onboarding\\sample-data\\team-updates`
- `C:\\Users\\swann\\OneDrive - BDA\\SuperMega Onboarding\\sample-data\\receiving-logs`

## Operational model to equip

### Runtime

- Cloud Run
- Cloud SQL Postgres
- Secret Manager
- Cloud Tasks

### Business ops

- Stripe
- Resend
- PostHog
- Sentry

### Product/dev

- Playwright
- smoke scripts
- one deploy workflow for the app host

### Agent loops

- Revenue Scout
- List Clerk
- Task Triage
- Founder Brief
- Release Guard

## Immediate next sequence

1. Add GitHub secrets and variables.
2. Create Cloud SQL.
3. Deploy Cloud Run app host.
4. Map `app.supermega.dev`.
5. Add booking URL.
6. Add PostHog.
7. Add Resend.
8. Add Stripe.
