from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
import unittest

from supermega_runtime.spa_staff_access import (
    SPA_STAFF_ACCESS_PLAN_CONTRACT,
    SPA_STAFF_ACCESS_REVIEW_CONTRACT,
    SpaStaffAccessError,
    compile_spa_staff_access_plan,
    compile_spa_staff_access_review,
    validate_spa_staff_access_plan,
    validate_spa_staff_access_review,
)


NOW = datetime(2026, 8, 13, 8, 0, tzinfo=timezone.utc)
OWNER_ID = "c63af44e-b7c1-4dbf-970d-389d5bba93a7"
STAFF_ID = "2f8d24d8-308c-4dc8-a352-7b61df756728"
APPROVAL_ID = "dc7dfb5a-0385-4684-b722-3ad4cf94a108"
PROJECT_REF = "zvtzwcimpvvtkowflhda"
RELEASE_COMMIT = "a" * 40
ADMIN_CA_SHA256 = "sha256:" + "1" * 64


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
