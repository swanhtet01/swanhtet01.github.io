# Hosted storage privacy rehearsal - 2026-08-14 - FAILED CLOSED

Status: FAILED CLOSED (proof 1 unprovable on this hosted storage version; no
proof JSON written; gate hosted_storage_privacy stays blocked)
Branch: storage-privacy-proof-24h-20260814 (project_ref lzemsljybmzuyfqaeqey,
parent zvtzwcimpvvtkowflhda, created 2026-08-14T16:49Z, founder-approved 24h,
delete-after-evidence; deletion owned by coordinator after review)
Verifier: supermega.private-storage-privacy.v1 (unmodified; nothing widened)
Approval binding: owner approval ID = branch name storage-privacy-proof-24h-20260814
(digest sha256:2edf5bae15a6b6b0c20cb5a00e7aefbc65135409a190cfee9abf234525d7c2b6);
needs ratification in the founder decision log.

## What was set up (branch-scoped, founder-approved writes)

- Private bucket (digest sha256:e85af3711b7d4e0b0c94e976c31e6bd2005bc6eed03b23f8c22e3dab648df335).
- Two disposable confirmed users (tenant A dab98545-..., tenant B f7c7e0d1-...),
  created via branch SQL because branch auth has mailer_autoconfirm=false and
  GoTrue rejects reserved fixture domains. Fixture passwords are transcript-
  visible by accepted deviation (seed-file persistence was denied); users and
  passwords die with the branch.
- storage.objects RLS: authenticated select/insert scoped to auth.uid() prefix.
- One sentinel per tenant uploaded under that tenant's own JWT (positive
  controls verified: each tenant lists exactly its own sentinel).

## Verifier runs (both fail-closed at request 1 of 6)

Run 1 (RLS default-deny only): anonymous list-v2 returned HTTP 200 with an
empty, RLS-filtered listing. Verifier: error anonymous_listing_not_denied,
provider_requests_performed 1, persistent_mutations_performed 0,
secrets_exposed false, bucket_or_object_names_exposed false.

Remediation attempted (plan section 5 lane - config, never the verifier):
1. revoke anon privileges on storage.objects/buckets: silent no-op; grantor is
   supabase_storage_admin; postgres cannot set role to it (42501) and the
   membership is superuser-reserved.
2. Deny policy for anon raising insufficient_privilege (42501): storage-api
   1.69.0 maps it to its AccessDenied error object (body statusCode "403",
   code "AccessDenied") but renders outer HTTP 400 on the list-v2 path, with
   or without a matching buckets policy.

Run 2 (deny policy live): anonymous list-v2 returned HTTP 400. Verifier:
identical fail-closed report (anonymous_listing_not_denied, 1 request, zero
mutations, no exposure). Preflight was green before both runs.

## Root cause

Hosted Supabase authenticates the anon key at the gateway, so an anonymous
list-v2 of a private bucket is an authenticated anon-role query: RLS filtering
yields 200-empty and a policy-raised 42501 yields outer 400 on storage 1.69.0.
Proof 1's contract (401/403) cannot be expressed by this hosted version's
list-v2 path by any bucket/policy/grant configuration available to the
project role. Proofs 2-6 were never reached (six-request budget preserved;
run stops at the first failed proof by design).

## What this means for the gate

- hosted_storage_privacy stays blocked; the pilots doc pinned phrase stands;
  no ledger, kernel, or tool change was made.
- The blocker is a verifier-contract/platform mismatch, not an observed
  isolation failure (the anonymous listing disclosed zero objects in both
  shapes). Resolving it is a kernel/verifier-owner decision, e.g. defining
  proof 1's denial semantics for provider-authenticated anon requests
  (RLS-empty and/or AccessDenied-body-with-400) or requiring a storage
  version whose renderer returns 403. That decision must not be made by the
  executing agent and was not.
- Branch remains for founder inspection until deletion (delete by
  2026-08-15T16:49Z). Cleanup of bucket, users, sentinels, deny policy, and
  helper function public.privacy_audit_deny_anon() rides on branch deletion.

## Addendum 2026-08-15: proof-1 canary amendment drafted, run blocked

A tech-lead decision (relayed by the coordinator, dated 2026-08-14, for the
founder log) redefined proof 1 as intent-preserving canary semantics: pass
only when the anonymous list-v2 response discloses zero objects (explicit
rejection 400/401/403/404, or 200 with a zero-disclosure listing), AND the
same run separately proves a sentinel exists under a tenant JWT (proof 2 as
canary), AND no object, folder, or pagination hint appears in the anonymous
response. 429/5xx and any leak remain hard failures.

State: the amendment is applied to tools/verify_private_storage_privacy.py as
an UNCOMMITTED working-tree diff (new self-test cases included: 200-empty
canary pass, sentinel-name leak fails, pagination-hint leak fails, 429 fails).
It is UNVERIFIED: the permission system blocked executing the amended
verifier's own self-test in this session (both shells, hard denial), so no
live rerun was attempted and no proof JSON exists. Fail-closed holds: the
gate stays blocked; evidence may only be produced after the amendment is
reviewed/committed and the self-test and audit run under granted permission.

## Addendum 2026-08-15 (2): landed amendment run - proof 4 fail-closed

The proof-1 amendment was reviewed and landed as commit 1f572a446c2d
(OPS-750); working tree verified clean before running. Self-test green
(15 cases, 0 network). Live run 3 on the same branch:

- Proofs 1-3 PASSED for the first time hosted: anonymous listing denied
  (explicit 4xx rejection via the branch deny policy), tenant A positive
  control sentinel_visible (2xx), cross-tenant listing empty_filtered (2xx).
- Proof 4 FAILED CLOSED at request 4 of 6: error cross_tenant_object_visible,
  provider_requests_performed 4, persistent_mutations_performed 0,
  secrets_exposed false, bucket_or_object_names_exposed false.

Diagnosis (read-only probes, statuses/bodies only): tenant A's GET of tenant
B's sentinel returns outer HTTP 400 with body statusCode "404", code
"NoSuchKey", "Object not found" - the object is fully hidden and zero bytes
were disclosed; tenant B's own ranged read returns 206. There is NO
cross-tenant leak. This is the third instance of the storage 1.69.0 renderer
quirk (inner denial status wrapped in outer HTTP 400), now on the
object-GET path, where DENIED_STATUSES {401,403,404} does not cover it.

Escalation: proofs 3/4 denial semantics on this storage version need the
same class of tech-lead decision as proof 1. A bare "accept 400" would be
weaker than intent (400 can be a malformed request that never tested
access); a sound amendment likely requires reading the error body on 400
and requiring a NoSuchKey/not_found discriminator, or pinning a storage
version whose renderer preserves outer status. Not decided or implemented
by the executing agent. No evidence JSON written; gate stays blocked.
Proofs 5-6 not reached. Branch delete-by 2026-08-15T16:49Z stands.

## Addendum 2026-08-15 (3): final run authorized, blocked by permission

The tech-lead decision on object-path denial semantics (body-discriminated
outer-400, strengthen-never-loosen) was implemented and landed as commit
ea13161ad951 (OPS-751); working tree verified clean; self-test green
(20 cases, 0 network) including the four required adversarial shapes plus
the run-2 listing variant.

The authorized final six-request run could not be executed: the session's
permission system hard-denied the audit command (twice, after transient
denials all session on this same script shape). Fail-closed holds: no live
requests were made this round, no evidence JSON exists, the gate stays
blocked. Everything is staged for a permitted operator: instrument at
ea13161ad951, fixtures healthy on branch lzemsljybmzuyfqaeqey, runbook and
env bindings in hq/strategy/HOSTED-STORAGE-PRIVACY-PLAN.md section 4.
Expected live shapes: proof 1 denied (4xx), proof 3 denied or
empty_filtered, proof 4 denied via not_found discriminator, proofs 5-6
tenant B sign + 2xx ranged access. Branch delete-by 2026-08-15T16:49Z.
