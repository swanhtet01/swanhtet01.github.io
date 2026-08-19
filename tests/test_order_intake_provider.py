from __future__ import annotations

from io import BytesIO
import json
import os
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from supermega_runtime.order_intake import OrderIntakeCatalogItem
from supermega_runtime.order_intake_provider import (
    DEFAULT_ANTHROPIC_ORDER_INTAKE_MODEL,
    DEFAULT_ORDER_INTAKE_MODEL,
    MAX_ORDER_INTAKE_PROVIDER_RESPONSE_BYTES,
    AnthropicOrderIntakeProvider,
    InMemoryOrderIntakeBudget,
    OpenAIOrderIntakeProvider,
    OrderIntakeBudgetReservation,
    OrderIntakeProviderError,
    _anthropic_transport,
    _openai_transport,
    order_intake_provider_from_environment,
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


def anthropic_completed_response(
    extraction: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "id": "msg-order-intake-1",
        "type": "message",
        "role": "assistant",
        "model": "claude-sonnet-5",
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 210, "output_tokens": 90},
        "content": [{"type": "text", "text": json.dumps(extraction or valid_extraction())}],
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
            {"model", "instructions", "input", "max_output_tokens", "reasoning", "safety_identifier", "store", "text"},
        )
        # Reasoning models spend max_output_tokens on reasoning FIRST; effort is
        # pinned low so the strict-schema JSON actually fits (2026-08-17 eval).
        self.assertEqual(payload["reasoning"], {"effort": "low"})
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


class FakeHttpResponse:
    def __init__(self, body: bytes, status: int = 200) -> None:
        self.body = body
        self.status = status

    def __enter__(self) -> "FakeHttpResponse":
        return self

    def __exit__(self, *args: object) -> bool:
        return False

    def read(self, amount: int) -> bytes:
        return self.body[:amount]


class AnthropicOrderIntakeProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_strict_non_operational_response_payload_builds_source_backed_draft(self) -> None:
        budget = RecordingBudget()
        transport = RecordingTransport(anthropic_completed_response())
        provider = AnthropicOrderIntakeProvider(
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
            {"model", "system", "messages", "max_tokens", "metadata", "thinking", "output_config"},
        )
        self.assertNotIn("tools", payload)
        self.assertEqual(payload["thinking"], {"type": "disabled"})  # type: ignore[index]
        self.assertEqual(payload["output_config"]["format"]["type"], "json_schema")  # type: ignore[index]
        self.assertEqual(payload["messages"][0]["role"], "user")  # type: ignore[index]
        self.assertIn(MESSAGE, str(payload["messages"][0]["content"]))  # type: ignore[index]
        self.assertNotIn("actor-may", str(payload["metadata"]["user_id"]))  # type: ignore[index]
        self.assertEqual(budget.reserved[0][0], "workspace-a")
        self.assertEqual(budget.settled, [("budget-1", "consumed", 300)])

    async def test_request_schema_carries_only_supported_json_schema_keywords(self) -> None:
        transport = RecordingTransport(anthropic_completed_response())
        provider = AnthropicOrderIntakeProvider(
            api_key="test-provider-key",
            budget=RecordingBudget(),
            transport=transport,
        )
        await provider.generate(
            message=MESSAGE,
            catalog=CATALOG,
            workspace_id="workspace-a",
            actor_id="actor-a",
        )
        schema = transport.calls[0][1]["output_config"]["format"]["schema"]  # type: ignore[index]
        serialized = json.dumps(schema)
        for keyword in ("minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"):
            self.assertNotIn(keyword, serialized)
        self.assertIs(schema["additionalProperties"], False)
        self.assertIn("scope", schema["required"])
        self.assertIn("customer_reference", schema["properties"])
        self.assertIn(
            "single_item_order", schema["properties"]["scope"]["enum"]
        )

    async def test_refusal_and_incomplete_responses_fail_closed_and_stay_charged(self) -> None:
        cases = (
            (
                {
                    "id": "msg-refusal",
                    "model": "claude-sonnet-5",
                    "stop_reason": "refusal",
                    "content": [],
                },
                "order_intake_provider_refused",
            ),
            (
                {
                    "id": "msg-truncated",
                    "model": "claude-sonnet-5",
                    "stop_reason": "max_tokens",
                    "content": [{"type": "text", "text": "{\"scope\":"}],
                },
                "order_intake_provider_incomplete",
            ),
            (
                {
                    "id": "msg-paused",
                    "model": "claude-sonnet-5",
                    "stop_reason": "pause_turn",
                    "content": [],
                },
                "order_intake_provider_incomplete",
            ),
        )
        for response, expected_code in cases:
            with self.subTest(code=expected_code, stop_reason=response["stop_reason"]):
                budget = RecordingBudget()
                provider = AnthropicOrderIntakeProvider(
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
        provider = AnthropicOrderIntakeProvider(
            api_key="test-provider-key",
            budget=budget,
            transport=RecordingTransport(anthropic_completed_response(extraction)),
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
        transport = RecordingTransport(anthropic_completed_response())
        provider = AnthropicOrderIntakeProvider(
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

    def test_blank_provider_key_is_rejected_without_network_io(self) -> None:
        with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_provider_not_configured"):
            AnthropicOrderIntakeProvider(api_key="   ", budget=RecordingBudget())

    def test_provider_error_types_map_to_stable_codes(self) -> None:
        cases = (
            (429, "rate_limit_error", "Rate limit reached", "order_intake_provider_rate_limited"),
            (429, "overloaded_error", "Overloaded", "order_intake_provider_rate_limited"),
            (529, "overloaded_error", "Overloaded", "order_intake_provider_rate_limited"),
            (400, "billing_error", "Billing issue", "order_intake_provider_quota_exhausted"),
            (
                400,
                "invalid_request_error",
                "Your credit balance is too low to access the Anthropic API.",
                "order_intake_provider_quota_exhausted",
            ),
            (500, "api_error", "Internal server error", "order_intake_provider_unavailable"),
            (401, "authentication_error", "invalid x-api-key", "order_intake_provider_unavailable"),
        )
        for status, provider_type, provider_message, expected in cases:
            with self.subTest(status=status, provider_type=provider_type):
                body = json.dumps({
                    "type": "error",
                    "error": {"type": provider_type, "message": provider_message},
                }).encode()
                error = HTTPError(
                    "https://api.anthropic.com/v1/messages",
                    status,
                    "Provider Error",
                    None,
                    BytesIO(body),
                )
                with patch("supermega_runtime.order_intake_provider.build_opener") as build_opener:
                    build_opener.return_value.open.side_effect = error
                    with self.assertRaisesRegex(OrderIntakeProviderError, expected):
                        _anthropic_transport("test-provider-key", {"model": "claude-sonnet-5"}, 5)

    def test_transport_failures_and_oversized_bodies_fail_closed(self) -> None:
        for failure in (TimeoutError("timed out"), URLError("unreachable"), OSError("socket")):
            with self.subTest(failure=type(failure).__name__):
                with patch("supermega_runtime.order_intake_provider.build_opener") as build_opener:
                    build_opener.return_value.open.side_effect = failure
                    with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_provider_unavailable"):
                        _anthropic_transport("test-provider-key", {"model": "claude-sonnet-5"}, 5)

        oversized = b"{\"padding\":\"" + b"x" * (MAX_ORDER_INTAKE_PROVIDER_RESPONSE_BYTES + 64) + b"\"}"
        for body in (oversized, b"not-json"):
            with self.subTest(body=len(body)):
                with patch("supermega_runtime.order_intake_provider.build_opener") as build_opener:
                    build_opener.return_value.open.return_value = FakeHttpResponse(body)
                    with self.assertRaisesRegex(
                        OrderIntakeProviderError, "order_intake_provider_invalid_response"
                    ):
                        _anthropic_transport("test-provider-key", {"model": "claude-sonnet-5"}, 5)

    def test_provider_request_never_forwards_the_key_through_a_redirect(self) -> None:
        redirect = HTTPError(
            "https://api.anthropic.com/v1/messages",
            307,
            "Temporary Redirect",
            {"location": "https://untrusted.example/collect"},
            BytesIO(b""),
        )
        with patch("supermega_runtime.order_intake_provider.build_opener") as build_opener:
            build_opener.return_value.open.side_effect = redirect
            with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_provider_unavailable"):
                _anthropic_transport("test-provider-key", {"model": "claude-sonnet-5"}, 5)


class OrderIntakeProviderSelectionTests(unittest.TestCase):
    def selected(self, environment: dict[str, str]) -> object:
        with patch.dict(os.environ, environment, clear=True):
            return order_intake_provider_from_environment()

    def test_absent_keys_stay_unconfigured_without_network_io(self) -> None:
        self.assertIsNone(self.selected({}))
        self.assertIsNone(self.selected({"OPENAI_API_KEY": "   ", "ANTHROPIC_API_KEY": ""}))

    def test_present_key_selects_its_provider_and_anthropic_wins_a_tie(self) -> None:
        self.assertIsInstance(
            self.selected({"OPENAI_API_KEY": "openai-key"}), OpenAIOrderIntakeProvider
        )
        self.assertIsInstance(
            self.selected({"ANTHROPIC_API_KEY": "anthropic-key"}), AnthropicOrderIntakeProvider
        )
        self.assertIsInstance(
            self.selected({"OPENAI_API_KEY": "openai-key", "ANTHROPIC_API_KEY": "anthropic-key"}),
            AnthropicOrderIntakeProvider,
        )

    def test_explicit_provider_is_honoured_and_never_falls_back(self) -> None:
        self.assertIsInstance(
            self.selected({
                "SUPERMEGA_ORDER_INTAKE_PROVIDER": "openai",
                "OPENAI_API_KEY": "openai-key",
                "ANTHROPIC_API_KEY": "anthropic-key",
            }),
            OpenAIOrderIntakeProvider,
        )
        self.assertIsInstance(
            self.selected({
                "SUPERMEGA_ORDER_INTAKE_PROVIDER": "Anthropic",
                "OPENAI_API_KEY": "openai-key",
                "ANTHROPIC_API_KEY": "anthropic-key",
            }),
            AnthropicOrderIntakeProvider,
        )
        self.assertIsNone(
            self.selected({
                "SUPERMEGA_ORDER_INTAKE_PROVIDER": "anthropic",
                "OPENAI_API_KEY": "openai-key",
            })
        )
        with self.assertRaisesRegex(OrderIntakeProviderError, "order_intake_provider_not_configured"):
            self.selected({
                "SUPERMEGA_ORDER_INTAKE_PROVIDER": "mistral",
                "ANTHROPIC_API_KEY": "anthropic-key",
            })

    def test_selected_provider_uses_its_own_default_model(self) -> None:
        anthropic_provider = self.selected({"ANTHROPIC_API_KEY": "anthropic-key"})
        openai_provider = self.selected({"OPENAI_API_KEY": "openai-key"})
        self.assertEqual(anthropic_provider._model, DEFAULT_ANTHROPIC_ORDER_INTAKE_MODEL)  # type: ignore[union-attr]
        self.assertEqual(openai_provider._model, DEFAULT_ORDER_INTAKE_MODEL)  # type: ignore[union-attr]
        overridden = self.selected({
            "ANTHROPIC_API_KEY": "anthropic-key",
            "SUPERMEGA_ORDER_INTAKE_MODEL": "claude-opus-5",
        })
        self.assertEqual(overridden._model, "claude-opus-5")  # type: ignore[union-attr]


if __name__ == "__main__":
    unittest.main()
