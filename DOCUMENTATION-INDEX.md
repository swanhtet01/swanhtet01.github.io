# SuperMega documentation map

Updated: 2026-10-22

This map separates direction, volatile status, working rules, implementation,
and historical evidence. A lower source cannot silently widen a higher source.

## Active authority

After the current owner/task instructions, read:

1. [`supergoal.md`](supergoal.md) — company north star, current Shop-only scope,
   ownership, evidence standard, and launch definition.
2. [`CURRENT.md`](CURRENT.md) — dated candidate identity, verified evidence,
   open gates, and next action. It cannot change the goal.
3. [`AGENTS.md`](AGENTS.md) — repository-wide execution and safety contract.
4. The nearest nested `AGENTS.md` — additional product/subtree rules; currently
   [`mobile/shop_pos/AGENTS.md`](mobile/shop_pos/AGENTS.md).
5. [`SKILLS.md`](SKILLS.md) — capability routing and handoff templates. It is
   guidance, not an installed tool or permission source.

## Shop build and acceptance

- [`mobile/shop_pos/README.md`](mobile/shop_pos/README.md) — implemented native
  flows, configuration, platform evidence, and developer commands.
- [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md) — preview,
  device, hardware, merchant, commercial, review, go/no-go, and rollback gates.
- [`docs/FOUNDER-OPERATING-MODEL.md`](docs/FOUNDER-OPERATING-MODEL.md) — Swan and
  Vivian decision ownership and technical/operations handoffs.
- [`docs/product-operating-principles.md`](docs/product-operating-principles.md)
  — durable product, architecture, cost, quality, and R&D principles.
- [`DESIGN.md`](DESIGN.md) — design/review contract where it remains applicable
  to the active Shop interface.

Exact implementation truth comes from the source, tests, active PR, generated
artifact metadata, and CI at the named revision. A prose status line never
overrides those receipts.

## Active machine sources

- Native Shop app: `mobile/shop_pos/lib/`
- Native Shop tests: `mobile/shop_pos/test/`
- Native CI: `.github/workflows/shop-native-ci.yml`
- Public Shop build: `tools/create_public_vercel_output.mjs`
- Gallery provenance: `tools/public_native_shop_gallery.mjs`
- Public verification: `tools/verify_public_vercel_output.mjs`,
  `tools/verify_public_vercel_artifact_budget.mjs`, and related contracts
- Public/Vercel release workflow: `.github/workflows/supermega-public-release.yml`
  (not a native signing or distribution path)

The existence of a workflow does not grant permission to dispatch it or prove
that its artifacts are signed, deployed, or accepted.

## Coordination records

The owner-designated Operations Hub holds human decisions, responsibilities,
and merchant/commercial acceptance. The active GitHub PR holds code review and
candidate status. Link those records rather than reproducing them here.

## Historical and parked material

The following are retained for architecture history, older products, research,
or possible later reactivation; they are not current launch authority:

- `STRATEGY.md`, `PLATFORM.md`, `POSITIONING.md`, and the older broad portfolio
  sections of `site-manifest.json`;
- `SUPERMEGA_TRIAL_AND_AGENT_OPERATING_MODEL.md` and
  `SUPERMEGA_LAUNCH_AND_TRIAL_PLAYBOOK.md`;
- older `hq/NOW.md`, `hq/WORKBOARD.md`, and `hq/strategy/` plans;
- `Super Mega Inc/`, `agent_os/`, `hyper_unicorn/`, and earlier company/agent
  experiments;
- Plant, Website/Sites, Ecommerce/Commerce, Spa, SOL, and client-specific
  product material while the Shop-only focus is active.

Historical material may explain an invariant or supply research. Before using
it, verify the current code and active goal. Do not execute old deployment,
IAM, infrastructure, customer-contact, or release instructions merely because
they remain in the repository.

Git history preserves superseded versions. New status should update
`CURRENT.md`; new durable direction should update `supergoal.md`; new working
method should update the applicable `AGENTS.md`.
