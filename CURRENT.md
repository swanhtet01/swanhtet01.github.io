# SuperMega current release truth

- Last verified: 2026-10-23
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: native Shop candidate and its public evidence

This file records volatile facts. It cannot widen the product scope, grant a
production action, or replace exact PR and CI evidence.

No local demo, passing test, healthy provider, or generated artifact is proof of a live customer system, revenue, production persistence, or autonomous operation.

Add provider-backed AI, payment, shipping, tax, publishing, and broader marketing only after their product gate has measured pilot evidence.

## Retained browser compatibility invariants

These statements protect data, routes, and safety boundaries in the parked
browser platform. They do not add those products to the active native Shop
launch scope or make the older portfolio a current release plan.

Portfolio metadata snapshot — Last confirmed: 2026-08-21

The customer portfolio is exactly **Shop**, **Plant**, **Website**, and **Ecommerce** in the retained browser registry. **AI assistance** is a shared capability inside those products, not a fifth product. SuperMega HQ, R&D, agent coordination, Ops, Console, and machine coordination are internal company systems.

The retained compatibility routes are `/shop/`, `/plant/`, `/website/`, and
`/ecommerce/`. `/agents/` — compatibility-only path to HQ; it is not a product route or separate workspace.

`commerce` and `production` remain stable internal runtime identifiers while
the retained browser records exist. Ecommerce is not a second Shop back office.

The default app remains an isolated browser-local trial. Managed mode remains locked behind authenticated tenant identity and the existing security/readiness gates.

External sends, payments, publishing, access changes, deployment, and production writes remain owner-approved.

## Internal company system and R&D

`hq/portfolio.json` remains the machine-readable compatibility registry for the
parked browser platform. Resource intelligence stays inside HQ until an active,
owner-approved product outcome and gate require it.

## Candidate

| Item | Current fact |
| --- | --- |
| Integration PR | [#734 — Unify Shop app first-use and public launch candidate](https://github.com/swanhtet01/swanhtet01.github.io/pull/734) |
| State | Open draft; not merged or deployed |
| Integration branch | `codex/shop-public-main-port-20261022` |
| Inactive promotion envelope | `codex/shop-main-integration-20261022` / PR #730; use only after #734 passes and is explicitly promoted |
| Last all-required-CI-green anchor | `68980858ad3684d9f0ec4e313885da4bd9fca4a1` |
| Native Shop tree at the fully green anchor | `e6cef37c6c3c43ad12e1b4c95bdc3081326316da` |
| Current local security increment | Uncommitted on `68980858ad3684d9f0ec4e313885da4bd9fca4a1`; v2 Ed25519 authorization proof and native SQLite schema-v14 work; exact-head CI `NOT RUN` |
| PostgreSQL-17 evidence refresh | `68980858ad3684d9f0ec4e313885da4bd9fca4a1`; required exact-head App CI passed |
| Paused/read-only port source | [#751](https://github.com/swanhtet01/swanhtet01.github.io/pull/751) at `945ce70f792fd856c767f64e6b3e45e4d8f4ee3e`, native tree `5c247e014f6a6d2433693f501ece5fb556fdf4da`; UX/public/native-packaging changes to review and port, not the current candidate |
| UI lane | #749 integrated and frozen for acceptance |
| Paused lanes | #750 low-stock focus; Connected Orders server/sync work |

The committed `68980858` anchor has the required App, native, dependency, and
kernel evidence described below. The security increment after that anchor is
still an uncommitted working-tree change and has no exact-head CI. Neither state
has created a signed or accepted release. Before go/no-go, bind every required
check and review to the actual final source identity.

PR #751 is a legitimate preserved UX/public/native-packaging change set, but its
head `945ce70f792fd856c767f64e6b3e45e4d8f4ee3e` is not a promotion of the
committed #734 anchor `68980858ad3684d9f0ec4e313885da4bd9fca4a1`. Those exact
heads diverge at `b5decebf47c62025efeaaf7c0c7642b0c650aedc`; historical
ahead/behind counts from earlier #734 heads are not reusable. #751 lacks the
candidate's audit-preserving reversal, authorization, workspace-binding, and
exact-TTL chain. The branches also use schema version 11 for different
meanings: #751 for its business-profile change, while #734 used v11 for
reversal/audit and v12 for the workspace anchor. Do not blindly cherry-pick,
merge, overwrite, close, or treat either v11 database as compatible. PR #734
remains the functional base and sole implementation lane.
Port only reviewed #751 UX/public/native-packaging changes onto #734 as bounded
commits after the migration and backup contract is safe; do not merge the branch
wholesale. Any later promotion head must contain the exact reviewed #734 head as
an ancestor. GitHub does not establish a separate #751 writer or reviewer, so
none is inferred.

The native SQLite schema-13 bridge is implemented by `93a25af7`, its formatting
receipt `102ec9e4`, and the historical-fixture repair `556848fc`. Migration runs
inside an explicit transaction and classifies the supported complete origin
before DDL. Exact-head tests cover representative legacy v6/v7/v10 databases,
exact hardened correction-v11, exact profile-v11, exact correction/workspace-
v12, and the deterministic profile/workspace-collision-v12 shape. Partial,
altered, both-v11, and unknown hybrids fail before mutation. The earlier
pre-hardening correction-v11 shape is deliberately rejected rather than
silently relabelled. Authenticated restore verifies the historical snapshot,
migrates and fully opens the staged file at v13, then publishes the migrated
bytes through the no-replace path. Provenance distinguishes legitimately
unbound migrated correction history and is removed only by authenticated
workspace attachment.

This is source and exact-head CI evidence, not installed-device proof. Native
SQLite `PRAGMA user_version = 13` is independent of the hosted
PostgreSQL/Supabase `v13-self-serve` profile. The refreshed hosted receipt does
not invalidate or prove the native migration.

The uncommitted security increment advances native SQLite to schema v14. It
adds an immutable proof ledger for `signed_v2` receipts, verifies Ed25519 proof
against a reviewed source-pinned public key, labels migrated v1 digest records
`legacy_unverified_v1`, and extends semantic validation across migration,
direct open, backup, and restore. It is working-tree evidence only: production
public pins and the issuer signing secret are absent, the issuer and action are
therefore default-dark, the operator UI is not wired, and exact-head CI has not
run. Global receipt consumption across cloned databases and trusted time/device
rollback remain unresolved boundaries.

## Earlier verified product-code anchor

- [Shop native POS checks](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39859320330): success for formatting, analysis, isolated and full Flutter tests, synthetic render capture, Android debug APK, unsigned iPad/iOS build, Windows backup/restore tests, and unsigned Windows build/package.
- [SuperMega App CI push check](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39859313672): success.
- [Kernel verification](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39859320156): success; its production release job remained owner-gated and skipped.
- [Dependency security audit](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39859320193): success.
- Clean-tree public build and verification, gallery regression checks, public
  routing/contact/Vercel contracts, and the HQ verification set passed during
  candidate preparation.

The same-repository pull-request App CI entry is expected to skip because the
push check is canonical. Unsigned CI packages are QA artifacts, not supported
installers or a public release.

## Latest source verification status

- [Exact-head native workflow dispatch](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39877493255)
  succeeded at `556848fcdc11e3f5e7a27e6e76f5f71434f321ed`. It passed
  formatting, analysis, isolated first-sale coverage, the full Flutter suite,
  bundled-font render capture, Android debug APK, unsigned iOS/iPad build, and
  Windows backup restore/no-replace proof, unsigned build, and QA packaging.
- [PR native workflow](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39877494892)
  independently completed the same native job set successfully at the same
  source head.
- [Dependency security audit](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39877495184)
  succeeded at the current head.
- [Kernel verification](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39877495310)
  succeeded at the current head; its release job remained owner-gated and
  skipped.
- [Required App CI push run](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39877488231)
  passed steps 1–637, then failed at step 638, `hq:verify`, when its first
  verifier returned `database_rehearsal_evidence_stale`. Steps 639–668 did not
  run. The pull-request App CI entry skipped because the push run is canonical.
  Refreshing the digest-bound receipt requires the authoritative isolated
  Windows PostgreSQL-17 rehearsal from a clean exact checkout, followed by
  review of the receipt pair and regenerated dependent readiness records. It
  must not be hand-edited or replaced with Linux, native SQLite, hosted, or
  managed-database evidence.
- A clean detached Windows checkout at `556848fc` / tree `9682c849` completed
  the pinned PostgreSQL 17.10 rehearsal with 74 checks across 51 digest-bound
  implementation files. The sanitized receipt file bytes have SHA-256
  `09fdf97e5c740c7664fb2fce8e851f2bb9ef158f8150a5e2e34f61ac535f455c`
  and the adjacent external raw JSON bytes, retained with CRLF line endings,
  have SHA-256
  `3e176d25b24ba9453be67698959ab0aefbfb57d5c54d2c834c23d052f39c8c57`;
  these are file-byte hashes, not the raw report's canonical content digest.
  The tracked LF-normalized raw file has SHA-256 prefix `a7ba…`, while the
  receipt's canonical `rawReportDigest` has prefix `87a0…`; only prefixes are
  recorded here. Independent clean-checkout verification passed. Commit
  `68980858` replaces the canonical pair and
  regenerates managed readiness, the preview-rehearsal proposal, and the
  technical estate. It records no Supabase, Vercel, managed-database, or
  production mutation and explicitly does not prove hosted activation.
- [Required App CI receipt-refresh run](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39880581181)
  succeeded at exact head `68980858ad3684d9f0ec4e313885da4bd9fca4a1`.
  Every job step passed, including PostgreSQL 17, API contracts, migration/RLS,
  lint, canonical build, and desktop/390 px journeys.
- [PR merge-ref native workflow](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39880585250)
  succeeded at merge SHA prefix `0a501b2…`, which contained source head
  `68980858`: Android analysis/tests/render/APK, unsigned iPad/iOS, and Windows
  backup restore/no-replace/build/package all passed. This is PR merge-ref
  evidence, not an exact-push-head run. Its native tree was the same
  `e6cef37c6c3c43ad12e1b4c95bdc3081326316da` already proven by the earlier
  exact-head dispatch at `556848fc`.
- [PR merge-ref dependency audit](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39880585252)
  and [kernel verification](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39880585307)
  succeeded for that merge ref; the production release remained owner-gated
  and skipped. Do not relabel either run as exact-head evidence.
- Retained GitHub Actions metadata identifies Android artifact ID
  `12470238753`, name prefix `supermega-shop-android-debug-0a501b2…`,
  archive-digest prefix `ef2f…`, expiring `2026-10-30 00:57:46 UTC`; render artifact ID
  `12470153451`, archive-digest prefix `c7d53…`, expiring
  `2026-10-30 00:53:39 UTC`; and Windows artifact ID `12470039114`,
  archive-digest prefix `b0a7…`, expiring `2026-10-30 01:04:06 UTC`. These are
  GitHub artifact-ZIP digest prefixes, not inner APK/image/package hashes. No
  iOS artifact and no signed artifact were retained by that run.
- Commit `68980858` is the latest all-required-CI-green internal anchor. PR #734
  remains a draft and is not signed, installed, merchant-accepted, deployed, or
  launch-ready.
- No PR #751 UX, public, typography, template, screenshot, or packaging commit
  group has been ported. The v13 business-profile table is dormant compatibility
  storage, not evidence that the new template UI or public intake exists.

## Included work at the committed green anchor

- English and Burmese typography and operator-facing layout improvements.
- Portrait-tablet counter split, visible New Product action, and responsive
  widget/visual coverage.
- Backup validation for required tables, columns, wallet intent semantics,
  basket arithmetic, pending uniqueness, and fail-closed malformed restores.
- Restore safety for SQLite `-wal`, `-shm`, and rollback-journal sidecars.
- Native SQLite v13 reconciles the two historical schema-v11 meanings and both
  observed schema-v12 meanings, rejects partial/unknown hybrids atomically, and
  publishes only a fully migrated staged restore through the no-replace path.
- Native SQLite v13 preserves the append-only full-sale reversal records
  introduced in v11: they preserve original sale and price snapshots, require
  an explicit all-or-none restock choice, bind each
  cash command to the reviewed open shift, and leave wallet reversals externally
  pending until a separate evidenced reconciliation records `money_returned`
  or `payment_not_received`.
- At the committed anchor, a default-dark managed endpoint can construct a
  five-minute, exact-command owner receipt only after a live Supabase human
  session, active membership, `commerce.write`, exact workspace ownership, and
  Shop entitlement checks. A strict native client is pinned to
  `app.supermega.dev`, rejects redirects and malformed or cross-identity
  receipts, and has one bounded request deadline. That v1 digest is field
  consistency evidence, not server-authentic authorization; the uncommitted v2
  increment above replaces it with signed proof for any future correction.
- Each native SQLite v13 database can be attached once to an explicitly
  selected managed workspace. The v12 workspace anchor, immutable storage, and
  SQLite triggers reject unbound or
  cross-workspace reversal and reconciliation writes, including replay paths;
  correction receipts cannot create or switch that binding.
- Duplicate/retry protection and restore verification recompute reversal,
  reconciliation, outbox, stock-movement, and cash-close evidence. Immutable
  sales, sale lines, stock movements, and audit records fail closed on
  update/delete or malformed legacy collisions.
- Public gallery provenance with strict UTF-8 handling, CRLF-only ledger
  normalization, drift rejection, and pinned native render evidence.

## Not proven

- No production deployment or production alias change has occurred.
- Android tablet installation/signing: `NOT RUN`; iPad installation/signing:
  `NOT RUN`; Windows installation/signing: `NOT RUN`. Unsigned CI builds are QA
  artifacts, not installed-device acceptance.
- Physical USB/Bluetooth/camera scanner paths: `NOT RUN`; private-subnet
  LAN/port-9100 58 mm Burmese receipt printing: `NOT RUN`; the corresponding
  80 mm path: `NOT RUN`. USB/Bluetooth ESC/POS printing is not implemented or
  proven and is not part of the current printer promise.
- Installed process-kill/restart/restore behavior on the target device set:
  `NOT RUN`.
- Actual bundled Inter/Noto Sans Myanmar UI layout at 390 px and at 320 px with
  1.5× text scale: `NOT RUN` for the working security increment. Ahem or
  normal-scale widget coverage does not replace this acceptance.
- Merchant pilot and Vivian's complete merchant journey: `NOT RUN` for this
  candidate. Those release gates remain `BLOCKED`.
- Hosted visual review of the previous public candidate failed Shop branding,
  the responsive product composition, Burmese hierarchy, and CTA acceptance.
  The replacement port and its 390 px, 768 px, and 1440 px EN/MY evidence are
  `NOT RUN`.
- The committed anchor's v1 digest is forgeable local field-consistency
  evidence, not authority. The uncommitted v2/schema-v14 increment adds
  source-pinned Ed25519 proof and a local immutable proof ledger, but production
  public pins and the issuer signing secret are absent, authenticated workspace
  discovery is not wired, the correction dialog is not reachable from Recent
  sales, and exact-head CI has not run. The issuer and action remain
  default-dark. A locally constructed workspace selection remains an anchor,
  not authentication evidence.
- The implemented pilot boundary is an online-authorized workspace-owner correction;
  normal selling remains offline. Do not claim offline correction parity.
  Device-bound offline manager credentials or passkeys are deferred until a
  reviewed threat model and demonstrated merchant need exist. Global receipt
  consumption across cloned databases and trusted time/device-clock rollback
  remain blockers even after a local signature verifies; real PostgreSQL/RLS
  tenant isolation, revoked-session, replay, and owner-transfer behavior also
  remain unproven.
- Pre-hardening schema-v11 wallet-reconciliation rows that used the earlier
  four-key fingerprint intentionally fail current replay and restore. Before
  launch, prove no retained candidate data needs compatibility or add an
  explicit versioned migration.
- The working schema-v14 increment extends shared semantic validation to
  correction-origin migration, ordinary direct open, staged restore, and
  backup. That source hardening can continue independently of human
  signed-device/hardware gates, but it is not a closed P0 until focused
  regressions and exact-head native/App CI pass.
- Swan and Vivian have not accepted full-sale-only correction as sufficient for
  launch. Partial returns and exchanges are not implemented and were not
  silently removed from the release gate.
- Pricing, setup policy, printer promise, and support channel/hours remain open.
- Connected Orders hosted synchronization and tenant isolation are not in the
  launch candidate and remain default-off.
- A first merchant installation, revenue, retention, or public launch is not
  claimed.

## Cloud, local, and Dots coordination

Remote Git is authoritative for integrated source, PR evidence, and CI. The
owner-designated [Operations Hub](https://chatgpt.com/space/page_e3e4e94ac5d081918325eeb103e5da9d)
contains Vivian's prepared operations material and independently verified Dots
recovery evidence. That is coordination evidence, not proof that Dots is
installed in this cloud task, that Vivian accepted the merchant journey, or
that a native release gate passed. Do not recreate the prepared operations
pack. Its initial market-research work is mapped into the existing release
gates in [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md). The
mapping uses five test prompts, not new launch scope; its Facebook evidence is
limited to 23 publicly indexed excerpts whose full posts, dates, and
representativeness remain unverified.

Operations has also completed the internal “Implementation-ready Shop website
brief — 23 October 2026” in the Hub. It is the queued website brief after the
app candidate stabilizes, not permission to publish or a parallel engineering
roadmap. Exact candidate review, publishing, outreach, customer evidence, and
experiment execution remain `NOT RUN`; Burmese acceptance, asset rights, final
claims, commercial terms, hardware evidence, and Vivian's same-candidate review
remain `BLOCKED`.

The local handoff remains deliberately preserved, not archived and not fully
migrated: five dirty Shop worktrees, three stashes, OneDrive changes, and
unique historical catalog-import review, receivables aging,
barcode/receiving, daily-sales projection, and older acceptance observations
remain. The local transcript is unavailable, and this retained work may be
older browser scope rather than a native blocker. Import only bounded,
attributable, non-duplicative work after source and context preservation is
demonstrated. Never copy credentials, caches, or broad private directories,
and do not archive the local source yet. The local lead agrees that #734 is the
functional base and #751 is a port source, is preserving an unpushed
screenshot-pin commit, and is preparing a reconciliation/hardware checklist.
No physical-device proof has been supplied.

A separate clean Windows source worktree at
`C:\Users\thesw\Projects\supermega-platform-worktrees\shop-unboxed-launcher-20261022`
is reported at local-only `d30cf43313394c785688f35e2c94602a667b9a94` on
`codex/shop-unified-candidate-20261022`, one commit ahead of its origin and
divergent from PR #734. The historical 27/30 count was measured against the old
#734 head `556848fc`, not the current committed anchor, and must not be reused
as a current comparison. Its parent `945ce70f` reportedly contains the
locale-specific checkout-height correction and fail-closed `shop-pilot` public
plan intake; `d30cf433` pins only native capture images and their manifest.
These are source/evidence commits to compare, not a promotion envelope or
permission to cherry-pick the worktree wholesale.

The source coordinator's completed Library receipt records the private
`shop-preservation-handoff-20261023.zip` as 24,507 bytes with SHA-256
`29CD83CBCCD44F1B2EB5DDBB0008C6829903F5B6242BCF95369F226C02D0E99B` and
Library ID `libfile_7d58eba221ec81919a3a174da0d5f6d3`. That receipt reports a
manifest, handoff and planning summaries, three selected historical patches,
and daily-sales snapshots; it excludes secrets, sessions, databases, raw
rehearsal JSON, private/customer files, caches, generated bulk output, and
stash contents. The later handoff message omitted `da` from that Library ID.
This cloud toolset has no Library search/download/materialization callable, and
the authorized Page reference reader rejects ordinary ZIP archives. The cloud
therefore has not independently hashed or read the package or manifest. Treat
the creation receipt as source evidence only, not completed cloud consumption
or a full local migration.

The local coordinator separately reports
`C:\Users\thesw\OneDrive - BDA\outputs\supermega-kmo-zaytap-rea-benchmark-20261023.md`
at SHA-256
`98B22C1A1EDC870547EEBAF2D577D4CEBF6501F401FEFB96F943805CBC25774D`.
This cloud task has not read or rehashed that file. Its supplied KMO/ZayTap
claims remain vendor/REA context, not repository, execution, customer, or
launch evidence. The bounded product contract derived from it—workflow
templates separate from entitlements, a calm sale/payment/receipt path,
conditional modules, and explicit signing/hardware gates—applies only after
the current release blocker clears and does not copy competitor tiers or code.

This cloud lane is the sole Shop and public-site integration writer. The Local
Tech Lead remains a preserved research/review and evidence source until the
handoff package proves exact source, backlog, gates, credential-owner metadata,
CI/preview/build references, test coverage, and unreconciled local changes.
No local archive or completed migration is claimed.

## Next action

1. Finish the bounded v2/schema-v14 security increment: prove Ed25519 receipt
   verification and exact workspace/actor/capability/command binding; preserve
   v1 records only as `legacy_unverified_v1` audit evidence; prove tampered
   v11/v12/v13 migration or direct open fails without mutation; and verify
   staged restore, startup failure, retry, and backup behavior. Then commit one
   exact candidate and rerun required native and App CI. This source hardening
   can proceed while signed-device and physical-hardware evidence is blocked.
2. Keep the production public-key ring and issuer/action default-dark until a
   reviewed signing key is pinned and the issuer secret is configured through
   its approved owner path. Do not wire the dormant correction dialog into
   Recent sales until that boundary and focused UI/security regressions pass.
3. Preserve correction as an online-authorized workspace-owner action while
   normal selling remains offline. Resolve global cloned-database receipt
   consumption and trusted-time/device-rollback behavior before enablement; do
   not add offline manager credentials/passkeys without a reviewed threat model
   and demonstrated merchant need.
4. Swan and Vivian record whether full-sale-only correction is acceptable for
   launch or partial returns and exchanges remain required.
5. Keep the installed Shop app primary. Produce signed install/restart/update
   and encrypted-restore evidence, then physical USB/Bluetooth/camera scanner
   evidence and the implemented private-subnet LAN/port-9100 ESC/POS 58 mm /
   80 mm Burmese paper evidence. USB/Bluetooth printer support is not currently
   implemented. These are `P0` human/hardware gates, not CI claims.
6. Only after the security increment has an exact stable head and the applicable
   P0 gates pass or their owners explicitly narrow them, keep
   PR #734 as the functional base and port bounded `P1` native setup work:
   clean install → preset → catalog path → guided first sale in full EN/MY with
   at most five setup decisions. Require actual bundled-font acceptance at
   390 px and 320 px/1.5× text scale. Optional continuity must show conflicts
   and cross-tenant denial. Eliminate plan selection and repeated checkout
   storage banners; do not add counter clutter.
7. Treat the website brief and #751 public source as later bounded work. Review
   only the required source groups in dependency order and generate new exact
   screenshot evidence after the combined source is final. Do not replace
   `main.dart` wholesale or import the unpushed screenshot-pin work without its
   commit, parent, file list, source/tree pins, artifact identity, and asset
   hashes.
8. Then review protected preview and Vivian's merchant-journey evidence at one
   exact PR head, complete independent review, and hold the joint go/no-go
   decision.

The proposed 1 November date remains conditional on the release gates in
[`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
