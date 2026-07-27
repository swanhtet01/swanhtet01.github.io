from __future__ import annotations

from collections.abc import Mapping, Sequence
from hashlib import sha256
import unittest
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.order_intake import (
    OrderIntakeCatalogItem,
    OrderIntakeModelExtraction,
    build_order_intake_draft,
)
from supermega_runtime.order_intake_provider import OrderIntakeProviderError
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal


MESSAGE = "May wants 2 SM-1001 through Messenger and will pay KBZPay."


class MergeReducer:
    def __call__(
        self,
        surface: str,
        event_type: str,
        current: Mapping[str, object],
        payload: Mapping[str, object],
    ) -> Mapping[str, object]:
        del surface, event_type
        next_state = dict(current)
        changes = payload.get("changes", {})
        if isinstance(changes, Mapping):
            next_state.update(changes)
        return next_state


class FakeOrderIntakeProvider:
    def __init__(self, error: str = "") -> None:
        self.error = error
        self.calls: list[dict[str, object]] = []

    async def generate(
        self,
        *,
        message: str,
        catalog: Sequence[OrderIntakeCatalogItem],
        workspace_id: str,
        actor_id: str,
    ):
        if self.error:
            raise OrderIntakeProviderError(self.error)
        self.calls.append(
            {
                "message": message,
                "catalog": list(catalog),
                "workspace_id": workspace_id,
                "actor_id": actor_id,
            }
        )
        extraction = OrderIntakeModelExtraction.model_validate(
            {
                "scope": "single_item_order",
                "customer_reference": "May",
                "channel": "messenger",
                "sku": "SM-1001",
                "quantity": 2,
                "payment": "kbzpay",
                "fulfilment": None,
                "uncertain_fields": [],
                "provenance": [
                    {"field": "customer_reference", "source_quotes": [{"quote": "May", "occurrence": 1}]},
                    {"field": "channel", "source_quotes": [{"quote": "Messenger", "occurrence": 1}]},
                    {"field": "sku", "source_quotes": [{"quote": "SM-1001", "occurrence": 1}]},
                    {"field": "quantity", "source_quotes": [{"quote": "2", "occurrence": 1}]},
                    {"field": "payment", "source_quotes": [{"quote": "KBZPay", "occurrence": 1}]},
                ],
            }
        )
        return build_order_intake_draft(
            message=message,
            catalog=list(catalog),
            extraction=extraction,
            response_id="resp-route-test",
            model="gpt-5-mini",
        )


class TrialOrderIntakeRuntimeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=MergeReducer())
        self.human = TrialPrincipal("workspace-a", "actor-human", "human")
        self.agent = TrialPrincipal("workspace-a", "actor-agent", "agent")
        for principal in (self.human, self.agent):
            self.store.provision_membership(
                workspace_id=principal.workspace_id,
                actor_id=principal.actor_id,
                actor_kind=principal.actor_kind,
                capabilities=("commerce.write",),
            )
        self.store.apply_command(
            self.human,
            command_id=uuid4(),
            surface="commerce",
            event_type="commerce.order.saved",
            expected_version=0,
            payload={
                "changes": {
                    "items": [
                        {
                            "sku": "SM-1001",
                            "name": "Classic Tee",
                            "variant": "Black / M",
                            "onHand": 12,
                            "reorderAt": 2,
                            "price": 25_000,
                        }
                    ]
                }
            },
        )

    def _client(self, provider: object | None) -> TestClient:
        sessions = {"human": self.human, "agent": self.agent}

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(
            create_trial_router(
                store=self.store,
                resolve_principal=resolve_principal,
                order_intake_provider=provider,  # type: ignore[arg-type]
            )
        )
        return TestClient(app)

    def test_authenticated_human_gets_ephemeral_server_catalog_draft(self) -> None:
        provider = FakeOrderIntakeProvider()
        before = self.store.get_state(self.human, "commerce")
        with self._client(provider) as client:
            response = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                headers={"x-test-session": "human"},
                json={"source_label": "MSG-001", "message": MESSAGE},
            )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["draft"]["status"], "ready_for_review")
        self.assertEqual(
            body["source_label_digest"],
            f"sha256:{sha256(b'MSG-001').hexdigest()}",
        )
        self.assertNotIn(MESSAGE, str(body))
        self.assertNotIn("MSG-001", str(body))
        self.assertEqual(provider.calls[0]["workspace_id"], "workspace-a")
        catalog = provider.calls[0]["catalog"]
        self.assertEqual(catalog[0].unit_price_mmk, 25_000)  # type: ignore[index,union-attr]
        after = self.store.get_state(self.human, "commerce")
        self.assertEqual((after.version, after.state), (before.version, before.state))

    def test_auth_human_authority_provider_and_strict_body_fail_closed(self) -> None:
        provider = FakeOrderIntakeProvider()
        with self._client(provider) as client:
            unauthenticated = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                json={"source_label": "MSG-001", "message": MESSAGE},
            )
            agent = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                headers={"x-test-session": "agent"},
                json={"source_label": "MSG-001", "message": MESSAGE},
            )
            spoofed_catalog = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                headers={"x-test-session": "human"},
                json={"source_label": "MSG-001", "message": MESSAGE, "catalog": []},
            )
        self.assertEqual(unauthenticated.status_code, 401)
        self.assertEqual(agent.status_code, 403)
        self.assertEqual(agent.json()["detail"]["code"], "trial_human_approval_required")
        self.assertEqual(spoofed_catalog.status_code, 422)
        self.assertEqual(provider.calls, [])

        with self._client(None) as client:
            unavailable = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                headers={"x-test-session": "human"},
                json={"source_label": "MSG-001", "message": MESSAGE},
            )
        self.assertEqual(unavailable.status_code, 503)
        self.assertEqual(unavailable.json()["detail"]["code"], "order_intake_provider_not_configured")

    def test_company_budget_denial_maps_to_retryable_http_429(self) -> None:
        provider = FakeOrderIntakeProvider("order_intake_company_budget_reached")
        with self._client(provider) as client:
            response = client.post(
                "/api/trial/v1/commerce/order-intake/drafts",
                headers={"x-test-session": "human"},
                json={"source_label": "MSG-001", "message": MESSAGE},
            )
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["detail"], {"code": "order_intake_company_budget_reached"})


if __name__ == "__main__":
    unittest.main()
