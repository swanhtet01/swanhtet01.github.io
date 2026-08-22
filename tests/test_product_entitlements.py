from __future__ import annotations

import unittest

from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    PostgresTrialStore,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialReadiness,
    activation_product_entitlements,
    capabilities_for_product_entitlements,
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

    def test_product_capabilities_are_intersected_with_activation_proof(self) -> None:
        capabilities = {
            "approvals.decide",
            "company.write",
            "setup.write",
            "commerce.write",
            "production.write",
            "website.read",
        }
        self.assertEqual(
            capabilities_for_product_entitlements(capabilities, ("commerce", "website")),
            frozenset(
                {
                    "approvals.decide",
                    "company.write",
                    "setup.write",
                    "commerce.write",
                    "website.read",
                }
            ),
        )
        self.assertEqual(
            capabilities_for_product_entitlements(capabilities, ("ecommerce",)),
            frozenset(
                {
                    "approvals.decide",
                    "company.write",
                    "setup.write",
                    "commerce.write",
                }
            ),
        )

    def test_empty_or_malformed_activation_proof_denies_every_product_surface(self) -> None:
        capabilities = {
            "company.read",
            "commerce.write",
            "production.read",
            "website.write",
        }
        expected = frozenset({"company.read"})
        self.assertEqual(capabilities_for_product_entitlements(capabilities, ()), expected)
        self.assertEqual(
            capabilities_for_product_entitlements(capabilities, ("website", "commerce")),
            expected,
        )

    def test_legacy_store_without_authoritative_entitlements_preserves_capabilities(self) -> None:
        capabilities = {"commerce.write", "production.read"}
        self.assertEqual(
            capabilities_for_product_entitlements(capabilities, None),
            frozenset(capabilities),
        )

    def test_store_data_access_cannot_bypass_activation_entitlements(self) -> None:
        store = InMemoryTrialStore(
            reducer=lambda _surface, _event, current, _payload: current,
        )
        principal = TrialPrincipal("workspace-a", "owner-a", "human")
        store.provision_membership(
            workspace_id=principal.workspace_id,
            actor_id=principal.actor_id,
            actor_kind=principal.actor_kind,
            capabilities=("commerce.write", "production.write", "website.read"),
        )
        store.provision_product_entitlements(
            workspace_id=principal.workspace_id,
            products=("commerce",),
        )
        self.assertEqual(store.get_state(principal, "commerce").surface, "commerce")
        with self.assertRaises(TrialPermissionDenied):
            store.get_state(principal, "production")
        with self.assertRaises(TrialPermissionDenied):
            store.get_state(principal, "website")

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
