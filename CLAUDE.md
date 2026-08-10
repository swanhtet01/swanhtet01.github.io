# Claude Code: active

Claude is reactivated by founder direction. Work proceeds on the branch the
founder names, lands as a draft pull request, and waits there for review.

Current SuperMega authority still lives in these files — read them before
choosing work, and prefer them over anything inferred from Git history:

1. `hq/NOW.md`
2. `hq/WORKBOARD.md`
3. `hq/portfolio.json`

## Repository layout

| Path | What it is |
| --- | --- |
| `showroom/` | React + Vite + TypeScript app. All four products live here. |
| `kernel/` | Node ESM console and connectors. |
| `supermega_runtime/` | FastAPI service. |
| `tools/` | Verifier belt and Node test files. |
| `hq/` | Authority files, readiness ledger, research notes. |

The four products are Shop (commerce), Plant (production), Website, and
Ecommerce.

## The gate

`npm run app:verify` is the acceptance check. It must exit 0 before any commit.
It covers `hq:verify`, the kernel footprint guard, the public prebuilt check,
the Node test files under `tools/`, and an `app:build` followed by
`verify_app_build`.

**Never suppress build output.** `verify_app_build` inspects `dist/`, so a build
that fails while its output is redirected leaves a stale `dist/` in place and
the gate reports green over broken code. This has happened; do not repeat it.
Run builds with their output visible and read it.

Verifier pins in `tools/verify_app_build.mjs` match exact source strings. When a
rename touches a pinned string, update the pin in the same commit. Prefer prefix
pins over whole-signature pins so they survive ordinary signature growth.

## Evidence and proof

Domain writes carry a `ProductionActionProof`-shaped record: `actionId`,
`capturedAt`, `actor`, `reason`, `evidenceReference`. Writes are idempotent on
`actionId` — replaying one returns the unchanged state rather than a second
record.

Guided samples exist so a client can see a product working before they have
their own data. They must never fabricate a record that earns a product its
proof counter. A guided Ecommerce request stops at `pending_shop_review`; a
guided Plant shift releases no batch; a guided Website sample publishes and
approves nothing. Sample seeding is identified by `actionId` prefix, never by
actor string — actor strings are display copy and will be rewritten.

## Boundaries

Do not merge, deploy, change a domain, use a credential, write hosted or
production data, or contact anyone outside the repository without explicit
founder approval. Opening a draft pull request is in scope; merging it is not.

Never commit a raw API key or secret. Keys live only in `.secrets/` or a secret
manager — see `Super Mega Inc/security/credential_quarantine_and_rotation.md`.
Any capability that needs a key fails closed and makes no network call when the
key is absent.
