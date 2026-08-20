from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from tools.prepare_client_portal_provisioning import (
    CONTRACT,
    ClientPortalProvisioningError,
    build_client_portal_provisioning_bundle,
    verify_client_portal_provisioning_bundle,
)


ROOT = Path(__file__).resolve().parents[1]
PREPARE_TOOL = ROOT / "tools" / "prepare_client_demo.mjs"
PORTAL_TOOL = ROOT / "tools" / "prepare_client_portal_provisioning.py"


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


class ClientPortalProvisioningTests(unittest.TestCase):
    def _spa_preparation(self, directory: Path, products: str = "shop,website,ecommerce") -> Path:
        workspace = directory / "intake"
        initialized = _run(
            "node",
            PREPARE_TOOL,
            "--init",
            workspace,
            "--preset",
            "service-business",
            "--products",
            products,
        )
        self.assertEqual(initialized.returncode, 0, initialized.stderr)

        profile_path = workspace / "client.json"
        profile = json.loads(profile_path.read_text(encoding="utf-8"))
        profile["workspace"] = "Beauty Spa Client Portal"
        profile["owner"] = "Named Spa Owner"
        profile_path.write_text(
            json.dumps(profile, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        preparation_path = directory / "private-review.json"
        prepared = _run(
            "node",
            PREPARE_TOOL,
            "--data-dir",
            workspace,
            "--out",
            preparation_path,
        )
        self.assertEqual(prepared.returncode, 0, prepared.stderr)
        return preparation_path

    def test_spa_portal_cli_builds_and_verifies_three_isolated_no_write_plans(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-portal-") as temporary:
            directory = Path(temporary)
            preparation_path = self._spa_preparation(directory)
            bundle_path = directory / "portal-provisioning.json"

            prepared = _run(
                sys.executable,
                "-s",
                PORTAL_TOOL,
                "prepare",
                "--preparation",
                preparation_path,
                "--output",
                bundle_path,
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            summary = json.loads(prepared.stdout)
            self.assertEqual(summary["contract"], CONTRACT)
            self.assertEqual(summary["productCount"], 3)
            self.assertEqual(summary["status"], "planned_not_applied")
            self.assertFalse(summary["tenantWritesPerformed"])
            self.assertFalse(summary["productionActivationPerformed"])

            bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
            self.assertEqual(
                [product["product"] for product in bundle["products"]],
                ["commerce", "website", "ecommerce"],
            )
            setup_paths = {product["product"]: product["setupPath"] for product in bundle["products"]}
            self.assertEqual(setup_paths["commerce"], "/settings/?product=shop&pack=spa")
            self.assertEqual(setup_paths["website"], "/settings/?product=website&template=lead-generation")
            self.assertEqual(setup_paths["ecommerce"], "/settings/?product=ecommerce&template=social-storefront")
            self.assertEqual(
                len({product["provisioningPlan"]["planDigest"] for product in bundle["products"]}),
                3,
            )
            access = bundle["tenantAccessPlan"]
            self.assertEqual(access["products"], ["shop", "website", "ecommerce"])
            self.assertEqual(access["runtimeProducts"], ["commerce", "website", "ecommerce"])
            self.assertEqual(access["membershipRowsPlanned"], 1)
            self.assertTrue(access["sharedSurfaceDoesNotGrantProduct"])
            self.assertIn("commerce.read", access["ownerCapabilities"])
            self.assertIn("website.read", access["ownerCapabilities"])
            self.assertIn("ecommerce.read", access["ownerCapabilities"])
            self.assertEqual(
                access["surfaceBindings"],
                [
                    {"product": "shop", "surface": "commerce"},
                    {"product": "website", "surface": "website"},
                    {"product": "ecommerce", "surface": "commerce"},
                ],
            )
            self.assertTrue(bundle["portalControls"]["tenantIsolationRequired"])
            self.assertFalse(bundle["portalControls"]["crossTenantReadsAllowed"])
            self.assertFalse(bundle["portalControls"]["crossProductWritesAllowed"])
            self.assertTrue(bundle["customSolutionPolicy"]["tenantBound"])
            self.assertTrue(bundle["customSolutionPolicy"]["versionedMigrationRequired"])
            self.assertFalse(bundle["authority"]["tenantWritesPerformed"])

            verified = _run(
                sys.executable,
                "-s",
                PORTAL_TOOL,
                "verify",
                "--bundle",
                bundle_path,
                "--preparation",
                preparation_path,
            )
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertEqual(json.loads(verified.stdout)["bundleDigest"], bundle["bundleDigest"])

    def test_bundle_verification_rejects_tampering_and_stale_preparation(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-portal-") as temporary:
            preparation_path = self._spa_preparation(Path(temporary))
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            bundle = build_client_portal_provisioning_bundle(preparation)

            tampered = json.loads(json.dumps(bundle))
            tampered["portalControls"]["crossTenantReadsAllowed"] = True
            with self.assertRaises(ClientPortalProvisioningError):
                verify_client_portal_provisioning_bundle(tampered, preparation)

            stale = json.loads(json.dumps(preparation))
            stale["products"][0]["packageDigest"] = "sha256:" + "0" * 64
            with self.assertRaises(ClientPortalProvisioningError):
                verify_client_portal_provisioning_bundle(bundle, stale)

    def test_shop_only_access_does_not_grant_ecommerce_product(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-shop-only-portal-") as temporary:
            preparation_path = self._spa_preparation(Path(temporary), "shop")
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            access = build_client_portal_provisioning_bundle(preparation)["tenantAccessPlan"]
            self.assertEqual(access["products"], ["shop"])
            self.assertEqual(access["runtimeProducts"], ["commerce"])
            self.assertEqual(access["surfaceBindings"], [{"product": "shop", "surface": "commerce"}])
            self.assertIn("commerce.read", access["ownerCapabilities"])
            self.assertNotIn("ecommerce.read", access["ownerCapabilities"])

    def test_plant_portal_preserves_the_reviewed_industry_pack(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-plant-portal-") as temporary:
            directory = Path(temporary)
            workspace = directory / "intake"
            initialized = _run(
                "node", PREPARE_TOOL, "--init", workspace,
                "--preset", "manufacturing", "--products", "plant",
            )
            self.assertEqual(initialized.returncode, 0, initialized.stderr)
            profile_path = workspace / "client.json"
            profile = json.loads(profile_path.read_text(encoding="utf-8"))
            profile["workspace"] = "Manufacturing Client Portal"
            profile["owner"] = "Named Plant Owner"
            profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            preparation_path = directory / "private-review.json"
            prepared = _run("node", PREPARE_TOOL, "--data-dir", workspace, "--out", preparation_path)
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            bundle = build_client_portal_provisioning_bundle(preparation)
            pack_id = preparation["client"]["plantIndustryPackId"]
            self.assertEqual(
                bundle["products"][0]["setupPath"],
                f"/settings/?product=plant&pack={pack_id}",
            )


if __name__ == "__main__":
    unittest.main()
