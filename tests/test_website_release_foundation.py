from __future__ import annotations

from copy import deepcopy
import json
import unittest

from supermega_runtime.website_release_foundation import (
    EMPTY_WEBSITE_RELEASE_DIGEST,
    WEBSITE_BRAND_TOKEN_CONTRACT,
    WEBSITE_DEPLOY_PLAN_CONTRACT,
    WEBSITE_DOMAIN_HANDOFF_CONTRACT,
    WEBSITE_RELEASE_PACKAGE_CONTRACT,
    WebsiteReleaseValidationError,
    apply_website_template_upgrade,
    approve_website_release_package,
    build_website_domain_handoff,
    build_website_release_package,
    create_empty_website_release_state,
    normalize_website_domain_hostname,
    prepare_website_deploy_plan,
    prepare_website_release_package,
    project_website_release,
    upgrade_website_release_package,
    validate_website_release_state,
    validate_website_domain_handoff,
    website_release_evidence_digest,
    website_release_template,
)


SCOPE = "website:client-demo"


def digest(label: str) -> str:
    return website_release_evidence_digest({"label": label})


def proof(sequence: int, actor: str, label: str) -> dict[str, str]:
    return {
        "actionId": f"ACT-WEB-20260726-{sequence:03d}",
        "capturedAt": f"2026-07-26T10:00:{sequence:02d}+06:30",
        "actor": actor,
        "reason": label,
        "evidenceReference": f"WEB-RELEASE-20260726-{sequence:03d}",
    }


def source(scope: str = SCOPE) -> dict[str, object]:
    return {
        "scope": scope,
        "snapshotId": "snapshot-approved-001",
        "websiteFingerprint": "web-1a2b3c4d",
        "artifactDigest": digest("approved-site-artifact"),
        "contentRevision": 7,
        "contentApprovalId": "approval-content-001",
        "contentApprovalActor": "Content owner",
        "contentApprovalAt": "2026-07-26T09:30:00+06:30",
        "evidence": [
            {
                "id": "evidence-content-001",
                "kind": "content",
                "reference": "review://content/001",
                "verifiedBy": "Content owner",
                "verifiedAt": "2026-07-26T09:10:00+06:30",
            },
            {
                "id": "evidence-links-001",
                "kind": "links",
                "reference": "test://links/001",
                "verifiedBy": "QA reviewer",
                "verifiedAt": "2026-07-26T09:15:00+06:30",
            },
            {
                "id": "evidence-responsive-001",
                "kind": "responsive",
                "reference": "test://responsive/390-1280",
                "verifiedBy": "QA reviewer",
                "verifiedAt": "2026-07-26T09:20:00+06:30",
            },
        ],
    }


def brand() -> dict[str, object]:
    return {
        "schema": WEBSITE_BRAND_TOKEN_CONTRACT,
        "palette": {
            "accent": "#087f5b",
            "ink": "#17211b",
            "surface": "#f7f8f4",
        },
        "typography": {
            "body": "noto-sans-myanmar",
            "heading": "system-sans",
        },
        "radiusPx": 12,
    }


def locales() -> list[dict[str, object]]:
    return [
        {
            "locale": "en",
            "isDefault": True,
            "status": "approved",
            "contentDigest": digest("approved-English-content"),
        },
        {
            "locale": "my",
            "isDefault": False,
            "status": "draft",
            "contentDigest": digest("draft-Myanmar-content"),
        },
    ]


def media() -> list[dict[str, object]]:
    return [
        {
            "assetId": "asset-hero-001",
            "kind": "image",
            "digest": digest("hero-image"),
            "bytes": 240_000,
            "decorative": False,
            "alt": [
                {
                    "locale": "en",
                    "text": "Team preparing a customer order at the counter",
                }
            ],
        }
    ]


def roles() -> list[dict[str, str]]:
    return [
        {"role": "content_owner", "actor": "Content owner"},
        {"role": "release_manager", "actor": "Release manager"},
        {"role": "release_reviewer", "actor": "Release reviewer"},
    ]


def package(version: int = 1, scope: str = SCOPE) -> dict[str, object]:
    return build_website_release_package(
        package_id=f"package-business-v{version}-001",
        source=source(scope),
        template=website_release_template(version),
        brand=brand(),
        locales=locales(),
        media=media(),
        roles=roles(),
    )


def prepared_state(version: int = 1) -> dict[str, object]:
    state = create_empty_website_release_state(SCOPE)
    return prepare_website_release_package(
        state,
        package(version),
        proof(1, "Release manager", "prepared approved Website release package"),
        expected_head_digest=state["headDigest"],
    )["state"]


def upgraded_state() -> dict[str, object]:
    state = prepared_state()
    upgraded = upgrade_website_release_package(
        package(),
        package_id="package-business-v2-001",
        migration_id="migration-business-v1-v2-001",
    )
    return apply_website_template_upgrade(
        state,
        upgraded,
        proof(2, "Release manager", "upgraded the reviewed client template"),
        expected_head_digest=state["headDigest"],
    )["state"]


def approved_state() -> dict[str, object]:
    state = upgraded_state()
    projection = project_website_release(state)
    return approve_website_release_package(
        state,
        approval_id="release-approval-001",
        package_digest=projection["package"]["packageDigest"],
        note="Template, brand, languages, media, and rollback boundary reviewed.",
        proof=proof(3, "Release reviewer", "approved the exact Website release package"),
        expected_head_digest=state["headDigest"],
    )["state"]


class WebsiteReleaseFoundationTests(unittest.TestCase):
    def test_package_is_strictly_digest_bound_and_tenant_scoped(self) -> None:
        candidate = package()
        self.assertEqual(candidate["contract"], WEBSITE_RELEASE_PACKAGE_CONTRACT)
        self.assertEqual(
            candidate["packageDigest"],
            "sha256:91d8360005aef757da99d129a53d48b58cba97dc1ca1c00df3fbe900a7c63454",
        )
        self.assertEqual(candidate["source"]["scope"], SCOPE)
        self.assertEqual(
            [entry["kind"] for entry in candidate["source"]["evidence"]],
            ["content", "links", "responsive"],
        )

        wrong_scope = create_empty_website_release_state("website:other-client")
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "scope"):
            prepare_website_release_package(
                wrong_scope,
                candidate,
                proof(1, "Release manager", "cross-scope attempt"),
                expected_head_digest=wrong_scope["headDigest"],
            )

    def test_template_upgrade_preserves_approved_content_and_client_configuration(self) -> None:
        previous = package()
        upgraded = upgrade_website_release_package(
            previous,
            package_id="package-business-v2-001",
            migration_id="migration-business-v1-v2-001",
        )
        self.assertEqual(upgraded["template"]["version"], 2)
        self.assertEqual(upgraded["previousPackageDigest"], previous["packageDigest"])
        for field in ("source", "brand", "locales", "media", "roles"):
            self.assertEqual(upgraded[field], previous[field])
        self.assertEqual(
            upgraded["migration"]["operations"],
            ["CMP-HERO:1->2", "CMP-NAVIGATION:1->2"],
        )

    def test_full_review_and_plan_retains_candidate_and_exact_rollback(self) -> None:
        state = approved_state()
        candidate = project_website_release(state)["package"]
        result = prepare_website_deploy_plan(
            state,
            plan_id="deploy-plan-001",
            package_digest=candidate["packageDigest"],
            approval_id="release-approval-001",
            target={
                "provider": "vercel",
                "projectRef": "owner-bound-project",
                "environment": "production",
                "protection": "required",
            },
            previous_deployment={
                "deploymentId": "deployment-known-good-001",
                "packageDigest": digest("previous-release-package"),
                "artifactDigest": digest("previous-release-artifact"),
            },
            proof=proof(4, "Release manager", "prepared an owner-gated deploy plan"),
            expected_head_digest=state["headDigest"],
        )
        projection = project_website_release(result["state"])
        plan = projection["deployPlan"]
        self.assertEqual(projection["status"], "plan_ready")
        self.assertEqual(plan["contract"], WEBSITE_DEPLOY_PLAN_CONTRACT)
        self.assertEqual(plan["status"], "not_executed")
        self.assertEqual(plan["candidate"]["packageDigest"], candidate["packageDigest"])
        self.assertEqual(plan["candidate"]["approvedLocales"], ["en"])
        self.assertEqual(
            plan["rollback"]["deploymentId"], "deployment-known-good-001"
        )
        self.assertEqual(plan["rollback"]["status"], "not_executed")
        self.assertTrue(plan["ownerApprovalRequired"])
        self.assertEqual(
            projection["headDigest"],
            "sha256:19b00a7d85eb69085e50dfe97c08cab9f10877319722b14bb713916ab8ff486f",
        )
        self.assertNotIn("domain", json.dumps(plan).lower())
        self.assertNotIn("token", json.dumps(plan).lower())

    def test_customer_domain_handoff_is_canonical_and_fails_closed(self) -> None:
        state = approved_state()
        candidate = project_website_release(state)["package"]
        result = prepare_website_deploy_plan(
            state,
            plan_id="deploy-plan-domain-001",
            package_digest=candidate["packageDigest"],
            approval_id="release-approval-001",
            target={
                "provider": "vercel",
                "projectRef": "owner-bound-project",
                "environment": "production",
                "protection": "required",
            },
            previous_deployment=None,
            proof=proof(4, "Release manager", "prepared no-write domain handoff"),
            expected_head_digest=state["headDigest"],
        )
        plan = project_website_release(result["state"])["deployPlan"]
        self.assertNotIn("domain", plan["target"])
        self.assertEqual(len(plan["steps"]), 4)
        handoff = build_website_domain_handoff(
            hostname="WWW.Mingalar-Spa.COM",
            release={
                "scope": SCOPE,
                "headDigest": result["state"]["headDigest"],
                "packageDigest": candidate["packageDigest"],
                "artifactDigest": candidate["source"]["artifactDigest"],
                "approvalId": "release-approval-001",
                "deployPlanDigest": website_release_evidence_digest(plan),
            },
        )
        self.assertEqual(handoff["contract"], WEBSITE_DOMAIN_HANDOFF_CONTRACT)
        self.assertEqual(handoff["hostname"], "www.mingalar-spa.com")
        self.assertEqual(handoff["status"], "not_executed")
        self.assertEqual(handoff["currentGate"], "domain_ownership_unverified")
        self.assertEqual(len(handoff["stages"]), 7)
        self.assertEqual(
            [stage["action"] for stage in handoff["stages"]],
            [
                "verify_domain_ownership",
                "add_domain_to_provider_project",
                "capture_provider_dns_challenge",
                "apply_exact_dns_mapping",
                "verify_provider_domain_ready",
                "verify_https_and_live_routes",
                "activate_canonical_domain",
            ],
        )
        self.assertEqual(
            handoff["rollback"]["requiredEvidence"],
            [
                "provider_domain_removal_receipt",
                "dns_restore_receipt",
                "https_previous_route_receipt",
            ],
        )
        self.assertEqual(
            handoff["rollback"]["blockers"],
            [
                "known_good_previous_domain_state_missing",
                "owner_rollback_approval_missing",
            ],
        )
        self.assertTrue(handoff["rollback"]["ownerApprovalRequired"])
        self.assertFalse(any(handoff["controls"].values()))
        self.assertEqual(validate_website_domain_handoff(handoff), handoff)
        self.assertEqual(
            normalize_website_domain_hostname("xn--fa-hia.de"), "xn--fa-hia.de"
        )
        parity_handoff = build_website_domain_handoff(
            hostname="WWW.Mingalar-Spa.COM",
            release={
                "scope": "website:domain-parity",
                "headDigest": "sha256:" + "1" * 64,
                "packageDigest": "sha256:" + "2" * 64,
                "artifactDigest": "sha256:" + "3" * 64,
                "approvalId": "website-domain-parity-approval",
                "deployPlanDigest": "sha256:" + "4" * 64,
            },
        )
        self.assertEqual(
            parity_handoff["packetDigest"],
            "sha256:beca88a43f6442214cb14b0e1caa2d90b86ba1521ec7245a59c9438ae295a444",
        )

        invalid_domains = (
            "မင်္ဂလာ.com",
            "faß.de",
            "https://example.com",
            "example.com/path",
            "example.com:443",
            "user@example.com",
            "localhost",
            "shop.local",
            "shop.example",
            "127.0.0.1",
            "singlelabel",
            "-bad.example.com",
        )
        for invalid in invalid_domains:
            with self.subTest(invalid=invalid), self.assertRaises(
                WebsiteReleaseValidationError
            ):
                normalize_website_domain_hostname(invalid)

        tampered = deepcopy(handoff)
        tampered["controls"]["providerWritesPerformed"] = True
        with self.assertRaises(WebsiteReleaseValidationError):
            validate_website_domain_handoff(tampered)

        drifted = deepcopy(handoff)
        drifted["stages"][2]["action"] = "skip_provider_dns_challenge"
        drifted.pop("packetDigest")
        drifted["packetDigest"] = website_release_evidence_digest(drifted)
        with self.assertRaises(WebsiteReleaseValidationError):
            validate_website_domain_handoff(drifted)

    def test_plan_without_previous_deployment_exposes_blocked_rollback(self) -> None:
        state = approved_state()
        candidate = project_website_release(state)["package"]
        state = prepare_website_deploy_plan(
            state,
            plan_id="deploy-plan-no-baseline-001",
            package_digest=candidate["packageDigest"],
            approval_id="release-approval-001",
            target={
                "provider": "vercel",
                "projectRef": "owner-bound-project",
                "environment": "production",
                "protection": "required",
            },
            previous_deployment=None,
            proof=proof(4, "Release manager", "recorded missing rollback baseline"),
            expected_head_digest=state["headDigest"],
        )["state"]
        rollback = project_website_release(state)["deployPlan"]["rollback"]
        self.assertEqual(rollback["mode"], "blocked_until_previous_deployment_bound")
        self.assertIsNone(rollback["deploymentId"])

    def test_release_review_and_plan_are_role_bound(self) -> None:
        state = upgraded_state()
        candidate = project_website_release(state)["package"]
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "release reviewer"):
            approve_website_release_package(
                state,
                approval_id="release-approval-wrong-actor",
                package_digest=candidate["packageDigest"],
                note="Wrong reviewer",
                proof=proof(3, "Release manager", "wrong role"),
                expected_head_digest=state["headDigest"],
            )
        state = approved_state()
        candidate = project_website_release(state)["package"]
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "release manager"):
            prepare_website_deploy_plan(
                state,
                plan_id="deploy-plan-wrong-role",
                package_digest=candidate["packageDigest"],
                approval_id="release-approval-001",
                target={
                    "provider": "vercel",
                    "projectRef": "owner-bound-project",
                    "environment": "production",
                    "protection": "required",
                },
                previous_deployment=None,
                proof=proof(4, "Release reviewer", "wrong plan role"),
                expected_head_digest=state["headDigest"],
            )

    def test_unreviewed_or_stale_package_cannot_produce_plan(self) -> None:
        state = upgraded_state()
        candidate = project_website_release(state)["package"]
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "release review"):
            prepare_website_deploy_plan(
                state,
                plan_id="deploy-plan-unreviewed",
                package_digest=candidate["packageDigest"],
                approval_id="missing-approval",
                target={
                    "provider": "vercel",
                    "projectRef": "owner-bound-project",
                    "environment": "production",
                    "protection": "required",
                },
                previous_deployment=None,
                proof=proof(3, "Release manager", "unreviewed plan"),
                expected_head_digest=state["headDigest"],
            )
        state = approved_state()
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "stale"):
            prepare_website_deploy_plan(
                state,
                plan_id="deploy-plan-stale-package",
                package_digest=digest("wrong-package"),
                approval_id="release-approval-001",
                target={
                    "provider": "vercel",
                    "projectRef": "owner-bound-project",
                    "environment": "production",
                    "protection": "required",
                },
                previous_deployment=None,
                proof=proof(4, "Release manager", "stale plan"),
                expected_head_digest=state["headDigest"],
            )

    def test_language_and_media_accessibility_contract_fails_closed(self) -> None:
        invalid_locales = locales()
        invalid_locales[0]["locale"] = "EN_us"
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "language tag"):
            build_website_release_package(
                package_id="package-invalid-locale",
                source=source(),
                template=website_release_template(),
                brand=brand(),
                locales=invalid_locales,
                media=media(),
                roles=roles(),
            )
        missing_alt = media()
        missing_alt[0]["alt"] = []
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "alternative text"):
            build_website_release_package(
                package_id="package-missing-alt",
                source=source(),
                template=website_release_template(),
                brand=brand(),
                locales=locales(),
                media=missing_alt,
                roles=roles(),
            )

    def test_draft_locale_is_retained_but_not_claimed_in_candidate(self) -> None:
        projection = project_website_release(prepared_state(version=2))
        self.assertEqual(projection["approvedLocales"], ["en"])
        self.assertEqual(projection["draftLocales"], ["my"])

    def test_content_owner_must_match_source_approval_actor(self) -> None:
        invalid_roles = roles()
        invalid_roles[0]["actor"] = "Different owner"
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "content owner"):
            build_website_release_package(
                package_id="package-wrong-content-owner",
                source=source(),
                template=website_release_template(),
                brand=brand(),
                locales=locales(),
                media=media(),
                roles=invalid_roles,
            )

    def test_exact_retry_is_idempotent_and_conflict_or_stale_head_fails(self) -> None:
        empty = create_empty_website_release_state(SCOPE)
        candidate = package()
        action_proof = proof(1, "Release manager", "prepared package")
        first = prepare_website_release_package(
            empty,
            candidate,
            action_proof,
            expected_head_digest=empty["headDigest"],
        )
        replay = prepare_website_release_package(
            first["state"],
            candidate,
            action_proof,
            expected_head_digest=EMPTY_WEBSITE_RELEASE_DIGEST,
        )
        self.assertTrue(replay["replayed"])
        self.assertEqual(replay["state"], first["state"])

        conflicting = deepcopy(candidate)
        conflicting["packageDigest"] = digest("conflicting-package-body")
        with self.assertRaises(WebsiteReleaseValidationError):
            prepare_website_release_package(
                first["state"],
                conflicting,
                action_proof,
                expected_head_digest=first["state"]["headDigest"],
            )
        upgraded = upgrade_website_release_package(
            candidate,
            package_id="package-business-v2-001",
            migration_id="migration-business-v1-v2-001",
        )
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "changed"):
            apply_website_template_upgrade(
                first["state"],
                upgraded,
                proof(2, "Release manager", "stale upgrade"),
                expected_head_digest=EMPTY_WEBSITE_RELEASE_DIGEST,
            )

    def test_upgrade_after_release_review_is_blocked(self) -> None:
        state = approved_state()
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "release review"):
            apply_website_template_upgrade(
                state,
                upgrade_website_release_package(
                    package(),
                    package_id="package-business-v2-late",
                    migration_id="migration-business-v1-v2-late",
                ),
                proof(4, "Release manager", "late upgrade"),
                expected_head_digest=state["headDigest"],
            )

    def test_template_component_drift_and_unprotected_target_are_rejected(self) -> None:
        invalid_template = website_release_template()
        invalid_template["components"][1]["version"] = 99
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "components"):
            build_website_release_package(
                package_id="package-template-drift",
                source=source(),
                template=invalid_template,
                brand=brand(),
                locales=locales(),
                media=media(),
                roles=roles(),
            )
        state = approved_state()
        candidate = project_website_release(state)["package"]
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "protection"):
            prepare_website_deploy_plan(
                state,
                plan_id="deploy-plan-unprotected",
                package_digest=candidate["packageDigest"],
                approval_id="release-approval-001",
                target={
                    "provider": "vercel",
                    "projectRef": "owner-bound-project",
                    "environment": "production",
                    "protection": "none",
                },
                previous_deployment=None,
                proof=proof(4, "Release manager", "unsafe target"),
                expected_head_digest=state["headDigest"],
            )

    def test_tampered_chain_and_backward_time_are_rejected(self) -> None:
        state = upgraded_state()
        tampered = deepcopy(state)
        tampered["commands"][0]["payload"]["package"]["brand"]["radiusPx"] = 31
        with self.assertRaises(WebsiteReleaseValidationError):
            validate_website_release_state(tampered)

        state = prepared_state()
        upgraded = upgrade_website_release_package(
            package(),
            package_id="package-business-v2-backward",
            migration_id="migration-business-v1-v2-backward",
        )
        backward = proof(2, "Release manager", "backward timestamp")
        backward["capturedAt"] = "2026-07-26T09:59:59+06:30"
        with self.assertRaisesRegex(WebsiteReleaseValidationError, "backwards"):
            apply_website_template_upgrade(
                state,
                upgraded,
                backward,
                expected_head_digest=state["headDigest"],
            )


if __name__ == "__main__":
    unittest.main()
