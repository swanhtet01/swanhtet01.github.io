"""Unmounted, metadata-only PostgreSQL site-event page.

The event JSON is deliberately not selected: the v15 schema has no reviewed
actor-level payload visibility classification. This is a cursor/chain proof,
not a replication feed or a production route.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from .connected_site_event_read import authorize_event_read
from .connected_site_runtime import ConnectedSitePrincipal
from .connected_site_v15 import ConnectedSiteV15Error, SiteAuthority, digest


@dataclass(frozen=True, slots=True)
class EventHeader:
    sequence: int
    event_digest: str
    previous_event_digest: str | None


@dataclass(frozen=True, slots=True)
class EventHeaderPage:
    workspace_id: str
    site_id: str
    after_sequence: int
    prior_event_digest: str | None
    headers: tuple[EventHeader, ...]
    next_sequence: int
    next_event_digest: str | None
    has_more: bool


def _fail(reason: str) -> None:
    raise ConnectedSiteV15Error(f"connected_site_event_page_{reason}")


def read_event_headers(
    *, connection_factory: Any, principal: ConnectedSitePrincipal,
    authority: SiteAuthority, lease: Mapping[str, Any],
    request: Mapping[str, Any], now: datetime,
) -> EventHeaderPage:
    """Read one consistent tenant page after rechecking current DB authority.

    Callers must supply a trusted ingress principal, current signed authority,
    and trusted UTC clock. The backend connection must be transaction-capable
    and subject to the existing forced tenant RLS. No route calls this yet.
    """
    grant = authorize_event_read(
        principal=principal, authority=authority, lease=lease,
        request=request, now=now,
    )
    device = authority.devices[grant.device_id]
    with connection_factory() as connection:
        if getattr(connection, "autocommit", None) is not False:
            _fail("transaction_required")
        with connection.cursor() as cursor:
            # A single snapshot prevents a page/head mixture. Row locks make
            # revocation and the normal upload site lock serialize with reads.
            cursor.execute("set transaction isolation level repeatable read")
            cursor.execute("select set_config('app.workspace_id', %s, true)", (grant.workspace_id,))
            cursor.execute("select set_config('app.site_id', %s, true)", (grant.site_id,))
            cursor.execute(
                "select connected_enabled,authority_generation,revocation_generation,"
                "authority_payload_digest from app_private.connected_sites "
                "where workspace_id=%s and site_id=%s for share",
                (grant.workspace_id, grant.site_id),
            )
            site = cursor.fetchone()
            if site != (True, grant.authority_generation, grant.revocation_generation,
                        authority.authority_payload_digest):
                _fail("authority_changed")
            cursor.execute(
                "select status,signing_key_id,signing_public_key,client_fingerprint,"
                "enrollment_evidence_digest,session_generation "
                "from app_private.connected_site_devices "
                "where workspace_id=%s and site_id=%s and device_id=%s for share",
                (grant.workspace_id, grant.site_id, grant.device_id),
            )
            if cursor.fetchone() != (
                "active", device.signing_key_id, device.public_key,
                device.client_fingerprint, device.enrollment_evidence_digest,
                device.session_generation,
            ):
                _fail("device_changed")
            cursor.execute(
                "select status,lease_digest,actor_id,device_id,role,session_generation,"
                "revocation_generation,issuer_key_id,issuer_public_key,expires_at "
                "from app_private.connected_site_leases "
                "where workspace_id=%s and site_id=%s and lease_id=%s for share",
                (grant.workspace_id, grant.site_id, lease["leaseId"]),
            )
            retained = cursor.fetchone()
            expected = (
                "active", digest(lease), grant.actor_id, grant.device_id,
                lease["role"], lease["sessionGeneration"],
                grant.revocation_generation, lease["issuerKeyId"],
                authority.issuer_keys[lease["issuerKeyId"]],
            )
            signed_expiry = datetime.fromisoformat(lease["expiresAt"].replace("Z", "+00:00"))
            if (
                retained is None or retained[:9] != expected
                or not isinstance(retained[9], datetime) or retained[9].tzinfo is None
                or retained[9].astimezone(timezone.utc) != signed_expiry
            ):
                _fail("lease_changed")
            def check_live_time() -> None:
                # transaction_timestamp() is fixed at BEGIN and could bless a
                # page that finishes after expiry while waiting on locks.
                cursor.execute("select clock_timestamp()")
                observed = cursor.fetchone()
                if (
                    observed is None or not isinstance(observed[0], datetime)
                    or observed[0].tzinfo is None or not isinstance(retained[9], datetime)
                    or retained[9].tzinfo is None
                ):
                    _fail("clock_invalid")
                current = observed[0].astimezone(timezone.utc)
                issued = datetime.fromisoformat(request["issuedAt"].replace("Z", "+00:00"))
                if (
                    current >= retained[9].astimezone(timezone.utc)
                    or current < issued or current - issued > timedelta(seconds=30)
                ):
                    _fail("lease_or_request_expired")

            check_live_time()
            if grant.after_sequence:
                cursor.execute(
                    "select event_digest from app_private.connected_site_events "
                    "where workspace_id=%s and site_id=%s and event_sequence=%s",
                    (grant.workspace_id, grant.site_id, grant.after_sequence),
                )
                prior = cursor.fetchone()
                if prior != (grant.prior_event_digest,):
                    _fail("cursor_changed")
            cursor.execute(
                "select event_sequence,event_digest,previous_event_digest "
                "from app_private.connected_site_events "
                "where workspace_id=%s and site_id=%s and event_sequence>%s "
                "order by event_sequence limit %s",
                (grant.workspace_id, grant.site_id, grant.after_sequence, grant.limit + 1),
            )
            rows = cursor.fetchall()
            if not isinstance(rows, list) or len(rows) > grant.limit + 1:
                _fail("page_shape")
            expected_sequence = grant.after_sequence + 1
            previous = grant.prior_event_digest
            headers: list[EventHeader] = []
            for sequence, event_digest, previous_digest in rows:
                if (
                    type(sequence) is not int or sequence != expected_sequence
                    or not isinstance(event_digest, str) or len(event_digest) != 64
                    or any(c not in "0123456789abcdef" for c in event_digest)
                    or previous_digest != previous
                ):
                    _fail("chain_gap")
                headers.append(EventHeader(sequence, event_digest, previous_digest))
                previous = event_digest
                expected_sequence += 1
            has_more = len(headers) > grant.limit
            headers = headers[:grant.limit]
            last = headers[-1] if headers else None
            check_live_time()
            return EventHeaderPage(
                grant.workspace_id, grant.site_id, grant.after_sequence,
                grant.prior_event_digest, tuple(headers),
                last.sequence if last else grant.after_sequence,
                last.event_digest if last else grant.prior_event_digest, has_more,
            )
