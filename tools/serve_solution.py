from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import secrets
import sys
import tempfile
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlparse
from urllib.request import Request as UrlRequest, urlopen

import uvicorn
from dotenv import load_dotenv
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
    add_decision_entry,
    add_approval_entry,
    add_metric_entries,
    add_metric_entry,
    add_inventory_record,
    add_product_feedback,
    add_receiving_record,
    grant_workspace_access,
    list_actions,
    list_agent_teams,
    list_attendance_events,
    list_capa_actions,
    list_contact_submissions,
    list_decision_entries,
    list_approval_entries,
    list_inventory_records,
    list_lead_pipeline as state_list_lead_pipeline,
    list_metric_entries,
    list_product_feedback,
    list_receiving_records,
    list_workspace_members,
    list_quality_incidents,
    list_supplier_risks,
    load_action_summary,
    load_agent_team_summary,
    load_decision_summary,
    load_approval_summary,
    load_inventory_summary,
    load_metric_summary,
    load_product_feedback_summary,
    load_receiving_summary,
    load_quality_summary,
    load_snapshot,
    load_supplier_risk_summary,
    load_workspace_member_summary,
    resolve_state_db,
    sync_state_from_output_dir,
    update_approval_entry,
)
from mark1_pilot.enterprise_store import (  # noqa: E402
    add_lead_activity as enterprise_add_lead_activity,
    add_leads as enterprise_add_leads,
    add_leads_with_tasks as enterprise_add_leads_with_tasks,
    complete_agent_run as enterprise_complete_agent_run,
    create_agent_run as enterprise_create_agent_run,
    add_workspace_tasks as enterprise_add_workspace_tasks,
    authenticate_user as enterprise_authenticate_user,
    bootstrap_workspace_leads,
    create_session as enterprise_create_session,
    ensure_user as enterprise_ensure_user,
    get_lead as enterprise_get_lead,
    get_lead_hunt_profile as enterprise_get_lead_hunt_profile,
    get_session as enterprise_get_session,
    list_agent_runs as enterprise_list_agent_runs,
    list_lead_activities as enterprise_list_lead_activities,
    list_lead_hunt_profiles as enterprise_list_lead_hunt_profiles,
    list_leads as enterprise_list_leads,
    list_user_workspaces as enterprise_list_user_workspaces,
    list_workspace_tasks as enterprise_list_workspace_tasks,
    load_lead_summary as enterprise_load_lead_summary,
    remove_workspace_task as enterprise_remove_workspace_task,
    resolve_database_url as resolve_enterprise_database_url,
    revoke_session as enterprise_revoke_session,
    save_lead_hunt_profile as enterprise_save_lead_hunt_profile,
    record_lead_hunt_run as enterprise_record_lead_hunt_run,
    start_agent_run as enterprise_start_agent_run,
    update_lead as enterprise_update_lead,
    update_workspace_task as enterprise_update_workspace_task,
)
from mark1_pilot.lead_finder import run_lead_finder  # noqa: E402
from mark1_pilot.lead_to_pilot import build_lead_to_pilot_pack  # noqa: E402
from mark1_pilot.document_intake import analyze_document  # noqa: E402
from mark1_pilot.metric_intake import extract_metric_candidates, summarize_metric_rows  # noqa: E402
from mark1_pilot.solution_architect import build_solution_blueprint  # noqa: E402
from mark1_pilot.anthropic_provider import AnthropicProvider  # noqa: E402
from mark1_pilot.openai_provider import OpenAIProvider  # noqa: E402
from mark1_pilot.connectors.gmail import GmailProbe  # noqa: E402
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


class DecisionJournalRequest(BaseModel):
    title: str
    context: str = ""
    decision_text: str
    rationale: str = ""
    owner: str = "Management"
    status: str = "open"
    due: str = ""
    related_route: str = ""


class ApprovalQueueRequest(BaseModel):
    title: str
    summary: str = ""
    approval_gate: str = "general"
    requested_by: str = "System"
    owner: str = "Management"
    status: str = "pending"
    due: str = ""
    related_route: str = "/app"
    related_entity: str = ""
    evidence_link: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)


class ApprovalQueueUpdateRequest(BaseModel):
    status: str | None = None
    owner: str | None = None
    note: str | None = None


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


class WorkspaceTaskRequest(BaseModel):
    title: str
    owner: str = "Owner"
    priority: str = "Medium"
    due: str = "This week"
    status: str = "open"
    notes: str = ""
    lead_id: str = ""
    template: str = "manual"


class WorkspaceTaskBulkRequest(BaseModel):
    rows: list[WorkspaceTaskRequest] = Field(default_factory=list)


class WorkspaceTaskUpdateRequest(BaseModel):
    status: str | None = None
    owner: str | None = None
    priority: str | None = None
    due: str | None = None
    title: str | None = None
    notes: str | None = None


class LeadHuntRequest(BaseModel):
    query: str = ""
    raw_text: str = ""
    keywords: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=lambda: ["maps", "web"])
    limit: int = Field(default=8, ge=1, le=20)
    campaign_goal: str = ""
    export_workspace: bool = False


class AgentRunRequest(BaseModel):
    job_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    source: str = "manual"
    idempotency_key: str = ""
    max_attempts: int = 1
    related_entity_type: str = ""
    related_entity_id: str = ""


class AgentBatchRunRequest(BaseModel):
    job_types: list[str] = Field(default_factory=list)
    source: str = "scheduler"


class AgentRunDefaultsRequest(BaseModel):
    workspace_slug: str = ""
    source: str = "scheduler"
    job_types: list[str] = Field(default_factory=list)


class LeadHuntProfileRequest(BaseModel):
    name: str
    query: str = ""
    raw_text: str = ""
    keywords: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=lambda: ["maps", "web"])
    limit: int = Field(default=8, ge=1, le=20)
    campaign_goal: str = ""
    export_workspace: bool = True
    owner: str = "Growth Studio"
    status: str = "active"


class LeadHuntProfileRunRequest(BaseModel):
    export_workspace: bool | None = None


class LeadHuntProfilesRunAllRequest(BaseModel):
    export_workspace: bool | None = None


class LeadActivityRequest(BaseModel):
    activity_type: str = "note"
    channel: str = "email"
    direction: str = "outbound"
    message: str
    stage_after: str = ""
    next_step: str = ""


class LeadOutreachDraftRequest(BaseModel):
    subject: str = ""
    message: str = ""
    create_gmail_draft: bool = False


class LoginRequest(BaseModel):
    username: str
    password: str
    workspace_slug: str = ""


class SignupRequest(BaseModel):
    name: str
    email: str
    company: str
    password: str = ""
    workspace_slug: str = ""
    goal: str = ""


class PublicWorkspaceBootstrapRequest(BaseModel):
    name: str = ""
    email: str = ""
    company: str = ""
    workspace_slug: str = ""
    goal: str = ""


class PublicWorkspaceLeadSaveRequest(BaseModel):
    name: str = ""
    email: str = ""
    company: str = ""
    workspace_slug: str = ""
    goal: str = ""
    campaign_goal: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)


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


def _slugify(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    return text.strip("-")


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


def _exception_rank(priority: str) -> int:
    normalized = str(priority or "").strip().lower()
    if normalized == "high":
        return 0
    if normalized == "medium":
        return 1
    return 2


def _load_exception_rows(state_db: Path, *, limit: int = 50) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for item in list_supplier_risks(state_db, limit=limit):
        severity = str(item.get("severity", "medium")).strip().lower() or "medium"
        rows.append(
            {
                "exception_id": str(item.get("risk_id", "")),
                "source_type": "supplier_risk",
                "priority": severity,
                "status": str(item.get("status", "")),
                "owner": str(item.get("owner", "")),
                "title": str(item.get("title", "")),
                "summary": str(item.get("summary", "")),
                "entity": str(item.get("supplier", "")),
                "next_action": str(item.get("next_action", "")),
                "due": str(item.get("eta", "")),
                "route": "/app/actions",
            }
        )

    for item in list_quality_incidents(state_db, limit=limit):
        severity = str(item.get("severity", "medium")).strip().lower() or "medium"
        rows.append(
            {
                "exception_id": str(item.get("incident_id", "")),
                "source_type": "quality_incident",
                "priority": severity,
                "status": str(item.get("status", "")),
                "owner": str(item.get("owner", "")),
                "title": str(item.get("title", "")),
                "summary": str(item.get("summary", "")),
                "entity": str(item.get("supplier", "")),
                "next_action": "Review containment and CAPA next step.",
                "due": str(item.get("target_close_date", "")),
                "route": "/app/actions",
            }
        )

    for item in list_receiving_records(state_db, limit=limit):
        status = str(item.get("status", "")).strip().lower()
        variance_note = str(item.get("variance_note", "")).strip().lower()
        if status not in {"hold", "blocked", "review"} and variance_note in {"", "matched"}:
            continue
        priority = "high" if status in {"hold", "blocked"} else "medium"
        rows.append(
            {
                "exception_id": str(item.get("receiving_id", "")),
                "source_type": "receiving",
                "priority": priority,
                "status": str(item.get("status", "")),
                "owner": str(item.get("owner", "")),
                "title": f"{item.get('material', 'Material')} receiving exception",
                "summary": f"{item.get('supplier', 'Unknown supplier')} / variance: {item.get('variance_note', 'review')}",
                "entity": str(item.get("supplier", "")),
                "next_action": str(item.get("next_action", "")),
                "due": str(item.get("received_at", "")),
                "route": "/app/receiving",
            }
        )

    for item in list_inventory_records(state_db, limit=limit):
        status = str(item.get("status", "")).strip().lower()
        if status not in {"reorder", "watch", "review"}:
            continue
        priority = "high" if status == "reorder" else "medium"
        rows.append(
            {
                "exception_id": str(item.get("inventory_id", "")),
                "source_type": "inventory",
                "priority": priority,
                "status": str(item.get("status", "")),
                "owner": str(item.get("owner", "")),
                "title": f"{item.get('item_name', 'Inventory item')} stock exception",
                "summary": f"{item.get('warehouse', 'Unknown warehouse')} / available {item.get('available_qty', '')} / reorder {item.get('reorder_point', '')}",
                "entity": str(item.get("warehouse", "")),
                "next_action": str(item.get("next_action", "")),
                "due": str(item.get("captured_at", "")),
                "route": "/app/inventory",
            }
        )

    rows.sort(
        key=lambda row: (
            _exception_rank(str(row.get("priority", ""))),
            str(row.get("status", "")),
            str(row.get("due", "")),
            str(row.get("title", "")),
        )
    )
    return rows[: max(1, int(limit))]


def _build_operating_insights(
    state_db: Path,
    *,
    enterprise_db_url: str,
    workspace_id: str,
) -> dict[str, Any]:
    action_summary = load_action_summary(state_db)
    supplier_summary = load_supplier_risk_summary(state_db)
    quality_summary = load_quality_summary(state_db)
    receiving_summary = load_receiving_summary(state_db)
    inventory_summary = load_inventory_summary(state_db)
    approval_summary = load_approval_summary(state_db)
    decision_summary = load_decision_summary(state_db)
    lead_summary = enterprise_load_lead_summary(enterprise_db_url, workspace_id=workspace_id)
    exception_rows = _load_exception_rows(state_db, limit=8)

    insights: list[dict[str, Any]] = []
    recommended_actions: list[str] = []

    high_exceptions = [row for row in exception_rows if str(row.get("priority", "")).lower() == "high"]
    if high_exceptions:
        insights.append(
            {
                "key": "high_exceptions",
                "title": f"{len(high_exceptions)} high-priority issues need a manager call.",
                "summary": "The queue has live high-priority exceptions across supplier, quality, receiving, or inventory.",
                "category": "exceptions",
                "route": "/app/exceptions",
            }
        )
        recommended_actions.append("Open Exception Queue and assign the top high-priority item now.")

    pending_approvals = int((approval_summary.get("by_status", {}) or {}).get("pending", 0) or 0)
    if pending_approvals:
        insights.append(
            {
                "key": "pending_approvals",
                "title": f"{pending_approvals} approvals are waiting on a decision.",
                "summary": "Manager or director approvals are building up and can block action unless cleared.",
                "category": "approvals",
                "route": "/app/approvals",
            }
        )
        recommended_actions.append("Clear pending approvals before they turn into blocked actions.")

    receiving_holds = int(receiving_summary.get("hold_count", 0) or 0)
    if receiving_holds:
        insights.append(
            {
                "key": "receiving_holds",
                "title": f"{receiving_holds} inbound receipts are on hold or review.",
                "summary": "Receiving records show material that has not moved cleanly into stock.",
                "category": "receiving",
                "route": "/app/receiving",
            }
        )
        recommended_actions.append("Review the receiving board and clear hold or variance cases.")

    reorder_count = int(inventory_summary.get("reorder_count", 0) or 0)
    if reorder_count:
        insights.append(
            {
                "key": "inventory_reorder",
                "title": f"{reorder_count} inventory items are at reorder level.",
                "summary": "Stock position has reached reorder thresholds on live inventory records.",
                "category": "inventory",
                "route": "/app/inventory",
            }
        )
        recommended_actions.append("Check reorder items and create or confirm next buying action.")

    supplier_risk_count = int(supplier_summary.get("risk_count", 0) or 0)
    if supplier_risk_count:
        insights.append(
            {
                "key": "supplier_risk",
                "title": f"{supplier_risk_count} supplier risk items are active.",
                "summary": "Supplier watch has open exposure that can affect timing, quality, or delivery.",
                "category": "supplier",
                "route": "/app/actions",
            }
        )

    incident_count = int(quality_summary.get("incident_count", 0) or 0)
    if incident_count:
        insights.append(
            {
                "key": "quality_incidents",
                "title": f"{incident_count} quality incidents are live in the system.",
                "summary": "Quality issues remain open or in triage and should be reviewed with CAPA status.",
                "category": "quality",
                "route": "/app/actions",
            }
        )

    open_actions = int(action_summary.get("total_items", 0) or 0)
    if open_actions:
        recommended_actions.append("Trim the action board to the few items that truly need attention today.")

    active_decisions = int((decision_summary.get("by_status", {}) or {}).get("open", 0) or 0)
    if active_decisions:
        recommended_actions.append("Close open decisions or promote them into explicit approvals.")

    lead_count = int(lead_summary.get("lead_count", 0) or 0)
    if lead_count:
        by_stage = lead_summary.get("by_stage", {}) if isinstance(lead_summary, dict) else {}
        contacted = int(by_stage.get("contacted", 0) or 0)
        discovery = int(by_stage.get("discovery", 0) or 0)
        insights.append(
            {
                "key": "lead_pipeline",
                "title": f"{lead_count} leads are active in the pipeline.",
                "summary": f"{contacted} contacted and {discovery} in discovery. Commercial flow is live, but it needs follow-through.",
                "category": "growth",
                "route": "/app/leads",
            }
        )
        recommended_actions.append("Move one lead forward today instead of keeping the whole list warm.")

    if not insights:
        insights.append(
            {
                "key": "stable_system",
                "title": "The system is quiet right now.",
                "summary": "No major issues were detected in the current saved records.",
                "category": "general",
                "route": "/app",
            }
        )

    if not recommended_actions:
        recommended_actions.append("Keep the workbench open and capture the next meaningful action, not more notes.")

    return {
        "headline": insights[0]["title"],
        "engine": "rules+live-state",
        "insights": insights[:6],
        "recommended_actions": recommended_actions[:6],
    }


def _maybe_ai_enrich_insights(payload: dict[str, Any]) -> dict[str, Any]:
    if not _env_flag("SUPERMEGA_ENABLE_AI_INSIGHTS", default=False):
        return payload

    system_prompt = (
        "You are refining a short operating brief inside an enterprise operations app. "
        "Keep it concise, practical, and direct. "
        "Return JSON only with keys: headline, recommended_actions. "
        "headline must be one short sentence. recommended_actions must be an array of up to 6 short actions."
    )
    user_prompt = json.dumps(
        {
            "headline": payload.get("headline", ""),
            "insights": payload.get("insights", []),
            "recommended_actions": payload.get("recommended_actions", []),
        },
        ensure_ascii=False,
    )
    result, engine = _run_ai_json(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema_name="supermega_insights",
        required_keys=["headline", "recommended_actions"],
        max_tokens=900,
    )
    if result.get("status") != "ready":
        return payload
    data = result.get("json", {})
    if not isinstance(data, dict):
        return payload

    enriched = dict(payload)
    headline = str(data.get("headline", "")).strip()
    actions = data.get("recommended_actions", [])
    if headline:
        enriched["headline"] = headline
    if isinstance(actions, list):
        next_actions = [str(item).strip() for item in actions if str(item).strip()]
        if next_actions:
            enriched["recommended_actions"] = next_actions[:6]
    enriched["engine"] = engine
    return enriched


def _maybe_ai_enrich_lead_pack(payload: dict[str, Any], *, campaign_goal: str) -> dict[str, Any]:
    if not _env_flag("SUPERMEGA_ENABLE_AI_LEAD_PACK", default=False):
        return {
            **payload,
            "engine": str(payload.get("engine", "rules")).strip() or "rules",
        }

    opportunities = payload.get("opportunities", [])
    if not isinstance(opportunities, list) or not opportunities:
        return {
            **payload,
            "engine": str(payload.get("engine", "rules")).strip() or "rules",
        }

    compact = []
    for item in opportunities[:5]:
        if isinstance(item, dict):
            compact.append(
                {
                    "name": item.get("name", ""),
                    "archetype": item.get("archetype", ""),
                    "service_pack": item.get("service_pack", ""),
                    "wedge_product": item.get("wedge_product", ""),
                    "pain_signals": item.get("pain_signals", []),
                    "outreach_subject": item.get("outreach_subject", ""),
                    "outreach_message": item.get("outreach_message", ""),
                }
            )

    result, engine = _run_ai_json(
        system_prompt=(
            "You are refining sales outreach for an AI operations software company. "
            "Keep copy short, specific, and commercially credible. "
            "Return JSON only with keys: summary, opportunities. "
            "opportunities must be an array of objects with keys: name, outreach_subject, outreach_message, why_now."
        ),
        user_prompt=json.dumps(
            {
                "campaign_goal": campaign_goal,
                "summary": payload.get("summary", ""),
                "opportunities": compact,
            },
            ensure_ascii=False,
        ),
        schema_name="supermega_lead_pack",
        required_keys=["summary", "opportunities"],
        max_tokens=1800,
    )
    if result.get("status") != "ready":
        return payload
    data = result.get("json", {})
    if not isinstance(data, dict):
        return payload

    enriched = dict(payload)
    summary = str(data.get("summary", "")).strip()
    if summary:
        enriched["summary"] = summary
    patches: dict[str, dict[str, Any]] = {}
    for item in data.get("opportunities", []):
        if isinstance(item, dict):
            patches[str(item.get("name", "")).strip()] = item

    next_rows: list[dict[str, Any]] = []
    for item in opportunities:
        if not isinstance(item, dict):
            continue
        patch = patches.get(str(item.get("name", "")).strip(), {})
        merged = dict(item)
        for key in ("outreach_subject", "outreach_message", "why_now"):
            value = str(patch.get(key, "")).strip()
            if value:
                merged[key] = value
        next_rows.append(merged)
    if next_rows:
        enriched["opportunities"] = next_rows
    enriched["engine"] = engine
    return enriched


AGENT_JOB_TEMPLATES: tuple[dict[str, str], ...] = (
    {
        "job_type": "revenue_scout",
        "name": "Revenue Scout",
        "cadence": "hourly",
        "description": "Watch pipeline growth, hunt coverage, and next commercial actions.",
    },
    {
        "job_type": "list_clerk",
        "name": "List Clerk",
        "cadence": "daily",
        "description": "Audit saved company data quality and missing contact coverage.",
    },
    {
        "job_type": "task_triage",
        "name": "Task Triage",
        "cadence": "hourly",
        "description": "Surface open tasks, owner gaps, and priority pressure.",
    },
    {
        "job_type": "founder_brief",
        "name": "Founder Brief",
        "cadence": "daily",
        "description": "Produce a compact operating brief from leads, tasks, approvals, and ops queues.",
    },
)


def _group_agent_runs_by_job_type(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        job_type = str(row.get("job_type", "")).strip()
        if job_type and job_type not in grouped:
            grouped[job_type] = row
    return grouped


def _default_agent_job_types() -> list[str]:
    return [str(item.get("job_type", "")).strip() for item in AGENT_JOB_TEMPLATES if str(item.get("job_type", "")).strip()]


def _run_and_persist_agent_job(
    *,
    state_db: str,
    enterprise_db_url: str,
    workspace_id: str,
    triggered_by: str,
    job_type: str,
    source: str = "manual",
    payload: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
    related_entity_type: str = "",
    related_entity_id: str = "",
) -> dict[str, Any]:
    row = enterprise_create_agent_run(
        enterprise_db_url,
        workspace_id=workspace_id,
        job_type=job_type,
        source=source,
        payload=payload,
        idempotency_key=idempotency_key,
        max_attempts=1,
        triggered_by=triggered_by,
        related_entity_type=related_entity_type,
        related_entity_id=related_entity_id,
    )
    run_id = str(row.get("run_id", "")).strip()
    enterprise_start_agent_run(
        enterprise_db_url,
        workspace_id=workspace_id,
        run_id=run_id,
    )
    try:
        result = _execute_agent_job(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            job_type=job_type,
            payload=payload,
        )
        return enterprise_complete_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
            status="ready",
            summary=str(result.get("summary", "")).strip(),
            result=result,
        ) or row
    except Exception as exc:
        return enterprise_complete_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
            status="error",
            summary=f"{job_type} failed",
            result={"job_type": job_type},
            error_text=str(exc),
        ) or row


def _build_revenue_scout_result(*, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    leads = enterprise_list_leads(enterprise_db_url, workspace_id=workspace_id, limit=200)
    hunts = enterprise_list_lead_hunt_profiles(enterprise_db_url, workspace_id=workspace_id, limit=50)
    tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=200)
    open_tasks = [row for row in tasks if str(row.get("status", "")).strip() != "done"]
    top_targets = [
        {
            "company_name": row.get("company_name", ""),
            "stage": row.get("stage", ""),
            "score": int(row.get("score", 0) or 0),
            "service_pack": row.get("service_pack", ""),
        }
        for row in leads[:5]
    ]
    ready_count = sum(1 for row in leads if str(row.get("stage", "")).strip() == "offer_ready")
    active_hunts = sum(1 for row in hunts if str(row.get("status", "")).strip() == "active")
    summary = (
        f"{len(leads)} companies saved, {ready_count} offer-ready, "
        f"{active_hunts} active hunts, {len(open_tasks)} open follow-ups."
    )
    return {
        "job_type": "revenue_scout",
        "summary": summary,
        "metrics": {
            "lead_count": len(leads),
            "offer_ready_count": ready_count,
            "active_hunt_count": active_hunts,
            "open_task_count": len(open_tasks),
        },
        "top_targets": top_targets,
        "next_actions": [
            "Run one active hunt if pipeline is stale.",
            "Move one offer-ready lead into outreach today.",
            "Close or reschedule old sales follow-ups.",
        ],
    }


def _build_list_clerk_result(*, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    leads = enterprise_list_leads(enterprise_db_url, workspace_id=workspace_id, limit=500)
    missing_email = sum(1 for row in leads if not str(row.get("contact_email", "")).strip())
    missing_phone = sum(1 for row in leads if not str(row.get("contact_phone", "")).strip())
    missing_website = sum(1 for row in leads if not str(row.get("website", "")).strip())
    duplicates = max(0, len(leads) - len({str(row.get("company_name", "")).strip().lower() for row in leads if str(row.get("company_name", "")).strip()}))
    summary = (
        f"{len(leads)} saved companies, {missing_email} missing email, "
        f"{missing_website} missing website, {duplicates} duplicate names."
    )
    return {
        "job_type": "list_clerk",
        "summary": summary,
        "metrics": {
            "company_count": len(leads),
            "missing_email_count": missing_email,
            "missing_phone_count": missing_phone,
            "missing_website_count": missing_website,
            "duplicate_name_count": duplicates,
        },
        "next_actions": [
            "Fill email gaps on the top five target companies.",
            "Remove duplicate rows before the next outreach pass.",
            "Add service-pack tags to unclassified companies.",
        ],
    }


def _build_task_triage_result(*, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=500)
    open_tasks = [row for row in tasks if str(row.get("status", "")).strip() != "done"]
    high_priority = [row for row in open_tasks if str(row.get("priority", "")).strip().lower() == "high"]
    unassigned = [row for row in open_tasks if not str(row.get("owner", "")).strip() or str(row.get("owner", "")).strip().lower() == "owner"]
    by_owner: dict[str, int] = {}
    for row in open_tasks:
        owner = str(row.get("owner", "")).strip() or "Unassigned"
        by_owner[owner] = by_owner.get(owner, 0) + 1
    summary = f"{len(open_tasks)} open tasks, {len(high_priority)} high priority, {len(unassigned)} weakly assigned."
    return {
        "job_type": "task_triage",
        "summary": summary,
        "metrics": {
            "open_task_count": len(open_tasks),
            "high_priority_count": len(high_priority),
            "weak_owner_count": len(unassigned),
        },
        "by_owner": by_owner,
        "next_actions": [
            "Assign every high-priority task to a named owner.",
            "Close stale completed work instead of letting it sit open.",
            "Reduce weakly owned tasks before adding more queue items.",
        ],
    }


def _build_founder_brief_result(*, state_db: str, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    lead_summary = enterprise_load_lead_summary(enterprise_db_url, workspace_id=workspace_id)
    tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=500)
    open_tasks = [row for row in tasks if str(row.get("status", "")).strip() != "done"]
    approvals = load_approval_summary(state_db)
    receiving = load_receiving_summary(state_db)
    inventory = load_inventory_summary(state_db)
    summary = (
        f"Pipeline has {int(lead_summary.get('lead_count', 0) or 0)} companies, "
        f"queue has {len(open_tasks)} open tasks, "
        f"{int(approvals.get('pending_count', 0) or 0)} approvals are pending."
    )
    return {
        "job_type": "founder_brief",
        "summary": summary,
        "metrics": {
            "lead_count": int(lead_summary.get("lead_count", 0) or 0),
            "open_task_count": len(open_tasks),
            "pending_approval_count": int(approvals.get("pending_count", 0) or 0),
            "receiving_review_count": int(receiving.get("review_count", 0) or 0),
            "inventory_watch_count": int(inventory.get("watch_count", 0) or 0),
        },
        "next_actions": [
            "Push one sales lead forward today.",
            "Clear one pending approval blocking execution.",
            "Review receiving and inventory watch items before end of day.",
        ],
    }


def _execute_agent_job(
    *,
    state_db: str,
    enterprise_db_url: str,
    workspace_id: str,
    job_type: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_type = str(job_type or "").strip().lower()
    if normalized_type == "revenue_scout":
        return _build_revenue_scout_result(enterprise_db_url=enterprise_db_url, workspace_id=workspace_id)
    if normalized_type == "list_clerk":
        return _build_list_clerk_result(enterprise_db_url=enterprise_db_url, workspace_id=workspace_id)
    if normalized_type == "task_triage":
        return _build_task_triage_result(enterprise_db_url=enterprise_db_url, workspace_id=workspace_id)
    if normalized_type == "founder_brief":
        return _build_founder_brief_result(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
        )
    raise ValueError(f"Unsupported job type: {job_type}")


def _normalized_agent_job_types(job_types: list[str] | None = None) -> list[str]:
    allowed = [item["job_type"] for item in AGENT_JOB_TEMPLATES]
    requested = [str(item).strip().lower() for item in (job_types or []) if str(item).strip()]
    if not requested:
        return allowed
    return [item for item in requested if item in allowed]


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


def _env_flag(name: str, *, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def _load_runtime_config() -> dict[str, Any]:
    config_path = Path(os.getenv("SUPERMEGA_CONFIG", str(REPO_ROOT / "config.example.json"))).expanduser().resolve()
    payload = _load_json(config_path)
    if not isinstance(payload, dict):
        return {}
    return _expand_env_tokens(payload)


def _materialize_secret_path(raw_value: str, *, suffix: str) -> Path | None:
    value = str(raw_value or "").strip()
    if not value:
        return None
    candidate = Path(value).expanduser()
    if candidate.exists():
        return candidate
    if value.startswith("{") or value.startswith("["):
        cache_root = Path(tempfile.gettempdir()) / "supermega-runtime-secrets"
        cache_root.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]
        target = cache_root / f"{digest}{suffix}"
        if not target.exists():
            target.write_text(value, encoding="utf-8")
        return target
    return candidate


def _drive_probe_from_config(config: dict[str, Any]) -> GoogleDriveProbe:
    sources = config.get("sources", {}) if isinstance(config, dict) else {}
    platform = config.get("platform", {}) if isinstance(config, dict) else {}
    drive = sources.get("drive", {}) if isinstance(sources, dict) else {}
    publish = platform.get("publish", {}) if isinstance(platform, dict) else {}

    service_account_value = str(drive.get("service_account_json", "")).strip() or os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    folder_id = str(publish.get("drive_folder_id", "")).strip() or str(config.get("input_center", {}).get("drive_folder_id", "")).strip()
    service_account_path = _materialize_secret_path(service_account_value, suffix=".service-account.json")
    return GoogleDriveProbe(service_account_path, folder_id)


def _gmail_probe_from_config(config: dict[str, Any]) -> GmailProbe:
    sources = config.get("sources", {}) if isinstance(config, dict) else {}
    gmail = sources.get("gmail", {}) if isinstance(sources, dict) else {}
    client_secret_value = str(gmail.get("client_secret_json", "")).strip() or os.getenv("GMAIL_OAUTH_CLIENT_JSON", "").strip()
    token_value = str(gmail.get("token_json", "")).strip() or os.getenv("GMAIL_OAUTH_TOKEN_JSON", "").strip()
    client_secret_path = _materialize_secret_path(client_secret_value, suffix=".gmail-client.json")
    token_path = _materialize_secret_path(token_value, suffix=".gmail-token.json")
    return GmailProbe(client_secret_path, token_path)


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


def _build_csv_export_fallback(
    *,
    rows: list[dict[str, Any]],
    workspace_name: str,
    export_request: LeadPipelineExportRequest | None,
    source_status: str,
    source_message: str,
) -> dict[str, Any]:
    headers, values = _lead_pipeline_sheet_rows(rows)
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(values)
    csv_text = buffer.getvalue()
    requested_name = ""
    if export_request is not None:
        requested_name = str(export_request.spreadsheet_name or "").strip()
    base_name = requested_name or workspace_name or "supermega-lead-pipeline"
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", base_name).strip("-").lower() or "supermega-lead-pipeline"
    if not safe_name.endswith(".csv"):
        safe_name = f"{safe_name}.csv"
    return {
        "status": "ready",
        "mode": "csv_fallback",
        "web_view_link": f"data:text/csv;charset=utf-8,{quote(csv_text)}",
        "download_name": safe_name,
        "csv_text": csv_text,
        "message": "Drive publishing is unavailable on this host. Returning a direct CSV export instead.",
        "source_status": source_status,
        "source_message": source_message,
    }


SESSION_COOKIE_NAME = "supermega_session"


def _load_local_env_files() -> None:
    for candidate in (
        REPO_ROOT / ".env.app.local",
        REPO_ROOT / ".env.local",
        Path.home() / "OneDrive - BDA" / ".env.app.local",
    ):
        if candidate.exists():
            load_dotenv(candidate, override=False)


def _env_truthy(name: str, default: bool) -> bool:
    raw = os.getenv(name, "1" if default else "0").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _anthropic_provider() -> AnthropicProvider:
    return AnthropicProvider()


def _openai_provider() -> OpenAIProvider:
    return OpenAIProvider()


def _run_ai_json(
    *,
    system_prompt: str,
    user_prompt: str,
    schema_name: str,
    required_keys: list[str],
    max_tokens: int,
) -> tuple[dict[str, Any], str]:
    preferred = str(os.getenv("SUPERMEGA_LLM_PROVIDER", "openai")).strip().lower()
    providers: list[tuple[str, Any]] = []
    if preferred == "anthropic":
        providers = [("anthropic+rules", _anthropic_provider()), ("openai+rules", _openai_provider())]
    else:
        providers = [("openai+rules", _openai_provider()), ("anthropic+rules", _anthropic_provider())]

    for engine_name, provider in providers:
        if not provider.available():
            continue
        if engine_name == "openai+rules":
            result = provider.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                schema_name=schema_name,
                required_keys=required_keys,
                max_output_tokens=max_tokens,
            )
        else:
            result = provider.generate_json(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                temperature=0.2,
            )
        if result.get("status") == "ready":
            return result, engine_name

    return {"status": "unavailable"}, "rules"


def create_app(site_root: Path, pilot_data: Path) -> FastAPI:
    site_root = site_root.expanduser().resolve()
    pilot_data = pilot_data.expanduser().resolve()
    _load_local_env_files()
    state_db = resolve_state_db(pilot_data)
    enterprise_db_url = resolve_enterprise_database_url(pilot_data)
    sync_state_from_output_dir(pilot_data)
    auth_required = _env_truthy("SUPERMEGA_AUTH_REQUIRED", True)
    auth_username = str(os.getenv("SUPERMEGA_APP_USERNAME", "owner")).strip().lower() or "owner"
    auth_password = str(os.getenv("SUPERMEGA_APP_PASSWORD", "supermega-demo")).strip() or "supermega-demo"
    auth_display_name = str(os.getenv("SUPERMEGA_APP_DISPLAY_NAME", "Owner")).strip() or "Owner"
    auth_role = str(os.getenv("SUPERMEGA_APP_ROLE", "owner")).strip() or "owner"
    auth_workspace_slug = str(os.getenv("SUPERMEGA_WORKSPACE_SLUG", "supermega-lab")).strip().lower() or "supermega-lab"
    auth_workspace_name = str(os.getenv("SUPERMEGA_WORKSPACE_NAME", "SuperMega Lab")).strip() or "SuperMega Lab"
    auth_workspace_plan = str(os.getenv("SUPERMEGA_WORKSPACE_PLAN", "pilot")).strip() or "pilot"
    session_ttl_hours = int(os.getenv("SUPERMEGA_SESSION_HOURS", str(24 * 14)) or (24 * 14))
    internal_cron_token = str(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN", "")).strip()
    default_user_payload = enterprise_ensure_user(
        enterprise_db_url,
        username=auth_username,
        password=auth_password,
        display_name=auth_display_name,
        role=auth_role,
        workspace_slug=auth_workspace_slug,
        workspace_name=auth_workspace_name,
        workspace_plan=auth_workspace_plan,
    )
    default_workspace = default_user_payload.get("workspace", {}) if isinstance(default_user_payload, dict) else {}
    default_workspace_id = str(default_workspace.get("workspace_id", "")).strip()
    bootstrap_workspace_leads(
        enterprise_db_url,
        workspace_id=default_workspace_id,
        rows=state_list_lead_pipeline(state_db, limit=500),
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
        return enterprise_get_session(enterprise_db_url, session_id=session_id)

    def _require_session(request: Request) -> dict[str, Any]:
        if not auth_required:
            return {
                "username": auth_username,
                "role": auth_role,
                "display_name": auth_display_name,
                "workspace_id": str(default_workspace.get("workspace_id", "")).strip(),
                "workspace_slug": str(default_workspace.get("slug", auth_workspace_slug)).strip(),
                "workspace_name": str(default_workspace.get("name", auth_workspace_name)).strip(),
                "workspace_plan": str(default_workspace.get("plan", auth_workspace_plan)).strip(),
                "authenticated": True,
            }
        session = _session_from_request(request)
        if not session:
            raise HTTPException(status_code=401, detail="Login required.")
        return session

    def _require_internal_cron_token(request: Request) -> None:
        if not internal_cron_token:
            raise HTTPException(status_code=503, detail="Internal cron token is not configured.")
        provided = str(request.headers.get("x-supermega-cron-token", "")).strip()
        if not provided or provided != internal_cron_token:
            raise HTTPException(status_code=401, detail="Invalid internal cron token.")

    def _run_agent_job_batch(
        *,
        workspace_id: str,
        triggered_by: str,
        source: str,
        job_types: list[str] | None = None,
    ) -> dict[str, Any]:
        normalized_job_types = _normalized_agent_job_types(job_types)
        results: list[dict[str, Any]] = []
        for job_type in normalized_job_types:
            row = enterprise_create_agent_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                job_type=job_type,
                source=source,
                payload={},
                max_attempts=1,
                triggered_by=triggered_by,
            )
            run_id = str(row.get("run_id", "")).strip()
            enterprise_start_agent_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                run_id=run_id,
            )
            try:
                result = _execute_agent_job(
                    state_db=state_db,
                    enterprise_db_url=enterprise_db_url,
                    workspace_id=workspace_id,
                    job_type=job_type,
                    payload={},
                )
                final_row = enterprise_complete_agent_run(
                    enterprise_db_url,
                    workspace_id=workspace_id,
                    run_id=run_id,
                    status="ready",
                    summary=str(result.get("summary", "")).strip(),
                    result=result,
                )
            except Exception as exc:
                final_row = enterprise_complete_agent_run(
                    enterprise_db_url,
                    workspace_id=workspace_id,
                    run_id=run_id,
                    status="error",
                    summary=f"{job_type} failed",
                    result={"job_type": job_type},
                    error_text=str(exc),
                )
            results.append(final_row or {"job_type": job_type, "status": "error"})
        latest_runs = enterprise_list_agent_runs(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=50,
        )
        latest_by_type = _group_agent_runs_by_job_type(latest_runs)
        return {
            "status": "ready",
            "count": len(results),
            "rows": results,
            "jobs": [
                {
                    **template,
                    "last_run": latest_by_type.get(template["job_type"], {}),
                }
                for template in AGENT_JOB_TEMPLATES
            ],
        }

    def _require_internal_automation(request: Request) -> str:
        cron_token = str(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN", "")).strip()
        header_token = str(request.headers.get("x-supermega-cron-token", "")).strip()
        if cron_token and header_token and secrets.compare_digest(header_token, cron_token):
            return "cron"
        session = _session_from_request(request)
        if session:
            return str(session.get("display_name", session.get("username", "system"))).strip() or "system"
        raise HTTPException(status_code=401, detail="Internal automation auth required.")

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

    def _request_hostname(request: Request) -> str:
        forwarded_host = str(request.headers.get("x-forwarded-host", "")).strip().lower()
        if forwarded_host:
            return forwarded_host.split(",")[0].strip().split(":")[0]
        host = str(request.headers.get("host", "")).strip().lower()
        if host:
            return host.split(":")[0]
        return str(request.url.hostname or "").strip().lower()

    def _public_tenant_defaults(request: Request) -> dict[str, str]:
        tenant_param = str(request.query_params.get("tenant", "")).strip().lower()
        hostname = _request_hostname(request)
        if tenant_param in {"ytf", "ytf-plant-a"} or hostname in {"ytf.supermega.dev", "www.ytf.supermega.dev"}:
            return {
                "tenant_key": "ytf-plant-a",
                "workspace_slug": "ytf-plant-a",
                "company": "Yangon Tyre Plant A",
            }
        return {"tenant_key": "default", "workspace_slug": "", "company": ""}

    def _session_payload(session: dict[str, Any]) -> dict[str, Any]:
        return {
            "username": session.get("username", ""),
            "display_name": session.get("display_name", ""),
            "role": session.get("role", ""),
            "workspace_id": session.get("workspace_id", ""),
            "workspace_slug": session.get("workspace_slug", ""),
            "workspace_name": session.get("workspace_name", ""),
            "workspace_plan": session.get("workspace_plan", ""),
        }

    def _ensure_public_workspace_session(
        request: Request,
        response: Response,
        payload: PublicWorkspaceBootstrapRequest,
    ) -> dict[str, Any]:
        existing_session = _session_from_request(request)
        if existing_session:
            return {
                "authenticated": True,
                "reused": True,
                "session": _session_payload(existing_session),
            }

        tenant_defaults = _public_tenant_defaults(request)
        tenant_workspace_slug = str(tenant_defaults.get("workspace_slug", "")).strip()
        tenant_company = str(tenant_defaults.get("company", "")).strip()
        company = str(payload.company or tenant_company).strip()
        email = str(payload.email or "").strip().lower()
        name = str(payload.name or "").strip() or company or "Owner"
        if not company or not email:
            raise HTTPException(status_code=400, detail="Company and work email are required to start the shared workspace.")
        if "@" not in email or "." not in email.split("@")[-1]:
            raise HTTPException(status_code=400, detail="Enter a valid work email to start the shared workspace.")
        seed = "|".join(
            [
                company,
                name,
                email,
                datetime.now().astimezone().isoformat(),
            ]
        )
        password = secrets.token_urlsafe(10)
        requested_slug = str(payload.workspace_slug or tenant_workspace_slug or "").strip()
        base_slug = _slugify(requested_slug or company or name or "workspace") or "workspace"
        workspace_slug = base_slug if requested_slug else f"{base_slug}-{hashlib.sha1(email.encode('utf-8')).hexdigest()[:4]}"

        created = enterprise_ensure_user(
            enterprise_db_url,
            username=email,
            password=password,
            display_name=name,
            role="owner",
            workspace_slug=workspace_slug,
            workspace_name=company,
            workspace_plan="starter",
        )
        user = enterprise_authenticate_user(enterprise_db_url, username=email, password=password)
        if not user:
            raise HTTPException(status_code=500, detail="Public workspace bootstrap failed.")
        session = enterprise_create_session(
            enterprise_db_url,
            username=str(user.get("username", "")),
            role=str(user.get("role", "")),
            workspace_slug=workspace_slug,
            ttl_hours=session_ttl_hours,
        )
        _set_session_cookie(response, request, str(session.get("session_id", "")))
        return {
            "authenticated": True,
            "reused": False,
            "generated_password": password,
            "created": created,
            "session": {
                "username": user.get("username", ""),
                "display_name": user.get("display_name", ""),
                "role": user.get("role", ""),
                "workspace_id": session.get("workspace_id", ""),
                "workspace_slug": session.get("workspace_slug", ""),
                "workspace_name": session.get("workspace_name", ""),
                "workspace_plan": session.get("workspace_plan", ""),
            },
        }

    def _export_lead_rows_to_workspace(
        *,
        rows: list[dict[str, Any]],
        workspace_name: str,
        export_request: LeadPipelineExportRequest | None = None,
    ) -> dict[str, Any]:
        config = _load_runtime_config()
        probe = _drive_probe_from_config(config)
        request_payload = export_request or LeadPipelineExportRequest()
        headers, values = _lead_pipeline_sheet_rows(rows)
        return probe.publish_rows_sheet(
            spreadsheet_name=request_payload.spreadsheet_name.strip() or "SuperMega Lead Pipeline",
            sheet_name=request_payload.sheet_name.strip() or "Leads",
            workspace_folder_name=request_payload.workspace_folder_name.strip() or workspace_name or "SuperMega Sales",
            headers=headers,
            rows=values,
            description="Lead pipeline generated by SuperMega Lead Finder and lead-to-pilot workflow.",
        )

    def _build_public_inbound_opportunity(payload: ContactSubmissionRequest) -> dict[str, Any]:
        company_name = payload.company.strip() or payload.name.strip() or "Inbound request"
        goal = payload.goal.strip()
        workflow = payload.workflow.strip() or "Discovery request"
        data_summary = payload.data.strip() or "Gmail + Drive + Sheets"
        return {
            "name": company_name,
            "archetype": "inbound_request",
            "stage": "offer_ready",
            "status": "open",
            "owner": "Growth Studio",
            "service_pack": "Action OS",
            "wedge_product": "Action OS",
            "starter_modules": ["Action OS"],
            "semi_products": ["Lead Finder"],
            "outreach_subject": f"{company_name}: next step for Action OS",
            "outreach_message": (
                f"Hi {payload.name.strip() or company_name}, thanks for the request. "
                f"We can start with {workflow.lower()} and shape the first Action OS board around {goal or 'your main blocker'}."
            ),
            "discovery_questions": [
                "What is the one workflow that wastes the most time today?",
                "Which inbox, sheet, or tracker should the first board connect to?",
                "Who needs to see the first live board every day?",
            ],
            "source": "website_request",
            "source_url": "",
            "provider": "website",
            "score": 9,
            "email": payload.email.strip(),
            "phone": "",
            "website": "",
            "notes": f"Workflow: {workflow}\nData: {data_summary}\nGoal: {goal}",
        }

    def _run_autonomous_lead_hunt(
        *,
        workspace_id: str,
        workspace_name: str,
        hunt_id: str = "",
        query: str,
        raw_text: str,
        keywords: list[str],
        sources: list[str],
        limit: int,
        campaign_goal: str,
        export_workspace: bool,
    ) -> dict[str, Any]:
        lead_result = run_lead_finder(raw_text=raw_text, query=query, keywords=keywords, sources=sources, limit=limit)
        lead_rows = list(lead_result.get("rows") or [])
        provider = str(lead_result.get("provider", "")).strip()
        if not lead_rows:
            return {
                "status": "ready",
                "provider": provider,
                "engine": "rules",
                "row_count": 0,
                "saved_count": 0,
                "summary": "No matching leads found for this hunt.",
                "rows": [],
                "opportunities": [],
            }

        lead_pack = build_lead_to_pilot_pack(
            leads=lead_rows[: min(5, len(lead_rows))],
            campaign_goal=campaign_goal,
        )
        lead_pack = _maybe_ai_enrich_lead_pack(lead_pack, campaign_goal=campaign_goal)
        save_result = enterprise_add_leads(
            enterprise_db_url,
            workspace_id=workspace_id,
            rows=lead_pack.get("opportunities", []),
            campaign_goal=campaign_goal,
            source="lead_hunt",
        )
        for lead_id in [str(item).strip() for item in (save_result.get("saved_lead_ids") or []) if str(item).strip()]:
            enterprise_add_lead_activity(
                enterprise_db_url,
                workspace_id=workspace_id,
                lead_id=lead_id,
                actor="Lead Hunter Agent",
                activity_type="hunt_run",
                channel="workflow",
                direction="internal",
                message=f"Ran autonomous hunt for '{query or 'manual source'}' and generated an offer-ready lead pack.",
                stage_after="offer_ready",
                next_step="Review the top lead and send the first outreach.",
            )

        export_result: dict[str, Any] | None = None
        if export_workspace:
            export_result = _export_lead_rows_to_workspace(
                rows=save_result.get("rows", []),
                workspace_name=workspace_name,
            )

        profile_row = None
        if str(hunt_id or "").strip():
            profile_row = enterprise_record_lead_hunt_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                hunt_id=str(hunt_id).strip(),
                provider=provider,
                engine_name=str(lead_pack.get("engine", "rules")).strip(),
                saved_count=int(save_result.get("saved_count", 0) or 0),
                summary=str(lead_pack.get("summary", "")).strip(),
            )

        return {
            "status": "ready",
            "provider": provider,
            "engine": lead_pack.get("engine", "rules"),
            "row_count": len(lead_rows),
            "saved_count": int(save_result.get("saved_count", 0) or 0),
            "summary": lead_pack.get("summary", ""),
            "rows": lead_rows,
            "opportunities": lead_pack.get("opportunities", []),
            "pipeline": {
                "summary": save_result.get("summary", {}),
                "rows": save_result.get("rows", []),
            },
            "export": export_result,
            "hunt": profile_row,
        }

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
            "enterprise_db": enterprise_db_url,
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
                    "workspace_id": str(default_workspace.get("workspace_id", "")).strip(),
                    "workspace_slug": str(default_workspace.get("slug", auth_workspace_slug)).strip(),
                    "workspace_name": str(default_workspace.get("name", auth_workspace_name)).strip(),
                    "workspace_plan": str(default_workspace.get("plan", auth_workspace_plan)).strip(),
                }
                if not auth_required
                else None
            ),
            "uses_default_credentials": uses_default_credentials,
            "workspaces": enterprise_list_user_workspaces(enterprise_db_url, username=str(session.get("username", auth_username) if session else auth_username)),
        }

    @app.post("/api/auth/login")
    def auth_login(request: Request, response: Response, payload: LoginRequest) -> dict[str, Any]:
        tenant_defaults = _public_tenant_defaults(request)
        user = enterprise_authenticate_user(enterprise_db_url, username=payload.username, password=payload.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password.")
        session = enterprise_create_session(
            enterprise_db_url,
            username=str(user.get("username", "")),
            role=str(user.get("role", "")),
            workspace_slug=str(payload.workspace_slug or tenant_defaults.get("workspace_slug", "")).strip(),
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
                "workspace_id": session.get("workspace_id", ""),
                "workspace_slug": session.get("workspace_slug", ""),
                "workspace_name": session.get("workspace_name", ""),
                "workspace_plan": session.get("workspace_plan", ""),
            },
            "uses_default_credentials": uses_default_credentials,
            "workspaces": enterprise_list_user_workspaces(enterprise_db_url, username=str(user.get("username", ""))),
        }

    @app.post("/api/auth/signup")
    def auth_signup(request: Request, response: Response, payload: SignupRequest) -> dict[str, Any]:
        tenant_defaults = _public_tenant_defaults(request)
        email = str(payload.email or "").strip().lower()
        company = str(payload.company or tenant_defaults.get("company", "")).strip()
        name = str(payload.name or "").strip() or company or "Owner"
        if not email or not company:
            raise HTTPException(status_code=400, detail="Name, email, and company are required.")
        password = str(payload.password or "").strip() or secrets.token_urlsafe(10)
        requested_slug = str(payload.workspace_slug or tenant_defaults.get("workspace_slug", "")).strip()
        base_slug = _slugify(requested_slug or company or email.split("@")[0])
        workspace_slug = base_slug or "workspace"
        if not requested_slug:
            workspace_slug = f"{workspace_slug}-{hashlib.sha1(email.encode('utf-8')).hexdigest()[:4]}"

        created = enterprise_ensure_user(
            enterprise_db_url,
            username=email,
            password=password,
            display_name=name,
            role="owner",
            workspace_slug=workspace_slug,
            workspace_name=company,
            workspace_plan="starter",
        )
        user = enterprise_authenticate_user(enterprise_db_url, username=email, password=password)
        if not user:
            raise HTTPException(status_code=500, detail="Workspace signup failed.")
        session = enterprise_create_session(
            enterprise_db_url,
            username=str(user.get("username", "")),
            role=str(user.get("role", "")),
            workspace_slug=workspace_slug,
            ttl_hours=session_ttl_hours,
        )
        _set_session_cookie(response, request, str(session.get("session_id", "")))
        return {
            "status": "ready",
            "authenticated": True,
            "generated_password": "" if str(payload.password or "").strip() else password,
            "session": {
                "username": user.get("username", ""),
                "display_name": user.get("display_name", ""),
                "role": user.get("role", ""),
                "workspace_id": session.get("workspace_id", ""),
                "workspace_slug": session.get("workspace_slug", ""),
                "workspace_name": session.get("workspace_name", ""),
                "workspace_plan": session.get("workspace_plan", ""),
            },
            "workspaces": enterprise_list_user_workspaces(enterprise_db_url, username=str(user.get("username", ""))),
            "created": created,
        }

    @app.post("/api/public/workspace/bootstrap")
    def public_workspace_bootstrap(request: Request, response: Response, payload: PublicWorkspaceBootstrapRequest) -> dict[str, Any]:
        session_payload = _ensure_public_workspace_session(request, response, payload)
        return {"status": "ready", **session_payload}

    @app.post("/api/public/workspace/save-leads")
    def public_workspace_save_leads(
        request: Request,
        response: Response,
        payload: PublicWorkspaceLeadSaveRequest,
    ) -> dict[str, Any]:
        session_payload = _ensure_public_workspace_session(
            request,
            response,
            PublicWorkspaceBootstrapRequest(
                name=payload.name,
                email=payload.email,
                company=payload.company,
                workspace_slug=payload.workspace_slug,
                goal=payload.goal,
            ),
        )
        workspace_id = str((session_payload.get("session") or {}).get("workspace_id", "")).strip()
        if not workspace_id:
            raise HTTPException(status_code=500, detail="Workspace session is missing a workspace.")
        saved = enterprise_add_leads_with_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            rows=payload.rows,
            campaign_goal=payload.campaign_goal,
            source="public_lead_finder",
            default_task_owner="Sales",
            default_task_priority="High",
            default_task_due="Today",
            default_task_notes="First outreach",
        )
        return {
            "status": "ready",
            "authenticated": True,
            "reused": bool(session_payload.get("reused")),
            "session": session_payload.get("session", {}),
            "created": session_payload.get("created", {}),
            "generated_password": session_payload.get("generated_password", ""),
            "saved_count": saved.get("saved_count", 0),
            "saved_lead_ids": saved.get("saved_lead_ids", []),
            "saved_task_count": saved.get("saved_task_count", 0),
            "saved_task_ids": saved.get("saved_task_ids", []),
            "rows": saved.get("rows", []),
            "tasks": saved.get("tasks", []),
            "summary": saved.get("summary", {}),
            "saved_at": saved.get("saved_at", ""),
        }

    @app.post("/api/auth/logout")
    def auth_logout(request: Request, response: Response) -> dict[str, Any]:
        session = _session_from_request(request)
        if session:
            enterprise_revoke_session(enterprise_db_url, session_id=str(session.get("session_id", "")))
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
        approval_summary = load_approval_summary(state_db)
        metric_summary = load_metric_summary(state_db)
        feedback_summary = load_product_feedback_summary(state_db)
        lead_pipeline_summary = enterprise_load_lead_summary(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
        )
        latest_agent_runs = enterprise_list_agent_runs(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            limit=20,
        )
        latest_agent_runs_by_type = _group_agent_runs_by_job_type(latest_agent_runs)
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
            "agent_jobs": {
                "count": len(latest_agent_runs),
                "latest": [
                    {
                        "job_type": template["job_type"],
                        "name": template["name"],
                        "cadence": template["cadence"],
                        "last_run": latest_agent_runs_by_type.get(template["job_type"], {}),
                    }
                    for template in AGENT_JOB_TEMPLATES
                ],
            },
            "quality": quality_summary,
            "supplier_watch": supplier_summary,
            "lead_pipeline": lead_pipeline_summary,
            "receiving": receiving_summary,
            "inventory": inventory_summary,
            "approvals": approval_summary,
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

    @app.get("/api/insights")
    def insights(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        payload = _build_operating_insights(
            state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
        )
        return {"status": "ready", **_maybe_ai_enrich_insights(payload)}

    @app.get("/api/agent-runs")
    def agent_runs(request: Request, job_type: str | None = None, status: str | None = None, limit: int = 50) -> dict[str, Any]:
        session = _require_session(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        rows = enterprise_list_agent_runs(
            enterprise_db_url,
            workspace_id=workspace_id,
            job_type=job_type,
            status=status,
            limit=limit,
        )
        latest_by_type = _group_agent_runs_by_job_type(rows)
        return {
            "status": "ready",
            "count": len(rows),
            "rows": rows,
            "jobs": [
                {
                    **template,
                    "last_run": latest_by_type.get(template["job_type"], {}),
                }
                for template in AGENT_JOB_TEMPLATES
            ],
        }

    @app.post("/api/agent-runs")
    def create_agent_run(request_http: Request, request: AgentRunRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        job_type = str(request.job_type or "").strip().lower()
        if job_type not in {item["job_type"] for item in AGENT_JOB_TEMPLATES}:
            raise HTTPException(status_code=400, detail=f"Unsupported job type: {request.job_type}")

        row = enterprise_create_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            job_type=job_type,
            source=str(request.source or "").strip() or "manual",
            payload=request.payload,
            idempotency_key=str(request.idempotency_key or "").strip() or None,
            max_attempts=int(request.max_attempts or 1),
            triggered_by=str(session.get("display_name", session.get("username", "system"))),
            related_entity_type=str(request.related_entity_type or "").strip(),
            related_entity_id=str(request.related_entity_id or "").strip(),
        )
        run_id = str(row.get("run_id", "")).strip()
        enterprise_start_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
        )
        try:
            result = _execute_agent_job(
                state_db=state_db,
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                job_type=job_type,
                payload=request.payload,
            )
            summary_text = str(result.get("summary", "")).strip()
            final_row = enterprise_complete_agent_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                run_id=run_id,
                status="ready",
                summary=summary_text,
                result=result,
            )
        except Exception as exc:
            final_row = enterprise_complete_agent_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                run_id=run_id,
                status="error",
                summary=f"{job_type} failed",
                result={"job_type": job_type},
                error_text=str(exc),
            )
            raise HTTPException(status_code=500, detail=f"Agent run failed: {exc}") from exc
        latest_runs = enterprise_list_agent_runs(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=20,
        )
        latest_by_type = _group_agent_runs_by_job_type(latest_runs)
        return {
            "status": "ready",
            "row": final_row,
            "jobs": [
                {
                    **template,
                    "last_run": latest_by_type.get(template["job_type"], {}),
                }
                for template in AGENT_JOB_TEMPLATES
            ],
        }

    @app.post("/api/ops/agent-jobs/run-defaults")
    def run_default_agent_jobs(request_http: Request, request: AgentRunDefaultsRequest) -> dict[str, Any]:
        actor = _require_internal_automation(request_http)
        workspace_slug = str(request.workspace_slug or auth_workspace_slug).strip() or auth_workspace_slug
        workspace_name = auth_workspace_name
        workspace = enterprise_ensure_user(
            enterprise_db_url,
            username=auth_username,
            password=auth_password,
            display_name=auth_display_name,
            role=auth_role,
            workspace_slug=workspace_slug,
            workspace_name=workspace_name,
            workspace_plan=auth_workspace_plan,
        ).get("workspace", {})
        workspace_id = str(workspace.get("workspace_id", "")).strip()
        if not workspace_id:
            raise HTTPException(status_code=500, detail="Workspace could not be resolved for default jobs.")
        payload = _run_agent_job_batch(
            workspace_id=workspace_id,
            triggered_by=actor,
            source=str(request.source or "").strip() or "scheduler",
            job_types=request.job_types,
        )
        return {
            **payload,
            "workspace_slug": workspace_slug,
        }

    @app.post("/api/agent-runs/run-defaults")
    def run_default_agent_runs(request_http: Request, request: AgentBatchRunRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        return _run_agent_job_batch(
            workspace_id=str(session.get("workspace_id", "")).strip(),
            triggered_by=str(session.get("display_name", session.get("username", "system"))),
            source=str(request.source or "").strip() or "manual_batch",
            job_types=request.job_types,
        )

    @app.post("/api/internal/agent-runs/run-defaults")
    def run_internal_default_agent_runs(request_http: Request, request: AgentBatchRunRequest) -> dict[str, Any]:
        _require_internal_cron_token(request_http)
        return _run_agent_job_batch(
            workspace_id=default_workspace_id,
            triggered_by="cloud_scheduler",
            source=str(request.source or "").strip() or "scheduler",
            job_types=request.job_types,
        )

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
        payload = build_lead_to_pilot_pack(leads=request.leads, campaign_goal=request.campaign_goal)
        return _maybe_ai_enrich_lead_pack(payload, campaign_goal=request.campaign_goal)

    @app.get("/api/lead-pipeline")
    def lead_pipeline(request: Request, stage: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        session = _require_session(request)
        rows = enterprise_list_leads(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            stage=stage,
            status=status,
            limit=limit,
        )
        return {
            "status": "ready",
            "summary": enterprise_load_lead_summary(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
            ),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/workspace-tasks")
    def workspace_tasks(request: Request, status: str | None = None, limit: int = 200) -> dict[str, Any]:
        session = _require_session(request)
        rows = enterprise_list_workspace_tasks(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            status=status,
            limit=limit,
        )
        return {
            "status": "ready",
            "count": len(rows),
            "rows": rows,
        }

    @app.post("/api/workspace-tasks")
    def create_workspace_tasks(request_http: Request, request: WorkspaceTaskBulkRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        return enterprise_add_workspace_tasks(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            rows=[row.model_dump() for row in request.rows],
        )

    @app.post("/api/workspace-tasks/{task_id}")
    def update_workspace_tasks(task_id: str, request_http: Request, request: WorkspaceTaskUpdateRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = enterprise_update_workspace_task(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            task_id=task_id,
            status=(request.status or "").strip() or None,
            owner=(request.owner or "").strip() or None,
            priority=(request.priority or "").strip() or None,
            due=(request.due or "").strip() or None,
            title=(request.title or "").strip() or None,
            notes=request.notes,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Task not found.")
        return {"status": "ready", "row": row}

    @app.delete("/api/workspace-tasks/{task_id}")
    def delete_workspace_task(task_id: str, request_http: Request) -> dict[str, Any]:
        session = _require_session(request_http)
        removed = enterprise_remove_workspace_task(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            task_id=task_id,
        )
        if not removed:
            raise HTTPException(status_code=404, detail="Task not found.")
        return {"status": "ready", "removed": True}

    @app.post("/api/lead-pipeline/import")
    def import_lead_pipeline(request_http: Request, request: LeadPipelineImportRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        return enterprise_add_leads(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            rows=request.rows,
            campaign_goal=request.campaign_goal,
            source="lead_to_pilot",
        )

    @app.post("/api/lead-pipeline/{lead_id}")
    def update_lead_pipeline(lead_id: str, request_http: Request, request: LeadPipelineUpdateRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = enterprise_update_lead(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
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
            "summary": enterprise_load_lead_summary(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
            ),
        }

    @app.get("/api/lead-pipeline/{lead_id}/activities")
    def lead_pipeline_activities(lead_id: str, request: Request, limit: int = 20) -> dict[str, Any]:
        session = _require_session(request)
        rows = enterprise_list_lead_activities(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            lead_id=lead_id,
            limit=limit,
        )
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/lead-pipeline/{lead_id}/activities")
    def create_lead_pipeline_activity(lead_id: str, request_http: Request, request: LeadActivityRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = enterprise_add_lead_activity(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            lead_id=lead_id,
            actor=str(session.get("display_name", session.get("username", "Owner"))),
            activity_type=request.activity_type.strip(),
            channel=request.channel.strip(),
            direction=request.direction.strip(),
            message=request.message.strip(),
            stage_after=request.stage_after.strip(),
            next_step=request.next_step.strip(),
        )
        lead_row = enterprise_update_lead(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            lead_id=lead_id,
        )
        return {
            "status": "ready",
            "row": row,
            "lead": lead_row,
            "activities": enterprise_list_lead_activities(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
                lead_id=lead_id,
                limit=20,
            ),
            "summary": enterprise_load_lead_summary(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
            ),
        }

    @app.post("/api/lead-pipeline/{lead_id}/outreach/gmail")
    def create_lead_pipeline_gmail_outreach(lead_id: str, request_http: Request, request: LeadOutreachDraftRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        lead = enterprise_get_lead(
            enterprise_db_url,
            workspace_id=workspace_id,
            lead_id=lead_id,
        )
        if not lead:
            raise HTTPException(status_code=404, detail=f"Lead not found: {lead_id}")

        to_email = str(lead.get("contact_email", "")).strip()
        if not to_email:
            raise HTTPException(status_code=400, detail="Lead does not have a contact email.")

        subject = str(request.subject or lead.get("outreach_subject", "")).strip()
        message = str(request.message or lead.get("outreach_message", "")).strip()
        if not subject and not message:
            raise HTTPException(status_code=400, detail="Lead does not have outreach content yet.")

        config = _load_runtime_config()
        gmail = _gmail_probe_from_config(config)
        compose_payload = {
            "status": "ready",
            "compose_url": gmail.build_compose_url(
                to=to_email,
                subject=subject,
                body=message,
            ),
            "message": "Gmail compose link prepared.",
        }
        if request.create_gmail_draft:
            compose_payload = gmail.create_draft(
                to=to_email,
                subject=subject,
                body=message,
            )

        activity_message = f"Prepared Gmail outreach for {lead.get('company_name', 'lead')}: {subject or 'No subject'}"
        if compose_payload.get("status") == "ready" and compose_payload.get("draft_id"):
            activity_message = f"Created Gmail draft for {lead.get('company_name', 'lead')}: {subject or 'No subject'}"
        elif compose_payload.get("status") == "reauth_required":
            activity_message = f"Prepared Gmail compose link for {lead.get('company_name', 'lead')} (API draft needs compose scope): {subject or 'No subject'}"

        activity = enterprise_add_lead_activity(
            enterprise_db_url,
            workspace_id=workspace_id,
            lead_id=lead_id,
            actor=str(session.get("display_name", session.get("username", "Owner"))),
            activity_type="outreach_draft",
            channel="gmail",
            direction="outbound",
            message=activity_message,
            next_step="Send outreach from Gmail and log the reply.",
        )
        refreshed_lead = enterprise_get_lead(
            enterprise_db_url,
            workspace_id=workspace_id,
            lead_id=lead_id,
        )
        return {
            "status": compose_payload.get("status", "ready"),
            "draft": compose_payload,
            "lead": refreshed_lead,
            "activity": activity,
            "activities": enterprise_list_lead_activities(
                enterprise_db_url,
                workspace_id=workspace_id,
                lead_id=lead_id,
                limit=20,
            ),
            "summary": enterprise_load_lead_summary(
                enterprise_db_url,
                workspace_id=workspace_id,
            ),
        }

    @app.post("/api/lead-pipeline/export/workspace")
    def export_lead_pipeline_to_workspace(request_http: Request, request: LeadPipelineExportRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        workspace_name = str(session.get("workspace_name", "")).strip() or "SuperMega Sales"
        rows = enterprise_list_leads(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            limit=500,
        )
        export_result = _export_lead_rows_to_workspace(
            rows=rows,
            workspace_name=workspace_name,
            export_request=request,
        )
        if export_result.get("status") != "ready" or not str(export_result.get("web_view_link", "")).strip():
            export_result = _build_csv_export_fallback(
                rows=rows,
                workspace_name=workspace_name,
                export_request=request,
                source_status=str(export_result.get("status", "error")).strip() or "error",
                source_message=str(export_result.get("message", "")).strip(),
            )
        return {
            "status": export_result.get("status", "ready"),
            "summary": enterprise_load_lead_summary(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
            ),
            "row_count": len(rows),
            "export": export_result,
        }

    @app.post("/api/tools/solution-architect")
    def tool_solution_architect(request: SolutionArchitectRequest) -> dict[str, Any]:
        return {"status": "ready", "blueprint": build_solution_blueprint(request.model_dump())}

    @app.post("/api/tools/lead-hunt")
    def tool_lead_hunt(request_http: Request, request: LeadHuntRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        keywords = [str(item).strip() for item in request.keywords if str(item).strip()]
        campaign_goal = request.campaign_goal.strip() or "Book one discovery call."
        return _run_autonomous_lead_hunt(
            workspace_id=str(session.get("workspace_id", "")).strip(),
            workspace_name=str(session.get("workspace_name", "")).strip(),
            query=request.query.strip(),
            raw_text=request.raw_text.strip(),
            keywords=keywords,
            sources=[str(item).strip() for item in request.sources if str(item).strip()],
            limit=int(request.limit or 8),
            campaign_goal=campaign_goal,
            export_workspace=bool(request.export_workspace),
        )

    @app.get("/api/lead-hunts")
    def lead_hunt_profiles(request: Request, status: str | None = None, limit: int = 50) -> dict[str, Any]:
        session = _require_session(request)
        rows = enterprise_list_lead_hunt_profiles(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            status=status,
            limit=limit,
        )
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/lead-hunts")
    def create_lead_hunt_profile(request_http: Request, request: LeadHuntProfileRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        profile = enterprise_save_lead_hunt_profile(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            name=request.name.strip(),
            query=request.query.strip(),
            raw_text=request.raw_text.strip(),
            keywords=[str(item).strip() for item in request.keywords if str(item).strip()],
            sources=[str(item).strip() for item in request.sources if str(item).strip()],
            limit=int(request.limit or 8),
            campaign_goal=request.campaign_goal.strip(),
            export_workspace=bool(request.export_workspace),
            owner=request.owner.strip(),
            status=request.status.strip(),
        )
        return {
            "status": "ready",
            "profile": profile,
            "rows": enterprise_list_lead_hunt_profiles(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
                limit=50,
            ),
        }

    @app.post("/api/lead-hunts/{hunt_id}/run")
    def run_lead_hunt_profile(hunt_id: str, request_http: Request, request: LeadHuntProfileRunRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        workspace_name = str(session.get("workspace_name", "")).strip()
        hunt = enterprise_get_lead_hunt_profile(
            enterprise_db_url,
            workspace_id=workspace_id,
            hunt_id=hunt_id,
        )
        if not hunt:
            raise HTTPException(status_code=404, detail="Lead hunt profile not found.")
        return _run_autonomous_lead_hunt(
            workspace_id=workspace_id,
            workspace_name=workspace_name,
            hunt_id=str(hunt.get("hunt_id", "")).strip(),
            query=str(hunt.get("query", "")).strip(),
            raw_text=str(hunt.get("raw_text", "")).strip(),
            keywords=[str(item).strip() for item in (hunt.get("keywords") or []) if str(item).strip()],
            sources=[str(item).strip() for item in (hunt.get("sources") or []) if str(item).strip()],
            limit=int(hunt.get("limit", 8) or 8),
            campaign_goal=str(hunt.get("campaign_goal", "")).strip() or "Book one discovery call.",
            export_workspace=bool(
                request.export_workspace
                if request.export_workspace is not None
                else hunt.get("export_workspace", True)
            ),
        )

    @app.post("/api/lead-hunts/run-active")
    def run_active_lead_hunts(request_http: Request, request: LeadHuntProfilesRunAllRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        workspace_name = str(session.get("workspace_name", "")).strip()
        hunts = enterprise_list_lead_hunt_profiles(
            enterprise_db_url,
            workspace_id=workspace_id,
            status="active",
            limit=100,
        )
        results: list[dict[str, Any]] = []
        total_saved = 0
        for hunt in hunts:
            result = _run_autonomous_lead_hunt(
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                hunt_id=str(hunt.get("hunt_id", "")).strip(),
                query=str(hunt.get("query", "")).strip(),
                raw_text=str(hunt.get("raw_text", "")).strip(),
                keywords=[str(item).strip() for item in (hunt.get("keywords") or []) if str(item).strip()],
                sources=[str(item).strip() for item in (hunt.get("sources") or []) if str(item).strip()],
                limit=int(hunt.get("limit", 8) or 8),
                campaign_goal=str(hunt.get("campaign_goal", "")).strip() or "Book one discovery call.",
                export_workspace=bool(
                    request.export_workspace
                    if request.export_workspace is not None
                    else hunt.get("export_workspace", True)
                ),
            )
            saved_count = int(result.get("saved_count", 0) or 0)
            total_saved += saved_count
            results.append(
                {
                    "hunt_id": str(hunt.get("hunt_id", "")).strip(),
                    "name": str(hunt.get("name", "")).strip(),
                    "saved_count": saved_count,
                    "provider": str(result.get("provider", "")).strip(),
                    "engine": str(result.get("engine", "")).strip(),
                    "summary": str(result.get("summary", "")).strip(),
                }
            )
        return {
            "status": "ready",
            "count": len(results),
            "saved_count": total_saved,
            "results": results,
            "rows": enterprise_list_lead_hunt_profiles(
                enterprise_db_url,
                workspace_id=workspace_id,
                limit=100,
            ),
        }

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

    @app.get("/api/decisions")
    def decision_entries(request: Request, status: str | None = None, owner: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_decision_entries(state_db, status=status, owner=owner, limit=limit)
        return {"status": "ready", "summary": load_decision_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/decisions")
    def create_decision_entry(request_http: Request, request: DecisionJournalRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_decision_entry(
            state_db,
            title=request.title.strip(),
            context=request.context.strip(),
            decision_text=request.decision_text.strip(),
            rationale=request.rationale.strip(),
            owner=request.owner.strip(),
            status=request.status.strip(),
            due=request.due.strip(),
            related_route=request.related_route.strip(),
        )
        return {
            "status": "ready",
            "message": "Decision saved.",
            "row": row,
            "rows": list_decision_entries(state_db, limit=50),
            "summary": load_decision_summary(state_db),
        }

    @app.get("/api/approvals")
    def approval_entries(request: Request, status: str | None = None, owner: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_approval_entries(state_db, status=status, owner=owner, limit=limit)
        return {"status": "ready", "summary": load_approval_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/approvals")
    def create_approval_entry(request_http: Request, request: ApprovalQueueRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_approval_entry(
            state_db,
            title=request.title.strip(),
            summary=request.summary.strip(),
            approval_gate=request.approval_gate.strip(),
            requested_by=request.requested_by.strip(),
            owner=request.owner.strip(),
            status=request.status.strip(),
            due=request.due.strip(),
            related_route=request.related_route.strip(),
            related_entity=request.related_entity.strip(),
            evidence_link=request.evidence_link.strip(),
            payload=request.payload,
        )
        return {
            "status": "ready",
            "message": "Approval saved.",
            "row": row,
            "rows": list_approval_entries(state_db, limit=50),
            "summary": load_approval_summary(state_db),
        }

    @app.post("/api/approvals/{approval_id}/status")
    def update_approval_status(request_http: Request, approval_id: str, request: ApprovalQueueUpdateRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = update_approval_entry(
            state_db,
            approval_id=approval_id,
            status=(request.status or "").strip() or None,
            owner=(request.owner or "").strip() or None,
            note=(request.note or "").strip() or None,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Approval not found.")
        return {
            "status": "ready",
            "message": "Approval updated.",
            "row": row,
            "rows": list_approval_entries(state_db, limit=50),
            "summary": load_approval_summary(state_db),
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

    @app.get("/api/exceptions")
    def exception_queue(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = _load_exception_rows(state_db, limit=limit)
        summary = {
            "total_items": len(rows),
            "by_source": {},
            "by_priority": {},
        }
        for row in rows:
            source_type = str(row.get("source_type", "unknown"))
            priority = str(row.get("priority", "unknown"))
            summary["by_source"][source_type] = int(summary["by_source"].get(source_type, 0)) + 1
            summary["by_priority"][priority] = int(summary["by_priority"].get(priority, 0)) + 1
        return {"status": "ready", "summary": summary, "count": len(rows), "rows": rows}

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
        session = _require_session(request)
        registry = _load_json(pilot_data / "input_center_registry.json")
        publish = _load_json(pilot_data / "platform_publish.json")
        templates = registry.get("templates", []) if isinstance(registry, dict) else []
        return {
            "status": "ready",
            "active_workspace": {
                "workspace_id": session.get("workspace_id", ""),
                "workspace_slug": session.get("workspace_slug", ""),
                "workspace_name": session.get("workspace_name", ""),
                "workspace_plan": session.get("workspace_plan", ""),
            },
            "app_workspaces": enterprise_list_user_workspaces(
                enterprise_db_url,
                username=str(session.get("username", "")),
            ),
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
        pipeline_result: dict[str, Any] | None = None
        if default_workspace_id:
            inbound_row = _build_public_inbound_opportunity(request)
            pipeline_result = enterprise_add_leads(
                enterprise_db_url,
                workspace_id=default_workspace_id,
                rows=[inbound_row],
                campaign_goal=request.goal.strip() or "Book one discovery call.",
                source="website_request",
            )
            for lead_id in [str(item).strip() for item in (pipeline_result.get("saved_lead_ids") or []) if str(item).strip()]:
                enterprise_add_lead_activity(
                    enterprise_db_url,
                    workspace_id=default_workspace_id,
                    lead_id=lead_id,
                    actor="Website",
                    activity_type="inbound_request",
                    channel="website",
                    direction="inbound",
                    message=f"Inbound request from {request.name.strip() or request.company.strip()}",
                    stage_after="offer_ready",
                    next_step="Review inbound request and send first response.",
                )
        return {
            "status": "ready",
            "message": "Submission saved.",
            "submission": row,
            "pipeline": {
                "saved_count": int((pipeline_result or {}).get("saved_count", 0) or 0),
                "summary": (pipeline_result or {}).get("summary", {}),
            },
        }

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
