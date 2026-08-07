# Supabase preview-branch rehearsal runbook — the 24-hour window

This runbook scripts the entire bounded managed-pilot rehearsal window proposed
by `hq/readiness/managed-pilot-readiness.json` (contract
`supermega.managed-pilot-readiness.v3`) so no step is improvised. The founder
decision it executes is exactly the committed proposal:

- Target: one Supabase **preview branch**, never production, no production
  data, maximum lifetime **24 hours**, deleted after evidence.
- Proposed actions (and nothing more): `create_one_preview_branch`,
  `apply_reviewed_migrations_to_preview`, `create_one_named_preview_operator`,
  `run_hosted_isolation_storage_recovery_proof`,
  `delete_preview_branch_after_evidence`.
- It does **not** authorize: production database change, production deploy,
  customer messages, payments, stock moves, managed product activation, or
  hosted scheduler activation.

Two roles run the window:

- **FOUNDER** — the only person who touches the Supabase console, creates or
  deletes anything hosted, and pastes credentials (process-scoped environment
  values only; credentials never appear in command lines, files in the repo,
  or evidence).
- **OPERATOR** — runs the committed tools from a clean checkout of
  `origin/main`. Preparing and running this runbook requires no founder
  credentials until the founder pastes the branch connection values.

Steps marked **FOUNDER-CONSOLE** are console actions the repo does not (and
must not) automate. For those, this runbook states what to do conceptually and
exactly what output to capture; where the Supabase console offers choices this
repository does not document, capture what was chosen rather than improvising
further. The only branch mechanics the repo commits to are the documentation
links pinned inside the rehearsal packet
(`tools/prepare_supabase_rehearsal_packet.mjs`):
`https://supabase.com/docs/guides/deployment/branching/dashboard` and
`https://supabase.com/docs/guides/platform/backups`.

The orchestrator for everything tool-shaped is
`tools/run_preview_branch_rehearsal.mjs`. It performs zero actions until
`SUPERMEGA_REHEARSAL_DATABASE_URL` is set, fail-closes on the first failing
step, is resumable through a state file, and writes a sanitized evidence
packet under `.tmp/`.

---

## Step 1 — T-1 day: local preparation (OPERATOR, no network mutations)

Run from a clean checkout with `HEAD == origin/main` (`git fetch origin main`
first). Check every box before asking the founder for a window.

- [ ] `npm install` (installs the pinned `@electric-sql/pglite` used by the
      local quarantine proof).
- [ ] `npm run hq:verify` — green.
- [ ] `npm run database:public-browser-quarantine:verify` — green (local
      PGlite proof that the quarantine script denies browser roles, preserves
      `service_role`, is idempotent, and rejects inventory drift).
- [ ] `npm run database:migrations:verify` — green.
- [ ] `npm run database:validator:self-test` — green.
- [ ] `npm run storage:privacy:self-test` — green.
- [ ] `node tools/run_preview_branch_rehearsal.mjs --self-test` — green
      (stubbed database layer, no network).
- [ ] `node tools/run_preview_branch_rehearsal.mjs --dry-run` — review the
      full step plan and confirm the planned minutes leave a multi-hour buffer
      inside the 24-hour window (see the budget table below).
- [ ] PostgreSQL 17 client tools available: either `psql` 17 on `PATH` or
      `SUPERMEGA_POSTGRES17_BIN` pointing at the committed cache location used
      by `tools/rehearse_supermega_postgres17.py`
      (`%USERPROFILE%\.cache\supermega-postgresql\17.10-2\pgsql\bin`).
- [ ] Python 3 with the PostgreSQL driver reachable through
      `node tools/run_python_tool.mjs` (the validator self-test above proves
      this).
- [ ] Book the founder: the window needs the founder at Step 2, Step 4,
      Step 7, and Step 9.

## Step 2 — T0: create the preview branch (FOUNDER-CONSOLE)

What to do conceptually (per the committed docs link on dashboard branching):
open the production project (`zvtzwcimpvvtkowflhda` per `package.json`) in the
Supabase dashboard, open Branches, and create **one** preview branch. The
branch must:

- start **without production data** (readiness pins
  `startsWithProductionData: false`);
- mirror the production **schema**, i.e. managed schema `app_private` at
  version 7 plus the 27 legacy public tables and 2 sequences inventoried in
  `hq/readiness/supabase-security-advisor-audit.json`. The orchestrator
  fail-closes with `rehearsal_branch_must_mirror_production_schema_v7` if the
  branch arrives empty, because the audit-prescribed rehearsal is "apply v8
  through v10 plus the quarantine" on a v7 mirror — not a from-scratch
  install;
- enable database, auth, and storage (readiness `requiredServices`).

Acknowledge provider usage charges explicitly — the readiness contract records
`providerUsageChargesAcknowledged: false` until the founder does.

Capture (into the evidence folder, `.tmp/preview-branch-rehearsal/`):

- the branch **project ref** (20 lowercase characters — this becomes
  `SUPERMEGA_REHEARSAL_PROJECT_REF`),
- creation timestamp and a screenshot of the branch page,
- a note of every console option chosen (data/no-data, compute size, region),
- the billing acknowledgment note.

Start the 24-hour clock at branch creation time. Record T0.

## Step 3 — Rehearsal packet (OPERATOR)

Bind the reviewed release to the captured branch ref:

```
npm run database:supabase:packet -- --target-project-ref <branch-ref> --output .tmp/supabase-rehearsal-packet.json
npm run database:supabase:packet:verify -- .tmp/supabase-rehearsal-packet.json
```

The packet fail-closes if the checkout is dirty, if `HEAD` is not
`origin/main`, if the target equals production, or if the migration or
quarantine inventory drifted. Keep the packet in the evidence folder.

## Step 4 — Credentials and environment (FOUNDER pastes, OPERATOR runs)

**4a. Connection values (FOUNDER-CONSOLE).** From the branch page, capture:

- the administrative connection string for the **branch** — direct
  (`db.<branch-ref>.supabase.co:5432`, user `postgres`) or **session** pooler
  (port 5432; the transaction pooler on 6543 is rejected for migrations, per
  the committed validator) — with `sslmode=verify-full` and no other URL
  parameters;
- the SSL root certificate (download from the console; save under `.tmp/`,
  e.g. `.tmp/supermega-rehearsal-ca.crt`).

**4b. Branch logins (FOUNDER-CONSOLE).** The repo's hosted validator requires
a dedicated runtime login and a separate read-only storage-audit login; the
repo does not automate their hosted creation. In the branch SQL editor,
conceptually mirror the committed runtime-login creation in
`tools/rehearse_supermega_postgres17.py`: a `login inherit nosuperuser
nocreatedb nocreaterole noreplication nobypassrls` role granted membership in
`supermega_trial_backend` (runtime login), and a second login limited to
read-only storage metadata access (storage audit). Set passwords only in the
console. Capture: role names and attributes — never passwords. This is the
`create_one_named_preview_operator` action from the readiness proposal.

**4c. Environment (FOUNDER pastes into the operator's process-scoped
environment; nothing is written to disk or argv):**

| Variable | Value | Required |
| --- | --- | --- |
| `SUPERMEGA_REHEARSAL_DATABASE_URL` | branch admin URL from 4a | yes — the tool does nothing without it |
| `SUPERMEGA_REHEARSAL_PROJECT_REF` | branch ref from Step 2 | yes |
| `SUPERMEGA_SUPABASE_CA_FILE` | path to the CA file from 4a | yes |
| `SUPERMEGA_REHEARSAL_RUNTIME_DATABASE_URL` | runtime-login URL from 4b | for the hosted validator step |
| `SUPERMEGA_REHEARSAL_STORAGE_AUDIT_DATABASE_URL` | storage-audit URL from 4b | for the hosted validator step |
| `SUPERMEGA_POSTGRES17_BIN` | psql 17 bin directory | if psql 17 is not on `PATH` |
| `SUPERMEGA_STORAGE_PRIVACY_*` (12 values, see `tools/verify_private_storage_privacy.py`) | branch storage audit configuration | for the storage-privacy steps |

## Step 5 — The scripted run (OPERATOR)

```
node tools/run_preview_branch_rehearsal.mjs --dry-run   # final plan check
node tools/run_preview_branch_rehearsal.mjs             # the run
```

The orchestrator executes this committed sequence, fail-closed at every step:

| # | Step | What it proves (packet `requiredEvidence`) |
| --- | --- | --- |
| 1 | `release_pin` | clean checkout at `origin/main` |
| 2 | `local_quarantine_guard` | committed quarantine behaviour (local PGlite proof) |
| 3 | `migration_inventory` | v8–v10 bytes match the digests pinned in the security-advisor audit |
| 4 | `toolchain` | psql major 17 |
| 5 | `url_preflight` | `hostname-verified-postgresql-17-preflight` — read-only, verify-full, bound to the branch ref, never production; requires the v7 production mirror |
| 6–8 | `apply_v8` / `apply_v9` / `apply_v10` | `ordered-migration-application-through-v10` via `psql --set ON_ERROR_STOP=1 --file`; each committed migration self-guards its predecessor version |
| 9 | `apply_quarantine` | `public-browser-table-and-sequence-denial`, `public-default-privilege-denial-for-postgres-and-supabase-admin`, `service-role-contact-path-retained` — the committed SQL self-verifies and fail-closes on drift |
| 10 | `hosted_validator` | `read-only-v10-runtime-validator` |
| 11 | `storage_privacy_preflight` | offline configuration half of `private-storage-isolation-proof` |
| 12 | `session_revocation_probe` | `active-session-acceptance-and-revoked-session-denial` via the rollback-only committed probe |
| 13 | `evidence_packet` | sanitized, digest-bound local packet |

Resumability: completed steps are recorded in
`.tmp/preview-branch-rehearsal/<fingerprint>/state.json` and skipped on
re-run, so a mid-window failure costs only the failed step. `--reset-state`
discards the state after a deliberate restart decision. The state is
fingerprint-bound to the release commit, target ref, and file digests — if any
of those change, the tool refuses to resume.

On failure the tool prints one failure code and stops. Do not improvise —
every code has one scripted action:

| Failure code | Action |
| --- | --- |
| `rehearsal_target_not_configured` | Step 4c was not completed; paste the environment values. |
| `rehearsal_checkout_dirty` / `rehearsal_head_not_origin_main_fetch_first` | Reset the checkout to `origin/main`; re-run. |
| `rehearsal_branch_must_mirror_production_schema_v7` | The branch is empty or drifted. FOUNDER: delete it and recreate per Step 2. |
| `rehearsal_target_is_production` / `rehearsal_target_ref_mismatch` | Wrong ref or URL pasted; fix Step 4c. No hosted statement was executed. |
| `rehearsal_verify_full_required` / `rehearsal_connection_parameter_not_allowed` / `rehearsal_transaction_pooler_not_for_migrations` | Re-copy the connection string per Step 4a. |
| `migration_digest_mismatch_v8/9/10` | Local files drifted from the audit pins. Stop the window; investigate on a separate lane. |
| `psql_unavailable` / `psql_major_17_required` | Fix `SUPERMEGA_POSTGRES17_BIN`; resume. |
| `step_failed_apply_v*` / `step_failed_apply_quarantine` | Read the step evidence file; the committed guards state the reason (for example wrong schema version, changed inventory). If the branch state is wrong, FOUNDER recreates the branch; never patch SQL by hand. |
| `hosted_validator_environment_missing` | Complete Step 4b, paste the two URLs, resume. |
| `step_failed_hosted_validator` | Read the validator report in the evidence folder; it is read-only, so resume after fixing the named check. |
| `storage_privacy_environment_missing` / `step_failed_storage_privacy_preflight` | Complete the storage configuration (Step 6), resume. |
| `step_failed_session_revocation_probe` | If the failure is a privilege error on `auth.sessions`, use the founder fallback in Step 7 (real named session via console) and record it; otherwise treat as a real v10 regression and stop the window. |
| `rehearsal_evidence_credential_detected` | A tool echoed credential material. Stop; rotate the pasted credential; investigate before resuming. |
| `rehearsal_state_fingerprint_mismatch` | Inputs changed mid-window. Decide deliberately, then `--reset-state`. |

## Step 6 — Storage privacy configuration (OPERATOR + FOUNDER)

The orchestrator runs the **offline** configuration preflight
(`verify_private_storage_privacy.py --preflight`). The **live** six-request
hosted audit is founder-gated because it touches the branch Storage API and
requires a named owner approval id:

```
node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --confirm-read-only-audit <OWNER_APPROVAL_ID>
```

FOUNDER-CONSOLE beforehand: create one private bucket on the branch with two
tenant prefixes and sentinel objects, and two named authenticated users (their
JWTs become the `SUPERMEGA_STORAGE_PRIVACY_TENANT_*_JWT` values). Capture the
audit JSON (it is credential-free by design) into the evidence folder. This
covers `private-storage-isolation-proof` and
`named-user-auth-and-cross-tenant-denial`.

## Step 7 — Founder-gated hosted evidence (FOUNDER-CONSOLE)

The packet's remaining `requiredEvidence` entries are console-side. Capture
each into the operator file names pinned by the rehearsal packet:

- **Provider backup inventory before migration** →
  `.tmp/supermega-rehearsal-backup-evidence.json`. Conceptually: the branch
  project's Backups page per the committed docs link. Capture: what backups
  exist, their timestamps. Remember the committed recovery notes: provider
  physical backups do not preserve custom-role passwords, and database backups
  do not restore Storage objects.
- **Independent restore to an isolated target** →
  `.tmp/supermega-rehearsal-restore-evidence.json`. Capture: where the restore
  ran, row/object counts proving schema v10 and the quarantine survived
  restore (`restoredPublicBrowserQuarantinePreserved` is a pinned readiness
  check).
- **Security advisor without applicable errors** → re-run the advisor on the
  **branch** from the console after the quarantine step; capture the finding
  list. The 27 `rls_enabled_no_policy` INFO findings should no longer report
  browser-reachable grants.
- **Session-revocation fallback (only if step 12 failed on privileges)**:
  create one named user session on the branch (sign-in via the dashboard),
  re-run the probe, then delete the user. Capture both probe outputs.

## Step 8 — Evidence review (FOUNDER)

Walk the evidence packet
(`.tmp/preview-branch-rehearsal/<fingerprint>/evidence-packet-*.json`) against
the packet `requiredEvidence` list. Every entry must map to either an
orchestrator step evidence file or a Step 6/7 capture. Confirm the packet's
controls read `productionMutated: false`, `activationAllowed: false`,
`credentialsIncluded: false`. Anything missing → the rehearsal is **partial**;
record the gap, do not claim the gate.

## Step 9 — Branch deletion (FOUNDER-CONSOLE)

Before T+24h, and even if the rehearsal is incomplete (abort criterion:
anything still failing at T+20h):

- delete the preview branch from the console (`deleteAfterEvidence: true`);
- capture the deletion confirmation and timestamp into the evidence folder;
- rotate/discard every pasted credential (branch admin password, runtime and
  storage-audit passwords, tenant JWTs) — the branch is gone, the credentials
  must be too;
- confirm nothing production-side changed: `package.json` still records
  `productionSupabaseTargetStatus: "protected-unapproved"`, and no tool in
  this runbook ever accepted the production ref (both the orchestrator and the
  committed validator fail-close on it).

## Step 10 — After the window (OPERATOR, separate lane)

Archive the evidence folder outside `.tmp/`, post the summary to the
coordination board, and open a separate reviewed lane to refresh
`hq/readiness/managed-pilot-readiness.json` gates with the hosted evidence.
This runbook itself changes no readiness artifact.

---

## Time budget (mirrors `--dry-run`)

| Segment | Owner | Estimate |
| --- | --- | --- |
| Step 1 local preparation | Operator | before T0 |
| Step 2 branch creation | Founder | 45 min |
| Step 3 packet | Operator | 10 min |
| Step 4 logins + environment | Founder | 30 min |
| Step 5 orchestrated run (13 steps) | Operator | 68 min |
| Step 6 storage configuration + live audit | Founder + Operator | 60 min |
| Step 7 backup/restore/advisor evidence | Founder | 90 min |
| Step 8 evidence review | Founder | 120 min |
| Step 9 branch deletion + credential rotation | Founder | 15 min |
| **Planned total** | | **≈ 7.5 h** |
| **Buffer inside the 24 h window** | | **≈ 16.5 h** |

The buffer exists to absorb one branch recreation (Step 2 redo) and one full
resume cycle without threatening the deletion deadline. If two branch
recreations fail, stop: delete the branch, end the window, and diagnose
offline — the window must never be extended.
