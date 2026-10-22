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
| State | Open draft; mergeable at the last check; not merged or deployed |
| Integration branch | `codex/shop-public-main-port-20261022` |
| Base / later promotion envelope | `codex/shop-main-integration-20261022` / PR #730 |
| Last verified product-code anchor | `d33c349af94f2ea8f8c5dcfc34f378d93acf04ae` |
| Native Shop tree | `4bff130d27dbaadeb64d5b42266efcd952579e5d` |
| UI lane | #749 integrated and frozen for acceptance |
| Paused lanes | #750 low-stock focus; Connected Orders server/sync work |

Documentation commits after the product-code anchor do not by themselves
invalidate its product tree evidence, but they also do not create a new signed
or accepted release. Before go/no-go, bind all required checks and review to the
actual final PR head.

## Verified evidence at the product-code anchor

- [Shop native POS checks](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39839912132): success for Android analysis/tests/build, iPad/iOS unsigned build, and Windows build/package.
- [SuperMega App CI push check](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39839900259): success.
- [Kernel verification](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39839912145): success.
- [Dependency security audit](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39839912230): success.
- Clean-tree public build and verification, gallery regression checks, public
  routing/contact/Vercel contracts, and the HQ verification set passed during
  candidate preparation.

The same-repository pull-request App CI entry is expected to skip because the
push check is canonical. Unsigned CI packages are QA artifacts, not supported
installers or a public release.

## Included candidate work

- English and Burmese typography and operator-facing layout improvements.
- Portrait-tablet counter split, visible New Product action, and responsive
  widget/visual coverage.
- Backup validation for required tables, columns, wallet intent semantics,
  basket arithmetic, pending uniqueness, and fail-closed malformed restores.
- Restore safety for SQLite `-wal`, `-shm`, and rollback-journal sidecars.
- Public gallery provenance with strict UTF-8 handling, CRLF-only ledger
  normalization, drift rejection, and pinned native render evidence.

## Not proven

- No production deployment or production alias change has occurred.
- No signed Android, iPad, or Windows distribution has been accepted.
- Physical scanner and 58 mm / 80 mm Burmese printer behavior is not accepted.
- Installed process-kill/restart/restore behavior is not accepted on the target
  device set.
- Native refund/exchange is not implemented; the required correction/refund
  journey remains an open product and operations gate.
- Vivian has not yet accepted the complete merchant journey.
- Pricing, setup policy, printer promise, and support channel/hours remain open.
- Connected Orders hosted synchronization and tenant isolation are not in the
  launch candidate and remain default-off.
- A first merchant installation, revenue, retention, or public launch is not
  claimed.

## Cloud, local, and Dots coordination

Remote-authoritative source, commits, PR evidence, and CI history are available
in cloud Git. The unavailable local Codex session's uncommitted changes,
terminal state, stashes, untracked files, OneDrive-only material, hardware
state, and secrets have not been migrated or inferred.

When that machine returns, inventory its branch/HEAD, status, staged and
unstaged diffs, stash, and untracked files. Bring forward only bounded,
attributable work that does not duplicate the current candidate. Never copy
credentials, caches, or broad private directories into the repository.

No Dots workspace, thread, or attributable export is attached. Once supplied,
compare it with the current candidate and classify every item as **Keep**,
**Merge**, **Pause**, **Archive**, or **Client-specific** before implementation.

## Next action

Prepare and review the protected public preview, then collect installed-device,
scanner, printer, restart, and restore evidence. In parallel, Vivian can run the
merchant workflow and close the commercial/support decisions without creating
another technical release lane.

The proposed 1 November date remains conditional on the release gates in
[`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md).
