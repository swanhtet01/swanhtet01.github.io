from __future__ import annotations

from contextlib import contextmanager
import base64
from hashlib import sha256
import json
import unittest
from unittest.mock import patch
from uuid import uuid4

from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    PostgresTrialStore,
    TrialHumanApprovalRequired,
    TrialNotReadyError,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialStoreError,
    TrialValidationError,
    _shop_correction_consumption_digest,
)
from supermega_runtime.shop_correction_receipts import (
    SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS,
    ShopCorrectionReceiptSigner,
)
from tests.test_shop_correction_authorization import (
    OWNER_ID,
    SESSION_ID,
    TEST_SIGNER,
    WORKSPACE_ID,
    _principal,
    _request_body,
    _store,
)


def _compact(query: object) -> str:
    return " ".join(str(query).split()).lower()


class _Store(PostgresTrialStore):
    def __init__(self, cursor, *, signer=TEST_SIGNER) -> None:
        super().__init__(
            "postgresql://unused",
            reducer=lambda *_args: {},
            write_enabled=True,
            shop_correction_signer=signer,
        )
        self.cursor = cursor
        self.guards: list[tuple[bool, str | None]] = []

    @contextmanager
    def _guarded_cursor(self, principal, *, write, capability=None):
        self.guards.append((write, capability))
        yield self.cursor, frozenset({"commerce.write"})

    @staticmethod
    def _product_entitlements(_cursor, _workspace_id):
        return ("commerce",)


class _StatusCursor:
    def __init__(self, lineage_id: str) -> None:
        self.lineage_id = lineage_id
        self.next_row = None
        self.executions: list[tuple[str, tuple | None]] = []

    def execute(self, query, params=None):
        sql = _compact(query)
        self.executions.append((sql, params))
        self.next_row = None
        if "select owner_actor_id" in sql:
            self.next_row = {"owner_actor_id": OWNER_ID}
        elif "from app_private.shop_correction_lineages" in sql:
            self.next_row = {
                "lineage_id": self.lineage_id,
                "lineage_epoch": 1,
                "current_consumption_ordinal": 0,
                "current_consumption_digest": None,
            }

    def fetchone(self):
        row, self.next_row = self.next_row, None
        return row


class _LineageCursor:
    def __init__(self) -> None:
        self.next_row = None
        self.executions: list[tuple[str, tuple | None]] = []
        self.lineage_row = None
        self.projection_inserts = 0
        self.audit_inserts = 0

    def execute(self, query, params=None):
        sql = _compact(query)
        self.executions.append((sql, params))
        self.next_row = None
        if "select owner_actor_id" in sql:
            self.next_row = {"owner_actor_id": OWNER_ID}
        elif "where workspace_id = %s and activation_request_id = %s" in sql:
            self.next_row = self.lineage_row
        elif "where workspace_id = %s and superseded_at is null" in sql:
            self.next_row = self.lineage_row
        elif "insert into app_private.shop_correction_lineages" in sql:
            self.projection_inserts += 1
            self.lineage_row = {
                "workspace_id": params[0],
                "lineage_id": params[1],
                "lineage_epoch": params[2],
                "activation_request_id": params[3],
                "actor_id": params[5],
                "previous_lineage_id": params[7],
                "previous_lineage_epoch": params[8],
                "current_consumption_ordinal": params[11],
                "current_consumption_digest": params[12],
                "activated_at_millis": 1_800_000_000_000,
            }
        elif "insert into app_private.workspace_events" in sql:
            self.audit_inserts += 1

    def fetchone(self):
        row, self.next_row = self.next_row, None
        return row


class _ConsumptionCursor:
    def __init__(self, *, receipt, payload, lineage_id: str) -> None:
        self.receipt = receipt
        self.payload = payload
        self.lineage_id = lineage_id
        self.next_row = None
        self.executions: list[tuple[str, tuple | None]] = []
        self.consumption_row = None
        self.audit_inserts = 0
        self.clock_millis = receipt.issued_at_millis + 100

    def execute(self, query, params=None):
        sql = _compact(query)
        self.executions.append((sql, params))
        self.next_row = None
        if "select owner_actor_id" in sql:
            self.next_row = {"owner_actor_id": OWNER_ID}
        elif (
            "from app_private.shop_correction_lineages" in sql
            and "superseded_at is null" in sql
        ):
            self.next_row = {
                "workspace_id": WORKSPACE_ID,
                "activation_request_id": str(uuid4()),
                "lineage_id": self.lineage_id,
                "lineage_epoch": 1,
                "previous_lineage_id": None,
                "previous_lineage_epoch": None,
                "actor_id": OWNER_ID,
                "current_consumption_ordinal": (
                    0
                    if self.consumption_row is None
                    else self.consumption_row["consumption_ordinal"]
                ),
                "current_consumption_digest": (
                    None
                    if self.consumption_row is None
                    else self.consumption_row["history_digest"]
                ),
                "activated_at_millis": 1_799_999_999_000,
            }
        elif "from app_private.shop_correction_consumptions" in sql:
            self.next_row = self.consumption_row
        elif (
            "from app_private.workspace_events" in sql
            and "result_json ->> 'receiptid'" in sql
        ):
            self.next_row = {
                "payload_json": self.payload,
                "result_json": self.receipt.to_dict(),
            }
        elif "transaction_timestamp()" in sql and "consumed_at_millis" in sql:
            self.next_row = {"consumed_at_millis": self.clock_millis}
        elif "insert into app_private.shop_correction_consumptions" in sql:
            self.consumption_row = {
                "workspace_id": params[0],
                "consumption_id": params[1],
                "consumption_request_id": params[2],
                "authorization_receipt_id": params[3],
                "authorization_receipt_digest": params[4],
                "actor_id": params[5],
                "capability": params[7],
                "semantic_target_id": params[8],
                "command_digest": params[10],
                "lineage_id": params[11],
                "lineage_epoch": params[12],
                "consumption_ordinal": params[13],
                "previous_consumption_digest": params[14],
                "history_digest": params[15],
                "consumed_at_millis": params[16],
                "key_id": params[17],
                "signature": params[18],
            }
        elif "update app_private.shop_correction_lineages" in sql:
            self.next_row = {
                "current_consumption_ordinal": params[0],
                "current_consumption_digest": params[1],
            }
        elif "insert into app_private.workspace_events" in sql:
            self.audit_inserts += 1

    def fetchone(self):
        row, self.next_row = self.next_row, None
        return row


class ShopCorrectionPostgresStoreMockTests(unittest.TestCase):
    def test_non_human_and_non_supabase_principals_fail_before_database_guard(self):
        cursor = _StatusCursor(str(uuid4()))
        store = _Store(cursor)
        service = TrialPrincipal(
            workspace_id=WORKSPACE_ID,
            actor_id=OWNER_ID,
            actor_kind="service",
            authenticated=True,
            session_id=SESSION_ID,
            identity_provider="supabase",
        )
        with self.assertRaises(TrialHumanApprovalRequired):
            store.get_shop_correction_reconciliation_status(
                service,
                lineage_id=str(uuid4()),
                lineage_epoch=1,
                local_consumption_ordinal=0,
                local_consumption_digest=None,
            )
        local = TrialPrincipal(
            workspace_id=WORKSPACE_ID,
            actor_id=OWNER_ID,
            actor_kind="human",
            authenticated=True,
            session_id=SESSION_ID,
            identity_provider="local",
        )
        with self.assertRaises(TrialPermissionDenied):
            store.get_shop_correction_reconciliation_status(
                local,
                lineage_id=str(uuid4()),
                lineage_epoch=1,
                local_consumption_ordinal=0,
                local_consumption_digest=None,
            )
        self.assertEqual(store.guards, [])
        self.assertEqual(cursor.executions, [])

    def test_new_decision_flag_is_strict_boolean_before_database_guard(self):
        store = _Store(_StatusCursor(str(uuid4())))
        with self.assertRaises(TrialValidationError):
            store.consume_shop_correction_authorization(
                _principal(),
                consumption_request_id=str(uuid4()),
                authorization_receipt_id=str(uuid4()),
                authorization_receipt_digest="a" * 64,
                lineage_id=str(uuid4()),
                lineage_epoch=1,
                capability="shop.sale.reverse",
                semantic_target_id="sale-1",
                command_digest="b" * 64,
                allow_new_decision="open",
            )
        self.assertEqual(store.guards, [])

    def test_status_uses_read_guard_and_performs_no_insert_or_lock(self):
        lineage_id = str(uuid4())
        cursor = _StatusCursor(lineage_id)
        store = _Store(cursor)
        status = store.get_shop_correction_reconciliation_status(
            _principal(),
            lineage_id=lineage_id,
            lineage_epoch=1,
            local_consumption_ordinal=0,
            local_consumption_digest=None,
        )
        self.assertEqual(status.state, "current")
        self.assertEqual(store.guards, [(False, "commerce.write")])
        sql = [query for query, _ in cursor.executions]
        self.assertFalse(any("insert into" in query for query in sql))
        self.assertFalse(any("pg_advisory_xact_lock" in query for query in sql))

    def test_initial_lineage_locks_then_inserts_projection_and_audit_once(self):
        cursor = _LineageCursor()
        store = _Store(cursor)
        record = store.activate_shop_correction_lineage(
            _principal(),
            activation_request_id=str(uuid4()),
            lineage_id=str(uuid4()),
            expected_previous_lineage_id=None,
            expected_previous_lineage_epoch=None,
            local_consumption_ordinal=0,
            local_consumption_digest=None,
        )
        self.assertEqual(record.lineage_epoch, 1)
        self.assertEqual(store.guards, [(True, "commerce.write")])
        self.assertEqual(cursor.projection_inserts, 1)
        self.assertEqual(cursor.audit_inserts, 1)
        sql = [query for query, _ in cursor.executions]
        locks = [index for index, query in enumerate(sql) if "pg_advisory_xact_lock" in query]
        insert = next(index for index, query in enumerate(sql) if "insert into app_private.shop_correction_lineages" in query)
        self.assertEqual(len(locks), 2)
        self.assertLess(max(locks), insert)

    def test_first_consumption_locks_before_server_time_and_commits_one_proof(self):
        authority = _store()
        body = _request_body()
        receipt = authority.issue_shop_correction_authorization(_principal(), **body)
        lineage_id = str(uuid4())
        payload = {
            "contract": "supermega.shop.correction-authorization-receipt.v3",
            "authorizationRequestId": receipt.finalization_request_id,
            "capability": body["capability"],
            "commandDigest": body["command_digest"],
            "command": {
                "saleId": "sale-1",
            }
        }
        cursor = _ConsumptionCursor(
            receipt=receipt,
            payload=payload,
            lineage_id=lineage_id,
        )
        store = _Store(cursor)
        proof = store.consume_shop_correction_authorization(
            _principal(),
            consumption_request_id=str(uuid4()),
            authorization_receipt_id=receipt.receipt_id,
            authorization_receipt_digest=receipt.receipt_digest,
            lineage_id=lineage_id,
            lineage_epoch=1,
            capability=body["capability"],
            semantic_target_id="sale-1",
            command_digest=body["command_digest"],
            allow_new_decision=True,
        )
        self.assertEqual(proof.consumption_ordinal, 1)
        self.assertEqual(proof.consumed_at_millis, cursor.clock_millis)
        self.assertFalse(proof.to_dict()["moneyMovementPerformed"])
        self.assertFalse(proof.to_dict()["localMutationPerformed"])
        self.assertEqual(cursor.audit_inserts, 1)
        sql = [query for query, _ in cursor.executions]
        locks = [index for index, query in enumerate(sql) if "pg_advisory_xact_lock" in query]
        clock = next(index for index, query in enumerate(sql) if "transaction_timestamp()" in query and "consumed_at_millis" in query)
        projection = next(index for index, query in enumerate(sql) if "insert into app_private.shop_correction_consumptions" in query)
        self.assertEqual(len(locks), 3)
        self.assertLess(max(locks), clock)
        self.assertLess(clock, projection)
        self.assertEqual(store.guards, [(True, "commerce.write")])

    def test_malformed_stored_authorization_json_fails_closed(self):
        authority = _store()
        body = _request_body()
        receipt = authority.issue_shop_correction_authorization(_principal(), **body)
        lineage_id = str(uuid4())
        cursor = _ConsumptionCursor(
            receipt=receipt,
            payload="{",
            lineage_id=lineage_id,
        )
        store = _Store(cursor)
        with self.assertRaises(TrialStoreError):
            store.consume_shop_correction_authorization(
                _principal(),
                consumption_request_id=str(uuid4()),
                authorization_receipt_id=receipt.receipt_id,
                authorization_receipt_digest=receipt.receipt_digest,
                lineage_id=lineage_id,
                lineage_epoch=1,
                capability=body["capability"],
                semantic_target_id="sale-1",
                command_digest=body["command_digest"],
                allow_new_decision=True,
            )
        self.assertIsNone(cursor.consumption_row)

    def test_historical_consumption_uses_retained_public_pin_after_key_rotation(self):
        body = _request_body()
        lineage_id = str(uuid4())
        request_id = str(uuid4())
        receipt_id = str(uuid4())
        consumption_id = str(uuid4())
        consumed_at = 1_800_000_000_000
        history = _shop_correction_consumption_digest(
            consumption_id=consumption_id,
            consumption_request_id=request_id,
            authorization_receipt_id=receipt_id,
            authorization_receipt_digest="a" * 64,
            workspace_id=WORKSPACE_ID,
            actor_id=OWNER_ID,
            capability=body["capability"],
            semantic_target_id="sale-1",
            command_digest=body["command_digest"],
            lineage_id=lineage_id,
            lineage_epoch=1,
            consumption_ordinal=1,
            previous_consumption_digest=None,
            consumed_at_millis=consumed_at,
        )
        cursor = _ConsumptionCursor(
            receipt=type("UnusedReceipt", (), {"issued_at_millis": consumed_at})(),
            payload={},
            lineage_id=lineage_id,
        )
        cursor.consumption_row = {
            "workspace_id": WORKSPACE_ID,
            "consumption_id": consumption_id,
            "consumption_request_id": request_id,
            "authorization_receipt_id": receipt_id,
            "authorization_receipt_digest": "a" * 64,
            "actor_id": OWNER_ID,
            "capability": body["capability"],
            "semantic_target_id": "sale-1",
            "command_digest": body["command_digest"],
            "lineage_id": lineage_id,
            "lineage_epoch": 1,
            "consumption_ordinal": 1,
            "previous_consumption_digest": None,
            "history_digest": history,
            "consumed_at_millis": consumed_at,
            "key_id": TEST_SIGNER.key_id,
            "signature": TEST_SIGNER.sign(receipt_digest=history),
        }
        rotated = ShopCorrectionReceiptSigner.from_private_seed(
            key_id="shop-test-rotated",
            private_seed_base64url=base64.urlsafe_b64encode(
                bytes(reversed(range(32)))
            ).decode().rstrip("="),
        )
        store = _Store(cursor, signer=rotated)
        with patch.dict(
            SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS,
            {TEST_SIGNER.key_id: TEST_SIGNER.public_key_base64url},
            clear=True,
        ):
            proof = store.consume_shop_correction_authorization(
                _principal(),
                consumption_request_id=request_id,
                authorization_receipt_id=receipt_id,
                authorization_receipt_digest="a" * 64,
                lineage_id=lineage_id,
                lineage_epoch=1,
                capability=body["capability"],
                semantic_target_id="sale-1",
                command_digest=body["command_digest"],
                allow_new_decision=False,
            )
        self.assertEqual(proof.history_digest, history)
        self.assertEqual(proof.response_mode, "recover_same_request")

        cursor.consumption_row["key_id"] = "unknown-historical-key"
        with patch.dict(
            SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS,
            {TEST_SIGNER.key_id: TEST_SIGNER.public_key_base64url},
            clear=True,
        ), self.assertRaises(TrialStoreError):
            store.consume_shop_correction_authorization(
                _principal(),
                consumption_request_id=request_id,
                authorization_receipt_id=receipt_id,
                authorization_receipt_digest="a" * 64,
                lineage_id=lineage_id,
                lineage_epoch=1,
                capability=body["capability"],
                semantic_target_id="sale-1",
                command_digest=body["command_digest"],
                allow_new_decision=False,
            )

        cursor.consumption_row["key_id"] = TEST_SIGNER.key_id
        with patch.dict(
            SHOP_CORRECTION_RECEIPT_PUBLIC_KEYS,
            {TEST_SIGNER.key_id: rotated.public_key_base64url},
            clear=True,
        ):
            conflicting_store = _Store(cursor, signer=TEST_SIGNER)
            self.assertFalse(
                conflicting_store.shop_correction_authorization_signing_ready()
            )
            conflicting_authority = _store()
            self.assertFalse(
                conflicting_authority.shop_correction_authorization_signing_ready()
            )
            with self.assertRaises(TrialNotReadyError):
                conflicting_authority.issue_shop_correction_authorization(
                    _principal(), **body
                )
            self.assertEqual(conflicting_authority._events, {})


if __name__ == "__main__":
    unittest.main()
