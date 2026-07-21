# >_ SuperMega product app

This package is the canonical application for `app.supermega.dev`. It is a focused operating workspace for SuperMega Shop and Plant, not the public marketing site and not a client-specific deployment.

## Routes

- `/` — Command: priorities, work, evidence, and the five-role company agent desk.
- `/shop/` — sales, catalogue, stock, orders, close, and exceptions.
- `/plant/` — jobs, machines, materials, quality, maintenance, and handoffs.
- `/assist/` — evidence-grounded briefs, drafts, and approval-ready recommendations.
- `/setup/` — Shop/Plant template selection and bounded workspace configuration.
- `/trust/` — demo boundaries, managed-trial gates, human authority, and controls.

All routes share the `>_` terminal design system and responsive application shell.

## Core files

- `src/core/CoreApp.tsx` — product model, navigation, state, workflows, and agent desk.
- `src/core/core-app.css` — shared responsive visual system.
- `src/App.tsx` — canonical app mount.
- `src/main.tsx` and `src/index.css` — runtime and global foundation.
- `scripts/prepare-static-routes.mjs` — six-route static shell preparation.

## Run and verify

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

From the repository root, `npm.cmd run app:build` also generates release metadata and runs the application, workflow, and security contracts.

## Data and action boundary

The default experience uses reversible browser-local sample state. It makes no claim of durable customer persistence or autonomous consequential action. Managed state is available only through the server-mediated `/api/trial/v1` contract after every activation gate passes; browser code never receives the database URL, service role, or identity-signing secret.

## Deployment

- Vercel project: `megaos`
- Production domain: `app.supermega.dev`
- Release workflow: `.github/workflows/supermega-app-deploy.yml`
- Required release proof: `/__release.json` identifies `supermega-app` and the exact reviewed commit.

Do not deploy this package directly to production. The verified GitHub workflow is the release authority.
