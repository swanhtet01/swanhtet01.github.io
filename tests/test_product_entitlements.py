from __future__ import annotations

import unittest

from supermega_runtime.trial_store import (
    PostgresTrialStore,
    TrialReadiness,
    activation_product_entitlements,
)


class ActivationProductEntitlementTests(unittest.TestCase):
    def test_multi_product_activation_preserves_distinct_portal_products(self) -> None:
        self.assertEqual(
            activation_product_entitlements(
                {"products": ["shop", "website", "ecommerce"]}
            ),
            ("commerce", "website", "ecommerce"),
        )

    def test_legacy_single_product_activation_remains_supported(self) -> None:
        self.assertEqual(
            activation_product_entitlements({"product": "plant"}),
            ("production",),
        )

    def test_invalid_or_noncanonical_activation_fails_closed(self) -> None:
        invalid_values = (
            None,
            {},
            {"products": []},
            {"products": ["ecommerce", "shop"]},
            {"products": ["shop", "shop"]},
            {"products": ["unknown"]},
            '{"products":["shop",',
        )
        for value in invalid_values:
            with self.subTest(value=value):
                self.assertEqual(activation_product_entitlements(value), ())

    def test_readiness_serializes_explicit_entitlements_only_when_authoritative(self) -> None:
        base = dict(
            backend="postgres",
            database_ready=True,
            role_ready=True,
            schema_ready=True,
            auth_ready=True,
            membership_ready=True,
            audit_ready=True,
            write_enabled=True,
        )
        authoritative = TrialReadiness(
            **base,
            product_entitlements=("commerce", "ecommerce"),
        ).to_dict()
        self.assertEqual(authoritative["productEntitlements"], ["commerce", "ecommerce"])

        legacy = TrialReadiness(**base).to_dict()
        self.assertNotIn("productEntitlements", legacy)

    def test_postgres_read_path_uses_the_workspace_activation_event(self) -> None:
        class Cursor:
            def __init__(self, row: object) -> None:
                self.row = row
                self.statement = ""
                self.params: tuple[object, ...] = ()

            def execute(self, statement: object, params: tuple[object, ...]) -> None:
                self.statement = " ".join(str(statement).split()).lower()
                self.params = params

            def fetchone(self) -> object:
                return self.row

        cursor = Cursor({"payload_json": {"products": ["shop", "ecommerce"]}})
        self.assertEqual(
            PostgresTrialStore._product_entitlements(cursor, "spa-tenant"),
            ("commerce", "ecommerce"),
        )
        self.assertIn("company.workspace.activated", cursor.statement)
        self.assertIn("company.workspace.created", cursor.statement)
        self.assertEqual(cursor.params, ("spa-tenant",))

        self.assertEqual(
            PostgresTrialStore._product_entitlements(Cursor(None), "spa-tenant"),
            (),
        )


if __name__ == "__main__":
    unittest.main()
