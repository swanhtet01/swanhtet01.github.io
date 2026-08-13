"""Canonical Spa staff review, invitation handoff, and managed access contracts."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5


SPA_STAFF_ACCESS_REVIEW_CONTRACT = "supermega.commerce.spa_staff_access_review.v1"
SPA_STAFF_INVITATION_HANDOFF_CONTRACT = "supermega.managed_spa_staff_invitation_handoff.v1"
SPA_STAFF_INVITATION_AUTHORIZATION_CONTRACT = "supermega.managed_spa_staff_invitation_authorization.v1"
SPA_STAFF_INVITATION_RECEIPT_CONTRACT = "supermega.managed_spa_staff_invitation_receipt.v1"
SPA_STAFF_ACCESS_PLAN_CONTRACT = "supermega.managed_spa_staff_access_plan.v1"
SPA_STAFF_ACCESS_AUTHORIZATION_CONTRACT = "supermega.managed_spa_staff_access_authorization.v1"
SPA_STAFF_ACCESS_RECEIPT_CONTRACT = "supermega.managed_spa_staff_access_receipt.v1"
SPA_STAFF_ACCESS_EVENT_CONTRACT = "supermega.managed_spa_staff_access_event.v1"
SPA_STAFF_ACCESS_REVIEW_TTL = timedelta(minutes=15)
SPA_STAFF_ACCESS_PLAN_TTL = timedelta(hours=1)
SPA_STAFF_INVITATION_REDIRECT_URL = "https://app.supermega.dev/account/setup?mode=invite"

SPA_STAFF_ACCESS_PROFILES: dict[str, dict[str, tuple[str, ...] | str]] = {
    "front-desk": {
        "access": "spa-front-desk",
        "capabilities": ("commerce.spa.front_desk", "commerce.write"),
    },
    "therapist": {
        "access": "spa-therapist",
        "capabilities": ("commerce.spa.therapist", "commerce.write"),
    },
}

_REQUIRED_ACTIVATION_CHECKS = (
    "hosted_auth_ready",
    "invite_redirect_allowlisted",
    "smtp_delivery_ready",
    "auth_user_id_returned",
    "exact_membership_inserted",
    "mobile_sign_in_verified",
    "role_denials_verified",
)
_REVIEW_FORBIDDEN_ACTIONS = (
    "create_auth_user",
    "send_invitation_email",
    "insert_workspace_membership",
    "enter_real_client_data",
)
_PLAN_OPERATIONS = (
    "verify_active_workspace",
    "verify_owner_control_membership",
    "verify_target_supabase_session",
    "insert_exact_staff_membership",
    "append_immutable_staff_access_event",
    "read_back_staff_access_receipt",
)
_PLAN_ACCEPTANCE = (
    "mobile_sign_in_verified",
    "allowed_role_actions_verified",
    "owner_actions_denied",
    "other_staff_role_actions_denied",
    "logout_and_revocation_verified",
)
_PLAN_FORBIDDEN_ACTIONS = (
    "create_auth_user",
    "send_invitation_email",
    "change_owner_membership",
    "grant_owner_capabilities",
    "enter_real_client_data",
    "call_payment_provider",
    "send_customer_message",
)
_INVITATION_PROVIDER_OPERATION = "supabase.auth.admin.inviteUserByEmail"
_INVITATION_REQUIRED_PREFLIGHT = (
    "exact_redirect_allowlist_evidence",
    "custom_smtp_delivery_evidence",
    "server_secret_key_available",
    "invite_email_template_reviewed",
    "existing_user_conflict_checked",
    "owner_provider_call_confirmation",
)
_INVITATION_FOLLOW_UP = (
    "capture_returned_auth_user_id",
    "requery_invited_user",
    "require_fresh_staff_sign_in",
    "compile_identity_bound_membership_plan",
    "verify_mobile_role_boundaries",
)
_INVITATION_FORBIDDEN_ACTIONS = (
    "browser_secret_key",
    "browser_admin_invite",
    "create_user_without_invite",
    "automatic_provider_retry",
    "insert_membership_before_fresh_sign_in",
    "grant_owner_capabilities",
    "enter_real_client_data",
)
_INVITATION_RECEIPT_NEXT_REQUIRED = (
    "fresh_staff_sign_in",
    "verified_user_email_recheck",
    "owner_authorize_exact_membership",
    "apply_idempotent_membership",
    "mobile_allowed_actions_verified",
    "mobile_denied_actions_verified",
)

_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_IDENTIFIER = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$")
_PROJECT_REF = re.compile(r"^[a-z0-9]{20}$")
_RELEASE_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")


class SpaStaffAccessError(ValueError):
    """Raised when a Spa staff review or activation plan is unsafe."""


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":"), sort_keys=True)


def _digest(value: object) -> str:
    return "sha256:" + sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _exact(value: object, keys: Sequence[str], label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != set(keys):
        raise SpaStaffAccessError(f"{label} has an invalid shape.")
    return value


def _visible_text(value: object, label: str, maximum: int) -> str:
    if not isinstance(value, str):
        raise SpaStaffAccessError(f"{label} must be text.")
    text = " ".join(value.strip().split())
    if (
        not text
        or len(text) > maximum
        or any(ord(character) < 32 or ord(character) == 127 for character in text)
        or "<" in text
        or ">" in text
    ):
        raise SpaStaffAccessError(f"{label} is invalid.")
    return text


def _email(value: object) -> str:
    email = str(value or "").strip().casefold()
    if len(email) < 5 or len(email) > 160 or not _EMAIL.fullmatch(email):
        raise SpaStaffAccessError("Staff work email is invalid.")
    return email


def spa_staff_email_digest(value: object) -> str:
    """Return the canonical digest used to bind a reviewed work email."""

    return _digest(_email(value))


def spa_staff_invitation_approval_id(value: object) -> str:
    """Return the one durable owner-authorization ID for a staff invitation."""

    invitation_id = _uuid(value, "Staff invitation ID")
    return str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_INVITATION_AUTHORIZATION_CONTRACT}:{invitation_id}",
    ))


def _uuid(value: object, label: str) -> str:
    candidate = str(value or "").strip().casefold()
    try:
        parsed = UUID(candidate)
    except (ValueError, AttributeError, TypeError) as exc:
        raise SpaStaffAccessError(f"{label} is invalid.") from exc
    if str(parsed) != candidate:
        raise SpaStaffAccessError(f"{label} is invalid.")
    return candidate


def _timestamp(value: object, label: str) -> datetime:
    candidate = str(value or "").strip()
    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SpaStaffAccessError(f"{label} is invalid.") from exc
    if parsed.tzinfo is None:
        raise SpaStaffAccessError(f"{label} must include a timezone.")
    return parsed.astimezone(timezone.utc)


def _timestamp_text(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def compile_spa_staff_access_review(
    *,
    display_name: str,
    email: str,
    role: str,
    workspace_id: str,
    requested_by: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    profile = SPA_STAFF_ACCESS_PROFILES.get(role)
    if profile is None:
        raise SpaStaffAccessError("Spa staff role is invalid.")
    requested_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    review: dict[str, Any] = {
        "contract": SPA_STAFF_ACCESS_REVIEW_CONTRACT,
        "status": "review_only",
        "workspace_id": _visible_text(workspace_id, "Workspace ID", 128),
        "requested_by": _visible_text(requested_by, "Requesting owner", 160),
        "requested_at": _timestamp_text(requested_at),
        "expires_at": _timestamp_text(requested_at + SPA_STAFF_ACCESS_REVIEW_TTL),
        "candidate": {
            "display_name": _visible_text(display_name, "Staff display name", 80),
            "email": _email(email),
            "role": role,
            "access": profile["access"],
            "capabilities": list(profile["capabilities"]),
        },
        "activation": {
            "status": "blocked_until_separate_owner_confirmation",
            "authorization_source": "app_private.workspace_memberships",
            "target_identity_binding": "supabase_user_id_after_invite",
            "required_checks": list(_REQUIRED_ACTIVATION_CHECKS),
            "forbidden_until_confirmed": list(_REVIEW_FORBIDDEN_ACTIONS),
        },
        "invitation_sent": False,
        "auth_user_created": False,
        "membership_written": False,
        "external_writes_performed": False,
        "secret_values_exposed": False,
    }
    review["review_digest"] = _digest(review)
    return validate_spa_staff_access_review(review)


def validate_spa_staff_access_review(
    value: object,
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    review = _exact(
        value,
        (
            "contract", "status", "workspace_id", "requested_by", "requested_at", "expires_at",
            "candidate", "activation", "invitation_sent", "auth_user_created", "membership_written",
            "external_writes_performed", "secret_values_exposed", "review_digest",
        ),
        "Spa staff access review",
    )
    if review["contract"] != SPA_STAFF_ACCESS_REVIEW_CONTRACT or review["status"] != "review_only":
        raise SpaStaffAccessError("Spa staff access review contract is invalid.")
    workspace_id = _visible_text(review["workspace_id"], "Workspace ID", 128)
    requested_by = _visible_text(review["requested_by"], "Requesting owner", 160)
    requested_at = _timestamp(review["requested_at"], "Review request time")
    expires_at = _timestamp(review["expires_at"], "Review expiry time")
    if expires_at - requested_at != SPA_STAFF_ACCESS_REVIEW_TTL:
        raise SpaStaffAccessError("Spa staff access review lifetime is invalid.")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if require_current and (expires_at < current or requested_at > current + timedelta(minutes=5)):
        raise SpaStaffAccessError("Spa staff access review expired or is not current.")
    candidate = _exact(review["candidate"], ("display_name", "email", "role", "access", "capabilities"), "Spa staff candidate")
    _visible_text(candidate["display_name"], "Staff display name", 80)
    normalized_email = _email(candidate["email"])
    if normalized_email != candidate["email"]:
        raise SpaStaffAccessError("Staff work email is not normalized.")
    role = str(candidate["role"])
    profile = SPA_STAFF_ACCESS_PROFILES.get(role)
    if (
        profile is None
        or candidate["access"] != profile["access"]
        or candidate["capabilities"] != list(profile["capabilities"])
    ):
        raise SpaStaffAccessError("Spa staff role boundary is invalid.")
    activation = _exact(
        review["activation"],
        ("status", "authorization_source", "target_identity_binding", "required_checks", "forbidden_until_confirmed"),
        "Spa staff activation boundary",
    )
    if (
        activation["status"] != "blocked_until_separate_owner_confirmation"
        or activation["authorization_source"] != "app_private.workspace_memberships"
        or activation["target_identity_binding"] != "supabase_user_id_after_invite"
        or activation["required_checks"] != list(_REQUIRED_ACTIVATION_CHECKS)
        or activation["forbidden_until_confirmed"] != list(_REVIEW_FORBIDDEN_ACTIONS)
        or any(review[field] is not False for field in (
            "invitation_sent", "auth_user_created", "membership_written", "external_writes_performed", "secret_values_exposed"
        ))
    ):
        raise SpaStaffAccessError("Spa staff no-send boundary changed.")
    review_digest = str(review["review_digest"])
    if not _SHA256.fullmatch(review_digest):
        raise SpaStaffAccessError("Spa staff review digest is invalid.")
    projection = deepcopy(dict(review))
    del projection["review_digest"]
    if _digest(projection) != review_digest:
        raise SpaStaffAccessError("Spa staff review digest does not match its content.")
    result = deepcopy(dict(review))
    result["workspace_id"] = workspace_id
    result["requested_by"] = requested_by
    return result


def compile_spa_staff_invitation_handoff(
    review_value: object,
    *,
    project_ref: str,
    release_commit: str,
    admin_ca_sha256: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Create a privacy-minimal operator handoff without calling Supabase."""

    generated = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    review = validate_spa_staff_access_review(review_value, now=generated, require_current=True)
    owner_actor_id = _uuid(review["requested_by"], "Owner actor ID")
    project = _visible_text(project_ref, "Supabase project ref", 20).lower()
    release = _visible_text(release_commit, "Release commit", 40).lower()
    ca_digest = _visible_text(admin_ca_sha256, "Administrative CA digest", 71).lower()
    if not _PROJECT_REF.fullmatch(project) or not _RELEASE_COMMIT.fullmatch(release) or not _SHA256.fullmatch(ca_digest):
        raise SpaStaffAccessError("Spa staff invitation target is invalid.")
    review_expires = _timestamp(review["expires_at"], "Review expiry time")
    email_digest = spa_staff_email_digest(review["candidate"]["email"])
    invitation_id = str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_INVITATION_HANDOFF_CONTRACT}:{review['workspace_id']}:{email_digest}",
    ))
    role = review["candidate"]["role"]
    profile = SPA_STAFF_ACCESS_PROFILES[role]
    handoff: dict[str, Any] = {
        "contract": SPA_STAFF_INVITATION_HANDOFF_CONTRACT,
        "version": 1,
        "status": "operator_preflight_required",
        "invitationId": invitation_id,
        "createdAt": _timestamp_text(generated),
        "expiresAt": _timestamp_text(review_expires),
        "sourceReviewDigest": review["review_digest"],
        "workspaceId": review["workspace_id"],
        "ownerActorId": owner_actor_id,
        "candidate": {
            "displayNameDigest": _digest(review["candidate"]["display_name"]),
            "emailDigest": email_digest,
            "role": role,
            "access": profile["access"],
            "capabilities": list(profile["capabilities"]),
        },
        "ownerReview": {
            "requestedAt": review["requested_at"],
            "expiresAt": review["expires_at"],
        },
        "target": {
            "provider": "supabase",
            "projectRef": project,
            "releaseCommit": release,
            "adminCaSha256": ca_digest,
            "schemaVersion": 10,
            "redirectTo": SPA_STAFF_INVITATION_REDIRECT_URL,
        },
        "providerOperation": _INVITATION_PROVIDER_OPERATION,
        "requiredPreflight": list(_INVITATION_REQUIRED_PREFLIGHT),
        "followUp": list(_INVITATION_FOLLOW_UP),
        "forbiddenActions": list(_INVITATION_FORBIDDEN_ACTIONS),
        "providerRequestAuthorized": False,
        "invitationSent": False,
        "authUserCreated": False,
        "membershipWritten": False,
        "secretValuesExposed": False,
        "externalProviderRequestsPerformed": False,
    }
    handoff["handoffDigest"] = _digest(handoff)
    return validate_spa_staff_invitation_handoff(handoff, now=generated)


def validate_spa_staff_invitation_handoff(
    value: object,
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    handoff = _exact(
        value,
        (
            "contract", "version", "status", "invitationId", "createdAt", "expiresAt",
            "sourceReviewDigest", "workspaceId", "ownerActorId", "candidate", "ownerReview",
            "target", "providerOperation", "requiredPreflight", "followUp", "forbiddenActions",
            "providerRequestAuthorized", "invitationSent", "authUserCreated", "membershipWritten", "secretValuesExposed",
            "externalProviderRequestsPerformed", "handoffDigest",
        ),
        "Spa staff invitation handoff",
    )
    if (
        handoff["contract"] != SPA_STAFF_INVITATION_HANDOFF_CONTRACT
        or handoff["version"] != 1
        or handoff["status"] != "operator_preflight_required"
    ):
        raise SpaStaffAccessError("Spa staff invitation handoff contract is invalid.")
    invitation_id = _uuid(handoff["invitationId"], "Staff invitation ID")
    created = _timestamp(handoff["createdAt"], "Staff invitation handoff creation time")
    expires = _timestamp(handoff["expiresAt"], "Staff invitation handoff expiry time")
    if expires < created or expires - created > SPA_STAFF_ACCESS_REVIEW_TTL:
        raise SpaStaffAccessError("Spa staff invitation handoff lifetime is invalid.")
    current = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if require_current and (expires < current or created > current + timedelta(minutes=5)):
        raise SpaStaffAccessError("Spa staff invitation handoff expired or is not current.")
    source_digest = str(handoff["sourceReviewDigest"])
    handoff_digest = str(handoff["handoffDigest"])
    if not _SHA256.fullmatch(source_digest) or not _SHA256.fullmatch(handoff_digest):
        raise SpaStaffAccessError("Spa staff invitation handoff digest is invalid.")
    workspace_id = _visible_text(handoff["workspaceId"], "Workspace ID", 128)
    if not _IDENTIFIER.fullmatch(workspace_id):
        raise SpaStaffAccessError("Workspace ID is invalid for a staff invitation.")
    owner_actor_id = _uuid(handoff["ownerActorId"], "Owner actor ID")
    candidate = _exact(
        handoff["candidate"],
        ("displayNameDigest", "emailDigest", "role", "access", "capabilities"),
        "Spa staff invitation candidate",
    )
    role = str(candidate["role"])
    profile = SPA_STAFF_ACCESS_PROFILES.get(role)
    if (
        not isinstance(candidate["displayNameDigest"], str)
        or not _SHA256.fullmatch(candidate["displayNameDigest"])
        or not isinstance(candidate["emailDigest"], str)
        or not _SHA256.fullmatch(candidate["emailDigest"])
        or profile is None
        or candidate["access"] != profile["access"]
        or candidate["capabilities"] != list(profile["capabilities"])
    ):
        raise SpaStaffAccessError("Spa staff invitation candidate boundary is invalid.")
    owner_review = _exact(handoff["ownerReview"], ("requestedAt", "expiresAt"), "Spa staff owner review")
    review_requested = _timestamp(owner_review["requestedAt"], "Owner review request time")
    review_expires = _timestamp(owner_review["expiresAt"], "Owner review expiry time")
    if (
        review_expires - review_requested != SPA_STAFF_ACCESS_REVIEW_TTL
        or created < review_requested
        or expires != review_expires
    ):
        raise SpaStaffAccessError("Spa staff invitation owner-review boundary is invalid.")
    target = _exact(
        handoff["target"],
        ("provider", "projectRef", "releaseCommit", "adminCaSha256", "schemaVersion", "redirectTo"),
        "Spa staff invitation target",
    )
    if (
        target["provider"] != "supabase"
        or not isinstance(target["projectRef"], str) or not _PROJECT_REF.fullmatch(target["projectRef"])
        or not isinstance(target["releaseCommit"], str) or not _RELEASE_COMMIT.fullmatch(target["releaseCommit"])
        or not isinstance(target["adminCaSha256"], str) or not _SHA256.fullmatch(target["adminCaSha256"])
        or target["schemaVersion"] != 10
        or target["redirectTo"] != SPA_STAFF_INVITATION_REDIRECT_URL
    ):
        raise SpaStaffAccessError("Spa staff invitation target changed.")
    if (
        handoff["providerOperation"] != _INVITATION_PROVIDER_OPERATION
        or handoff["requiredPreflight"] != list(_INVITATION_REQUIRED_PREFLIGHT)
        or handoff["followUp"] != list(_INVITATION_FOLLOW_UP)
        or handoff["forbiddenActions"] != list(_INVITATION_FORBIDDEN_ACTIONS)
        or any(handoff[field] is not False for field in (
            "providerRequestAuthorized", "invitationSent", "authUserCreated", "membershipWritten", "secretValuesExposed",
            "externalProviderRequestsPerformed",
        ))
    ):
        raise SpaStaffAccessError("Spa staff invitation no-send boundary changed.")
    projection = deepcopy(dict(handoff))
    del projection["handoffDigest"]
    if _digest(projection) != handoff_digest:
        raise SpaStaffAccessError("Spa staff invitation handoff digest does not match its content.")
    expected_id = str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_INVITATION_HANDOFF_CONTRACT}:{workspace_id}:{candidate['emailDigest']}",
    ))
    if invitation_id != expected_id or owner_actor_id != handoff["ownerActorId"]:
        raise SpaStaffAccessError("Spa staff invitation identity is invalid.")
    return deepcopy(dict(handoff))


def record_spa_staff_invitation_result(
    handoff_value: object,
    *,
    provider_user_id: str,
    provider_user_email: str,
    provider_user_created_at: str,
    provider_response_digest: str,
    redirect_allowlist_evidence_digest: str,
    smtp_delivery_evidence_digest: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Record a sanitized provider result; this function performs no provider call."""

    recorded = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    handoff = validate_spa_staff_invitation_handoff(handoff_value, now=recorded, require_current=True)
    actor_id = _uuid(provider_user_id, "Invited Supabase user ID")
    email_digest = spa_staff_email_digest(provider_user_email)
    if email_digest != handoff["candidate"]["emailDigest"]:
        raise SpaStaffAccessError("Invited Supabase email does not match the reviewed staff email.")
    provider_created = _timestamp(provider_user_created_at, "Invited Supabase user creation time")
    handoff_created = _timestamp(handoff["createdAt"], "Staff invitation handoff creation time")
    handoff_expires = _timestamp(handoff["expiresAt"], "Staff invitation handoff expiry time")
    if provider_created < handoff_created or provider_created > handoff_expires or provider_created > recorded + timedelta(minutes=5):
        raise SpaStaffAccessError("Invited Supabase user was created outside the reviewed handoff window.")
    evidence_digests = (
        provider_response_digest,
        redirect_allowlist_evidence_digest,
        smtp_delivery_evidence_digest,
    )
    if any(not isinstance(value, str) or not _SHA256.fullmatch(value) for value in evidence_digests):
        raise SpaStaffAccessError("Spa staff invitation provider evidence is invalid.")
    receipt_id = str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_INVITATION_RECEIPT_CONTRACT}:{handoff['invitationId']}:{actor_id}:{provider_response_digest}",
    ))
    receipt: dict[str, Any] = {
        "contract": SPA_STAFF_INVITATION_RECEIPT_CONTRACT,
        "version": 1,
        "status": "invited_pending_first_sign_in",
        "receiptId": receipt_id,
        "recordedAt": _timestamp_text(recorded),
        "invitationId": handoff["invitationId"],
        "handoffDigest": handoff["handoffDigest"],
        "sourceReviewDigest": handoff["sourceReviewDigest"],
        "workspaceId": handoff["workspaceId"],
        "ownerActorId": handoff["ownerActorId"],
        "identity": {
            "provider": "supabase",
            "actorId": actor_id,
            "emailDigest": email_digest,
            "anonymous": False,
        },
        "role": handoff["candidate"]["role"],
        "access": handoff["candidate"]["access"],
        "capabilities": handoff["candidate"]["capabilities"],
        "providerEvidence": {
            "operation": _INVITATION_PROVIDER_OPERATION,
            "userCreatedAt": _timestamp_text(provider_created),
            "responseDigest": provider_response_digest,
            "redirectTo": SPA_STAFF_INVITATION_REDIRECT_URL,
            "redirectAllowlistEvidenceDigest": redirect_allowlist_evidence_digest,
            "smtpDeliveryEvidenceDigest": smtp_delivery_evidence_digest,
            "authority": "supabase_auth_admin_response",
            "verification": "requery_before_membership",
        },
        "nextRequired": list(_INVITATION_RECEIPT_NEXT_REQUIRED),
        "invitationSent": True,
        "authUserCreated": True,
        "emailDeliveryVerified": False,
        "inviteAcceptedByUser": False,
        "membershipWritten": False,
        "secretValuesExposed": False,
        "externalProviderRequestsPerformed": True,
    }
    receipt["receiptDigest"] = _digest(receipt)
    return validate_spa_staff_invitation_receipt(receipt, handoff_value=handoff)


def validate_spa_staff_invitation_receipt(
    value: object,
    *,
    handoff_value: object | None = None,
) -> dict[str, Any]:
    receipt = _exact(
        value,
        (
            "contract", "version", "status", "receiptId", "recordedAt", "invitationId",
            "handoffDigest", "sourceReviewDigest", "workspaceId", "ownerActorId", "identity",
            "role", "access", "capabilities", "providerEvidence", "nextRequired",
            "invitationSent", "authUserCreated", "emailDeliveryVerified", "inviteAcceptedByUser",
            "membershipWritten", "secretValuesExposed",
            "externalProviderRequestsPerformed", "receiptDigest",
        ),
        "Spa staff invitation receipt",
    )
    if (
        receipt["contract"] != SPA_STAFF_INVITATION_RECEIPT_CONTRACT
        or receipt["version"] != 1
        or receipt["status"] != "invited_pending_first_sign_in"
    ):
        raise SpaStaffAccessError("Spa staff invitation receipt contract is invalid.")
    receipt_id = _uuid(receipt["receiptId"], "Staff invitation receipt ID")
    _timestamp(receipt["recordedAt"], "Staff invitation receipt time")
    invitation_id = _uuid(receipt["invitationId"], "Staff invitation ID")
    owner_actor_id = _uuid(receipt["ownerActorId"], "Owner actor ID")
    workspace_id = _visible_text(receipt["workspaceId"], "Workspace ID", 128)
    if not _IDENTIFIER.fullmatch(workspace_id):
        raise SpaStaffAccessError("Workspace ID is invalid for a staff invitation receipt.")
    for field in ("handoffDigest", "sourceReviewDigest", "receiptDigest"):
        if not isinstance(receipt[field], str) or not _SHA256.fullmatch(receipt[field]):
            raise SpaStaffAccessError("Spa staff invitation receipt digest is invalid.")
    identity = _exact(receipt["identity"], ("provider", "actorId", "emailDigest", "anonymous"), "Invited staff identity")
    actor_id = _uuid(identity["actorId"], "Invited staff actor ID")
    if (
        identity["provider"] != "supabase"
        or not isinstance(identity["emailDigest"], str)
        or not _SHA256.fullmatch(identity["emailDigest"])
        or identity["anonymous"] is not False
        or actor_id == owner_actor_id
    ):
        raise SpaStaffAccessError("Invited staff identity boundary is invalid.")
    role = str(receipt["role"])
    profile = SPA_STAFF_ACCESS_PROFILES.get(role)
    if profile is None or receipt["access"] != profile["access"] or receipt["capabilities"] != list(profile["capabilities"]):
        raise SpaStaffAccessError("Invited staff role boundary is invalid.")
    provider = _exact(
        receipt["providerEvidence"],
        (
            "operation", "userCreatedAt", "responseDigest", "redirectTo",
            "redirectAllowlistEvidenceDigest", "smtpDeliveryEvidenceDigest", "authority", "verification",
        ),
        "Spa staff invitation provider evidence",
    )
    provider_created = _timestamp(provider["userCreatedAt"], "Invited Supabase user creation time")
    if (
        provider["operation"] != _INVITATION_PROVIDER_OPERATION
        or provider["redirectTo"] != SPA_STAFF_INVITATION_REDIRECT_URL
        or provider["authority"] != "supabase_auth_admin_response"
        or provider["verification"] != "requery_before_membership"
        or any(
            not isinstance(provider[field], str) or not _SHA256.fullmatch(provider[field])
            for field in ("responseDigest", "redirectAllowlistEvidenceDigest", "smtpDeliveryEvidenceDigest")
        )
        or receipt["nextRequired"] != list(_INVITATION_RECEIPT_NEXT_REQUIRED)
        or receipt["invitationSent"] is not True
        or receipt["authUserCreated"] is not True
        or receipt["emailDeliveryVerified"] is not False
        or receipt["inviteAcceptedByUser"] is not False
        or receipt["membershipWritten"] is not False
        or receipt["secretValuesExposed"] is not False
        or receipt["externalProviderRequestsPerformed"] is not True
    ):
        raise SpaStaffAccessError("Spa staff invitation receipt boundary changed.")
    projection = deepcopy(dict(receipt))
    receipt_digest = str(projection.pop("receiptDigest"))
    if _digest(projection) != receipt_digest:
        raise SpaStaffAccessError("Spa staff invitation receipt digest does not match its content.")
    expected_receipt_id = str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_INVITATION_RECEIPT_CONTRACT}:{invitation_id}:{actor_id}:{provider['responseDigest']}",
    ))
    if receipt_id != expected_receipt_id:
        raise SpaStaffAccessError("Spa staff invitation receipt identity is invalid.")
    if handoff_value is not None:
        handoff = validate_spa_staff_invitation_handoff(handoff_value)
        handoff_created = _timestamp(handoff["createdAt"], "Staff invitation handoff creation time")
        handoff_expires = _timestamp(handoff["expiresAt"], "Staff invitation handoff expiry time")
        if (
            invitation_id != handoff["invitationId"]
            or receipt["handoffDigest"] != handoff["handoffDigest"]
            or receipt["sourceReviewDigest"] != handoff["sourceReviewDigest"]
            or workspace_id != handoff["workspaceId"]
            or owner_actor_id != handoff["ownerActorId"]
            or identity["emailDigest"] != handoff["candidate"]["emailDigest"]
            or role != handoff["candidate"]["role"]
            or receipt["access"] != handoff["candidate"]["access"]
            or receipt["capabilities"] != handoff["candidate"]["capabilities"]
            or provider["redirectTo"] != handoff["target"]["redirectTo"]
            or provider_created < handoff_created
            or provider_created > handoff_expires
        ):
            raise SpaStaffAccessError("Spa staff invitation receipt does not match its handoff.")
    return deepcopy(dict(receipt))


def compile_spa_staff_access_plan(
    review_value: object,
    *,
    verified_staff_actor_id: str,
    verified_staff_email: str,
    approval_id: str,
    approved_at: str,
    project_ref: str,
    release_commit: str,
    admin_ca_sha256: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    generated = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    review = validate_spa_staff_access_review(review_value, now=generated, require_current=True)
    owner_actor_id = _uuid(review["requested_by"], "Owner actor ID")
    staff_actor_id = _uuid(verified_staff_actor_id, "Verified staff actor ID")
    if owner_actor_id == staff_actor_id:
        raise SpaStaffAccessError("A Spa owner cannot activate their own account as staff.")
    staff_email = _email(verified_staff_email)
    if staff_email != review["candidate"]["email"]:
        raise SpaStaffAccessError("Verified Supabase email does not match the reviewed staff email.")
    approval = _uuid(approval_id, "Staff access approval ID")
    approved = _timestamp(approved_at, "Staff access approval time")
    requested = _timestamp(review["requested_at"], "Review request time")
    expires = _timestamp(review["expires_at"], "Review expiry time")
    if approved < requested or approved > expires or approved > generated + timedelta(minutes=5):
        raise SpaStaffAccessError("Staff access approval is outside the reviewed window.")
    project = _visible_text(project_ref, "Supabase project ref", 20).lower()
    release = _visible_text(release_commit, "Release commit", 40).lower()
    ca_digest = _visible_text(admin_ca_sha256, "Administrative CA digest", 71).lower()
    if not _PROJECT_REF.fullmatch(project) or not _RELEASE_COMMIT.fullmatch(release) or not _SHA256.fullmatch(ca_digest):
        raise SpaStaffAccessError("Staff access target is invalid.")
    role = review["candidate"]["role"]
    profile = SPA_STAFF_ACCESS_PROFILES[role]
    staff_access_id = str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_ACCESS_PLAN_CONTRACT}:{review['workspace_id']}:{staff_actor_id}:{review['review_digest']}",
    ))
    plan: dict[str, Any] = {
        "contract": SPA_STAFF_ACCESS_PLAN_CONTRACT,
        "version": 1,
        "staffAccessId": staff_access_id,
        "createdAt": _timestamp_text(generated),
        "expiresAt": _timestamp_text(generated + SPA_STAFF_ACCESS_PLAN_TTL),
        "sourceReviewDigest": review["review_digest"],
        "workspaceId": review["workspace_id"],
        "ownerActorId": owner_actor_id,
        "identity": {
            "provider": "supabase",
            "actorId": staff_actor_id,
            "displayNameDigest": _digest(review["candidate"]["display_name"]),
            "emailDigest": spa_staff_email_digest(staff_email),
            "anonymous": False,
        },
        "role": role,
        "access": profile["access"],
        "capabilities": list(profile["capabilities"]),
        "approval": {
            "approvalId": approval,
            "approvedByActorId": owner_actor_id,
            "approvedAt": _timestamp_text(approved),
        },
        "target": {
            "projectRef": project,
            "releaseCommit": release,
            "adminCaSha256": ca_digest,
            "schemaVersion": 10,
        },
        "operations": list(_PLAN_OPERATIONS),
        "acceptance": list(_PLAN_ACCEPTANCE),
        "forbiddenActions": list(_PLAN_FORBIDDEN_ACTIONS),
        "secretValuesExposed": False,
        "externalProviderRequestsPerformed": False,
    }
    plan["planDigest"] = _digest(plan)
    return validate_spa_staff_access_plan(plan, now=generated)


def validate_spa_staff_access_plan(
    value: object,
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    plan = _exact(
        value,
        (
            "contract", "version", "staffAccessId", "createdAt", "expiresAt", "sourceReviewDigest",
            "workspaceId", "ownerActorId", "identity", "role", "access", "capabilities", "approval",
            "target", "operations", "acceptance", "forbiddenActions", "secretValuesExposed",
            "externalProviderRequestsPerformed", "planDigest",
        ),
        "Spa staff access plan",
    )
    if plan["contract"] != SPA_STAFF_ACCESS_PLAN_CONTRACT or plan["version"] != 1:
        raise SpaStaffAccessError("Spa staff access plan contract is invalid.")
    staff_access_id = _uuid(plan["staffAccessId"], "Staff access ID")
    created = _timestamp(plan["createdAt"], "Staff access plan creation time")
    expires = _timestamp(plan["expiresAt"], "Staff access plan expiry time")
    if expires - created != SPA_STAFF_ACCESS_PLAN_TTL:
        raise SpaStaffAccessError("Spa staff access plan lifetime is invalid.")
    if require_current and expires < (now or datetime.now(timezone.utc)).astimezone(timezone.utc):
        raise SpaStaffAccessError("Spa staff access plan expired.")
    source_digest = str(plan["sourceReviewDigest"])
    plan_digest = str(plan["planDigest"])
    if not _SHA256.fullmatch(source_digest) or not _SHA256.fullmatch(plan_digest):
        raise SpaStaffAccessError("Spa staff access plan digest is invalid.")
    workspace_id = _visible_text(plan["workspaceId"], "Workspace ID", 128)
    if not _IDENTIFIER.fullmatch(workspace_id):
        raise SpaStaffAccessError("Workspace ID is invalid for managed activation.")
    owner_actor_id = _uuid(plan["ownerActorId"], "Owner actor ID")
    identity = _exact(
        plan["identity"],
        ("provider", "actorId", "displayNameDigest", "emailDigest", "anonymous"),
        "Staff identity",
    )
    staff_actor_id = _uuid(identity["actorId"], "Staff actor ID")
    if (
        owner_actor_id == staff_actor_id
        or identity["provider"] != "supabase"
        or not isinstance(identity["displayNameDigest"], str)
        or not _SHA256.fullmatch(identity["displayNameDigest"])
        or not isinstance(identity["emailDigest"], str)
        or not _SHA256.fullmatch(identity["emailDigest"])
        or identity["anonymous"] is not False
    ):
        raise SpaStaffAccessError("Staff identity boundary is invalid.")
    role = str(plan["role"])
    profile = SPA_STAFF_ACCESS_PROFILES.get(role)
    if profile is None or plan["access"] != profile["access"] or plan["capabilities"] != list(profile["capabilities"]):
        raise SpaStaffAccessError("Spa staff role boundary is invalid.")
    approval = _exact(plan["approval"], ("approvalId", "approvedByActorId", "approvedAt"), "Staff access approval")
    _uuid(approval["approvalId"], "Staff access approval ID")
    if _uuid(approval["approvedByActorId"], "Staff access approver") != owner_actor_id:
        raise SpaStaffAccessError("Staff access approver is not the workspace owner.")
    approved = _timestamp(approval["approvedAt"], "Staff access approval time")
    if approved > created or created - approved > SPA_STAFF_ACCESS_REVIEW_TTL:
        raise SpaStaffAccessError("Staff access approval is outside the current review window.")
    target = _exact(plan["target"], ("projectRef", "releaseCommit", "adminCaSha256", "schemaVersion"), "Staff access target")
    if (
        not isinstance(target["projectRef"], str) or not _PROJECT_REF.fullmatch(target["projectRef"])
        or not isinstance(target["releaseCommit"], str) or not _RELEASE_COMMIT.fullmatch(target["releaseCommit"])
        or not isinstance(target["adminCaSha256"], str) or not _SHA256.fullmatch(target["adminCaSha256"])
        or target["schemaVersion"] != 10
    ):
        raise SpaStaffAccessError("Spa staff access target changed.")
    if (
        plan["operations"] != list(_PLAN_OPERATIONS)
        or plan["acceptance"] != list(_PLAN_ACCEPTANCE)
        or plan["forbiddenActions"] != list(_PLAN_FORBIDDEN_ACTIONS)
        or plan["secretValuesExposed"] is not False
        or plan["externalProviderRequestsPerformed"] is not False
    ):
        raise SpaStaffAccessError("Spa staff activation boundary changed.")
    projection = deepcopy(dict(plan))
    del projection["planDigest"]
    if _digest(projection) != plan_digest:
        raise SpaStaffAccessError("Spa staff access plan digest does not match its content.")
    expected_id = str(uuid5(
        NAMESPACE_URL,
        f"{SPA_STAFF_ACCESS_PLAN_CONTRACT}:{workspace_id}:{staff_actor_id}:{source_digest}",
    ))
    if staff_access_id != expected_id:
        raise SpaStaffAccessError("Spa staff access identity is invalid.")
    return deepcopy(dict(plan))


__all__ = [
    "SPA_STAFF_ACCESS_AUTHORIZATION_CONTRACT",
    "SPA_STAFF_ACCESS_EVENT_CONTRACT",
    "SPA_STAFF_ACCESS_PLAN_CONTRACT",
    "SPA_STAFF_ACCESS_PROFILES",
    "SPA_STAFF_ACCESS_RECEIPT_CONTRACT",
    "SPA_STAFF_ACCESS_REVIEW_CONTRACT",
    "SPA_STAFF_INVITATION_AUTHORIZATION_CONTRACT",
    "SPA_STAFF_INVITATION_HANDOFF_CONTRACT",
    "SPA_STAFF_INVITATION_RECEIPT_CONTRACT",
    "SPA_STAFF_INVITATION_REDIRECT_URL",
    "SpaStaffAccessError",
    "compile_spa_staff_access_plan",
    "compile_spa_staff_access_review",
    "compile_spa_staff_invitation_handoff",
    "record_spa_staff_invitation_result",
    "spa_staff_email_digest",
    "spa_staff_invitation_approval_id",
    "validate_spa_staff_access_plan",
    "validate_spa_staff_access_review",
    "validate_spa_staff_invitation_handoff",
    "validate_spa_staff_invitation_receipt",
]
