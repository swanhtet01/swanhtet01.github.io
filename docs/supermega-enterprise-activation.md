# >_ SuperMega managed-trial database activation

`app.supermega.dev` is an isolated, browser-local product demo until every managed-trial gate below passes. It does not use SQLite and it must not be represented as a customer system of record. The canonical managed backend is the private `app_private` schema in Supabase Postgres; browser code never receives its connection string or a service-role key.

The validator is intentionally read-only. It does not apply migrations, create users, provision workspaces, or enable writes.

## One-time non-production proof

1. Create a Supabase branch or separate non-production project and confirm backup and restore responsibilities.
2. Apply `supabase/migrations/20260722005134_private_trial_backend_foundation.sql`, `supabase/migrations/20260722142801_private_trial_backend_v2.sql`, and then `supabase/migrations/20260723094500_private_trial_backend_v3_website.sql` with an administrative migration connection. Never edit or replay a historical migration, and never use the application runtime login for migrations. Runtime readiness requires schema version 3, including the v2 actor and decision controls and the v3 Website surface policies.
3. Create a distinct login role with a password-manager-generated secret, `LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, and grant it membership in `supermega_trial_backend`. Give that login no direct grants and no object ownership.
4. Use a TLS connection URL for that login. For Vercel serverless traffic, use the Supabase transaction-mode pooler and append `sslmode=require` (or a stronger provider-supported verification mode). Psycopg prepared statements are disabled by the runtime for transaction-pool compatibility.
5. Generate `SUPERMEGA_TRIAL_IDENTITY_SECRET` with a cryptographically secure password manager or secret generator. It must contain at least 32 UTF-8 bytes, pass the runtime diversity check, and must not contain placeholder markers such as `change-me`, `replace-me`, `example-secret`, `test-secret`, or `your-secret`. Keep it server-only and rotate it through the approved secret-management process.
6. Save the URL in an ignored local file such as `.tmp/supermega-production-database-url.txt`. Never place it in a command argument, source file, issue, task, or chat.
7. Run the read-only contract audit:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-production-database-url.txt -ValidateOnly
```

The audit must prove encrypted read-only transport, a dedicated non-`BYPASSRLS` login, the exact private schema version, forced RLS, bounded grants, browser-role isolation, policies, immutable/version triggers, and required indexes. Run Supabase Security Advisor after the migration and resolve every applicable finding. Exercise cross-workspace denial, access revocation, immutable events, optimistic concurrency, backup, and restore on non-production data.

## Production handoff

1. Repeat the migration and read-only audit against the approved production project while `SUPERMEGA_TRIAL_WRITES_ENABLED=0`.
2. Store or atomically replace the Vercel production secret:

```powershell
powershell -ExecutionPolicy Bypass -File tools/activate_supermega_database.ps1 -DatabaseUrlFile .tmp\supermega-production-database-url.txt -Replace
```

3. Redeploy the exact reviewed `megaos` commit. Require `/api/health` to report `enterprise_db_ready=true`, while writes remain disabled.
4. Provision each named workspace membership with an explicit trusted actor kind (`human`, `service`, or `agent`) and least-privilege capabilities. Grant `website.write` only to actors who should change that workspace's Website records; v3 does not grant it automatically. The v2 migration labels every pre-v2 membership and historical actor field as `legacy`; those rows are denied by RLS until an administrator verifies the actor and explicitly reclassifies the membership. Do not bulk-promote legacy actors. The gateway must sign the v2 identity envelope including actor kind; the database membership must match it. Approval requests must use `decision_packet.v1` with a versioned subject, fact-or-analysis claims, source and capture provenance, verification state, uncertainty, visibility, baseline, target, current result, acceptance rule, artifact reference, and matching evidence references. Verified claims require a lowercase SHA-256 digest. Every terminal approval requires a named human actor and a trimmed, nonblank note of at most 500 characters. Pre-v2 pending approvals must be reissued under decision contract v2; historical terminal decisions remain preserved with `legacy` provenance. Prove that opaque or provenance-mismatched packets are rejected and service and agent actors cannot make a terminal approval even when they hold `approvals.decide`; also prove that service and agent actors cannot approve or record Website snapshots. Then pass the Commerce, Production, Website, company, setup, isolation, revocation, failure, and recovery journeys.
5. Record Founder and customer trial-owner approval. Only then set `SUPERMEGA_TRIAL_WRITES_ENABLED=1`, redeploy the same reviewed artifact, rerun the strict live gate, and begin the bounded trial.

If any gate fails, keep isolated-demo mode, set writes to `0`, and do not describe the workspace as activated. The helper emits sanitized JSON evidence, never prints the URL, and sends the production value to Vercel as a sensitive secret through standard input.
