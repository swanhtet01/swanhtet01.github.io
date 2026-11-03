"""Unmounted PostgreSQL site-event page and bounded retail projection.

The default reader never selects event JSON. A separate manager-only reader
selects rows inside the same checked transaction, emits only the reviewed
retail held-reservation projection, and keeps other payloads private. Neither
reader is a mounted replication feed or production route.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
from typing import Any, Mapping

from .connected_site_event_read import AuthorizedEventRead, authorize_event_read
from .connected_site_runtime import ConnectedSitePrincipal
from .connected_site_v15 import ConnectedSiteV15Error, SiteAuthority, canonical_json, digest


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


@dataclass(frozen=True, slots=True)
class RetailReservationPage:
    headers: EventHeaderPage
    projections: tuple["RetailProjectionEntry", ...]
    actor_id: str
    device_id: str
    authority_generation: int
    revocation_generation: int
    authority_payload_digest: str
    lease_digest: str
    request_digest: str
    request_nonce: str

    def to_wire(self) -> dict[str, Any]:
        """Versioned, internally bound bytes; not a signed transport receipt."""
        page = self.headers
        by_sequence = {header.sequence: header for header in page.headers}
        seen: set[int] = set()
        projections: list[dict[str, Any]] = []
        for entry in self.projections:
            header = by_sequence.get(entry.sequence)
            projection = entry.projection
            if (
                entry.sequence in seen or header is None
                or header.event_digest != entry.event_digest
                or set(projection) != {
                    "contract", "workspaceId", "siteId", "candidateEventDigest",
                    "reservationId", "reservationDigest", "state", "stateVersion",
                    "lines",
                }
                or projection.get("candidateEventDigest") != entry.event_digest
                or projection.get("workspaceId") != page.workspace_id
                or projection.get("siteId") != page.site_id
                or projection.get("contract") != "supermega.connected-site-retail-reservation-view.v1"
                or projection.get("state") != "held"
                or projection.get("stateVersion") != 1
            ):
                _fail("projection_binding")
            seen.add(entry.sequence)
            projections.append({
                "sequence": entry.sequence, "eventDigest": entry.event_digest,
                "projection": projection,
            })
        payload = {
            "contract": "supermega.connected-site-retail-feed.v1",
            "protocolVersion": 1,
            "workspaceId": page.workspace_id,
            "siteId": page.site_id,
            "actorId": self.actor_id,
            "deviceId": self.device_id,
            "authorityGeneration": self.authority_generation,
            "revocationGeneration": self.revocation_generation,
            "authorityPayloadDigest": self.authority_payload_digest,
            "leaseDigest": self.lease_digest,
            "requestDigest": self.request_digest,
            "afterSequence": page.after_sequence,
            "priorEventDigest": page.prior_event_digest,
            "headers": [
                {"sequence": header.sequence, "eventDigest": header.event_digest,
                 "previousEventDigest": header.previous_event_digest}
                for header in page.headers
            ],
            "projections": projections,
            "nextSequence": page.next_sequence,
            "nextEventDigest": page.next_event_digest,
            "hasMore": page.has_more,
        }
        return {**payload, "pageDigest": digest(payload)}


@dataclass(frozen=True, slots=True)
class RetailProjectionEntry:
    """A sanitized view bound to exactly one checked source row."""

    sequence: int
    event_digest: str
    projection_json: str

    @property
    def projection(self) -> dict[str, Any]:
        # Return a fresh copy. The checked source projection is retained as
        # immutable canonical bytes, not as a caller-mutable dictionary.
        try:
            value = json.loads(self.projection_json)
        except (ValueError, TypeError):
            _fail("projection_binding")
        if not isinstance(value, dict) or canonical_json(value) != self.projection_json:
            _fail("projection_binding")
        return value


def _fail(reason: str) -> None:
    raise ConnectedSiteV15Error(f"connected_site_event_page_{reason}")


def _read_page(
    *, connection_factory: Any, principal: ConnectedSitePrincipal,
    authority: SiteAuthority, lease: Mapping[str, Any],
    request: Mapping[str, Any], now: datetime, include_retail_held: bool,
) -> tuple[EventHeaderPage, tuple[RetailProjectionEntry, ...], AuthorizedEventRead]:
    """Read one consistent tenant page after rechecking current DB authority.

    Callers must supply a trusted ingress principal, current signed authority,
    and trusted UTC clock. The backend connection must be transaction-capable
    and subject to the existing forced tenant RLS. No route calls this yet.
    """
    # The caller may retain mutable dictionaries. Freeze the exact signed
    # inputs before verifying or opening SQL, including projector rechecks.
    try:
        request = json.loads(canonical_json(request))
        lease = json.loads(canonical_json(lease))
    except (TypeError, ValueError):
        _fail("input_snapshot")
    if not isinstance(request, dict) or not isinstance(lease, dict):
        _fail("input_snapshot")
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
                issued = grant.issued_at
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
            columns = "event_sequence,event_digest,previous_event_digest"
            if include_retail_held:
                columns += ",event_json::text"
            cursor.execute(
                f"select {columns} from app_private.connected_site_events "
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
            projections: list[RetailProjectionEntry] = []
            for index, row in enumerate(rows):
                if not isinstance(row, tuple) or len(row) != (4 if include_retail_held else 3):
                    _fail("page_shape")
                sequence, event_digest, previous_digest = row[:3]
                if (
                    type(sequence) is not int or sequence != expected_sequence
                    or not isinstance(event_digest, str) or len(event_digest) != 64
                    or any(c not in "0123456789abcdef" for c in event_digest)
                    or previous_digest != previous
                ):
                    _fail("chain_gap")
                headers.append(EventHeader(sequence, event_digest, previous_digest))
                if include_retail_held:
                    raw_json = row[3]
                    if not isinstance(raw_json, str) or len(raw_json) > 1048576:
                        _fail("event_json_invalid")
                    try:
                        event = json.loads(raw_json)
                    except (ValueError, TypeError):
                        _fail("event_json_invalid")
                    # PostgreSQL jsonb text is not in our canonical key order;
                    # digest() canonicalizes the parsed object independently.
                    if not isinstance(event, dict) or digest(event) != event_digest:
                        _fail("event_json_invalid")
                    if index < grant.limit and event.get("eventType") == "shop.connected_stock.reserved.v1":
                        # Import locally: the projection itself rechecks the
                        # signed actor/lease and rejects unknown payload keys.
                        from .connected_site_event_projection import project_retail_reservation_held
                        projections.append(RetailProjectionEntry(
                            sequence=sequence,
                            event_digest=event_digest,
                            projection_json=canonical_json(
                                project_retail_reservation_held(
                                    principal=principal, authority=authority, lease=lease,
                                    request=request, now=now, event=event,
                                    candidate_event_digest=event_digest,
                                )
                            ),
                        ))
                previous = event_digest
                expected_sequence += 1
            has_more = len(headers) > grant.limit
            headers = headers[:grant.limit]
            last = headers[-1] if headers else None
            check_live_time()
            page = EventHeaderPage(
                grant.workspace_id, grant.site_id, grant.after_sequence,
                grant.prior_event_digest, tuple(headers),
                last.sequence if last else grant.after_sequence,
                last.event_digest if last else grant.prior_event_digest, has_more,
            )
            return page, tuple(projections), grant


def read_event_headers(
    *, connection_factory: Any, principal: ConnectedSitePrincipal,
    authority: SiteAuthority, lease: Mapping[str, Any],
    request: Mapping[str, Any], now: datetime,
) -> EventHeaderPage:
    """Read only chain metadata; never select the event JSON column."""
    return _read_page(
        connection_factory=connection_factory, principal=principal,
        authority=authority, lease=lease, request=request, now=now,
        include_retail_held=False,
    )[0]


def read_retail_reservation_page(
    *, connection_factory: Any, principal: ConnectedSitePrincipal,
    authority: SiteAuthority, lease: Mapping[str, Any],
    request: Mapping[str, Any], now: datetime,
) -> RetailReservationPage:
    """Return a manager-only sanitized held-reservation view in one DB snapshot.

    No route or native client calls this source-only seam. Other event types
    advance the checked cursor but never return their raw payloads.
    """
    headers, projections, grant = _read_page(
        connection_factory=connection_factory, principal=principal,
        authority=authority, lease=lease, request=request, now=now,
        include_retail_held=True,
    )
    return RetailReservationPage(
        headers=headers, projections=projections,
        actor_id=grant.actor_id, device_id=grant.device_id,
        authority_generation=grant.authority_generation,
        revocation_generation=grant.revocation_generation,
        authority_payload_digest=grant.authority_payload_digest,
        lease_digest=grant.lease_digest, request_digest=grant.request_digest,
        request_nonce=grant.request_nonce,
    )
