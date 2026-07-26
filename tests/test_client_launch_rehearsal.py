from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import unittest

from tools.validate_client_launch_packages import EXPECTED_PROFILES, validate_batch_context


ROOT = Path(__file__).resolve().parents[1]
REHEARSAL = ROOT / "tools" / "rehearse_client_launch.mjs"
VALIDATOR = ROOT / "tools" / "validate_client_launch_packages.py"


class ClientLaunchRehearsalTests(unittest.TestCase):
    def test_all_twelve_profiles_recover_validate_and_remain_not_applied(self) -> None:
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node.js is required for the client launch rehearsal.")
        environment = {**os.environ, "SUPERMEGA_PYTHON": sys.executable}
        completed = subprocess.run(
            [str(node), str(REHEARSAL)],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            check=False,
            text=True,
            timeout=60,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr or completed.stdout)
        report = json.loads(completed.stdout)

        self.assertTrue(report["ok"])
        self.assertEqual(report["contract"], "supermega.client_launch_rehearsal.v1")
        self.assertEqual(report["company"]["evidenceKind"], "synthetic_fixture")
        self.assertEqual(
            report["selectedLaunchProfiles"],
            {
                "commerce": "social-commerce",
                "production": "production-control",
                "website": "business-presence",
                "ecommerce": "social-storefront",
            },
        )
        self.assertTrue(all(report["crossProductChecks"].values()))
        self.assertEqual(
            report["serverValidation"],
            {
                "profileCoverageComplete": True,
                "singleWorkspaceContext": True,
            },
        )

        metrics = report["metrics"]
        self.assertEqual(metrics["productCount"], 4)
        self.assertEqual(metrics["workflowProfileCount"], 12)
        self.assertEqual(metrics["stagedRows"], 24)
        self.assertEqual(metrics["exactFirstPassProfiles"], 8)
        self.assertEqual(metrics["recoveredProfiles"], 4)
        self.assertGreaterEqual(metrics["detectedIssues"], 20)
        self.assertEqual(metrics["manualMappingDecisions"], 20)
        self.assertEqual(metrics["sourceValueCorrections"], 4)
        self.assertEqual(metrics["deniedStagingAttempts"], 12)
        self.assertEqual(metrics["humanReviewsRequired"], 12)
        self.assertEqual(metrics["serverValidatedPackages"], 12)
        self.assertEqual(metrics["uniquePreviewDigests"], 12)
        self.assertEqual(metrics["uniquePackageDigests"], 12)

        self.assertEqual(
            report["authority"],
            {
                "activationStatus": "not_applied",
                "productWritesPerformed": False,
                "hostedWritesPerformed": False,
                "connectorCallsPerformed": False,
                "modelCallsPerformed": False,
            },
        )
        self.assertEqual(len(report["profiles"]), 12)
        self.assertTrue(all(profile["serverStatus"] == "valid" for profile in report["profiles"]))

    def test_batch_validator_rejects_incomplete_rehearsal_without_writes(self) -> None:
        completed = subprocess.run(
            [sys.executable, str(VALIDATOR)],
            cwd=ROOT,
            input=json.dumps(
                {
                    "contract": "supermega.client_launch_validation_batch.v1",
                    "packages": [],
                }
            ),
            capture_output=True,
            check=False,
            text=True,
            timeout=30,
        )
        self.assertEqual(completed.returncode, 1)
        response = json.loads(completed.stdout)
        self.assertFalse(response["ok"])
        self.assertFalse(response["external_writes_performed"])
        self.assertIn("exactly 12 packages", response["error"])

    def test_batch_context_rejects_duplicate_profiles_and_mixed_clients(self) -> None:
        one_client = [
            {"workspace": "Shwe Pyi Foods", "owner": "Operations owner"}
            for _ in EXPECTED_PROFILES
        ]
        exact_results = [
            {"product": product, "workflow_template_id": profile_id}
            for product, profile_id in EXPECTED_PROFILES
        ]
        duplicate_results = [exact_results[0].copy() for _ in EXPECTED_PROFILES]

        with self.assertRaisesRegex(ValueError, "every workflow profile exactly once"):
            validate_batch_context(one_client, duplicate_results)

        mixed_clients = [package.copy() for package in one_client]
        mixed_clients[-1]["workspace"] = "Different client"
        with self.assertRaisesRegex(ValueError, "one workspace and responsible owner"):
            validate_batch_context(mixed_clients, exact_results)


if __name__ == "__main__":
    unittest.main()
