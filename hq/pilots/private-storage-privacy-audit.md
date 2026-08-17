# Private Storage privacy audit handoff

Status: hosted proof complete; six-request audit passed on a deleted isolated branch
Proof: hq/readiness/hosted-storage-privacy-proof.json (2026-08-14, approval storage-privacy-proof-24h-20260814; branch created, proven, deleted within its 24h window)
Authority: founder / CEO
Verifier: `supermega.private-storage-privacy.v1`
Adapter: `supabase_storage_rest_v2`

## Purpose

Use one owner-approved isolated Storage target to prove that a known private object is visible to its tenant but cannot be enumerated or read anonymously or by another tenant. The verifier never uploads, changes, or deletes an object. Its live sequence is fixed at six requests and returns only digests, status classes, proof IDs, counts, and redaction flags.

This handoff is not approval to run against `supermegabase`, a production bucket, or a bucket containing customer data.

## Owner prerequisites

1. Name one disposable isolated project and record an approval ID for this exact audit.
2. Create one private disposable bucket through the approved project setup path.
3. Create two disposable named users, tenant A and tenant B. Do not use an anonymous user, service-role key, secret key, personal token, or administrator session as either tenant.
4. Through each user's normal authenticated product path, create one harmless sentinel object under a separate prefix. Creating users, the bucket, or sentinels is provider write activity and remains owner-controlled; the verifier does none of it.
5. Confirm tenant A can see its sentinel and tenant B can see its sentinel through the normal product path before auditing isolation.

Stop if the target is not isolated, the sentinels contain real data, the two sessions resolve to the same user, or any credential is long-lived or privileged.

## One-session configuration

Set these values only in a temporary PowerShell process. Do not save them in Git, HQ, Google Drive, Vercel, a `.env` file, screenshots, shell history, or chat.

Non-secret target bindings:

- `SUPERMEGA_STORAGE_PRIVACY_ADAPTER` must be `supabase_storage_rest_v2`.
- `SUPERMEGA_STORAGE_PRIVACY_BASE_URL` is the isolated project HTTPS origin only.
- `SUPERMEGA_STORAGE_PRIVACY_ALLOWED_HOST` is the exact host from that origin.
- `SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID` is the recorded decision ID.
- `SUPERMEGA_STORAGE_PRIVACY_BUCKET` is the disposable private bucket.
- `SUPERMEGA_STORAGE_PRIVACY_TENANT_A_PREFIX` and `SUPERMEGA_STORAGE_PRIVACY_TENANT_B_PREFIX` are distinct and end in `/`.
- `SUPERMEGA_STORAGE_PRIVACY_TENANT_A_OBJECT` and `SUPERMEGA_STORAGE_PRIVACY_TENANT_B_OBJECT` are the exact sentinel paths inside those prefixes.

Secret session values:

- `SUPERMEGA_STORAGE_PRIVACY_PUBLISHABLE_KEY` is a publishable key or legacy anon key, never a secret or service-role key.
- `SUPERMEGA_STORAGE_PRIVACY_TENANT_A_JWT` and `SUPERMEGA_STORAGE_PRIVACY_TENANT_B_JWT` are distinct, unexpired authenticated-user access tokens.

Enter secret values with a hidden prompt and assign them directly to the current process environment. Do not put literal values in the command line. Close the PowerShell process after the audit to discard them.

## Zero-network preflight

From the canonical repository, run:

```powershell
npm.cmd run storage:privacy:preflight
```

The only acceptable result has:

- `mode` equal to `offline_configuration_preflight`;
- `network_requests_performed` and `persistent_mutations_performed` equal to `0`;
- `provider_credentials_verified` equal to `false`;
- `secrets_exposed` and `bucket_or_object_names_exposed` equal to `false`.

This proves local shape, role, expiry, boundary, host, and redaction checks only. It does not prove that the provider accepts a credential or enforces a policy.

## Owner-confirmed live proof

Only after the founder confirms the exact isolated target and approval ID, run from the same temporary process:

```powershell
python tools/verify_private_storage_privacy.py --confirm-read-only-audit $env:SUPERMEGA_STORAGE_PRIVACY_OWNER_APPROVAL_ID
```

Success requires all six proofs: anonymous bucket listing explicitly denied; tenant A sentinel visible; tenant A cannot list tenant B; tenant A cannot read tenant B's sentinel; tenant B can create a 60-second signed URL; and that signed URL can access only the expected tenant B sentinel. No object body, path, token, key, or signed URL may appear in output.

Any failure blocks managed activation. Preserve only the redacted JSON result and exact verifier commit. Never copy stderr containing local shell context.

## Cleanup and acceptance

After evidence review, the owner decides whether to delete the two sentinels, disposable users, and isolated bucket through the provider's approved interface. Cleanup is destructive provider activity and is not performed by Codex or this verifier.

Accept the proof only when the result is bound to the intended host, bucket digest, approval digest, verifier commit, and current time; all six proof IDs pass; request count is six; persistent mutations and object-body bytes are zero; and secret/name exposure flags are false.
