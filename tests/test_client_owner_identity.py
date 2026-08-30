from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from supermega_runtime.supabase_auth import VerifiedSupabaseUser
from tools.manage_client_owner_identity import (
    ClientOwnerIdentityError,
    build_owner_identity_plan,
    build_owner_identity_proof,
    compile_proof_bound_activation,
    validate_owner_identity_plan,
    validate_owner_identity_proof,
    require_active_owner_identity_plan,
)
from tests.test_managed_activation import (
    ADMIN_CA_SHA256,
    APPROVAL_ID,
    NOW,
    OWNER_ID,
    OWNER_SESSION_ID,
    managed_trial_request_for,
)


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "tools" / "manage_client_owner_identity.py"


def _plan() -> dict[str, object]:
    return build_owner_identity_plan(
        project_ref="zvtzwcimpvvtkowflhda",
        release_commit="a" * 40,
        workspace_label="Mingalar Beauty Spa",
        owner_label="Named Spa Owner",
        owner_email="owner@example.com",
        approval_id="2d07b68f-6a66-4aec-b49a-79137f98fa52",
        approved_at="2098-01-01T00:00:00.000Z",
        expires_at="2098-01-01T01:00:00.000Z",
    )


class ClientOwnerIdentityTests(unittest.TestCase):
    @staticmethod
    def _time(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def test_plan_contains_only_digests_and_no_external_action_claim(self) -> None:
        plan = validate_owner_identity_plan(_plan())
        serialized = json.dumps(plan)
        self.assertNotIn("owner@example.com", serialized)
        self.assertEqual(plan["status"], "planned_not_sent")
        self.assertFalse(plan["controls"]["invitationSent"])
        self.assertFalse(plan["controls"]["providerCallsPerformed"])

    def test_plan_tampering_and_long_approval_window_fail_closed(self) -> None:
        plan = _plan()
        plan["target"]["applicationOrigin"] = "https://attacker.example"
        with self.assertRaisesRegex(ClientOwnerIdentityError, "digest"):
            validate_owner_identity_plan(plan)
        with self.assertRaisesRegex(ClientOwnerIdentityError, "within one hour"):
            build_owner_identity_plan(
                project_ref="zvtzwcimpvvtkowflhda",
                release_commit="b" * 40,
                workspace_label="Mingalar Beauty Spa",
                owner_label="Named Spa Owner",
                owner_email="owner@example.com",
                approval_id="2d07b68f-6a66-4aec-b49a-79137f98fa52",
                approved_at="2098-01-01T00:00:00.000Z",
                expires_at="2098-01-01T02:00:00.000Z",
            )

    def test_expired_or_not_yet_active_plan_cannot_reach_live_verification(self) -> None:
        plan = _plan()
        with self.assertRaisesRegex(ClientOwnerIdentityError, "not currently active"):
            require_active_owner_identity_plan(
                plan, now=datetime(2097, 1, 1, tzinfo=timezone.utc)
            )
        with self.assertRaisesRegex(ClientOwnerIdentityError, "not currently active"):
            require_active_owner_identity_plan(
                plan, now=datetime(2098, 1, 1, 1, tzinfo=timezone.utc)
            )

    def test_verified_named_owner_proof_is_plan_bound_and_scrubbed(self) -> None:
        plan = _plan()
        identity = VerifiedSupabaseUser(
            user_id="c63af44e-b7c1-4dbf-970d-389d5bba93a7",
            session_id="c7a9a558-2f78-40c4-9b2b-68a9c22ef70f",
            email_verified=True,
            email="Owner@Example.com",
        )
        proof = validate_owner_identity_proof(build_owner_identity_proof(plan, identity), plan)
        serialized = json.dumps(proof)
        self.assertNotIn("owner@example.com", serialized.casefold())
        self.assertNotIn(identity.session_id, serialized)
        self.assertEqual(proof["identity"]["ownerActorId"], identity.user_id)
        self.assertFalse(proof["controls"]["providerWritesPerformed"])

    def test_unconfirmed_or_wrong_email_cannot_prove_owner(self) -> None:
        plan = _plan()
        with self.assertRaisesRegex(ClientOwnerIdentityError, "not confirmed"):
            build_owner_identity_proof(
                plan,
                VerifiedSupabaseUser(
                    user_id="c63af44e-b7c1-4dbf-970d-389d5bba93a7",
                    session_id="c7a9a558-2f78-40c4-9b2b-68a9c22ef70f",
                ),
            )
        with self.assertRaisesRegex(ClientOwnerIdentityError, "does not match"):
            build_owner_identity_proof(
                plan,
                VerifiedSupabaseUser(
                    user_id="c63af44e-b7c1-4dbf-970d-389d5bba93a7",
                    session_id="c7a9a558-2f78-40c4-9b2b-68a9c22ef70f",
                    email_verified=True,
                    email="other@example.com",
                ),
            )

    def test_owner_proof_compiles_activation_without_manual_identity_or_target(self) -> None:
        owner_plan = build_owner_identity_plan(
            project_ref="zvtzwcimpvvtkowflhda",
            release_commit="a" * 40,
            workspace_label="Mingalar Fresh Mart",
            owner_label="Swan Htet",
            owner_email="owner@example.com",
            approval_id="2d07b68f-6a66-4aec-b49a-79137f98fa52",
            approved_at=self._time(NOW - timedelta(minutes=10)),
            expires_at=self._time(NOW + timedelta(minutes=50)),
        )
        identity = VerifiedSupabaseUser(
            user_id=OWNER_ID,
            session_id=OWNER_SESSION_ID,
            email_verified=True,
            email="owner@example.com",
        )
        owner_proof = build_owner_identity_proof(owner_plan, identity)
        activation = compile_proof_bound_activation(
            owner_plan,
            owner_proof,
            [managed_trial_request_for("shop"), managed_trial_request_for("plant")],
            workspace_id="mingalar-fresh-mart",
            activation_approval_id=APPROVAL_ID,
            activation_approved_at=self._time(NOW - timedelta(minutes=5)),
            admin_ca_sha256=ADMIN_CA_SHA256,
            now=NOW,
        )
        self.assertEqual(activation["ownerActorId"], OWNER_ID)
        self.assertEqual(activation["target"]["projectRef"], "zvtzwcimpvvtkowflhda")
        self.assertEqual(activation["target"]["releaseCommit"], "a" * 40)
        self.assertEqual(activation["products"], ["shop", "plant"])
        self.assertEqual(activation["approval"]["approvalId"], APPROVAL_ID)
        serialized = json.dumps(activation)
        self.assertNotIn("owner@example.com", serialized)
        self.assertNotIn(OWNER_SESSION_ID, serialized)

    def test_proof_bound_activation_rejects_wrong_client_or_expired_identity_plan(self) -> None:
        owner_plan = build_owner_identity_plan(
            project_ref="zvtzwcimpvvtkowflhda",
            release_commit="a" * 40,
            workspace_label="Different Business",
            owner_label="Swan Htet",
            owner_email="owner@example.com",
            approval_id="2d07b68f-6a66-4aec-b49a-79137f98fa52",
            approved_at=self._time(NOW - timedelta(minutes=10)),
            expires_at=self._time(NOW + timedelta(minutes=50)),
        )
        owner_proof = build_owner_identity_proof(
            owner_plan,
            VerifiedSupabaseUser(
                user_id=OWNER_ID,
                session_id=OWNER_SESSION_ID,
                email_verified=True,
                email="owner@example.com",
            ),
        )
        with self.assertRaisesRegex(ClientOwnerIdentityError, "do not match"):
            compile_proof_bound_activation(
                owner_plan,
                owner_proof,
                [managed_trial_request_for("shop")],
                workspace_id="mingalar-fresh-mart",
                activation_approval_id=APPROVAL_ID,
                activation_approved_at=self._time(NOW - timedelta(minutes=5)),
                admin_ca_sha256=ADMIN_CA_SHA256,
                now=NOW,
            )
        with self.assertRaisesRegex(ClientOwnerIdentityError, "not currently active"):
            compile_proof_bound_activation(
                owner_plan,
                owner_proof,
                [managed_trial_request_for("shop")],
                workspace_id="mingalar-fresh-mart",
                activation_approval_id=APPROVAL_ID,
                activation_approved_at=self._time(NOW + timedelta(hours=1, minutes=55)),
                admin_ca_sha256=ADMIN_CA_SHA256,
                now=NOW + timedelta(hours=2),
            )
    def test_prepare_cli_outputs_only_metadata(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-owner-") as temporary:
            directory = Path(temporary)
            email = directory / "owner-email.txt"
            output = directory / "owner-plan.json"
            email.write_text("owner@example.com\n", encoding="utf-8")
            approved = datetime.now(timezone.utc) - timedelta(minutes=1)
            expires = approved + timedelta(minutes=30)
            approved_at = approved.isoformat(timespec="milliseconds").replace("+00:00", "Z")
            expires_at = expires.isoformat(timespec="milliseconds").replace("+00:00", "Z")
            result = subprocess.run(
                [
                    sys.executable, "-s", str(TOOL), "prepare",
                    "--project-ref", "zvtzwcimpvvtkowflhda",
                    "--release-commit", "a" * 40,
                    "--workspace-label", "Mingalar Beauty Spa",
                    "--owner-label", "Named Spa Owner",
                    "--owner-email-file", str(email),
                    "--approval-id", "2d07b68f-6a66-4aec-b49a-79137f98fa52",
                    "--approved-at", approved_at,
                    "--expires-at", expires_at,
                    "--output", str(output),
                ],
                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("owner@example.com", result.stdout)
            self.assertTrue(output.is_file())
            validate_owner_identity_plan(json.loads(output.read_text(encoding="utf-8")))

    def test_prepare_activation_cli_derives_verified_identity_and_target(self) -> None:
        with tempfile.TemporaryDirectory(prefix="supermega-activation-") as temporary:
            directory = Path(temporary)
            owner_plan_path = directory / "owner-plan.json"
            owner_proof_path = directory / "owner-proof.json"
            request_path = directory / "shop-request.json"
            certificate_path = directory / "admin-ca.pem"
            output_path = directory / "activation-plan.json"
            current = datetime.now(timezone.utc).replace(microsecond=0)
            owner_plan = build_owner_identity_plan(
                project_ref="zvtzwcimpvvtkowflhda",
                release_commit="a" * 40,
                workspace_label="Mingalar Fresh Mart",
                owner_label="Swan Htet",
                owner_email="owner@example.com",
                approval_id="2d07b68f-6a66-4aec-b49a-79137f98fa52",
                approved_at=self._time(current - timedelta(minutes=2)),
                expires_at=self._time(current + timedelta(minutes=30)),
            )
            owner_proof = build_owner_identity_proof(
                owner_plan,
                VerifiedSupabaseUser(
                    user_id=OWNER_ID,
                    session_id=OWNER_SESSION_ID,
                    email_verified=True,
                    email="owner@example.com",
                ),
            )
            owner_plan_path.write_text(json.dumps(owner_plan), encoding="utf-8")
            owner_proof_path.write_text(json.dumps(owner_proof), encoding="utf-8")
            request_path.write_text(json.dumps(managed_trial_request_for("shop")), encoding="utf-8")
            certificate_path.write_text(
                "-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    sys.executable, "-s", str(TOOL), "prepare-activation",
                    "--owner-plan", str(owner_plan_path),
                    "--owner-proof", str(owner_proof_path),
                    "--request-file", str(request_path),
                    "--workspace-id", "mingalar-fresh-mart",
                    "--activation-approval-id", APPROVAL_ID,
                    "--activation-approved-at", self._time(current - timedelta(minutes=1)),
                    "--admin-ca-file", str(certificate_path),
                    "--output", str(output_path),
                ],
                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("owner@example.com", result.stdout)
            self.assertNotIn(OWNER_SESSION_ID, result.stdout)
            activation = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(activation["ownerActorId"], OWNER_ID)
            self.assertEqual(activation["target"]["projectRef"], "zvtzwcimpvvtkowflhda")
            self.assertEqual(activation["target"]["releaseCommit"], "a" * 40)


if __name__ == "__main__":
    unittest.main()
