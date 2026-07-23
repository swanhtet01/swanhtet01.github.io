# >_ SuperMega managed-trial database activation

`app.supermega.dev` is an isolated, browser-local product demo until every managed-trial gate below passes. It does not use SQLite and it must not be represented as a customer system of record. The canonical managed backend is the private `app_private` schema in Supabase Postgres; browser code never receives its connection string or a service-role key.

The validator is intentionally read-only. It does not apply migrations, create users, provision workspaces, or enable writes.

## Local PostgreSQL 17 release gate

Run this first on a development machine with PostgreSQL 17 binaries, matching `psql`, `pg_dump`, and `pg_restore`, Psycopg 3, and OpenSSL:

```powershell
npm run database:postgres17:preflight
npm run database:postgres17:rehearse
```

The runner accepts only executable paths, never database credentials. It creates two disposable PostgreSQL 17 clusters with generated in-memory secrets, TLS, and a `127.0.0.1` listener. The first cluster applies the five migrations as `postgres`, carries representative v1 records through v4, provisions the exact runtime membership, runs the production read-only validator, and exercises identity locality, tenant and capability denial, browser-role isolation, role settings, `SET ROLE` denial, concurrency, immutable events, server timestamps, and revocation. It then creates a custom-format backup. A second clean cluster recreates only the required global roles, restores the backup, revalidates the schema and runtime role, verifies retained rows, and is removed with the first cluster.

The current sanitized proof is `hq/research/postgres17-rehearsal.json`. It records PostgreSQL 17.10, the official Windows distribution source, the observed archive checksum, all passing checks, complete cleanup, and zero Supabase, Vercel, or production mutation. This is a repeatable local release gate—not hosted activation. It does not replace an isolated Supabase target, Security Advisor, the provider transaction-mode pooler, or provider backup and recovery proof. PostgreSQL documents the [Windows binary distribution](https://www.postgresql.org/download/windows/), and Supabase documents its separate [local-development boundary](https://supabase.com/docs/guides/local-development/overview).

## One-time non-production proof

1. Create a Supabase branch or separate non-production project and confirm backup and restore responsibilities.
2. Apply the migrations in filename order: `20260722004500_private_trial_backend_role_preflight.sql`, `20260722005134_private_trial_backend_foundation.sql`, `20260722142801_private_trial_backend_v2.sql`, `20260723094500_private_trial_backend_v3_website.sql`, and `20260723144500_private_trial_backend_v4_hardening.sql`. Use an administrative migration connection; never edit or replay a historical migration, and never use the application runtime login for migrations. Runtime readiness requires schema version 4, including the v2 actor and decision controls, the v3 Website policies, and the v4 role, event/surface, server-timestamp, trigger, and initial-version controls.
3. Only after all migrations pass, create a distinct login role with a password-manager-generated secret and `LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Grant `supermega_trial_backend` to it with `INHERIT TRUE`, `SET FALSE`, and no admin option. The backend group must have exactly that one runtime member, and the runtime login must have exactly that one parent and no members of its own. Give the login no direct grants, default grants, role settings, or object ownership.
4. Use a TLS connection URL for that login. For Vercel serverless traffic, use the Supabase transaction-mode pooler and append `sslmode=require` (or a stronger provider-supported verification mode). Psycopg prepared statements are disabled by the runtime for transaction-pool compatibility.
5. Generate `SUPERMEGA_TRIAL_IDENTITY_SECRET` with a cryptographically secure password manager or secret generator. It must contain at least 32 UTF-8 bytes, pass the runtime diversity check, and must not contain placeholder markers such as `change-me`, `replace-me`, `example-secret`, `test-secret`, or `your-secret`. Keep it server-only and rotate it through the approved secret-management process.
6. Save the non-production runtime URL in an ignored local file such as `.tmp/supermega-nonproduction-database-url.txt`. Never place it in a command argument, source file, issue, task, or chat. Do not reuse a production URL for this rehearsal.
7. Run the read-only contract audit:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-nonproduction-database-url.txt -ValidateOnly
```

The audit must prove PostgreSQL major 17, encrypted read-only transport, exact role-membership edges, no runtime or backend role settings, no transitive runtime members, trusted ownership, the exact private schema version, forced RLS, exact grants and applicable default ACLs, browser-role isolation, complete policy and security-constraint fingerprints, exact trigger events, structure and function bodies, and exact indexes. Run Supabase Security Advisor after the migration and resolve every applicable finding. Exercise cross-workspace denial, access revocation, duplicate policy names, inverted or swapped identity predicates, trigger `WHEN` bypasses, global/default grants, mismatched approval event/surface combinations, immutable events, optimistic concurrency, backup, and restore on non-production data. PGlite and the local PostgreSQL 17 gate are strong preflight evidence but do not replace this hosted PostgreSQL 17.6 proof.

## Production handoff

1. Repeat the migration and read-only audit against the approved production project while `SUPERMEGA_TRIAL_WRITES_ENABLED=0`.
2. Store or atomically replace the Vercel production runtime secret:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-production-database-url.txt -Replace
```

3. Configure the server-only identity control and set `SUPERMEGA_TRIAL_WRITES_ENABLED=0` in the same Vercel production project. Do not use a duplicate GitHub database secret as release authority: the coordinated workflow validates `SUPERMEGA_DATABASE_URL` from the exact linked Vercel app environment before creating either production candidate.
4. Redeploy the exact reviewed `megaos` commit. Require `/api/health` to report `enterprise_db_ready=true`, while writes remain disabled.
5. Provision each named workspace membership with an explicit trusted actor kind (`human`, `service`, or `agent`) and least-privilege capabilities. Grant `website.write` only to actors who should change that workspace's Website records; v3 does not grant it automatically. The v2 migration labels every pre-v2 membership and historical actor field as `legacy`; those rows are denied by RLS until an administrator verifies the actor and explicitly reclassifies the membership. Do not bulk-promote legacy actors. The gateway must sign the v2 identity envelope including actor kind; the database membership must match it. Approval requests must use `decision_packet.v1` with a versioned subject, fact-or-analysis claims, source and capture provenance, verification state, uncertainty, visibility, baseline, target, current result, acceptance rule, artifact reference, and matching evidence references. Verified claims require a lowercase SHA-256 digest. Every terminal approval requires a named human actor and a trimmed, nonblank note of at most 500 characters. Pre-v2 pending approvals must be reissued under decision contract v2; historical terminal decisions remain preserved with `legacy` provenance. Prove that opaque or provenance-mismatched packets are rejected and service and agent actors cannot make a terminal approval even when they hold `approvals.decide`; also prove that service and agent actors cannot approve or record Website snapshots. Then pass the Commerce, Production, Website, company, setup, isolation, revocation, failure, and recovery journeys.
6. Record Founder and customer trial-owner approval. Only then set `SUPERMEGA_TRIAL_WRITES_ENABLED=1`, redeploy the same reviewed artifact, rerun the strict live gate, and begin the bounded trial.

If any gate fails, keep isolated-demo mode, set writes to `0`, and do not describe the workspace as activated. The helper emits sanitized JSON evidence, never prints the URL, and sends the production value to Vercel as a sensitive secret through standard input.
