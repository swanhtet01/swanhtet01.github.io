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
    privacy = page(
        "<title>Privacy | supermega.dev</title>",
        "Only the details needed to reply.",
    )
    app_shell = page(
        "<title>Shop - SuperMega</title>",
        '<div id="root"></div>',
        'type="module"',
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

    responses = {
        BASE: result(BASE, home),
        WWW: result(WWW, home),
        f"{BASE}contact/": result(f"{BASE}contact/", contact),
        f"{BASE}privacy/": result(f"{BASE}privacy/", privacy),
        f"{BASE}api/contact-submissions/status": result(
            f"{BASE}api/contact-submissions/status", contact_status
        ),
        f"{APP}home": result(f"{APP}home", app_shell),
        f"{APP}factory": result(f"{APP}factory", app_shell),
        f"{APP}api/health": result(f"{APP}api/health", app_health),
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
            return checker.run(BASE, WWW, APP, timeout=1, attempts=1)

    def test_healthy_portfolio_passes_all_twelve_checks(self):
        report = self.run_report(healthy_responses())
        self.assertEqual(report["status"], "ready")
        self.assertEqual(report["checks"], 12)
        self.assertEqual(report["failures"], [])

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


if __name__ == "__main__":
    unittest.main()
