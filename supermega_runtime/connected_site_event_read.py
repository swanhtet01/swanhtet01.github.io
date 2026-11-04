"""Default-off, manager-only authorization for a future site-event feed.

This pure verifier is not an HTTP endpoint or a production gateway. A caller
must independently authenticate ingress, load current site authority, and
provide a trusted UTC time for *each* request. All-site event read is limited
to a currently enrolled manager/owner with a valid signed staff lease.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
from typing import Any, Mapping

from .connected_site_runtime import ConnectedSitePrincipal
from .connected_site_device_profile_v2 import (
    DeviceProfileV2Error, P256_DEVICE_PROFILE, verify_p256_device_signature,
)
from .connected_site_v15 import (
    ConnectedSiteV15Error, SiteAuthority, _verify, canonical_json, digest,
    verify_connected_site_lease,
)


READ_REQUEST_CONTRACT = "supermega.connected-site-event-read-request.v1"
READ_REQUEST_CONTRACT_V2 = "supermega.connected-site-event-read-request.v2"
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_REQUEST_KEYS = {
    "contract", "workspaceId", "siteId", "actorId", "deviceId",
    "clientFingerprint", "enrollmentEvidenceDigest", "authorityGeneration",
    "authorityPayloadDigest", "revocationGeneration", "afterSequence",
    "priorEventDigest", "limit", "leaseDigest", "issuedAt",
    "requestNonce",
    "signingKeyId", "signatureAlgorithm", "signature",
}


def _deny(reason: str) -> None:
    raise ConnectedSiteV15Error(f"connected_site_event_read_{reason}")


@dataclass(frozen=True, slots=True)
class AuthorizedEventRead:
    workspace_id: str
    site_id: str
    actor_id: str
    device_id: str
    after_sequence: int
    prior_event_digest: str | None
    limit: int
    authority_generation: int
    revocation_generation: int
    authority_payload_digest: str
    lease_digest: str
    request_digest: str
    request_nonce: str
    issued_at: datetime


def authorize_event_read(
    *, principal: ConnectedSitePrincipal, authority: SiteAuthority,
    lease: Mapping[str, Any],
    request: Mapping[str, Any], now: datetime,
) -> AuthorizedEventRead:
    """Recheck a signed read request and lease against current authority."""
    if not isinstance(now, datetime) or now.tzinfo is None:
        _deny("clock_invalid")
    now = now.astimezone(timezone.utc)
    if not authority.enabled:
        _deny("disabled")
    if not isinstance(request, dict) or set(request) != _REQUEST_KEYS:
        _deny("request_shape")
    for field in ("workspaceId", "siteId", "actorId", "deviceId", "signingKeyId"):
        value = request[field]
        if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
            _deny("request_identity")
    if (
        request["workspaceId"] != authority.workspace_id
        or request["siteId"] != authority.site_id
        or not isinstance(principal, ConnectedSitePrincipal)
        or not principal.authenticated
        or (principal.workspace_id, principal.site_id, principal.device_id)
        != (request["workspaceId"], request["siteId"], request["deviceId"])
    ):
        _deny("scope")
    device = authority.devices.get(request["deviceId"])
    if device is None or not device.active:
        _deny("device_revoked")
    expected_contract = (READ_REQUEST_CONTRACT_V2 if device.signing_profile == P256_DEVICE_PROFILE
                         else READ_REQUEST_CONTRACT)
    if request["contract"] != expected_contract:
        _deny("disabled")
    if (
        request["signingKeyId"] != device.signing_key_id
        or request["clientFingerprint"] != device.client_fingerprint
        or request["enrollmentEvidenceDigest"] != device.enrollment_evidence_digest
        or request["signatureAlgorithm"] != (
            P256_DEVICE_PROFILE if device.signing_profile == P256_DEVICE_PROFILE else "ed25519"
        )
    ):
        _deny("device_binding")
    for field, expected in (
        ("authorityGeneration", authority.authority_generation),
        ("authorityPayloadDigest", authority.authority_payload_digest),
        ("revocationGeneration", authority.revocation_generation),
    ):
        if type(request[field]) is not type(expected) or request[field] != expected:
            _deny("authority_changed")
    after, limit, prior = (
        request["afterSequence"], request["limit"], request["priorEventDigest"]
    )
    if (
        not isinstance(after, int) or isinstance(after, bool) or after < 0
        or after > 2**63 - 1 or not isinstance(limit, int)
        or isinstance(limit, bool) or limit < 1 or limit > 64
        or (prior is not None if after == 0 else
            not isinstance(prior, str) or not _DIGEST.fullmatch(prior))
    ):
        _deny("cursor_invalid")
    if not isinstance(request["requestNonce"], str) or not _DIGEST.fullmatch(
        request["requestNonce"]
    ):
        _deny("request_nonce_invalid")
    issued_text = request["issuedAt"]
    if not isinstance(issued_text, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", issued_text
    ):
        _deny("time_invalid")
    try:
        issued = datetime.fromisoformat(issued_text.replace("Z", "+00:00"))
    except ValueError:
        _deny("time_invalid")
    if issued > now or now - issued > timedelta(seconds=30):
        _deny("time_stale")
    validated_lease = verify_connected_site_lease(lease, authority, device, now)
    member = authority.members.get(request["actorId"])
    if (
        member is None or member.role not in {"manager", "owner"}
        or "managementRead" not in member.capabilities
        or member.role != validated_lease["role"]
        or member.session_generation != validated_lease["sessionGeneration"]
        or validated_lease["actorId"] != member.actor_id
        or validated_lease["deviceId"] != device.device_id
        or "managementRead" not in validated_lease["capabilities"]
        or request["leaseDigest"] != validated_lease["payloadDigest"]
    ):
        _deny("actor_lease_denied")
    unsigned = {key: request[key] for key in _REQUEST_KEYS - {"signature"}}
    signing_bytes = canonical_json(unsigned).encode()
    if device.signing_profile == P256_DEVICE_PROFILE:
        try:
            verify_p256_device_signature(
                public_key=device.public_key,
                fingerprint_sha256=device.client_fingerprint,
                signature=request["signature"], message=signing_bytes,
            )
        except DeviceProfileV2Error:
            _deny("signature")
    else:
        _verify(device.public_key, request["signature"],
                signing_bytes, "event_read_signature")
    return AuthorizedEventRead(
        workspace_id=authority.workspace_id, site_id=authority.site_id,
        actor_id=member.actor_id, device_id=device.device_id,
        after_sequence=after, prior_event_digest=prior, limit=limit,
        authority_generation=authority.authority_generation,
        revocation_generation=authority.revocation_generation,
        authority_payload_digest=authority.authority_payload_digest,
        lease_digest=validated_lease["payloadDigest"],
        request_digest=digest(request),
        request_nonce=request["requestNonce"],
        issued_at=issued,
    )
