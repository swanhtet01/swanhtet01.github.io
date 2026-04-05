# Yangon Tyre Plant A access and launch checklist

## Goal

Launch a shared Plant A desk at `ytf.supermega.dev` for managers and team members.

## Fastest path

1. Grant the deployment service account the required project roles.
2. Enable the required Google Cloud APIs.
3. Create the runtime secrets.
4. Deploy the app to Cloud Run in `asia-southeast1`.
5. Map `ytf.supermega.dev` to the Cloud Run service.
6. Point Squarespace DNS for `ytf.supermega.dev`.
7. Turn on Google Workspace email auth for `supermega.dev`.
8. Add Stripe test keys only after the app host is live.

## Service account

Principal:

- `super-mega-dev-team@supermega-468612.iam.gserviceaccount.com`

Grant these roles at the project level for the fastest path:

- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/artifactregistry.admin`
- `roles/secretmanager.admin`
- `roles/cloudsql.admin`
- `roles/serviceusage.serviceUsageAdmin`

## APIs to enable

- `run.googleapis.com`
- `cloudbuild.googleapis.com`
- `artifactregistry.googleapis.com`
- `secretmanager.googleapis.com`
- `sqladmin.googleapis.com`
- `serviceusage.googleapis.com`

## GitHub secrets

- `GCP_SA_KEY`
- `SUPERMEGA_APP_USERNAME`
- `SUPERMEGA_APP_PASSWORD`
- `SUPERMEGA_DATABASE_URL`
- `VITE_GOOGLE_MAPS_API_KEY`
- `OPENAI_API_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

## GitHub variables

- `VITE_WORKSPACE_APP_BASE=https://ytf.supermega.dev`
- `VITE_WORKSPACE_API_BASE=https://ytf.supermega.dev`
- `VITE_BOOKING_URL=https://cal.com/...`
- `SUPERMEGA_APP_DISPLAY_NAME=Yangon Tyre Plant A`
- `SUPERMEGA_APP_ROLE=owner`
- `SUPERMEGA_WORKSPACE_SLUG=ytf-plant-a`
- `SUPERMEGA_WORKSPACE_NAME=Yangon Tyre Plant A`
- `SUPERMEGA_WORKSPACE_PLAN=plant`
- `SUPERMEGA_SESSION_HOURS=336`
- `SUPERMEGA_CORS_ORIGINS=https://ytf.supermega.dev`

## Squarespace DNS

Use the exact DNS records returned by the Cloud Run domain mapping step for `ytf.supermega.dev`.

At minimum this should be a `CNAME` for:

- host: `ytf`
- value: Cloud Run mapping target

If Google returns additional verification records, add them too.

## Google Workspace

Set up:

- sender mailbox or alias: `ops@supermega.dev`
- SPF
- DKIM
- later DMARC

## Stripe

Start with:

- test secret key
- test webhook signing secret

Do not switch to live billing until the Cloud Run host, email recovery, and webhook handling are verified end to end.

## First launch values for Plant A

- Product name shown to users: `Yangon Tyre Plant A`
- Shared workspace slug: `ytf-plant-a`
- Main public routes:
  - `/receiving`
  - `/task-list`
  - `/login`

## Success condition

Managers can open `ytf.supermega.dev`, sign in, and land in the same shared Plant A workspace instead of separate personal workspaces.
