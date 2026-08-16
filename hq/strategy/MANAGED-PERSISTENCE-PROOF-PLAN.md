# Managed persistence proof - executable design

Status: PLAN (no hosted action taken; production untouched; no new tools written yet)
Gate: managed_persistence (kernel/managed-pilot-readiness.mjs line 222, contract v4)
Evidence today: 'Live managed persistence ready is false.' -> nextAction 'Prove durable
commands, recovery, and tenant isolation on the isolated target.'
Template: hq/strategy/HOSTED-STORAGE-PRIVACY-PLAN.md (proven 2026-08-14: branch
lzemsljybmzuyfqaeqey created, audited, deleted; evidence intake flipped the gate).
Local ground truth: tools/rehearse_supermega_postgres17.py already proves all of this
offline (56 checks incl. managed_activation_atomic_rollback, managed_exact_retry,
optimistic_concurrency, event_immutability, tenant_isolation, backup_created,
restore_completed). This plan repeats the minimal core on hosted Supabase.

## 1. What the gate means against app_private, and the minimal hosted proof set

Durable commands, recovery, and tenant isolation in product terms:
  - Durable command: a Shop/Plant/Website action lands as one committed transaction
    in app_private.workspace_state (version bigint, +1 guard) plus one immutable
    app_private.workspace_events row keyed by (workspace_id, command_id) with a
    sha256 command_fingerprint. Retry of the exact command is a no-op read of the
    recorded result (unique constraint), not a second effect.
  - Recovery: a workspace can be exported to a digest-bound package and restored
    into an empty workspace with row counts and integrity re-verified inside the
    restore transaction (tools/manage_workspace_recovery.py, rollback_on_any_
    insert_or_acceptance_failure). This is what workspace:recovery:self-test proves
    offline with fixtures; shop:outbox:self-test proves the client-side staged-
    intent half (stage, acknowledge, recover, bounded pending).
  - Tenant isolation: the trial backend role sees rows only through transaction-
    local identity (set_config('app.workspace_id'/'app.actor_id'/'app.actor_kind',
    ..., true)); scoped reads (e.g. app_private.actor_workspace_directory) return
    only the actor's own workspaces.

Minimal hosted proof set: 7 fixed proofs, exact order, on a fresh 24h preview
branch of zvtzwcimpvvtkowflhda, using a branch-only login role granted
supermega_trial_backend, confined to fixture workspaces 'persistence-proof-a/b':
  1. durable_write_readback          command commits state v1 + event; new session
                                     reads back exact digest and resulting_version
  2. exact_idempotent_retry          same command_id+fingerprint replays with zero
                                     new rows (mirrors managed_exact_retry)
  3. version_conflict_rejected       stale expected version -> guard raises 40001;
                                     invalid initial version denied
  4. event_immutability_enforced     update/delete on workspace_events -> 55000
  5. cross_tenant_read_denied        actor A identity: B's workspace_state/events
                                     and directory rows invisible; positive control
                                     first (A sees own sentinel)
  6. workspace_backup_restore_roundtrip  export workspace A -> verify package
                                     integrity digest -> restore plan -> restore
                                     into empty 'persistence-proof-restore' on the
                                     SAME branch; counts and digest match
  7. induced_failure_atomic_rollback multi-write transaction with forced failure on
                                     the last statement; read-back proves zero
                                     partial effect (mirrors managed_activation_
                                     atomic_rollback)
Platform-equivalent boundary, stated honestly: hosted physical backup (PITR/
pg_dump against the branch) is a Supabase platform service; proof 6 exercises the
product-level recovery path we own. The local rehearsal already proves
backup_created/restore_completed with pg_dump; evidence wording must not claim
hosted platform PITR was exercised. If the founder wants platform-level restore
evidence, that is a separate decision, not silent scope growth.

## 2. Instrument

No existing tool runs this hosted as-is: rehearse_supermega_postgres17.py
provisions its own local PG17 cluster (archive download, initdb) and is pinned
into the digest-bound local evidence; do not fork it. Smallest new instrument:

tools/verify_managed_persistence.py, following verify_private_storage_privacy.py
conventions exactly:
  - Fixed script, fixed budget: MAX_SESSIONS=4 (runtime A, runtime B, recovery
    admin, fresh read-back), MAX_STATEMENTS=40; nothing dynamic, no retries.
  - Session-process env only, never on disk. Non-secret:
    SUPERMEGA_MANAGED_PERSISTENCE_ADAPTER=postgres_trial_backend_v1,
    _ALLOWED_HOST (exact branch db host), _OWNER_APPROVAL_ID,
    _WORKSPACE_A/_WORKSPACE_B (distinct, 'persistence-proof-' prefix), _ACTOR_A/
    _ACTOR_B. Secret: _DATABASE_URL (direct port 5432, sslmode=require enforced;
    host must equal _ALLOWED_HOST; production ref zvtzwcimpvvtkowflhda in the host
    is rejected fail-closed).
  - Reuses manage_workspace_recovery.py functions (export_workspace,
    verify_package, build_restore_plan) for proof 6 - import, not reimplement.
  - Flags: --self-test (offline adversarial cases incl. partial-commit, mutated
    retry, cross-tenant leak, budget overrun -> all must fail closed),
    --preflight (zero-network config validation, mode=
    offline_configuration_preflight), --confirm-hosted-persistence-audit
    OWNER_APPROVAL_ID (the only mode that connects).
  - Output: stdout JSON, digests and status codes only (state payloads and
    connection values never appear; workspace ids are fixtures and may appear).
    Failure prints a bare error code to stderr and exits 1; never persist stderr.
  - package.json: persistence:proof:self-test / persistence:proof:preflight via
    node tools/run_python_tool.mjs, wired into app:verify beside
    storage:privacy:self-test.

## 3. Evidence shape

New file (source receipt #9): hq/readiness/managed-persistence-proof.json,
mirroring hq/readiness/hosted-storage-privacy-proof.json field-for-field:
  { "contract": "supermega.managed-persistence-proof.v1",
    "approvalId": "<founder id>",
    "recordedAt": "<iso>",
    "operator": "<session, founder-directed>",
    "branch": { "name": "managed-persistence-proof-24h-YYYYMMDD",
                "projectRef": "<ref>", "parentProjectRef": "zvtzwcimpvvtkowflhda",
                "createdAt": "<iso>", "deletedAt": "<iso>",
                "maximumLifetimeHours": 24, "deleteAfterEvidence": true },
    "instrument": { "path": "tools/verify_managed_persistence.py",
                    "commit": "<git sha>", "selfTestCases": <n> },
    "audit": <exact instrument stdout JSON, verbatim>: contract
      "supermega.managed-persistence.v1", ok, captured_at, adapter,
      schema_version_observed: 10, proofs[7] (id + result, exact order),
      sessions_performed: 4, statements_performed: <=40,
      writes_confined_to_fixture_workspaces: true, secrets_exposed: false,
      tenant_rows_exposed: false, evidence_digest, target_host_digest }
Plus a narrative note hq/research/managed-persistence-branch-YYYYMMDD.md in the
20260812 pg17 format (what was proven, defects, gate relevance, delete-by).

## 4. Kernel v4 lockstep map (one commit; kernel is its own receipt, regen forced)

  a. kernel/managed-pilot-readiness.mjs
     - const MANAGED_PERSISTENCE_PROOF_CONTRACT = 'supermega.managed-persistence-
       proof.v1'; REQUIRED_SOURCE_RECEIPT_COUNT 8 -> 9 (line 42).
     - New nullable input managedPersistenceEvidence beside the storagePrivacy
       intake (lines 115-135), validated fail-closed: contract, non-empty
       approvalId, audit.ok===true, the 7 proof ids in exact order with passing
       results, audit.schema_version_observed===10, sessions_performed===4,
       statements_performed<=40, secrets_exposed===false,
       tenant_rows_exposed===false, branch.deleteAfterEvidence===true, parseable
       branch.deletedAt and recordedAt (intake only after cleanup). Any invalid
       shape fails the build (managed_pilot_readiness_persistence_proof_invalid).
     - Two-state doc pin, mirroring the storage phrase check (lines 133-135) but
       against hq/NOW.md (already input hqNow): without evidence NOW.md must say
       'Four hosted-readiness gates'; with evidence 'Three hosted-readiness
       gates'. Phrase without evidence, or evidence without phrase, fails
       (managed_pilot_readiness_persistence_evidence_invalid). NOW.md line 12
       'Live managed persistence ready: false' STAYS false in both states - it
       describes live production, which this branch proof does not touch; the
       line 172 boundary check is unchanged.
     - Gate (line 222): gate('managed_persistence', proofComplete ?
       'ready-hosted' : 'blocked', ...) via persistenceGateEvidence()/
       persistenceGateReady() helpers mirroring the storage gate. Blocked strings
       stay byte-identical to today's; ready evidence: 'Seven-proof hosted
       persistence audit passed on a deleted isolated branch: durable write with
       read-back, exact idempotent retry, version-conflict rejection, event
       immutability, cross-tenant denial, workspace backup and restore round
       trip, atomic rollback on induced failure.' Ready nextAction: 'Keep the
       persistence evidence and instrument current.'
     - Ledger block managedPersistence { proofComplete, contract, approvalId,
       recordedAt, branchDeletedAt } mirroring storagePrivacy (lines 275-281).
     - Validator: add 'managed_persistence' to the ready-hosted whitelist (line
       371) and pin its status to proofComplete (mirror line 374); pin its
       evidence string (lines 377-379 block); validate the managedPersistence
       block exactly like storagePrivacy (lines 356-367).
  b. tools/manage_managed_pilot_readiness.mjs: append
     'hq/readiness/managed-persistence-proof.json' to sources (line 13-22) and
     pass the parsed file as managedPersistenceEvidence (line 28-37). The file
     ships in the same commit, so the unconditional read is safe - identical to
     how the storage proof landed.
  c. tools/verify_hq_contract.mjs line 1096: sourceReceipts.length 8 -> 9; add a
     receipt-path check for the new file beside line 1098.
  d. kernel/managed-pilot-readiness.test.mjs: receipts to 9 paths; default
     fixture carries valid persistence evidence + 'Three' phrase (blockingGates
     3); reject tests: evidence without phrase, phrase without evidence, mutated
     proof list, statements over budget, missing deletedAt, tenant_rows_exposed
     true.
  e. hq/NOW.md: line 68 'Four hosted-readiness gates ... (hosted PG17, security,
     and storage privacy are ready-hosted)' -> 'Three ... (hosted PG17, security,
     storage privacy, and managed persistence are ready-hosted)'; reword line 67
     to scope 'unproven' to live production only. Pinned phrases on lines 9-13,
     68 ('no release drift'), 69 ('No self-serve pilot tenant') survive.
  f. Regen + verify: readiness:managed:write, readiness:managed:self-test,
     hq:verify. Expected ledger: blockingGateCount 3; managed_persistence
     ready-hosted; overall status stays 'blocked' (validator requires it).

## 5. Runbook (next session; FOUNDER marks owner-only steps)

Phase 0 - baseline (agent, offline): build the instrument; persistence:proof:
  self-test green; workspace:recovery:self-test and shop:outbox:self-test green;
  hq:verify green; MCP list_branches on zvtzwcimpvvtkowflhda confirms zero
  leftover branches (storage-privacy-proof-24h-20260814 deleted 2026-08-14; the
  20260812 pair usmpllbckvrucbjptiuq / fdcarrsjovmgfxqdwzgl past delete-by).
Phase 1 - FOUNDER decisions (record in the decision log):
  F1. Approval ID, e.g. OWNER-PERSISTENCE-PROOF-20260816-01.
  F2. Approve one preview branch managed-persistence-proof-24h-YYYYMMDD, max 24h,
      delete-after-evidence, cost acknowledged (~$0.01344/h, ~$0.32/24h; MCP
      confirm_cost before create_branch).
  F3. Approve the branch-only setup writes (reviewed SQL): one login role
      'persistence_proof_runtime' granted supermega_trial_backend (TLS required,
      no superuser/createrole), memberships and sentinel state for fixture
      workspaces, one recovery-authority connection for proof 6 export/restore.
Phase 2 - branch + setup (agent under F2/F3, BRANCH ref only):
  2.1 create_branch; record ref, createdAt, deleteBy.
  2.2 Apply all 12 repo migrations in strict filename order incl. the public
      legacy baseline - the extensions-schema fix from the 20260812 defect is
      already in the baseline, so the replay must succeed unmodified; confirm
      trial_schema_meta schema_version 10. Any failure: stop, note, delete.
  2.3 Branch SQL: create the login role and fixture tenants; credentials go
      straight into the session process env, never echoed or written.
Phase 3 - one temporary PowerShell process: set env per section 2, then
  npm.cmd run persistence:proof:preflight
  # accept only mode=offline_configuration_preflight, network_requests_performed
  # =0, secrets_exposed=false
Phase 4 - FOUNDER confirms target host + approval ID, then in the same process:
  node tools/run_python_tool.mjs tools/verify_managed_persistence.py --confirm-hosted-persistence-audit $env:SUPERMEGA_MANAGED_PERSISTENCE_OWNER_APPROVAL_ID
  # capture stdout JSON only; on exit 1 see section 6 - never retry blindly
Phase 5 - FOUNDER decision: delete_branch before deleteBy; record deletedAt;
  close the PowerShell process (discards all secrets).
Phase 6 - evidence intake (agent): write the two evidence files, apply the
  section 4 lockstep diff in one commit, regen and verify per 4f.

## 6. Fail-closed rules and founder stops

- Any proof failure: exit 1 with a bare code; no evidence file; gate stays
  blocked; the 'Four' phrase stands; Phase 5 branch deletion runs regardless.
- Connection discipline: direct 5432 with sslmode=require only. If the branch
  exposes only the transaction-mode pooler, STOP for a founder decision; never
  loosen TLS, host pinning, or session assumptions to make it pass.
- Budget discipline: exceeding MAX_SESSIONS/MAX_STATEMENTS aborts mid-run as a
  hard error; there is no partial pass and no degraded evidence.
- Secret hygiene: credentials live in one throwaway process; evidence is digests
  only; kernel serialization guard (line 382-383) already rejects postgresql://,
  password=, service_role in the ledger; the instrument redacts and its
  self-test asserts it.
- Scope honesty: this proves the persistence mechanism on an isolated branch.
  Production keeps 'Live managed persistence ready: false', stays protected-
  unapproved, holds zero workspace data, and its activation remains a separate
  founder gate. Evidence wording says 'preview branch', never production, and
  never claims platform PITR (section 1 boundary).
- Anti-laundering: intake demands the 7 exact proof ids, fixed budgets, deletedAt
  set, and phrase+evidence two-state consistency; verify_hq_contract re-derives
  blockingGateCount from gate statuses, so a hand-edited ledger fails hq:verify.
- Founder stops (no agent discretion): approval ID; branch cost; setup SQL
  review; live-run confirmation; branch deletion; plus any migration replay
  failure, pooler-only connectivity, unexpected pre-existing branch, or advisor
  ERROR/WARN observed on the branch.
