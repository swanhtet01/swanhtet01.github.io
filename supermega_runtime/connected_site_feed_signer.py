"""Purpose-limited, default-off signer composition for checked event pages.

The private signing key remains with the injected protected signer. This
module owns neither credentials nor a route; the route re-verifies the signed
receipt against an independently pinned public key before returning it.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Protocol

from .connected_site_event_feed import RetailReservationPage
from .connected_site_v15 import ConnectedSiteV15Error, canonical_json, digest


_KEY_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
_SIGNATURE = re.compile(r"^[A-Za-z0-9_-]{86}$")


class ProtectedFeedSigner(Protocol):
    @property
    def key_id(self) -> str: ...

    def sign(self, payload: bytes) -> str: ...


class ConnectedSiteFeedSealer:
    """Seal only a transaction-checked page; never grant read permission."""

    def __init__(
        self, *, signer: ProtectedFeedSigner,
        trusted_now: Callable[[], datetime], enabled: bool = False,
    ) -> None:
        self._signer = signer
        self._trusted_now = trusted_now
        self._enabled = enabled

    def __call__(
        self, page: RetailReservationPage,
        request: Mapping[str, Any], lease: Mapping[str, Any],
    ) -> dict[str, str]:
        return self.seal_at(page, request, lease, checked_at=self._trusted_now())

    def seal_at(
        self, page: RetailReservationPage,
        request: Mapping[str, Any], lease: Mapping[str, Any],
        *, checked_at: datetime,
    ) -> dict[str, str]:
        if not self._enabled:
            raise ConnectedSiteV15Error("connected_site_feed_signer_disabled")
        key_id = self._signer.key_id
        now = checked_at
        if (not isinstance(key_id, str) or not _KEY_ID.fullmatch(key_id)
                or not isinstance(now, datetime) or now.tzinfo is None):
            raise ConnectedSiteV15Error("connected_site_feed_signer_unavailable")
        wire = page.to_wire()
        if (wire["requestDigest"] != digest(request)
                or wire["leaseDigest"] != lease.get("payloadDigest")
                or page.request_nonce != request.get("requestNonce")
                or lease.get("role") not in {"owner", "manager"}):
            raise ConnectedSiteV15Error("connected_site_feed_signer_binding")
        issued = int(now.astimezone(timezone.utc).timestamp() * 1000)
        expiry_text = lease.get("expiresAt")
        if not isinstance(expiry_text, str) or not expiry_text.endswith("Z"):
            raise ConnectedSiteV15Error("connected_site_feed_signer_lease_expiry")
        try:
            lease_expiry = datetime.fromisoformat(expiry_text.replace("Z", "+00:00"))
        except ValueError:
            raise ConnectedSiteV15Error("connected_site_feed_signer_lease_expiry") from None
        expires = min(issued + 30000, int(lease_expiry.timestamp() * 1000))
        if issued <= 0 or expires <= issued:
            raise ConnectedSiteV15Error("connected_site_feed_signer_clock")
        proof = {
            "contract": "supermega.connected-cloud-feed-proof.v1",
            "protocolVersion": 1,
            "issuerKeyId": key_id,
            "issuedAtMillis": issued,
            "expiresAtMillis": expires,
            "workspaceId": wire["workspaceId"],
            "siteId": wire["siteId"],
            "actorId": wire["actorId"],
            "actorRole": lease["role"],
            "deviceId": wire["deviceId"],
            "authorityGeneration": wire["authorityGeneration"],
            "revocationGeneration": wire["revocationGeneration"],
            "authorityPayloadDigest": wire["authorityPayloadDigest"],
            "leaseDigest": wire["leaseDigest"],
            "requestDigest": wire["requestDigest"],
            "requestNonce": request["requestNonce"],
            "afterSequence": wire["afterSequence"],
            "priorEventDigest": wire["priorEventDigest"],
            "nextSequence": wire["nextSequence"],
            "nextEventDigest": wire["nextEventDigest"],
            "pageDigest": wire["pageDigest"],
        }
        signature = self._signer.sign(canonical_json(proof).encode("utf-8"))
        if not isinstance(signature, str) or not _SIGNATURE.fullmatch(signature):
            raise ConnectedSiteV15Error("connected_site_feed_signer_signature")
        return {
            "requestJson": canonical_json(request),
            "pageJson": canonical_json(wire),
            "proofJson": canonical_json({**proof, "signature": signature}),
        }
