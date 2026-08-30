from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from tools.assess_client_activation_readiness import (
    CONTRACT,
    ClientActivationReadinessError,
    build_client_activation_readiness,
    verify_client_activation_readiness,
)
from tools.prepare_client_portal_provisioning import (
    build_client_portal_provisioning_bundle,
)


ROOT = Path(__file__).resolve().parents[1]
PREPARE_TOOL = ROOT / "tools" / "prepare_client_demo.mjs"
READINESS_TOOL = ROOT / "tools" / "assess_client_activation_readiness.py"


def _run(*arguments: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(argument) for argument in arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=90,
        check=False,
    )


class ClientActivationReadinessTests(unittest.TestCase):
    def _preparation(
        self,
        directory: Path,
        *,
        real_client_data: bool,
        workspace: str | None = None,
        owner: str | None = None,
    ) -> Path:
        intake = directory / "intake"
        initialized = _run(
            "node", PREPARE_TOOL, "--init", intake,
            "--preset", "service-business",
            "--products", "shop,website,ecommerce",
        )
        self.assertEqual(initialized.returncode, 0, initialized.stderr)
        profile_path = intake / "client.json"
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        profile["workspace"] = workspace or ("Lotus Wellness Spa" if real_client_data else "Beauty Spa Client Pilot")
        profile["owner"] = owner or ("Mya Mya Win" if real_client_data else "Swan Htet - implementation owner")
        profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if real_client_data:
            for product in ("commerce", "website", "ecommerce"):
                shutil.copyfile(intake / "_templates" / f"{product}.csv", intake / f"{product}.csv")
        preparation_path = directory / "private-review.json"
        prepared = _run("node", PREPARE_TOOL, "--data-dir", intake, "--out", preparation_path)
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        return preparation_path

    def _portal(self, preparation_path: Path, directory: Path) -> Path:
        preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
        portal_path = directory / "portal.json"
        portal_path.write_text(
            json.dumps(build_client_portal_provisioning_bundle(preparation), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return portal_path

    def test_synthetic_spa_packet_fails_closed_with_per_product_actions(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-activation-readiness-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, real_client_data=False)
            portal_path = self._portal(preparation_path, directory)
            report_path = directory / "readiness.json"
            assessed = _run(
                sys.executable, "-s", READINESS_TOOL, "assess",
                "--preparation", preparation_path,
                "--portal-bundle", portal_path,
                "--output", report_path,
            )
            self.assertEqual(assessed.returncode, 0, assessed.stderr)
            summary = json.loads(assessed.stdout)
            self.assertEqual(summary["contract"], CONTRACT)
            self.assertEqual(summary["status"], "blocked_for_real_client_evidence")
            self.assertEqual(summary["productCount"], 3)
            self.assertFalse(summary["tenantWritesPerformed"])

            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertFalse(report["client"]["workspaceIdentityReady"])
            self.assertFalse(report["client"]["namedClientOwnerReady"])
            self.assertTrue(all(row["dataStatus"] == "sample_fixture_only" for row in report["products"]))
            self.assertIn("reviewed_client_data_required:shop", report["blockingGates"])
            self.assertIn("managed_trial_request_required:ecommerce", report["blockingGates"])
            self.assertTrue(report["controls"]["syntheticEvidenceCannotAuthorizeProduction"])
            self.assertFalse(report["controls"]["containsRawClientRows"])

            verified = _run(
                sys.executable, "-s", READINESS_TOOL, "verify",
                "--preparation", preparation_path,
                "--portal-bundle", portal_path,
                "--report", report_path,
            )
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertEqual(json.loads(verified.stdout)["reportDigest"], report["reportDigest"])

    def test_real_identity_and_csv_data_clear_only_the_gates_they_prove(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-real-data-readiness-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, real_client_data=True)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            portal = build_client_portal_provisioning_bundle(preparation)
            report = build_client_activation_readiness(preparation, portal)
            self.assertTrue(report["client"]["workspaceIdentityReady"])
            self.assertTrue(report["client"]["namedClientOwnerReady"])
            self.assertTrue(report["gates"]["allReviewedClientDataReady"])
            self.assertTrue(all(row["dataStatus"] == "reviewed_client_data" for row in report["products"]))
            self.assertFalse(report["gates"]["allAcceptedProductOutcomesReady"])
            self.assertIn("accepted_product_outcome_required:shop", report["blockingGates"])
            self.assertNotIn("reviewed_client_data_required:shop", report["blockingGates"])

    def test_sample_labels_cannot_turn_present_csv_files_into_real_client_evidence(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-sample-label-readiness-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(
                directory,
                real_client_data=True,
                workspace="Golden Lotus Spa - SAMPLE",
                owner="SuperMega Implementation - SAMPLE",
            )
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            portal = build_client_portal_provisioning_bundle(preparation)
            report = build_client_activation_readiness(preparation, portal)

            self.assertFalse(report["client"]["workspaceIdentityReady"])
            self.assertFalse(report["client"]["namedClientOwnerReady"])
            self.assertFalse(report["gates"]["allReviewedClientDataReady"])
            self.assertTrue(all(row["dataStatus"] == "sample_fixture_only" for row in report["products"]))
            self.assertIn("real_workspace_identity_required", report["blockingGates"])
            self.assertIn("named_client_owner_required", report["blockingGates"])
            self.assertIn("reviewed_client_data_required:shop", report["blockingGates"])

    def test_report_verification_rejects_tampering(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-readiness-tamper-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, real_client_data=False)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            portal = build_client_portal_provisioning_bundle(preparation)
            report = build_client_activation_readiness(preparation, portal)
            report["gates"]["hostedPostgres17ProofReady"] = True
            with self.assertRaises(ClientActivationReadinessError):
                verify_client_activation_readiness(report, preparation, portal)

    def test_complete_reviewed_requests_advance_to_target_binding_only(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-readiness-complete-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, real_client_data=True)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            portal = build_client_portal_provisioning_bundle(preparation)
            requests = [
                {"product": "shop", "templateId": "social-commerce"},
                {"product": "website", "templateId": "lead-generation"},
                {"product": "ecommerce", "templateId": "social-storefront"},
            ]

            def validate(request: dict[str, str]) -> dict[str, object]:
                return {
                    "contract": "supermega.managed_trial_request.v1",
                    "product": request["product"],
                    "workspaceLabel": "Lotus Wellness Spa",
                    "ownerLabel": "Mya Mya Win",
                    "templateId": request["templateId"],
                    "requestDigest": "sha256:" + {
                        "shop": "1", "website": "2", "ecommerce": "3",
                    }[request["product"]] * 64,
                    "evidence": {},
                    "rawRecordsIncluded": False,
                    "secretValuesExposed": False,
                }

            with mock.patch(
                "tools.assess_client_activation_readiness.validate_managed_trial_request",
                side_effect=validate,
            ):
                partial = build_client_activation_readiness(preparation, portal, requests[:1])
                self.assertEqual(partial["status"], "blocked_for_real_client_evidence")
                self.assertEqual(partial["products"][0]["managedTrialRequestStatus"], "verified")
                self.assertEqual(partial["products"][1]["managedTrialRequestStatus"], "not_supplied")
                self.assertFalse(partial["gates"]["allManagedTrialRequestsReady"])
                self.assertNotIn("managed_trial_request_required:shop", partial["blockingGates"])
                self.assertIn("managed_trial_request_required:website", partial["blockingGates"])

                report = build_client_activation_readiness(preparation, portal, requests)
                self.assertEqual(report["status"], "ready_for_target_binding")
                self.assertTrue(report["gates"]["allManagedTrialRequestsReady"])
                self.assertTrue(report["gates"]["allAcceptedProductOutcomesReady"])
                self.assertTrue(report["gates"]["allApprovedAiContextsReady"])
                self.assertTrue(all(row["managedTrialRequestStatus"] == "verified" for row in report["products"]))
                self.assertNotIn("managed_trial_request_required:shop", report["blockingGates"])
                self.assertIn("hosted_postgres17_proof_required", report["blockingGates"])
                self.assertFalse(report["gates"]["hostedPostgres17ProofReady"])

    def test_request_identity_mismatch_and_noncanonical_order_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-readiness-request-reject-") as temporary:
            directory = Path(temporary)
            preparation_path = self._preparation(directory, real_client_data=True)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            portal = build_client_portal_provisioning_bundle(preparation)

            def validate(request: dict[str, str]) -> dict[str, object]:
                return {
                    "product": request["product"],
                    "workspaceLabel": request.get("workspace", "Lotus Wellness Spa"),
                    "ownerLabel": "Mya Mya Win",
                    "templateId": request["templateId"],
                    "requestDigest": "sha256:" + "4" * 64,
                }

            with mock.patch(
                "tools.assess_client_activation_readiness.validate_managed_trial_request",
                side_effect=validate,
            ):
                with self.assertRaisesRegex(ClientActivationReadinessError, "order"):
                    build_client_activation_readiness(
                        preparation,
                        portal,
                        [
                            {"product": "website", "templateId": "lead-generation"},
                            {"product": "shop", "templateId": "social-commerce"},
                        ],
                    )
                with self.assertRaisesRegex(ClientActivationReadinessError, "does not match"):
                    build_client_activation_readiness(
                        preparation,
                        portal,
                        [{"product": "shop", "templateId": "social-commerce", "workspace": "Other Tenant"}],
                    )


if __name__ == "__main__":
    unittest.main()
