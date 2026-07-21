# >_ SuperMega

SuperMega builds operating software for Myanmar businesses. The product portfolio is deliberately focused:

- **Shop** — sales, catalogue, stock, orders, close, and operating exceptions.
- **Plant** — production jobs, machines, materials, quality, maintenance, and shift handoffs.

`>_` is the operating signature: direct, evidence-led, and ready for action. AI agents prepare work, surface exceptions, and draft decisions; a named person remains accountable for consequential actions.

## Canonical surfaces

| Surface | Domain | Routes | Purpose |
| --- | --- | --- | --- |
| Public site | `supermega.dev` | `/`, `/shop/`, `/plant/`, `/templates/`, `/trust/`, `/contact/`, `/privacy/` | Positioning, product proof, templates, trust, and qualified contact intake |
| Product app | `app.supermega.dev` | `/`, `/shop/`, `/plant/`, `/assist/`, `/setup/`, `/trust/` | Command workspace, Shop, Plant, governed assistance, setup, and controls |

Client-specific deployments, legacy demos, and old product names are not part of the current public or application authority.

## Source authority

- `CURRENT.md` — company, product, domain, context, and release authority.
- `site-manifest.json` — public information architecture, Shop/Plant catalogue, versioning, and redirects.
- `showroom/src/core/CoreApp.tsx` — canonical application experience.
- `api/app.py` — the only Vercel function entrypoint.
- `supermega_runtime/runtime.py` — canonical FastAPI application runtime.
- `supermega_runtime/trial_runtime.py` and `supermega_runtime/trial_store.py` — managed-trial identity, workspace, capability, state, event, and approval boundaries.
- `supermega_runtime/cloud_runtime.py` — bounded hosted agent scheduler.
- `SUPERMEGA_TRIAL_AND_AGENT_OPERATING_MODEL.md` — agent roles and managed-trial controls.
- `SUPERMEGA_LAUNCH_AND_TRIAL_PLAYBOOK.md` — qualification, demo, onboarding, trial, KPI, and communications lifecycle.

## Local verification

Requirements: Node.js 24 and Python 3.12.

```powershell
npm.cmd --prefix showroom ci
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -p 'test_*.py' -v
npm.cmd run app:build
npm.cmd run public:prebuilt
npm.cmd audit --omit=dev
npm.cmd --prefix showroom audit --omit=dev
```

Run the product app locally:

```powershell
npm.cmd run dev
```

## Release policy

Production releases come only from reviewed `main` commits through:

- `.github/workflows/supermega-app-deploy.yml` for `app.supermega.dev` / Vercel project `megaos`.
- `.github/workflows/supermega-public-release.yml` for `supermega.dev` / Vercel project `supermega-public`.

Each workflow builds an immutable preview, verifies its exact release metadata and live routes, promotes that same artifact, verifies production, and rolls back a failed promotion. Direct local production deployment is blocked.

The public contact endpoint also fails closed unless its dedicated idempotency secret and at least one delivery channel are configured. The public release workflow verifies the active Vercel Firewall rule that limits contact POSTs to five requests per IP per ten minutes. The former Cloud Run deployment workflow is retired; Vercel is the sole production owner of both canonical domains.

## Managed-trial boundary

The deployed app is safe to use as an isolated browser-local demo. It is not a customer system of record until the private Supabase schema, dedicated non-`BYPASSRLS` login, signed identity, named memberships, least-privilege capabilities, immutable audit, backup, restore, acceptance, and human approval gates pass.

Follow `docs/supermega-enterprise-activation.md`. Managed writes default to disabled and fail closed.
