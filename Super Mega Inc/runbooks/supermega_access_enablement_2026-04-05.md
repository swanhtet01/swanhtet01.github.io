# SuperMega access enablement

## What is already done

- GCP project roles for the deployment service account
- core Google Cloud APIs enabled

## What still must be provided

### 1. GitHub Actions secrets

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

### 2. GitHub Actions variables

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

### 3. DNS control

Need the ability to add:

- apex domain records for `supermega.dev`
- subdomain records like `ytf.supermega.dev`
- verification records from Google Cloud custom domain mapping

### 4. Email setup

Need:

- sender address like `hello@supermega.dev`
- SPF
- DKIM

### 5. Billing and analytics

Need:

- Stripe secret and webhook secret
- PostHog key and host
- Sentry DSN

### 6. Sample customer data

Need 3-5 anonymized examples of:

- company lists
- messy team updates
- receiving or issue logs

## Immediate operator rule

Do not add these only in local `.env` files. Put the production values into GitHub Actions secrets and variables so the deploy workflows can actually use them.
