"""Cross-language synthetic page bytes; not a production feed signer."""

from __future__ import annotations

import json
from pathlib import Path
import unittest
from dataclasses import replace
from base64 import urlsafe_b64decode
from unittest.mock import patch

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from supermega_runtime.connected_site_runtime import ConnectedSitePrincipal
from supermega_runtime.connected_site_event_feed import read_retail_reservation_page
from supermega_runtime.connected_site_v15 import (
    ConnectedSiteV15Error, DeviceAuthority, canonical_json, digest,
)
from tests.connected_site_signed_page_fixture import (
    build_signed_v41_fixture, read_and_sign_test_only_page,
)
from tests import connected_site_signed_page_fixture as signed_fixture
from tests.test_connected_site_event_feed import _Script
from tests.test_connected_site_event_read import _fixture, _resign
from tests.test_connected_site_v15 import DEVICE_B, ISSUER, NOW


_FIXTURE = (
    Path(__file__).resolve().parents[1]
    / "mobile/shop_pos/test/fixtures/v41_python_signed_page.json"
)


class SignedPageFixtureTest(unittest.TestCase):
    def test_sealer_runs_before_checked_transaction_releases(self):
        authority, lease, request = _fixture()
        principal = ConnectedSitePrincipal(
            authority.workspace_id, authority.site_id, request["deviceId"],
            True, "synthetic-gateway",
        )
        script = _Script(authority, lease, events=[])
        transaction_open = False
        original_connect = script.connect
        original_sign = signed_fixture._signature

        class ObservedConnection:
            def __init__(self, inner):
                self.inner = inner
                self.autocommit = inner.autocommit

            def __enter__(self):
                nonlocal transaction_open
                transaction_open = True
                return self.inner.__enter__()

            def __exit__(self, *args):
                nonlocal transaction_open
                transaction_open = False
                return self.inner.__exit__(*args)

        def observed_connect():
            return ObservedConnection(original_connect())

        def checked_sign(seed, fields):
            self.assertTrue(transaction_open)
            return original_sign(seed, fields)

        with patch.object(signed_fixture, "_signature", side_effect=checked_sign):
            read_and_sign_test_only_page(
                connection_factory=observed_connect, principal=principal,
                authority=authority, lease=lease, request=request, now=NOW,
                issuer_key_id="test_feed", issuer_seed=23,
            )
        self.assertFalse(transaction_open)
        self.assertEqual(script.clock_reads, 3)

        class DeferredSeal:
            def __await__(self):
                yield None

        with self.assertRaisesRegex(ConnectedSiteV15Error, "retail_seal_async"):
            read_retail_reservation_page(
                connection_factory=observed_connect, principal=principal,
                authority=authority, lease=lease, request=request, now=NOW,
                seal_checked_page=lambda *_: DeferredSeal(),
            )
        self.assertFalse(transaction_open)
        self.assertEqual(script.clock_reads, 5)
        with patch.object(signed_fixture, "_signature", side_effect=RuntimeError("signer_failed")):
            with self.assertRaisesRegex(RuntimeError, "signer_failed"):
                read_and_sign_test_only_page(
                    connection_factory=observed_connect, principal=principal,
                    authority=authority, lease=lease, request=request, now=NOW,
                    issuer_key_id="test_feed", issuer_seed=23,
                )
        self.assertFalse(transaction_open)

    def test_python_wire_type_bytes_match_retained_native_fixture(self):
        retained = _FIXTURE.read_text(encoding="utf-8").strip()
        generated = build_signed_v41_fixture()
        self.assertEqual(retained, canonical_json(generated))
        page = json.loads(generated["pageJson"])
        proof = json.loads(generated["proofJson"])
        request = json.loads(generated["requestJson"])
        self.assertEqual(page["pageDigest"], digest({
            key: value for key, value in page.items() if key != "pageDigest"
        }))
        self.assertEqual(page["requestDigest"], digest(request))
        self.assertEqual(proof["pageDigest"], page["pageDigest"])
        self.assertEqual(proof["requestDigest"], page["requestDigest"])

    def test_checked_sql_reader_page_is_signed_only_for_current_scope(self):
        authority, lease, request = _fixture()
        principal = ConnectedSitePrincipal(
            authority.workspace_id, authority.site_id, request["deviceId"],
            True, "synthetic-gateway",
        )
        script = _Script(authority, lease)
        # The checked reader validates the event JSON digest before it can be signed.
        event = {"synthetic": "event"}
        script.events = [(1, digest(event), None, canonical_json(event))]
        result = read_and_sign_test_only_page(
            connection_factory=script.connect, principal=principal,
            authority=authority, lease=lease, request=request, now=NOW,
            issuer_key_id="test_feed", issuer_seed=23,
        )
        page = json.loads(result["pageJson"])
        proof = json.loads(result["proofJson"])
        self.assertEqual(page["nextSequence"], 1)
        self.assertEqual(page["headers"][0]["eventDigest"], digest(event))
        self.assertEqual(proof["pageDigest"], page["pageDigest"])
        self.assertEqual(proof["requestDigest"], digest(request))
        self.assertEqual(proof["deviceId"], request["deviceId"])
        self.assertTrue(any("event_json::text" in sql for sql, _ in script.queries))
        self.assertEqual(script.clock_reads, 3)
        unsigned_proof = {key: value for key, value in proof.items() if key != "signature"}
        Ed25519PrivateKey.from_private_bytes(bytes([23]) * 32).public_key().verify(
            urlsafe_b64decode(proof["signature"] + "=="),
            canonical_json(unsigned_proof).encode("utf-8"),
        )
        for denied_principal, denied_script, denied_request in (
            (ConnectedSitePrincipal("other", authority.site_id, request["deviceId"],
                                    True, "synthetic-gateway"), _Script(authority, lease), request),
            (principal, _Script(authority, lease), _resign(request, afterSequence=1,
                                                         priorEventDigest="f" * 64)),
        ):
            with self.subTest(denied_request=denied_request), self.assertRaises(ConnectedSiteV15Error):
                read_and_sign_test_only_page(
                    connection_factory=denied_script.connect, principal=denied_principal,
                    authority=authority, lease=lease, request=denied_request, now=NOW,
                    issuer_key_id="test_feed", issuer_seed=23,
                )
        revoked = _Script(authority, lease)
        revoked.device = ("revoked", *revoked.device[1:])
        with self.assertRaises(ConnectedSiteV15Error):
            read_and_sign_test_only_page(
                connection_factory=revoked.connect, principal=principal,
                authority=authority, lease=lease, request=request, now=NOW,
                issuer_key_id="test_feed", issuer_seed=23,
            )

    def test_checked_page_is_bound_to_two_distinct_synthetic_device_keys(self):
        authority_a, lease_a, request_a = _fixture()
        device_b = DeviceAuthority(
            device_id="device-b", signing_key_id="key-device-b",
            public_key=DEVICE_B.public,
            client_fingerprint=digest({"device": "device-b"}),
            enrollment_evidence_digest=digest({"enrollment": "device-b"}),
            coordinator_binding_digest=digest({"coordinator": authority_a.site_id}),
            session_generation=2,
        )
        authority = replace(
            authority_a,
            devices={**authority_a.devices, device_b.device_id: device_b},
        )
        lease_b_unsigned = {
            key: value for key, value in lease_a.items()
            if key not in {"payloadDigest", "signature"}
        }
        lease_b_unsigned.update(leaseId="lease-read-b", deviceId="device-b")
        lease_b_payload = {
            **lease_b_unsigned, "payloadDigest": digest(lease_b_unsigned),
        }
        lease_b = {**lease_b_payload, "signature": ISSUER.sign(lease_b_unsigned)}
        request_b_unsigned = {
            key: value for key, value in request_a.items() if key != "signature"
        }
        request_b_unsigned.update(
            deviceId="device-b", signingKeyId=device_b.signing_key_id,
            clientFingerprint=device_b.client_fingerprint,
            enrollmentEvidenceDigest=device_b.enrollment_evidence_digest,
            leaseDigest=lease_b["payloadDigest"], requestNonce="b" * 64,
        )
        request_b = {
            **request_b_unsigned, "signature": DEVICE_B.sign(request_b_unsigned),
        }
        event = {"synthetic": "same-site-event"}
        rows = [(1, digest(event), None, canonical_json(event))]
        def checked(lease, request, device):
            script = _Script(authority, lease, events=rows)
            record = authority.devices[device]
            script.device = (
                "active", record.signing_key_id, record.public_key,
                record.client_fingerprint, record.enrollment_evidence_digest,
                record.session_generation,
            )
            script.lease = (
                "active", digest(lease), lease["actorId"], device, lease["role"],
                lease["sessionGeneration"], lease["revocationGeneration"],
                lease["issuerKeyId"], authority.issuer_keys[lease["issuerKeyId"]],
                script.lease[9],
            )
            return read_and_sign_test_only_page(
                connection_factory=script.connect,
                principal=ConnectedSitePrincipal(
                    authority.workspace_id, authority.site_id, device,
                    True, "synthetic-gateway",
                ),
                authority=authority, lease=lease, request=request, now=NOW,
                issuer_key_id="test_feed", issuer_seed=23,
            )
        page_a = checked(lease_a, request_a, "device-a")
        page_b = checked(lease_b, request_b, "device-b")
        proof_a = json.loads(page_a["proofJson"])
        proof_b = json.loads(page_b["proofJson"])
        self.assertEqual(proof_a["pageDigest"], json.loads(page_a["pageJson"])["pageDigest"])
        self.assertEqual(proof_b["pageDigest"], json.loads(page_b["pageJson"])["pageDigest"])
        self.assertNotEqual(proof_a["deviceId"], proof_b["deviceId"])
        self.assertNotEqual(proof_a["requestDigest"], proof_b["requestDigest"])
        self.assertEqual(proof_a["workspaceId"], proof_b["workspaceId"])
        self.assertEqual(proof_a["siteId"], proof_b["siteId"])
        with self.assertRaises(ConnectedSiteV15Error):
            checked(lease_a, request_b, "device-b")


if __name__ == "__main__":
    unittest.main()
