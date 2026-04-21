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
- `Spa Service Desk` is the current single-site service-retail wedge for checkout, appointments, expenses, and daily close.

## Service Desk pilot

Key route:

- `/app/service-desk`

What is already self-serve:

- Configure business name, sector, currency, and opening cash float in the UI
- Add services, staff members, and same-day appointments in the UI
- Export and import JSON snapshots so the single-site pilot can be moved or versioned

Core files:

- `showroom/src/pages/ServiceDeskPage.tsx`
- `showroom/src/lib/serviceRetailDesk.ts`
- `showroom/SERVICE_DESK_RUNBOOK.md`

If you are running from Bash on Windows or inside Codex and `npm.cmd` behaves badly, use:

```powershell
cmd.exe /c npm run build
```

## Deployment

- Workflow: `.github/workflows/showroom-pages.yml`
- Artifact: `showroom/dist`
- Custom domain: `supermega.dev`
- Fallback host: Google Cloud Run via `showroom/Dockerfile` and `tools/deploy_showroom_cloud_run.ps1`
- Cloud Run guide: `showroom/DEPLOY_CLOUD_RUN.md`
- Optional CI deploy workflow: `.github/workflows/showroom-cloud-run.yml` (requires `GCP_SA_KEY` secret)

### Vercel production path

```powershell
cd "C:\Users\swann\OneDrive - BDA\Super Mega Inc\supermega-platform"
cmd.exe /c "set npm_config_cache=%TEMP%\vercel-npm-cache-codex&& npx vercel deploy --prod -y --scope swanhtet01s-projects"
```

Current live production deployment URL:

- `https://supermega-platform-e8m5xhiho-swanhtet01s-projects.vercel.app`

If `supermega.dev` is still serving the old GitHub Pages site, the apex DNS is not cut over yet. The minimum fix Vercel requested is:

- `A supermega.dev 76.76.21.21`

Alternative:

- move the domain nameservers to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`
