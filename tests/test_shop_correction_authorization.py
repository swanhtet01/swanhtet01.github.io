from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import os
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient

from supermega_runtime.trial_runtime import (
    SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV,
    create_trial_router,
    shop_correction_global_consumption_ready,
)
from supermega_runtime.shop_correction_receipts import (
    SHOP_CORRECTION_SIGNING_KEY_ENV,
    SHOP_CORRECTION_SIGNING_KEY_ID_ENV,
    ShopCorrectionReceiptSigner,
    verify_shop_correction_signature,
)
from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    PostgresTrialStore,
    TrialAuthorizationExpired,
    TrialIdempotencyConflict,
    TrialStoreError,
    TrialPrincipal,
    shop_correction_authorization_receipt_digest,
    shop_correction_authorization_receipt_v3_digest,
)


WORKSPACE_ID = "shop-correction-test"
OWNER_ID = "11111111-1111-4111-8111-111111111111"
OTHER_ID = "22222222-2222-4222-8222-222222222222"
SESSION_ID = "33333333-3333-4333-8333-333333333333"
TEST_KEY_ID = "shop-test-2026"
TEST_PRIVATE_SEED = base64.urlsafe_b64encode(bytes(range(32))).decode().rstrip("=")
TEST_SIGNER = ShopCorrectionReceiptSigner.from_private_seed(
    key_id=TEST_KEY_ID,
    private_seed_base64url=TEST_PRIVATE_SEED,
)


def _reducer(*_args):
    return {}


def _principal(
    *,
    actor_id: str = OWNER_ID,
    actor_kind: str = "human",
    identity_provider: str = "supabase",
) -> TrialPrincipal:
    return TrialPrincipal(
        workspace_id=WORKSPACE_ID,
        actor_id=actor_id,
        actor_kind=actor_kind,
        authenticated=True,
        session_id=SESSION_ID,
        identity_provider=identity_provider,
    )


def _store(
    *,
    actor_id: str = OWNER_ID,
    owner_id: str = OWNER_ID,
    products: tuple[str, ...] = ("commerce",),
    write_enabled: bool = True,
) -> InMemoryTrialStore:
    store = InMemoryTrialStore(
        reducer=_reducer,
        write_enabled=write_enabled,
        shop_correction_signer=TEST_SIGNER,
    )
    store.provision_membership(
        workspace_id=WORKSPACE_ID,
        actor_id=actor_id,
        actor_kind="human",
        capabilities=("commerce.write",),
    )
    store.provision_product_entitlements(
        workspace_id=WORKSPACE_ID,
        products=products,
    )
    store.provision_workspace_owner(
        workspace_id=WORKSPACE_ID,
        actor_id=owner_id,
    )
    return store


def _reversal_fingerprint(
    *,
    operation_id: str = "reversal-operation-1",
    reason: str = "Customer received the wrong item",
    payment_resolution: str = "cash_returned_now",
) -> str:
    is_cash = payment_resolution == "cash_returned_now"
    return json.dumps(
        {
            "operationId": operation_id,
            "saleId": "sale-1",
            "saleSnapshotDigest": "a" * 64,
            "restockItems": True,
            "reason": reason,
            "cashReturnConfirmed": is_cash,
            "expectedCashShiftId": "shift-1" if is_cash else None,
            "paymentResolution": payment_resolution,
        },
        separators=(",", ":"),
    )


def _wallet_fingerprint(*, operation_id: str = "wallet-reconciliation-1") -> str:
    return json.dumps(
        {
            "operationId": operation_id,
            "reversalId": "reversal-1",
            "originalPaymentMethod": "kbzpay",
            "originalTotalMmk": 15_000,
            "outcome": "money_returned",
            "evidenceReference": "Provider case KBZ-123",
        },
        separators=(",", ":"),
    )


def _request_body(
    *,
    request_id: str | None = None,
    capability: str = "shop.sale.reverse",
    fingerprint: str | None = None,
) -> dict[str, str]:
    if fingerprint is None:
        fingerprint = (
            _reversal_fingerprint()
            if capability == "shop.sale.reverse"
            else _wallet_fingerprint()
        )
    confirmation = {
        "shop.sale.reverse": "AUTHORIZE FULL SALE REVERSAL",
        "shop.sale.reconcile_wallet": "AUTHORIZE WALLET RECONCILIATION",
    }[capability]
    return {
        "authorization_request_id": request_id or str(uuid4()),
        "capability": capability,
        "command_digest": sha256(fingerprint.encode("utf-8")).hexdigest(),
        "request_fingerprint": fingerprint,
        "confirmation": confirmation,
    }


def _client(store: InMemoryTrialStore, principal: TrialPrincipal) -> TestClient:
    app = FastAPI()
    app.include_router(
        create_trial_router(
            store=store,
            resolve_principal=lambda _request: principal,
        )
    )
    return TestClient(app)


class _CorrectionCursor:
    def __init__(self) -> None:
        self.event = None
        self.next_row = None
        self.executions: list[tuple[str, tuple | None]] = []
        self.insert_count = 0
        self.clock_millis = 1_800_000_000_000

    def execute(self, query, params=None) -> None:
        sql = " ".join(str(query).split()).lower()
        self.executions.append((sql, params))
        self.next_row = None
        if "select owner_actor_id" in sql:
            self.next_row = {"owner_actor_id": OWNER_ID}
        elif "payload_json ->> 'authorizationrequestid'" in sql:
            if (
                self.event is not None
                and self.event["payload_json"].get("authorizationRequestId") == params[2]
            ):
                self.next_row = {"command_id": self.event["command_id"]}
        elif "from app_private.workspace_events" in sql:
            if self.event is not None and self.event["command_id"] == params[1]:
                self.next_row = self.event
        elif "clock_timestamp()" in sql:
            self.next_row = {"issued_at_millis": self.clock_millis}
        elif "insert into app_private.workspace_events" in sql:
            self.insert_count += 1
            self.event = {
                "event_type": params[4],
                "actor_id": params[5],
                "actor_kind": params[6],
                "command_fingerprint": params[3],
                "command_id": params[2],
                "payload_json": json.loads(params[7]),
                "result_json": json.loads(params[8]),
            }

    def fetchone(self):
        row = self.next_row
        self.next_row = None
        return row


class _CorrectionPostgresStore(PostgresTrialStore):
    def __init__(self) -> None:
        super().__init__(
            "postgresql://unused",
            reducer=_reducer,
            write_enabled=True,
            shop_correction_signer=TEST_SIGNER,
        )
        self.cursor = _CorrectionCursor()
        self.guard_calls = 0

    @contextmanager
    def _guarded_cursor(self, principal, *, write, capability=None):
        self.guard_calls += 1
        if not write or capability != "commerce.write":
            raise AssertionError("correction issuance must use the guarded commerce writer")
        yield self.cursor, frozenset({"commerce.write"})

    def _product_entitlements(self, _cursor, _workspace_id):
        return ("commerce",)


class ShopCorrectionGlobalConsumptionGateTests(unittest.TestCase):
    def test_global_consumption_defaults_closed_before_auth_or_body(self) -> None:
        self.assertFalse(shop_correction_global_consumption_ready())
        calls = 0

        def resolver(_request):
            nonlocal calls
            calls += 1
            raise AssertionError("closed route must not resolve identity")

        store = _store()
        app = FastAPI()
        app.include_router(
            create_trial_router(store=store, resolve_principal=resolver)
        )
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            response = TestClient(app).post(
                "/api/trial/v1/shop/correction-authorizations",
                content=b"not-json",
                headers={"content-type": "text/plain"},
            )

        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(
            response.json()["detail"]["code"],
            "shop_correction_global_consumption_unavailable",
        )
        self.assertEqual(calls, 0)
        self.assertEqual(store._events, {})


@patch(
    "supermega_runtime.trial_runtime.shop_correction_global_consumption_ready",
    new=lambda: True,
)
class ShopCorrectionAuthorizationTests(unittest.TestCase):
    def test_signature_matches_cross_runtime_fixed_vector(self) -> None:
        digest = (
            "5a5f97683a99e72307cf42b5bdbd682f"
            "ad42fc221d426d811c9a8d631e42aae3"
        )
        self.assertEqual(
            TEST_SIGNER.public_key_base64url,
            "A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg",
        )
        self.assertEqual(
            TEST_SIGNER.sign(receipt_digest=digest),
            (
                "U6guGGkNNvx5Yq9aH1rSQmbE8bGH3PXCEAZYWNQOf_X7-"
                "hE9aWl2Mej8uU7t5OMzjFPJy7GvqcwXTHIPau-oBg"
            ),
        )

    def test_receipt_digest_matches_native_fixed_vector(self) -> None:
        self.assertEqual(
            shop_correction_authorization_receipt_digest(
                source="managed_membership_receipt_v1",
                receipt_id="receipt-1",
                workspace_id="workspace-1",
                actor_id="actor-1",
                actor_label="Owner",
                actor_role="owner",
                capability="shop.sale.reverse",
                command_digest="0" * 64,
                issued_at_millis=1000,
                expires_at_millis=301000,
            ),
            "5a5f97683a99e72307cf42b5bdbd682fad42fc221d426d811c9a8d631e42aae3",
        )
        self.assertEqual(
            shop_correction_authorization_receipt_digest(
                source="managed_membership_receipt_v1",
                receipt_id="receipt-2",
                workspace_id="workspace-1",
                actor_id="actor-1",
                actor_label="Owner",
                actor_role="owner",
                capability="shop.sale.reconcile_wallet",
                command_digest="f" * 64,
                issued_at_millis=2000,
                expires_at_millis=302000,
            ),
            "14b1604b664f7a4761d52336383683756f400b04d5951c843afedaad9a88443d",
        )

    def test_v3_finalization_digest_matches_native_fixed_vector(self) -> None:
        self.assertEqual(
            shop_correction_authorization_receipt_v3_digest(
                source="managed_membership_receipt_v1",
                receipt_id="11111111-1111-4111-8111-111111111111",
                finalization_request_id="22222222-2222-4222-8222-222222222222",
                workspace_id="workspace-1",
                actor_id="actor-1",
                actor_label="Workspace owner",
                actor_role="owner",
                capability="shop.sale.reverse",
                command_digest="0" * 64,
                finalized_at_millis=1000,
                issued_at_millis=1000,
                expires_at_millis=301000,
            ),
            "5bd47b28aba9fda0f821113cad67d159c0ad94c38f052ff1a3efb42a6ce54c7a",
        )

    def test_gate_is_exact_and_checked_before_auth_or_body(self) -> None:
        calls = 0

        def resolver(_request):
            nonlocal calls
            calls += 1
            raise AssertionError("closed route must not resolve identity")

        app = FastAPI()
        app.include_router(
            create_trial_router(store=_store(), resolve_principal=resolver)
        )
        client = TestClient(app)
        for value in ("", "OPEN", "open ", "true"):
            with self.subTest(value=value), patch.dict(
                os.environ,
                {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: value},
            ):
                response = client.post(
                    "/api/trial/v1/shop/correction-authorizations",
                    content=b"not-json",
                    headers={"content-type": "text/plain"},
                )
                self.assertEqual(response.status_code, 503)
                self.assertEqual(
                    response.json()["detail"]["code"],
                    "shop_correction_authorization_window_closed",
                )
        self.assertEqual(calls, 0)

    def test_open_gate_without_signer_fails_before_auth_or_body(self) -> None:
        calls = 0

        def resolver(_request):
            nonlocal calls
            calls += 1
            raise AssertionError("unsigned route must not resolve identity")

        with patch.dict(
            os.environ,
            {
                SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open",
                SHOP_CORRECTION_SIGNING_KEY_ENV: "",
                SHOP_CORRECTION_SIGNING_KEY_ID_ENV: "",
            },
        ):
            store = InMemoryTrialStore(reducer=_reducer, write_enabled=True)
            app = FastAPI()
            app.include_router(
                create_trial_router(store=store, resolve_principal=resolver)
            )
            response = TestClient(app).post(
                "/api/trial/v1/shop/correction-authorizations",
                content=b"not-json",
                headers={"content-type": "text/plain"},
            )

        self.assertEqual(response.status_code, 503, response.text)
        self.assertEqual(
            response.json()["detail"]["code"],
            "shop_correction_authorization_signing_unavailable",
        )
        self.assertEqual(calls, 0)
        self.assertEqual(store._events, {})

    def test_owner_receives_five_minute_audit_receipt_without_money_claim(self) -> None:
        store = _store()
        body = _request_body()
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            response = _client(store, _principal()).post(
                "/api/trial/v1/shop/correction-authorizations",
                json=body,
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertEqual(response.headers["pragma"], "no-cache")
        payload = response.json()
        receipt = payload["authorization"]
        self.assertEqual(
            receipt["contract"],
            "supermega.shop.correction-authorization-receipt.v3",
        )
        self.assertEqual(
            receipt["finalizationRequestId"], body["authorization_request_id"]
        )
        self.assertEqual(receipt["workspaceId"], WORKSPACE_ID)
        self.assertEqual(receipt["actorId"], OWNER_ID)
        self.assertEqual(receipt["actorLabel"], "Workspace owner")
        self.assertEqual(receipt["actorRole"], "owner")
        self.assertEqual(receipt["source"], "managed_membership_receipt_v1")
        self.assertEqual(receipt["capability"], "shop.sale.reverse")
        self.assertEqual(receipt["commandDigest"], body["command_digest"])
        self.assertEqual(
            receipt["expiresAtMillis"] - receipt["issuedAtMillis"],
            300_000,
        )
        self.assertEqual(
            receipt["receiptDigest"],
            shop_correction_authorization_receipt_v3_digest(
                source=receipt["source"],
                receipt_id=receipt["receiptId"],
                finalization_request_id=receipt["finalizationRequestId"],
                workspace_id=receipt["workspaceId"],
                actor_id=receipt["actorId"],
                actor_label=receipt["actorLabel"],
                actor_role=receipt["actorRole"],
                capability=receipt["capability"],
                command_digest=receipt["commandDigest"],
                finalized_at_millis=receipt["finalizedAtMillis"],
                issued_at_millis=receipt["issuedAtMillis"],
                expires_at_millis=receipt["expiresAtMillis"],
            ),
        )
        self.assertEqual(receipt["finalizedAtMillis"], receipt["issuedAtMillis"])
        self.assertEqual(receipt["keyId"], TEST_KEY_ID)
        self.assertTrue(
            verify_shop_correction_signature(
                key_id=receipt["keyId"],
                receipt_digest=receipt["receiptDigest"],
                signature=receipt["signature"],
                public_keys={TEST_KEY_ID: TEST_SIGNER.public_key_base64url},
            )
        )
        self.assertFalse(payload["idempotent_replay"])
        self.assertFalse(payload["local_mutation_performed"])
        self.assertFalse(payload["money_returned"])
        self.assertTrue(payload["external_writes_performed"])
        self.assertFalse(payload["secret_values_exposed"])

    def test_open_gate_uses_correction_specific_body_errors(self) -> None:
        client = _client(_store(), _principal())
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            wrong_type = client.post(
                "/api/trial/v1/shop/correction-authorizations",
                content=b"not-json",
                headers={"content-type": "text/plain"},
            )
            invalid_json = client.post(
                "/api/trial/v1/shop/correction-authorizations",
                content=b"not-json",
                headers={"content-type": "application/json"},
            )
        self.assertEqual(wrong_type.status_code, 415, wrong_type.text)
        self.assertEqual(
            wrong_type.json()["detail"]["code"],
            "shop_correction_authorization_json_required",
        )
        self.assertEqual(invalid_json.status_code, 422, invalid_json.text)
        self.assertEqual(
            invalid_json.json()["detail"]["code"],
            "shop_correction_authorization_invalid_json",
        )

    def test_exact_replay_returns_same_receipt_and_changed_input_conflicts(self) -> None:
        store = _store()
        request_id = str(uuid4())
        body = _request_body(request_id=request_id)
        client = _client(store, _principal())
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            first = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
            replay = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
            changed = client.post(
                "/api/trial/v1/shop/correction-authorizations",
                json=_request_body(
                    request_id=request_id,
                    fingerprint=_reversal_fingerprint(reason="Different reason"),
                ),
            )
            fresh_request_same_command = client.post(
                "/api/trial/v1/shop/correction-authorizations",
                json={**body, "authorization_request_id": str(uuid4())},
            )
            clone_request_same_sale = client.post(
                "/api/trial/v1/shop/correction-authorizations",
                json=_request_body(
                    request_id=str(uuid4()),
                    fingerprint=_reversal_fingerprint(
                        operation_id="clone-reversal-operation"
                    ),
                ),
            )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(
            replay.json()["authorization"], first.json()["authorization"]
        )
        self.assertTrue(replay.json()["idempotent_replay"])
        self.assertFalse(replay.json()["external_writes_performed"])
        self.assertEqual(changed.status_code, 409, changed.text)
        self.assertEqual(
            changed.json()["detail"]["code"], "trial_idempotency_conflict"
        )
        self.assertEqual(
            fresh_request_same_command.status_code,
            409,
            fresh_request_same_command.text,
        )
        self.assertEqual(
            fresh_request_same_command.json()["detail"]["code"],
            "trial_idempotency_conflict",
        )
        self.assertEqual(clone_request_same_sale.status_code, 409)
        self.assertEqual(
            clone_request_same_sale.json()["detail"]["code"],
            "trial_idempotency_conflict",
        )

    def test_concurrent_request_ids_finalize_exact_command_once(self) -> None:
        store = _store()
        bodies = (
            _request_body(request_id=str(uuid4())),
            _request_body(
                request_id=str(uuid4()),
                fingerprint=_reversal_fingerprint(
                    operation_id="concurrent-clone-operation"
                ),
            ),
        )

        def finalize(body):
            try:
                return store.issue_shop_correction_authorization(
                    _principal(), **body
                )
            except TrialIdempotencyConflict as exc:
                return exc

        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(finalize, bodies))

        self.assertEqual(
            sum(isinstance(value, TrialIdempotencyConflict) for value in outcomes),
            1,
        )
        self.assertEqual(
            sum(not isinstance(value, TrialIdempotencyConflict) for value in outcomes),
            1,
        )
        self.assertEqual(len(store._events), 1)

    def test_tampered_persisted_receipt_is_never_replayed(self) -> None:
        def mutate_and_resign_digest(field: str, value: object):
            def mutation(receipt: dict[str, object]) -> None:
                receipt[field] = value
                receipt["receiptDigest"] = shop_correction_authorization_receipt_v3_digest(
                    source=str(receipt["source"]),
                    receipt_id=str(receipt["receiptId"]),
                    finalization_request_id=str(receipt["finalizationRequestId"]),
                    workspace_id=str(receipt["workspaceId"]),
                    actor_id=str(receipt["actorId"]),
                    actor_label=str(receipt["actorLabel"]),
                    actor_role=str(receipt["actorRole"]),
                    capability=str(receipt["capability"]),
                    command_digest=str(receipt["commandDigest"]),
                    finalized_at_millis=int(receipt["finalizedAtMillis"]),
                    issued_at_millis=int(receipt["issuedAtMillis"]),
                    expires_at_millis=int(receipt["expiresAtMillis"]),
                )

            return mutation

        mutations = {
            "unsigned": lambda receipt: receipt.pop("signature"),
            "signature": lambda receipt: receipt.__setitem__(
                "signature", "A" * 86
            ),
            "keyId": lambda receipt: receipt.__setitem__(
                "keyId", "attacker-key"
            ),
            "workspaceId": mutate_and_resign_digest(
                "workspaceId", "another-workspace"
            ),
            "actorId": mutate_and_resign_digest("actorId", OTHER_ID),
            "actorRole": mutate_and_resign_digest("actorRole", "manager"),
            "capability": mutate_and_resign_digest(
                "capability", "shop.sale.reconcile_wallet"
            ),
            "commandDigest": mutate_and_resign_digest(
                "commandDigest", "f" * 64
            ),
            "receiptId": mutate_and_resign_digest("receiptId", str(uuid4())),
            "finalizationRequestId": mutate_and_resign_digest(
                "finalizationRequestId", str(uuid4())
            ),
            "finalizedAtMillis": mutate_and_resign_digest(
                "finalizedAtMillis", 1_700_000_000_000
            ),
            "issuedAtMillis": mutate_and_resign_digest(
                "issuedAtMillis", 1_700_000_000_000
            ),
            "expiresAtMillis": mutate_and_resign_digest(
                "expiresAtMillis", 1_900_000_000_000
            ),
        }
        for name, mutate in mutations.items():
            with self.subTest(field=name):
                store = _store()
                body = _request_body()
                first = store.issue_shop_correction_authorization(
                    _principal(), **body
                )
                event_key = next(iter(store._events))
                fingerprint, actor_id, actor_kind, receipt = store._events[
                    event_key
                ]
                mutate(receipt)
                store._events[event_key] = (
                    fingerprint,
                    actor_id,
                    actor_kind,
                    receipt,
                )

                with self.assertRaises(TrialStoreError):
                    store.issue_shop_correction_authorization(
                        _principal(), **body
                    )
                self.assertEqual(len(store._events), 1)
                self.assertEqual(
                    store._events[event_key][3]["receiptId"],
                    receipt["receiptId"],
                )
                self.assertNotEqual(
                    store._events[event_key][3], first.to_dict()
                )

    def test_postgres_path_uses_one_immutable_event_and_db_clock(self) -> None:
        store = _CorrectionPostgresStore()
        body = _request_body()
        first = store.issue_shop_correction_authorization(
            _principal(), **body
        )
        replay = store.issue_shop_correction_authorization(
            _principal(), **body
        )
        self.assertEqual(store.guard_calls, 2)
        self.assertEqual(store.cursor.insert_count, 1)
        self.assertEqual(first.to_dict(), replay.to_dict())
        self.assertFalse(first.idempotent_replay)
        self.assertTrue(replay.idempotent_replay)
        self.assertEqual(first.issued_at_millis, 1_800_000_000_000)
        self.assertEqual(first.expires_at_millis, 1_800_000_300_000)
        insert_sql, insert_params = next(
            execution
            for execution in store.cursor.executions
            if "insert into app_private.workspace_events" in execution[0]
        )
        self.assertIn("'commerce'", insert_sql)
        self.assertIn("null, null", insert_sql)
        owner_sql = next(
            sql for sql, _params in store.cursor.executions if "select owner_actor_id" in sql
        )
        self.assertIn("for share", owner_sql)
        self.assertEqual(
            insert_params[4], "commerce.shop_correction_authorization.finalized"
        )
        self.assertNotEqual(insert_params[2], body["authorization_request_id"])
        payload = json.loads(insert_params[7])
        self.assertEqual(payload["command"]["operationId"], "reversal-operation-1")
        self.assertNotIn("requestFingerprint", payload)

        store.cursor.clock_millis = first.expires_at_millis + 1
        with self.assertRaises(TrialAuthorizationExpired):
            store.issue_shop_correction_authorization(_principal(), **body)
        self.assertEqual(store.guard_calls, 3)

        store.cursor.clock_millis = first.expires_at_millis
        store.cursor.event["event_type"] = "commerce.some_other_event"
        with self.assertRaises(TrialIdempotencyConflict):
            store.issue_shop_correction_authorization(_principal(), **body)
        self.assertEqual(store.guard_calls, 4)

    def test_in_memory_replay_expires_without_rewriting_receipt(self) -> None:
        store = _store()
        body = _request_body()
        issued_at = datetime(2026, 10, 22, tzinfo=timezone.utc)
        with patch("supermega_runtime.trial_store.datetime") as clock:
            clock.now.return_value = issued_at
            first = store.issue_shop_correction_authorization(_principal(), **body)
            clock.now.return_value = issued_at + timedelta(minutes=5, milliseconds=1)
            with self.assertRaises(TrialAuthorizationExpired):
                store.issue_shop_correction_authorization(_principal(), **body)
        self.assertEqual(len(store._events), 1)
        self.assertEqual(
            store._events[next(iter(store._events))][3],
            first.to_dict(),
        )

    def test_expired_replay_has_a_specific_http_conflict(self) -> None:
        store = _store()
        body = _request_body()
        issued_at = datetime(2026, 10, 22, tzinfo=timezone.utc)
        client = _client(store, _principal())
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ), patch("supermega_runtime.trial_store.datetime") as clock:
            clock.now.return_value = issued_at
            first = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
            clock.now.return_value = issued_at + timedelta(minutes=5, milliseconds=1)
            expired = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(expired.status_code, 409, expired.text)
        self.assertEqual(
            expired.json()["detail"],
            {
                "code": "shop_correction_authorization_expired",
                "authorization_request_id": body["authorization_request_id"],
            },
        )

    def test_replay_rechecks_membership_owner_and_write_gate(self) -> None:
        store = _store()
        body = _request_body()
        client = _client(store, _principal())
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            self.assertEqual(
                client.post(
                    "/api/trial/v1/shop/correction-authorizations", json=body
                ).status_code,
                200,
            )
            store.provision_membership(
                workspace_id=WORKSPACE_ID,
                actor_id=OWNER_ID,
                actor_kind="human",
                capabilities=("commerce.write",),
                status="suspended",
            )
            denied = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
            self.assertEqual(denied.status_code, 403, denied.text)
            store.provision_membership(
                workspace_id=WORKSPACE_ID,
                actor_id=OWNER_ID,
                actor_kind="human",
                capabilities=("commerce.write",),
            )
            store.provision_workspace_owner(
                workspace_id=WORKSPACE_ID,
                actor_id=OTHER_ID,
            )
            denied = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
            self.assertEqual(denied.status_code, 403, denied.text)
            store.provision_workspace_owner(
                workspace_id=WORKSPACE_ID,
                actor_id=OWNER_ID,
            )
            store.write_enabled = False
            denied = client.post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
            self.assertEqual(denied.status_code, 503, denied.text)

    def test_fingerprint_is_duplicate_free_structured_and_digest_bound(self) -> None:
        client = _client(_store(), _principal())
        valid = _reversal_fingerprint()
        duplicate = valid.replace(
            '"operationId":"reversal-operation-1",',
            '"operationId":"reversal-operation-1","operationId":"other",',
        )
        extra = json.dumps(
            {**json.loads(valid), "unexpected": "value"}, separators=(",", ":")
        )
        missing_value = json.loads(valid)
        del missing_value["reason"]
        missing = json.dumps(missing_value, separators=(",", ":"))
        inconsistent_value = json.loads(
            _reversal_fingerprint(payment_resolution="external_pending")
        )
        inconsistent_value["cashReturnConfirmed"] = True
        inconsistent = json.dumps(inconsistent_value, separators=(",", ":"))
        wrong_wallet_type = json.loads(_wallet_fingerprint())
        wrong_wallet_type["outcome"] = ["money_returned"]
        wrong_wallet = json.dumps(wrong_wallet_type, separators=(",", ":"))
        cash_wallet_value = json.loads(_wallet_fingerprint())
        cash_wallet_value["originalPaymentMethod"] = "cash"
        cash_wallet = json.dumps(cash_wallet_value, separators=(",", ":"))
        negative_wallet_value = json.loads(_wallet_fingerprint())
        negative_wallet_value["originalTotalMmk"] = -1
        negative_wallet = json.dumps(negative_wallet_value, separators=(",", ":"))
        invalid_bodies = [
            {
                **_request_body(fingerprint=valid),
                "command_digest": "0" * 64,
            },
            _request_body(fingerprint=duplicate),
            _request_body(fingerprint=extra),
            _request_body(fingerprint=missing),
            _request_body(fingerprint=inconsistent),
            {
                **_request_body(fingerprint=valid),
                "confirmation": "AUTHORIZE WALLET RECONCILIATION",
            },
            _request_body(
                capability="shop.sale.reconcile_wallet",
                fingerprint=wrong_wallet,
            ),
            _request_body(
                capability="shop.sale.reconcile_wallet",
                fingerprint=cash_wallet,
            ),
            _request_body(
                capability="shop.sale.reconcile_wallet",
                fingerprint=negative_wallet,
            ),
        ]
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            for body in invalid_bodies:
                with self.subTest(body=body):
                    response = client.post(
                        "/api/trial/v1/shop/correction-authorizations", json=body
                    )
                    self.assertEqual(response.status_code, 422, response.text)

    def test_wallet_receipt_stays_a_reconciliation_authorization_only(self) -> None:
        store = _store()
        body = _request_body(capability="shop.sale.reconcile_wallet")
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            response = _client(store, _principal()).post(
                "/api/trial/v1/shop/correction-authorizations", json=body
            )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            response.json()["authorization"]["capability"],
            "shop.sale.reconcile_wallet",
        )
        self.assertFalse(response.json()["money_returned"])
        event_key = next(iter(store._shop_correction_payloads))
        self.assertEqual(
            store._shop_correction_payloads[event_key]["command"]["outcome"],
            "money_returned",
        )
        self.assertEqual(
            store._shop_correction_payloads[event_key]["command"][
                "originalPaymentMethod"
            ],
            "kbzpay",
        )
        self.assertEqual(
            store._shop_correction_payloads[event_key]["command"]["originalTotalMmk"],
            15_000,
        )

    def test_gateway_nonhuman_nonowner_ecommerce_only_and_writes_off_fail(self) -> None:
        scenarios = (
            (_store(), _principal(identity_provider="gateway"), 403),
            (_store(), _principal(actor_kind="service"), 403),
            (
                _store(actor_id=OTHER_ID, owner_id=OWNER_ID),
                _principal(actor_id=OTHER_ID),
                403,
            ),
            (_store(products=("ecommerce",)), _principal(), 403),
            (_store(write_enabled=False), _principal(), 503),
        )
        with patch.dict(
            os.environ,
            {SHOP_CORRECTION_AUTHORIZATION_WINDOW_ENV: "open"},
        ):
            for store, principal, status in scenarios:
                with self.subTest(principal=principal, status=status):
                    response = _client(store, principal).post(
                        "/api/trial/v1/shop/correction-authorizations",
                        json=_request_body(),
                    )
                    self.assertEqual(response.status_code, status, response.text)


if __name__ == "__main__":
    unittest.main()
