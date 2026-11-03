"""Synthetic signed-lease and device-proof tests; no feed is mounted."""

from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
import unittest

from supermega_runtime.connected_site_event_read import (
    READ_REQUEST_CONTRACT, authorize_event_read as _authorize_event_read,
)
from supermega_runtime.connected_site_runtime import ConnectedSitePrincipal
from supermega_runtime.connected_site_v15 import ConnectedSiteV15Error, digest
from tests.test_connected_site_v15 import DEVICE_A, ISSUER, NOW, _authority


def _fixture(*, role="manager", capabilities=("managementRead",), now=NOW):
    authority = _authority(
        "workspace-a", "site-a", "device-a", DEVICE_A,
        role=role, capabilities=capabilities,
    )
    device = authority.devices["device-a"]
    lease_unsigned = {
        "protocolVersion": 1, "leaseId": "lease-read-1",
        "workspaceId": authority.workspace_id, "siteId": authority.site_id,
        "actorId": "actor-1", "role": role, "capabilities": list(capabilities),
        "deviceId": device.device_id,
        "sessionGeneration": device.session_generation,
        "revocationGeneration": authority.revocation_generation,
        "issuedAt": (now - timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
        "expiresAt": (now + timedelta(days=1)).isoformat().replace("+00:00", "Z"),
        "issuerKeyId": "issuer-1",
    }
    lease = {**lease_unsigned, "payloadDigest": digest(lease_unsigned),
             "signature": ISSUER.sign(lease_unsigned)}
    request_unsigned = {
        "contract": READ_REQUEST_CONTRACT,
        "workspaceId": authority.workspace_id, "siteId": authority.site_id,
        "actorId": "actor-1", "deviceId": device.device_id,
        "clientFingerprint": device.client_fingerprint,
        "enrollmentEvidenceDigest": device.enrollment_evidence_digest,
        "authorityGeneration": authority.authority_generation,
        "authorityPayloadDigest": authority.authority_payload_digest,
        "revocationGeneration": authority.revocation_generation,
        "afterSequence": 0, "priorEventDigest": None, "limit": 32,
        "leaseDigest": lease["payloadDigest"],
        "issuedAt": now.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "signingKeyId": device.signing_key_id,
        "signatureAlgorithm": "ed25519",
    }
    return authority, lease, {**request_unsigned, "signature": DEVICE_A.sign(request_unsigned)}


def _resign(request, **changes):
    unsigned = {key: value for key, value in request.items() if key != "signature"}
    unsigned.update(changes)
    return {**unsigned, "signature": DEVICE_A.sign(unsigned)}


def authorize_event_read(*, authority, lease, request, now, principal=None):
    if principal is None:
        principal = ConnectedSitePrincipal(
            workspace_id=request["workspaceId"], site_id=request["siteId"],
            device_id=request["deviceId"], authenticated=True,
            identity_provider="synthetic-gateway",
        )
    return _authorize_event_read(
        principal=principal, authority=authority, lease=lease,
        request=request, now=now,
    )


class EventReadPolicyTests(unittest.TestCase):
    def test_current_manager_lease_and_device_signature_bind_exact_cursor(self) -> None:
        authority, lease, request = _fixture()
        grant = authorize_event_read(
            authority=authority, lease=lease, request=request, now=NOW,
        )
        self.assertEqual((grant.workspace_id, grant.site_id, grant.actor_id,
                          grant.device_id), ("workspace-a", "site-a", "actor-1", "device-a"))
        self.assertEqual((grant.after_sequence, grant.prior_event_digest, grant.limit),
                         (0, None, 32))
        continued = _resign(request, afterSequence=7, priorEventDigest="a" * 64)
        self.assertEqual(authorize_event_read(
            authority=authority, lease=lease, request=continued, now=NOW,
        ).after_sequence, 7)

    def test_all_substituted_request_fields_fail_even_when_resigned(self) -> None:
        authority, lease, request = _fixture()
        changes = (
            {"workspaceId": "workspace-b"}, {"siteId": "site-b"},
            {"actorId": "actor-b"}, {"deviceId": "device-b"},
            {"clientFingerprint": "a" * 64},
            {"enrollmentEvidenceDigest": "a" * 64},
            {"authorityGeneration": 99}, {"authorityPayloadDigest": "a" * 64},
            {"revocationGeneration": 99}, {"leaseDigest": "a" * 64},
            {"afterSequence": 1}, {"limit": 0}, {"limit": 65},
            {"signingKeyId": "other-key"}, {"signatureAlgorithm": "none"},
            {"issuedAt": (NOW - timedelta(seconds=31)).isoformat(timespec="milliseconds").replace("+00:00", "Z")},
            {"issuedAt": (NOW + timedelta(seconds=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")},
        )
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ConnectedSiteV15Error):
                authorize_event_read(
                    authority=authority, lease=lease,
                    request=_resign(request, **change), now=NOW,
                )
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(
                authority=authority, lease=lease,
                request={**request, "unexpected": True}, now=NOW,
            )
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(
                authority=authority, lease=lease,
                request={**request, "signature": "a" * 86}, now=NOW,
            )
        for field in ("authorityGeneration", "revocationGeneration"):
            with self.subTest(field=field), self.assertRaisesRegex(
                ConnectedSiteV15Error, "event_read_authority_changed",
            ):
                authorize_event_read(
                    authority=authority, lease=lease,
                    request={**request, field: float(request[field])}, now=NOW,
                )

    def test_issuer_lease_and_current_membership_are_required(self) -> None:
        authority, lease, request = _fixture()
        for bad_lease in (
            {**lease, "signature": "a" * 86},
            {**lease, "capabilities": ["counterSale"]},
            {**lease, "deviceId": "device-b"},
        ):
            with self.subTest(lease=bad_lease), self.assertRaises(ConnectedSiteV15Error):
                authorize_event_read(
                    authority=authority, lease=bad_lease, request=request, now=NOW,
                )
        cashier, cashier_lease, cashier_request = _fixture(
            role="cashierCounter", capabilities=("counterSale",),
        )
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(
                authority=cashier, lease=cashier_lease,
                request=cashier_request, now=NOW,
            )
        device = authority.devices["device-a"]
        revoked = replace(authority, devices={"device-a": replace(device, active=False)})
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(authority=revoked, lease=lease, request=request, now=NOW)
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(
                authority=replace(authority, enabled=False), lease=lease,
                request=request, now=NOW,
            )
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(
                authority=authority, lease=lease, request=request,
                now=NOW + timedelta(days=2),
            )
        wrong_principal = ConnectedSitePrincipal(
            workspace_id="workspace-a", site_id="site-a", device_id="device-b",
            authenticated=True, identity_provider="synthetic-gateway",
        )
        with self.assertRaises(ConnectedSiteV15Error):
            authorize_event_read(
                authority=authority, lease=lease, request=request, now=NOW,
                principal=wrong_principal,
            )


if __name__ == "__main__":
    unittest.main()
