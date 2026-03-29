from __future__ import annotations

import argparse
import json
import sys
import time
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.request import HTTPCookieProcessor, Request, build_opener


SAMPLE_LEAD_TEXT = """Shwe Auto House | sales@shweautohouse.com | +95 9 777 111 222 | www.shweautohouse.com | tyre distributor Yangon
Mingalar Tyre Service | contact@mingalartyreservice.com | +95 9 765 444 222 | www.mingalartyreservice.com | auto service and tyre retail
Golden Highway Parts | +95 9 500 113 221 | www.goldenhighwayparts.com | truck and industrial tyre buyer
"""


def request_json(opener, method: str, url: str, payload: dict | None = None, timeout: int = 15) -> dict:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method.upper())
    with opener.open(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
    return json.loads(raw or "{}")


def wait_for_health(opener, base_url: str, timeout_seconds: int) -> dict:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            return request_json(opener, "GET", f"{base_url}/api/health", timeout=5)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            time.sleep(0.75)
    raise RuntimeError(f"SuperMega app did not become healthy at {base_url} within {timeout_seconds}s: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test the local SuperMega app.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787")
    parser.add_argument("--username", default="owner")
    parser.add_argument("--password", default="supermega-demo")
    parser.add_argument("--workspace", default="supermega-lab")
    parser.add_argument("--query", default="spa in yangon")
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument("--as-json", action="store_true")
    args = parser.parse_args()

    cookie_jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(cookie_jar))

    health = wait_for_health(opener, args.base_url.rstrip("/"), args.timeout_seconds)
    login = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/auth/login",
        {
            "username": args.username,
            "password": args.password,
            "workspace_slug": args.workspace,
        },
    )
    summary = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/summary")
    insights = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/insights")
    director = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/reports/role/director")
    exceptions = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/exceptions?limit=5")
    approval_create = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/approvals",
        {
            "title": "Smoke approval",
            "summary": "Created by smoke test to verify approval queue.",
            "approval_gate": "general",
            "requested_by": "Smoke Test",
            "owner": "Management",
            "status": "pending",
            "related_route": "/app/exceptions",
        },
    )
    approvals = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/approvals?limit=5")
    lead_finder = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/lead-finder",
        {
            "query": args.query,
            "keywords": ["spa", "wellness", "massage", "yangon"],
            "sources": ["maps"],
            "limit": 4,
        },
        timeout=45,
    )
    rows = list(lead_finder.get("rows") or [])
    if not rows:
        lead_finder = request_json(
            opener,
            "POST",
            f"{args.base_url.rstrip('/')}/api/tools/lead-finder",
            {
                "raw_text": SAMPLE_LEAD_TEXT,
                "query": args.query,
                "keywords": ["spa", "wellness", "massage", "yangon"],
                "sources": [],
                "limit": 4,
            },
            timeout=20,
        )
        rows = list(lead_finder.get("rows") or [])
    outreach_rows = [row for row in rows if str((row or {}).get("email", "")).strip()]
    if not outreach_rows:
        manual_leads = request_json(
            opener,
            "POST",
            f"{args.base_url.rstrip('/')}/api/tools/lead-finder",
            {
                "raw_text": SAMPLE_LEAD_TEXT,
                "query": "",
                "keywords": [],
                "sources": [],
                "limit": 4,
            },
            timeout=20,
        )
        outreach_rows = list(manual_leads.get("rows") or [])
    lead_to_pilot = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/lead-to-pilot",
        {
            "campaign_goal": "Book one discovery call",
            "leads": outreach_rows[:1],
        },
    )
    lead_hunt = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/lead-hunt",
        {
            "query": args.query,
            "keywords": ["spa", "wellness", "massage", "yangon"],
            "sources": ["maps"],
            "limit": 3,
            "campaign_goal": "Book one discovery call",
            "export_workspace": False,
        },
        timeout=60,
    )
    pipeline_import = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/lead-pipeline/import",
        {
            "rows": lead_to_pilot.get("opportunities", []),
            "campaign_goal": "Book one discovery call",
        },
    )
    pipeline_rows = list((pipeline_import.get("rows") or []))
    saved_ids = [str(item).strip() for item in (pipeline_import.get("saved_lead_ids") or []) if str(item).strip()]
    outreach_lead_id = saved_ids[0] if saved_ids else (pipeline_rows[0]["lead_id"] if pipeline_rows else "")
    outreach = (
        request_json(
            opener,
            "POST",
            f"{args.base_url.rstrip('/')}/api/lead-pipeline/{outreach_lead_id}/outreach/gmail",
            {"create_gmail_draft": False},
        )
        if outreach_lead_id
        else {}
    )
    workspace_export = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/lead-pipeline/export/workspace",
        {
            "workspace_folder_name": "SuperMega Sales",
            "spreadsheet_name": "SuperMega Lead Pipeline",
            "sheet_name": "Leads",
        },
        timeout=90,
    )

    report = {
        "base_url": args.base_url,
        "health_status": health.get("status", ""),
        "login_status": login.get("status", ""),
        "authenticated": bool(login.get("authenticated")),
        "workspace_slug": ((login.get("session") or {}).get("workspace_slug", "")),
        "action_count": int(((summary.get("actions") or {}).get("total_items") or 0)),
        "supplier_risk_count": int(((summary.get("supplier_watch") or {}).get("risk_count") or 0)),
        "quality_incident_count": int(((summary.get("quality") or {}).get("incident_count") or 0)),
        "director_priority_count": int(director.get("count") or 0),
        "exception_count": int(exceptions.get("count") or 0),
        "approval_count": int(approvals.get("count") or 0),
        "approval_message": approval_create.get("message", ""),
        "lead_count": len(rows),
        "top_lead": rows[0].get("name", "") if rows else "",
        "provider": lead_finder.get("provider", ""),
        "insights_engine": insights.get("engine", ""),
        "pipeline_lead_count": len(pipeline_rows),
        "lead_pack_engine": lead_to_pilot.get("engine", ""),
        "lead_hunt_saved_count": int(lead_hunt.get("saved_count", 0) or 0),
        "outreach_status": outreach.get("status", ""),
        "workspace_export_status": workspace_export.get("status", ""),
        "workspace_export_link": workspace_export.get("export", {}).get("web_view_link", ""),
        "compose_url": ((outreach.get("draft") or {}).get("compose_url") or ""),
    }

    if args.as_json:
        print(json.dumps(report, indent=2))
        return 0

    print()
    print("SuperMega app smoke test")
    print(f"- Base URL: {report['base_url']}")
    print(f"- Health: {report['health_status']}")
    print(f"- Login: {report['login_status']} / authenticated={report['authenticated']}")
    print(f"- Workspace: {report['workspace_slug']}")
    print(f"- Actions: {report['action_count']}")
    print(f"- Supplier risks: {report['supplier_risk_count']}")
    print(f"- Quality incidents: {report['quality_incident_count']}")
    print(f"- Director priorities: {report['director_priority_count']}")
    print(f"- Exceptions: {report['exception_count']}")
    print(f"- Approvals: {report['approval_count']}")
    print(f"- Lead finder rows: {report['lead_count']}")
    print(f"- Top lead: {report['top_lead']}")
    print(f"- Provider: {report['provider']}")
    print(f"- Insights engine: {report['insights_engine']}")
    print(f"- Pipeline leads: {report['pipeline_lead_count']}")
    print(f"- Lead pack engine: {report['lead_pack_engine']}")
    print(f"- Lead hunt saved: {report['lead_hunt_saved_count']}")
    print(f"- Outreach: {report['outreach_status']}")
    print(f"- Workspace export: {report['workspace_export_status']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
