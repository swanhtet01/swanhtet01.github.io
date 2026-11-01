"""Default-off issuer for versioned connected-site offline staff leases.

This module owns no route, database connection, or production key.  Callers
must inject a named owner session, a freshly verified ``SiteAuthority``, an
Ed25519 signer, and an append-only idempotency store.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import json
import re
from collections.abc import Callable
from threading import Lock
from typing import Any, Mapping, Protocol

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from supermega_runtime.connected_site_v15 import SiteAuthority, canonical_json, digest


LEASE_CONTRACT = "supermega.shop.offline-staff-lease.v1"
LEASE_AUDIT_CONTRACT = "supermega.connected-site-lease-issued.v1"
PROTOCOL_VERSION = 1
MAXIMUM_LEASE_SECONDS = 7 * 24 * 60 * 60

_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$")
_KEY_ID = re.compile(r"^[a-z0-9][a-z0-9._-]{0,31}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_SIGNATURE = re.compile(r"^[A-Za-z0-9_-]{86}$")
_CANONICAL_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$"
)
_LEASE_KEYS = frozenset({
    "protocolVersion", "leaseId", "workspaceId", "siteId", "actorId", "role",
    "capabilities", "deviceId", "sessionGeneration", "revocationGeneration",
    "issuedAt", "expiresAt", "issuerKeyId", "payloadDigest", "signature",
})
_AUDIT_KEYS = frozenset({
    "contract", "commandId", "requestDigest", "leaseId", "workspaceId", "siteId",
    "ownerActorId", "actorId", "role", "capabilities", "deviceId",
    "sessionGeneration", "revocationGeneration", "issuedAt", "expiresAt",
    "issuerKeyId", "leaseDigest", "auditDigest",
})
_ROLE_CAPABILITIES = {
    "owner": frozenset({
        "counterSale", "stockChange", "productDetailsWrite", "cashShiftManage",
        "cafeOrderWrite", "cafeKitchenStatus", "cafeCashComplete", "managementRead",
    }),
    "manager": frozenset({
        "counterSale", "stockChange", "productDetailsWrite", "cashShiftManage",
        "cafeOrderWrite", "cafeKitchenStatus", "cafeCashComplete", "managementRead",
    }),
    "cashierCounter": frozenset({"counterSale", "cashShiftManage", "cafeCashComplete"}),
    "stockStaff": frozenset({"stockChange"}),
    "cafeWaiter": frozenset({"cafeOrderWrite"}),
    "cafeKitchenBar": frozenset({"cafeKitchenStatus"}),
}


class LeaseIssuanceError(ValueError):
    """Stable fail-closed lease issuance rejection."""


def _fail(code: str) -> None:
    raise LeaseIssuanceError(f"connected_site_lease_{code}")


def _identifier(value: object, code: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail(code)
    return value


def _canonical_capabilities(value: object, role: str) -> tuple[str, ...]:
    if (
        not isinstance(value, tuple)
        or not value
        or tuple(sorted(set(value))) != value
        or not all(isinstance(item, str) and _IDENTIFIER.fullmatch(item) for item in value)
        or role not in _ROLE_CAPABILITIES
        or not set(value).issubset(_ROLE_CAPABILITIES[role])
    ):
        _fail("capabilities_invalid")
    return value


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None:
        _fail("clock_invalid")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _parse_timestamp(value: object, code: str) -> datetime:
    if not isinstance(value, str) or not _CANONICAL_TIMESTAMP.fullmatch(value):
        _fail(code)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        _fail(code)
    if _timestamp(parsed) != value:
        _fail(code)
    return parsed


def _signature(value: object) -> str:
    if not isinstance(value, str) or not _SIGNATURE.fullmatch(value):
        _fail("signature_invalid")
    try:
        raw = base64.b64decode(value + "==", altchars=b"-_", validate=True)
    except (ValueError, TypeError):
        _fail("signature_invalid")
    if len(raw) != 64 or base64.urlsafe_b64encode(raw).decode().rstrip("=") != value:
        _fail("signature_invalid")
    return value


@dataclass(frozen=True, slots=True)
class AuthenticatedOwnerSession:
    workspace_id: str
    site_id: str
    actor_id: str
    session_generation: int
    authentication_method: str = "named-user-session-v1"
    authenticated: bool = True

    def __post_init__(self) -> None:
        _identifier(self.workspace_id, "owner_workspace_invalid")
        _identifier(self.site_id, "owner_site_invalid")
        _identifier(self.actor_id, "owner_actor_invalid")
        if (
            self.authenticated is not True
            or self.authentication_method != "named-user-session-v1"
            or isinstance(self.session_generation, bool)
            or self.session_generation < 1
        ):
            _fail("owner_authentication_invalid")


@dataclass(frozen=True, slots=True)
class LeaseIssueRequest:
    command_id: str
    workspace_id: str
    site_id: str
    actor_id: str
    role: str
    capabilities: tuple[str, ...]
    device_id: str
    valid_for_seconds: int = MAXIMUM_LEASE_SECONDS

    def __post_init__(self) -> None:
        for value, code in (
            (self.command_id, "command_invalid"),
            (self.workspace_id, "workspace_invalid"),
            (self.site_id, "site_invalid"),
            (self.actor_id, "actor_invalid"),
            (self.role, "role_invalid"),
            (self.device_id, "device_invalid"),
        ):
            _identifier(value, code)
        _canonical_capabilities(self.capabilities, self.role)
        if (
            isinstance(self.valid_for_seconds, bool)
            or not 1 <= self.valid_for_seconds <= MAXIMUM_LEASE_SECONDS
        ):
            _fail("validity_invalid")

    def canonical_request(self) -> dict[str, Any]:
        return {
            "contract": "supermega.connected-site-lease-issue-command.v1",
            "commandId": self.command_id,
            "workspaceId": self.workspace_id,
            "siteId": self.site_id,
            "actorId": self.actor_id,
            "role": self.role,
            "capabilities": list(self.capabilities),
            "deviceId": self.device_id,
            "validForSeconds": self.valid_for_seconds,
        }


def _issuance_request_digest(
    request: LeaseIssueRequest, principal: AuthenticatedOwnerSession
) -> str:
    """Bind idempotency and the signed lease identity to the issuing owner."""

    return digest({**request.canonical_request(), "ownerActorId": principal.actor_id})


class OfflineLeaseSigner(Protocol):
    @property
    def key_id(self) -> str: ...

    @property
    def public_key(self) -> str: ...

    def sign(self, message: bytes) -> str: ...


@dataclass(frozen=True, slots=True)
class RetainedLeaseIssuance:
    request_digest: str
    lease: Mapping[str, Any]
    audit: Mapping[str, Any]


class LeaseIssuanceStore(Protocol):
    def load(self, workspace_id: str, site_id: str, command_id: str) -> RetainedLeaseIssuance | None: ...

    def append(
        self,
        workspace_id: str,
        site_id: str,
        command_id: str,
        retained: RetainedLeaseIssuance,
    ) -> tuple[RetainedLeaseIssuance, bool]: ...


@dataclass(slots=True)
class MemoryLeaseIssuanceStore:
    """Synthetic append-only store mirroring the future database boundary."""

    _records: dict[tuple[str, str, str], RetainedLeaseIssuance] = field(
        default_factory=dict, init=False, repr=False
    )
    _lock: Any = field(default_factory=Lock, init=False, repr=False)

    def load(self, workspace_id: str, site_id: str, command_id: str) -> RetainedLeaseIssuance | None:
        with self._lock:
            retained = self._records.get((workspace_id, site_id, command_id))
            return _copy_retained(retained) if retained is not None else None

    def append(
        self,
        workspace_id: str,
        site_id: str,
        command_id: str,
        retained: RetainedLeaseIssuance,
    ) -> tuple[RetainedLeaseIssuance, bool]:
        with self._lock:
            key = (workspace_id, site_id, command_id)
            existing = self._records.get(key)
            if existing is not None:
                if existing.request_digest != retained.request_digest:
                    _fail("command_reused")
                return _copy_retained(existing), True
            stored = _copy_retained(retained)
            self._records[key] = stored
            return _copy_retained(stored), False


def _copy_retained(retained: RetainedLeaseIssuance) -> RetainedLeaseIssuance:
    """Return detached JSON values so callers cannot rewrite retained audit state."""

    return RetainedLeaseIssuance(
        request_digest=retained.request_digest,
        lease=json.loads(canonical_json(retained.lease)),
        audit=json.loads(canonical_json(retained.audit)),
    )


@dataclass(frozen=True, slots=True)
class LeaseIssueResult:
    lease: Mapping[str, Any]
    audit: Mapping[str, Any]
    replayed: bool


class OfflineStaffLeaseIssuer:
    def __init__(
        self,
        *,
        signer: OfflineLeaseSigner,
        store: LeaseIssuanceStore,
        enabled: bool = False,
        now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        if not _KEY_ID.fullmatch(signer.key_id):
            _fail("issuer_key_invalid")
        try:
            public_key = base64.b64decode(signer.public_key + "=", altchars=b"-_", validate=True)
        except (ValueError, TypeError):
            _fail("issuer_key_invalid")
        if (
            len(public_key) != 32
            or base64.urlsafe_b64encode(public_key).decode().rstrip("=") != signer.public_key
        ):
            _fail("issuer_key_invalid")
        self._signer = signer
        self._public_key_bytes = public_key
        self._store = store
        self._enabled = enabled
        self._now = now

    def issue(
        self,
        *,
        principal: AuthenticatedOwnerSession,
        authority: SiteAuthority,
        request: LeaseIssueRequest,
    ) -> LeaseIssueResult:
        if not self._enabled or not authority.enabled:
            _fail("disabled")
        if authority.issuer_keys.get(self._signer.key_id) != self._signer.public_key:
            _fail("issuer_key_not_authorized")
        if (
            principal.workspace_id != authority.workspace_id
            or principal.site_id != authority.site_id
            or request.workspace_id != authority.workspace_id
            or request.site_id != authority.site_id
        ):
            _fail("scope_mismatch")

        owner = authority.members.get(principal.actor_id)
        if (
            owner is None
            or owner.role != "owner"
            or owner.session_generation != principal.session_generation
        ):
            _fail("owner_required")
        member = authority.members.get(request.actor_id)
        device = authority.devices.get(request.device_id)
        if (
            member is None
            or member.role != request.role
            or member.capabilities != request.capabilities
            or device is None
            or not device.active
            or device.session_generation != member.session_generation
        ):
            _fail("current_authority_mismatch")

        request_digest = _issuance_request_digest(request, principal)
        now = self._current_time()
        retained = self._store.load(request.workspace_id, request.site_id, request.command_id)
        if retained is not None:
            if retained.request_digest != request_digest:
                _fail("command_reused")
            verified = self._validate_retained(
                retained=retained,
                principal=principal,
                authority=authority,
                request=request,
                request_digest=request_digest,
                now=now,
            )
            return LeaseIssueResult(
                lease=verified.lease, audit=verified.audit, replayed=True
            )

        issued = now
        expires = issued + timedelta(seconds=request.valid_for_seconds)
        unsigned = {
            "protocolVersion": PROTOCOL_VERSION,
            "leaseId": f"lease-{request_digest[:32]}",
            "workspaceId": request.workspace_id,
            "siteId": request.site_id,
            "actorId": request.actor_id,
            "role": request.role,
            "capabilities": list(request.capabilities),
            "deviceId": request.device_id,
            "sessionGeneration": member.session_generation,
            "revocationGeneration": authority.revocation_generation,
            "issuedAt": _timestamp(issued),
            "expiresAt": _timestamp(expires),
            "issuerKeyId": self._signer.key_id,
        }
        payload_digest = digest(unsigned)
        signing_bytes = canonical_json(unsigned).encode("utf-8")
        signature = _signature(self._signer.sign(signing_bytes))
        if _signature(self._signer.sign(signing_bytes)) != signature:
            _fail("signature_nondeterministic")
        try:
            Ed25519PublicKey.from_public_bytes(self._public_key_bytes).verify(
                base64.b64decode(signature + "==", altchars=b"-_", validate=True),
                signing_bytes,
            )
        except (InvalidSignature, ValueError):
            _fail("signature_invalid")
        lease = {**unsigned, "payloadDigest": payload_digest, "signature": signature}
        audit_without_digest = {
            "contract": LEASE_AUDIT_CONTRACT,
            "commandId": request.command_id,
            "requestDigest": request_digest,
            "leaseId": lease["leaseId"],
            "workspaceId": request.workspace_id,
            "siteId": request.site_id,
            "ownerActorId": principal.actor_id,
            "actorId": request.actor_id,
            "role": request.role,
            "capabilities": list(request.capabilities),
            "deviceId": request.device_id,
            "sessionGeneration": member.session_generation,
            "revocationGeneration": authority.revocation_generation,
            "issuedAt": unsigned["issuedAt"],
            "expiresAt": unsigned["expiresAt"],
            "issuerKeyId": self._signer.key_id,
            "leaseDigest": payload_digest,
        }
        audit = {**audit_without_digest, "auditDigest": digest(audit_without_digest)}
        recorded, replayed = self._store.append(
            request.workspace_id,
            request.site_id,
            request.command_id,
            RetainedLeaseIssuance(request_digest=request_digest, lease=lease, audit=audit),
        )
        verified = self._validate_retained(
            retained=recorded,
            principal=principal,
            authority=authority,
            request=request,
            request_digest=request_digest,
            now=now,
        )
        return LeaseIssueResult(
            lease=verified.lease, audit=verified.audit, replayed=replayed
        )

    def _current_time(self) -> datetime:
        value = self._now()
        if not isinstance(value, datetime) or value.tzinfo is None:
            _fail("clock_invalid")
        return value.astimezone(timezone.utc)

    def _validate_retained(
        self,
        *,
        retained: RetainedLeaseIssuance,
        principal: AuthenticatedOwnerSession,
        authority: SiteAuthority,
        request: LeaseIssueRequest,
        request_digest: str,
        now: datetime,
    ) -> RetainedLeaseIssuance:
        """Treat every store return as untrusted and reconstruct its authority."""

        if not isinstance(retained, RetainedLeaseIssuance):
            _fail("retained_shape_invalid")
        if retained.request_digest != request_digest or not _DIGEST.fullmatch(
            retained.request_digest
        ):
            _fail("retained_request_mismatch")
        if not isinstance(retained.lease, Mapping) or set(retained.lease) != _LEASE_KEYS:
            _fail("retained_lease_shape_invalid")
        if not isinstance(retained.audit, Mapping) or set(retained.audit) != _AUDIT_KEYS:
            _fail("retained_audit_shape_invalid")
        lease = dict(retained.lease)
        audit = dict(retained.audit)
        expected_lease_values = {
            "protocolVersion": PROTOCOL_VERSION,
            "leaseId": f"lease-{request_digest[:32]}",
            "workspaceId": request.workspace_id,
            "siteId": request.site_id,
            "actorId": request.actor_id,
            "role": request.role,
            "capabilities": list(request.capabilities),
            "deviceId": request.device_id,
            "sessionGeneration": authority.members[request.actor_id].session_generation,
            "revocationGeneration": authority.revocation_generation,
            "issuerKeyId": self._signer.key_id,
        }
        if (
            lease.get("sessionGeneration") != expected_lease_values["sessionGeneration"]
            or lease.get("revocationGeneration")
            != expected_lease_values["revocationGeneration"]
        ):
            _fail("replay_authority_changed")
        if any(lease.get(key) != value for key, value in expected_lease_values.items()):
            _fail("retained_lease_binding_invalid")
        issued = _parse_timestamp(lease["issuedAt"], "retained_lease_time_invalid")
        expires = _parse_timestamp(lease["expiresAt"], "retained_lease_time_invalid")
        if (
            issued > now
            or expires <= now
            or expires <= issued
            or expires - issued > timedelta(seconds=MAXIMUM_LEASE_SECONDS)
            or expires - issued != timedelta(seconds=request.valid_for_seconds)
        ):
            _fail("retained_lease_time_invalid")
        unsigned = {key: lease[key] for key in _LEASE_KEYS - {"payloadDigest", "signature"}}
        if (
            not isinstance(lease["payloadDigest"], str)
            or not _DIGEST.fullmatch(lease["payloadDigest"])
            or digest(unsigned) != lease["payloadDigest"]
        ):
            _fail("retained_lease_digest_invalid")
        signature = _signature(lease["signature"])
        try:
            Ed25519PublicKey.from_public_bytes(self._public_key_bytes).verify(
                base64.b64decode(signature + "==", altchars=b"-_", validate=True),
                canonical_json(unsigned).encode("utf-8"),
            )
        except (InvalidSignature, ValueError):
            _fail("retained_lease_signature_invalid")

        expected_audit_values = {
            "contract": LEASE_AUDIT_CONTRACT,
            "commandId": request.command_id,
            "requestDigest": request_digest,
            "leaseId": lease["leaseId"],
            "workspaceId": request.workspace_id,
            "siteId": request.site_id,
            "ownerActorId": principal.actor_id,
            "actorId": request.actor_id,
            "role": request.role,
            "capabilities": list(request.capabilities),
            "deviceId": request.device_id,
            "sessionGeneration": lease["sessionGeneration"],
            "revocationGeneration": lease["revocationGeneration"],
            "issuedAt": lease["issuedAt"],
            "expiresAt": lease["expiresAt"],
            "issuerKeyId": lease["issuerKeyId"],
            "leaseDigest": lease["payloadDigest"],
        }
        if any(audit.get(key) != value for key, value in expected_audit_values.items()):
            _fail("retained_audit_binding_invalid")
        audit_without_digest = {
            key: audit[key] for key in _AUDIT_KEYS - {"auditDigest"}
        }
        if (
            not isinstance(audit["auditDigest"], str)
            or not _DIGEST.fullmatch(audit["auditDigest"])
            or digest(audit_without_digest) != audit["auditDigest"]
        ):
            _fail("retained_audit_digest_invalid")
        return _copy_retained(
            RetainedLeaseIssuance(
                request_digest=request_digest,
                lease=lease,
                audit=audit,
            )
        )
