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


USER_AGENT = "supermega-portfolio-live-health/4.6"
DEMO_MAX_BYTES = 256 * 1024
POS_MAX_BYTES = 256 * 1024
PIPELINE_MAX_BYTES = 8 * 1024


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


def fetch(
    url: str,
    *,
    timeout: float,
    attempts: int,
    follow_redirects: bool = True,
    max_bytes: int | None = None,
) -> HttpResult:
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
                    body=response.read(max_bytes + 1) if max_bytes is not None else response.read(),
                )
        except urllib.error.HTTPError as error:
            result = HttpResult(
                url=url,
                status=error.code,
                headers=dict(error.headers.items()),
                body=error.read(max_bytes + 1) if max_bytes is not None else error.read(),
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


def header_value(headers: dict[str, str], name: str) -> str:
    expected = name.lower()
    return next((value for key, value in headers.items() if key.lower() == expected), "")


def run(
    base_url: str,
    www_url: str,
    app_url: str,
    demo_url: str,
    pos_url: str,
    console_url: str,
    *,
    timeout: float,
    attempts: int,
) -> dict[str, Any]:
    base_url = base_url.rstrip("/") + "/"
    www_url = www_url.rstrip("/") + "/"
    app_url = app_url.rstrip("/") + "/"
    demo_url = demo_url.rstrip("/") + "/"
    pos_url = pos_url.rstrip("/") + "/"
    console_url = console_url.rstrip("/") + "/"
    failures: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    agent_intake_url = urljoin(base_url, "contact/?from=ai-agent-solution")
    workspace_intake_kinds = {
        urljoin(base_url, "contact/?from=shop-workspace"): "shop_workspace_intake_page",
        urljoin(base_url, "contact/?from=plant-workspace"): "plant_workspace_intake_page",
    }

    page_checks = [
        (
            base_url,
            [
                "<title>supermega.dev | Shop and Plant, ready for real work.</title>",
                '<h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>',
                "https://app.supermega.dev/?demo=shop",
                "https://app.supermega.dev/?demo=plant",
                "/contact/",
                "Shop and Plant, ready for real work.",
                "Open Shop demo",
                "No signup",
                "Private setup",
                "Bring us the handoff that still breaks.",
                "data-public-status",
            ],
        ),
        (
            www_url,
            [
                "<title>supermega.dev | Shop and Plant, ready for real work.</title>",
                '<h1 id="portfolio-heading">Run the day. Keep the handoffs.</h1>',
                "https://app.supermega.dev/?demo=shop",
                "https://app.supermega.dev/?demo=plant",
                "/contact/",
                "Shop and Plant, ready for real work.",
                "Open Shop demo",
                "No signup",
                "Private setup",
                "Bring us the handoff that still breaks.",
                "data-public-status",
            ],
        ),
        (
            urljoin(base_url, "contact/"),
            [
                "<title>Contact | supermega.dev</title>",
                "What should run better?",
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
                "entryIntent==='ai-agent-solution'",
                "What do you want to improve?",
                "Start here",
                "What should work better?",
                "idleSubmitLabel='Contact us'",
                "one reviewed example",
                'action="/api/contact-submissions"',
                'name="name"',
                'name="email"',
                'name="company"',
                'name="goal"',
            ],
        ),
        *[
            (
                url,
                [
                    "entryIntent==='shop-workspace'?'Shop':entryIntent==='plant-workspace'?'Plant':''",
                    "text('[data-contact-heading]','Request a private '+workspaceProduct+' workspace.')",
                    "idleSubmitLabel='Request workspace'",
                    'action="/api/contact-submissions"',
                    'name="name"',
                    'name="email"',
                    'name="company"',
                    'name="goal"',
                ],
            )
            for url in workspace_intake_kinds
        ],
        (urljoin(base_url, "privacy/"), ["<title>Privacy | supermega.dev</title>", "Only the details needed to reply."]),
    ]

    for url, tokens in page_checks:
        response = fetch(url, timeout=timeout, attempts=attempts)
        body = response.body.decode("utf-8", errors="replace")
        missing = [token for token in tokens if token not in body]
        if url in (base_url, www_url):
            forbidden = [
                "MegaOS",
                "DeskPOS",
                ">Studio<",
                "Try demo",
                "https://demo.supermega.dev/",
                'target="_blank"',
                "rotate(",
                "Build an agent solution",
                ">Agent solution<",
                "AI Agent Solutions",
                "Need a repeated task handled?",
                "Use one account across desktop, tablet, and mobile.",
                "Create a workspace only when you want to keep your work and use it across devices.",
                "Create with email and password. Return with your password or an email code.",
            ]
        elif url == agent_intake_url or url in workspace_intake_kinds:
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
        kind = "agent_intake_page" if url == agent_intake_url else workspace_intake_kinds.get(url, "page")
        result = {
            "kind": kind,
            "url": url,
            "status": response.status,
            "bytes": len(response.body),
            "missing": missing,
            "unexpected": unexpected,
        }
        results.append(result)
        if response.status != 200 or len(response.body) < 1000 or missing or unexpected:
            failures.append(result)

    demo_response = fetch(
        demo_url,
        timeout=timeout,
        attempts=attempts,
        follow_redirects=False,
        max_bytes=DEMO_MAX_BYTES,
    )
    try:
        demo_body = demo_response.body.decode("utf-8")
        demo_encoding_error = False
    except UnicodeDecodeError:
        demo_body = ""
        demo_encoding_error = True
    demo_tokens = [
        "<title>SuperMega - open the app</title>",
        "Open a working Shop workspace or Shop POS demo.",
        "https://app.supermega.dev/",
        "https://pos.supermega.dev/?demo=",
        'data-en="Open Shop POS"',
        'data-my="Shop POS ဖွင့်ရန်"',
        "assets/noto-sans-myanmar.woff2",
    ]
    demo_forbidden = [
        "DeskPOS",
        "MegaOS",
        "Retail OS",
        "Factory OS",
        "spa-desk-pilot.vercel.app",
        "<iframe",
    ]
    demo_missing = [token for token in demo_tokens if token not in demo_body]
    demo_unexpected = [token for token in demo_forbidden if token in demo_body]
    demo_header_contract = {
        "content-type": "text/html",
        "x-content-type-options": "nosniff",
        "x-frame-options": "sameorigin",
        "referrer-policy": "strict-origin-when-cross-origin",
    }
    demo_header_mismatches = {}
    for name, expected in demo_header_contract.items():
        actual = header_value(demo_response.headers, name)
        valid = actual.lower().startswith(expected) if name == "content-type" else actual.lower() == expected
        if not valid:
            demo_header_mismatches[name] = {"expected": expected, "actual": actual}
    demo_result = {
        "kind": "demo_shop_pos",
        "url": demo_url,
        "status": demo_response.status,
        "bytes": len(demo_response.body),
        "response_url_changed": demo_response.url != demo_url,
        "encoding_error": demo_encoding_error,
        "shop_pos_markers": demo_body.count("Shop POS"),
        "missing": demo_missing,
        "unexpected": demo_unexpected,
        "header_mismatches": demo_header_mismatches,
    }
    results.append(demo_result)
    if (
        demo_response.status != 200
        or demo_response.url != demo_url
        or len(demo_response.body) < 1000
        or len(demo_response.body) > DEMO_MAX_BYTES
        or demo_encoding_error
        or demo_result["shop_pos_markers"] < 5
        or demo_missing
        or demo_unexpected
        or demo_header_mismatches
    ):
        failures.append(demo_result)

    pos_response = fetch(
        pos_url,
        timeout=timeout,
        attempts=attempts,
        follow_redirects=False,
        max_bytes=POS_MAX_BYTES,
    )
    try:
        pos_body = pos_response.body.decode("utf-8")
        pos_encoding_error = False
    except UnicodeDecodeError:
        pos_body = ""
        pos_encoding_error = True
    pos_tokens = [
        "<title>Shop ",
        "the simple POS for Myanmar businesses</title>",
        '<link rel="canonical" href="https://pos.supermega.dev/" />',
        '<meta property="og:site_name" content="Shop" />',
        '"name": "Shop"',
        '<div id="root"></div>',
    ]
    pos_forbidden = [
        "MegaOS",
        "Mega OS",
        "<title>DeskPOS",
        'content="DeskPOS',
        "spa-desk-pilot.vercel.app",
    ]
    pos_result = {
        "kind": "shop_pos_page",
        "url": pos_url,
        "status": pos_response.status,
        "bytes": len(pos_response.body),
        "response_url_changed": pos_response.url != pos_url,
        "encoding_error": pos_encoding_error,
        "missing": [token for token in pos_tokens if token not in pos_body],
        "unexpected": [token for token in pos_forbidden if token in pos_body],
    }
    results.append(pos_result)
    if (
        pos_response.status != 200
        or pos_response.url != pos_url
        or len(pos_response.body) < 1000
        or len(pos_response.body) > POS_MAX_BYTES
        or pos_encoding_error
        or pos_result["missing"]
        or pos_result["unexpected"]
    ):
        failures.append(pos_result)

    pos_health_url = urljoin(pos_url, "api/health")
    pos_health_response = fetch(pos_health_url, timeout=timeout, attempts=attempts)
    try:
        pos_health_payload = json.loads(pos_health_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        pos_health_payload = {}
    expected_pos_health = {
        "ok": True,
        "service": "supermega-shop-pos",
        "status": "ready",
    }
    pos_health_mismatches = {
        path: {"expected": expected, "actual": nested_value(pos_health_payload, path)}
        for path, expected in expected_pos_health.items()
        if nested_value(pos_health_payload, path) != expected
    }
    if set(pos_health_payload) != set(expected_pos_health):
        pos_health_mismatches["payload_keys"] = {
            "expected": sorted(expected_pos_health),
            "actual": sorted(pos_health_payload),
        }
    pos_health_result = {
        "kind": "shop_pos_health",
        "url": pos_health_url,
        "status": pos_health_response.status,
        "mismatches": pos_health_mismatches,
    }
    results.append(pos_health_result)
    if pos_health_response.status != 200 or pos_health_mismatches:
        failures.append(pos_health_result)

    pos_diagnostics_url = f"{pos_health_url}?detail=1"
    pos_diagnostics_response = fetch(pos_diagnostics_url, timeout=timeout, attempts=attempts)
    try:
        pos_diagnostics_payload = json.loads(pos_diagnostics_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        pos_diagnostics_payload = {}
    expected_pos_diagnostics = {"error": "operator_auth_required"}
    pos_diagnostics_mismatches = {
        path: {"expected": expected, "actual": nested_value(pos_diagnostics_payload, path)}
        for path, expected in expected_pos_diagnostics.items()
        if nested_value(pos_diagnostics_payload, path) != expected
    }
    if set(pos_diagnostics_payload) != set(expected_pos_diagnostics):
        pos_diagnostics_mismatches["payload_keys"] = {
            "expected": sorted(expected_pos_diagnostics),
            "actual": sorted(pos_diagnostics_payload),
        }
    pos_diagnostics_result = {
        "kind": "shop_pos_diagnostics_guard",
        "url": pos_diagnostics_url,
        "status": pos_diagnostics_response.status,
        "mismatches": pos_diagnostics_mismatches,
    }
    results.append(pos_diagnostics_result)
    if pos_diagnostics_response.status != 401 or pos_diagnostics_mismatches:
        failures.append(pos_diagnostics_result)

    pipeline_url = urljoin(pos_url, "api/pipeline-leads")
    pipeline_response = fetch(
        pipeline_url,
        timeout=timeout,
        attempts=attempts,
        follow_redirects=False,
        max_bytes=PIPELINE_MAX_BYTES,
    )
    try:
        pipeline_body = pipeline_response.body.decode("utf-8")
        pipeline_payload = json.loads(pipeline_body)
        if not isinstance(pipeline_payload, dict):
            pipeline_payload = {}
        pipeline_encoding_error = False
    except (UnicodeDecodeError, json.JSONDecodeError):
        pipeline_body = ""
        pipeline_payload = {}
        pipeline_encoding_error = True

    expected_pipeline = {
        "configured": True,
        "dataBoundary": "Stores Shop prospect metadata only; do not submit customer sales, payment payloads, or private shop data.",
        "detail": "Shop lead intake is ready.",
        "mode": "shop-lead-intake",
        "ok": True,
        "protectedRead": True,
        "store.provider": "vercel-blob-private",
        "writeProtected": True,
        "authorized": False,
        "leads": [],
    }
    pipeline_mismatches = {
        path: {"expected": expected, "actual": nested_value(pipeline_payload, path)}
        for path, expected in expected_pipeline.items()
        if nested_value(pipeline_payload, path) != expected
    }
    expected_pipeline_keys = {
        "authorized",
        "checkedAt",
        "configured",
        "dataBoundary",
        "detail",
        "leadCount",
        "leads",
        "mode",
        "ok",
        "protectedRead",
        "store",
        "updatedAt",
        "writeProtected",
    }
    if set(pipeline_payload) != expected_pipeline_keys:
        pipeline_mismatches["payload_keys"] = {
            "expected": sorted(expected_pipeline_keys),
            "actual": sorted(pipeline_payload),
        }
    pipeline_store = pipeline_payload.get("store")
    if not isinstance(pipeline_store, dict) or set(pipeline_store) != {"provider"}:
        pipeline_mismatches["store_keys"] = {
            "expected": ["provider"],
            "actual": sorted(pipeline_store)
            if isinstance(pipeline_store, dict)
            else type(pipeline_store).__name__,
        }
    lead_count = pipeline_payload.get("leadCount")
    if isinstance(lead_count, bool) or not isinstance(lead_count, int) or lead_count < 0:
        pipeline_mismatches["leadCount"] = {
            "expected": "non-negative integer",
            "actual": lead_count,
        }
    for field in ("checkedAt", "updatedAt"):
        value = pipeline_payload.get(field)
        if not isinstance(value, str) or not value:
            pipeline_mismatches[field] = {"expected": "non-empty timestamp", "actual": value}
    pipeline_unexpected = [
        token
        for token in ("DeskPOS", "MegaOS", "deskpos-pipeline", "pathname")
        if token in pipeline_body
    ]
    pipeline_cache_control = header_value(pipeline_response.headers, "cache-control")
    if pipeline_cache_control.lower() != "no-store":
        pipeline_mismatches["cache-control"] = {
            "expected": "no-store",
            "actual": pipeline_cache_control,
        }
    pipeline_result = {
        "kind": "shop_pipeline_guard",
        "url": pipeline_url,
        "status": pipeline_response.status,
        "bytes": len(pipeline_response.body),
        "response_url_changed": pipeline_response.url != pipeline_url,
        "encoding_error": pipeline_encoding_error,
        "mismatches": pipeline_mismatches,
        "unexpected": pipeline_unexpected,
    }
    results.append(pipeline_result)
    if (
        pipeline_response.status != 200
        or pipeline_response.url != pipeline_url
        or len(pipeline_response.body) > PIPELINE_MAX_BYTES
        or pipeline_encoding_error
        or pipeline_mismatches
        or pipeline_unexpected
    ):
        failures.append(pipeline_result)

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
        "service": "supermega-contact",
    }
    mismatches = {
        path: {"expected": expected, "actual": nested_value(status_payload, path)}
        for path, expected in expected_status.items()
        if nested_value(status_payload, path) != expected
    }
    if set(status_payload) != set(expected_status):
        mismatches["payload_keys"] = {
            "expected": sorted(expected_status),
            "actual": sorted(status_payload),
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

    diagnostics_url = f"{status_url}?detail=1"
    diagnostics_response = fetch(diagnostics_url, timeout=timeout, attempts=attempts)
    try:
        diagnostics_payload = json.loads(diagnostics_response.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        diagnostics_payload = {}
    expected_diagnostics = {
        "status": "error",
        "reason": "operator_auth_required",
    }
    diagnostics_mismatches = {
        path: {"expected": expected, "actual": nested_value(diagnostics_payload, path)}
        for path, expected in expected_diagnostics.items()
        if nested_value(diagnostics_payload, path) != expected
    }
    if set(diagnostics_payload) != set(expected_diagnostics):
        diagnostics_mismatches["payload_keys"] = {
            "expected": sorted(expected_diagnostics),
            "actual": sorted(diagnostics_payload),
        }
    diagnostics_result = {
        "kind": "conversion_diagnostics_guard",
        "url": diagnostics_url,
        "status": diagnostics_response.status,
        "mismatches": diagnostics_mismatches,
    }
    results.append(diagnostics_result)
    if diagnostics_response.status != 401 or diagnostics_mismatches:
        failures.append(diagnostics_result)

    app_home_body = ""
    for route in ("home", "factory"):
        url = urljoin(app_url, route)
        response = fetch(url, timeout=timeout, attempts=attempts)
        body = response.body.decode("utf-8", errors="replace")
        if route == "home":
            app_home_body = body
        missing = [token for token in ['<title>Shop | supermega.dev</title>', '<div id="root"></div>', 'type="module"'] if token not in body]
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
    parser.add_argument("--demo-url", default="https://demo.supermega.dev")
    parser.add_argument("--pos-url", default="https://pos.supermega.dev")
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
            args.demo_url,
            args.pos_url,
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
