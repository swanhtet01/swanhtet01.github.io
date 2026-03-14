# SuperMega Showroom

Public conversion-oriented showroom for `supermega.dev`.

## Stack

- React 19
- TypeScript
- Tailwind CSS v4
- Vite
- React Router

## Information Architecture

- `/`
- `/solutions`
- `/packages`
- `/case-studies`
- `/dqms`
- `/about`
- `/contact`

## Local run

```powershell
cd showroom
npm ci
npm run dev
```

## Production build

```powershell
cd showroom
npm run build
```

Build script also creates:

- `dist/404.html`
- route-level `index.html` files for static hosting route checks

## Lead form behavior

- If `VITE_LEAD_ENDPOINT` is configured, form posts JSON to endpoint.
- If not configured, form falls back to prefilled `mailto:` lead delivery.

## Deployment

- Workflow: `.github/workflows/showroom-pages.yml`
- Artifact: `showroom/dist`
- Custom domain: `supermega.dev`
- Fallback host: Google Cloud Run via `showroom/Dockerfile` and `tools/deploy_showroom_cloud_run.ps1`
- Cloud Run guide: `showroom/DEPLOY_CLOUD_RUN.md`
- Optional CI deploy workflow: `.github/workflows/showroom-cloud-run.yml` (requires `GCP_SA_KEY` secret)
