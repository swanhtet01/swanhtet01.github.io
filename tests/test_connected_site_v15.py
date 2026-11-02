from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import unittest

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from supermega_runtime.connected_site_v15 import (
    ConnectedSiteV15Adapter,
    ConnectedSiteV15Error,
    CurrentMember,
    DeviceAuthority,
    MemoryConnectedSiteRepository,
    SiteAuthority,
    UploadEvent,
    canonical_json,
    digest,
    _utc_millis,
)


NOW = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


class _Key:
    def __init__(self, seed: int) -> None:
        self.private = Ed25519PrivateKey.from_private_bytes(bytes([seed]) * 32)
        self.public = _encode(
            self.private.public_key().public_bytes(
                serialization.Encoding.Raw, serialization.PublicFormat.Raw
            )
        )

    def sign(self, value: dict) -> str:
        return _encode(self.private.sign(canonical_json(value).encode()))


ISSUER = _Key(3)
DEVICE_A = _Key(4)
DEVICE_B = _Key(5)


def _authority(
    workspace: str,
    site: str,
    device_id: str,
    key: _Key,
    *,
    authority_sequence: int = 1,
) -> SiteAuthority:
    device = DeviceAuthority(
        device_id=device_id,
        signing_key_id=f"key-{device_id}",
        public_key=key.public,
        client_fingerprint=digest({"device": device_id}),
        enrollment_evidence_digest=digest({"enrollment": device_id}),
        coordinator_binding_digest=digest({"coordinator": site}),
        session_generation=2,
    )
    member = CurrentMember("actor-1", "cashierCounter", ("counterSale",), 2)
    if authority_sequence not in (1, 4):
        raise ValueError("unsupported synthetic authority sequence")
    revocations = [3] if authority_sequence == 1 else [1, 1, 2, 3]
    configurations = [7] if authority_sequence == 1 else [4, 5, 6, 7]
    payload_entries: list[dict[str, str]] = []
    previous_authority_digest: str | None = None
    authority_payload: dict = {}
    authority_signature = ""
    for sequence, (revocation, configuration) in enumerate(
        zip(revocations, configurations, strict=True),
        1,
    ):
        authority_unsigned = {
            "schemaId": "ConnectedSiteAuthorityPayloadV1",
            "protocolVersion": 1,
            "authorityEventId": (
                f"authority-{workspace}-{site}"
                if authority_sequence == 1
                else f"authority-{workspace}-{site}-{sequence}"
            ),
            "authoritySequence": sequence,
            "previousAuthorityDigest": previous_authority_digest,
            "workspaceId": workspace,
            "siteId": site,
            "issuedAtMillis": 1793530800000 + sequence - 1,
            "issuerKeyId": "issuer-1",
            "membershipSnapshot": {
                "revocationGeneration": revocation,
                "members": [{"actorId": "actor-1", "role": "cashierCounter", "capabilities": ["counterSale"], "sessionGeneration": 2}],
            },
            "configurationSnapshot": {
                "configurationVersion": configuration,
                "businessProfile": {"schemaId": "profile-v1", "templateId": "retail", "templateVersion": 1},
                "catalogReference": {"catalogVersion": 1, "catalogDigest": digest({"catalog": site})},
            },
        }
        authority_payload = {
            **authority_unsigned,
            "payloadDigest": digest(authority_unsigned),
        }
        authority_signature = ISSUER.sign(authority_payload)
        canonical_payload = canonical_json(authority_payload)
        payload_entries.append({
            "canonicalPayloadBytes": canonical_payload,
            "signature": authority_signature,
        })
        previous_authority_digest = sha256(canonical_payload.encode()).hexdigest()
    checkpoint_unsigned = {
        "schemaId": "ConnectedSiteAuthorityCheckpointV1",
        "protocolVersion": 1,
        "workspaceId": workspace,
        "siteId": site,
        "deviceId": device_id,
        "issuedAtMillis": 1793534340000,
        "issuerKeyId": "issuer-1",
        "firstAuthoritySequence": 1,
        "lastAuthoritySequence": authority_sequence,
        "payloads": payload_entries,
        "chainDigest": digest([
            {
                "authoritySequence": sequence,
                "payloadDigest": sha256(
                    entry["canonicalPayloadBytes"].encode()
                ).hexdigest(),
                "signatureDigest": sha256(entry["signature"].encode()).hexdigest(),
            }
            for sequence, entry in enumerate(payload_entries, 1)
        ]),
    }
    checkpoint = {
        **checkpoint_unsigned,
        "checkpointDigest": digest(checkpoint_unsigned),
    }
    return SiteAuthority(
        workspace_id=workspace,
        site_id=site,
        authority_generation=authority_sequence,
        configuration_generation=7,
        revocation_generation=3,
        authority_payload_digest=digest(authority_payload),
        issuer_keys={"issuer-1": ISSUER.public},
        devices={device_id: device},
        members={"actor-1": member},
        authority_payload=authority_payload,
        authority_signature=authority_signature,
        authority_issuer_keys={"issuer-1": ISSUER.public},
        authority_checkpoints={device_id: (checkpoint, ISSUER.sign(checkpoint))},
        enabled=True,
    )


def _upload(
    authority: SiteAuthority,
    *,
    key: _Key,
    cursor: int = 1,
    command_id: str = "command-1",
    expected_version: int = 0,
    aggregate_id: str = "basket-1",
    issued_at: datetime = NOW,
    expires_at: datetime | None = None,
) -> UploadEvent:
    device = next(iter(authority.devices.values()))
    lease_unsigned = {
        "protocolVersion": 1,
        "leaseId": f"lease-{device.device_id}",
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "actorId": "actor-1",
        "role": "cashierCounter",
        "capabilities": ["counterSale"],
        "deviceId": device.device_id,
        "sessionGeneration": device.session_generation,
        "revocationGeneration": authority.revocation_generation,
        "issuedAt": (issued_at - timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
        "expiresAt": (expires_at or issued_at + timedelta(days=1)).isoformat().replace("+00:00", "Z"),
        "issuerKeyId": "issuer-1",
    }
    lease = {
        **lease_unsigned,
        "payloadDigest": digest(lease_unsigned),
        "signature": ISSUER.sign(lease_unsigned),
    }
    lines = [{"productId": "product-1", "quantity": 1}]
    reservation_unsigned = {
        "schemaVersion": 1,
        "reservationId": f"reservation:{command_id}",
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "actorId": "actor-1",
        "deviceId": device.device_id,
        "workflowType": "retailCart",
        "subjectId": aggregate_id,
        "capability": "counterSale",
        "lines": lines,
        "basketDigest": digest({"schemaVersion": 1, "lines": lines}),
        "issuedAt": issued_at.isoformat().replace("+00:00", "Z"),
        "expiresAt": (issued_at + timedelta(hours=2)).isoformat().replace("+00:00", "Z"),
        "state": "held",
        "stateVersion": 1,
    }
    reservation = {
        **reservation_unsigned,
        "reservationDigest": digest(reservation_unsigned),
    }
    payload = {
        "contract": "supermega.shop.connected-stock-reserve.v1",
        "reservation": reservation,
    }
    command_unsigned = {
        "protocolVersion": 1,
        "commandId": command_id,
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "actorId": "actor-1",
        "deviceId": device.device_id,
        "aggregateType": "retailCart",
        "aggregateId": aggregate_id,
        "expectedVersion": expected_version,
        "commandType": "retail.stock.reserve.v1",
        "payloadDigest": digest(payload),
        "leaseDigest": lease["payloadDigest"],
        "issuedAt": issued_at.isoformat().replace("+00:00", "Z"),
        "signingKeyId": device.signing_key_id,
        "signatureAlgorithm": "ed25519",
    }
    command = {**command_unsigned, "payload": payload, "signature": key.sign(command_unsigned)}
    command_digest = digest(command_unsigned)
    event = {
        "eventId": f"event:{digest({'commandId': command_id})}",
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "aggregateType": "retailCart",
        "aggregateId": aggregate_id,
        "aggregateVersion": expected_version + 1,
        "eventType": "shop.connected_stock.reserved.v1",
        "occurredAt": command_unsigned["issuedAt"],
        "payload": payload,
    }
    event_digest = digest(event)
    binding = {
        "eventId": event["eventId"],
        "eventType": "shop.connected_stock.reserved.v1",
        "eventDigest": event_digest,
        "capability": "counterSale",
        "auditAction": "shop.connected_stock.reserve",
        "commandType": "retail.stock.reserve.v1",
    }
    proof = {
        "contract": "supermega.shop.connected-site-cloud-proof.v1",
        "proofKind": "signedClientCommand",
        "command": command,
        "commandBytesDigest": digest(command),
        "lease": lease,
        "leaseBytesDigest": digest(lease),
        "clientFingerprint": device.client_fingerprint,
        "enrollmentEvidenceDigest": device.enrollment_evidence_digest,
        "coordinatorBindingDigest": device.coordinator_binding_digest,
        "authorityPayloadDigest": authority.authority_payload_digest,
        "eventBinding": binding,
        "eventBindingDigest": digest(binding),
    }
    return UploadEvent(cursor, command_id, command_digest, event, event_digest, proof)


def _derived_upload(
    authority: SiteAuthority,
    *,
    key: _Key,
    source: UploadEvent,
    reservation_changes: dict[str, object] | None = None,
) -> UploadEvent:
    source_command = source.cloud_proof["command"]
    source_reservation = source_command["payload"]["reservation"]
    reservation_unsigned = {
        key: value for key, value in source_reservation.items() if key != "reservationDigest"
    }
    reservation_unsigned.update(reservation_changes or {})
    if reservation_changes and "lines" in reservation_changes:
        reservation_unsigned["basketDigest"] = digest({
            "schemaVersion": 1,
            "lines": reservation_unsigned["lines"],
        })
    before = {**reservation_unsigned, "reservationDigest": digest(reservation_unsigned)}
    after_unsigned = {**reservation_unsigned, "state": "committed", "stateVersion": 2}
    after = {**after_unsigned, "reservationDigest": digest(after_unsigned)}
    sale_binding = {"bindingDigest": digest({"sale": 1})}
    transition_unsigned = {
        "schemaVersion": 1, "beforeDigest": before["reservationDigest"],
        "afterDigest": after["reservationDigest"], "fromState": "held", "toState": "committed",
        "transitionedAt": "2026-11-01T12:00:00.000Z", "reason": "sale_committed",
        "saleBindingDigest": sale_binding["bindingDigest"],
    }
    transition_digest = digest(transition_unsigned)
    transition = {
        "schemaVersion": 1, "before": before, "after": after,
        "transitionedAt": transition_unsigned["transitionedAt"], "reason": "sale_committed",
        "saleBinding": sale_binding, "transitionDigest": transition_digest,
    }
    payload = {
        "contract": "supermega.shop.connected-stock-terminal.v1",
        "operationId": "operation-1",
        "reservationId": before["reservationId"],
        "beforeDigest": before["reservationDigest"],
        "afterDigest": after["reservationDigest"],
        "transitionDigest": transition_digest,
        "state": "committed",
        "transition": transition,
    }
    identity = digest({"reservationId": before["reservationId"], "transitionDigest": transition_digest, "state": "committed"})
    command_id = f"terminal:{identity}"
    event = {
        "eventId": f"terminal-event:{identity}",
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "aggregateType": "retailCart",
        "aggregateId": before["subjectId"],
        "aggregateVersion": 2,
        "eventType": "shop.connected_stock.committed.v1",
        "occurredAt": transition_unsigned["transitionedAt"],
        "payload": payload,
    }
    event_digest = digest(event)
    command_unsigned = {
        "contract": "supermega.shop.connected-stock-terminal-command.v1",
        "commandId": command_id,
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "actorId": source_command["actorId"],
        "deviceId": source_command["deviceId"],
        "aggregateType": "retailCart",
        "aggregateId": before["subjectId"],
        "expectedVersion": 1,
        "payloadDigest": digest(payload),
        "leaseDigest": source_command["leaseDigest"],
    }
    command_digest = digest(command_unsigned)
    derivation = {
        "contract": "supermega.shop.connected-stock-terminal-derivation.v2",
        "sourceCommandDigest": source.command_digest,
        "sourceReservationDigest": source_reservation["reservationDigest"],
        "operationId": payload["operationId"],
        "reservationId": payload["reservationId"],
        "transitionDigest": payload["transitionDigest"],
        "state": payload["state"],
        "eventDigest": event_digest,
    }
    proof = {
        "contract": "supermega.shop.connected-site-cloud-proof.v1",
        "proofKind": "coordinatorDerived",
        "commandId": command_id,
        "commandDigest": command_digest,
        "workspaceId": authority.workspace_id,
        "siteId": authority.site_id,
        "deviceId": source_command["deviceId"],
        "leaseDigest": source_command["leaseDigest"],
        "sourceProof": source.cloud_proof,
        "sourceProofDigest": digest(source.cloud_proof),
        "derivation": derivation,
        "derivationDigest": digest(derivation),
    }
    return UploadEvent(2, command_id, command_digest, event, event_digest, proof)


class ConnectedSiteV15Tests(unittest.TestCase):
    def test_database_conflict_timestamp_is_canonical_utc(self) -> None:
        local = datetime(
            2026,
            11,
            1,
            18,
            30,
            0,
            123000,
            tzinfo=timezone(timedelta(hours=6, minutes=30)),
        )
        self.assertEqual(_utc_millis(local), "2026-11-01T12:00:00.123Z")
        with self.assertRaisesRegex(
            ConnectedSiteV15Error,
            "database_timestamp_timezone",
        ):
            _utc_millis(datetime(2026, 11, 1, 12))

    def setUp(self) -> None:
        self.a = _authority("workspace-a", "site-a", "device-a", DEVICE_A)
        self.b = _authority("workspace-b", "site-b", "device-b", DEVICE_B)
        self.repository = MemoryConnectedSiteRepository(financial_records={"sale-legacy": {"totalMmk": 900}})
        self.adapter = ConnectedSiteV15Adapter(
            authorities={("workspace-a", "site-a"): self.a, ("workspace-b", "site-b"): self.b},
            repository=self.repository,
            runtime_enabled=True,
        )

    def _reconcile(self, authority: SiteAuthority, event: UploadEvent, *, after: int = 0):
        device = next(iter(authority.devices.values()))
        return self.adapter.reconcile(
            workspace_id=authority.workspace_id,
            site_id=authority.site_id,
            device_id=device.device_id,
            session_generation=device.session_generation,
            revocation_generation=authority.revocation_generation,
            after_cursor=after,
            events=[event],
            now=NOW,
        )

    def test_default_off_and_cross_tenant_site_device_fail_closed(self) -> None:
        off = ConnectedSiteV15Adapter(authorities={}, repository=self.repository)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "server_adapter_disabled"):
            off.reconcile(
                workspace_id="workspace-a", site_id="site-a", device_id="device-a",
                session_generation=2, revocation_generation=3, after_cursor=0,
                events=[], now=NOW,
            )
        event = _upload(self.a, key=DEVICE_A)
        for workspace, site, device in [
            ("workspace-b", "site-b", "device-b"),
            ("workspace-a", "site-b", "device-a"),
            ("workspace-a", "site-a", "device-b"),
        ]:
            with self.assertRaises(ConnectedSiteV15Error):
                self.adapter.reconcile(
                    workspace_id=workspace, site_id=site, device_id=device,
                    session_generation=2, revocation_generation=3, after_cursor=0,
                    events=[event], now=NOW,
                )

    def test_accept_replay_and_changed_digest_rejected(self) -> None:
        event = _upload(self.a, key=DEVICE_A)
        accepted = self._reconcile(self.a, event)[0]
        self.assertEqual((accepted.state, accepted.canonical_version), ("accepted", 1))
        replay = _upload(self.a, key=DEVICE_A, cursor=2)
        self.assertEqual(self._reconcile(self.a, replay, after=1)[0].state, "replayed")
        self.assertEqual(len(self.repository.events), 1)
        changed = _upload(self.a, key=DEVICE_A, cursor=3, command_id="command-1", aggregate_id="other")
        with self.assertRaisesRegex(ConnectedSiteV15Error, "command_id_digest_conflict"):
            self._reconcile(self.a, changed, after=2)

    def test_revoked_and_expired_leases_are_denied(self) -> None:
        expired = _upload(self.a, key=DEVICE_A, expires_at=NOW)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "lease_expired"):
            self._reconcile(self.a, expired)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "revocation_generation"):
            self.adapter.reconcile(
                workspace_id="workspace-a", site_id="site-a", device_id="device-a",
                session_generation=2, revocation_generation=2, after_cursor=0,
                events=[], now=NOW,
            )

    def test_upload_after_expiry_accepts_command_signed_inside_window(self) -> None:
        event = _upload(self.a, key=DEVICE_A, expires_at=NOW + timedelta(hours=1))
        result = self.adapter.reconcile(
            workspace_id="workspace-a", site_id="site-a", device_id="device-a",
            session_generation=2, revocation_generation=3, after_cursor=0,
            events=[event], now=NOW + timedelta(days=2),
        )[0]
        self.assertEqual(result.state, "accepted")

    def test_capability_and_current_authority_are_independently_enforced(self) -> None:
        event = _upload(self.a, key=DEVICE_A)
        proof = dict(event.cloud_proof)
        binding = dict(proof["eventBinding"])
        binding["capability"] = "owner"
        proof["eventBinding"] = binding
        proof["eventBindingDigest"] = digest(binding)
        altered = UploadEvent(1, event.command_id, event.command_digest, event.event, event.event_digest, proof)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "command_authority"):
            self._reconcile(self.a, altered)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "authority_signature"):
            SiteAuthority(
                workspace_id=self.a.workspace_id, site_id=self.a.site_id,
                authority_generation=self.a.authority_generation,
                configuration_generation=self.a.configuration_generation,
                revocation_generation=self.a.revocation_generation,
                authority_payload_digest=self.a.authority_payload_digest,
                issuer_keys=self.a.issuer_keys, devices=self.a.devices,
                members=self.a.members, authority_payload=self.a.authority_payload,
                authority_signature="A" * 86,
                authority_issuer_keys=self.a.authority_issuer_keys, enabled=True,
            )
        with self.assertRaisesRegex(ConnectedSiteV15Error, "authority_member_index"):
            SiteAuthority(
                workspace_id=self.a.workspace_id, site_id=self.a.site_id,
                authority_generation=self.a.authority_generation,
                configuration_generation=self.a.configuration_generation,
                revocation_generation=self.a.revocation_generation,
                authority_payload_digest=self.a.authority_payload_digest,
                issuer_keys=self.a.issuer_keys, devices=self.a.devices,
                members={"attacker": self.a.members["actor-1"]},
                authority_payload=self.a.authority_payload,
                authority_signature=self.a.authority_signature,
                authority_issuer_keys=self.a.authority_issuer_keys, enabled=True,
            )

    def test_ordered_chain_and_conflict_quarantine_never_rewrite_financials(self) -> None:
        before = dict(self.repository.financial_records)
        first = _upload(self.a, key=DEVICE_A)
        self._reconcile(self.a, first)
        conflict = _upload(
            self.a, key=DEVICE_A, cursor=2, command_id="command-2",
            expected_version=0, aggregate_id="basket-1",
        )
        result = self._reconcile(self.a, conflict, after=1)[0]
        self.assertEqual((result.state, result.reason), ("conflict", "aggregate_version_conflict"))
        self.assertFalse(self.repository.conflicts[0]["financialRewritePermitted"])
        self.assertEqual(self.repository.financial_records, before)
        retry = _upload(
            self.a, key=DEVICE_A, cursor=3, command_id="command-2",
            expected_version=0, aggregate_id="basket-1",
        )
        repeated = self._reconcile(self.a, retry, after=2)[0]
        self.assertEqual((repeated.state, repeated.reason), ("conflict", "aggregate_version_conflict"))
        self.assertEqual(len(self.repository.conflicts), 1)
        out_of_order = _upload(self.b, key=DEVICE_B, cursor=2)
        with self.assertRaisesRegex(ConnectedSiteV15Error, "event_order"):
            self._reconcile(self.b, out_of_order)

    def test_coordinator_derived_event_revalidates_signed_source_proof(self) -> None:
        source = _upload(self.a, key=DEVICE_A)
        self._reconcile(self.a, source)
        derived = _derived_upload(self.a, key=DEVICE_A, source=source)
        result = self._reconcile(self.a, derived, after=1)[0]
        self.assertEqual((result.state, result.canonical_version), ("accepted", 2))
        altered = dict(derived.cloud_proof)
        altered_source = dict(altered["sourceProof"])
        altered_source["authorityPayloadDigest"] = "0" * 64
        altered["sourceProof"] = altered_source
        bad = UploadEvent(3, "terminal-command-2", "1" * 64, derived.event, derived.event_digest, altered)
        with self.assertRaises(ConnectedSiteV15Error):
            self._reconcile(self.a, bad, after=2)

    def test_coordinator_derived_event_cannot_substitute_signed_reservation(self) -> None:
        source = _upload(self.a, key=DEVICE_A)
        self._reconcile(self.a, source)
        substitutions = {
            "reservation": {"reservationId": "reservation:attacker"},
            "subject": {"subjectId": "basket-attacker"},
            "lines": {"lines": [{"productId": "product-attacker", "quantity": 99}]},
            "workflow": {"workflowType": "cafeOrder"},
        }
        for label, changes in substitutions.items():
            with self.subTest(label=label):
                derived = _derived_upload(
                    self.a,
                    key=DEVICE_A,
                    source=source,
                    reservation_changes=changes,
                )
                with self.assertRaisesRegex(
                    ConnectedSiteV15Error,
                    "derived_source_reservation_binding",
                ):
                    self._reconcile(self.a, derived, after=1)

    def test_security_insufficient_v1_derivation_is_rejected(self) -> None:
        source = _upload(self.a, key=DEVICE_A)
        self._reconcile(self.a, source)
        derived = _derived_upload(self.a, key=DEVICE_A, source=source)
        proof = dict(derived.cloud_proof)
        derivation = dict(proof["derivation"])
        derivation["contract"] = (
            "supermega.shop.connected-stock-terminal-derivation.v1"
        )
        proof["derivation"] = derivation
        proof["derivationDigest"] = digest(derivation)
        legacy = UploadEvent(
            derived.cursor,
            derived.command_id,
            derived.command_digest,
            derived.event,
            derived.event_digest,
            proof,
        )
        with self.assertRaisesRegex(ConnectedSiteV15Error, "derivation_binding"):
            self._reconcile(self.a, legacy, after=1)


if __name__ == "__main__":
    unittest.main()
