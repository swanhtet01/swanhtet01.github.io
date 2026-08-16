# Production activation runbook — the founder's one turnkey decision

Status: PREP (living doc; final env names/order confirmed by the self-serve
end-to-end proof, task #14). Nothing here is executed by writing it.
Author: tech lead. Date: 2026-08-16.

This is the single consolidated `production_activation` decision. Every
technical proof it depends on is done on isolated infrastructure; this
document is the exact, ordered, reversible sequence to make the hosted
self-serve product real for customers. Read top to bottom before running.

## 0. Preconditions (all satisfied before this runbook is valid)

- hosted_postgres17: proven (v8-v10 applied to production OPS-745; advisor clear).
- security: proven (OPS-747, advisor clear, quarantine applied).
- hosted_storage_privacy: proven on isolated branch (OPS-752, six-for-six).
- managed_persistence: proven on isolated branch (OPS-759, seven-for-seven).
- self_serve_pilot: five defects fixed (fix/self-serve-remediation), proven
  end-to-end on an isolated branch (task #14 — six-for-six). **Do not run this
  runbook until that proof evidence exists in hq/readiness/.**
- The remediation branch is merged to trunk and released (paired release, live
  verified) so the deployed app carries the five fixes + the env-configurable
  store version.

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

Precise env names/values are finalized by the task-14 proof; current best:

**Step A — apply v11 to production** (Supabase MCP or dashboard SQL editor):
- Apply `supabase/migrations/20260816120000_private_trial_backend_v11_self_serve_grants.sql`
  verbatim against project zvtzwcimpvvtkowflhda.
- Verify: `select schema_version from app_private.trial_schema_meta;` → 11.
- Verify advisor still clear (get_advisors security → 0 ERROR / 0 WARN).

**Step B — tell the store to expect v11** (Vercel env, app runtime project):
- `SUPERMEGA_TRIAL_SCHEMA_VERSION=11`
- Redeploy the app so the runtime picks it up (or it reads at boot per config).
- The store now requires schema 11 AND production is at 11 → consistent.

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

---

End of runbook. This document authorizes nothing; the founder runs the steps.
