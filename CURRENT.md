# SuperMega current release truth

- Last verified: 2026-10-22
- Active objective: [`supergoal.md`](supergoal.md)
- Scope: native SuperMega Shop release candidate only

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
| Base / later promotion envelope | `codex/shop-main-integration-20261022` / PR #730 |
| Last fully green product-code anchor | `f5605ded96c28c85af040889d56ec534863c36ee` |
| Native Shop tree at the fully green anchor | `b457c14b0053523833e610bc8a3cab54e1a47927` |
| Latest source increment | `1f99c20e1f8c78500114f82a56442fe96385798d` |
| Native Shop tree at the latest source | `7d5a26ecd4b593c69024e87a26b34a202a71076d` |
| UI lane | #749 integrated and frozen for acceptance |
| Paused lanes | #750 low-stock focus; Connected Orders server/sync work |

The latest source increment does not inherit the fully green anchor's evidence.
It has not created a signed or accepted release. Before go/no-go, bind all
required checks and review to the actual final PR head.

## Verified evidence at the product-code anchor

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

- Source review and focused tests cover the default-dark owner authorization
  issuer, strict native receipt client, immutable schema-v12 workspace anchor,
  cross-workspace and retry rejection, migration, and encrypted-backup
  validation.
- The exact-head App CI is not green. Its digest-bound PostgreSQL-17 rehearsal
  evidence still names the earlier implementation digest; refreshing that
  receipt requires the real isolated PostgreSQL-17 rehearsal, not a hand edit
  or verifier bypass.
- The fully green anchor above remains the last all-passing CI set. Individual
  exact-head checks for the latest source do not promote it to an accepted
  candidate while App CI or any other required gate remains unsuccessful.

## Included candidate work

- English and Burmese typography and operator-facing layout improvements.
- Portrait-tablet counter split, visible New Product action, and responsive
  widget/visual coverage.
- Backup validation for required tables, columns, wallet intent semantics,
  basket arithmetic, pending uniqueness, and fail-closed malformed restores.
- Restore safety for SQLite `-wal`, `-shm`, and rollback-journal sidecars.
- Schema-v12 append-only full-sale reversal records preserve original sale and
  price snapshots, require an explicit all-or-none restock choice, bind each
  cash command to the reviewed open shift, and leave wallet reversals externally
  pending until a separate evidenced reconciliation records `money_returned`
  or `payment_not_received`.
- A default-dark managed endpoint can issue a five-minute, exact-command owner
  receipt only after a live Supabase human session, active membership,
  `commerce.write`, exact workspace ownership, and Shop entitlement checks. A
  strict native client is pinned to `app.supermega.dev`, rejects redirects and
  malformed or cross-identity receipts, and has one bounded request deadline.
- Each schema-v12 database can be attached once to an explicitly selected
  managed workspace. Immutable storage and SQLite triggers reject unbound or
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
- No signed Android, iPad, or Windows distribution has been accepted.
- Physical scanner and 58 mm / 80 mm Burmese printer behavior is not accepted.
- Installed process-kill/restart/restore behavior is not accepted on the target
  device set.
- The source contains a default-dark owner-only receipt issuer, strict native
  client, and immutable local workspace anchor, but no authenticated discovery
  wiring or trusted operator-facing correction action. The locally constructible
  workspace selection is an anchor, not authentication evidence. The unkeyed
  receipt digest proves field consistency rather than server authenticity,
  receipt consumption is not globally enforced across cloned databases, and
  native expiry still depends on device time. Keep correction unavailable until
  those boundaries and real PostgreSQL/RLS tenant isolation, revoked-session,
  replay, and owner-transfer behavior are proven.
- Pre-hardening schema-v11 wallet-reconciliation rows that used the earlier
  four-key fingerprint intentionally fail current replay and restore. Before
  launch, prove no retained candidate data needs compatibility or add an
  explicit versioned migration.
- Swan and Vivian have not accepted full-sale-only correction as sufficient for
  launch. Partial returns and exchanges are not implemented and were not
  silently removed from the release gate.
- Vivian has not yet accepted the complete merchant journey.
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
pack.

The local handoff remains deliberately preserved, not archived and not fully
migrated: five dirty Shop worktrees, three stashes, OneDrive changes, and
unique historical catalog-import review, receivables aging,
barcode/receiving, daily-sales projection, and older acceptance observations
remain. The local transcript is unavailable, and this retained work may be
older browser scope rather than a native blocker. Import only bounded,
attributable, non-duplicative work after source and context preservation is
demonstrated. Never copy credentials, caches, or broad private directories,
and do not archive the local source yet.

## Next action

1. Swan and Vivian record whether full-sale-only correction is acceptable for
   launch or partial returns and exchanges remain required.
2. Keep the issuer default-dark while hosted authorization proof is absent.
   Wire authenticated managed-workspace discovery and the guarded native
   correction action only after disposable real PostgreSQL/RLS tenant,
   revocation, replay, owner-transfer, and expiry evidence passes; otherwise
   keep the action unavailable.
3. Then review protected preview, installed restart/restore, scanner/printer,
   and Vivian merchant-journey evidence at one exact PR head, followed by
   independent review and the joint go/no-go decision.

The proposed 1 November date remains conditional on the release gates in
[`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
