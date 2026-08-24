# Production activation runbook — the founder's one turnkey decision

Status: READY FOR FOUNDER REVIEW, NOT AUTHORIZED — the self-serve end-to-end proof is complete (six-for-six,
`hq/readiness/self-serve-pilot-proof.json`, approvalId
`self-serve-proof-v11c-20260816`), so the env names and ordering below are
proof-confirmed. Nothing here is executed by writing it; only the founder runs
these steps. Production remains `protected-unapproved`. Author: tech lead.
Date: 2026-08-16 (updated 2026-08-20).

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

### 2a. Schema version and runtime env must move together

> **PROPOSED AMENDMENT — drafted 2026-08-20, awaiting founder review.** This
> subsection and the two matching entries in section 4 are a drafted
> correction, not an instruction the founder has accepted. They add no step,
> authorize nothing, and change nothing above: sections 0-1 and steps A-D are
> untouched, and the choice below is explicitly left to the founder. Accept,
> edit, or delete this block whole — the rest of the runbook reads correctly
> either way. It is written to stand alone: every mechanism is stated in full
> below, so nothing here depends on reading another document. The same trap is
> analysed at more length in `hq/strategy/CLIENT-READINESS-BRIEF.md` §2, "The
> schema-version trap" (on trunk since #488). The two agree; what this
> subsection adds is the env-scope split — that the two variables are read in
> two different processes — which that brief does not cover.
>
> **Revision note (2026-08-20).** An earlier revision of this subsection said
> v13 was BLOCKED, because `billing_rail.py`'s `runtime_role_denied` guard
> folded `billing_entitlements` SELECT in with the privileges v13 never grants,
> so a v13 database rejected every founder billing command. **#499 fixed that**
> (`1fe92b96`): the read is now permitted behind a version gate. That blocker is
> gone and the text asserting it has been removed. It has NOT been replaced with
> a recommendation to take v13 — see "What reaching v13 costs now", which is a
> shorter list than before but not an empty one.

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
  (`SUPERMEGA_BILLING_SCHEMA_VERSION`, default `12`), enforced in
  `_assert_schema` (line 693): the ledger rejects any target whose live schema
  version is not exactly this, independently of the trial store. Its default of
  `12` therefore does not match a v10 or v11 database. Separately, its schema
  probe reads privileges on the billing tables directly, and those tables ship
  in v12 — so the billing rail cannot operate against a v11 database at all,
  whatever this variable is set to.

The rule, stated once: **the database and both runtime env values must be
consistent before any managed read or write is attempted.** Never assume
either variable's default matches the target.

**The two variables are read in two DIFFERENT environments — setting both in
Vercel is not enough.** `SUPERMEGA_TRIAL_SCHEMA_VERSION` is read by the app
runtime, so step B's "set it in Vercel and redeploy" is right for that one.
`SUPERMEGA_BILLING_SCHEMA_VERSION` is not: `supermega_runtime/billing_rail.py`
is a founder-run CLI entrypoint (`python -m supermega_runtime.billing_rail`,
`main()` at line 1791, `if __name__ == "__main__":` at line 1888), and nothing
in the app runtime imports it — a repo-wide search finds no importer outside
its own test file. It reads the variable at **module import, in whichever
process runs the CLI command** (line 63). So setting it in Vercel and
redeploying does nothing for billing: the CLI keeps its own default of `12`.
**Export `SUPERMEGA_BILLING_SCHEMA_VERSION` in the shell where each founder
billing command runs**, matching the version the database actually reached,
and re-export it in every new shell. This applies under every fork below.

This finding is untouched by #499 and matters more at v13 than it did before,
not less — see the next section for why.

**What reaching v13 costs now.** v13 grants the runtime role SELECT — and only
SELECT — on `app_private.billing_entitlements`, so that the in-product premium
flag (`PostgresTrialStore._premium_unlocked`) can resolve instead of
fail-closing to `false`. `billing_rail.py` accepts that grant from schema
version 13 upward (`BILLING_ENTITLEMENT_READ_SCHEMA_VERSION = 13`, line 78;
the gate is the last clause of `runtime_role_denied`, line 710). Invoice and
event privileges, and entitlement *writes*, stay denied at every version — that
half of the guard is unchanged. What remains is not the flat contradiction the
earlier revision described, but it is not nothing — three costs:

- **The env-scope split becomes load-bearing.** The gate compares
  `snapshot["schemaVersion"]`, which `_assert_schema` has *already* required to
  equal `BILLING_SCHEMA_VERSION` — the env value — a few lines earlier. So on a
  v13 database with `SUPERMEGA_BILLING_SCHEMA_VERSION` unset, the CLI fails at
  the exact-version assert on its default of `12` and never reaches the gate at
  all. The failure surfaces as the schema-version error, not as anything naming
  entitlements. Exporting `SUPERMEGA_BILLING_SCHEMA_VERSION=13` in the founder
  shell is what makes v13 work; forgetting it looks exactly like v13 being
  broken.
- **A new fail-closed surface: the policy-predicate fingerprint.** Permitting
  the grant is safe only because RLS scopes it to the session's own workspace,
  so #499 also pinned the predicate by hash
  (`BILLING_ENTITLEMENT_READ_POLICY_DIGEST`, line 102) — a name/command/role
  check alone would pass a `using (true)` policy. That hash is taken over
  PostgreSQL's *deparsed* rendering of the policy, not the migration's source
  text. The file says so itself: a future PostgreSQL that deparses the same
  correct policy differently "would fail this check on an otherwise-correct
  database." That is the safe direction to fail, but it is a way v13 can be
  applied correctly and still take billing down, and it is only observable
  against a real database.
- **Neither v12 nor v13 has been proven on a disposable branch.** #499 is a
  code fix with unit coverage; it is not a migration proof. v13's own header
  says it is "Reviewed and local-rehearsed only … NOT proven on a hosted branch
  and NOT applied anywhere. Do not apply to production without a
  disposable-branch proof first." That is unchanged. **v13 being unblocked in
  code is not v13 being proven.** The fingerprint cost above is precisely the
  kind of thing a disposable-branch proof exists to catch.

v12 has never had this issue: it ships billing dark with zero policies and zero
grants for the runtime role, which is the state the guard's unchanged half
asserts. A v11→v12 database with both variables set to `12` is internally
coherent, and leaves `_premium_unlocked` fail-closed to `false` by design —
that is the deviation v13 exists to close. Note also that v13's own guard block
*requires* the database to already be at exactly 12, so v13 is never applied
instead of v12, only after it.

**The three forks, and what each costs. Which one to take is a founder
decision; this subsection does not recommend one.** Under every fork, database
first and env second, and `SUPERMEGA_BILLING_SCHEMA_VERSION` is exported in the
founder's CLI shell rather than set in Vercel.

- **v11 only — what section 2 already documents.** Run section 2 verbatim
  (`SUPERMEGA_TRIAL_SCHEMA_VERSION=11`), create tenant #1, complete the "Verify
  end-to-end" block and the section 5 evidence run. Cost: no billing at all —
  the billing tables ship in v12, so the rail cannot run against a v11 database
  whatever the env says. The section 5 evidence run is reachable; issuing an
  invoice is not. Requires no new migration proof.
- **v11 → v12 — billing operable, premium flag still dark.** Both variables at
  `12`. Cost: a v12 disposable-branch proof first, and `_premium_unlocked`
  stays `false` in-product, so nothing the customer sees changes when they pay;
  the founder can still issue, confirm and record. Reaching v12 later, after
  tenant #1 exists, is a maintenance window (see below).
- **v11 → v12 → v13 — billing operable and the premium flag live.** Both
  variables at `13`. Cost: proofs for v12 *and* v13, plus the fingerprint
  exposure above, plus the env-scope trap that makes a forgotten export look
  like a v13 failure. The zero-tenant argument for doing this in one window
  before tenant #1 exists is intact — the window where database and env
  disagree costs nothing when no tenant exists — but that argument is about
  *scheduling*, and does not substitute for the proofs.

**Any of these taken after tenant #1 exists is an announced maintenance
window**, with the partner warned, not an add-on to an activation window: the
tenant is fail-closed from the moment the migration lands until the redeploy
carrying the new env values is live, and that outage must be scheduled rather
than discovered. This is unchanged by #499 and applies to v12 and v13 alike.

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
  version the database actually reached. Do not set it in Vercel and expect
  the billing CLI to see it: the rail is a founder-run `python -m` entrypoint
  that reads the variable in its own process, so it must be exported in the
  shell where each billing command runs.
- *(Proposed 2026-08-20 with section 2a — awaiting founder review.)* Do not
  apply v12 or v13 to production on the strength of a code review alone.
  Neither has been proven on a disposable branch, and v13's own header forbids
  applying it to production without that proof. `billing_rail.py` pins v13's
  RLS policy predicate by a hash of PostgreSQL's deparsed rendering of it, so a
  correctly-applied v13 can still fail billing closed on a target whose server
  deparses it differently — a disposable-branch proof is how that is found
  before production, not after.

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
