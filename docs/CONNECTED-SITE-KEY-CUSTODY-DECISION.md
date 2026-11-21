# Connected-site key custody design (default-off)

This is an engineering design, not permission to provision keys, mount an
endpoint, enroll a merchant or enable connected operation. `CURRENT.md` is the
only delivery-status ledger.

## Pilot architecture

- Keep cloud authority, staff-lease, enrollment, trusted-time and feed-proof
  issuers on Ed25519, with distinct key IDs and purpose checks. The private
  FastAPI server owns signing through a protected signer interface; the
  transaction-checked event-feed route verifies its finished proof against
  independently configured public pins before returning it. No private key or
  Supabase bearer token is sent over shop LAN or included in a native build.
- The configured Vercel Python API target is the shortest repository-defined
  server target (`vercel.json` includes `api/app.py`), but a selected live
  deployment has not been verified, Git deployment is disabled, and the feed
  route is unmounted. The recommended default-off signer adapter is Google
  Cloud KMS `EC_SIGN_ED25519` over the existing exact canonical message bytes,
  with request-scoped Vercel OIDC workload federation to a narrowly scoped
  signing identity. Google documents this Ed25519 algorithm as **SOFTWARE**
  protection, not HSM; key bytes are not exportable to the API worker. This
  replaces the earlier proposal to place an encrypted Ed25519 seed in Vercel
  environment variables, which would expose plaintext in worker memory.
  Actual project, region, federation, key versions, IAM and public pins remain
  unselected and unprovisioned. Do not describe this as HSM custody or
  silently weaken any stronger custody requirement.
- A KMS adapter must map each purpose and environment to an immutable full
  CryptoKeyVersion plus independently pinned raw Ed25519 public key. It must
  send exact protocol bytes as `data` (never a prehash), supply and verify
  CRC32C, check returned version/protection/signature length, and locally
  verify the returned signature against the pin. Reject requests over the
  provider's 65,536-byte raw-input limit before network access; the current
  4,542-byte checkpoint fixture fits, but checkpoint growth needs a bound.
  Keep root/admin signing unavailable to online workers, and retain old
  public versions only for historical verification. No mutable `latest` key
  alias or response-supplied trust root may authorize a signature.
- AWS KMS HSM Ed25519 is not a drop-in alternative for the current protocol:
  its 4,096-byte raw-sign limit is smaller than that existing 4,542-byte
  authority-checkpoint fixture. Do not hash, use Ed25519ph, or silently split
  issuers to work around the limit; such a change needs a versioned review.
- Android retains its existing Ed25519 Android Keystore signing identity.
  Support is conditional on a named API-33+ installed device successfully
  creating, reopening, signing and denying private export across app/OS
  restart. The source adapter and synthetic CI are not that proof.
- Windows should use a versioned `p256-sha256-v2` device-signing profile with
  a named current-user CNG signing key in Microsoft Platform Crypto Provider
  on a qualified TPM-equipped pilot PC. The private key must be non-exportable;
  create/reopen/sign/public-export/private-export-denial must be tested on the
  actual Windows machine. Do not silently fall back to Software KSP or a
  DPAPI-decrypted Ed25519 seed. Existing Windows DPAPI remains limited to TLS
  material at rest. Until the v2 profile is implemented and installed proof
  passes, the Windows security channel remains unavailable.

## Versioned device-signing migration

Retain Ed25519 v1 for existing Android identities. Add P-256 only as an
explicit, signed v2 device profile across pairing, owner enrollment, cloud
device-key approval, command/request proofs, retained device records and
server admission. Bind algorithm, key ID, canonical public key and fingerprint
to the signed enrollment; reject unknown profiles and downgrades. Specify one
SHA-256 operation over exact canonical bytes, uncompressed SEC1 P-256 public
encoding, and a canonical fixed-width `r || s` signature with low-S rejection
or normalization agreed across CNG, Dart and Python. Never reinterpret an old
32-byte Ed25519 key as a P-256 key. Migration and encrypted restore must fail
closed on missing or contradictory profile evidence.

## Approval and acceptance boundary

Swan must later approve the exact Vercel project and Google Cloud project,
region, OIDC trust boundary, purpose-limited IAM/key versions and rotation
ceremony, named pilot devices, and a source-reviewed public
issuer registry before any provisioning. Each purpose has a current and
next-key overlap period; revoked or expired keys cannot authorize new actions,
while authentic historical records remain readable. Provisioning, route mount,
release signing and merchant enrollment are separate actions requiring their
own exact-source and owner approval.

Before pilot entry, prove cross-language v1/v2 known answers, mixed Android and
Windows LAN operation, tenant/device/role isolation, lost-response replay,
revocation and expiry during a write, fresh-target encrypted restore, key
replacement/deletion denial, and installed Windows/Android restart recovery.
If the named Windows PC cannot provide the required CNG/TPM capability, the
mandatory Windows coordinator gate is NO-GO; do not weaken custody or relabel
DPAPI-at-rest as a non-exportable signing handle.
