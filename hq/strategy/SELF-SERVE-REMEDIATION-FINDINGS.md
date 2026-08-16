# Self-serve remediation findings — the hosted store was never validated against real Supabase

Date: 2026-08-16. Branch: fix/self-serve-remediation. Author: tech lead.
Status: 5 fixed, 1 open (needs a security-design decision). NOT merged; trunk green.

## The pattern (read this first)

The self-serve tenant endpoint (OPS-761) and the hosted trial store path were
written and unit-tested only against a LOCAL, direct-TLS PostgreSQL. They were
never exercised against Supabase's real production connection path: Supavisor
session pooler, over IPv4 (the Supabase direct host is IPv6-only, so a Vercel
serverless app has no choice but the pooler). Consequently the store carries a
CLASS of environment incompatibilities — each isolated-branch proof attempt
surfaces the next one. Six found so far. This is not a typo hunt; it is a
hosted-connection hardening pass that should be done deliberately, with review,
not as endless autonomous point-fixes.

Every one of these would have broken the first real customer. All were caught on
disposable branches; none reached production (self-serve ships dark behind 503).

## Findings

| # | Defect | Root cause | Status |
|---|---|---|---|
| 1 | `authorization_id` = raw `self-serve-claim-<claim>` string into a `uuid` column → 22P02, first write aborts | UUID column fed a non-UUID | FIXED (deterministic uuid5) |
| 2 | `authorization_contract='self_serve_claim_v1'` violates v6 CHECK (only managed/legacy allowed) → 23514 | schema never taught the self-serve contract | FIXED (v11 widens CHECK) |
| 3 | Runtime role has no INSERT policy on access_controls/memberships → every self-serve create denied | v6 reserved those writes for the privileged activation role | FIXED (v11 GUC-bound INSERT policies + grants) |
| 4 | Store `TRIAL_SCHEMA_VERSION=10` hard-pin can't run against v11 | rigid constant | FIXED (env-configurable, default 10) |
| 5 | `_assert_runtime_role` rejects Supabase's auto-granted, unremovable `postgres` admin member | store stricter than its own v4 backend_role_guard | FIXED (founder-approved; mirrors v4 tolerance) |
| 6 | `_assert_runtime_role` `tls_active` check reads `pg_stat_ssl` = FALSE via the pooler, even though the client→pooler leg IS TLS (`sslmode=require`) | pg_stat_ssl reflects the Supavisor→Postgres leg, not the client leg; unreliable through any pooler | **OPEN — needs decision** |

Finding 6 confirmed live: connected as the runtime role via
`aws-0-us-east-1.pooler.supabase.com:5432` with `sslmode=require`, all 13 other
role checks TRUE, `tls_active` FALSE. Since production must use this pooler
(direct host is IPv6-only), this check would reject every production connection.

## The decision finding 6 needs

The security goal is: the runtime's DB connection is encrypted in transit. The
current check verifies this per-backend via `pg_stat_ssl`, which is correct for a
direct connection but WRONG through a pooler (it can't see the client's TLS leg).

Correct direction (recommended, needs review because it changes how TLS is
verified — a security assertion):
- Enforce TLS at the CONNECTION CONFIG: require `sslmode=require` (or stronger,
  `verify-full`) in the DSN the store connects with. `psycopg` refuses to connect
  otherwise, so client→pooler TLS is guaranteed by configuration, not by a query.
- Optionally keep a server-side `show ssl = on` sanity check (server supports
  TLS) but drop the per-backend `pg_stat_ssl.ssl` requirement that breaks pooled
  connections.
- Document that the pooler→Postgres leg is inside Supabase's network; if that leg
  must also be provably encrypted, that is a Supabase platform question, stated
  honestly, not something the app can assert from a query.

This is a deliberate security-design change. It should be made with review (the
harness classifier correctly gates edits to these assertions), then re-proven on
a fresh branch via the pooler lane — the same six-proof audit, which should then
pass all six.

## What is solid right now

- v11 migration: security-reviewed, replays clean on hosted PG17, fingerprints
  pinned. GUC-bound, no escalation path.
- Fixes 1,4,5: correct, full python suite 500 OK.
- The six-proof harness itself: 40 offline adversarial self-test cases; it has
  now caught 6 real hosted incompatibilities — it is doing exactly its job.

## Recommended next step

Treat this as one hosted-connection hardening task: land the finding-6 TLS
redesign (with review), then re-run the full six-proof audit on a fresh pooler
branch. Expect it to pass all six — findings 1–5 are already proven individually
(role posture probe returned 14/14 with fix 5; the schema, policies, and auth all
staged clean). Only the TLS check stands between here and a green end-to-end
proof. After that: the v11 target cascade, then the founder's production_activation
runbook (hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md).
