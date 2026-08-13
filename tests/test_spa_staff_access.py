from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import unittest

from supermega_runtime.spa_staff_access import (
    SPA_STAFF_ACCESS_PLAN_CONTRACT,
    SPA_STAFF_ACCESS_REVIEW_CONTRACT,
    SPA_STAFF_INVITATION_HANDOFF_CONTRACT,
    SPA_STAFF_INVITATION_RECEIPT_CONTRACT,
    SPA_STAFF_INVITATION_REDIRECT_URL,
    SpaStaffAccessError,
    compile_spa_staff_access_plan,
    compile_spa_staff_access_review,
    compile_spa_staff_invitation_handoff,
    record_spa_staff_invitation_result,
    validate_spa_staff_access_plan,
    validate_spa_staff_access_review,
    validate_spa_staff_invitation_handoff,
    validate_spa_staff_invitation_receipt,
)


NOW = datetime(2026, 8, 13, 8, 0, tzinfo=timezone.utc)
OWNER_ID = "c63af44e-b7c1-4dbf-970d-389d5bba93a7"
STAFF_ID = "2f8d24d8-308c-4dc8-a352-7b61df756728"
APPROVAL_ID = "dc7dfb5a-0385-4684-b722-3ad4cf94a108"
PROJECT_REF = "zvtzwcimpvvtkowflhda"
RELEASE_COMMIT = "a" * 40
ADMIN_CA_SHA256 = "sha256:" + "1" * 64
PROVIDER_RESPONSE_SHA256 = "sha256:" + "2" * 64
REDIRECT_EVIDENCE_SHA256 = "sha256:" + "3" * 64
SMTP_EVIDENCE_SHA256 = "sha256:" + "4" * 64


def staff_review(role: str = "front-desk") -> dict[str, object]:
    return compile_spa_staff_access_review(
        display_name="  Su   Su  ",
        email="STAFF@EXAMPLE.COM",
        role=role,
        workspace_id="mingalar-spa",
        requested_by=OWNER_ID,
        now=NOW - timedelta(minutes=2),
    )


def staff_plan(role: str = "front-desk") -> dict[str, object]:
    return compile_spa_staff_access_plan(
        staff_review(role),
        verified_staff_actor_id=STAFF_ID,
        verified_staff_email="staff@example.com",
        approval_id=APPROVAL_ID,
        approved_at=NOW.isoformat(),
        project_ref=PROJECT_REF,
        release_commit=RELEASE_COMMIT,
        admin_ca_sha256=ADMIN_CA_SHA256,
        now=NOW,
    )


def invitation_handoff(role: str = "front-desk") -> dict[str, object]:
    return compile_spa_staff_invitation_handoff(
        staff_review(role),
        project_ref=PROJECT_REF,
        release_commit=RELEASE_COMMIT,
        admin_ca_sha256=ADMIN_CA_SHA256,
        now=NOW,
    )


class SpaStaffAccessContractTests(unittest.TestCase):
    def test_review_is_normalized_digest_bound_and_strictly_no_send(self) -> None:
        review = staff_review()
        self.assertEqual(review["contract"], SPA_STAFF_ACCESS_REVIEW_CONTRACT)
        self.assertEqual(review["candidate"]["display_name"], "Su Su")
        self.assertEqual(review["candidate"]["email"], "staff@example.com")
        self.assertEqual(review["candidate"]["access"], "spa-front-desk")
        self.assertEqual(
            review["candidate"]["capabilities"],
            ["commerce.spa.front_desk", "commerce.write"],
        )
        for field in (
            "invitation_sent",
            "auth_user_created",
            "membership_written",
            "external_writes_performed",
            "secret_values_exposed",
        ):
            self.assertFalse(review[field])
        self.assertEqual(validate_spa_staff_access_review(review), review)

        tampered = deepcopy(review)
        tampered["candidate"]["role"] = "therapist"
        with self.assertRaises(SpaStaffAccessError):
            validate_spa_staff_access_review(tampered)

    def test_invitation_handoff_is_private_no_send_and_preflight_gated(self) -> None:
        handoff = invitation_handoff()
        self.assertEqual(handoff["contract"], SPA_STAFF_INVITATION_HANDOFF_CONTRACT)
        self.assertEqual(handoff["status"], "operator_preflight_required")
        self.assertEqual(handoff["target"]["redirectTo"], SPA_STAFF_INVITATION_REDIRECT_URL)
        self.assertIn("exact_redirect_allowlist_evidence", handoff["requiredPreflight"])
        self.assertIn("custom_smtp_delivery_evidence", handoff["requiredPreflight"])
        self.assertIn("owner_provider_call_confirmation", handoff["requiredPreflight"])
        self.assertIn("automatic_provider_retry", handoff["forbiddenActions"])
        self.assertFalse(handoff["providerRequestAuthorized"])
        self.assertFalse(handoff["invitationSent"])
        self.assertFalse(handoff["authUserCreated"])
        self.assertFalse(handoff["membershipWritten"])
        self.assertFalse(handoff["externalProviderRequestsPerformed"])
        serialized = json.dumps(handoff, sort_keys=True)
        self.assertNotIn("Su Su", serialized)
        self.assertNotIn("staff@example.com", serialized)
        self.assertNotIn("sb_secret_", serialized)
        self.assertEqual(validate_spa_staff_invitation_handoff(handoff), handoff)

    def test_invitation_handoff_rejects_target_role_and_expiry_tampering(self) -> None:
        handoff = invitation_handoff()
        redirect_tamper = deepcopy(handoff)
        redirect_tamper["target"]["redirectTo"] = "https://evil.example/account/setup"
        with self.assertRaises(SpaStaffAccessError):
            validate_spa_staff_invitation_handoff(redirect_tamper)

        owner_tamper = deepcopy(handoff)
        owner_tamper["candidate"]["capabilities"].append("company.control.approve")
        with self.assertRaises(SpaStaffAccessError):
            validate_spa_staff_invitation_handoff(owner_tamper)

        with self.assertRaisesRegex(SpaStaffAccessError, "expired"):
            validate_spa_staff_invitation_handoff(
                handoff,
                now=NOW + timedelta(minutes=20),
                require_current=True,
            )

    def test_provider_result_is_sanitized_and_still_requires_fresh_sign_in(self) -> None:
        handoff = invitation_handoff()
        receipt = record_spa_staff_invitation_result(
            handoff,
            provider_user_id=STAFF_ID,
            provider_user_email="staff@example.com",
            provider_user_created_at=(NOW + timedelta(minutes=1)).isoformat(),
            provider_response_digest=PROVIDER_RESPONSE_SHA256,
            redirect_allowlist_evidence_digest=REDIRECT_EVIDENCE_SHA256,
            smtp_delivery_evidence_digest=SMTP_EVIDENCE_SHA256,
            now=NOW + timedelta(minutes=2),
        )
        self.assertEqual(receipt["contract"], SPA_STAFF_INVITATION_RECEIPT_CONTRACT)
        self.assertEqual(receipt["status"], "invited_pending_first_sign_in")
        self.assertEqual(receipt["identity"]["actorId"], STAFF_ID)
        self.assertEqual(receipt["providerEvidence"]["verification"], "requery_before_membership")
        self.assertIn("fresh_staff_sign_in", receipt["nextRequired"])
        self.assertTrue(receipt["invitationSent"])
        self.assertTrue(receipt["authUserCreated"])
        self.assertFalse(receipt["emailDeliveryVerified"])
        self.assertFalse(receipt["inviteAcceptedByUser"])
        self.assertTrue(receipt["externalProviderRequestsPerformed"])
        self.assertFalse(receipt["membershipWritten"])
        serialized = json.dumps(receipt, sort_keys=True)
        self.assertNotIn("Su Su", serialized)
        self.assertNotIn("staff@example.com", serialized)
        self.assertNotIn("sb_secret_", serialized)
        self.assertEqual(
            validate_spa_staff_invitation_receipt(receipt, handoff_value=handoff),
            receipt,
        )

    def test_provider_result_rejects_wrong_email_window_and_handoff(self) -> None:
        handoff = invitation_handoff()
        values = {
            "provider_user_id": STAFF_ID,
            "provider_user_email": "staff@example.com",
            "provider_user_created_at": (NOW + timedelta(minutes=1)).isoformat(),
            "provider_response_digest": PROVIDER_RESPONSE_SHA256,
            "redirect_allowlist_evidence_digest": REDIRECT_EVIDENCE_SHA256,
            "smtp_delivery_evidence_digest": SMTP_EVIDENCE_SHA256,
            "now": NOW + timedelta(minutes=2),
        }
        with self.assertRaisesRegex(SpaStaffAccessError, "email does not match"):
            record_spa_staff_invitation_result(
                handoff,
                **{**values, "provider_user_email": "other@example.com"},
            )
        with self.assertRaisesRegex(SpaStaffAccessError, "outside the reviewed"):
            record_spa_staff_invitation_result(
                handoff,
                **{
                    **values,
                    "provider_user_created_at": (NOW - timedelta(minutes=1)).isoformat(),
                },
            )

        receipt = record_spa_staff_invitation_result(handoff, **values)
        with self.assertRaisesRegex(SpaStaffAccessError, "does not match its handoff"):
            validate_spa_staff_invitation_receipt(
                receipt,
                handoff_value=invitation_handoff("therapist"),
            )

    def test_plan_binds_verified_identity_and_exact_role_without_pii_or_provider_calls(self) -> None:
        plan = staff_plan()
        self.assertEqual(plan["contract"], SPA_STAFF_ACCESS_PLAN_CONTRACT)
        self.assertEqual(plan["identity"]["actorId"], STAFF_ID)
        self.assertEqual(plan["role"], "front-desk")
        self.assertEqual(plan["access"], "spa-front-desk")
        self.assertEqual(plan["capabilities"], ["commerce.spa.front_desk", "commerce.write"])
        self.assertFalse(plan["externalProviderRequestsPerformed"])
        serialized = json.dumps(plan, sort_keys=True)
        self.assertNotIn("Su Su", serialized)
        self.assertNotIn("staff@example.com", serialized)
        self.assertNotIn("inviteUserByEmail", serialized)
        self.assertEqual(validate_spa_staff_access_plan(plan), plan)

        therapist = staff_plan("therapist")
        self.assertEqual(therapist["access"], "spa-therapist")
        self.assertEqual(therapist["capabilities"], ["commerce.spa.therapist", "commerce.write"])

    def test_plan_rejects_identity_email_role_and_expiry_tampering(self) -> None:
        with self.assertRaisesRegex(SpaStaffAccessError, "email does not match"):
            compile_spa_staff_access_plan(
                staff_review(),
                verified_staff_actor_id=STAFF_ID,
                verified_staff_email="other@example.com",
                approval_id=APPROVAL_ID,
                approved_at=NOW.isoformat(),
                project_ref=PROJECT_REF,
                release_commit=RELEASE_COMMIT,
                admin_ca_sha256=ADMIN_CA_SHA256,
                now=NOW,
            )
        with self.assertRaisesRegex(SpaStaffAccessError, "own account"):
            compile_spa_staff_access_plan(
                staff_review(),
                verified_staff_actor_id=OWNER_ID,
                verified_staff_email="staff@example.com",
                approval_id=APPROVAL_ID,
                approved_at=NOW.isoformat(),
                project_ref=PROJECT_REF,
                release_commit=RELEASE_COMMIT,
                admin_ca_sha256=ADMIN_CA_SHA256,
                now=NOW,
            )

        tampered = staff_plan()
        tampered["capabilities"].append("company.control.approve")
        with self.assertRaises(SpaStaffAccessError):
            validate_spa_staff_access_plan(tampered)
        with self.assertRaisesRegex(SpaStaffAccessError, "expired"):
            validate_spa_staff_access_plan(
                staff_plan(),
                now=NOW + timedelta(hours=2),
                require_current=True,
            )


if __name__ == "__main__":
    unittest.main()
