# Production activation runbook — the founder's one turnkey decision

Status: READY — the self-serve end-to-end proof is complete (six-for-six,
`hq/readiness/self-serve-pilot-proof.json`, approvalId
`self-serve-proof-v11c-20260816`), so the env names and ordering below are
proof-confirmed. Nothing here is executed by writing it; only the founder runs
these steps. Author: tech lead. Date: 2026-08-16 (updated 2026-08-19).

This is the single consolidated `production_activation` decision. Every
technical proof it depends on is done on isolated infrastructure; this
document is the exact, ordered, reversible sequence to make the hosted
self-serve product real for customers. Read top to bottom before running.

## 0. Preconditions (all satisfied before this runbook is valid)

- hosted_postgres17: proven (v8-v10 applied to production OPS-745; advisor clear).
- security: proven (OPS-747, advisor clear, quarantine applied).
- hosted_storage_privacy: proven on isolated branch (OPS-752, six-for-six).
- managed_persistence: proven on isolated branch (OPS-759, seven-for-seven).
- self_serve_pilot: SEVEN hosted defects fixed (fix/self-serve-remediation) and
  proven end-to-end on a deleted isolated v11 branch — six-for-six through the
  session pooler under real RLS. Evidence: `hq/readiness/self-serve-pilot-proof.json`
  (approvalId `self-serve-proof-v11c-20260816`). This precondition is SATISFIED.
- The remediation branch is merged to trunk and released (paired release, live
  verified) so the deployed app carries the seven fixes + the env-configurable
  store version. **This is the one precondition still open — do not run steps
  B-D until that release is live.** (Step A, applying v11, is safe prep at any
  time: additive, opens nothing by itself.)

## 1. What this decision does (and what stays reversible)

Four coordinated changes, in strict order. The ORDER matters: the store must
not be told to expect v11 before v11 exists on production, or the trial store
path fail-closes.

| Step | Action | Reversibility |
|---|---|---|
| A | Apply migration v11 to PRODUCTION Supabase (zvtzwcimpvvtkowflhda) | Additive (a CHECK widen + 2 INSERT policies + 2 grants); a v12 could revoke, but v11 opens nothing by itself — the window flag (step C) is the real switch |
| B | Set `SUPERMEGA_TRIAL_SCHEMA_VERSION=11` on the app runtime env | Flip back to 10 anytime; store fail-closes if it disagrees with the live schema |
| C | Set `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW=open` + the target-binding env | Set to anything else (or unset) → endpoint 503s again. This is THE customer-facing switch |
| D | Set `SUPERMEGA_TRIAL_WRITES_ENABLED=true` (production writes on) | The one genuinely consequential, hardest-to-reverse step: once real customer tenants exist, they exist |

Steps A-B are safe prep (no customer can create anything until C+D). Step C
opens the door; step D lets writes land. You can do A-B, watch, then C-D.

## 2. Exact sequence (founder-run; each step verifiable)

Env names/values below are proof-confirmed (the six-proof audit exercised this
exact store configuration through the production connection path):

**Step A — apply v11 to production** (Supabase MCP or dashboard SQL editor):
- Apply `supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql`
  verbatim against project zvtzwcimpvvtkowflhda.
- Verify: `select schema_version from app_private.trial_schema_meta;` → 11.
- Verify advisor still clear (get_advisors security → 0 ERROR / 0 WARN).

**Step B — tell the store to expect v11** (Vercel env, app runtime project):
- `SUPERMEGA_TRIAL_SCHEMA_VERSION=11` (exactly the digits `11`).
- Redeploy the app so the runtime picks it up (or it reads at boot per config).
- The store now requires schema 11 AND production is at 11 → consistent.
- Safety net: an empty or mistyped value can NOT crash the app — the store
  falls back to expecting v10 and only the trial paths fail closed until the
  value is corrected (your step-D verification would catch it).

**Step C — open the activation window** (Vercel env):
- `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW=open` (exactly the string `open`).
- `SUPERMEGA_SUPABASE_PROJECT_REF=zvtzwcimpvvtkowflhda`
- `SUPERMEGA_RELEASE_COMMIT` / `VERCEL_GIT_COMMIT_SHA` = the live release SHA.
- Ensure managed auth is configured for verified-email sessions.

**Step D — enable production writes** (Vercel env):
- `SUPERMEGA_TRIAL_WRITES_ENABLED=true`
- The runtime login role must have the v11 INSERT grants (they ship in v11) and
  the tolerated Supabase `postgres` membership (fix 5 accepts it).

**Verify end-to-end (do this yourself before announcing):**
- Sign up on app.supermega.dev, get a claim code, submit the activation request,
  then use the managed login — a real RLS-isolated tenant should be created.
- Confirm in the DB: one workspace_access_controls row (self_serve_claim_v1),
  one owner membership (15 caps), one immutable company.workspace.created event.

## 3. Rollback

- Customer-facing: unset `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW` → 503 again.
- Writes: `SUPERMEGA_TRIAL_WRITES_ENABLED=false` → no new tenants.
- Schema: v11 is additive; no rollback needed. If ever required, a v12 revokes.
- The paired release rollback (stale-verifier auto-revert) still protects the
  app itself independently of these env flags.
- Code: for a bug found after a release already went green, see section 6.

## 4. What you should NOT do

- Do not set `SUPERMEGA_TRIAL_SCHEMA_VERSION=11` before v11 is applied to
  production (step B before step A) — the store will fail-closed and the trial
  path breaks.
- Do not open the window (C) before B — the endpoint would try to write against
  a v10 schema that can't accept it (the exact bug the proof caught).
- Do not enable writes (D) before you've personally verified a tenant creates
  correctly on the target.

## 5. After activation — the first-tenant evidence plan

Once the window is open and one real tenant exists, run the five-day
order-to-close + return-exception evidence plan (portfolio.json shop nextGate)
on that tenant. Baseline auto-measured; operator self-named per the self-serve
gate redefinition. That evidence is what turns "self-serve works" into "one
proven paying pilot," and it feeds the enterprise ladder (verified-statements →
staff-roles) and the scaling triggers.

## 6. Post-release rollback (bug found after a green release)

The release workflow auto-reverts only inside its own run. If customers hit a
bug after a release already went green, roll the pair back yourself:

1. Identify the last-good commit: `git log --oneline` on main, or the Actions
   history of "SuperMega - Coordinated Verified Release" — every run is bound
   to the full 40-char SHA it shipped.
2. Open that last-good GREEN run and click "Re-run all jobs". The re-run
   replays the original inputs — `release_commit` = that full 40-char SHA plus
   the confirmation `DEPLOY SUPERMEGA PAIRED PRODUCTION` — at the original
   commit, so the guards pass. Do NOT dispatch a fresh run pointing at an old
   SHA: the workflow rejects any `release_commit` that is not the current head
   of main. The owner lock (`github.actor` must be swanhtet01) still applies.
   If the run is too old to re-run (GitHub allows ~30 days), revert on main
   and release the revert commit through the normal dispatch instead.
3. The re-run re-deploys BOTH app.supermega.dev and supermega.dev as a pair at
   the old commit, through the full verify chain — recent green runs took
   about 5 minutes (hard timeout 35).
4. A redeploy does NOT touch env vars — the workflow reads and verifies the
   Vercel values as they are NOW. If the bug is env-related, fix the variable
   in the Vercel dashboard and redeploy; rolling the code back will not help.
5. After rollback, main still carries the bad commit and stays ahead of
   production. Fix forward on main, then release the fixed commit through the
   normal dispatch.

---

End of runbook. This document authorizes nothing; the founder runs the steps.
