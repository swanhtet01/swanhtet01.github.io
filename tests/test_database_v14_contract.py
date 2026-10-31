"""Dependency-free source tests for the fail-closed v14 catalog contract."""

from copy import deepcopy
import unittest
from unittest.mock import patch

from tools import private_trial_v14_contract as current


class V14SourceContractTests(unittest.TestCase):
    def test_profile_metadata_and_exact_migration_pin(self) -> None:
        facts = current.source_contract()
        self.assertEqual(facts["profile"], "v14-shop-correction")
        self.assertEqual(facts["schema_version"], 14)
        self.assertEqual(
            facts["contract"],
            "supermega_private_trial_database_v14_shop_correction_v1",
        )
        self.assertEqual(
            facts["migration_sha256"],
            "a9c290ff1209467fc3d5b4d91a102394a55080c9f40930195b8cb36174c10db6",
        )

    def test_contract_names_exact_private_tables_functions_policies_and_triggers(self) -> None:
        facts = current.source_contract()
        self.assertEqual(
            facts["tables"],
            {"shop_correction_lineages", "shop_correction_consumptions"},
        )
        self.assertEqual(set(facts["functions"]), {
            "guard_shop_correction_lineage",
            "guard_shop_correction_consumption",
        })
        self.assertEqual(set(facts["policies"]), {
            "shop_correction_lineages_owner_read",
            "shop_correction_lineages_owner_insert",
            "shop_correction_lineages_owner_update",
            "shop_correction_consumptions_owner_read",
            "shop_correction_consumptions_owner_insert",
        })
        self.assertEqual(set(facts["triggers"]), {
            "shop_correction_lineage_guard",
            "shop_correction_consumption_guard",
        })

    def test_source_contract_covers_unique_active_lineage_and_consumption_keys(self) -> None:
        indexes = current.source_contract()["indexes"]
        self.assertIn("shop_correction_one_active_lineage_idx", indexes)
        self.assertEqual(
            indexes["shop_correction_one_active_lineage_idx"]["predicate_expression"],
            "(superseded_at IS NULL)",
        )
        for name in (
            "shop_correction_consumption_request_key",
            "shop_correction_consumption_receipt_key",
            "shop_correction_consumption_command_key",
            "shop_correction_consumption_ordinal_key",
            "shop_correction_consumption_history_key",
        ):
            self.assertIn(name, indexes)
        for name in (
            "shop_correction_lineage_identity_epoch_key",
            "shop_correction_lineage_epoch_key",
            "shop_correction_lineage_activation_key",
        ):
            self.assertIn(name, indexes)
        self.assertEqual(
            set(current.source_contract()["foreign_keys"]),
            {
                "shop_correction_lineage_previous_fkey",
                "shop_correction_consumption_lineage_fkey",
                "shop_correction_consumption_lineage_epoch_fkey",
            },
        )

    def test_observed_digests_filter_v14_rows_from_inherited_catalog(self) -> None:
        snapshot = {
            "extension_columns": [
                {"table_name": "shop_correction_lineages", "column_name": "lineage_id"},
                {"table_name": "billing_invoices", "column_name": "invoice_id"},
            ],
            "extension_constraints": [
                {
                    "table_name": "shop_correction_consumptions",
                    "constraint_name": "shop_correction_consumption_request_key",
                },
                {"table_name": "billing_events", "constraint_name": "billing_events_pkey"},
            ],
            "functions": [
                {"function_name": "guard_shop_correction_lineage"},
                {"function_name": "guard_billing_invoice"},
            ],
            "policies": [
                {"policy_name": "shop_correction_lineages_owner_read"},
                {"policy_name": "billing_entitlements_self_read"},
            ],
        }
        observed = current.observed_extension_digests(snapshot)
        self.assertEqual(
            observed["extension_columns_exact"],
            current.v13.rows_digest(snapshot["extension_columns"][:1]),
        )
        self.assertEqual(
            observed["extension_constraints_exact"],
            current.v13.rows_digest(snapshot["extension_constraints"][:1]),
        )

    def test_extension_checks_keep_v13_catalog_rows_separate(self) -> None:
        snapshot = {
            "extension_columns": [
                {"table_name": "billing_invoices"},
                {"table_name": "shop_correction_lineages"},
            ],
            "extension_constraints": [
                {"table_name": "billing_events"},
                {"table_name": "shop_correction_consumptions"},
            ],
            "functions": [],
            "policies": [],
        }
        with patch.object(
            current.v13,
            "extension_checks",
            return_value={"v13_retained": True},
        ) as inherited:
            self.assertEqual(
                current.extension_checks(snapshot),
                {"v13_retained": True},
            )
        inherited_snapshot = inherited.call_args.args[0]
        self.assertEqual(
            inherited_snapshot["extension_columns"],
            [{"table_name": "billing_invoices"}],
        )
        self.assertEqual(
            inherited_snapshot["extension_constraints"],
            [{"table_name": "billing_events"}],
        )

    def test_migration_tampering_is_rejected_before_catalog_use(self) -> None:
        with patch.object(current.Path, "read_text", return_value="unreviewed"):
            with self.assertRaisesRegex(
                ValueError, "v14_contract_migration_source_mismatch"
            ):
                current.source_contract()

    def test_missing_postgres_catalog_pins_fail_closed_without_mutating_base(self) -> None:
        base = {"sentinel": deepcopy({"unchanged": True})}
        original = deepcopy(base)
        with self.assertRaisesRegex(
            ValueError, "v14_contract_catalog_pins_not_recorded"
        ):
            current.extend_contract(base)
        self.assertEqual(base, original)

    def test_source_acl_never_grants_delete_or_consumption_update(self) -> None:
        acl = current.source_contract()["non_owner_acl"]
        self.assertNotIn(
            ("table", "shop_correction_lineages", current.ROLE, "DELETE", False),
            acl,
        )
        self.assertNotIn(
            ("table", "shop_correction_consumptions", current.ROLE, "UPDATE", False),
            acl,
        )
        self.assertNotIn(
            ("table", "shop_correction_consumptions", current.ROLE, "DELETE", False),
            acl,
        )


if __name__ == "__main__":
    unittest.main()
