# SuperMega current direction

Last confirmed: 2026-07-22
Authority: this file and `site-manifest.json`

SuperMega builds Shop and Plant: operating software for Myanmar businesses, with governed AI assistance inside the workflows.

## Public company surface

- `supermega.dev` is the company front door and the only public source of company positioning.
- Shop and Plant are the two core products. Their isolated demonstrations live at `app.supermega.dev/shop/` and `app.supermega.dev/plant/`.
- Governed assistance lives at `app.supermega.dev/assist/` and is a capability inside those product records, not a separate catalogue.
- AI is a capability inside Shop and Plant. It is not a separate public product or catalogue.
- Public pricing is intentionally omitted. Scope follows the workflow, deployment, data, and support boundary.
- The public brand is SuperMega with the blue-and-green `>_` terminal mark.

## Canonical public routes

- `/`
- `/shop/`
- `/plant/`
- `/templates/`
- `/trust/`
- `/contact/`
- `/privacy/`

Everything else is either an application domain, an internal system, or a retired public route. Redirect policy is defined in `site-manifest.json` and enforced by the generated Vercel artifact.

## Product lifecycle

### Shop

Status: verified release candidate for an isolated demo at `app.supermega.dev/shop/`. Production remains unchanged until the guarded release is promoted.

1. Select a Shop template.
2. Configure branches, roles, catalogue, payment methods, and operating rules.
3. Import or enter opening data.
4. Run an acceptance pilot with daily close and recovery checks.
5. Go live with monitoring, backups, and a named support boundary.
6. Add governed AI assistance only after the underlying workflow is stable.

### Plant

Status: verified release candidate for a generic demo at `app.supermega.dev/plant/`. Managed workspace activation remains locked behind the trial gates.

1. Map plant, lines, machines, products, shifts, and approvals.
2. Configure planning, production records, materials, quality, maintenance, and handoffs.
3. Import approved operational data.
4. Run role-based acceptance with managers and floor operators.
5. Go live by plant or line, with audit and recovery controls.
6. Add governed summaries, anomaly detection, and draft actions behind human approval.

## Internal systems

Foundry, Ops, Console, agent runtimes, lead operations, and machine coordination are internal capabilities. They must not be represented as public products or mixed into the public navigation.

The operating authority for internal agents and trial activation is `SUPERMEGA_TRIAL_AND_AGENT_OPERATING_MODEL.md`. The customer acquisition, demo, onboarding, trial, evidence, and communications lifecycle is `SUPERMEGA_LAUNCH_AND_TRIAL_PLAYBOOK.md`. These documents complement this direction; neither can override the release or managed-write gates below.

## Retired public context

All previous product names, client-branded deployments, historical demos, and case-specific pages are retired from public authority. They must not enter generated pages, the canonical app source, or the deployable API runtime.

## Application authority

- Canonical host: `app.supermega.dev`
- Canonical routes: `/`, `/shop/`, `/plant/`, `/assist/`, `/setup/`, `/trust/`
- Vercel project: `megaos`
- Workflow: `.github/workflows/supermega-app-deploy.yml`
- Release verification: `https://app.supermega.dev/__release.json` must identify `supermega-app` and the released commit.
- The app may run as an isolated browser demo without managed persistence. It must not claim enterprise readiness until managed Postgres, workspace isolation, source coverage, backup, and recovery checks pass.
- The managed trial contract is `/api/trial/v1`: Command, Shop, Plant, Setup, versioned state, immutable events, capabilities, and approvals. It fails closed until its private schema, trusted identity, membership, audit, and write gates pass.
- The only approved database handoff is the read-only, fail-closed process in `docs/supermega-enterprise-activation.md`; managed writes remain disabled until its role, RLS, recovery, acceptance, and human-approval evidence passes.

## Release authority

- Source branch: `main`
- Workflow: `.github/workflows/supermega-public-release.yml`
- Vercel project: `supermega-public`
- Production verification: `https://supermega.dev/__release.json` must match the released commit and the versions in `site-manifest.json`.
- Contact intake requires application idempotency controls plus the active Vercel Firewall rule verified by `tools/verify_public_firewall_state.mjs`.
- Direct local production deployment is blocked. The verified GitHub workflow is the only release path.
