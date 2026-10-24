# SuperMega current release truth

- Last verified: 2026-10-24
- Active objective: verified Shop + account portal delivery; see [`supergoal.md`](supergoal.md)
- Scope: Shop, supporting web/infrastructure, accountable operations, and
  entitlement-gated optional packages

This file records volatile facts; it cannot widen scope or authorize release.
No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

## Retained browser compatibility invariants

These statements protect data, routes, and safety boundaries in the parked
browser platform. They do not add those products to the active native Shop
launch scope or make the older portfolio a current release plan.

Portfolio metadata snapshot — Last confirmed: 2026-08-21

The historical four-product browser registry is compatibility evidence, not
current scope. Shop is core; Plant is outside SuperMega.dev; Website/Sites and
Ecommerce are optional packages gated by server entitlements and acceptance.
AI assistance is internal shared capability, not another product.

The retained compatibility routes are `/shop/`, `/plant/`, `/website/`, and `/ecommerce/`. `/agents/` — compatibility-only path to HQ; it is not a product route or separate workspace. `commerce` and `production` remain stable internal runtime identifiers while the retained browser records exist. Ecommerce is not a second Shop back office.

The default app remains an isolated browser-local trial. Managed mode remains locked behind authenticated tenant identity and the existing security/readiness gates. External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved.

Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.

## Internal company system and R&D

`hq/portfolio.json` remains the machine-readable compatibility registry for the
parked browser platform. Resource intelligence stays inside HQ until an active,
owner-approved product outcome and gate require it.

## Candidate

| Item | Current fact |
| --- | --- |
| Integration PR | [#734 — Unify Shop app first-use and public launch candidate](https://github.com/swanhtet01/swanhtet01.github.io/pull/734) |
| State | Open draft. Remote head remains `526f3616`; reviewed Cloud source checkpoint `03df1838` is local-only and has no exact-head CI or preview. Review, preview, signing, installed/hardware, and merchant gates remain open |
| Integration branch | `codex/shop-public-main-port-20261022` |
| Immutable reviewed source checkpoint | `03df1838b7dcc96d06a0b8aec5f07c736c80a6a1` / tree `47f34172529fae384ecafcdf0d0d8c1e96cf8b3c`; clean, unpushed, based on `526f3616` |
| Documentation successor | This `CURRENT.md` update follows `03df1838`; it records evidence only and does not make the source checkpoint CI- or release-ready |
| Native capture state | Current native tree `f8b146d0…` differs from gallery manifest tree `5417a23d…`; strict provenance fails closed until exact-source captures are regenerated and reviewed |
| PostgreSQL evidence checkpoint | `b1ee4cc2884dda1ab753e8d2e4ecc6c6216a36ef` / tree `6996864df311db4748fcca3ec75c030dd0fcab3e` |
| Inactive promotion envelope | PR #730; use only after #734 passes and is explicitly promoted |
| Paused source set | PR #751 at `945ce70f792fd856c767f64e6b3e45e4d8f4ee3e`; review and port bounded changes, never merge wholesale |
| UI lane | #749 integrated and frozen for acceptance |
| Parked lanes | #750 low-stock focus; Connected Orders server/sync work |

The source checkpoint preserves Shop-first presentation, signed correction,
and fail-closed release contracts. Correction stays unavailable and normal
selling remains offline. Gallery provenance is presently blocked, not passed.

Included: Shop QA/export/backup, account hub and shared login/auth. Excluded:
Plant, blocked billing-projection WIP, provider activation, and new agent
frameworks. Website/Ecommerce remain entitlement-gated optional capabilities,
not default launch products.

## Exact evidence

- At `03df1838`, the app security contract passes 105 checks; account routes
  pass 84/84, login returns 6/6, rendered synthetic account-hub checks pass
  10/10 at 390/768/1440 px, billing boundaries pass 4/4, and Ecommerce contact
  isolation passes 24/24. The walkthrough denies viewer, staff, service and
  other-tenant reads and exposes no unsigned customer download.
- Private-trial migration verification previously passed 23 migrations and 136
  checks in the prepared environment. An independent rerun in the current
  checkout was blocked by missing `@electric-sql/pglite`; this is a toolchain
  limitation, not fresh migration evidence or a migration failure.
- Strict native gallery verification currently fails with
  `native_shop_gallery_source_tree_drift`. Exact-source native CI, captures,
  hashes, and manifest review are required before public verification can pass.
- PR #734 remote head remains `526f3616`. No GitHub App, Native, security, or
  Kernel run exists for `03df1838`; older green runs are baseline evidence only.
- The prior one-run PostgreSQL-17 approval at `e217e035` was consumed and failed
  before producing a canonical pair. No evidence was integrated and no retry is
  authorized. A later exact product head needs a new one-run decision.
- The Windows PostgreSQL 17.10 rehearsal remains bound to implementation tree
  `fad006a…`: 74 checks, 51 files, implementation digest
  `sha256:0ee244297bb021a71d16c84869b24c412585be2d9a013265ae5055977255dd0f`,
  receipt digest
  `sha256:8c3ece4d69c0dd815a14e762fb01602229ab14214acb9147774617bce0d18c72`,
  and `hostedActivationProven=false`.
- Older unsigned Android/iPad/Windows artifacts remain engineering evidence,
  not distributable builds. No signed artifact exists for this source checkpoint.

These are source, local, and CI evidence only. Unsigned CI packages are QA
artifacts, not supported installers or a public release. Native SQLite schema
v15 and hosted PostgreSQL/Supabase schema profile v13 are separate contracts.

## Included candidate work

- Native SQLite schema v13 reconciles the historical profile/correction version
  collision. Schema v14 adds the immutable proof ledger; v15 records signed-v3
  server finalization while preserving historical v2 and legacy evidence.
- Correction authorization v3 uses an atomic server-issuer reservation keyed to the
  workspace, capability, and stable sale/reversal target. The Ed25519 proof
  binds workspace, actor, exact command, receipt, server finalization, and
  expiry. Same-request retries are stable; different-request, wrong-scope,
  expired, reused, concurrent, and same-target/different-operation attempts
  fail closed.
- Full-sale reversal remains append-only: original sales and prices are
  immutable, restock is explicit, stock and cash-shift effects are once-only,
  and wallet follow-up never implies money moved without external evidence.
- Sale details now exposes one restrained full-sale `Correct sale` path only
  when immutable workspace/actor binding and the authorization service are
  available. The command is rechecked at mutation time, retries are once-only,
  and EN/MY small-phone flows pass. Production pins and the issuer secret are
  absent; a hard-false global-consumption gate also keeps issuance default-dark.
  Normal selling remains offline; pilot correction is online-authorized only.
- Backup and restore validate migrations, receipt/proof integrity, immutable
  linked records, workspace binding, wallet uncertainty, and corruption
  failure paths. Historical four-key evidence round-trips only as
  `legacy_unverified_v1`; historical signed-v2 remains six-key and cannot
  authorize a new mutation.
- English/Burmese native layout, catalog, barcode, cashier, receipt, printer
  discovery, offline recovery, and actionable operating surfaces remain in the
  single #734 candidate.
- Public Shop presentation uses Shop as the product name and SuperMega as the
  company identity, keeps one primary assisted-access action, retains the
  illustrative-data disclosure, and uses a non-overlapping responsive product
  tableau. It now explains the counter loop, four assisted-setup shop types,
  assisted Local Pilot access, and the truthful Android/iPad/Windows signing
  boundary without exposing QA archives as downloads. Earlier EN/MY capture
  checks are baseline evidence only; the current native source requires a new
  exact-source gallery before protected-preview acceptance.
- Public release now verifies effective contact-delivery destinations before
  building: Supabase must match the source-bound project origin, and an optional
  webhook must match an explicit approved HTTPS origin. The audit is redacted
  and fails closed on incomplete, private, loopback, or ambiguous targets.
- Hardware-free tests cover CR/LF/Tab scanning, leading zeros, repeated scans,
  loopback ESC/POS, 384/420/576-dot EN/MY raster output, uncertain printing,
  reprint, and stalled delivery without automatic retry. This is protocol
  evidence, not model certification; 420 dots remains builder-only.

## Not proven

- No production deployment, alias promotion, merge, or production database
  mutation has occurred.
- Live `supermega.dev` and `app.supermega.dev` still report predecessor
  `5479c5d1`; the existing paired protected previews report `f944f66b`, and no
  immutable protected preview has been accepted for `03df1838`.
  Direct previews stay disabled, and the production workflow is not preview
  evidence. Live retired product routes also need an owner-approved release of
  the already-verified Shop-first route policy.
- No signed Android, iPad, or Windows distribution has been accepted.
- Installed restart/update and encrypted restore are not accepted on the target
  device set.
- Physical USB/Bluetooth/camera scanning is not accepted. Printing implements
  private-subnet LAN/port 9100 only; physical 58 mm/80 mm Burmese receipt proof
  is not accepted, and USB/Bluetooth printer transports are unsupported.
  XP-80U is therefore unsupported. True mid-write reset, stalled-write timeout,
  and paper-status behavior remain unproven; raw TCP cannot confirm paper output.
- Empty production pins and absent issuer signing configuration intentionally
  disable correction. Offline manager credentials/passkeys remain deferred.
- Stable-target reservation blocks normal independent-clone authorization.
  Post-proof clone reuse, device-clock rollback, and expired-target recovery
  remain unresolved. Device-bound offline authority remains deferred.
- Founder decision recorded 2026-10-23: full-sale-only correction/refund is
  accepted for launch; partial/item refunds and exchanges are deferred.
  Vivian's merchant-journey/customer-promise acceptance remains open.
- Vivian has not accepted the complete catalog → sale → stock → correction or
  refund → close → export → restart → restore journey.
- Local Pilot is the only current offer. Pricing, setup policy, printer promise,
  support channel, and support hours remain open. Managed Cloud and Multi-site
  remain planned/internal.
- Connected Orders remains default-off and outside this launch candidate.
- Merchant installation, customer evidence, revenue, retention, production
  readiness, and launch are not claimed.

## Cloud, local, Operations, and Dots coordination

Cloud is the sole integration writer; Remote Git is authoritative for source,
PR evidence, and CI. The owner-designated [Operations Hub](https://chatgpt.com/space/page_e3e4e94ac5d081918325eeb103e5da9d)
coordinates handoffs and decisions; Vivian's Operations Onboarding Plan owns
business research, marketing, onboarding, support, pricing input, and daily
operations, not engineering QA. Technical review and tests remain with Swan and
the Tech Leads. Do not recreate Vivian's prepared material.

The local lead remains preserved and unarchived. Unmapped worktrees, stashes,
screenshot provenance, and OneDrive context must not be cleaned or imported
without bounded equivalence review. The producer-verified historical package
hash and its deferred catalog, receivables, receiving, and daily-sales evidence
remain recorded in the Operations handoff; Cloud has not independently
materialized or approved its patches.

PR #751 remains a source set for later bounded UX/public/native-packaging ports.
Its schema-11 business-profile meaning conflicts with #734's historical
schema-11 correction meaning. Any selected port requires deliberate migration,
backup, and restore review; no blind merge or cherry-pick is allowed.

## Next action

Active item: establish the effective Git-deployment behavior of both Vercel
projects linked to this repository. Acceptance requires provider evidence or an
explicit disposition; `vercel.json` alone is insufficient. Preserve
`03df1838` and do not push meanwhile.

Next eligible sequence: exact PR #734 App/Native/security CI → exact-source
gallery → newly approved exact-head PostgreSQL rehearsal/evidence successor →
app-first protected pair → separately approved synthetic user/tenant/Shop
binding → login/setup/sale/restart/recovery/account walkthrough → signed
distribution and installed recovery → applicable hardware and Vivian merchant
acceptance → independent review and joint go/no-go. No mock closes a higher
evidence gate; see [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
