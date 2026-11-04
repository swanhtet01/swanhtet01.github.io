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
  deployment has not been verified and Git deployment is disabled
  and the feed route is unmounted. For a controlled pilot, use separately
  scoped, founder-controlled encrypted environment secrets for the server
  signer only after a deployment/security review. This is software custody:
  the signing key exists in server memory during a request. Do not describe
  it as HSM custody. A later dedicated signing service can implement the same
  interface without changing the feed proof bytes.
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

Swan must later approve the exact private server/Vercel project, signer-secret
scope and rotation ceremony, named pilot devices, and a source-reviewed public
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
