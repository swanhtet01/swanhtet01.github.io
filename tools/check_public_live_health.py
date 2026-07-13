#!/usr/bin/env python3
"""Read-only live health gate for the current SuperMega public funnel."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse


USER_AGENT = "supermega-portfolio-live-health/4.2"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
        return None


@dataclass(frozen=True)
class HttpResult:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes


class ModuleScriptParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "script":
            return
        values = dict(attrs)
        if values.get("type") == "module" and values.get("src"):
            self.sources.append(str(values["src"]))


def app_module_url(body: str, app_url: str) -> str | None:
    parser = ModuleScriptParser()
    parser.feed(body)
    app = urlparse(app_url)
    for source in parser.sources:
        resolved = urlparse(urljoin(app_url, source))
        if (
            resolved.scheme == "https"
            and resolved.netloc == app.netloc
            and resolved.path.startswith("/assets/")
            and resolved.path.endswith(".js")
        ):
            return resolved.geturl()
    return None


def fetch(url: str, *, timeout: float, attempts: int, follow_redirects: bool = True) -> HttpResult:
    opener = urllib.request.build_opener() if follow_redirects else urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/html,application/json",
            "User-Agent": USER_AGENT,
        },
    )
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            with opener.open(request, timeout=timeout) as response:
                return HttpResult(
                    url=response.geturl(),
                    status=response.getcode(),
                    headers=dict(response.headers.items()),
                    body=response.read(),
                )
        except urllib.error.HTTPError as error:
            result = HttpResult(
                url=url,
                status=error.code,
                headers=dict(error.headers.items()),
                body=error.read(),
            )
            if 500 <= error.code < 600 and attempt < attempts:
                time.sleep(attempt)
                continue
            return result
        except (TimeoutError, OSError, urllib.error.URLError) as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt)
    raise RuntimeError(f"request_failed: {url}: {type(last_error).__name__}") from last_error


def nested_value(payload: dict[str, Any], path: str) -> Any:
    value: Any = payload
    for key in path.split("."):
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def run(
    base_url: str,
    www_url: str,
    app_url: str,
    console_url: str,
    *,
    timeout: float,
    attempts: int,
) -> dict[str, Any]:
    base_url = base_url.rstrip("/") + "/"
    www_url = www_url.rstrip("/") + "/"
    app_url = app_url.rstrip("/") + "/"
    console_url = console_url.rstrip("/") + "/"
    failures: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    agent_intake_url = urljoin(base_url, "contact/?from=ai-agent-solution")

    page_checks = [
        (
            base_url,
            [
                "<title>supermega.dev | Shop, Plant and AI Agent Solutions</title>",
                '<h1 id="portfolio-heading">Shop. Plant. AI Agent Solutions.</h1>',
                "https://app.supermega.dev/?demo=shop",
                "https://app.supermega.dev/?demo=plant",
                "/contact/?from=ai-agent-solution",
                "external actions approval-gated",
                "data-public-status",
            ],
        ),
        (
            www_url,
            [
                "<title>supermega.dev | Shop, Plant and AI Agent Solutions</title>",
                '<h1 id="portfolio-heading">Shop. Plant. AI Agent Solutions.</h1>',
                "https://app.supermega.dev/?demo=shop",
                "https://app.supermega.dev/?demo=plant",
                "/contact/?from=ai-agent-solution",
                "external actions approval-gated",
                "data-public-status",
            ],
        ),
        (
            urljoin(base_url, "contact/"),
            [
                "<title>Contact | supermega.dev</title>",
                "What needs to work better?",
                'action="/api/contact-submissions"',
                'name="name"',
                'name="email"',
                'name="company"',
                'name="goal"',
                "No account or data connection is made before you approve it.",
            ],
        ),
        (
            agent_intake_url,
            [
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
            ],
        ),
        (urljoin(base_url, "privacy/"), ["<title>Privacy | supermega.dev</title>", "Only the details needed to reply."]),
    ]

    for url, tokens in page_checks:
        response = fetch(url, timeout=timeout, attempts=attempts)
        body = response.body.decode("utf-8", errors="replace")
        missing = [token for token in tokens if token not in body]
        if url in (base_url, www_url):
            forbidden = ["MegaOS", "DeskPOS", ">Studio<", "Try demo", "https://demo.supermega.dev/"]
        elif url == agent_intake_url:
            forbidden = [
                "MegaOS",
                "DeskPOS",
                'name="workflow"',
                'name="requested_package"',
                'name="product_area"',
                'name="template_id"',
                'name="source_links"',
                "/site/agent-templates/",
                "General enquiry",
            ]
        else:
            forbidden = []
        unexpected = [token for token in forbidden if token in body]
        result = {
            "kind": "agent_intake_page" if url == agent_intake_url else "page",
            "url": url,
            "status": response.status,
            "bytes": len(response.body),
            "missing": missing,
            "unexpected": unexpected,
        }
        results.append(result)
        if response.status != 200 or len(response.body) < 1000 or missing or unexpected:
            failures.append(result)

    for path in ("products/", "pricing/", "ai-agents/", "offers/"):
        url = urljoin(base_url, path)
        response = fetch(url, timeout=timeout, attempts=attempts, follow_redirects=False)
        location = response.headers.get("Location") or response.headers.get("location") or ""
        result = {"kind": "retired_route", "url": url, "status": response.status, "location": location}
        results.append(result)
        if response.status != 308 or location != "/":
            failures.append(result)

    status_url = urljoin(base_url, "api/contact-submissions/status")
    status_response = fetch(status_url, timeout=timeout, attempts=attempts)
    try:
        status_payload = json.loads(status_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        status_payload = {}

    expected_status = {
        "status": "ready",
        "lead_ledger": "configured",
        "pipeline_actions": "configured",
        "primary_datastore.status": "configured",
        "fallback_queue.status": "ready",
        "fallback_queue.email_delivery": "configured",
        "ops_intake.status": "ready",
        "ops_intake.target": "https://supermega-machine.vercel.app/api/intake",
        "ops_intake.contract": "body_secret",
    }
    mismatches = {
        path: {"expected": expected, "actual": nested_value(status_payload, path)}
        for path, expected in expected_status.items()
        if nested_value(status_payload, path) != expected
    }
    api_result = {
        "kind": "conversion_api",
        "url": status_url,
        "status": status_response.status,
        "mismatches": mismatches,
    }
    results.append(api_result)
    if status_response.status != 200 or mismatches:
        failures.append(api_result)

    app_home_body = ""
    for route in ("home", "factory"):
        url = urljoin(app_url, route)
        response = fetch(url, timeout=timeout, attempts=attempts)
        body = response.body.decode("utf-8", errors="replace")
        if route == "home":
            app_home_body = body
        missing = [token for token in ['<title>Shop - SuperMega</title>', '<div id="root"></div>', 'type="module"'] if token not in body]
        result = {
            "kind": "app_route",
            "route": route,
            "url": url,
            "status": response.status,
            "bytes": len(response.body),
            "missing": missing,
        }
        results.append(result)
        if response.status != 200 or len(response.body) < 1000 or missing:
            failures.append(result)

    module_url = app_module_url(app_home_body, app_url)
    module_response = fetch(module_url, timeout=timeout, attempts=attempts) if module_url else None
    module_body = module_response.body.decode("utf-8", errors="replace") if module_response else ""
    module_result = {
        "kind": "shop_brand_bundle",
        "url": module_url or app_url,
        "status": module_response.status if module_response else 0,
        "bytes": len(module_response.body) if module_response else 0,
        "missing": [] if module_url else ["same-origin /assets/*.js module"],
        "unexpected": [token for token in ("MegaOS", "Mega OS") if token in module_body],
    }
    results.append(module_result)
    if (
        module_response is None
        or module_response.status != 200
        or len(module_response.body) < 1000
        or module_result["unexpected"]
    ):
        failures.append(module_result)

    app_health_url = urljoin(app_url, "api/health")
    app_health_response = fetch(app_health_url, timeout=timeout, attempts=attempts)
    try:
        app_health_payload = json.loads(app_health_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        app_health_payload = {}

    expected_app_health = {
        "ok": True,
        "status": "ready",
        "service": "supermega-product-app",
        "contractVersion": 1,
        "portfolio.products": ["shop", "plant"],
        "portfolio.demos.shop.entry": "/?demo=shop",
        "portfolio.demos.shop.route": "/home",
        "portfolio.demos.plant.entry": "/?demo=plant",
        "portfolio.demos.plant.route": "/factory",
        "portfolio.agentSolutions.intake": "https://supermega.dev/contact/?from=ai-agent-solution",
        "portfolio.agentSolutions.externalActions": "approval-gated",
        "proof.workingDemos": True,
        "proof.productionCloudDurability": "not-asserted",
        "proof.realCustomerAcceptance": "not-asserted",
    }
    app_health_mismatches = {
        path: {"expected": expected, "actual": nested_value(app_health_payload, path)}
        for path, expected in expected_app_health.items()
        if nested_value(app_health_payload, path) != expected
    }
    app_health_result = {
        "kind": "app_health",
        "url": app_health_url,
        "status": app_health_response.status,
        "mismatches": app_health_mismatches,
    }
    results.append(app_health_result)
    if app_health_response.status != 200 or app_health_mismatches:
        failures.append(app_health_result)

    console_page_response = fetch(console_url, timeout=timeout, attempts=attempts)
    console_page_body = console_page_response.body.decode("utf-8", errors="replace")
    console_page_tokens = [
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
    ]
    console_page_missing = [token for token in console_page_tokens if token not in console_page_body]
    console_page_result = {
        "kind": "agent_company_page",
        "url": console_url,
        "status": console_page_response.status,
        "bytes": len(console_page_response.body),
        "missing": console_page_missing,
    }
    results.append(console_page_result)
    if console_page_response.status != 200 or len(console_page_response.body) < 1000 or console_page_missing:
        failures.append(console_page_result)

    kernel_status_url = urljoin(console_url, "api/status")
    kernel_status_response = fetch(kernel_status_url, timeout=timeout, attempts=attempts)
    try:
        kernel_status_payload = json.loads(kernel_status_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        kernel_status_payload = {}
    expected_kernel_status = {
        "ok": True,
        "service": "supermega-kernel",
        "db.ok": True,
        "db.mode": "supabase",
        "connectors.total": 69,
        "connectors.registrationErrors": 0,
        "ai.primary": "anthropic",
        "agentCompany.plannerReady": True,
        "agentCompany.actionMode": "draft_only",
        "agentCompany.maxAgents": 2,
        "agentCompany.maxRoleBudget": 8,
        "agentCompany.probeMode": "plan_only",
        "agentCompany.modelRequest": False,
        "agentCompany.durableClaimCreated": False,
        "agentCompany.externalWrites": False,
    }
    kernel_status_mismatches = {
        path: {"expected": expected, "actual": nested_value(kernel_status_payload, path)}
        for path, expected in expected_kernel_status.items()
        if nested_value(kernel_status_payload, path) != expected
    }
    configured_connectors = nested_value(kernel_status_payload, "connectors.configured")
    if not isinstance(configured_connectors, int) or configured_connectors < 1:
        kernel_status_mismatches["connectors.configured"] = {
            "expected": "integer >= 1",
            "actual": configured_connectors,
        }
    providers = nested_value(kernel_status_payload, "ai.providers")
    if not isinstance(providers, list) or "anthropic" not in providers:
        kernel_status_mismatches["ai.providers"] = {
            "expected": "contains anthropic",
            "actual": providers,
        }
    kernel_status_result = {
        "kind": "agent_company_status",
        "url": kernel_status_url,
        "status": kernel_status_response.status,
        "mismatches": kernel_status_mismatches,
    }
    results.append(kernel_status_result)
    if kernel_status_response.status != 200 or kernel_status_mismatches:
        failures.append(kernel_status_result)

    company_guard_url = urljoin(console_url, "api/agent-company")
    company_guard_response = fetch(company_guard_url, timeout=timeout, attempts=attempts)
    try:
        company_guard_payload = json.loads(company_guard_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        company_guard_payload = {}
    company_guard_result = {
        "kind": "agent_company_guard",
        "url": company_guard_url,
        "status": company_guard_response.status,
        "reason": company_guard_payload.get("reason"),
    }
    results.append(company_guard_result)
    if (
        company_guard_response.status != 401
        or company_guard_payload.get("ok") is not False
        or company_guard_payload.get("reason") != "unauthorized"
    ):
        failures.append(company_guard_result)

    return {
        "status": "ready" if not failures else "error",
        "checks": len(results),
        "failures": failures,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="https://supermega.dev")
    parser.add_argument("--www-url", default="https://www.supermega.dev")
    parser.add_argument("--app-url", default="https://app.supermega.dev")
    parser.add_argument("--console-url", default="https://console.supermega.dev")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--attempts", type=int, default=3)
    args = parser.parse_args()
    if args.timeout <= 0 or args.attempts < 1:
        parser.error("timeout and attempts must be positive")

    try:
        report = run(
            args.base_url,
            args.www_url,
            args.app_url,
            args.console_url,
            timeout=args.timeout,
            attempts=args.attempts,
        )
    except Exception as error:  # Keep Actions output concise and secret-free.
        report = {"status": "error", "reason": str(error)}

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report.get("status") == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
