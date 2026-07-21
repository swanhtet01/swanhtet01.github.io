# SuperMega documentation authority

Read documents in this order. A lower item cannot override a higher one.

1. `CURRENT.md` — company, product, domains, routes, current state, and release authority.
2. `site-manifest.json` — versioned public brand, catalogue, pages, templates, and redirects.
3. `BRAND.md` — shared `>_` identity, visual tokens, voice, and interface rules.
4. `POSITIONING.md` — product category, customer, differentiation, proof, and calls to action.
5. `STRATEGY.md` — product lifecycle, template model, roadmap, feature gates, and R&D.
6. `PLATFORM.md` — system boundaries, internal AI-company roles, control plane, and scale model.
7. `SUPERMEGA_TRIAL_AND_AGENT_OPERATING_MODEL.md` — trial authority, agent boundaries, activation, and scorecard.
8. `SUPERMEGA_LAUNCH_AND_TRIAL_PLAYBOOK.md` — qualification, demo, onboarding, lifecycle, KPIs, communication, and claims.
9. `docs/supermega-enterprise-activation.md` — read-only Supabase proof and managed-trial handoff.
10. `README.md` and `showroom/README.md` — repository and product-app operation.

Code authority:

- Public generator: `tools/create_public_vercel_output.mjs`
- Product UI: `showroom/src/core/`
- Vercel API entrypoint: `api/app.py`
- Application runtime: `supermega_runtime/runtime.py`
- Managed trial: `supermega_runtime/trial_runtime.py`, `supermega_runtime/trial_store.py`, and `supabase/migrations/`
- Hosted agents: `supermega_runtime/cloud_runtime.py`
- Releases: `.github/workflows/supermega-public-release.yml` and `.github/workflows/supermega-app-deploy.yml`

Historical material is available through Git history. It is not current product context and must not be used to generate pages, claims, routes, plans, or deployments.
