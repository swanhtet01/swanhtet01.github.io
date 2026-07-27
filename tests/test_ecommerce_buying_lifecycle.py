from __future__ import annotations

from copy import deepcopy
import unittest

from supermega_runtime.ecommerce_buying_lifecycle import (
    ECOMMERCE_PIM_SCHEMA,
    ECOMMERCE_QUOTE_SCHEMA,
    ECOMMERCE_REQUEST_SCHEMA,
    ECOMMERCE_RETURN_INTENT_SCHEMA,
    ECOMMERCE_SHOP_DRAFT_SCHEMA,
    EcommerceLifecycleValidationError,
    build_ecommerce_checkout_quote,
    build_ecommerce_order_request,
    build_ecommerce_pim_projection,
    build_ecommerce_return_intent,
    create_empty_ecommerce_lifecycle_state,
    ecommerce_payment_matches_fulfilment,
    prepare_ecommerce_shop_handoff,
    record_ecommerce_order_request,
    record_ecommerce_return_intent,
    validate_ecommerce_checkout_quote,
    validate_ecommerce_lifecycle_state,
    validate_ecommerce_order_request,
)


SCOPE = "ecommerce:client-demo"
CHECKOUT_KEY = "ECI-12345678-1234-4ABC-8ABC-1234567890AB"
RETURN_KEY = "ERI-12345678-1234-4ABC-8ABC-1234567890AC"
SOURCE_DIGEST = "sha256:" + "1" * 64


def pim_items() -> list[dict[str, object]]:
    return [
        {
            "sku": "SKU-BLUE-M",
            "name": "Everyday shirt",
            "variant": "Blue / M",
            "unitPriceMmk": 24_000,
            "availability": "available",
        },
        {
            "sku": "SKU-CARE-01",
            "name": "Care kit",
            "variant": None,
            "unitPriceMmk": 8_500,
            "availability": "available",
        },
        {
            "sku": "SKU-RED-L",
            "name": "Everyday shirt",
            "variant": "Red / L",
            "unitPriceMmk": 24_000,
            "availability": "sold_out",
        },
    ]


def projection(scope: str = SCOPE) -> dict[str, object]:
    return build_ecommerce_pim_projection(
        scope=scope,
        source_preview_digest=SOURCE_DIGEST,
        items=pim_items(),
    )


def quote(**overrides: object) -> dict[str, object]:
    values: dict[str, object] = {
        "pim": projection(),
        "cart": [
            {"sku": "SKU-CARE-01", "quantity": 1},
            {"sku": "SKU-BLUE-M", "quantity": 2},
        ],
        "customer_reference": "Ma Su · 09 123 456",
        "fulfilment": "delivery",
        "payment_adapter": "kbzpay_manual",
        "promotion_code": "WELCOME",
        "idempotency_key": CHECKOUT_KEY,
        "quoted_at": "2026-07-26T10:00:00+06:30",
        "expires_at": "2026-07-26T10:15:00+06:30",
    }
    values.update(overrides)
    return build_ecommerce_checkout_quote(**values)  # type: ignore[arg-type]


def request(scope: str = SCOPE) -> dict[str, object]:
    return build_ecommerce_order_request(
        quote(pim=projection(scope)),
        source_storefront_revision=4,
        source_storefront_action_id="ACT-STOREFRONT-R4",
    )


def current_catalog() -> list[dict[str, object]]:
    return [
        {
            "sku": item["sku"],
            "name": item["name"],
            "variant": item["variant"],
            "price": item["unitPriceMmk"],
            "onHand": 10,
        }
        for item in pim_items()
    ]


def completed_order() -> dict[str, object]:
    return {
        "id": "ORD-1001",
        "status": "completed",
        "sourceRecordId": "ECR-12345678-1234-4ABC-8ABC-1234567890AB",
        "lines": [
            {"sku": "SKU-BLUE-M", "quantity": 2},
            {"sku": "SKU-CARE-01", "quantity": 1},
        ],
        "returns": [{"sku": "SKU-BLUE-M", "quantity": 1}],
        "completion": {"actionId": "ACT-COMPLETE-001"},
    }


class EcommerceBuyingLifecycleTests(unittest.TestCase):
    def test_pim_projection_is_variant_preserving_and_canonical(self) -> None:
        first = projection()
        second = build_ecommerce_pim_projection(
            scope=SCOPE,
            source_preview_digest=SOURCE_DIGEST,
            items=list(reversed(pim_items())),
        )
        self.assertEqual(first, second)
        self.assertEqual(first["schema"], ECOMMERCE_PIM_SCHEMA)
        self.assertEqual(
            [item["sku"] for item in first["items"]],
            ["SKU-BLUE-M", "SKU-CARE-01", "SKU-RED-L"],
        )
        self.assertEqual(first["items"][0]["variant"], "Blue / M")
        self.assertTrue(str(first["pimDigest"]).startswith("sha256:"))

    def test_quote_is_deterministic_and_uses_explicit_non_consequential_adapters(self) -> None:
        first = quote()
        second = quote(cart=list(reversed([
            {"sku": "SKU-CARE-01", "quantity": 1},
            {"sku": "SKU-BLUE-M", "quantity": 2},
        ])))
        self.assertEqual(first, second)
        self.assertEqual(first["schema"], ECOMMERCE_QUOTE_SCHEMA)
        self.assertEqual(first["subtotalMmk"], 56_500)
        self.assertEqual(first["totalMmk"], 56_500)
        self.assertEqual(first["promotion"]["status"], "pending_shop_review")
        self.assertEqual(first["promotion"]["amountMmk"], 0)
        self.assertEqual(first["tax"], {
            "adapter": "price_inclusive",
            "status": "included",
            "amountMmk": 0,
        })
        self.assertEqual(first["shipping"]["status"], "pending_shop_review")
        self.assertEqual(first["payment"], {
            "adapter": "kbzpay_manual",
            "status": "not_authorized",
            "amountMmk": 0,
        })
        serialized = str(first).lower()
        for forbidden in ("chargeid", "paymentintent", "providersecret", "authorizationid"):
            self.assertNotIn(forbidden, serialized)

    def test_pickup_boundary_is_zero_and_included(self) -> None:
        candidate = quote(
            fulfilment="pickup",
            payment_adapter="pay_on_pickup",
            promotion_code=None,
        )
        self.assertEqual(candidate["promotion"]["status"], "not_requested")
        self.assertEqual(candidate["shipping"], {
            "adapter": "pickup",
            "status": "included",
            "amountMmk": 0,
        })
        self.assertEqual(candidate["payment"]["status"], "not_authorized")

    def test_payment_must_match_how_the_customer_receives_the_order(self) -> None:
        self.assertTrue(ecommerce_payment_matches_fulfilment("pickup", "pay_on_pickup"))
        self.assertTrue(ecommerce_payment_matches_fulfilment("delivery", "cash_on_delivery"))
        self.assertTrue(ecommerce_payment_matches_fulfilment("pickup", "kbzpay_manual"))
        self.assertTrue(ecommerce_payment_matches_fulfilment("delivery", "kbzpay_manual"))
        for fulfilment, payment_adapter in (
            ("pickup", "cash_on_delivery"),
            ("delivery", "pay_on_pickup"),
        ):
            with self.subTest(fulfilment=fulfilment, payment_adapter=payment_adapter):
                with self.assertRaisesRegex(
                    EcommerceLifecycleValidationError,
                    "does not match",
                ):
                    quote(
                        fulfilment=fulfilment,
                        payment_adapter=payment_adapter,
                    )

    def test_quote_rejects_sold_out_unknown_duplicate_and_tampered_cart(self) -> None:
        invalid_carts = [
            [{"sku": "SKU-RED-L", "quantity": 1}],
            [{"sku": "UNKNOWN", "quantity": 1}],
            [
                {"sku": "SKU-BLUE-M", "quantity": 1},
                {"sku": "SKU-BLUE-M", "quantity": 2},
            ],
            [{"sku": "SKU-BLUE-M", "quantity": 100}],
        ]
        for candidate in invalid_carts:
            with self.subTest(candidate=candidate):
                with self.assertRaises(EcommerceLifecycleValidationError):
                    quote(cart=candidate)
        tampered = quote()
        tampered["lines"][0]["unitPriceMmk"] += 1
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "digest|subtotal|lineTotal"):
            validate_ecommerce_checkout_quote(tampered)

    def test_request_preserves_exact_quote_and_tenant_scope(self) -> None:
        candidate = request()
        self.assertEqual(candidate["schema"], ECOMMERCE_REQUEST_SCHEMA)
        self.assertEqual(candidate["id"], "ECR-12345678-1234-4ABC-8ABC-1234567890AB")
        self.assertEqual(candidate["state"], "pending_shop_review")
        self.assertEqual(candidate["lines"], candidate["quote"]["lines"])
        self.assertEqual(candidate["scope"], candidate["quote"]["scope"])
        tampered = deepcopy(candidate)
        tampered["totalMmk"] += 1
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "exact quote"):
            validate_ecommerce_order_request(tampered)

    def test_shop_handoff_revalidates_all_lines_and_expires_closed(self) -> None:
        candidate = request()
        draft = prepare_ecommerce_shop_handoff(
            candidate,
            current_catalog=current_catalog(),
            confirmed_at="2026-07-26T10:10:00+06:30",
        )
        self.assertEqual(draft["schema"], ECOMMERCE_SHOP_DRAFT_SCHEMA)
        self.assertEqual(draft["state"], "review_required")
        self.assertEqual(draft["lines"], candidate["lines"])
        self.assertEqual(draft["pricing"]["payment"]["status"], "not_authorized")
        self.assertEqual(draft["totalMmk"], candidate["totalMmk"])
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "expired"):
            prepare_ecommerce_shop_handoff(
                candidate,
                current_catalog=current_catalog(),
                confirmed_at="2026-07-26T10:15:01+06:30",
            )

    def test_shop_handoff_rejects_price_variant_and_stock_drift_without_mutation(self) -> None:
        candidate = request()
        for patch in (
            {"price": 24_001},
            {"variant": "Blue / L"},
            {"onHand": 1},
        ):
            catalog = current_catalog()
            catalog[0].update(patch)
            before = deepcopy(catalog)
            with self.subTest(patch=patch):
                with self.assertRaises(EcommerceLifecycleValidationError):
                    prepare_ecommerce_shop_handoff(
                        candidate,
                        current_catalog=catalog,
                        confirmed_at="2026-07-26T10:10:00+06:30",
                    )
                self.assertEqual(catalog, before)

    def test_request_recovery_is_digest_chained_exact_replay_and_conflict_safe(self) -> None:
        empty = create_empty_ecommerce_lifecycle_state(SCOPE)
        candidate = request()
        first = record_ecommerce_order_request(
            empty,
            candidate,
            expected_head_digest=empty["headDigest"],
        )
        replay = record_ecommerce_order_request(
            first,
            deepcopy(candidate),
            expected_head_digest=first["headDigest"],
        )
        self.assertEqual(replay, first)
        self.assertEqual(first["revision"], 1)
        self.assertEqual(len(first["events"]), 1)
        self.assertEqual(validate_ecommerce_lifecycle_state(first), first)
        conflicting = deepcopy(candidate)
        conflicting["customerReference"] = "Different customer"
        conflicting["quote"]["customerReference"] = "Different customer"
        with self.assertRaises(EcommerceLifecycleValidationError):
            record_ecommerce_order_request(
                first,
                conflicting,
                expected_head_digest=first["headDigest"],
            )
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "changed"):
            record_ecommerce_order_request(
                first,
                request(),
                expected_head_digest=empty["headDigest"],
            )
        other = create_empty_ecommerce_lifecycle_state("ecommerce:other-client")
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "different scope"):
            record_ecommerce_order_request(
                other,
                candidate,
                expected_head_digest=other["headDigest"],
            )

    def test_return_intent_requires_completed_attributable_order_and_remaining_quantity(self) -> None:
        intent = build_ecommerce_return_intent(
            scope=SCOPE,
            order_snapshot=completed_order(),
            sku="SKU-BLUE-M",
            quantity=1,
            disposition="restock",
            reason="Customer returned the unopened item for Shop review.",
            idempotency_key=RETURN_KEY,
            created_at="2026-07-26T11:00:00+06:30",
        )
        self.assertEqual(intent["schema"], ECOMMERCE_RETURN_INTENT_SCHEMA)
        self.assertEqual(intent["state"], "pending_shop_review")
        self.assertEqual(intent["refundStatus"], "not_started")
        for changed in (
            {"status": "preparing"},
            {"completion": None},
            {"sourceRecordId": "MANUAL-ORDER"},
        ):
            order = completed_order()
            order.update(changed)
            with self.subTest(changed=changed):
                with self.assertRaises(EcommerceLifecycleValidationError):
                    build_ecommerce_return_intent(
                        scope=SCOPE,
                        order_snapshot=order,
                        sku="SKU-BLUE-M",
                        quantity=1,
                        disposition="restock",
                        reason="Return review.",
                        idempotency_key=RETURN_KEY,
                        created_at="2026-07-26T11:00:00+06:30",
                    )
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "remaining"):
            build_ecommerce_return_intent(
                scope=SCOPE,
                order_snapshot=completed_order(),
                sku="SKU-BLUE-M",
                quantity=2,
                disposition="restock",
                reason="Too many returned.",
                idempotency_key=RETURN_KEY,
                created_at="2026-07-26T11:00:00+06:30",
            )

    def test_return_recovery_is_exact_replay_and_never_claims_refund(self) -> None:
        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        candidate_request = request()
        state = record_ecommerce_order_request(
            state,
            candidate_request,
            expected_head_digest=state["headDigest"],
        )
        intent = build_ecommerce_return_intent(
            scope=SCOPE,
            order_snapshot=completed_order(),
            sku="SKU-CARE-01",
            quantity=1,
            disposition="not_restocked",
            reason="Opened item requires Shop disposition review.",
            idempotency_key=RETURN_KEY,
            created_at="2026-07-26T11:05:00+06:30",
        )
        returned = record_ecommerce_return_intent(
            state,
            intent,
            expected_head_digest=state["headDigest"],
        )
        replay = record_ecommerce_return_intent(
            returned,
            deepcopy(intent),
            expected_head_digest=returned["headDigest"],
        )
        self.assertEqual(replay, returned)
        self.assertEqual(returned["revision"], 2)
        self.assertEqual(intent["refundStatus"], "not_started")
        self.assertNotIn("refundAmount", str(intent))
        self.assertNotIn("provider", str(intent).lower())

    def test_strict_contract_rejects_extra_fields_and_forged_history(self) -> None:
        candidate_quote = quote()
        with self.assertRaises(EcommerceLifecycleValidationError):
            validate_ecommerce_checkout_quote({**candidate_quote, "unexpected": True})
        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        state = record_ecommerce_order_request(
            state,
            request(),
            expected_head_digest=state["headDigest"],
        )
        forged = deepcopy(state)
        forged["events"][0]["subjectId"] = "ECR-FORGED"
        with self.assertRaises(EcommerceLifecycleValidationError):
            validate_ecommerce_lifecycle_state(forged)


if __name__ == "__main__":
    unittest.main()
