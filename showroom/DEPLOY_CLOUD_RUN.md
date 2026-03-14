# Showroom Cloud Run Deploy

Use this path when `supermega.dev` via GitHub Pages is still unreachable on your network.

## Prerequisites

- `gcloud` CLI installed and authenticated
- Access to your Google Cloud project
- Cloud Run and Cloud Build APIs enabled

## Deploy command

From repo root:

```powershell
.\tools\deploy_showroom_cloud_run.ps1 -ProjectId supermega-468612 -Region asia-southeast1 -Service supermega-showroom -Domain supermega.dev
```

This script:

1. Builds showroom assets
2. Builds/pushes container image with Cloud Build
3. Deploys Cloud Run service
4. Prints service URL and domain mapping next steps

## GitHub Actions deploy (optional)

Workflow: `.github/workflows/showroom-cloud-run.yml`

Required repo secret:

- `GCP_SA_KEY` = JSON key for a service account with Cloud Run + Cloud Build permissions

Then run **Actions -> Deploy Showroom To Cloud Run -> Run workflow** and provide project/region/service inputs.

## Domain mapping

After deploy:

```powershell
gcloud run domain-mappings create --service supermega-showroom --domain supermega.dev --region asia-southeast1
```

Then apply DNS records exactly as returned by:

```powershell
gcloud run domain-mappings describe --domain supermega.dev --region asia-southeast1
```

## Verify

```powershell
curl.exe -I https://supermega.dev
curl.exe -I https://www.supermega.dev
```
