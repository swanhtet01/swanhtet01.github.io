# SuperMega current release truth

- Last verified: 2026-10-23
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: native Shop candidate and its public evidence

This file records volatile facts. It cannot widen product scope, grant a
production action, or replace exact PR and CI evidence. A passing local check,
CI job, preview, or generated artifact is not proof of a signed release,
merchant acceptance, production persistence, or revenue.

No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.

## Retained browser compatibility invariants

These statements protect data, routes, and safety boundaries in the parked
browser platform. They do not add those products to the active native Shop
launch scope or make the older portfolio a current release plan.

Portfolio metadata snapshot — Last confirmed: 2026-08-21

The customer portfolio is exactly **Shop**, **Plant**, **Website**, and **Ecommerce** in the retained browser registry. **AI assistance** is a shared capability inside those products, not a fifth product. SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal company systems.

The retained compatibility routes are `/shop/`, `/plant/`, `/website/`, and `/ecommerce/`. `/agents/` — compatibility-only path to HQ; it is not a product route or separate workspace. `commerce` and `production` remain stable internal runtime identifiers while the retained browser records exist. Ecommerce is not a second Shop back office.

The default app remains an isolated browser-local trial. Managed mode remains locked behind authenticated tenant identity and the existing security/readiness gates. External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved.

## Internal company system and R&D

`hq/portfolio.json` remains the machine-readable compatibility registry for the
parked browser platform. Resource intelligence stays inside HQ until an active,
owner-approved product outcome and gate require it.

## Candidate

| Item | Current fact |
| --- | --- |
| Integration PR | [#734 — Unify Shop app first-use and public launch candidate](https://github.com/swanhtet01/swanhtet01.github.io/pull/734) |
| State | Open draft; verified product/evidence checkpoint `2366ad92` was CLEAN with App/native/security/Kernel CI pass. Documentation-only successors add no product evidence; independent last-push review, signing, deployment, and merchant acceptance remain open |
| Integration branch | `codex/shop-public-main-port-20261022` |
| Final evidence candidate | `2366ad9209e7b6901f00202fa3083e875fbb88c4` / tree `2f403aecd841a13f629d7e04314fffb49ba3c47c` |
| Native capture source | `66682d111b875f61fe1f27298958766728094ee3` / native tree `d8c1cd60d6d80c5fc72bc052d8006bc9d4258220` |
| Gallery evidence successor | `172773a3cfa0996a4aa058148e50513d71da5ae2`; final head preserves the same native tree |
| PostgreSQL evidence checkpoint | `b1ee4cc2884dda1ab753e8d2e4ecc6c6216a36ef` / tree `6996864df311db4748fcca3ec75c030dd0fcab3e` |
| Inactive promotion envelope | PR #730; use only after #734 passes and is explicitly promoted |
| Paused source set | PR #751 at `945ce70f792fd856c767f64e6b3e45e4d8f4ee3e`; review and port bounded changes, never merge wholesale |
| UI lane | #749 integrated and frozen for acceptance |
| Parked lanes | #750 low-stock focus; Connected Orders server/sync work |

The active candidate preserves the verified PostgreSQL-17 receipt, Shop-first
presentation, signed correction boundary, gallery provenance, and fail-closed
release contracts. Empty production correction pins keep that action
unavailable; normal selling remains offline.

## Exact evidence

- [Required App CI 39980080495](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39980080495)
  passed at exact head `2366ad92`: PostgreSQL/API and migration/RLS guards,
  dependencies, lint, canonical build, HQ verification, release workflow
  contracts, and desktop/390 px journeys.
- [Native run 39980088191](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39980088191)
  checked out PR merge `d26580c9` containing source head `2366ad92` with the
  same candidate tree, then passed formatting, analysis, isolated first-sale
  and restore, all Flutter tests, bundled-font renders, Android debug,
  unsigned iPad/iOS, and Windows restore/no-replace plus unsigned packaging.
- Candidate-tree QA artifacts from that merge-ref run: Android debug
  `12513287589`
  (`sha256:db36b6666ef3793d6021ce3f1166094ab2d1630a1e002a9bd44f00b1cebe9298`),
  Flutter renders `12512649344`
  (`sha256:6650195e55f6e05ccdf136e45ffca211df733534aeb33bf2cde2dcb31de26c33`),
  and unsigned Windows `12514157027`
  (`sha256:1f2ac5aec276c9e1fc8ebea74793700937948203f7645f80823fdf43fd0f4744`).
  iOS passed `--no-codesign`; no signed iOS artifact is retained.
- Gallery provenance pins source `66682d11`, CI merge `ab513846`, native run
  `39976672663`, artifact `12511362696`, and original archive
  `sha256:8c40183fec41ff8fe45599439a6724792f96b394e9913b6ddf74806f63c8d993`.
  Strict local public build/gallery/responsive checks passed for EN/MY at
  390/768/1440 px. Release checkout now retains capture-source history.
- The Windows PostgreSQL 17.10 rehearsal remains bound to implementation tree
  `fad006a…`: 74 checks, 51 files, implementation digest
  `sha256:0ee244297bb021a71d16c84869b24c412585be2d9a013265ae5055977255dd0f`,
  receipt digest
  `sha256:8c3ece4d69c0dd815a14e762fb01602229ab14214acb9147774617bce0d18c72`,
  and `hostedActivationProven=false`.
- Security `39980088274` and Kernel `39980088206` pass against the same PR
  merge-ref/source-tree pairing. Kernel production release remains
  intentionally owner-gated.

These are source, local, and CI evidence only. Unsigned CI packages are QA
artifacts, not supported installers or a public release. Native SQLite schema
v14 and hosted PostgreSQL/Supabase schema profile v13 are separate contracts.

## Included candidate work

- Native SQLite schema v13 reconciles the historical profile/correction version
  collision and preserves fail-closed migration and restore behavior. Schema
  v14 adds the immutable signed-receipt proof ledger.
- Correction authorization v2 verifies server-authentic Ed25519 proof against a
  reviewed source-pinned public key and binds workspace, actor, narrow
  capability, exact command, receipt identity, and expiry. Forged, wrong-scope,
  expired, reused, and ambiguous retry paths fail closed.
- Full-sale reversal remains append-only: original sales and prices are
  immutable, restock is explicit, stock and cash-shift effects are once-only,
  and wallet follow-up never implies money moved without external evidence.
- Sale details now exposes one restrained full-sale `Correct sale` path only
  when immutable workspace/actor binding and the authorization service are
  available. The server-signed command is rechecked at mutation time, retries
  are once-only, and EN/MY small-phone flows pass. Production public pins and
  the issuer signing secret are absent, so the action remains default-dark.
  Normal selling remains offline; pilot correction is online-authorized only.
- Backup and restore validate migrations, receipt/proof integrity, immutable
  linked records, workspace binding, wallet uncertainty, and corruption
  failure paths.
- English/Burmese native layout, catalog, barcode, cashier, receipt, printer
  discovery, offline recovery, and actionable operating surfaces remain in the
  single #734 candidate.
- Public Shop presentation uses Shop as the product name and SuperMega as the
  company identity, keeps one primary assisted-access action, retains the
  illustrative-data disclosure, and uses a non-overlapping responsive product
  tableau. Exact-source EN/MY checks pass at 390 px, 768 px, and 1440 px; this
  remains source and CI evidence, not a protected deployed preview.
- Hardware-free compatibility tests inject CR/LF/Tab scanner input into the
  sale UI, preserve leading zeros, exercise intentional repeated scans, send
  exact ESC/POS bytes to a loopback TCP printer, validate 384/420/576-dot
  EN/MY raster output, and keep sale/stock/outbox totals unchanged across
  uncertain printing and operator reprint. This is simulator/protocol evidence,
  not model certification; 420 dots remains builder-only.

## Not proven

- No production deployment, alias promotion, merge, or production database
  mutation has occurred.
- Live `supermega.dev` and `app.supermega.dev` still report predecessor
  `5479c5d1`; no immutable protected preview has been accepted for `2366ad92`.
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
- Global receipt consumption across cloned databases and trusted
  time/device-rollback behavior remain unresolved security boundaries.
- Swan and Vivian have not decided whether full-sale-only correction is
  sufficient or partial returns/exchanges remain required.
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

The local lead remains preserved and unarchived. Five dirty worktrees, three
stashes, a screenshot-pin commit, and OneDrive context still lack complete
source mapping. Do not inventory broadly, clean, archive, or classify them as
historical-only until provenance and equivalence are demonstrated. Hardware and
signing remain intentional local service dependencies.

The producer-verified historical package
`shop-preservation-handoff-20261023.zip` is 24,507 bytes with SHA-256
`29CD83CBCCD44F1B2EB5DDBB0008C6829903F5B6242BCF95369F226C02D0E99B`.
Its text handoff records unique catalog-import, receivables/ledger,
barcode/receiving, daily-sales, and planning evidence, plus stash metadata and
explicit secret/private-data exclusions. Cloud has not independently
materialized the ZIP or manifest, so no patch is approved for application and
no migration or archive completion is claimed.

PR #751 remains a source set for later bounded UX/public/native-packaging ports.
Its schema-11 business-profile meaning conflicts with #734's historical
schema-11 correction meaning. Any selected port requires deliberate migration,
backup, and restore review; no blind merge or cherry-pick is allowed.

## Next action

1. Keep final evidence candidate `2366ad92` stable, correction default-dark,
   and PR #734 draft pending the owner-gated release decision.
2. The owner must approve fixed provider team/project identities and a separate
   protected non-production preview lane before EN/MY 390/768/1440 hosted
   evidence can be produced. Do not reuse the production workflow.
3. Complete installed signed restart/update, encrypted restore, physical
   scanner, and Burmese receipt acceptance. Hardware evidence remains local and
   device-specific.
4. Validate the online owner correction entry on the signed installed build,
   decide full-sale-only versus partial-return/exchange scope, and complete the
   clean install → preset → catalog path → guided first sale journey in full
   English and Burmese.
5. Finish Vivian's merchant journey, commercial/support decisions, current
   hosted tenant/storage rehearsal, and the Swan/Vivian joint go/no-go.
   The proposed 1 November date remains conditional on every applicable gate in
   [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
