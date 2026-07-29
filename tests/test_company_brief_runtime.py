from __future__ import annotations

from copy import deepcopy
import unittest
from unittest.mock import patch
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from supermega_runtime.company_brief import build_managed_company_brief
from supermega_runtime.runtime import reduce_trial_state
from supermega_runtime.trial_runtime import create_trial_router
from supermega_runtime.trial_store import InMemoryTrialStore, TrialPrincipal, TrialState


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


class CompanyBriefRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryTrialStore(reducer=reduce_trial_state)
        self.human = TrialPrincipal("workspace-a", "actor-human", "human")
        self.agent = TrialPrincipal("workspace-a", "actor-agent", "agent")
        capabilities = (
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
        sessions = {"human": self.human, "agent": self.agent}

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

        replay = self.client.post("/api/trial/v1/company-brief/receipts", headers=headers, json=body)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["result"]["version"], 1)
        self.assertEqual(replay.json()["retention"]["idempotentReplay"], True)

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

    def test_unknown_intent_is_rejected_before_runtime(self) -> None:
        response = self.client.post(
            "/api/trial/v1/company-brief",
            headers={"x-test-session": "human"},
            json={"intent": "send_everything"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
