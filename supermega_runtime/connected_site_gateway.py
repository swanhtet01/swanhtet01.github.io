"""Default-off binding between a trusted ingress peer and site enrollment.

This adapter does not authenticate a TLS connection. Its injected provider must
do that for the *current* ASGI request; no HTTP field can construct an
attestation. The canonical app does not mount the connected-site router.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
from typing import Callable

from fastapi import Request

from .connected_site_runtime import ConnectedSiteAuthorityProvider, ConnectedSitePrincipal


_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_MAX_ATTESTATION_AGE = timedelta(seconds=30)


@dataclass(frozen=True, slots=True)
class GatewayPeerAttestation:
    """Transient identity supplied only by a reviewed authenticated ingress."""

    request: Request
    gateway_id: str
    workspace_id: str
    site_id: str
    device_id: str
    client_fingerprint: str
    session_generation: int
    observed_at: datetime


class ConnectedSiteGatewayPrincipalResolver:
    """Fail closed unless a fresh, request-bound peer matches current enrollment.

    The caller must inject a provider that returns independently authenticated
    peer evidence. This class neither reads nor trusts headers, cookies, query
    parameters or request JSON, and cannot replace real gateway/key custody.
    """

    def __init__(
        self,
        *,
        gateway_id: str,
        load_attested_peer: Callable[[Request], GatewayPeerAttestation | None],
        authority_provider: ConnectedSiteAuthorityProvider,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if not isinstance(gateway_id, str) or not _IDENTIFIER.fullmatch(gateway_id):
            raise ValueError("connected_site_gateway_id_invalid")
        self._gateway_id = gateway_id
        self._load_attested_peer = load_attested_peer
        self._authority_provider = authority_provider
        self._now = now

    def __call__(self, request: Request) -> ConnectedSitePrincipal | None:
        try:
            peer = self._load_attested_peer(request)
            if not isinstance(peer, GatewayPeerAttestation) or peer.request is not request:
                return None
            if peer.gateway_id != self._gateway_id or any(
                not isinstance(value, str) or not _IDENTIFIER.fullmatch(value)
                for value in (peer.workspace_id, peer.site_id, peer.device_id)
            ):
                return None
            if not isinstance(peer.client_fingerprint, str) or not _DIGEST.fullmatch(
                peer.client_fingerprint
            ):
                return None
            if (
                not isinstance(peer.session_generation, int)
                or isinstance(peer.session_generation, bool)
                or peer.session_generation < 1
                or not isinstance(peer.observed_at, datetime)
                or peer.observed_at.tzinfo is None
            ):
                return None
            current = self._now()
            if current.tzinfo is None:
                return None
            age = current.astimezone(timezone.utc) - peer.observed_at.astimezone(timezone.utc)
            if age < timedelta(0) or age > _MAX_ATTESTATION_AGE:
                return None
            authority = self._authority_provider.load_authority(
                workspace_id=peer.workspace_id, site_id=peer.site_id
            )
            if authority is None or not authority.enabled or (
                authority.workspace_id, authority.site_id
            ) != (peer.workspace_id, peer.site_id):
                return None
            device = authority.devices.get(peer.device_id)
            if (
                device is None
                or not device.active
                or device.client_fingerprint != peer.client_fingerprint
                or device.session_generation != peer.session_generation
            ):
                return None
            return ConnectedSitePrincipal(
                workspace_id=peer.workspace_id,
                site_id=peer.site_id,
                device_id=peer.device_id,
                authenticated=True,
                identity_provider=self._gateway_id,
            )
        except Exception:
            # An ingress or authority failure is never a fallback to request data.
            return None
