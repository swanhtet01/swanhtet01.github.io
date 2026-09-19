# Production activation runbook — the founder's one turnkey decision

Status: READY FOR FOUNDER REVIEW, NOT AUTHORIZED — the self-serve end-to-end proof is complete (six-for-six,
`hq/readiness/self-serve-pilot-proof.json`, approvalId
`self-serve-proof-v11c-20260816`), so the env names and ordering below are
proof-confirmed. Nothing here is executed by writing it; only the founder runs
these steps. Production remains `protected-unapproved`. Author: tech lead.
Date: 2026-08-16 (updated 2026-08-27).

This is the single consolidated `production_activation` decision. Every
technical proof it depends on is done on isolated infrastructure; this
document is the exact, ordered, reversible sequence to make the hosted
self-serve product real for customers. Read top to bottom before running.

## 0. Preconditions (all satisfied before this runbook is valid)

- hosted_postgres17: proven; protected production is PostgreSQL 17 at managed
  schema v11 with zero drift from the local v11 target.
- security: proven; the current advisor audit is clear, browser access to
  current application objects is denied, and application-owner defaults do not
  reopen browser grants. Provider-owned defaults remain monitored separately.
- hosted_storage_privacy: proven on isolated branch (OPS-752, six-for-six).
- managed_persistence: proven on isolated branch (OPS-759, seven-for-seven).
- self_serve_pilot: SEVEN hosted defects fixed (fix/self-serve-remediation) and
  proven end-to-end on a deleted isolated v11 branch — six-for-six through the
  session pooler under real RLS. Evidence: `hq/readiness/self-serve-pilot-proof.json`
  (approvalId `self-serve-proof-v11c-20260816`). This precondition is SATISFIED.
- Migration v11 is already live on protected production. Do not apply it again
  as an activation step.
- Billing migrations v12/v13 are source-controlled and separately proven, but
  they are **not** part of this v11 self-serve activation runbook. Do not apply
  them, set `SUPERMEGA_BILLING_SCHEMA_VERSION`, or expect premium entitlement
  reads during this run unless a newer founder-approved runbook and verifier
  explicitly replaces this v11 sequence.
- The exact candidate must be merged to trunk and released as a paired,
  live-verified app/public commit. **This and the founder approval receipt are
  the open preconditions; do not provision the runtime login or run steps B-D
  until both exist.**

## 1. What this decision does (and what stays reversible)

Four coordinated changes, in strict order. The ORDER matters: the store must
not be told to expect v11 before v11 exists on production, or the trial store
path fail-closes.

| Step | Action | Reversibility |
|---|---|---|
| A | Reconfirm schema v11 and the clear read-only security audit; then provision the dedicated `supermega_trial_login` only through the reviewed production handoff | Re-running the read-only audit changes nothing. The login can be rotated separately and receives only the backend membership proven by the provisioner |
| B | Set `SUPERMEGA_TRIAL_SCHEMA_VERSION=11` on the app runtime env | Flip back to 10 anytime; store fail-closes if it disagrees with the live schema |
| C | Set `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW=open` + the target-binding env | Set to anything else (or unset) → endpoint 503s again. This is THE customer-facing switch |
| D | Set `SUPERMEGA_TRIAL_WRITES_ENABLED=true` (production writes on) | The one genuinely consequential, hardest-to-reverse step: once real customer tenants exist, they exist |

Steps A-B are safe prep (no customer can create anything until C+D). Step C
opens the door; step D lets writes land. You can do A-B, watch, then C-D.

### Schema-version fork — choose one before activation

This document's executable path is the **v11 self-serve fork**:

- protected production remains at schema 11;
- `SUPERMEGA_TRIAL_SCHEMA_VERSION=11`;
- `SUPERMEGA_BILLING_SCHEMA_VERSION` stays unset;
- billing invoices, payment confirmation, and premium entitlement reads remain
  founder-gated future work.

The **billing-ready fork** is a different activation package, not a toggle in
this runbook. It would first require owner-approved production application of
v12 and v13, a matching runtime expectation for the same live schema version,
`SUPERMEGA_BILLING_SCHEMA_VERSION=13`, an updated managed-environment verifier,
and a fresh hosted proof that self-serve activation plus entitlement reads both
pass on the same target. Do not mix the forks: a v13 database with
`SUPERMEGA_TRIAL_SCHEMA_VERSION=11` fail-closes, and a v11 database with billing
v13 runtime expectations fail-closes.

## 2. Exact sequence (founder-run; each step verifiable)

Env names/values below are proof-confirmed (the six-proof audit exercised this
exact store configuration through the production connection path):

**Step A — reconfirm v11, then provision the dedicated runtime login:**
- Re-run the read-only schema/security audit and verify
  `app_private.trial_schema_meta.schema_version` is 11 with no applicable
  Security Advisor warning or error.
- Keep the committed target `protected-unapproved` until the founder approves
  the exact release, first named owner, runtime-role provisioning, and activation
  window in one reviewed receipt.
- After that receipt and its separate `activation-approved` guard commit exist,
  run `tools/provision_supermega_runtime_role.py` with the production admin URL
  and generated runtime password supplied only through ignored files. Require
  `--expected-project-ref zvtzwcimpvvtkowflhda`, `--production-handoff`, the
  exact approval UUID, and `--apply`.
- Save the sanitized evidence receipt and validate a TLS runtime connection as
  `supermega_trial_login`. Never put either database URL or password on the
  command line, in Git, in a browser, or in a client-visible environment value.

**Step B — tell the store to expect v11** (Vercel env, app runtime project):
- `SUPERMEGA_TRIAL_SCHEMA_VERSION=11` (exactly the digits `11`).
- Leave `SUPERMEGA_BILLING_SCHEMA_VERSION` unset for this v11 self-serve fork.
  The billing rail defaults fail-closed unless the separately approved billing
  migration fork is active; do not set a billing schema value to make a premium
  flag appear.
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
- The dedicated runtime login must pass the exact role-attribute, membership,
  TLS, and no-ownership postconditions before writes are enabled.

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

- Do not proceed if the read-only audit no longer reports schema 11 or if the
  dedicated runtime-login postconditions fail.
- Do not open the window (C) before B — the endpoint would try to write against
  a v10 schema that can't accept it (the exact bug the proof caught).
- Do not enable writes (D) before you've personally verified a tenant creates
  correctly on the target.
- Do not apply v12/v13 billing migrations during this v11 run, and do not set
  `SUPERMEGA_BILLING_SCHEMA_VERSION` as a shortcut. The current environment
  verifier and activation script are v11 self-serve controls; the billing-ready
  fork needs its own reviewed runbook, verifier update, and hosted proof.

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
