# Production parent-history recovery packet — review only

**Decision:** Prepare a metadata-only repair of the production migration ledger, then create a fresh data-less dashboard preview and run managed Shop acceptance. No production SQL, branch reset, new paid branch, or deployment was performed by this packet.

## Observed failure and exact scope

As of 2026-10-20, dashboard-created previews from production project `zvtzwcimpvvtkowflhda` show `MIGRATIONS_FAILED`. The earliest production ledger entry is `20260711081400_enable_rls_public_tables_20260711`, whose first statement alters `public.enterprise_users` before any recorded migration creates that table. A dashboard preview replays the parent project's migration history, so that missing predecessor explains the observed fresh-branch `relation "public.enterprise_users" does not exist` failure. The repository already contains the missing `20260711081300_public_legacy_baseline.sql` source. Supabase's [dashboard branching documentation](https://supabase.com/docs/guides/deployment/branching/dashboard) confirms this replay behavior; [database migration documentation](https://supabase.com/docs/guides/deployment/database-migrations) distinguishes tracking-table repair from executing schema SQL.

The proposed operation **only inserts one historical migration record** into `supabase_migrations.schema_migrations`, with the pinned baseline SQL in `statements[1]`. It does not execute that SQL on production. Do not apply the baseline through `apply_migration` or `db push` on production: its DDL is for building an empty database. Do not run the generated SQL against a preview or another project.

This is still a consequential production change: an incorrect ledger entry could make future branch builds replay the wrong schema or mislead migration tooling even though customer rows are untouched. The exact statement, parent schema parity and fresh branch replay must all be checked before declaring recovery.

## Read-only evidence

| Gate | Production parent | Data-less preview `rvuutlqxdjaflovozsma` |
| --- | --- | --- |
| Legacy public tables / columns / constraints / indexes | 27 / 370 / 53 / 114 | 27 / 370 / 53 / 114 |
| Column catalog MD5 | `db722d8a3df8bbb5b52372e2294926d9` | same |
| Constraint catalog MD5 | `37ab9b0fa3a7a4ef42eb01f88a983032` | same |
| Index catalog MD5 | `ce6af6aad3607e894d1ded452bf4a331` | same |
| RLS flags MD5 / policy count | `68d8cbcef1fcfcdbfb624f96ea98cd07` / 0 | same |

These catalog checks cover the 27 baseline tables, including column types/defaults/nullability/identity, constraint definitions, index definitions, and row-security flags. They do not cover data, grants, extensions, functions, or every later private migration. They establish that the baseline-built legacy catalog matches the current production catalog in those measured dimensions, not full environment parity.

Git-canonical LF source SHA-256: `3de413eedcac9dfade90a25b0759e7b7708cf9e773128a881c30e00f2211dd7c` (the Windows CRLF checkout hashes to `98498c33583707383be92b0815f299ab6a5bcabc489c49e3253ed655e47957d5`). The preview's stored baseline statement uses CRLF and has one final CRLF beyond the source file; its MD5 is `25c31b57c571a503adff2522f1ffde75`, matching the generator's exact bytes regardless of checkout line endings. Production has 18 migration rows and no `20260711081300` entry. Its first recorded statement MD5 is `5fa589aa53149fa0e57edfe4c7d6f67c`.

## Proposed execution boundary

`node tools/prepare_supabase_parent_baseline_repair.mjs` checks pinned source and emits the SQL digest without a write. `node tools/prepare_supabase_parent_baseline_repair.mjs --out <review-path.sql>` writes a reproducible SQL proposal to a **new** local file; it never connects to a provider. The SQL uses a transaction, a two-second lock timeout, a 15-second statement timeout and a migration-ledger lock; it requires `postgres`, refuses any ledger count/first-entry/catalog drift, refuses an existing baseline row, and verifies the inserted statement's digest before commit. Its base64 statement literal preserves exact bytes across editor line-ending changes. The generated SQL SHA-256 for this source revision is `4dece18e2414f1eae2443b4fd966f27007fe7c9d006ca663a6550c0c6fcda82f`.

Before any production operation, independently review the generated SQL and its target project ID, refresh the production ledger/catalog counts and hashes, and obtain a **separate explicit owner approval for this exact production ledger write**. The owner's earlier approvals were limited to named preview migrations and do not cover this operation. Retain a read-only export of the 18-row ledger before execution. If any guard fails, stop and investigate; do not relax it to force a pass.

After an approved insertion, read back the 19-row ledger and exact statement MD5, then create a fresh data-less dashboard preview only with a checked cost/owner scope. Confirm `MIGRATIONS_FAILED` is cleared, verify private migration parity and RLS/access, then run synthetic Shop sign-in, persistence/reload, cross-tenant denial, and no-leak checks. Existing failed branches remain failed unless separately repaired; do not reset or merge them as a shortcut. A clean branch schema is still not customer-pilot acceptance, hardware proof, or production deployment.

Rollback, if the metadata insert is approved and later found incorrect, is a separately reviewed metadata-only delete of **only** version `20260711081300` with matching name and statement MD5. It cannot undo previews already created from the repaired history, and it does not alter schema or customer data. Do not use a broad history reset.

## Status

- Parent catalog parity: **PASS** for the measured baseline objects.
- SQL proposal generation: **PASS** locally; not run against Supabase.
- Production ledger repair: **NOT RUN**, separate owner approval required.
- New dashboard preview and managed Shop acceptance: **NOT RUN**.
- Protected public-site preview: accessible after Vercel two-factor sign-in; homepage, Shop and Contact read-only navigation passed. The Shop preview displays desktop, tablet and phone captures; this is visual evidence only, not a device/hardware test.
