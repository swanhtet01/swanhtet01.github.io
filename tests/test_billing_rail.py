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

from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from io import StringIO
import json
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

import supermega_runtime.billing_rail as billing_rail_module
import supermega_runtime.trial_store as trial_store_module
from supermega_runtime.billing_rail import (
    BILLING_ENTITLEMENT_READ_POLICY_DIGEST,
    BILLING_ENTITLEMENT_READ_SCHEMA_VERSION,
    BILLING_EVENT_RESULT_CONTRACT,
    BILLING_MUTATION_PRIVILEGE_KEYS,
    BILLING_NON_READ_PRIVILEGE_KEYS,
    BILLING_OVERDUE_REPORT_CONTRACT,
    BILLING_STATE_CONTRACT,
    BILLING_WRITE_PRIVILEGE_KEYS,
    CONFIRM_BILLING_ACTION_PHRASE,
    INVOICE_PACKET_CONTRACT,
    MANAGED_BILLING_CONTRACT,
    PREMIUM_TIER,
    STATUS_LIFECYCLE,
    BillingLedger,
    BillingRailConflict,
    BillingRailError,
    _digest,
    _policy_expression_fingerprint,
    main,
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
# The second credential A2 introduces: same database, bounded read role. Split
# the same way as DATABASE_URL so neither fixture is DSN-shaped in the source.
READ_DATABASE_URL = "://".join(("postgresql", "billing-rail-read-fixture"))
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


def packet_variant(invoice_id: str, due_date: str) -> dict[str, object]:
    """A second sealed packet: the fixture economics with a different invoice
    id and dueDate, digest and control projection re-derived so the packet
    still validates end to end."""

    core = sample_invoice_core()
    core["invoiceId"] = invoice_id
    core["issuedToPayBy"] = {"issuedAt": "2026-08-01T03:30:00.000Z", "dueDate": due_date}
    digest = _digest(core)
    packet = sample_packet()
    packet["invoice"] = core
    packet["invoiceDigest"] = digest
    packet["proposedControlRecord"] = dict(packet["proposedControlRecord"])
    packet["proposedControlRecord"]["record_key"] = (
        f"managed-billing-invoice:{WORKSPACE_ID}:{invoice_id}"
    )
    packet["proposedControlRecord"]["plan_hash"] = digest[len("sha256:"):]
    return packet


def founder_evidence(action_id: str, reference: str, reason: str = "Founder verified this transition.") -> dict[str, str]:
    return {
        "actionId": action_id,
        "capturedAt": CAPTURED_AT,
        "actor": "Swan Htet",
        "reason": reason,
        "evidenceReference": reference,
    }


# The three billing tables, the two that stay founder-only forever, and every
# privilege the deny-by-default guards reason about. BILLING_PRIVILEGES is all
# EIGHT PostgreSQL 17 table privileges, enumerated from aclexplode() on a real
# 17.10 server rather than hand-written -- four consecutive revisions of this
# set were curated subsets and each was missing something real (DELETE, then
# TRUNCATE, then MAINTAIN). MAINTAIN is PG17-only; PostgreSQL 16 raises
# `unrecognized privilege type` for it, which is why a PG16 harness could not
# have found it.
BILLING_TABLES = ("billing_invoices", "billing_events", "billing_entitlements")
FOUNDER_ONLY_BILLING_TABLES = ("billing_invoices", "billing_events")
BILLING_PRIVILEGES = (
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
    "MAINTAIN",
)
BILLING_NON_READ_PRIVILEGES = tuple(
    privilege for privilege in BILLING_PRIVILEGES if privilege != "SELECT"
)
# The exact grant set v13 leaves behind: SELECT on billing_entitlements only.
V13_RUNTIME_GRANTS = frozenset({("billing_entitlements", "SELECT")})
# pg_policies.qual for v13's billing_entitlements_self_read, copied verbatim
# from a real PostgreSQL server. This is PostgreSQL's deparsed rendering of the
# migration's
#   using (workspace_id = (select current_setting('app.workspace_id', true)))
# -- note the ::text cast and the AS alias the server adds, which is exactly
# what the fingerprint normalization exists to absorb.
V13_READ_POLICY_PREDICATE = (
    "(workspace_id = ( SELECT current_setting('app.workspace_id'::text, true)"
    " AS current_setting))"
)
# What the same server reports after that policy is dropped and recreated with
# v13's NAME, its SELECT command, its permissiveness and its role, but
# `using (true)`. Such a policy is indistinguishable from v13's by name,
# command, permissiveness and role alone, which is precisely why the guard
# fingerprints the predicate.
WIDENED_READ_POLICY_PREDICATE = "true"


def runtime_privilege_columns(granted: object) -> dict[str, bool]:
    """Derive the three runtime-role probe columns exactly as the SQL in
    BillingLedger._assert_schema derives them, from the set of (table,
    privilege) pairs supermega_trial_backend actually holds. Modelling the
    grants rather than the aggregates keeps the fixtures honest: a test names
    the privilege v13 grants, not a hand-set boolean."""

    held = {(str(table), str(privilege)) for table, privilege in granted}
    return {
        "runtime_ledger_denied": all(
            (table, privilege) not in held
            for table in FOUNDER_ONLY_BILLING_TABLES
            for privilege in BILLING_PRIVILEGES
        ),
        "runtime_entitlement_write_denied": all(
            ("billing_entitlements", privilege) not in held
            for privilege in BILLING_NON_READ_PRIVILEGES
        ),
        "runtime_entitlement_read": ("billing_entitlements", "SELECT") in held,
    }


# The probe column each (table, privilege) cell maps to, mirroring
# _assert_schema's current_user matrix: three tables by all SEVEN PostgreSQL
# table privileges, 24 cells. Written out here rather than imported from the
# module so the fixtures are an independent statement of the expected shape --
# if billing_rail's generator and this table disagree, a test fails instead of
# both drifting together.
CONNECTING_PRIVILEGE_COLUMNS = {
    (table, privilege): f"{prefix}_{privilege.lower()}"
    for table, prefix in (
        ("billing_invoices", "invoice"),
        ("billing_events", "event"),
        ("billing_entitlements", "entitlement"),
    )
    for privilege in (
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
        "MAINTAIN",
    )
}
# What the founder's administrative connection holds today: the three SELECTs
# plus the five mutation privileges the write path requires. The read path now
# refuses exactly this credential, which is the whole point of A2 -- see the
# PR body and ADMINISTRATIVE_READ_REFUSED test below.
FOUNDER_WRITE_GRANTS = frozenset(
    {
        ("billing_invoices", "SELECT"),
        ("billing_invoices", "INSERT"),
        ("billing_invoices", "UPDATE"),
        ("billing_events", "SELECT"),
        ("billing_events", "INSERT"),
        ("billing_entitlements", "SELECT"),
        ("billing_entitlements", "INSERT"),
        ("billing_entitlements", "UPDATE"),
    }
)
# A bounded read role: the three SELECTs and nothing else at all.
BOUNDED_READ_GRANTS = frozenset({(table, "SELECT") for table in BILLING_TABLES})
# Every cell the read branch must refuse, one at a time: all six non-SELECT
# privileges across all three tables, 18 in total. TRUNCATE is in here because
# a role holding only TRUNCATE passed the previous nine-cell check and could
# empty every billing table in one statement -- row-level triggers do not fire
# for it and RLS does not constrain it.
BILLING_NON_READ_CELLS = tuple(
    (table, privilege)
    for table in BILLING_TABLES
    for privilege in BILLING_NON_READ_PRIVILEGES
)
# The subset that changes rows directly, kept separate because the code keeps
# the same distinction.
BILLING_MUTATION_CELLS = tuple(
    (table, privilege)
    for table in BILLING_TABLES
    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE")
)


def _camel_case(column: str) -> str:
    """snake_case probe column -> the camelCase key _assert_schema's snapshot
    stores it under."""

    head, *rest = column.split("_")
    return head + "".join(part.capitalize() for part in rest)


def connecting_privilege_columns(granted: object) -> dict[str, bool]:
    """Derive the twelve current_user probe columns from the set of (table,
    privilege) pairs the CONNECTING role actually holds. Same reasoning as
    runtime_privilege_columns above: the fixtures model grants, so a test names
    the privilege it is granting rather than hand-setting a column that the
    probe might not even ask for."""

    held = {(str(table), str(privilege)) for table, privilege in granted}
    return {
        column: (table, privilege) in held
        for (table, privilege), column in CONNECTING_PRIVILEGE_COLUMNS.items()
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
        # v12 default: the runtime member role holds nothing on any billing
        # table. A v13 target is modelled by setting V13_RUNTIME_GRANTS.
        self.runtime_privileges: frozenset[tuple[str, str]] = frozenset()
        # What each of the two credentials holds. connect() reports the first,
        # connect_read() the second; tests widen read_privileges by one cell to
        # model a read role provisioned slightly wrong.
        self.connecting_privileges: frozenset[tuple[str, str]] = FOUNDER_WRITE_GRANTS
        self.read_privileges: frozenset[tuple[str, str]] = BOUNDED_READ_GRANTS
        # billing_entitlements carries forced RLS and exactly the one permissive
        # SELECT policy v13 creates. False models a target where RLS was
        # disabled, the policy dropped, or a second policy added beside it.
        self.entitlement_read_scoped = True
        # That policy's PREDICATE, which the shape flag above cannot express: a
        # policy recreated with v13's name, command, permissiveness and role but
        # `using (true)` leaves the shape intact and changes only this. The
        # ledger fingerprints whatever text the server reports here, so the
        # fixtures carry real deparsed predicates rather than digests. None
        # models no such policy at all.
        self.entitlement_read_predicate: str | None = V13_READ_POLICY_PREDICATE
        self.schema_version = 12

    def connect(self, _database_url: str):
        """The founder's administrative connection: the credential that issues
        invoices and moves entitlements."""
        return FakeBillingConnection(self, self.connecting_privileges)

    def connect_read(self, _database_url: str):
        """A bounded read connection to the SAME database -- three SELECTs and
        not one mutation privilege. Two factories rather than one mutable field
        because that is the real topology A2 describes: one database, two
        credentials, and a read path that must refuse the write one."""
        return FakeBillingConnection(self, self.read_privileges)


class FakeBillingConnection:
    def __init__(
        self,
        database: FakeBillingDatabase,
        connecting_privileges: frozenset[tuple[str, str]],
    ) -> None:
        self.database = database
        self.connecting_privileges = connecting_privileges
        self.closed = False
        self.snapshot = None

    def transaction(self):
        return self

    def cursor(self):
        return FakeBillingCursor(self.database, self.connecting_privileges)

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
    def __init__(
        self,
        database: FakeBillingDatabase,
        connecting_privileges: frozenset[tuple[str, str]],
    ) -> None:
        self.database = database
        self.connecting_privileges = connecting_privileges
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
                    **runtime_privilege_columns(self.database.runtime_privileges),
                    "runtime_entitlement_read_policy_shape": (
                        self.database.entitlement_read_scoped
                    ),
                    "runtime_entitlement_read_predicate": (
                        self.database.entitlement_read_predicate
                    ),
                    **connecting_privilege_columns(self.connecting_privileges),
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
        elif (
            "from app_private.billing_events" in sql
            and "billing.refund.recorded" in sql
        ):
            workspace_id = str(values[0])
            self.rows = [
                deepcopy(event)
                for key, event in self.database.events.items()
                if key[0] == workspace_id
                and event.get("event_type") == "billing.refund.recorded"
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


def seed_refund_event(
    database: FakeBillingDatabase,
    *,
    reference: str,
    digest: object = None,
    amount_minor: object = None,
    payload_json: str | None = None,
) -> None:
    """Append a billing.refund.recorded event straight into the fake log.

    The ledger API only records refunds against paid invoices, but both the
    overdue report and _prior_refund_total are defined as pure projections
    over WHATEVER the append-only billing_events log contains, so their
    arithmetic is exercised against a directly seeded history. The
    (workspace_id, command_id) dict key mirrors the table's primary key:
    replaying the same command never appends a second row, exactly like the
    real replay path. payload_json overrides the whole payload for
    malformed-row cases."""

    if payload_json is None:
        payload_json = json.dumps(
            {
                "invoiceDigest": digest,
                "amountMinor": amount_minor,
                "channelCategory": "mobile_money",
                "refundReference": reference,
                "evidence": founder_evidence(f"refund-{reference}", reference),
            }
        )
    database.events[(WORKSPACE_ID, f"seeded-refund:{reference}")] = {
        "event_id": f"seeded-refund:{reference}",
        "command_fingerprint": "seeded",
        "event_type": "billing.refund.recorded",
        "actor_id": "Swan Htet",
        "payload_json": payload_json,
        "result_json": json.dumps({"status": "refund_recorded"}),
        "created_at": NOW,
    }


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
                lambda packet: packet["invoice"].__setitem__(
                    # Assembled from parts: no credential-shaped URI literal
                    # in-repo (OPS-762); the validator must still reject it.
                    "notes", "postgresql" + "://" + "u" + ":" + "p" + "@host/db"
                ),
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
        # The read path no longer accepts the administrative credential, so the
        # projection is read over a second ledger bound to the bounded read
        # connection -- one database, two credentials, as A2 describes.
        self.read_ledger = BillingLedger(
            DATABASE_URL, connection_factory=self.database.connect_read
        )
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

        state = self.read_ledger.get_billing_state(WORKSPACE_ID)
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
        self.assertFalse(self.read_ledger.get_billing_state(WORKSPACE_ID)["premiumUnlocked"])

        regranted = self.grant(expected_revision=3)
        self.assertEqual(regranted["status"], "granted")
        self.assertEqual(regranted["revision"], 4)
        self.assertTrue(self.read_ledger.get_billing_state(WORKSPACE_ID)["premiumUnlocked"])
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
        self.assertTrue(self.read_ledger.get_billing_state(WORKSPACE_ID)["premiumUnlocked"])

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

    def test_refunds_cannot_cumulatively_exceed_the_invoice_total(self) -> None:
        # Each single refund is within the 125000 sealed total, but their sum
        # must not exceed it. Without the cumulative bound, two refunds under
        # different references each pass the per-refund check and overshoot.
        self.issue()
        self.confirm()
        first = self.ledger.record_refund(
            workspace_id=WORKSPACE_ID,
            invoice_digest=self.digest,
            amount_minor=100000,
            channel_category="mobile_money",
            refund_reference="WAVE-REFUND-0001",
            evidence=founder_evidence("refund-0001", "WAVE-REFUND-0001"),
        )
        self.assertEqual(first["status"], "refund_recorded")
        # A second refund that brings the cumulative sum exactly to the total
        # is still allowed.
        second = self.ledger.record_refund(
            workspace_id=WORKSPACE_ID,
            invoice_digest=self.digest,
            amount_minor=25000,
            channel_category="mobile_money",
            refund_reference="WAVE-REFUND-0002",
            evidence=founder_evidence("refund-0002", "WAVE-REFUND-0002"),
        )
        self.assertEqual(second["status"], "refund_recorded")
        # A third refund of even 1 minor unit now exceeds the sealed total and
        # is rejected -- the exact over-refund the per-refund check missed.
        with self.assertRaises(BillingRailConflict):
            self.ledger.record_refund(
                workspace_id=WORKSPACE_ID,
                invoice_digest=self.digest,
                amount_minor=1,
                channel_category="mobile_money",
                refund_reference="WAVE-REFUND-0003",
                evidence=founder_evidence("refund-0003", "WAVE-REFUND-0003"),
            )
        # Exactly two refund events were durably recorded; the rejected one wrote
        # nothing.
        refund_events = [
            event
            for event in self.database.events.values()
            if event.get("event_type") == "billing.refund.recorded"
        ]
        self.assertEqual(len(refund_events), 2)

    def test_replayed_refund_is_not_double_counted_toward_the_total(self) -> None:
        # An idempotent replay of the same refund (same reference) must return
        # the original receipt without adding to the cumulative sum, so the
        # replay path cannot be used to sidestep the cumulative bound.
        self.issue()
        self.confirm()
        args = dict(
            workspace_id=WORKSPACE_ID,
            invoice_digest=self.digest,
            amount_minor=125000,
            channel_category="mobile_money",
            refund_reference="WAVE-REFUND-0001",
            evidence=founder_evidence("refund-0001", "WAVE-REFUND-0001"),
        )
        first = self.ledger.record_refund(**args)
        self.assertFalse(first["replayed"])
        replay = self.ledger.record_refund(**args)
        self.assertTrue(replay["replayed"])
        refund_events = [
            event
            for event in self.database.events.values()
            if event.get("event_type") == "billing.refund.recorded"
        ]
        self.assertEqual(len(refund_events), 1)

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
        for label, current_user, privileged, runtime_privileges in (
            ("runtime role", "supermega_trial_backend", True, frozenset()),
            ("non-privileged role", "operator", False, frozenset()),
            (
                "member role reached billing",
                "postgres",
                True,
                frozenset({("billing_invoices", "SELECT")}),
            ),
        ):
            with self.subTest(label=label):
                database = FakeBillingDatabase()
                database.current_user = current_user
                database.provisioning_role_privileged = privileged
                database.runtime_privileges = runtime_privileges
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


class BillingReadPathFailsClosedTests(unittest.TestCase):
    """A2 part one: the READ path must fail closed on every mutation privilege.

    Before this, _assert_schema only ever *required* the mutation flags when
    require_write_privilege was true and never *rejected* them when it was
    false, so a read role accidentally provisioned with INSERT or UPDATE sailed
    straight through the read branch. Declining to require is not an invariant.
    A2's whole purpose is putting that credential in a service context, so
    "the service cannot mutate billing" has to be a property the probe proves
    at connection time rather than one someone provisions correctly by hand.

    These fixtures model grants rather than columns, so each case names the
    privilege it is granting. The same nine cases were also run against a live
    PostgreSQL server with real roles and real GRANTs -- the fake cannot
    validate that the probe statement parses, only that the branch logic reacts
    to the values it is handed.
    """

    def read_ledger(self, database: FakeBillingDatabase) -> BillingLedger:
        return BillingLedger(
            READ_DATABASE_URL, connection_factory=database.connect_read
        )

    def test_a_clean_bounded_read_role_is_accepted(self) -> None:
        database = FakeBillingDatabase()
        state = self.read_ledger(database).get_billing_state(WORKSPACE_ID)
        self.assertEqual(state["contract"], BILLING_STATE_CONTRACT)

    def test_the_read_path_still_requires_a_role_that_can_see_past_rls(self) -> None:
        # A2's spec proposed gating the privileged-role assertion on
        # require_write_privilege so the read role would not need
        # superuser-class rights. That is unsafe and this test is the pin.
        #
        # v12 puts `force row level security` on all three billing tables and
        # its own $verify$ block asserts they carry NO policies; v13 adds one,
        # scoped `to supermega_trial_backend`. Forced RLS is not bypassed by the
        # table owner -- only by rolsuper or rolbypassrls. Verified on a live
        # server: a role created `nosuperuser nobypassrls` holding SELECT on all
        # three tables reads 0 of 1 rows from each. Had the assertion been
        # gated, such a role would connect cleanly and get_billing_state would
        # answer a paid-up workspace with no invoices, no entitlement and an
        # EMPTY overdue report -- silently under-reporting money owed, which is
        # the exact leakage _overdue_report exists to stop and strictly worse
        # than a refusal.
        #
        # So the bounded read role A2 needs is BYPASSRLS with no mutation grant.
        # It is the mutation refusal above, not this assertion, that bounds it.
        database = FakeBillingDatabase()
        database.provisioning_role_privileged = False
        with self.assertRaises(BillingRailError) as raised:
            self.read_ledger(database).get_billing_state(WORKSPACE_ID)
        self.assertIn("row level security", str(raised.exception))

    def test_the_two_split_role_refusals_say_different_things(self) -> None:
        # The role-NAME refusal and the read-past-RLS refusal used to be one
        # condition sharing one message. They are separate guards with different
        # remedies now, and an operator provisioning a credential has to be able
        # to tell which one they tripped.
        blacklisted = FakeBillingDatabase()
        blacklisted.current_user = "supermega_trial_backend"
        unprivileged = FakeBillingDatabase()
        unprivileged.provisioning_role_privileged = False
        messages = []
        for database in (blacklisted, unprivileged):
            with self.assertRaises(BillingRailError) as raised:
                self.read_ledger(database).get_billing_state(WORKSPACE_ID)
            messages.append(str(raised.exception))
        self.assertNotEqual(messages[0], messages[1])

    def test_every_non_select_privilege_is_refused_one_at_a_time(self) -> None:
        # 21 cells: seven non-SELECT privileges across three tables. Twelve of
        # them change rows directly; TRIGGER, REFERENCES and MAINTAIN do not and
        # are refused anyway (see BILLING_TABLE_PRIVILEGES for why).
        self.assertEqual(len(BILLING_NON_READ_CELLS), 21)
        self.assertEqual(len(BILLING_MUTATION_CELLS), 12)
        for table, privilege in BILLING_NON_READ_CELLS:
            with self.subTest(table=table, privilege=privilege):
                database = FakeBillingDatabase()
                database.read_privileges = BOUNDED_READ_GRANTS | {(table, privilege)}
                with self.assertRaises(BillingRailError) as raised:
                    self.read_ledger(database).get_billing_state(WORKSPACE_ID)
                message = str(raised.exception)
                self.assertIn("SELECT and nothing else", message)
                # The refusal names the offending cell, so a mis-provisioned
                # role tells the founder which GRANT to revoke.
                self.assertIn(
                    CONNECTING_PRIVILEGE_COLUMNS[(table, privilege)]
                    .replace("_", " ")
                    .split()[0],
                    message.lower(),
                )
                self.assertIn(privilege.lower(), message.lower())

    def test_the_probed_set_is_postgres_17s_complete_table_privilege_list(self) -> None:
        # This list has been a curated subset four times running, and each time
        # the missing privilege was real. It is now enumerated from the server
        # rather than written from memory: `grant all on table ... to r` then
        # aclexplode(relacl) on a real PostgreSQL 17.10 returns exactly these
        # eight. Pinned here so a future narrowing is a test failure.
        #
        # MAINTAIN is PostgreSQL 17 only -- PG16 raises `unrecognized privilege
        # type: "MAINTAIN"` for it. No version branch guards it because
        # _assert_schema refuses any server whose postgresMajor is not 17 long
        # before these checks run.
        self.assertEqual(
            set(billing_rail_module.BILLING_TABLE_PRIVILEGES),
            {
                "SELECT",
                "INSERT",
                "UPDATE",
                "DELETE",
                "TRUNCATE",
                "REFERENCES",
                "TRIGGER",
                "MAINTAIN",
            },
        )
        self.assertEqual(len(billing_rail_module.BILLING_PRIVILEGE_CELLS), 24)

    def test_maintain_alone_is_refused(self) -> None:
        # The fourth narrowing. MAINTAIN does not change rows, so it is not in
        # the row-changing twelve, but it lets a role run maintenance
        # operations and take table locks -- it can block billing activity, and
        # it plainly violates "this connection holds SELECT and nothing else".
        for table in BILLING_TABLES:
            with self.subTest(table=table):
                database = FakeBillingDatabase()
                database.read_privileges = BOUNDED_READ_GRANTS | {(table, "MAINTAIN")}
                with self.assertRaises(BillingRailError) as raised:
                    self.read_ledger(database).get_billing_state(WORKSPACE_ID)
                self.assertIn("maintain", str(raised.exception).lower())
        self.assertNotIn(
            "invoiceMaintain", set(BILLING_MUTATION_PRIVILEGE_KEYS)
        )
        self.assertIn("invoiceMaintain", set(BILLING_NON_READ_PRIVILEGE_KEYS))

    def test_truncate_alone_is_refused(self) -> None:
        # Pinned on its own because this is the privilege that defeated the
        # first version of this guard. A role holding SELECT plus TRUNCATE and
        # nothing else was accepted as a bounded reader, and TRUNCATE empties a
        # billing table in one statement: v12's immutability triggers are all
        # `for each row` and do not fire for it, and RLS constrains only
        # SELECT/INSERT/UPDATE/DELETE. Measured on a live server, such a role
        # was refused DELETE and then truncated all three tables to zero rows.
        for table in BILLING_TABLES:
            with self.subTest(table=table):
                database = FakeBillingDatabase()
                database.read_privileges = BOUNDED_READ_GRANTS | {(table, "TRUNCATE")}
                with self.assertRaises(BillingRailError) as raised:
                    self.read_ledger(database).get_billing_state(WORKSPACE_ID)
                self.assertIn("truncate", str(raised.exception).lower())

    def test_the_administrative_write_credential_is_refused_on_the_read_path(
        self,
    ) -> None:
        # THE breaking change, pinned deliberately. The credential the founder
        # runs `status` with today holds the five write grants, so the hardened
        # read path refuses it. This is not a regression to paper over: it is
        # the reason A2 lists a founder-provisioned bounded read role as a
        # prerequisite. If this test ever starts passing as an ACCEPT, the read
        # path has been loosened back to trusting provisioning discipline.
        database = FakeBillingDatabase()
        ledger = BillingLedger(DATABASE_URL, connection_factory=database.connect)
        with self.assertRaises(BillingRailError) as raised:
            ledger.get_billing_state(WORKSPACE_ID)
        self.assertIn("SELECT and nothing else", str(raised.exception))

    def test_the_runtime_role_names_are_still_refused_on_the_read_path(self) -> None:
        # Gating the PRIVILEGED-role assertion must not gate the runtime-role
        # NAME refusal beside it; they are different guards and only the first
        # is what A2 relaxes.
        for current_user in ("supermega_trial_backend", "supermega_trial_login"):
            with self.subTest(current_user=current_user):
                database = FakeBillingDatabase()
                database.current_user = current_user
                with self.assertRaises(BillingRailError) as raised:
                    self.read_ledger(database).get_billing_state(WORKSPACE_ID)
                self.assertIn("never the runtime role", str(raised.exception))

    def test_the_read_path_still_requires_readable_billing_history(self) -> None:
        for table in BILLING_TABLES:
            with self.subTest(table=table):
                database = FakeBillingDatabase()
                database.read_privileges = BOUNDED_READ_GRANTS - {(table, "SELECT")}
                with self.assertRaises(BillingRailError) as raised:
                    self.read_ledger(database).get_billing_state(WORKSPACE_ID)
                self.assertIn("verify billing history", str(raised.exception))

    def test_the_write_path_is_unchanged(self) -> None:
        # Still the reviewed administrative role, still the same five required
        # privileges, and still no DELETE and no TRUNCATE requirement -- the
        # ledger is append-only and never deletes from any billing table.
        self.assertEqual(
            set(BILLING_WRITE_PRIVILEGE_KEYS),
            {
                "invoiceInsert",
                "invoiceUpdate",
                "eventInsert",
                "entitlementInsert",
                "entitlementUpdate",
            },
        )
        self.assertTrue(set(BILLING_WRITE_PRIVILEGE_KEYS) < set(BILLING_MUTATION_PRIVILEGE_KEYS))
        # The write path deliberately does NOT reject TRUNCATE, and this pins
        # the reason rather than leaving it to the commit log. Its role is
        # superuser-class by construction -- provisioningRolePrivileged demands
        # rolsuper or rolbypassrls -- and has_table_privilege reports TRUNCATE
        # true for a superuser regardless of any GRANT (measured on a live
        # server). Refusing it there would reject every superuser
        # administrative role and brick all six mutation commands. The read
        # path is where that bound belongs.
        self.assertNotIn("Truncate", " ".join(BILLING_WRITE_PRIVILEGE_KEYS))
        superuser = FakeBillingDatabase()
        superuser.connecting_privileges = frozenset(
            (table, privilege)
            for table in BILLING_TABLES
            for privilege in BILLING_PRIVILEGES
        )
        self.assertEqual(
            BillingLedger(
                DATABASE_URL, connection_factory=superuser.connect
            ).issue_invoice(
                sample_packet(),
                workspace_id=WORKSPACE_ID,
                evidence=founder_evidence("issue-0003", "viber:handover"),
            )["status"],
            "issued",
        )
        database = FakeBillingDatabase()
        ledger = BillingLedger(DATABASE_URL, connection_factory=database.connect)
        issued = ledger.issue_invoice(
            sample_packet(),
            workspace_id=WORKSPACE_ID,
            evidence=founder_evidence("issue-0001", "viber:handover:2026-08-17"),
        )
        self.assertEqual(issued["status"], "issued")
        # A bounded read role cannot write, and a role holding the grants but
        # not the reviewed administrative role cannot either.
        for label, factory, privileged in (
            ("bounded read role", database.connect_read, True),
            ("unprivileged role holding the grants", database.connect, False),
        ):
            with self.subTest(label=label):
                database.provisioning_role_privileged = privileged
                with self.assertRaises(BillingRailError):
                    BillingLedger(
                        DATABASE_URL, connection_factory=factory
                    ).issue_invoice(
                        sample_packet(),
                        workspace_id=WORKSPACE_ID,
                        evidence=founder_evidence("issue-0002", "viber:handover"),
                    )
                database.provisioning_role_privileged = True

    def test_the_runtime_role_guards_also_probe_every_privilege(self) -> None:
        # The runtime member role holding TRUNCATE is exactly as destructive as
        # the read connection holding it -- it empties the table and fires no
        # row-level trigger -- and the deny-by-default guards listed only four
        # privileges. Bind their arrays to the full set here; the fixture
        # computes these columns in Python, so nothing else would notice the
        # SQL narrowing again.
        database = FakeBillingDatabase()
        self.read_ledger(database).get_billing_state(WORKSPACE_ID)
        probe = next(
            sql
            for sql, _params in database.statements
            if "current_setting('server_version_num')" in sql
        )
        runtime_arrays = re.findall(r"unnest\(array\[([^\]]*)\]\)\s*billing_privilege", probe)
        self.assertEqual(len(runtime_arrays), 2)
        for privileges in runtime_arrays:
            for privilege in ("truncate", "references", "trigger", "maintain"):
                self.assertIn(f"'{privilege}'", privileges)

    def test_a_sequence_row_lands_every_cell_on_its_own_column(self) -> None:
        # psycopg is configured with dict rows, but _row_value also accepts a
        # plain sequence and falls back to POSITION. Nothing exercised that
        # path, so the probe's select-list order and the positional indices
        # could drift apart silently -- a one-slot shift would read every
        # privilege from its neighbour's column. Build the row positionally,
        # independently of the module's own base index, and require the
        # snapshot to come back correct.
        leading = [
            170006,                        # server_version_num
            "postgres",                    # current_user
            True,                          # transaction_read_only
            True,                          # provisioning_role_privileged
            billing_rail_module.BILLING_SCHEMA_VERSION,  # schema_version
            True,                          # backend_role_safe
            True,                          # runtime_ledger_denied
            True,                          # runtime_entitlement_write_denied
            False,                         # runtime_entitlement_read
            True,                          # runtime_entitlement_read_policy_shape
            V13_READ_POLICY_PREDICATE,     # runtime_entitlement_read_predicate
        ]
        cells = [
            privilege == "SELECT"
            for _table, privilege in (
                (table, privilege)
                for table in BILLING_TABLES
                for privilege in BILLING_PRIVILEGES
            )
        ]

        class SequenceRowCursor:
            def execute(self, _statement, _params=()):
                return None

            def fetchone(self):
                return list(leading) + list(cells)

        snapshot = BillingLedger._assert_schema(
            SequenceRowCursor(), require_write_privilege=False
        )
        for table, privilege in (
            (table, privilege)
            for table in BILLING_TABLES
            for privilege in BILLING_PRIVILEGES
        ):
            key = _camel_case(CONNECTING_PRIVILEGE_COLUMNS[(table, privilege)])
            with self.subTest(table=table, privilege=privilege):
                self.assertEqual(snapshot[key], privilege == "SELECT")

    def test_the_probe_asks_for_every_cell_both_branches_reason_about(self) -> None:
        # The gap this change closed was a probe narrower than the checks, and
        # it recurred: first DELETE and billing_events UPDATE were unprobed
        # (eight cells), then TRUNCATE was (twelve). The probe now asks for all
        # eight PostgreSQL 17 table privileges across all three tables -- 24 cells
        # -- and is generated from the same tuple the checks read, so a subset
        # cannot silently reappear. A cell that is never probed reads as
        # permanently absent, so it can be neither required by the write branch
        # nor rejected by the read branch, with no test failing. Bind the probe
        # to the checks here.
        database = FakeBillingDatabase()
        self.read_ledger(database).get_billing_state(WORKSPACE_ID)
        probe = next(
            sql
            for sql, _params in database.statements
            if "current_setting('server_version_num')" in sql
        )
        for table in BILLING_TABLES:
            for privilege in BILLING_PRIVILEGES:
                with self.subTest(table=table, privilege=privilege):
                    self.assertIn(
                        f"has_table_privilege(current_user, 'app_private.{table}',"
                        f" '{privilege}')".lower(),
                        probe,
                    )
        self.assertEqual(len(CONNECTING_PRIVILEGE_COLUMNS), 24)
        # And the 21 snapshot keys the read branch rejects are exactly the 21
        # non-SELECT cells the probe asks for -- no key rejecting a column that
        # is never selected, and no non-SELECT column selected but ignored.
        self.assertEqual(
            set(BILLING_NON_READ_PRIVILEGE_KEYS),
            {
                _camel_case(CONNECTING_PRIVILEGE_COLUMNS[cell])
                for cell in BILLING_NON_READ_CELLS
            },
        )
        self.assertEqual(
            set(BILLING_MUTATION_PRIVILEGE_KEYS),
            {
                _camel_case(CONNECTING_PRIVILEGE_COLUMNS[cell])
                for cell in BILLING_MUTATION_CELLS
            },
        )


class PolicyPredicateFingerprintTests(unittest.TestCase):
    """The predicate pin is a cross-language constant; bind both ends here.

    `BILLING_ENTITLEMENT_READ_POLICY_DIGEST` and
    `expectedPolicyFingerprints.billing_entitlements_self_read.qual` in
    tools/verify_private_trial_migrations.mjs must be the same hex forever: they
    fingerprint the same predicate under the same normalization. Nothing but a
    comment linked them, so a future PostgreSQL deparse change would be caught
    by the migration verifier in CI, that pin would be updated, the gate would
    go green, and the ledger's copy would silently rot -- surfacing only as a
    false 'must stay scoped' alarm the first time the founder ran a live billing
    command. These tests make that divergence a test failure instead.
    """

    VERIFIER = Path(__file__).resolve().parents[1] / "tools" / "verify_private_trial_migrations.mjs"

    def test_the_pin_is_the_fingerprint_of_v13s_real_deparsed_predicate(self) -> None:
        # V13_READ_POLICY_PREDICATE is copied verbatim from a real PostgreSQL
        # server, so this executes the normalization the probe relies on rather
        # than trusting a hand-computed digest.
        self.assertEqual(
            _policy_expression_fingerprint(V13_READ_POLICY_PREDICATE),
            BILLING_ENTITLEMENT_READ_POLICY_DIGEST,
        )

    def test_the_normalization_absorbs_only_rendering_differences(self) -> None:
        # Casts, letter case and whitespace are the server's rendering choices,
        # so they must not change the fingerprint...
        for label, rendering in (
            ("cast suffix dropped", V13_READ_POLICY_PREDICATE.replace("::text", "")),
            ("uppercased", V13_READ_POLICY_PREDICATE.upper()),
            ("whitespace expanded", V13_READ_POLICY_PREDICATE.replace(" ", "\n  ")),
        ):
            with self.subTest(label=label):
                self.assertEqual(
                    _policy_expression_fingerprint(rendering),
                    BILLING_ENTITLEMENT_READ_POLICY_DIGEST,
                )
        # ...while a changed predicate must, or the pin would prove nothing.
        for label, rendering in (
            ("widened to true", WIDENED_READ_POLICY_PREDICATE),
            ("different column", V13_READ_POLICY_PREDICATE.replace("workspace_id =", "status =", 1)),
            ("different guc", V13_READ_POLICY_PREDICATE.replace("app.workspace_id", "app.other_id")),
            ("absent", None),
        ):
            with self.subTest(label=label):
                self.assertNotEqual(
                    _policy_expression_fingerprint(rendering),
                    BILLING_ENTITLEMENT_READ_POLICY_DIGEST,
                )

    def test_the_pin_matches_the_migration_verifiers_pin(self) -> None:
        source = self.VERIFIER.read_text(encoding="utf-8")
        anchor = source.index("billing_entitlements_self_read: {")
        block = source[anchor : source.index("}", anchor)]
        pinned = re.search(r"qual:\s*'([0-9a-f]{64})'", block)
        self.assertIsNotNone(
            pinned,
            "tools/verify_private_trial_migrations.mjs no longer pins a qual "
            "fingerprint for billing_entitlements_self_read; the ledger's pin "
            "has lost its counterpart.",
        )
        self.assertEqual(pinned.group(1), BILLING_ENTITLEMENT_READ_POLICY_DIGEST)


class RuntimePrivilegeContractTests(unittest.TestCase):
    """The deny-by-default guard against the exact grant v13 makes.

    v12 shipped billing dark: zero policies, zero grants for
    supermega_trial_backend on all three billing tables. v13
    (20260818090000_private_trial_backend_v13_billing_entitlement_read.sql) is
    the one separate founder decision that opens a single privilege -- SELECT on
    app_private.billing_entitlements, RLS-scoped to the session's own workspace
    -- so the product surface can read the paid flag. The ledger's guard must
    tolerate exactly that one privilege at exactly that schema version and go on
    refusing everything else: a v13-shaped grant on a v12 database was not put
    there by a reviewed migration, entitlement writes stay founder-only forever,
    and billing_invoices/billing_events stay completely dark forever.
    """

    DENY_MESSAGE = (
        "The billing tables must remain deny-by-default for the runtime member role."
    )
    UNSCOPED_MESSAGE = (
        "The runtime member role's billing entitlement read must stay scoped to its own workspace."
    )
    # Read off the source of truth so the cases track the constant, not a literal.
    V13 = BILLING_ENTITLEMENT_READ_SCHEMA_VERSION
    PRE_V13 = BILLING_ENTITLEMENT_READ_SCHEMA_VERSION - 1
    SCHEMA_VERSIONS = (PRE_V13, V13)

    def ledger_for(
        self,
        *,
        schema_version: int,
        runtime_privileges: object,
        entitlement_read_scoped: bool = True,
        entitlement_read_predicate: str | None = V13_READ_POLICY_PREDICATE,
    ) -> tuple[FakeBillingDatabase, BillingLedger]:
        database = FakeBillingDatabase()
        database.schema_version = schema_version
        database.runtime_privileges = frozenset(runtime_privileges)
        database.entitlement_read_scoped = entitlement_read_scoped
        database.entitlement_read_predicate = entitlement_read_predicate
        return database, BillingLedger(DATABASE_URL, connection_factory=database.connect)

    def issue(self, ledger: BillingLedger) -> dict[str, object]:
        return ledger.issue_invoice(
            sample_packet(),
            workspace_id=WORKSPACE_ID,
            evidence=founder_evidence("issue-0001", "viber:handover:2026-08-17"),
        )

    def assert_accepted(self, *, schema_version: int, runtime_privileges: object) -> None:
        database, ledger = self.ledger_for(
            schema_version=schema_version, runtime_privileges=runtime_privileges
        )
        with patch.object(billing_rail_module, "BILLING_SCHEMA_VERSION", schema_version):
            recorded = self.issue(ledger)
        self.assertFalse(recorded["replayed"])
        self.assertEqual(len(database.invoices), 1)
        self.assertEqual(len(database.events), 1)

    def assert_rejected(
        self,
        *,
        schema_version: int,
        runtime_privileges: object,
        entitlement_read_scoped: bool = True,
        entitlement_read_predicate: str | None = V13_READ_POLICY_PREDICATE,
        message: str | None = None,
    ) -> None:
        database, ledger = self.ledger_for(
            schema_version=schema_version,
            runtime_privileges=runtime_privileges,
            entitlement_read_scoped=entitlement_read_scoped,
            entitlement_read_predicate=entitlement_read_predicate,
        )
        with patch.object(billing_rail_module, "BILLING_SCHEMA_VERSION", schema_version):
            with self.assertRaises(BillingRailError) as raised:
                self.issue(ledger)
        self.assertEqual(str(raised.exception), message or self.DENY_MESSAGE)
        self.assertEqual(database.invoices, {})
        self.assertEqual(database.events, {})

    def test_v13_entitlement_read_grant_is_accepted_at_schema_13(self) -> None:
        # The regression this fix closes: on a real v13 database EVERY founder
        # billing command raised DENY_MESSAGE, because the guard's predicate
        # folded billing_entitlements SELECT in with the privileges v13 never
        # grants. v13 is un-applyable in practice until this passes.
        self.assert_accepted(
            schema_version=self.V13, runtime_privileges=V13_RUNTIME_GRANTS
        )

    def test_v13_entitlement_read_grant_is_rejected_below_schema_13(self) -> None:
        self.assert_rejected(
            schema_version=self.PRE_V13, runtime_privileges=V13_RUNTIME_GRANTS
        )

    def test_an_unscoped_entitlement_read_is_rejected_at_schema_13(self) -> None:
        # The grant is what v13 makes, but forced RLS plus exactly the one
        # billing_entitlements_self_read policy is what keeps it to the
        # session's own workspace. Without that scoping the same grant is a
        # cross-workspace entitlement read, and tolerating it would be a real
        # relaxation of what the guard rejected before it became version-aware.
        self.assert_rejected(
            schema_version=self.V13,
            runtime_privileges=V13_RUNTIME_GRANTS,
            entitlement_read_scoped=False,
            message=self.UNSCOPED_MESSAGE,
        )

    def test_a_widened_predicate_on_the_v13_policy_name_is_rejected(self) -> None:
        # Codex's finding on #499. Name, command, permissiveness and role are
        # all trivially reproducible, so a policy recreated as
        #   create policy billing_entitlements_self_read
        #     on app_private.billing_entitlements for select
        #     to supermega_trial_backend using (true);
        # satisfies every shape condition while exposing every workspace's
        # entitlement row to the runtime role. Only the predicate fingerprint
        # separates it from v13's workspace-GUC predicate. The shape flag stays
        # True here on purpose: this case must be caught by the digest alone.
        self.assert_rejected(
            schema_version=self.V13,
            runtime_privileges=V13_RUNTIME_GRANTS,
            entitlement_read_scoped=True,
            entitlement_read_predicate=WIDENED_READ_POLICY_PREDICATE,
            message=self.UNSCOPED_MESSAGE,
        )

    def test_a_missing_scoping_policy_reports_no_predicate_and_is_rejected(self) -> None:
        # No policy of that name means the predicate subquery returns NULL AND
        # the shape check fails, because that check requires exactly one policy
        # carrying v13's name. Both are set here so the fixture corresponds to a
        # state a real database can actually be in.
        self.assert_rejected(
            schema_version=self.V13,
            runtime_privileges=V13_RUNTIME_GRANTS,
            entitlement_read_scoped=False,
            entitlement_read_predicate=None,
            message=self.UNSCOPED_MESSAGE,
        )

    def test_unscoped_entitlements_without_the_grant_stay_accepted(self) -> None:
        # No grant means no read to scope: neither the RLS shape nor the policy
        # predicate is this guard's business without one, and failing here would
        # ground the billing CLI for nothing.
        database, ledger = self.ledger_for(
            schema_version=self.V13,
            runtime_privileges=frozenset(),
            entitlement_read_scoped=False,
            entitlement_read_predicate=WIDENED_READ_POLICY_PREDICATE,
        )
        with patch.object(billing_rail_module, "BILLING_SCHEMA_VERSION", self.V13):
            self.issue(ledger)
        self.assertEqual(len(database.invoices), 1)

    def test_a_fully_dark_runtime_role_is_accepted_at_every_version(self) -> None:
        # v13 PERMITS the read, it is not required: a target holding less than
        # v13 allows is not the anomaly this guard exists to catch, and no
        # ledger write depends on the runtime role's grant.
        for schema_version in self.SCHEMA_VERSIONS:
            with self.subTest(schema_version=schema_version):
                self.assert_accepted(
                    schema_version=schema_version, runtime_privileges=frozenset()
                )

    def test_entitlement_write_grants_are_rejected_at_every_version(self) -> None:
        for schema_version in self.SCHEMA_VERSIONS:
            for privilege in ("INSERT", "UPDATE", "DELETE"):
                with self.subTest(schema_version=schema_version, privilege=privilege):
                    # Alongside the read v13 does grant, so the rejection can
                    # only come from the write privilege itself.
                    self.assert_rejected(
                        schema_version=schema_version,
                        runtime_privileges=V13_RUNTIME_GRANTS
                        | {("billing_entitlements", privilege)},
                    )

    def test_any_invoice_or_event_grant_is_rejected_at_every_version(self) -> None:
        for schema_version in self.SCHEMA_VERSIONS:
            for table in FOUNDER_ONLY_BILLING_TABLES:
                for privilege in BILLING_PRIVILEGES:
                    with self.subTest(
                        schema_version=schema_version, table=table, privilege=privilege
                    ):
                        self.assert_rejected(
                            schema_version=schema_version,
                            runtime_privileges=V13_RUNTIME_GRANTS | {(table, privilege)},
                        )


class RefundDigestScopingTests(unittest.TestCase):
    """The invoiceDigest scope of _prior_refund_total is enforced TWICE on
    purpose: the predicate is pushed into the SQL (so only one invoice's
    refund rows ever cross the wire) AND re-applied row-by-row in Python (so
    the cumulative-refund bound stays correct even against a transport that
    does not honor the predicate). FakeBillingCursor's refund branch is
    exactly such a transport -- it returns EVERY billing.refund.recorded
    event for the workspace regardless of digest -- so the ledger-level tests
    here prove the Python filter is live defense-in-depth, not dead code."""

    SECOND_INVOICE_ID = "INV-TEST-0002"

    def setUp(self) -> None:
        self.database = FakeBillingDatabase()
        self.ledger = BillingLedger(DATABASE_URL, connection_factory=self.database.connect)
        # The read path no longer accepts the administrative credential, so the
        # projection is read over a second ledger bound to the bounded read
        # connection -- one database, two credentials, as A2 describes.
        self.read_ledger = BillingLedger(
            DATABASE_URL, connection_factory=self.database.connect_read
        )
        self.digest = _digest(sample_invoice_core())

    def issue_and_pay(self, packet: dict[str, object], invoice_id: str, suffix: str) -> None:
        self.ledger.issue_invoice(
            packet,
            workspace_id=WORKSPACE_ID,
            evidence=founder_evidence(f"issue-{suffix}", "viber:handover:2026-08-17"),
        )
        self.ledger.confirm_payment(
            workspace_id=WORKSPACE_ID,
            invoice_id=invoice_id,
            expected_revision=1,
            payment_reference=f"KBZ-2026-08-17-{suffix}",
            channel_category="mobile_money",
            paid_at="2026-08-17T03:30:00.000Z",
            evidence=founder_evidence(f"confirm-{suffix}", f"KBZ-2026-08-17-{suffix}"),
        )

    def record_refund(self, digest: str, amount_minor: int, reference: str) -> dict[str, object]:
        return self.ledger.record_refund(
            workspace_id=WORKSPACE_ID,
            invoice_digest=digest,
            amount_minor=amount_minor,
            channel_category="mobile_money",
            refund_reference=reference,
            evidence=founder_evidence(f"refund-{reference}", reference),
        )

    def test_prior_refund_query_binds_the_digest_as_a_sql_parameter(self) -> None:
        self.issue_and_pay(sample_packet(), INVOICE_ID, "0001")
        self.record_refund(self.digest, 1000, "WAVE-REFUND-0001")
        refund_selects = [
            (sql, values)
            for sql, values in self.database.statements
            if sql.startswith("select") and "billing.refund.recorded" in sql
        ]
        self.assertTrue(refund_selects, self.database.statements)
        for sql, values in refund_selects:
            # The fake lowercases recorded SQL, so the JSON key reads
            # 'invoicedigest' here; the predicate itself is what matters.
            self.assertIn("payload_json ->> 'invoicedigest' = %s", sql)
            # The digest travels as a bind parameter, never interpolated.
            self.assertEqual(values, (WORKSPACE_ID, self.digest))

    def test_python_side_filter_excludes_rows_a_lax_transport_returns(self) -> None:
        foreign_digest = _digest({"fixture": "a different sealed invoice"})
        seed_refund_event(
            self.database, reference="WAVE-REFUND-OWN-0001", digest=self.digest, amount_minor=40000
        )
        seed_refund_event(
            self.database,
            reference="WAVE-REFUND-FOREIGN-0001",
            digest=foreign_digest,
            amount_minor=99999,
        )
        # Defensive row parsing: non-mapping payloads and non-int amounts
        # (bool included) never count toward the total.
        seed_refund_event(
            self.database,
            reference="WAVE-REFUND-JUNK-0001",
            payload_json=json.dumps(["not", "a", "packet"]),
        )
        seed_refund_event(
            self.database, reference="WAVE-REFUND-BOOL-0001", digest=self.digest, amount_minor=True
        )
        seed_refund_event(
            self.database,
            reference="WAVE-REFUND-STRING-0001",
            digest=self.digest,
            amount_minor="5000",
        )

        # First pin the premise this test rests on: FakeBillingCursor ignores
        # the digest predicate and hands back EVERY refund row for the
        # workspace. If the fake ever gains predicate fidelity, this fails
        # loudly instead of the filter assertions going vacuously green.
        cursor = FakeBillingCursor(self.database, self.database.connecting_privileges)
        cursor.execute(
            """
            select payload_json
            from app_private.billing_events
            where workspace_id = %s
              and event_type = 'billing.refund.recorded'
              and payload_json ->> 'invoiceDigest' = %s
            """,
            (WORKSPACE_ID, self.digest),
        )
        self.assertEqual(len(cursor.fetchall()), 5)

        # Any sum other than the digest-scoped one means the Python filter
        # has gone dead.
        self.assertEqual(
            BillingLedger._prior_refund_total(cursor, WORKSPACE_ID, self.digest), 40000
        )
        self.assertEqual(
            BillingLedger._prior_refund_total(cursor, WORKSPACE_ID, foreign_digest), 99999
        )

    def test_refund_totals_never_cross_contaminate_between_digests(self) -> None:
        self.issue_and_pay(sample_packet(), INVOICE_ID, "0001")
        variant = packet_variant(self.SECOND_INVOICE_ID, "2026-08-31")
        variant_digest = str(variant["invoiceDigest"])
        self.assertNotEqual(variant_digest, self.digest)
        self.issue_and_pay(variant, self.SECOND_INVOICE_ID, "0002")

        # Fully refund the first invoice.
        first = self.record_refund(self.digest, 125000, "WAVE-REFUND-A-0001")
        self.assertEqual(first["status"], "refund_recorded")
        # The second invoice's full refund must still fit: if the first
        # invoice's refunds leaked into this digest's cumulative sum (the
        # fake DOES return them), this would be rejected as an over-refund.
        second = self.record_refund(variant_digest, 125000, "WAVE-REFUND-B-0001")
        self.assertEqual(second["status"], "refund_recorded")

        # Both invoices are now individually exhausted -- one more minor unit
        # against either digest is an over-refund.
        for digest, reference in (
            (self.digest, "WAVE-REFUND-A-0002"),
            (variant_digest, "WAVE-REFUND-B-0002"),
        ):
            with self.subTest(digest=digest[:16]):
                with self.assertRaises(BillingRailConflict):
                    self.record_refund(digest, 1, reference)


class OverdueReportTests(unittest.TestCase):
    """READ-ONLY overdue projection carried by get_billing_state (first-month
    lifecycle fix: the rail stored dueDate but nothing ever computed overdue).
    Pure projection over the recorded invoices and billing_events -- these
    tests also prove the report path issues no mutating statement."""

    def setUp(self) -> None:
        self.database = FakeBillingDatabase()
        self.ledger = BillingLedger(DATABASE_URL, connection_factory=self.database.connect)
        # The read path no longer accepts the administrative credential, so the
        # projection is read over a second ledger bound to the bounded read
        # connection -- one database, two credentials, as A2 describes.
        self.read_ledger = BillingLedger(
            DATABASE_URL, connection_factory=self.database.connect_read
        )
        self.digest = _digest(sample_invoice_core())

    def issue(self, packet: dict[str, object] | None = None, action_id: str = "issue-0001") -> dict[str, object]:
        return self.ledger.issue_invoice(
            packet if packet is not None else sample_packet(),
            workspace_id=WORKSPACE_ID,
            evidence=founder_evidence(action_id, "viber:handover:2026-08-17"),
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

    def report(self, as_of: datetime = NOW) -> dict[str, object]:
        return self.read_ledger.get_billing_state(WORKSPACE_ID, as_of=as_of)["overdueReport"]

    def seed_refund_event(self, amount_minor: int, reference: str) -> None:
        seed_refund_event(
            self.database, reference=reference, digest=self.digest, amount_minor=amount_minor
        )

    def test_overdue_invoice_appears_with_days_and_amount_and_no_mutation(self) -> None:
        self.issue()
        before = len(self.database.statements)
        report = self.report()
        report_statements = self.database.statements[before:]
        # NO mutation: the report path is selects inside one read-only
        # transaction, nothing else.
        self.assertTrue(
            all(
                sql.startswith(("select", "set transaction")) for sql, _params in report_statements
            ),
            report_statements,
        )
        self.assertEqual(report["contract"], BILLING_OVERDUE_REPORT_CONTRACT)
        self.assertEqual(report["asOf"], CAPTURED_AT)
        self.assertEqual(
            report["overdueInvoices"],
            [
                {
                    "invoiceId": INVOICE_ID,
                    "invoiceDigest": self.digest,
                    "dueDate": "2026-08-15",
                    "daysOverdue": 2,
                    "currency": "MMK",
                    "totalMinor": 125000,
                    "refundedMinor": 0,
                    "outstandingMinor": 125000,
                }
            ],
        )
        self.assertEqual(report["totalOutstandingMinorByCurrency"], {"MMK": 125000})
        self.assertEqual(report["excluded"], [])

    def test_due_today_is_not_yet_overdue(self) -> None:
        self.issue()
        due_day = self.report(as_of=datetime(2026, 8, 15, 23, 59, tzinfo=timezone.utc))
        self.assertEqual(due_day["overdueInvoices"], [])
        self.assertEqual(due_day["totalOutstandingMinorByCurrency"], {})
        day_after = self.report(as_of=datetime(2026, 8, 16, 0, 30, tzinfo=timezone.utc))
        self.assertEqual(day_after["overdueInvoices"][0]["daysOverdue"], 1)

    def test_paid_and_void_invoices_are_not_overdue(self) -> None:
        self.issue()
        self.confirm()
        self.issue(packet_variant("INV-TEST-0002", "2026-08-01"), action_id="issue-0002")
        self.ledger.void_invoice(
            workspace_id=WORKSPACE_ID,
            invoice_id="INV-TEST-0002",
            expected_revision=1,
            evidence=founder_evidence("void-0002", "renegotiated"),
        )
        report = self.report()
        self.assertEqual(report["overdueInvoices"], [])
        self.assertEqual(report["totalOutstandingMinorByCurrency"], {})
        self.assertEqual(report["excluded"], [])

    def test_partially_refunded_invoice_shows_net_outstanding(self) -> None:
        self.issue()
        self.seed_refund_event(25000, "WAVE-REFUND-0001")
        entry = self.report()["overdueInvoices"][0]
        self.assertEqual(entry["refundedMinor"], 25000)
        self.assertEqual(entry["outstandingMinor"], 100000)
        self.assertEqual(
            self.report()["totalOutstandingMinorByCurrency"], {"MMK": 100000}
        )
        # A second, distinct refund reference nets further.
        self.seed_refund_event(10000, "WAVE-REFUND-0002")
        entry = self.report()["overdueInvoices"][0]
        self.assertEqual(entry["refundedMinor"], 35000)
        self.assertEqual(entry["outstandingMinor"], 90000)

    def test_replayed_or_duplicate_events_do_not_double_count(self) -> None:
        first = self.issue()
        replay = self.issue()
        self.assertFalse(first["replayed"])
        self.assertTrue(replay["replayed"])
        report = self.report()
        self.assertEqual(len(report["overdueInvoices"]), 1)
        self.assertEqual(report["totalOutstandingMinorByCurrency"], {"MMK": 125000})
        # Replaying the same refund command lands on the same primary key: one
        # durable event, counted once.
        self.seed_refund_event(25000, "WAVE-REFUND-0001")
        self.seed_refund_event(25000, "WAVE-REFUND-0001")
        entry = self.report()["overdueInvoices"][0]
        self.assertEqual(entry["refundedMinor"], 25000)
        self.assertEqual(entry["outstandingMinor"], 100000)

    def test_unparseable_due_date_is_excluded_with_note(self) -> None:
        # "TBD" passes packet validation (dueDate is canonical visible text,
        # not a validated date), so the report must exclude it with a note
        # rather than guess.
        self.issue(packet_variant("INV-TEST-0003", "TBD"), action_id="issue-0003")
        report = self.report()
        self.assertEqual(report["overdueInvoices"], [])
        self.assertEqual(report["totalOutstandingMinorByCurrency"], {})
        self.assertEqual(len(report["excluded"]), 1)
        self.assertEqual(report["excluded"][0]["invoiceId"], "INV-TEST-0003")
        self.assertIn("dueDate", report["excluded"][0]["note"])

    def test_sorted_most_overdue_first_with_currency_total(self) -> None:
        self.issue()  # due 2026-08-15 -> 2 days overdue at NOW
        self.issue(packet_variant("INV-TEST-0002", "2026-08-01"), action_id="issue-0002")
        report = self.report()
        self.assertEqual(
            [entry["invoiceId"] for entry in report["overdueInvoices"]],
            ["INV-TEST-0002", INVOICE_ID],
        )
        self.assertEqual(
            [entry["daysOverdue"] for entry in report["overdueInvoices"]], [16, 2]
        )
        self.assertEqual(report["totalOutstandingMinorByCurrency"], {"MMK": 250000})

    def test_naive_as_of_fails_closed(self) -> None:
        with self.assertRaises(BillingRailError):
            self.read_ledger.get_billing_state(WORKSPACE_ID, as_of=datetime(2026, 8, 17, 4, 0))


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


class BillingRailCliTests(unittest.TestCase):
    """Drives the real CLI entrypoint (main) end-to-end against the same
    FakeBillingDatabase used by BillingLedgerTests. main() builds its own
    BillingLedger(database_url) with no connection_factory hook -- exactly
    like managed_activation.py's CLI -- so the fake transport is installed by
    patching BillingLedger._connect for the duration of each test, the same
    "swap only the transport" idea as FakeBillingConnection itself."""

    def setUp(self) -> None:
        self.database = FakeBillingDatabase()
        self._tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tempdir.cleanup)
        self.directory = Path(self._tempdir.name)
        # The transport now dispatches on the URL, because after A2 the two
        # billing credentials are two different URLs: the administrative one
        # that mutates and the bounded read one that only projects. Which URL
        # file a subcommand is pointed at is the whole subject of these tests.
        patcher = patch.object(
            BillingLedger,
            "_connect",
            lambda ledger_self: (
                self.database.connect_read(ledger_self._database_url)
                if ledger_self._database_url == READ_DATABASE_URL
                else self.database.connect(ledger_self._database_url)
            ),
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.database_url_file = self._write_text("database-url.txt", DATABASE_URL)
        self.read_database_url_file = self._write_text(
            "read-database-url.txt", READ_DATABASE_URL
        )

    def _write_text(self, name: str, content: str) -> str:
        path = self.directory / name
        path.write_text(content, encoding="utf-8")
        return str(path)

    def _write_json(self, name: str, value: object) -> str:
        return self._write_text(name, json.dumps(value))

    @staticmethod
    def run_cli(argv: list[str]) -> tuple[int, str]:
        output = StringIO()
        with redirect_stdout(output):
            code = main(argv)
        return code, output.getvalue()

    def test_issue_invoice_cli_records_a_real_invoice_and_prints_the_receipt(self) -> None:
        packet_file = self._write_json("packet.json", sample_packet())
        evidence_file = self._write_json(
            "evidence.json", founder_evidence("issue-0001", "viber:handover:2026-08-17")
        )
        code, stdout = self.run_cli(
            [
                "issue-invoice",
                "--database-url-file", self.database_url_file,
                "--workspace-id", WORKSPACE_ID,
                "--evidence-file", evidence_file,
                "--confirm-billing-action", CONFIRM_BILLING_ACTION_PHRASE,
                "--packet-file", packet_file,
            ]
        )
        self.assertEqual(code, 0)
        result = json.loads(stdout)
        self.assertEqual(result["contract"], BILLING_EVENT_RESULT_CONTRACT)
        self.assertEqual(result["status"], "issued")
        self.assertEqual(result["invoiceId"], INVOICE_ID)
        self.assertFalse(result["replayed"])
        self.assertFalse(result["secretValuesExposed"])
        self.assertIn((WORKSPACE_ID, INVOICE_ID), self.database.invoices)

    def test_missing_confirm_billing_action_is_rejected_before_any_database_call(self) -> None:
        packet_file = self._write_json("packet.json", sample_packet())
        evidence_file = self._write_json(
            "evidence.json", founder_evidence("issue-0001", "viber:handover:2026-08-17")
        )
        with redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit) as raised:
                main(
                    [
                        "issue-invoice",
                        "--database-url-file", self.database_url_file,
                        "--workspace-id", WORKSPACE_ID,
                        "--evidence-file", evidence_file,
                        "--packet-file", packet_file,
                    ]
                )
        self.assertEqual(raised.exception.code, 2)
        self.assertEqual(self.database.statements, [])
        self.assertEqual(self.database.invoices, {})

    def test_wrong_confirmation_phrase_is_rejected_before_any_database_call(self) -> None:
        code, stdout = self.run_cli(
            [
                "void-invoice",
                "--database-url-file", self.database_url_file,
                "--workspace-id", WORKSPACE_ID,
                "--evidence-file", self._write_json("evidence.json", founder_evidence("void-0001", "renegotiated")),
                "--confirm-billing-action", "please do the thing",
                "--invoice-id", INVOICE_ID,
                "--expected-revision", "1",
            ]
        )
        self.assertEqual(code, 1)
        result = json.loads(stdout)
        self.assertEqual(result["status"], "blocked")
        self.assertIn("confirm-billing-action", result["error"])
        self.assertFalse(result["externalMutationPerformed"])
        self.assertFalse(result["secretValuesExposed"])
        # The confirmation phrase is checked before the database URL file is
        # even read, so the fake transport was never touched.
        self.assertEqual(self.database.statements, [])

    def test_status_cli_returns_get_billing_state_shape(self) -> None:
        code, stdout = self.run_cli(
            [
                "status",
                "--database-url-file", self.read_database_url_file,
                "--workspace-id", WORKSPACE_ID,
            ]
        )
        self.assertEqual(code, 0)
        result = json.loads(stdout)
        self.assertEqual(result["contract"], BILLING_STATE_CONTRACT)
        self.assertEqual(result["workspaceId"], WORKSPACE_ID)
        self.assertEqual(result["invoices"], [])
        self.assertFalse(result["premiumUnlocked"])
        self.assertEqual(result["entitlement"]["tier"], PREMIUM_TIER)
        self.assertEqual(result["entitlement"]["status"], "none")
        self.assertEqual(result["overdueReport"]["contract"], BILLING_OVERDUE_REPORT_CONTRACT)
        self.assertEqual(result["overdueReport"]["overdueInvoices"], [])
        self.assertEqual(result["overdueReport"]["excluded"], [])
        self.assertEqual(result["overdueReport"]["totalOutstandingMinorByCurrency"], {})

    def test_status_cli_surfaces_the_overdue_report(self) -> None:
        packet_file = self._write_json("packet.json", sample_packet())
        evidence_file = self._write_json(
            "evidence.json", founder_evidence("issue-0001", "viber:handover:2026-08-17")
        )
        code, _stdout = self.run_cli(
            [
                "issue-invoice",
                "--database-url-file", self.database_url_file,
                "--workspace-id", WORKSPACE_ID,
                "--evidence-file", evidence_file,
                "--confirm-billing-action", CONFIRM_BILLING_ACTION_PHRASE,
                "--packet-file", packet_file,
            ]
        )
        self.assertEqual(code, 0)
        code, stdout = self.run_cli(
            [
                "status",
                "--database-url-file", self.read_database_url_file,
                "--workspace-id", WORKSPACE_ID,
            ]
        )
        self.assertEqual(code, 0)
        report = json.loads(stdout)["overdueReport"]
        self.assertEqual(len(report["overdueInvoices"]), 1)
        entry = report["overdueInvoices"][0]
        self.assertEqual(entry["invoiceId"], INVOICE_ID)
        self.assertEqual(entry["dueDate"], "2026-08-15")
        # The CLI projects "as of now"; the fixture due date is in the past
        # for any run after 2026-08-16, so only the lower bound is stable.
        self.assertGreaterEqual(entry["daysOverdue"], 1)
        self.assertEqual(entry["outstandingMinor"], 125000)
        self.assertEqual(report["totalOutstandingMinorByCurrency"], {"MMK": 125000})

    def test_generic_exception_path_never_leaks_a_raw_driver_message(self) -> None:
        leaky_message = (
            'connection to server at "10.0.0.5", port 5432 failed: '
            'FATAL: password authentication failed for user "postgres"'
        )

        def _boom(_ledger_self):
            raise RuntimeError(leaky_message)

        with patch.object(BillingLedger, "_connect", _boom):
            code, stdout = self.run_cli(
                [
                    "status",
                    "--database-url-file", self.database_url_file,
                    "--workspace-id", WORKSPACE_ID,
                ]
            )
        self.assertEqual(code, 1)
        result = json.loads(stdout)
        self.assertEqual(result["status"], "blocked")
        self.assertNotIn("password", result["error"])
        self.assertNotIn("10.0.0.5", result["error"])
        self.assertNotIn("postgres", result["error"])
        self.assertNotIn(leaky_message, stdout)
        self.assertFalse(result["secretValuesExposed"])
        self.assertFalse(result["externalMutationPerformed"])


if __name__ == "__main__":
    unittest.main()
