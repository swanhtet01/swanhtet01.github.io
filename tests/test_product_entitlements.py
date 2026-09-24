from __future__ import annotations

import unittest
from pathlib import Path

from supermega_runtime.trial_store import (
    InMemoryTrialStore,
    PostgresTrialStore,
    TrialPermissionDenied,
    TrialPrincipal,
    TrialReadiness,
    TrialNotReadyError,
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

    def test_website_review_requires_website_entitlement_without_granting_editor(self) -> None:
        for products in ((), ("commerce",), ("ecommerce",), ("website", "commerce")):
            with self.subTest(products=products):
                self.assertEqual(capabilities_for_product_entitlements({"website.review"}, products), frozenset())
        self.assertEqual(capabilities_for_product_entitlements({"website.review"}, ("website",)), frozenset({"website.review"}))

    def test_catalog_review_requires_ecommerce_without_granting_data_access(self) -> None:
        granted = {"company.read", "ecommerce.review"}
        for products in ((), ("commerce",), ("website",), ("production",),
                         ("ecommerce", "commerce"), ("ecommerce", "ecommerce"), (42,)):
            with self.subTest(products=products):
                self.assertEqual(capabilities_for_product_entitlements(granted, products), frozenset({"company.read"}))
        for products in (("ecommerce",), ("commerce", "ecommerce")):
            with self.subTest(products=products):
                self.assertEqual(capabilities_for_product_entitlements(granted, products), frozenset(granted))
        self.assertEqual(capabilities_for_product_entitlements({"company.read"}, ("ecommerce",)), frozenset({"company.read"}))

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

            def execute(self, statement: object, params: tuple[object, ...] = ()) -> None:
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

    def test_review_boolean_requires_exact_privileged_function_contract(self) -> None:
        source = (Path(__file__).resolve().parents[1] / "supabase/migrations/20260915191528_website_review_entitlement_proof.sql").read_text(encoding="utf-8").split("$$")[1]
        valid = dict(source=source, definer=True, volatility="s", language="sql", boolean_result=True,
                     trusted_owner=True, private_execute=True, config=["search_path=pg_catalog, app_private"])

        class Cursor:
            def __init__(self, proof, entitled=True):
                self.rows = iter((None, proof, {"entitled": entitled}))
            def execute(self, *_args):
                pass
            def fetchone(self):
                return next(self.rows, None)

        self.assertEqual(PostgresTrialStore._product_entitlements(Cursor(valid), "workspace-a"), ("website",))
        self.assertEqual(PostgresTrialStore._product_entitlements(Cursor(valid, False), "workspace-a"), ())
        changes = ({"source": "select true"}, {"trusted_owner": False}, {"private_execute": False},
                   {"config": ["search_path=public"]}, {"definer": False}, {"boolean_result": False},
                   {"language": "plpgsql"}, {"volatility": "v"})
        for change in changes:
            with self.subTest(change=change), self.assertRaises(TrialNotReadyError):
                PostgresTrialStore._product_entitlements(Cursor(valid | change), "workspace-a")


    def test_catalog_proof_is_optional_exact_and_combines_in_product_order(self):
        root = Path(__file__).resolve().parents[1]
        def proof(path):
            return dict(source=(root / path).read_text(encoding='utf-8').split('$$')[1],
                        definer=True, volatility='s', language='sql', boolean_result=True,
                        trusted_owner=True, private_execute=True, config=['search_path=pg_catalog, app_private'])
        website = proof('supabase/migrations/20260915191528_website_review_entitlement_proof.sql')
        ecommerce = proof('tools/ecommerce_review_entitlement_candidate.sql')
        class Cursor:
            def __init__(self, rows):
                self.rows = iter(rows)
                self.calls = []
            def execute(self, sql, params=()):
                self.calls.append((sql, params))
            def fetchone(self):
                return next(self.rows, None)
        for rows, expected in (([None,None,None], ()),
                               ([None,None,ecommerce,{'entitled':True}], ('ecommerce',)),
                               ([None,None,ecommerce,{'entitled':False}], ()),
                               ([None,website,{'entitled':True},ecommerce,{'entitled':True}], ('website','ecommerce'))):
            self.assertEqual(PostgresTrialStore._product_entitlements(Cursor(rows), 'company'), expected)
        for change in ({'source':'select true'}, {'trusted_owner':False}, {'private_execute':False},
                       {'config':['search_path=public']}, {'definer':False}, {'boolean_result':False},
                       {'language':'plpgsql'}, {'volatility':'v'}):
            cursor = Cursor([None,None,ecommerce|change])
            with self.subTest(change=change), self.assertRaises(TrialNotReadyError):
                PostgresTrialStore._product_entitlements(cursor, 'company')
            self.assertFalse(any('select app_private.ecommerce_review_entitled()' in sql for sql,_ in cursor.calls))


if __name__ == "__main__":
    unittest.main()
