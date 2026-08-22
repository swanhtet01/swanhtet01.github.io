from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
from typing import Any, Mapping, Sequence
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from supermega_runtime.supabase_auth import (
    SupabaseAuthConfig,
    SupabaseAuthUnavailable,
    VerifiedSupabaseUser,
    is_supabase_publishable_key,
    verify_supabase_user_identity,
)
from supermega_runtime.managed_activation import (
    ManagedActivationError,
    compile_activation_plan,
    compile_multi_product_activation_plan,
    reviewed_activation_ca_digest,
    validate_managed_trial_request,
)


PLAN_CONTRACT = "supermega.client_owner_identity_plan.v1"
PROOF_CONTRACT = "supermega.client_owner_identity_proof.v1"
MAX_INPUT_BYTES = 64 * 1024
MAX_PLAN_SECONDS = 60 * 60
APP_ORIGIN = "https://app.supermega.dev"
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PROJECT_REF_PATTERN = re.compile(r"^[a-z]{20}$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")
DIGEST_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")


class ClientOwnerIdentityError(ValueError):
    pass


def _canonical_digest(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return f"sha256:{sha256(encoded).hexdigest()}"


def _object_without_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for key, value in pairs:
        if key in output:
            raise ClientOwnerIdentityError("Duplicate JSON object keys are not allowed.")
        output[key] = value
    return output


def _read_regular_file(path_value: str | Path, label: str) -> bytes:
    path = Path(path_value).resolve()
    if path.is_symlink() or not path.is_file():
        raise ClientOwnerIdentityError(f"{label} must be a regular file.")
    raw = path.read_bytes()
    if not raw or len(raw) > MAX_INPUT_BYTES:
        raise ClientOwnerIdentityError(f"{label} size is invalid.")
    return raw


def _read_text(path_value: str | Path, label: str) -> str:
    try:
        value = _read_regular_file(path_value, label).decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise ClientOwnerIdentityError(f"{label} must be UTF-8 text.") from exc
    if not value or "\n" in value or "\r" in value:
        raise ClientOwnerIdentityError(f"{label} must contain exactly one value.")
    return value


def _read_json(path_value: str | Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            _read_regular_file(path_value, label).decode("utf-8"),
            object_pairs_hook=_object_without_duplicate_keys,
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ClientOwnerIdentityError(f"{label} must be UTF-8 JSON.") from exc
    if not isinstance(value, dict):
        raise ClientOwnerIdentityError(f"{label} must be a JSON object.")
    return value


def _write_json(path_value: str | Path, value: Mapping[str, Any]) -> Path:
    path = Path(path_value).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    except FileExistsError as exc:
        raise ClientOwnerIdentityError("Output already exists; choose a new path.") from exc
    return path


def _canonical_uuid(value: object, label: str) -> str:
    candidate = str(value or "").strip().casefold()
    try:
        parsed = UUID(candidate)
    except (ValueError, TypeError, AttributeError) as exc:
        raise ClientOwnerIdentityError(f"{label} must be a canonical UUID.") from exc
    if str(parsed) != candidate:
        raise ClientOwnerIdentityError(f"{label} must be a canonical UUID.")
    return candidate


def _parse_time(value: object, label: str) -> datetime:
    candidate = str(value or "")
    if not candidate.endswith("Z"):
        raise ClientOwnerIdentityError(f"{label} must be a UTC ISO timestamp ending in Z.")
    try:
        parsed = datetime.fromisoformat(candidate[:-1] + "+00:00")
    except ValueError as exc:
        raise ClientOwnerIdentityError(f"{label} must be a valid UTC ISO timestamp.") from exc
    if parsed.tzinfo != timezone.utc or parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z") != candidate:
        raise ClientOwnerIdentityError(f"{label} must use millisecond UTC precision.")
    return parsed


def _normalized_email(value: str) -> str:
    email = value.strip().casefold()
    if len(email) > 254 or not EMAIL_PATTERN.fullmatch(email):
        raise ClientOwnerIdentityError("Owner email is invalid.")
    return email


def _email_digest(email: str) -> str:
    return _canonical_digest({"normalizedEmail": _normalized_email(email)})


def build_owner_identity_plan(
    *,
    project_ref: str,
    release_commit: str,
    workspace_label: str,
    owner_label: str,
    owner_email: str,
    approval_id: str,
    approved_at: str,
    expires_at: str,
) -> dict[str, Any]:
    project_ref = str(project_ref).strip()
    release_commit = str(release_commit).strip().casefold()
    workspace_label = str(workspace_label).strip()
    owner_label = str(owner_label).strip()
    if not PROJECT_REF_PATTERN.fullmatch(project_ref):
        raise ClientOwnerIdentityError("Project reference is invalid.")
    if not COMMIT_PATTERN.fullmatch(release_commit):
        raise ClientOwnerIdentityError("Release commit must be an exact lowercase SHA-1.")
    if not 2 <= len(workspace_label) <= 180 or not 2 <= len(owner_label) <= 180:
        raise ClientOwnerIdentityError("Workspace and owner labels must be named values.")
    approval_id = _canonical_uuid(approval_id, "Approval ID")
    approved = _parse_time(approved_at, "Approved at")
    expires = _parse_time(expires_at, "Expires at")
    lifetime = (expires - approved).total_seconds()
    if lifetime <= 0 or lifetime > MAX_PLAN_SECONDS:
        raise ClientOwnerIdentityError("Identity approval must be positive and expire within one hour.")

    payload: dict[str, Any] = {
        "contract": PLAN_CONTRACT,
        "version": 1,
        "status": "planned_not_sent",
        "operation": "invite_named_owner",
        "target": {
            "projectRef": project_ref,
            "supabaseOrigin": f"https://{project_ref}.supabase.co",
            "applicationOrigin": APP_ORIGIN,
            "accountSetupPath": "/account/setup",
            "releaseCommit": release_commit,
        },
        "client": {
            "workspaceLabelDigest": _canonical_digest({"workspaceLabel": workspace_label}),
            "ownerLabelDigest": _canonical_digest({"ownerLabel": owner_label}),
            "ownerEmailDigest": _email_digest(owner_email),
        },
        "authorization": {
            "approvalId": approval_id,
            "approvedAt": approved_at,
            "expiresAt": expires_at,
        },
        "requiredResult": {
            "namedNonAnonymousUser": True,
            "confirmedEmail": True,
            "freshServerVerifiedSession": True,
            "workspaceMembershipCreated": False,
        },
        "controls": {
            "containsRawEmail": False,
            "containsSecrets": False,
            "serverSideAdminOnly": True,
            "serviceRoleBrowserExposureAllowed": False,
            "authorizationFromUserMetadataAllowed": False,
            "invitationSent": False,
            "authUserCreated": False,
            "workspaceMembershipCreated": False,
            "tenantWritesPerformed": False,
            "providerCallsPerformed": False,
            "deploymentPerformed": False,
        },
    }
    payload["planDigest"] = _canonical_digest(payload)
    return payload


def validate_owner_identity_plan(value: Mapping[str, Any]) -> dict[str, Any]:
    plan = dict(value)
    digest = plan.pop("planDigest", None)
    if not isinstance(digest, str) or not DIGEST_PATTERN.fullmatch(digest) or digest != _canonical_digest(plan):
        raise ClientOwnerIdentityError("Owner identity plan digest is invalid.")
    if plan.get("contract") != PLAN_CONTRACT or plan.get("version") != 1:
        raise ClientOwnerIdentityError("Owner identity plan contract is unsupported.")
    if plan.get("status") != "planned_not_sent" or plan.get("operation") != "invite_named_owner":
        raise ClientOwnerIdentityError("Owner identity plan crossed the invitation boundary.")
    target = plan.get("target")
    client = plan.get("client")
    authorization = plan.get("authorization")
    required = plan.get("requiredResult")
    controls = plan.get("controls")
    if not all(isinstance(item, Mapping) for item in (target, client, authorization, required, controls)):
        raise ClientOwnerIdentityError("Owner identity plan structure is incomplete.")
    project_ref = str(target.get("projectRef", ""))
    if (
        not PROJECT_REF_PATTERN.fullmatch(project_ref)
        or target.get("supabaseOrigin") != f"https://{project_ref}.supabase.co"
        or target.get("applicationOrigin") != APP_ORIGIN
        or target.get("accountSetupPath") != "/account/setup"
        or not COMMIT_PATTERN.fullmatch(str(target.get("releaseCommit", "")))
    ):
        raise ClientOwnerIdentityError("Owner identity target is invalid.")
    if any(not DIGEST_PATTERN.fullmatch(str(client.get(key, ""))) for key in (
        "workspaceLabelDigest", "ownerLabelDigest", "ownerEmailDigest"
    )):
        raise ClientOwnerIdentityError("Owner identity digests are invalid.")
    _canonical_uuid(authorization.get("approvalId"), "Approval ID")
    approved = _parse_time(authorization.get("approvedAt"), "Approved at")
    expires = _parse_time(authorization.get("expiresAt"), "Expires at")
    if not 0 < (expires - approved).total_seconds() <= MAX_PLAN_SECONDS:
        raise ClientOwnerIdentityError("Identity approval lifetime is invalid.")
    if dict(required) != {
        "namedNonAnonymousUser": True,
        "confirmedEmail": True,
        "freshServerVerifiedSession": True,
        "workspaceMembershipCreated": False,
    }:
        raise ClientOwnerIdentityError("Owner identity result requirements are invalid.")
    if dict(controls) != {
        "containsRawEmail": False,
        "containsSecrets": False,
        "serverSideAdminOnly": True,
        "serviceRoleBrowserExposureAllowed": False,
        "authorizationFromUserMetadataAllowed": False,
        "invitationSent": False,
        "authUserCreated": False,
        "workspaceMembershipCreated": False,
        "tenantWritesPerformed": False,
        "providerCallsPerformed": False,
        "deploymentPerformed": False,
    }:
        raise ClientOwnerIdentityError("Owner identity controls are invalid.")
    plan["planDigest"] = digest
    return plan


def require_active_owner_identity_plan(
    value: Mapping[str, Any], *, now: datetime | None = None
) -> dict[str, Any]:
    plan = validate_owner_identity_plan(value)
    current = now or datetime.now(timezone.utc)
    approved = _parse_time(plan["authorization"]["approvedAt"], "Approved at")
    expires = _parse_time(plan["authorization"]["expiresAt"], "Expires at")
    if current < approved or current >= expires:
        raise ClientOwnerIdentityError("Owner identity approval is not currently active.")
    return plan


def build_owner_identity_proof(
    plan: Mapping[str, Any], identity: VerifiedSupabaseUser
) -> dict[str, Any]:
    verified_plan = validate_owner_identity_plan(plan)
    if not identity.email_verified or not identity.email:
        raise ClientOwnerIdentityError("Owner email is not confirmed.")
    if _email_digest(identity.email) != verified_plan["client"]["ownerEmailDigest"]:
        raise ClientOwnerIdentityError("Verified owner email does not match the approved plan.")
    payload: dict[str, Any] = {
        "contract": PROOF_CONTRACT,
        "version": 1,
        "status": "verified_named_owner",
        "sourcePlanDigest": verified_plan["planDigest"],
        "target": verified_plan["target"],
        "identity": {
            "ownerActorId": identity.user_id,
            "ownerEmailDigest": verified_plan["client"]["ownerEmailDigest"],
            "ownerSessionDigest": _canonical_digest({"sessionId": identity.session_id}),
            "namedNonAnonymousUser": True,
            "confirmedEmail": True,
            "freshServerVerifiedSession": True,
        },
        "controls": {
            "containsRawEmail": False,
            "containsAccessToken": False,
            "containsPublishableKey": False,
            "containsServiceRoleKey": False,
            "authorizationFromUserMetadata": False,
            "workspaceMembershipCreated": False,
            "tenantWritesPerformed": False,
            "providerWritesPerformed": False,
            "deploymentPerformed": False,
        },
    }
    payload["proofDigest"] = _canonical_digest(payload)
    return payload


def validate_owner_identity_proof(value: Mapping[str, Any], plan: Mapping[str, Any]) -> dict[str, Any]:
    proof = dict(value)
    digest = proof.pop("proofDigest", None)
    if not isinstance(digest, str) or not DIGEST_PATTERN.fullmatch(digest) or digest != _canonical_digest(proof):
        raise ClientOwnerIdentityError("Owner identity proof digest is invalid.")
    verified_plan = validate_owner_identity_plan(plan)
    if (
        proof.get("contract") != PROOF_CONTRACT
        or proof.get("version") != 1
        or proof.get("status") != "verified_named_owner"
        or proof.get("sourcePlanDigest") != verified_plan["planDigest"]
        or proof.get("target") != verified_plan["target"]
    ):
        raise ClientOwnerIdentityError("Owner identity proof is not bound to the approved plan.")
    identity = proof.get("identity")
    controls = proof.get("controls")
    if not isinstance(identity, Mapping) or not isinstance(controls, Mapping):
        raise ClientOwnerIdentityError("Owner identity proof structure is incomplete.")
    _canonical_uuid(identity.get("ownerActorId"), "Owner actor ID")
    if (
        identity.get("ownerEmailDigest") != verified_plan["client"]["ownerEmailDigest"]
        or not DIGEST_PATTERN.fullmatch(str(identity.get("ownerSessionDigest", "")))
        or identity.get("namedNonAnonymousUser") is not True
        or identity.get("confirmedEmail") is not True
        or identity.get("freshServerVerifiedSession") is not True
        or any(value is not False for value in controls.values())
        or set(controls) != {
            "containsRawEmail", "containsAccessToken", "containsPublishableKey",
            "containsServiceRoleKey", "authorizationFromUserMetadata",
            "workspaceMembershipCreated", "tenantWritesPerformed",
            "providerWritesPerformed", "deploymentPerformed",
        }
    ):
        raise ClientOwnerIdentityError("Owner identity proof controls are invalid.")
    proof["proofDigest"] = digest
    return proof


def compile_proof_bound_activation(
    owner_plan: Mapping[str, Any],
    owner_proof: Mapping[str, Any],
    managed_requests: Sequence[Mapping[str, Any]],
    *,
    workspace_id: str,
    activation_approval_id: str,
    activation_approved_at: str,
    admin_ca_sha256: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Compile one activation without accepting a manually copied Auth UUID.

    The identity invitation approval and the tenant activation approval remain
    separate. The proof supplies identity and target only; product requests
    supply the exact workspace and named-owner labels.
    """

    current = now or datetime.now(timezone.utc)
    verified_owner_plan = require_active_owner_identity_plan(owner_plan, now=current)
    verified_owner_proof = validate_owner_identity_proof(owner_proof, verified_owner_plan)
    if not managed_requests:
        raise ClientOwnerIdentityError("At least one managed product request is required.")
    redacted_requests = [validate_managed_trial_request(request) for request in managed_requests]
    workspace_labels = {str(request["workspaceLabel"]) for request in redacted_requests}
    owner_labels = {str(request["ownerLabel"]) for request in redacted_requests}
    if len(workspace_labels) != 1 or len(owner_labels) != 1:
        raise ClientOwnerIdentityError("Product requests changed the approved client identity.")
    workspace_label = next(iter(workspace_labels))
    owner_label = next(iter(owner_labels))
    if (
        _canonical_digest({"workspaceLabel": workspace_label})
        != verified_owner_plan["client"]["workspaceLabelDigest"]
        or _canonical_digest({"ownerLabel": owner_label})
        != verified_owner_plan["client"]["ownerLabelDigest"]
    ):
        raise ClientOwnerIdentityError("Product requests do not match the approved owner identity plan.")

    compile_arguments = {
        "workspace_id": workspace_id,
        "owner_actor_id": verified_owner_proof["identity"]["ownerActorId"],
        "approval_id": activation_approval_id,
        "approved_by": owner_label,
        "approved_at": activation_approved_at,
        "project_ref": verified_owner_plan["target"]["projectRef"],
        "release_commit": verified_owner_plan["target"]["releaseCommit"],
        "admin_ca_sha256": admin_ca_sha256,
        "now": current,
    }
    return (
        compile_activation_plan(managed_requests[0], **compile_arguments)
        if len(managed_requests) == 1
        else compile_multi_product_activation_plan(managed_requests, **compile_arguments)
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare or verify a named client owner identity.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--project-ref", required=True)
    prepare.add_argument("--release-commit", required=True)
    prepare.add_argument("--workspace-label", required=True)
    prepare.add_argument("--owner-label", required=True)
    prepare.add_argument("--owner-email-file", required=True)
    prepare.add_argument("--approval-id", required=True)
    prepare.add_argument("--approved-at", required=True)
    prepare.add_argument("--expires-at", required=True)
    prepare.add_argument("--output", required=True)
    verify_plan = subparsers.add_parser("verify-plan")
    verify_plan.add_argument("--plan", required=True)
    verify_existing = subparsers.add_parser("verify-existing")
    verify_existing.add_argument("--plan", required=True)
    verify_existing.add_argument("--owner-token-file", required=True)
    verify_existing.add_argument("--publishable-key-file", required=True)
    verify_existing.add_argument("--output", required=True)
    verify_proof = subparsers.add_parser("verify-proof")
    verify_proof.add_argument("--plan", required=True)
    verify_proof.add_argument("--proof", required=True)
    prepare_activation = subparsers.add_parser("prepare-activation")
    prepare_activation.add_argument("--owner-plan", required=True)
    prepare_activation.add_argument("--owner-proof", required=True)
    prepare_activation.add_argument("--request-file", action="append", required=True)
    prepare_activation.add_argument("--workspace-id", required=True)
    prepare_activation.add_argument("--activation-approval-id", required=True)
    prepare_activation.add_argument("--activation-approved-at", required=True)
    prepare_activation.add_argument("--admin-ca-file", required=True)
    prepare_activation.add_argument("--output", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    try:
        if arguments.command == "prepare":
            plan = build_owner_identity_plan(
                project_ref=arguments.project_ref,
                release_commit=arguments.release_commit,
                workspace_label=arguments.workspace_label,
                owner_label=arguments.owner_label,
                owner_email=_read_text(arguments.owner_email_file, "Owner email file"),
                approval_id=arguments.approval_id,
                approved_at=arguments.approved_at,
                expires_at=arguments.expires_at,
            )
            require_active_owner_identity_plan(plan)
            path = _write_json(arguments.output, plan)
            print(json.dumps({"status": plan["status"], "planDigest": plan["planDigest"], "bytes": path.stat().st_size, "externalWritesPerformed": False}))
        elif arguments.command == "verify-plan":
            plan = validate_owner_identity_plan(_read_json(arguments.plan, "Owner identity plan"))
            print(json.dumps({"status": "verified", "planDigest": plan["planDigest"], "externalWritesPerformed": False}))
        elif arguments.command == "verify-existing":
            plan = require_active_owner_identity_plan(_read_json(arguments.plan, "Owner identity plan"))
            publishable_key = _read_text(arguments.publishable_key_file, "Publishable key file")
            if not is_supabase_publishable_key(publishable_key):
                raise ClientOwnerIdentityError("Supabase publishable-key configuration is invalid.")
            config = SupabaseAuthConfig(
                base_url=plan["target"]["supabaseOrigin"],
                publishable_key=publishable_key,
            )
            if not config.ready:
                raise ClientOwnerIdentityError("Supabase publishable-key configuration is invalid.")
            identity = verify_supabase_user_identity(
                _read_text(arguments.owner_token_file, "Owner token file"), config
            )
            if identity is None:
                raise ClientOwnerIdentityError("Owner token is invalid or anonymous.")
            proof = build_owner_identity_proof(plan, identity)
            path = _write_json(arguments.output, proof)
            print(json.dumps({"status": proof["status"], "proofDigest": proof["proofDigest"], "bytes": path.stat().st_size, "externalWritesPerformed": False}))
        elif arguments.command == "verify-proof":
            plan = _read_json(arguments.plan, "Owner identity plan")
            proof = validate_owner_identity_proof(
                _read_json(arguments.proof, "Owner identity proof"), plan
            )
            print(json.dumps({"status": "verified", "proofDigest": proof["proofDigest"], "externalWritesPerformed": False}))
        else:
            owner_plan = _read_json(arguments.owner_plan, "Owner identity plan")
            owner_proof = _read_json(arguments.owner_proof, "Owner identity proof")
            managed_requests = [
                _read_json(path, f"Managed product request {index}")
                for index, path in enumerate(arguments.request_file, start=1)
            ]
            activation = compile_proof_bound_activation(
                owner_plan,
                owner_proof,
                managed_requests,
                workspace_id=arguments.workspace_id,
                activation_approval_id=arguments.activation_approval_id,
                activation_approved_at=arguments.activation_approved_at,
                admin_ca_sha256=reviewed_activation_ca_digest(arguments.admin_ca_file),
            )
            path = _write_json(arguments.output, activation)
            print(json.dumps({
                "status": "prepared_proof_bound_activation",
                "contract": activation["contract"],
                "activationId": activation["activationId"],
                "planDigest": activation["planDigest"],
                "productCount": len(activation.get("products", [activation.get("product")])),
                "bytes": path.stat().st_size,
                "externalWritesPerformed": False,
            }))
        return 0
    except (ClientOwnerIdentityError, ManagedActivationError, SupabaseAuthUnavailable, OSError) as exc:
        print(f"client_owner_identity_error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
