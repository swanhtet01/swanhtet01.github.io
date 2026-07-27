from __future__ import annotations

from io import BytesIO
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from supermega_runtime.order_intake import OrderIntakeCatalogItem
from supermega_runtime.order_intake_provider import (
    InMemoryOrderIntakeBudget,
    OpenAIOrderIntakeProvider,
    OrderIntakeBudgetReservation,
    OrderIntakeProviderError,
    _openai_transport,
)


MESSAGE = "May wants 2 SM-1001 through Messenger and will pay KBZPay."
CATALOG = [
    OrderIntakeCatalogItem(
        sku="SM-1001",
        name="Classic Tee",
        variant="Black / M",
        on_hand=12,
        unit_price_mmk=25_000,
    )
]


def valid_extraction() -> dict[str, object]:
    return {
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


def completed_response(extraction: dict[str, object] | None = None) -> dict[str, object]:
    return {
        "id": "resp-order-intake-1",
        "model": "gpt-5-mini-2026-01-01",
        "status": "completed",
        "usage": {"input_tokens": 210, "output_tokens": 90},
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(extraction or valid_extraction()),
                    }
                ],
            }
        ],
    }


class RecordingBudget:
    def __init__(self, *, reject: str = "") -> None:
        self.reject = reject
        self.reserved: list[tuple[str, int]] = []
        self.settled: list[tuple[str, str, int | None]] = []

    def reserve(self, *, workspace_id: str, reserved_units: int) -> OrderIntakeBudgetReservation:
        if self.reject:
            raise OrderIntakeProviderError(self.reject)
        self.reserved.append((workspace_id, reserved_units))
        return OrderIntakeBudgetReservation("budget-1", reserved_units)

    def settle(
        self,
        reservation: OrderIntakeBudgetReservation,
        *,
        status: str,
        actual_units: int | None,
    ) -> None:
        self.settled.append((reservation.reservation_id, status, actual_units))


class RecordingTransport:
    def __init__(self, response: dict[str, object]) -> None:
        self.response = response
        self.calls: list[tuple[str, dict[str, object], float]] = []

    def __call__(self, key: str, payload: object, timeout: float) -> dict[str, object]:
        self.calls.append((key, dict(payload), timeout))  # type: ignore[arg-type]
        return self.response


class OpenAIOrderIntakeProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_strict_non_operational_response_payload_builds_source_backed_draft(self) -> None:
        budget = RecordingBudget()
        transport = RecordingTransport(completed_response())
        provider = OpenAIOrderIntakeProvider(
            api_key="test-provider-key",
            safety_secret="test-safety-secret",
            budget=budget,
            transport=transport,
        )

        draft = await provider.generate(
            message=MESSAGE,
            catalog=CATALOG,
            workspace_id="workspace-a",
            actor_id="actor-may",
        )

        self.assertEqual(draft.status, "ready_for_review")
        self.assertEqual(draft.catalog_item, CATALOG[0])
        self.assertEqual(draft.total_mmk, 50_000)
        self.assertNotIn(MESSAGE, json.dumps(draft.model_dump(mode="json")))
        self.assertEqual(len(transport.calls), 1)
        key, payload, timeout = transport.calls[0]
        self.assertEqual(key, "test-provider-key")
        self.assertLessEqual(timeout, 30)
        self.assertEqual(
            set(payload),
            {"model", "instructions", "input", "max_output_tokens", "safety_identifier", "store", "text"},
        )
        self.assertFalse(payload["store"])
        self.assertNotIn("tools", payload)
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")  # type: ignore[index]
        self.assertTrue(payload["text"]["format"]["strict"])  # type: ignore[index]
        self.assertIn(MESSAGE, str(payload["input"]))
        self.assertNotIn("actor-may", str(payload["safety_identifier"]))
        self.assertEqual(budget.reserved[0][0], "workspace-a")
        self.assertEqual(budget.settled, [("budget-1", "consumed", 300)])

    async def test_refusal_and_incomplete_responses_fail_closed_and_stay_charged(self) -> None:
        cases = (
            (
                {
                    "id": "resp-refusal",
                    "model": "gpt-5-mini",
                    "status": "completed",
                    "output": [{"content": [{"type": "refusal", "refusal": "not available"}]}],
                },
                "order_intake_provider_refused",
            ),
            (
                {"id": "resp-incomplete", "model": "gpt-5-mini", "status": "incomplete", "output": []},
                "order_intake_provider_incomplete",
            ),
        )
        for response, expected_code in cases:
            with self.subTest(code=expected_code):
                budget = RecordingBudget()
                provider = OpenAIOrderIntakeProvider(
                    api_key="test-provider-key",
                    budget=budget,
                    transport=RecordingTransport(response),
                )
                with self.assertRaisesRegex(OrderIntakeProviderError, expected_code):
                    await provider.generate(
                        message=MESSAGE,
                        catalog=CATALOG,
                        workspace_id="workspace-a",
                        actor_id="actor-a",
                    )
                self.assertEqual(budget.settled[0][1], "failed")

    async def test_invalid_schema_or_source_quote_never_returns_a_draft(self) -> None:
        extraction = valid_extraction()
        extraction["provenance"] = [
            {"field": "customer_reference", "source_quotes": [{"quote": "Not May", "occurrence": 1}]},
            *extraction["provenance"][1:],  # type: ignore[index]
        ]
        budget = RecordingBudget()
        provider = OpenAIOrderIntakeProvider(
            api_key="test-provider-key",
            budget=budget,
            transport=RecordingTransport(completed_response(extraction)),
        )
        with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_provider_invalid_response"):
            await provider.generate(
                message=MESSAGE,
                catalog=CATALOG,
                workspace_id="workspace-a",
                actor_id="actor-a",
            )
        self.assertEqual(budget.settled[0][1], "failed")

    async def test_budget_denial_happens_before_provider_network_io(self) -> None:
        budget = RecordingBudget(reject="order_intake_company_budget_reached")
        transport = RecordingTransport(completed_response())
        provider = OpenAIOrderIntakeProvider(
            api_key="test-provider-key",
            budget=budget,
            transport=transport,
        )
        with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_company_budget_reached"):
            await provider.generate(
                message=MESSAGE,
                catalog=CATALOG,
                workspace_id="workspace-a",
                actor_id="actor-a",
            )
        self.assertEqual(transport.calls, [])

    def test_local_budget_is_bounded_without_creating_workers(self) -> None:
        budget = InMemoryOrderIntakeBudget(cap_units=10)
        first = budget.reserve(workspace_id="workspace-a", reserved_units=10)
        budget.settle(first, status="consumed", actual_units=5)
        with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_company_budget_reached"):
            budget.reserve(workspace_id="workspace-b", reserved_units=1)

    def test_http_429_distinguishes_quota_exhaustion_from_rate_limiting(self) -> None:
        cases = (
            ("insufficient_quota", "order_intake_provider_quota_exhausted"),
            ("rate_limit_exceeded", "order_intake_provider_rate_limited"),
        )
        for provider_code, expected in cases:
            with self.subTest(provider_code=provider_code):
                body = json.dumps({"error": {"type": provider_code, "code": provider_code}}).encode()
                error = HTTPError(
                    "https://api.openai.com/v1/responses",
                    429,
                    "Too Many Requests",
                    None,
                    BytesIO(body),
                )
                with patch("supermega_runtime.order_intake_provider.build_opener") as build_opener:
                    build_opener.return_value.open.side_effect = error
                    with self.assertRaisesRegex(OrderIntakeProviderError, expected):
                        _openai_transport("test-provider-key", {"model": "gpt-5-mini"}, 5)

    def test_provider_redirect_is_rejected_without_forwarding_credentials(self) -> None:
        redirect = HTTPError(
            "https://api.openai.com/v1/responses",
            307,
            "Temporary Redirect",
            {"location": "https://untrusted.example/collect"},
            BytesIO(b""),
        )
        with patch("supermega_runtime.order_intake_provider.build_opener") as build_opener:
            build_opener.return_value.open.side_effect = redirect
            with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_provider_unavailable"):
                _openai_transport("test-provider-key", {"model": "gpt-5-mini"}, 5)


if __name__ == "__main__":
    unittest.main()
