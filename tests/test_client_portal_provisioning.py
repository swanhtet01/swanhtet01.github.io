from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from supermega_runtime.managed_activation import (
    ACTIVATION_PLAN_CONTRACT,
    MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT,
)
from tools.prepare_client_portal_provisioning import (
    ACTIVATION_MANIFEST_CONTRACT,
    CONTRACT,
    ClientPortalProvisioningError,
    build_client_portal_activation_manifest,
    build_client_portal_provisioning_bundle,
    verify_client_portal_activation_manifest,
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

    @staticmethod
    def _activation_plan_for_bundle(bundle: dict[str, object]) -> dict[str, object]:
        client = bundle["client"]
        access = bundle["tenantAccessPlan"]
        assert isinstance(client, dict)
        assert isinstance(access, dict)
        products = list(access["products"])
        source_plans = [
            {
                "product": product,
                "sourceRequestDigest": "sha256:" + str(index + 3) * 64,
            }
            for index, product in enumerate(products)
        ]
        return {
            "contract": MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT,
            "version": 2,
            "activationId": "f2dc903c-08f4-49ab-b68c-b108db41be62",
            "workspaceId": "beauty-spa-client-portal",
            "workspaceLabel": client["workspace"],
            "ownerActorId": "c63af44e-b7c1-4dbf-970d-389d5bba93a7",
            "ownerLabel": client["owner"],
            "products": products,
            "sourcePlans": source_plans,
            "ownerCapabilities": ["commerce.read", "commerce.write", "website.read", "website.write"],
            "target": {
                "projectRef": "zvtzwcimpvvtkowflhda",
                "releaseCommit": "a" * 40,
                "adminCaSha256": "sha256:" + "1" * 64,
                "schemaVersion": 11,
            },
            "forbiddenActions": ["capture_payments", "publish_domains"],
            "expiresAt": "2099-01-01T00:00:00.000Z",
            "planDigest": "sha256:" + "2" * 64,
            "secretValuesExposed": False,
        }

    @staticmethod
    def _managed_request_bindings(
        bundle: dict[str, object], plan: dict[str, object]
    ) -> list[dict[str, object]]:
        client = bundle["client"]
        products = bundle["products"]
        source_plans = plan["sourcePlans"]
        assert isinstance(client, dict)
        assert isinstance(products, list)
        assert isinstance(source_plans, list)
        return [
            {
                "contract": "supermega.managed_trial_request.v1",
                "product": product["productId"],
                "workspaceLabel": client["workspace"],
                "ownerLabel": client["owner"],
                "templateId": product["templateId"],
                "requestDigest": source_plan["sourceRequestDigest"],
                "evidence": {
                    "pilotOutcomeStatus": "improved",
                    "pilotOutcomeDigest": "sha256:" + "9" * 64,
                },
                "rawRecordsIncluded": False,
                "secretValuesExposed": False,
            }
            for product, source_plan in zip(products, source_plans, strict=True)
        ]

    @staticmethod
    def _single_activation_plan_for_bundle(bundle: dict[str, object]) -> dict[str, object]:
        client = bundle["client"]
        access = bundle["tenantAccessPlan"]
        assert isinstance(client, dict)
        assert isinstance(access, dict)
        products = list(access["products"])
        assert len(products) == 1
        return {
            "contract": ACTIVATION_PLAN_CONTRACT,
            "version": 1,
            "activationId": "f2dc903c-08f4-49ab-b68c-b108db41be62",
            "workspaceId": "beauty-spa-client-portal",
            "workspaceLabel": client["workspace"],
            "ownerActorId": "c63af44e-b7c1-4dbf-970d-389d5bba93a7",
            "ownerLabel": client["owner"],
            "product": products[0],
            "sourceRequestDigest": "sha256:" + "3" * 64,
            "ownerCapabilities": ["commerce.read", "commerce.write"],
            "target": {
                "projectRef": "zvtzwcimpvvtkowflhda",
                "releaseCommit": "a" * 40,
                "adminCaSha256": "sha256:" + "1" * 64,
                "schemaVersion": 11,
            },
            "forbiddenActions": ["capture_payments", "publish_domains"],
            "expiresAt": "2099-01-01T00:00:00.000Z",
            "planDigest": "sha256:" + "2" * 64,
            "secretValuesExposed": False,
        }

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
            self.assertNotIn("ecommerce.read", access["ownerCapabilities"])
            self.assertIn("commerce.read", access["ownerCapabilities"])
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
            self.assertEqual(bundle["customSolutionPolicy"]["requestContract"], "supermega.client_extension_manifest.v1")
            self.assertEqual(bundle["customSolutionPolicy"]["activationPlanContract"], "supermega.client_extension_activation_plan.v1")
            self.assertTrue(bundle["customSolutionPolicy"]["purchasedBaseProductRequired"])
            self.assertTrue(bundle["customSolutionPolicy"]["versionedMigrationRequired"])
            self.assertTrue(bundle["customSolutionPolicy"]["securityReviewRequired"])
            self.assertTrue(bundle["customSolutionPolicy"]["namedOwnerApprovalRequired"])
            self.assertEqual(bundle["customSolutionPolicy"]["activationStatus"], "not_applied")
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

    def test_portal_activation_manifest_binds_one_tenant_products_routes_and_custom_policy(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-portal-activation-") as temporary:
            preparation_path = self._spa_preparation(Path(temporary))
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            bundle = build_client_portal_provisioning_bundle(preparation)
            plan = self._activation_plan_for_bundle(bundle)
            requests = self._managed_request_bindings(bundle, plan)
            with mock.patch(
                "tools.prepare_client_portal_provisioning.validate_multi_product_activation_plan",
                return_value=plan,
            ), mock.patch(
                "tools.prepare_client_portal_provisioning.validate_managed_trial_request",
                side_effect=lambda value: value,
            ):
                manifest = build_client_portal_activation_manifest(
                    bundle, preparation, plan, requests
                )
                self.assertEqual(manifest["contract"], ACTIVATION_MANIFEST_CONTRACT)
                self.assertEqual(manifest["status"], "approved_plan_not_applied")
                self.assertEqual(
                    manifest["tenant"]["products"],
                    ["shop", "website", "ecommerce"],
                )
                self.assertEqual(manifest["tenant"]["membershipRowsPlanned"], 1)
                self.assertEqual(
                    [item["setupPath"] for item in manifest["portal"]["productBindings"]],
                    [
                        "/settings/?product=shop&pack=spa",
                        "/settings/?product=website&template=lead-generation",
                        "/settings/?product=ecommerce&template=social-storefront",
                    ],
                )
                self.assertEqual(
                    manifest["portal"]["productBindings"][-1]["surface"],
                    "commerce",
                )
                self.assertEqual(
                    manifest["activation"]["planDigest"], plan["planDigest"]
                )
                self.assertTrue(manifest["customSolutions"]["tenantBound"])
                self.assertFalse(manifest["authority"]["tenantWritesPerformed"])
                self.assertFalse(manifest["authority"]["productionActivationPerformed"])
                self.assertEqual(
                    verify_client_portal_activation_manifest(
                        manifest, bundle, preparation, plan, requests
                    ),
                    manifest,
                )

                tampered = json.loads(json.dumps(manifest))
                tampered["portal"]["productBindings"][0]["setupPath"] = "/plant/"
                with self.assertRaises(ClientPortalProvisioningError):
                    verify_client_portal_activation_manifest(
                        tampered, bundle, preparation, plan, requests
                    )

    def test_portal_activation_manifest_rejects_product_or_identity_drift(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-portal-activation-drift-") as temporary:
            preparation_path = self._spa_preparation(Path(temporary))
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            bundle = build_client_portal_provisioning_bundle(preparation)
            plan = self._activation_plan_for_bundle(bundle)
            requests = self._managed_request_bindings(bundle, plan)
            with mock.patch(
                "tools.prepare_client_portal_provisioning.validate_multi_product_activation_plan",
                side_effect=lambda value, **_kwargs: value,
            ), mock.patch(
                "tools.prepare_client_portal_provisioning.validate_managed_trial_request",
                side_effect=lambda value: value,
            ):
                wrong_products = json.loads(json.dumps(plan))
                wrong_products["products"] = ["shop", "website"]
                with self.assertRaises(ClientPortalProvisioningError):
                    build_client_portal_activation_manifest(
                        bundle, preparation, wrong_products, requests
                    )

                wrong_owner = json.loads(json.dumps(plan))
                wrong_owner["ownerLabel"] = "Different Owner"
                with self.assertRaises(ClientPortalProvisioningError):
                    build_client_portal_activation_manifest(
                        bundle, preparation, wrong_owner, requests
                    )

                wrong_template = json.loads(json.dumps(requests))
                wrong_template[0]["templateId"] = "retail-wholesale"
                with self.assertRaises(ClientPortalProvisioningError):
                    build_client_portal_activation_manifest(
                        bundle, preparation, plan, wrong_template
                    )

                wrong_digest = json.loads(json.dumps(requests))
                wrong_digest[0]["requestDigest"] = "sha256:" + "0" * 64
                with self.assertRaises(ClientPortalProvisioningError):
                    build_client_portal_activation_manifest(
                        bundle, preparation, plan, wrong_digest
                    )

    def test_shop_only_portal_binds_to_single_product_activation_without_ecommerce(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-shop-activation-") as temporary:
            preparation_path = self._spa_preparation(Path(temporary), "shop")
            preparation = json.loads(preparation_path.read_text(encoding="utf-8"))
            bundle = build_client_portal_provisioning_bundle(preparation)
            plan = self._single_activation_plan_for_bundle(bundle)
            product = bundle["products"][0]
            request = {
                "contract": "supermega.managed_trial_request.v1",
                "product": "shop",
                "workspaceLabel": bundle["client"]["workspace"],
                "ownerLabel": bundle["client"]["owner"],
                "templateId": product["templateId"],
                "requestDigest": plan["sourceRequestDigest"],
                "evidence": {"pilotOutcomeStatus": "improved"},
                "rawRecordsIncluded": False,
                "secretValuesExposed": False,
            }
            with mock.patch(
                "tools.prepare_client_portal_provisioning.validate_activation_plan",
                return_value=plan,
            ), mock.patch(
                "tools.prepare_client_portal_provisioning.validate_managed_trial_request",
                return_value=request,
            ):
                manifest = build_client_portal_activation_manifest(
                    bundle, preparation, plan, [request]
                )
            self.assertEqual(manifest["tenant"]["products"], ["shop"])
            self.assertEqual(manifest["activation"]["planContract"], ACTIVATION_PLAN_CONTRACT)
            self.assertEqual(
                manifest["portal"]["productBindings"],
                [{
                    "product": "shop",
                    "runtimeProduct": "commerce",
                    "surface": "commerce",
                    "templateId": product["templateId"],
                    "setupPath": "/settings/?product=shop&pack=spa",
                    "recipePlanId": product["provisioningPlan"]["planId"],
                    "recipePlanDigest": product["provisioningPlan"]["planDigest"],
                    "sourcePackageDigest": product["source"]["packageDigest"],
                    "managedRequestDigest": plan["sourceRequestDigest"],
                    "managedEvidence": {"pilotOutcomeStatus": "improved"},
                }],
            )

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
