from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any, Mapping, Sequence
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from supermega_runtime.client_provisioning import (
    build_client_provisioning_plan,
    derive_client_provisioning_recipe,
)
from supermega_runtime.managed_activation import (
    ACTIVATION_PLAN_CONTRACT,
    MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT,
    validate_activation_plan,
    validate_managed_trial_request,
    validate_multi_product_activation_plan,
)


CONTRACT = "supermega.client_portal_provisioning_bundle.v4"
ACTIVATION_MANIFEST_CONTRACT = "supermega.client_portal_activation_manifest.v1"
PREPARATION_CONTRACT = "supermega.client_demo_preparation.v3"
PRODUCT_ORDER = ("commerce", "production", "website", "ecommerce")
PRODUCT_IDS = {
    "commerce": "shop",
    "production": "plant",
    "website": "website",
    "ecommerce": "ecommerce",
}
MAX_INPUT_BYTES = 5 * 1024 * 1024


class ClientPortalProvisioningError(ValueError):
    pass


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in pairs:
        if key in output:
            raise ClientPortalProvisioningError("Duplicate JSON object keys are not allowed.")
        output[key] = value
    return output


def _read_json(path_value: str | Path, label: str) -> dict[str, Any]:
    path = Path(path_value).resolve()
    if path.is_symlink() or not path.is_file():
        raise ClientPortalProvisioningError(f"{label} must be a regular file.")
    raw = path.read_bytes()
    if not raw or len(raw) > MAX_INPUT_BYTES:
        raise ClientPortalProvisioningError(f"{label} size is invalid.")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object_without_duplicate_keys)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ClientPortalProvisioningError(f"{label} must be UTF-8 JSON.") from exc
    if not isinstance(value, dict):
        raise ClientPortalProvisioningError(f"{label} must be a JSON object.")
    return value


def _canonical_digest(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def _verify_preparation(path_value: str | Path) -> dict[str, Any]:
    path = Path(path_value).resolve()
    node = shutil.which("node")
    if not node:
        raise ClientPortalProvisioningError("Node.js is required to verify the client preparation.")
    result = subprocess.run(
        [node, str(ROOT / "tools" / "prepare_client_demo.mjs"), "--verify", str(path)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise ClientPortalProvisioningError("The client preparation failed its canonical verifier.")
    preparation = _read_json(path, "Client preparation")
    if preparation.get("contract") != PREPARATION_CONTRACT:
        raise ClientPortalProvisioningError("The client preparation contract is unsupported.")
    return preparation


def _base_recipes() -> dict[str, dict[str, Any]]:
    registry = _read_json(
        ROOT / "client-provisioning-recipes.json",
        "Client provisioning recipe registry",
    )
    if registry.get("contract") != "supermega.client_provisioning_recipe_registry.v1":
        raise ClientPortalProvisioningError("The client provisioning recipe registry is unsupported.")
    recipes: dict[str, dict[str, Any]] = {}
    for recipe in registry.get("recipes", []):
        if not isinstance(recipe, Mapping):
            continue
        product_id = str(recipe.get("productId", ""))
        if product_id in recipes:
            raise ClientPortalProvisioningError("Each product must expose one reviewed base recipe.")
        recipes[product_id] = deepcopy(dict(recipe))
    if tuple(recipes) != tuple(PRODUCT_IDS[product] for product in PRODUCT_ORDER):
        raise ClientPortalProvisioningError("The four reviewed product recipes are incomplete or unordered.")
    return recipes


def build_client_portal_provisioning_bundle(preparation: Mapping[str, Any]) -> dict[str, Any]:
    client = preparation.get("client")
    products = preparation.get("products")
    controls = preparation.get("controls")
    if not isinstance(client, Mapping) or not isinstance(products, list) or not isinstance(controls, Mapping):
        raise ClientPortalProvisioningError("The verified preparation structure is incomplete.")
    if (
        controls.get("humanReviewRequired") is not True
        or controls.get("activationStatus") != "not_applied"
        or controls.get("externalWritesPerformed") is not False
        or controls.get("hostedWritesPerformed") is not False
    ):
        raise ClientPortalProvisioningError("The preparation crossed the no-write activation boundary.")
    runtime_products = [item.get("product") for item in products if isinstance(item, Mapping)]
    if (
        len(runtime_products) != len(products)
        or len(products) not in range(1, 5)
        or len(set(runtime_products)) != len(runtime_products)
        or runtime_products != [product for product in PRODUCT_ORDER if product in runtime_products]
    ):
        raise ClientPortalProvisioningError("Selected products must be unique and canonically ordered.")

    workspace = client.get("workspace")
    owner = client.get("owner")
    recipes = _base_recipes()
    planned_products = []
    for product in products:
        runtime_product = str(product["product"])
        product_id = PRODUCT_IDS[runtime_product]
        template_id = str(product["templateId"])
        recipe = derive_client_provisioning_recipe(
            recipes[product_id],
            template_id=template_id,
        )
        plan = build_client_provisioning_plan(
            recipe,
            workspace=workspace,
            owner=owner,
        )
        setup_path = str(product["setupPath"])
        if runtime_product == "commerce":
            industry_pack_id = str(client["shopIndustryPackId"])
            if industry_pack_id not in {"retail", "cafe", "restaurant", "spa", "gym", "school"}:
                raise ClientPortalProvisioningError("The Shop industry pack is unsupported.")
            setup_path = f"/settings/?product=shop&pack={industry_pack_id}"
        elif runtime_product == "production":
            industry_pack_id = str(client["plantIndustryPackId"])
            if industry_pack_id not in {"general-manufacturing", "batch-process", "food-beverage", "apparel", "assembly"}:
                raise ClientPortalProvisioningError("The Plant industry pack is unsupported.")
            setup_path = f"/settings/?product=plant&pack={industry_pack_id}"
        elif runtime_product in {"website", "ecommerce"}:
            setup_path = f"/settings/?product={runtime_product}&template={quote(template_id, safe='')}"
        planned_products.append({
            "product": runtime_product,
            "productId": product_id,
            "label": product["label"],
            "templateId": template_id,
            "setupPath": setup_path,
            "source": {
                "preparationBundleDigest": preparation["bundleDigest"],
                "packageDigest": product["packageDigest"],
                "previewDigest": product["previewDigest"],
                "rowCount": product["rowCount"],
                "sourceMode": product["sourceMode"],
            },
            "provisioningPlan": plan,
        })

    payload: dict[str, Any] = {
        "contract": CONTRACT,
        "version": 4,
        "client": {
            "workspace": workspace,
            "owner": owner,
            "presetId": client["presetId"],
            "shopIndustryPackId": client["shopIndustryPackId"],
            "plantIndustryPackId": client["plantIndustryPackId"],
        },
        "preparation": {
            "contract": preparation["contract"],
            "bundleDigest": preparation["bundleDigest"],
            "containsNormalizedClientData": controls["containsNormalizedClientData"],
            "containsSampleFixtures": controls["containsSampleFixtures"],
        },
        "products": planned_products,
        "tenantAccessPlan": {
            "status": "planned_not_applied",
            "products": [product["productId"] for product in planned_products],
            "runtimeProducts": [product["product"] for product in planned_products],
            "surfaceBindings": [
                {
                    "product": product["productId"],
                    "surface": "commerce" if product["product"] == "ecommerce" else product["product"],
                }
                for product in planned_products
            ],
            "ownerCapabilities": sorted({
                capability
                for product in planned_products
                for role in product["provisioningPlan"]["resources"]["roles"]
                if role["id"] == "owner"
                for capability in role["capabilities"]
            }),
            "membershipRowsPlanned": 1,
            "sharedSurfaceDoesNotGrantProduct": True,
            "tenantWritesPerformed": False,
        },
        "portalControls": {
            "namedWorkspaceRequired": True,
            "namedOwnerRequired": True,
            "workspaceSelectionRequired": True,
            "tenantIsolationRequired": True,
            "crossTenantReadsAllowed": False,
            "crossProductWritesAllowed": False,
        },
        "customSolutionPolicy": {
            "requestContract": "supermega.client_extension_manifest.v1",
            "activationPlanContract": "supermega.client_extension_activation_plan.v1",
            "tenantBound": True,
            "purchasedBaseProductRequired": True,
            "baseRecipeRequired": True,
            "versionedMigrationRequired": True,
            "digestBoundRollbackRequired": True,
            "securityReviewRequired": True,
            "namedOwnerApprovalRequired": True,
            "separateHumanApprovalRequired": True,
            "crossProductWritesAllowed": False,
            "activationStatus": "not_applied",
        },
        "authority": {
            "status": "planned_not_applied",
            "humanApprovalRequired": True,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "externalMessagesSent": False,
            "deploymentPerformed": False,
            "productionActivationPerformed": False,
        },
    }
    payload["bundleDigest"] = _canonical_digest(payload)
    return payload


def verify_client_portal_provisioning_bundle(
    bundle: Mapping[str, Any],
    preparation: Mapping[str, Any],
) -> dict[str, Any]:
    expected = build_client_portal_provisioning_bundle(preparation)
    if dict(bundle) != expected:
        raise ClientPortalProvisioningError("The portal provisioning bundle is stale or has been altered.")
    return deepcopy(expected)


def _validated_activation_plan(value: Mapping[str, Any]) -> dict[str, Any]:
    contract = value.get("contract")
    if contract == ACTIVATION_PLAN_CONTRACT:
        return validate_activation_plan(value, require_current=True)
    if contract == MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT:
        return validate_multi_product_activation_plan(value, require_current=True)
    raise ClientPortalProvisioningError("The managed activation plan contract is unsupported.")


def build_client_portal_activation_manifest(
    bundle: Mapping[str, Any],
    preparation: Mapping[str, Any],
    activation_plan: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Bind reviewed portal setup to one current executable tenant activation plan."""

    verified_bundle = verify_client_portal_provisioning_bundle(bundle, preparation)
    try:
        plan = _validated_activation_plan(activation_plan)
    except (TypeError, ValueError) as exc:
        raise ClientPortalProvisioningError("The managed activation plan failed validation.") from exc

    access = verified_bundle["tenantAccessPlan"]
    planned_products = list(access["products"])
    activated_products = (
        list(plan["products"])
        if plan["contract"] == MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT
        else [plan["product"]]
    )
    if activated_products != planned_products:
        raise ClientPortalProvisioningError(
            "The activation products do not exactly match the reviewed client portal products."
        )
    if (
        plan["workspaceLabel"] != verified_bundle["client"]["workspace"]
        or plan["ownerLabel"] != verified_bundle["client"]["owner"]
    ):
        raise ClientPortalProvisioningError(
            "The activation workspace or named owner does not match the reviewed portal bundle."
        )
    if plan.get("secretValuesExposed") is not False:
        raise ClientPortalProvisioningError("The activation plan must not expose secret values.")

    try:
        request_bindings = [validate_managed_trial_request(request) for request in managed_requests]
    except (TypeError, ValueError) as exc:
        raise ClientPortalProvisioningError("A managed trial request failed validation.") from exc
    if len(request_bindings) != len(planned_products):
        raise ClientPortalProvisioningError(
            "Every reviewed portal product requires exactly one managed trial request."
        )
    if [binding["product"] for binding in request_bindings] != planned_products:
        raise ClientPortalProvisioningError(
            "Managed trial requests do not match the reviewed portal product order."
        )
    if any(
        binding["workspaceLabel"] != verified_bundle["client"]["workspace"]
        or binding["ownerLabel"] != verified_bundle["client"]["owner"]
        for binding in request_bindings
    ):
        raise ClientPortalProvisioningError(
            "A managed trial request changed the reviewed workspace or named owner."
        )
    source_plans = (
        list(plan["sourcePlans"])
        if plan["contract"] == MULTI_PRODUCT_ACTIVATION_PLAN_CONTRACT
        else [plan]
    )
    if [source["sourceRequestDigest"] for source in source_plans] != [
        binding["requestDigest"] for binding in request_bindings
    ]:
        raise ClientPortalProvisioningError(
            "The activation plan is not bound to the exact managed trial requests."
        )

    product_bindings = []
    for product, request_binding in zip(verified_bundle["products"], request_bindings, strict=True):
        if request_binding["templateId"] != product["templateId"]:
            raise ClientPortalProvisioningError(
                "A managed trial request changed the reviewed product template."
            )
        product_bindings.append({
            "product": product["productId"],
            "runtimeProduct": product["product"],
            "surface": "commerce" if product["product"] == "ecommerce" else product["product"],
            "templateId": product["templateId"],
            "setupPath": product["setupPath"],
            "recipePlanId": product["provisioningPlan"]["planId"],
            "recipePlanDigest": product["provisioningPlan"]["planDigest"],
            "sourcePackageDigest": product["source"]["packageDigest"],
            "managedRequestDigest": request_binding["requestDigest"],
            "managedEvidence": deepcopy(request_binding["evidence"]),
        })

    manifest: dict[str, Any] = {
        "contract": ACTIVATION_MANIFEST_CONTRACT,
        "version": 1,
        "status": "approved_plan_not_applied",
        "tenant": {
            "workspaceId": plan["workspaceId"],
            "workspaceLabel": plan["workspaceLabel"],
            "ownerActorId": plan["ownerActorId"],
            "ownerLabel": plan["ownerLabel"],
            "products": planned_products,
            "membershipRowsPlanned": access["membershipRowsPlanned"],
        },
        "portal": {
            "bundleContract": verified_bundle["contract"],
            "bundleDigest": verified_bundle["bundleDigest"],
            "productBindings": product_bindings,
            "workspaceSelectionRequired": True,
            "sharedSurfaceDoesNotGrantProduct": True,
            "crossTenantReadsAllowed": False,
            "crossProductWritesAllowed": False,
        },
        "activation": {
            "planContract": plan["contract"],
            "activationId": plan["activationId"],
            "planDigest": plan["planDigest"],
            "expiresAt": plan["expiresAt"],
            "target": deepcopy(plan["target"]),
            "ownerCapabilities": deepcopy(plan["ownerCapabilities"]),
            "forbiddenActions": deepcopy(plan["forbiddenActions"]),
            "plan": deepcopy(plan),
        },
        "customSolutions": deepcopy(verified_bundle["customSolutionPolicy"]),
        "authority": {
            "humanApprovalBound": True,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "externalMessagesSent": False,
            "deploymentPerformed": False,
            "productionActivationPerformed": False,
        },
    }
    manifest["manifestDigest"] = _canonical_digest(manifest)
    return manifest


def verify_client_portal_activation_manifest(
    manifest: Mapping[str, Any],
    bundle: Mapping[str, Any],
    preparation: Mapping[str, Any],
    activation_plan: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    expected = build_client_portal_activation_manifest(
        bundle, preparation, activation_plan, managed_requests
    )
    if dict(manifest) != expected:
        raise ClientPortalProvisioningError("The client portal activation manifest is stale or altered.")
    return deepcopy(expected)


def _write_exclusive(path_value: str | Path, value: Mapping[str, Any]) -> Path:
    path = Path(path_value).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(value, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
    except FileExistsError as exc:
        raise ClientPortalProvisioningError("Output already exists and was not replaced.") from exc
    return path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare or verify a no-write client portal provisioning bundle.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--preparation", required=True)
    prepare.add_argument("--output", required=True)
    verify = subparsers.add_parser("verify")
    verify.add_argument("--bundle", required=True)
    verify.add_argument("--preparation", required=True)
    bind = subparsers.add_parser("bind-activation")
    bind.add_argument("--bundle", required=True)
    bind.add_argument("--preparation", required=True)
    bind.add_argument("--activation-plan", required=True)
    bind.add_argument("--managed-request", action="append", required=True)
    bind.add_argument("--output", required=True)
    verify_binding = subparsers.add_parser("verify-activation")
    verify_binding.add_argument("--manifest", required=True)
    verify_binding.add_argument("--bundle", required=True)
    verify_binding.add_argument("--preparation", required=True)
    verify_binding.add_argument("--activation-plan", required=True)
    verify_binding.add_argument("--managed-request", action="append", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        preparation = _verify_preparation(args.preparation)
        if args.command == "prepare":
            bundle = build_client_portal_provisioning_bundle(preparation)
            output = _write_exclusive(args.output, bundle)
            result = {
                "ok": True,
                "contract": CONTRACT,
                "output": str(output),
                "bundleDigest": bundle["bundleDigest"],
                "productCount": len(bundle["products"]),
                "status": bundle["authority"]["status"],
                "tenantWritesPerformed": False,
                "productionActivationPerformed": False,
            }
        elif args.command == "verify":
            bundle = _read_json(args.bundle, "Portal provisioning bundle")
            verified = verify_client_portal_provisioning_bundle(bundle, preparation)
            result = {
                "ok": True,
                "contract": CONTRACT,
                "bundleDigest": verified["bundleDigest"],
                "productCount": len(verified["products"]),
                "status": verified["authority"]["status"],
                "tenantWritesPerformed": False,
                "productionActivationPerformed": False,
            }
        elif args.command == "bind-activation":
            bundle = _read_json(args.bundle, "Portal provisioning bundle")
            plan = _read_json(args.activation_plan, "Managed activation plan")
            requests = [
                _read_json(path, "Managed trial request")
                for path in args.managed_request
            ]
            manifest = build_client_portal_activation_manifest(
                bundle, preparation, plan, requests
            )
            output = _write_exclusive(args.output, manifest)
            result = {
                "ok": True,
                "contract": ACTIVATION_MANIFEST_CONTRACT,
                "output": str(output),
                "manifestDigest": manifest["manifestDigest"],
                "productCount": len(manifest["tenant"]["products"]),
                "status": manifest["status"],
                "tenantWritesPerformed": False,
                "productionActivationPerformed": False,
            }
        else:
            bundle = _read_json(args.bundle, "Portal provisioning bundle")
            plan = _read_json(args.activation_plan, "Managed activation plan")
            manifest = _read_json(args.manifest, "Client portal activation manifest")
            requests = [
                _read_json(path, "Managed trial request")
                for path in args.managed_request
            ]
            verified = verify_client_portal_activation_manifest(
                manifest, bundle, preparation, plan, requests
            )
            result = {
                "ok": True,
                "contract": ACTIVATION_MANIFEST_CONTRACT,
                "manifestDigest": verified["manifestDigest"],
                "productCount": len(verified["tenant"]["products"]),
                "status": verified["status"],
                "tenantWritesPerformed": False,
                "productionActivationPerformed": False,
            }
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except (ClientPortalProvisioningError, KeyError, TypeError, ValueError) as exc:
        print(json.dumps({
            "ok": False,
            "contract": CONTRACT,
            "error": str(exc)[:240] or "Client portal provisioning failed.",
            "tenantWritesPerformed": False,
            "productionActivationPerformed": False,
        }, ensure_ascii=False, separators=(",", ":")), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
