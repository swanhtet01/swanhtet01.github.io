"""Strict P-256 device-signature profile; no key generation or runtime enablement.

The signed enrollment/authority provider must independently bind this profile,
the SEC1 public key and its SHA-256 fingerprint to a device before admission.
Cloud issuers and existing Ed25519 device profiles are unchanged.
"""

from __future__ import annotations

import base64
from hashlib import sha256
import re

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils


P256_DEVICE_PROFILE = "p256-sha256-v2"
_ORDER = int("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", 16)
_BASE64URL = re.compile(r"^[A-Za-z0-9_-]+$")


class DeviceProfileV2Error(ValueError):
    pass


def _decode(value: str, length: int) -> bytes:
    if not isinstance(value, str) or not _BASE64URL.fullmatch(value):
        raise DeviceProfileV2Error("device_profile_v2_encoding")
    try:
        raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    except ValueError:
        raise DeviceProfileV2Error("device_profile_v2_encoding") from None
    if len(raw) != length or base64.urlsafe_b64encode(raw).decode().rstrip("=") != value:
        raise DeviceProfileV2Error("device_profile_v2_encoding")
    return raw


def verify_p256_device_signature(
    *, public_key: str, fingerprint_sha256: str, signature: str, message: bytes,
) -> None:
    """Verify SEC1 uncompressed point and low-S, fixed 64-byte P1363 signature.

    `message` is canonical request/command bytes. ECDSA hashes it exactly once
    with SHA-256; Windows NCryptSignHash must receive that one digest, not the
    unhashed message or a digest hashed twice.
    """
    point = _decode(public_key, 65)
    sig = _decode(signature, 64)
    verify_p256_device_public_binding(public_key, fingerprint_sha256)
    if not isinstance(message, bytes):
        raise DeviceProfileV2Error("device_profile_v2_message")
    r, s = int.from_bytes(sig[:32], "big"), int.from_bytes(sig[32:], "big")
    if not (1 <= r < _ORDER and 1 <= s <= _ORDER // 2):
        raise DeviceProfileV2Error("device_profile_v2_signature_canonicality")
    try:
        key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
        key.verify(utils.encode_dss_signature(r, s), message, ec.ECDSA(hashes.SHA256()))
    except (InvalidSignature, ValueError):
        raise DeviceProfileV2Error("device_profile_v2_signature_invalid") from None


def verify_p256_device_public_binding(public_key: str, fingerprint_sha256: str) -> None:
    point = _decode(public_key, 65)
    if (point[0] != 4 or not isinstance(fingerprint_sha256, str)
            or sha256(point).hexdigest() != fingerprint_sha256):
        raise DeviceProfileV2Error("device_profile_v2_key_binding")
    try:
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
    except ValueError:
        raise DeviceProfileV2Error("device_profile_v2_key_invalid") from None
