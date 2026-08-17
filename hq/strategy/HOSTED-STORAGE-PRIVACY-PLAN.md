# Hosted storage privacy proof - executable design

Status: PLAN (no hosted action taken; production untouched)
Gate: hosted_storage_privacy (kernel/managed-pilot-readiness.mjs line 195, contract v4)
Verifier: supermega.private-storage-privacy.v1 (tools/verify_private_storage_privacy.py)
Source doc: hq/pilots/private-storage-privacy-audit.md (kernel-pinned phrase, see section 3)

## 1. What the verifier proves and what it needs

Six fixed read-only requests (POST list-v2 x3, GET object x1, POST sign x1, HEAD x1),
hard budget MAX_REQUESTS=6, mutating HTTP methods rejected, redirects rejected,
responses size/shape-capped. Proofs, in order:
  1. anonymous_bucket_listing_denied      (anon key list  -> 401/403 required)
  2. tenant_a_positive_control            (A lists own prefix -> sentinel visible)
  3. cross_tenant_listing_denied          (A lists B prefix -> denied or empty)
  4. cross_tenant_object_denied           (A GETs B sentinel, Range 0-0 -> 401/403/404)
  5. tenant_b_short_lived_url_created     (B signs own sentinel, TTL 60s)
  6. tenant_b_signed_object_access        (HEAD signed URL -> 200/206, zero body bytes)
Output is digests, status classes, proof IDs, and redaction flags only; stdout JSON
carries an evidence_digest over the canonical encoding. Failure prints to stderr and
exits 1 (never persist stderr).

Environment (session-process only, per the pilots doc; none exist anywhere today by
design - the doc forbids saving them):
  Non-secret: SUPERMEGA_STORAGE_PRIVACY_ADAPTER=supabase_storage_rest_v2, _BASE_URL
  (https origin, port 443, no path), _ALLOWED_HOST (exact host), _OWNER_APPROVAL_ID,
  _BUCKET, _TENANT_A_PREFIX/_TENANT_B_PREFIX (distinct, trailing /, non-nested),
  _TENANT_A_OBJECT/_TENANT_B_OBJECT (inside their prefixes).
  Secret: _PUBLISHABLE_KEY (anon/publishable only; sb_secret_/service_role rejected),
  _TENANT_A_JWT/_TENANT_B_JWT (role=authenticated, distinct sub, exp > now+60s).

Exists today: the verifier + preflight + self-test (offline, green); Supabase MCP
management access (branch create/delete, apply_migration, execute_sql,
get_publishable_keys) to project zvtzwcimpvvtkowflhda.
Needs founder action: an approval ID (recorded decision), branch approval + cost
acknowledgement, approval of the branch-scoped setup writes (bucket, 2 users,
2 sentinels, storage RLS policies), and live-run confirmation of target + ID.

## 2. Where to run it: preview branch (recommended)

Recommended: a fresh 24h preview branch of zvtzwcimpvvtkowflhda (~$0.01344/h,
~$0.32/24h - the proven 2026-08-12 pg17 rehearsal pattern: create, prove, delete).
  - The ledger's founderDecision already proposes exactly this shape: environment
    preview_branch, requiredServices [database, auth, storage], max 24h, delete
    after evidence, proposed action run_hosted_isolation_storage_recovery_proof.
  - Production-with-disposable-bucket is rejected: the pilots doc says the handoff
    is NOT approval for a production bucket; creating bucket/users/policies there is
    production_database_change (kernel FORBIDDEN_ACTIONS) while package.json pins
    productionSupabaseTargetStatus=protected-unapproved; and production
    storageBucketCount=0 is part of the current clean audit surface.
  - Same Supabase storage/auth/RLS engine either way; the proof is of the isolation
    mechanism on hosted infrastructure, which the branch provides.
Branch hygiene first: the 20260812 rehearsal branch (usmpllbckvrucbjptiuq) passed its
delete-by 2026-08-13T09:26Z and supermega-dev (fdcarrsjovmgfxqdwzgl) was already
flagged - confirm both deleted before creating a new branch.

## 3. Evidence shape and kernel v4 lockstep

New evidence file (source receipt #8): hq/readiness/hosted-storage-privacy-proof.json
  { "contract": "supermega.hosted-storage-privacy-proof.v1",
    "recordedAt": "<iso>",
    "target": { "environment": "preview_branch", "branchProjectRef": "<ref>",
                "parentProjectRef": "zvtzwcimpvvtkowflhda", "createdAt": "<iso>",
                "deleteBy": "<iso>", "deletedAt": "<iso-or-null>" },
    "verifierCommit": "<git sha of tools/verify_private_storage_privacy.py>",
    "result": <exact verifier stdout JSON, digests only, verbatim> }
Plus a narrative note hq/research/hosted-storage-privacy-branch-YYYYMMDD.md in the
pg17-rehearsal format (what was proven, defects, gate relevance, delete-by).

Lockstep change (one commit; kernel is its own source receipt so ledger regen is
forced; contract stays v4 - gate IDs and output fields are unchanged, this follows
the existing computed-gate precedent of hosted_postgres17/security):
  a. hq/pilots/private-storage-privacy-audit.md line 3:
     'Status: local verifier ready; hosted proof blocked'
     -> 'Status: hosted proof recorded; evidence hq/readiness/hosted-storage-privacy-proof.json'
  b. kernel/managed-pilot-readiness.mjs:
     - line ~114: two-state phrase check. Blocked pin + no evidence input = gate
       blocked (today's behavior). Recorded pin + valid evidence = gate ready-hosted.
       Any other combination (phrase without evidence, evidence without phrase,
       invalid evidence) fails the build (managed_pilot_readiness_storage_evidence_invalid).
     - new input storagePrivacyEvidence, validated fail-closed: contract string,
       ok===true, the six proof IDs in exact order with passing results,
       provider_requests_performed===6, persistent_mutations_performed===0,
       object_body_bytes_returned===0, secrets_exposed===false,
       bucket_or_object_names_exposed===false, parseable captured_at/recordedAt,
       target.environment==='preview_branch', deletedAt set (evidence intake only
       after cleanup), serialized evidence free of key/token/bucket-name patterns.
     - line ~195: gate('hosted_storage_privacy', <computed>, computed evidence
       string, computed nextAction) via storageGateReady()/storageGateEvidence()
       helpers, mirroring hostedGateReady/hostedGateEvidence.
     - line ~327 validator: allow 'hosted_storage_privacy' in the ready-hosted
       whitelist; line ~332: pin its evidence string like the other computed gates.
     - line 42: REQUIRED_SOURCE_RECEIPT_COUNT 7 -> 8.
     - line 113 stays: hostedStoragePrivacyProofRequired remains true (the local
       rehearsal still declares the requirement; the evidence now satisfies it).
  c. tools/manage_managed_pilot_readiness.mjs sources: append
     'hq/readiness/hosted-storage-privacy-proof.json', and pass the parsed file as
     storagePrivacyEvidence (absent file allowed only while the blocked pin stands).
  d. kernel/managed-pilot-readiness.test.mjs: receipts a..h; keep the default
     fixture blocked (assertions on count 7 hold); add a flip test (valid evidence +
     recorded phrase -> ready-hosted, count 6) and reject tests (evidence without
     phrase, phrase without evidence, mutated proof list, nonzero mutations).
  e. tools/verify_hq_contract.mjs line 1096: sourceReceipts.length 7 -> 8; add a
     receipt-path check for the new file.
  f. hq/NOW.md line 68: 'Five hosted-readiness gates' -> 'Four ...' (and reword the
     storage clause in lines 66/70); NOW.md is digest-bound, so regen follows.
  g. Regen + verify: readiness:managed:write, readiness:managed:self-test, hq:verify.

## 4. Runbook (next session; FOUNDER marks owner-only steps)

Phase 0 - baseline (agent):
  npm.cmd run storage:privacy:self-test        # offline adversarial cases green
  npm.cmd run hq:verify                        # repo evidence green before touching anything
  # MCP list_branches on zvtzwcimpvvtkowflhda: confirm stale branches deleted (sec 2)
Phase 1 - FOUNDER decisions (record in the decision log):
  F1. Approval ID for this audit, e.g. OWNER-STORAGE-AUDIT-20260815-01.
  F2. Approve one preview branch: name storage-privacy-24h-YYYYMMDD, max 24h,
      delete-after-evidence, cost acknowledged (~$0.32; MCP confirm_cost).
  F3. Approve the branch setup writes: one private bucket, two disposable users,
      two harmless sentinels, storage.objects RLS policies (reviewed SQL).
Phase 2 - branch + setup (agent, under F2/F3, all against the BRANCH ref only):
  2.1 MCP create_branch (after confirm_cost); record ref, createdAt, deleteBy.
  2.2 MCP get_publishable_keys for the branch (anon/publishable key only).
  2.3 MCP apply_migration on branch: create private bucket 'privacy-audit';
      storage.objects policies: authenticated select/list scoped to
      (auth.uid())-owned prefix; authenticated insert scoped to own prefix
      (needed once for sentinel upload); no anon policy (default deny).
  2.4 Create users A/B: POST {branch}/auth/v1/signup (email+password, publishable
      key); if confirmation required, MCP execute_sql on branch to set
      email_confirmed_at (branch-only, founder-approved write).
  2.5 Login both: POST {branch}/auth/v1/token?grant_type=password -> access tokens
      captured straight into the audit process env, never echoed or written.
  2.6 Upload one sentinel per tenant via POST {branch}/storage/v1/object/... with
      that tenant's own JWT (fixed harmless text, e.g. 'sentinel'). Confirm each
      tenant sees only its own sentinel (this is the doc's owner prerequisite 5).
Phase 3 - configure one temporary PowerShell process (values from 2.2-2.5; secrets
  assigned directly to $env:..., non-secrets per section 1; nothing on disk):
  npm.cmd run storage:privacy:preflight
  # accept only: mode=offline_configuration_preflight, network_requests_performed=0,
  # persistent_mutations_performed=0, provider_credentials_verified=false,
  # secrets_exposed=false, bucket_or_object_names_exposed=false
Phase 4 - FOUNDER confirms target host + approval ID, then in the same process:
  node tools/run_python_tool.mjs tools/verify_private_storage_privacy.py --confirm-read-only-audit $env:SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID
  # capture stdout JSON only; on exit 1 see section 5 - do not retry blindly
Phase 5 - FOUNDER decision: delete branch (MCP delete_branch) before deleteBy;
  record deletedAt. Close the PowerShell process (discards all secrets).
Phase 6 - evidence intake (agent): write the two evidence files, apply the lockstep
  diff of section 3, then:
  npm.cmd run readiness:managed:self-test
  npm.cmd run readiness:managed:write
  npm.cmd run hq:verify
  Expected ledger: blockingGateCount 4; hosted_storage_privacy ready-hosted.

## 5. Risks and fail-closed behavior

- Any proof failure: verifier exits 1 with a bare error code; gate stays blocked;
  no evidence file is written; the pinned blocked phrase stands; branch is still
  deleted (Phase 5 runs regardless). Never persist stderr (local shell context).
- Anonymous-list ambiguity: if hosted storage answers anon list-v2 with 200-empty
  instead of 401/403, proof 1 fails closed by design. Remediation is bucket/policy
  configuration on the branch, never widening ANONYMOUS_DENIED_STATUSES.
- Secret leakage: verifier redacts (self-test asserts it); evidence carries digests
  only; secrets live in one throwaway process; kernel serialization guard already
  rejects postgresql:// / password= / service_role in the ledger.
- JWT expiry: default access tokens live ~1h and the verifier requires exp>now+60s;
  run Phase 4 promptly after 2.5 or re-login in-process.
- Provider API drift (list-v2 shape, signed URL shape, redirects): every case is a
  hard PrivacyAuditError; nothing degrades to a partial pass.
- Scope honesty: this proves the isolation mechanism on an isolated hosted branch.
  Production storage stays bucketless and protected-unapproved; production
  activation remains its own founder gate. Evidence wording must say
  'preview branch', never imply production storage was audited.
- Evidence laundering: intake requires deletedAt set, six exact proof IDs, zero
  mutation counters, and phrase+evidence consistency; verify_hq_contract re-derives
  blockingGateCount from gate statuses, so a hand-edited ledger fails hq:verify.
