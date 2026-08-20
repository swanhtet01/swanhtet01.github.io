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

### 2a. Schema version and runtime env must move together

> **PROPOSED AMENDMENT — drafted 2026-08-20, awaiting founder review.** This
> subsection and the two matching entries in section 4 are a drafted
> correction, not an instruction the founder has accepted. They add no step,
> authorize nothing, and change nothing above: sections 0-1 and steps A-D are
> untouched, and the choice below is explicitly left to the founder. Accept,
> edit, or delete this block whole — the rest of the runbook reads correctly
> either way. It is written to stand alone: every mechanism and both forks are
> stated in full below, so nothing here depends on reading another document.
> The same finding is analysed at more length in
> `hq/strategy/CLIENT-READINESS-BRIEF.md` §2, "The schema-version trap" —
> a companion brief landing separately in PR #488, so that file may not be on
> trunk yet when you read this.

Step B sets the store to expect v11 because the sequence above applies v11
alone. Two further migrations now exist in the repo —
`supabase/migrations/20260817090000_private_trial_backend_v12_billing_rail.sql`
and `supabase/migrations/20260818090000_private_trial_backend_v13_billing_entitlement_read.sql`
— and applying either of them while step B's value stays `11` leaves a tenant
on which every managed read and write fails closed. The reason is that BOTH
runtimes match the live schema version EXACTLY, against a number that comes
from an environment variable rather than from the database:

- `supermega_runtime/trial_store.py:52` — `TRIAL_SCHEMA_VERSION = _env_schema_version()`
  (`SUPERMEGA_TRIAL_SCHEMA_VERSION`, default `10`). `_assert_schema` raises
  `TrialNotReadyError(("schema_ready",))` whenever
  `int(row["schema_version"]) != TRIAL_SCHEMA_VERSION` (line 3282). This is an
  exact match, not a minimum: a database AHEAD of the env fails exactly as
  hard as one behind it.
- `supermega_runtime/trial_store.py:320` — `if TRIAL_SCHEMA_VERSION >= 12:`
  extends `_PRIVATE_HARDENING_TRIGGER_CONTRACT` with the billing tables, and
  `_assert_schema` ALSO rejects a trigger-inventory length mismatch (line
  3321). So this variable is not merely a number to bump: at 12 and above it
  changes the trigger inventory the store demands of the database. Env at 12+
  against a v11 database fails, and a v12+ database against env `11` fails —
  the two must move together in both directions, forward on a migration and
  backward on any rollback.
- `supermega_runtime/billing_rail.py:63` — `BILLING_SCHEMA_VERSION = _env_schema_version()`
  (`SUPERMEGA_BILLING_SCHEMA_VERSION`, default `12`), enforced at line 543:
  the ledger rejects any target whose live schema version is not exactly this,
  independently of the trial store. Its default of `12` therefore does not
  match a v10 or v11 database. Separately, its schema probe reads privileges on
  the billing tables directly, and those tables ship in v12 — so the billing
  rail cannot operate against a v11 database at all, whatever this variable is
  set to.

The rule, stated once: **the database and both runtime env values must be
consistent before any managed read or write is attempted.** Never assume
either variable's default matches the target.

**The two safe forks — choosing between them is a founder decision.** Each is
stated here in full; nothing is executed by writing it, and the founder picks
one and runs it.

- **Fork A — reach v13 before tenant #1 exists.** In one window apply v11,
  v12 and v13 so the database reaches 13; then set BOTH
  `SUPERMEGA_TRIAL_SCHEMA_VERSION=13` and `SUPERMEGA_BILLING_SCHEMA_VERSION=13`
  and redeploy; only then run step C and step D. Database first, env second —
  the same ordering section 4 already insists on for v11. The window in which
  database and env disagree is unavoidable, and under this fork it costs
  nothing **because the tenant count is zero.** That is the whole reason Fork A
  is cheap, and it stops being free the moment step D has produced a real
  tenant.
- **Fork B — v11 now, billing later.** Run section 2 verbatim (v11, env `11`),
  create tenant #1, and complete the "Verify end-to-end" block and the section
  5 evidence run first; then schedule v12+v13 as an announced maintenance
  window with the partner warned. Under this fork the tenant is fail-closed
  from the moment that later migration lands until the redeploy carrying the
  new env values is live — that is the outage being scheduled, and it is the
  cost of this fork rather than a surprise. Billing is unavailable until that
  window completes.

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
- *(Proposed 2026-08-20 with section 2a — awaiting founder review.)* Do not
  apply a migration without setting the matching runtime env values in the same
  window. Both `SUPERMEGA_TRIAL_SCHEMA_VERSION` and
  `SUPERMEGA_BILLING_SCHEMA_VERSION` demand an EXACT match with the live schema
  version, so a database left ahead of the env fail-closes every managed read
  and write just as surely as one left behind. Applying v12 or v13 as a quiet
  add-on alongside step A, while step B's value stays `11`, is the specific
  mistake this warns against.
- *(Proposed 2026-08-20 with section 2a — awaiting founder review.)* Do not
  assume `SUPERMEGA_BILLING_SCHEMA_VERSION`'s default of `12` matches the
  target. It does not match a v10 or v11 database, and it is checked
  independently of the trial store's variable — set it explicitly to whatever
  version the database actually reached.

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
