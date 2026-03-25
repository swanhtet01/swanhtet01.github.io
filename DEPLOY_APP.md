# SuperMega App Deploy

This deploy path serves the public website and the API from one app.

## What it gives you

- one URL for the site and the backend
- saved data in the server-side state store
- working free tools and workspace views from the same app
- a cleaner production path than running the site and API separately

## Local container run

```powershell
docker compose -f .\docker-compose.app.yml up --build
```

Then open:

- `http://localhost:8787`

Saved data is stored in the named Docker volume `supermega-app-data`.

## Cloud Run deploy

Use the workflow:

- `.github/workflows/supermega-app-cloud-run.yml`

Required secret:

- `GCP_SA_KEY`

Default runtime env:

- `SUPERMEGA_SITE_ROOT=/app/showroom/dist`
- `SUPERMEGA_PILOT_DATA=/app/pilot-data`

## Current limitation

Cloud Run alone does not give you durable SQLite storage. For real multi-user persistence you should move the state store to a managed database next, or mount persistent storage on a VM/container host instead of using purely ephemeral Cloud Run storage.
