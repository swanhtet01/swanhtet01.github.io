"""Test-only Python wire-type bytes for the native v41 consumer.

This constructs a synthetic page using the server wire types; it does not call
the PostgreSQL reader. The reader is unmounted and unsigned. Fixed synthetic
keys never constitute production authority or a deployable signing path.
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone
import re
from typing import Any, Mapping

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from supermega_runtime.connected_site_event_feed import (
    EventHeader, EventHeaderPage, RetailReservationPage,
    read_retail_reservation_page,
)
from supermega_runtime.connected_site_v15 import (
    ConnectedSiteV15Error, canonical_json, digest,
)


def _signature(seed: int, fields: dict) -> str:
    signature = Ed25519PrivateKey.from_private_bytes(bytes([seed]) * 32).sign(
        canonical_json(fields).encode("utf-8")
    )
    return base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")


def read_and_sign_test_only_page(
    *, connection_factory: Any, principal: Any, authority: Any,
    lease: Mapping[str, Any], request: Mapping[str, Any], now: datetime,
    issuer_key_id: str, issuer_seed: int,
) -> dict[str, str]:
    """Seal the checked SQL page under its row locks with a fixed test key.

    This is not a mounted route or production signer. Protected key custody,
    authenticated ingress and installed-device evidence remain release gates.
    """
    def seal(
        checked_page: RetailReservationPage,
        checked_request: Mapping[str, Any], checked_lease: Mapping[str, Any],
    ) -> dict[str, str]:
        page = checked_page.to_wire()
        if (
            not isinstance(now, datetime) or now.tzinfo is None
            or not isinstance(issuer_key_id, str)
            or not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,63}", issuer_key_id)
            or page["requestDigest"] != digest(checked_request)
            or page["leaseDigest"] != checked_lease.get("payloadDigest")
            or page["workspaceId"] != principal.workspace_id
            or page["siteId"] != principal.site_id
            or page["deviceId"] != principal.device_id
            or checked_page.request_nonce != checked_request.get("requestNonce")
        ):
            raise ConnectedSiteV15Error("connected_site_test_page_binding_invalid")
        issued = int(now.astimezone(timezone.utc).timestamp() * 1000)
        lease_expiry = datetime.fromisoformat(
            checked_lease["expiresAt"].replace("Z", "+00:00")
        )
        expires = min(issued + 30000, int(lease_expiry.timestamp() * 1000))
        if issued <= 0 or expires <= issued:
            raise ConnectedSiteV15Error("connected_site_test_page_expired")
        proof = {
            "contract": "supermega.connected-cloud-feed-proof.v1",
            "protocolVersion": 1,
            "issuerKeyId": issuer_key_id,
            "issuedAtMillis": issued,
            "expiresAtMillis": expires,
            "workspaceId": page["workspaceId"],
            "siteId": page["siteId"],
            "actorId": page["actorId"],
            "actorRole": checked_lease["role"],
            "deviceId": page["deviceId"],
            "authorityGeneration": page["authorityGeneration"],
            "revocationGeneration": page["revocationGeneration"],
            "authorityPayloadDigest": page["authorityPayloadDigest"],
            "leaseDigest": page["leaseDigest"],
            "requestDigest": page["requestDigest"],
            "requestNonce": checked_page.request_nonce,
            "afterSequence": page["afterSequence"],
            "priorEventDigest": page["priorEventDigest"],
            "nextSequence": page["nextSequence"],
            "nextEventDigest": page["nextEventDigest"],
            "pageDigest": page["pageDigest"],
        }
        return {
            "requestJson": canonical_json(checked_request),
            "pageJson": canonical_json(page),
            "proofJson": canonical_json({**proof, "signature": _signature(issuer_seed, proof)}),
        }

    return read_retail_reservation_page(
        connection_factory=connection_factory, principal=principal,
        authority=authority, lease=lease, request=request, now=now,
        seal_checked_page=seal,
    )


def build_signed_v41_fixture() -> dict[str, str]:
    request = {
        "contract": "supermega.connected-site-event-read-request.v1",
        "workspaceId": "workspace_v41_fixture",
        "siteId": "site_v41_fixture",
        "actorId": "actor_fixture",
        "deviceId": "device_v41_fixture",
        "clientFingerprint": "b0066359d64f97eb279947feeb083a96343d5f5a0a2c9cf82842f6f4749ff534",
        "enrollmentEvidenceDigest": "68e36d9644eee6bf19980d63f2d48559f6094f1a8a0da51dbb91b2e13a8125de",
        "authorityGeneration": 1,
        "authorityPayloadDigest": "f190c4fb4acb4b02807717b2a8e1b1861340d2146155ae46e1d4947371869ec3",
        "revocationGeneration": 1,
        "afterSequence": 1,
        "priorEventDigest": "e" * 64,
        "limit": 64,
        "leaseDigest": "f3de99c4ba6673fae42646ca668fa1af807212bc1fd9a6be0e054a0ba14cfab1",
        "issuedAt": "2027-01-15T08:00:00.800Z",
        "requestNonce": "9" * 64,
        "signingKeyId": "b0066359d64f97eb279947feeb083a96343d5f5a0a2c9cf82842f6f4749ff534",
        "signatureAlgorithm": "ed25519",
    }
    request_json = canonical_json({**request, "signature": _signature(18, request)})
    headers = EventHeaderPage(
        workspace_id=request["workspaceId"], site_id=request["siteId"],
        after_sequence=1, prior_event_digest="e" * 64,
        headers=(EventHeader(2, "d" * 64, "e" * 64),),
        next_sequence=2, next_event_digest="d" * 64, has_more=False,
    )
    page = RetailReservationPage(
        headers=headers, projections=(), actor_id=request["actorId"],
        device_id=request["deviceId"], authority_generation=1,
        revocation_generation=1,
        authority_payload_digest=request["authorityPayloadDigest"],
        lease_digest=request["leaseDigest"],
        request_digest=digest({**request, "signature": _signature(18, request)}),
        request_nonce=request["requestNonce"],
    ).to_wire()
    proof = {
        "contract": "supermega.connected-cloud-feed-proof.v1",
        "protocolVersion": 1,
        "issuerKeyId": "feed_fixture",
        "issuedAtMillis": 1800000000900,
        "expiresAtMillis": 1800000031000,
        "workspaceId": request["workspaceId"],
        "siteId": request["siteId"],
        "actorId": request["actorId"],
        "actorRole": "manager",
        "deviceId": request["deviceId"],
        "authorityGeneration": 1,
        "revocationGeneration": 1,
        "authorityPayloadDigest": request["authorityPayloadDigest"],
        "leaseDigest": request["leaseDigest"],
        "requestDigest": page["requestDigest"],
        "requestNonce": request["requestNonce"],
        "afterSequence": 1,
        "priorEventDigest": "e" * 64,
        "nextSequence": 2,
        "nextEventDigest": "d" * 64,
        "pageDigest": page["pageDigest"],
    }
    return {
        "requestJson": request_json,
        "pageJson": canonical_json(page),
        "proofJson": canonical_json({**proof, "signature": _signature(23, proof)}),
    }


if __name__ == "__main__":
    print(canonical_json(build_signed_v41_fixture()))
