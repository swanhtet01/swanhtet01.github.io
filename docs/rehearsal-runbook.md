# Supabase clean-preview rehearsal — maximum 24 hours

This runbook turns `supermega.managed-pilot-readiness.v5` into one bounded,
reviewable rehearsal. It never authorizes production DDL, production data,
managed activation, a deployment, a customer action, or an ongoing paid
resource.

The executable orchestrator is `tools/run_preview_branch_rehearsal.mjs`. It
applies the reviewed public legacy baseline followed by all eleven private
migrations through schema v10, then the public-browser quarantine. Every byte
is bound to `supermega.supabase-rehearsal-packet.v4` and the exact reviewed
`origin/main` commit.

## Authority boundary

- The owner separately approves failed-branch deletion, preview cost, creation
  of one empty branch, migration application, and final branch deletion.
- The operator may run the committed tool only after receiving an Ed25519 owner
  signature and a distinct Ed25519 risk-reviewer acceptance in the private
  `supermega.preview-rehearsal-approval.v2` receipt described below.
- The checked-in `supermega.preview-rehearsal-authority.v1` policy is
  intentionally `unconfigured`. Execution stays blocked until a separate
  owner-reviewed source change registers two distinct public keys and pins the
  exact complete policy digest in the verifier. Private keys never enter Git.
- The tool rejects the protected production ref, a dirty or non-`origin/main`
  checkout, a branch with the managed schema already present, production-data
  approval, stale approval, changed URL digests, and privileged runtime URLs.
- All connection values and the approval receipt stay under `.tmp/`; neither
  Git nor the evidence packet receives credentials.
- A failed check stops the rehearsal. Fix source locally and start again with a
  fresh reviewed branch; never retry against production.

## 1. Before the paid window

From a fresh checkout of current `origin/main`, confirm all of these locally:

```powershell
npm run database:migrations:verify
npm run database:public-browser-quarantine:verify
npm run database:validator:self-test
npm run storage:privacy:self-test
node tools/run_preview_branch_rehearsal.mjs --self-test
node tools/run_preview_branch_rehearsal.mjs --dry-run
```

The source checkout must already contain the reviewed R1–R4 sequence. GitHub
`main` must require a pull request, resolved conversations, and these exact
checks: `SuperMega App CI`, `Dependency Security Audit`, and
`Kernel Console - Verify & Owner-Gated Release`.

Capture metadata-only forensics for the failed
`security-rehearsal-24h-20260812` branch before asking to delete it. Do not read
row contents. Its deletion is a separate owner action and is not performed by
this tool.

## 2. Create one empty branch — owner console

Only after cost and creation approval:

1. Create one Supabase preview branch from the reviewed source without
   production data.
2. Record its 20-character project ref and creation time.
3. Set a hard operational deadline no more than 24 hours later.
4. Enable only Database, Auth, and Storage needed by this proof.
5. Confirm the branch is not the protected production ref in `package.json`.

With a fine-grained Management API token limited to `environment:read`, capture
the authenticated, secret-free creation receipt:

```powershell
node tools/run_preview_branch_rehearsal.mjs --capture-branch-receipt
```

The command performs one GET and zero provider writes. It accepts exactly one
ephemeral, no-data branch whose project state is healthy, and returns its
parent ref, preview ref, name, provider creation time, and canonical receipt
digest. The token is never printed or retained.

The read-only preflight requires PostgreSQL 17, hostname-verified TLS, the
`postgres` database, permission to create the reviewed runtime role and schema,
absence of both `app_private` and `supermega_trial_backend`, no user relation in
`public`, no unreviewed user schema, and zero Auth users/sessions and Storage
buckets/objects. It reads
only booleans and zero/nonzero existence, never row contents. A production
schema or data mirror fails closed.

## 3. Bind the reviewed release

On a clean `origin/main` checkout, prepare the secret-free packet:

```powershell
node tools/prepare_supabase_rehearsal_packet.mjs --target-project-ref <PREVIEW_REF> --output .tmp/rehearsal-packet.json
node tools/prepare_supabase_rehearsal_packet.mjs --verify .tmp/rehearsal-packet.json
```

The packet pins twelve migrations in filename order, the quarantine script,
and the rollback-only session-revocation probe:

1. `20260711081300_public_legacy_baseline.sql`
2. the eleven `private_trial_backend` migrations from role preflight through
   schema v10
3. the separately pinned `20260804_public_browser_quarantine.sql`

If any file or the reviewed commit changes, discard the packet and return to
review. Do not edit a historical migration.

## 4. Prepare bounded credentials and private approval

Set these only in the operator's process environment:

| Variable | Required boundary |
| --- | --- |
| `SUPERMEGA_REHEARSAL_PROJECT_REF` | exact approved preview ref |
| `SUPERMEGA_REHEARSAL_MANAGEMENT_API_TOKEN` | fine-grained `environment:read` only; used for a fresh authenticated branch receipt on every run |
| `SUPERMEGA_REHEARSAL_DATABASE_URL` | preview administrative migration URL, port 5432, `sslmode=verify-full` |
| `SUPERMEGA_SUPABASE_CA_FILE` | reviewed CA certificate path |
| `SUPERMEGA_REHEARSAL_RUNTIME_DATABASE_URL` | dedicated `supermega_trial_runtime` login; never `postgres`, `supabase_admin`, service/browser, or elevated role |
| `SUPERMEGA_REHEARSAL_STORAGE_AUDIT_DATABASE_URL` | distinct dedicated `supermega_storage_audit` login; never the runtime or a provider/elevated role |
| `SUPERMEGA_REHEARSAL_PACKET_FILE` | `.tmp/rehearsal-packet.json` |
| `SUPERMEGA_REHEARSAL_APPROVAL_FILE` | private receipt below |
| `SUPERMEGA_STORAGE_PRIVACY_*` | all twelve values required by `verify_private_storage_privacy.py --preflight` |

Create SHA-256 digests of the exact three URL strings without printing the URL
values. The owner signs the exact domain-separated canonical approval below;
the independent reviewer then signs the digest of that signed owner approval.
Put only public-key fingerprints, signatures, receipt and URL digests in a
private `.tmp/rehearsal-approval.json`:

```json
{
  "contract": "supermega.preview-rehearsal-approval.v2",
  "decision": "approved",
  "approvalId": "<OWNER_APPROVAL_UUID>",
  "approvedAt": "<UTC_ISO_TIMESTAMP>",
  "expiresAt": "<UTC_ISO_TIMESTAMP_NO_MORE_THAN_24_HOURS_LATER>",
  "releaseCommit": "<EXACT_40_CHARACTER_ORIGIN_MAIN_SHA>",
  "rehearsalPacketDigest": "<PACKET_DIGEST>",
  "targetProjectRef": "<PREVIEW_REF>",
  "connectionDigests": {
    "administrative": "sha256:<ADMIN_URL_SHA256>",
    "runtime": "sha256:<RUNTIME_URL_SHA256>",
    "storageAudit": "sha256:<STORAGE_AUDIT_URL_SHA256>"
  },
  "branch": {
    "parentProjectRef": "<PROTECTED_PRODUCTION_PARENT_REF>",
    "name": "<EXACT_PREVIEW_BRANCH_NAME>",
    "projectRef": "<PREVIEW_REF>",
    "createdAt": "<PROVIDER_CREATED_AT>",
    "deleteBy": "<ABSOLUTE_UTC_DEADLINE_NO_MORE_THAN_24_HOURS_AFTER_CREATED_AT>",
    "creationReceiptDigest": "sha256:<AUTHENTICATED_BRANCH_RECEIPT_DIGEST>",
    "startsWithProductionData": false,
    "maximumLifetimeHours": 24,
    "providerUsageChargesAcknowledged": true,
    "creationApproved": true,
    "migrationApplicationApproved": true,
    "deleteAfterEvidence": true
  },
  "authorizedActions": [
    "apply_complete_source_migration_chain_to_preview",
    "run_preview_validation_and_rollback_only_probes"
  ],
  "controls": {
    "productionTargetApproved": false,
    "productionDataApproved": false,
    "productionMutationApproved": false,
    "managedActivationApproved": false
  },
  "ownerKeyFingerprint": "sha256:<REGISTERED_OWNER_PUBLIC_KEY_FINGERPRINT>",
  "ownerSignature": {
    "algorithm": "Ed25519",
    "keyId": "<REGISTERED_OWNER_KEY_ID>",
    "value": "<BASE64_SIGNATURE>"
  },
  "independentReview": {
    "contract": "supermega.preview-rehearsal-independent-review.v1",
    "decision": "accepted",
    "approvalDigest": "sha256:<SIGNED_OWNER_APPROVAL_DIGEST>",
    "reviewedAt": "<UTC_ISO_TIMESTAMP>",
    "expiresAt": "<EXACT_SAME_EXPIRY_AS_OWNER_APPROVAL>",
    "reviewerKeyFingerprint": "sha256:<REGISTERED_REVIEWER_PUBLIC_KEY_FINGERPRINT>",
    "signature": {
      "algorithm": "Ed25519",
      "keyId": "<REGISTERED_REVIEWER_KEY_ID>",
      "value": "<BASE64_SIGNATURE>"
    }
  }
}
```

The owner signature uses domain `supermega.preview-rehearsal-approval.v2` and
stable JSON with `ownerSignature` and `independentReview` omitted. The reviewer
signature uses domain `supermega.preview-rehearsal-independent-review.v1` and
stable JSON with only its own signature omitted. The receipt is execution
authority for this one preview only. It is not branch deletion authority,
production authority, or managed-activation authority.

## 5. Execute the bounded orchestrator

Review the plan once more, then run:

```powershell
node tools/run_preview_branch_rehearsal.mjs --dry-run
node tools/run_preview_branch_rehearsal.mjs
```

Before the first branch mutation, the tool verifies:

- clean exact `origin/main` and the v4 packet;
- a digest-pinned owner key, distinct digest-pinned reviewer key, both exact
  signatures, and exact URL digests;
- a fresh authenticated Management API branch receipt, absolute deletion
  deadline, non-production ref, and clean-target preflight;
- dedicated runtime and Storage-audit identities proven non-privileged before the
  first migration: exact login, stable session role, TLS, no superuser,
  `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, replication, membership or `SET ROLE`
  path, persistent write privilege, object ownership, dangerous default ACL,
  security-definer execution, or role setting;
- local quarantine behavior, full migration digests, PostgreSQL 17 tooling,
  and Storage privacy configuration.

It rechecks the clean commit before every SQL action, hashes each exact reviewed
file, and passes those already-hashed bytes to `psql` through standard input;
`psql` never reopens a mutable source pathname. After DDL, it proves the
Storage-audit login still has no persistent write path, then runs the read-only
v10 hosted validator and the packet-bound session-revocation probe inside a
transaction that ends in `ROLLBACK`. Child processes receive a purpose-built
environment containing only operating-system basics and the credential needed
for that exact step; the Management API token is never inherited. Evidence is
sanitized and stored under `.tmp/preview-branch-rehearsal/<fingerprint>/`.

No hosted mutation can resume from local state. The tool rechecks the absolute
branch/approval deadline before and after every provider step, bounds every
subprocess, and exclusively creates one evidence directory. A prior or failed
attempt requires a new empty branch, a fresh authenticated branch receipt, and
a new exact approval; deleting or editing local evidence grants no authority.

## 6. Complete owner-gated hosted proof

The orchestrator does not claim these manual/provider proofs:

- production-compatible schema fingerprint comparison without row contents;
- public-table RLS and explicit `anon`/`authenticated` denial;
- private-schema policies, backend-only grants, tenant A/B isolation, and
  active-session revocation;
- the separately confirmed six-request private Storage proof;
- provider backup and a clean restore into another isolated target;
- Supabase Security Advisor and Performance Advisor reruns.

Record counts, booleans, object names, fingerprints, timestamps, and sanitized
digests only. Never record participant identity, connection strings, tokens, or
business rows. An advisor suggestion is evidence for review, not authority to
drop an index.

## 7. Failure handling

| Failure | Required response |
| --- | --- |
| `rehearsal_target_is_production` | Stop. Correct the ref/URL; no production retry. |
| `rehearsal_release_not_reviewed_main` | Fetch and use the exact reviewed `origin/main`. |
| `rehearsal_packet_invalid_or_stale` or a digest mismatch | Discard the packet; repair and review source locally. |
| `rehearsal_approval_*` | Obtain a fresh exact owner receipt; never weaken validation. |
| `rehearsal_signing_authority_unconfigured` or `rehearsal_authority_*` | Stop. Register and separately pin distinct owner/reviewer public keys through review; never supply an ad hoc key. |
| `rehearsal_authenticated_branch_*` | Stop. Refresh the environment-read receipt; never substitute local branch metadata. |
| `rehearsal_branch_or_approval_deadline_reached` | Stop all work and obtain separate deletion approval; an expired branch is never reusable. |
| `rehearsal_prior_attempt_requires_new_empty_branch` | Stop. Preserve the evidence, delete only with approval, and start later with a new empty branch and fresh approval. |
| `runtime_*privileged*` or `storage_audit_*privileged*` | Replace with dedicated least-privilege logins. |
| `rehearsal_clean_target_required` | Delete only with approval, then create a new empty branch. |
| `step_failed_apply_migration_*` or `step_failed_apply_quarantine` | Stop the branch; do not patch SQL interactively. |
| hosted validator, Storage, isolation, backup, restore, or advisor failure | Block activation and return to a local source fix. |

## 8. Review and delete

The security reviewer and risk reviewer independently inspect the evidence.
Acceptance requires every hosted proof, no credential leakage, no production
mutation, and no unresolved advisor error. Evidence from a failed check cannot
be relabeled as accepted.

After evidence capture, the owner separately approves and performs preview
branch deletion. Record the deletion receipt, revoke the temporary logins, and
remove local credential/approval files. Keep only the sanitized evidence and
review decision. Production remains `isolated_demo`; this rehearsal does not
enable managed persistence or `/api/health` managed readiness.
