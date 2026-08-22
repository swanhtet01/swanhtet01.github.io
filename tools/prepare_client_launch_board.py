from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.assess_client_activation_readiness import (
    ClientActivationReadinessError,
    build_client_activation_readiness,
)
from tools.prepare_client_portal_provisioning import (
    ClientPortalProvisioningError,
    _read_json,
    _verify_preparation,
    build_client_portal_provisioning_bundle,
)
from supermega_runtime.managed_activation import ManagedActivationError


CONTRACT = "supermega.client_launch_board.v1"


class ClientLaunchBoardError(ValueError):
    pass


def _digest(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def _connections(product_ids: Sequence[str]) -> list[dict[str, object]]:
    entitled = set(product_ids)
    candidates = (
        ("website-shop-intake", "website", "shop", "Send approved website enquiries and catalog intake to Shop"),
        ("ecommerce-shop-orders", "ecommerce", "shop", "Send reviewed online orders to Shop fulfilment"),
        ("shop-plant-demand", "shop", "plant", "Share approved demand and stock signals with Plant"),
    )
    return [
        {
            "id": connection_id,
            "sourceProduct": source,
            "targetProduct": target,
            "label": label,
            "status": "available_after_tenant_activation",
            "automaticCrossProductWrites": False,
        }
        for connection_id, source, target, label in candidates
        if source in entitled and target in entitled
    ]


def build_client_launch_board(
    preparation: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    portal = build_client_portal_provisioning_bundle(preparation)
    readiness = build_client_activation_readiness(preparation, portal, managed_requests)
    portal_products = {item["productId"]: item for item in portal["products"]}
    products = []
    for readiness_product in readiness["products"]:
        product_id = readiness_product["productId"]
        portal_product = portal_products[product_id]
        products.append({
            "productId": product_id,
            "label": portal_product["label"],
            "templateId": portal_product["templateId"],
            "startPath": portal_product["setupPath"],
            "dataStatus": readiness_product["dataStatus"],
            "acceptedOutcomeStatus": readiness_product["acceptedOutcomeStatus"],
            "approvedAiContextStatus": readiness_product["approvedAiContextStatus"],
            "managedTrialRequestStatus": readiness_product["managedTrialRequestStatus"],
            "nextAction": readiness_product["nextAction"],
        })

    identity_ready = (
        readiness["gates"]["realWorkspaceIdentityReady"]
        and readiness["gates"]["namedClientOwnerReady"]
    )
    product_proof_ready = readiness["gates"]["allManagedTrialRequestsReady"]
    payload: dict[str, Any] = {
        "contract": CONTRACT,
        "version": 1,
        "status": readiness["status"],
        "client": deepcopy(readiness["client"]),
        "source": {
            "preparationDigest": preparation["bundleDigest"],
            "portalProvisioningDigest": portal["bundleDigest"],
            "activationReadinessDigest": readiness["reportDigest"],
            "managedTrialRequestDigests": list(readiness["source"]["managedTrialRequestDigests"]),
        },
        "products": products,
        "connections": _connections([product["productId"] for product in products]),
        "launchStages": [
            {
                "id": "reviewed-client-intake",
                "status": "ready" if identity_ready and readiness["gates"]["allReviewedClientDataReady"] else "blocked",
                "proof": "Named business, named owner, and reviewed client rows for every selected product.",
            },
            {
                "id": "tenant-portal-design",
                "status": "ready",
                "proof": "Verified product entitlements, setup routes, roles, and tenant isolation plan.",
            },
            {
                "id": "accepted-product-outcomes",
                "status": "ready" if product_proof_ready else "blocked",
                "proof": "One accepted outcome and approved summary-only AI context per product.",
            },
            {
                "id": "activation-target-binding",
                "status": "ready" if readiness["status"] == "ready_for_target_binding" else "blocked",
                "proof": "Exact managed requests can be bound to one owner, release, and protected target.",
            },
            {
                "id": "hosted-rehearsal",
                "status": "pending",
                "proof": "Isolated hosted PostgreSQL 17 identity, isolation, backup, restore, and smoke evidence.",
            },
            {
                "id": "production-activation",
                "status": "owner_gated",
                "proof": "Short-lived owner authorization for the exact tenant, release, target, and plan digest.",
            },
        ],
        "customSolutions": {
            "status": "available_after_base_product_review",
            "availableForProducts": [product["productId"] for product in products],
            "tenantBound": True,
            "purchasedBaseProductRequired": True,
            "lifecycle": [
                "request",
                "security_review",
                "versioned_implementation",
                "owner_authorization",
                "activation_receipt",
                "rollback_proof",
            ],
            "automaticActivation": False,
        },
        "blockingGates": list(readiness["blockingGates"]),
        "nextActions": list(readiness["nextActions"]),
        "controls": {
            "containsRawClientRows": False,
            "containsSecrets": False,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "externalMessagesSent": False,
            "deploymentPerformed": False,
            "productionActivationPerformed": False,
            "syntheticEvidenceCannotAuthorizeProduction": True,
        },
    }
    payload["boardDigest"] = _digest(payload)
    return payload


def verify_client_launch_board(
    board: Mapping[str, Any],
    preparation: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    expected = build_client_launch_board(preparation, managed_requests)
    if dict(board) != expected:
        raise ClientLaunchBoardError("Client launch board is stale or altered.")
    return deepcopy(expected)


def _write_exclusive(path_value: str, value: Mapping[str, Any]) -> Path:
    path = Path(path_value).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(value, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
    except FileExistsError as exc:
        raise ClientLaunchBoardError("Output already exists and was not replaced.") from exc
    return path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Compile one verified, no-write client launch board."
    )
    parser.add_argument("command", choices=("prepare", "verify"))
    parser.add_argument("--preparation", required=True)
    parser.add_argument("--managed-request-file", action="append", default=[])
    parser.add_argument("--board")
    parser.add_argument("--output")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        preparation = _verify_preparation(args.preparation)
        managed_requests = [
            _read_json(path, f"Managed trial request {index}")
            for index, path in enumerate(args.managed_request_file, start=1)
        ]
        if args.command == "prepare":
            if not args.output or args.board:
                raise ClientLaunchBoardError("Prepare requires --output only.")
            result = build_client_launch_board(preparation, managed_requests)
            output = _write_exclusive(args.output, result)
            output_path = str(output)
        else:
            if not args.board or args.output:
                raise ClientLaunchBoardError("Verify requires --board only.")
            board = _read_json(args.board, "Client launch board")
            result = verify_client_launch_board(board, preparation, managed_requests)
            output_path = str(Path(args.board).resolve())
        print(json.dumps({
            "ok": True,
            "contract": CONTRACT,
            "status": result["status"],
            "output": output_path,
            "productCount": len(result["products"]),
            "connectionCount": len(result["connections"]),
            "blockingGateCount": len(result["blockingGates"]),
            "boardDigest": result["boardDigest"],
            "tenantWritesPerformed": False,
            "productionActivationPerformed": False,
        }, ensure_ascii=False, separators=(",", ":")))
        return 0
    except (
        ClientLaunchBoardError,
        ClientActivationReadinessError,
        ClientPortalProvisioningError,
        ManagedActivationError,
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        print(json.dumps({
            "ok": False,
            "contract": CONTRACT,
            "error": str(exc)[:240] or "Client launch board failed.",
            "tenantWritesPerformed": False,
            "productionActivationPerformed": False,
        }, ensure_ascii=False, separators=(",", ":")), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
