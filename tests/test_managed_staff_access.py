from __future__ import annotations

import contextlib
from copy import deepcopy
from datetime import timedelta
import io
import json
from pathlib import Path
import tempfile
import unittest

from supermega_runtime.managed_staff_access import (
    STAFF_ACCESS_AUTHORIZATION_CONTRACT,
    STAFF_ACCESS_RECEIPT_CONTRACT,
    STAFF_ACCESS_REVOCATION_RECEIPT_CONTRACT,
    ManagedStaffAccessError,
    ManagedStaffAccessProvisioner,
    compile_staff_access_plan,
    main,
    validate_staff_access_plan,
)
from supermega_runtime.managed_activation import ManagedActivationConflict, ManagedWorkspaceProvisioner
from tests.test_managed_activation import (
    FakeDatabase,
    NOW,
    OWNER_ID,
    OWNER_SESSION_ID,
    activation_plan,
)


MEMBER_ID = "b90445d0-3eef-45ec-a36d-f093856084b0"
STAFF_APPROVAL_ID = "af2b74cf-4974-4f0f-b3aa-5a7f129a706c"


def _timestamp(moment) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def staff_plan(activation, role_id: str = "product-operator"):
    return compile_staff_access_plan(
        activation,
        member_actor_id=MEMBER_ID,
        member_label="Ma Thiri",
        role_id=role_id,
        approval_id=STAFF_APPROVAL_ID,
        approved_at=_timestamp(NOW - timedelta(minutes=2)),
        expires_at=_timestamp(NOW + timedelta(hours=1)),
        now=NOW,
    )


class ManagedStaffAccessPlanTests(unittest.TestCase):
    def test_roles_are_deterministic_and_never_inherit_owner_approval(self) -> None:
        activation = activation_plan()
        viewer = staff_plan(activation, "product-viewer")
        operator = staff_plan(activation, "product-operator")
        manager = staff_plan(activation, "workspace-manager")
        self.assertEqual(viewer["capabilities"], ["commerce.read", "company.read"])
        self.assertIn("commerce.write", operator["capabilities"])
        self.assertIn("approvals.request", operator["capabilities"])
        self.assertIn("company.read", manager["capabilities"])
        self.assertIn("approvals.read", manager["capabilities"])
        for plan in (viewer, operator, manager):
            self.assertNotIn("company.control.approve", plan["capabilities"])
            self.assertNotIn("approvals.decide", plan["capabilities"])
            self.assertIn("send_invitation_email", plan["forbiddenActions"])
            self.assertFalse(plan["secretValuesExposed"])
            self.assertEqual(validate_staff_access_plan(plan, activation, now=NOW), plan)

    def test_active_tenant_can_prepare_new_staff_after_activation_window_expires(self) -> None:
        activation = activation_plan()
        later = NOW + timedelta(days=8)
        plan = compile_staff_access_plan(
            activation,
            member_actor_id=MEMBER_ID,
            member_label="Ma Thiri",
            role_id="product-viewer",
            approval_id=STAFF_APPROVAL_ID,
            approved_at=_timestamp(later - timedelta(minutes=2)),
            expires_at=_timestamp(later + timedelta(hours=1)),
            now=later,
        )
        self.assertEqual(
            validate_staff_access_plan(plan, activation, now=later, require_current=True),
            plan,
        )

    def test_tampering_owner_identity_role_or_expiry_fails_closed(self) -> None:
        activation = activation_plan()
        plan = staff_plan(activation)
        for field, replacement in (
            ("ownerActorId", MEMBER_ID),
            ("roleId", "owner"),
            ("capabilities", ["company.control.approve"]),
        ):
            tampered = deepcopy(plan)
            tampered[field] = replacement
            with self.subTest(field=field), self.assertRaises(ManagedStaffAccessError):
                validate_staff_access_plan(tampered, activation, now=NOW)
        with self.assertRaises(ManagedStaffAccessError):
            validate_staff_access_plan(plan, activation, now=NOW + timedelta(hours=2), require_current=True)


class ManagedStaffAccessProvisionerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.database = FakeDatabase()
        self.activation = activation_plan()
        activation_provisioner = ManagedWorkspaceProvisioner(
            "postgresql://ignored", connection_factory=self.database.connect
        )
        activation_provisioner.authorize(
            self.activation,
            verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID,
            decision_note="Owner reviewed the exact workspace, release, and plan digest.",
        )
        activation_provisioner.apply(self.activation)
        self.plan = staff_plan(self.activation)
        self.provisioner = ManagedStaffAccessProvisioner(
            "postgresql://ignored", connection_factory=self.database.connect
        )

    def authorize(self):
        return self.provisioner.authorize(
            self.plan,
            self.activation,
            verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID,
            decision_note="Owner approved this exact staff role and capability set.",
        )

    def test_grant_replay_revoke_and_revocation_replay_are_idempotent(self) -> None:
        self.database.auth_users.add(MEMBER_ID)
        authorization = self.authorize()
        self.assertEqual(authorization["contract"], STAFF_ACCESS_AUTHORIZATION_CONTRACT)
        self.assertFalse(authorization["replayed"])
        self.assertTrue(self.authorize()["replayed"])

        granted = self.provisioner.apply(self.plan, self.activation)
        self.assertEqual(granted["contract"], STAFF_ACCESS_RECEIPT_CONTRACT)
        self.assertFalse(granted["authUserCreated"])
        self.assertFalse(granted["invitationEmailSent"])
        member = next(row for row in self.database.memberships if row["actor_id"] == MEMBER_ID)
        self.assertEqual(member["status"], "active")
        self.assertEqual(member["capabilities"], self.plan["capabilities"])
        self.assertTrue(self.provisioner.apply(self.plan, self.activation)["replayed"])

        revoked = self.provisioner.revoke(
            self.plan,
            self.activation,
            verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID,
            reason="Staff member left the workspace.",
        )
        self.assertEqual(revoked["contract"], STAFF_ACCESS_REVOCATION_RECEIPT_CONTRACT)
        self.assertEqual(member["status"], "revoked")
        replay = self.provisioner.revoke(
            self.plan,
            self.activation,
            verified_owner_actor_id=OWNER_ID,
            verified_owner_session_id=OWNER_SESSION_ID,
            reason="Staff member left the workspace.",
        )
        self.assertTrue(replay["replayed"])

    def test_apply_requires_a_preexisting_auth_user_and_rolls_back(self) -> None:
        self.authorize()
        before_memberships = deepcopy(self.database.memberships)
        with self.assertRaisesRegex(ManagedStaffAccessError, "already be a verified Supabase Auth user"):
            self.provisioner.apply(self.plan, self.activation)
        self.assertEqual(self.database.memberships, before_memberships)
        self.assertNotIn((self.plan["workspaceId"], self.plan["grantId"]), self.database.events)

    def test_anonymous_auth_user_cannot_receive_staff_access(self) -> None:
        self.authorize()
        self.database.auth_users.add(MEMBER_ID)
        self.database.anonymous_auth_users.add(MEMBER_ID)
        with self.assertRaisesRegex(ManagedStaffAccessError, "verified Supabase Auth user"):
            self.provisioner.apply(self.plan, self.activation)
        self.assertFalse(any(row["actor_id"] == MEMBER_ID for row in self.database.memberships))

    def test_revoked_owner_session_cannot_authorize_or_revoke(self) -> None:
        self.database.session_active = False
        with self.assertRaisesRegex(ManagedStaffAccessError, "session is no longer active"):
            self.authorize()
        self.database.session_active = True
        self.database.auth_users.add(MEMBER_ID)
        self.authorize()
        self.provisioner.apply(self.plan, self.activation)
        self.database.session_active = False
        with self.assertRaisesRegex(ManagedStaffAccessError, "session is no longer active"):
            self.provisioner.revoke(
                self.plan,
                self.activation,
                verified_owner_actor_id=OWNER_ID,
                verified_owner_session_id=OWNER_SESSION_ID,
                reason="Owner session is revoked.",
            )

    def test_cross_tenant_or_preexisting_membership_conflicts(self) -> None:
        self.database.auth_users.add(MEMBER_ID)
        self.authorize()
        self.database.memberships.append({
            "workspace_id": self.plan["workspaceId"],
            "actor_id": MEMBER_ID,
            "actor_kind": "human",
            "status": "active",
            "capabilities": ["company.read"],
        })
        with self.assertRaises(ManagedActivationConflict):
            self.provisioner.apply(self.plan, self.activation)


class ManagedStaffAccessCliTests(unittest.TestCase):
    def test_prepare_and_validate_are_local_no_write_commands(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-staff-access-") as temporary:
            directory = Path(temporary)
            activation_path = directory / "activation.json"
            plan_path = directory / "staff-plan.json"
            activation_path.write_text(json.dumps(activation_plan()), encoding="utf-8")
            approved_at = _timestamp(NOW - timedelta(minutes=2))
            expires_at = _timestamp(NOW + timedelta(hours=1))
            with contextlib.redirect_stdout(io.StringIO()):
                result = main([
                    "prepare",
                    "--activation-plan-file", str(activation_path),
                    "--member-actor-id", MEMBER_ID,
                    "--member-label", "Ma Thiri",
                    "--role-id", "product-viewer",
                    "--approval-id", STAFF_APPROVAL_ID,
                    "--approved-at", approved_at,
                    "--expires-at", expires_at,
                    "--output", str(plan_path),
                ])
            self.assertEqual(result, 0)
            plan = json.loads(plan_path.read_text(encoding="utf-8"))
            self.assertFalse(plan["secretValuesExposed"])
            with contextlib.redirect_stdout(io.StringIO()) as output:
                result = main([
                    "validate",
                    "--activation-plan-file", str(activation_path),
                    "--staff-plan-file", str(plan_path),
                ])
            self.assertEqual(result, 0)
            self.assertFalse(json.loads(output.getvalue())["externalMutationPerformed"])


if __name__ == "__main__":
    unittest.main()
