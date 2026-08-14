# Hosted Postgres 17 branch rehearsal — 2026-08-12

Status: EVIDENCE (branch-scoped; production untouched)
Branch: security-rehearsal-24h-20260812 (project_ref usmpllbckvrucbjptiuq,
parent zvtzwcimpvvtkowflhda, created 2026-08-12T09:26:47Z, ~$0.01344/h,
founder-approved 24h lifetime, delete-after-evidence)

## What was proven

1. The full repo migration chain replays cleanly end-to-end on hosted
   Supabase Postgres 17: all 12 files in supabase/migrations/ applied in
   strict filename order via the management API, recorded as 12 migrations.
   Final state: public = 27 tables, app_private = 6 tables, all RLS enabled,
   trial_schema_meta at schema_version 10.
2. The browser-quarantine packet (supabase/rehearsal/
   20260804_public_browser_quarantine.sql) applies byte-identical on hosted
   PG17 once the vector extension lives in the extensions schema: every
   guard passed (inventory match, zero browser-callable routines in public,
   service_role baseline intact, both post-revoke verify blocks).
   Recorded as migration public_browser_quarantine_rehearsal (20260812094450).
3. Security advisors after quarantine: 0 ERROR, 0 WARN, 27 INFO — all
   rls_enabled_no_policy on the 27 public legacy tables, the baseline's
   deliberate posture (RLS on, no policies, quarantine revokes grants).

## Defect found and fixed

First replay failed at the quarantine packet's own preflight guard:
"public browser quarantine found a browser-callable routine". Root cause:
the baseline's unqualified `create extension if not exists vector` lands
pgvector in `public` on a fresh database (production has it in
`extensions`), and extension functions default to EXECUTE for PUBLIC.
Branch-side fix `alter extension vector set schema extensions;` cleared the
extension_in_public advisor WARN and let the packet apply unmodified.
Repo fix: baseline lines 30-32 now create all three extensions
`with schema extensions` so fresh replays match production layout.

## Gate relevance

- hosted_postgres17: the technical replay proof this gate needs now exists
  hosted (this note + branch migration table). Remaining: evidence intake
  into the kernel (v4 lockstep, see hq/strategy/SELF-SERVE-ONBOARDING-SPEC.md).
- security: advisor state on a fully-migrated hosted database is
  0 ERROR / 0 WARN; the 27 INFO findings are the accepted quarantine posture.
- Branch retained for the remaining hosted proofs (storage privacy,
  recovery) until the 24h window closes: delete by 2026-08-13T09:26Z.
  A second branch `supermega-dev` (fdcarrsjovmgfxqdwzgl, created
  2026-08-12T09:02Z, not by this session, migrations failed) is flagged to
  the founder for deletion.
