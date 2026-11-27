"""Fixed P-256 device-profile vectors and fail-closed command admission."""

from __future__ import annotations

import base64
from dataclasses import replace
from hashlib import sha256
import unittest

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

from supermega_runtime.connected_site_device_profile_v2 import (
    DeviceProfileV2Error, P256_DEVICE_PROFILE,
    verify_p256_device_public_binding, verify_p256_device_signature,
)
from supermega_runtime.connected_site_v15 import (
    ConnectedSiteV15Adapter, ConnectedSiteV15Error, DeviceAuthority,
    canonical_json, digest,
)


POINT = bytes.fromhex(
    "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2"
    "964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5"
)
SIGNATURE = bytes.fromhex(
    "6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2"
    "9678403372a627ed4ce6fe19b7f7431ad21b93b03aff4d1efcc362ee16949b297f"
)
FINGERPRINT = "698bea63dc44a344663ff1429aea10842df27b6b991ef25866b2c6c02cdcc5be"
ORDER = int("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", 16)


def encoded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


class P256DeviceProfileTests(unittest.TestCase):
    def test_fixed_cross_language_vector_and_canonicality(self):
        message = b"supermega-p256-v2-known-answer"
        self.assertEqual(sha256(POINT).hexdigest(), FINGERPRINT)
        verify_p256_device_public_binding(encoded(POINT), FINGERPRINT)
        verify_p256_device_signature(
            public_key=encoded(POINT), fingerprint_sha256=FINGERPRINT,
            signature=encoded(SIGNATURE), message=message,
        )
        for signature in (
            b"\0" * 64,
            SIGNATURE[:32] + (ORDER - int.from_bytes(SIGNATURE[32:], "big")).to_bytes(32, "big"),
            SIGNATURE[:-1] + bytes([SIGNATURE[-1] ^ 1]),
        ):
            with self.subTest(signature=signature.hex()), self.assertRaises(DeviceProfileV2Error):
                verify_p256_device_signature(
                    public_key=encoded(POINT), fingerprint_sha256=FINGERPRINT,
                    signature=encoded(signature), message=message,
                )
        for key, fingerprint in ((encoded(POINT[:-1]), FINGERPRINT),
                                 (encoded(POINT), "0" * 64),
                                 (encoded(bytes([2]) + POINT[1:]), FINGERPRINT)):
            with self.subTest(key=key), self.assertRaises(DeviceProfileV2Error):
                verify_p256_device_public_binding(key, fingerprint)

    def test_v2_command_is_bound_to_enrolled_profile_and_rejects_downgrade(self):
        device = DeviceAuthority(
            device_id="windows-device", signing_key_id="windows-p256-key",
            public_key=encoded(POINT), client_fingerprint=FINGERPRINT,
            enrollment_evidence_digest="a" * 64,
            coordinator_binding_digest="b" * 64,
            session_generation=1, signing_profile=P256_DEVICE_PROFILE,
        )
        private = ec.derive_private_key(1, ec.SECP256R1())
        unsigned = {
            "protocolVersion": 2, "commandId": "command-v2", "workspaceId": "tenant-a",
            "siteId": "site-a", "actorId": "actor-a", "deviceId": "windows-device",
            "aggregateType": "retailCart", "aggregateId": "basket-a", "expectedVersion": 0,
            "commandType": "retail.stock.reserve.v1", "payloadDigest": digest({}),
            "leaseDigest": "c" * 64, "issuedAt": "2026-11-04T00:00:00.000Z",
            "signingKeyId": device.signing_key_id,
            "signatureAlgorithm": P256_DEVICE_PROFILE,
        }

        def signed(fields):
            message = canonical_json(fields).encode()
            der = private.sign(message, ec.ECDSA(hashes.SHA256()))
            r, s = utils.decode_dss_signature(der)
            s = min(s, ORDER - s)
            return {**fields, "payload": {}, "signature": encoded(
                r.to_bytes(32, "big") + s.to_bytes(32, "big")
            )}

        adapter = ConnectedSiteV15Adapter(authorities={}, repository=None)
        self.assertEqual(adapter._validate_command(signed(unsigned), device)["commandId"], "command-v2")
        invalid_signature = signed(unsigned)
        invalid_signature["signature"] = encoded(b"\0" * 64)
        with self.assertRaises(ConnectedSiteV15Error):
            adapter._validate_command(invalid_signature, device)
        for change in ({"protocolVersion": 1}, {"signatureAlgorithm": "ed25519"},
                       {"deviceId": "other"}, {"signingKeyId": "other"}):
            with self.subTest(change=change), self.assertRaises(ConnectedSiteV15Error):
                adapter._validate_command(signed({**unsigned, **change}), device)
        with self.assertRaises(ConnectedSiteV15Error):
            replace(device, signing_profile="unknown")
        with self.assertRaises(ConnectedSiteV15Error):
            replace(device, client_fingerprint="0" * 64)


if __name__ == "__main__":
    unittest.main()
