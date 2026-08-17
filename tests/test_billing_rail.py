"""Offline conformance tests for the founder-gated billing rail (Gate 9).

Drives the REAL BillingLedger (supermega_runtime/billing_rail.py) through a
recording fake connection in the test_managed_activation.py style: only the
transport is replaced, every statement the ledger sends is captured, and the
fake emulates exactly the CAS semantics the v12 triggers enforce. The read-path
tests drive the real PostgresTrialStore.readiness through the
test_self_serve_store_schema_conformance.py recording-store pattern. No network,
no database, no credentials anywhere.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import patch

import supermega_runtime.trial_store as trial_store_module
from supermega_runtime.billing_rail import (
    BILLING_EVENT_RESULT_CONTRACT,
    BILLING_STATE_CONTRACT,
    INVOICE_PACKET_CONTRACT,
    MANAGED_BILLING_CONTRACT,
    PREMIUM_TIER,
    STATUS_LIFECYCLE,
    BillingLedger,
    BillingRailConflict,
    BillingRailError,
    _digest,
    validate_founder_evidence,
    validate_invoice_packet,
)
from supermega_runtime.trial_store import (
    PostgresTrialStore,
    TrialIdempotencyConflict,
    TrialPrincipal,
)


# OPS-762: no DSN-shaped literals in tests; assembled from parts.
DATABASE_URL = "://".join(("postgresql", "billing-rail-fixture"))
WORKSPACE_ID = "yangon-tyre-managed"
INVOICE_ID = "INV-TEST-0001"
NOW = datetime(2026, 8, 17, 4, 0, tzinfo=timezone.utc)
CAPTURED_AT = "2026-08-17T04:00:00.000Z"


def sample_invoice_core() -> dict[str, object]:
    # Test fixture only. These numbers are arbitrary test values, not prices:
    # real amounts exist only in founder-supplied configs (design section 7).
    return {
        "contract": MANAGED_BILLING_CONTRACT,
        "invoiceId": INVOICE_ID,
        "workspace": {"id": WORKSPACE_ID, "name": "Yangon Tyre Managed Workspace"},
        "customer": {"name": "Test Customer", "contact": "owner@example.test"},
        "period": {"label": "2026-08", "start": "2026-08-01", "end": "2026-08-31"},
        "lineItems": [
            {"description": "Managed workspace service period", "amountMinor": 120000},
            {"description": "Support window", "amountMinor": 5000},
        ],
        "tax": {"decided": False},
        "amount": {"currency": "MMK", "exponent": 0, "totalMinor": 125000},
        "paymentChannels": [
            {"category": "bank_transfer", "label": "Test Bank", "reference": "ACCT-000-TEST"},
            {"category": "mobile_money", "label": "Test Wallet", "reference": "09-0000-TEST"},
        ],
        "issuedToPayBy": {"issuedAt": "2026-08-01T03:30:00.000Z", "dueDate": "2026-08-15"},
        "issuer": {"name": "Super Mega Inc"},
    }


def sample_packet() -> dict[str, object]:
    core = sample_invoice_core()
    digest = _digest(core)
    return {
        "contract": INVOICE_PACKET_CONTRACT,
        "status": "draft",
        "statusLifecycle": deepcopy(STATUS_LIFECYCLE),
        "invoice": core,
        "invoiceDigest": digest,
        "configDigest": _digest({"fixture": "config-bytes"}),
        "proposedControlRecord": {
            "record_key": f"managed-billing-invoice:{WORKSPACE_ID}:{INVOICE_ID}",
            "record_type": "managed_billing_invoice",
            "tenant_id": WORKSPACE_ID,
            "status": "draft",
            "plan_hash": digest[len("sha256:"):],
            "note": "Proposal only. Every status transition needs an owner-approval proof.",
        },
        "controls": {
            "networkActivity": "none",
            "externalWritesPerformed": False,
            "founderActionRequired": True,
            "monetaryValuesFromConfigOnly": True,
            "pricingDecided": False,
            "taxDecided": False,
        },
    }


def founder_evidence(action_id: str, reference: str, reason: str = "Founder verified this transition.") -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": CAPTURED_AT,
        "actor": "Swan Htet",
        "reason": reason,
        "evidenceReference": reference,
    }


class FakeBillingDatabase:
    def __init__(self) -> None:
        self.invoices: dict[tuple[str, str], dict[str, object]] = {}
        self.entitlements: dict[str, dict[str, object]] = {}
        self.events: dict[tuple[str, str], dict[str, object]] = {}
        self.statements: list[tuple[str, tuple[object, ...]]] = []
        self.clock = NOW
        self.current_user = "postgres"
        self.provisioning_role_privileged = True
        self.runtime_role_denied = True
        self.schema_version = 12

    def connect(self, _database_url: str):
        return FakeBillingConnection(self)


class FakeBillingConnection:
    def __init__(self, database: FakeBillingDatabase) -> None:
        self.database = database
        self.closed = False
        self.snapshot = None

    def transaction(self):
        return self

    def cursor(self):
        return FakeBillingCursor(self.database)

    def __enter__(self):
        self.snapshot = (
            deepcopy(self.database.invoices),
            deepcopy(self.database.entitlements),
            deepcopy(self.database.events),
            self.database.clock,
        )
        return self

    def __exit__(self, exc_type, *_args):
        if exc_type is not None and self.snapshot is not None:
            (
                self.database.invoices,
                self.database.entitlements,
                self.database.events,
                self.database.clock,
            ) = self.snapshot
        return False

    def close(self):
        self.closed = True


class FakeBillingCursor:
    def __init__(self, database: FakeBillingDatabase) -> None:
        self.database = database
        self.rows: list[object] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def _read_only(self) -> bool:
        for sql, _params in reversed(self.database.statements):
            if sql.startswith("set transaction"):
                return "read only" in sql
        return False

    def execute(self, statement, params=()):
        sql = " ".join(str(statement).split()).lower()
        values = tuple(params)
        self.database.statements.append((sql, values))
        self.rows = []
        if "current_setting('server_version_num')" in sql:
            self.rows = [
                {
                    "server_version_num": 170006,
                    "current_user": self.database.current_user,
                    "transaction_read_only": self._read_only(),
                    "provisioning_role_privileged": self.database.provisioning_role_privileged,
                    "schema_version": self.database.schema_version,
                    "backend_role_safe": True,
                    "runtime_role_denied": self.database.runtime_role_denied,
                    "invoice_select": True,
                    "invoice_insert": True,
                    "invoice_update": True,
                    "event_select": True,
                    "event_insert": True,
                    "entitlement_select": True,
                    "entitlement_insert": True,
                    "entitlement_update": True,
                }
            ]
        elif "from app_private.billing_events" in sql and "count(*)" in sql:
            workspace_id = str(values[0])
            self.rows = [
                {
                    "event_count": sum(
                        1 for key in self.database.events if key[0] == workspace_id
                    )
                }
            ]
        elif "from app_private.billing_events" in sql and sql.startswith("select"):
            event = self.database.events.get((str(values[0]), str(values[1])))
            self.rows = [deepcopy(event)] if event else []
        elif "from app_private.billing_invoices" in sql and "order by invoice_id" in sql:
            workspace_id = str(values[0])
            self.rows = [
                deepcopy(row)
                for (row_workspace, _invoice), row in sorted(self.database.invoices.items())
                if row_workspace == workspace_id
            ]
        elif "from app_private.billing_invoices" in sql and "invoice_digest = %s" in sql:
            workspace_id, digest_hex = str(values[0]), str(values[1])
            self.rows = [
                deepcopy(row)
                for (row_workspace, _invoice), row in self.database.invoices.items()
                if row_workspace == workspace_id and row["invoice_digest"] == digest_hex
            ][:1]
        elif "from app_private.billing_invoices" in sql and sql.startswith("select"):
            row = self.database.invoices.get((str(values[0]), str(values[1])))
            self.rows = [deepcopy(row)] if row else []
        elif "from app_private.billing_entitlements" in sql and sql.startswith("select"):
            row = self.database.entitlements.get(str(values[0]))
            self.rows = [deepcopy(row)] if row else []
        elif sql.startswith("insert into app_private.billing_invoices"):
            workspace_id, invoice_id, digest_hex, payload = values
            self.database.clock += timedelta(seconds=1)
            self.database.invoices[(str(workspace_id), str(invoice_id))] = {
                "invoice_id": invoice_id,
                "status": "issued",
                "invoice_digest": digest_hex,
                "payload_json": payload,
                "revision": 1,
                "updated_at": self.database.clock,
            }
        elif sql.startswith("update app_private.billing_invoices"):
            next_status, next_revision, workspace_id, invoice_id, expected_revision = values
            row = self.database.invoices.get((str(workspace_id), str(invoice_id)))
            if (
                row is not None
                and row["status"] == "issued"
                and row["revision"] == expected_revision
            ):
                self.database.clock += timedelta(seconds=1)
                row["status"] = next_status
                row["revision"] = next_revision
                row["updated_at"] = self.database.clock
                self.rows = [{"updated_at": self.database.clock}]
        elif sql.startswith("insert into app_private.billing_entitlements"):
            workspace_id, tier = values
            self.database.clock += timedelta(seconds=1)
            self.database.entitlements[str(workspace_id)] = {
                "workspace_id": workspace_id,
                "tier": tier,
                "status": "none",
                "granted_event_id": None,
                "invoice_digest": None,
                "revision": 1,
                "updated_at": self.database.clock,
            }
        elif sql.startswith("update app_private.billing_entitlements") and "set status = 'granted'" in sql:
            command_id, digest_hex, next_revision, workspace_id, _tier, expected_revision = values
            row = self.database.entitlements.get(str(workspace_id))
            if (
                row is not None
                and row["status"] in {"none", "revoked"}
                and row["revision"] == expected_revision
            ):
                self.database.clock += timedelta(seconds=1)
                row["status"] = "granted"
                row["granted_event_id"] = command_id
                row["invoice_digest"] = digest_hex
                row["revision"] = next_revision
                row["updated_at"] = self.database.clock
                self.rows = [{"updated_at": self.database.clock}]
        elif sql.startswith("update app_private.billing_entitlements") and "set status = 'revoked'" in sql:
            next_revision, workspace_id, _tier, expected_revision = values
            row = self.database.entitlements.get(str(workspace_id))
            if (
                row is not None
                and row["status"] == "granted"
                and row["revision"] == expected_revision
            ):
                self.database.clock += timedelta(seconds=1)
                row["status"] = "revoked"
                row["granted_event_id"] = None
                row["invoice_digest"] = None
                row["revision"] = next_revision
                row["updated_at"] = self.database.clock
                self.rows = [{"updated_at": self.database.clock}]
        elif sql.startswith("insert into app_private.billing_events"):
            (
                event_id,
                workspace_id,
                command_id,
                fingerprint,
                event_type,
                actor_id,
                payload,
                result,
            ) = values
            self.database.clock += timedelta(seconds=1)
            self.database.events[(str(workspace_id), str(command_id))] = {
                "event_id": event_id,
                "command_fingerprint": fingerprint,
                "event_type": event_type,
                "actor_id": actor_id,
                "payload_json": payload,
                "result_json": result,
                "created_at": self.database.clock,
            }
            self.rows = [{"created_at": self.database.clock}]

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)


class BillingEvidenceValidationTests(unittest.TestCase):
    def test_exact_proof_shape_is_required(self) -> None:
        valid = founder_evidence("issue-0001", "viber:handover:2026-08-17")
        self.assertEqual(validate_founder_evidence(valid, "Test evidence"), valid)
        for label, mutate in (
            ("missing reason", lambda value: value.pop("reason")),
            ("extra field", lambda value: value.__setitem__("autoApproved", True)),
            ("blank actor", lambda value: value.__setitem__("actor", "  ")),
            ("control characters", lambda value: value.__setitem__("reason", "line\nbreak")),
            (
                "non-canonical timestamp",
                lambda value: value.__setitem__("capturedAt", "2026-08-17T04:00:00Z"),
            ),
            ("naive timestamp", lambda value: value.__setitem__("capturedAt", "2026-08-17T04:00:00.000")),
        ):
            with self.subTest(label=label):
                evidence = founder_evidence("issue-0001", "viber:handover:2026-08-17")
                mutate(evidence)
                with self.assertRaises(BillingRailError):
                    validate_founder_evidence(evidence, "Test evidence")


class InvoicePacketValidationTests(unittest.TestCase):
    def test_valid_packet_round_trips_with_its_digest(self) -> None:
        validated = validate_invoice_packet(sample_packet(), workspace_id=WORKSPACE_ID)
        self.assertEqual(validated["invoiceId"], INVOICE_ID)
        self.assertEqual(validated["workspaceId"], WORKSPACE_ID)
        self.assertEqual(validated["totalMinor"], 125000)
        self.assertEqual(validated["invoiceDigest"], _digest(sample_invoice_core()))

    def test_packet_rejections_fail_closed(self) -> None:
        def tampered_amount(packet):
            packet["invoice"]["amount"]["totalMinor"] = 999999
            packet["invoice"]["lineItems"][0]["amountMinor"] = 994999

        for label, mutate in (
            ("tampered amount breaks the seal", tampered_amount),
            ("missing amount", lambda packet: packet["invoice"].pop("amount")),
            (
                "float amount",
                lambda packet: packet["invoice"]["lineItems"][0].__setitem__("amountMinor", 120000.5),
            ),
            (
                "string amount",
                lambda packet: packet["invoice"]["amount"].__setitem__("totalMinor", "125000"),
            ),
            (
                "boolean amount",
                lambda packet: packet["invoice"]["amount"].__setitem__("totalMinor", True),
            ),
            (
                "total mismatch",
                lambda packet: packet["invoice"]["amount"].__setitem__("totalMinor", 125001),
            ),
            ("unknown key", lambda packet: packet.__setitem__("autoCharge", True)),
            (
                "unknown invoice key",
                lambda packet: packet["invoice"].__setitem__("gatewayToken", "x"),
            ),
            (
                "card gateway channel",
                lambda packet: packet["invoice"]["paymentChannels"][0].__setitem__(
                    "category", "card_gateway"
                ),
            ),
            ("wrong status", lambda packet: packet.__setitem__("status", "issued")),
            (
                "pricing claimed decided",
                lambda packet: packet["controls"].__setitem__("pricingDecided", True),
            ),
            (
                "embedded credential",
                lambda packet: packet["invoice"].__setitem__("notes", "postgresql://u:p@host/db"),
            ),
        ):
            with self.subTest(label=label):
                packet = sample_packet()
                mutate(packet)
                with self.assertRaises(BillingRailError):
                    validate_invoice_packet(packet, workspace_id=WORKSPACE_ID)

    def test_packet_must_bind_to_the_exact_target_workspace(self) -> None:
        with self.assertRaises(BillingRailError):
            validate_invoice_packet(sample_packet(), workspace_id="another-workspace")


class BillingLedgerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.database = FakeBillingDatabase()
        self.ledger = BillingLedger(DATABASE_URL, connection_factory=self.database.connect)
        self.digest = _digest(sample_invoice_core())

    def issue(self, reason: str = "Invoice handed to the customer in person.") -> dict[str, object]:
        return self.ledger.issue_invoice(
            sample_packet(),
            workspace_id=WORKSPACE_ID,
            evidence=founder_evidence("issue-0001", "viber:handover:2026-08-17", reason),
        )

    def confirm(self, expected_revision: int = 1) -> dict[str, object]:
        return self.ledger.confirm_payment(
            workspace_id=WORKSPACE_ID,
            invoice_id=INVOICE_ID,
            expected_revision=expected_revision,
            payment_reference="KBZ-2026-08-17-0001",
            channel_category="mobile_money",
            paid_at="2026-08-17T03:30:00.000Z",
            evidence=founder_evidence("confirm-0001", "KBZ-2026-08-17-0001"),
        )

    def grant(self, expected_revision: int = 0) -> dict[str, object]:
        return self.ledger.grant_entitlement(
            workspace_id=WORKSPACE_ID,
            invoice_digest=self.digest,
            expected_revision=expected_revision,
            evidence=founder_evidence("grant-0001", f"invoice:{INVOICE_ID}:paid"),
        )

    def test_lifecycle_happy_path_issue_confirm_grant(self) -> None:
        issued = self.issue()
        self.assertEqual(issued["contract"], BILLING_EVENT_RESULT_CONTRACT)
        self.assertEqual(issued["status"], "issued")
        self.assertEqual(issued["revision"], 1)
        self.assertFalse(issued["replayed"])
        self.assertFalse(issued["secretValuesExposed"])
        self.assertEqual(issued["authority"]["verification"], "requery_required")

        confirmed = self.confirm()
        self.assertEqual(confirmed["status"], "paid")
        self.assertEqual(confirmed["revision"], 2)
        self.assertFalse(confirmed["replayed"])
        # Confirming a payment never grants entitlement by itself (design 3).
        self.assertNotIn(WORKSPACE_ID, self.database.entitlements)

        granted = self.grant()
        self.assertEqual(granted["status"], "granted")
        self.assertEqual(granted["tier"], PREMIUM_TIER)
        self.assertEqual(granted["invoiceDigest"], self.digest)
        self.assertEqual(granted["revision"], 2)

        state = self.ledger.get_billing_state(WORKSPACE_ID)
        self.assertEqual(state["contract"], BILLING_STATE_CONTRACT)
        self.assertTrue(state["premiumUnlocked"])
        self.assertEqual(state["entitlement"]["status"], "granted")
        self.assertEqual(state["invoices"], [
            {
                "invoiceId": INVOICE_ID,
                "status": "paid",
                "invoiceDigest": self.digest,
                "revision": 2,
            }
        ])
        self.assertEqual(state["eventCount"], 3)
        self.assertFalse(state["externalWritesPerformed"])

    def test_exact_replay_is_idempotent_and_divergent_replay_conflicts(self) -> None:
        first = self.issue()
        replay = self.issue()
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["invoiceDigest"], first["invoiceDigest"])
        self.assertEqual(len(self.database.events), 1)
        self.assertEqual(len(self.database.invoices), 1)
        with self.assertRaises(TrialIdempotencyConflict):
            self.issue(reason="A different delivery story for the same command.")
        self.assertEqual(len(self.database.events), 1)

        self.confirm()
        confirm_replay = self.confirm()
        self.assertTrue(confirm_replay["replayed"])
        self.assertEqual(len(self.database.events), 2)
        with self.assertRaises(TrialIdempotencyConflict):
            self.ledger.confirm_payment(
                workspace_id=WORKSPACE_ID,
                invoice_id=INVOICE_ID,
                expected_revision=2,
                payment_reference="WAVE-OTHER-REFERENCE",
                channel_category="mobile_money",
                paid_at="2026-08-17T03:30:00.000Z",
                evidence=founder_evidence("confirm-0002", "WAVE-OTHER-REFERENCE"),
            )
        self.assertEqual(len(self.database.events), 2)

    def test_stale_revision_and_terminal_status_fail_closed(self) -> None:
        self.issue()
        with self.assertRaises(BillingRailConflict):
            self.confirm(expected_revision=5)
        self.confirm()
        with self.assertRaises(BillingRailConflict):
            self.ledger.void_invoice(
                workspace_id=WORKSPACE_ID,
                invoice_id=INVOICE_ID,
                expected_revision=2,
                evidence=founder_evidence("void-0001", "renegotiated"),
            )
        self.grant()
        # A second grant at the CURRENT revision is not a replay of the recorded
        # grant command; it must fail closed because the tenant already holds
        # the entitlement.
        with self.assertRaises(BillingRailConflict):
            self.grant(expected_revision=2)
        with self.assertRaises(BillingRailConflict):
            self.ledger.revoke_entitlement(
                workspace_id=WORKSPACE_ID,
                reason_class="non_payment",
                expected_revision=1,
                evidence=founder_evidence("revoke-0001", "monthly-review-2026-08"),
            )

    def test_void_requires_an_issued_invoice(self) -> None:
        self.issue()
        voided = self.ledger.void_invoice(
            workspace_id=WORKSPACE_ID,
            invoice_id=INVOICE_ID,
            expected_revision=1,
            evidence=founder_evidence("void-0001", "renegotiated"),
        )
        self.assertEqual(voided["status"], "void")
        self.assertEqual(voided["revision"], 2)
        with self.assertRaises(BillingRailConflict):
            self.confirm(expected_revision=2)

    def test_grant_requires_the_exact_paid_invoice_digest(self) -> None:
        self.issue()
        with self.assertRaises(BillingRailConflict):
            self.grant()
        self.confirm()
        with self.assertRaises(BillingRailConflict):
            self.ledger.grant_entitlement(
                workspace_id=WORKSPACE_ID,
                invoice_digest=_digest({"not": "an invoice"}),
                expected_revision=0,
                evidence=founder_evidence("grant-0001", "wrong-digest"),
            )
        self.assertNotIn(WORKSPACE_ID, self.database.entitlements)

    def test_entitlement_projection_none_granted_revoked_granted(self) -> None:
        self.issue()
        self.confirm()
        self.assertNotIn(WORKSPACE_ID, self.database.entitlements)

        granted = self.grant()
        self.assertEqual(granted["revision"], 2)
        row = self.database.entitlements[WORKSPACE_ID]
        self.assertEqual(row["status"], "granted")
        self.assertEqual(row["invoice_digest"], self.digest[len("sha256:"):])

        revoked = self.ledger.revoke_entitlement(
            workspace_id=WORKSPACE_ID,
            reason_class="non_payment",
            expected_revision=2,
            evidence=founder_evidence("revoke-0001", "monthly-review-2026-08"),
        )
        self.assertEqual(revoked["status"], "revoked")
        self.assertEqual(revoked["revision"], 3)
        row = self.database.entitlements[WORKSPACE_ID]
        self.assertEqual(row["status"], "revoked")
        self.assertIsNone(row["invoice_digest"])
        self.assertIsNone(row["granted_event_id"])
        self.assertFalse(self.ledger.get_billing_state(WORKSPACE_ID)["premiumUnlocked"])

        regranted = self.grant(expected_revision=3)
        self.assertEqual(regranted["status"], "granted")
        self.assertEqual(regranted["revision"], 4)
        self.assertTrue(self.ledger.get_billing_state(WORKSPACE_ID)["premiumUnlocked"])
        self.assertEqual(len(self.database.events), 5)

    def test_refund_recording_does_not_auto_revoke(self) -> None:
        self.issue()
        self.confirm()
        self.grant()
        refunded = self.ledger.record_refund(
            workspace_id=WORKSPACE_ID,
            invoice_digest=self.digest,
            amount_minor=125000,
            channel_category="mobile_money",
            refund_reference="WAVE-REFUND-0001",
            evidence=founder_evidence("refund-0001", "WAVE-REFUND-0001"),
        )
        self.assertEqual(refunded["status"], "refund_recorded")
        self.assertFalse(refunded["replayed"])
        # Recording that money moved back never changes service by itself:
        # revoking is a separate founder decision (design section 3).
        self.assertEqual(self.database.entitlements[WORKSPACE_ID]["status"], "granted")
        self.assertTrue(self.ledger.get_billing_state(WORKSPACE_ID)["premiumUnlocked"])

    def test_refund_guards_reference_paid_invoice_and_sealed_total(self) -> None:
        self.issue()
        with self.assertRaises(BillingRailConflict):
            self.ledger.record_refund(
                workspace_id=WORKSPACE_ID,
                invoice_digest=self.digest,
                amount_minor=1000,
                channel_category="mobile_money",
                refund_reference="WAVE-REFUND-0001",
                evidence=founder_evidence("refund-0001", "WAVE-REFUND-0001"),
            )
        self.confirm()
        with self.assertRaises(BillingRailConflict):
            self.ledger.record_refund(
                workspace_id=WORKSPACE_ID,
                invoice_digest=self.digest,
                amount_minor=125001,
                channel_category="mobile_money",
                refund_reference="WAVE-REFUND-0001",
                evidence=founder_evidence("refund-0001", "WAVE-REFUND-0001"),
            )
        with self.assertRaises(BillingRailError):
            self.ledger.record_refund(
                workspace_id=WORKSPACE_ID,
                invoice_digest=self.digest,
                amount_minor=1000,
                channel_category="mobile_money",
                refund_reference="WAVE-REFUND-0001",
                evidence=founder_evidence("refund-0001", "a-different-reference"),
            )

    def test_evidence_shape_rejection_writes_nothing(self) -> None:
        incomplete = founder_evidence("issue-0001", "viber:handover:2026-08-17")
        del incomplete["reason"]
        with self.assertRaises(BillingRailError):
            self.ledger.issue_invoice(
                sample_packet(), workspace_id=WORKSPACE_ID, evidence=incomplete
            )
        self.assertEqual(self.database.invoices, {})
        self.assertEqual(self.database.events, {})
        self.assertEqual(self.database.statements, [])

    def test_payment_evidence_must_mirror_the_payment_reference(self) -> None:
        self.issue()
        with self.assertRaises(BillingRailError):
            self.ledger.confirm_payment(
                workspace_id=WORKSPACE_ID,
                invoice_id=INVOICE_ID,
                expected_revision=1,
                payment_reference="KBZ-2026-08-17-0001",
                channel_category="mobile_money",
                paid_at="2026-08-17T03:30:00.000Z",
                evidence=founder_evidence("confirm-0001", "not-the-transfer-reference"),
            )

    def test_runtime_or_nonprivileged_connection_cannot_record(self) -> None:
        for label, current_user, privileged, denied in (
            ("runtime role", "supermega_trial_backend", True, True),
            ("non-privileged role", "operator", False, True),
            ("member role reached billing", "postgres", True, False),
        ):
            with self.subTest(label=label):
                database = FakeBillingDatabase()
                database.current_user = current_user
                database.provisioning_role_privileged = privileged
                database.runtime_role_denied = denied
                ledger = BillingLedger(DATABASE_URL, connection_factory=database.connect)
                with self.assertRaises(BillingRailError):
                    ledger.issue_invoice(
                        sample_packet(),
                        workspace_id=WORKSPACE_ID,
                        evidence=founder_evidence("issue-0001", "viber:handover:2026-08-17"),
                    )
                self.assertEqual(database.invoices, {})
                self.assertEqual(database.events, {})

    def test_wrong_schema_version_fails_closed(self) -> None:
        self.database.schema_version = 11
        with self.assertRaises(BillingRailError):
            self.issue()
        self.assertEqual(self.database.invoices, {})


class _ReadinessCursor:
    def __init__(self, connection: "_ReadinessConnection") -> None:
        self._connection = connection
        self._last = ""

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def execute(self, sql: str, params: object = None) -> None:
        self._last = " ".join(str(sql).split())
        self._connection.statements.append((self._last, params))

    def fetchone(self):
        sql = self._last
        if "select 1 as ready" in sql:
            return {"ready": 1}
        if "entitlement_readable" in sql:
            return {"entitlement_readable": self._connection.entitlement_readable}
        if "premium_unlocked" in sql:
            return {"premium_unlocked": self._connection.entitlement_granted}
        if "from app_private.workspace_memberships" in sql:
            return {"actor_kind": "human", "capabilities": ["company.read"]}
        return None

    def fetchall(self):
        return []


class _ReadinessConnection:
    def __init__(self, *, entitlement_readable: bool, entitlement_granted: bool) -> None:
        self.statements: list[tuple[str, object]] = []
        self.entitlement_readable = entitlement_readable
        self.entitlement_granted = entitlement_granted
        self._cursor = _ReadinessCursor(self)

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def transaction(self):
        return self

    def cursor(self):
        return self._cursor


class _ReadinessStore(PostgresTrialStore):
    """Real readiness path with only the transport and server asserts stubbed,
    the test_self_serve_store_schema_conformance.py recording-store pattern."""

    def __init__(self, connection: _ReadinessConnection) -> None:
        super().__init__(
            DATABASE_URL,
            reducer=lambda _surface, _event, current, _payload: current,
            write_enabled=False,
        )
        self._fake_connection = connection

    def _connect(self):
        return self._fake_connection

    @staticmethod
    def _assert_runtime_role(cursor):
        return None

    @staticmethod
    def _assert_schema(cursor):
        return None

    @staticmethod
    def _assert_active_identity_session(cursor, principal):
        return None

    @staticmethod
    def _assert_audit(cursor):
        return None

    @staticmethod
    def _set_context(cursor, principal):
        return None


class PremiumUnlockedReadPathTests(unittest.TestCase):
    PRINCIPAL = TrialPrincipal(
        workspace_id=WORKSPACE_ID,
        actor_id="owner-1",
        actor_kind="human",
        authenticated=True,
        identity_provider="gateway",
    )

    def _readiness(self, *, readable: bool, granted: bool, schema_version: int = 12):
        connection = _ReadinessConnection(
            entitlement_readable=readable, entitlement_granted=granted
        )
        store = _ReadinessStore(connection)
        with patch.object(trial_store_module, "TRIAL_SCHEMA_VERSION", schema_version):
            readiness = store.readiness(self.PRINCIPAL)
        return readiness, connection

    def test_granted_entitlement_surfaces_premium_unlocked(self) -> None:
        readiness, _connection = self._readiness(readable=True, granted=True)
        self.assertTrue(readiness.premium_unlocked)
        self.assertTrue(readiness.to_dict()["premiumUnlocked"])

    def test_absent_or_revoked_entitlement_stays_locked(self) -> None:
        readiness, _connection = self._readiness(readable=True, granted=False)
        self.assertFalse(readiness.premium_unlocked)
        self.assertFalse(readiness.to_dict()["premiumUnlocked"])

    def test_deny_by_default_read_privilege_fails_closed(self) -> None:
        # v12 grants the runtime role nothing on the billing tables; the probe
        # must observe that and never attempt the entitlement read.
        readiness, connection = self._readiness(readable=False, granted=True)
        self.assertFalse(readiness.premium_unlocked)
        entitlement_reads = [
            sql
            for sql, _params in connection.statements
            if "from app_private.billing_entitlements" in sql
        ]
        self.assertEqual(entitlement_reads, [])

    def test_pre_v12_schema_never_touches_billing_tables(self) -> None:
        readiness, connection = self._readiness(readable=True, granted=True, schema_version=10)
        self.assertFalse(readiness.premium_unlocked)
        billing_statements = [
            sql for sql, _params in connection.statements if "billing_entitlements" in sql
        ]
        self.assertEqual(billing_statements, [])

    def test_readiness_payload_defaults_to_locked(self) -> None:
        readiness = trial_store_module.TrialReadiness(
            backend="memory",
            database_ready=True,
            role_ready=True,
            schema_ready=True,
            auth_ready=True,
            membership_ready=True,
            audit_ready=True,
            write_enabled=True,
        )
        self.assertFalse(readiness.premium_unlocked)
        self.assertFalse(readiness.to_dict()["premiumUnlocked"])


if __name__ == "__main__":
    unittest.main()
