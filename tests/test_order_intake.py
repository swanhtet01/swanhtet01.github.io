from __future__ import annotations

from datetime import UTC, datetime
import json
from pathlib import Path
import unittest

from pydantic import ValidationError

from supermega_runtime.order_intake import (
    ORDER_INTAKE_SCHEMA,
    OrderIntakeCatalogItem,
    OrderIntakeContractError,
    OrderIntakeModelFieldProvenance,
    OrderIntakeModelExtraction,
    OrderIntakeSourceQuote,
    build_order_intake_draft,
)
from supermega_runtime.order_intake_eval import evaluate_order_intake_results


FIXTURE_PATH = Path(__file__).with_name("fixtures") / "order_intake_v1.json"
ORDER_FIELDS = {
    "customer_reference",
    "channel",
    "sku",
    "quantity",
    "payment",
    "fulfilment",
}


def load_fixture_corpus() -> dict[str, object]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def source_quotes(message: str, quotes: list[str]) -> list[OrderIntakeSourceQuote]:
    sources: list[OrderIntakeSourceQuote] = []
    for quote in quotes:
        if quote not in message:
            raise AssertionError(f"{quote!r} is not present in fixture message")
        sources.append(OrderIntakeSourceQuote(quote=quote, occurrence=1))
    return sources


def extraction_from_fixture(fixture: dict[str, object]) -> OrderIntakeModelExtraction:
    message = str(fixture["message"])
    expected = fixture["expected"]
    if not isinstance(expected, dict):
        raise AssertionError("fixture expected value must be an object")
    values = expected["values"]
    expected_quotes = expected["source_quotes"]
    if not isinstance(values, dict) or not isinstance(expected_quotes, dict):
        raise AssertionError("fixture values and source_quotes must be objects")
    provenance = [
        OrderIntakeModelFieldProvenance(
            field=field,
            source_quotes=source_quotes(message, quotes),
        )
        for field, quotes in expected_quotes.items()
    ]
    return OrderIntakeModelExtraction(
        scope=expected["scope"],
        customer_reference=values["customer_reference"],
        channel=values["channel"],
        sku=values["sku"],
        quantity=values["quantity"],
        payment=values["payment"],
        fulfilment=values["fulfilment"],
        uncertain_fields=expected["uncertain_fields"],
        provenance=provenance,
    )


class OrderIntakeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.corpus = load_fixture_corpus()
        cls.catalog = [
            OrderIntakeCatalogItem.model_validate(item)
            for item in cls.corpus["catalog"]  # type: ignore[index]
        ]

    def test_fixture_corpus_is_bounded_diverse_and_source_backed(self) -> None:
        self.assertEqual(
            self.corpus["schema"],
            "supermega.order_intake.fixtures.v1",
        )
        fixtures = self.corpus["fixtures"]
        self.assertIsInstance(fixtures, list)
        self.assertEqual(len(fixtures), 20)
        self.assertEqual(len({fixture["id"] for fixture in fixtures}), 20)
        self.assertEqual(
            {fixture["language"] for fixture in fixtures},
            {"my", "en", "mixed"},
        )
        self.assertTrue(
            {
                "happy_path",
                "missing_required",
                "unknown_catalog",
                "conflict",
                "multiple_items",
                "inventory_boundary",
                "noisy_input",
                "forwarded_chat",
                "prompt_injection",
                "retraction",
            }.issubset({fixture["case"] for fixture in fixtures})
        )

        for fixture in fixtures:
            with self.subTest(fixture=fixture["id"]):
                message = fixture["message"]
                expected = fixture["expected"]
                self.assertIsInstance(message, str)
                self.assertTrue(message.strip())
                self.assertLessEqual(len(message), 4_000)
                self.assertEqual(set(expected["values"]), ORDER_FIELDS)
                self.assertIn(
                    expected["status"],
                    {"ready_for_review", "needs_clarification"},
                )
                for quotes in expected["source_quotes"].values():
                    for quote in quotes:
                        self.assertIn(quote, message)

    def test_all_twenty_expected_extractions_build_ephemeral_drafts(self) -> None:
        fixtures = self.corpus["fixtures"]
        for index, fixture in enumerate(fixtures, start=1):
            with self.subTest(fixture=fixture["id"]):
                expected = fixture["expected"]
                extraction = extraction_from_fixture(fixture)
                draft = build_order_intake_draft(
                    message=fixture["message"],
                    catalog=self.catalog,
                    extraction=extraction,
                    response_id=f"resp-fixture-{index}",
                    model="fixture-model",
                    request_id=f"OID-{index:032x}",
                    generated_at=datetime(2026, 7, 23, 10, index, tzinfo=UTC),
                )
                self.assertEqual(draft.schema_version, ORDER_INTAKE_SCHEMA)
                self.assertEqual(draft.scope, expected["scope"])
                self.assertEqual(draft.status, expected["status"])
                self.assertEqual(draft.uncertain_fields, expected["uncertain_fields"])
                for field, value in expected["values"].items():
                    self.assertEqual(getattr(draft, field), value)
                if draft.catalog_item and draft.quantity:
                    self.assertEqual(
                        draft.total_mmk,
                        draft.catalog_item.unit_price_mmk * draft.quantity,
                    )

    def test_non_null_value_without_source_span_is_rejected(self) -> None:
        extraction = OrderIntakeModelExtraction(
            scope="single_item_order",
            customer_reference=None,
            channel="messenger",
            sku="SM-1001",
            quantity=1,
            payment="kbzpay",
            fulfilment=None,
            uncertain_fields=[],
            provenance=[],
        )
        with self.assertRaisesRegex(
            OrderIntakeContractError,
            "channel is not backed",
        ):
            build_order_intake_draft(
                message="SM-1001 qty 1 via Messenger, KBZPay",
                catalog=self.catalog,
                extraction=extraction,
                response_id="resp-missing-provenance",
                model="fixture-model",
            )

    def test_mismatched_source_quote_is_rejected(self) -> None:
        extraction = OrderIntakeModelExtraction(
            scope="single_item_order",
            customer_reference=None,
            channel=None,
            sku=None,
            quantity=None,
            payment=None,
            fulfilment=None,
            uncertain_fields=["sku"],
            provenance=[
                OrderIntakeModelFieldProvenance(
                    field="sku",
                    source_quotes=[
                        OrderIntakeSourceQuote(quote="fake", occurrence=1)
                    ],
                )
            ],
        )
        with self.assertRaisesRegex(
            OrderIntakeContractError,
            "is not present",
        ):
            build_order_intake_draft(
                message="real",
                catalog=self.catalog,
                extraction=extraction,
                response_id="resp-bad-span",
                model="fixture-model",
            )

    def test_server_resolves_repeated_quotes_to_exact_unicode_spans(self) -> None:
        message = "၁ လုံး မဟုတ်ဘူး ၁ လုံးပဲ"
        extraction = OrderIntakeModelExtraction(
            scope="ambiguous",
            customer_reference=None,
            channel=None,
            sku=None,
            quantity=None,
            payment=None,
            fulfilment=None,
            uncertain_fields=["quantity"],
            provenance=[
                OrderIntakeModelFieldProvenance(
                    field="quantity",
                    source_quotes=[
                        OrderIntakeSourceQuote(quote="၁ လုံး", occurrence=2)
                    ],
                )
            ],
        )
        draft = build_order_intake_draft(
            message=message,
            catalog=self.catalog,
            extraction=extraction,
            response_id="resp-repeated-quote",
            model="fixture-model",
        )
        span = draft.provenance[0].source_spans[0]
        self.assertEqual(message[span.start : span.end], "၁ လုံး")
        self.assertEqual(span.start, message.rfind("၁ လုံး"))

    def test_unknown_sku_and_insufficient_stock_fail_closed(self) -> None:
        unknown_message = "SKU-X qty 1 via Messenger, pay Cash"
        unknown = OrderIntakeModelExtraction(
            scope="single_item_order",
            customer_reference=None,
            channel="messenger",
            sku="SKU-X",
            quantity=1,
            payment="cash",
            fulfilment=None,
            uncertain_fields=[],
            provenance=[
                OrderIntakeModelFieldProvenance(
                    field="channel",
                    source_quotes=source_quotes(unknown_message, ["Messenger"]),
                ),
                OrderIntakeModelFieldProvenance(
                    field="sku",
                    source_quotes=source_quotes(unknown_message, ["SKU-X"]),
                ),
                OrderIntakeModelFieldProvenance(
                    field="quantity",
                    source_quotes=source_quotes(unknown_message, ["qty 1"]),
                ),
                OrderIntakeModelFieldProvenance(
                    field="payment",
                    source_quotes=source_quotes(unknown_message, ["Cash"]),
                ),
            ],
        )
        unknown_draft = build_order_intake_draft(
            message=unknown_message,
            catalog=self.catalog,
            extraction=unknown,
            response_id="resp-unknown",
            model="fixture-model",
        )
        self.assertEqual(unknown_draft.status, "needs_clarification")
        self.assertIn("unknown_sku", unknown_draft.blockers)
        self.assertIsNone(unknown_draft.catalog_item)

        stock_fixture = next(
            fixture
            for fixture in self.corpus["fixtures"]
            if fixture["id"] == "mixed-insufficient-stock-14"
        )
        stock_draft = build_order_intake_draft(
            message=stock_fixture["message"],
            catalog=self.catalog,
            extraction=extraction_from_fixture(stock_fixture),
            response_id="resp-stock",
            model="fixture-model",
        )
        self.assertEqual(stock_draft.status, "needs_clarification")
        self.assertIn("insufficient_stock", stock_draft.blockers)

    def test_draft_omits_raw_message_and_operational_instructions(self) -> None:
        fixture = self.corpus["fixtures"][0]
        draft = build_order_intake_draft(
            message=fixture["message"],
            catalog=self.catalog,
            extraction=extraction_from_fixture(fixture),
            response_id="resp-private",
            model="fixture-model",
        )
        payload = draft.model_dump()
        serialized = json.dumps(payload, ensure_ascii=False)
        self.assertNotIn(fixture["message"], serialized)
        self.assertNotIn("command", payload)
        self.assertNotIn("action", payload)
        self.assertNotIn("tools", payload)
        self.assertTrue(payload["message_digest"].startswith("sha256:"))

    def test_provider_schema_forbids_extra_operational_fields(self) -> None:
        schema = OrderIntakeModelExtraction.model_json_schema()
        self.assertEqual(
            set(schema["required"]),
            set(schema["properties"]),
        )
        self.assertIs(schema["additionalProperties"], False)
        for definition in schema.get("$defs", {}).values():
            self.assertIs(definition["additionalProperties"], False)
            self.assertEqual(
                set(definition["required"]),
                set(definition["properties"]),
            )

        with self.assertRaises(ValidationError):
            OrderIntakeModelExtraction.model_validate(
                {
                    "scope": "single_item_order",
                    "customer_reference": None,
                    "channel": None,
                    "sku": None,
                    "quantity": None,
                    "payment": None,
                    "fulfilment": None,
                    "uncertain_fields": [],
                    "provenance": [],
                    "action": "create_order",
                }
            )

        with self.assertRaises(ValidationError):
            OrderIntakeModelExtraction.model_validate(
                {
                    "scope": "single_item_order",
                    "customer_reference": "x" * 81,
                    "channel": None,
                    "sku": None,
                    "quantity": None,
                    "payment": None,
                    "fulfilment": None,
                    "uncertain_fields": [],
                    "provenance": [],
                }
            )

    def test_offline_scorer_requires_all_twenty_exact_results(self) -> None:
        results: list[dict[str, object]] = []
        for index, fixture in enumerate(self.corpus["fixtures"], start=1):
            draft = build_order_intake_draft(
                message=fixture["message"],
                catalog=self.catalog,
                extraction=extraction_from_fixture(fixture),
                response_id=f"resp-eval-{index}",
                model="fixture-model",
                request_id=f"OID-{index:032x}",
                generated_at=datetime(2026, 7, 23, 11, index, tzinfo=UTC),
            )
            results.append(
                {
                    "fixture_id": fixture["id"],
                    "draft": draft.model_dump(mode="json"),
                }
            )
        document = {
            "schema": "supermega.order_intake.results.v1",
            "results": results,
        }
        report = evaluate_order_intake_results(self.corpus, document)
        self.assertEqual(report["total"], 20)
        self.assertEqual(report["passed"], 20)
        self.assertEqual(report["failed"], 0)
        self.assertEqual(report["failures"], [])
        self.assertIs(report["passed_all"], True)
        self.assertIs(report["result_set_valid"], True)
        self.assertIs(report["zero_side_effect_scorer"], True)

        tampered = json.loads(json.dumps(document))
        tampered["results"][0]["draft"]["customer_reference"] = "Wrong customer"
        failed = evaluate_order_intake_results(self.corpus, tampered)
        self.assertEqual(failed["passed"], 19)
        self.assertEqual(failed["failed"], 1)
        self.assertIn(
            "customer_reference expected",
            failed["failures"][0]["findings"][0],
        )

        duplicate = json.loads(json.dumps(document))
        duplicate["results"].append(duplicate["results"][0])
        invalid_set = evaluate_order_intake_results(self.corpus, duplicate)
        self.assertIs(invalid_set["result_set_valid"], False)
        self.assertIs(invalid_set["passed_all"], False)
        self.assertTrue(
            any(
                failure["fixture_id"] == "__result_set__"
                for failure in invalid_set["failures"]
            )
        )


if __name__ == "__main__":
    unittest.main()
