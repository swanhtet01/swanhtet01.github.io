from __future__ import annotations

import base64
from dataclasses import dataclass
import os
import re
from typing import Mapping

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)


SHOP_CORRECTION_AUTHORIZATION_CONTRACT = (
    "supermega.shop.correction-authorization-receipt.v2"
)
SHOP_CORRECTION_SIGNATURE_CONTRACT = (
    "supermega.shop.correction-authorization-signature.v1"
)
SHOP_CORRECTION_SIGNING_KEY_ENV = (
    "SUPERMEGA_SHOP_CORRECTION_RECEIPT_ED25519_PRIVATE_KEY"
)
SHOP_CORRECTION_SIGNING_KEY_ID_ENV = (
    "SUPERMEGA_SHOP_CORRECTION_RECEIPT_KEY_ID"
)

# Credential owners add only reviewed public pins here, in a source change that
# ships before the matching private key is enabled. The production private key
# remains in the server secret store and is never written to the repository.
SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS: Mapping[str, str] = {}

_KEY_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,31}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_SIGNATURE = re.compile(r"^[A-Za-z0-9_-]{86}$")


class ShopCorrectionSigningError(ValueError):
    pass


def _decode_unpadded_base64url(value: str, *, expected_length: int) -> bytes:
    if not isinstance(value, str) or "=" in value:
        raise ShopCorrectionSigningError("shop_correction_signing_material_invalid")
    try:
        decoded = base64.b64decode(
            value + "=" * (-len(value) % 4),
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, TypeError) as exc:
        raise ShopCorrectionSigningError(
            "shop_correction_signing_material_invalid"
        ) from exc
    if (
        len(decoded) != expected_length
        or base64.urlsafe_b64encode(decoded).decode("ascii").rstrip("=") != value
    ):
        raise ShopCorrectionSigningError("shop_correction_signing_material_invalid")
    return decoded


def shop_correction_signature_message(*, key_id: str, receipt_digest: str) -> bytes:
    if not _KEY_ID.fullmatch(str(key_id or "")) or not _DIGEST.fullmatch(
        str(receipt_digest or "")
    ):
        raise ShopCorrectionSigningError("shop_correction_signature_input_invalid")
    return (
        f"{SHOP_CORRECTION_SIGNATURE_CONTRACT}\n{key_id}\n{receipt_digest}"
    ).encode("utf-8")


@dataclass(frozen=True, slots=True)
class ShopCorrectionReceiptSigner:
    key_id: str
    _private_key: Ed25519PrivateKey

    @classmethod
    def from_private_seed(
        cls,
        *,
        key_id: str,
        private_seed_base64url: str,
    ) -> "ShopCorrectionReceiptSigner":
        if not _KEY_ID.fullmatch(str(key_id or "")):
            raise ShopCorrectionSigningError("shop_correction_signing_key_id_invalid")
        seed = _decode_unpadded_base64url(
            private_seed_base64url,
            expected_length=32,
        )
        return cls(
            key_id=key_id,
            _private_key=Ed25519PrivateKey.from_private_bytes(seed),
        )

    @property
    def public_key_base64url(self) -> str:
        raw = self._private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    def sign(self, *, receipt_digest: str) -> str:
        signature = self._private_key.sign(
            shop_correction_signature_message(
                key_id=self.key_id,
                receipt_digest=receipt_digest,
            )
        )
        return base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")

    def verify(self, *, receipt_digest: str, signature: str) -> bool:
        if not _SIGNATURE.fullmatch(str(signature or "")):
            return False
        try:
            signature_bytes = _decode_unpadded_base64url(
                signature,
                expected_length=64,
            )
            self._private_key.public_key().verify(
                signature_bytes,
                shop_correction_signature_message(
                    key_id=self.key_id,
                    receipt_digest=receipt_digest,
                ),
            )
            return True
        except (InvalidSignature, ShopCorrectionSigningError):
            return False


def load_shop_correction_receipt_signer() -> ShopCorrectionReceiptSigner | None:
    key_id = os.environ.get(SHOP_CORRECTION_SIGNING_KEY_ID_ENV, "").strip()
    seed = os.environ.get(SHOP_CORRECTION_SIGNING_KEY_ENV, "").strip()
    if not key_id and not seed:
        return None
    if not key_id or not seed:
        raise ShopCorrectionSigningError("shop_correction_signing_configuration_invalid")
    signer = ShopCorrectionReceiptSigner.from_private_seed(
        key_id=key_id,
        private_seed_base64url=seed,
    )
    pinned = SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS.get(signer.key_id)
    if pinned is None or pinned != signer.public_key_base64url:
        raise ShopCorrectionSigningError("shop_correction_signing_public_pin_mismatch")
    return signer


def verify_shop_correction_signature(
    *,
    key_id: str,
    receipt_digest: str,
    signature: str,
    public_keys: Mapping[str, str] = SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS,
) -> bool:
    encoded_key = public_keys.get(str(key_id or ""))
    if encoded_key is None or not _SIGNATURE.fullmatch(str(signature or "")):
        return False
    try:
        public_key = Ed25519PublicKey.from_public_bytes(
            _decode_unpadded_base64url(encoded_key, expected_length=32)
        )
        public_key.verify(
            _decode_unpadded_base64url(signature, expected_length=64),
            shop_correction_signature_message(
                key_id=key_id,
                receipt_digest=receipt_digest,
            ),
        )
        return True
    except (InvalidSignature, ShopCorrectionSigningError, ValueError):
        return False
