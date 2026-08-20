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

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from supermega_runtime.client_provisioning import (
    build_client_provisioning_plan,
    derive_client_provisioning_recipe,
)


CONTRACT = "supermega.client_portal_provisioning_bundle.v1"
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
        planned_products.append({
            "product": runtime_product,
            "productId": product_id,
            "label": product["label"],
            "templateId": template_id,
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
        "version": 1,
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
        "portalControls": {
            "namedWorkspaceRequired": True,
            "namedOwnerRequired": True,
            "workspaceSelectionRequired": True,
            "tenantIsolationRequired": True,
            "crossTenantReadsAllowed": False,
            "crossProductWritesAllowed": False,
        },
        "customSolutionPolicy": {
            "tenantBound": True,
            "baseRecipeRequired": True,
            "versionedMigrationRequired": True,
            "digestBoundRollbackRequired": True,
            "separateHumanApprovalRequired": True,
            "crossProductWritesAllowed": False,
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
        else:
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
