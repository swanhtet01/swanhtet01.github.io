from __future__ import annotations

import argparse
import json
import os
import re
import sys
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request as UrlRequest, urlopen

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mark1_pilot.state_store import (  # noqa: E402
    add_action_items,
    add_attendance_event,
    add_contact_submission,
    add_lead_activity,
    add_lead_pipeline_rows,
    add_metric_entries,
    add_metric_entry,
    add_inventory_record,
    add_product_feedback,
    add_receiving_record,
    authenticate_app_user,
    create_app_session,
    ensure_app_user,
    grant_workspace_access,
    get_app_session,
    list_actions,
    list_agent_teams,
    list_attendance_events,
    list_capa_actions,
    list_contact_submissions,
    list_inventory_records,
    list_lead_activity,
    list_lead_pipeline,
    list_metric_entries,
    list_product_feedback,
    list_receiving_records,
    list_workspace_members,
    list_quality_incidents,
    list_supplier_risks,
    load_action_summary,
    load_agent_team_summary,
    load_inventory_summary,
    load_lead_pipeline_summary,
    load_metric_summary,
    load_product_feedback_summary,
    load_receiving_summary,
    load_quality_summary,
    load_snapshot,
    load_supplier_risk_summary,
    load_workspace_member_summary,
    revoke_app_session,
    resolve_state_db,
    sync_state_from_output_dir,
    update_lead_pipeline_row,
)
from mark1_pilot.lead_finder import run_lead_finder  # noqa: E402
from mark1_pilot.lead_to_pilot import build_lead_to_pilot_pack  # noqa: E402
from mark1_pilot.document_intake import analyze_document  # noqa: E402
from mark1_pilot.metric_intake import extract_metric_candidates, summarize_metric_rows  # noqa: E402
from mark1_pilot.solution_architect import build_solution_blueprint  # noqa: E402
from mark1_pilot.connectors.google_drive import GoogleDriveProbe  # noqa: E402


class LeadFinderRequest(BaseModel):
    raw_text: str = Field(default="")
    query: str = Field(default="")
    keywords: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=lambda: ["web", "social", "maps"])
    limit: int = Field(default=10, ge=1, le=20)


class LeadToPilotRequest(BaseModel):
    leads: list[dict[str, Any]] = Field(default_factory=list)
    campaign_goal: str = ""


class NewsBriefRequest(BaseModel):
    raw_text: str = Field(default="")
    urls: list[str] = Field(default_factory=list)


class ActionBoardRequest(BaseModel):
    raw_text: str = Field(default="")


class ActionBoardSaveRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)


class ContactSubmissionRequest(BaseModel):
    name: str
    email: str
    company: str
    workflow: str
    data: str
    goal: str


class WorkspaceAccessRequest(BaseModel):
    name: str
    email: str
    company: str
    role: str = "operator"


class AttendanceCheckinRequest(BaseModel):
    employee_name: str
    employee_code: str = ""
    shift_name: str = ""
    station: str = ""
    status: str = "present"
    method: str = "photo_checkin"
    evidence_url: str = ""
    note: str = ""


class ReceivingRecordRequest(BaseModel):
    received_at: str = ""
    supplier: str
    po_or_pi: str = ""
    grn_or_batch: str = ""
    material: str
    expected_qty: str = ""
    received_qty: str = ""
    status: str = "review"
    owner: str = "Stores Team"
    next_action: str = ""
    evidence_link: str = ""


class InventoryRecordRequest(BaseModel):
    captured_at: str = ""
    item_code: str = ""
    item_name: str
    warehouse: str = "Main Warehouse"
    on_hand_qty: str = ""
    reserved_qty: str = ""
    reorder_point: str = ""
    status: str = ""
    owner: str = "Stores Team"
    next_action: str = ""
    evidence_link: str = ""


class DocumentIntakeRequest(BaseModel):
    filename: str
    content_base64: str


class SolutionArchitectRequest(BaseModel):
    company_name: str = "New Client"
    sector: str = "mixed"
    team_size: int = 25
    site_count: int = 1
    priorities: list[str] = Field(default_factory=list)
    current_tools: list[str] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    pain_points: str = ""


class MetricExtractRequest(BaseModel):
    filename: str
    content_base64: str


class MetricRecordRequest(BaseModel):
    captured_at: str = ""
    metric_name: str
    metric_group: str = "general"
    metric_value: str
    unit: str = "value"
    period_label: str = ""
    scope: str = ""
    owner: str = "Management"
    status: str = "reported"
    notes: str = ""
    evidence_link: str = ""


class MetricBulkSaveRequest(BaseModel):
    rows: list[MetricRecordRequest] = Field(default_factory=list)


class ProductFeedbackRequest(BaseModel):
    surface: str = "general"
    category: str = "idea"
    priority: str = "medium"
    status: str = "open"
    note: str


class LeadPipelineImportRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    campaign_goal: str = ""


class LeadPipelineUpdateRequest(BaseModel):
    stage: str | None = None
    status: str | None = None
    owner: str | None = None
    notes: str | None = None


class LeadPipelineExportRequest(BaseModel):
    workspace_folder_name: str = "SuperMega Sales"
    spreadsheet_name: str = "SuperMega Lead Pipeline"
    sheet_name: str = "Leads"


class LeadActivityRequest(BaseModel):
    activity_type: str = "note"
    channel: str = "email"
    direction: str = "outbound"
    message: str
    stage_after: str = ""
    next_step: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _unique_values(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = str(value or "").strip().rstrip("),.;")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def _parse_leads(raw_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    lines = [line.strip() for line in str(raw_text or "").splitlines() if line.strip()]
    for line in lines:
        emails = _unique_values(re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", line, flags=re.I))
        websites = _unique_values(re.findall(r"(?:https?://|www\.)[^\s,;]+", line, flags=re.I))
        phones = _unique_values([re.sub(r"\s+", " ", match).strip() for match in re.findall(r"\+?\d[\d\s\-()]{7,}\d", line)])

        score = 0
        if emails:
            score += 2
        if websites:
            score += 2
        if phones:
            score += 1
        if re.search(r"(tyre|tire|truck|industrial|distributor|auto|service|retail|buyer)", line, flags=re.I):
            score += 2

        rows.append(
            {
                "name": line.split("|")[0].split(",")[0].strip() or "Unknown lead",
                "email": emails[0] if emails else "",
                "phone": phones[0] if phones else "",
                "website": websites[0] if websites else "",
                "score": score,
            }
        )
    return sorted(rows, key=lambda item: (-int(item.get("score", 0)), str(item.get("name", ""))))[:15]


def _build_news_brief(raw_text: str) -> dict[str, Any]:
    lowered = str(raw_text or "").lower()
    themes: list[str] = []
    watch_items: list[str] = []
    actions: list[str] = []

    def add(theme: str, watch: str, action: str) -> None:
        if theme not in themes:
            themes.append(theme)
        if watch not in watch_items:
            watch_items.append(watch)
        if action not in actions:
            actions.append(action)

    if re.search(r"(fuel|logistics|shipment|eta|port|customs|delay)", lowered):
        add("Supply", "Supply chain pressure is showing up in logistics or fuel movement.", "Check shipment timing and inbound exposure today.")
    if re.search(r"(rss|rubber|price|cost|usd|currency|kyat)", lowered):
        add("Cost", "Input cost or raw material pricing moved in the latest signal set.", "Compare raw material movement against current buying assumptions.")
    if re.search(r"(policy|tax|regulation|permit|import|export|government)", lowered):
        add("Policy", "Policy or clearance conditions may change timing or handling.", "Review exposure to import or compliance changes.")
    if re.search(r"(demand|sales|distributor|customer|market|truck tyre|truck tire|retail)", lowered):
        add("Demand", "Commercial demand is shifting by channel, product, or buyer type.", "Push the latest demand signal into sales and procurement review.")

    if not themes:
        themes.append("General")
        watch_items.append("Signals were detected but still need manual categorization.")
        actions.append("Review the incoming notes and set one owner for follow-up.")

    summary = f"{themes[0]} moved in the latest signal set." if len(themes) == 1 else f"{themes[0]} and {themes[1]} moved in the latest signal set."
    return {"summary": summary, "themes": themes[:4], "watch_items": watch_items[:4], "actions": actions[:4]}


def _strip_html(value: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", str(value or ""))
    cleaned = unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _fetch_url_brief_context(urls: list[str]) -> list[str]:
    snippets: list[str] = []
    for raw_url in urls[:4]:
        normalized = str(raw_url or "").strip()
        if not normalized:
            continue
        if not normalized.startswith(("http://", "https://")):
            normalized = f"https://{normalized}"
        try:
            request = UrlRequest(
                normalized,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            with urlopen(request, timeout=15) as response:
                html = response.read(120_000).decode("utf-8", errors="ignore")
        except Exception:
            continue

        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
        title = _strip_html(title_match.group(1)) if title_match else urlparse(normalized).netloc
        body = _strip_html(html[:6000])
        if body:
            snippets.append(f"{title}. {body[:800]}")
    return snippets


def _infer_owner(text: str) -> str:
    lowered = str(text or "").lower()
    if re.search(r"(quality|defect|capa|reject|inspection|bead wire|ncr)", lowered):
        return "Quality"
    if re.search(r"(supplier|customs|eta|shipment|po|docs|procurement|junky|kiic)", lowered):
        return "Procurement"
    if re.search(r"(cash|invoice|payment|overdue|collection|finance)", lowered):
        return "Finance"
    if re.search(r"(sales|demand|distributor|customer|market)", lowered):
        return "Sales"
    if re.search(r"(plant|production|power|shift|downtime|operations)", lowered):
        return "Operations"
    return "Management"


def _infer_priority(text: str) -> str:
    lowered = str(text or "").lower()
    if re.search(r"(defect|delay|blocked|overdue|urgent|customs|power|shortage|risk)", lowered):
        return "High"
    if re.search(r"(confirm|review|check|follow|inspect)", lowered):
        return "Medium"
    return "Low"


def _build_action_rows(raw_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in [item.strip() for item in str(raw_text or "").splitlines() if item.strip()]:
        priority = _infer_priority(line)
        rows.append(
            {
                "title": line.split("|")[0].strip() or line,
                "owner": _infer_owner(line),
                "priority": priority,
                "due": "Today" if priority == "High" else "This week" if priority == "Medium" else "Next review",
            }
        )
    return rows


def _expand_env_tokens(value: Any) -> Any:
    if isinstance(value, str):
        def replace(match: re.Match[str]) -> str:
            env_name = match.group(1)
            return os.getenv(env_name, match.group(0))

        return re.sub(r"\$\{([^}]+)\}", replace, value)
    if isinstance(value, list):
        return [_expand_env_tokens(item) for item in value]
    if isinstance(value, dict):
        return {key: _expand_env_tokens(item) for key, item in value.items()}
    return value


def _load_runtime_config() -> dict[str, Any]:
    config_path = Path(os.getenv("SUPERMEGA_CONFIG", str(REPO_ROOT / "config.example.json"))).expanduser().resolve()
    payload = _load_json(config_path)
    if not isinstance(payload, dict):
        return {}
    return _expand_env_tokens(payload)


def _drive_probe_from_config(config: dict[str, Any]) -> GoogleDriveProbe:
    sources = config.get("sources", {}) if isinstance(config, dict) else {}
    platform = config.get("platform", {}) if isinstance(config, dict) else {}
    drive = sources.get("drive", {}) if isinstance(sources, dict) else {}
    publish = platform.get("publish", {}) if isinstance(platform, dict) else {}

    service_account_value = str(drive.get("service_account_json", "")).strip() or os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    folder_id = str(publish.get("drive_folder_id", "")).strip() or str(config.get("input_center", {}).get("drive_folder_id", "")).strip()
    service_account_path = Path(service_account_value).expanduser() if service_account_value else None
    return GoogleDriveProbe(service_account_path, folder_id)


def _lead_pipeline_sheet_rows(rows: list[dict[str, Any]]) -> tuple[list[str], list[list[str]]]:
    headers = [
        "company_name",
        "stage",
        "status",
        "owner",
        "service_pack",
        "wedge_product",
        "contact_email",
        "contact_phone",
        "website",
        "source",
        "source_url",
        "provider",
        "score",
        "outreach_subject",
        "outreach_message",
        "next_questions",
        "notes",
    ]
    values = [
        [
            str(row.get("company_name", "")).strip(),
            str(row.get("stage", "")).strip(),
            str(row.get("status", "")).strip(),
            str(row.get("owner", "")).strip(),
            str(row.get("service_pack", "")).strip(),
            str(row.get("wedge_product", "")).strip(),
            str(row.get("contact_email", "")).strip(),
            str(row.get("contact_phone", "")).strip(),
            str(row.get("website", "")).strip(),
            str(row.get("source", "")).strip(),
            str(row.get("source_url", "")).strip(),
            str(row.get("provider", "")).strip(),
            str(row.get("score", "")).strip(),
            str(row.get("outreach_subject", "")).strip(),
            str(row.get("outreach_message", "")).strip(),
            " | ".join(str(item).strip() for item in row.get("discovery_questions", []) if str(item).strip()),
            str(row.get("notes", "")).strip(),
        ]
        for row in rows
    ]
    return headers, values


SESSION_COOKIE_NAME = "supermega_session"


def _env_truthy(name: str, default: bool) -> bool:
    raw = os.getenv(name, "1" if default else "0").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def create_app(site_root: Path, pilot_data: Path) -> FastAPI:
    site_root = site_root.expanduser().resolve()
    pilot_data = pilot_data.expanduser().resolve()
    state_db = resolve_state_db(pilot_data)
    sync_state_from_output_dir(pilot_data)
    auth_required = _env_truthy("SUPERMEGA_AUTH_REQUIRED", True)
    auth_username = str(os.getenv("SUPERMEGA_APP_USERNAME", "owner")).strip().lower() or "owner"
    auth_password = str(os.getenv("SUPERMEGA_APP_PASSWORD", "supermega-demo")).strip() or "supermega-demo"
    auth_display_name = str(os.getenv("SUPERMEGA_APP_DISPLAY_NAME", "Owner")).strip() or "Owner"
    auth_role = str(os.getenv("SUPERMEGA_APP_ROLE", "owner")).strip() or "owner"
    session_ttl_hours = int(os.getenv("SUPERMEGA_SESSION_HOURS", str(24 * 14)) or (24 * 14))
    ensure_app_user(
        state_db,
        username=auth_username,
        password=auth_password,
        display_name=auth_display_name,
        role=auth_role,
    )
    uses_default_credentials = auth_username == "owner" and auth_password == "supermega-demo"

    app = FastAPI(title="SuperMega Service", version="0.2.0")
    cors_origins = [origin.strip() for origin in os.getenv("SUPERMEGA_CORS_ORIGINS", "*").split(",") if origin.strip()]
    if not cors_origins:
        cors_origins = ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials="*" not in cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def _session_from_request(request: Request) -> dict[str, Any] | None:
        session_id = str(request.cookies.get(SESSION_COOKIE_NAME, "")).strip()
        if not session_id:
            return None
        return get_app_session(state_db, session_id=session_id)

    def _require_session(request: Request) -> dict[str, Any]:
        if not auth_required:
            return {
                "username": auth_username,
                "role": auth_role,
                "display_name": auth_display_name,
                "authenticated": True,
            }
        session = _session_from_request(request)
        if not session:
            raise HTTPException(status_code=401, detail="Login required.")
        return session

    def _set_session_cookie(response: Response, request: Request, session_id: str) -> None:
        secure_cookie = str(request.url.scheme).lower() == "https"
        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=session_id,
            max_age=session_ttl_hours * 60 * 60,
            httponly=True,
            samesite="lax",
            secure=secure_cookie,
            path="/",
        )

    def _clear_session_cookie(response: Response, request: Request) -> None:
        secure_cookie = str(request.url.scheme).lower() == "https"
        response.delete_cookie(
            key=SESSION_COOKIE_NAME,
            path="/",
            httponly=True,
            samesite="lax",
            secure=secure_cookie,
        )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        review = _load_json(pilot_data / "execution_review.json")
        autopilot = _load_json(pilot_data / "autopilot_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        return {
            "status": "ready",
            "service": "supermega-service",
            "site_root": str(site_root),
            "pilot_data": str(pilot_data),
            "state_db": str(state_db),
            "review_status": review.get("status", "unknown"),
            "autopilot_status": autopilot.get("status", "unknown"),
            "coverage_score": int(coverage.get("readiness_score", 0) or 0),
        }

    @app.get("/api/auth/session")
    def auth_session(request: Request) -> dict[str, Any]:
        session = _session_from_request(request)
        return {
            "status": "ready",
            "auth_required": auth_required,
            "authenticated": session is not None or not auth_required,
            "session": session
            or (
                {
                    "username": auth_username,
                    "role": auth_role,
                    "display_name": auth_display_name,
                }
                if not auth_required
                else None
            ),
            "uses_default_credentials": uses_default_credentials,
        }

    @app.post("/api/auth/login")
    def auth_login(request: Request, response: Response, payload: LoginRequest) -> dict[str, Any]:
        user = authenticate_app_user(state_db, username=payload.username, password=payload.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        session = create_app_session(
            state_db,
            username=str(user.get("username", "")),
            role=str(user.get("role", "")),
            ttl_hours=session_ttl_hours,
        )
        _set_session_cookie(response, request, str(session.get("session_id", "")))
        return {
            "status": "ready",
            "authenticated": True,
            "session": {
                "username": user.get("username", ""),
                "display_name": user.get("display_name", ""),
                "role": user.get("role", ""),
            },
            "uses_default_credentials": uses_default_credentials,
        }

    @app.post("/api/auth/logout")
    def auth_logout(request: Request, response: Response) -> dict[str, Any]:
        session = _session_from_request(request)
        if session:
            revoke_app_session(state_db, session_id=str(session.get("session_id", "")))
        _clear_session_cookie(response, request)
        return {"status": "ready", "authenticated": False}

    @app.get("/api/summary")
    def summary(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        review = _load_json(pilot_data / "execution_review.json")
        autopilot = _load_json(pilot_data / "autopilot_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        publish = _load_json(pilot_data / "platform_publish.json")
        product_lab = load_snapshot(state_db, "product_lab") or _load_json(pilot_data / "product_lab.json")
        action_summary = load_action_summary(state_db)
        agent_team_summary = load_agent_team_summary(state_db)
        quality_summary = load_quality_summary(state_db)
        supplier_summary = load_supplier_risk_summary(state_db)
        receiving_summary = load_receiving_summary(state_db)
        inventory_summary = load_inventory_summary(state_db)
        metric_summary = load_metric_summary(state_db)
        feedback_summary = load_product_feedback_summary(state_db)
        lead_pipeline_summary = load_lead_pipeline_summary(state_db)
        portfolio = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )
        platform_digest = load_snapshot(state_db, "platform_digest") or _load_json(pilot_data / "platform_digest.json")
        supervisor = _load_json(pilot_data / "supervisor_status.json")
        return {
            "status": "ready",
            "review": {
                "project_status": review.get("project_status", {}),
                "top_priorities": review.get("top_priorities", []),
            },
            "autopilot": {
                "status": autopilot.get("status", "unknown"),
                "required_failure_count": int(autopilot.get("required_failure_count", 0) or 0),
                "optional_failure_count": int(autopilot.get("optional_failure_count", 0) or 0),
            },
            "coverage_score": int(coverage.get("readiness_score", 0) or 0),
            "actions": action_summary,
            "agent_system": agent_team_summary,
            "quality": quality_summary,
            "supplier_watch": supplier_summary,
            "lead_pipeline": lead_pipeline_summary,
            "receiving": receiving_summary,
            "inventory": inventory_summary,
            "metrics": metric_summary,
            "feedback": feedback_summary,
            "product_lab": {
                "flagship_status": product_lab.get("summary", {}).get("flagship_status", ""),
                "pilot_ready_count": product_lab.get("summary", {}).get("pilot_ready_count", 0),
                "live_demo_count": product_lab.get("summary", {}).get("live_demo_count", 0),
            },
            "workspace": {
                "drive_folder_link": publish.get("workspace_link", ""),
                "google_doc_link": publish.get("google_doc_link", ""),
            },
            "role_views": platform_digest.get("role_views", {}) if isinstance(platform_digest, dict) else {},
            "supervisor": {
                "status": supervisor.get("status", ""),
                "cycle_count": supervisor.get("cycle_count", 0),
                "last_finished_at": supervisor.get("last_finished_at", ""),
                "interval_minutes": supervisor.get("interval_minutes", 0),
            },
            "portfolio": portfolio,
            "session": {
                "username": session.get("username", ""),
                "role": session.get("role", ""),
                "display_name": session.get("display_name", session.get("username", "")),
            },
        }

    @app.get("/api/actions")
    def actions(request: Request, lane: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        items = list_actions(state_db, lane=lane, status=status, limit=limit)
        return {"status": "ready", "count": len(items), "items": items}

    @app.post("/api/tools/lead-finder")
    def tool_lead_finder(request: LeadFinderRequest) -> dict[str, Any]:
        result = run_lead_finder(
            raw_text=request.raw_text,
            query=request.query,
            keywords=request.keywords,
            sources=request.sources,
            limit=request.limit,
        )
        rows = result.get("rows", []) if isinstance(result, dict) else []
        return {
            "status": "ready",
            "count": len(rows),
            "provider": result.get("provider", ""),
            "keywords": result.get("keywords", []),
            "rows": rows,
        }

    @app.post("/api/tools/news-brief")
    def tool_news_brief(request: NewsBriefRequest) -> dict[str, Any]:
        hydrated_parts = [request.raw_text.strip()]
        hydrated_parts.extend(_fetch_url_brief_context(request.urls))
        payload = "\n".join(part for part in hydrated_parts if part)
        return {
            "status": "ready",
            "source_count": len([url for url in request.urls if str(url).strip()]),
            **_build_news_brief(payload),
        }

    @app.post("/api/tools/document-intake")
    def tool_document_intake(request: DocumentIntakeRequest) -> dict[str, Any]:
        return {"status": "ready", "analysis": analyze_document(request.filename, request.content_base64)}

    @app.post("/api/tools/metric-intake")
    def tool_metric_intake(request: MetricExtractRequest) -> dict[str, Any]:
        analysis = extract_metric_candidates(request.filename, request.content_base64)
        analysis["summary_stats"] = summarize_metric_rows(analysis.get("metrics", []))
        return {"status": "ready", "analysis": analysis}

    @app.post("/api/tools/lead-to-pilot")
    def tool_lead_to_pilot(request: LeadToPilotRequest) -> dict[str, Any]:
        return build_lead_to_pilot_pack(leads=request.leads, campaign_goal=request.campaign_goal)

    @app.get("/api/lead-pipeline")
    def lead_pipeline(request: Request, stage: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_lead_pipeline(state_db, stage=stage, status=status, limit=limit)
        return {
            "status": "ready",
            "summary": load_lead_pipeline_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.post("/api/lead-pipeline/import")
    def import_lead_pipeline(request_http: Request, request: LeadPipelineImportRequest) -> dict[str, Any]:
        _require_session(request_http)
        return add_lead_pipeline_rows(
            state_db,
            rows=request.rows,
            campaign_goal=request.campaign_goal,
            source="lead_to_pilot",
        )

    @app.post("/api/lead-pipeline/{lead_id}")
    def update_lead_pipeline(lead_id: str, request_http: Request, request: LeadPipelineUpdateRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = update_lead_pipeline_row(
            state_db,
            lead_id=lead_id,
            stage=request.stage,
            status=request.status,
            owner=request.owner,
            notes=request.notes,
        )
        if not row:
            raise HTTPException(status_code=404, detail=f"Lead not found: {lead_id}")
        return {
            "status": "ready",
            "row": row,
            "summary": load_lead_pipeline_summary(state_db),
        }

    @app.get("/api/lead-pipeline/{lead_id}/activities")
    def lead_pipeline_activities(lead_id: str, request: Request, limit: int = 20) -> dict[str, Any]:
        _require_session(request)
        rows = list_lead_activity(state_db, lead_id=lead_id, limit=limit)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/lead-pipeline/{lead_id}/activities")
    def create_lead_pipeline_activity(lead_id: str, request_http: Request, request: LeadActivityRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = add_lead_activity(
            state_db,
            lead_id=lead_id,
            actor=str(session.get("display_name", session.get("username", "Owner"))),
            activity_type=request.activity_type.strip(),
            channel=request.channel.strip(),
            direction=request.direction.strip(),
            message=request.message.strip(),
            stage_after=request.stage_after.strip(),
            next_step=request.next_step.strip(),
        )
        lead_row = update_lead_pipeline_row(state_db, lead_id=lead_id)
        return {
            "status": "ready",
            "row": row,
            "lead": lead_row,
            "activities": list_lead_activity(state_db, lead_id=lead_id, limit=20),
            "summary": load_lead_pipeline_summary(state_db),
        }

    @app.post("/api/lead-pipeline/export/workspace")
    def export_lead_pipeline_to_workspace(request_http: Request, request: LeadPipelineExportRequest) -> dict[str, Any]:
        _require_session(request_http)
        config = _load_runtime_config()
        probe = _drive_probe_from_config(config)
        rows = list_lead_pipeline(state_db, limit=500)
        headers, values = _lead_pipeline_sheet_rows(rows)
        export_result = probe.publish_rows_sheet(
            spreadsheet_name=request.spreadsheet_name.strip() or "SuperMega Lead Pipeline",
            sheet_name=request.sheet_name.strip() or "Leads",
            workspace_folder_name=request.workspace_folder_name.strip() or "SuperMega Sales",
            headers=headers,
            rows=values,
            description="Lead pipeline generated by SuperMega Lead Finder and lead-to-pilot workflow.",
        )
        return {
            "status": export_result.get("status", "ready"),
            "summary": load_lead_pipeline_summary(state_db),
            "row_count": len(rows),
            "export": export_result,
        }

    @app.post("/api/tools/solution-architect")
    def tool_solution_architect(request: SolutionArchitectRequest) -> dict[str, Any]:
        return {"status": "ready", "blueprint": build_solution_blueprint(request.model_dump())}

    @app.post("/api/tools/action-board")
    def tool_action_board(request: ActionBoardRequest) -> dict[str, Any]:
        rows = _build_action_rows(request.raw_text)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/tools/action-board/save")
    def tool_action_board_save(request_http: Request, request: ActionBoardSaveRequest) -> dict[str, Any]:
        _require_session(request_http)
        payload = add_action_items(state_db, rows=request.rows, source="tool:action_board", lane="do_now")
        return payload

    @app.get("/api/portfolio")
    def portfolio() -> dict[str, Any]:
        payload = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )
        return {"status": "ready", "payload": payload}

    @app.get("/api/metrics/records")
    def metrics(request: Request, metric_group: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_metric_entries(state_db, metric_group=metric_group, status=status, limit=limit)
        return {"status": "ready", "summary": load_metric_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/metrics/records")
    def create_metric_record(request_http: Request, request: MetricRecordRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_metric_entry(
            state_db,
            captured_at=request.captured_at.strip(),
            metric_name=request.metric_name.strip(),
            metric_group=request.metric_group.strip(),
            metric_value=request.metric_value.strip(),
            unit=request.unit.strip(),
            period_label=request.period_label.strip(),
            scope=request.scope.strip(),
            owner=request.owner.strip(),
            status=request.status.strip(),
            notes=request.notes.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        return {"status": "ready", "message": f"Metric saved for {row['metric_name']}.", "row": row, "rows": list_metric_entries(state_db, limit=100), "summary": load_metric_summary(state_db)}

    @app.post("/api/metrics/records/bulk")
    def create_metric_records_bulk(request_http: Request, request: MetricBulkSaveRequest) -> dict[str, Any]:
        _require_session(request_http)
        rows = [row.model_dump() for row in request.rows]
        return add_metric_entries(state_db, rows=rows, source_mode="metric_intake_review")

    @app.get("/api/product-feedback")
    def product_feedback(request: Request, surface: str | None = None, status: str | None = None, limit: int = 50) -> dict[str, Any]:
        _require_session(request)
        rows = list_product_feedback(state_db, surface=surface, status=status, limit=limit)
        return {"status": "ready", "summary": load_product_feedback_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/product-feedback")
    def create_product_feedback(request_http: Request, request: ProductFeedbackRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_product_feedback(
            state_db,
            source="workbench",
            surface=request.surface.strip(),
            category=request.category.strip(),
            priority=request.priority.strip(),
            status=request.status.strip(),
            note=request.note.strip(),
        )
        return {
            "status": "ready",
            "message": "Feedback saved.",
            "row": row,
            "rows": list_product_feedback(state_db, limit=50),
            "summary": load_product_feedback_summary(state_db),
        }

    @app.get("/api/supermega/operating-model")
    def supermega_operating_model() -> dict[str, Any]:
        payload = _load_json(REPO_ROOT / "Super Mega Inc" / "runbooks" / "supermega_os_architecture_manifest_2026-03-26.json")
        return {"status": "ready", "payload": payload}

    @app.get("/api/quality/incidents")
    def quality_incidents(request: Request, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_quality_incidents(state_db, status=status, limit=limit)
        return {"status": "ready", "summary": load_quality_summary(state_db), "count": len(rows), "rows": rows}

    @app.get("/api/quality/capa")
    def quality_capa(request: Request, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_capa_actions(state_db, status=status, limit=limit)
        return {"status": "ready", "summary": load_quality_summary(state_db), "count": len(rows), "rows": rows}

    @app.get("/api/suppliers/risks")
    def supplier_risks(request: Request, supplier: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_supplier_risks(state_db, supplier=supplier, status=status, limit=limit)
        return {"status": "ready", "summary": load_supplier_risk_summary(state_db), "count": len(rows), "rows": rows}

    @app.get("/api/receiving/records")
    def receiving_records(request: Request, supplier: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_receiving_records(state_db, supplier=supplier, status=status, limit=limit)
        return {"status": "ready", "summary": load_receiving_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/receiving/records")
    def create_receiving_record(request_http: Request, request: ReceivingRecordRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_receiving_record(
            state_db,
            received_at=request.received_at.strip(),
            supplier=request.supplier.strip(),
            po_or_pi=request.po_or_pi.strip(),
            grn_or_batch=request.grn_or_batch.strip(),
            material=request.material.strip(),
            expected_qty=request.expected_qty.strip(),
            received_qty=request.received_qty.strip(),
            status=request.status.strip(),
            owner=request.owner.strip(),
            next_action=request.next_action.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        rows = list_receiving_records(state_db, limit=100)
        return {
            "status": "ready",
            "message": "Receiving record saved.",
            "record": row,
            "summary": load_receiving_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/inventory/records")
    def inventory_records(request: Request, warehouse: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_inventory_records(state_db, warehouse=warehouse, status=status, limit=limit)
        return {"status": "ready", "summary": load_inventory_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/inventory/records")
    def create_inventory_record(request_http: Request, request: InventoryRecordRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_inventory_record(
            state_db,
            captured_at=request.captured_at.strip(),
            item_code=request.item_code.strip(),
            item_name=request.item_name.strip(),
            warehouse=request.warehouse.strip(),
            on_hand_qty=request.on_hand_qty.strip(),
            reserved_qty=request.reserved_qty.strip(),
            reorder_point=request.reorder_point.strip(),
            status=request.status.strip(),
            owner=request.owner.strip(),
            next_action=request.next_action.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        rows = list_inventory_records(state_db, limit=100)
        return {
            "status": "ready",
            "message": "Inventory record saved.",
            "record": row,
            "summary": load_inventory_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/reports/role/{role}")
    def role_report(role: str, request: Request) -> dict[str, Any]:
        _require_session(request)
        normalized_role = str(role).strip().lower()
        if normalized_role not in {"ceo", "director", "manager"}:
            raise HTTPException(status_code=404, detail=f"Unknown role report: {role}")
        platform_digest = load_snapshot(state_db, "platform_digest") or _load_json(pilot_data / "platform_digest.json")
        role_views = platform_digest.get("role_views", {}) if isinstance(platform_digest, dict) else {}
        rows = role_views.get(normalized_role, []) if isinstance(role_views, dict) else []
        return {"status": "ready", "role": normalized_role, "count": len(rows), "rows": rows}

    @app.get("/api/supervisor")
    def supervisor_status(request: Request) -> dict[str, Any]:
        _require_session(request)
        payload = _load_json(pilot_data / "supervisor_status.json")
        return {"status": "ready", "payload": payload}

    @app.get("/api/agent-teams")
    def agent_teams(request: Request) -> dict[str, Any]:
        _require_session(request)
        payload = load_snapshot(state_db, "agent_team_system")
        return {
            "status": "ready",
            "summary": load_agent_team_summary(state_db),
            "teams": list_agent_teams(state_db),
            "gaps": payload.get("gaps", []) if isinstance(payload, dict) else [],
            "scaling_model": payload.get("scaling_model", {}) if isinstance(payload, dict) else {},
            "next_moves": payload.get("next_moves", []) if isinstance(payload, dict) else [],
        }

    @app.get("/api/snapshots/{snapshot_key}")
    def snapshot(snapshot_key: str, request: Request) -> dict[str, Any]:
        _require_session(request)
        payload = load_snapshot(state_db, snapshot_key)
        if not payload:
            raise HTTPException(status_code=404, detail=f"Snapshot not found: {snapshot_key}")
        return {"status": "ready", "snapshot_key": snapshot_key, "payload": payload}

    @app.post("/api/state/sync")
    def state_sync(request: Request) -> dict[str, Any]:
        _require_session(request)
        return sync_state_from_output_dir(pilot_data)

    @app.get("/api/workspaces")
    def workspaces(request: Request) -> dict[str, Any]:
        _require_session(request)
        registry = _load_json(pilot_data / "input_center_registry.json")
        publish = _load_json(pilot_data / "platform_publish.json")
        templates = registry.get("templates", []) if isinstance(registry, dict) else []
        return {
            "status": "ready",
            "input_center_workspace": registry.get("workspace_link", ""),
            "published_workspace": publish.get("workspace_link", ""),
            "published_google_doc": publish.get("google_doc_link", ""),
            "templates": [
                {
                    "key": item.get("key", ""),
                    "title": item.get("title", ""),
                    "web_view_link": item.get("web_view_link", ""),
                    "spreadsheet_id": item.get("spreadsheet_id", ""),
                }
                for item in templates
            ],
        }

    @app.post("/api/contact-submissions")
    def create_contact_submission(request: ContactSubmissionRequest) -> dict[str, Any]:
        row = add_contact_submission(
            state_db,
            source="website",
            name=request.name.strip(),
            email=request.email.strip(),
            company=request.company.strip(),
            workflow=request.workflow.strip(),
            data_summary=request.data.strip(),
            goal=request.goal.strip(),
        )
        return {"status": "ready", "message": "Submission saved.", "submission": row}

    @app.get("/api/contact-submissions")
    def contact_submissions(request: Request, limit: int = 50) -> dict[str, Any]:
        _require_session(request)
        rows = list_contact_submissions(state_db, limit=limit)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/attendance/checkins")
    def create_attendance_checkin(request_http: Request, request: AttendanceCheckinRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_attendance_event(
            state_db,
            employee_name=request.employee_name.strip(),
            employee_code=request.employee_code.strip(),
            shift_name=request.shift_name.strip(),
            station=request.station.strip(),
            status=request.status.strip() or "present",
            method=request.method.strip() or "photo_checkin",
            evidence_url=request.evidence_url.strip(),
            note=request.note.strip(),
        )
        return {
            "status": "ready",
            "message": "Attendance event captured.",
            "attendance": row,
            "face_scan_ready": False,
            "note": "Photo-assisted attendance is available now. Face matching still needs a separate identity and privacy layer.",
        }

    @app.get("/api/attendance/checkins")
    def attendance_checkins(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_attendance_events(state_db, limit=limit)
        status_counts: dict[str, int] = {}
        for row in rows:
            status_key = str(row.get("status", "")).strip() or "unknown"
            status_counts[status_key] = status_counts.get(status_key, 0) + 1
        return {"status": "ready", "count": len(rows), "status_counts": status_counts, "rows": rows}

    app.mount("/", StaticFiles(directory=str(site_root), html=True), name="site")
    return app


def create_default_app() -> FastAPI:
    configured_site_root = Path(os.getenv("SUPERMEGA_SITE_ROOT", str(REPO_ROOT / "showroom" / "dist")))
    site_root = configured_site_root
    if not site_root.exists():
        fallback_site_root = REPO_ROOT / "swan-intelligence-hub"
        site_root = fallback_site_root if fallback_site_root.exists() else configured_site_root
    pilot_data = Path(os.getenv("SUPERMEGA_PILOT_DATA", str(REPO_ROOT / "pilot-data")))
    return create_app(site_root, pilot_data)


app = create_default_app()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve SuperMega pilot outputs with a JSON API.")
    parser.add_argument("--host", default=os.getenv("SUPERMEGA_HOST", "0.0.0.0"), help="Bind host.")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", os.getenv("SUPERMEGA_PORT", "8787"))), help="Bind port.")
    parser.add_argument("--site-root", default=os.getenv("SUPERMEGA_SITE_ROOT", "showroom/dist"), help="Static site root.")
    parser.add_argument("--pilot-data", default=os.getenv("SUPERMEGA_PILOT_DATA", "pilot-data"), help="Generated output directory.")
    args = parser.parse_args()

    site_root = Path(args.site_root).expanduser().resolve()
    pilot_data = Path(args.pilot_data).expanduser().resolve()
    if not site_root.exists():
        print(
            json.dumps(
                {
                    "status": "missing_site_root",
                    "site_root": str(site_root),
                    "message": "Run platform-publish or run_solution first.",
                },
                indent=2,
            )
        )
        return 1

    app = create_app(site_root, pilot_data)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
