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

DEFAULT_REQUEST_TIMEOUT = 15


def request_json(opener, method: str, url: str, payload: dict | None = None, timeout: int | None = None, attempts: int = 3) -> dict:
    effective_timeout = timeout if timeout is not None else DEFAULT_REQUEST_TIMEOUT
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, data=body, headers=headers, method=method.upper())
            with opener.open(request, timeout=effective_timeout) as response:
                raw = response.read().decode("utf-8")
            return json.loads(raw or "{}")
        except (HTTPError, URLError, TimeoutError, ConnectionResetError, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            if attempt == attempts:
                raise
            time.sleep(0.75 * attempt)

    raise RuntimeError(f"Request failed after {attempts} attempts: {url} ({last_error})")


def request_status(opener, url: str, timeout: int | None = None) -> int:
    effective_timeout = timeout if timeout is not None else DEFAULT_REQUEST_TIMEOUT
    request = Request(url, headers={"Accept": "text/html"}, method="GET")
    with opener.open(request, timeout=effective_timeout) as response:
        response.read(64)
        return int(getattr(response, "status", 200) or 200)


def request_error_status(opener, method: str, url: str, payload: dict | None = None, timeout: int | None = None) -> int:
    effective_timeout = timeout if timeout is not None else DEFAULT_REQUEST_TIMEOUT
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers, method=method.upper())
    try:
        with opener.open(request, timeout=effective_timeout) as response:
            response.read(64)
            return int(getattr(response, "status", 200) or 200)
    except HTTPError as exc:
        return int(exc.code or 0)


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
    global DEFAULT_REQUEST_TIMEOUT
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
    DEFAULT_REQUEST_TIMEOUT = max(15, int(args.timeout_seconds))
    run_tag = str(int(time.time() * 1000))

    cookie_jar = CookieJar()
    opener = build_opener(HTTPCookieProcessor(cookie_jar))
    anonymous_cookie_jar = CookieJar()
    anonymous_opener = build_opener(HTTPCookieProcessor(anonymous_cookie_jar))
    public_cookie_jar = CookieJar()
    public_opener = build_opener(HTTPCookieProcessor(public_cookie_jar))
    isolated_cookie_jar = CookieJar()
    isolated_opener = build_opener(HTTPCookieProcessor(isolated_cookie_jar))
    manager_cookie_jar = CookieJar()
    manager_opener = build_opener(HTTPCookieProcessor(manager_cookie_jar))
    member_cookie_jar = CookieJar()
    member_opener = build_opener(HTTPCookieProcessor(member_cookie_jar))
    finance_cookie_jar = CookieJar()
    finance_opener = build_opener(HTTPCookieProcessor(finance_cookie_jar))

    health = wait_for_health(opener, args.base_url.rstrip("/"), args.timeout_seconds)
    public_route_statuses = {
        "home": request_status(public_opener, f"{args.base_url.rstrip('/')}/"),
        "platform": request_status(public_opener, f"{args.base_url.rstrip('/')}/platform/"),
        "demo_center": request_status(public_opener, f"{args.base_url.rstrip('/')}/demo-center/"),
        "find_companies": request_status(public_opener, f"{args.base_url.rstrip('/')}/find-companies/"),
        "company_list": request_status(public_opener, f"{args.base_url.rstrip('/')}/company-list/"),
        "task_list": request_status(public_opener, f"{args.base_url.rstrip('/')}/task-list/"),
        "book": request_status(public_opener, f"{args.base_url.rstrip('/')}/book/"),
        "products": request_status(public_opener, f"{args.base_url.rstrip('/')}/products/"),
        "packages": request_status(public_opener, f"{args.base_url.rstrip('/')}/packages/"),
        "signup": request_status(public_opener, f"{args.base_url.rstrip('/')}/signup/"),
        "login": request_status(public_opener, f"{args.base_url.rstrip('/')}/login/"),
        "contact": request_status(public_opener, f"{args.base_url.rstrip('/')}/contact/"),
        "case_study": request_status(public_opener, f"{args.base_url.rstrip('/')}/clients/yangon-tyre/"),
        "product_knowledge_graph": request_status(public_opener, f"{args.base_url.rstrip('/')}/products/knowledge-graph/"),
        "product_agent_runtime": request_status(public_opener, f"{args.base_url.rstrip('/')}/products/agent-runtime/"),
        "product_tenant_control_plane": request_status(public_opener, f"{args.base_url.rstrip('/')}/products/tenant-control-plane/"),
        "product_data_science_studio": request_status(public_opener, f"{args.base_url.rstrip('/')}/products/data-science-studio/"),
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
    internal_route_statuses = {
        "start": request_status(opener, f"{args.base_url.rstrip('/')}/app/start/"),
        "onboarding": request_status(opener, f"{args.base_url.rstrip('/')}/app/onboarding/"),
        "agent_space": request_status(opener, f"{args.base_url.rstrip('/')}/app/agent-space/"),
        "architect": request_status(opener, f"{args.base_url.rstrip('/')}/app/architect/"),
        "factory": request_status(opener, f"{args.base_url.rstrip('/')}/app/factory/"),
        "foundry": request_status(opener, f"{args.base_url.rstrip('/')}/app/foundry/"),
        "lab": request_status(opener, f"{args.base_url.rstrip('/')}/app/lab/"),
        "model_ops": request_status(opener, f"{args.base_url.rstrip('/')}/app/model-ops/"),
        "product_ops": request_status(opener, f"{args.base_url.rstrip('/')}/app/product-ops/"),
        "platform_admin": request_status(opener, f"{args.base_url.rstrip('/')}/app/platform-admin/"),
        "supermega_dev": request_status(opener, f"{args.base_url.rstrip('/')}/app/supermega-dev/"),
        "revenue": request_status(opener, f"{args.base_url.rstrip('/')}/app/revenue/"),
        "manager_system": request_status(opener, f"{args.base_url.rstrip('/')}/app/manager-system/"),
        "operations": request_status(opener, f"{args.base_url.rstrip('/')}/app/operations/"),
        "dqms": request_status(opener, f"{args.base_url.rstrip('/')}/app/dqms/"),
        "workforce": request_status(opener, f"{args.base_url.rstrip('/')}/app/workforce/"),
        "portal": request_status(opener, f"{args.base_url.rstrip('/')}/app/portal/"),
        "pilot": request_status(opener, f"{args.base_url.rstrip('/')}/app/pilot/"),
    }
    for route_name, route_status in internal_route_statuses.items():
        if route_status != 200:
            raise RuntimeError(f"Internal route '{route_name}' did not render successfully: HTTP {route_status}")
    pilot_feedback_note = f"Pilot smoke note {run_tag}"
    pilot_feedback_save = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/product-feedback",
        {
            "source": "pilot_command",
            "surface": "/app/pilot",
            "category": "bug",
            "priority": "high",
            "status": "open",
            "note": pilot_feedback_note,
        },
    )
    pilot_feedback_rows = request_json(
        opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/product-feedback?source=pilot_command&limit=10",
    )
    matching_pilot_feedback = [
        row
        for row in (pilot_feedback_rows.get("rows") or [])
        if isinstance(row, dict) and str(row.get("note", "")).strip() == pilot_feedback_note
    ]
    if str(pilot_feedback_save.get("status", "")).strip() != "ready":
        raise RuntimeError("Pilot feedback save did not return ready status.")
    if str(((pilot_feedback_save.get("row") or {}).get("source") or "")).strip() != "pilot_command":
        raise RuntimeError("Pilot feedback save did not preserve the pilot_command source.")
    if not matching_pilot_feedback:
        raise RuntimeError("Pilot feedback feed did not return the saved pilot note.")
    summary = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/summary")
    runtime_control = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/runtime/control", timeout=60)
    runtime_required_keys = {"updated_at", "connectors", "knowledge_collections", "policy_guardrails", "autonomy_loops"}
    missing_runtime_keys = sorted(key for key in runtime_required_keys if key not in runtime_control)
    if missing_runtime_keys:
        raise RuntimeError(f"Runtime control payload missing keys: {', '.join(missing_runtime_keys)}")
    for key in ("connectors", "knowledge_collections", "policy_guardrails", "autonomy_loops"):
        if not isinstance(runtime_control.get(key), list):
            raise RuntimeError(f"Runtime control field '{key}' is not a list")
    data_fabric = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/data-fabric", timeout=args.timeout_seconds)
    data_fabric_required_keys = {
        "updated_at",
        "source_registry",
        "connector_signals",
        "learning_database",
        "manager_programs",
        "writeback_lanes",
        "pipeline_stages",
        "topic_pipelines",
        "feature_marts",
    }
    missing_data_fabric_keys = sorted(key for key in data_fabric_required_keys if key not in data_fabric)
    if missing_data_fabric_keys:
        raise RuntimeError(f"Data fabric payload missing keys: {', '.join(missing_data_fabric_keys)}")
    for key in ("source_registry", "connector_signals", "manager_programs", "writeback_lanes", "pipeline_stages", "topic_pipelines", "feature_marts"):
        if not isinstance(data_fabric.get(key), list) or not data_fabric.get(key):
            raise RuntimeError(f"Data fabric field '{key}' is not a non-empty list")
    learning_database = data_fabric.get("learning_database", {})
    if not isinstance(learning_database, dict) or "trust_score" not in learning_database:
        raise RuntimeError("Data fabric learning database payload is missing trust_score")
    model_ops = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/model-ops", timeout=args.timeout_seconds)
    if str(model_ops.get("status", "")).strip() != "ready":
        raise RuntimeError("Model ops payload did not return ready status for owner role.")
    if str(model_ops.get("source", "")).strip() != "live":
        raise RuntimeError("Model ops payload did not return live source.")
    for key in ("providerLanes", "routingLanes", "crewLanes", "benchmarkDrills"):
        if not isinstance(model_ops.get(key), list) or not model_ops.get(key):
            raise RuntimeError(f"Model ops payload is missing the {key} list.")
    insights = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/insights", timeout=args.timeout_seconds)
    agent_teams = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/agent-teams", timeout=args.timeout_seconds)
    manifest = agent_teams.get("manifest", {}) if isinstance(agent_teams, dict) else {}
    if not isinstance(manifest, dict) or not manifest:
        raise RuntimeError("Agent teams payload missing runtime manifest")
    if not isinstance(manifest.get("tools"), list) or not manifest.get("tools"):
        raise RuntimeError("Agent runtime manifest missing tools")
    if not isinstance(manifest.get("playbooks"), list) or not manifest.get("playbooks"):
        raise RuntimeError("Agent runtime manifest missing playbooks")
    manifest_summary = agent_teams.get("summary", {}) if isinstance(agent_teams, dict) else {}
    if int(manifest_summary.get("manifest_tool_count", 0) or 0) != len(manifest.get("tools", [])):
        raise RuntimeError("Agent runtime manifest tool count does not match summary")
    if int(manifest_summary.get("manifest_playbook_count", 0) or 0) != len(manifest.get("playbooks", [])):
        raise RuntimeError("Agent runtime manifest playbook count does not match summary")
    architect_request = {
        "company_name": "Yangon Tyre",
        "sector": "factory",
        "team_size": 120,
        "site_count": 1,
        "priorities": ["actions", "supplier", "receiving", "quality", "director_visibility"],
        "current_tools": ["gmail", "drive", "sheets", "existing_erp"],
        "data_sources": ["gmail", "drive", "sheets", "erp_extracts"],
        "pain_points": "Receiving variances, supplier files, and quality incidents are spread across Gmail, Drive, Sheets, and ERP exports.",
    }
    architect_blueprint = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/solution-architect",
        architect_request,
    )
    architect_launch = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/solution-architect/launch",
        {
            **architect_request,
            "create_tasks": True,
        },
    )
    architect_rollout = request_json(
        opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/rollouts/latest",
    )
    blueprint_payload = architect_blueprint.get("blueprint", {}) if isinstance(architect_blueprint, dict) else {}
    if not isinstance(blueprint_payload, dict) or not str(blueprint_payload.get("primary_pack", "")).strip():
        raise RuntimeError("Solution architect payload missing primary pack")
    launch_payload = architect_launch.get("payload", {}) if isinstance(architect_launch, dict) else {}
    if not isinstance(launch_payload, dict) or not isinstance(launch_payload.get("task_summary", {}), dict):
        raise RuntimeError("Solution architect launch payload missing task summary")
    if int((launch_payload.get("task_summary", {}) or {}).get("saved_count", 0) or 0) <= 0:
        raise RuntimeError("Solution architect launch did not queue rollout tasks")
    rollout_payload = architect_rollout.get("payload", {}) if isinstance(architect_rollout, dict) else {}
    if not isinstance(rollout_payload, dict) or not isinstance(rollout_payload.get("rollout_pack", {}), dict):
        raise RuntimeError("Workspace rollout payload missing rollout pack")
    rollout_workspace = rollout_payload.get("workspace", {}) if isinstance(rollout_payload, dict) else {}
    if str((rollout_workspace or {}).get("workspace_slug", "")).strip() != args.workspace:
        raise RuntimeError("Workspace rollout payload did not resolve to the active workspace")
    if not str(rollout_payload.get("rollout_id", "")).strip():
        raise RuntimeError("Workspace rollout payload missing rollout_id")
    rollout_task_summary = rollout_payload.get("task_summary", {}) if isinstance(rollout_payload, dict) else {}
    if int((rollout_task_summary or {}).get("live_total_count", 0) or 0) <= 0:
        raise RuntimeError("Workspace rollout payload missing live task totals")
    if int((rollout_task_summary or {}).get("live_open_count", 0) or 0) <= 0:
        raise RuntimeError("Workspace rollout payload missing live open launch tasks")
    isolated_signup = request_json(
        isolated_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/auth/signup",
        {
            "name": "Smoke Isolated Owner",
            "email": f"isolated-{run_tag}@supermega.test",
            "company": f"Smoke Isolated {run_tag}",
            "password": "supermega-isolated",
            "workspace_slug": f"isolated-{run_tag}",
        },
    )
    if not bool(isolated_signup.get("authenticated")):
        raise RuntimeError("Smoke isolated signup did not authenticate")
    workspace_snapshot_key = str(architect_launch.get("workspace_snapshot_key", "")).strip()
    global_snapshot_key = str(architect_launch.get("snapshot_key", "")).strip()
    if not workspace_snapshot_key or not global_snapshot_key:
        raise RuntimeError("Solution architect launch did not return snapshot keys")
    active_workspace_snapshot = request_json(
        opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/snapshots/{workspace_snapshot_key}",
    )
    active_snapshot_payload = active_workspace_snapshot.get("payload", {}) if isinstance(active_workspace_snapshot, dict) else {}
    if str((active_snapshot_payload or {}).get("rollout_id", "")).strip() != str(rollout_payload.get("rollout_id", "")).strip():
        raise RuntimeError("Workspace snapshot read did not return the active rollout payload")
    meta_workspace = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/meta/workspace")
    latest_meta_rollout = meta_workspace.get("latest_rollout", {}) if isinstance(meta_workspace, dict) else {}
    if not isinstance(latest_meta_rollout, dict) or not latest_meta_rollout:
        raise RuntimeError("Meta workspace payload missing latest rollout")
    if str(latest_meta_rollout.get("rollout_id", "")).strip() != str(rollout_payload.get("rollout_id", "")).strip():
        raise RuntimeError("Meta workspace did not resolve the active workspace rollout")
    meta_rollout_workspace = latest_meta_rollout.get("workspace", {}) if isinstance(latest_meta_rollout, dict) else {}
    if str((meta_rollout_workspace or {}).get("workspace_slug", "")).strip() != args.workspace:
        raise RuntimeError("Meta workspace rollout resolved to the wrong workspace")
    meta_rollout_task_summary = latest_meta_rollout.get("task_summary", {}) if isinstance(latest_meta_rollout, dict) else {}
    meta_saved_task_ids = {
        str(item).strip()
        for item in (meta_rollout_task_summary.get("saved_task_ids", []) if isinstance(meta_rollout_task_summary, dict) else [])
        if str(item).strip()
    }
    meta_rollout_rows = meta_rollout_task_summary.get("rows", []) if isinstance(meta_rollout_task_summary, dict) else []
    if meta_rollout_rows and meta_saved_task_ids:
        for row in meta_rollout_rows:
            task_id = str((row or {}).get("task_id", "")).strip()
            if task_id and task_id not in meta_saved_task_ids:
                raise RuntimeError(f"Meta workspace rollout queue included task outside saved rollout ids: {task_id}")
        meta_open_rows = [
            row
            for row in meta_rollout_rows
            if str((row or {}).get("status", "")).strip().lower() != "done"
        ]
        if int((meta_rollout_task_summary.get("live_open_count", 0) or 0)) != len(meta_open_rows):
            raise RuntimeError("Meta workspace rollout live_open_count does not match rollout task rows")
    isolated_workspace_denied = request_error_status(
        isolated_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/snapshots/{workspace_snapshot_key}",
    )
    if isolated_workspace_denied != 404:
        raise RuntimeError(f"Other workspace could access workspace rollout snapshot: HTTP {isolated_workspace_denied}")
    isolated_global_denied = request_error_status(
        isolated_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/snapshots/{global_snapshot_key}",
    )
    if isolated_global_denied != 404:
        raise RuntimeError(f"Other workspace could access global rollout snapshot: HTTP {isolated_global_denied}")
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
        },
        timeout=90,
    )
    queued_template_clerk = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs",
        {
            "job_type": "template_clerk",
            "source": "smoke_test_queue",
            "enqueue_only": True,
        },
    )
    queue_worker_run = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs/process-queue",
        {
            "source": "smoke_test_worker",
            "job_types": ["template_clerk"],
            "limit": 1,
        },
        timeout=60,
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
    quality_incident_create = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/quality/incidents",
        {
            "title": "Smoke DQMS incident",
            "summary": "Created by smoke test to verify DQMS incident entry.",
            "supplier": "Smoke Supplier",
            "severity": "medium",
            "status": "open",
            "owner": "Quality Team",
        },
    )
    quality_incidents = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/quality/incidents?limit=5")
    quality_capa_create = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/quality/capa",
        {
            "incident_id": str((quality_incident_create.get("record") or {}).get("incident_id", "")),
            "action_title": "Smoke corrective action",
            "verification_criteria": "Quality lead confirms closure evidence.",
            "owner": "Quality Team",
            "status": "open",
        },
    )
    quality_capa = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/quality/capa?limit=5")
    maintenance_create = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/maintenance/records",
        {
            "asset_name": "Smoke Mixer",
            "issue_type": "breakdown",
            "priority": "high",
            "status": "open",
            "owner": "Maintenance Team",
            "downtime_minutes": "35",
            "next_action": "Inspect motor and restore line.",
        },
    )
    maintenance = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/maintenance/records?limit=5")
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
    manager_email = f"smoke-manager-{run_tag}@supermega.dev"
    member_email = f"smoke-member-{run_tag}@supermega.dev"
    finance_email = f"smoke-finance-{run_tag}@supermega.dev"
    team_members_before = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/team/members")
    team_manager_invite = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/team/members",
        {
            "email": manager_email,
            "name": "Smoke Manager",
            "role": "manager",
            "password": "",
        },
    )
    team_member_invite = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/team/members",
        {
            "email": member_email,
            "name": "Smoke Member",
            "role": "member",
            "password": "",
        },
    )
    team_finance_invite = request_json(
        opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/team/members",
        {
            "email": finance_email,
            "name": "Smoke Finance",
            "role": "finance_controller",
            "password": "",
        },
    )
    team_members_after = request_json(opener, "GET", f"{args.base_url.rstrip('/')}/api/team/members")
    manager_password = str(team_manager_invite.get("generated_password", "")).strip()
    member_password = str(team_member_invite.get("generated_password", "")).strip()
    finance_password = str(team_finance_invite.get("generated_password", "")).strip()
    if not manager_password or not member_password or not finance_password:
        raise RuntimeError("Smoke team invite did not return generated passwords for role-access checks")
    manager_login = request_json(
        manager_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/auth/login",
        {
            "username": manager_email,
            "password": manager_password,
            "workspace_slug": args.workspace,
        },
    )
    member_login = request_json(
        member_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/auth/login",
        {
            "username": member_email,
            "password": member_password,
            "workspace_slug": args.workspace,
        },
    )
    finance_login = request_json(
        finance_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/auth/login",
        {
            "username": finance_email,
            "password": finance_password,
            "workspace_slug": args.workspace,
        },
    )
    anonymous_solution_architect_status = request_error_status(
        anonymous_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/solution-architect",
        architect_request,
    )
    manager_solution_architect_status = request_error_status(
        manager_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/solution-architect",
        architect_request,
    )
    member_solution_architect_status = request_error_status(
        member_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/solution-architect",
        architect_request,
    )
    member_solution_launch_status = request_error_status(
        member_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/tools/solution-architect/launch",
        {
            **architect_request,
            "create_tasks": True,
        },
    )
    if anonymous_solution_architect_status != 401:
        raise RuntimeError(f"Anonymous session could access solution architect: HTTP {anonymous_solution_architect_status}")
    if manager_solution_architect_status != 200:
        raise RuntimeError(f"Manager role lost solution architect access: HTTP {manager_solution_architect_status}")
    if member_solution_architect_status != 403:
        raise RuntimeError(f"Member role could access solution architect: HTTP {member_solution_architect_status}")
    if member_solution_launch_status != 403:
        raise RuntimeError(f"Member role could launch rollout pack: HTTP {member_solution_launch_status}")
    manager_runtime_control_status = request_error_status(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/runtime/control",
        timeout=60,
    )
    manager_model_ops = request_json(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/model-ops",
    )
    manager_cloud_control = request_json(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/cloud/control",
    )
    owner_platform_control = request_json(
        opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/platform/control-plane",
    )
    owner_supermega_dev_control = request_json(
        opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/supermega-dev/control",
    )
    member_runtime_control_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/runtime/control",
    )
    member_cloud_control_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/cloud/control",
    )
    member_model_ops_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/model-ops",
    )
    finance_model_ops = request_json(
        finance_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/model-ops",
    )
    anonymous_model_ops_status = request_error_status(
        anonymous_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/model-ops",
    )
    manager_agent_teams_status = request_error_status(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/agent-teams",
    )
    manager_agent_workspace = request_json(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/agent-workspace/context",
    )
    workforce_registry = request_json(
        opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/workforce/registry",
    )
    member_agent_teams_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/agent-teams",
    )
    member_agent_workspace_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/agent-workspace/context",
    )
    member_meta_workspace_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/meta/workspace",
    )
    anonymous_workforce_registry_status = request_error_status(
        anonymous_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/workforce/registry",
    )
    manager_workforce_registry_status = request_error_status(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/workforce/registry",
    )
    member_workforce_registry_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/workforce/registry",
    )
    finance_workforce_registry_status = request_error_status(
        finance_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/workforce/registry",
    )
    manager_workforce_apply = request_json(
        manager_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workforce/automation/apply",
        {
            "apply_assignments": True,
            "seed_review_cycles": True,
            "queue_default_jobs": False,
            "process_queue": False,
            "limit": 4,
            "source": f"smoke_test_workforce_{run_tag}",
        },
    )
    anonymous_workforce_apply_status = request_error_status(
        anonymous_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workforce/automation/apply",
        {
            "apply_assignments": True,
            "seed_review_cycles": False,
            "queue_default_jobs": False,
            "process_queue": False,
            "limit": 2,
            "source": f"smoke_test_workforce_anon_{run_tag}",
        },
    )
    member_workforce_apply_status = request_error_status(
        member_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workforce/automation/apply",
        {
            "apply_assignments": True,
            "seed_review_cycles": False,
            "queue_default_jobs": False,
            "process_queue": False,
            "limit": 2,
            "source": f"smoke_test_workforce_member_{run_tag}",
        },
    )
    finance_workforce_apply_status = request_error_status(
        finance_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/workforce/automation/apply",
        {
            "apply_assignments": True,
            "seed_review_cycles": False,
            "queue_default_jobs": False,
            "process_queue": False,
            "limit": 2,
            "source": f"smoke_test_workforce_finance_{run_tag}",
        },
    )
    finance_meta_workspace_status = request_error_status(
        finance_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/meta/workspace",
    )
    manager_rollout_latest_status = request_error_status(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/rollouts/latest",
    )
    member_rollout_latest_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/rollouts/latest",
    )
    manager_rollout_snapshot_status = request_error_status(
        manager_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/snapshots/{workspace_snapshot_key}",
    )
    member_rollout_snapshot_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/snapshots/{workspace_snapshot_key}",
    )
    member_global_snapshot_status = request_error_status(
        member_opener,
        "GET",
        f"{args.base_url.rstrip('/')}/api/snapshots/{global_snapshot_key}",
    )
    if manager_runtime_control_status != 200:
        raise RuntimeError(f"Manager role lost runtime control access: HTTP {manager_runtime_control_status}")
    if member_runtime_control_status != 403:
        raise RuntimeError(f"Member role could access runtime control: HTTP {member_runtime_control_status}")
    if anonymous_model_ops_status != 401:
        raise RuntimeError(f"Anonymous session could access model ops: HTTP {anonymous_model_ops_status}")
    if str(manager_model_ops.get("status", "")).strip() != "ready":
        raise RuntimeError("Manager role lost model ops access.")
    if member_model_ops_status != 403:
        raise RuntimeError(f"Member role could access model ops: HTTP {member_model_ops_status}")
    if str(finance_model_ops.get("status", "")).strip() != "ready":
        raise RuntimeError("Finance controller role lost model ops access.")
    if str(manager_cloud_control.get("status", "")).strip() != "ready":
        raise RuntimeError("Cloud control payload did not return ready status for manager role.")
    if not isinstance(manager_cloud_control.get("surfaces"), list):
        raise RuntimeError("Cloud control payload is missing the surfaces list.")
    if not isinstance(manager_cloud_control.get("commands"), list):
        raise RuntimeError("Cloud control payload is missing the commands list.")
    if not isinstance(manager_cloud_control.get("agent_toolchain"), list) or not manager_cloud_control.get("agent_toolchain"):
        raise RuntimeError("Cloud control payload is missing the agent_toolchain list.")
    if not isinstance(manager_cloud_control.get("model_providers"), list) or not manager_cloud_control.get("model_providers"):
        raise RuntimeError("Cloud control payload is missing the model_providers list.")
    if not isinstance(manager_cloud_control.get("workspace_resources"), list) or not manager_cloud_control.get("workspace_resources"):
        raise RuntimeError("Cloud control payload is missing the workspace_resources list.")
    topology = manager_cloud_control.get("topology", {}) if isinstance(manager_cloud_control, dict) else {}
    topology_rows = topology.get("rows", []) if isinstance(topology, dict) and isinstance(topology.get("rows"), list) else []
    if not topology_rows:
        raise RuntimeError("Cloud control payload is missing the topology rows.")
    agent_toolchain_ids = {
        str((item or {}).get("id", "")).strip()
        for item in (manager_cloud_control.get("agent_toolchain") or [])
        if isinstance(item, dict)
    }
    provider_ids = {
        str((item or {}).get("id", "")).strip()
        for item in (manager_cloud_control.get("model_providers") or [])
        if isinstance(item, dict)
    }
    workspace_resource_ids = {
        str((item or {}).get("id", "")).strip()
        for item in (manager_cloud_control.get("workspace_resources") or [])
        if isinstance(item, dict)
    }
    required_toolchain_ids = {"codex-cli", "python-runtime", "git-runtime"}
    missing_toolchain_ids = sorted(required_toolchain_ids - agent_toolchain_ids)
    if missing_toolchain_ids:
        raise RuntimeError(f"Cloud control toolchain payload missing required ids: {', '.join(missing_toolchain_ids)}")
    required_provider_ids = {"provider-openai", "provider-anthropic", "provider-gemini"}
    missing_provider_ids = sorted(required_provider_ids - provider_ids)
    if missing_provider_ids:
        raise RuntimeError(f"Cloud control provider payload missing required ids: {', '.join(missing_provider_ids)}")
    required_workspace_resource_ids = {"ytf-local-data-root", "repo-workspace", "runtime-pack"}
    missing_workspace_resource_ids = sorted(required_workspace_resource_ids - workspace_resource_ids)
    if missing_workspace_resource_ids:
        raise RuntimeError(f"Cloud control workspace resource payload missing required ids: {', '.join(missing_workspace_resource_ids)}")
    topology_hosts = {
        str((item or {}).get("hostname", "")).strip()
        for item in topology_rows
        if isinstance(item, dict)
    }
    if not topology_hosts or not any(host.endswith(".supermega.dev") or host == "supermega.dev" for host in topology_hosts):
        raise RuntimeError("Cloud control topology is missing a supermega.dev host.")
    platform_domains = owner_platform_control.get("domains", {}) if isinstance(owner_platform_control, dict) else {}
    if not isinstance(platform_domains.get("rows"), list) or not platform_domains.get("rows"):
        raise RuntimeError("Platform control payload is missing the domains rows.")
    if str(owner_supermega_dev_control.get("status", "")).strip() != "ready":
        raise RuntimeError("supermega.dev control payload did not return ready status.")
    if not isinstance(owner_supermega_dev_control.get("machine"), dict):
        raise RuntimeError("supermega.dev control payload is missing the machine summary.")
    if not isinstance(owner_supermega_dev_control.get("resources"), dict):
        raise RuntimeError("supermega.dev control payload is missing the resource groups.")
    if not isinstance(((owner_supermega_dev_control.get("domains") or {}).get("root_report")), dict):
        raise RuntimeError("supermega.dev control payload is missing the root domain report.")
    if not isinstance(((owner_supermega_dev_control.get("deployment") or {}).get("scripts")), list):
        raise RuntimeError("supermega.dev control payload is missing deployment scripts.")
    if not isinstance(((owner_supermega_dev_control.get("smoke") or {}).get("scripts")), list):
        raise RuntimeError("supermega.dev control payload is missing smoke scripts.")
    root_domain = str(((owner_supermega_dev_control.get("machine") or {}).get("root_domain", "")).strip())
    if root_domain != "supermega.dev":
        raise RuntimeError(f"supermega.dev control payload returned unexpected root domain: {root_domain or 'missing'}")
    root_report = (owner_supermega_dev_control.get("domains") or {}).get("root_report", {})
    if str((root_report or {}).get("domain", "")).strip() != "supermega.dev":
        raise RuntimeError("supermega.dev control payload root report is not checking supermega.dev.")
    if member_cloud_control_status != 403:
        raise RuntimeError(f"Member role could access cloud control: HTTP {member_cloud_control_status}")
    if manager_agent_teams_status != 200:
        raise RuntimeError(f"Manager role lost agent-team access: HTTP {manager_agent_teams_status}")
    if str(manager_agent_workspace.get("status", "")).strip() != "ready":
        raise RuntimeError("Agent workspace payload did not return ready status for manager role.")
    if not isinstance(manager_agent_workspace.get("workspaces"), list):
        raise RuntimeError("Agent workspace payload is missing the workspaces list.")
    if not isinstance(manager_agent_workspace.get("live"), dict):
        raise RuntimeError("Agent workspace payload is missing the live payload.")
    if member_agent_teams_status != 403:
        raise RuntimeError(f"Member role could access agent-team manifest: HTTP {member_agent_teams_status}")
    if member_agent_workspace_status != 403:
        raise RuntimeError(f"Member role could access agent workspace: HTTP {member_agent_workspace_status}")
    if str(workforce_registry.get("status", "")).strip() != "ready":
        raise RuntimeError("Workforce registry payload did not return ready status.")
    workforce_manifest = workforce_registry.get("manifest", {}) if isinstance(workforce_registry, dict) else {}
    if not isinstance(workforce_manifest, dict):
        raise RuntimeError("Workforce registry payload is missing the manifest object.")
    if not isinstance(workforce_manifest.get("playbooks"), list) or not workforce_manifest.get("playbooks"):
        raise RuntimeError("Workforce registry payload is missing live playbooks.")
    if not isinstance(workforce_registry.get("build_teams"), list) or not workforce_registry.get("build_teams"):
        raise RuntimeError("Workforce registry payload is missing build teams.")
    if not isinstance(workforce_registry.get("instruction_packs"), list) or not workforce_registry.get("instruction_packs"):
        raise RuntimeError("Workforce registry payload is missing instruction packs.")
    workforce_live = workforce_registry.get("live", {}) if isinstance(workforce_registry.get("live"), dict) else {}
    if not isinstance(workforce_live.get("commands"), list):
        raise RuntimeError("Workforce registry payload is missing live commands.")
    for key in ("core_team", "assignment_board", "review_cycles", "automation_lanes", "data_links"):
        if not isinstance(workforce_live.get(key), list) or not workforce_live.get(key):
            raise RuntimeError(f"Workforce registry payload is missing live {key}.")
    if anonymous_workforce_registry_status != 401:
        raise RuntimeError(f"Anonymous session could access workforce registry: HTTP {anonymous_workforce_registry_status}")
    if manager_workforce_registry_status != 200:
        raise RuntimeError(f"Manager role lost workforce registry access: HTTP {manager_workforce_registry_status}")
    if member_workforce_registry_status != 200:
        raise RuntimeError(f"Member role lost workforce registry access: HTTP {member_workforce_registry_status}")
    if finance_workforce_registry_status != 200:
        raise RuntimeError(f"Finance controller lost workforce registry access: HTTP {finance_workforce_registry_status}")
    if str(manager_workforce_apply.get("status", "")).strip() != "ready":
        raise RuntimeError("Workforce automation mutation did not return ready status for manager role.")
    manager_workforce_apply_registry = (
        manager_workforce_apply.get("registry", {}) if isinstance(manager_workforce_apply.get("registry"), dict) else {}
    )
    if str(manager_workforce_apply_registry.get("status", "")).strip() != "ready":
        raise RuntimeError("Workforce automation mutation did not return a ready registry payload.")
    for key in ("applied_assignment_count", "seeded_review_count", "queued_job_count", "processed_job_count"):
        value = manager_workforce_apply.get(key)
        if not isinstance(value, int) or value < 0:
            raise RuntimeError(f"Workforce automation mutation returned invalid {key}: {value!r}")
    if anonymous_workforce_apply_status != 401:
        raise RuntimeError(f"Anonymous session could mutate workforce automation: HTTP {anonymous_workforce_apply_status}")
    if member_workforce_apply_status != 403:
        raise RuntimeError(f"Member role could mutate workforce automation: HTTP {member_workforce_apply_status}")
    if finance_workforce_apply_status != 403:
        raise RuntimeError(f"Finance controller could mutate workforce automation: HTTP {finance_workforce_apply_status}")
    if member_meta_workspace_status != 200:
        raise RuntimeError(f"Member role lost meta workspace access: HTTP {member_meta_workspace_status}")
    if finance_meta_workspace_status != 403:
        raise RuntimeError(f"Finance controller could access meta workspace: HTTP {finance_meta_workspace_status}")
    if manager_rollout_latest_status != 200:
        raise RuntimeError(f"Manager role lost rollout access: HTTP {manager_rollout_latest_status}")
    if member_rollout_latest_status != 403:
        raise RuntimeError(f"Member role could access rollout payload: HTTP {member_rollout_latest_status}")
    if manager_rollout_snapshot_status != 200:
        raise RuntimeError(f"Manager role lost rollout snapshot access: HTTP {manager_rollout_snapshot_status}")
    if member_rollout_snapshot_status != 403:
        raise RuntimeError(f"Member role could access rollout snapshot: HTTP {member_rollout_snapshot_status}")
    if member_global_snapshot_status != 403:
        raise RuntimeError(f"Member role could access global rollout snapshot: HTTP {member_global_snapshot_status}")
    anonymous_agent_run_status = request_error_status(
        anonymous_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs",
        {
            "job_type": "template_clerk",
            "source": "smoke_test_negative",
            "enqueue_only": True,
            "idempotency_key": f"anon-{run_tag}",
        },
    )
    manager_agent_run_status = request_error_status(
        manager_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs",
        {
            "job_type": "template_clerk",
            "source": "smoke_test_manager",
            "enqueue_only": True,
            "idempotency_key": f"manager-{run_tag}",
        },
    )
    member_agent_run_status = request_error_status(
        member_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs",
        {
            "job_type": "template_clerk",
            "source": "smoke_test_member",
            "enqueue_only": True,
            "idempotency_key": f"member-{run_tag}",
        },
    )
    member_agent_batch_status = request_error_status(
        member_opener,
        "POST",
        f"{args.base_url.rstrip('/')}/api/agent-runs/run-defaults",
        {
            "source": "smoke_test_member",
            "job_types": ["template_clerk"],
        },
    )
    if anonymous_agent_run_status != 401:
        raise RuntimeError(f"Anonymous session could trigger agent run: HTTP {anonymous_agent_run_status}")
    if manager_agent_run_status != 200:
        raise RuntimeError(f"Manager role lost agent-run mutation access: HTTP {manager_agent_run_status}")
    if member_agent_run_status != 403:
        raise RuntimeError(f"Member role could trigger agent run: HTTP {member_agent_run_status}")
    if member_agent_batch_status != 403:
        raise RuntimeError(f"Member role could run default agent batch: HTTP {member_agent_batch_status}")
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
        "manager_authenticated": bool(manager_login.get("authenticated")),
        "member_authenticated": bool(member_login.get("authenticated")),
        "finance_authenticated": bool(finance_login.get("authenticated")),
        "workspace_slug": ((login.get("session") or {}).get("workspace_slug", "")),
        "action_count": int(((summary.get("actions") or {}).get("total_items") or 0)),
        "runtime_updated_at": str(runtime_control.get("updated_at", "")),
        "runtime_connector_count": len(runtime_control.get("connectors") or []),
        "runtime_knowledge_count": len(runtime_control.get("knowledge_collections") or []),
        "runtime_guardrail_count": len(runtime_control.get("policy_guardrails") or []),
        "runtime_autonomy_count": len(runtime_control.get("autonomy_loops") or []),
        "data_fabric_updated_at": str(data_fabric.get("updated_at", "")),
        "data_fabric_source_registry_count": len(data_fabric.get("source_registry") or []),
        "data_fabric_connector_signal_count": len(data_fabric.get("connector_signals") or []),
        "data_fabric_manager_program_count": len(data_fabric.get("manager_programs") or []),
        "data_fabric_writeback_lane_count": len(data_fabric.get("writeback_lanes") or []),
        "data_fabric_pipeline_stage_count": len(data_fabric.get("pipeline_stages") or []),
        "data_fabric_topic_pipeline_count": len(data_fabric.get("topic_pipelines") or []),
        "data_fabric_feature_mart_count": len(data_fabric.get("feature_marts") or []),
        "data_fabric_trust_score": int(learning_database.get("trust_score", 0) or 0),
        "pilot_feedback_status": str(pilot_feedback_save.get("status", "")),
        "pilot_feedback_source": str(((pilot_feedback_save.get("row") or {}).get("source") or "")),
        "pilot_feedback_row_count": len(pilot_feedback_rows.get("rows") or []),
        "pilot_feedback_match_count": len(matching_pilot_feedback),
        "supplier_risk_count": int(((summary.get("supplier_watch") or {}).get("risk_count") or 0)),
        "quality_incident_count": int(((summary.get("quality") or {}).get("incident_count") or 0)),
        "quality_incident_api_count": int(quality_incidents.get("count") or 0),
        "quality_capa_api_count": int(quality_capa.get("count") or 0),
        "maintenance_count": int(maintenance.get("count") or 0),
        "director_priority_count": int(director.get("count") or 0),
        "agent_team_count": int(((agent_teams.get("summary") or {}).get("team_count") or 0)),
        "agent_team_autonomy_score": int(((agent_teams.get("summary") or {}).get("autonomy_score") or 0)),
        "solution_blueprint_primary_pack": str((blueprint_payload or {}).get("primary_pack", "")),
        "solution_launch_status": str(architect_launch.get("status", "")),
        "solution_launch_task_count": int(((launch_payload.get("task_summary", {}) or {}).get("saved_count", 0) or 0)),
        "solution_rollout_id": str(rollout_payload.get("rollout_id", "")),
        "solution_rollout_live_open_count": int(((rollout_task_summary or {}).get("live_open_count", 0) or 0)),
        "solution_rollout_live_done_count": int(((rollout_task_summary or {}).get("live_done_count", 0) or 0)),
        "solution_workspace_snapshot_read_ok": bool(active_snapshot_payload),
        "solution_workspace_snapshot_denied_other_workspace": isolated_workspace_denied == 404,
        "solution_global_snapshot_denied_other_workspace": isolated_global_denied == 404,
        "manager_runtime_control_status": manager_runtime_control_status,
        "member_runtime_control_status": member_runtime_control_status,
        "anonymous_model_ops_status": anonymous_model_ops_status,
        "manager_model_ops_status": 200,
        "member_model_ops_status": member_model_ops_status,
        "finance_model_ops_status": 200,
        "model_ops_status": str(model_ops.get("status", "")),
        "model_ops_source": str(model_ops.get("source", "")),
        "model_ops_provider_count": len(model_ops.get("providerLanes") or []),
        "model_ops_routing_count": len(model_ops.get("routingLanes") or []),
        "model_ops_crew_count": len(model_ops.get("crewLanes") or []),
        "model_ops_drill_count": len(model_ops.get("benchmarkDrills") or []),
        "manager_cloud_control_status": 200,
        "member_cloud_control_status": member_cloud_control_status,
        "cloud_control_ready_count": int(((manager_cloud_control.get("summary") or {}).get("ready_count") or 0)),
        "cloud_control_attention_count": int(((manager_cloud_control.get("summary") or {}).get("attention_count") or 0)),
        "cloud_control_blocker_count": int(((manager_cloud_control.get("summary") or {}).get("blocker_count") or 0)),
        "cloud_control_toolchain_count": len(manager_cloud_control.get("agent_toolchain") or []),
        "cloud_control_provider_count": len(manager_cloud_control.get("model_providers") or []),
        "cloud_control_workspace_resource_count": len(manager_cloud_control.get("workspace_resources") or []),
        "cloud_control_topology_count": len(topology_rows),
        "platform_domain_count": len(platform_domains.get("rows") or []),
        "supermega_dev_control_status": 200,
        "supermega_dev_deploy_script_count": len(((owner_supermega_dev_control.get("deployment") or {}).get("scripts") or [])),
        "supermega_dev_smoke_script_count": len(((owner_supermega_dev_control.get("smoke") or {}).get("scripts") or [])),
        "supermega_dev_instruction_resource_count": len(((owner_supermega_dev_control.get("resources") or {}).get("instructions") or [])),
        "manager_agent_teams_status": manager_agent_teams_status,
        "member_agent_teams_status": member_agent_teams_status,
        "manager_agent_workspace_status": 200,
        "member_agent_workspace_status": member_agent_workspace_status,
        "agent_workspace_resource_id": str(manager_agent_workspace.get("resource_id", "")),
        "agent_workspace_ai_team_count": int(((manager_agent_workspace.get("summary") or {}).get("ai_team_count") or 0)),
        "workforce_registry_status": str(workforce_registry.get("status", "")),
        "workforce_registry_resource_id": str(workforce_registry.get("resource_id", "")),
        "workforce_registry_playbook_count": len((workforce_manifest.get("playbooks") or [])),
        "workforce_registry_build_team_count": len((workforce_registry.get("build_teams") or [])),
        "workforce_registry_instruction_pack_count": len((workforce_registry.get("instruction_packs") or [])),
        "workforce_registry_core_team_count": len((workforce_live.get("core_team") or [])),
        "workforce_registry_assignment_count": len((workforce_live.get("assignment_board") or [])),
        "workforce_registry_review_cycle_count": len((workforce_live.get("review_cycles") or [])),
        "workforce_registry_automation_lane_count": len((workforce_live.get("automation_lanes") or [])),
        "workforce_registry_data_link_count": len((workforce_live.get("data_links") or [])),
        "workforce_registry_anonymous_status": anonymous_workforce_registry_status,
        "workforce_registry_manager_status": manager_workforce_registry_status,
        "workforce_registry_member_status": member_workforce_registry_status,
        "workforce_registry_finance_status": finance_workforce_registry_status,
        "workforce_apply_status": str(manager_workforce_apply.get("status", "")),
        "workforce_apply_message": str(manager_workforce_apply.get("message", "")),
        "workforce_apply_assignment_count": int(manager_workforce_apply.get("applied_assignment_count") or 0),
        "workforce_apply_review_count": int(manager_workforce_apply.get("seeded_review_count") or 0),
        "workforce_apply_queued_count": int(manager_workforce_apply.get("queued_job_count") or 0),
        "workforce_apply_processed_count": int(manager_workforce_apply.get("processed_job_count") or 0),
        "workforce_apply_anonymous_status": anonymous_workforce_apply_status,
        "workforce_apply_manager_status": 200,
        "workforce_apply_member_status": member_workforce_apply_status,
        "workforce_apply_finance_status": finance_workforce_apply_status,
        "member_meta_workspace_status": member_meta_workspace_status,
        "finance_meta_workspace_status": finance_meta_workspace_status,
        "manager_rollout_latest_status": manager_rollout_latest_status,
        "member_rollout_latest_status": member_rollout_latest_status,
        "manager_rollout_snapshot_status": manager_rollout_snapshot_status,
        "member_rollout_snapshot_status": member_rollout_snapshot_status,
        "member_global_rollout_snapshot_status": member_global_snapshot_status,
        "meta_rollout_id": str(latest_meta_rollout.get("rollout_id", "")),
        "meta_rollout_open_count": int(((meta_rollout_task_summary or {}).get("live_open_count", 0) or 0)),
        "meta_rollout_rows_aligned": bool(
            not meta_rollout_rows
            or all(str((row or {}).get("task_id", "")).strip() in meta_saved_task_ids for row in meta_rollout_rows if str((row or {}).get("task_id", "")).strip())
        ),
        "agent_run_count": int(agent_runs_before.get("count") or 0),
        "founder_brief_status": str((founder_brief_run.get("row") or {}).get("status", "")),
        "founder_brief_summary": str((founder_brief_run.get("row") or {}).get("summary", "")),
        "revenue_scout_status": str((revenue_scout_run.get("row") or {}).get("status", "")),
        "agent_batch_status": str(agent_batch_run.get("status", "")),
        "agent_batch_count": int(agent_batch_run.get("count") or 0),
        "queued_template_clerk_status": str((queued_template_clerk.get("row") or {}).get("status", "")),
        "queue_worker_status": str(queue_worker_run.get("status", "")),
        "queue_worker_count": int(queue_worker_run.get("processed_count") or 0),
        "exception_count": int(exceptions.get("count") or 0),
        "approval_count": int(approvals.get("count") or 0),
        "approval_message": approval_create.get("message", ""),
        "quality_incident_saved": bool((quality_incident_create.get("record") or {}).get("incident_id")),
        "quality_capa_saved": bool((quality_capa_create.get("record") or {}).get("capa_id")),
        "maintenance_saved": bool((maintenance_create.get("record") or {}).get("maintenance_id")),
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
        "team_manager_invite_status": team_manager_invite.get("status", ""),
        "team_manager_invite_created": bool(team_manager_invite.get("created")),
        "team_manager_invite_role": str((team_manager_invite.get("row") or {}).get("role", "")),
        "team_member_invite_status": team_member_invite.get("status", ""),
        "team_member_invite_created": bool(team_member_invite.get("created")),
        "team_member_invite_role": str((team_member_invite.get("row") or {}).get("role", "")),
        "team_members_after_count": int(team_members_after.get("count") or 0),
        "manager_login_status": manager_login.get("status", ""),
        "manager_authenticated": bool(manager_login.get("authenticated")),
        "member_login_status": member_login.get("status", ""),
        "member_authenticated": bool(member_login.get("authenticated")),
        "solution_architect_anonymous_status": anonymous_solution_architect_status,
        "solution_architect_manager_status": manager_solution_architect_status,
        "solution_architect_member_status": member_solution_architect_status,
        "solution_architect_member_launch_status": member_solution_launch_status,
        "agent_run_anonymous_status": anonymous_agent_run_status,
        "agent_run_manager_status": manager_agent_run_status,
        "agent_run_member_status": member_agent_run_status,
        "agent_run_member_batch_status": member_agent_batch_status,
        "workspace_export_status": workspace_export.get("status", ""),
        "workspace_export_link": workspace_export.get("export", {}).get("web_view_link", ""),
        "compose_url": ((outreach.get("draft") or {}).get("compose_url") or ""),
        "public_routes": public_route_statuses,
        "internal_routes": internal_route_statuses,
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
    print(f"- Public demo center: {report['public_routes']['demo_center']}")
    print(f"- Public products: {report['public_routes']['products']}")
    print(f"- Product detail / knowledge graph: {report['public_routes']['product_knowledge_graph']}")
    print(f"- Product detail / agent runtime: {report['public_routes']['product_agent_runtime']}")
    print(f"- Product detail / tenant control plane: {report['public_routes']['product_tenant_control_plane']}")
    print(f"- Product detail / data science studio: {report['public_routes']['product_data_science_studio']}")
    print(f"- Internal start route: {report['internal_routes']['start']}")
    print(f"- Internal architect route: {report['internal_routes']['architect']}")
    print(f"- Internal build route: {report['internal_routes']['factory']}")
    print(f"- Internal foundry route: {report['internal_routes']['foundry']}")
    print(f"- Internal lab route: {report['internal_routes']['lab']}")
    print(f"- Internal model ops route: {report['internal_routes']['model_ops']}")
    print(f"- Internal product ops route: {report['internal_routes']['product_ops']}")
    print(f"- Internal platform admin route: {report['internal_routes']['platform_admin']}")
    print(f"- Internal revenue route: {report['internal_routes']['revenue']}")
    print(f"- Internal manager system route: {report['internal_routes']['manager_system']}")
    print(f"- Internal operations route: {report['internal_routes']['operations']}")
    print(f"- Internal DQMS route: {report['internal_routes']['dqms']}")
    print(f"- Internal workforce route: {report['internal_routes']['workforce']}")
    print(f"- Internal portal route: {report['internal_routes']['portal']}")
    print(f"- Internal pilot route: {report['internal_routes']['pilot']}")
    print(f"- Public bootstrap: {report['public_bootstrap_status']} / authenticated={report['public_session_authenticated']}")
    print(f"- Login: {report['login_status']} / authenticated={report['authenticated']}")
    print(f"- Workspace: {report['workspace_slug']}")
    print(f"- Actions: {report['action_count']}")
    print(
        f"- Runtime control: connectors={report['runtime_connector_count']} "
        f"knowledge={report['runtime_knowledge_count']} "
        f"guardrails={report['runtime_guardrail_count']} "
        f"autonomy={report['runtime_autonomy_count']}"
    )
    print(
        f"- Data fabric: sources={report['data_fabric_source_registry_count']} "
        f"connectors={report['data_fabric_connector_signal_count']} "
        f"programs={report['data_fabric_manager_program_count']} "
        f"writeback={report['data_fabric_writeback_lane_count']} "
        f"stages={report['data_fabric_pipeline_stage_count']} "
        f"marts={report['data_fabric_feature_mart_count']} "
        f"trust={report['data_fabric_trust_score']}%"
    )
    print(
        f"- Pilot feedback: {report['pilot_feedback_status']} "
        f"(source={report['pilot_feedback_source']}, "
        f"rows={report['pilot_feedback_row_count']}, "
        f"match={report['pilot_feedback_match_count']})"
    )
    print(
        f"- Model ops: status={report['model_ops_status']} "
        f"source={report['model_ops_source']} "
        f"providers={report['model_ops_provider_count']} "
        f"routing={report['model_ops_routing_count']} "
        f"crews={report['model_ops_crew_count']} "
        f"drills={report['model_ops_drill_count']}"
    )
    print(f"- Supplier risks: {report['supplier_risk_count']}")
    print(f"- Quality incidents: {report['quality_incident_count']}")
    print(f"- Director priorities: {report['director_priority_count']}")
    print(
        f"- Workforce registry: {report['workforce_registry_status']} "
        f"(playbooks={report['workforce_registry_playbook_count']}, "
        f"teams={report['workforce_registry_build_team_count']}, "
        f"packs={report['workforce_registry_instruction_pack_count']}, "
        f"core={report['workforce_registry_core_team_count']}, "
        f"assignments={report['workforce_registry_assignment_count']}, "
        f"reviews={report['workforce_registry_review_cycle_count']}, "
        f"automation={report['workforce_registry_automation_lane_count']}, "
        f"data={report['workforce_registry_data_link_count']})"
    )
    print(
        f"- Workforce apply: {report['workforce_apply_status']} "
        f"(assignments={report['workforce_apply_assignment_count']}, "
        f"reviews={report['workforce_apply_review_count']}, "
        f"queued={report['workforce_apply_queued_count']}, "
        f"processed={report['workforce_apply_processed_count']})"
    )
    print(f"- Solution blueprint pack: {report['solution_blueprint_primary_pack']}")
    print(f"- Solution launch: {report['solution_launch_status']} ({report['solution_launch_task_count']})")
    print(
        f"- Rollout run: {report['solution_rollout_id']} "
        f"(open={report['solution_rollout_live_open_count']}, done={report['solution_rollout_live_done_count']})"
    )
    print(
        f"- Meta rollout: {report['meta_rollout_id']} "
        f"(open={report['meta_rollout_open_count']}, aligned={report['meta_rollout_rows_aligned']})"
    )
    print(
        f"- Snapshot isolation: workspace-read={report['solution_workspace_snapshot_read_ok']} "
        f"workspace-denied={report['solution_workspace_snapshot_denied_other_workspace']} "
        f"global={report['solution_global_snapshot_denied_other_workspace']}"
    )
    print(f"- Agent runs: {report['agent_run_count']}")
    print(f"- Founder brief: {report['founder_brief_status']}")
    print(f"- Revenue scout: {report['revenue_scout_status']}")
    print(f"- Agent batch: {report['agent_batch_status']} ({report['agent_batch_count']})")
    print(f"- Queued template clerk: {report['queued_template_clerk_status']}")
    print(f"- Queue worker: {report['queue_worker_status']} ({report['queue_worker_count']})")
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
    print(f"- Team invite manager: {report['team_manager_invite_status']} / role={report['team_manager_invite_role']}")
    print(f"- Team invite member: {report['team_member_invite_status']} / role={report['team_member_invite_role']}")
    print(f"- Team members after: {report['team_members_after_count']}")
    print(
        f"- Solution Architect access: anonymous={report['solution_architect_anonymous_status']} "
        f"manager={report['solution_architect_manager_status']} "
        f"member={report['solution_architect_member_status']} "
        f"member-launch={report['solution_architect_member_launch_status']}"
    )
    print(
        f"- Workforce registry access: anonymous={report['workforce_registry_anonymous_status']} "
        f"manager={report['workforce_registry_manager_status']} "
        f"member={report['workforce_registry_member_status']} "
        f"finance={report['workforce_registry_finance_status']}"
    )
    print(
        f"- Workforce apply access: anonymous={report['workforce_apply_anonymous_status']} "
        f"manager={report['workforce_apply_manager_status']} "
        f"member={report['workforce_apply_member_status']} "
        f"finance={report['workforce_apply_finance_status']}"
    )
    print(
        f"- Agent run access: anonymous={report['agent_run_anonymous_status']} "
        f"manager={report['agent_run_manager_status']} "
        f"member={report['agent_run_member_status']} "
        f"member-batch={report['agent_run_member_batch_status']}"
    )
    print(f"- Workspace export: {report['workspace_export_status']}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
