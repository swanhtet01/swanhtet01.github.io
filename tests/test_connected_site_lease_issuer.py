from __future__ import annotations

import base64
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import Barrier, Lock, local
from concurrent.futures import ThreadPoolExecutor
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from supermega_runtime.connected_site_lease_issuer import (
    AuthenticatedOwnerSession,
    LeaseIssueRequest,
    LeaseIssuanceError,
    MemoryLeaseIssuanceStore,
    OfflineStaffLeaseIssuer,
)
from supermega_runtime.connected_site_v15 import (
    ConnectedSiteV15Adapter,
    CurrentMember,
    DeviceAuthority,
    MemoryConnectedSiteRepository,
    SiteAuthority,
    canonical_json,
    digest,
)


ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)
OWNER_CAPABILITIES = tuple(sorted((
    "counterSale", "stockChange", "productDetailsWrite", "cashShiftManage",
    "cafeOrderWrite", "cafeKitchenStatus", "cafeCashComplete", "managementRead",
)))
STAFF_CAPABILITIES = ("cashShiftManage", "counterSale")


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


class _Signer:
    def __init__(self, seed: int, key_id: str) -> None:
        self.key_id = key_id
        self.private = Ed25519PrivateKey.from_private_bytes(bytes([seed]) * 32)
        self.public_key = _encode(self.private.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        ))

    def sign(self, message: bytes) -> str:
        return _encode(self.private.sign(message))


class _AlternatingSigner(_Signer):
    def __init__(self) -> None:
        super().__init__(24, "issuer-key-1")
        self._calls = 0

    def sign(self, message: bytes) -> str:
        self._calls += 1
        signed = bytearray(self.private.sign(message))
        if self._calls % 2 == 0:
            signed[0] ^= 1
        return _encode(bytes(signed))


class _InvalidSigner(_Signer):
    def sign(self, message: bytes) -> str:
        return _encode(bytes(64))


class _ConcurrentSigner(_Signer):
    def __init__(self) -> None:
        super().__init__(25, "issuer-key-1")
        self._barrier = Barrier(2)
        self._local = local()

    def sign(self, message: bytes) -> str:
        calls = getattr(self._local, "calls", 0)
        self._local.calls = calls + 1
        if calls == 0:
            self._barrier.wait(timeout=5)
        return super().sign(message)


AUTHORITY = _Signer(21, "authority-key-1")
ISSUER = _Signer(22, "issuer-key-1")
DEVICE = _Signer(23, "device-key-1")


def _authority(
    *,
    workspace_id: str = "workspace-1",
    site_id: str = "site-1",
    staff_actor_id: str = "staff-1",
    device_id: str = "device-1",
    revocation_generation: int = 12,
    owner_role: str = "owner",
    staff_role: str = "cashierCounter",
    staff_capabilities: tuple[str, ...] = STAFF_CAPABILITIES,
    staff_generation: int = 7,
    device_generation: int | None = None,
    lease_issuer_key_id: str = ISSUER.key_id,
    issuer_public_key: str = ISSUER.public_key,
) -> SiteAuthority:
    members = {
        "owner-1": CurrentMember("owner-1", owner_role, OWNER_CAPABILITIES, 4),
        staff_actor_id: CurrentMember(
            staff_actor_id, staff_role, staff_capabilities, staff_generation
        ),
    }
    device = DeviceAuthority(
        device_id=device_id,
        signing_key_id="device-key-1",
        public_key=DEVICE.public_key,
        client_fingerprint=digest({"device": device_id}),
        enrollment_evidence_digest=digest({"enrollment": device_id}),
        coordinator_binding_digest=digest({"coordinator": site_id}),
        session_generation=staff_generation if device_generation is None else device_generation,
    )
    unsigned = {
        "schemaId": "ConnectedSiteAuthorityPayloadV1",
        "protocolVersion": 1,
        "authorityEventId": f"authority-{workspace_id}-{site_id}",
        "authoritySequence": 5,
        "previousAuthorityDigest": digest({"previous": site_id}),
        "workspaceId": workspace_id,
        "siteId": site_id,
        "issuedAtMillis": 1793530800000,
        "issuerKeyId": AUTHORITY.key_id,
        "membershipSnapshot": {
            "revocationGeneration": revocation_generation,
            "members": [
                {
                    "actorId": member.actor_id,
                    "role": member.role,
                    "capabilities": list(member.capabilities),
                    "sessionGeneration": member.session_generation,
                }
                for member in sorted(members.values(), key=lambda value: value.actor_id)
            ],
        },
        "configurationSnapshot": {
            "configurationVersion": 9,
            "businessProfile": {"schemaId": "profile-v1", "templateId": "retail", "templateVersion": 1},
            "catalogReference": {"catalogVersion": 2, "catalogDigest": digest({"catalog": site_id})},
        },
    }
    payload = {**unsigned, "payloadDigest": digest(unsigned)}
    return SiteAuthority(
        workspace_id=workspace_id,
        site_id=site_id,
        authority_generation=5,
        configuration_generation=9,
        revocation_generation=revocation_generation,
        authority_payload_digest=digest(payload),
        issuer_keys={lease_issuer_key_id: issuer_public_key},
        devices={device.device_id: device},
        members=members,
        authority_payload=payload,
        authority_signature=AUTHORITY.sign(canonical_json(payload).encode()),
        authority_issuer_keys={AUTHORITY.key_id: AUTHORITY.public_key},
        enabled=True,
    )


def _principal() -> AuthenticatedOwnerSession:
    return AuthenticatedOwnerSession("workspace-1", "site-1", "owner-1", 4)


def _request(**changes: object) -> LeaseIssueRequest:
    values = {
        "command_id": "issue-command-1",
        "workspace_id": "workspace-1",
        "site_id": "site-1",
        "actor_id": "staff-1",
        "role": "cashierCounter",
        "capabilities": STAFF_CAPABILITIES,
        "device_id": "device-1",
        "valid_for_seconds": 604800,
    }
    values.update(changes)
    return LeaseIssueRequest(**values)


def _issuer(store: MemoryLeaseIssuanceStore | None = None, *, enabled: bool = True) -> OfflineStaffLeaseIssuer:
    return OfflineStaffLeaseIssuer(
        signer=ISSUER,
        store=store or MemoryLeaseIssuanceStore(),
        enabled=enabled,
        now=lambda: NOW,
    )


class OfflineStaffLeaseIssuerTests(unittest.TestCase):
    def test_issues_canonical_seven_day_lease_and_redacted_audit(self) -> None:
        result = _issuer().issue(principal=_principal(), authority=_authority(), request=_request())
        lease = dict(result.lease)
        unsigned = {key: value for key, value in lease.items() if key not in {"payloadDigest", "signature"}}
        self.assertEqual(lease["payloadDigest"], digest(unsigned))
        Ed25519PublicKey.from_public_bytes(base64.urlsafe_b64decode(ISSUER.public_key + "=")).verify(
            base64.urlsafe_b64decode(lease["signature"] + "=="), canonical_json(unsigned).encode()
        )
        self.assertEqual(lease["expiresAt"], "2026-11-08T12:00:00.000Z")
        self.assertFalse(result.replayed)
        encoded_audit = canonical_json(result.audit)
        for forbidden in ("payment", "customer", "rowContents", "password", "signature"):
            self.assertNotIn(forbidden, encoded_audit)

    def test_default_off_and_named_owner_only(self) -> None:
        with self.assertRaisesRegex(LeaseIssuanceError, "lease_disabled"):
            _issuer(enabled=False).issue(principal=_principal(), authority=_authority(), request=_request())
        with self.assertRaisesRegex(LeaseIssuanceError, "owner_authentication_invalid"):
            AuthenticatedOwnerSession(
                "workspace-1", "site-1", "owner-1", 4,
                authentication_method="shared-owner-key-v1",
            )
        with self.assertRaisesRegex(LeaseIssuanceError, "owner_required"):
            _issuer().issue(
                principal=_principal(), authority=_authority(owner_role="manager"), request=_request()
            )

    def test_signer_must_be_the_current_authorized_deterministic_key(self) -> None:
        other = _Signer(24, "issuer-key-1")
        with self.assertRaisesRegex(LeaseIssuanceError, "issuer_key_not_authorized"):
            OfflineStaffLeaseIssuer(
                signer=other,
                store=MemoryLeaseIssuanceStore(),
                enabled=True,
                now=lambda: NOW,
            ).issue(principal=_principal(), authority=_authority(), request=_request())

        alternating = _AlternatingSigner()
        with self.assertRaisesRegex(LeaseIssuanceError, "signature_nondeterministic"):
            OfflineStaffLeaseIssuer(
                signer=alternating,
                store=MemoryLeaseIssuanceStore(),
                enabled=True,
                now=lambda: NOW,
            ).issue(
                principal=_principal(),
                authority=_authority(issuer_public_key=alternating.public_key),
                request=_request(),
            )

        invalid = _InvalidSigner(26, "issuer-key-1")
        with self.assertRaisesRegex(LeaseIssuanceError, "signature_invalid"):
            OfflineStaffLeaseIssuer(
                signer=invalid,
                store=MemoryLeaseIssuanceStore(),
                enabled=True,
                now=lambda: NOW,
            ).issue(
                principal=_principal(),
                authority=_authority(issuer_public_key=invalid.public_key),
                request=_request(),
            )

    def test_concurrent_altered_command_cannot_overwrite_first_receipt(self) -> None:
        signer = _ConcurrentSigner()
        store = MemoryLeaseIssuanceStore()
        issuer = OfflineStaffLeaseIssuer(
            signer=signer,
            store=store,
            enabled=True,
            now=lambda: NOW,
        )
        authority = _authority(issuer_public_key=signer.public_key)
        lock = Lock()
        outcomes: list[object] = []

        def issue(valid_for_seconds: int) -> None:
            try:
                outcome: object = issuer.issue(
                    principal=_principal(),
                    authority=authority,
                    request=_request(valid_for_seconds=valid_for_seconds),
                )
            except LeaseIssuanceError as error:
                outcome = error
            with lock:
                outcomes.append(outcome)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(issue, seconds) for seconds in (3600, 7200)]
            for future in futures:
                future.result(timeout=10)

        self.assertEqual(sum(not isinstance(item, Exception) for item in outcomes), 1)
        self.assertEqual(
            [str(item) for item in outcomes if isinstance(item, Exception)],
            ["connected_site_lease_command_reused"],
        )

    def test_rejects_scope_role_capability_device_and_validity_mismatch(self) -> None:
        cases = [
            (_principal(), _authority(), _request(site_id="site-2"), "scope_mismatch"),
            (_principal(), _authority(), _request(role="manager", capabilities=("counterSale",)), "current_authority_mismatch"),
            (_principal(), _authority(), _request(capabilities=("counterSale",)), "current_authority_mismatch"),
            (_principal(), _authority(staff_generation=8, device_generation=7), _request(), "current_authority_mismatch"),
        ]
        for principal, authority, request, code in cases:
            with self.subTest(code=code), self.assertRaisesRegex(LeaseIssuanceError, code):
                _issuer().issue(principal=principal, authority=authority, request=request)
        with self.assertRaisesRegex(LeaseIssuanceError, "validity_invalid"):
            _request(valid_for_seconds=604801)

    def test_idempotent_replay_rejects_altered_bytes_and_new_authority(self) -> None:
        store = MemoryLeaseIssuanceStore()
        issuer = _issuer(store)
        first = issuer.issue(principal=_principal(), authority=_authority(), request=_request())
        replay = issuer.issue(principal=_principal(), authority=_authority(), request=_request())
        self.assertTrue(replay.replayed)
        self.assertEqual(first.lease, replay.lease)
        first.lease["actorId"] = "mutated-by-caller"
        detached_replay = issuer.issue(
            principal=_principal(), authority=_authority(), request=_request()
        )
        self.assertEqual(detached_replay.lease["actorId"], "staff-1")
        with self.assertRaisesRegex(LeaseIssuanceError, "command_reused"):
            issuer.issue(
                principal=_principal(), authority=_authority(),
                request=_request(valid_for_seconds=3600),
            )
        with self.assertRaisesRegex(LeaseIssuanceError, "replay_authority_changed"):
            issuer.issue(
                principal=_principal(), authority=_authority(revocation_generation=13), request=_request()
            )

    def test_cross_language_golden_vector_verifies_in_python(self) -> None:
        fixture = json.loads((
            ROOT / "mobile/shop_pos/test/fixtures/offline_staff_lease_v1_golden.json"
        ).read_text(encoding="utf-8"))
        self.assertEqual(digest(fixture["unsignedPayload"]), fixture["payloadDigest"])
        key = base64.urlsafe_b64decode(fixture["issuerPublicKeyBase64Url"] + "=")
        Ed25519PublicKey.from_public_bytes(key).verify(
            base64.urlsafe_b64decode(fixture["signature"] + "=="),
            canonical_json(fixture["unsignedPayload"]).encode(),
        )
        authority = _authority(
            workspace_id="workspace-golden",
            site_id="site-golden",
            staff_actor_id="actor-golden",
            device_id="device-golden",
            staff_role="cashierCounter",
            staff_capabilities=STAFF_CAPABILITIES,
            staff_generation=7,
            lease_issuer_key_id="issuer-golden-1",
            issuer_public_key=fixture["issuerPublicKeyBase64Url"],
        )
        # _validate_lease is the exact verifier used by upload validation. The
        # golden test deliberately exercises it to prevent Dart/Python drift.
        adapter = ConnectedSiteV15Adapter(
            authorities={(authority.workspace_id, authority.site_id): authority},
            repository=MemoryConnectedSiteRepository(),
            runtime_enabled=True,
        )
        lease = adapter._validate_lease(
            fixture["lease"], authority, next(iter(authority.devices.values())), NOW
        )
        self.assertEqual(lease["leaseId"], "lease-golden-v1")


if __name__ == "__main__":
    unittest.main()
