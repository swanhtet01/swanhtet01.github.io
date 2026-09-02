# >_ SuperMega

SuperMega builds operating software for Myanmar businesses. The product portfolio is deliberately focused:

- **Shop** — channel orders, catalogue, stock, fulfilment, payment status, close, and operating exceptions.
- **Plant** — jobs, output, equipment observations, materials, quality, maintenance, and shift handoffs.
- **Website** — a finite, reviewable business website and retained site artifact.
- **Ecommerce** — a Shop-backed storefront and accountable customer-request handoff.

`>_` is the operating signature: direct, evidence-led, and ready for action. AI assistance is shared infrastructure inside the four products, not a fifth product; a named person remains accountable for consequential actions.

## Canonical surfaces

| Surface | Domain | Routes | Purpose |
| --- | --- | --- | --- |
| Public site | `supermega.dev` | `/`, `/contact/`, `/privacy/` | One product story, trust boundary, qualified contact intake, and privacy |
| Product app | `app.supermega.dev` | `/`, `/shop/`, `/plant/`, `/website/`, `/ecommerce/`, `/work/`, `/settings/` | Four customer products plus internal HQ, setup, evidence, and controls |

Client-specific deployments, legacy demos, and old product names are not part of the current public or application authority.

## Source authority

- `DESIGN.md` — portable product-door, design-loop, review-rubric, and
  rendered-evidence contract for agents and human reviewers; detailed design
  history remains in `hq/strategy/DESIGN-PROGRAM.md`.
- `CURRENT.md` — company, product, domain, context, and release authority.
- `site-manifest.json` — canonical four-product registry, workflow templates, shared-capability boundary, versioning, and legacy redirects.
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
npm.cmd run app:build:checked
npm.cmd run public:prebuilt
npm.cmd audit --omit=dev
npm.cmd --prefix showroom audit --omit=dev
```

Run the product app locally:

```powershell
npm.cmd run dev
```

This starts the canonical FastAPI runtime and Vite together on loopback (`127.0.0.1:8788` and `127.0.0.1:5173`). The default command clears database, hosted-auth, model, and external-worker configuration, so managed writes remain disabled. Use the separately gated rehearsal workflow for any managed database testing.

## Release policy

Production releases come only from reviewed `main` commits through:

- `.github/workflows/supermega-public-release.yml`, the single coordinated release owner for `app.supermega.dev` / `megaos` and `supermega.dev` / `supermega-public`.
- `.github/workflows/supermega-app-deploy.yml`, a non-deploying guard that reruns the shared runtime, RLS, and paired-release contracts when app paths change.

The coordinated workflow builds both immutable candidates, verifies matching commit, brand, context, and catalogue identity, promotes both, verifies production as a pair, and rolls both domains back if either verification fails. Direct local production deployment is blocked.

The public contact endpoint also fails closed unless its dedicated idempotency secret and at least one delivery channel are configured. Durable lead records include a SHA-256 payload fingerprint, so same-payload retries remain idempotent while changed cold-start replays conflict. The public release workflow verifies the active Vercel Firewall rule that limits contact POSTs to five requests per IP per ten minutes. The former Cloud Run deployment workflow is retired; Vercel is the sole production owner of both canonical domains.

## Managed-trial boundary

The deployed app is safe to use as an isolated browser-local demo. It is not a customer system of record until the historical schema v1 and additive v2 migration are rehearsed on non-production data and the dedicated non-`BYPASSRLS` login, high-entropy signed identity, named memberships, least-privilege capabilities, immutable audit, backup, restore, acceptance, and human approval gates pass.

Follow `docs/supermega-enterprise-activation.md`. Managed writes default to disabled and fail closed.
