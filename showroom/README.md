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
- `/find-companies`
- `/company-list`
- `/task-list`
- `/book`
- `/login`
- `/app/*`

Minimal redirects still supported:

- `/lead-finder` -> `/find-companies`
- `/workspace` -> `/company-list`
- `/action-os` -> `/task-list`

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

## Public tool behavior

- `Find Companies` searches public business sources and can save kept rows into `Company List`.
- `Company List` stores saved companies and lead notes.
- `Task List` turns messy updates into a short daily queue.

## Deployment

- Workflow: `.github/workflows/showroom-pages.yml`
- Artifact: `showroom/dist`
- Custom domain: `supermega.dev`
- Fallback host: Google Cloud Run via `showroom/Dockerfile` and `tools/deploy_showroom_cloud_run.ps1`
- Cloud Run guide: `showroom/DEPLOY_CLOUD_RUN.md`
- Optional CI deploy workflow: `.github/workflows/showroom-cloud-run.yml` (requires `GCP_SA_KEY` secret)
