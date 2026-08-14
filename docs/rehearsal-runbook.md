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
  `supermega.preview-rehearsal-approval.v4` receipt described below.
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
$env:SUPERMEGA_NODE_BIN = (Get-Command node).Source
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools\run_preview_branch_rehearsal.ps1 --dry-run
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
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools\run_preview_branch_rehearsal.ps1 --capture-branch-receipt
```

The command performs one GET and zero provider writes. It accepts exactly one
ephemeral, no-data branch whose project state is healthy, and returns its
parent ref, preview ref, name, provider creation time, and canonical receipt
digest. The token is never printed or retained.

The read-only preflight requires PostgreSQL 17, hostname-verified TLS, the
`postgres` database, permission to create the reviewed runtime role and schema,
absence of both `app_private` and `supermega_trial_backend`, no user relation in
`public`, no public routine or event trigger, no unreviewed user schema, and
no subscription, foreign server, user mapping, or large object, plus zero Auth
users/sessions and Storage buckets/objects. The catalog probe forces
`search_path=pg_catalog` before inspection so an untrusted schema cannot shadow
catalog functions. It also returns a
metadata-only inventory of provider schemas, extensions, relations, columns,
constraints, indexes, routine-definition/configuration digests, ordinary and
event triggers, policies, rewrite rules, ACLs, roles and memberships,
parameter ACLs, publication schemas, inheritance, aggregate/cast/operator/type
and sequence internals, publications/subscriptions, foreign-data surfaces,
large objects, and database
configuration. Subscriptions, foreign servers, user mappings, and large objects
must all be absent. The owner and independent reviewer inspect that private
inventory and sign its canonical digest. It never reads business-row contents
or emits foreign-server or user-mapping option values; only their SHA-256
digests enter the inventory, and subscription connection strings are never
selected. A production schema, executable or
privilege-object addition, catalog-fingerprint change, or data mirror fails
closed.

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
| `SUPERMEGA_NODE_BIN` | absolute canonical path to the reviewed Node executable; the scrubbed PowerShell launcher is the only hosted entrypoint |
| `SUPERMEGA_GIT_BIN` | absolute canonical path to the reviewed Git executable |
| `SUPERMEGA_PYTHON_BIN` | absolute canonical path to the reviewed Python executable from the exact `uv.lock` environment |
| `SUPERMEGA_POSTGRES17_BIN` | absolute directory containing the reviewed PostgreSQL 17 `psql` executable |
| `SUPERMEGA_REHEARSAL_PACKET_FILE` | `.tmp/rehearsal-packet.json` |
| `SUPERMEGA_REHEARSAL_APPROVAL_FILE` | private receipt below |
| `SUPERMEGA_STORAGE_PRIVACY_*` | all twelve values required by `verify_private_storage_privacy.py --preflight` |

The separately owner-approved role-provisioning step must leave both dedicated
logins without direct, inherited, `SET ROLE`, ownership, default-ACL, or
function- or parameter-based persistent write authority. In particular,
explicitly deny `SET`/`ALTER SYSTEM` parameter ACLs (especially
`session_replication_role`) and the
PostgreSQL large-object creation/import functions to these logins; an empty
large-object catalog is not proof that they cannot create one.

Run the exact reviewed database validator once in read-only rehearsal-preflight
mode, retain its private metadata inventory, and independently review its
`metadata_fingerprint_digest`. Create SHA-256 digests of the exact three URL
strings without printing the URL values. Also digest the CA bytes, the absolute
Node/Git/Python/psql executable files, the complete Python virtual environment,
its base runtime, the complete PostgreSQL native `bin` dependency closure, the
complete `@electric-sql/pglite` package closure, the deterministic inner-byte
atomic migration bundle, and the exact reviewed source/lock files listed in
`trust.sources`. Every runtime
closure is a sorted, symlink/reparse-free manifest of every directory and file
path, byte count, and SHA-256 digest. The runner derives the Python roots from
the approved virtual-environment executable and `pyvenv.cfg`, derives the
PostgreSQL closure from the approved `psql` directory, then copies the approved
Node executable and all child runtime closures into a new exclusive,
non-reparse, read-only sealed directory before credentials are passed to a
child. Python runs with
`-I -S -B`; the sealed launcher adds only the site-packages directory inside
the signed virtual-environment closure, so `.pth` files and external import
paths cannot widen execution. The owner signs the
exact domain-separated canonical approval below; the independent reviewer then
signs the digest of that signed owner approval.

After setting only the CA and toolchain path variables, generate the exact
secret-free trust object locally. This command reads no database URL,
credential value, provider, or remote:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools\run_preview_branch_rehearsal.ps1 --capture-trust-inputs
```

Copy its exact `trust` object into the approval. Any later file addition,
removal, or byte change in a bound runtime closure invalidates the approval.

Put only public-key fingerprints, signatures, receipt and URL digests in a
private `.tmp/rehearsal-approval.json`:

```json
{
  "contract": "supermega.preview-rehearsal-approval.v4",
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
  "trust": {
    "certificateAuthorityDigest": "sha256:<CA_FILE_SHA256>",
    "atomicBundleDigest": "sha256:<DETERMINISTIC_12_MIGRATION_PLUS_QUARANTINE_INNER_BYTES_DIGEST>",
    "executables": {
      "node": { "path": "<ABSOLUTE_NODE_PATH>", "digest": "sha256:<NODE_SHA256>" },
      "git": { "path": "<ABSOLUTE_GIT_PATH>", "digest": "sha256:<GIT_SHA256>" },
      "python": { "path": "<ABSOLUTE_PYTHON_PATH>", "digest": "sha256:<PYTHON_SHA256>" },
      "pythonBase": { "path": "<ABSOLUTE_BASE_PYTHON_PATH>", "digest": "sha256:<BASE_PYTHON_SHA256>" },
      "psql": { "path": "<ABSOLUTE_PSQL17_PATH>", "digest": "sha256:<PSQL_SHA256>" }
    },
    "runtimeClosures": {
      "pythonEnvironment": {
        "path": "<ABSOLUTE_VIRTUAL_ENVIRONMENT_ROOT>",
        "digest": "sha256:<SORTED_DIRECTORY_CLOSURE_SHA256>",
        "fileCount": 1,
        "directoryCount": 1,
        "totalBytes": 1
      },
      "pythonBaseRuntime": {
        "path": "<ABSOLUTE_PYVENV_HOME>",
        "digest": "sha256:<SORTED_DIRECTORY_CLOSURE_SHA256>",
        "fileCount": 1,
        "directoryCount": 1,
        "totalBytes": 1
      },
      "postgresNative": {
        "path": "<ABSOLUTE_POSTGRES17_BIN>",
        "digest": "sha256:<SORTED_DIRECTORY_CLOSURE_SHA256>",
        "fileCount": 1,
        "directoryCount": 1,
        "totalBytes": 1
      },
      "nodePglite": {
        "path": "<ABSOLUTE_PGLITE_PACKAGE_ROOT>",
        "digest": "sha256:<SORTED_DIRECTORY_CLOSURE_SHA256>",
        "fileCount": 1,
        "directoryCount": 1,
        "totalBytes": 1
      }
    },
    "sources": {
      "launcher": "sha256:<POWERSHELL_LAUNCHER_SHA256>",
      "runner": "sha256:<RUNNER_SHA256>",
      "packetBuilder": "sha256:<PACKET_BUILDER_SHA256>",
      "databaseValidator": "sha256:<DATABASE_VALIDATOR_SHA256>",
      "storagePrivacyVerifier": "sha256:<STORAGE_VERIFIER_SHA256>",
      "publicQuarantineVerifier": "sha256:<QUARANTINE_VERIFIER_SHA256>",
      "packageManifest": "sha256:<PACKAGE_JSON_SHA256>",
      "packageLock": "sha256:<PACKAGE_LOCK_SHA256>",
      "pythonProject": "sha256:<PYPROJECT_SHA256>",
      "pythonLock": "sha256:<UV_LOCK_SHA256>"
    }
  },
  "branch": {
    "parentProjectRef": "<PROTECTED_PRODUCTION_PARENT_REF>",
    "name": "<EXACT_PREVIEW_BRANCH_NAME>",
    "projectRef": "<PREVIEW_REF>",
    "createdAt": "<PROVIDER_CREATED_AT>",
    "deleteBy": "<ABSOLUTE_UTC_DEADLINE_NO_MORE_THAN_24_HOURS_AFTER_CREATED_AT>",
    "creationReceiptDigest": "sha256:<AUTHENTICATED_BRANCH_RECEIPT_DIGEST>",
    "cleanTargetMetadataDigest": "sha256:<REVIEWED_METADATA_INVENTORY_DIGEST>",
    "cleanTargetMetadataInventory": {
      "schemas": [], "extensions": [], "relations": [], "columns": [],
      "constraints": [], "indexes": [], "routines": [], "triggers": [],
      "policies": [], "rewrite_rules": [], "types": [], "event_triggers": [],
      "default_acls": [], "roles": [], "role_memberships": [], "role_settings": [],
      "parameter_acls": [], "publications": [], "publication_relations": [],
      "publication_namespaces": [], "inheritance": [], "aggregates": [],
      "casts": [], "operators": [], "sequences": [], "subscriptions": [],
      "subscription_relations": [], "foreign_data_wrappers": [],
      "foreign_servers": [], "user_mappings": [], "large_objects": [],
      "database_configuration": []
    },
    "startsWithProductionData": false,
    "maximumLifetimeHours": 24,
    "providerUsageChargesAcknowledged": true,
    "creationApproved": true,
    "migrationApplicationApproved": true,
    "deleteAfterEvidence": true
  },
  "authorizedActions": [
    "apply_complete_source_migration_chain_to_preview",
    "apply_packet_bound_public_browser_quarantine_to_preview",
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

The owner signature uses domain `supermega.preview-rehearsal-approval.v4` and
stable JSON with `ownerSignature` and `independentReview` omitted. The reviewer
signature uses domain `supermega.preview-rehearsal-independent-review.v1` and
stable JSON with only its own signature omitted. The receipt is execution
authority for this one preview only. It is not branch deletion authority,
production authority, or managed-activation authority.

## 5. Execute the bounded orchestrator

Review the plan once more, then run:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools\run_preview_branch_rehearsal.ps1 --dry-run
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File tools\run_preview_branch_rehearsal.ps1
```

Before the first branch mutation, the tool verifies:

- clean exact `origin/main` and the v4 packet;
- a digest-pinned owner key, distinct digest-pinned reviewer key, both exact
  signatures, exact URL digests, CA bytes, canonical executable identities,
  and reviewed source plus dependency-lock digests;
- a fresh authenticated Management API branch receipt, absolute deletion
  deadline, non-production ref, and clean-target preflight;
- dedicated runtime and Storage-audit identities proven non-privileged before the
  first migration: exact login, stable session role, TLS, no superuser,
  `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, replication, membership or `SET ROLE`
  path, persistent write privilege (including PostgreSQL 17 `MAINTAIN`), large
  object creation, object ownership, dangerous default ACL, security-definer
  execution, role setting, explicit parameter ACL, `session_replication_role`
  `SET`, or parameter `ALTER SYSTEM` authority;
- local quarantine behavior, full migration digests, PostgreSQL 17 tooling,
  and Storage privacy configuration.

The pre-Node PowerShell launcher rejects unreviewed Node/runner/launcher bytes,
removes preload, alternate-trust, and proxy variables, then starts the exact
approved Node executable with no `process.execArgv`. The runner reads every
authoritative source from the exact reviewed Git blob and stages the signed CA,
validators, Node executable, PGlite package, Python environment/base, and
PostgreSQL native closure inside a new non-reparse evidence directory. One
sealed Python/psycopg session opens a serializable transaction, compares the
complete live catalog inventory with the exact owner-signed inventory, applies
the deterministic inner bytes of all twelve transaction-wrapped migrations and
the quarantine script, and commits once. A catalog mismatch or any unit failure
rolls the whole transaction back. After DDL, it proves both the runtime and
Storage-audit logins still have no persistent write or parameter path, then runs the read-only
v10 hosted validator and the packet-bound session-revocation probe inside a
transaction that ends in `ROLLBACK`. Child processes receive a purpose-built
environment containing only operating-system basics and the credential needed
for that exact step; the Management API token is never inherited. Every exact
decoded password, token, JWT, key, and URL is rejected if it appears in child
output before evidence is written. Private packet/approval files and the
evidence root must be direct children of a plain, non-reparse `.tmp`; evidence
is exclusively created under
`.tmp/preview-branch-rehearsal/<fingerprint>/`.

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
