"""Dependency-free routing tests for exact database schema profiles."""

from contextlib import redirect_stdout
from io import StringIO
import json
import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from tools import private_trial_v13_contract as v13
from tools import private_trial_v14_contract as v14
from tools import validate_supermega_database_url as audit


class DatabaseProfileRoutingTests(unittest.TestCase):
    def test_legacy_and_v13_contracts_remain_available(self) -> None:
        legacy = audit.schema_contract("legacy-v11")
        current = audit.schema_contract(v13.PROFILE)

        self.assertEqual(legacy["CONTRACT"], audit.CONTRACT)
        self.assertEqual(legacy["SCHEMA_VERSION"], 11)
        self.assertEqual(current["CONTRACT"], v13.CONTRACT)
        self.assertEqual(current["SCHEMA_VERSION"], 13)
        self.assertNotIn("shop_correction_lineages", current["EXPECTED_TABLES"])
        self.assertEqual(audit.SCHEMA_VERSION, 11)

    def test_v14_profile_routes_to_its_extension_without_mutating_legacy(self) -> None:
        calls: list[dict[str, object]] = []

        def extend(base: dict[str, object]) -> dict[str, object]:
            calls.append(base)
            base.update(CONTRACT=v14.CONTRACT, SCHEMA_VERSION=v14.SCHEMA_VERSION)
            return base

        extension = SimpleNamespace(CONTRACT=v14.CONTRACT, extend_contract=extend)
        with patch.object(audit, "_schema_extension_module", return_value=extension):
            selected = audit.schema_contract(v14.PROFILE)

        self.assertEqual(len(calls), 1)
        self.assertEqual(selected["CONTRACT"], v14.CONTRACT)
        self.assertEqual(selected["SCHEMA_VERSION"], 14)
        self.assertEqual(audit.SCHEMA_VERSION, 11)

    def test_v14_unreviewed_catalog_pins_fail_before_connection(self) -> None:
        def forbidden(*_args: object, **_kwargs: object) -> object:
            self.fail("database connection must not be attempted")

        with self.assertRaisesRegex(
            ValueError, "v14_contract_catalog_pins_not_recorded"
        ):
            audit.audit_database(
                "unused",
                storage_audit_database_url="unused",
                schema_profile=v14.PROFILE,
                connect_factory=forbidden,
                storage_connect_factory=forbidden,
            )

    def test_v14_profile_builds_only_with_complete_pin_shapes(self) -> None:
        catalog_pins = {
            name: "a" * 64
            for name in (
                "extension_columns_exact",
                "extension_constraints_exact",
                "extension_functions_exact",
                "extension_policies_exact",
            )
        }
        policy_pins = {}
        for index, (name, (_table, command)) in enumerate(v14.POLICIES.items()):
            digest = f"{index + 1:064x}"
            policy_pins[name] = {
                "qual": None if command == "INSERT" else digest,
                "check": None if command == "SELECT" else digest,
            }

        with (
            patch.object(v14, "CATALOG_PINS", catalog_pins),
            patch.object(v14, "POLICY_FINGERPRINTS", policy_pins),
        ):
            selected = audit.schema_contract(v14.PROFILE)

        self.assertEqual(selected["CONTRACT"], v14.CONTRACT)
        self.assertEqual(selected["SCHEMA_VERSION"], 14)
        self.assertTrue(v14.TABLES.issubset(selected["EXPECTED_TABLES"]))
        self.assertIs(selected["collect_extensions"], v14.collect_extensions)
        self.assertIs(selected["extension_checks"], v14.extension_checks)

    def test_cli_binds_v14_profile_and_contract_to_read_only_audit(self) -> None:
        output = StringIO()
        report = {"ok": True, "ready": True, "contract": v14.CONTRACT}
        with (
            patch.dict(
                os.environ,
                {"TEST_DB_URL": "fixture", "TEST_STORAGE_URL": "fixture"},
                clear=True,
            ),
            patch.object(audit, "audit_database", return_value=report) as called,
            redirect_stdout(output),
        ):
            result = audit.main(
                [
                    "--env-key",
                    "TEST_DB_URL",
                    "--storage-audit-env-key",
                    "TEST_STORAGE_URL",
                    "--schema-profile",
                    v14.PROFILE,
                    "--require-ready",
                ]
            )

        self.assertEqual(result, 0)
        self.assertEqual(called.call_args.kwargs["schema_profile"], v14.PROFILE)
        self.assertEqual(json.loads(output.getvalue())["contract"], v14.CONTRACT)

    def test_v14_contract_labels_failures_without_claiming_catalog_readiness(self) -> None:
        output = StringIO()
        with redirect_stdout(output):
            result = audit.main(["--schema-profile", v14.PROFILE])

        report = json.loads(output.getvalue())
        self.assertEqual(result, 2)
        self.assertEqual(report["error"], "database_url_missing")
        self.assertEqual(report["contract"], v14.CONTRACT)
        self.assertFalse(report["ready"])

    def test_v14_cannot_label_legacy_self_test_or_rehearsal(self) -> None:
        for mode in ("--self-test", "--rehearsal-preflight"):
            with self.subTest(mode=mode), redirect_stdout(StringIO()):
                self.assertEqual(
                    audit.main(["--schema-profile", v14.PROFILE, mode]),
                    2,
                )

    def test_unknown_profile_is_rejected_before_connection(self) -> None:
        with self.assertRaisesRegex(
            audit.AuditConfigurationError, "schema_profile_invalid"
        ):
            audit.schema_contract("latest")


if __name__ == "__main__":
    unittest.main()
