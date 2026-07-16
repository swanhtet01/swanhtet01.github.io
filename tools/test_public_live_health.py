#!/usr/bin/env python3
"""Deterministic tests for the read-only SuperMega portfolio monitor."""

from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_public_live_health as checker


BASE = "https://public.example/"
WWW = "https://www.example/"
APP = "https://app.example/"
DEMO = "https://demo.example/"
POS = "https://pos.example/"
CONSOLE = "https://console.example/"
AGENT_INTAKE = f"{BASE}contact/?from=ai-agent-solution"
SHOP_WORKSPACE_INTAKE = f"{BASE}contact/?from=shop-workspace"
PLANT_WORKSPACE_INTAKE = f"{BASE}contact/?from=plant-workspace"


def result(url: str, body: str | dict, *, status: int = 200, headers: dict[str, str] | None = None):
    encoded = json.dumps(body).encode() if isinstance(body, dict) else body.encode()
    return checker.HttpResult(url=url, status=status, headers=headers or {}, body=encoded)


def page(*tokens: str) -> str:
    return "<!doctype html>" + "\n".join(tokens) + ("x" * 1400)


def healthy_responses() -> dict[str, checker.HttpResult]:
    home = page(
        "<title>supermega.dev | Shop and Plant, ready for real work.</title>",
        '<h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>',
        "https://app.supermega.dev/?demo=shop",
        "https://app.supermega.dev/?demo=plant",
        "/contact/",
        ">Talk to us</a>",
        "Shop and Plant, ready for real work.",
        "Open Shop demo",
        "No signup",
        "Private setup",
        "Bring us the handoff that still breaks.",
        "data-public-status",
    )
    contact = page(
        "<title>Contact | supermega.dev</title>",
        "What should run better?",
        'action="/api/contact-submissions"',
        'name="name"',
        'name="email"',
        'name="company"',
        'name="goal"',
        "No account or data connection is made before you approve it.",
    )
    agent_contact = page(
        "entryIntent==='ai-agent-solution'",
        "entryIntent==='shop-workspace'?'Shop':entryIntent==='plant-workspace'?'Plant':''",
        "What do you want to improve?",
        "Start here",
        "What should work better?",
        "idleSubmitLabel='Contact us'",
        "text('[data-contact-heading]','Request a private '+workspaceProduct+' workspace.')",
        "idleSubmitLabel='Request workspace'",
        "one reviewed example",
        'action="/api/contact-submissions"',
        'name="name"',
        'name="email"',
        'name="company"',
        'name="goal"',
    )
    privacy = page(
        "<title>Privacy | supermega.dev</title>",
        "Only the details needed to reply.",
    )
    app_shell = page(
        "<title>Shop | supermega.dev</title>",
        '<div id="root"></div>',
        '<script type="module" crossorigin src="/assets/index-current.js"></script>',
    )
    demo = page(
        "<title>SuperMega - open the app</title>",
        "Open a working Shop workspace or Shop POS demo.",
        "https://app.supermega.dev/",
        "https://pos.supermega.dev/?demo=",
        'data-en="Open Shop POS"',
        'data-my="Shop POS ဖွင့်ရန်"',
        "assets/noto-sans-myanmar.woff2",
        "Shop POS Shop POS Shop POS Shop POS",
    )
    pos = page(
        "<title>Shop - the simple POS for Myanmar businesses</title>",
        '<link rel="canonical" href="https://pos.supermega.dev/" />',
        '<meta property="og:site_name" content="Shop" />',
        '"name": "Shop"',
        '<div id="root"></div>',
    )
    console = page(
        "<title>SuperMega Operations</title>",
        "Private control plane",
        '<h1 id="ownerGateTitle">Owner access</h1>',
        "Shop and Plant users do not need this console.",
        'id="consoleShell" hidden',
        "async function validateOwnerAccess()",
        "function setConsoleAccess(unlocked,message='')",
        "if(!consoleAccessGranted||!CONSOLE_VIEWS.includes(view))return",
        'data-view="company"',
        'id="view-company"',
        "I reviewed this exact client, evidence, assignments, and budget",
        "api('POST','/api/agent-company',{action:'plan',...input})",
        "api('POST','/api/agent-company',{action:'work-order-create',...companyDraft.input})",
        "api('POST','/api/agent-company',{action:'work-order-run'",
        "api('POST','/api/agent-company',{action:'work-order-cancel'",
        "api('POST','/api/agent-company',{action:'work-order-evaluate'",
        "api('POST','/api/agent-company',{action:'work-order-proof'",
        "async function recordCompanyWorkOrderReview(event,order)",
        "action:'work-order-review'",
        "action:'operations-report'",
        "CANCEL AND SCRUB ${order.workOrderId} ${order.planHash}",
        "cancelled excluded from delivery metrics",
    )
    contact_status = {"status": "ready", "service": "supermega-contact"}
    app_health = {
        "ok": True,
        "status": "ready",
        "service": "supermega-product-app",
        "contractVersion": 1,
        "portfolio": {
            "products": ["shop", "plant"],
            "demos": {
                "shop": {"entry": "/?demo=shop", "route": "/home"},
                "plant": {"entry": "/?demo=plant", "route": "/factory"},
            },
            "agentSolutions": {
                "intake": "https://supermega.dev/contact/?from=ai-agent-solution",
                "externalActions": "approval-gated",
            },
        },
        "proof": {
            "workingDemos": True,
            "productionCloudDurability": "not-asserted",
            "realCustomerAcceptance": "not-asserted",
        },
    }
    kernel_status = {
        "ok": True,
        "service": "supermega-kernel",
        "db": {"ok": True, "mode": "supabase"},
        "connectors": {"total": 69, "configured": 12, "registrationErrors": 0},
        "ai": {"providers": ["anthropic"], "primary": "anthropic"},
        "agentCompany": {
            "plannerReady": True,
            "actionMode": "draft_only",
            "maxAgents": 2,
            "maxRoleBudget": 8,
            "probeMode": "plan_only",
            "modelRequest": False,
            "durableClaimCreated": False,
            "externalWrites": False,
        },
    }

    responses = {
        BASE: result(BASE, home),
        WWW: result(WWW, home),
        f"{BASE}contact/": result(f"{BASE}contact/", contact),
        AGENT_INTAKE: result(AGENT_INTAKE, agent_contact),
        SHOP_WORKSPACE_INTAKE: result(SHOP_WORKSPACE_INTAKE, agent_contact),
        PLANT_WORKSPACE_INTAKE: result(PLANT_WORKSPACE_INTAKE, agent_contact),
        f"{BASE}privacy/": result(f"{BASE}privacy/", privacy),
        f"{BASE}api/contact-submissions/status": result(
            f"{BASE}api/contact-submissions/status", contact_status
        ),
        f"{BASE}api/contact-submissions/status?detail=1": result(
            f"{BASE}api/contact-submissions/status?detail=1",
            {"status": "error", "reason": "operator_auth_required"},
            status=401,
        ),
        f"{APP}home": result(f"{APP}home", app_shell),
        f"{APP}factory": result(f"{APP}factory", app_shell),
        f"{APP}assets/index-current.js": result(
            f"{APP}assets/index-current.js", "Shop" + ("x" * 1400)
        ),
        f"{APP}api/health": result(f"{APP}api/health", app_health),
        POS: result(POS, pos),
        f"{POS}api/health": result(
            f"{POS}api/health",
            {"ok": True, "service": "supermega-shop-pos", "status": "ready"},
        ),
        f"{POS}api/health?detail=1": result(
            f"{POS}api/health?detail=1",
            {"error": "operator_auth_required"},
            status=401,
        ),
        f"{POS}api/pipeline-leads": result(
            f"{POS}api/pipeline-leads",
            {
                "checkedAt": "2026-07-14T16:27:03.781Z",
                "configured": True,
                "dataBoundary": "Stores Shop prospect metadata only; do not submit customer sales, payment payloads, or private shop data.",
                "detail": "Shop lead intake is ready.",
                "leadCount": 1,
                "mode": "shop-lead-intake",
                "ok": True,
                "protectedRead": True,
                "store": {"provider": "vercel-blob-private"},
                "updatedAt": "2026-06-29T07:50:10.273Z",
                "writeProtected": True,
                "authorized": False,
                "leads": [],
            },
            headers={"Cache-Control": "no-store"},
        ),
        DEMO: result(
            DEMO,
            demo,
            headers={
                "Content-Type": "text/html; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "SAMEORIGIN",
                "Referrer-Policy": "strict-origin-when-cross-origin",
            },
        ),
        CONSOLE: result(CONSOLE, console),
        f"{CONSOLE}api/status": result(f"{CONSOLE}api/status", kernel_status),
        f"{CONSOLE}api/agent-company": result(
            f"{CONSOLE}api/agent-company",
            {"ok": False, "reason": "unauthorized"},
            status=401,
        ),
    }
    for path in ("products/", "pricing/", "ai-agents/", "offers/"):
        url = f"{BASE}{path}"
        responses[url] = result(url, "", status=308, headers={"Location": "/"})
    return responses


class PortfolioHealthTest(unittest.TestCase):
    def run_report(self, responses: dict[str, checker.HttpResult]):
        def fake_fetch(url: str, **_kwargs):
            return responses[url]

        with patch.object(checker, "fetch", side_effect=fake_fetch):
            return checker.run(BASE, WWW, APP, DEMO, POS, CONSOLE, timeout=1, attempts=1)

    def test_healthy_portfolio_passes_all_twenty_five_checks(self):
        report = self.run_report(healthy_responses())
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["checks"], 25)
        self.assertEqual(report["failures"], [])

    def test_shop_pos_health_rejects_internal_fields(self):
        responses = healthy_responses()
        health_url = f"{POS}api/health"
        payload = json.loads(responses[health_url].body)
        payload["project"] = "internal-project"
        responses[health_url] = result(health_url, payload)
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "shop_pos_health")
        self.assertIn("payload_keys", failure["mismatches"])

    def test_unprotected_shop_pos_diagnostics_fails_guard(self):
        responses = healthy_responses()
        diagnostics_url = f"{POS}api/health?detail=1"
        responses[diagnostics_url] = result(
            diagnostics_url,
            {"ok": True, "project": "internal-project"},
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(
            item for item in report["failures"] if item["kind"] == "shop_pos_diagnostics_guard"
        )
        self.assertEqual(failure["status"], 200)
        self.assertIn("payload_keys", failure["mismatches"])

    def test_shop_pipeline_guard_requires_protected_empty_public_posture(self):
        pipeline_url = f"{POS}api/pipeline-leads"
        for field, value in (
            ("writeProtected", False),
            ("protectedRead", False),
            ("authorized", True),
            ("leads", [{"id": "must-not-be-public"}]),
        ):
            with self.subTest(field=field):
                responses = healthy_responses()
                payload = json.loads(responses[pipeline_url].body)
                payload[field] = value
                responses[pipeline_url] = result(
                    pipeline_url,
                    payload,
                    headers={"Cache-Control": "no-store"},
                )
                report = self.run_report(responses)
                self.assertEqual(report["status"], "error")
                failure = next(
                    item for item in report["failures"] if item["kind"] == "shop_pipeline_guard"
                )
                self.assertIn(field, failure["mismatches"])

    def test_shop_pipeline_guard_rejects_internal_path_and_retired_identity(self):
        responses = healthy_responses()
        pipeline_url = f"{POS}api/pipeline-leads"
        payload = json.loads(responses[pipeline_url].body)
        payload["store"]["pathname"] = "deskpos-pipeline/leads/latest.json"
        payload["dataBoundary"] = "Stores DeskPOS prospect metadata."
        responses[pipeline_url] = result(
            pipeline_url,
            payload,
            headers={"Cache-Control": "no-store"},
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "shop_pipeline_guard")
        self.assertIn("store_keys", failure["mismatches"])
        self.assertIn("DeskPOS", failure["unexpected"])
        self.assertIn("deskpos-pipeline", failure["unexpected"])
        self.assertIn("pathname", failure["unexpected"])

    def test_shop_pipeline_guard_rejects_cacheable_or_oversized_responses(self):
        pipeline_url = f"{POS}api/pipeline-leads"
        for response in (
            result(pipeline_url, json.loads(healthy_responses()[pipeline_url].body)),
            result(pipeline_url, "x" * (checker.PIPELINE_MAX_BYTES + 1)),
        ):
            with self.subTest(bytes=len(response.body)):
                responses = healthy_responses()
                responses[pipeline_url] = response
                report = self.run_report(responses)
                self.assertEqual(report["status"], "error")
                self.assertTrue(
                    any(item["kind"] == "shop_pipeline_guard" for item in report["failures"])
                )

    def test_retired_identity_or_legacy_host_fails_shop_pos_page(self):
        for token in ("MegaOS", "<title>DeskPOS", "spa-desk-pilot.vercel.app"):
            with self.subTest(token=token):
                responses = healthy_responses()
                responses[POS] = result(POS, responses[POS].body.decode() + token)
                report = self.run_report(responses)
                self.assertEqual(report["status"], "error")
                failure = next(item for item in report["failures"] if item["kind"] == "shop_pos_page")
                self.assertIn(token, failure["unexpected"])

    def test_public_contact_status_rejects_internal_fields(self):
        responses = healthy_responses()
        status_url = f"{BASE}api/contact-submissions/status"
        payload = json.loads(responses[status_url].body)
        payload["lead_ledger"] = "configured"
        responses[status_url] = result(status_url, payload)
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "conversion_api")
        self.assertIn("payload_keys", failure["mismatches"])

    def test_unprotected_contact_diagnostics_fails_guard(self):
        responses = healthy_responses()
        diagnostics_url = f"{BASE}api/contact-submissions/status?detail=1"
        responses[diagnostics_url] = result(
            diagnostics_url,
            {"status": "ready", "lead_ledger": "configured"},
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(
            item for item in report["failures"] if item["kind"] == "conversion_diagnostics_guard"
        )
        self.assertEqual(failure["status"], 200)
        self.assertIn("payload_keys", failure["mismatches"])

    def test_retired_product_name_fails_demo_page(self):
        responses = healthy_responses()
        responses[DEMO] = result(
            DEMO,
            responses[DEMO].body.decode() + "DeskPOS",
            headers=responses[DEMO].headers,
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "demo_shop_pos")
        self.assertIn("DeskPOS", failure["unexpected"])

    def test_missing_burmese_action_fails_demo_page(self):
        responses = healthy_responses()
        responses[DEMO] = result(
            DEMO,
            responses[DEMO].body.decode().replace('data-my="Shop POS ဖွင့်ရန်"', ""),
            headers=responses[DEMO].headers,
        )
        report = self.run_report(responses)
        failure = next(item for item in report["failures"] if item["kind"] == "demo_shop_pos")
        self.assertIn('data-my="Shop POS ဖွင့်ရန်"', failure["missing"])

    def test_invalid_demo_security_header_fails_closed(self):
        responses = healthy_responses()
        responses[DEMO].headers["X-Frame-Options"] = "ALLOWALL"
        report = self.run_report(responses)
        failure = next(item for item in report["failures"] if item["kind"] == "demo_shop_pos")
        self.assertIn("x-frame-options", failure["header_mismatches"])

    def test_redirected_or_oversized_demo_fails_closed(self):
        for response in (
            result(DEMO, "", status=308, headers={"Location": "https://other.example/"}),
            result(DEMO, "x" * (checker.DEMO_MAX_BYTES + 1)),
        ):
            with self.subTest(status=response.status, bytes=len(response.body)):
                responses = healthy_responses()
                responses[DEMO] = response
                report = self.run_report(responses)
                self.assertEqual(report["status"], "error")
                self.assertTrue(any(item["kind"] == "demo_shop_pos" for item in report["failures"]))

    def test_missing_agent_context_fails_first_proof_route(self):
        responses = healthy_responses()
        responses[AGENT_INTAKE] = result(
            AGENT_INTAKE,
            responses[AGENT_INTAKE].body.decode().replace("idleSubmitLabel='Contact us'", ""),
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_intake_page")
        self.assertEqual(failure["url"], AGENT_INTAKE)
        self.assertIn("idleSubmitLabel='Contact us'", failure["missing"])

    def test_technical_intake_field_fails_first_proof_route(self):
        responses = healthy_responses()
        responses[AGENT_INTAKE] = result(
            AGENT_INTAKE,
            responses[AGENT_INTAKE].body.decode() + 'name="workflow"',
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_intake_page")
        self.assertIn('name="workflow"', failure["unexpected"])

    def test_missing_workspace_context_fails_product_intake(self):
        responses = healthy_responses()
        responses[SHOP_WORKSPACE_INTAKE] = result(
            SHOP_WORKSPACE_INTAKE,
            responses[SHOP_WORKSPACE_INTAKE].body.decode().replace("idleSubmitLabel='Request workspace'", ""),
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "shop_workspace_intake_page")
        self.assertIn("idleSubmitLabel='Request workspace'", failure["missing"])

    def test_missing_plant_link_fails_public_page(self):
        responses = healthy_responses()
        responses[BASE] = result(BASE, responses[BASE].body.decode().replace("https://app.supermega.dev/?demo=plant", ""))
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        self.assertTrue(any(item["kind"] == "page" and item["url"] == BASE for item in report["failures"]))

    def test_missing_public_contact_entry_fails_public_page(self):
        responses = healthy_responses()
        responses[BASE] = result(BASE, responses[BASE].body.decode().replace(">Talk to us</a>", ""))
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "page" and item["url"] == BASE)
        self.assertIn(">Talk to us</a>", failure["missing"])

    def test_console_owner_gate_is_required(self):
        responses = healthy_responses()
        responses[CONSOLE] = result(
            CONSOLE,
            responses[CONSOLE].body.decode().replace('id="consoleShell" hidden', ""),
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_company_page")
        self.assertIn('id="consoleShell" hidden', failure["missing"])

    def test_retired_product_name_fails_public_page(self):
        responses = healthy_responses()
        responses[BASE] = result(BASE, responses[BASE].body.decode() + "DeskPOS")
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "page" and item["url"] == BASE)
        self.assertIn("DeskPOS", failure["unexpected"])

    def test_unproven_account_claim_fails_public_page(self):
        for claim in (
            "Use one account across desktop, tablet, and mobile.",
            "Create a workspace only when you want to keep your work and use it across devices.",
            "Create with email and password. Return with your password or an email code.",
        ):
            with self.subTest(claim=claim):
                responses = healthy_responses()
                responses[BASE] = result(BASE, responses[BASE].body.decode() + claim)
                report = self.run_report(responses)
                self.assertEqual(report["status"], "error")
                failure = next(
                    item
                    for item in report["failures"]
                    if item["kind"] == "page" and item["url"] == BASE
                )
                self.assertIn(claim, failure["unexpected"])

    def test_unproven_cloud_claim_fails_health_contract(self):
        responses = healthy_responses()
        payload = copy.deepcopy(json.loads(responses[f"{APP}api/health"].body))
        payload["proof"]["productionCloudDurability"] = "ready"
        responses[f"{APP}api/health"] = result(f"{APP}api/health", payload)
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        health_failure = next(item for item in report["failures"] if item["kind"] == "app_health")
        self.assertIn("proof.productionCloudDurability", health_failure["mismatches"])

    def test_retired_megaos_name_fails_shop_bundle(self):
        for retired_name in ("MegaOS", "Mega OS"):
            with self.subTest(retired_name=retired_name):
                responses = healthy_responses()
                asset_url = f"{APP}assets/index-current.js"
                responses[asset_url] = result(asset_url, f"Shop {retired_name}" + ("x" * 1400))
                report = self.run_report(responses)
                self.assertEqual(report["status"], "error")
                failure = next(item for item in report["failures"] if item["kind"] == "shop_brand_bundle")
                self.assertEqual(failure["unexpected"], [retired_name])

    def test_missing_review_gate_fails_agent_company_page(self):
        responses = healthy_responses()
        responses[CONSOLE] = result(
            CONSOLE,
            responses[CONSOLE].body.decode().replace(
                "I reviewed this exact client, evidence, assignments, and budget", ""
            ),
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_company_page")
        self.assertIn(
            "I reviewed this exact client, evidence, assignments, and budget",
            failure["missing"],
        )

    def test_kernel_registration_fault_fails_agent_company_status(self):
        responses = healthy_responses()
        payload = copy.deepcopy(json.loads(responses[f"{CONSOLE}api/status"].body))
        payload["connectors"]["registrationErrors"] = 1
        responses[f"{CONSOLE}api/status"] = result(f"{CONSOLE}api/status", payload)
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_company_status")
        self.assertIn("connectors.registrationErrors", failure["mismatches"])

    def test_unready_agent_company_planner_fails_status(self):
        responses = healthy_responses()
        payload = copy.deepcopy(json.loads(responses[f"{CONSOLE}api/status"].body))
        payload["agentCompany"]["plannerReady"] = False
        payload["agentCompany"]["actionMode"] = "unavailable"
        responses[f"{CONSOLE}api/status"] = result(f"{CONSOLE}api/status", payload)
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_company_status")
        self.assertIn("agentCompany.plannerReady", failure["mismatches"])
        self.assertIn("agentCompany.actionMode", failure["mismatches"])

    def test_unprotected_agent_company_endpoint_fails_guard(self):
        responses = healthy_responses()
        responses[f"{CONSOLE}api/agent-company"] = result(
            f"{CONSOLE}api/agent-company",
            {"ok": True, "agents": []},
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_company_guard")
        self.assertEqual(failure["status"], 200)


if __name__ == "__main__":
    unittest.main()
