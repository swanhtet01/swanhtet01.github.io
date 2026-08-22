"""Owner-authorized staff access for one already-active managed workspace."""

from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import subprocess
import sys
from typing import Any, Mapping, Sequence
from uuid import NAMESPACE_URL, UUID, uuid5

from supermega_runtime.managed_activation import (
    ManagedActivationConflict,
    ManagedActivationError,
    ManagedWorkspaceProvisioner,
    _canonical_json,
    _digest,
    _exact,
    _identifier,
    _production_project_ref,
    _projection_digest,
    _read_database_url,
    _read_json,
    _read_secret_file,
    _require_release_checkout,
    _row_value,
    _timestamp,
    _timestamp_text,
    _uuid,
    _validate_admin_target,
    _validate_supported_activation_plan,
    _visible_text,
    _write_json,
    _write_receipt,
)


STAFF_ACCESS_PLAN_CONTRACT = "supermega.workspace_staff_access_plan.v1"
STAFF_ACCESS_AUTHORIZATION_CONTRACT = "supermega.workspace_staff_access_authorization.v1"
STAFF_ACCESS_RECEIPT_CONTRACT = "supermega.workspace_staff_access_receipt.v1"
STAFF_ACCESS_EVENT_CONTRACT = "supermega.workspace_staff_access_event.v1"
STAFF_ACCESS_REVOCATION_RECEIPT_CONTRACT = "supermega.workspace_staff_access_revocation_receipt.v1"
_ROLES = ("product-viewer", "product-operator", "workspace-manager")
_PRODUCT_SURFACES = {
    "shop": "commerce",
    "ecommerce": "commerce",
    "plant": "production",
    "website": "website",
}


class ManagedStaffAccessError(ManagedActivationError):
    pass


def _activation_products(activation: Mapping[str, Any]) -> list[str]:
    products = activation.get("products")
    if products is None:
        products = [activation.get("product")]
    if (
        not isinstance(products, list)
        or not products
        or any(product not in _PRODUCT_SURFACES for product in products)
    ):
        raise ManagedStaffAccessError("Staff access requires supported activated products.")
    return [str(product) for product in products]


def _role_capabilities(activation: Mapping[str, Any], role_id: str) -> list[str]:
    if role_id not in _ROLES:
        raise ManagedStaffAccessError("Staff role is unsupported.")
    owner_capabilities = set(activation["ownerCapabilities"])
    surfaces = {_PRODUCT_SURFACES[product] for product in _activation_products(activation)}
    capabilities = {
        f"{surface}.read"
        for surface in surfaces
        if f"{surface}.read" in owner_capabilities
    }
    if "company.read" in owner_capabilities:
        capabilities.add("company.read")
    if role_id in {"product-operator", "workspace-manager"}:
        capabilities.update(
            f"{surface}.write"
            for surface in surfaces
            if f"{surface}.write" in owner_capabilities
        )
        if "approvals.request" in owner_capabilities:
            capabilities.add("approvals.request")
    if role_id == "workspace-manager":
        for capability in ("company.read", "approvals.read"):
            if capability in owner_capabilities:
                capabilities.add(capability)
    if not capabilities or not capabilities.issubset(owner_capabilities):
        raise ManagedStaffAccessError("Staff capabilities exceed the activated owner boundary.")
    forbidden_owner_authority = {
        "company.write",
        "company.baseline.approve",
        "company.control.approve",
        "approvals.decide",
        "setup.write",
    }
    if capabilities & forbidden_owner_authority:
        raise ManagedStaffAccessError("Staff role inherited owner-only authority.")
    return sorted(capabilities)


def compile_staff_access_plan(
    activation_plan: Mapping[str, Any],
    *,
    member_actor_id: str,
    member_label: str,
    role_id: str,
    approval_id: str,
    approved_at: str,
    expires_at: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    # The activation plan is immutable release evidence. Its original execution
    # window may be expired for a long-lived active tenant; durable PostgreSQL
    # access state is rechecked before authorization and application instead.
    activation = _validate_supported_activation_plan(activation_plan, now=now)
    owner_actor_id = _uuid(activation["ownerActorId"], "Staff access owner actor ID")
    member_id = _uuid(member_actor_id, "Staff member actor ID")
    if member_id == owner_actor_id:
        raise ManagedStaffAccessError("The workspace owner already has owner access.")
    member_name = _visible_text(member_label, "Staff member label", 120)
    role = _identifier(role_id, "Staff role", 60)
    capabilities = _role_capabilities(activation, role)
    approval = _uuid(approval_id, "Staff access approval ID")
    approved = _timestamp(approved_at, "Staff access approval time")
    expires = _timestamp(expires_at, "Staff access expiry")
    clock = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if approved > clock + timedelta(minutes=5) or approved < clock - timedelta(days=1):
        raise ManagedStaffAccessError("Staff access approval time is outside the review window.")
    if expires <= approved or expires > approved + timedelta(days=7):
        raise ManagedStaffAccessError("Staff access plan must expire within seven days of approval.")
    capability_digest = _digest(capabilities)
    grant_id = str(uuid5(
        NAMESPACE_URL,
        f"{STAFF_ACCESS_PLAN_CONTRACT}:{activation['workspaceId']}:{member_id}:{role}:{approval}:{capability_digest}",
    ))
    payload: dict[str, Any] = {
        "contract": STAFF_ACCESS_PLAN_CONTRACT,
        "version": 1,
        "grantId": grant_id,
        "activationId": activation["activationId"],
        "activationPlanDigest": activation["planDigest"],
        "workspaceId": activation["workspaceId"],
        "workspaceLabel": activation["workspaceLabel"],
        "ownerActorId": owner_actor_id,
        "memberActorId": member_id,
        "memberLabel": member_name,
        "roleId": role,
        "products": _activation_products(activation),
        "capabilities": capabilities,
        "approval": {
            "approvalId": approval,
            "approvedByActorId": owner_actor_id,
            "approvedAt": _timestamp_text(approved),
        },
        "expiresAt": _timestamp_text(expires),
        "operations": [
            "verify_existing_supabase_auth_user",
            "insert_tenant_membership",
            "record_immutable_staff_access_event",
        ],
        "forbiddenActions": [
            "create_auth_user",
            "send_invitation_email",
            "grant_owner_authority",
            "grant_unpurchased_product",
            "change_workspace_owner",
            "deploy_release",
        ],
        "secretValuesExposed": False,
    }
    payload["planDigest"] = _digest(payload)
    return payload


def validate_staff_access_plan(
    value: object,
    activation_plan: Mapping[str, Any],
    *,
    now: datetime | None = None,
    require_current: bool = False,
) -> dict[str, Any]:
    plan = _exact(
        value,
        (
            "contract", "version", "grantId", "activationId", "activationPlanDigest",
            "workspaceId", "workspaceLabel", "ownerActorId", "memberActorId",
            "memberLabel", "roleId", "products", "capabilities", "approval",
            "expiresAt", "operations", "forbiddenActions", "secretValuesExposed",
            "planDigest",
        ),
        "Staff access plan",
    )
    activation = _validate_supported_activation_plan(activation_plan, now=now)
    if plan["contract"] != STAFF_ACCESS_PLAN_CONTRACT or plan["version"] != 1:
        raise ManagedStaffAccessError("Staff access plan contract is invalid.")
    expected = compile_staff_access_plan(
        activation,
        member_actor_id=plan["memberActorId"],
        member_label=plan["memberLabel"],
        role_id=plan["roleId"],
        approval_id=plan["approval"]["approvalId"],
        approved_at=plan["approval"]["approvedAt"],
        expires_at=plan["expiresAt"],
        now=_timestamp(plan["approval"]["approvedAt"], "Staff access approval time"),
    )
    if dict(plan) != expected:
        raise ManagedStaffAccessError("Staff access plan is stale or altered.")
    if (
        plan["activationId"] != activation["activationId"]
        or plan["activationPlanDigest"] != activation["planDigest"]
        or plan["workspaceId"] != activation["workspaceId"]
        or plan["ownerActorId"] != activation["ownerActorId"]
    ):
        raise ManagedStaffAccessError("Staff access changed the activated tenant boundary.")
    if require_current and _timestamp(plan["expiresAt"], "Staff access expiry") < (
        now or datetime.now(timezone.utc)
    ).astimezone(timezone.utc):
        raise ManagedStaffAccessError("Staff access plan has expired.")
    return deepcopy(dict(plan))


class ManagedStaffAccessProvisioner(ManagedWorkspaceProvisioner):
    """Grant and revoke bounded staff membership through the reviewed admin path."""

    @staticmethod
    def _authorization_projection(plan: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "contract": "decision_packet.v1",
            "subject": {"kind": "workspace_staff_access", "id": plan["grantId"], "version": 1},
            "decision": f"Grant {plan['memberLabel']} the {plan['roleId']} role in {plan['workspaceLabel']}.",
            "claims": [
                {
                    "id": "tenant-and-release-bound",
                    "claim_type": "fact",
                    "statement": "The staff grant is bound to the exact active tenant activation plan.",
                    "source_reference": plan["activationPlanDigest"],
                    "captured_at": plan["approval"]["approvedAt"],
                    "status": "verified",
                    "uncertainty": "low",
                    "visibility": "private",
                    "digest": plan["activationPlanDigest"],
                },
                {
                    "id": "least-privilege-role-derived",
                    "claim_type": "fact",
                    "statement": "Capabilities are derived from the selected non-owner role and activated products.",
                    "source_reference": plan["planDigest"],
                    "captured_at": plan["approval"]["approvedAt"],
                    "status": "verified",
                    "uncertainty": "low",
                    "visibility": "private",
                    "digest": plan["planDigest"],
                },
            ],
            "baseline": "The named Auth user has no membership in this workspace.",
            "target": "Create one tenant-bound staff membership with derived capabilities.",
            "result": "The owner authorized the exact staff access plan.",
            "acceptance": "Verify the Auth user exists, insert one membership, and retain an immutable event.",
            "artifact_reference": f"managed-staff-access://{plan['workspaceId']}/{plan['grantId']}",
        }

    @classmethod
    def _authorization_row(cls, cursor: Any, plan: Mapping[str, Any]) -> Any:
        cursor.execute(
            """
            select approval_id, workspace_id, command_id, command_fingerprint,
                   proposal_json, evidence_refs_json, status, requested_by,
                   requested_actor_kind, requested_at, decided_by,
                   decided_actor_kind, decided_at, decision_note,
                   decision_contract_version, version
            from app_private.approval_requests
            where approval_id = %s or (workspace_id = %s and command_id = %s)
            order by (approval_id = %s) desc
            limit 1
            """,
            (
                plan["approval"]["approvalId"],
                plan["workspaceId"],
                plan["grantId"],
                plan["approval"]["approvalId"],
            ),
        )
        return cursor.fetchone()

    @classmethod
    def _authorization_matches(cls, row: Any, plan: Mapping[str, Any]) -> bool:
        if row is None:
            return False
        proposal = _row_value(row, "proposal_json", 4)
        evidence = _row_value(row, "evidence_refs_json", 5)
        if isinstance(proposal, str):
            proposal = json.loads(proposal)
        if isinstance(evidence, str):
            evidence = json.loads(evidence)
        return bool(
            str(_row_value(row, "approval_id", 0)) == plan["approval"]["approvalId"]
            and _row_value(row, "workspace_id", 1) == plan["workspaceId"]
            and str(_row_value(row, "command_id", 2)) == plan["grantId"]
            and _row_value(row, "command_fingerprint", 3) == str(plan["planDigest"])[7:]
            and proposal == cls._authorization_projection(plan)
            and evidence == [plan["activationPlanDigest"], plan["planDigest"]]
            and _row_value(row, "status", 6) == "approved"
            and _row_value(row, "requested_by", 7) == plan["ownerActorId"]
            and _row_value(row, "requested_actor_kind", 8) == "human"
            and _row_value(row, "decided_by", 10) == plan["ownerActorId"]
            and _row_value(row, "decided_actor_kind", 11) == "human"
            and _row_value(row, "decision_contract_version", 14) == 2
            and _row_value(row, "version", 15) == 1
        )

    @staticmethod
    def _member_row(rows: Sequence[Any], plan: Mapping[str, Any]) -> Any:
        matching = [row for row in rows if _row_value(row, "actor_id", 0) == plan["memberActorId"]]
        if len(matching) > 1:
            raise ManagedActivationConflict("Staff member has duplicate workspace memberships.")
        return matching[0] if matching else None

    @staticmethod
    def _member_matches(row: Any, plan: Mapping[str, Any], status: str) -> bool:
        return bool(
            row is not None
            and _row_value(row, "actor_kind", 1) == "human"
            and _row_value(row, "status", 2) == status
            and sorted(_row_value(row, "capabilities", 3) or []) == plan["capabilities"]
        )

    @staticmethod
    def _event_matches(row: Any, plan: Mapping[str, Any], status: str, fingerprint: str) -> bool:
        if row is None:
            return False
        result = _row_value(row, "result_json", 0)
        if isinstance(result, str):
            result = json.loads(result)
        return bool(
            isinstance(result, Mapping)
            and result.get("contract") == STAFF_ACCESS_EVENT_CONTRACT
            and result.get("status") == status
            and result.get("staffAccessPlanDigest") == plan["planDigest"]
            and _row_value(row, "command_fingerprint", 2) == fingerprint
        )

    @staticmethod
    def _receipt(
        plan: Mapping[str, Any],
        created_at: datetime,
        *,
        status: str,
        command_id: str,
        replayed: bool,
    ) -> dict[str, Any]:
        contract = (
            STAFF_ACCESS_RECEIPT_CONTRACT
            if status == "active"
            else STAFF_ACCESS_REVOCATION_RECEIPT_CONTRACT
        )
        receipt: dict[str, Any] = {
            "contract": contract,
            "version": 1,
            "status": status,
            "replayed": replayed,
            "grantId": plan["grantId"],
            "commandId": command_id,
            "staffAccessPlanDigest": plan["planDigest"],
            "workspaceId": plan["workspaceId"],
            "memberActorId": plan["memberActorId"],
            "roleId": plan["roleId"],
            "recordedAt": _timestamp_text(created_at),
            "authority": {
                "system": "postgresql",
                "table": "app_private.workspace_events",
                "commandId": command_id,
                "verification": "requery_required",
            },
            "localProjectionTrusted": False,
            "authUserCreated": False,
            "invitationEmailSent": False,
            "secretValuesExposed": False,
        }
        receipt["projectionDigest"] = _projection_digest(receipt)
        return receipt

    def _assert_active_tenant(
        self,
        cursor: Any,
        plan: Mapping[str, Any],
        activation: Mapping[str, Any],
    ) -> list[Any]:
        access = self._access_row(cursor, plan["workspaceId"])
        rows = self._membership_rows(cursor, plan["workspaceId"])
        if not self._access_matches(access, activation, status="active"):
            raise ManagedActivationConflict("Staff access requires the exact active tenant activation.")
        if not self._matching_membership(rows, activation, status="active"):
            raise ManagedActivationConflict("Staff access requires the exact active owner membership.")
        return rows

    def authorize(
        self,
        plan_value: object,
        activation_plan: Mapping[str, Any],
        *,
        verified_owner_actor_id: str,
        verified_owner_session_id: str,
        decision_note: str,
    ) -> dict[str, Any]:
        plan = validate_staff_access_plan(plan_value, activation_plan, require_current=True)
        activation = _validate_supported_activation_plan(activation_plan)
        owner = _uuid(verified_owner_actor_id, "Verified owner actor ID")
        session = _uuid(verified_owner_session_id, "Verified owner session ID")
        note = _visible_text(decision_note, "Staff access authorization note", 500)
        if owner != plan["ownerActorId"]:
            raise ManagedStaffAccessError("Verified owner does not match the staff access plan.")
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    cursor.execute(
                        "select app_private.supabase_session_is_active(%s::uuid, %s::uuid) as active",
                        (owner, session),
                    )
                    if not bool(_row_value(cursor.fetchone(), "active", 0)):
                        raise ManagedStaffAccessError("Supabase owner session is no longer active.")
                    self._lock(cursor, plan["workspaceId"])
                    rows = self._assert_active_tenant(cursor, plan, activation)
                    authorization = self._authorization_row(cursor, plan)
                    event = self._event_row(cursor, plan["workspaceId"], plan["grantId"])
                    member = self._member_row(rows, plan)
                    if self._authorization_matches(authorization, plan) and member is None and event is None:
                        return {
                            "contract": STAFF_ACCESS_AUTHORIZATION_CONTRACT,
                            "status": "approved",
                            "replayed": True,
                            "grantId": plan["grantId"],
                            "approvalId": plan["approval"]["approvalId"],
                            "planDigest": plan["planDigest"],
                            "secretValuesExposed": False,
                        }
                    if authorization is not None or member is not None or event is not None:
                        raise ManagedActivationConflict("Staff access has conflicting durable state.")
                    cursor.execute(
                        """
                        insert into app_private.approval_requests (
                          approval_id, workspace_id, command_id, command_fingerprint,
                          title, proposal_json, evidence_refs_json, status,
                          requested_by, requested_actor_kind, decided_by,
                          decided_actor_kind, decided_at, decision_note,
                          decision_contract_version, version
                        ) values (
                          %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, 'approved',
                          %s, 'human', %s, 'human', transaction_timestamp(), %s, 2, 1
                        ) returning requested_at, decided_at
                        """,
                        (
                            plan["approval"]["approvalId"],
                            plan["workspaceId"],
                            plan["grantId"],
                            str(plan["planDigest"])[7:],
                            f"Grant {plan['memberLabel']} workspace access",
                            _canonical_json(self._authorization_projection(plan)),
                            _canonical_json([plan["activationPlanDigest"], plan["planDigest"]]),
                            owner,
                            owner,
                            note,
                        ),
                    )
            return {
                "contract": STAFF_ACCESS_AUTHORIZATION_CONTRACT,
                "status": "approved",
                "replayed": False,
                "grantId": plan["grantId"],
                "approvalId": plan["approval"]["approvalId"],
                "planDigest": plan["planDigest"],
                "secretValuesExposed": False,
            }
        finally:
            connection.close()

    def apply(self, plan_value: object, activation_plan: Mapping[str, Any]) -> dict[str, Any]:
        plan = validate_staff_access_plan(plan_value, activation_plan, require_current=True)
        activation = _validate_supported_activation_plan(activation_plan)
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    self._lock(cursor, plan["workspaceId"])
                    rows = self._assert_active_tenant(cursor, plan, activation)
                    authorization = self._authorization_row(cursor, plan)
                    event = self._event_row(cursor, plan["workspaceId"], plan["grantId"])
                    member = self._member_row(rows, plan)
                    if (
                        self._authorization_matches(authorization, plan)
                        and self._member_matches(member, plan, "active")
                        and self._event_matches(event, plan, "active", str(plan["planDigest"])[7:])
                    ):
                        created_at = _row_value(event, "created_at", 1)
                        if not isinstance(created_at, datetime):
                            raise ManagedActivationConflict("Staff access replay timestamp is invalid.")
                        return self._receipt(
                            plan, created_at, status="active", command_id=plan["grantId"], replayed=True
                        )
                    if not self._authorization_matches(authorization, plan):
                        raise ManagedActivationConflict("Durable staff access authorization is missing.")
                    if member is not None or event is not None:
                        raise ManagedActivationConflict("Staff access has conflicting membership or event state.")
                    cursor.execute(
                        """
                        select exists (
                          select 1 from auth.users
                          where id = %s::uuid and is_anonymous is false
                        ) as member_exists
                        """,
                        (plan["memberActorId"],),
                    )
                    if not bool(_row_value(cursor.fetchone(), "member_exists", 0)):
                        raise ManagedStaffAccessError(
                            "Staff member must already be a verified Supabase Auth user; no user or email was created."
                        )
                    cursor.execute(
                        """
                        insert into app_private.workspace_memberships (
                          workspace_id, actor_id, actor_kind, status, capabilities
                        ) values (%s, %s, 'human', 'active', %s)
                        """,
                        (plan["workspaceId"], plan["memberActorId"], plan["capabilities"]),
                    )
                    result = {
                        "contract": STAFF_ACCESS_EVENT_CONTRACT,
                        "status": "active",
                        "staffAccessPlanDigest": plan["planDigest"],
                        "memberActorId": plan["memberActorId"],
                        "roleId": plan["roleId"],
                        "secretValuesExposed": False,
                    }
                    cursor.execute(
                        """
                        insert into app_private.workspace_events (
                          event_id, workspace_id, command_id, command_fingerprint,
                          surface, event_type, actor_id, actor_kind, expected_version,
                          resulting_version, payload_json, result_json
                        ) values (
                          %s, %s, %s, %s, 'company', 'company.staff_access.granted',
                          %s, 'human', null, null, %s::jsonb, %s::jsonb
                        ) returning created_at
                        """,
                        (
                            plan["grantId"], plan["workspaceId"], plan["grantId"],
                            str(plan["planDigest"])[7:], plan["ownerActorId"],
                            _canonical_json({
                                "memberActorId": plan["memberActorId"],
                                "memberLabel": plan["memberLabel"],
                                "roleId": plan["roleId"],
                                "products": plan["products"],
                                "capabilities": plan["capabilities"],
                                "approval": plan["approval"],
                            }),
                            _canonical_json(result),
                        ),
                    )
                    created_at = _row_value(cursor.fetchone(), "created_at", 0)
                    if not isinstance(created_at, datetime):
                        raise ManagedStaffAccessError("Staff access event timestamp was not returned.")
            return self._receipt(
                plan, created_at, status="active", command_id=plan["grantId"], replayed=False
            )
        finally:
            connection.close()

    def revoke(
        self,
        plan_value: object,
        activation_plan: Mapping[str, Any],
        *,
        verified_owner_actor_id: str,
        verified_owner_session_id: str,
        reason: str,
    ) -> dict[str, Any]:
        plan = validate_staff_access_plan(plan_value, activation_plan)
        activation = _validate_supported_activation_plan(activation_plan)
        owner = _uuid(verified_owner_actor_id, "Verified owner actor ID")
        session = _uuid(verified_owner_session_id, "Verified owner session ID")
        note = _visible_text(reason, "Staff access revocation reason", 500)
        if owner != plan["ownerActorId"]:
            raise ManagedStaffAccessError("Verified owner does not match the staff access plan.")
        revocation_id = str(uuid5(UUID(plan["grantId"]), "revoke"))
        revocation_fingerprint = _digest({
            "staffAccessPlanDigest": plan["planDigest"],
            "revokedBy": owner,
            "reason": note,
        })
        connection = self._connect()
        try:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute("set transaction isolation level serializable")
                    self._assert_schema(cursor, require_write_privilege=True)
                    cursor.execute(
                        "select app_private.supabase_session_is_active(%s::uuid, %s::uuid) as active",
                        (owner, session),
                    )
                    if not bool(_row_value(cursor.fetchone(), "active", 0)):
                        raise ManagedStaffAccessError("Supabase owner session is no longer active.")
                    self._lock(cursor, plan["workspaceId"])
                    rows = self._assert_active_tenant(cursor, plan, activation)
                    member = self._member_row(rows, plan)
                    event = self._event_row(cursor, plan["workspaceId"], revocation_id)
                    if (
                        self._member_matches(member, plan, "revoked")
                        and self._event_matches(event, plan, "revoked", revocation_fingerprint[7:])
                    ):
                        created_at = _row_value(event, "created_at", 1)
                        if not isinstance(created_at, datetime):
                            raise ManagedActivationConflict("Staff revocation replay timestamp is invalid.")
                        return self._receipt(
                            plan, created_at, status="revoked", command_id=revocation_id, replayed=True
                        )
                    if not self._member_matches(member, plan, "active") or event is not None:
                        raise ManagedActivationConflict("Staff revocation has conflicting membership or event state.")
                    cursor.execute(
                        """
                        update app_private.workspace_memberships
                        set status = 'revoked', updated_at = transaction_timestamp()
                        where workspace_id = %s and actor_id = %s and status = 'active'
                        returning updated_at
                        """,
                        (plan["workspaceId"], plan["memberActorId"]),
                    )
                    if cursor.fetchone() is None:
                        raise ManagedActivationConflict("Staff membership was not revoked.")
                    result = {
                        "contract": STAFF_ACCESS_EVENT_CONTRACT,
                        "status": "revoked",
                        "staffAccessPlanDigest": plan["planDigest"],
                        "memberActorId": plan["memberActorId"],
                        "roleId": plan["roleId"],
                        "secretValuesExposed": False,
                    }
                    cursor.execute(
                        """
                        insert into app_private.workspace_events (
                          event_id, workspace_id, command_id, command_fingerprint,
                          surface, event_type, actor_id, actor_kind, expected_version,
                          resulting_version, payload_json, result_json
                        ) values (
                          %s, %s, %s, %s, 'company', 'company.staff_access.revoked',
                          %s, 'human', null, null, %s::jsonb, %s::jsonb
                        ) returning created_at
                        """,
                        (
                            revocation_id, plan["workspaceId"], revocation_id,
                            revocation_fingerprint[7:], owner,
                            _canonical_json({
                                "grantId": plan["grantId"],
                                "memberActorId": plan["memberActorId"],
                                "reason": note,
                            }),
                            _canonical_json(result),
                        ),
                    )
                    created_at = _row_value(cursor.fetchone(), "created_at", 0)
                    if not isinstance(created_at, datetime):
                        raise ManagedStaffAccessError("Staff revocation event timestamp was not returned.")
            return self._receipt(
                plan, created_at, status="revoked", command_id=revocation_id, replayed=False
            )
        finally:
            connection.close()


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Prepare or execute bounded workspace staff access.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare")
    prepare.add_argument("--activation-plan-file", required=True)
    prepare.add_argument("--member-actor-id", required=True)
    prepare.add_argument("--member-label", required=True)
    prepare.add_argument("--role-id", required=True, choices=_ROLES)
    prepare.add_argument("--approval-id", required=True)
    prepare.add_argument("--approved-at", required=True)
    prepare.add_argument("--expires-at", required=True)
    prepare.add_argument("--output", required=True)
    for command in ("validate", "authorize", "apply", "revoke"):
        operation = subparsers.add_parser(command)
        operation.add_argument("--activation-plan-file", required=True)
        operation.add_argument("--staff-plan-file", required=True)
        if command != "validate":
            operation.add_argument("--database-url-file", required=True)
            operation.add_argument("--confirm-owner-approval", required=True)
            operation.add_argument("--production-handoff", action="store_true")
        if command in {"authorize", "revoke"}:
            operation.add_argument("--owner-access-token-file", required=True)
            operation.add_argument("--publishable-key-file", required=True)
        if command == "authorize":
            operation.add_argument("--decision-note", required=True)
        if command in {"apply", "revoke"}:
            operation.add_argument("--receipt-file", required=True)
        if command == "revoke":
            operation.add_argument("--reason", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    mutation_performed = False
    try:
        activation = _validate_supported_activation_plan(
            _read_json(args.activation_plan_file, "Managed activation plan")
        )
        if args.command == "prepare":
            result = compile_staff_access_plan(
                activation,
                member_actor_id=args.member_actor_id,
                member_label=args.member_label,
                role_id=args.role_id,
                approval_id=args.approval_id,
                approved_at=args.approved_at,
                expires_at=args.expires_at,
            )
            _write_json(args.output, result)
        else:
            plan = validate_staff_access_plan(
                _read_json(args.staff_plan_file, "Staff access plan"),
                activation,
                require_current=args.command in {"authorize", "apply"},
            )
            if args.command == "validate":
                result = {
                    "contract": STAFF_ACCESS_PLAN_CONTRACT,
                    "status": "valid",
                    "grantId": plan["grantId"],
                    "planDigest": plan["planDigest"],
                    "externalMutationPerformed": False,
                }
            else:
                if args.confirm_owner_approval != plan["approval"]["approvalId"]:
                    raise ManagedStaffAccessError("Owner approval confirmation does not match the staff plan.")
                database_url = _read_database_url(args.database_url_file)
                _validate_admin_target(
                    database_url,
                    activation["target"]["projectRef"],
                    activation["target"]["adminCaSha256"],
                )
                production = activation["target"]["projectRef"] == _production_project_ref()
                if production and not args.production_handoff:
                    raise ManagedStaffAccessError("Production staff access requires --production-handoff.")
                if args.production_handoff and not production:
                    raise ManagedStaffAccessError("--production-handoff is valid only for production.")
                if production:
                    _require_release_checkout(activation["target"]["releaseCommit"])
                provisioner = ManagedStaffAccessProvisioner(database_url)
                if args.command in {"authorize", "revoke"}:
                    from supermega_runtime.supabase_auth import (
                        SupabaseAuthConfig,
                        SupabaseAuthUnavailable,
                        verify_supabase_user_identity,
                    )
                    token = _read_secret_file(args.owner_access_token_file, "Owner access token")
                    publishable_key = _read_secret_file(args.publishable_key_file, "Supabase publishable key")
                    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]{16,}", publishable_key):
                        raise ManagedStaffAccessError("Staff access requires a modern publishable key.")
                    try:
                        identity = verify_supabase_user_identity(
                            token,
                            SupabaseAuthConfig(
                                base_url=f"https://{activation['target']['projectRef']}.supabase.co",
                                publishable_key=publishable_key,
                            ),
                        )
                    except SupabaseAuthUnavailable as exc:
                        raise ManagedStaffAccessError("Supabase Auth could not verify the owner.") from exc
                    if identity is None:
                        raise ManagedStaffAccessError("Owner access token is invalid or anonymous.")
                    if args.command == "authorize":
                        result = provisioner.authorize(
                            plan,
                            activation,
                            verified_owner_actor_id=identity.user_id,
                            verified_owner_session_id=identity.session_id,
                            decision_note=args.decision_note,
                        )
                    else:
                        result = provisioner.revoke(
                            plan,
                            activation,
                            verified_owner_actor_id=identity.user_id,
                            verified_owner_session_id=identity.session_id,
                            reason=args.reason,
                        )
                    token = ""
                    publishable_key = ""
                else:
                    result = provisioner.apply(plan, activation)
                mutation_performed = result.get("replayed") is False
                if args.command in {"apply", "revoke"}:
                    _write_receipt(args.receipt_file, result)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
        return 0
    except (ManagedActivationError, OSError, json.JSONDecodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({
            "contract": "supermega.workspace_staff_access_error.v1",
            "status": "blocked",
            "error": str(exc),
            "secretValuesExposed": False,
            "externalMutationPerformed": mutation_performed,
        }, ensure_ascii=False, separators=(",", ":"), sort_keys=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
