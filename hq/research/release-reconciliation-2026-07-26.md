# SuperMega release reconciliation

Evidence captured: 2026-07-26  
Mode: read-only provider audit plus local documentation  
Repository: `swanhtet01/swanhtet01.github.io`  
Integration branch: `agent/supermega-release-candidate`

## Release decision

The only canonical customer release pair remains:

1. `supermega.dev` from Vercel project `supermega-public`.
2. `app.supermega.dev` from Vercel project `megaos`.

Shop, Plant, Website, and Ecommerce belong under the canonical app as product paths. They are not separate Vercel projects or product domains.

Both live domains still serve GitHub `main` checkpoint `6885c3201d523d42d176c3dcd91de28dc1e17f6f`. The validated local four-product candidate is not on GitHub or Vercel and must not be described as live.

## GitHub evidence

- Pull request: [#258 - Simplify SuperMega products and harden managed delivery](https://github.com/swanhtet01/swanhtet01.github.io/pull/258).
- State: open draft, mergeable, unmerged; base `main`; head `agent/supermega-release-candidate`.
- Live `main`: `6885c3201d523d42d176c3dcd91de28dc1e17f6f`.
- Remote pull-request head: `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef`.
- Audited implementation checkpoint: `784379e3a13e1ad9366cca70816675b692063702`.
- Local checkout at audit time: clean on the integration branch.
- Fast-forward relation to the remote pull-request head: 0 commits behind and 192 commits ahead.
- Fast-forward relation to live `main`: 0 commits behind and 238 commits ahead.
- Change surface from the remote pull-request head: 120 files changed, 39,567 insertions, and 4,132 deletions.
- `git ls-remote` independently confirmed the same `main` and pull-request branch SHAs.
- PR #258 currently reports passing `validate` and GitGuardian checks. Those checks cover remote checkpoint `338b6fd`, not the 192 local commits.

The draft PR metadata still describes the older three-product naming and checkpoint. It should be updated only after the candidate is pushed and fresh checks establish the exact review surface.

## Vercel and live HTTP evidence

| Domain | HTTP result | Canonical project | Production deployment | Git checkpoint |
| --- | --- | --- | --- | --- |
| `supermega.dev` | 200; `SuperMega \| Operating software for real company work` | `supermega-public` | `dpl_Dc5U4M2fXkob3KejYAYDv4jAjEw1` | `6885c320` |
| `app.supermega.dev` | 200; `Today \| SuperMega` | `megaos` | `dpl_FL5eESWF2vGJffydGAVNA4vPQzdp` | `6885c320` |

Both deployments are `READY`, target production, were created on 2026-07-23, and identify repository `swanhtet01/swanhtet01.github.io`, ref `main`, and exact commit `6885c320`.

The Vercel account also contains similarly named projects. They are not customer release authority:

- `supermega-platform` and `swanhtet01.github.io` most recently built old checkpoint `3d1d9e3` and expose only Vercel-generated domains.
- `supermega-demo` serves the separate legacy `demo.supermega.dev` surface from checkpoint `a62273d`; it is not the canonical app.
- No deletion, relinking, alias, or domain change is part of this audit. Decommissioning should happen only after the canonical release is accepted and rollback evidence is retained.

## Single next safe integration action

After explicit founder approval, perform one normal fast-forward-only push of the then-current local `agent/supermega-release-candidate` tip to the same remote branch for PR #258.

Immediately before the push:

1. print the exact local SHA;
2. re-read the remote branch SHA;
3. prove remote `338b6fd11bc27da9b7aa42bee2c293a5c0e3a9ef` is still an ancestor of that local tip; and
4. require a clean worktree.

Do not force push. Do not merge, deploy, promote, change aliases or domains, edit environment variables, write hosted data, or activate production in the same action.

After the push, fresh CI and GitGuardian results plus human review of the full delta are prerequisites for a separate merge decision. A merge is not a deployment approval; the guarded release workflow remains a separate owner-gated action.

Suggested approval wording:

> I approve one normal fast-forward-only push of the exact stated local tip to `origin/agent/supermega-release-candidate` for PR #258. I do not approve merge, deployment, domain, environment, database, credential, payment, or production changes.

## Audit boundary

No GitHub, Vercel, DNS, Supabase, domain, deployment, alias, environment, credential, payment, or production state was changed during this reconciliation.
