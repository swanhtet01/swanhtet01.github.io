# >_ SuperMega product app

This package is the canonical application for `app.supermega.dev`. It is one compact company system: Today, Teams, and Operations, with Settings as a utility. It is not the public marketing site, an agent showcase, or a client-specific deployment.

## Routes

- `/` - Today: company work, orders, production exceptions, release readiness, briefs, and owner decisions.
- `/work/?team=product&view=board` - Product, Engineering, Growth, and Finance workspaces with outcomes, lifecycle, owners, evidence, decisions, and release checks.
- `/operations/commerce/?tab=today` - Website and customer-channel orders, accountable confirmation, fulfilment, inventory, local payment status, and close.
- `/operations/production/?tab=today` - Production plan, output, quality, materials, equipment, maintenance, and issues.
- `/settings/` - compact pilot definition, evidence export, reset, runtime readiness, and authority boundaries.

Capability is organized through internal views rather than more routes. Legacy Shop, Plant, Ecommerce, Agents, Assist, Setup, and Trust URLs redirect into the canonical areas. Website remains the only local product prototype, and its order handoff is completed inside Commerce rather than a second order app.

## Core files

- `src/core/CoreApp.tsx` - shell, Today, Commerce, Production, settings, and shared primitives; it consumes the root `site-manifest.json` workflow profiles directly.
- `src/core/managed-trial.ts` - lazy Supabase named-user session and the tenant-scoped approval API client.
- `src/core/TeamWorkspace.tsx` and `src/core/team-work.ts` - company-team workflow, Product lifecycle, decisions, and browser-local state.
- `src/core/core-app.css` - compact responsive application system.
- `src/App.tsx` - canonical route mount and legacy redirects.
- `scripts/prepare-static-routes.mjs` - canonical static shell preparation.

## Run and verify

```powershell
npm.cmd ci
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

From the repository root, `npm.cmd run app:build` also generates release metadata and runs the application, workflow, security, and HQ contracts.

## Data and action boundary

The default experience uses reversible browser-local sample state. It makes no claim of durable customer persistence or autonomous consequential action. Consequential Commerce and Production changes pause for a named human operator, reason, and evidence reference before they mutate local state, and the resulting before/after record stays in a compact action history. Product proposals also require a named human reviewer, decision note, and evidence reference before acceptance. Owner approvals open one native-modal `decision_packet.v1` review with a versioned subject; fact-or-analysis claims; source, capture time, status, uncertainty, and visibility; baseline, target, current result, acceptance rule, artifact reference, named human reviewer, and decision note. Stale packets are superseded by fingerprint, and unattributed legacy decisions reopen for review. The queue is part of Today rather than another page. Pilot evidence export v9 includes API-compatible managed approval requests, those decisions, accountable actions, the selected workflow profile, and structured team evidence. Work cannot be marked done and release checks cannot be completed without verified evidence.

Managed approvals activate only after every runtime gate passes. The browser signs in with a Supabase publishable or legacy anon key, while the API independently verifies the user token and authorizes the nominated workspace through private membership, capabilities, and RLS. It never trusts browser-supplied actor roles, auto-provisions a member, or exposes the database URL, service role, or identity-signing secret. Required client values are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy `VITE_SUPABASE_ANON_KEY` is accepted), and `VITE_SUPERMEGA_TRIAL_WORKSPACE_ID`; the API uses the equivalent server values plus the gated managed database configuration.

Before activation, the pilot definition records the entry point, current operating record, baseline, target outcome, responsible owner, human authority boundary, and acceptance evidence.

## Deployment

- Vercel project: `megaos`
- Production domain: `app.supermega.dev`
- Release workflow: `.github/workflows/supermega-public-release.yml` coordinates the app and public domains; `.github/workflows/supermega-app-deploy.yml` is a non-deploying guard.
- Required release proof: both `/__release.json` endpoints identify the exact reviewed commit, brand, context, and catalogue versions.

Do not deploy this package directly to production. The verified GitHub workflow is the release authority.
