"""Synthetic domain tests; no SQL, hosted requests or customer evidence."""

from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import unittest

from supermega_runtime.trial_store import TrialPrincipal, TrialReadiness, TrialValidationError
from supermega_runtime.website_customer_review import (
    build_customer_acceptance, build_customer_change_request, customer_review_projection,
    prepare_customer_review,
)
from tests.test_website_runtime import _state

NOW = datetime(2026, 9, 16, 0, 0, tzinfo=timezone.utc)
REVIEW_ID = "11111111-1111-4111-8111-111111111111"
RECIPIENT = "22222222-2222-4222-8222-222222222222"
COMMAND_ID = "33333333-3333-4333-8333-333333333333"
ACCEPTANCE_ID = "44444444-4444-4444-8444-444444444444"


class CustomerReviewTests(unittest.TestCase):
    def setUp(self):
        self.state = _state()
        self.operator = TrialPrincipal("workspace-a", "operator", actor_kind="human")
        self.customer = TrialPrincipal("workspace-a", RECIPIENT, actor_kind="human")
        self.ready = TrialReadiness(
            backend="synthetic", database_ready=True, role_ready=True, schema_ready=True,
            auth_ready=True, membership_ready=True, audit_ready=True, write_enabled=True,
            capabilities=frozenset({"website.review"}), product_entitlements=("website",),
        )
        self.operator_ready = replace(self.ready, capabilities=frozenset({"website.write"}))
        self.review = self.prepare()
        self.payload = {"commandId": COMMAND_ID, "reviewId": REVIEW_ID,
                        "previewDigest": self.review["previewDigest"], "note": "Please shorten the heading."}
        self.acceptance_payload = {
            "commandId": ACCEPTANCE_ID, "reviewId": REVIEW_ID,
            "previewDigest": self.review["previewDigest"],
            "decision": "accept_preview_for_release_review",
        }

    def prepare(self, **changes):
        arguments = dict(principal=self.operator, readiness=self.operator_ready,
                         review_id=REVIEW_ID, recipient_actor_id=RECIPIENT,
                         expires_at=(NOW + timedelta(days=1)).isoformat(), now=NOW)
        return prepare_customer_review(self.state, **(arguments | changes))

    def project(self, **changes):
        arguments = dict(principal=self.customer, readiness=self.ready, now=NOW)
        return customer_review_projection(self.review, self.state, **(arguments | changes))

    def request(self, **changes):
        arguments = dict(principal=self.customer, readiness=self.ready, now=NOW)
        return build_customer_change_request(self.review, self.state, self.payload, **(arguments | changes))

    def accept(self, **changes):
        arguments = dict(principal=self.customer, readiness=self.ready, now=NOW)
        return build_customer_acceptance(
            self.review, self.state, self.acceptance_payload, **(arguments | changes),
        )

    def test_projection_is_explicit_public_content_only(self):
        result = self.project()
        self.assertEqual(set(result), {"reviewId", "contentRevision", "previewDigest", "preview",
                                     "expiresAt", "status", "publicationAuthorized"})
        self.assertEqual(set(result["preview"]), {"siteName", "pages"})
        page = result["preview"]["pages"][0]
        self.assertNotIn("internalName", page)
        self.assertNotIn("updatedAt", page)
        self.assertNotIn("recipientActorId", result)
        self.assertFalse(result["publicationAuthorized"])

    def test_projection_is_a_deep_copy(self):
        result = self.project()
        result["preview"]["pages"][0]["hero"]["headline"] = "different"
        self.assertNotEqual(result["preview"], self.review["preview"])
        self.assertEqual(self.project()["preview"], self.review["preview"])

    def test_stored_preview_cannot_add_private_fields(self):
        self.review["preview"]["leadLedger"] = {"private": "do not disclose"}
        with self.assertRaisesRegex(TrialValidationError, "stale_revision"):
            self.project()

    def test_draft_pages_are_not_in_preview(self):
        draft = deepcopy(self.state["pages"][0])
        draft.update(id="page-draft", slug="/draft", stage="draft")
        draft["sections"][0]["id"] = "section-draft"
        self.state["pages"].append(draft)
        self.review = self.prepare()
        self.assertEqual([page["id"] for page in self.project()["preview"]["pages"]], ["page-home"])

    def test_request_does_not_change_content_or_claim_delivery(self):
        before = deepcopy((self.state, self.review, self.payload))
        result = self.request()
        self.assertEqual((self.state, self.review, self.payload), before)
        self.assertEqual(result["actorId"], RECIPIENT)
        self.assertEqual(result["createdAt"], NOW.isoformat())
        self.assertEqual(result["contentRevision"], 0)
        self.assertFalse(result["persisted"])
        self.assertFalse(result["publicationAuthorized"])

    def test_same_command_fingerprint_excludes_retry_clock(self):
        first = self.request()
        second = self.request(now=NOW + timedelta(minutes=1))
        self.assertEqual(first["commandFingerprint"], second["commandFingerprint"])
        self.assertNotEqual(first["createdAt"], second["createdAt"])
        self.payload["note"] = "Different request"
        self.assertNotEqual(first["commandFingerprint"], self.request()["commandFingerprint"])

    def test_acceptance_binds_exact_authenticated_revision_without_release_authority(self):
        before = deepcopy((self.state, self.review, self.acceptance_payload))
        result = self.accept()
        self.assertEqual((self.state, self.review, self.acceptance_payload), before)
        self.assertEqual(result["contract"], "supermega.website.customer-acceptance.v1")
        self.assertEqual(result["actorId"], RECIPIENT)
        self.assertEqual(result["contentRevision"], self.review["contentRevision"])
        self.assertEqual(result["previewDigest"], self.review["previewDigest"])
        self.assertEqual(result["status"], "accepted_for_operator_release_review")
        self.assertEqual(result["acceptedAt"], NOW.isoformat())
        self.assertFalse(result["persisted"])
        self.assertFalse(result["publicationAuthorized"])
        self.assertFalse(result["deploymentAuthorized"])

    def test_acceptance_fingerprint_is_retry_stable_and_payload_is_exact(self):
        first = self.accept()
        second = self.accept(now=NOW + timedelta(minutes=1))
        self.assertEqual(first["commandFingerprint"], second["commandFingerprint"])
        self.assertNotEqual(first["acceptedAt"], second["acceptedAt"])
        for field, value in (
            ("decision", "publish_now"),
            ("reviewId", "wrong"),
            ("previewDigest", "sha256:" + "0" * 64),
        ):
            original = self.acceptance_payload[field]
            self.acceptance_payload[field] = value
            expected = "acceptance_decision_invalid" if field == "decision" else "stale_revision"
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, expected):
                self.accept()
            self.acceptance_payload[field] = original
        self.acceptance_payload["published"] = True
        with self.assertRaisesRegex(TrialValidationError, "acceptance_payload_invalid"):
            self.accept()

    def test_acceptance_rejects_every_unready_write_boundary(self):
        for field in ("database_ready", "role_ready", "schema_ready", "auth_ready",
                      "membership_ready", "audit_ready", "write_enabled"):
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.accept(readiness=replace(self.ready, **{field: False}))

    def test_acceptance_requires_assigned_human_and_exact_workspace(self):
        for actor in (replace(self.customer, authenticated=False),
                      replace(self.customer, actor_kind="agent"),
                      replace(self.customer, actor_kind="service"),
                      replace(self.customer, actor_id="other"),
                      replace(self.customer, workspace_id="workspace-b"),
                      replace(self.customer, identity_provider="untrusted"),
                      replace(self.customer, identity_provider="supabase", session_id="")):
            with self.subTest(actor=actor), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.accept(principal=actor)
        with self.assertRaisesRegex(TrialValidationError, "access_denied"):
            self.accept(principal=self.operator, readiness=self.operator_ready)

    def test_acceptance_requires_review_capability_and_website_entitlement(self):
        for ready in (replace(self.ready, capabilities=frozenset({"website.write"})),
                      replace(self.ready, product_entitlements=()),
                      replace(self.ready, product_entitlements=None)):
            with self.subTest(ready=ready), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.accept(readiness=ready)

    def test_acceptance_rejects_expired_future_and_revoked_reviews(self):
        for stamp in (NOW - timedelta(microseconds=1), NOW + timedelta(days=1)):
            with self.subTest(stamp=stamp), self.assertRaisesRegex(TrialValidationError, "expired_or_future"):
                self.accept(now=stamp)
        for status in ("revoked", "stale"):
            self.review["status"] = status
            with self.subTest(status=status), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.accept()

    def test_acceptance_rejects_current_content_change_even_without_revision_bump(self):
        self.state["pages"][0]["hero"]["headline"] = "Changed after customer review"
        with self.assertRaisesRegex(TrialValidationError, "stale_revision"):
            self.accept()

    def test_acceptance_rejects_tampered_retained_preview_or_revision(self):
        for field, value in (("previewDigest", "sha256:" + "0" * 64),
                             ("contentRevision", True), ("preview", {})):
            original = self.review[field]
            self.review[field] = value
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, "stale_revision"):
                self.accept()
            self.review[field] = original

    def test_narrow_reviewer_cannot_prepare(self):
        with self.assertRaisesRegex(TrialValidationError, "access_denied"):
            self.prepare(principal=self.customer, readiness=self.ready)

    def test_operator_write_permission_is_not_review_assignment(self):
        with self.assertRaisesRegex(TrialValidationError, "access_denied"):
            self.project(principal=self.operator, readiness=self.operator_ready)

    def test_all_readiness_boundaries_fail_closed(self):
        for field in ("database_ready", "role_ready", "schema_ready", "auth_ready", "membership_ready"):
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.project(readiness=replace(self.ready, **{field: False}))
        for field in ("audit_ready", "write_enabled"):
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.request(readiness=replace(self.ready, **{field: False}))

    def test_read_permission_survives_write_disabled_but_cannot_submit(self):
        ready = replace(self.ready, write_enabled=False, audit_ready=False)
        self.assertEqual(self.project(readiness=ready)["status"], "prepared_preview")
        with self.assertRaises(TrialValidationError):
            self.request(readiness=ready)

    def test_missing_entitlement_and_capability_rejected(self):
        for ready in (replace(self.ready, capabilities=frozenset({"website.read"})),
                      replace(self.ready, product_entitlements=()),
                      replace(self.ready, product_entitlements=None)):
            with self.subTest(ready=ready), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.project(readiness=ready)

    def test_identity_membership_assignment_boundaries(self):
        for actor in (replace(self.customer, authenticated=False),
                      replace(self.customer, actor_kind="agent"),
                      replace(self.customer, actor_kind="service"),
                      replace(self.customer, actor_id="other"),
                      replace(self.customer, workspace_id="workspace-b"),
                      replace(self.customer, identity_provider="untrusted"),
                      replace(self.customer, identity_provider="supabase", session_id="")):
            with self.subTest(actor=actor), self.assertRaisesRegex(TrialValidationError, "access_denied"):
                self.project(principal=actor)

    def test_revoked_review_is_denied(self):
        self.review["status"] = "revoked"
        with self.assertRaisesRegex(TrialValidationError, "access_denied"):
            self.request()

    def test_expiry_and_future_assignment(self):
        for stamp in (NOW - timedelta(seconds=1), NOW + timedelta(days=1)):
            with self.subTest(stamp=stamp), self.assertRaisesRegex(TrialValidationError, "expired_or_future"):
                self.project(now=stamp)

    def test_expiry_creation_is_bounded(self):
        for stamp in (NOW, NOW - timedelta(seconds=1), NOW + timedelta(days=7, seconds=1)):
            with self.subTest(stamp=stamp), self.assertRaisesRegex(TrialValidationError, "expiry_invalid"):
                self.prepare(expires_at=stamp.isoformat())

    def test_naive_time_is_rejected(self):
        with self.assertRaisesRegex(TrialValidationError, "time_invalid"):
            self.project(now=NOW.replace(tzinfo=None))
        with self.assertRaisesRegex(TrialValidationError, "time_invalid"):
            self.prepare(expires_at="2026-09-17T00:00:00")

    def test_digest_tampering_and_revision_tampering(self):
        for field, value in (("previewDigest", "sha256:" + "0" * 64),
                             ("contentRevision", True), ("contentRevision", 1)):
            with self.subTest(field=field):
                original = self.review[field]
                self.review[field] = value
                with self.assertRaisesRegex(TrialValidationError, "stale_revision"):
                    self.project()
                self.review[field] = original

    def test_current_content_change_is_stale_even_with_same_revision(self):
        self.state["pages"][0]["hero"]["headline"] = "New heading"
        with self.assertRaisesRegex(TrialValidationError, "stale_revision"):
            self.request()

    def test_later_content_revision_is_stale(self):
        self.state["revision"] = self.state["contentRevision"] = 1
        with self.assertRaisesRegex(TrialValidationError, "stale_revision"):
            self.request()

    def test_no_ready_pages_cannot_be_shared(self):
        self.state["pages"][0]["stage"] = "draft"
        with self.assertRaisesRegex(TrialValidationError, "no_prepared_pages"):
            self.prepare()

    def test_identity_or_state_in_payload_rejected(self):
        for field in ("actorId", "workspaceId", "state", "approvedAt", "published", "createdAt"):
            self.payload[field] = "not accepted"
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, "payload_invalid"):
                self.request()
            del self.payload[field]

    def test_bounded_note_validation_without_echo(self):
        for value in ("", " ", " leading", "trailing ", "x" * 2001, "private\x00note", "\ud800", None, 4):
            self.payload["note"] = value
            with self.subTest(kind=type(value).__name__), self.assertRaisesRegex(TrialValidationError, "text_invalid") as caught:
                self.request()
            self.assertEqual(str(caught.exception), "website_customer_review_text_invalid")

    def test_myanmar_multiline_note_is_preserved(self):
        self.payload["note"] = "ဆိုင်ဖွင့်ချိန်\nပြင်ပေးပါ။"
        self.assertEqual(self.request()["note"], self.payload["note"])

    def test_wrong_request_revision_and_digest_rejected(self):
        for field in ("reviewId", "previewDigest"):
            original = self.payload[field]
            self.payload[field] = "wrong"
            with self.subTest(field=field), self.assertRaisesRegex(TrialValidationError, "stale_revision"):
                self.request()
            self.payload[field] = original

    def test_invalid_id_is_rejected(self):
        for value in ("", "not-a-uuid", None, "11111111-1111-4111-8111-11111111111A"):
            self.payload["commandId"] = value
            with self.subTest(value=value), self.assertRaisesRegex(TrialValidationError, "identity_invalid"):
                self.request()


if __name__ == "__main__":
    unittest.main()
