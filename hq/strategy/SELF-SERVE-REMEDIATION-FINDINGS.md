# Self-serve remediation findings — the hosted store was never validated against real Supabase

Date: 2026-08-16. Branch: fix/self-serve-remediation. Author: tech lead.
Status: 7 findings, ALL FIXED. Proven end-to-end six-for-six on a deleted
isolated branch through the real production connection path. NOT merged; trunk
green. The remaining step is a founder production_activation decision.

## The pattern (read this first)

The self-serve tenant endpoint (OPS-761) and the hosted trial store path were
written and unit-tested only against a LOCAL, direct-TLS PostgreSQL. They were
never exercised against Supabase's real production connection path: Supavisor
session pooler, over IPv4 (the Supabase direct host is IPv6-only, so a Vercel
serverless app has no choice but the pooler), as the non-BYPASSRLS runtime role
under real Row-Level Security. Consequently the store carried a CLASS of
environment incompatibilities — each isolated-branch proof attempt surfaced the
next one. Seven found in total. This was not a typo hunt; it was a
hosted-connection hardening pass done deliberately, with review.

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
| 6 | `_assert_runtime_role` `tls_active` reads `pg_stat_ssl` = FALSE via the pooler even though the client→pooler leg IS TLS | pg_stat_ssl reflects the Supavisor→Postgres leg, not the client leg; unreliable through any pooler | FIXED (founder-approved; TLS enforced at DSN config, server-side `show ssl=on` sanity check retained) |
| 7 | Cross-actor claim conflict raised the WRONG error class (`TrialInvalidTransition` "identity conflicts with durable history") instead of `claim_code_conflict` | the conflict guard read `workspace_memberships`, but the `workspace_memberships_self_read` RLS policy only exposes the caller's OWN row — a second user claiming a taken claim sees zero membership rows, so the guard is silently defeated and execution falls through to a generic durable-history error | FIXED (detect the collision via the workspace-scoped `workspace_access_controls` read, comparing `owner_actor_id`) |

## Finding 7 in detail (the one only real RLS could expose)

The store's create path guarded cross-actor claim collisions by selecting
`workspace_memberships` for the derived workspace and raising `TrialClaimConflict`
if any member was not the caller. That guard assumed the query could SEE another
actor's owner row. It cannot: the v8 `workspace_memberships_self_read` policy is
`actor_id = current_setting('app.actor_id')` — member-self visibility. So when a
DIFFERENT user claims an already-owned claim, the membership select returns zero
rows, the guard never fires, and the code falls through to the
`workspace_access_controls` existence check, which raises the generic
`TrialInvalidTransition("...identity conflicts with durable history.")`. The
endpoint would surface that as a confusing 409/500 instead of the correct
"this claim code is already in use." The fix uses the access-control read (whose
policy IS workspace-scoped, so the other actor's row is visible) and compares
`owner_actor_id`: a foreign owner → `TrialClaimConflict` → `claim_code_conflict`;
a same-owner corrupt state → the durable-history transition error, unchanged.

The offline self-test fixture modeled membership visibility as workspace-scoped,
which is why it passed proof 4 all along — it was faithful to what the store CODE
assumed, not to what production RLS actually does. Closing that fixture-fidelity
gap (so the offline self-test would catch this class of bug without a live branch)
is tracked as a follow-up hardening item.

## The green proof

Sealed evidence: `hq/readiness/self-serve-pilot-proof.json`
(contract `supermega.self-serve-pilot-proof.v1`). Six-for-six on branch
`self-serve-proof-v11c-24h-20260816` (ref xhumqlinowwetqcbeisw), run as the
`self_serve_pilot_runtime` login role via
`aws-0-us-east-1.pooler.supabase.com:5432` (session pooler, `sslmode=require`),
schema v11, then the branch was deleted:

1. window_closed_refused — the 503 gate refuses before the store is touched.
2. claim_creates_isolated_tenant — one owner tenant, 15 caps, claim linkage bound.
3. exact_idempotent_replay — same owner + claim replays with zero new rows.
4. different_user_same_claim_rejected — `claim_code_conflict` (finding 7 fixed).
5. created_event_immutable — update/delete rejected with SQLSTATE 55000.
6. cross_tenant_invisible — a second owner sees zero of the first tenant's rows.

`secrets_exposed: false`, `tenant_rows_exposed: false`,
`writes_confined_to_fixtures: true`.

## What is solid right now

- v11 migration: security-reviewed, replays clean on hosted PG17, fingerprints
  pinned. GUC-bound, no escalation path.
- All 7 store fixes: correct, full python suite green, proven end-to-end.
- The six-proof harness: 40 offline adversarial self-test cases; it caught 7 real
  hosted incompatibilities — it did exactly its job.

## Recommended next step

The end-to-end proof is done. The remaining work is:

1. The v11 target cascade in the kernel readiness contract (self_serve_pilot
   computed gate + localTargetVersion 10→11, which honestly reverts hosted_pg17
   and security to blocked because production is now one version behind the
   repo's target). This is on this branch only; trunk stays green.
2. A real PR presenting the founder's single `production_activation` decision
   (hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md): apply v11 to production, set
   the store schema version to 11, open the activation window, enable writes.
   Applying v11 brings hosted_pg17 and security back to green AND turns on
   self-serve — one coordinated, reversible, founder-run sequence.
