from __future__ import annotations

from copy import deepcopy
import unittest

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.billing_contracts import BILLING_READ_CAPABILITY
from supermega_runtime.billing_rail import MERCHANT_BILLING_SUMMARY_CONTRACT
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal


def merchant_summary(workspace_id: str = "workspace-a") -> dict[str, object]:
    return {
        "contract": MERCHANT_BILLING_SUMMARY_CONTRACT,
        "workspaceId": workspace_id,
        "asOf": "2026-10-24T00:00:00Z",
        "package": {
            "bindingStatus": "legacy_entitlement_only",
            "packageCode": None,
            "term": None,
            "renewalAt": None,
            "entitlementKey": "premium",
            "entitlementStatus": "none",
        },
        "invoices": [
            {
                "invoiceId": "invoice-0001",
                "status": "issued",
                "issuedAt": "2026-10-20T00:00:00Z",
                "dueDate": "2026-11-20",
                "currency": "MMK",
                "exponent": 0,
                "totalMinor": 125000,
                "refundedMinor": 0,
                "outstandingMinor": 125000,
                "paymentState": "pending_manual_verification",
                "providerSettlementVerified": False,
                "receiptAvailable": False,
            }
        ],
        "excluded": [],
        "totalOutstandingMinorByCurrency": {"MMK": 125000},
        "recurringBillingConfigured": False,
        "providerSettlementVerified": False,
        "administrativeActionsExposed": False,
        "externalWritesPerformed": False,
        "secretValuesExposed": False,
    }


class Reader:
    def __init__(self, value: object) -> None:
        self.value = value
        self.calls: list[TrialPrincipal] = []

    def __call__(self, principal: TrialPrincipal):
        self.calls.append(principal)
        if isinstance(self.value, Exception):
            raise self.value
        return deepcopy(self.value)


class TrialBillingSummaryRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=lambda _surface, _event, current, _payload: current)
        self.human = TrialPrincipal("workspace-a", "actor-owner", "human")
        self.agent = TrialPrincipal("workspace-a", "actor-agent", "agent")
        self.viewer = TrialPrincipal("workspace-a", "actor-viewer", "human")
        self.sessions = {
            "owner": self.human,
            "agent": self.agent,
            "viewer": self.viewer,
        }
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-owner",
            actor_kind="human",
            capabilities=(BILLING_READ_CAPABILITY,),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent",
            actor_kind="agent",
            capabilities=(BILLING_READ_CAPABILITY,),
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-viewer",
            actor_kind="human",
            capabilities=("company.read",),
        )

    def client(self, reader: Reader | None) -> TestClient:
        def resolve_principal(request: Request):
            return self.sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(
                store=self.store,
                resolve_principal=resolve_principal,
                merchant_billing_summary_reader=reader,
            )
        )
        return TestClient(app)

    @staticmethod
    def headers(session: str = "owner") -> dict[str, str]:
        return {"x-test-session": session}

    def assert_private(self, response) -> None:
        self.assertEqual(response.headers["cache-control"], "private, no-store, max-age=0")
        self.assertEqual(response.headers["pragma"], "no-cache")
        self.assertEqual(response.headers["vary"], "Authorization, X-SuperMega-Workspace-Id")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_authorized_human_reads_exact_tenant_summary_without_mutation(self) -> None:
        reader = Reader(merchant_summary())
        with self.client(reader) as client:
            first = client.get("/api/trial/v1/account/billing", headers=self.headers())
            second = client.get("/api/trial/v1/account/billing", headers=self.headers())
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json(), second.json())
        self.assert_private(first)
        body = first.json()
        self.assertEqual(body["contract"], "supermega.managed_account_billing.v1")
        self.assertEqual(body["identity"], {
            "workspace_id": "workspace-a",
            "actor_id": "actor-owner",
            "actor_kind": "human",
        })
        self.assertEqual(body["billing"]["invoices"][0]["paymentState"], "pending_manual_verification")
        self.assertFalse(body["billing"]["providerSettlementVerified"])
        self.assertEqual(reader.calls, [self.human.normalized(), self.human.normalized()])
        self.assertEqual(self.store._events, {})

    def test_empty_summary_is_available_even_without_paid_entitlement(self) -> None:
        summary = merchant_summary()
        summary["invoices"] = []
        summary["totalOutstandingMinorByCurrency"] = {}
        reader = Reader(summary)
        with self.client(reader) as client:
            response = client.get("/api/trial/v1/account/billing", headers=self.headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["billing"]["package"]["entitlementStatus"], "none")
        self.assertEqual(response.json()["billing"]["invoices"], [])

    def test_identity_and_dedicated_capability_fail_closed_before_reader(self) -> None:
        reader = Reader(merchant_summary())
        with self.client(reader) as client:
            cases = [
                ({}, 401, "trial_auth_required"),
                (self.headers("agent"), 403, "account_billing_human_required"),
                (self.headers("viewer"), 403, "trial_capability_required"),
            ]
            for headers, status, code in cases:
                with self.subTest(code=code):
                    response = client.get("/api/trial/v1/account/billing", headers=headers)
                    self.assertEqual(response.status_code, status)
                    self.assertEqual(response.json()["detail"]["code"], code)
                    self.assert_private(response)
        self.assertEqual(reader.calls, [])

    def test_request_cannot_nominate_workspace_or_send_body(self) -> None:
        reader = Reader(merchant_summary())
        with self.client(reader) as client:
            query = client.get("/api/trial/v1/account/billing?workspace=workspace-b", headers=self.headers())
            body = client.request("GET", "/api/trial/v1/account/billing", headers=self.headers(), json={"workspaceId": "workspace-b"})
        for response in (query, body):
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["detail"]["code"], "account_billing_request_invalid")
            self.assert_private(response)
        self.assertEqual(reader.calls, [])

    def test_suspended_membership_and_forged_actor_fail_closed(self) -> None:
        reader = Reader(merchant_summary())
        with self.client(reader) as client:
            forged = client.get(
                "/api/trial/v1/account/billing",
                headers={**self.headers(), "x-supermega-actor-id": "actor-forged"},
            )
            self.assertEqual(forged.status_code, 200)
            self.assertEqual(forged.json()["identity"]["actor_id"], "actor-owner")
            self.store.provision_membership(
                workspace_id="workspace-a",
                actor_id="actor-owner",
                actor_kind="human",
                capabilities=(BILLING_READ_CAPABILITY,),
                status="suspended",
            )
            suspended = client.get("/api/trial/v1/account/billing", headers=self.headers())
        self.assertEqual(suspended.status_code, 403)
        self.assertEqual(suspended.json()["detail"]["code"], "trial_membership_required")
        self.assert_private(suspended)
        self.assertEqual(reader.calls, [self.human.normalized()])

    def test_reader_absence_failure_and_cross_tenant_data_are_generic(self) -> None:
        cases = [
            (None, None),
            (Reader(RuntimeError("PRIVATE_DATABASE_SENTINEL")), "PRIVATE_DATABASE_SENTINEL"),
            (Reader(merchant_summary("workspace-b")), "workspace-b"),
        ]
        for reader, sentinel in cases:
            with self.subTest(sentinel=sentinel), self.client(reader) as client:
                response = client.get("/api/trial/v1/account/billing", headers=self.headers())
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json(), {"detail": {"code": "account_billing_unavailable"}})
                self.assert_private(response)
                if sentinel:
                    self.assertNotIn(sentinel, response.text)

    def test_malformed_or_privacy_expanding_projection_is_rejected(self) -> None:
        mutations = []
        sensitive = merchant_summary()
        sensitive["paymentReference"] = "PRIVATE_PAYMENT_REFERENCE"
        mutations.append(sensitive)
        provider_claim = merchant_summary()
        provider_claim["invoices"][0]["providerSettlementVerified"] = True
        mutations.append(provider_claim)
        wrong_math = merchant_summary()
        wrong_math["invoices"][0]["outstandingMinor"] = 1
        mutations.append(wrong_math)
        oversized = merchant_summary()
        oversized["invoices"][0]["totalMinor"] = 10**19
        oversized["invoices"][0]["outstandingMinor"] = 10**19
        oversized["totalOutstandingMinorByCurrency"] = {"MMK": 10**19}
        mutations.append(oversized)
        duplicate = merchant_summary()
        duplicate["invoices"].append(deepcopy(duplicate["invoices"][0]))
        duplicate["totalOutstandingMinorByCurrency"] = {"MMK": 250000}
        mutations.append(duplicate)
        for summary in mutations:
            with self.subTest(summary=summary), self.client(Reader(summary)) as client:
                response = client.get("/api/trial/v1/account/billing", headers=self.headers())
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json(), {"detail": {"code": "account_billing_unavailable"}})
                self.assertNotIn("PRIVATE_PAYMENT_REFERENCE", response.text)

    def test_amounts_match_the_browser_safe_integer_boundary(self) -> None:
        maximum = 2**53 - 1
        safe = merchant_summary()
        safe["invoices"][0]["totalMinor"] = maximum
        safe["invoices"][0]["outstandingMinor"] = maximum
        safe["totalOutstandingMinorByCurrency"] = {"MMK": maximum}
        with self.client(Reader(safe)) as client:
            response = client.get("/api/trial/v1/account/billing", headers=self.headers())
        self.assertEqual(response.status_code, 200)

        unsafe = deepcopy(safe)
        unsafe["invoices"][0]["totalMinor"] = maximum + 1
        unsafe["invoices"][0]["outstandingMinor"] = maximum + 1
        unsafe["totalOutstandingMinorByCurrency"] = {"MMK": maximum + 1}
        with self.client(Reader(unsafe)) as client:
            response = client.get("/api/trial/v1/account/billing", headers=self.headers())
        self.assertEqual(response.status_code, 503)

        overflow = merchant_summary()
        overflow["invoices"][0]["totalMinor"] = maximum
        overflow["invoices"][0]["outstandingMinor"] = maximum
        second = deepcopy(overflow["invoices"][0])
        second["invoiceId"] = "invoice-0002"
        overflow["invoices"].append(second)
        overflow["totalOutstandingMinorByCurrency"] = {"MMK": maximum}
        with self.client(Reader(overflow)) as client:
            response = client.get("/api/trial/v1/account/billing", headers=self.headers())
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
