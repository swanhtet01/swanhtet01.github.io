from __future__ import annotations

from copy import deepcopy
import unittest

from supermega_runtime.ecommerce_buying_lifecycle import (
    ECOMMERCE_PIM_SCHEMA,
    ECOMMERCE_QUOTE_SCHEMA,
    ECOMMERCE_REQUEST_SCHEMA,
    ECOMMERCE_RETURN_INTENT_SCHEMA,
    ECOMMERCE_RETURN_OUTCOME_SCHEMA,
    ECOMMERCE_SUPPORT_INTENT_SCHEMA,
    ECOMMERCE_SUPPORT_OUTCOME_SCHEMA,
    ECOMMERCE_CORRECTION_INTENT_SCHEMA,
    ECOMMERCE_CORRECTION_OUTCOME_SCHEMA,
    ECOMMERCE_CANCELLATION_INTENT_SCHEMA,
    ECOMMERCE_CANCELLATION_DECISION_SCHEMA,
    ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA,
    ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA,
    ECOMMERCE_SHOP_DRAFT_SCHEMA,
    ECOMMERCE_TAX_DECISION_SCHEMA,
    EcommerceLifecycleValidationError,
    build_ecommerce_checkout_quote,
    build_ecommerce_order_request,
    build_ecommerce_pim_projection,
    build_ecommerce_return_intent,
    build_ecommerce_support_intent,
    build_ecommerce_correction_intent,
    build_ecommerce_cancellation_intent,
    build_ecommerce_cancellation_decision,
    build_ecommerce_order_amendment_intent,
    build_ecommerce_order_reschedule_intent,
    create_empty_ecommerce_lifecycle_state,
    ecommerce_payment_matches_fulfilment,
    prepare_ecommerce_shop_handoff,
    project_ecommerce_return_outcome,
    project_ecommerce_support_outcome,
    project_ecommerce_correction_outcome,
    review_ecommerce_tax,
    record_ecommerce_order_request,
    record_ecommerce_return_intent,
    record_ecommerce_support_intent,
    record_ecommerce_correction_intent,
    record_ecommerce_cancellation_intent,
    record_ecommerce_cancellation_decision,
    record_ecommerce_order_amendment,
    record_ecommerce_order_reschedule,
    validate_ecommerce_checkout_quote,
    validate_ecommerce_lifecycle_state,
    validate_ecommerce_order_request,
    validate_ecommerce_tax_decision,
)


SCOPE = "ecommerce:client-demo"
CHECKOUT_KEY = "ECI-12345678-1234-4ABC-8ABC-1234567890AB"
RETURN_KEY = "ERI-12345678-1234-4ABC-8ABC-1234567890AC"
SUPPORT_KEY = "ESI-12345678-1234-4ABC-8ABC-1234567890AD"
CORRECTION_KEY = "COI-22345678-1234-4ABC-8ABC-1234567890AD"
CANCELLATION_KEY = "CNI-12345678-1234-4ABC-8ABC-1234567890AE"
AMENDMENT_KEY = "AMI-12345678-1234-4ABC-8ABC-1234567890AF"
RESCHEDULE_KEY = "RSI-32345678-1234-4ABC-8ABC-1234567890AF"
RESCHEDULE_CHECKOUT_KEY = "ECI-32345678-1234-4ABC-8ABC-1234567890AE"
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
        quote(pim=projection(scope), fulfilment="pickup"),
        source_storefront_revision=4,
        source_storefront_action_id="ACT-STOREFRONT-R4",
    )


def order_source_request() -> dict[str, object]:
    return build_ecommerce_order_request(
        quote(
            cart=[{"sku": "SKU-BLUE-M", "quantity": 2}],
            fulfilment="delivery",
        ),
        source_storefront_revision=4,
        source_storefront_action_id="ACT-STOREFRONT-R4",
    )


def replacement_request(quantity: int = 3) -> dict[str, object]:
    return build_ecommerce_order_request(
        quote(
            cart=[{"sku": "SKU-BLUE-M", "quantity": quantity}],
            fulfilment="delivery",
            idempotency_key="ECI-22345678-1234-4ABC-8ABC-1234567890AF",
        ),
        source_storefront_revision=4,
        source_storefront_action_id="ACT-STOREFRONT-R4",
    )


def reschedule_request() -> dict[str, object]:
    return build_ecommerce_order_request(
        quote(
            cart=[{"sku": "SKU-BLUE-M", "quantity": 2}],
            fulfilment="delivery",
            idempotency_key=RESCHEDULE_CHECKOUT_KEY,
        ),
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


def promotion_policies() -> list[dict[str, object]]:
    return [{
        "revision": 1,
        "code": "WELCOME",
        "discountBasisPoints": 1_000,
        "minimumSubtotalMmk": 10_000,
        "maximumDiscountMmk": 10_000,
        "status": "active",
        "effectiveFrom": "2026-07-26T09:00:00+06:30",
        "effectiveUntil": None,
        "proof": {
            "actionId": "ACT-PROMOTION-WELCOME-R1",
            "capturedAt": "2026-07-26T09:00:00+06:30",
            "actor": "Pricing manager",
            "reason": "Approve the welcome policy for reviewed Shop orders.",
            "evidenceReference": "PRICING-WELCOME-R1",
        },
    }]


def shipping_policies() -> list[dict[str, object]]:
    return [{
        "revision": 1,
        "zoneCode": "YGN-WEST",
        "townships": ["Hlaing", "Kamayut"],
        "feeMmk": 3_000,
        "promiseMinutes": 120,
        "status": "active",
        "effectiveFrom": "2026-07-26T09:00:00+06:30",
        "effectiveUntil": None,
        "proof": {
            "actionId": "ACT-SHIPPING-YGN-WEST-R1",
            "capturedAt": "2026-07-26T09:00:00+06:30",
            "actor": "Delivery manager",
            "reason": "Approve the Yangon west delivery boundary.",
            "evidenceReference": "SHIPPING-YGN-WEST-R1",
        },
    }]


def payment_policies() -> list[dict[str, object]]:
    base_proof = {
        "capturedAt": "2026-07-26T09:00:00+06:30",
        "actor": "Commerce manager",
        "reason": "Approve the payment method boundary for reviewed Shop orders.",
    }
    return [
        {
            "revision": 2,
            "adapter": "kbzpay_manual",
            "allowedFulfilments": ["delivery", "pickup"],
            "maximumOrderMmk": 5_000_000,
            "instructions": "Verify the customer proof before reconciling payment in Shop.",
            "status": "active",
            "effectiveFrom": "2026-07-26T09:00:00+06:30",
            "effectiveUntil": None,
            "proof": {**base_proof, "actionId": "ACT-PAYMENT-KBZPAY-R2", "evidenceReference": "PAYMENT-KBZPAY-R2"},
        },
        {
            "revision": 1,
            "adapter": "pay_on_pickup",
            "allowedFulfilments": ["pickup"],
            "maximumOrderMmk": None,
            "instructions": "Collect at the pickup counter and reconcile in Shop.",
            "status": "active",
            "effectiveFrom": "2026-07-26T09:00:00+06:30",
            "effectiveUntil": None,
            "proof": {**base_proof, "actionId": "ACT-PAYMENT-PICKUP-R1", "evidenceReference": "PAYMENT-PICKUP-R1"},
        },
    ]


def tax_configurations(mode: str = "exclusive") -> list[dict[str, object]]:
    return [{
        "revision": 1,
        "code": "COMMERCIAL",
        "label": "Commercial tax",
        "rateBasisPoints": 500,
        "mode": mode,
        "jurisdictionCode": "MM-YGN",
        "effectiveFrom": "2026-07-26T09:00:00+06:30",
        "proof": {
            "actionId": "ACT-TAX-COMMERCIAL-R1",
            "capturedAt": "2026-07-26T08:55:00+06:30",
            "actor": "Finance manager",
            "reason": "Approve the reviewed commercial tax schedule.",
            "evidenceReference": "TAX-COMMERCIAL-R1",
        },
    }]


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


def active_commerce_state() -> dict[str, object]:
    order_id = "ORD-ECOMMERCE-1001"
    created_at = "2026-07-26T10:20:00+06:30"
    evidence_reference = f"ECOMMERCE:{request()['id']}:ORDER"
    return {
        "schema": "supermega.commerce.workspace.v2",
        "items": [
            {
                "sku": "SKU-BLUE-M",
                "name": "Everyday shirt",
                "variant": "Blue / M",
                "onHand": 8,
                "reorderAt": 2,
                "price": 24_000,
            }
        ],
        "orders": [
            {
                "id": order_id,
                "createdAt": created_at,
                "customer": "Ma Su",
                "owner": "Shop owner",
                "channel": "Ecommerce",
                "item": "Everyday shirt",
                "itemSku": "SKU-BLUE-M",
                "quantity": 2,
                "payment": "KBZPay",
                "paymentStatus": "pending",
                "refundStatus": "none",
                "fulfilment": "delivery",
                "fulfilmentReference": request()["id"],
                "promisedAt": "2026-07-26T14:00:00+06:30",
                "sourceRecordId": request()["id"],
                "evidenceReference": evidence_reference,
                "lines": [
                    {
                        "sku": "SKU-BLUE-M",
                        "name": "Everyday shirt",
                        "variant": "Blue / M",
                        "quantity": 2,
                        "unitPriceMmk": 24_000,
                    }
                ],
                "calculation": {
                    "schema": "supermega.commerce.order-calculation.v1",
                    "currency": "MMK",
                    "catalogRevision": 0,
                    "subtotalMmk": 48_000,
                    "taxMode": "not_configured",
                    "taxMmk": 0,
                    "totalMmk": 48_000,
                },
                "total": 48_000,
                "status": "confirmed",
            }
        ],
        "movements": [
            {
                "id": "MOV2:ACT-ECOMMERCE-ORDER-1001",
                "actionId": "ACT-ECOMMERCE-ORDER-1001",
                "createdAt": created_at,
                "actor": "Shop owner",
                "reason": "Confirmed the Ecommerce request in Shop.",
                "evidenceReference": evidence_reference,
                "kind": "reserve",
                "sku": "SKU-BLUE-M",
                "quantityDelta": -2,
                "orderId": order_id,
            }
        ],
        "closes": [],
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

    def test_shop_tax_review_is_exact_for_exclusive_and_inclusive_whole_mmk(self) -> None:
        exclusive = review_ecommerce_tax(
            tax_configurations("exclusive"),
            50_850,
            "2026-07-26T10:10:00+06:30",
            7,
        )
        self.assertEqual(exclusive["schema"], ECOMMERCE_TAX_DECISION_SCHEMA)
        self.assertEqual(exclusive["status"], "configured")
        self.assertEqual(exclusive["taxMmk"], 2_543)
        self.assertEqual(exclusive["subtotalMmk"], 50_850)
        self.assertEqual(exclusive["totalMmk"], 53_393)
        self.assertEqual(exclusive["taxConfigurationRevision"], 1)
        self.assertEqual(exclusive["policyActionId"], "ACT-TAX-COMMERCIAL-R1")
        self.assertEqual(validate_ecommerce_tax_decision(exclusive, tax_configurations()), exclusive)

        inclusive = review_ecommerce_tax(
            tax_configurations("inclusive"),
            50_850,
            "2026-07-26T10:10:00+06:30",
            7,
        )
        self.assertEqual(inclusive["taxMmk"], 2_421)
        self.assertEqual(inclusive["subtotalMmk"], 48_429)
        self.assertEqual(inclusive["totalMmk"], 50_850)

    def test_shop_tax_review_selects_effective_revision_and_rejects_forged_evidence(self) -> None:
        current = tax_configurations()[0]
        future = deepcopy(current)
        future.update({
            "revision": 2,
            "rateBasisPoints": 700,
            "effectiveFrom": "2026-07-26T10:20:00+06:30",
        })
        future["proof"].update({
            "actionId": "ACT-TAX-COMMERCIAL-R2",
            "capturedAt": "2026-07-26T10:15:00+06:30",
            "evidenceReference": "TAX-COMMERCIAL-R2",
        })
        configurations = [future, current]
        decision = review_ecommerce_tax(
            configurations,
            50_850,
            "2026-07-26T10:10:00+06:30",
            7,
        )
        self.assertEqual(decision["taxConfigurationRevision"], 1)
        self.assertEqual(decision["taxRateBasisPoints"], 500)

        forged = deepcopy(decision)
        forged["taxMmk"] += 1
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "stale, forged"):
            validate_ecommerce_tax_decision(forged, configurations)

        invalid_schedule = tax_configurations()
        invalid_schedule[0]["effectiveFrom"] = "2026-07-26T08:50:00+06:30"
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "precedes"):
            review_ecommerce_tax(
                invalid_schedule,
                50_850,
                "2026-07-26T10:10:00+06:30",
                7,
            )

        no_schedule = review_ecommerce_tax(
            [],
            50_850,
            "2026-07-26T10:10:00+06:30",
            7,
        )
        self.assertEqual(no_schedule["status"], "not_configured")
        self.assertEqual(no_schedule["taxMmk"], 0)
        self.assertEqual(no_schedule["totalMmk"], 50_850)

    def test_customer_and_delivery_snapshots_are_versioned_digest_bound_and_handed_to_shop(self) -> None:
        profile_input = {"name": "Ma Su", "phone": "09 123 456 789", "previous": None}
        address_input = {
            "line1": "12 Insein Road, Ward 3",
            "township": "Hlaing",
            "city": "Yangon",
            "instructions": "Call at the gate",
            "previous": None,
        }
        first = quote(
            fulfilment="delivery",
            customer_profile_input=profile_input,
            delivery_address_input=address_input,
        )
        self.assertEqual(first["customerProfile"]["revision"], 1)
        self.assertEqual(first["customerProfile"]["name"], "Ma Su")
        self.assertEqual(first["deliveryAddress"]["township"], "Hlaing")
        self.assertTrue(str(first["customerProfile"]["profileDigest"]).startswith("sha256:"))
        self.assertTrue(str(first["deliveryAddress"]["addressDigest"]).startswith("sha256:"))

        customer_request = build_ecommerce_order_request(first)
        state = record_ecommerce_order_request(
            create_empty_ecommerce_lifecycle_state(SCOPE),
            customer_request,
            expected_head_digest="sha256:" + "0" * 64,
        )
        draft = prepare_ecommerce_shop_handoff(
            customer_request,
            current_catalog=current_catalog(),
            current_promotion_policies=promotion_policies(),
            current_shipping_policies=shipping_policies(),
            current_payment_policies=payment_policies(),
            current_tax_configurations=tax_configurations(),
            catalog_revision=7,
            confirmed_at="2026-07-26T10:10:00+06:30",
        )
        self.assertEqual(draft["customerProfile"], first["customerProfile"])
        self.assertEqual(draft["deliveryAddress"], first["deliveryAddress"])
        self.assertEqual(draft["pricing"]["shipping"]["zoneCode"], "YGN-WEST")
        self.assertEqual(draft["pricing"]["shipping"]["feeMmk"], 3_000)
        self.assertEqual(draft["pricing"]["tax"]["taxMmk"], 2_693)
        self.assertEqual(draft["totalMmk"], 56_543)
        self.assertEqual(state["requests"][0]["deliveryAddress"], first["deliveryAddress"])

        next_key = "ECI-12345678-1234-4ABC-8ABC-1234567890AC"
        revised = quote(
            idempotency_key=next_key,
            customer_profile_input={**profile_input, "previous": first["customerProfile"]},
            delivery_address_input={
                **address_input,
                "line1": "14 Insein Road, Ward 3",
                "previous": first["deliveryAddress"],
            },
        )
        self.assertEqual(revised["customerProfile"], first["customerProfile"])
        self.assertEqual(revised["deliveryAddress"]["id"], first["deliveryAddress"]["id"])
        self.assertEqual(revised["deliveryAddress"]["revision"], 2)
        self.assertEqual(revised["deliveryAddress"]["previousDigest"], first["deliveryAddress"]["addressDigest"])

        tampered = deepcopy(first)
        tampered["customerProfile"]["phone"] = "09 999 999 999"
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "digest"):
            validate_ecommerce_checkout_quote(tampered)

    def test_structured_delivery_identity_fails_closed_when_incomplete_or_inapplicable(self) -> None:
        profile_input = {"name": "Ma Su", "phone": "09 123 456 789", "previous": None}
        with self.assertRaises(EcommerceLifecycleValidationError):
            quote(customer_profile_input=profile_input, delivery_address_input=None)
        with self.assertRaises(EcommerceLifecycleValidationError):
            quote(
                fulfilment="pickup",
                payment_adapter="pay_on_pickup",
                customer_profile_input=profile_input,
                delivery_address_input={
                    "line1": "12 Insein Road",
                    "township": "Hlaing",
                    "city": "Yangon",
                    "instructions": None,
                    "previous": None,
                },
            )

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
            current_promotion_policies=promotion_policies(),
            current_shipping_policies=shipping_policies(),
            current_payment_policies=payment_policies(),
            current_tax_configurations=tax_configurations(),
            catalog_revision=7,
            confirmed_at="2026-07-26T10:10:00+06:30",
        )
        self.assertEqual(draft["schema"], ECOMMERCE_SHOP_DRAFT_SCHEMA)
        self.assertEqual(draft["state"], "review_required")
        self.assertEqual(draft["lines"], candidate["lines"])
        self.assertEqual(draft["pricing"]["payment"]["status"], "approved")
        self.assertFalse(draft["pricing"]["payment"]["authorized"])
        self.assertEqual(draft["pricing"]["payment"]["policyRevision"], 2)
        self.assertEqual(draft["pricing"]["promotion"]["status"], "approved")
        self.assertEqual(draft["pricing"]["promotion"]["policyRevision"], 1)
        self.assertEqual(draft["pricing"]["promotion"]["discountMmk"], 5_650)
        self.assertEqual(draft["pricing"]["tax"]["listedSubtotalMmk"], 50_850)
        self.assertEqual(draft["pricing"]["tax"]["taxMmk"], 2_543)
        self.assertEqual(draft["pricing"]["tax"]["policyActionId"], "ACT-TAX-COMMERCIAL-R1")
        self.assertEqual(draft["totalMmk"], 53_393)
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "expired"):
            prepare_ecommerce_shop_handoff(
                candidate,
                current_catalog=current_catalog(),
                current_promotion_policies=promotion_policies(),
                current_shipping_policies=shipping_policies(),
                current_payment_policies=payment_policies(),
                current_tax_configurations=tax_configurations(),
                catalog_revision=7,
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
                        current_promotion_policies=promotion_policies(),
                        current_shipping_policies=shipping_policies(),
                        current_payment_policies=payment_policies(),
                        current_tax_configurations=tax_configurations(),
                        catalog_revision=7,
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
        orphan = create_empty_ecommerce_lifecycle_state(SCOPE)
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "not attributable"):
            record_ecommerce_return_intent(
                orphan,
                intent,
                expected_head_digest=orphan["headDigest"],
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

    def test_return_outcome_requires_one_exact_shop_record_and_keeps_refund_separate(self) -> None:
        order = completed_order()
        intent = build_ecommerce_return_intent(
            scope=SCOPE,
            order_snapshot=order,
            sku="SKU-CARE-01",
            quantity=1,
            disposition="not_restocked",
            reason="Opened item requires Shop disposition review.",
            idempotency_key=RETURN_KEY,
            created_at="2026-07-26T11:05:00+06:30",
        )
        order["refundStatus"] = "none"
        order["returns"] = [{
            "actionId": "ACT-RETURN-CARE-01",
            "createdAt": "2026-07-26T12:00:00+06:30",
            "actor": "Shop owner",
            "reason": "Accepted the inspected return.",
            "evidenceReference": intent["evidenceReference"],
            "sku": intent["sku"],
            "quantity": intent["quantity"],
            "disposition": intent["disposition"],
        }]
        outcome = project_ecommerce_return_outcome(intent, order)
        self.assertIsNotNone(outcome)
        self.assertEqual(outcome["schema"], ECOMMERCE_RETURN_OUTCOME_SCHEMA)  # type: ignore[index]
        self.assertEqual(outcome["stockOutcome"], "not_restocked")  # type: ignore[index]
        self.assertEqual(outcome["refundStatus"], "none")  # type: ignore[index]
        for field in ("automaticRefundPerformed", "customerMessageSent", "providerCalled"):
            self.assertFalse(outcome[field])  # type: ignore[index]

        forged = deepcopy(order)
        forged["returns"][0]["quantity"] = 2  # type: ignore[index]
        self.assertIsNone(project_ecommerce_return_outcome(intent, forged))
        duplicate = deepcopy(order)
        duplicate["returns"].append(deepcopy(duplicate["returns"][0]))  # type: ignore[union-attr]
        self.assertIsNone(project_ecommerce_return_outcome(intent, duplicate))
        backdated = deepcopy(order)
        backdated["returns"][0]["createdAt"] = "2026-07-26T11:00:00+06:30"  # type: ignore[index]
        self.assertIsNone(project_ecommerce_return_outcome(intent, backdated))

        settled = deepcopy(order)
        settled.update({
            "refundStatus": "settled",
            "refundSettledAt": "2026-07-26T13:00:00+06:30",
            "refundSettledBy": "Finance owner",
            "refundEvidenceReference": "REFUND-EXTERNAL-CARE-01",
        })
        settled_outcome = project_ecommerce_return_outcome(intent, settled)
        self.assertEqual(settled_outcome["refundStatus"], "settled")  # type: ignore[index]
        self.assertEqual(
            settled_outcome["refundEvidenceReference"],  # type: ignore[index]
            "REFUND-EXTERNAL-CARE-01",
        )
        settled.pop("refundEvidenceReference")
        self.assertIsNone(project_ecommerce_return_outcome(intent, settled))

    def test_support_intent_is_recoverable_attributable_and_side_effect_free(self) -> None:
        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        state = record_ecommerce_order_request(
            state,
            request(),
            expected_head_digest=state["headDigest"],
        )
        intent = build_ecommerce_support_intent(
            scope=SCOPE,
            order_snapshot=completed_order(),
            category="delivery_issue",
            description="Delivery arrived later than the confirmed promise.",
            idempotency_key=SUPPORT_KEY,
            created_at="2026-07-26T11:10:00+06:30",
        )
        self.assertEqual(intent["schema"], ECOMMERCE_SUPPORT_INTENT_SCHEMA)
        self.assertFalse(intent["externalMessageSent"])
        self.assertFalse(intent["refundStarted"])
        retained = record_ecommerce_support_intent(
            state,
            intent,
            expected_head_digest=state["headDigest"],
        )
        replay = record_ecommerce_support_intent(
            retained,
            deepcopy(intent),
            expected_head_digest=retained["headDigest"],
        )
        self.assertEqual(replay, retained)
        self.assertEqual(retained["revision"], 2)
        self.assertEqual(retained["events"][-1]["action"], "support_intent_recorded")

        orphan = create_empty_ecommerce_lifecycle_state(SCOPE)
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "not attributable"):
            record_ecommerce_support_intent(
                orphan,
                intent,
                expected_head_digest=orphan["headDigest"],
            )

        legacy = deepcopy(state)
        legacy.pop("supportIntents")
        legacy.pop("correctionIntents")
        legacy.pop("cancellationIntents")
        legacy.pop("cancellationDecisions")
        legacy.pop("amendmentIntents")
        legacy.pop("rescheduleIntents")
        migrated = validate_ecommerce_lifecycle_state(legacy)
        self.assertEqual(migrated["supportIntents"], [])

    def test_support_outcome_requires_one_exact_accountable_shop_case(self) -> None:
        order = completed_order()
        intent = build_ecommerce_support_intent(
            scope=SCOPE,
            order_snapshot=order,
            category="delivery_issue",
            description="Delivery arrived later than the confirmed promise.",
            idempotency_key=SUPPORT_KEY,
            created_at="2026-07-26T11:10:00+06:30",
        )
        support_case = {
            "caseId": f"CASE-{intent['id'][4:]}",
            "sourceIntentId": intent["id"],
            "sourceRequestId": intent["sourceRequestId"],
            "customerRequestedAt": intent["createdAt"],
            "category": intent["category"],
            "customerDescription": intent["description"],
            "status": "open",
            "priority": "normal",
            "owner": "Shop owner",
            "dueAt": "2026-07-26T15:00:00+06:30",
            "opening": {
                "actionId": "ACT-SUPPORT-OPEN-01",
                "capturedAt": "2026-07-26T11:20:00+06:30",
                "actor": "Shop owner",
                "reason": "Open the customer help case.",
                "evidenceReference": intent["evidenceReference"],
            },
            "externalMessageSent": False,
            "refundStarted": False,
        }
        order["supportCases"] = [support_case]
        open_outcome = project_ecommerce_support_outcome(intent, order)
        self.assertEqual(open_outcome["schema"], ECOMMERCE_SUPPORT_OUTCOME_SCHEMA)  # type: ignore[index]
        self.assertEqual(open_outcome["state"], "open")  # type: ignore[index]
        self.assertEqual(open_outcome["owner"], "Shop owner")  # type: ignore[index]
        for field in ("externalMessageSent", "refundStarted", "providerCalled"):
            self.assertFalse(open_outcome[field])  # type: ignore[index]

        resolved = deepcopy(order)
        resolved_case = resolved["supportCases"][0]  # type: ignore[index]
        resolved_case["status"] = "resolved"
        resolved_case["resolution"] = {
            "outcome": "information_provided",
            "note": "Reviewed the delivery record and explained the delay.",
            "proof": {
                "actionId": "ACT-SUPPORT-RESOLVE-01",
                "capturedAt": "2026-07-26T12:00:00+06:30",
                "actor": "Shop owner",
                "reason": "Resolve the accountable case.",
                "evidenceReference": f"SUPPORT-RESOLUTION:{support_case['caseId']}",
            },
        }
        resolved_outcome = project_ecommerce_support_outcome(intent, resolved)
        self.assertEqual(resolved_outcome["state"], "resolved")  # type: ignore[index]
        self.assertEqual(resolved_outcome["resolutionOutcome"], "information_provided")  # type: ignore[index]

        forged = deepcopy(order)
        forged["supportCases"][0]["sourceRequestId"] = "ECR-92345678-1234-4ABC-8ABC-1234567890AB"  # type: ignore[index]
        self.assertIsNone(project_ecommerce_support_outcome(intent, forged))
        duplicate = deepcopy(order)
        duplicate["supportCases"].append(deepcopy(duplicate["supportCases"][0]))  # type: ignore[union-attr]
        self.assertIsNone(project_ecommerce_support_outcome(intent, duplicate))
        backdated = deepcopy(order)
        backdated["supportCases"][0]["opening"]["capturedAt"] = "2026-07-26T11:00:00+06:30"  # type: ignore[index]
        self.assertIsNone(project_ecommerce_support_outcome(intent, backdated))
        incomplete = deepcopy(resolved)
        incomplete["supportCases"][0].pop("resolution")  # type: ignore[index]
        self.assertIsNone(project_ecommerce_support_outcome(intent, incomplete))

    def test_correction_request_and_outcome_are_exact_recoverable_and_side_effect_free(self) -> None:
        order = deepcopy(active_commerce_state()["orders"][0])  # type: ignore[index]
        order.update({
            "status": "completed",
            "paymentStatus": "reconciled",
            "refundStatus": "none",
            "completion": {
                "actionId": "ACT-COMPLETE-CORRECTION-01",
                "capturedAt": "2026-07-26T11:00:00+06:30",
            },
            "corrections": [],
        })
        intent = build_ecommerce_correction_intent(
            scope=SCOPE,
            order_snapshot=order,
            requested_kind="credit",
            reason_code="pricing_error",
            listed_amount_mmk=1_000,
            reason="The confirmed unit price was too high.",
            idempotency_key=CORRECTION_KEY,
            created_at="2026-07-26T11:10:00+06:30",
        )
        self.assertEqual(intent["schema"], ECOMMERCE_CORRECTION_INTENT_SCHEMA)
        for field in (
            "orderChanged", "paymentChanged", "refundStarted", "ledgerPosted", "taxFiled",
            "customerMessageSent", "providerCalled",
        ):
            self.assertFalse(intent[field])

        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        state = record_ecommerce_order_request(
            state,
            request(),
            expected_head_digest=state["headDigest"],
        )
        retained = record_ecommerce_correction_intent(
            state,
            intent,
            expected_head_digest=state["headDigest"],
        )
        replay = record_ecommerce_correction_intent(
            retained,
            deepcopy(intent),
            expected_head_digest=retained["headDigest"],
        )
        self.assertEqual(replay, retained)
        self.assertEqual(retained["events"][-1]["action"], "correction_intent_recorded")

        correction = {
            "documentId": "COR2:ACT-CORRECTION-01",
            "actionId": "ACT-CORRECTION-01",
            "createdAt": "2026-07-26T11:20:00+06:30",
            "actor": "Shop owner",
            "reason": intent["reason"],
            "evidenceReference": intent["evidenceReference"],
            "kind": intent["requestedKind"],
            "reasonCode": intent["reasonCode"],
            "sourceCalculationDigest": intent["sourceCalculationDigest"],
            "calculation": {
                "listedAmountMmk": 1_000,
                "subtotalMmk": 1_000,
                "taxMmk": 0,
                "totalMmk": 1_000,
            },
            "balanceAfterMmk": intent["originalBalanceMmk"] - 1_000,
            "financialStatus": "review_required",
            "postingAuthority": "none",
            "externalPostingPerformed": False,
        }
        reviewed = deepcopy(order)
        reviewed["corrections"] = [correction]
        outcome = project_ecommerce_correction_outcome(intent, reviewed)
        self.assertEqual(outcome["schema"], ECOMMERCE_CORRECTION_OUTCOME_SCHEMA)  # type: ignore[index]
        self.assertEqual(outcome["balanceAfterMmk"], 47_000)  # type: ignore[index]
        for field in (
            "externalPostingPerformed", "automaticPaymentPerformed", "automaticRefundPerformed",
            "customerMessageSent", "providerCalled",
        ):
            self.assertFalse(outcome[field])  # type: ignore[index]

        forged = deepcopy(reviewed)
        forged["corrections"][0]["balanceAfterMmk"] += 1  # type: ignore[index]
        self.assertIsNone(project_ecommerce_correction_outcome(intent, forged))
        duplicate = deepcopy(reviewed)
        duplicate["corrections"].append(deepcopy(duplicate["corrections"][0]))  # type: ignore[union-attr]
        self.assertIsNone(project_ecommerce_correction_outcome(intent, duplicate))
        backdated = deepcopy(reviewed)
        backdated["corrections"][0]["createdAt"] = "2026-07-26T11:00:00+06:30"  # type: ignore[index]
        self.assertIsNone(project_ecommerce_correction_outcome(intent, backdated))

    def test_cancellation_request_is_acknowledgement_bound_duplicate_safe_and_side_effect_free(self) -> None:
        commerce_state = active_commerce_state()
        intent = build_ecommerce_cancellation_intent(
            scope=SCOPE,
            commerce_state=commerce_state,
            order_id="ORD-ECOMMERCE-1001",
            reason_code="order_error",
            reason="The customer noticed the wrong quantity after confirmation.",
            idempotency_key=CANCELLATION_KEY,
            created_at="2026-07-26T10:25:00+06:30",
        )
        self.assertEqual(intent["schema"], ECOMMERCE_CANCELLATION_INTENT_SCHEMA)
        self.assertEqual(intent["state"], "pending_shop_review")
        self.assertEqual(intent["orderStatus"], "confirmed")
        self.assertEqual(intent["paymentStatus"], "pending")
        self.assertRegex(intent["sourceAcknowledgementDigest"], r"^sha256:[a-f0-9]{64}$")
        self.assertFalse(intent["customerMessageSent"])
        self.assertFalse(intent["orderCancelled"])
        self.assertFalse(intent["refundStarted"])

        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        state = record_ecommerce_order_request(
            state,
            request(),
            expected_head_digest=state["headDigest"],
        )
        retained = record_ecommerce_cancellation_intent(
            state,
            intent,
            expected_head_digest=state["headDigest"],
        )
        replay = record_ecommerce_cancellation_intent(
            retained,
            deepcopy(intent),
            expected_head_digest=retained["headDigest"],
        )
        self.assertEqual(replay, retained)
        self.assertEqual(retained["events"][-1]["action"], "cancellation_intent_recorded")

        decision = build_ecommerce_cancellation_decision(
            scope=SCOPE,
            commerce_state=commerce_state,
            intent=intent,
            proof={
                "actionId": "ACT-CANCELLATION-KEEP-1001",
                "capturedAt": "2026-07-26T10:27:00+06:30",
                "actor": "Shop owner",
                "reason": "The confirmed quantity is correct after checking the source request.",
                "evidenceReference": intent["evidenceReference"],
            },
        )
        self.assertEqual(decision["schema"], ECOMMERCE_CANCELLATION_DECISION_SCHEMA)
        self.assertEqual(decision["state"], "kept_by_shop")
        self.assertEqual(decision["intentId"], intent["id"])
        self.assertFalse(decision["orderCancelled"])
        self.assertFalse(decision["refundStarted"])
        self.assertFalse(decision["providerCalled"])
        decided = record_ecommerce_cancellation_decision(
            retained,
            decision,
            expected_head_digest=retained["headDigest"],
        )
        replayed_decision = record_ecommerce_cancellation_decision(
            decided,
            deepcopy(decision),
            expected_head_digest=decided["headDigest"],
        )
        self.assertEqual(replayed_decision, decided)
        self.assertEqual(decided["events"][-1]["action"], "cancellation_decision_recorded")
        forged_decision = deepcopy(decided)
        forged_decision["cancellationDecisions"][0]["totalMmk"] += 1
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "exact recovered request"):
            validate_ecommerce_lifecycle_state(forged_decision)

        duplicate = build_ecommerce_cancellation_intent(
            scope=SCOPE,
            commerce_state=commerce_state,
            order_id="ORD-ECOMMERCE-1001",
            reason_code="changed_mind",
            reason="A second request must not create another review record.",
            idempotency_key="CNI-22345678-1234-4ABC-8ABC-1234567890AE",
            created_at="2026-07-26T10:26:00+06:30",
        )
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "Only one"):
            record_ecommerce_cancellation_intent(
                retained,
                duplicate,
                expected_head_digest=retained["headDigest"],
            )

        for changed in (
            {"status": "completed"},
            {"status": "cancelled", "refundStatus": "none"},
            {"sourceRecordId": "MANUAL-ORDER", "evidenceReference": "MANUAL-EVIDENCE"},
        ):
            invalid_state = deepcopy(commerce_state)
            invalid_state["orders"][0].update(changed)  # type: ignore[index]
            with self.subTest(changed=changed):
                with self.assertRaises((EcommerceLifecycleValidationError, ValueError)):
                    build_ecommerce_cancellation_intent(
                        scope=SCOPE,
                        commerce_state=invalid_state,
                        order_id="ORD-ECOMMERCE-1001",
                        reason_code="other",
                        reason="This invalid order must fail closed.",
                        idempotency_key=CANCELLATION_KEY,
                        created_at="2026-07-26T10:25:00+06:30",
                    )

        legacy = deepcopy(state)
        legacy.pop("correctionIntents")
        legacy.pop("cancellationIntents")
        legacy.pop("cancellationDecisions")
        legacy.pop("amendmentIntents")
        legacy.pop("rescheduleIntents")
        migrated = validate_ecommerce_lifecycle_state(legacy)
        self.assertEqual(migrated["cancellationIntents"], [])

    def test_order_amendment_is_request_bound_atomic_recoverable_and_side_effect_free(self) -> None:
        commerce_state = active_commerce_state()
        source_request = order_source_request()
        replacement = replacement_request()
        intent = build_ecommerce_order_amendment_intent(
            scope=SCOPE,
            commerce_state=commerce_state,
            order_id="ORD-ECOMMERCE-1001",
            replacement_request=replacement,
            reason="Use three shirts instead of two after Shop review.",
            idempotency_key=AMENDMENT_KEY,
            created_at="2026-07-26T10:25:00+06:30",
        )
        self.assertEqual(intent["schema"], ECOMMERCE_ORDER_AMENDMENT_INTENT_SCHEMA)
        self.assertEqual(intent["sourceRequestId"], source_request["id"])
        self.assertEqual(intent["replacementRequestId"], replacement["id"])
        self.assertEqual(intent["lineChanges"], [{
            "sku": "SKU-BLUE-M",
            "name": "Everyday shirt",
            "fromQuantity": 2,
            "toQuantity": 3,
        }])
        for field in (
            "customerMessageSent", "orderChanged", "stockChanged", "paymentChanged",
            "refundStarted", "providerCalled",
        ):
            self.assertFalse(intent[field])

        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        state = record_ecommerce_order_request(
            state,
            source_request,
            expected_head_digest=state["headDigest"],
        )
        amended = record_ecommerce_order_amendment(
            state,
            replacement,
            intent,
            expected_head_digest=state["headDigest"],
        )
        self.assertEqual(amended["revision"], 3)
        self.assertEqual(
            [event["action"] for event in amended["events"][-2:]],
            ["request_recorded", "order_amendment_intent_recorded"],
        )
        replay = record_ecommerce_order_amendment(
            amended,
            deepcopy(replacement),
            deepcopy(intent),
            expected_head_digest=amended["headDigest"],
        )
        self.assertEqual(replay, amended)

        forged = deepcopy(amended)
        forged["amendmentIntents"][0]["replacementRequestDigest"] = "sha256:" + "9" * 64
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "boundary"):
            validate_ecommerce_lifecycle_state(forged)

        mismatched = replacement_request(quantity=4)
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "does not match"):
            record_ecommerce_order_amendment(
                state,
                mismatched,
                intent,
                expected_head_digest=state["headDigest"],
            )
        self.assertEqual(state["revision"], 1)

        for changed in (
            {"status": "preparing"},
            {"status": "ready"},
        ):
            invalid_state = deepcopy(commerce_state)
            invalid_state["orders"][0].update(changed)  # type: ignore[index]
            with self.subTest(changed=changed):
                with self.assertRaises((EcommerceLifecycleValidationError, ValueError)):
                    build_ecommerce_order_amendment_intent(
                        scope=SCOPE,
                        commerce_state=invalid_state,
                        order_id="ORD-ECOMMERCE-1001",
                        replacement_request=replacement,
                        reason="This stale order must fail closed.",
                        idempotency_key=AMENDMENT_KEY,
                        created_at="2026-07-26T10:25:00+06:30",
                    )

    def test_order_reschedule_is_promise_bound_atomic_recoverable_and_side_effect_free(self) -> None:
        commerce_state = active_commerce_state()
        source_request = order_source_request()
        replacement = reschedule_request()
        intent = build_ecommerce_order_reschedule_intent(
            scope=SCOPE,
            commerce_state=commerce_state,
            order_id="ORD-ECOMMERCE-1001",
            replacement_request=replacement,
            requested_promised_at="2026-07-26T17:00:00+06:30",
            reason="Move delivery until after the customer returns home.",
            idempotency_key=RESCHEDULE_KEY,
            created_at="2026-07-26T10:25:00+06:30",
        )
        self.assertEqual(intent["schema"], ECOMMERCE_ORDER_RESCHEDULE_INTENT_SCHEMA)
        self.assertEqual(intent["sourceRequestId"], source_request["id"])
        self.assertEqual(intent["replacementRequestId"], replacement["id"])
        self.assertEqual(intent["originalPromisedAt"], "2026-07-26T14:00:00+06:30")
        self.assertEqual(intent["requestedPromisedAt"], "2026-07-26T17:00:00+06:30")
        self.assertEqual(intent["fulfilment"], "delivery")
        for field in (
            "customerMessageSent", "orderChanged", "stockChanged", "paymentChanged",
            "refundStarted", "riderBooked", "providerCalled",
        ):
            self.assertFalse(intent[field])

        state = create_empty_ecommerce_lifecycle_state(SCOPE)
        state = record_ecommerce_order_request(
            state,
            source_request,
            expected_head_digest=state["headDigest"],
        )
        rescheduled = record_ecommerce_order_reschedule(
            state,
            replacement,
            intent,
            expected_head_digest=state["headDigest"],
        )
        self.assertEqual(rescheduled["revision"], 3)
        self.assertEqual(
            [event["action"] for event in rescheduled["events"][-2:]],
            ["request_recorded", "order_reschedule_intent_recorded"],
        )
        replay = record_ecommerce_order_reschedule(
            rescheduled,
            deepcopy(replacement),
            deepcopy(intent),
            expected_head_digest=rescheduled["headDigest"],
        )
        self.assertEqual(replay, rescheduled)

        forged = deepcopy(rescheduled)
        forged["rescheduleIntents"][0]["requestedPromisedAt"] = "2026-07-26T18:00:00+06:30"
        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "boundary"):
            validate_ecommerce_lifecycle_state(forged)

        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "does not match"):
            record_ecommerce_order_reschedule(
                state,
                replacement_request(),
                intent,
                expected_head_digest=state["headDigest"],
            )
        self.assertEqual(state["revision"], 1)

        with self.assertRaisesRegex(EcommerceLifecycleValidationError, "preserve every SKU"):
            build_ecommerce_order_reschedule_intent(
                scope=SCOPE,
                commerce_state=commerce_state,
                order_id="ORD-ECOMMERCE-1001",
                replacement_request=replacement_request(),
                requested_promised_at="2026-07-26T17:00:00+06:30",
                reason="This quantity change must use the amendment workflow.",
                idempotency_key=RESCHEDULE_KEY,
                created_at="2026-07-26T10:25:00+06:30",
            )

        for changed in ({"status": "preparing"}, {"status": "ready"}):
            invalid_state = deepcopy(commerce_state)
            invalid_state["orders"][0].update(changed)  # type: ignore[index]
            with self.subTest(changed=changed):
                with self.assertRaises((EcommerceLifecycleValidationError, ValueError)):
                    build_ecommerce_order_reschedule_intent(
                        scope=SCOPE,
                        commerce_state=invalid_state,
                        order_id="ORD-ECOMMERCE-1001",
                        replacement_request=replacement,
                        requested_promised_at="2026-07-26T17:00:00+06:30",
                        reason="This stale order must fail closed.",
                        idempotency_key=RESCHEDULE_KEY,
                        created_at="2026-07-26T10:25:00+06:30",
                    )

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
