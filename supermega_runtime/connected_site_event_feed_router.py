"""Unmounted, default-off HTTP composition for checked site-event pages.

This is not a production ingress or key store. A future owner-reviewed mount
must provide a request-bound authenticated peer, current authority/lease,
trusted UTC time, transaction-capable PostgreSQL connection and protected
synchronous signer with an independently pinned public key.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any, Callable, Mapping

from fastapi import APIRouter, Request
from fastapi.responses import Response

from .connected_site_event_feed import RetailReservationPage, read_retail_reservation_page
from .connected_site_feed_signer import ConnectedSiteFeedSealer
from .connected_site_runtime import (
    ConnectedSiteAuthorityProvider, ConnectedSitePrincipal, PrincipalResolver,
    _canonical_response, _contains_sensitive_key, _error, _http_error,
    _principal, _read_bounded_body, _reject_ambient_authority, _unique_object,
)
from .connected_site_v15 import ConnectedSiteV15Error, _verify, canonical_json, digest


_PROOF_KEYS = {
    "contract", "protocolVersion", "issuerKeyId", "issuedAtMillis",
    "expiresAtMillis", "workspaceId", "siteId", "actorId", "actorRole",
    "deviceId", "authorityGeneration", "revocationGeneration",
    "authorityPayloadDigest", "leaseDigest", "requestDigest", "requestNonce",
    "afterSequence", "priorEventDigest", "nextSequence", "nextEventDigest",
    "pageDigest", "signature",
}


def _checked_receipt(
    sealed: Any, *, page: RetailReservationPage,
    request: Mapping[str, Any], lease: Mapping[str, Any],
    pinned_issuer_keys: Mapping[str, str], trusted_now: datetime,
) -> dict[str, str]:
    if not isinstance(sealed, dict) or set(sealed) != {"requestJson", "pageJson", "proofJson"}:
        raise ConnectedSiteV15Error("connected_site_feed_receipt_shape")
    if any(not isinstance(value, str) or len(value) > 65536 for value in sealed.values()):
        raise ConnectedSiteV15Error("connected_site_feed_receipt_shape")
    wire = page.to_wire()
    # An injected signer sees the reader's mutable snapshots. It may not
    # mutate them after the checked SQL transaction authorized their digests.
    lease_payload = {key: value for key, value in lease.items()
                     if key not in {"payloadDigest", "signature"}}
    if (digest(request) != wire["requestDigest"]
            or digest(lease_payload) != lease.get("payloadDigest")
            or lease.get("payloadDigest") != wire["leaseDigest"]):
        raise ConnectedSiteV15Error("connected_site_feed_input_mutated")
    if (sealed["requestJson"] != canonical_json(request)
            or sealed["pageJson"] != canonical_json(wire)):
        raise ConnectedSiteV15Error("connected_site_feed_receipt_binding")
    try:
        proof = json.loads(sealed["proofJson"], object_pairs_hook=_unique_object)
    except (TypeError, ValueError):
        raise ConnectedSiteV15Error("connected_site_feed_proof_shape") from None
    if (not isinstance(proof, dict) or set(proof) != _PROOF_KEYS
            or canonical_json(proof) != sealed["proofJson"]):
        raise ConnectedSiteV15Error("connected_site_feed_proof_shape")
    expected = {
        "contract": "supermega.connected-cloud-feed-proof.v1",
        "protocolVersion": 1,
        "workspaceId": wire["workspaceId"],
        "siteId": wire["siteId"],
        "actorId": wire["actorId"],
        "actorRole": lease.get("role"),
        "deviceId": wire["deviceId"],
        "authorityGeneration": wire["authorityGeneration"],
        "revocationGeneration": wire["revocationGeneration"],
        "authorityPayloadDigest": wire["authorityPayloadDigest"],
        "leaseDigest": wire["leaseDigest"],
        "requestDigest": wire["requestDigest"],
        "requestNonce": request.get("requestNonce"),
        "afterSequence": wire["afterSequence"],
        "priorEventDigest": wire["priorEventDigest"],
        "nextSequence": wire["nextSequence"],
        "nextEventDigest": wire["nextEventDigest"],
        "pageDigest": wire["pageDigest"],
    }
    if any(type(proof.get(key)) is not type(value) or proof.get(key) != value
           for key, value in expected.items()):
        raise ConnectedSiteV15Error("connected_site_feed_proof_binding")
    issued, expires = proof.get("issuedAtMillis"), proof.get("expiresAtMillis")
    if (type(issued) is not int or type(expires) is not int
            or expires - issued < 1 or expires - issued > 300000
            or trusted_now.tzinfo is None):
        raise ConnectedSiteV15Error("connected_site_feed_proof_time")
    observed = int(trusted_now.astimezone(timezone.utc).timestamp() * 1000)
    if not issued <= observed < expires:
        raise ConnectedSiteV15Error("connected_site_feed_proof_time")
    issuer = proof.get("issuerKeyId")
    key = pinned_issuer_keys.get(issuer) if isinstance(issuer, str) else None
    if not isinstance(key, str):
        raise ConnectedSiteV15Error("connected_site_feed_issuer_unavailable")
    signature = proof["signature"]
    _verify(key, signature, canonical_json({k: v for k, v in proof.items()
                                            if k != "signature"}).encode(), "feed_proof_signature")
    return sealed


def create_connected_site_event_feed_router(
    *, connection_factory: Callable[[], Any],
    authority_provider: ConnectedSiteAuthorityProvider,
    resolve_principal: PrincipalResolver,
    load_lease: Callable[[ConnectedSitePrincipal, Mapping[str, Any]], Mapping[str, Any] | None],
    seal_checked_page: Callable[[RetailReservationPage, Mapping[str, Any], Mapping[str, Any]], Any],
    pinned_issuer_keys: Mapping[str, str],
    trusted_now: Callable[[], datetime],
    runtime_enabled: bool = False,
    max_body_bytes: int = 65536,
) -> APIRouter:
    """Build a route, never mount it; absent authority always fails closed."""
    if (type(runtime_enabled) is not bool or type(max_body_bytes) is not int
            or not 1024 <= max_body_bytes <= 65536):
        raise ValueError("connected_site_feed_route_config_invalid")
    # A caller cannot swap the public pin after this route is composed.
    pins = dict(pinned_issuer_keys)
    router = APIRouter(prefix="/api/connected-site/v1", tags=["connected-site-disabled"])

    @router.post("/event-feed")
    async def event_feed(request: Request) -> Response:
        if not runtime_enabled or not pins:
            raise _error(503, "event_feed_disabled")
        _reject_ambient_authority(request)
        principal = _principal(resolve_principal, request)
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > max_body_bytes:
                    raise _error(413, "request_too_large")
            except ValueError:
                raise _error(400, "content_length_invalid") from None
        body = await _read_bounded_body(request, max_body_bytes=max_body_bytes)
        try:
            parsed = json.loads(body, object_pairs_hook=_unique_object)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            raise _error(400, "request_json_invalid") from None
        if not isinstance(parsed, dict) or _contains_sensitive_key(parsed):
            raise _error(400, "request_shape_invalid")
        try:
            now = trusted_now()
            if not isinstance(now, datetime) or now.tzinfo is None:
                raise ConnectedSiteV15Error("connected_site_feed_clock_invalid")
            authority = authority_provider.load_authority(
                workspace_id=principal.workspace_id, site_id=principal.site_id)
            if authority is None:
                raise ConnectedSiteV15Error("connected_site_feed_authority_unavailable")
            lease = load_lease(principal, parsed)
            if not isinstance(lease, Mapping):
                raise ConnectedSiteV15Error("connected_site_feed_lease_unavailable")

            def seal(page: RetailReservationPage, checked_request: Mapping[str, Any],
                     checked_lease: Mapping[str, Any]) -> dict[str, str]:
                seal_now = trusted_now()
                if (not isinstance(seal_now, datetime) or seal_now.tzinfo is None
                        or seal_now.astimezone(timezone.utc) < now.astimezone(timezone.utc)):
                    raise ConnectedSiteV15Error("connected_site_feed_clock_rollback")
                request_bytes = canonical_json(checked_request)
                lease_bytes = canonical_json(checked_lease)
                sealed = (
                    seal_checked_page.seal_at(
                        page, checked_request, checked_lease,
                        checked_at=seal_now,
                    )
                    if isinstance(seal_checked_page, ConnectedSiteFeedSealer)
                    else seal_checked_page(page, checked_request, checked_lease)
                )
                if (canonical_json(checked_request) != request_bytes
                        or canonical_json(checked_lease) != lease_bytes):
                    raise ConnectedSiteV15Error("connected_site_feed_input_mutated")
                return _checked_receipt(
                    sealed,
                    page=page, request=checked_request, lease=checked_lease,
                    pinned_issuer_keys=pins, trusted_now=seal_now,
                )

            result = read_retail_reservation_page(
                connection_factory=connection_factory, principal=principal,
                authority=authority, lease=lease, request=parsed, now=now,
                seal_checked_page=seal,
            )
            return _canonical_response(result)
        except ConnectedSiteV15Error as exc:
            raise _http_error(exc) from None
        except Exception:
            # Backend, signer or clock failure must never fall back to body identity.
            raise _error(503, "event_feed_unavailable") from None

    return router
