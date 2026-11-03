"""Default-off server validator for native connected-site v35 cloud proofs.

The validator deliberately owns no HTTP route and has no production key
configuration.  A caller must inject reviewed site/device/issuer authority and
explicitly enable it.  Canonical command and lease bytes are reparsed and both
Ed25519 signatures are verified; coordinator-authored columns are never
trusted as authority.
"""

from __future__ import annotations

import base64
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re
from threading import Lock
from typing import Any, Mapping, Sequence

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


PROOF_CONTRACT = "supermega.shop.connected-site-cloud-proof.v1"
PROTOCOL_VERSION = 1
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$")
_SIGNATURE = re.compile(r"^[A-Za-z0-9_-]{86}$")
_COMMAND_POLICY = {
    "retail.stock.reserve.v1": ("counterSale", "retailCart", "shop.connected_stock.reserved.v1", "shop.connected_stock.reserve"),
    "retail.stock.release.v1": ("counterSale", "retailCart", "shop.connected_stock.released.v1", "shop.connected_stock.release"),
    "cafe.stock.reserve.v1": ("cafeOrderWrite", "cafeOrder", "shop.connected_stock.reserved.v1", "shop.connected_stock.reserve"),
    "cafe.stock.release.v1": ("cafeOrderWrite", "cafeOrder", "shop.connected_stock.released.v1", "shop.connected_stock.release"),
    "cafe.order.put.v1": ("cafeOrderWrite", "cafeOrder", "shop.cafe_order.put.v1", "shop.cafe_order.put"),
    "cafe.order.state.v1": ("cafeOrderWrite", "cafeOrder", "shop.cafe_order.state.v1", "shop.cafe_order.state"),
    "cafe.order.cancel.v1": ("cafeOrderWrite", "cafeOrder", "shop.cafe_order.cancel.v1", "shop.cafe_order.cancel"),
    "cafe.kitchen.status.v1": ("cafeKitchenStatus", "cafeOrder", "shop.cafe_kitchen.status.v1", "shop.cafe_kitchen.status"),
}


class ConnectedSiteV15Error(ValueError):
    """A stable fail-closed connected-site rejection."""


def _fail(reason: str) -> None:
    raise ConnectedSiteV15Error(f"connected_site_{reason}")


def canonical_json(value: Any) -> str:
    def normalize(item: Any) -> Any:
        if item is None or isinstance(item, (bool, str, int)):
            return item
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, dict) and all(isinstance(key, str) for key in item):
            return {key: normalize(item[key]) for key in sorted(item)}
        _fail("canonical_value")

    return json.dumps(normalize(value), ensure_ascii=False, separators=(",", ":"))


def digest(value: Any) -> str:
    return sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _upload_batch_digest(authority: "SiteAuthority", device_id: str, after_cursor: int,
                         validated: Sequence[tuple["UploadEvent", Mapping[str, Any]]]) -> str:
    return digest({
        "contract": "supermega.connected-site-upload-batch.v1",
        "workspaceId": authority.workspace_id, "siteId": authority.site_id,
        "deviceId": device_id, "afterCursor": after_cursor,
        "events": [{"cursor": upload.cursor, "commandId": upload.command_id,
                    "commandDigest": upload.command_digest, "eventDigest": upload.event_digest,
                    "event": upload.event, "cloudProof": upload.cloud_proof}
                   for upload, _ in validated],
    })


def _exact(value: Any, keys: set[str], reason: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        _fail(reason)
    return value


def _identifier(value: Any, reason: str) -> str:
    if not isinstance(value, str) or not _IDENTIFIER.fullmatch(value):
        _fail(reason)
    return value


def _digest(value: Any, reason: str) -> str:
    if not isinstance(value, str) or not _DIGEST.fullmatch(value):
        _fail(reason)
    return value


def _time(value: Any, reason: str) -> datetime:
    if not isinstance(value, str) or not value.endswith("Z"):
        _fail(reason)
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        _fail(reason)
    if parsed.tzinfo != timezone.utc:
        _fail(reason)
    return parsed


def _utc_millis(value: datetime) -> str:
    if value.tzinfo is None:
        _fail("database_timestamp_timezone")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _decode(value: str, length: int, reason: str) -> bytes:
    if not isinstance(value, str) or "=" in value:
        _fail(reason)
    try:
        decoded = base64.b64decode(
            value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
        )
    except (ValueError, TypeError):
        _fail(reason)
    if len(decoded) != length or base64.urlsafe_b64encode(decoded).decode().rstrip("=") != value:
        _fail(reason)
    return decoded


def _verify(key: str, signature: Any, message: bytes, reason: str) -> None:
    if not isinstance(signature, str) or not _SIGNATURE.fullmatch(signature):
        _fail(reason)
    try:
        Ed25519PublicKey.from_public_bytes(_decode(key, 32, reason)).verify(
            _decode(signature, 64, reason), message
        )
    except (InvalidSignature, ValueError):
        _fail(reason)


@dataclass(frozen=True, slots=True)
class DeviceAuthority:
    device_id: str
    signing_key_id: str
    public_key: str
    client_fingerprint: str
    enrollment_evidence_digest: str
    coordinator_binding_digest: str
    session_generation: int
    active: bool = True

    def __post_init__(self) -> None:
        _identifier(self.device_id, "authority_device")
        _identifier(self.signing_key_id, "authority_device_key")
        _decode(self.public_key, 32, "authority_device_key")
        for value in (self.client_fingerprint, self.enrollment_evidence_digest, self.coordinator_binding_digest):
            _digest(value, "authority_device_digest")
        if type(self.session_generation) is not int or self.session_generation < 1:
            _fail("authority_device_generation")


@dataclass(frozen=True, slots=True)
class CurrentMember:
    actor_id: str
    role: str
    capabilities: tuple[str, ...]
    session_generation: int

    def __post_init__(self) -> None:
        _identifier(self.actor_id, "authority_actor")
        _identifier(self.role, "authority_role")
        if not self.capabilities or tuple(sorted(set(self.capabilities))) != self.capabilities:
            _fail("authority_capabilities")
        if type(self.session_generation) is not int or self.session_generation < 1:
            _fail("authority_session_generation")


@dataclass(frozen=True, slots=True)
class SiteAuthority:
    workspace_id: str
    site_id: str
    authority_generation: int
    configuration_generation: int
    revocation_generation: int
    authority_payload_digest: str
    issuer_keys: Mapping[str, str]
    devices: Mapping[str, DeviceAuthority]
    members: Mapping[str, CurrentMember]
    authority_payload: Mapping[str, Any]
    authority_signature: str
    authority_issuer_keys: Mapping[str, str]
    authority_checkpoints: Mapping[str, tuple[Mapping[str, Any], str]] = field(
        default_factory=dict
    )
    enabled: bool = False

    def __post_init__(self) -> None:
        _identifier(self.workspace_id, "authority_workspace")
        _identifier(self.site_id, "authority_site")
        generations = (self.authority_generation, self.configuration_generation, self.revocation_generation)
        if any(type(value) is not int for value in generations) or self.authority_generation < 1 or self.configuration_generation < 1 or self.revocation_generation < 0:
            _fail("authority_generation")
        payload = dict(self.authority_payload)
        if digest(payload) != _digest(self.authority_payload_digest, "authority_payload_digest"):
            _fail("authority_payload_digest")
        unsigned = dict(payload)
        if unsigned.pop("payloadDigest", None) != digest(unsigned):
            _fail("authority_inner_digest")
        if (payload.get("schemaId") != "ConnectedSiteAuthorityPayloadV1" or
            payload.get("protocolVersion") != PROTOCOL_VERSION or
            payload.get("workspaceId") != self.workspace_id or
            payload.get("siteId") != self.site_id or
            payload.get("authoritySequence") != self.authority_generation):
            _fail("authority_payload_scope")
        membership = payload.get("membershipSnapshot")
        configuration = payload.get("configurationSnapshot")
        if (not isinstance(membership, dict) or membership.get("revocationGeneration") != self.revocation_generation or
            not isinstance(configuration, dict) or configuration.get("configurationVersion") != self.configuration_generation):
            _fail("authority_payload_generation")
        expected_members = [{"actorId": member.actor_id, "role": member.role,
            "capabilities": list(member.capabilities), "sessionGeneration": member.session_generation}
            for member in sorted(self.members.values(), key=lambda item: item.actor_id)]
        if membership.get("members") != expected_members:
            _fail("authority_membership")
        if any(key != member.actor_id for key, member in self.members.items()):
            _fail("authority_member_index")
        if any(key != device.device_id for key, device in self.devices.items()):
            _fail("authority_device_index")
        issuer_key = self.authority_issuer_keys.get(payload.get("issuerKeyId"))
        if issuer_key is None:
            _fail("authority_issuer")
        _verify(issuer_key, self.authority_signature, canonical_json(payload).encode(), "authority_signature")
        for device_id, evidence in self.authority_checkpoints.items():
            if device_id not in self.devices or not isinstance(evidence, tuple) or len(evidence) != 2:
                _fail("authority_checkpoint_device")
            checkpoint, checkpoint_signature = evidence
            if not isinstance(checkpoint, Mapping):
                _fail("authority_checkpoint_shape")
            checkpoint = dict(checkpoint)
            expected_keys = {
                "schemaId", "protocolVersion", "workspaceId", "siteId",
                "deviceId", "issuedAtMillis", "issuerKeyId",
                "firstAuthoritySequence", "lastAuthoritySequence", "payloads",
                "chainDigest", "checkpointDigest",
            }
            if set(checkpoint) != expected_keys:
                _fail("authority_checkpoint_shape")
            unsigned_checkpoint = dict(checkpoint)
            checkpoint_digest = unsigned_checkpoint.pop("checkpointDigest", None)
            if (
                checkpoint.get("schemaId") != "ConnectedSiteAuthorityCheckpointV1"
                or checkpoint.get("protocolVersion") != PROTOCOL_VERSION
                or checkpoint.get("workspaceId") != self.workspace_id
                or checkpoint.get("siteId") != self.site_id
                or checkpoint.get("deviceId") != device_id
                or checkpoint.get("firstAuthoritySequence") != 1
                or checkpoint.get("lastAuthoritySequence") != self.authority_generation
                or checkpoint_digest != digest(unsigned_checkpoint)
            ):
                _fail("authority_checkpoint_binding")
            entries = checkpoint.get("payloads")
            if not isinstance(entries, list) or len(entries) != self.authority_generation or not entries:
                _fail("authority_checkpoint_chain")
            chain_bindings: list[dict[str, Any]] = []
            previous: str | None = None
            current_payload: Mapping[str, Any] | None = None
            current_signature: str | None = None
            for sequence, entry in enumerate(entries, 1):
                if not isinstance(entry, dict) or set(entry) != {"canonicalPayloadBytes", "signature"}:
                    _fail("authority_checkpoint_chain")
                payload_bytes = entry.get("canonicalPayloadBytes")
                payload_signature = entry.get("signature")
                if not isinstance(payload_bytes, str) or not isinstance(payload_signature, str):
                    _fail("authority_checkpoint_chain")
                try:
                    chained_payload = json.loads(payload_bytes)
                except (TypeError, ValueError):
                    _fail("authority_checkpoint_chain")
                if (
                    not isinstance(chained_payload, dict)
                    or canonical_json(chained_payload) != payload_bytes
                    or chained_payload.get("workspaceId") != self.workspace_id
                    or chained_payload.get("siteId") != self.site_id
                    or chained_payload.get("authoritySequence") != sequence
                    or chained_payload.get("previousAuthorityDigest") != previous
                ):
                    _fail("authority_checkpoint_chain")
                payload_unsigned = dict(chained_payload)
                inner_digest = payload_unsigned.pop("payloadDigest", None)
                if inner_digest != digest(payload_unsigned):
                    _fail("authority_checkpoint_chain")
                payload_issuer = self.authority_issuer_keys.get(chained_payload.get("issuerKeyId"))
                if payload_issuer is None:
                    _fail("authority_checkpoint_issuer")
                _verify(payload_issuer, payload_signature, payload_bytes.encode(), "authority_checkpoint_payload_signature")
                previous = sha256(payload_bytes.encode()).hexdigest()
                chain_bindings.append({
                    "authoritySequence": sequence,
                    "payloadDigest": previous,
                    "signatureDigest": sha256(payload_signature.encode()).hexdigest(),
                })
                current_payload = chained_payload
                current_signature = payload_signature
            if (
                checkpoint.get("chainDigest") != digest(chain_bindings)
                or current_payload != payload
                or current_signature != self.authority_signature
            ):
                _fail("authority_checkpoint_current")
            checkpoint_issuer = self.authority_issuer_keys.get(checkpoint.get("issuerKeyId"))
            if checkpoint_issuer is None:
                _fail("authority_checkpoint_issuer")
            _verify(
                checkpoint_issuer,
                checkpoint_signature,
                canonical_json(checkpoint).encode(),
                "authority_checkpoint_signature",
            )
        for key_id, key in self.issuer_keys.items():
            _identifier(key_id, "lease_issuer")
            _decode(key, 32, "lease_issuer_key")


def verify_connected_site_lease(
    value: Any, authority: SiteAuthority, device: DeviceAuthority, now: datetime,
) -> dict[str, Any]:
    """Verify the same signed current lease for writes and future read proofs."""
    keys = {
        "protocolVersion", "leaseId", "workspaceId", "siteId", "actorId", "role",
        "capabilities", "deviceId", "sessionGeneration", "revocationGeneration",
        "issuedAt", "expiresAt", "issuerKeyId", "payloadDigest", "signature",
    }
    lease = _exact(value, keys, "lease_shape")
    if lease["protocolVersion"] != PROTOCOL_VERSION:
        _fail("protocol_version")
    if (type(lease["sessionGeneration"]) is not int
        or type(lease["revocationGeneration"]) is not int):
        _fail("lease_authority")
    for field in ("leaseId", "workspaceId", "siteId", "actorId", "role", "deviceId", "issuerKeyId"):
        _identifier(lease[field], f"lease_{field}")
    capabilities = lease["capabilities"]
    if not isinstance(capabilities, list) or not capabilities or capabilities != sorted(set(capabilities)):
        _fail("lease_capabilities")
    issued = _time(lease["issuedAt"], "lease_issued_at")
    expires = _time(lease["expiresAt"], "lease_expires_at")
    if expires <= issued or expires - issued > timedelta(days=7) or now < issued or now >= expires:
        _fail("lease_expired")
    if (
        lease["workspaceId"] != authority.workspace_id
        or lease["siteId"] != authority.site_id
        or lease["deviceId"] != device.device_id
        or lease["sessionGeneration"] != device.session_generation
        or lease["revocationGeneration"] != authority.revocation_generation
    ):
        _fail("lease_authority")
    unsigned = {key: lease[key] for key in keys - {"payloadDigest", "signature"}}
    if digest(unsigned) != lease["payloadDigest"]:
        _fail("lease_payload_digest")
    issuer = authority.issuer_keys.get(lease["issuerKeyId"])
    if issuer is None:
        _fail("lease_issuer")
    _verify(issuer, lease["signature"], canonical_json(unsigned).encode(), "lease_signature")
    return lease


@dataclass(frozen=True, slots=True)
class UploadEvent:
    cursor: int
    command_id: str
    command_digest: str
    event: Mapping[str, Any]
    event_digest: str
    cloud_proof: Mapping[str, Any]


@dataclass(frozen=True, slots=True)
class UploadDecision:
    command_id: str
    command_digest: str
    state: str
    canonical_version: int
    event_digest: str | None = None
    reason: str | None = None
    conflict: Mapping[str, Any] | None = None


@dataclass(slots=True)
class MemoryConnectedSiteRepository:
    """Deterministic test repository mirroring v15 uniqueness constraints."""

    commands: dict[tuple[str, str, str], tuple[str, UploadDecision]] = field(default_factory=dict)
    aggregate_versions: dict[tuple[str, str, str, str], int] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)
    event_heads: dict[tuple[str, str], tuple[int, str]] = field(default_factory=dict)
    conflicts: list[dict[str, Any]] = field(default_factory=list)
    upload_cursors: dict[tuple[str, str, str], int] = field(default_factory=dict)
    upload_batches: dict[tuple[str, str, str, int, int], str] = field(default_factory=dict)
    financial_records: dict[str, Any] = field(default_factory=dict)
    _apply_lock: Lock = field(default_factory=Lock, init=False, repr=False)

    def apply(
        self,
        *,
        authority: SiteAuthority,
        device_id: str,
        after_cursor: int,
        validated: Sequence[tuple[UploadEvent, Mapping[str, Any]]],
        observed_at: datetime,
    ) -> list[UploadDecision]:
        # Match the database transaction: failed batches have no partial effects.
        with self._apply_lock:
            staged = MemoryConnectedSiteRepository(
                commands=deepcopy(self.commands),
                aggregate_versions=deepcopy(self.aggregate_versions),
                events=deepcopy(self.events),
                event_heads=deepcopy(self.event_heads),
                conflicts=deepcopy(self.conflicts),
                upload_cursors=deepcopy(self.upload_cursors),
                upload_batches=deepcopy(self.upload_batches),
                financial_records=deepcopy(self.financial_records),
            )
            decisions = staged._apply_transaction(
                authority=authority, device_id=device_id, after_cursor=after_cursor,
                validated=validated, observed_at=observed_at,
            )
            self.commands = staged.commands
            self.aggregate_versions = staged.aggregate_versions
            self.events = staged.events
            self.event_heads = staged.event_heads
            self.conflicts = staged.conflicts
            self.upload_cursors = staged.upload_cursors
            self.upload_batches = staged.upload_batches
            self.financial_records = staged.financial_records
            return decisions

    def _apply_transaction(
        self, *, authority: SiteAuthority, device_id: str, after_cursor: int,
        validated: Sequence[tuple[UploadEvent, Mapping[str, Any]]], observed_at: datetime,
    ) -> list[UploadDecision]:
        cursor_key = (authority.workspace_id, authority.site_id, device_id)
        current_cursor = self.upload_cursors.get(cursor_key, 0)
        replay_only = current_cursor != after_cursor
        batch_key = (*cursor_key, after_cursor, validated[-1][0].cursor) if validated else None
        batch_digest = _upload_batch_digest(authority, device_id, after_cursor, validated) if validated else None
        if replay_only and (batch_key is None or self.upload_batches.get(batch_key) != batch_digest):
            _fail("upload_cursor_conflict")
        decisions: list[UploadDecision] = []
        for upload, command in validated:
            command_key = (authority.workspace_id, authority.site_id, upload.command_id)
            previous = self.commands.get(command_key)
            if replay_only and previous is None:
                _fail("replay_evidence_incomplete")
            if previous is not None:
                if previous[0] != upload.command_digest:
                    _fail("command_id_digest_conflict")
                accepted = previous[1]
                if accepted.state == "conflict":
                    decisions.append(accepted)
                    continue
                decisions.append(
                    UploadDecision(
                        command_id=upload.command_id,
                        command_digest=upload.command_digest,
                        state="replayed",
                        canonical_version=accepted.canonical_version,
                        event_digest=accepted.event_digest,
                    )
                )
                continue
            aggregate_key = (
                authority.workspace_id,
                authority.site_id,
                command["aggregateType"],
                command["aggregateId"],
            )
            current = self.aggregate_versions.get(aggregate_key, 0)
            if command["expectedVersion"] != current:
                conflict = {
                    "protocolVersion": 1,
                    "workspaceId": authority.workspace_id,
                    "siteId": authority.site_id,
                    "conflictId": f"conflict:{upload.command_id}",
                    "commandId": upload.command_id,
                    "commandDigest": upload.command_digest,
                    "aggregateType": command["aggregateType"],
                    "aggregateId": command["aggregateId"],
                    "expectedVersion": command["expectedVersion"],
                    "actualVersion": current,
                    "reason": "aggregate_version_conflict",
                    "createdAt": _utc_millis(observed_at),
                    "state": "quarantined",
                }
                decision = UploadDecision(
                    command_id=upload.command_id,
                    command_digest=upload.command_digest,
                    state="conflict",
                    canonical_version=current,
                    reason="aggregate_version_conflict",
                    conflict=conflict,
                )
                self.commands[command_key] = (upload.command_digest, decision)
                retained_conflict = dict(conflict)
                retained_conflict["financialRewritePermitted"] = False
                self.conflicts.append(retained_conflict)
                decisions.append(decision)
                continue
            next_version = current + 1
            decision = UploadDecision(
                command_id=upload.command_id,
                command_digest=upload.command_digest,
                state="accepted",
                canonical_version=next_version,
                event_digest=upload.event_digest,
            )
            chain_key = (authority.workspace_id, authority.site_id)
            previous_sequence, previous_event = self.event_heads.get(chain_key, (0, None))
            self.events.append(
                {
                    "workspaceId": authority.workspace_id,
                    "siteId": authority.site_id,
                    "sequence": previous_sequence + 1,
                    "previousEventDigest": previous_event,
                    "eventDigest": upload.event_digest,
                    "event": dict(upload.event),
                }
            )
            self.event_heads[chain_key] = (previous_sequence + 1, upload.event_digest)
            self.aggregate_versions[aggregate_key] = next_version
            self.commands[command_key] = (upload.command_digest, decision)
            decisions.append(decision)
        if validated and not replay_only:
            self.upload_cursors[cursor_key] = validated[-1][0].cursor
            self.upload_batches[batch_key] = batch_digest
        return decisions


class PostgresConnectedSiteRepository:
    """Atomic DB-API repository for the v15 private schema.

    The injected factory is the existing authenticated backend pool/factory;
    this module never reads a URL or credential.  Locking the site authority
    row serializes its event chain and aggregate version decisions.
    """

    def __init__(self, connection_factory: Any) -> None:
        self._connection_factory = connection_factory

    def apply(
        self,
        *,
        authority: SiteAuthority,
        device_id: str,
        after_cursor: int,
        validated: Sequence[tuple[UploadEvent, Mapping[str, Any]]],
        observed_at: datetime,
    ) -> list[UploadDecision]:
        decisions: list[UploadDecision] = []
        with self._connection_factory() as connection:
            if getattr(connection, "autocommit", None) is not False:
                _fail("postgres_transaction_required")
            with connection.cursor() as cursor:
                cursor.execute("select set_config('app.workspace_id', %s, true)", (authority.workspace_id,))
                cursor.execute("select set_config('app.site_id', %s, true)", (authority.site_id,))
                cursor.execute(
                    "select connected_enabled from app_private.connected_sites "
                    "where workspace_id=%s and site_id=%s for update",
                    (authority.workspace_id, authority.site_id),
                )
                site = cursor.fetchone()
                # Source schema deliberately permits only false, so this path
                # remains unreachable until a separately reviewed enablement
                # migration changes the database gate as well as runtime config.
                if site is None or site[0] is not True:
                    _fail("postgres_site_disabled")
                cursor.execute(
                    "select upload_cursor from app_private.connected_site_cursors "
                    "where workspace_id=%s and site_id=%s and device_id=%s for update",
                    (authority.workspace_id, authority.site_id, device_id),
                )
                row = cursor.fetchone()
                if row is None:
                    _fail("upload_cursor_conflict")
                replay_only = row[0] != after_cursor
                batch_digest = _upload_batch_digest(authority, device_id, after_cursor, validated) if validated else None
                if replay_only:
                    if not validated:
                        _fail("upload_cursor_conflict")
                    cursor.execute(
                        "select batch_digest from app_private.connected_site_upload_batches "
                        "where workspace_id=%s and site_id=%s and device_id=%s "
                        "and after_cursor=%s and next_cursor=%s",
                        (authority.workspace_id, authority.site_id, device_id,
                         after_cursor, validated[-1][0].cursor),
                    )
                    retained_batch = cursor.fetchone()
                    if retained_batch is None or retained_batch[0] != batch_digest:
                        _fail("upload_cursor_conflict")
                for upload, command in validated:
                    cursor.execute(
                        "select command_digest,state from app_private.connected_site_commands "
                        "where workspace_id=%s and site_id=%s and command_id=%s",
                        (authority.workspace_id, authority.site_id, upload.command_id),
                    )
                    prior = cursor.fetchone()
                    if replay_only and prior is None:
                        _fail("replay_evidence_incomplete")
                    if prior is not None:
                        if prior[0] != upload.command_digest:
                            _fail("command_id_digest_conflict")
                        cursor.execute(
                            "select ack_state,canonical_version,event_digest,reason from app_private.connected_site_acknowledgements "
                            "where workspace_id=%s and site_id=%s and command_id=%s",
                            (authority.workspace_id, authority.site_id, upload.command_id),
                        )
                        ack = cursor.fetchone()
                        if ack is None or ack[0] != prior[1]:
                            _fail("replay_evidence_incomplete")
                        if prior[1] == "conflict":
                            cursor.execute(
                                "select conflict_json,created_at from app_private.connected_site_conflicts "
                                "where workspace_id=%s and site_id=%s and command_id=%s",
                                (authority.workspace_id, authority.site_id, upload.command_id),
                            )
                            retained = cursor.fetchone()
                            if retained is None:
                                _fail("replay_conflict_evidence_incomplete")
                            retained_conflict = dict(retained[0])
                            retained_conflict["createdAt"] = _utc_millis(retained[1])
                            decisions.append(UploadDecision(upload.command_id, upload.command_digest, "conflict", ack[1], reason=ack[3], conflict=retained_conflict))
                        elif prior[1] == "accepted":
                            decisions.append(UploadDecision(upload.command_id, upload.command_digest, "replayed", ack[1], ack[2]))
                        else:
                            decisions.append(UploadDecision(upload.command_id, upload.command_digest, "denied", ack[1], reason=ack[3]))
                        continue
                    cursor.execute(
                        "select coalesce(max(aggregate_version),0) from app_private.connected_site_events "
                        "where workspace_id=%s and site_id=%s and aggregate_type=%s and aggregate_id=%s",
                        (authority.workspace_id, authority.site_id, command["aggregateType"], command["aggregateId"]),
                    )
                    canonical_version = cursor.fetchone()[0]
                    state = "accepted" if command["expectedVersion"] == canonical_version else "conflict"
                    proof = dict(upload.cloud_proof)
                    lease_id = (proof.get("lease") or proof.get("sourceProof", {}).get("lease"))["leaseId"]
                    cursor.execute(
                        "insert into app_private.connected_site_commands "
                        "(workspace_id,site_id,command_id,command_digest,command_json,proof_json,proof_digest,"
                        "actor_id,device_id,lease_id,aggregate_type,aggregate_id,expected_version,state) "
                        "values (%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,%s,%s,%s,%s,%s,%s)",
                        (authority.workspace_id, authority.site_id, upload.command_id, upload.command_digest,
                         canonical_json(command), canonical_json(proof), digest(proof), command["actorId"],
                         device_id, lease_id, command["aggregateType"], command["aggregateId"],
                         command["expectedVersion"], state),
                    )
                    if state == "conflict":
                        reason = "aggregate_version_conflict"
                        conflict_id = f"conflict:{upload.command_id}"
                        conflict = {"protocolVersion": 1,
                                    "workspaceId": authority.workspace_id,
                                    "siteId": authority.site_id,
                                    "conflictId": conflict_id,
                                    "commandId": upload.command_id,
                                    "commandDigest": upload.command_digest,
                                    "aggregateType": command["aggregateType"],
                                    "aggregateId": command["aggregateId"],
                                    "expectedVersion": command["expectedVersion"],
                                    "actualVersion": canonical_version,
                                    "reason": reason,
                                    "state": "quarantined"}
                        cursor.execute(
                            "insert into app_private.connected_site_conflicts "
                            "(workspace_id,site_id,conflict_id,command_id,command_digest,aggregate_type,aggregate_id,"
                            "expected_version,canonical_version,reason,conflict_json) "
                            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb) returning created_at",
                            (authority.workspace_id, authority.site_id, conflict_id, upload.command_id,
                             upload.command_digest, command["aggregateType"], command["aggregateId"],
                             command["expectedVersion"], canonical_version, reason, canonical_json(conflict)),
                        )
                        created_at = cursor.fetchone()[0]
                        conflict["createdAt"] = _utc_millis(created_at)
                        decision = UploadDecision(upload.command_id, upload.command_digest, "conflict", canonical_version, reason=reason, conflict=conflict)
                    else:
                        next_version = canonical_version + 1
                        cursor.execute(
                            "select coalesce(max(event_sequence),0),max(event_digest) filter (where event_sequence=(select max(event_sequence) from app_private.connected_site_events where workspace_id=%s and site_id=%s)) "
                            "from app_private.connected_site_events where workspace_id=%s and site_id=%s",
                            (authority.workspace_id, authority.site_id, authority.workspace_id, authority.site_id),
                        )
                        sequence, previous = cursor.fetchone()
                        cursor.execute(
                            "insert into app_private.connected_site_events "
                            "(workspace_id,site_id,event_sequence,event_id,event_digest,previous_event_digest,event_json,"
                            "command_id,command_digest,aggregate_type,aggregate_id,aggregate_version) "
                            "values (%s,%s,%s,%s,%s,%s,%s::jsonb,%s,%s,%s,%s,%s)",
                            (authority.workspace_id, authority.site_id, sequence + 1, upload.event["eventId"],
                             upload.event_digest, previous, canonical_json(upload.event), upload.command_id,
                             upload.command_digest, command["aggregateType"], command["aggregateId"], next_version),
                        )
                        decision = UploadDecision(upload.command_id, upload.command_digest, "accepted", next_version, upload.event_digest)
                    ack = {"commandId": decision.command_id, "commandDigest": decision.command_digest,
                           "state": decision.state, "canonicalVersion": decision.canonical_version,
                           "eventDigest": decision.event_digest, "reason": decision.reason}
                    cursor.execute(
                        "insert into app_private.connected_site_acknowledgements "
                        "(workspace_id,site_id,command_id,command_digest,ack_state,canonical_version,event_digest,reason,ack_json) "
                        "values (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)",
                        (authority.workspace_id, authority.site_id, decision.command_id, decision.command_digest,
                         decision.state, decision.canonical_version, decision.event_digest, decision.reason, canonical_json(ack)),
                    )
                    decisions.append(decision)
                if validated and not replay_only:
                    cursor.execute(
                        "update app_private.connected_site_cursors set upload_cursor=%s where workspace_id=%s and site_id=%s and device_id=%s",
                        (validated[-1][0].cursor, authority.workspace_id, authority.site_id, device_id),
                    )
                    cursor.execute(
                        "insert into app_private.connected_site_upload_batches "
                        "(workspace_id,site_id,device_id,after_cursor,next_cursor,batch_digest) "
                        "values (%s,%s,%s,%s,%s,%s)",
                        (authority.workspace_id, authority.site_id, device_id, after_cursor,
                         validated[-1][0].cursor, batch_digest),
                    )
        return decisions


class ConnectedSiteV15Adapter:
    def __init__(
        self,
        *,
        authorities: Mapping[tuple[str, str], SiteAuthority],
        repository: Any,
        runtime_enabled: bool = False,
    ) -> None:
        self._authorities = authorities
        self._repository = repository
        self._runtime_enabled = runtime_enabled

    def reconcile(
        self,
        *,
        workspace_id: str,
        site_id: str,
        device_id: str,
        session_generation: int,
        revocation_generation: int,
        after_cursor: int,
        events: Sequence[UploadEvent],
        now: datetime,
    ) -> list[UploadDecision]:
        if not self._runtime_enabled:
            _fail("server_adapter_disabled")
        authority = self._authorities.get((workspace_id, site_id))
        if authority is None or not authority.enabled:
            _fail("site_authority_unavailable")
        if (authority.workspace_id, authority.site_id) != (workspace_id, site_id):
            _fail("authority_scope")
        device = authority.devices.get(device_id)
        if device is None or not device.active or device.device_id != device_id:
            _fail("device_denied")
        if session_generation != device.session_generation:
            _fail("session_generation")
        if revocation_generation != authority.revocation_generation:
            _fail("revocation_generation")
        if now.tzinfo != timezone.utc:
            _fail("time_authority")
        expected_cursor = after_cursor
        validated: list[tuple[UploadEvent, Mapping[str, Any]]] = []
        for upload in events:
            expected_cursor += 1
            if upload.cursor != expected_cursor:
                _fail("event_order")
            command = self._validate_upload(
                authority=authority,
                device=device,
                upload=upload,
                now=now,
            )
            validated.append((upload, command))
        return self._repository.apply(
            authority=authority,
            device_id=device_id,
            after_cursor=after_cursor,
            validated=validated,
            observed_at=now,
        )

    def _validate_upload(
        self,
        *,
        authority: SiteAuthority,
        device: DeviceAuthority,
        upload: UploadEvent,
        now: datetime,
    ) -> Mapping[str, Any]:
        if digest(upload.event) != _digest(upload.event_digest, "event_digest"):
            _fail("event_digest_mismatch")
        if upload.cloud_proof.get("proofKind") == "coordinatorDerived":
            return self._validate_derived_upload(
                authority=authority, device=device, upload=upload, now=now
            )
        proof = _exact(
            dict(upload.cloud_proof),
            {
                "contract", "proofKind", "command", "commandBytesDigest",
                "lease", "leaseBytesDigest", "clientFingerprint",
                "enrollmentEvidenceDigest", "coordinatorBindingDigest",
                "authorityPayloadDigest", "eventBinding", "eventBindingDigest",
            },
            "proof_shape",
        )
        if proof["contract"] != PROOF_CONTRACT or proof["proofKind"] != "signedClientCommand":
            _fail("proof_kind")
        command, lease = self._validate_retained_signed_proof(
            proof=proof, authority=authority, device=device, now=now
        )
        if upload.command_id != command["commandId"] or upload.command_digest != digest(
            {key: command[key] for key in (
                "protocolVersion", "commandId", "workspaceId", "siteId", "actorId",
                "deviceId", "aggregateType", "aggregateId", "expectedVersion",
                "commandType", "payloadDigest", "leaseDigest", "issuedAt",
                "signingKeyId", "signatureAlgorithm",
            )}
        ):
            _fail("command_digest")
        binding = _exact(
            proof["eventBinding"],
            {"eventId", "eventType", "eventDigest", "capability", "auditAction", "commandType"},
            "event_binding_shape",
        )
        if digest(binding) != proof["eventBindingDigest"]:
            _fail("event_binding_digest")
        if (
            binding["eventId"] != upload.event.get("eventId")
            or binding["eventType"] != upload.event.get("eventType")
            or binding["eventDigest"] != upload.event_digest
            or binding["commandType"] != command["commandType"]
            or upload.event.get("workspaceId") != authority.workspace_id
            or upload.event.get("siteId") != authority.site_id
            or upload.event.get("aggregateType") != command["aggregateType"]
            or upload.event.get("aggregateId") != command["aggregateId"]
            or upload.event.get("aggregateVersion") != command["expectedVersion"] + 1
            or upload.event.get("occurredAt") != command["issuedAt"]
            or canonical_json(upload.event.get("payload")) != canonical_json(command["payload"])
        ):
            _fail("event_binding")
        return command

    def _validate_retained_signed_proof(
        self,
        *,
        proof: Mapping[str, Any],
        authority: SiteAuthority,
        device: DeviceAuthority,
        now: datetime,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        command = self._validate_command(proof["command"], device)
        lease = self._validate_lease(
            proof["lease"], authority, device, _time(command["issuedAt"], "command_issued_at")
        )
        if digest(command) != proof["commandBytesDigest"]:
            _fail("command_bytes_digest")
        if digest(lease) != proof["leaseBytesDigest"]:
            _fail("lease_bytes_digest")
        if command["leaseDigest"] != lease["payloadDigest"]:
            _fail("command_lease_binding")
        for field in ("workspaceId", "siteId", "actorId", "deviceId"):
            if command[field] != lease[field]:
                _fail("command_lease_scope")
        if (
            proof["clientFingerprint"] != device.client_fingerprint
            or proof["enrollmentEvidenceDigest"] != device.enrollment_evidence_digest
            or proof["coordinatorBindingDigest"] != device.coordinator_binding_digest
            or proof["authorityPayloadDigest"] != authority.authority_payload_digest
        ):
            _fail("retained_authority_binding")
        member = authority.members.get(command["actorId"])
        binding = proof["eventBinding"]
        command_policy = _COMMAND_POLICY.get(command["commandType"])
        if (
            member is None
            or member.role != lease["role"]
            or member.session_generation != lease["sessionGeneration"]
            or command_policy is None
            or command_policy[0] not in lease["capabilities"]
            or command_policy[0] not in member.capabilities
            or not isinstance(binding, dict)
            or binding.get("capability") != command_policy[0]
            or binding.get("eventType") != command_policy[2]
            or binding.get("auditAction") != command_policy[3]
            or command["aggregateType"] != command_policy[1]
        ):
            _fail("command_authority")
        if not isinstance(proof["eventBinding"], dict) or digest(proof["eventBinding"]) != proof["eventBindingDigest"]:
            _fail("event_binding_digest")
        return command, lease

    def _validate_derived_upload(
        self,
        *,
        authority: SiteAuthority,
        device: DeviceAuthority,
        upload: UploadEvent,
        now: datetime,
    ) -> Mapping[str, Any]:
        proof = _exact(
            dict(upload.cloud_proof),
            {
                "contract", "proofKind", "commandId", "commandDigest",
                "workspaceId", "siteId", "deviceId", "leaseDigest",
                "sourceProof", "sourceProofDigest", "derivation", "derivationDigest",
            },
            "derived_proof_shape",
        )
        if proof["contract"] != PROOF_CONTRACT or proof["proofKind"] != "coordinatorDerived":
            _fail("proof_kind")
        source = _exact(
            proof["sourceProof"],
            {
                "contract", "proofKind", "command", "commandBytesDigest",
                "lease", "leaseBytesDigest", "clientFingerprint",
                "enrollmentEvidenceDigest", "coordinatorBindingDigest",
                "authorityPayloadDigest", "eventBinding", "eventBindingDigest",
            },
            "source_proof_shape",
        )
        if source["contract"] != PROOF_CONTRACT or source["proofKind"] != "signedClientCommand":
            _fail("source_proof_kind")
        source_command, source_lease = self._validate_retained_signed_proof(
            proof=source, authority=authority, device=device, now=now
        )
        if digest(source) != proof["sourceProofDigest"]:
            _fail("source_proof_digest")
        for field, expected in (
            ("workspaceId", authority.workspace_id),
            ("siteId", authority.site_id),
            ("deviceId", device.device_id),
            ("leaseDigest", source_lease["payloadDigest"]),
        ):
            if proof[field] != expected:
                _fail("derived_scope")
        derivation = _exact(
            proof["derivation"],
            {
                "contract", "sourceCommandDigest", "sourceReservationDigest",
                "operationId", "reservationId", "transitionDigest", "state", "eventDigest",
            },
            "derivation_shape",
        )
        source_payload = _exact(
            source_command["payload"],
            {"contract", "reservation"},
            "source_reservation_payload_shape",
        )
        source_reservation = self._validate_reservation(source_payload["reservation"])
        expected_source_type = {
            "retailCart": "retail.stock.reserve.v1",
            "cafeOrder": "cafe.stock.reserve.v1",
        }.get(source_reservation["workflowType"])
        if (
            derivation["contract"] != "supermega.shop.connected-stock-terminal-derivation.v2"
            or source_payload["contract"] != "supermega.shop.connected-stock-reserve.v1"
            or source_command["commandType"] != expected_source_type
            or source_command["aggregateType"] != source_reservation["workflowType"]
            or source_command["aggregateId"] != source_reservation["subjectId"]
            or source_command["workspaceId"] != source_reservation["workspaceId"]
            or source_command["siteId"] != source_reservation["siteId"]
            or source_command["actorId"] != source_reservation["actorId"]
            or source_command["deviceId"] != source_reservation["deviceId"]
            or source_reservation["capability"]
            != _COMMAND_POLICY[source_command["commandType"]][0]
            or derivation["sourceCommandDigest"] != digest({
                key: source_command[key]
                for key in source_command
                if key not in {"payload", "signature"}
            })
            or derivation["sourceReservationDigest"] != source_reservation["reservationDigest"]
            or derivation["state"] not in {"expired", "committed"}
            or digest(derivation) != proof["derivationDigest"]
            or derivation["eventDigest"] != upload.event_digest
        ):
            _fail("derivation_binding")
        payload = _exact(
            upload.event.get("payload"),
            {"contract", "operationId", "reservationId", "beforeDigest", "afterDigest", "state", "transitionDigest", "transition"},
            "terminal_payload_shape",
        )
        if payload["contract"] != "supermega.shop.connected-stock-terminal.v1" or any(
            payload.get(field) != derivation[field]
            for field in ("operationId", "reservationId", "transitionDigest", "state")
        ):
            _fail("derivation_event_binding")
        transition = _exact(
            payload["transition"],
            {"schemaVersion", "before", "after", "transitionedAt", "reason", "saleBinding", "transitionDigest"},
            "terminal_transition_shape",
        )
        before = self._validate_reservation(transition["before"])
        after = self._validate_reservation(transition["after"])
        if canonical_json(before) != canonical_json(source_reservation):
            _fail("derived_source_reservation_binding")
        sale_binding = transition["saleBinding"]
        transition_unsigned = {
            "schemaVersion": transition["schemaVersion"],
            "beforeDigest": before["reservationDigest"],
            "afterDigest": after["reservationDigest"],
            "fromState": before["state"],
            "toState": after["state"],
            "transitionedAt": transition["transitionedAt"],
            "reason": transition["reason"],
            "saleBindingDigest": sale_binding.get("bindingDigest") if isinstance(sale_binding, dict) else None,
        }
        stable_fields = {"reservationId", "workspaceId", "siteId", "actorId", "deviceId", "workflowType",
                         "subjectId", "capability", "lines", "basketDigest", "issuedAt", "expiresAt"}
        state = payload["state"]
        expected_event_type = {
            "committed": "shop.connected_stock.committed.v1",
            "expired": "shop.connected_stock.expired.v1",
        }.get(state)
        identity_digest = digest({"reservationId": before["reservationId"],
                                  "transitionDigest": transition["transitionDigest"], "state": state})
        if (
            transition["schemaVersion"] != 1
            or transition["transitionDigest"] != digest(transition_unsigned)
            or payload["transitionDigest"] != transition["transitionDigest"]
            or payload["beforeDigest"] != before["reservationDigest"]
            or payload["afterDigest"] != after["reservationDigest"]
            or before["state"] != "held" or after["state"] != state
            or state not in {"committed", "expired"}
            or after["stateVersion"] != before["stateVersion"] + 1
            or any(before[field] != after[field] for field in stable_fields)
            or before["workspaceId"] != authority.workspace_id
            or before["siteId"] != authority.site_id
            or before["deviceId"] != device.device_id
            or before["actorId"] != source_command["actorId"]
            or upload.event.get("aggregateType") != before["workflowType"]
            or upload.event.get("aggregateId") != before["subjectId"]
            or upload.event.get("eventType") != expected_event_type
            or upload.event.get("occurredAt") != transition["transitionedAt"]
            or upload.event.get("eventId") != f"terminal-event:{identity_digest}"
            or upload.command_id != f"terminal:{identity_digest}"
        ):
            _fail("terminal_transition_binding")
        if (
            proof["commandId"] != upload.command_id
            or proof["commandDigest"] != upload.command_digest
            or upload.event.get("workspaceId") != authority.workspace_id
            or upload.event.get("siteId") != authority.site_id
            or not isinstance(upload.event.get("aggregateVersion"), int)
            or upload.event["aggregateVersion"] < 1
        ):
            _fail("derived_command_binding")
        derived_unsigned = {
            "contract": "supermega.shop.connected-stock-terminal-command.v1",
            "commandId": upload.command_id,
            "workspaceId": authority.workspace_id,
            "siteId": authority.site_id,
            "actorId": source_command["actorId"],
            "deviceId": device.device_id,
            "aggregateType": upload.event.get("aggregateType"),
            "aggregateId": upload.event.get("aggregateId"),
            "expectedVersion": upload.event["aggregateVersion"] - 1,
            "payloadDigest": digest(payload),
            "leaseDigest": source_lease["payloadDigest"],
        }
        if digest(derived_unsigned) != upload.command_digest:
            _fail("derived_command_digest")
        return {
            "commandId": upload.command_id,
            "workspaceId": authority.workspace_id,
            "siteId": authority.site_id,
            "actorId": source_command["actorId"],
            "deviceId": device.device_id,
            "aggregateType": upload.event["aggregateType"],
            "aggregateId": upload.event["aggregateId"],
            "expectedVersion": upload.event["aggregateVersion"] - 1,
            "commandType": "coordinator.derived",
            "payload": payload,
        }

    def _validate_reservation(self, value: Any) -> dict[str, Any]:
        reservation = _exact(
            value,
            {"schemaVersion", "reservationId", "workspaceId", "siteId", "actorId", "deviceId",
             "workflowType", "subjectId", "capability", "lines", "basketDigest", "issuedAt",
             "expiresAt", "state", "stateVersion", "reservationDigest"},
            "reservation_shape",
        )
        unsigned = dict(reservation)
        reservation_digest = unsigned.pop("reservationDigest")
        if reservation["schemaVersion"] != 1 or digest(unsigned) != reservation_digest:
            _fail("reservation_digest")
        if reservation["basketDigest"] != digest({"schemaVersion": 1, "lines": reservation["lines"]}):
            _fail("reservation_basket_digest")
        return reservation

    def _validate_command(self, value: Any, device: DeviceAuthority) -> dict[str, Any]:
        keys = {
            "protocolVersion", "commandId", "workspaceId", "siteId", "actorId",
            "deviceId", "aggregateType", "aggregateId", "expectedVersion",
            "commandType", "payload", "payloadDigest", "leaseDigest", "issuedAt",
            "signingKeyId", "signatureAlgorithm", "signature",
        }
        command = _exact(value, keys, "command_shape")
        if command["protocolVersion"] != PROTOCOL_VERSION:
            _fail("protocol_version")
        for field in ("commandId", "workspaceId", "siteId", "actorId", "deviceId", "aggregateType", "aggregateId", "commandType", "signingKeyId"):
            _identifier(command[field], f"command_{field}")
        if not isinstance(command["expectedVersion"], int) or command["expectedVersion"] < 0:
            _fail("command_version")
        if not isinstance(command["payload"], dict) or digest(command["payload"]) != command["payloadDigest"]:
            _fail("command_payload")
        if command["signingKeyId"] != device.signing_key_id or command["signatureAlgorithm"] != "ed25519":
            _fail("command_key")
        signing = {key: command[key] for key in keys - {"payload", "signature"}}
        _verify(device.public_key, command["signature"], canonical_json(signing).encode(), "command_signature")
        return command

    def _validate_lease(
        self, value: Any, authority: SiteAuthority, device: DeviceAuthority, now: datetime
    ) -> dict[str, Any]:
        return verify_connected_site_lease(value, authority, device, now)
