from __future__ import annotations

from copy import deepcopy
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.company_brief import (
    build_managed_company_brief,
    company_brief_receipt,
    company_state_with_receipt,
    validate_operating_baseline,
)
from supermega_runtime.managed_context import (
    MANAGED_CONTEXT_ALLOWED_USES,
    MANAGED_CONTEXT_FORBIDDEN_ACTIONS,
    build_managed_context_profile,
)
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialState, TrialValidationError


def commerce_state() -> dict[str, object]:
    return {
        "schema": "supermega.commerce.workspace.v2",
        "items": [
            {"sku": "SKU-LOW", "name": "Low stock item", "onHand": 2, "reorderAt": 2, "price": 12_000},
            {"sku": "SKU-OK", "name": "Ready stock item", "onHand": 20, "reorderAt": 5, "price": 18_000},
        ],
        "orders": [],
        "movements": [],
        "closes": [],
    }


def production_state() -> dict[str, object]:
    return {
        "schema": "supermega.production.workspace.v2",
        "revision": 0,
        "jobs": [
            {
                "id": "JOB-001",
                "line": "Packing",
                "product": "Retail pack",
                "target": 100,
                "output": 0,
                "owner": "Shift lead",
                "priority": "normal",
                "dueAt": "2026-07-31T09:00:00.000Z",
            }
        ],
        "issues": [],
        "machines": [{"id": "MACHINE-001", "name": "Packing line", "state": "running"}],
        "events": [],
    }


def website_state() -> dict[str, object]:
    return {
        "schema": "supermega.website.workspace.v2",
        "version": 2,
        "revision": 0,
        "contentRevision": 0,
        "siteName": "Managed client",
        "pages": [
            {
                "id": "page-home",
                "internalName": "Home",
                "slug": "/",
                "stage": "ready",
                "navigation": {"label": "Home", "visible": True},
                "hero": {
                    "eyebrow": "Managed business",
                    "headline": "A reviewed operating website",
                    "summary": "Current business information with a clear contact path.",
                    "ctaLabel": "Contact",
                    "ctaHref": "/contact/",
                },
                "sections": [
                    {
                        "id": "section-proof",
                        "eyebrow": "Proof",
                        "title": "Reviewed information",
                        "body": "The owner reviews every release record before publication.",
                    }
                ],
                "seo": {"title": "Managed client", "description": "Reviewed managed website."},
                "updatedAt": "2026-07-30T09:00:00.000Z",
            }
        ],
        "selectedPageId": "page-home",
        "evidence": [],
        "approvals": [],
        "localPublishes": [],
        "events": [],
    }


def managed_context_profile(preferred_product: str) -> dict[str, object]:
    product = {
        "commerce": "shop",
        "production": "plant",
        "website": "website",
        "ecommerce": "ecommerce",
    }[preferred_product]
    template = {
        "commerce": "social-commerce",
        "production": "production-control",
        "website": "business-presence",
        "ecommerce": "social-storefront",
    }[preferred_product]
    return build_managed_context_profile(
        {
            "contract": "supermega.managed_context_profile_request.v1",
            "version": 1,
            "product": product,
            "templateId": template,
            "sourceCounts": {
                "selectedProductRecords": 2,
                "behaviorSignals": 2,
                "reviewedDecisions": 1,
            },
            "behaviorPreference": {
                "product": preferred_product,
                "chosenCount": 2,
            },
            "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
            "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
            "ownerApproved": True,
            "rawProductRecordsIncluded": False,
            "modelTrainingAllowed": False,
        },
        workspace_id="workspace-a",
        actor_id="owner-a",
    )


class CompanyBriefUnitTests(unittest.TestCase):
    def test_attention_ranks_validated_cross_product_state_and_exposes_no_raw_rows(self) -> None:
        brief = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "commerce": TrialState("workspace-a", "commerce", 4, commerce_state(), "operator", "2026-07-30T08:00:00Z"),
                "production": TrialState("workspace-a", "production", 7, production_state(), "operator", "2026-07-30T08:05:00Z"),
                "website": TrialState("workspace-a", "website", 2, website_state(), "operator", "2026-07-30T08:10:00Z"),
            },
            approvals=[],
        )

        self.assertEqual(brief["contract"], "supermega.managed_company_brief.v1")
        self.assertEqual(brief["sourceCount"], 3)
        self.assertIn("Website still needs review evidence", brief["title"])
        self.assertEqual(brief["nextAction"]["path"], "/website/")
        self.assertEqual(brief["externalWritesPerformed"], False)
        self.assertNotIn("Low stock item", str(brief))
        self.assertRegex(str(brief["briefDigest"]), r"^sha256:[0-9a-f]{64}$")

    def test_malformed_managed_source_fails_closed_without_losing_other_sources(self) -> None:
        invalid_commerce = deepcopy(commerce_state())
        invalid_commerce["items"][0]["onHand"] = -1
        brief = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "commerce": TrialState("workspace-a", "commerce", 1, invalid_commerce),
                "production": TrialState("workspace-a", "production", 1, production_state()),
            },
            approvals=[],
        )

        self.assertEqual(brief["sourceCount"], 1)
        self.assertIn("Shop data needs repair", brief["title"])
        self.assertIn("excluded", brief["summary"])

    def test_same_managed_context_produces_same_digest(self) -> None:
        states = {"commerce": TrialState("workspace-a", "commerce", 1, commerce_state())}
        first = build_managed_company_brief(workspace_id="workspace-a", intent="shop_inventory", states=states, approvals=[])
        second = build_managed_company_brief(workspace_id="workspace-a", intent="shop_inventory", states=states, approvals=[])
        self.assertEqual(first["briefDigest"], second["briefDigest"])

    def test_stale_website_approval_and_snapshot_are_not_current_evidence(self) -> None:
        stale_state = website_state()
        stale_state["contentRevision"] = 2
        stale_state["approvals"] = [
            {
                "id": "approval-old",
                "migratedFromV1": False,
                "source": {"contentRevision": 1},
            }
        ]
        stale_state["localPublishes"] = [
            {
                "approvalId": "approval-old",
                "artifact": {"schema": "old-site"},
                "migratedFromV1": False,
                "source": {"contentRevision": 1},
            }
        ]
        with patch("supermega_runtime.company_brief.validate_website_state", return_value=stale_state):
            brief = build_managed_company_brief(
                workspace_id="workspace-a",
                intent="website_readiness",
                states={"website": TrialState("workspace-a", "website", 3, {"retained": "validated"})},
                approvals=[],
            )

        facts = {fact["label"]: fact["value"] for fact in brief["facts"]}
        self.assertEqual(facts["Approval"], "Missing")
        self.assertEqual(facts["Snapshot evidence"], "Missing")
        self.assertEqual(facts["Publish gate"], "Blocked")

    def test_retained_owner_context_breaks_equal_attention_ties_without_exposing_raw_rows(self) -> None:
        profile = managed_context_profile("website")
        tie_website = website_state()
        tie_website["approvals"] = [{
            "id": "approval-current",
            "migratedFromV1": False,
            "source": {"contentRevision": 0},
        }]
        with patch("supermega_runtime.company_brief.validate_website_state", return_value=tie_website):
            brief = build_managed_company_brief(
                workspace_id="workspace-a",
                intent="attention",
                states={
                    "company": TrialState(
                        "workspace-a",
                        "company",
                        1,
                        {"tasks": [], "managedContextProfile": profile},
                    ),
                    "commerce": TrialState("workspace-a", "commerce", 1, commerce_state()),
                    "website": TrialState("workspace-a", "website", 1, {"validated": "by patch"}),
                },
                approvals=[],
            )

        self.assertEqual(brief["nextAction"]["product"], "website")
        self.assertEqual(brief["ownerContext"]["profileDigest"], profile["profileDigest"])
        self.assertEqual(set(brief["ownerContext"]), {"contract", "version", "profileDigest", "preferredProduct"})
        self.assertNotIn("Low stock item", str(brief))

    def test_operational_severity_still_wins_over_retained_owner_preference(self) -> None:
        severe_commerce = commerce_state()
        severe_commerce["items"][0]["onHand"] = 0
        severe_commerce["items"][1]["onHand"] = 0
        brief = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "company": TrialState(
                    "workspace-a",
                    "company",
                    1,
                    {"tasks": [], "managedContextProfile": managed_context_profile("production")},
                ),
                "commerce": TrialState("workspace-a", "commerce", 1, severe_commerce),
                "production": TrialState("workspace-a", "production", 1, production_state()),
            },
            approvals=[],
        )

        self.assertEqual(brief["nextAction"]["product"], "shop")

    def test_critical_plant_event_outranks_large_routine_shop_queue(self) -> None:
        routine_shop = {
            "items": [],
            "orders": [
                {"status": "confirmed", "paymentStatus": "paid", "refundStatus": "none"}
                for _ in range(100)
            ],
            "storefrontRequests": [],
        }
        critical_plant = production_state()
        critical_plant["machines"][0]["state"] = "stopped"
        with patch("supermega_runtime.company_brief.validate_commerce_state", return_value=routine_shop):
            brief = build_managed_company_brief(
                workspace_id="workspace-a",
                intent="attention",
                states={
                    "commerce": TrialState("workspace-a", "commerce", 1, {"validated": "by patch"}),
                    "production": TrialState("workspace-a", "production", 1, critical_plant),
                },
                approvals=[],
            )
        self.assertEqual(brief["nextAction"]["product"], "plant")

    def test_cross_tenant_owner_context_is_not_exposed_or_used(self) -> None:
        foreign_profile = build_managed_context_profile(
            {
                **{
                    "contract": "supermega.managed_context_profile_request.v1",
                    "version": 1,
                    "product": "website",
                    "templateId": "business-presence",
                    "sourceCounts": {"selectedProductRecords": 1, "behaviorSignals": 1, "reviewedDecisions": 1},
                    "behaviorPreference": {"product": "website", "chosenCount": 1},
                    "allowedUses": list(MANAGED_CONTEXT_ALLOWED_USES),
                    "forbiddenActions": list(MANAGED_CONTEXT_FORBIDDEN_ACTIONS),
                    "ownerApproved": True,
                    "rawProductRecordsIncluded": False,
                    "modelTrainingAllowed": False,
                }
            },
            workspace_id="workspace-b",
            actor_id="owner-b",
        )
        brief = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "company": TrialState("workspace-a", "company", 1, {"tasks": [], "managedContextProfile": foreign_profile}),
                "commerce": TrialState("workspace-a", "commerce", 1, commerce_state()),
            },
            approvals=[],
        )
        self.assertIsNone(brief["ownerContext"])

    def test_foreign_or_swapped_product_states_fail_closed(self) -> None:
        cases = [
            {"commerce": TrialState("workspace-b", "commerce", 1, commerce_state())},
            {"commerce": TrialState("workspace-a", "production", 1, commerce_state())},
            {"unexpected": TrialState("workspace-a", "commerce", 1, commerce_state())},
        ]
        for states in cases:
            with self.subTest(states=states):
                with self.assertRaisesRegex(TrialValidationError, "managed state identity|unexpected managed surface"):
                    build_managed_company_brief(
                        workspace_id="workspace-a",
                        intent="attention",
                        states=states,
                        approvals=[],
                    )

    def test_critical_plant_safety_outranks_unrelated_invalid_shop_source(self) -> None:
        invalid_commerce = commerce_state()
        invalid_commerce["items"][0]["onHand"] = -1
        critical_plant = production_state()
        critical_plant["machines"][0]["state"] = "stopped"
        critical_plant["revision"] = 1
        critical_plant["events"] = [{
            "id": "EVT-machine-stop-001",
            "actionId": "machine-stop-001",
            "createdAt": "2026-07-30T09:30:00.000Z",
            "actor": "shift-lead",
            "reason": "Observed the packing line stopped during the shift check.",
            "evidenceReference": "PLANT-MACHINE-STOP-001",
            "kind": "machine_state_changed",
            "subjectId": "MACHINE-001",
            "summary": "Packing line: running to stopped",
            "fromState": "running",
            "toState": "stopped",
        }]
        brief = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "commerce": TrialState("workspace-a", "commerce", 1, invalid_commerce),
                "production": TrialState("workspace-a", "production", 1, critical_plant),
            },
            approvals=[],
        )
        self.assertEqual(brief["nextAction"]["product"], "plant")
        self.assertIn("production blockers", brief["title"])

    def test_operating_baseline_is_aggregate_only_and_explains_changed_attention(self) -> None:
        first = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={"commerce": TrialState("workspace-a", "commerce", 1, commerce_state())},
            approvals=[],
        )
        baseline = validate_operating_baseline(first["operatingBaseline"], workspace_id="workspace-a")
        self.assertEqual(first["operatingChange"]["status"], "first_checkpoint")
        self.assertEqual(baseline["coverage"]["readyProducts"], 1)
        self.assertEqual(baseline["products"]["shop"]["lowStock"], 1)
        self.assertEqual(baseline["rawRecordsIncluded"], False)
        self.assertNotIn("Low stock item", str(baseline))

        company = company_state_with_receipt(
            {"tasks": []},
            company_brief_receipt(first),
        )
        more_attention = commerce_state()
        more_attention["items"][1]["onHand"] = 0
        changed = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "company": TrialState("workspace-a", "company", 1, company),
                "commerce": TrialState("workspace-a", "commerce", 2, more_attention),
            },
            approvals=[],
        )
        self.assertEqual(changed["operatingChange"]["status"], "changed")
        self.assertEqual(changed["operatingChange"]["changedProducts"], ["shop"])
        self.assertEqual(changed["operatingChange"]["attentionIncreased"], ["shop"])
        self.assertEqual(changed["operatingChange"]["attentionDecreased"], [])
        self.assertEqual(changed["operatingChange"]["rawRecordsIncluded"], False)

        retained_changed = company_state_with_receipt(company, company_brief_receipt(changed))
        replay = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="attention",
            states={
                "company": TrialState("workspace-a", "company", 2, retained_changed),
                "commerce": TrialState("workspace-a", "commerce", 2, more_attention),
            },
            approvals=[],
        )
        self.assertEqual(replay["briefDigest"], changed["briefDigest"])
        self.assertEqual(replay["operatingChange"], changed["operatingChange"])

    def test_operating_checkpoint_history_rolls_over_and_discards_malformed_or_foreign_baselines(self) -> None:
        state: dict[str, object] = {"tasks": []}
        for version in range(1, 36):
            brief = build_managed_company_brief(
                workspace_id="workspace-a",
                intent="shop_inventory",
                states={"commerce": TrialState("workspace-a", "commerce", version, commerce_state())},
                approvals=[],
            )
            state = company_state_with_receipt(state, company_brief_receipt(brief))
        self.assertEqual(len(state["briefReceipts"]), 30)

        malformed = deepcopy(state)
        malformed["briefReceipts"] = [
            {"contract": "supermega.managed_company_brief_receipt.v1", "rawRows": [{"secret": "drop"}]},
            *malformed["briefReceipts"],
        ]
        latest = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="shop_inventory",
            states={"commerce": TrialState("workspace-a", "commerce", 40, commerce_state())},
            approvals=[],
        )
        recovered = company_state_with_receipt(malformed, company_brief_receipt(latest))
        self.assertEqual(len(recovered["briefReceipts"]), 30)
        self.assertNotIn("rawRows", str(recovered["briefReceipts"]))

        foreign = build_managed_company_brief(
            workspace_id="workspace-b",
            intent="shop_inventory",
            states={"commerce": TrialState("workspace-b", "commerce", 1, commerce_state())},
            approvals=[],
        )
        isolated = build_managed_company_brief(
            workspace_id="workspace-a",
            intent="shop_inventory",
            states={
                "company": TrialState(
                    "workspace-a",
                    "company",
                    1,
                    {"tasks": [], "briefReceipts": [company_brief_receipt(foreign)]},
                ),
                "commerce": TrialState("workspace-a", "commerce", 1, commerce_state()),
            },
            approvals=[],
        )
        self.assertEqual(isolated["operatingChange"]["status"], "first_checkpoint")


class CompanyBriefRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        self.human = TrialPrincipal("workspace-a", "actor-human", "human")
        self.agent = TrialPrincipal("workspace-a", "actor-agent", "agent")
        self.writer = TrialPrincipal("workspace-a", "actor-writer", "human")
        capabilities = (
            "company.baseline.approve",
            "company.write",
            "commerce.read",
            "production.read",
            "website.read",
            "approvals.read",
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-human",
            actor_kind="human",
            capabilities=capabilities,
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-agent",
            actor_kind="agent",
            capabilities=capabilities,
        )
        self.store.provision_membership(
            workspace_id="workspace-a",
            actor_id="actor-writer",
            actor_kind="human",
            capabilities=tuple(capability for capability in capabilities if capability != "company.baseline.approve"),
        )
        sessions = {"human": self.human, "agent": self.agent, "writer": self.writer}

        def resolve_principal(request: Request) -> TrialPrincipal | None:
            return sessions.get(request.headers.get("x-test-session", ""))

        app = FastAPI()
        app.include_router(create_trial_router(store=self.store, resolve_principal=resolve_principal))
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()

    def test_read_then_retain_company_brief_is_audited_and_idempotent(self) -> None:
        headers = {"x-test-session": "human"}
        response = self.client.post("/api/trial/v1/company-brief", headers=headers, json={"intent": "attention"})
        self.assertEqual(response.status_code, 200)
        brief = response.json()["brief"]
        self.assertEqual(brief["sourceCount"], 0)
        self.assertEqual(brief["companyVersion"], 0)
        self.assertEqual(brief["retention"], "reproducible_not_persisted")
        self.assertEqual(brief["operatingChange"]["status"], "first_checkpoint")
        self.assertEqual(brief["operatingBaseline"]["rawRecordsIncluded"], False)

        command_id = str(uuid4())
        body = {
            "command_id": command_id,
            "intent": "attention",
            "brief_digest": brief["briefDigest"],
            "expected_company_version": 0,
        }
        retained = self.client.post("/api/trial/v1/company-brief/receipts", headers=headers, json=body)
        self.assertEqual(retained.status_code, 200)
        payload = retained.json()
        self.assertEqual(payload["result"]["version"], 1)
        self.assertEqual(payload["retention"]["internalWritePerformed"], True)
        self.assertEqual(payload["retention"]["externalWritesPerformed"], False)
        self.assertEqual(len(payload["result"]["state"]["briefReceipts"]), 1)
        self.assertEqual(
            payload["result"]["state"]["briefReceipts"][0]["operatingBaseline"]["baselineDigest"],
            brief["operatingBaseline"]["baselineDigest"],
        )

        replay = self.client.post("/api/trial/v1/company-brief/receipts", headers=headers, json=body)
        self.assertEqual(replay.status_code, 200)
        self.assertNotIn("result", replay.json())
        self.assertEqual(replay.json()["brief"]["companyVersion"], 1)
        self.assertEqual(replay.json()["retention"]["status"], "already_retained")
        self.assertEqual(replay.json()["retention"]["internalWritePerformed"], False)
        self.assertEqual(replay.json()["retention"]["idempotentReplay"], True)
        self.assertEqual(replay.json()["brief"]["operatingChange"], brief["operatingChange"])

        new_command = {**body, "command_id": str(uuid4()), "expected_company_version": 1}
        domain_replay = self.client.post("/api/trial/v1/company-brief/receipts", headers=headers, json=new_command)
        self.assertEqual(domain_replay.status_code, 200)
        self.assertEqual(domain_replay.json()["brief"]["companyVersion"], 1)
        self.assertEqual(domain_replay.json()["retention"]["status"], "already_retained")
        self.assertEqual(len(self.store._events), 1)

        refreshed = self.client.post("/api/trial/v1/company-brief", headers=headers, json={"intent": "attention"})
        self.assertEqual(refreshed.status_code, 200)
        self.assertEqual(refreshed.json()["brief"]["retention"], "persisted_managed_audit")

        stale_new_command = {**body, "command_id": str(uuid4())}
        stale = self.client.post("/api/trial/v1/company-brief/receipts", headers=headers, json=stale_new_command)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"]["code"], "trial_version_conflict")
        self.assertEqual(len(self.store._events), 1)

    def test_changed_brief_digest_and_agent_retention_fail_closed(self) -> None:
        body = {
            "command_id": str(uuid4()),
            "intent": "attention",
            "brief_digest": f"sha256:{'a' * 64}",
            "expected_company_version": 0,
        }
        changed = self.client.post("/api/trial/v1/company-brief/receipts", headers={"x-test-session": "human"}, json=body)
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(changed.json()["detail"]["code"], "company_brief_changed")

        current = self.client.post("/api/trial/v1/company-brief", headers={"x-test-session": "agent"}, json={"intent": "attention"}).json()["brief"]
        body["brief_digest"] = current["briefDigest"]
        denied = self.client.post("/api/trial/v1/company-brief/receipts", headers={"x-test-session": "agent"}, json=body)
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.json()["detail"]["code"], "trial_human_approval_required")

        owner_capability_denied = self.client.post(
            "/api/trial/v1/company-brief/receipts",
            headers={"x-test-session": "writer"},
            json=body,
        )
        self.assertEqual(owner_capability_denied.status_code, 403)
        self.assertEqual(owner_capability_denied.json()["detail"]["code"], "trial_capability_required")
        self.assertEqual(
            owner_capability_denied.json()["detail"]["required_capability"],
            "company.baseline.approve",
        )

    def test_generic_company_snapshot_bypass_is_rejected(self) -> None:
        response = self.client.post(
            "/api/trial/v1/commands",
            headers={"x-test-session": "human"},
            json={
                "command_id": str(uuid4()),
                "surface": "company",
                "event_type": "company.snapshot.saved",
                "expected_version": 0,
                "payload": {"state": {"tasks": [], "briefReceipts": []}},
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "company_write_requires_dedicated_workflow")

    def test_brief_retention_rejects_version_only_source_drift(self) -> None:
        headers = {"x-test-session": "human"}
        self.store._states[("workspace-a", "commerce")] = TrialState(
            "workspace-a",
            "commerce",
            1,
            commerce_state(),
            "actor-human",
            "2026-07-30T10:00:00Z",
        )
        brief = self.client.post(
            "/api/trial/v1/company-brief",
            headers=headers,
            json={"intent": "attention"},
        ).json()["brief"]
        self.store._states[("workspace-a", "commerce")] = TrialState(
            "workspace-a",
            "commerce",
            2,
            commerce_state(),
            "actor-human",
            "2026-07-30T10:01:00Z",
        )
        response = self.client.post(
            "/api/trial/v1/company-brief/receipts",
            headers=headers,
            json={
                "command_id": str(uuid4()),
                "intent": "attention",
                "brief_digest": brief["briefDigest"],
                "expected_company_version": 0,
            },
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "company_brief_changed")
        self.assertEqual(self.store.get_state(self.human, "company").version, 0)

    def test_unknown_intent_is_rejected_before_runtime(self) -> None:
        response = self.client.post(
            "/api/trial/v1/company-brief",
            headers={"x-test-session": "human"},
            json={"intent": "send_everything"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
