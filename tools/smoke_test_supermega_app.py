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


def request_json(opener, method: str, url: str, payload: dict | None = None, timeout: int = 15, attempts: int = 3) -> dict:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, data=body, headers=headers, method=method.upper())
            with opener.open(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
            return json.loads(raw or "{}")
        except (HTTPError, URLError, TimeoutError, ConnectionResetError, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            if attempt == attempts:
                raise
            time.sleep(0.75 * attempt)

    raise RuntimeError(f"Request failed after {attempts} attempts: {url} ({last_error})")


def request_status(opener, url: str, timeout: int = 15) -> int:
    request = Request(url, headers={"Accept": "text/html"}, method="GET")
    with opener.open(request, timeout=timeout) as response:
        response.read(64)
        return int(getattr(response, "status", 200) or 200)


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
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except AttributeError:
        pass

    parser = argparse.ArgumentParser(description="Smoke test the local SuperMega app.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787")
    parser.add_argument("--username", default="owner")
    parser.add_argument("--password", default="supermega-demo")
    parser.add_argument("--workspace", default="supermega-lab")
    parser.add_argument("--query", default="tyre shop in yangon")
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument("--as-json", action="store_true")
    args = parser.parse_args()
    run_tag = str(int(time.time() * 1000))

    cookie_jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(cookie_jar))
    public_cookie_jar = CookieJar()
    public_opener = build_opener(HTTPCookieProcessor(public_cookie_jar))

    health = wait_for_health(opener, args.base_url.rstrip("/"), args.timeout_seconds)
    public_route_statuses = {
        "home": request_status(public_opener, f"{args.base_url.rstrip('/')}/"),
        "find_companies": request_status(public_opener, f"{args.base_url.rstrip('/')}/find-companies/"),
        "company_list": request_status(public_opener, f"{args.base_url.rstrip('/')}/company-list/"),
        "task_list": request_status(public_opener, f"{args.base_url.rstrip('/')}/task-list/"),
        "book": request_status(public_opener, f"{args.base_url.rstrip('/')}/book/"),
    }
    public_bootstrap = request_json(
        public_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/public/workspace/bootstrap",
        {
            "name": "Smoke Owner",
            "email": "smoke@supermega.test",
            "company": "Smoke Workspace",
        },
    )
    public_session = request_json(public_opener, "GET", f"{args.base_url.rstrip('/')}/api/auth/session")
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
    agent_teams = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/agent-teams")
    agent_runs_before = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/agent-runs?limit=10")
    founder_brief_run = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs",
        {
            "job_type": "founder_brief",
            "source": "smoke_test",
        },
    )
    revenue_scout_run = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs",
        {
            "job_type": "revenue_scout",
            "source": "smoke_test",
        },
        timeout=60,
    )
    agent_batch_run = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs/run-defaults",
        {
            "source": "smoke_test_batch",
            "job_types": ["founder_brief", "task_triage"],
        },
        timeout=90,
    )
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
    public_workspace_save = request_json(
        public_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/public/workspace/save-leads",
        {
            "name": "Smoke Owner",
            "email": "smoke@supermega.test",
            "company": "Smoke Workspace",
            "campaign_goal": "Public save flow",
            "rows": [
                {
                    "name": rows[0].get("name", "Smoke Lead") if rows else "Smoke Lead",
                    "email": rows[0].get("email", "") if rows else "",
                    "phone": rows[0].get("phone", "") if rows else "",
                    "website": rows[0].get("website", "") if rows else "",
                    "source_url": rows[0].get("source_url", "") if rows else "",
                    "provider": lead_finder.get("provider", ""),
                    "score": rows[0].get("score", 0) if rows else 0,
                    "stage": "offer_ready",
                    "status": "open",
                    "service_pack": "Sales Desk",
                    "wedge_product": "Lead Finder",
                    "task_title": f"Follow up {rows[0].get('name', 'Smoke Lead')}" if rows else "Follow up Smoke Lead",
                    "task_template": "lead_follow_up",
                }
            ],
        },
    )
    hunt_seed_rows = outreach_rows[: min(3, len(outreach_rows))] or rows[: min(3, len(rows))]
    hunt_seed_text = "\n".join(
        ", ".join(
            part
            for part in [
                str((row or {}).get("name", "")).strip(),
                str((row or {}).get("email", "")).strip(),
                str((row or {}).get("phone", "")).strip(),
                str((row or {}).get("website", "")).strip(),
            ]
            if part
        )
        for row in hunt_seed_rows
    ).strip()
    lead_hunt = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/lead-hunt",
        {
            "query": "",
            "raw_text": hunt_seed_text,
            "keywords": [],
            "sources": [],
            "limit": 3,
            "campaign_goal": "Book one discovery call",
            "export_workspace": False,
        },
        timeout=60,
    )
    hunt_profile = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/lead-hunts",
        {
            "name": "Smoke hunt",
            "query": "",
            "raw_text": hunt_seed_text,
            "keywords": [],
            "sources": [],
            "limit": 3,
            "campaign_goal": "Book one discovery call",
            "export_workspace": False,
        },
    )
    hunt_profile_rows = list(hunt_profile.get("rows") or [])
    hunt_profile_row = (hunt_profile.get("profile") or hunt_profile.get("row") or {}) if isinstance(hunt_profile, dict) else {}
    hunt_profile_run = (
        request_json(
            opener,
            "POST",
            f"{args.base_url.rstrip('/')}/api/lead-hunts/{hunt_profile_row.get('hunt_id', '')}/run",
            {"export_workspace": False},
            timeout=60,
        )
        if hunt_profile_row.get("hunt_id")
        else {}
    )
    run_all_hunts = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/lead-hunts/run-active",
        {"export_workspace": False},
        timeout=180,
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
    workspace_tasks_before = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/workspace-tasks?limit=5")
    workspace_task_create = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workspace-tasks",
        {
            "rows": [
                {
                    "title": f"Smoke queue item {run_tag}",
                    "owner": "Sales",
                    "priority": "High",
                    "due": "Today",
                    "status": "open",
                    "notes": f"Created by smoke test {run_tag}",
                    "lead_id": outreach_lead_id,
                    "template": "lead_follow_up",
                }
            ]
        },
    )
    created_task_ids = [str(item).strip() for item in (workspace_task_create.get("saved_task_ids") or []) if str(item).strip()]
    created_task_id = created_task_ids[0] if created_task_ids else ""
    starter_task_title = f"Starter pack smoke {run_tag}"
    starter_task_create = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workspace-tasks",
        {
            "rows": [
                {
                    "title": starter_task_title,
                    "owner": "Revenue Pod",
                    "priority": "high",
                    "due": "Today",
                    "status": "open",
                    "notes": f"Starter pack smoke task {run_tag}",
                    "template": "starter_sales_search",
                }
            ]
        },
    )
    starter_task_repeat = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workspace-tasks",
        {
            "rows": [
                {
                    "title": starter_task_title,
                    "owner": "Revenue Pod",
                    "priority": "high",
                    "due": "Today",
                    "status": "open",
                    "notes": f"Starter pack smoke task {run_tag}",
                    "template": "starter_sales_search",
                }
            ]
        },
    )
    starter_task_ids = [str(item).strip() for item in (starter_task_create.get("saved_task_ids") or []) if str(item).strip()]
    starter_task_repeat_ids = [str(item).strip() for item in (starter_task_repeat.get("saved_task_ids") or []) if str(item).strip()]
    starter_task_id = starter_task_ids[0] if starter_task_ids else ""
    workspace_task_update = (
        request_json(
            opener,
            "POST",
            f"{args.base_url.rstrip('/')}/api/workspace-tasks/{created_task_id}",
            {
                "status": "done",
                "notes": "Completed by smoke test",
            },
        )
        if created_task_id
        else {}
    )
    workspace_task_delete = (
        request_json(
            opener,
            "DELETE",
            f"{args.base_url.rstrip('/')}/api/workspace-tasks/{created_task_id}",
        )
        if created_task_id
        else {}
    )
    starter_task_delete = (
        request_json(
            opener,
            "DELETE",
            f"{args.base_url.rstrip('/')}/api/workspace-tasks/{starter_task_id}",
        )
        if starter_task_id
        else {}
    )
    team_members_before = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/team/members")
    team_member_invite = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/team/members",
        {
            "email": "smoke-team@supermega.dev",
            "name": "Smoke Team",
            "role": "manager",
            "password": "",
        },
    )
    team_members_after = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/team/members")
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
        "public_bootstrap_status": public_bootstrap.get("status", ""),
        "public_bootstrap_authenticated": bool(public_bootstrap.get("authenticated")),
        "public_session_authenticated": bool(public_session.get("authenticated")),
        "login_status": login.get("status", ""),
        "authenticated": bool(login.get("authenticated")),
        "workspace_slug": ((login.get("session") or {}).get("workspace_slug", "")),
        "action_count": int(((summary.get("actions") or {}).get("total_items") or 0)),
        "supplier_risk_count": int(((summary.get("supplier_watch") or {}).get("risk_count") or 0)),
        "quality_incident_count": int(((summary.get("quality") or {}).get("incident_count") or 0)),
        "director_priority_count": int(director.get("count") or 0),
        "agent_team_count": int(((agent_teams.get("summary") or {}).get("team_count") or 0)),
        "agent_team_autonomy_score": int(((agent_teams.get("summary") or {}).get("autonomy_score") or 0)),
        "agent_run_count": int(agent_runs_before.get("count") or 0),
        "founder_brief_status": str((founder_brief_run.get("row") or {}).get("status", "")),
        "founder_brief_summary": str((founder_brief_run.get("row") or {}).get("summary", "")),
        "revenue_scout_status": str((revenue_scout_run.get("row") or {}).get("status", "")),
        "agent_batch_status": str(agent_batch_run.get("status", "")),
        "agent_batch_count": int(agent_batch_run.get("count") or 0),
        "exception_count": int(exceptions.get("count") or 0),
        "approval_count": int(approvals.get("count") or 0),
        "approval_message": approval_create.get("message", ""),
        "lead_count": len(rows),
        "top_lead": rows[0].get("name", "") if rows else "",
        "provider": lead_finder.get("provider", ""),
        "public_workspace_save_status": public_workspace_save.get("status", ""),
        "public_workspace_save_count": int(public_workspace_save.get("saved_count", 0) or 0),
        "public_workspace_task_count": int(public_workspace_save.get("saved_task_count", 0) or 0),
        "insights_engine": insights.get("engine", ""),
        "pipeline_lead_count": len(pipeline_rows),
        "lead_pack_engine": lead_to_pilot.get("engine", ""),
        "lead_hunt_saved_count": int(lead_hunt.get("saved_count", 0) or 0),
        "hunt_profile_count": len(hunt_profile_rows),
        "hunt_profile_run_saved_count": int(hunt_profile_run.get("saved_count", 0) or 0),
        "run_all_hunts_saved_count": int(run_all_hunts.get("saved_count", 0) or 0),
        "outreach_status": outreach.get("status", ""),
        "workspace_tasks_before_count": int(workspace_tasks_before.get("count") or 0),
        "workspace_task_create_status": workspace_task_create.get("status", ""),
        "starter_task_create_status": starter_task_create.get("status", ""),
        "starter_task_repeat_status": starter_task_repeat.get("status", ""),
        "starter_task_dedupe_ok": bool(starter_task_id and starter_task_repeat_ids and starter_task_id == starter_task_repeat_ids[0]),
        "workspace_task_update_status": workspace_task_update.get("status", ""),
        "workspace_task_delete_removed": bool(workspace_task_delete.get("removed")),
        "starter_task_delete_removed": bool(starter_task_delete.get("removed")),
        "team_members_before_count": int(team_members_before.get("count") or 0),
        "team_member_invite_status": team_member_invite.get("status", ""),
        "team_member_invite_created": bool(team_member_invite.get("created")),
        "team_member_invite_role": str((team_member_invite.get("row") or {}).get("role", "")),
        "team_members_after_count": int(team_members_after.get("count") or 0),
        "workspace_export_status": workspace_export.get("status", ""),
        "workspace_export_link": workspace_export.get("export", {}).get("web_view_link", ""),
        "compose_url": ((outreach.get("draft") or {}).get("compose_url") or ""),
        "public_routes": public_route_statuses,
    }

    if args.as_json:
        print(json.dumps(report, indent=2))
        return 0

    print()
    print("SuperMega app smoke test")
    print(f"- Base URL: {report['base_url']}")
    print(f"- Health: {report['health_status']}")
    print(f"- Public home: {report['public_routes']['home']}")
    print(f"- Public find companies: {report['public_routes']['find_companies']}")
    print(f"- Public company list: {report['public_routes']['company_list']}")
    print(f"- Public task list: {report['public_routes']['task_list']}")
    print(f"- Public book: {report['public_routes']['book']}")
    print(f"- Public bootstrap: {report['public_bootstrap_status']} / authenticated={report['public_session_authenticated']}")
    print(f"- Login: {report['login_status']} / authenticated={report['authenticated']}")
    print(f"- Workspace: {report['workspace_slug']}")
    print(f"- Actions: {report['action_count']}")
    print(f"- Supplier risks: {report['supplier_risk_count']}")
    print(f"- Quality incidents: {report['quality_incident_count']}")
    print(f"- Director priorities: {report['director_priority_count']}")
    print(f"- Agent runs: {report['agent_run_count']}")
    print(f"- Founder brief: {report['founder_brief_status']}")
    print(f"- Revenue scout: {report['revenue_scout_status']}")
    print(f"- Agent batch: {report['agent_batch_status']} ({report['agent_batch_count']})")
    print(f"- Exceptions: {report['exception_count']}")
    print(f"- Approvals: {report['approval_count']}")
    print(f"- Lead finder rows: {report['lead_count']}")
    print(f"- Top lead: {report['top_lead']}")
    print(f"- Provider: {report['provider']}")
    print(f"- Public workspace save: {report['public_workspace_save_status']}")
    print(f"- Public workspace tasks: {report['public_workspace_task_count']}")
    print(f"- Insights engine: {report['insights_engine']}")
    print(f"- Pipeline leads: {report['pipeline_lead_count']}")
    print(f"- Lead pack engine: {report['lead_pack_engine']}")
    print(f"- Lead hunt saved: {report['lead_hunt_saved_count']}")
    print(f"- Hunt profiles: {report['hunt_profile_count']}")
    print(f"- Hunt profile run saved: {report['hunt_profile_run_saved_count']}")
    print(f"- Run-all hunts saved: {report['run_all_hunts_saved_count']}")
    print(f"- Outreach: {report['outreach_status']}")
    print(f"- Workspace tasks before: {report['workspace_tasks_before_count']}")
    print(f"- Workspace task create: {report['workspace_task_create_status']}")
    print(f"- Starter task dedupe: {report['starter_task_dedupe_ok']}")
    print(f"- Workspace task update: {report['workspace_task_update_status']}")
    print(f"- Workspace task delete: {report['workspace_task_delete_removed']}")
    print(f"- Team members before: {report['team_members_before_count']}")
    print(f"- Team invite: {report['team_member_invite_status']} / role={report['team_member_invite_role']}")
    print(f"- Team members after: {report['team_members_after_count']}")
    print(f"- Workspace export: {report['workspace_export_status']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
