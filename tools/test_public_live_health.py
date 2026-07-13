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
CONSOLE = "https://console.example/"
AGENT_INTAKE = f"{BASE}contact/?from=ai-agent-solution"


def result(url: str, body: str | dict, *, status: int = 200, headers: dict[str, str] | None = None):
    encoded = json.dumps(body).encode() if isinstance(body, dict) else body.encode()
    return checker.HttpResult(url=url, status=status, headers=headers or {}, body=encoded)


def page(*tokens: str) -> str:
    return "<!doctype html>" + "\n".join(tokens) + ("x" * 1400)


def healthy_responses() -> dict[str, checker.HttpResult]:
    home = page(
        "<title>supermega.dev | Shop, Plant and AI Agent Solutions</title>",
        '<h1 id="portfolio-heading">Shop. Plant. AI Agent Solutions.</h1>',
        "https://app.supermega.dev/?demo=shop",
        "https://app.supermega.dev/?demo=plant",
        "/contact/?from=ai-agent-solution",
        "external actions approval-gated",
        "data-public-status",
    )
    contact = page(
        "<title>Contact | supermega.dev</title>",
        "What needs to work better?",
        'action="/api/contact-submissions"',
        'name="name"',
        'name="email"',
        'name="company"',
        'name="goal"',
        "No account or data connection is made before you approve it.",
    )
    agent_contact = page(
        "search.get('from')==='ai-agent-solution'",
        "document.title='AI Agent Solution | supermega.dev'",
        "What should your agent handle every week?",
        "Request an agent proof",
        "What does your team repeat?",
        "Request first proof",
        "one redacted sample and one reviewed output",
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
        "<title>Shop - SuperMega</title>",
        '<div id="root"></div>',
        '<script type="module" crossorigin src="/assets/index-current.js"></script>',
    )
    console = page(
        "<title>SuperMega Console</title>",
        'data-view="company"',
        'id="view-company"',
        "Plan, queue, dispatch, evaluate, and deliver one bounded specialist wave",
        "I reviewed this exact client, evidence, assignments, and budget",
        "api('POST','/api/agent-company',{action:'plan',...input})",
        "api('POST','/api/agent-company',{action:'work-order-create',...companyDraft.input})",
        "api('POST','/api/agent-company',{action:'work-order-run'",
        "api('POST','/api/agent-company',{action:'work-order-cancel'",
        "api('POST','/api/agent-company',{action:'work-order-evaluate'",
        "api('POST','/api/agent-company',{action:'work-order-proof'",
        "api('POST','/api/agent-company',{action:'work-order-review'",
        "action:'operations-report'",
        "CANCEL AND SCRUB ${order.workOrderId} ${order.planHash}",
        "cancelled excluded from delivery metrics",
    )
    contact_status = {
        "status": "ready",
        "lead_ledger": "configured",
        "pipeline_actions": "configured",
        "primary_datastore": {"status": "configured"},
        "fallback_queue": {"status": "ready", "email_delivery": "configured"},
        "ops_intake": {
            "status": "ready",
            "target": "https://supermega-machine.vercel.app/api/intake",
            "contract": "body_secret",
        },
    }
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
        f"{BASE}privacy/": result(f"{BASE}privacy/", privacy),
        f"{BASE}api/contact-submissions/status": result(
            f"{BASE}api/contact-submissions/status", contact_status
        ),
        f"{APP}home": result(f"{APP}home", app_shell),
        f"{APP}factory": result(f"{APP}factory", app_shell),
        f"{APP}assets/index-current.js": result(
            f"{APP}assets/index-current.js", "Shop" + ("x" * 1400)
        ),
        f"{APP}api/health": result(f"{APP}api/health", app_health),
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
            return checker.run(BASE, WWW, APP, CONSOLE, timeout=1, attempts=1)

    def test_healthy_portfolio_passes_all_seventeen_checks(self):
        report = self.run_report(healthy_responses())
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["checks"], 17)
        self.assertEqual(report["failures"], [])

    def test_missing_agent_context_fails_first_proof_route(self):
        responses = healthy_responses()
        responses[AGENT_INTAKE] = result(
            AGENT_INTAKE,
            responses[AGENT_INTAKE].body.decode().replace("Request first proof", ""),
        )
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "agent_intake_page")
        self.assertEqual(failure["url"], AGENT_INTAKE)
        self.assertIn("Request first proof", failure["missing"])

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

    def test_missing_plant_link_fails_public_page(self):
        responses = healthy_responses()
        responses[BASE] = result(BASE, responses[BASE].body.decode().replace("https://app.supermega.dev/?demo=plant", ""))
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        self.assertTrue(any(item["kind"] == "page" and item["url"] == BASE for item in report["failures"]))

    def test_retired_product_name_fails_public_page(self):
        responses = healthy_responses()
        responses[BASE] = result(BASE, responses[BASE].body.decode() + "DeskPOS")
        report = self.run_report(responses)
        self.assertEqual(report["status"], "error")
        failure = next(item for item in report["failures"] if item["kind"] == "page" and item["url"] == BASE)
        self.assertIn("DeskPOS", failure["unexpected"])

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
