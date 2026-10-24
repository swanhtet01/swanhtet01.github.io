# SuperMega current release truth

- Last verified: 2026-10-24
- Active objective: [`supergoal.md`](supergoal.md)
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
| State | Open draft; product `de648ecd` and gallery checkpoint `fd90cff3` have full native/security/Kernel PASS. App CI failed only on stale PostgreSQL evidence. Review, preview, signing, installed/hardware, and merchant gates remain open |
| Integration branch | `codex/shop-public-main-port-20261022` |
| Local scoped source anchor | `350832eb` from `526f3616`; Shop/shared work only; unpushed, native CI NOT RUN |
| Verified product-code anchor | `de648ecda569c639f1b5da8fcf8cd874c1f712d4` / tree `198c188372bb4a33777168f49e6260b63c330751` / native tree `5417a23dd9e5e3f99832e921c29ff55a620e642b` |
| Native capture source | `de648ecd` / native tree `5417a23d` |
| Gallery evidence successor | `fd90cff3dbefe65d734f0a2c88f6df7958b2cd52`; strict local provenance and public checks pass |
| PostgreSQL evidence checkpoint | `b1ee4cc2884dda1ab753e8d2e4ecc6c6216a36ef` / tree `6996864df311db4748fcca3ec75c030dd0fcab3e` |
| Inactive promotion envelope | PR #730; use only after #734 passes and is explicitly promoted |
| Paused source set | PR #751 at `945ce70f792fd856c767f64e6b3e45e4d8f4ee3e`; review and port bounded changes, never merge wholesale |
| UI lane | #749 integrated and frozen for acceptance |
| Parked lanes | #750 low-stock focus; Connected Orders server/sync work |

The candidate preserves Shop-first presentation, signed correction, gallery
provenance, and fail-closed release contracts. Correction stays unavailable;
normal selling remains offline.

Included: Shop QA/export/backup and shared login/auth. Excluded: Plant,
standalone Website/Ecommerce changes, and new agent frameworks.

## Exact evidence

- [Required App CI 40064185750](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40064185750)
  reached step 638/668 at gallery checkpoint `fd90cff3`: API, migration/RLS,
  dependencies, lint, and the canonical build passed; `hq:verify` then failed
  closed only on `database_rehearsal_evidence_stale`. A fresh exact-head
  Windows PostgreSQL-17 receipt is required before the remaining journeys run.
- [Native run 40064188764](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/40064188764)
  used PR merge `646555fa`, source `fd90cff3`, and native tree `5417a23d`.
  Formatting, analysis, isolated first-sale/restore, all Flutter tests, renders,
  Android debug, unsigned iPad/iOS, Windows restore/no-replace, and unsigned
  Windows packaging pass.
- Gallery-checkpoint QA artifacts: Android debug `12549030966`
  (`sha256:5aec870140e73a842111378fefa5822c8314b9759961f4177fd8006885964001`),
  Flutter renders `12548143520`
  (`sha256:8ac93120af177f1baac7a848a8f2adcadc6834837c1ca92c0af0823197f2be92`),
  and unsigned Windows `12548408756`
  (`sha256:5c9fe9837ad09ea1fd9f33afea1b7b0a8ecb7ff40081e139410461b00246fcf9`).
  iOS passed `--no-codesign`; no signed iOS artifact is retained.
- Gallery provenance pins source `de648ecd`, CI merge `69d59c8e295964c4274f0cac5a540ef991fbf335`, native run
  `40063376047`, artifact `12548162372`, and original archive
  `sha256:336eca1c28d1b0257eff618b88bcd4c3649407f8fc793b7c4c879453adfb5d2f`.
  Strict local public build/gallery/responsive checks passed for EN/MY at
  390/768/1440 px. Release checkout now retains capture-source history.
- The Windows PostgreSQL 17.10 rehearsal remains bound to implementation tree
  `fad006a…`: 74 checks, 51 files, implementation digest
  `sha256:0ee244297bb021a71d16c84869b24c412585be2d9a013265ae5055977255dd0f`,
  receipt digest
  `sha256:8c3ece4d69c0dd815a14e762fb01602229ab14214acb9147774617bce0d18c72`,
  and `hostedActivationProven=false`.
- Dependency security `40064188861` and Kernel `40064188769` pass against the
  same head. Python CI is frozen and hashed; vulnerable `anyio`, `idna`, and
  `starlette` transitives were repaired before the exact-head pass. Kernel release remains
  intentionally owner-gated.

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
  boundary without exposing QA archives as downloads. Exact-source EN/MY checks
  pass at 390 px, 768 px, and 1440 px; this remains source and CI evidence, not
  a protected deployed preview.
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
  immutable protected preview has been accepted for `de648ecd`.
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

1. Keep verified product-code anchor `de648ecd` stable, correction default-dark,
   and PR #734 draft pending the owner-gated release decision.
2. The owner must approve fixed provider team/project identities and a separate
   protected non-production preview lane before EN/MY 390/768/1440 hosted
   evidence can be produced. Do not reuse the production workflow.
3. Complete installed signed restart/update, encrypted restore, physical
   scanner, and Burmese receipt acceptance. Hardware evidence remains local and
   device-specific.
4. Validate the online owner correction entry on the signed installed build
   and complete the clean install → preset → catalog path → guided first sale in
   English and Burmese.
5. Finish Vivian's merchant journey, commercial/support decisions, current
   hosted tenant/storage rehearsal, and the Swan/Vivian joint go/no-go.
   The proposed 1 November date remains conditional on every applicable gate in
   [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
