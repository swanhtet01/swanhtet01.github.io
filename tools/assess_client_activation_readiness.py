from __future__ import annotations

import argparse
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.prepare_client_portal_provisioning import (
    ClientPortalProvisioningError,
    _read_json,
    _verify_preparation,
    verify_client_portal_provisioning_bundle,
)
from supermega_runtime.managed_activation import (
    ManagedActivationError,
    validate_managed_trial_request,
)


CONTRACT = "supermega.client_activation_readiness.v2"
_ACTIVATION_PRODUCT = {
    "commerce": "shop",
    "production": "plant",
    "website": "website",
    "ecommerce": "ecommerce",
}
_SYNTHETIC_IDENTITY = re.compile(
    r"(?:\bsample\b|\bsynthetic\b|\bfake\b|\bpilot\b|\bdemo\b|\btest\b|placeholder|not named|implementation owner|supermega implementation)",
    re.IGNORECASE,
)


class ClientActivationReadinessError(ValueError):
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


def _identity_is_real(value: object) -> bool:
    return (
        isinstance(value, str)
        and value == value.strip()
        and 2 <= len(value) <= 180
        and _SYNTHETIC_IDENTITY.search(value) is None
    )


def build_client_activation_readiness(
    preparation: Mapping[str, Any],
    portal_bundle: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    verified_portal = verify_client_portal_provisioning_bundle(portal_bundle, preparation)
    client = preparation.get("client")
    products = preparation.get("products")
    if not isinstance(client, Mapping) or not isinstance(products, list):
        raise ClientActivationReadinessError("Client preparation is incomplete.")

    workspace = client.get("workspace")
    owner = client.get("owner")
    workspace_ready = _identity_is_real(workspace)
    owner_ready = _identity_is_real(owner)
    validated_requests = [validate_managed_trial_request(request) for request in managed_requests]
    request_products = [request["product"] for request in validated_requests]
    canonical_request_products = [
        _ACTIVATION_PRODUCT[str(product["product"])]
        for product in products
        if _ACTIVATION_PRODUCT[str(product["product"])] in request_products
    ]
    if request_products != canonical_request_products or len(set(request_products)) != len(request_products):
        raise ClientActivationReadinessError(
            "Managed trial requests must be unique and follow the selected product order."
        )
    requests_by_product = {request["product"]: request for request in validated_requests}
    product_rows = []
    for product in products:
        if not isinstance(product, Mapping):
            raise ClientActivationReadinessError("Client product preparation is invalid.")
        source_mode = product.get("sourceMode")
        data_ready = (
            workspace_ready
            and owner_ready
            and source_mode == "client_csv"
            and int(product.get("rowCount", 0)) > 0
        )
        activation_product = _ACTIVATION_PRODUCT[str(product["product"])]
        managed_request = requests_by_product.get(activation_product)
        if managed_request is not None and (
            managed_request["workspaceLabel"] != workspace
            or managed_request["ownerLabel"] != owner
            or managed_request["templateId"] != product["templateId"]
        ):
            raise ClientActivationReadinessError(
                f"Managed trial request identity or template does not match {product['label']}."
            )
        request_ready = managed_request is not None
        product_rows.append({
            "product": product["product"],
            "productId": next(
                item["productId"]
                for item in verified_portal["products"]
                if item["product"] == product["product"]
            ),
            "templateId": product["templateId"],
            "sourceMode": source_mode,
            "rowCount": product["rowCount"],
            "dataStatus": "reviewed_client_data" if data_ready else "sample_fixture_only",
            "acceptedOutcomeStatus": "verified" if request_ready else "not_supplied",
            "approvedAiContextStatus": "verified" if request_ready else "not_supplied",
            "managedTrialRequestStatus": "verified" if request_ready else "not_supplied",
            "managedTrialRequestDigest": managed_request["requestDigest"] if request_ready else None,
            "nextAction": (
                "This product request is verified and ready to bind into the tenant activation plan."
                if request_ready and data_ready
                else "Run one measurable workflow, accept the outcome, approve the summary-only AI context, and export the managed trial request."
                if data_ready
                else "Replace the sample fixture with reviewed client CSV data before measuring a product outcome."
            ),
        })

    all_client_data_ready = all(row["dataStatus"] == "reviewed_client_data" for row in product_rows)
    all_managed_requests_ready = len(validated_requests) == len(product_rows)
    blocking_gates = []
    if not workspace_ready:
        blocking_gates.append("real_workspace_identity_required")
    if not owner_ready:
        blocking_gates.append("named_client_owner_required")
    for row in product_rows:
        if row["dataStatus"] != "reviewed_client_data":
            blocking_gates.append(f"reviewed_client_data_required:{row['productId']}")
        if row["managedTrialRequestStatus"] != "verified":
            blocking_gates.extend((
                f"accepted_product_outcome_required:{row['productId']}",
                f"approved_ai_context_required:{row['productId']}",
                f"managed_trial_request_required:{row['productId']}",
            ))
    blocking_gates.extend((
        "supabase_owner_identity_required",
        "owner_activation_approval_required",
        "protected_release_required",
        "hosted_postgres17_proof_required",
    ))

    payload: dict[str, Any] = {
        "contract": CONTRACT,
        "version": 2,
        "status": (
            "ready_for_target_binding"
            if workspace_ready and owner_ready and all_client_data_ready and all_managed_requests_ready
            else "blocked_for_real_client_evidence"
        ),
        "client": {
            "workspace": workspace,
            "owner": owner,
            "workspaceIdentityReady": workspace_ready,
            "namedClientOwnerReady": owner_ready,
        },
        "source": {
            "preparationDigest": preparation["bundleDigest"],
            "portalProvisioningDigest": verified_portal["bundleDigest"],
            "managedTrialRequestDigests": [
                request["requestDigest"] for request in validated_requests
            ],
        },
        "products": product_rows,
        "gates": {
            "portalProvisioningVerified": True,
            "realWorkspaceIdentityReady": workspace_ready,
            "namedClientOwnerReady": owner_ready,
            "allReviewedClientDataReady": all_client_data_ready,
            "allAcceptedProductOutcomesReady": all_managed_requests_ready,
            "allApprovedAiContextsReady": all_managed_requests_ready,
            "allManagedTrialRequestsReady": all_managed_requests_ready,
            "supabaseOwnerIdentityReady": False,
            "ownerActivationApprovalReady": False,
            "protectedReleaseReady": False,
            "hostedPostgres17ProofReady": False,
        },
        "blockingGates": blocking_gates,
        "nextActions": [
            *([] if workspace_ready and owner_ready else [
                "Replace synthetic workspace and implementation-owner labels with the real business and named client owner.",
            ]),
            *([] if all_client_data_ready else [
                "Replace every selected product sample fixture with reviewed client CSV data.",
            ]),
            *([] if all_managed_requests_ready else [
                "For each product, run one measurable workflow and retain the owner-accepted outcome digest.",
                "For each product, approve the summary-only AI context and export its managed trial request.",
            ]),
            "Bind the requests to one Supabase owner, one approval, one protected release, and one v2 tenant activation plan.",
            "Rehearse on hosted PostgreSQL 17 before the separately approved production activation.",
        ],
        "controls": {
            "containsRawClientRows": False,
            "containsSecrets": False,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "deploymentPerformed": False,
            "productionActivationPerformed": False,
            "syntheticEvidenceCannotAuthorizeProduction": True,
        },
    }
    payload["reportDigest"] = _digest(payload)
    return payload


def verify_client_activation_readiness(
    report: Mapping[str, Any],
    preparation: Mapping[str, Any],
    portal_bundle: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    expected = build_client_activation_readiness(preparation, portal_bundle, managed_requests)
    if dict(report) != expected:
        raise ClientActivationReadinessError("Activation readiness report is stale or altered.")
    return deepcopy(expected)


def _write_exclusive(path_value: str, value: Mapping[str, Any]) -> Path:
    path = Path(path_value).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as output:
            json.dump(value, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write("\n")
    except FileExistsError as exc:
        raise ClientActivationReadinessError("Output already exists and was not replaced.") from exc
    return path


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Assess a client packet without activating a tenant.")
    parser.add_argument("command", choices=("assess", "verify"))
    parser.add_argument("--preparation", required=True)
    parser.add_argument("--portal-bundle", required=True)
    parser.add_argument("--managed-request-file", action="append", default=[])
    parser.add_argument("--report")
    parser.add_argument("--output")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        preparation = _verify_preparation(args.preparation)
        portal_bundle = _read_json(args.portal_bundle, "Portal provisioning bundle")
        managed_requests = [
            _read_json(path, f"Managed trial request {index}")
            for index, path in enumerate(args.managed_request_file, start=1)
        ]
        if args.command == "assess":
            if not args.output or args.report:
                raise ClientActivationReadinessError("Assess requires --output only.")
            report = build_client_activation_readiness(preparation, portal_bundle, managed_requests)
            output = _write_exclusive(args.output, report)
            result = {"output": str(output), **report}
        else:
            if not args.report or args.output:
                raise ClientActivationReadinessError("Verify requires --report only.")
            report = _read_json(args.report, "Activation readiness report")
            result = verify_client_activation_readiness(
                report, preparation, portal_bundle, managed_requests
            )
        print(json.dumps({
            "ok": True,
            "contract": CONTRACT,
            "status": result["status"],
            "reportDigest": result["reportDigest"],
            "productCount": len(result["products"]),
            "blockingGateCount": len(result["blockingGates"]),
            "tenantWritesPerformed": False,
            "productionActivationPerformed": False,
        }, ensure_ascii=False, separators=(",", ":")))
        return 0
    except (
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
            "error": str(exc)[:240] or "Client activation readiness failed.",
            "tenantWritesPerformed": False,
            "productionActivationPerformed": False,
        }, ensure_ascii=False, separators=(",", ":")), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
