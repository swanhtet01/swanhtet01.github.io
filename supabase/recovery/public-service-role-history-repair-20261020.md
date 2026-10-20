# Public service-role replay prerequisite — review packet

**Decision:** The owner approved the exact metadata-only grant-history insert. It was applied to production after exact-head CI and a fresh preflight. A new, untouched data-less preview replayed all 20 parent migrations and matched the production private-schema fingerprint and public access checks. This establishes migration replay, not managed Shop or customer acceptance.

## Failure observed after the baseline repair

The parent-history repair in PR #692 recorded the missing legacy baseline and read back 19 migration rows without executing baseline DDL on production. A fresh data-less preview, `nwthuvvddfybhkptaypr`, then replayed 13 migrations including the baseline and stopped before `20260812141352_public_browser_quarantine`. Its Postgres log reported `public browser quarantine server dependency baseline changed` (SQLSTATE `55000`). The quarantine guard requires `service_role` to retain SELECT/INSERT/UPDATE/DELETE on all 27 legacy public tables and USAGE/SELECT on two sequences. Read-only comparison found all 112 permissions present on production and all 112 missing on the new branch. The branch had the same 27 legacy public tables; this is a historical grant-replay gap, not a missing-table failure.

On that **data-less branch only**, applying [the exact grant source](20260812141300_public_service_role_replay_grants.sql) as a diagnostic migration succeeded; its stored statement MD5 is `bb4cc2f6fdfcea26f2d4f6ebc98912fb`. Readback found zero missing `service_role` permissions. Applying the parent quarantine statement as a separate diagnostic migration succeeded with stored MD5 `7af3b2aaa2aa13dbc90b51b1cfc12521`. A branch rebase then reached `FUNCTIONS_DEPLOYED`, and its ledger contained all 19 parent migrations plus the two diagnostic migrations. This was useful schema evidence but not a clean replay. After the clean preview passed, this superseded synthetic diagnostic branch was deleted to stop its hourly charge.

## Exact parent operation and execution

`node tools/prepare_supabase_service_role_history_repair.mjs` checks the LF-normalized grant source SHA-256 `41a76b8f0b8c7930def0f1af964a8a2381b7492af26337289a4508dda2f784af` and statement MD5 `bb4cc2f6fdfcea26f2d4f6ebc98912fb`. With `--out <new-file>`, it emits a transaction to insert **one migration-ledger row** at version `20260812141300`, before the quarantine version. The generated 10,577-byte SQL has SHA-256 `57303d3a4a1a5042e40673001c94a2a207fca17fc67c80337b2ecc1d1759129a`. The grant DDL is encoded as the recorded migration statement; **the parent operation does not execute GRANT on production**. The grant source grants only the server-side `service_role`, no browser role, and performs no customer-row operation.

The transaction requires `postgres`, a 19-row parent ledger, the pinned baseline and quarantine statement MD5s, an absent new version, the exact 27-table/two-sequence public inventory, and the same 112 effective `service_role` permissions on production. It locks the migration ledger with a two-second lock timeout and a 15-second statement timeout, inserts one row, verifies its name and statement MD5, then commits. A failed guard rolls back. The generated SQL must be independently inspected and hashed again immediately before any provider write. No `apply_migration`, broad history reset, or baseline DDL should be used on production for this repair.

The owner approved this exact SQL. [PR #693 App CI run 39463769144](https://github.com/swanhtet01/swanhtet01.github.io/actions/runs/39463769144) passed at `b208831cb5b7d20ab354a2c2c04f06f38e07a519`. Fresh production preflight showed `postgres`, 19 parent rows, no grant-history row, the pinned baseline and quarantine MD5s, 27 public tables, two sequences, and zero missing effective `service_role` grants. The generated SQL hash was rechecked immediately before execution. Production readback showed exactly 20 rows, one `20260812141300` row named `public_service_role_replay_grants`, one stored statement with MD5 `bb4cc2f6fdfcea26f2d4f6ebc98912fb`, and the unchanged quarantine statement MD5 `7af3b2aaa2aa13dbc90b51b1cfc12521`. No grant DDL or customer-row mutation ran on production.

A **new** data-less preview `aaonrwgghhdycwqbxuoi` (`supermega-shop-clean-replay-20261020`) reached `FUNCTIONS_DEPLOYED` with exactly the 20 ordered parent migration versions and no diagnostic rows. The canonical private-surface digest matched production exactly, including all ten section hashes: overall SHA-256 `c3cc9922205557ad780f65d6b24c9481839e55ae79aa72836bd41a159bbf06e1`. Both environments have 27 public tables with RLS on all 27, zero public tables selectable by `anon` or `authenticated`, zero missing `service_role` table grants, and zero missing grants on two public sequences. Supabase's stored statement text hashes on the replayed branch differ from the parent hashes; the ordered version list, resulting schema fingerprint, and access checks are the evidence for this bounded replay result.

Managed Shop sign-in, save/reload, tenant denial and restore are **NOT RUN**. Production deployment, real-device barcode/receipt acceptance and customer-pilot release remain separate gates.

Rollback, if this metadata row is found incorrect, is a separately reviewed delete of only version `20260812141300` with the matching name and MD5. It cannot undo previews already built from that history. Do not alter production grants to compensate for a replay error.

## Status

- Production grant comparison and ledger preflight: **PASS** read-only before the write; 19 rows, no grant-history row, pinned statement MD5s, exact 27/2 inventory, zero missing effective `service_role` permissions.
- Diagnostic branch grant and quarantine statements: **PASS** on data-less preview; superseded diagnostic branch deleted after clean replay passed.
- Source generation and syntax checks: **PASS** locally; source and SQL digests above.
- Parent grant-history insert: **PASS BOUNDED**; owner-approved, exact-head CI and preflight passed, 20-row production ledger and new statement MD5 read back.
- Clean fresh-branch replay: **PASS BOUNDED**; 20 ordered migrations, `FUNCTIONS_DEPLOYED`, matching schema and access checks.
- Managed Shop acceptance: **NOT RUN**.
