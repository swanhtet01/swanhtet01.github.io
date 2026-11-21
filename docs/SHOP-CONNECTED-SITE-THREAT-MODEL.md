# Shop connected-site threat model

Status: source design for a default-off pilot capability. This document does
not approve production keys, enrollment, cloud writes, installation, or a
merchant launch.

## Scope and assets

The scope is one enrolled tenant and one physical shop site with a designated
Android or Windows coordinator and paired LAN clients. Protected assets are:

- tenant, site, actor, role, device, session, and revocation bindings;
- coordinator and client private keys;
- signed offline leases and pairing nonces;
- command identity, event order, stock reservations, acknowledgements, audit,
  recovery checkpoints, and original financial records;
- encrypted backups and cloud reconciliation cursors.

Payment-provider settlement, automatic coordinator election, multi-site
operation, and offline correction authority are outside this pilot.

## Trust boundaries

1. The cloud issuer must authenticate membership and issue a site/device-bound
   offline lease. No issuer, production key, or hosted authority adapter is
   implemented by this source slice; the native app must not manufacture this
   authority.
2. A short-lived QR identifies the coordinator and pins its TLS certificate.
   The QR does not grant a role or capability.
3. Pairing records one Ed25519 client public key after consuming the exact QR
   nonce. Pairing is pending enrollment and grants no staff authority or site
   data access by itself. Every later request must prove possession of that key.
4. Before runtime enablement, the coordinator must wire the request proof to an
   approved device enrollment and a currently valid site/device lease. Reads
   require an explicit read capability or station policy, and commands require
   their exact capability, signature, version, replay state, and persisted
   device binding before reaching the atomic database seam.
5. A hosted cloud adapter must independently revalidate tenant, site, device,
   lease, signature, sequence, and idempotency. The current reconciliation core
   is an injected default-off seam, not a deployed server or RLS proof. Local
   acceptance is never cloud acknowledgement.

## Adversaries and failure modes

- An unpaired LAN peer can observe an address or fingerprint and attempt to
  forge, replay, reorder, or alter requests.
- A former staff member can retain an old lease or paired device after
  revocation.
- A paired but under-privileged staff member can attempt role or capability
  escalation, cross-site access, or tender/correction commands.
- A crash or lost response can occur before commit, after commit, during
  acknowledgement, backup, or reconciliation.
- Two devices can submit the same command or reserve the final stock unit.
- A malicious or corrupted snapshot can omit, duplicate, reorder, or rewrite
  events and financial projections.
- A local user with full operating-system control can extract process memory or
  replace application/runtime bytes. That risk is reduced by platform key
  storage and signed distribution but is not solved by the LAN protocol.

## Required controls

- Connected-site capability is false in production, synthetic QA, and fallback
  profiles until an exact release candidate passes all gates.
- The source-level TLS adapter constructs its context from the same certificate
  bytes whose leaf DER digest is
  carried in the QR; wildcard, public, link-local, and unintended loopback
  binds are rejected.
- Pairing is limited to an exact Ed25519 key, tenant/site/coordinator scope,
  one-time nonce, and at most five minutes.
- Requests bind method, canonical target, body digest, tenant, site,
  coordinator, device, key fingerprint, timestamp, and a one-time nonce.
- Commands additionally bind aggregate type/id/version, payload digest, lease
  digest, signing key, and Ed25519 signature.
- Offline leases last no more than seven days and bind the current session and
  revocation generations. Expiry never falls back to an unmanaged role.
- Command, event, aggregate update, reservation, audit, and acknowledgement are
  one SQLite transaction. Reusing an ID with different bytes fails closed.
- Event sequences are gap-free within a tenant and site. Conflicts are
  quarantined; no last-write-wins path is permitted.
- Onboarding and test evidence loaded from disk is untrusted until independently
  rebound to the exact device and artifact.
- Health responses disclose liveness only. Logs and audit exclude raw payment
  and customer payloads.

## Residual risks and enabling gates

- Complete isolation can delay cloud revocation for up to seven days. This is
  an explicit pilot risk disclosed to the owner and operators.
- A powered-off coordinator stops shared writes. No automatic failover exists.
- Platform Keystore/DPAPI adapters, real issuer keys, approved device
  enrollment, the concrete lease-to-command/read adapter, hosted RLS/server
  authority, authenticated cloud transport, installed recovery, and physical
  LAN/hardware behavior are **required and not yet implemented or established**
  by these source tests.
- Connected stock reservation records are only a persistence foundation. The
  ordinary sale commit paths do not yet consume them, and release, commit, and
  expiry transitions are not yet implemented. Cross-device oversell prevention
  is therefore **not yet implemented** and must not be claimed from this slice.
- Production enabling requires independent review of the final source and
  artifacts, two-tenant hosted denial tests, signed Android and Windows builds,
  installed restart/restore, physical hardware evidence, and merchant
  acceptance.

Repository: `/workspace/pr734-postgres17-integration`

Version reviewed at model creation: `11b52a597022f75f61fd61eee88b34d2dcfc1321`
