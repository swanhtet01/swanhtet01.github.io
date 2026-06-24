from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from datetime import timedelta
from datetime import datetime
from datetime import timezone
from html import escape, unescape
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google.cloud import tasks_v2
from google.protobuf import timestamp_pb2
from pydantic import BaseModel, Field
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration


REPO_ROOT = Path(__file__).resolve().parent.parent
AGENT_WORKSPACE_RESOURCE_DIR = REPO_ROOT / "agent_os" / "resources"
AGENT_WORKSPACE_RESOURCE_PATHS = {
    "default": AGENT_WORKSPACE_RESOURCE_DIR / "supermega_core_agent_workspace.json",
    "ytf-plant-a": AGENT_WORKSPACE_RESOURCE_DIR / "yangon_tyre_agent_workspace.json",
}
WORKFORCE_RESOURCE_DIR = REPO_ROOT / "agent_os" / "workforce"
WORKFORCE_RESOURCE_PATHS = {
    "default": WORKFORCE_RESOURCE_DIR / "supermega_build_workforce.json",
    "ytf-plant-a": WORKFORCE_RESOURCE_DIR / "yangon_tyre_workforce.json",
}
CLOUD_TOPOLOGY_RESOURCE_PATH = REPO_ROOT / "agent_os" / "resources" / "supermega_cloud_topology.json"
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mark1_pilot.state_store import (  # noqa: E402
    add_action_items,
    add_attendance_event,
    add_capa_action,
    add_contact_submission,
    add_decision_entry,
    add_approval_entry,
    add_quality_incident,
    add_metric_entries,
    add_metric_entry,
    add_inventory_record,
    add_maintenance_record,
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
    list_maintenance_records,
    list_metric_entries,
    list_product_feedback,
    list_receiving_records,
    list_workspace_members,
    list_quality_incidents,
    list_supplier_risks,
    load_action_summary,
    load_agent_operating_model,
    load_agent_team_system_snapshot,
    load_agent_team_summary,
    load_decision_summary,
    load_approval_summary,
    load_inventory_summary,
    load_maintenance_summary,
    load_metric_summary,
    load_product_feedback_summary,
    load_receiving_summary,
    load_quality_summary,
    load_snapshot,
    load_supplier_risk_summary,
    load_workspace_member_summary,
    resolve_state_db,
    sync_state_from_output_dir,
    upsert_snapshot,
    update_contact_submission_handoff,
    update_approval_entry,
)
from mark1_pilot.enterprise_store import (  # noqa: E402
    add_audit_event as enterprise_add_audit_event,
    add_connector_event as enterprise_add_connector_event,
    add_lead_activity as enterprise_add_lead_activity,
    add_leads as enterprise_add_leads,
    add_leads_with_tasks as enterprise_add_leads_with_tasks,
    claim_agent_runs as enterprise_claim_agent_runs,
    complete_agent_run as enterprise_complete_agent_run,
    create_agent_run as enterprise_create_agent_run,
    add_workspace_tasks as enterprise_add_workspace_tasks,
    authenticate_user as enterprise_authenticate_user,
    bootstrap_workspace_leads,
    create_session as enterprise_create_session,
    ensure_workspace as enterprise_ensure_workspace,
    ensure_workspace_domains as enterprise_ensure_workspace_domains,
    ensure_workspace_profile as enterprise_ensure_workspace_profile,
    ensure_user as enterprise_ensure_user,
    get_lead as enterprise_get_lead,
    get_lead_hunt_profile as enterprise_get_lead_hunt_profile,
    get_session as enterprise_get_session,
    get_workspace_profile as enterprise_get_workspace_profile,
    get_workspace_domain_by_hostname as enterprise_get_workspace_domain_by_hostname,
    invite_workspace_member as enterprise_invite_workspace_member,
    list_agent_runs as enterprise_list_agent_runs,
    list_audit_events as enterprise_list_audit_events,
    list_connector_events as enterprise_list_connector_events,
    list_lead_activities as enterprise_list_lead_activities,
    list_lead_hunt_profiles as enterprise_list_lead_hunt_profiles,
    list_leads as enterprise_list_leads,
    list_module_definitions as enterprise_list_module_definitions,
    list_user_workspaces as enterprise_list_user_workspaces,
    list_workspace_domains as enterprise_list_workspace_domains,
    list_workspace_modules as enterprise_list_workspace_modules,
    list_workspace_members as enterprise_list_workspace_members,
    list_workspace_tasks as enterprise_list_workspace_tasks,
    load_lead_summary as enterprise_load_lead_summary,
    remove_workspace_task as enterprise_remove_workspace_task,
    resolve_database_url as resolve_enterprise_database_url,
    revoke_session as enterprise_revoke_session,
    save_lead_hunt_profile as enterprise_save_lead_hunt_profile,
    record_lead_hunt_run as enterprise_record_lead_hunt_run,
    start_agent_run as enterprise_start_agent_run,
    update_lead as enterprise_update_lead,
    update_workspace_domain as enterprise_update_workspace_domain,
    update_workspace_module as enterprise_update_workspace_module,
    update_workspace_profile as enterprise_update_workspace_profile,
    update_workspace_task as enterprise_update_workspace_task,
)
from mark1_pilot.lead_finder import run_lead_finder  # noqa: E402
from mark1_pilot.lead_to_pilot import build_lead_to_pilot_pack  # noqa: E402
from mark1_pilot.document_intake import analyze_document  # noqa: E402
from mark1_pilot.metric_intake import extract_metric_candidates, summarize_metric_rows  # noqa: E402
from mark1_pilot.solution_architect import build_solution_blueprint  # noqa: E402
from mark1_pilot.anthropic_provider import AnthropicProvider  # noqa: E402
from mark1_pilot.openai_provider import OpenAIProvider  # noqa: E402
from mark1_pilot.config import _path_from_config  # noqa: E402
from mark1_pilot.coverage import load_data_coverage_summary  # noqa: E402
from mark1_pilot.connectors.github import FAILING_RUN_CONCLUSIONS, GitHubRepoProbe  # noqa: E402
from mark1_pilot.connectors.gmail import GmailProbe  # noqa: E402
from mark1_pilot.connectors.google_drive import GoogleDriveProbe  # noqa: E402
from mark1_pilot.inventory import scan_local_root  # noqa: E402
from tools.check_supermega_domain import run_checks as run_domain_checks  # noqa: E402


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
    requested_package: str = ""
    data: str = ""
    team: str = ""
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


class QualityIncidentRequest(BaseModel):
    status: str = "open"
    severity: str = "medium"
    owner: str = "Quality Team"
    supplier: str = "Internal"
    title: str
    summary: str = ""
    source_type: str = "manual_entry"
    reported_at: str = ""
    target_close_date: str = ""
    evidence_link: str = ""


class QualityCapaRequest(BaseModel):
    incident_id: str
    status: str = "open"
    owner: str = "Quality Team"
    action_title: str
    verification_criteria: str = ""
    target_date: str = ""


class MaintenanceRecordRequest(BaseModel):
    logged_at: str = ""
    asset_name: str
    issue_type: str = "breakdown"
    priority: str = "medium"
    status: str = "open"
    owner: str = "Maintenance Team"
    downtime_minutes: str = ""
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


class SolutionArchitectLaunchRequest(SolutionArchitectRequest):
    create_tasks: bool = True


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
    source: str = "workbench"
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


class WorkforceAutomationRequest(BaseModel):
    apply_assignments: bool = True
    seed_review_cycles: bool = True
    queue_default_jobs: bool = False
    process_queue: bool = False
    limit: int = Field(default=8, ge=1, le=20)
    source: str = "workforce_command"


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
    enqueue_only: bool = False


class AgentBatchRunRequest(BaseModel):
    job_types: list[str] = Field(default_factory=list)
    source: str = "scheduler"
    enqueue_only: bool = False
    process_limit: int = Field(default=10, ge=1, le=50)


class AgentQueueProcessRequest(BaseModel):
    job_types: list[str] = Field(default_factory=list)
    source: str = "worker"
    limit: int = Field(default=8, ge=1, le=50)


class AgentRunDefaultsRequest(BaseModel):
    workspace_slug: str = ""
    source: str = "scheduler"
    job_types: list[str] = Field(default_factory=list)
    enqueue_only: bool = False


class LeadHuntProfileRequest(BaseModel):
    name: str
    query: str = ""
    raw_text: str = ""
    keywords: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=lambda: ["maps", "web"])
    limit: int = Field(default=8, ge=1, le=20)
    campaign_goal: str = ""
    export_workspace: bool = True
    owner: str = "Revenue Pod"
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
    package_name: str = ""
    first_team: str = ""
    current_systems: list[str] = Field(default_factory=list)


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


class TeamMemberInviteRequest(BaseModel):
    email: str
    name: str = ""
    role: str = "member"
    password: str = ""


class WorkspaceModuleUpdateRequest(BaseModel):
    status: str
    config: dict[str, Any] = Field(default_factory=dict)


class WorkspaceDomainUpdateRequest(BaseModel):
    hostname: str = ""
    scope: str = ""
    provider: str = ""
    runtime_target: str = ""
    desired_state: str = ""
    route_root: str = ""
    notes: str = ""
    deployment_url: str = ""
    config: dict[str, Any] = Field(default_factory=dict)


class WorkspaceDomainVerifyRequest(BaseModel):
    routes: list[str] = Field(default_factory=list)


class WorkspaceProfileUpdateRequest(BaseModel):
    company: str = ""
    preferred_package: str = ""
    first_team: str = ""
    systems: list[str] = Field(default_factory=list)
    goal: str = ""
    onboarding_status: str = ""
    config: dict[str, Any] = Field(default_factory=dict)


class CloudPreviewDeployRequest(BaseModel):
    mode: str = "claimable_preview"


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


def _derive_onboarding_status(*, preferred_package: str = "", first_team: str = "", systems: list[str] | None = None, goal: str = "") -> str:
    system_count = len([str(item).strip() for item in (systems or []) if str(item).strip()])
    if str(preferred_package or "").strip() and str(first_team or "").strip() and system_count > 0 and str(goal or "").strip():
        return "ready_to_launch"
    if str(preferred_package or "").strip() or str(first_team or "").strip() or system_count > 0 or str(goal or "").strip():
        return "in_progress"
    return "draft"


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
        "job_type": "template_clerk",
        "name": "Template Clerk",
        "cadence": "hourly",
        "description": "Turn inbound requests into rollout-ready follow-up tasks and pack recommendations.",
    },
    {
        "job_type": "ops_watch",
        "name": "Ops Watch",
        "cadence": "15m",
        "description": "Watch agent runtime health, stale loops, and execution pressure.",
    },
    {
        "job_type": "founder_brief",
        "name": "Founder Brief",
        "cadence": "daily",
        "description": "Produce a compact operating brief from leads, tasks, approvals, and ops queues.",
    },
    {
        "job_type": "github_release_watch",
        "name": "GitHub Release Watch",
        "cadence": "hourly",
        "description": "Watch repository health, workflow runs, and release-lane risks from the GitHub build surface.",
    },
)

CONNECTOR_EVENT_DIRECTORY: dict[str, dict[str, str]] = {
    "ytf-sales-gmail": {
        "connector_name": "YTF Sales Gmail Threads",
        "tenant": "yangon-tyre",
        "route": "/app/revenue",
    },
    "ytf-procurement-gmail": {
        "connector_name": "YTF Procurement Gmail Threads",
        "tenant": "yangon-tyre",
        "route": "/app/approvals",
    },
    "ytf-drive-quality": {
        "connector_name": "YTF Google Drive Quality Vault",
        "tenant": "yangon-tyre",
        "route": "/app/connectors",
    },
    "ytf-erp-export": {
        "connector_name": "YTF ERP and Export Bridge",
        "tenant": "yangon-tyre",
        "route": "/app/operations",
    },
    "ytf-markdown-vault": {
        "connector_name": "YTF Markdown Decision Vault",
        "tenant": "yangon-tyre",
        "route": "/app/director",
    },
    "ytf-shopfloor-entry": {
        "connector_name": "YTF Shopfloor and Manager Writeback",
        "tenant": "yangon-tyre",
        "route": "/app/adoption-command",
    },
    "core-github-build": {
        "connector_name": "SuperMega Build GitHub Feed",
        "tenant": "core",
        "route": "/app/teams",
    },
}

AGENT_JOB_CONNECTOR_MAP: dict[str, dict[str, str]] = {
    "revenue_scout": {
        "connector_id": "ytf-sales-gmail",
        "source": "Agent runtime",
        "route": "/app/revenue",
    },
    "founder_brief": {
        "connector_id": "ytf-markdown-vault",
        "source": "Agent runtime",
        "route": "/app/director",
    },
    "ops_watch": {
        "connector_id": "ytf-shopfloor-entry",
        "source": "Agent runtime",
        "route": "/app/adoption-command",
    },
    "task_triage": {
        "connector_id": "ytf-shopfloor-entry",
        "source": "Agent runtime",
        "route": "/app/adoption-command",
    },
    "github_release_watch": {
        "connector_id": "core-github-build",
        "source": "GitHub runtime",
        "route": "/app/teams",
    },
}

AGENT_TEAM_RUNTIME_JOB_MAP: dict[str, tuple[str, ...]] = {
    "command_office": ("founder_brief",),
    "control_tower": ("task_triage", "ops_watch"),
    "client_delivery": ("template_clerk",),
    "growth_studio": ("revenue_scout", "list_clerk"),
    "platform_engineering": ("ops_watch", "github_release_watch"),
}


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


def _emit_connector_event(
    *,
    enterprise_db_url: str,
    workspace_id: str,
    actor: str,
    connector_id: str,
    title: str,
    detail: str = "",
    source: str = "",
    kind: str = "",
    route: str = "",
    severity: str = "info",
    entity_type: str = "",
    entity_id: str = "",
    payload: dict[str, Any] | None = None,
    created_at: str = "",
) -> dict[str, Any] | None:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_connector_id = str(connector_id or "").strip()
    normalized_title = str(title or "").strip()
    if not normalized_workspace_id or not normalized_connector_id or not normalized_title:
        return None
    metadata = CONNECTOR_EVENT_DIRECTORY.get(normalized_connector_id, {})
    return enterprise_add_connector_event(
        enterprise_db_url,
        workspace_id=normalized_workspace_id,
        connector_id=normalized_connector_id,
        connector_name=str(metadata.get("connector_name", "")).strip(),
        tenant=str(metadata.get("tenant", "")).strip(),
        source=str(source or "").strip(),
        kind=str(kind or "").strip() or "event",
        title=normalized_title,
        detail=str(detail or "").strip(),
        route=str(route or "").strip() or str(metadata.get("route", "")).strip(),
        severity=str(severity or "").strip() or "info",
        actor=str(actor or "").strip() or "system",
        entity_type=str(entity_type or "").strip(),
        entity_id=str(entity_id or "").strip(),
        payload=payload,
        created_at=str(created_at or "").strip(),
    )


def _record_audit_and_connector_event(
    *,
    enterprise_db_url: str,
    workspace_id: str,
    actor: str,
    event_type: str,
    summary: str,
    detail: str = "",
    entity_type: str = "",
    entity_id: str = "",
    severity: str = "info",
    connector_id: str = "",
    source: str = "",
    kind: str = "",
    route: str = "",
    payload: dict[str, Any] | None = None,
    connector_title: str = "",
    created_at: str = "",
) -> dict[str, Any]:
    normalized_payload = dict(payload or {})
    normalized_connector_id = str(connector_id or normalized_payload.get("connector_id", "")).strip()
    normalized_source = str(source or normalized_payload.get("source", "")).strip()
    normalized_kind = str(kind or normalized_payload.get("event_kind", "")).strip()
    normalized_route = str(route or normalized_payload.get("route", "")).strip()

    connector_row = None
    if normalized_connector_id:
        normalized_payload.setdefault("connector_id", normalized_connector_id)
        if normalized_source:
            normalized_payload.setdefault("source", normalized_source)
        if normalized_kind:
            normalized_payload.setdefault("event_kind", normalized_kind)
        if normalized_route:
            normalized_payload.setdefault("route", normalized_route)
        connector_row = _emit_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            actor=actor,
            connector_id=normalized_connector_id,
            title=str(connector_title or summary).strip() or str(summary).strip(),
            detail=detail,
            source=normalized_source,
            kind=normalized_kind or str(event_type or "").strip(),
            route=normalized_route,
            severity=severity,
            entity_type=entity_type,
            entity_id=entity_id,
            payload=normalized_payload,
            created_at=created_at,
        )
        if connector_row:
            normalized_payload["connector_event_id"] = str(connector_row.get("event_id", "")).strip()

    audit_row = enterprise_add_audit_event(
        enterprise_db_url,
        workspace_id=workspace_id,
        actor=actor,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        severity=severity,
        summary=summary,
        detail=detail,
        payload=normalized_payload,
    )
    return {
        "audit_event": audit_row,
        "connector_event": connector_row,
    }


def _parse_iso_datetime(value: str) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        normalized = raw[:-1] + "+00:00" if raw.endswith("Z") else raw
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _runtime_run_timestamp(row: dict[str, Any] | None) -> str:
    if not isinstance(row, dict):
        return ""
    for key in ("finished_at", "updated_at", "started_at", "created_at"):
        value = str(row.get(key, "")).strip()
        if value:
            return value
    return ""


def _cadence_threshold_hours(cadence: str) -> int:
    normalized = str(cadence or "").strip().lower()
    if normalized == "15m":
        return 1
    if normalized == "hourly":
        return 4
    if normalized == "daily":
        return 30
    return 24


def _latest_runtime_timestamp(values: list[str]) -> str:
    latest_value = ""
    latest_parsed: datetime | None = None
    for value in values:
        parsed = _parse_iso_datetime(value)
        if parsed is None:
            continue
        if latest_parsed is None or parsed > latest_parsed:
            latest_parsed = parsed
            latest_value = value
    return latest_value


def _team_runtime_lane(team_id: str, scaling_tier: str, workspace: str) -> str:
    normalized_team = str(team_id or "").strip().lower()
    normalized_workspace = str(workspace or "").strip().lower()
    normalized_tier = str(scaling_tier or "").strip().lower()
    if normalized_team == "command_office":
        return "Executive control plane"
    if normalized_team == "control_tower":
        return "Operator workflow plane"
    if normalized_team == "platform_engineering" or "runtime" in normalized_workspace or "connectors" in normalized_workspace:
        return "Runtime and connector plane"
    if normalized_team == "rd_lab":
        return "Foundry plane"
    if normalized_team == "growth_studio" or "growth" in normalized_workspace:
        return "Revenue plane"
    if normalized_team == "client_delivery" or normalized_tier == "per_client_pod":
        return "Tenant launch plane"
    if "knowledge" in normalized_workspace:
        return "Knowledge plane"
    return "Operator plane"


def _team_guardrail_posture(tool_modes: set[str], write_policy: str, approval_gates: list[str]) -> str:
    normalized_modes = {str(item or "").strip().lower() for item in tool_modes if str(item or "").strip()}
    if "admin" in normalized_modes or "write" in normalized_modes or write_policy.strip() or approval_gates:
        return "Review-gated writes"
    if "draft" in normalized_modes:
        return "Draft-only"
    if "review" in normalized_modes:
        return "Read and review"
    return "Read-only"


def _team_execution_mode(job_types: list[str], latest_runs_by_type: dict[str, dict[str, Any]], scaling_tier: str) -> str:
    if job_types:
        rows = [latest_runs_by_type.get(job_type, {}) for job_type in job_types]
        has_live_run = any(_runtime_run_timestamp(row) for row in rows if isinstance(row, dict))
        if has_live_run:
            return "Scheduler-backed with manual recovery"
        return "Scheduled lane defined; waiting for live runs"
    if str(scaling_tier or "").strip().lower() == "per_client_pod":
        return "Provisioned per tenant with operator review"
    return "Playbook-governed manual lane"


def _viewer_has_any_capability(viewer_capabilities: list[str], required_capabilities: list[str]) -> bool:
    allowed = {str(item).strip() for item in viewer_capabilities if str(item).strip()}
    required = {str(item).strip() for item in required_capabilities if str(item).strip()}
    if not allowed or not required:
        return False
    return any(capability in allowed for capability in required)


def _build_agent_runtime_contract(
    *,
    manifest: dict[str, Any] | None,
    teams: list[dict[str, Any]],
    latest_runs_by_type: dict[str, dict[str, Any]],
    viewer_contract: dict[str, Any] | None = None,
) -> dict[str, Any]:
    manifest_dict = manifest if isinstance(manifest, dict) else {}
    tool_lookup = {
        str(item.get("id", "")).strip(): item
        for item in manifest_dict.get("tools", [])
        if isinstance(item, dict) and str(item.get("id", "")).strip()
    }
    playbooks_by_team = {
        str(item.get("teamId", "")).strip(): item
        for item in manifest_dict.get("playbooks", [])
        if isinstance(item, dict) and str(item.get("teamId", "")).strip()
    }

    approval_gates_seen: set[str] = set()
    workspace_seen: set[str] = set()
    connector_enabled_team_count = 0
    scheduler_backed_team_count = 0
    guarded_team_count = 0
    viewer_dict = viewer_contract if isinstance(viewer_contract, dict) else {}
    viewer_capabilities = [str(item).strip() for item in viewer_dict.get("capabilities", []) if str(item).strip()]
    crews: list[dict[str, Any]] = []

    for team in teams:
        team_id = str(team.get("team_id", "")).strip()
        playbook = playbooks_by_team.get(team_id, {})
        tool_rows = [item for item in playbook.get("tools", []) if isinstance(item, dict)] if isinstance(playbook, dict) else []
        tool_modes = {str(item.get("mode", "")).strip() for item in tool_rows if str(item.get("mode", "")).strip()}
        tool_scopes: list[str] = []
        connector_tool_count = 0
        for item in tool_rows:
            tool_id = str(item.get("toolId", "")).strip()
            tool = tool_lookup.get(tool_id, {})
            tool_name = str(tool.get("name", "")).strip() or tool_id or "Tool"
            tool_category = str(tool.get("category", "")).strip()
            if tool_category == "Connector":
                connector_tool_count += 1
            scope = str(item.get("scope", "")).strip()
            tool_scopes.append(f"{tool_name}: {scope}" if scope else tool_name)
        if connector_tool_count:
            connector_enabled_team_count += 1

        approval_gates = sorted(
            {
                str(item.get("approval_gate", "")).strip()
                for item in team.get("agents", [])
                if isinstance(item, dict) and str(item.get("approval_gate", "")).strip()
            }
        )
        approval_gates_seen.update(approval_gates)

        workspace = str(playbook.get("workspace", "")).strip() if isinstance(playbook, dict) else ""
        if workspace:
            workspace_seen.add(workspace)

        job_types = list(AGENT_TEAM_RUNTIME_JOB_MAP.get(team_id, ()))
        if job_types:
            scheduler_backed_team_count += 1
        latest_rows = [latest_runs_by_type.get(job_type, {}) for job_type in job_types]
        last_run_at = _latest_runtime_timestamp([_runtime_run_timestamp(row) for row in latest_rows if isinstance(row, dict)])
        latest_row = max(
            (row for row in latest_rows if isinstance(row, dict) and _runtime_run_timestamp(row)),
            key=lambda row: _parse_iso_datetime(_runtime_run_timestamp(row)) or datetime.min.replace(tzinfo=timezone.utc),
            default={},
        )
        write_policy = str(playbook.get("writePolicy", "")).strip() if isinstance(playbook, dict) else ""
        guardrail_posture = _team_guardrail_posture(tool_modes, write_policy, approval_gates)
        if guardrail_posture != "Read-only":
            guarded_team_count += 1
        runtime_lane = _team_runtime_lane(
            team_id,
            str(team.get("scaling_tier", "")).strip(),
            workspace,
        )
        required_capabilities = ["agent_ops.view"]
        if runtime_lane == "Executive control plane":
            required_capabilities = ["director.view", "agent_ops.view"]
        elif runtime_lane == "Tenant launch plane":
            required_capabilities = ["architect.view", "tenant_admin.view", "agent_ops.view"]
        elif runtime_lane == "Runtime and connector plane":
            required_capabilities = ["tenant_admin.view", "platform_admin.view", "agent_ops.view"]
        viewer_can_view = _viewer_has_any_capability(viewer_capabilities, required_capabilities)
        viewer_can_run = bool(viewer_dict.get("can_run_jobs", False))
        viewer_can_approve = bool(viewer_dict.get("can_approve_guardrails", False))
        viewer_can_take_over = bool(viewer_dict.get("can_manage_runtime", False))

        crews.append(
            {
                "team_id": team_id,
                "name": str(team.get("name", "")).strip() or team_id or "Crew",
                "scaling_tier": str(team.get("scaling_tier", "")).strip(),
                "workspace": workspace,
                "runtime_lane": runtime_lane,
                "execution_mode": _team_execution_mode(job_types, latest_runs_by_type, str(team.get("scaling_tier", "")).strip()),
                "tool_count": len(tool_rows),
                "connector_tool_count": connector_tool_count,
                "tool_modes": sorted(tool_modes),
                "tool_scopes": tool_scopes[:4],
                "approval_gates": approval_gates[:4],
                "required_capabilities": required_capabilities,
                "write_policy": write_policy or "Human review before external or high-risk writes.",
                "guardrail_posture": guardrail_posture,
                "job_types": job_types,
                "last_run_at": last_run_at,
                "last_run_status": str(latest_row.get("status", "")).strip() or ("Configured" if job_types else "Manual"),
                "current_user_can_view": viewer_can_view,
                "current_user_can_run": viewer_can_run,
                "current_user_can_approve": viewer_can_approve,
                "current_user_can_take_over": viewer_can_take_over,
            }
        )

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "viewer": viewer_dict,
        "summary": {
            "workspace_count": len(workspace_seen),
            "scheduler_backed_team_count": scheduler_backed_team_count,
            "connector_enabled_team_count": connector_enabled_team_count,
            "approval_gate_count": len(approval_gates_seen),
            "guarded_team_count": guarded_team_count,
        },
        "crews": crews,
    }


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
    job_defaults = AGENT_JOB_CONNECTOR_MAP.get(str(job_type or "").strip(), {})
    job_label = next(
        (str(item.get("name", "")).strip() for item in AGENT_JOB_TEMPLATES if str(item.get("job_type", "")).strip() == str(job_type or "").strip()),
        str(job_type or "").replace("_", " ").title() or "Agent job",
    )
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
        completed = enterprise_complete_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
            status="ready",
            summary=str(result.get("summary", "")).strip(),
            result=result,
        ) or row
        if job_defaults:
            _emit_connector_event(
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                actor=triggered_by,
                connector_id=str(job_defaults.get("connector_id", "")).strip(),
                title=str(completed.get("summary", "")).strip() or f"{job_label} completed.",
                detail=f"Run {run_id or 'unknown'} completed via {str(source or '').strip() or 'manual'}.",
                source=str(job_defaults.get("source", "")).strip() or "Agent runtime",
                kind=str(job_type or "").strip() or "agent_run",
                route=str(job_defaults.get("route", "")).strip(),
                severity="info",
                entity_type="agent_run",
                entity_id=run_id,
                payload={
                    "job_type": job_type,
                    "status": str(completed.get("status", "")).strip() or "ready",
                    "source": str(source or "").strip() or "manual",
                    "result": completed.get("result", {}),
                },
                created_at=_runtime_run_timestamp(completed),
            )
        return completed
    except Exception as exc:
        failed = enterprise_complete_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
            status="error",
            summary=f"{job_type} failed",
            result={"job_type": job_type},
            error_text=str(exc),
        ) or row
        if job_defaults:
            _emit_connector_event(
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                actor=triggered_by,
                connector_id=str(job_defaults.get("connector_id", "")).strip(),
                title=f"{job_label} failed.",
                detail=str(exc),
                source=str(job_defaults.get("source", "")).strip() or "Agent runtime",
                kind=str(job_type or "").strip() or "agent_run",
                route=str(job_defaults.get("route", "")).strip(),
                severity="warning",
                entity_type="agent_run",
                entity_id=run_id,
                payload={
                    "job_type": job_type,
                    "status": str(failed.get("status", "")).strip() or "error",
                    "source": str(source or "").strip() or "manual",
                    "error_text": str(exc),
                },
                created_at=_runtime_run_timestamp(failed),
            )
        return failed


def _complete_existing_agent_run(
    *,
    state_db: str,
    enterprise_db_url: str,
    workspace_id: str,
    run_id: str,
    job_type: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    job_defaults = AGENT_JOB_CONNECTOR_MAP.get(str(job_type or "").strip(), {})
    triggered_by = "worker"
    try:
        result = _execute_agent_job(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            job_type=job_type,
            payload=payload,
        )
        completed = enterprise_complete_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
            status="ready",
            summary=str(result.get("summary", "")).strip(),
            result=result,
        ) or {"run_id": run_id, "job_type": job_type, "status": "ready"}
        if job_defaults:
            _emit_connector_event(
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                actor=triggered_by,
                connector_id=str(job_defaults.get("connector_id", "")).strip(),
                title=str(completed.get("summary", "")).strip() or f"{str(job_type or '').replace('_', ' ').title() or 'Agent job'} completed.",
                detail=f"Queued run {run_id or 'unknown'} completed by worker.",
                source=str(job_defaults.get("source", "")).strip() or "Agent runtime",
                kind=str(job_type or "").strip() or "agent_run",
                route=str(job_defaults.get("route", "")).strip(),
                severity="info",
                entity_type="agent_run",
                entity_id=run_id,
                payload={
                    "job_type": job_type,
                    "status": str(completed.get("status", "")).strip() or "ready",
                    "mode": "queued",
                },
                created_at=_runtime_run_timestamp(completed),
            )
        return completed
    except Exception as exc:
        failed = enterprise_complete_agent_run(
            enterprise_db_url,
            workspace_id=workspace_id,
            run_id=run_id,
            status="error",
            summary=f"{job_type} failed",
            result={"job_type": job_type},
            error_text=str(exc),
        ) or {"run_id": run_id, "job_type": job_type, "status": "error", "error_text": str(exc)}
        if job_defaults:
            _emit_connector_event(
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                actor=triggered_by,
                connector_id=str(job_defaults.get("connector_id", "")).strip(),
                title=f"{str(job_type or '').replace('_', ' ').title() or 'Agent job'} failed.",
                detail=str(exc),
                source=str(job_defaults.get("source", "")).strip() or "Agent runtime",
                kind=str(job_type or "").strip() or "agent_run",
                route=str(job_defaults.get("route", "")).strip(),
                severity="warning",
                entity_type="agent_run",
                entity_id=run_id,
                payload={
                    "job_type": job_type,
                    "status": str(failed.get("status", "")).strip() or "error",
                    "mode": "queued",
                    "error_text": str(exc),
                },
                created_at=_runtime_run_timestamp(failed),
            )
        return failed


def _agent_jobs_payload(
    *,
    enterprise_db_url: str,
    workspace_id: str,
    rows: list[dict[str, Any]],
    status: str = "ready",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    latest_runs = enterprise_list_agent_runs(
        enterprise_db_url,
        workspace_id=workspace_id,
        limit=50,
    )
    latest_by_type = _group_agent_runs_by_job_type(latest_runs)
    payload: dict[str, Any] = {
        "status": status,
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
    if extra:
        payload.update(extra)
    return payload


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


def _build_template_clerk_result(*, state_db: str, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    submissions = list_contact_submissions(state_db, limit=25)
    recent = [
        item
        for item in submissions
        if str(item.get("status", "")).strip() != "routed"
        and not str(item.get("task_id", "")).strip()
    ][:10]
    rows: list[dict[str, Any]] = []
    for item in recent:
        company = str(item.get("company", "")).strip() or str(item.get("name", "")).strip() or "Inbound request"
        email = str(item.get("email", "")).strip()
        workflow = str(item.get("workflow", "")).strip()
        requested_package = str(item.get("requested_package", "")).strip()
        goal = str(item.get("goal", "")).strip()
        data_summary = str(item.get("data_summary", "")).strip()
        notes = "\n".join(
            part
            for part in [
                f"Company: {company}",
                f"Email: {email}" if email else "",
                f"Requested package: {requested_package}" if requested_package else "",
                f"Workflow: {workflow}" if workflow else "",
                f"Team and systems: {data_summary}" if data_summary else "",
                f"Goal: {goal}" if goal else "",
            ]
            if part
        )
        rows.append(
            {
                "title": f"Review inbound request: {company}",
                "owner": "Revenue Pod",
                "priority": "High",
                "due": "Today",
                "status": "open",
                "notes": notes,
                "template": "inbound_contact_request",
            }
        )

    saved = enterprise_add_workspace_tasks(
        enterprise_db_url,
        workspace_id=workspace_id,
        rows=rows,
    ) if rows else {"saved_count": 0, "saved_task_ids": []}

    top_requests = [
        {
            "company": str(item.get("company", "")).strip() or str(item.get("name", "")).strip(),
            "goal": str(item.get("goal", "")).strip(),
            "workflow": str(item.get("workflow", "")).strip(),
            "requested_package": str(item.get("requested_package", "")).strip(),
        }
        for item in recent[:5]
    ]
    summary = (
        f"{len(recent)} inbound requests checked, "
        f"{int(saved.get('saved_count', 0) or 0)} rollout follow-up tasks saved."
    )
    return {
        "job_type": "template_clerk",
        "summary": summary,
        "metrics": {
            "inbound_request_count": len(recent),
            "saved_follow_up_count": int(saved.get("saved_count", 0) or 0),
        },
        "top_requests": top_requests,
        "next_actions": [
            "Reply to the newest inbound request first.",
            "Map each inbound request to one starter pack only.",
            "Keep rollout scoping inside the shared queue instead of email only.",
        ],
    }


def _build_ops_watch_result(*, state_db: str, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    latest_runs = enterprise_list_agent_runs(
        enterprise_db_url,
        workspace_id=workspace_id,
        limit=80,
    )
    latest_by_type = _group_agent_runs_by_job_type(latest_runs)
    now = datetime.now().astimezone()
    stale_jobs: list[str] = []
    errored_jobs: list[str] = []

    for template in AGENT_JOB_TEMPLATES:
        job_type = str(template.get("job_type", "")).strip()
        row = latest_by_type.get(job_type, {})
        status = str(row.get("status", "")).strip().lower()
        if status == "error":
            errored_jobs.append(job_type)
        completed_at = _parse_iso_datetime(str(row.get("completed_at", "")).strip() or str(row.get("created_at", "")).strip())
        threshold_hours = _cadence_threshold_hours(str(template.get("cadence", "")).strip())
        if not completed_at or (now - completed_at).total_seconds() > threshold_hours * 3600:
            stale_jobs.append(job_type)

    approvals = load_approval_summary(state_db)
    pending_approvals = int(approvals.get("pending_count", 0) or 0)
    open_tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=500)
    open_count = sum(1 for row in open_tasks if str(row.get("status", "")).strip().lower() != "done")

    notes: list[str] = []
    if stale_jobs:
        notes.append(f"Stale loops: {', '.join(stale_jobs)}")
    if errored_jobs:
        notes.append(f"Errored loops: {', '.join(errored_jobs)}")
    if pending_approvals:
        notes.append(f"Pending approvals: {pending_approvals}")
    if open_count > 30:
        notes.append(f"Open task pressure: {open_count}")

    saved = {"saved_count": 0}
    if notes:
        saved = enterprise_add_workspace_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            rows=[
                {
                    "title": "Review agent runtime health",
                    "owner": "Founder Desk",
                    "priority": "High",
                    "due": "Today",
                    "status": "open",
                    "notes": " | ".join(notes),
                    "template": "ops_watch",
                }
            ],
        )

    if not notes:
        summary = "Agent runtime is healthy. Core loops are running on cadence."
    else:
        summary = "Agent runtime needs attention. " + " ".join(notes)

    return {
        "job_type": "ops_watch",
        "summary": summary,
        "metrics": {
            "stale_job_count": len(stale_jobs),
            "error_job_count": len(errored_jobs),
            "pending_approval_count": pending_approvals,
            "open_task_count": open_count,
            "saved_watch_task_count": int(saved.get("saved_count", 0) or 0),
        },
        "stale_jobs": stale_jobs,
        "errored_jobs": errored_jobs,
        "next_actions": [
            "Keep runtime drift visible before it becomes a delivery problem.",
            "Review stale or failed loops first.",
            "Do not add more automation until the queue is under control.",
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


def _build_github_release_watch_result(*, enterprise_db_url: str, workspace_id: str) -> dict[str, Any]:
    probe = _github_probe_for_repo(REPO_ROOT).probe()
    repo_slug = str(probe.get("repo", "")).strip() or "unknown repo"
    branch = str(probe.get("branch", "")).strip() or "unknown"
    status = str(probe.get("status", "")).strip().lower()
    message = str(probe.get("message", "")).strip()
    latest_run = probe.get("latest_workflow_run", {}) if isinstance(probe.get("latest_workflow_run", {}), dict) else {}
    latest_run_name = str(latest_run.get("name", "")).strip() or "Latest workflow"
    latest_run_status = str(latest_run.get("status", "")).strip() or "unknown"
    latest_run_conclusion = str(latest_run.get("conclusion", "")).strip().lower()
    latest_run_updated_at = str(latest_run.get("updated_at", "")).strip()
    failing_run_count = int(probe.get("failing_workflow_run_count", 0) or 0)
    is_dirty = bool(probe.get("is_dirty", False))
    remote_credential_embedded = bool(probe.get("remote_credential_embedded", False))
    open_issues_count = int(probe.get("open_issues_count", 0) or 0)

    next_actions: list[str] = []
    risk_notes: list[str] = []
    if latest_run_conclusion in FAILING_RUN_CONCLUSIONS:
        risk_notes.append(f"{latest_run_name} finished with {latest_run_conclusion}.")
        next_actions.append("Review the latest failed workflow run before the next release decision.")
    if remote_credential_embedded:
        risk_notes.append("Origin remote contains embedded credentials and should be rotated into secret storage.")
        next_actions.append("Remove embedded remote credentials and move GitHub auth into environment or secret storage.")
    if is_dirty:
        risk_notes.append("Local build workspace has uncommitted changes.")
        next_actions.append("Review local uncommitted changes before using this lane as release truth.")
    if failing_run_count > 1:
        risk_notes.append(f"{failing_run_count} sampled workflow runs ended in failure states.")
    if not next_actions:
        next_actions = [
            "Keep release and workflow state tied to product operations instead of static portfolio notes.",
            "Use GitHub workflow results as first-class promotion evidence for the build lane.",
            "Keep repo health and release readiness visible from the same runtime desk.",
        ]

    existing_tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=200)
    has_open_review_task = any(
        str(row.get("template", "")).strip() == "github_release_watch"
        and str(row.get("status", "")).strip().lower() != "done"
        for row in existing_tasks
    )
    saved = {"saved_count": 0}
    if risk_notes and not has_open_review_task:
        saved = enterprise_add_workspace_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            rows=[
                {
                    "title": "Review GitHub release lane",
                    "owner": "Module Factory",
                    "priority": "High" if latest_run_conclusion in FAILING_RUN_CONCLUSIONS or remote_credential_embedded else "Medium",
                    "due": "Today",
                    "status": "open",
                    "notes": " | ".join(
                        part
                        for part in [
                            f"Repo: {repo_slug}",
                            f"Branch: {branch}",
                            f"Probe: {message}" if message else "",
                            f"Workflow: {latest_run_name} / {latest_run_status} / {latest_run_conclusion or 'no conclusion'}",
                            *risk_notes,
                        ]
                        if part
                    ),
                    "template": "github_release_watch",
                }
            ],
        )

    if status == "ready":
        summary = (
            f"{repo_slug} on {branch}; {latest_run_name} is {latest_run_status}"
            + (f" / {latest_run_conclusion}" if latest_run_conclusion else "")
            + f"; {failing_run_count} failing sampled workflow runs."
        )
    else:
        summary = f"{repo_slug} on {branch}; GitHub probe is running in {status or 'unknown'} mode. {message or 'Local git state only.'}"

    return {
        "job_type": "github_release_watch",
        "summary": summary,
        "metrics": {
            "workflow_runs_count_sampled": int(probe.get("workflow_runs_count_sampled", 0) or 0),
            "failing_workflow_run_count": failing_run_count,
            "open_issues_count": open_issues_count,
            "saved_follow_up_count": int(saved.get("saved_count", 0) or 0),
            "dirty_workspace": 1 if is_dirty else 0,
            "embedded_remote_credentials": 1 if remote_credential_embedded else 0,
        },
        "repo": {
            "slug": repo_slug,
            "branch": branch,
            "head_sha": str(probe.get("head_sha", "")).strip(),
            "head_subject": str(probe.get("head_subject", "")).strip(),
            "head_authored_at": str(probe.get("head_authored_at", "")).strip(),
            "origin_url": str(probe.get("origin_url", "")).strip(),
            "default_branch": str(probe.get("default_branch", "")).strip(),
        },
        "latest_workflow_run": latest_run,
        "next_actions": next_actions,
        "risks": risk_notes,
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
    if normalized_type == "template_clerk":
        return _build_template_clerk_result(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
        )
    if normalized_type == "ops_watch":
        return _build_ops_watch_result(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
        )
    if normalized_type == "founder_brief":
        return _build_founder_brief_result(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
        )
    if normalized_type == "github_release_watch":
        return _build_github_release_watch_result(
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


def _github_probe_for_repo(repo_root: Path) -> GitHubRepoProbe:
    repo_slug = str(os.getenv("SUPERMEGA_GITHUB_REPO", os.getenv("GITHUB_REPOSITORY", ""))).strip()
    token = str(os.getenv("SUPERMEGA_GITHUB_TOKEN", os.getenv("GITHUB_TOKEN", ""))).strip()
    return GitHubRepoProbe(repo_root, token=token, repo_slug=repo_slug)


_LIVE_RUNTIME_CACHE: dict[str, tuple[float, Any]] = {}


def _cached_runtime_probe(cache_key: str, ttl_seconds: int, builder: Callable[[], Any]) -> Any:
    now = time.time()
    cached = _LIVE_RUNTIME_CACHE.get(cache_key)
    if cached and cached[0] >= now:
        return cached[1]
    value = builder()
    _LIVE_RUNTIME_CACHE[cache_key] = (now + max(1, ttl_seconds), value)
    return value


def _probe_with_timeout(
    builder: Callable[[], Any],
    *,
    timeout_seconds: float,
    timeout_status: str = "timeout",
    timeout_message: str = "Probe timed out.",
) -> Any:
    result: dict[str, Any] = {}
    error: dict[str, Exception] = {}
    completed = threading.Event()

    def run() -> None:
        try:
            result["value"] = builder()
        except Exception as exc:  # pragma: no cover - defensive wrapper for external probes
            error["value"] = exc
        finally:
            completed.set()

    threading.Thread(target=run, daemon=True).start()
    if not completed.wait(max(0.1, float(timeout_seconds))):
        return {
            "status": timeout_status,
            "message": timeout_message,
        }
    if "value" in error:
        return {
            "status": "error",
            "message": str(error["value"]),
        }
    return result.get("value")


def _probe_command_output(command: str, *args: str, timeout_seconds: int = 4) -> tuple[str, str]:
    command_path = shutil.which(command)
    if not command_path:
        return "", ""
    try:
        result = subprocess.run(
            [command_path, *args],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except (OSError, subprocess.SubprocessError, ValueError):
        return command_path, ""
    lines = [str(line).strip() for line in f"{result.stdout or ''}\n{result.stderr or ''}".splitlines() if str(line).strip()]
    return command_path, (lines[0] if lines else "")


def _env_secret_ready(*names: str) -> bool:
    return any(str(os.getenv(name, "")).strip() for name in names)


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
_SENTRY_READY = False


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


def _init_sentry_runtime() -> None:
    global _SENTRY_READY
    if _SENTRY_READY:
        return
    dsn = str(os.getenv("SENTRY_DSN", "")).strip()
    if not dsn:
        return
    traces_sample_rate = 0.05
    try:
        traces_sample_rate = float(str(os.getenv("SUPERMEGA_SENTRY_TRACES", "0.05")).strip() or "0.05")
    except ValueError:
        traces_sample_rate = 0.05
    sentry_sdk.init(
        dsn=dsn,
        environment=str(os.getenv("SUPERMEGA_ENV", "production")).strip() or "production",
        integrations=[FastApiIntegration()],
        traces_sample_rate=max(0.0, min(traces_sample_rate, 1.0)),
        send_default_pii=False,
    )
    _SENTRY_READY = True


def _resend_api_key() -> str:
    return str(os.getenv("RESEND_API_KEY", "")).strip()


def _resend_from_email() -> str:
    return str(os.getenv("SUPERMEGA_RESEND_FROM", "")).strip() or "hello@supermega.dev"


def _contact_notify_email() -> str:
    return str(os.getenv("SUPERMEGA_CONTACT_NOTIFY_EMAIL", "")).strip() or _resend_from_email()


def _send_resend_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    reply_to: list[str] | None = None,
) -> dict[str, Any]:
    api_key = _resend_api_key()
    normalized_to = str(to_email or "").strip()
    if not api_key:
        return {"status": "skipped", "reason": "resend_not_configured"}
    if not normalized_to:
        return {"status": "skipped", "reason": "missing_to_email"}

    payload: dict[str, Any] = {
        "from": _resend_from_email(),
        "to": [normalized_to],
        "subject": str(subject or "").strip() or "SuperMega update",
        "html": html_body,
    }
    normalized_reply_to = [str(item).strip() for item in (reply_to or []) if str(item).strip()]
    if normalized_reply_to:
        payload["reply_to"] = normalized_reply_to

    raw_request = UrlRequest(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urlopen(raw_request, timeout=15) as response:
            raw = response.read().decode("utf-8")
        parsed = json.loads(raw or "{}")
        return {
            "status": "ready",
            "email_id": str(parsed.get("id", "")).strip(),
            "to": normalized_to,
            "subject": payload["subject"],
        }
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        if _SENTRY_READY:
            sentry_sdk.capture_exception(exc)
        return {
            "status": "error",
            "reason": str(exc),
            "to": normalized_to,
            "subject": payload["subject"],
        }


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
    _init_sentry_runtime()
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
    app_base_url = str(os.getenv("VITE_WORKSPACE_APP_BASE", "")).strip()
    gcp_project_id = str(os.getenv("SUPERMEGA_GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "supermega-468612"))).strip() or "supermega-468612"
    cloud_tasks_location = str(os.getenv("SUPERMEGA_CLOUD_TASKS_LOCATION", "")).strip() or "asia-southeast1"
    cloud_tasks_queue_default = str(os.getenv("SUPERMEGA_CLOUD_TASKS_QUEUE_DEFAULT", "")).strip()
    cloud_tasks_queue_browser = str(os.getenv("SUPERMEGA_CLOUD_TASKS_QUEUE_BROWSER", "")).strip()
    cloud_tasks_queue_brief = str(os.getenv("SUPERMEGA_CLOUD_TASKS_QUEUE_BRIEF", "")).strip()
    cloud_tasks_worker_url = str(os.getenv("SUPERMEGA_CLOUD_TASKS_WORKER_URL", "")).strip()
    cloud_tasks_enabled = bool(
        internal_cron_token
        and gcp_project_id
        and cloud_tasks_location
        and cloud_tasks_queue_default
        and cloud_tasks_worker_url
    )
    cloud_tasks_client = tasks_v2.CloudTasksClient() if cloud_tasks_enabled else None
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
    enterprise_ensure_workspace_domains(
        enterprise_db_url,
        workspace_id=default_workspace_id,
        workspace_slug=str(default_workspace.get("slug", auth_workspace_slug)).strip(),
        workspace_name=str(default_workspace.get("name", auth_workspace_name)).strip(),
    )
    ytf_workspace = enterprise_ensure_workspace(
        enterprise_db_url,
        slug="ytf-plant-a",
        name="Yangon Tyre Plant A",
        plan="pilot",
    )
    enterprise_ensure_workspace_domains(
        enterprise_db_url,
        workspace_id=str(ytf_workspace.get("workspace_id", "")).strip(),
        workspace_slug=str(ytf_workspace.get("slug", "ytf-plant-a")).strip(),
        workspace_name=str(ytf_workspace.get("name", "Yangon Tyre Plant A")).strip(),
    )
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

    def _agent_queue_name(job_types: list[str]) -> str:
        normalized = _normalized_agent_job_types(job_types)
        if normalized == ["founder_brief"] and cloud_tasks_queue_brief:
            return cloud_tasks_queue_brief
        browser_job_types = {"browser_clerk"}
        if any(item in browser_job_types for item in normalized) and cloud_tasks_queue_browser:
            return cloud_tasks_queue_browser
        return cloud_tasks_queue_default

    def _enqueue_agent_worker_task(
        *,
        workspace_id: str,
        source: str,
        job_types: list[str],
        limit: int,
    ) -> dict[str, Any]:
        if not cloud_tasks_enabled or cloud_tasks_client is None:
            return {"status": "disabled", "reason": "cloud_tasks_not_configured"}
        queue_name = _agent_queue_name(job_types)
        if not queue_name:
            return {"status": "disabled", "reason": "queue_name_missing"}
        parent = cloud_tasks_client.queue_path(gcp_project_id, cloud_tasks_location, queue_name)
        body = json.dumps(
            {
                "source": source,
                "job_types": _normalized_agent_job_types(job_types),
                "limit": max(1, int(limit or 1)),
            }
        ).encode("utf-8")
        schedule_time = timestamp_pb2.Timestamp()
        schedule_time.FromDatetime(datetime.utcnow() + timedelta(seconds=2))
        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": cloud_tasks_worker_url,
                "headers": {
                    "Content-Type": "application/json",
                    "x-supermega-cron-token": internal_cron_token,
                },
                "body": body,
            },
            "schedule_time": schedule_time,
        }
        created = cloud_tasks_client.create_task(parent=parent, task=task)
        return {
            "status": "ready",
            "queue_name": queue_name,
            "task_name": str(getattr(created, "name", "")).strip(),
            "workspace_id": workspace_id,
        }

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
            results.append(
                _run_and_persist_agent_job(
                    state_db=state_db,
                    enterprise_db_url=enterprise_db_url,
                    workspace_id=workspace_id,
                    triggered_by=triggered_by,
                    job_type=job_type,
                    source=source,
                    payload={},
                )
            )
        return _agent_jobs_payload(enterprise_db_url=enterprise_db_url, workspace_id=workspace_id, rows=results)

    def _enqueue_agent_job_batch(
        *,
        workspace_id: str,
        triggered_by: str,
        source: str,
        job_types: list[str] | None = None,
    ) -> dict[str, Any]:
        normalized_job_types = _normalized_agent_job_types(job_types)
        rows = [
            enterprise_create_agent_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                job_type=job_type,
                source=source,
                payload={},
                max_attempts=1,
                triggered_by=triggered_by,
            )
            for job_type in normalized_job_types
        ]
        queue_result = _enqueue_agent_worker_task(
            workspace_id=workspace_id,
            source="cloud_tasks_worker",
            job_types=normalized_job_types,
            limit=len(rows) or 1,
        )
        return _agent_jobs_payload(
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            rows=rows,
            extra={
                "queued_count": len(rows),
                "mode": "queued",
                "dispatch": queue_result,
            },
        )

    def _process_agent_run_queue(
        *,
        workspace_id: str,
        source: str,
        job_types: list[str] | None = None,
        limit: int = 8,
    ) -> dict[str, Any]:
        claimed_rows = enterprise_claim_agent_runs(
            enterprise_db_url,
            workspace_id=workspace_id,
            job_types=_normalized_agent_job_types(job_types),
            limit=limit,
        )
        completed_rows = [
            _complete_existing_agent_run(
                state_db=state_db,
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                run_id=str(row.get("run_id", "")).strip(),
                job_type=str(row.get("job_type", "")).strip(),
                payload=row.get("payload", {}) if isinstance(row.get("payload", {}), dict) else {},
            )
            for row in claimed_rows
            if str(row.get("run_id", "")).strip() and str(row.get("job_type", "")).strip()
        ]
        return _agent_jobs_payload(
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            rows=completed_rows,
            extra={
                "claimed_count": len(claimed_rows),
                "processed_count": len(completed_rows),
                "mode": source,
            },
        )

    def _require_internal_automation(request: Request) -> str:
        cron_token = str(os.getenv("SUPERMEGA_INTERNAL_CRON_TOKEN", "")).strip()
        header_token = str(request.headers.get("x-supermega-cron-token", "")).strip()
        if cron_token and header_token and secrets.compare_digest(header_token, cron_token):
            return "cron"
        session = _session_from_request(request)
        if session:
            validated_session = _require_agent_ops_control_access(request)
            return str(validated_session.get("display_name", validated_session.get("username", "system"))).strip() or "system"
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

    def _send_contact_submission_notification(
        *,
        name: str,
        email: str,
        company: str,
        workflow: str,
        requested_package: str,
        data_summary: str,
        goal: str,
    ) -> dict[str, Any]:
        notify_email = _contact_notify_email()
        subject_company = company or name or "New request"
        html_body = (
            "<div style='font-family:Arial,sans-serif;line-height:1.55;color:#0f172a'>"
            f"<h2 style='margin:0 0 16px'>New SuperMega contact: {escape(subject_company)}</h2>"
            "<p style='margin:0 0 12px'>A new contact request was submitted on supermega.dev.</p>"
            "<table style='border-collapse:collapse'>"
            f"<tr><td style='padding:4px 12px 4px 0'><strong>Name</strong></td><td>{escape(name)}</td></tr>"
            f"<tr><td style='padding:4px 12px 4px 0'><strong>Email</strong></td><td>{escape(email)}</td></tr>"
            f"<tr><td style='padding:4px 12px 4px 0'><strong>Company</strong></td><td>{escape(company)}</td></tr>"
            f"<tr><td style='padding:4px 12px 4px 0'><strong>Requested product</strong></td><td>{escape(requested_package)}</td></tr>"
            f"<tr><td style='padding:4px 12px 4px 0'><strong>Workflow</strong></td><td>{escape(workflow)}</td></tr>"
            f"<tr><td style='padding:4px 12px 4px 0'><strong>Team and systems</strong></td><td>{escape(data_summary)}</td></tr>"
            f"<tr><td style='padding:4px 12px 4px 0;vertical-align:top'><strong>Goal</strong></td><td>{escape(goal)}</td></tr>"
            "</table>"
            f"<p style='margin:16px 0 0'>Open the app: <a href='{escape(app_base_url or '')}'>{escape(app_base_url or 'app.supermega.dev')}</a></p>"
            "</div>"
        )
        reply_to = [email] if "@" in email else []
        return _send_resend_email(
            to_email=notify_email,
            subject=f"New SuperMega contact: {subject_company}",
            html_body=html_body,
            reply_to=reply_to,
        )

    def _send_team_invite_email(
        *,
        to_email: str,
        display_name: str,
        workspace_name: str,
        role: str,
        invited_by: str,
        password: str,
    ) -> dict[str, Any]:
        login_link = f"{app_base_url.rstrip('/')}/login" if app_base_url else "https://app.supermega.dev/login"
        safe_name = display_name or to_email.split("@")[0]
        password_block = (
            f"<p style='margin:0 0 12px'><strong>Temporary password:</strong> {escape(password)}</p>"
            if password
            else ""
        )
        html_body = (
            "<div style='font-family:Arial,sans-serif;line-height:1.55;color:#0f172a'>"
            f"<h2 style='margin:0 0 16px'>You were invited to {escape(workspace_name or 'SuperMega')}</h2>"
            f"<p style='margin:0 0 12px'>Hi {escape(safe_name)},</p>"
            f"<p style='margin:0 0 12px'>{escape(invited_by or 'The SuperMega team')} added you as {escape(role or 'member')}.</p>"
            f"{password_block}"
            f"<p style='margin:0 0 12px'>Open the app here: <a href='{escape(login_link)}'>{escape(login_link)}</a></p>"
            "<p style='margin:0'>Use your email as the username.</p>"
            "</div>"
        )
        return _send_resend_email(
            to_email=to_email,
            subject=f"Your SuperMega invite for {workspace_name or 'SuperMega'}",
            html_body=html_body,
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
        if tenant_param in {"ytf", "ytf-plant-a"}:
            return {
                "tenant_key": "ytf-plant-a",
                "workspace_slug": "ytf-plant-a",
                "company": "Yangon Tyre Plant A",
            }
        if tenant_param in {"default", "platform", "supermega"}:
            return {"tenant_key": "default", "workspace_slug": "", "company": ""}

        domain_row = enterprise_get_workspace_domain_by_hostname(enterprise_db_url, hostname=hostname)
        if domain_row:
            workspace_slug = str(domain_row.get("workspace_slug", "")).strip()
            workspace_name = str(domain_row.get("workspace_name", "")).strip()
            tenant_key = "ytf-plant-a" if workspace_slug == "ytf-plant-a" else "default"
            return {
                "tenant_key": tenant_key,
                "workspace_slug": workspace_slug,
                "company": workspace_name,
            }

        if hostname in {"ytf.supermega.dev", "www.ytf.supermega.dev"}:
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
            "capabilities": sorted(_role_capabilities(str(session.get("role", "")))),
            "workspace_id": session.get("workspace_id", ""),
            "workspace_slug": session.get("workspace_slug", ""),
            "workspace_name": session.get("workspace_name", ""),
            "workspace_plan": session.get("workspace_plan", ""),
        }

    MEMBER_CAPABILITIES = frozenset({"actions.view"})
    OPERATOR_CAPABILITIES = frozenset(
        {
            *MEMBER_CAPABILITIES,
            "sales.view",
            "receiving.view",
            "approvals.view",
            "documents.view",
        }
    )
    MANAGER_CAPABILITIES = frozenset(
        {
            *OPERATOR_CAPABILITIES,
            "agent_ops.view",
            "director.view",
            "architect.view",
        }
    )
    OWNER_CAPABILITIES = frozenset(
        {
            *MANAGER_CAPABILITIES,
            "operations.view",
            "dqms.view",
            "maintenance.view",
            "tenant_admin.view",
            "connector_admin.view",
            "knowledge_admin.view",
            "security_admin.view",
        }
    )
    PLATFORM_ADMIN_CAPABILITIES = frozenset({*OWNER_CAPABILITIES, "platform_admin.view"})

    ROLE_ALIASES: dict[str, str] = {
        "ceo": "ceo",
        "chief_executive": "ceo",
        "chief_executive_officer": "ceo",
        "executive": "ceo",
        "admin": "admin",
        "architect": "implementation_lead",
        "product_manager": "product_owner",
        "maintenance": "maintenance",
        "maintenance_lead": "maintenance",
        "maintenance_manager": "maintenance",
        "maintenance_ops": "maintenance",
        "operations": "operations",
        "operations_lead": "operations",
        "operations_manager": "operations",
        "ops": "operations",
        "quality": "quality",
        "qc": "quality",
        "quality_manager": "quality",
        "quality_lead": "quality",
        "sales": "sales",
        "sales_lead": "sales",
        "sales_manager": "sales",
    }

    ROLE_CAPABILITY_PROFILES: dict[str, frozenset[str]] = {
        "member": MEMBER_CAPABILITIES,
        "operator": frozenset({*OPERATOR_CAPABILITIES, "operations.view"}),
        "manager": MANAGER_CAPABILITIES,
        "owner": OWNER_CAPABILITIES,
        "tenant_admin": OWNER_CAPABILITIES,
        "platform_admin": PLATFORM_ADMIN_CAPABILITIES,
        "product_owner": frozenset(
            {
                "actions.view",
                "approvals.view",
                "agent_ops.view",
                "architect.view",
                "tenant_admin.view",
                "knowledge_admin.view",
            }
        ),
        "implementation_lead": frozenset(
            {
                "actions.view",
                "approvals.view",
                "agent_ops.view",
                "architect.view",
                "tenant_admin.view",
                "knowledge_admin.view",
            }
        ),
        "tenant_operator": frozenset({"actions.view", "approvals.view", "agent_ops.view", "documents.view"}),
        "director": frozenset({"director.view", "sales.view", "approvals.view", "actions.view"}),
        "plant_manager": frozenset(
            {"actions.view", "receiving.view", "operations.view", "dqms.view", "maintenance.view", "approvals.view", "documents.view"}
        ),
        "procurement_lead": frozenset({"receiving.view", "approvals.view", "documents.view", "actions.view"}),
        "receiving_clerk": frozenset({"receiving.view", "operations.view", "actions.view", "documents.view"}),
        "quality": frozenset({"dqms.view", "actions.view", "approvals.view", "documents.view", "knowledge_admin.view"}),
        "quality_manager": frozenset({"dqms.view", "actions.view", "approvals.view", "documents.view", "knowledge_admin.view"}),
        "finance_controller": frozenset({"approvals.view", "director.view", "sales.view", "documents.view"}),
        "sales_lead": frozenset({"sales.view", "actions.view", "director.view"}),
        "sales": frozenset({"sales.view", "actions.view", "approvals.view", "documents.view"}),
        "maintenance": frozenset({"maintenance.view", "operations.view", "actions.view", "receiving.view", "approvals.view", "documents.view"}),
        "operations": frozenset(
            {"operations.view", "dqms.view", "actions.view", "receiving.view", "approvals.view", "documents.view", "agent_ops.view"}
        ),
        "ceo": frozenset({*PLATFORM_ADMIN_CAPABILITIES, "operations.view", "dqms.view", "maintenance.view"}),
        "admin": frozenset({*PLATFORM_ADMIN_CAPABILITIES, "operations.view", "dqms.view", "maintenance.view"}),
    }

    def _normalized_role(value: str) -> str:
        return re.sub(r"\s+", "_", str(value or "").strip().lower())

    def _canonical_role(value: str) -> str:
        normalized = _normalized_role(value)
        return ROLE_ALIASES.get(normalized, normalized)

    def _role_capabilities(role: str) -> frozenset[str]:
        canonical_role = _canonical_role(role) or "member"
        return ROLE_CAPABILITY_PROFILES.get(canonical_role, MEMBER_CAPABILITIES)

    def _session_has_any_capability(session: dict[str, Any], capabilities: set[str] | frozenset[str] | list[str] | tuple[str, ...]) -> bool:
        allowed_capabilities = {str(item).strip() for item in capabilities if str(item).strip()}
        if not allowed_capabilities:
            return False
        return any(capability in allowed_capabilities for capability in _role_capabilities(str(session.get("role", ""))))

    def _require_capability_access(
        request: Request,
        *,
        capabilities: set[str] | frozenset[str] | list[str] | tuple[str, ...],
        detail: str,
    ) -> dict[str, Any]:
        session = _require_session(request)
        if not _session_has_any_capability(session, capabilities):
            raise HTTPException(status_code=403, detail=detail)
        return session

    def _require_workspace_admin(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"tenant_admin.view", "platform_admin.view"},
            detail="Workspace admin access required.",
        )

    def _require_solution_architect_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"architect.view", "tenant_admin.view", "platform_admin.view"},
            detail="Solution Architect access required.",
        )

    def _require_agent_ops_control_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"agent_ops.view", "architect.view", "tenant_admin.view", "platform_admin.view"},
            detail="Agent Ops control access required.",
        )

    def _require_runtime_control_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={
                "agent_ops.view",
                "architect.view",
                "director.view",
                "connector_admin.view",
                "knowledge_admin.view",
                "security_admin.view",
                "tenant_admin.view",
                "platform_admin.view",
            },
            detail="Runtime control access required.",
        )

    def _require_cloud_control_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"agent_ops.view", "director.view", "architect.view", "tenant_admin.view", "platform_admin.view"},
            detail="Cloud operations access required.",
        )

    def _require_model_ops_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"agent_ops.view", "director.view", "architect.view", "security_admin.view", "tenant_admin.view", "platform_admin.view"},
            detail="Model operations access required.",
        )

    def _require_cloud_control_manage_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"agent_ops.view", "tenant_admin.view", "platform_admin.view"},
            detail="Cloud operations management access required.",
        )

    def _require_agent_manifest_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"agent_ops.view", "architect.view", "director.view", "tenant_admin.view", "platform_admin.view"},
            detail="Agent team access required.",
        )

    def _require_agent_workspace_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"agent_ops.view", "architect.view", "director.view", "tenant_admin.view", "platform_admin.view"},
            detail="Agent workspace access required.",
        )

    def _require_workforce_registry_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={
                "actions.view",
                "approvals.view",
                "sales.view",
                "receiving.view",
                "dqms.view",
                "maintenance.view",
                "tenant_admin.view",
                "platform_admin.view",
            },
            detail="Workforce registry access required.",
        )

    def _require_workforce_manage_access(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        allowed_roles = {
            "manager",
            "owner",
            "ceo",
            "director",
            "tenant_admin",
            "platform_admin",
            "product_owner",
            "implementation_lead",
        }
        if _canonical_role(str(session.get("role", ""))) not in allowed_roles:
            raise HTTPException(status_code=403, detail="Workforce management access required.")
        return session

    def _require_rollout_access(request: Request) -> dict[str, Any]:
        return _require_capability_access(
            request,
            capabilities={"architect.view", "tenant_admin.view", "platform_admin.view"},
            detail="Rollout access required.",
        )

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
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=name,
            event_type="workspace.bootstrap",
            entity_type="workspace",
            entity_id=str(session.get("workspace_id", "")).strip(),
            summary="Public workspace bootstrap created a starter tenant.",
            detail=f"{company} was bootstrapped from the public funnel.",
            payload={
                "workspace_slug": workspace_slug,
                "email": email,
                "goal": str(payload.goal or "").strip(),
            },
        )
        return {
            "authenticated": True,
            "reused": False,
            "generated_password": password,
            "created": created,
            "session": _session_payload(
                {
                    "username": user.get("username", ""),
                    "display_name": user.get("display_name", ""),
                    "role": user.get("role", ""),
                    "workspace_id": session.get("workspace_id", ""),
                    "workspace_slug": session.get("workspace_slug", ""),
                    "workspace_name": session.get("workspace_name", ""),
                    "workspace_plan": session.get("workspace_plan", ""),
                }
            ),
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

    def _normalize_requested_package(value: str) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()

    def _contact_context_summary(*, team: str = "", data: str = "") -> str:
        team_value = re.sub(r"\s+", " ", str(team or "")).strip()
        data_value = re.sub(r"\s+", " ", str(data or "")).strip()
        return " | ".join(part for part in [team_value, data_value] if part)

    def _resolve_public_inbound_frame(payload: ContactSubmissionRequest) -> dict[str, Any]:
        requested_package = _normalize_requested_package(payload.requested_package or payload.workflow)
        normalized = requested_package.lower()

        sales_keywords = (
            "find clients",
            "find companies",
            "sales system",
            "sales crm",
            "revenue system",
            "revenue system package",
            "lead",
            "prospecting",
        )
        cleanup_keywords = (
            "company list",
            "company cleanup",
            "client portal",
            "crm",
            "workspace",
            "support desk",
            "commerce",
            "knowledge",
        )
        ops_keywords = (
            "receiving",
            "operations",
            "operations inbox",
            "supplier",
            "document",
            "approval",
            "quality",
            "dqms",
            "maintenance",
            "portal",
            "industrial",
        )

        if any(keyword in normalized for keyword in ops_keywords):
            return {
                "requested_package": requested_package or "Receiving Control",
                "service_pack": "Receiving Control",
                "wedge_product": "Receiving Log",
                "starter_modules": ["Receiving Log", "Task List"],
                "semi_products": ["Founder Brief", "Approval Flow"],
            }

        if any(keyword in normalized for keyword in cleanup_keywords):
            return {
                "requested_package": requested_package or "Company List",
                "service_pack": "Company Cleanup",
                "wedge_product": "Company List",
                "starter_modules": ["Company List", "Task List"],
                "semi_products": ["Founder Brief", "Client Portal"],
            }

        if any(keyword in normalized for keyword in sales_keywords):
            return {
                "requested_package": requested_package or "Find Clients",
                "service_pack": "Sales Setup",
                "wedge_product": "Find Clients",
                "starter_modules": ["Find Clients", "Company List"],
                "semi_products": ["Founder Brief", "Reply Draft"],
            }

        return {
            "requested_package": requested_package or "Find Clients",
            "service_pack": "Sales Setup",
            "wedge_product": "Find Clients",
            "starter_modules": ["Find Clients", "Company List"],
            "semi_products": ["Founder Brief", "Reply Draft"],
        }

    def _build_public_inbound_opportunity(payload: ContactSubmissionRequest) -> dict[str, Any]:
        company_name = payload.company.strip() or payload.name.strip() or "Inbound request"
        goal = payload.goal.strip()
        workflow = payload.workflow.strip() or "Discovery request"
        data_summary = _contact_context_summary(team=payload.team, data=payload.data)
        rollout_frame = _resolve_public_inbound_frame(payload)
        requested_package = str(rollout_frame.get("requested_package", "")).strip()
        source_url = f"/contact?package={quote(requested_package)}" if requested_package else "/contact"
        message_focus = requested_package or str(rollout_frame.get("wedge_product", "")).strip() or workflow
        notes = [
            f"Requested package: {requested_package}" if requested_package else "",
            f"Workflow: {workflow}" if workflow else "",
            f"Team and systems: {data_summary}" if data_summary else "",
            f"Goal: {goal}" if goal else "",
        ]
        return {
            "name": company_name,
            "archetype": "inbound_request",
            "stage": "offer_ready",
            "status": "open",
            "owner": "Revenue Pod",
            "service_pack": str(rollout_frame.get("service_pack", "")).strip(),
            "wedge_product": str(rollout_frame.get("wedge_product", "")).strip(),
            "starter_modules": list(rollout_frame.get("starter_modules", []) or []),
            "semi_products": list(rollout_frame.get("semi_products", []) or []),
            "outreach_subject": f"{company_name}: next step for {message_focus}",
            "outreach_message": (
                f"Hi {payload.name.strip() or company_name}, thanks for the request. "
                f"We can start with {message_focus} and shape the first live rollout around {goal or 'your main blocker'}."
            ),
            "discovery_questions": [
                "What is the one workflow that wastes the most time today?",
                "Which inbox, sheet, or tracker should the first board connect to?",
                "Who needs to see the first live board every day?",
            ],
            "source": "website_request",
            "source_url": source_url,
            "provider": "website",
            "score": 9,
            "email": payload.email.strip(),
            "phone": "",
            "website": "",
            "notes": "\n".join(part for part in notes if part),
            "task_title": f"Review inbound request from {company_name}",
            "task_owner": "Revenue Pod",
            "task_priority": "High",
            "task_due": "Today",
            "task_notes": "Confirm package fit, book discovery, and map the first rollout blocker.",
            "task_template": "inbound_request_review",
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

    def _runtime_health_from_team_status(value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"healthy", "active", "stable", "ready"}:
            return "Healthy"
        if normalized in {"fragile", "partial", "review"}:
            return "Warning"
        if normalized in {"degraded", "error", "blocked"}:
            return "Degraded"
        return "Needs wiring"

    def _runtime_run_timestamp(row: dict[str, Any] | None) -> str:
        if not isinstance(row, dict):
            return ""
        for key in ("finished_at", "updated_at", "started_at", "created_at"):
            value = str(row.get(key, "")).strip()
            if value:
                return value
        return ""

    def _runtime_age_phrase(value: str) -> str:
        parsed = _parse_iso_datetime(value)
        if not parsed:
            return ""
        now = datetime.now(parsed.tzinfo) if parsed.tzinfo else datetime.utcnow()
        delta = max(now - parsed, timedelta())
        minutes = max(1, int(delta.total_seconds() // 60))
        if minutes < 90:
            return f"{minutes} minutes ago"
        hours = max(1, int(round(minutes / 60)))
        if hours < 48:
            return f"{hours} hours ago"
        days = max(1, int(round(hours / 24)))
        return f"{days} days ago"

    def _runtime_freshness_label(value: str, *, fallback: str) -> str:
        age = _runtime_age_phrase(value)
        if not age:
            return fallback
        return f"Updated {age}"

    def _runtime_status_from_timestamp(value: str, cadence: str, *, missing: str = "Needs wiring") -> str:
        parsed = _parse_iso_datetime(value)
        if not parsed:
            return missing
        now = datetime.now(parsed.tzinfo) if parsed.tzinfo else datetime.utcnow()
        age_hours = max(0.0, (now - parsed).total_seconds() / 3600)
        threshold = max(1, _cadence_threshold_hours(cadence))
        if age_hours <= threshold * 0.5:
            return "Healthy"
        if age_hours <= threshold:
            return "Warning"
        return "Degraded"

    def _runtime_latest_timestamp(values: list[str]) -> str:
        best: datetime | None = None
        for value in values:
            parsed = _parse_iso_datetime(value)
            if parsed is None:
                continue
            if best is None or parsed > best:
                best = parsed
        if best is None:
            return datetime.now().astimezone().isoformat()
        return best.isoformat()

    def _runtime_control_payload(session: dict[str, Any]) -> dict[str, Any]:
        workspace_id = str(session.get("workspace_id", "")).strip()
        tenant_state = _tenant_state_payload(session)
        expected_tenant_key = str(tenant_state.get("expected_tenant_key", "")).strip() or "default"
        if bool(tenant_state.get("blocked")):
            return {
                "status": "blocked",
                "updated_at": datetime.now().astimezone().isoformat(),
                "tenant_state": tenant_state,
                "connectors": [],
                "connector_events": [],
                "knowledge_collections": [],
                "policy_guardrails": [],
                "autonomy_loops": [],
                "agent_capability_cells": [],
                "model_routing_profiles": [],
                "big_picture": {
                    "thesis": "Runtime state is blocked until tenant-scoped control data matches the active workspace.",
                    "current_truth": [
                        str(tenant_state.get("detail", "")).strip() or "Tenant state mismatch detected.",
                        "This route is failing closed so global runtime state is not projected into the wrong tenant workspace.",
                    ],
                    "next_builds": [
                        "Sync tenant-scoped agent state for the expected workspace tenant.",
                        "Then scope the remaining runtime state tables by tenant before expanding autonomy.",
                    ],
                },
            }
        lead_summary = enterprise_load_lead_summary(enterprise_db_url, workspace_id=workspace_id) if workspace_id else {}
        lead_rows = enterprise_list_leads(enterprise_db_url, workspace_id=workspace_id, limit=100) if workspace_id else []
        workspace_tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=200) if workspace_id else []
        latest_agent_runs = enterprise_list_agent_runs(enterprise_db_url, workspace_id=workspace_id, limit=50) if workspace_id else []
        connector_event_rows = enterprise_list_connector_events(enterprise_db_url, workspace_id=workspace_id, limit=160) if workspace_id else []
        audit_rows = enterprise_list_audit_events(enterprise_db_url, workspace_id=workspace_id, limit=120) if workspace_id else []
        latest_agent_runs_by_type = _group_agent_runs_by_job_type(latest_agent_runs)
        approval_rows = list_approval_entries(state_db, limit=100)
        decision_rows = list_decision_entries(state_db, limit=100)
        quality_rows = list_quality_incidents(state_db, limit=200)
        supplier_rows = list_supplier_risks(state_db, limit=200)
        receiving_rows = list_receiving_records(state_db, limit=200)
        maintenance_rows = list_maintenance_records(state_db, limit=200)
        metric_rows = list_metric_entries(state_db, limit=200)
        inventory_rows = list_inventory_records(state_db, limit=200)
        action_summary = load_action_summary(state_db)
        approval_summary = load_approval_summary(state_db)
        metric_summary = load_metric_summary(state_db)
        feedback_summary = load_product_feedback_summary(state_db)
        quality_summary = load_quality_summary(state_db)
        supplier_summary = load_supplier_risk_summary(state_db)
        receiving_summary = load_receiving_summary(state_db)
        inventory_summary = load_inventory_summary(state_db)
        agent_team_summary = load_agent_team_summary(state_db, tenant_key=expected_tenant_key)
        agent_team_snapshot = load_agent_team_system_snapshot(state_db, tenant_key=expected_tenant_key)
        if not agent_team_snapshot and expected_tenant_key == "default":
            agent_team_snapshot = _load_json(pilot_data / "agent_team_system.json")
        portfolio_manifest = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )

        lead_count = int(lead_summary.get("lead_count", 0) or 0)
        lead_stage_map = lead_summary.get("by_stage", {}) if isinstance(lead_summary, dict) else {}
        offer_ready_count = int(lead_stage_map.get("offer_ready", 0) or 0) if isinstance(lead_stage_map, dict) else 0
        open_workspace_tasks = [row for row in workspace_tasks if str(row.get("status", "")).strip().lower() != "done"]
        pending_approval_count = sum(
            1 for row in approval_rows if str(row.get("status", "")).strip().lower() in {"pending", "review"}
        )
        approval_gate_counts = approval_summary.get("top_gates", []) if isinstance(approval_summary, dict) else []
        top_approval_gate = (
            str(approval_gate_counts[0].get("approval_gate", "")).strip()
            if approval_gate_counts and isinstance(approval_gate_counts[0], dict)
            else "general"
        )

        quality_count = len(quality_rows)
        supplier_count = len(supplier_rows)
        receiving_count = len(receiving_rows)
        inventory_count = len(inventory_rows)
        decision_count = len(decision_rows)
        feedback_count = int(feedback_summary.get("feedback_count", 0) or 0)
        metric_count = int(metric_summary.get("metric_count", 0) or 0)
        variance_count = int(receiving_summary.get("variance_count", 0) or 0)
        hold_count = int(receiving_summary.get("hold_count", 0) or 0)
        reorder_count = int(inventory_summary.get("reorder_count", 0) or 0)
        watch_count = int(inventory_summary.get("watch_count", 0) or 0)
        action_count = int(action_summary.get("total_items", 0) or 0)
        autonomy_score = int(agent_team_summary.get("autonomy_score", 0) or 0)
        agent_team_status = str(agent_team_summary.get("status", "")).strip()

        snapshot_summary = agent_team_snapshot.get("summary", {}) if isinstance(agent_team_snapshot, dict) else {}
        gmail_ready = bool(snapshot_summary.get("gmail_ready", False))
        focus_products = agent_team_snapshot.get("focus_products", []) if isinstance(agent_team_snapshot, dict) else []
        team_gaps = agent_team_snapshot.get("gaps", []) if isinstance(agent_team_snapshot, dict) else []
        team_lookup = {
            str(item.get("team_id", "")).strip(): item
            for item in (agent_team_snapshot.get("teams", []) if isinstance(agent_team_snapshot, dict) else [])
            if isinstance(item, dict) and str(item.get("team_id", "")).strip()
        }
        github_runtime = _github_probe_for_repo(REPO_ROOT).probe()
        github_probe_status = str(github_runtime.get("status", "")).strip().lower()
        github_probe_message = str(github_runtime.get("message", "")).strip()
        github_repo_slug = str(github_runtime.get("repo", "")).strip()
        github_branch = str(github_runtime.get("branch", "")).strip()
        github_remote_credential_embedded = bool(github_runtime.get("remote_credential_embedded", False))
        github_is_dirty = bool(github_runtime.get("is_dirty", False))
        github_api_access_mode = str(github_runtime.get("api_access_mode", "")).strip() or "local_only"
        github_latest_run = github_runtime.get("latest_workflow_run", {}) if isinstance(github_runtime.get("latest_workflow_run", {}), dict) else {}
        github_latest_run_name = str(github_latest_run.get("name", "")).strip()
        github_latest_run_status = str(github_latest_run.get("status", "")).strip()
        github_latest_run_conclusion = str(github_latest_run.get("conclusion", "")).strip().lower()
        github_latest_run_updated_at = str(github_latest_run.get("updated_at", "")).strip()
        github_failing_run_count = int(github_runtime.get("failing_workflow_run_count", 0) or 0)
        github_open_issues_count = int(github_runtime.get("open_issues_count", 0) or 0)

        revenue_scout_run = latest_agent_runs_by_type.get("revenue_scout", {})
        founder_brief_run = latest_agent_runs_by_type.get("founder_brief", {})
        task_triage_run = latest_agent_runs_by_type.get("task_triage", {})
        ops_watch_run = latest_agent_runs_by_type.get("ops_watch", {})
        github_release_watch_run = latest_agent_runs_by_type.get("github_release_watch", {})

        sales_run_at = _runtime_run_timestamp(revenue_scout_run)
        founder_run_at = _runtime_run_timestamp(founder_brief_run)
        task_run_at = _runtime_run_timestamp(task_triage_run)
        ops_watch_run_at = _runtime_run_timestamp(ops_watch_run)
        github_release_watch_run_at = _runtime_run_timestamp(github_release_watch_run)
        lead_latest = _latest_timestamp_from_rows(lead_rows, ("synced_at", "created_at"))
        quality_latest = _latest_timestamp_from_rows(quality_rows, ("reported_at", "synced_at"))
        supplier_latest = _latest_timestamp_from_rows(supplier_rows, ("synced_at", "eta"))
        receiving_latest = _latest_timestamp_from_rows(receiving_rows, ("received_at", "synced_at"))
        inventory_latest = _latest_timestamp_from_rows(inventory_rows, ("synced_at",))
        maintenance_latest = _latest_timestamp_from_rows(maintenance_rows, ("logged_at", "synced_at"))
        metric_latest = _latest_timestamp_from_rows(metric_rows, ("captured_at", "synced_at"))
        task_latest = _latest_timestamp_from_rows(workspace_tasks, ("updated_at", "created_at"))
        connector_event_latest = _latest_timestamp_from_rows(connector_event_rows, ("created_at",))
        latest_approval_at = max((str(row.get("created_at", "")).strip() for row in approval_rows), default="")
        latest_decision_at = max((str(row.get("created_at", "")).strip() for row in decision_rows), default="")
        agent_snapshot_generated_at = str(agent_team_snapshot.get("generated_at", "")).strip() if isinstance(agent_team_snapshot, dict) else ""
        portfolio_generated_at = str(portfolio_manifest.get("generated_on", "")).strip() if isinstance(portfolio_manifest, dict) else ""
        shopfloor_signal_at = _latest_signal([task_latest, receiving_latest, quality_latest, maintenance_latest, metric_latest])
        sales_signal_at = _latest_signal([sales_run_at, lead_latest])
        procurement_signal_at = _latest_signal([latest_approval_at, supplier_latest])
        drive_signal_at = _latest_signal([quality_latest, receiving_latest, maintenance_latest])
        erp_signal_at = _latest_signal([receiving_latest, inventory_latest, metric_latest])
        markdown_signal_at = _latest_signal([agent_snapshot_generated_at, latest_decision_at, founder_run_at])
        github_signal_at = _latest_signal([github_latest_run_updated_at, github_release_watch_run_at, founder_run_at, ops_watch_run_at, portfolio_generated_at])

        sales_gmail_status = (
            _runtime_status_from_timestamp(sales_signal_at, "hourly", missing="Warning" if lead_count else "Needs wiring")
            if gmail_ready
            else ("Warning" if lead_count else "Needs wiring")
        )
        procurement_gmail_status = "Degraded" if pending_approval_count or supplier_count or hold_count else "Needs wiring"
        drive_quality_status = "Warning" if quality_count or receiving_count or variance_count else "Needs wiring"
        erp_export_status = "Warning" if receiving_count or inventory_count else "Needs wiring"
        markdown_vault_status = "Healthy" if agent_snapshot_generated_at or decision_count else "Warning"
        shopfloor_entry_status = _runtime_status_from_timestamp(
            shopfloor_signal_at,
            "daily",
                missing="Warning" if quality_count or receiving_count or metric_count or len(open_workspace_tasks) else "Needs wiring",
        )
        core_github_status = _runtime_status_from_timestamp(
            github_signal_at,
            "daily",
            missing="Warning" if github_repo_slug or portfolio_manifest else "Needs wiring",
        )
        if github_probe_status == "error" or github_latest_run_conclusion in FAILING_RUN_CONCLUSIONS:
            core_github_status = "Degraded"
        elif github_probe_status == "ready" and (github_remote_credential_embedded or github_is_dirty):
            core_github_status = "Warning" if core_github_status == "Healthy" else core_github_status
        elif github_probe_status == "local_only" and not github_repo_slug and not portfolio_manifest:
            core_github_status = "Needs wiring"
        core_human_entry_status = "Healthy" if workspace_id else "Warning"

        connectors = [
            {
                "id": "ytf-sales-gmail",
                "name": "YTF Sales Gmail Threads",
                "tenant": "yangon-tyre",
                "system": "Gmail",
                "status": sales_gmail_status,
                "installState": "Live" if gmail_ready or bool(sales_signal_at) else "Pilot",
                "credentialMode": "Workspace mailbox access" if gmail_ready else "Workflow signals only; mailbox credential not verified",
                "cursorMode": "thread delta cursor" if gmail_ready else "pipeline activity fallback",
                "lastSuccessAt": sales_signal_at or "No mailbox event success recorded yet",
                "replayMode": "Task replay plus manager review",
                "blastRadius": "Yangon Tyre commercial lane",
                "freshness": _runtime_freshness_label(
                    sales_signal_at,
                    fallback="No mailbox sync configured; using pipeline activity only",
                ),
                "owner": "Connector Systems",
                "workspace": "ytf/commercial-memory",
                "inputs": ["sales inbox", "quote replies", "lead pipeline"],
                "outputs": ["account memory", "follow-up drafts", "commercial review"],
                "backlog": f"{lead_count} accounts tracked, {offer_ready_count} offer-ready, {len(open_workspace_tasks)} open follow-up tasks.",
                "writeBack": "Draft-only suggestions until workspace review is approved",
                "nextAutomation": "Bind Gmail threads, quote packs, and company records into one customer memory timeline.",
                "risks": [
                    "Mailbox sync is still implied by agent jobs, not a dedicated Gmail event stream.",
                    "Quote-stage normalization still depends on lead pipeline discipline.",
                ],
            },
            {
                "id": "ytf-procurement-gmail",
                "name": "YTF Procurement Gmail Threads",
                "tenant": "yangon-tyre",
                "system": "Gmail",
                "status": procurement_gmail_status,
                "installState": "Pilot" if pending_approval_count or supplier_count or hold_count else "Needs wiring",
                "credentialMode": "Manual mailbox review with approval evidence",
                "cursorMode": "partial thread replay",
                "lastSuccessAt": procurement_signal_at or "Manual refresh only",
                "replayMode": "Manual recovery only",
                "blastRadius": "Yangon Tyre supplier recovery lane",
                "freshness": _runtime_freshness_label(
                    procurement_signal_at,
                    fallback="Manual review only; no procurement mailbox sync recorded",
                ),
                "owner": "Connector Systems",
                "workspace": "ytf/supplier-recovery",
                "inputs": ["supplier mail", "approval queue", "receiving exceptions"],
                "outputs": ["supplier recovery queue", "claim evidence", "procurement escalations"],
                "backlog": f"{supplier_count} supplier risks, {hold_count} receiving holds, {pending_approval_count} approvals waiting on review.",
                "writeBack": "Draft and evidence packets only; no direct supplier writes",
                "nextAutomation": "Map supplier threads and attachments directly to GRN exceptions and approval packets.",
                "risks": [
                    "Procurement work is still visible through approvals instead of a dedicated mailbox feed.",
                    "Supplier identity can drift between email, ERP exports, and operator notes.",
                ],
            },
            {
                "id": "ytf-drive-quality",
                "name": "YTF Drive Quality and Receiving Folders",
                "tenant": "yangon-tyre",
                "system": "Google Drive",
                "status": drive_quality_status,
                "installState": "Live" if drive_signal_at else ("Pilot" if quality_count or receiving_count else "Needs wiring"),
                "credentialMode": "Drive service account index",
                "cursorMode": "folder scan and revision polling",
                "lastSuccessAt": drive_signal_at or "No Drive index success recorded yet",
                "replayMode": "Folder replay with reviewer tasking",
                "blastRadius": "Yangon Tyre quality and receiving lane",
                "freshness": _runtime_freshness_label(
                    drive_signal_at,
                    fallback="No Drive index timestamp recorded yet",
                ),
                "owner": "Knowledge Systems",
                "workspace": "ytf/plant-quality",
                "inputs": ["receiving evidence", "inspection files", "closeout folders"],
                "outputs": ["quality issue evidence", "document intake records", "director review bundles"],
                "backlog": f"{quality_count} quality incidents, {receiving_count} receiving records, {variance_count} unresolved variance signals.",
                "writeBack": "Tagging and evidence linkage only after operator review",
                "nextAutomation": "Detect Drive file revisions that should open or resolve quality and receiving work.",
                "risks": [
                    "Files exist in the workflow, but the canonical file-to-issue join is still thin.",
                    "Folder structure discipline still depends on human operators.",
                ],
            },
            {
                "id": "ytf-erp-export",
                "name": "YTF ERP and GRN Export Lane",
                "tenant": "yangon-tyre",
                "system": "ERP Export",
                "status": erp_export_status,
                "installState": "Pilot" if erp_signal_at else "Needs wiring",
                "credentialMode": "Manual export handoff",
                "cursorMode": "snapshot diff",
                "lastSuccessAt": erp_signal_at or "No structured export success recorded yet",
                "replayMode": "Snapshot re-import only",
                "blastRadius": "Yangon Tyre operations and finance lane",
                "freshness": _runtime_freshness_label(
                    erp_signal_at,
                    fallback="No structured export timestamp recorded yet",
                ),
                "owner": "Tenant Launch Pod",
                "workspace": "ytf/ops-erp-core",
                "inputs": ["GRN exports", "stock snapshots", "supplier ledger extracts"],
                "outputs": ["receiving joins", "inventory pressure signals", "finance review evidence"],
                "backlog": f"{inventory_count} inventory rows, {receiving_count} receiving rows, {reorder_count} reorder signals currently visible.",
                "writeBack": "Read-only until field-level reconciliation is formalized",
                "nextAutomation": "Diff export snapshots and open exceptions when quantity, batch, or supplier state drifts.",
                "risks": [
                    "ERP depth is still shallower than the action and approval layers.",
                    "Export cadence remains manual rather than event-driven.",
                ],
            },
            {
                "id": "ytf-markdown-vault",
                "name": "YTF Ops Markdown Vault",
                "tenant": "yangon-tyre",
                "system": "Markdown Vault",
                "status": markdown_vault_status,
                "installState": "Live" if markdown_signal_at or decision_count else "Pilot",
                "credentialMode": "Controlled app and vault access",
                "cursorMode": "append and note-save sync",
                "lastSuccessAt": markdown_signal_at or "No markdown sync success recorded yet",
                "replayMode": "Append-only replay",
                "blastRadius": "Yangon Tyre director and knowledge lane",
                "freshness": _runtime_freshness_label(
                    markdown_signal_at,
                    fallback="No markdown or note snapshot recorded",
                ),
                "owner": "Knowledge Systems",
                "workspace": "ytf/director-review",
                "inputs": ["director notes", "operating decisions", "team briefs"],
                "outputs": ["decision links", "brief context", "entity hints"],
                "backlog": f"{decision_count} decisions captured, {feedback_count} product notes, {len(team_gaps)} operating gaps still open.",
                "writeBack": "Append-only summaries into controlled knowledge records",
                "nextAutomation": "Promote recurring note structures into controlled data-entry templates and decision links.",
                "risks": [
                    "Free-form notes still hide some operational fields.",
                    "The note layer is stronger than the field-level knowledge graph behind it.",
                ],
            },
            {
                "id": "ytf-shopfloor-entry",
                "name": "YTF Shopfloor and Manager Writeback",
                "tenant": "yangon-tyre",
                "system": "Human Entry",
                "status": shopfloor_entry_status,
                "installState": "Live" if workspace_id else "Pilot",
                "credentialMode": "Portal login and role-based writeback",
                "cursorMode": "live record writes",
                "lastSuccessAt": shopfloor_signal_at or "Current session only; no structured writeback success recorded yet",
                "replayMode": "Record replay plus coaching loop",
                "blastRadius": "Yangon Tyre writeback and queue lane",
                "freshness": _runtime_freshness_label(
                    shopfloor_signal_at,
                    fallback="No structured writeback landed yet",
                ),
                "owner": "Workforce Command",
                "workspace": "ytf/shopfloor-writeback",
                "inputs": ["receiving desks", "DQMS forms", "maintenance logs", "metric intake", "manager tasks"],
                "outputs": ["structured records", "writeback coverage signals", "connector review tasks"],
                "backlog": f"{receiving_count} receiving rows, {quality_count} quality incidents, {metric_count} metrics, {len(open_workspace_tasks)} open tasks still need stronger coaching loops.",
                "writeBack": "Primary role-based writeback through the portal and managed desks",
                "nextAutomation": "Open connector review, stale-lane, and coaching work automatically from incomplete or aging desks.",
                "risks": [
                    "Writeback is live, but reinforcement still depends on management rhythm more than automated escalation.",
                    "Some staff behaviors can still drift into chat or side notes before portal entry lands.",
                ],
            },
            {
                "id": "core-github-build",
                "name": "SuperMega Build GitHub Feed",
                "tenant": "core",
                "system": "GitHub",
                "status": core_github_status,
                "installState": (
                    "Live"
                    if github_probe_status == "ready"
                    else "Pilot"
                    if github_repo_slug or founder_run_at or ops_watch_run_at or portfolio_generated_at
                    else "Needs wiring"
                ),
                "credentialMode": (
                    "GitHub API token and repository read scope"
                    if github_api_access_mode == "token"
                    else "Public repository API"
                    if github_api_access_mode == "public_api"
                    else "Local git inspection only"
                ),
                "cursorMode": "workflow run polling" if github_probe_status == "ready" else "local branch and commit inspection",
                "lastSuccessAt": github_signal_at or "No GitHub-linked runtime success recorded yet",
                "replayMode": "Workflow run review and rerun",
                "blastRadius": "Core build and release lane",
                "freshness": (
                    f"{_runtime_freshness_label(github_signal_at, fallback='')}; {github_probe_message or 'GitHub build lane connected.'}".strip("; ")
                    if github_signal_at
                    else github_probe_message or "Portfolio snapshot exists, but GitHub delivery state is not wired yet"
                ),
                "owner": "Module Factory",
                "workspace": "core/build-studio",
                "inputs": ["repo state", "workflow runs", "release notes", "product program updates"],
                "outputs": ["release desk state", "program risk flags", "graduation signals"],
                "backlog": (
                    f"{len(focus_products)} focus products, {github_open_issues_count} open issues, {github_failing_run_count} failing sampled workflow runs."
                    if github_repo_slug
                    else f"{len(focus_products)} focus products, {len(team_gaps)} scaling gaps, {pending_approval_count} pending approvals across the control layer."
                ),
                "writeBack": "Release notes and status sync only after review",
                "nextAutomation": "Tie workflow runs, PR readiness, and tenant-proof state into one live product operations feed.",
                "risks": [
                    *(
                        ["Origin remote embeds credentials and should be rotated into secret storage."]
                        if github_remote_credential_embedded
                        else []
                    ),
                    *(
                        [f"{github_latest_run_name or 'Latest workflow'} finished with {github_latest_run_conclusion}."]
                        if github_latest_run_conclusion in FAILING_RUN_CONCLUSIONS
                        else []
                    ),
                    *(
                        ["Local repository has uncommitted changes, so release truth is mixed between repo and runtime."]
                        if github_is_dirty
                        else []
                    ),
                    "Issue-to-product-line attribution is still partially manual.",
                ],
            },
            {
                "id": "core-human-entry",
                "name": "Structured Human Entry Surfaces",
                "tenant": "core",
                "system": "Human Entry",
                "status": core_human_entry_status,
                "installState": "Live" if workspace_id else "Pilot",
                "credentialMode": "Portal login and role validation",
                "cursorMode": "live structured writes",
                "lastSuccessAt": task_latest or latest_approval_at or latest_decision_at or "Live app state",
                "replayMode": "Record replay and operator review",
                "blastRadius": "Core platform structured entry lane",
                "freshness": "Live app state on authenticated forms",
                "owner": "Prototype Studio",
                "workspace": "core/data-entry",
                "inputs": ["architect blueprints", "approvals", "metrics", "decisions"],
                "outputs": ["canonical records", "review queues", "operator forms"],
                "backlog": f"{action_count} actions, {metric_count} metric rows, {feedback_count} product notes, {int(approval_summary.get('approval_count', 0) or 0)} approvals.",
                "writeBack": "Primary app writes with role-based validation",
                "nextAutomation": "Generate stronger sector-specific forms from approved knowledge and policy templates.",
                "risks": [
                    "Forms are real, but some sectors still fall back to sheets during onboarding.",
                ],
            },
        ]

        connector_lookup = {
            str(item.get("id", "")).strip(): item
            for item in connectors
            if isinstance(item, dict) and str(item.get("id", "")).strip()
        }
        connector_events: list[dict[str, Any]] = []
        seen_connector_event_ids: set[str] = set()
        seen_connector_entity_refs: set[tuple[str, str]] = set()

        def _push_connector_event(
            *,
            event_id: str,
            connector_id: str,
            source: str,
            kind: str,
            title: str,
            detail: str,
            route: str,
            severity: str,
            actor: str,
            created_at: str,
            entity_type: str = "",
            entity_id: str = "",
        ) -> None:
            normalized_event_id = str(event_id or "").strip()
            normalized_connector_id = str(connector_id or "").strip()
            signal_at = str(created_at or "").strip()
            normalized_entity_type = str(entity_type or "").strip()
            normalized_entity_id = str(entity_id or "").strip()
            entity_ref = (normalized_entity_type, normalized_entity_id) if normalized_entity_type and normalized_entity_id else None
            connector = connector_lookup.get(normalized_connector_id)
            if (
                not normalized_event_id
                or normalized_event_id in seen_connector_event_ids
                or not connector
                or not signal_at
                or (entity_ref is not None and entity_ref in seen_connector_entity_refs)
            ):
                return
            seen_connector_event_ids.add(normalized_event_id)
            if entity_ref is not None:
                seen_connector_entity_refs.add(entity_ref)
            connector_events.append(
                {
                    "id": normalized_event_id,
                    "connector_id": normalized_connector_id,
                    "connector_name": str(connector.get("name", "")).strip(),
                    "tenant": str(connector.get("tenant", "yangon-tyre")).strip() or "yangon-tyre",
                    "source": str(source or "").strip() or "Connector runtime",
                    "kind": str(kind or "").strip() or "event",
                    "title": str(title or "").strip() or str(connector.get("name", "")).strip() or "Connector event",
                    "detail": str(detail or "").strip(),
                    "route": str(route or "").strip() or "/app/connectors",
                    "severity": str(severity or "").strip() or "info",
                    "actor": str(actor or "").strip() or "System",
                    "created_at": signal_at,
                }
            )

        for row in connector_event_rows:
            _push_connector_event(
                event_id=str(row.get("event_id", "")).strip(),
                connector_id=str(row.get("connector_id", "")).strip(),
                source=str(row.get("source", "")).strip() or "Connector runtime",
                kind=str(row.get("kind", "")).strip() or "event",
                title=str(row.get("title", "")).strip() or "Connector event",
                detail=str(row.get("detail", "")).strip(),
                route=str(row.get("route", "")).strip(),
                severity=str(row.get("severity", "")).strip() or "info",
                actor=str(row.get("actor", "")).strip() or "System",
                created_at=str(row.get("created_at", "")).strip(),
                entity_type=str(row.get("entity_type", "")).strip(),
                entity_id=str(row.get("entity_id", "")).strip(),
            )

        audit_connector_defaults: dict[str, dict[str, str]] = {
            "receiving.record_created": {"connector_id": "ytf-shopfloor-entry", "source": "Receiving writeback", "route": "/app/operations", "kind": "receiving"},
            "quality.incident_created": {"connector_id": "ytf-shopfloor-entry", "source": "Quality writeback", "route": "/app/dqms", "kind": "quality_incident"},
            "quality.capa_created": {"connector_id": "ytf-shopfloor-entry", "source": "Quality CAPA", "route": "/app/dqms", "kind": "quality_capa"},
            "maintenance.record_created": {"connector_id": "ytf-shopfloor-entry", "source": "Maintenance writeback", "route": "/app/operations", "kind": "maintenance"},
            "metric.record_created": {"connector_id": "ytf-shopfloor-entry", "source": "Metric writeback", "route": "/app/insights", "kind": "metric"},
            "metric.records_bulk_saved": {"connector_id": "ytf-shopfloor-entry", "source": "Metric writeback", "route": "/app/insights", "kind": "metric_bulk"},
            "approval.entry_created": {"connector_id": "ytf-procurement-gmail", "source": "Approval queue", "route": "/app/approvals", "kind": "approval"},
            "approval.status_updated": {"connector_id": "ytf-procurement-gmail", "source": "Approval queue", "route": "/app/approvals", "kind": "approval_status"},
            "inventory.record_created": {"connector_id": "ytf-erp-export", "source": "Inventory writeback", "route": "/app/operations", "kind": "inventory"},
            "decision.entry_created": {"connector_id": "ytf-markdown-vault", "source": "Decision journal", "route": "/app/director", "kind": "decision"},
            "workspace_task.created": {"connector_id": "ytf-shopfloor-entry", "source": "Manager tasking", "route": "/app/adoption-command", "kind": "task"},
            "workspace_task.updated": {"connector_id": "ytf-shopfloor-entry", "source": "Manager tasking", "route": "/app/adoption-command", "kind": "task"},
        }

        for row in audit_rows:
            payload = row.get("payload", {}) if isinstance(row.get("payload", {}), dict) else {}
            if str(payload.get("connector_event_id", "")).strip():
                continue
            event_type = str(row.get("event_type", "")).strip()
            template = str(payload.get("template", "")).strip()
            default = audit_connector_defaults.get(event_type, {})
            connector_id = str(payload.get("connector_id", "")).strip() or str(default.get("connector_id", "")).strip()
            if template.startswith("connector_review:"):
                connector_id = template.split(":", 1)[1].strip() or connector_id
            if not connector_id:
                continue
            _push_connector_event(
                event_id=f"audit-{row.get('event_id', '')}",
                connector_id=connector_id,
                source=str(payload.get("source", "")).strip() or str(default.get("source", "")).strip() or "Connector runtime",
                kind=str(payload.get("event_kind", "")).strip() or str(default.get("kind", "")).strip() or event_type,
                title=str(row.get("summary", "")).strip() or "Connector audit event",
                detail=str(row.get("detail", "")).strip(),
                route=str(payload.get("route", "")).strip() or str(default.get("route", "")).strip() or "/app/connectors",
                severity=str(row.get("severity", "")).strip() or "info",
                actor=str(row.get("actor", "")).strip() or "System",
                created_at=str(row.get("created_at", "")).strip(),
                entity_type=str(row.get("entity_type", "")).strip(),
                entity_id=str(row.get("entity_id", "")).strip(),
            )

        for row in lead_rows[:3]:
            _push_connector_event(
                event_id=f"lead-{row.get('lead_id', '')}",
                connector_id="ytf-sales-gmail",
                source="Commercial intake",
                kind="lead",
                title=str(row.get("company_name", "")).strip() or "Lead update",
                detail=f"Stage {str(row.get('stage', '')).strip() or 'unknown'} owned by {str(row.get('owner', '')).strip() or 'team'}.",
                route="/app/revenue",
                severity="info",
                actor=str(row.get("owner", "")).strip() or "Revenue Pod",
                created_at=str(row.get("synced_at", "")).strip() or str(row.get("created_at", "")).strip(),
                entity_type="lead",
                entity_id=str(row.get("lead_id", "")).strip(),
            )
        for row in approval_rows[:3]:
            _push_connector_event(
                event_id=f"approval-{row.get('approval_id', '')}",
                connector_id="ytf-procurement-gmail",
                source="Approval queue",
                kind="approval",
                title=str(row.get("title", "")).strip() or "Approval review",
                detail=str(row.get("summary", "")).strip() or f"Gate {str(row.get('approval_gate', '')).strip() or 'general'} / status {str(row.get('status', '')).strip() or 'open'}.",
                route=str(row.get("related_route", "")).strip() or "/app/approvals",
                severity="warning" if str(row.get("status", "")).strip().lower() in {"pending", "review"} else "info",
                actor=str(row.get("owner", "")).strip() or str(row.get("requested_by", "")).strip() or "Procurement",
                created_at=str(row.get("created_at", "")).strip(),
                entity_type="approval",
                entity_id=str(row.get("approval_id", "")).strip(),
            )
        for row in supplier_rows[:2]:
            _push_connector_event(
                event_id=f"supplier-{row.get('risk_id', '')}",
                connector_id="ytf-procurement-gmail",
                source="Supplier recovery",
                kind="supplier_risk",
                title=str(row.get("title", "")).strip() or str(row.get("supplier", "")).strip() or "Supplier risk",
                detail=str(row.get("next_action", "")).strip() or str(row.get("summary", "")).strip() or "Supplier discrepancy needs review.",
                route="/app/approvals",
                severity="warning" if str(row.get("severity", "")).strip().lower() in {"high", "medium"} else "info",
                actor=str(row.get("owner", "")).strip() or "Procurement",
                created_at=str(row.get("synced_at", "")).strip() or str(row.get("eta", "")).strip(),
                entity_type="supplier_risk",
                entity_id=str(row.get("risk_id", "")).strip(),
            )
        for row in receiving_rows[:3]:
            _push_connector_event(
                event_id=f"receiving-{row.get('receiving_id', '')}",
                connector_id="ytf-shopfloor-entry",
                source="Receiving desk",
                kind="receiving",
                title=f"{str(row.get('supplier', '')).strip() or 'Supplier'} / {str(row.get('material', '')).strip() or 'material'}",
                detail=str(row.get("variance_note", "")).strip() or f"Status {str(row.get('status', '')).strip() or 'open'}.",
                route="/app/operations",
                severity="warning" if str(row.get("status", "")).strip().lower() in {"hold", "blocked", "review"} else "info",
                actor=str(row.get("owner", "")).strip() or "Receiving Control",
                created_at=str(row.get("received_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                entity_type="receiving_record",
                entity_id=str(row.get("receiving_id", "")).strip(),
            )
        for row in quality_rows[:3]:
            _push_connector_event(
                event_id=f"quality-{row.get('incident_id', '')}",
                connector_id="ytf-shopfloor-entry",
                source="DQMS writeback",
                kind="quality_incident",
                title=str(row.get("title", "")).strip() or "Quality incident",
                detail=str(row.get("summary", "")).strip() or f"Severity {str(row.get('severity', '')).strip() or 'unknown'} incident.",
                route="/app/dqms",
                severity="warning" if str(row.get("status", "")).strip().lower() not in {"closed", "resolved"} else "info",
                actor=str(row.get("owner", "")).strip() or "Quality Team",
                created_at=str(row.get("reported_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                entity_type="quality_incident",
                entity_id=str(row.get("incident_id", "")).strip(),
            )
        for row in maintenance_rows[:3]:
            _push_connector_event(
                event_id=f"maintenance-{row.get('maintenance_id', '')}",
                connector_id="ytf-shopfloor-entry",
                source="Maintenance writeback",
                kind="maintenance",
                title=str(row.get("asset_name", "")).strip() or "Maintenance issue",
                detail=str(row.get("next_action", "")).strip() or f"{str(row.get('issue_type', '')).strip() or 'Issue'} / status {str(row.get('status', '')).strip() or 'open'}.",
                route="/app/operations",
                severity="warning" if str(row.get("priority", "")).strip().lower() in {"high", "urgent"} else "info",
                actor=str(row.get("owner", "")).strip() or "Maintenance Team",
                created_at=str(row.get("logged_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                entity_type="maintenance_record",
                entity_id=str(row.get("maintenance_id", "")).strip(),
            )
        for row in metric_rows[:3]:
            _push_connector_event(
                event_id=f"metric-{row.get('metric_id', '')}",
                connector_id="ytf-shopfloor-entry",
                source="Metric intake",
                kind="metric",
                title=str(row.get("metric_name", "")).strip() or "Metric refresh",
                detail=f"{str(row.get('metric_group', '')).strip() or 'Metric'} / {str(row.get('period_label', '')).strip() or 'current period'}",
                route="/app/insights",
                severity="info",
                actor=str(row.get("owner", "")).strip() or "Management",
                created_at=str(row.get("captured_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                entity_type="metric",
                entity_id=str(row.get("metric_id", "")).strip(),
            )
        for row in decision_rows[:2]:
            _push_connector_event(
                event_id=f"decision-{row.get('decision_id', '')}",
                connector_id="ytf-markdown-vault",
                source="Decision journal",
                kind="decision",
                title=str(row.get("title", "")).strip() or "Decision update",
                detail=str(row.get("decision_text", "")).strip() or str(row.get("context", "")).strip() or "Decision memory updated.",
                route=str(row.get("related_route", "")).strip() or "/app/director",
                severity="info",
                actor=str(row.get("owner", "")).strip() or "Leadership",
                created_at=str(row.get("created_at", "")).strip(),
                entity_type="decision",
                entity_id=str(row.get("decision_id", "")).strip(),
            )
        for row in workspace_tasks[:4]:
            template = str(row.get("template", "")).strip()
            connector_id = template.split(":", 1)[1].strip() if template.startswith("connector_review:") else "ytf-shopfloor-entry"
            route = "/app/connectors" if template.startswith("connector_review:") else "/app/adoption-command"
            source = "Connector review task" if template.startswith("connector_review:") else "Manager tasking"
            _push_connector_event(
                event_id=f"task-{row.get('task_id', '')}",
                connector_id=connector_id,
                source=source,
                kind="task",
                title=str(row.get("title", "")).strip() or "Workspace task",
                detail=f"Priority {str(row.get('priority', '')).strip() or 'normal'} / status {str(row.get('status', '')).strip() or 'open'}.",
                route=route,
                severity="warning" if str(row.get("status", "")).strip().lower() != "done" else "info",
                actor=str(row.get("owner", "")).strip() or "Manager",
                created_at=str(row.get("updated_at", "")).strip() or str(row.get("created_at", "")).strip(),
                entity_type="workspace_task",
                entity_id=str(row.get("task_id", "")).strip(),
            )
        for row in latest_agent_runs[:6]:
            job_type = str(row.get("job_type", "")).strip()
            mapping = AGENT_JOB_CONNECTOR_MAP.get(job_type)
            if not mapping:
                continue
            _push_connector_event(
                event_id=f"agent-{row.get('run_id', '')}",
                connector_id=str(mapping.get("connector_id", "")).strip(),
                source=str(mapping.get("source", "Agent runtime")).strip(),
                kind=job_type or "agent_run",
                title=str(row.get("summary", "")).strip() or (job_type.replace("_", " ").title() if job_type else "Agent run"),
                detail=f"Status {str(row.get('status', '')).strip() or 'unknown'} via {str(row.get('source', '')).strip() or 'system'}.",
                route=str(mapping.get("route", "/app/runtime")).strip(),
                severity="warning" if str(row.get("status", "")).strip().lower() not in {"completed", "succeeded", "done"} else "info",
                actor=str(row.get("triggered_by", "")).strip() or "System",
                created_at=_runtime_run_timestamp(row),
                entity_type="agent_run",
                entity_id=str(row.get("run_id", "")).strip(),
            )

        github_event_detail = " | ".join(
            part
            for part in [
                f"Repo {github_repo_slug}" if github_repo_slug else "",
                f"Branch {github_branch}" if github_branch else "",
                f"Workflow {github_latest_run_name}" if github_latest_run_name else "",
                f"Status {github_latest_run_status}" if github_latest_run_status else "",
                f"Conclusion {github_latest_run_conclusion}" if github_latest_run_conclusion else "",
                "Remote URL embeds credentials" if github_remote_credential_embedded else "",
                "Workspace has uncommitted changes" if github_is_dirty else "",
                github_probe_message,
            ]
            if part
        )
        _push_connector_event(
            event_id="probe-github-build",
            connector_id="core-github-build",
            source="GitHub probe",
            kind="github_probe",
            title="GitHub build lane check",
            detail=github_event_detail or "GitHub build lane check completed.",
            route="/app/teams",
            severity="warning" if core_github_status in {"Warning", "Degraded"} else "info",
            actor="System",
            created_at=github_signal_at or datetime.now().astimezone().isoformat(),
            entity_type="github_repo",
            entity_id=github_repo_slug or "local-repo",
        )

        connector_events.sort(
            key=lambda item: _parse_iso_datetime(str(item.get("created_at", "")).strip()) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        connector_events = connector_events[:14]

        knowledge_collections = [
            {
                "id": "ytf-account-memory",
                "name": "YTF Account Memory",
                "tenant": "yangon-tyre",
                "status": "Warning" if lead_count else "Needs wiring",
                "owner": "Commercial Memory Pod",
                "purpose": "Keep leads, quotes, follow-up tasks, and founder briefs attached to the same account history.",
                "sources": ["lead pipeline", "sales Gmail", "founder brief", "workspace tasks"],
                "canonicalRecords": ["account", "contact", "quote thread", "next action"],
                "relations": ["account -> contact", "account -> quote", "account -> next action"],
                "consumers": ["sales system", "founder brief", "director review"],
                "qualityChecks": ["duplicate account detection", "quote-stage normalization", "follow-up ownership"],
                "nextMove": "Promote thread and quote metadata into reusable account memory fields instead of keeping them in summaries only.",
            },
            {
                "id": "ytf-supplier-recovery-graph",
                "name": "YTF Supplier Recovery Graph",
                "tenant": "yangon-tyre",
                "status": "Warning" if supplier_count or receiving_count or pending_approval_count else "Needs wiring",
                "owner": "Supplier Recovery Pod",
                "purpose": "Map suppliers, shipments, GRN exceptions, claims, and approvals into one recovery graph.",
                "sources": ["procurement review", "approvals", "receiving records", "ERP exports"],
                "canonicalRecords": ["supplier", "shipment", "GRN exception", "claim", "approval packet"],
                "relations": ["supplier -> shipment", "shipment -> exception", "claim -> approval packet"],
                "consumers": ["operations inbox", "approval desk", "director review"],
                "qualityChecks": ["supplier identity normalization", "exception-to-claim mapping", "evidence completeness"],
                "nextMove": "Make receiving, approvals, and ERP drift open and resolve supplier recovery work automatically.",
            },
            {
                "id": "ytf-quality-canon",
                "name": "YTF Quality Canon",
                "tenant": "yangon-tyre",
                "status": "Warning" if quality_count or receiving_count else "Needs wiring",
                "owner": "Quality Watch Pod",
                "purpose": "Convert inspection evidence, holds, and closeout notes into auditable quality records.",
                "sources": ["quality incidents", "receiving evidence", "approvals", "operator notes"],
                "canonicalRecords": ["quality issue", "batch evidence", "closeout decision", "supplier impact"],
                "relations": ["issue -> batch", "issue -> supplier", "closeout -> approver"],
                "consumers": ["receiving control", "quality closeout", "director review"],
                "qualityChecks": ["batch reference completeness", "approval linkage", "evidence freshness"],
                "nextMove": "Attach file revisions and closeout approvals to the same canonical issue lifecycle.",
            },
            {
                "id": "core-product-memory",
                "name": "SuperMega Product Memory",
                "tenant": "core",
                "status": "Healthy" if portfolio_manifest else "Warning",
                "owner": "Knowledge Systems",
                "purpose": "Keep product lines, release trains, competitive fronts, and tenant proofs reusable across the company.",
                "sources": ["portfolio manifest", "agent team snapshot", "product ops decisions", "build notes"],
                "canonicalRecords": ["product line", "release train", "tenant proof", "competitive front"],
                "relations": ["product line -> release train", "tenant proof -> product line", "gap -> next build"],
                "consumers": ["product ops", "build studio", "platform admin"],
                "qualityChecks": ["program ownership completeness", "proof freshness", "release-gate coverage"],
                "nextMove": "Attach real delivery state and rollout milestones to each product line instead of relying on static manifests alone.",
            },
            {
                "id": "core-knowledge-runtime",
                "name": "Core Knowledge Runtime",
                "tenant": "core",
                "status": "Warning" if autonomy_score or agent_snapshot_generated_at else "Needs wiring",
                "owner": "Knowledge Graph Pod",
                "purpose": "Maintain canonical documents, entities, relations, provenance, and promotion rules as a shared service layer.",
                "sources": ["document intake", "decision journal", "structured forms", "tenant notes"],
                "canonicalRecords": ["document", "entity", "relation", "provenance link"],
                "relations": ["document -> entity", "entity -> relation", "relation -> source"],
                "consumers": ["document intelligence", "decision journal", "future retrieval services"],
                "qualityChecks": ["provenance completeness", "entity collision review", "relation confidence"],
                "nextMove": "Land shared retrieval and relation-repair services so several modules trust the same memory layer.",
            },
        ]

        policy_guardrails = [
            {
                "id": "connector-scope-change",
                "name": "Connector scope change review",
                "domain": "Connector",
                "status": "Healthy" if gmail_ready else "Warning",
                "scope": "Mailbox access, Drive access, ERP import scope, and source credentials",
                "trigger": "Any request to widen connector scope or inherit a tenant source",
                "automation": "Prepare a scope diff, impacted workspaces, and owner summary for review",
                "approvalGate": "Platform Admin approval required before connector scope expands",
                "auditSignals": ["scope diff", "workspace impact list", "credential rotation log"],
                "failureMode": "Connector sprawl or hidden access paths across tenants",
            },
            {
                "id": "knowledge-promotion",
                "name": "Knowledge canon promotion",
                "domain": "Knowledge",
                "status": "Warning" if decision_count or lead_count or supplier_count else "Needs wiring",
                "scope": "Promotion of extracted entities, relations, and document structures into canonical records",
                "trigger": "Confidence gaps, schema changes, or tenant-specific structures proposed for reuse",
                "automation": "Queue promotion proposals with provenance and rejection reasons",
                "approvalGate": "Implementation Lead or Knowledge Systems sign-off for schema-impacting promotions",
                "auditSignals": ["promotion confidence", "rejection rate", "schema change log"],
                "failureMode": "Weak extractions become shared source-of-truth records",
            },
            {
                "id": "autonomous-write-boundary",
                "name": "Autonomous write boundary",
                "domain": "Autonomy",
                "status": "Healthy" if autonomy_score >= 75 and pending_approval_count <= 1 else "Warning",
                "scope": "Agent-created tasks, briefs, draft replies, and assisted operational updates",
                "trigger": "Any non-draft write outside approved low-risk fields",
                "automation": "Downgrade medium-risk writes to proposals and attach evidence before review",
                "approvalGate": top_approval_gate or "Manager review",
                "auditSignals": ["proposed vs accepted writes", "pending approval count", "agent reversal rate"],
                "failureMode": "Agents drift from prep work into uncontrolled operational edits",
            },
            {
                "id": "sensitive-field-protection",
                "name": "Sensitive field protection",
                "domain": "Security",
                "status": "Needs wiring",
                "scope": "Pricing, settlement, claims, finance adjustments, and personnel-sensitive notes",
                "trigger": "Read or write touches a protected field class",
                "automation": "Mask fields, log access reason, and route writes through elevated approval",
                "approvalGate": "Tenant Admin plus Finance Controller approval for protected writes",
                "auditSignals": ["masked-field access log", "approval latency", "policy bypass attempts"],
                "failureMode": "Sensitive records leak across roles or autonomous runs",
            },
            {
                "id": "sandbox-regression-pack",
                "name": "Sandbox regression pack",
                "domain": "Security",
                "status": "Warning" if core_github_status != "Needs wiring" else "Needs wiring",
                "scope": "Shell execution, workspace isolation, filesystem boundaries, and tool permissions",
                "trigger": "Any change to the agent runtime template, tool permissions, or workspace image",
                "automation": "Run sandbox escape and least-privilege regression scenarios before runtime promotion",
                "approvalGate": "Platform Admin and Security Admin sign-off before runtime promotion",
                "auditSignals": ["sandbox regression results", "workspace template diff", "tool permission diff"],
                "failureMode": "A coding or browser agent gains reach outside its bounded workspace",
            },
            {
                "id": "untrusted-content-quarantine",
                "name": "Untrusted content quarantine",
                "domain": "Connector",
                "status": "Warning" if lead_count or supplier_count or quality_count else "Needs wiring",
                "scope": "Emails, web results, docs, chat, and uploaded content entering tool-using runs",
                "trigger": "External content lands in a run with tools or writeback authority",
                "automation": "Separate raw content from action prompts, preserve provenance, and downgrade risky actions to review tasks",
                "approvalGate": "Connector review required before untrusted content can drive non-draft actions",
                "auditSignals": ["content provenance links", "downgraded action count", "tool-triggered review tasks"],
                "failureMode": "Prompt injection or hostile instructions travel from external content into tool use",
            },
            {
                "id": "memory-poisoning-review",
                "name": "Memory poisoning review",
                "domain": "Knowledge",
                "status": "Warning" if decision_count or lead_count or supplier_count else "Needs wiring",
                "scope": "Persistent memory, reusable skills, learned preferences, and canonical promotions",
                "trigger": "A memory record, skill pack, or canon promotion is proposed for reuse",
                "automation": "Require provenance, confidence, and rollback path before shared memory or skills expand",
                "approvalGate": "Knowledge Systems review required for reusable memory and skill changes",
                "auditSignals": ["memory rollback log", "skill change approvals", "shared-canon rejection rate"],
                "failureMode": "A poisoned memory or unsafe skill silently spreads across workspaces and agents",
            },
            {
                "id": "release-gate-enforcement",
                "name": "Release gate enforcement",
                "domain": "Release",
                "status": "Healthy" if portfolio_manifest and focus_products else "Warning",
                "scope": "Promotion of tenant proofs into reusable product modules and enterprise claims",
                "trigger": "Any product line proposed for release-train promotion or portfolio graduation",
                "automation": "Assemble proof links, delivery state, tenant evidence, and blockers into one gate packet",
                "approvalGate": "Module Factory and Governance Runtime approval required before promotion",
                "auditSignals": ["release packet completeness", "tenant proof count", "support posture sign-off"],
                "failureMode": "Prototype-level features are marketed as enterprise-ready modules",
            },
        ]

        autonomy_loops = [
            {
                "id": "ytf-commercial-memory-loop",
                "name": "YTF commercial memory loop",
                "tenant": "yangon-tyre",
                "status": sales_gmail_status,
                "owner": "Commercial Memory Pod",
                "workspace": "ytf/commercial-memory",
                "surface": "Sales System",
                "cadence": "Hourly",
                "automation": "Promote sales activity, lead changes, and quote context into account memory and next-step drafts.",
                "approvalGate": "Sales lead review for any customer-facing output",
                "backlog": f"{lead_count} leads in pipeline and {len(open_workspace_tasks)} open follow-up tasks still need cleaner memory joins.",
                "nextMove": "Bind Gmail, company records, and quote history into one account timeline that survives handoffs.",
                "risks": [
                    "The loop is driven by revenue-scout outputs rather than a dedicated commercial event stream.",
                    "Quote-stage truth can drift between people and records.",
                ],
            },
            {
                "id": "ytf-supplier-recovery-loop",
                "name": "YTF supplier recovery loop",
                "tenant": "yangon-tyre",
                "status": _runtime_health_from_team_status(str(team_lookup.get("control_tower", {}).get("status", ""))) if team_lookup else procurement_gmail_status,
                "owner": "Supplier Recovery Pod",
                "workspace": "ytf/supplier-recovery",
                "surface": "Operations Inbox",
                "cadence": "Twice daily",
                "automation": "Cluster approvals, receiving holds, and supplier risk signals into one recovery queue.",
                "approvalGate": "Procurement lead review before claim or escalation writes",
                "backlog": f"{supplier_count} supplier risks, {hold_count} holds, {pending_approval_count} approvals still waiting.",
                "nextMove": "Open and close supplier recovery work automatically from GRN, claim, and document-state changes.",
                "risks": [
                    "Supplier recovery still leans on manual evidence assembly.",
                    "Mailbox, ERP, and receiving states are not yet one canonical graph.",
                ],
            },
            {
                "id": "ytf-quality-watch-loop",
                "name": "YTF quality watch loop",
                "tenant": "yangon-tyre",
                "status": "Warning" if quality_count or receiving_count else "Needs wiring",
                "owner": "Quality Watch Pod",
                "workspace": "ytf/plant-quality",
                "surface": "Receiving Control",
                "cadence": "Hourly",
                "automation": "Watch inspection evidence, receiving issues, and approval state for stale quality work.",
                "approvalGate": "Quality manager review for closeout and supplier-impact writes",
                "backlog": f"{quality_count} incidents, {receiving_count} receiving rows, {variance_count} unresolved variance signals.",
                "nextMove": "Tie file revisions and closeout approvals to the same canonical quality lifecycle.",
                "risks": [
                    "Photo and batch evidence still need stronger joins.",
                    "Quality closeout remains more process-accurate than data-model-accurate.",
                ],
            },
            {
                "id": "core-release-watch-loop",
                "name": "Core release watch loop",
                "tenant": "core",
                "status": core_github_status,
                "owner": "Release Watch Pod",
                "workspace": "core/build",
                "surface": "Product Ops",
                "cadence": "Daily",
                "automation": "Watch portfolio memory, founder brief signals, and unresolved blockers before a module is promoted.",
                "approvalGate": "Build and Platform Admin review before portfolio or tenant-promotion claims",
                "backlog": f"{len(focus_products)} focus products and {len(team_gaps)} scaling gaps still require explicit release evidence.",
                "nextMove": "Attach delivery state, release gates, and rollout milestones directly to each product line.",
                "risks": [
                    "The company has program structure, but delivery truth is not fully attached yet.",
                ],
            },
            {
                "id": "core-runtime-governance-loop",
                "name": "Core runtime governance loop",
                "tenant": "core",
                "status": _runtime_status_from_timestamp(task_run_at or ops_watch_run_at, "hourly", missing="Warning" if agent_team_status else "Needs wiring"),
                "owner": "Governance Runtime",
                "workspace": "core/runtime-governance",
                "surface": "Runtime",
                "cadence": "Hourly",
                "automation": "Compare agent health, approval pressure, and tenant-control posture before autonomy expands.",
                "approvalGate": "Platform Admin approval for new medium-risk autonomous write paths",
                "backlog": f"{pending_approval_count} pending approvals, autonomy score {autonomy_score}, team posture {agent_team_status or 'unknown'}.",
                "nextMove": "Join connector lag, canon confidence, and policy health into one promotion gate.",
                "risks": [
                    "The runtime desk exists, but it still needs stronger backend truth to gate new autonomy automatically.",
                ],
            },
        ]

        agent_capability_cells = [
            {
                "id": "ytf-commercial-pod",
                "name": "YTF commercial pod",
                "tenant": "yangon-tyre",
                "status": sales_gmail_status,
                "workspace": "ytf/commercial-memory",
                "mission": "Turn inbox, quote, and lead movement into controlled account memory and next-step drafts.",
                "trustBoundary": "Sandboxed workspace, connector-limited mailbox access, and draft-only external writes.",
                "toolClasses": ["Gmail connector", "knowledge memory", "skills", "task writeback"],
                "dataSources": ["sales Gmail", "lead pipeline", "quote packs", "manager tasks"],
                "allowedActions": ["read evidence", "classify threads", "open tasks", "draft follow-ups", "propose account updates"],
                "approvalGate": "Sales lead review for customer-facing writes",
                "observability": ["connector ledger", "workspace task review", "founder brief trace"],
                "nextMove": "Persist thread and attachment deltas as first-class account events instead of summary-only memory.",
                "risks": [
                    "External mail can carry prompt injection.",
                    "Attachment lineage is still thinner than commercial memory needs.",
                ],
            },
            {
                "id": "ytf-supplier-recovery-pod",
                "name": "YTF supplier recovery pod",
                "tenant": "yangon-tyre",
                "status": procurement_gmail_status,
                "workspace": "ytf/supplier-recovery",
                "mission": "Bind supplier mail, approvals, GRN drift, and receiving holds into one recovery queue.",
                "trustBoundary": "Read-heavy evidence gathering with packet drafting only; no direct supplier writes.",
                "toolClasses": ["Gmail connector", "approvals runtime", "ERP evidence", "skills"],
                "dataSources": ["procurement Gmail", "approvals", "receiving exceptions", "ERP exports"],
                "allowedActions": ["cluster evidence", "score packet completeness", "open escalation tasks", "draft claims"],
                "approvalGate": "Procurement lead review for supplier-facing or finance-sensitive writes",
                "observability": ["approval history", "connector events", "hold queue aging", "review tasks"],
                "nextMove": "Add mailbox-native and ERP-native deltas so supplier recovery stops depending on inferred state.",
                "risks": [
                    "Supplier identity drifts across systems.",
                    "Claims can move faster than supporting evidence joins.",
                ],
            },
            {
                "id": "ytf-quality-watch-pod",
                "name": "YTF quality watch pod",
                "tenant": "yangon-tyre",
                "status": drive_quality_status,
                "workspace": "ytf/plant-quality",
                "mission": "Keep DQMS evidence, receiving variance, and closeout state attached to the same quality lifecycle.",
                "trustBoundary": "Drive and writeback evidence can trigger tasks, but closeout writes stay manager-gated.",
                "toolClasses": ["Drive connector", "document intake", "human entry", "skills"],
                "dataSources": ["Drive folders", "receiving photos", "DQMS forms", "metric intake"],
                "allowedActions": ["index evidence", "open quality tasks", "score freshness", "propose closeout packets"],
                "approvalGate": "Quality manager review for supplier-impact and closeout writes",
                "observability": ["file lineage", "issue aging", "variance queue", "metric drift"],
                "nextMove": "Promote file revisions and KPI changes into the same canonical DQMS event stream.",
                "risks": [
                    "Folder structure is still partly human-disciplined.",
                    "Photo evidence can land without batch identifiers.",
                ],
            },
            {
                "id": "core-build-pod",
                "name": "Core build pod",
                "tenant": "core",
                "status": core_github_status,
                "workspace": "core/build-studio",
                "mission": "Design, code, test, and package reusable modules from bounded cloud workspaces.",
                "trustBoundary": "Sandboxed coding workspace, branch isolation, CI checks, and release-gated promotion.",
                "toolClasses": ["GitHub feed", "shell", "apply patch", "skills", "QA tooling"],
                "dataSources": ["repo state", "release notes", "product memory", "runtime findings"],
                "allowedActions": ["code changes", "test runs", "release packet prep", "preview packaging"],
                "approvalGate": "Build and Platform Admin review for release and portfolio promotion",
                "observability": ["run history", "release desk", "CI status", "runtime governance"],
                "nextMove": "Attach live issue, PR, and release state directly to every product line and launch packet.",
                "risks": [
                    "Long-horizon coding still needs stronger automated evals.",
                    "Release truth is ahead of delivery telemetry.",
                ],
            },
            {
                "id": "core-governance-pod",
                "name": "Core governance pod",
                "tenant": "core",
                "status": _runtime_status_from_timestamp(task_run_at or ops_watch_run_at, "hourly", missing="Warning" if agent_team_status else "Needs wiring"),
                "workspace": "core/runtime-governance",
                "mission": "Decide when a connector, skill, or autonomous write path is safe enough to scale.",
                "trustBoundary": "Read across runtime evidence, but all medium-risk autonomy expansion stays approval-backed.",
                "toolClasses": ["policy engine", "connector ledger", "knowledge review", "audit logs"],
                "dataSources": ["runtime control", "cloud ops", "connector events", "approval queues"],
                "allowedActions": ["open review tasks", "downgrade writes", "block promotion", "package evidence"],
                "approvalGate": "Platform Admin approval for new medium-risk autonomous capabilities",
                "observability": ["guardrail status", "connector lag", "approval pressure", "rollback evidence"],
                "nextMove": "Join eval traces, sandbox regressions, and connector trust into one promotion gate.",
                "risks": [
                    "Governance posture is visible before it is fully enforced.",
                    "Memory and skill rollback still need harder controls.",
                ],
            },
        ]

        model_routing_profiles = [
            {
                "id": "frontier-governance",
                "name": "Frontier planner and reviewer",
                "status": "Healthy",
                "preferredModel": "gpt-5.4",
                "fallbackModel": "gpt-5.4-mini",
                "reasoning": "high to xhigh",
                "useCase": "Architecture, policy synthesis, executive review, cross-workspace root-cause analysis, and approval packets.",
                "tools": ["file search", "web research", "connector context", "structured outputs"],
                "safeguards": ["citation-backed research", "approval before medium-risk writes", "evidence packet required"],
                "nextMove": "Attach scored evals for approval quality, architecture diffs, and escalation decisions.",
            },
            {
                "id": "codex-builder",
                "name": "Long-horizon coding builder",
                "status": "Healthy",
                "preferredModel": "gpt-5.3-codex",
                "fallbackModel": "gpt-5.4-mini",
                "reasoning": "medium to high",
                "useCase": "Repo navigation, controlled code changes, refactors, and production-grade software implementation.",
                "tools": ["shell", "apply patch", "tests", "repo history", "skills"],
                "safeguards": ["sandboxed workspaces", "bounded write scope", "build or syntax verification"],
                "nextMove": "Route larger migrations and multi-file implementation work here by default, then feed results to review and QA lanes.",
            },
            {
                "id": "crew-operator",
                "name": "High-volume crew operator",
                "status": "Healthy",
                "preferredModel": "gpt-5.4-mini",
                "fallbackModel": "gpt-5.4-nano",
                "reasoning": "low to medium",
                "useCase": "Subagents, browser-based verification, skill execution, daily bug sweeps, and repetitive workflow steps.",
                "tools": ["computer use", "connector calls", "task queues", "skills", "tool search"],
                "safeguards": ["task scoping", "queue isolation", "approval for external writes", "trace logging"],
                "nextMove": "Move routine QA, bug triage, and connector review loops into this lane with stronger eval coverage.",
            },
            {
                "id": "extract-classify",
                "name": "Extraction and ranking lane",
                "status": "Warning",
                "preferredModel": "gpt-5.4-nano",
                "fallbackModel": "gpt-5.4-mini",
                "reasoning": "low",
                "useCase": "Classification, data extraction, ranking, feature generation, and cheap background workers.",
                "tools": ["structured outputs", "retrieval", "batch jobs", "MCP/connectors"],
                "safeguards": ["schema validation", "confidence thresholds", "promotion review before canon writeback"],
                "nextMove": "Push inbox triage, document parsing, revision scoring, and KPI feature extraction into durable background jobs.",
            },
        ]

        updated_at = _runtime_latest_timestamp(
            [
                connector_event_latest,
                sales_signal_at,
                markdown_signal_at,
                shopfloor_signal_at,
                task_run_at,
                ops_watch_run_at,
                github_release_watch_run_at,
                procurement_signal_at,
                drive_signal_at,
                erp_signal_at,
                github_signal_at,
                latest_approval_at,
                latest_decision_at,
                agent_snapshot_generated_at,
                portfolio_generated_at,
            ]
        )

        return {
            "status": "ready",
            "updated_at": updated_at,
            "tenant_state": tenant_state,
            "connectors": connectors,
            "connector_events": connector_events,
            "knowledge_collections": knowledge_collections,
            "policy_guardrails": policy_guardrails,
            "autonomy_loops": autonomy_loops,
            "agent_capability_cells": agent_capability_cells,
            "model_routing_profiles": model_routing_profiles,
            "big_picture": {
                "thesis": "SuperMega is turning scattered workflow tools into one AI-native runtime with shared memory, guarded automation, and productized modules.",
                "current_truth": [
                    f"{len(connectors)} connector lanes tracked from live workspace and state signals.",
                    f"{len(connector_events)} connector events now flow through a dedicated append-only ledger with audit-linked fallback for older evidence.",
                    f"{len(knowledge_collections)} knowledge collections described with explicit promotion paths.",
                    f"{len(policy_guardrails)} guardrails defined for connector, knowledge, autonomy, security, and release control.",
                    f"{len(autonomy_loops)} autonomy loops visible as bounded operational contracts.",
                    f"{len(agent_capability_cells)} agent capability cells now define workspace, data, tool, and approval boundaries.",
                    f"{len(model_routing_profiles)} model routing profiles now separate planning, coding, crew, and extraction lanes.",
                ],
                "next_builds": [
                    "Bind Gmail, Drive, ERP, analytics, and chat connectors to emit native delta events into the connector spine.",
                    "Turn sandbox regressions, memory rollback, and eval traces into enforceable promotion gates.",
                    "Tie GitHub delivery state directly to Product Ops release trains and graduation gates.",
                    "Promote connector deltas into canonical records, task creation, and manager writeback loops automatically.",
                ],
            },
        }

    def _latest_timestamp_from_rows(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> str:
        best = ""
        for row in rows:
            if not isinstance(row, dict):
                continue
            for key in keys:
                value = str(row.get(key, "")).strip()
                if value and value > best:
                    best = value
        return best

    def _latest_signal(values: list[str]) -> str:
        best: datetime | None = None
        for value in values:
            parsed = _parse_iso_datetime(value)
            if parsed is None:
                continue
            if best is None or parsed > best:
                best = parsed
        return best.isoformat() if best is not None else ""

    def _score_percent(matched: int, total: int) -> int:
        if total <= 0:
            return 0
        return max(0, min(100, int(round((matched / total) * 100))))

    def _count_complete_rows(rows: list[dict[str, Any]], required_fields: tuple[str, ...]) -> int:
        matched = 0
        for row in rows:
            if not isinstance(row, dict):
                continue
            if all(str(row.get(field, "")).strip() for field in required_fields):
                matched += 1
        return matched

    def _count_active_rows(rows: list[dict[str, Any]], *, status_key: str = "status") -> int:
        closed_statuses = {"closed", "done", "resolved", "approved", "released", "won", "lost", "mitigated", "cleared", "completed"}
        return sum(1 for row in rows if str(row.get(status_key, "")).strip().lower() not in closed_statuses)

    def _count_overdue_rows(rows: list[dict[str, Any]], *, due_key: str = "due", status_key: str = "status") -> int:
        now = datetime.now(timezone.utc)
        closed_statuses = {"closed", "done", "resolved", "approved", "released", "won", "lost", "mitigated", "cleared", "completed"}
        overdue = 0
        for row in rows:
            status = str(row.get(status_key, "")).strip().lower()
            if status in closed_statuses:
                continue
            parsed_due = _parse_iso_datetime(str(row.get(due_key, "")).strip())
            if parsed_due and parsed_due < now:
                overdue += 1
        return overdue

    def _average_scores(values: list[int]) -> int:
        usable = [int(value) for value in values if isinstance(value, int)]
        if not usable:
            return 0
        return int(round(sum(usable) / len(usable)))

    def _adoption_score(completeness_score: int, last_activity_at: str, cadence: str, *, stale_count: int, live_count: int) -> int:
        freshness_status = _runtime_status_from_timestamp(last_activity_at, cadence, missing="Needs wiring")
        freshness_score = {
            "Healthy": 100,
            "Warning": 72,
            "Degraded": 40,
            "Needs wiring": 20,
        }.get(freshness_status, 20)
        stale_penalty = min(26, max(0, int(stale_count)) * 5)
        live_bonus = min(10, max(0, int(live_count)))
        return max(0, min(100, int(round(completeness_score * 0.6 + freshness_score * 0.4 + live_bonus - stale_penalty))))

    def _adoption_status(score: int, last_activity_at: str, cadence: str, *, has_live_signal: bool) -> str:
        if not has_live_signal and not str(last_activity_at or "").strip():
            return "Needs wiring"
        freshness_status = _runtime_status_from_timestamp(last_activity_at, cadence, missing="Needs wiring")
        if freshness_status == "Healthy" and score >= 85:
            return "Healthy"
        if freshness_status in {"Healthy", "Warning"} and score >= 65:
            return "Warning"
        return "Degraded"

    def _data_fabric_payload(session: dict[str, Any]) -> dict[str, Any]:
        workspace_id = str(session.get("workspace_id", "")).strip()
        lead_summary = enterprise_load_lead_summary(enterprise_db_url, workspace_id=workspace_id) if workspace_id else {}
        lead_rows = enterprise_list_leads(enterprise_db_url, workspace_id=workspace_id, limit=200) if workspace_id else []
        workspace_tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=200) if workspace_id else []
        latest_agent_runs = enterprise_list_agent_runs(enterprise_db_url, workspace_id=workspace_id, limit=50) if workspace_id else []
        connector_event_rows = enterprise_list_connector_events(enterprise_db_url, workspace_id=workspace_id, limit=160) if workspace_id else []
        latest_agent_runs_by_type = _group_agent_runs_by_job_type(latest_agent_runs)
        decision_rows = list_decision_entries(state_db, limit=200)
        approval_rows = list_approval_entries(state_db, limit=200)
        capa_rows = list_capa_actions(state_db, limit=200)
        quality_rows = list_quality_incidents(state_db, limit=200)
        supplier_rows = list_supplier_risks(state_db, limit=200)
        receiving_rows = list_receiving_records(state_db, limit=200)
        maintenance_rows = list_maintenance_records(state_db, limit=200)
        metric_rows = list_metric_entries(state_db, limit=200)

        lead_count = int(lead_summary.get("lead_count", 0) or 0)
        receiving_count = len(receiving_rows)
        receiving_hold_count = sum(
            1
            for row in receiving_rows
            if str(row.get("status", "")).strip().lower() in {"hold", "blocked", "review"}
            or str(row.get("variance_note", "")).strip().lower() not in {"", "matched"}
        )
        quality_incident_count = len(quality_rows)
        supplier_risk_count = len(supplier_rows)
        maintenance_count = len(maintenance_rows)
        metric_count = len(metric_rows)
        connector_change_count = len(connector_event_rows)
        pending_approval_count = sum(1 for row in approval_rows if str(row.get("status", "")).strip().lower() in {"pending", "review"})
        open_task_count = sum(1 for row in workspace_tasks if str(row.get("status", "")).strip().lower() != "done")

        revenue_scout_run = latest_agent_runs_by_type.get("revenue_scout", {}) if isinstance(latest_agent_runs_by_type, dict) else {}
        ops_watch_run = latest_agent_runs_by_type.get("ops_watch", {}) if isinstance(latest_agent_runs_by_type, dict) else {}
        founder_brief_run = latest_agent_runs_by_type.get("founder_brief", {}) if isinstance(latest_agent_runs_by_type, dict) else {}
        task_triage_run = latest_agent_runs_by_type.get("task_triage", {}) if isinstance(latest_agent_runs_by_type, dict) else {}
        revenue_scout_run_at = _runtime_run_timestamp(revenue_scout_run)
        ops_watch_run_at = _runtime_run_timestamp(ops_watch_run)
        founder_brief_run_at = _runtime_run_timestamp(founder_brief_run)
        task_triage_run_at = _runtime_run_timestamp(task_triage_run)

        sales_fabric_status = "live" if lead_count or revenue_scout_run_at else "mapped"
        plant_fabric_status = "live" if receiving_count or maintenance_count or ops_watch_run_at else "mapped"
        quality_fabric_status = "live" if quality_incident_count or metric_count else "mapped"
        supplier_fabric_status = "live" if supplier_risk_count or pending_approval_count else "mapped"
        executive_fabric_status = "live" if founder_brief_run_at or metric_count else "mapped"

        lead_latest = _latest_timestamp_from_rows(lead_rows, ("synced_at", "created_at"))
        decision_latest = _latest_timestamp_from_rows(decision_rows, ("created_at",))
        approval_latest = _latest_timestamp_from_rows(approval_rows, ("created_at",))
        supplier_latest = _latest_timestamp_from_rows(supplier_rows, ("synced_at", "eta"))
        receiving_latest = _latest_timestamp_from_rows(receiving_rows, ("received_at", "synced_at"))
        quality_latest = _latest_timestamp_from_rows(quality_rows, ("reported_at", "synced_at"))
        maintenance_latest = _latest_timestamp_from_rows(maintenance_rows, ("logged_at", "synced_at"))
        metric_latest = _latest_timestamp_from_rows(metric_rows, ("captured_at", "synced_at"))
        task_latest = _latest_timestamp_from_rows(workspace_tasks, ("updated_at", "created_at"))
        connector_change_latest = _latest_timestamp_from_rows(connector_event_rows, ("created_at",))

        drive_signal_at = _latest_signal([receiving_latest, quality_latest, maintenance_latest, metric_latest])
        commercial_signal_at = _latest_signal([lead_latest, revenue_scout_run_at])
        procurement_signal_at = _latest_signal([approval_latest, supplier_latest])
        executive_signal_at = _latest_signal([decision_latest, founder_brief_run_at, metric_latest])
        shopfloor_signal_at = _latest_signal([receiving_latest, quality_latest, maintenance_latest, metric_latest, ops_watch_run_at, task_latest])
        governance_signal_at = _latest_signal([decision_latest, task_triage_run_at, founder_brief_run_at])
        erp_signal_at = _latest_signal([receiving_latest, metric_latest])
        connector_probe_checked_at = datetime.now().astimezone().isoformat()
        config = _load_runtime_config()
        gmail_runtime = _gmail_probe_from_config(config).probe()
        drive_runtime = _drive_probe_from_config(config).probe()
        gmail_probe_status = str(gmail_runtime.get("status", "")).strip().lower()
        gmail_probe_message = str(gmail_runtime.get("message", "")).strip()
        gmail_probe_email = str(gmail_runtime.get("email_address", "")).strip()
        gmail_messages_total = int(gmail_runtime.get("messages_total", 0) or 0)
        drive_probe_status = str(drive_runtime.get("status", "")).strip().lower()
        drive_probe_message = str(drive_runtime.get("message", "")).strip()
        drive_folder = drive_runtime.get("folder", {}) if isinstance(drive_runtime.get("folder", {}), dict) else {}
        drive_folder_name = str(drive_folder.get("name", "")).strip()
        drive_drive_user = str(drive_runtime.get("drive_user", "")).strip()
        drive_children_sampled = int(drive_runtime.get("children_count_sampled", 0) or 0)
        drive_sample_children = drive_runtime.get("sample_children", []) if isinstance(drive_runtime.get("sample_children", []), list) else []
        drive_sample_names = [
            str(item.get("name", "")).strip()
            for item in drive_sample_children
            if isinstance(item, dict) and str(item.get("name", "")).strip()
        ][:3]

        def _probe_registry_status(raw_status: str, *, has_signal: bool) -> str:
            normalized = str(raw_status or "").strip().lower()
            if normalized == "ready" and has_signal:
                return "live"
            if normalized == "not_configured":
                return "next"
            return "mapped"

        def _probe_health_status(raw_status: str, *, has_signal: bool) -> str:
            normalized = str(raw_status or "").strip().lower()
            if normalized == "ready":
                return "Healthy" if has_signal else "Warning"
            if normalized in {"reauth_required", "error"}:
                return "Degraded"
            if normalized in {"storage_quota_blocked", "dependency_missing"}:
                return "Warning"
            if normalized in {"not_configured", "missing_client_secret", "missing_token_path", "missing_token_file", "missing_file"}:
                return "Needs wiring"
            return "Warning" if has_signal else "Needs wiring"

        def _connector_probe_freshness(
            signal_at: str,
            *,
            fallback: str,
            raw_status: str,
            probe_message: str,
            ready_detail: str,
        ) -> str:
            signal_phrase = _runtime_freshness_label(signal_at, fallback="")
            normalized = str(raw_status or "").strip().lower()
            detail = ready_detail if normalized == "ready" else (probe_message or fallback)
            if signal_phrase:
                return f"{signal_phrase}; {detail}"
            return detail or fallback

        commercial_registry_status = _probe_registry_status(
            gmail_probe_status,
            has_signal=bool(commercial_signal_at or lead_count),
        )
        procurement_registry_status = _probe_registry_status(
            gmail_probe_status,
            has_signal=bool(procurement_signal_at or pending_approval_count or supplier_risk_count),
        )
        drive_registry_status = _probe_registry_status(
            drive_probe_status,
            has_signal=bool(drive_signal_at or receiving_count or quality_incident_count or maintenance_count),
        )

        source_registry = [
            {
                "id": "plant-a-drive-spine",
                "name": "Plant A Drive evidence spine",
                "source_type": "Google Drive",
                "status": drive_registry_status,
                "coverage": (
                    f"Folder {drive_folder_name or 'configured Drive root'} sampled {drive_children_sampled} children for Plant A evidence, quality logs, maintenance traces, and KPI workbooks."
                    if drive_probe_status == "ready"
                    else "Plant A folders, quality evidence, maintenance logs, and KPI workbooks are mapped but still need dependable Drive connector wiring."
                ),
                "route": "/app/operations",
                "evidence_count": receiving_count + quality_incident_count + maintenance_count + metric_count,
                "last_signal_at": drive_signal_at or None,
                "consumers": ["Operations Control", "DQMS and Quality Methods", "Operating Intelligence Studio"],
                "next_automation": "Persist folder deltas, attachment manifests, and provenance IDs into canonical evidence records.",
            },
            {
                "id": "ceo-data-hub",
                "name": "CEO data hub and decision memory",
                "source_type": "Drive + decision journal",
                "status": "live" if executive_signal_at else "mapped",
                "coverage": "Director notes, KPI review, and decision prompts linked to executive storytelling.",
                "route": "/app/director",
                "evidence_count": len(decision_rows) + (1 if founder_brief_run_at else 0),
                "last_signal_at": executive_signal_at or None,
                "consumers": ["CEO Command Center", "Operating Intelligence Studio", "Workforce Command"],
                "next_automation": "Bind executive decisions to evidence packs and owner follow-through in the portal.",
            },
            {
                "id": "commercial-mailbox",
                "name": "Commercial mailbox and lead intake",
                "source_type": "Gmail + CRM memory",
                "status": commercial_registry_status,
                "coverage": (
                    f"Mailbox {gmail_probe_email or 'configured Gmail account'} plus inbound lead memory and outreach-triggered commercial signal."
                    if gmail_probe_status == "ready"
                    else "Supplier and dealer mail is scoped, but Gmail auth and token health still need hardening for direct lineage."
                ),
                "route": "/app/revenue",
                "evidence_count": lead_count,
                "last_signal_at": commercial_signal_at or None,
                "consumers": ["Revenue Desk", "Lead Pipeline", "CEO daily brief"],
                "next_automation": "Capture thread-level mailbox events and bind them to account timelines and quote evidence.",
            },
            {
                "id": "supplier-finance-pack",
                "name": "Supplier and finance evidence pack",
                "source_type": "Gmail + approvals",
                "status": procurement_registry_status,
                "coverage": (
                    f"Approvals, supplier risks, discrepancy evidence, and finance packet readiness bound to {gmail_probe_email or 'the configured Gmail account'}."
                    if gmail_probe_status == "ready"
                    else "Approvals and supplier evidence are present, but mailbox-level packet lineage still depends on Gmail connector repair."
                ),
                "route": "/app/approvals",
                "evidence_count": supplier_risk_count + pending_approval_count,
                "last_signal_at": procurement_signal_at or None,
                "consumers": ["Supplier and Approval Control", "Receiving Control", "CEO Command Center"],
                "next_automation": "Promote supplier document debt, GRN mismatches, and approval packets into one recovery graph.",
            },
            {
                "id": "shopfloor-writeback",
                "name": "Shopfloor writeback surfaces",
                "source_type": "Portal forms + human entry",
                "status": "live" if shopfloor_signal_at else "mapped",
                "coverage": "Receiving, quality, maintenance, KPI entry, and manager tasks feeding the same runtime.",
                "route": "/app/adoption-command",
                "evidence_count": receiving_count + quality_incident_count + maintenance_count + metric_count + open_task_count,
                "last_signal_at": shopfloor_signal_at or None,
                "consumers": ["Adoption Command", "Workforce Command", "Data Fabric"],
                "next_automation": "Escalate stale entry lanes automatically and open coaching tasks by role and desk.",
            },
            {
                "id": "connector-governance",
                "name": "Connector governance register",
                "source_type": "Tenant operating model",
                "status": "live" if governance_signal_at else "next",
                "coverage": "Connector policy, delivery sequencing, and agent-run evidence for rollout governance.",
                "route": "/app/connectors",
                "evidence_count": len(decision_rows) + len(latest_agent_runs),
                "last_signal_at": governance_signal_at or None,
                "consumers": ["Connector Control", "Adoption Command", "Enterprise architects"],
                "next_automation": "Score connector maturity by event evidence, lineage, and human adoption before expansion.",
            },
        ]

        commercial_status = _probe_health_status(gmail_probe_status, has_signal=bool(commercial_signal_at or lead_count))
        procurement_status = _probe_health_status(
            gmail_probe_status,
            has_signal=bool(procurement_signal_at or pending_approval_count or supplier_risk_count),
        )
        drive_status = _probe_health_status(
            drive_probe_status,
            has_signal=bool(drive_signal_at or receiving_count or quality_incident_count or maintenance_count),
        )
        shopfloor_status = _runtime_status_from_timestamp(shopfloor_signal_at, "daily", missing="Needs wiring")
        analytics_status = _runtime_status_from_timestamp(executive_signal_at, "daily", missing="Needs wiring")
        erp_status = "Warning" if erp_signal_at else "Needs wiring"

        connector_signals = [
            {
                "id": "gmail-commercial",
                "name": "Commercial Gmail intake",
                "system": "Gmail",
                "status": commercial_status,
                "freshness": _connector_probe_freshness(
                    commercial_signal_at,
                    fallback="No commercial mailbox signal landed yet.",
                    raw_status=gmail_probe_status,
                    probe_message=gmail_probe_message,
                    ready_detail=(
                        f"Gmail ready for {gmail_probe_email or 'the configured mailbox'} with {gmail_messages_total:,} visible messages."
                    ),
                ),
                "backlog": (
                    "Dealer mail, inquiries, and outreach history still need direct thread and attachment lineage."
                    if gmail_probe_status == "ready"
                    else "Repair OAuth, token persistence, and mailbox access before commercial thread sync can be trusted."
                ),
                "route": "/app/revenue",
                "surfaces": ["Revenue Desk", "Lead Pipeline", "CEO daily brief"],
                "first_jobs": ["Mailbox thread sync", "attachment promotion", "account-timeline stitching"],
                "next_automation": "Open follow-up tasks when fresh mail or lead-stage drift appears.",
                "risks": [
                    "Commercial evidence is present, but mailbox-native change events are not yet persisted."
                    if gmail_probe_status == "ready"
                    else (gmail_probe_message or "Gmail auth or config needs attention before the commercial intake lane can be trusted.")
                ],
            },
            {
                "id": "gmail-procurement",
                "name": "Procurement and finance Gmail",
                "system": "Gmail",
                "status": procurement_status,
                "freshness": _connector_probe_freshness(
                    procurement_signal_at,
                    fallback="No procurement mailbox signal landed yet.",
                    raw_status=gmail_probe_status,
                    probe_message=gmail_probe_message,
                    ready_detail=(
                        f"Gmail ready for {gmail_probe_email or 'the configured mailbox'} with {gmail_messages_total:,} visible messages."
                    ),
                ),
                "backlog": (
                    "Supplier discrepancies and approvals need direct mail-thread capture with packet completeness checks."
                    if gmail_probe_status == "ready"
                    else "Repair Gmail auth and supplier mailbox access before finance packet completeness can become reliable."
                ),
                "route": "/app/approvals",
                "surfaces": ["Supplier and Approval Control", "Receiving Control", "CEO Command Center"],
                "first_jobs": ["Supplier thread sync", "approval packet completeness scoring", "evidence-link repair"],
                "next_automation": "Trigger supplier recovery and escalation packets from live evidence gaps.",
                "risks": [
                    "Current freshness is inferred from approval and supplier records, not mailbox-native events."
                    if gmail_probe_status == "ready"
                    else (gmail_probe_message or "Gmail auth or config needs attention before procurement mail can be promoted with confidence.")
                ],
            },
            {
                "id": "drive-evidence-spine",
                "name": "Drive evidence spine",
                "system": "Google Drive",
                "status": drive_status,
                "freshness": _connector_probe_freshness(
                    drive_signal_at,
                    fallback="No Drive-backed evidence landed yet.",
                    raw_status=drive_probe_status,
                    probe_message=drive_probe_message,
                    ready_detail=(
                        f"Drive ready for {drive_drive_user or 'the shared workspace'} in {drive_folder_name or 'the configured folder'} with {drive_children_sampled} sampled children."
                    ),
                ),
                "backlog": (
                    "Folder deltas, file revisions, and attachment manifests still need first-class event persistence."
                    if drive_probe_status == "ready"
                    else "Repair Drive service-account access and folder visibility before evidence lineage can become dependable."
                ),
                "route": "/app/connectors",
                "surfaces": ["Connector Control", "Operations Control", "Knowledge workspace"],
                "first_jobs": ["Delta watch", "revision lineage", "topic routing"],
                "next_automation": "Promote file changes into source events and canon candidates automatically.",
                "risks": [
                    "The portal sees promoted records, but not yet every underlying Drive revision or attachment delta."
                    if drive_probe_status == "ready"
                    else (drive_probe_message or "Drive connector access needs attention before the evidence spine can be trusted.")
                ],
            },
            {
                "id": "erp-export-lane",
                "name": "ERP export lane",
                "system": "ERP / exports",
                "status": erp_status,
                "freshness": (
                    f"{_runtime_freshness_label(erp_signal_at, fallback='No ERP export evidence landed yet.')}; direct export capture is still partial."
                    if erp_signal_at
                    else "No ERP export evidence landed yet."
                ),
                "backlog": "Receiving, GRN, and KPI evidence exist, but a direct ERP delta feed still needs hard wiring.",
                "route": "/app/operations",
                "surfaces": ["Operations Control", "Data Fabric", "Supplier and Approval Control"],
                "first_jobs": ["ERP file watcher", "GRN normalization", "batch reconciliation"],
                "next_automation": "Treat ERP changes as first-class source events instead of manual downstream promotion.",
                "risks": ["Fresh rows may exist while the true ERP export channel is still not directly monitored."],
            },
            {
                "id": "analytics-demand",
                "name": "Web, analytics, and demand telemetry",
                "system": "Analytics",
                "status": analytics_status if lead_count else "Needs wiring",
                "freshness": _runtime_freshness_label(executive_signal_at, fallback="No web or analytics telemetry landed yet."),
                "backlog": "Website, Google Analytics, and social demand signals still need dedicated event ingestion.",
                "route": "/app/insights",
                "surfaces": ["Operating Intelligence Studio", "Revenue Desk", "CEO daily brief"],
                "first_jobs": ["GA ingestion", "campaign attribution", "website inquiry promotion"],
                "next_automation": "Fuse funnel telemetry with dealer movement and lead-source scoring.",
                "risks": ["Current demand insight is dominated by CRM and manager memory, not direct analytics evidence."],
            },
            {
                "id": "chat-mesh",
                "name": "Viber, LINE, and WeChat mesh",
                "system": "Chat mesh",
                "status": "Needs wiring",
                "freshness": "No direct chat-mesh event capture landed yet.",
                "backlog": "Internal and supplier chat still sits outside the governed operating memory.",
                "route": "/app/adoption-command",
                "surfaces": ["Adoption Command", "Supplier and Approval Control", "Revenue Desk"],
                "first_jobs": ["Chat message ingestion", "attachment capture", "channel-to-record mapping"],
                "next_automation": "Convert approved chat evidence into source events and follow-through tasks.",
                "risks": ["Important supplier and internal decisions can still happen in chat without structured traceability."],
            },
            {
                "id": "shopfloor-writeback",
                "name": "Shopfloor and manager writeback",
                "system": "Portal writeback",
                "status": shopfloor_status,
                "freshness": _runtime_freshness_label(shopfloor_signal_at, fallback="No writeback signal landed yet."),
                "backlog": "Role-specific entry completion, stale-lane escalation, and training loops still need automation depth.",
                "route": "/app/adoption-command",
                "surfaces": ["Adoption Command", "Workforce Command", "Operations Control"],
                "first_jobs": ["Role completion scoring", "stale-entry alarms", "coach-by-desk loops"],
                "next_automation": "Open manager coaching and escalation work from missing fields and stale entry lanes.",
                "risks": ["Manual entry exists, but the reinforcement loop is still lighter than the full operating model needs."],
            },
        ]

        source_events: list[dict[str, Any]] = []

        def _push_source_event(
            *,
            event_id: str,
            source: str,
            kind: str,
            title: str,
            detail: str,
            route: str,
            signal_at: str,
            owner: str,
        ) -> None:
            if not str(signal_at or "").strip():
                return
            source_events.append(
                {
                    "id": event_id,
                    "source": source,
                    "kind": kind,
                    "title": title,
                    "detail": detail,
                    "route": route,
                    "signal_at": signal_at,
                    "owner": owner,
                }
            )

        gmail_probe_detail = (
            f"Ready as {gmail_probe_email or 'the configured mailbox'} with {gmail_messages_total:,} visible messages; direct mailbox thread lineage still needs persistence."
            if gmail_probe_status == "ready"
            else (gmail_probe_message or "Gmail connector requires configuration or reauthentication.")
        )
        drive_probe_detail = (
            (
                f"Ready for {drive_drive_user or 'the shared workspace'} in {drive_folder_name or 'the configured folder'} with {drive_children_sampled} sampled children"
                + (f" including {', '.join(drive_sample_names)}." if drive_sample_names else ".")
            )
            if drive_probe_status == "ready"
            else (drive_probe_message or "Drive connector requires service-account access or folder wiring.")
        )

        _push_source_event(
            event_id="probe-gmail-runtime",
            source="Connector health",
            kind="gmail-probe",
            title="Gmail connector check",
            detail=gmail_probe_detail,
            route="/app/connectors",
            signal_at=connector_probe_checked_at,
            owner="Connector Control",
        )
        _push_source_event(
            event_id="probe-drive-runtime",
            source="Connector health",
            kind="drive-probe",
            title="Drive connector check",
            detail=drive_probe_detail,
            route="/app/connectors",
            signal_at=connector_probe_checked_at,
            owner="Connector Control",
        )

        for row in lead_rows[:3]:
            _push_source_event(
                event_id=f"lead-{row.get('lead_id', '')}",
                source="Commercial intake",
                kind="lead",
                title=str(row.get("company_name", "")).strip() or "Lead update",
                detail=f"Stage {str(row.get('stage', '')).strip() or 'unknown'} owned by {str(row.get('owner', '')).strip() or 'team'}.",
                route="/app/revenue",
                signal_at=str(row.get("synced_at", "")).strip() or str(row.get("created_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Revenue Pod",
            )
        for row in quality_rows[:3]:
            _push_source_event(
                event_id=f"quality-{row.get('incident_id', '')}",
                source="Quality evidence",
                kind="incident",
                title=str(row.get("title", "")).strip() or "Quality incident",
                detail=str(row.get("summary", "")).strip() or f"Severity {str(row.get('severity', '')).strip() or 'unknown'} incident.",
                route="/app/dqms",
                signal_at=str(row.get("reported_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Quality Team",
            )
        for row in receiving_rows[:3]:
            _push_source_event(
                event_id=f"receiving-{row.get('receiving_id', '')}",
                source="Receiving",
                kind="receipt",
                title=f"{str(row.get('supplier', '')).strip() or 'Supplier'} / {str(row.get('material', '')).strip() or 'material'}",
                detail=str(row.get("variance_note", "")).strip() or f"Status {str(row.get('status', '')).strip() or 'open'}.",
                route="/app/operations",
                signal_at=str(row.get("received_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Receiving Control",
            )
        for row in maintenance_rows[:3]:
            _push_source_event(
                event_id=f"maintenance-{row.get('maintenance_id', '')}",
                source="Maintenance",
                kind="downtime",
                title=str(row.get("asset_name", "")).strip() or "Maintenance issue",
                detail=str(row.get("next_action", "")).strip() or f"{str(row.get('issue_type', '')).strip() or 'Issue'} status {str(row.get('status', '')).strip() or 'open'}.",
                route="/app/operations",
                signal_at=str(row.get("logged_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Maintenance Team",
            )
        for row in metric_rows[:3]:
            _push_source_event(
                event_id=f"metric-{row.get('metric_id', '')}",
                source="KPI entry",
                kind="metric",
                title=str(row.get("metric_name", "")).strip() or "Metric refresh",
                detail=f"{str(row.get('metric_group', '')).strip() or 'Metric'} / {str(row.get('period_label', '')).strip() or 'current period'}",
                route="/app/insights",
                signal_at=str(row.get("captured_at", "")).strip() or str(row.get("synced_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Management",
            )
        for row in approval_rows[:3]:
            _push_source_event(
                event_id=f"approval-{row.get('approval_id', '')}",
                source="Approvals",
                kind="approval",
                title=str(row.get("title", "")).strip() or "Approval item",
                detail=str(row.get("summary", "")).strip() or f"Gate {str(row.get('approval_gate', '')).strip() or 'review'} / {str(row.get('status', '')).strip() or 'open'}.",
                route=str(row.get("related_route", "")).strip() or "/app/approvals",
                signal_at=str(row.get("created_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or str(row.get("requested_by", "")).strip() or "Approvals",
            )
        for row in decision_rows[:3]:
            _push_source_event(
                event_id=f"decision-{row.get('decision_id', '')}",
                source="Decision journal",
                kind="decision",
                title=str(row.get("title", "")).strip() or "Decision",
                detail=str(row.get("decision_text", "")).strip() or str(row.get("context", "")).strip() or "Decision journal update.",
                route=str(row.get("related_route", "")).strip() or "/app/director",
                signal_at=str(row.get("created_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Leadership",
            )
        for row in workspace_tasks[:3]:
            _push_source_event(
                event_id=f"task-{row.get('task_id', '')}",
                source="Manager writeback",
                kind="task",
                title=str(row.get("title", "")).strip() or "Workspace task",
                detail=f"Priority {str(row.get('priority', '')).strip() or 'normal'} / status {str(row.get('status', '')).strip() or 'open'}.",
                route="/app/adoption-command",
                signal_at=str(row.get("updated_at", "")).strip() or str(row.get("created_at", "")).strip(),
                owner=str(row.get("owner", "")).strip() or "Manager",
            )

        agent_routes = {
            "founder_brief": "/app/director",
            "ops_watch": "/app/operations",
            "revenue_scout": "/app/revenue",
            "task_triage": "/app/adoption-command",
        }
        for row in latest_agent_runs[:5]:
            run_at = _runtime_run_timestamp(row)
            job_type = str(row.get("job_type", "")).strip()
            _push_source_event(
                event_id=f"agent-{row.get('run_id', '')}",
                source="Agent runtime",
                kind=job_type or "agent-run",
                title=str(row.get("summary", "")).strip() or (job_type.replace("_", " ").title() if job_type else "Agent run"),
                detail=f"Status {str(row.get('status', '')).strip() or 'unknown'} via {str(row.get('source', '')).strip() or 'system'}.",
                route=agent_routes.get(job_type, "/app/workforce"),
                signal_at=run_at,
                owner=str(row.get("triggered_by", "")).strip() or "System",
            )

        source_events.sort(
            key=lambda item: _parse_iso_datetime(str(item.get("signal_at", "")).strip()) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        source_events = source_events[:10]

        completeness_pairs = [
            (_count_complete_rows(receiving_rows, ("supplier", "material", "owner", "next_action")), receiving_count),
            (_count_complete_rows(quality_rows, ("title", "owner", "reported_at")), quality_incident_count),
            (_count_complete_rows(capa_rows, ("action_title", "owner", "target_date")), len(capa_rows)),
            (_count_complete_rows(maintenance_rows, ("asset_name", "owner", "next_action")), maintenance_count),
            (_count_complete_rows(metric_rows, ("metric_name", "metric_group", "owner", "period_label")), metric_count),
            (_count_complete_rows(approval_rows, ("title", "owner", "approval_gate")), len(approval_rows)),
            (_count_complete_rows(decision_rows, ("title", "owner", "decision_text")), len(decision_rows)),
            (_count_complete_rows(workspace_tasks, ("title", "owner", "status")), len(workspace_tasks)),
        ]
        total_completeness_rows = sum(total for _, total in completeness_pairs)
        total_complete_rows = sum(matched for matched, _ in completeness_pairs)
        learning_trust_score = _score_percent(total_complete_rows, total_completeness_rows) if total_completeness_rows else 0
        canonical_record_count = (
            lead_count
            + receiving_count
            + quality_incident_count
            + len(capa_rows)
            + supplier_risk_count
            + maintenance_count
            + metric_count
            + len(approval_rows)
            + len(decision_rows)
            + len(workspace_tasks)
        )

        knowledge_graph_domains = [
            {
                "id": "plant-ops-graph",
                "name": "Plant operations graph",
                "status": plant_fabric_status,
                "node_count": receiving_count + maintenance_count + open_task_count,
                "edge_count": max(receiving_hold_count, 0) + maintenance_count + open_task_count,
                "owner": "Plant manager",
                "route": "/app/operations",
                "last_signal_at": _latest_signal([receiving_latest, maintenance_latest, task_latest]) or None,
                "entity_types": ["supplier receipt", "material", "asset", "shift blocker", "manager task"],
                "relation_types": ["receipt -> material", "asset -> downtime", "task -> blocker owner"],
                "questions": [
                    "Which receipts or assets are blocking the next shift?",
                    "Where are manager tasks still open against live plant records?",
                ],
            },
            {
                "id": "quality-genealogy-graph",
                "name": "Quality and genealogy graph",
                "status": quality_fabric_status,
                "node_count": quality_incident_count + len(capa_rows) + metric_count,
                "edge_count": quality_incident_count + len(capa_rows),
                "owner": "Quality manager",
                "route": "/app/dqms",
                "last_signal_at": _latest_signal([quality_latest, metric_latest]) or None,
                "entity_types": ["incident", "CAPA", "defect family", "batch evidence", "quality KPI"],
                "relation_types": ["incident -> CAPA", "incident -> defect family", "KPI -> loss driver"],
                "questions": [
                    "Which defects are recurring across incidents and closeout work?",
                    "Where is quality loss rising faster than containment closes it?",
                ],
            },
            {
                "id": "supplier-recovery-graph",
                "name": "Supplier recovery graph",
                "status": supplier_fabric_status,
                "node_count": supplier_risk_count + pending_approval_count + receiving_hold_count,
                "edge_count": supplier_risk_count + pending_approval_count,
                "owner": "Procurement lead",
                "route": "/app/approvals",
                "last_signal_at": _latest_signal([supplier_latest, approval_latest, receiving_latest]) or None,
                "entity_types": ["supplier", "shipment discrepancy", "approval packet", "document debt"],
                "relation_types": ["supplier -> discrepancy", "discrepancy -> approval", "approval -> release impact"],
                "questions": [
                    "Which supplier issues are still blocking release or payment?",
                    "Where is document debt aging without a complete packet?",
                ],
            },
            {
                "id": "commercial-account-graph",
                "name": "Commercial account graph",
                "status": sales_fabric_status,
                "node_count": lead_count + open_task_count,
                "edge_count": lead_count + max(open_task_count // 2, 0),
                "owner": "Sales lead",
                "route": "/app/revenue",
                "last_signal_at": _latest_signal([lead_latest, revenue_scout_run_at, task_latest]) or None,
                "entity_types": ["account", "lead event", "follow-up task", "quote cue"],
                "relation_types": ["account -> stage", "account -> next action", "task -> owner"],
                "questions": [
                    "Which dealer accounts changed stage or need follow-up now?",
                    "Which tasks are stale against live commercial movement?",
                ],
            },
            {
                "id": "director-control-graph",
                "name": "Director control graph",
                "status": executive_fabric_status,
                "node_count": len(decision_rows) + metric_count + len(latest_agent_runs),
                "edge_count": len(decision_rows) + len(latest_agent_runs),
                "owner": "Director / tenant admin",
                "route": "/app/director",
                "last_signal_at": _latest_signal([decision_latest, founder_brief_run_at, metric_latest]) or None,
                "entity_types": ["decision", "KPI review", "agent brief", "priority pack"],
                "relation_types": ["decision -> owner", "brief -> KPI", "KPI -> escalation"],
                "questions": [
                    "Which decisions and KPI shifts need cross-functional follow-through?",
                    "Which agent outputs are changing management focus now?",
                ],
            },
        ]

        graph_node_count = sum(int(item.get("node_count", 0) or 0) for item in knowledge_graph_domains)
        graph_edge_count = sum(int(item.get("edge_count", 0) or 0) for item in knowledge_graph_domains)
        learning_last_signal = _latest_signal(
            [
                connector_change_latest,
                executive_signal_at,
                shopfloor_signal_at,
                commercial_signal_at,
                procurement_signal_at,
            ]
        )
        learning_database_status = (
            "Healthy"
            if learning_trust_score >= 80 and connector_change_count >= 8
            else "Warning"
            if learning_trust_score >= 60 and canonical_record_count
            else "Degraded"
            if canonical_record_count
            else "Needs wiring"
        )
        learning_database = {
            "status": learning_database_status,
            "canonical_record_count": canonical_record_count,
            "graph_node_count": graph_node_count,
            "graph_edge_count": graph_edge_count,
            "lineage_event_count": connector_change_count,
            "feature_set_count": 5,
            "trust_score": learning_trust_score,
            "last_learned_at": learning_last_signal or None,
            "qualitative_methods": ["5 Why", "Ishikawa", "manager narratives", "SOP extraction"],
            "quantitative_methods": ["feature engineering", "freshness scoring", "trend deltas", "anomaly cuts"],
            "next_automation": "Use direct Drive, Gmail, ERP, analytics, and chat deltas to update canon confidence, graph links, and manager review packets automatically.",
        }

        def _lineage_next_step(route: str, kind: str) -> str:
            normalized_route = str(route or "").strip()
            normalized_kind = str(kind or "").strip().lower()
            if normalized_route == "/app/operations":
                return "Push into plant-flow features and shift review."
            if normalized_route == "/app/dqms":
                return "Attach evidence and queue quality-manager review."
            if normalized_route == "/app/approvals":
                return "Repair packet completeness and escalate supplier follow-up."
            if normalized_route == "/app/revenue":
                return "Bind the change to account memory and next commercial action."
            if normalized_route == "/app/director":
                return "Link the change to decision memory and the next brief."
            if "metric" in normalized_kind or normalized_route == "/app/insights":
                return "Refresh the feature mart and manager story."
            return "Promote the change into the governed data fabric and next desk review."

        change_lineage = [
            {
                "id": str(row.get("event_id", "")).strip(),
                "source": str(row.get("connector_name", "")).strip() or str(row.get("source", "")).strip() or "Connector runtime",
                "asset_name": str(row.get("title", "")).strip() or "Runtime change",
                "change_type": str(row.get("kind", "")).strip() or "event",
                "changed_at": str(row.get("created_at", "")).strip() or None,
                "changed_by": str(row.get("actor", "")).strip() or "System",
                "route": str(row.get("route", "")).strip() or "/app/connectors",
                "impact": str(row.get("detail", "")).strip() or "Source behavior changed and is now visible to the data fabric.",
                "next_step": _lineage_next_step(str(row.get("route", "")).strip(), str(row.get("kind", "")).strip()),
            }
            for row in connector_event_rows[:10]
            if isinstance(row, dict)
        ]

        manager_programs = [
            {
                "id": "plant-manager-program",
                "role": "Plant manager",
                "name": "Plant execution and bottleneck program",
                "route": "/app/operations",
                "mission": "Run shift control, receiving friction, downtime, and operator follow-through from the same structured graph.",
                "watches": ["receiving holds", "downtime and repeat blockers", "open manager tasks"],
                "metrics": [
                    f"{receiving_hold_count} holds or variances",
                    f"{maintenance_count} maintenance records",
                    f"{open_task_count} open tasks linked to plant flow",
                ],
                "methods": ["Pareto on downtime", "bottleneck drilldown", "5W1H escalation"],
                "ai_teams": ["Operations and Reliability Pod", "Manufacturing Genealogy Pod"],
                "writeback": "Operations desk, receiving control, maintenance desk",
                "next_handoff": "Escalate unresolved shift friction to the Quality Watch Pod or CEO Brief Pod when plant risk persists.",
            },
            {
                "id": "quality-manager-program",
                "role": "Quality manager",
                "name": "Quality loss and closeout program",
                "route": "/app/dqms",
                "mission": "Turn incidents, CAPA, and evidence into a learning loop that cuts recurrence and B+R.",
                "watches": ["incident recurrence", "CAPA age", "evidence-backed release risk"],
                "metrics": [
                    f"{quality_incident_count} quality incidents",
                    f"{len(capa_rows)} CAPA items",
                    f"{metric_count} KPI rows feeding loss analysis",
                ],
                "methods": ["Ishikawa", "5 Why", "defect clustering", "loss segmentation"],
                "ai_teams": ["Quality Watch Pod", "Data Science Pod"],
                "writeback": "DQMS incidents, CAPA, operations root-cause review",
                "next_handoff": "Promote persistent defect clusters into the Data Science Pod and CEO Brief Pod for cross-functional action.",
            },
            {
                "id": "procurement-program",
                "role": "Procurement / finance",
                "name": "Supplier recovery and packet-control program",
                "route": "/app/approvals",
                "mission": "Keep discrepancies, GRN evidence, and approvals moving before they block plant release or payment.",
                "watches": ["supplier discrepancy age", "approval queue debt", "missing document packs"],
                "metrics": [
                    f"{supplier_risk_count} supplier risks",
                    f"{pending_approval_count} approvals pending review",
                    f"{receiving_hold_count} receiving holds tied to supplier evidence",
                ],
                "methods": ["document completeness scoring", "aging ladder", "financial-impact ranking"],
                "ai_teams": ["Supplier Recovery Pod", "Intake Router Pod"],
                "writeback": "Approvals queue, receiving control, supplier recovery entry",
                "next_handoff": "Escalate high-value or slow-moving cases into the CEO Brief Pod and plant review ring.",
            },
            {
                "id": "sales-program",
                "role": "Sales lead",
                "name": "Commercial demand and account-memory program",
                "route": "/app/revenue",
                "mission": "Use account movement, follow-up, and demand cues to drive the next commercial action instead of ad hoc memory.",
                "watches": ["fresh lead movement", "stale account follow-up", "dealer demand mix"],
                "metrics": [
                    f"{lead_count} live leads or accounts",
                    f"{open_task_count} open tasks that can feed follow-up",
                    f"{connector_change_count} recent connector changes across the tenant memory spine",
                ],
                "methods": ["funnel segmentation", "lead-source scoring", "quote velocity review"],
                "ai_teams": ["Commercial Memory Pod", "CEO Brief Pod"],
                "writeback": "Revenue desk, lead pipeline, account review",
                "next_handoff": "Promote emerging demand patterns into the Data Science Pod and CEO Brief Pod.",
            },
            {
                "id": "data-admin-program",
                "role": "Tenant admin / data lead",
                "name": "Learning database and governance program",
                "route": "/app/platform-admin",
                "mission": "Protect freshness, lineage, trust, and graph quality so every manager and agent works from governed memory.",
                "watches": ["connector freshness", "lineage event coverage", "feature trust score", "writeback completeness"],
                "metrics": [
                    f"{connector_change_count} lineage events in the append-only spine",
                    f"{graph_node_count} graph nodes and {graph_edge_count} graph edges modeled",
                    f"{learning_trust_score}% learning-database trust score",
                ],
                "methods": ["lineage scoring", "null-pattern audit", "freshness controls", "qual-plus-quant review"],
                "ai_teams": ["Intake Router Pod", "Data Science Pod", "CEO Brief Pod"],
                "writeback": "Data fabric, connector control, platform admin",
                "next_handoff": "Route low-trust zones into connector repair, form redesign, and the next manager training cycle.",
            },
        ]

        agent_handoffs = [
            {
                "id": "handoff-plant-reliability",
                "from_team": "Intake Router Pod",
                "to_team": "Operations and Reliability Pod",
                "status": "Active" if receiving_hold_count or maintenance_count else "Queued",
                "topic": "Plant friction and shift risk",
                "reason": "Fresh receiving or maintenance changes need a plant-level bottleneck review and owner assignment.",
                "route": "/app/operations",
                "signal_at": _latest_signal([receiving_latest, maintenance_latest, task_latest]) or None,
                "payload": [
                    f"{receiving_hold_count} receiving holds or variances",
                    f"{maintenance_count} maintenance records",
                    f"{open_task_count} open tasks",
                ],
            },
            {
                "id": "handoff-quality-learning",
                "from_team": "Quality Watch Pod",
                "to_team": "Data Science Pod",
                "status": "Active" if quality_incident_count or len(capa_rows) else "Queued",
                "topic": "Defect recurrence and quality-loss learning",
                "reason": "Incidents and CAPA now support a deeper qual-plus-quant loss study and recurrence ranking.",
                "route": "/app/dqms",
                "signal_at": _latest_signal([quality_latest, metric_latest]) or None,
                "payload": [
                    f"{quality_incident_count} incidents",
                    f"{len(capa_rows)} CAPA items",
                    f"{metric_count} metric rows",
                ],
            },
            {
                "id": "handoff-supplier-exec",
                "from_team": "Supplier Recovery Pod",
                "to_team": "CEO Brief Pod",
                "status": "Needs review" if pending_approval_count >= 5 or supplier_risk_count >= 5 else "Active" if pending_approval_count or supplier_risk_count else "Queued",
                "topic": "Supplier and approval escalation",
                "reason": "Open discrepancy, approval, or document debt is large enough for management-level prioritization.",
                "route": "/app/approvals",
                "signal_at": _latest_signal([supplier_latest, approval_latest]) or None,
                "payload": [
                    f"{supplier_risk_count} supplier risks",
                    f"{pending_approval_count} pending approvals",
                    f"{connector_change_count} recent lineage events available for packet traceability",
                ],
            },
            {
                "id": "handoff-commercial-forecast",
                "from_team": "Commercial Memory Pod",
                "to_team": "Data Science Pod",
                "status": "Active" if lead_count else "Queued",
                "topic": "Demand, dealer, and funnel signal",
                "reason": "Commercial movement should feed quantitative demand features and next-step prioritization.",
                "route": "/app/revenue",
                "signal_at": _latest_signal([lead_latest, revenue_scout_run_at]) or None,
                "payload": [
                    f"{lead_count} live leads",
                    f"{open_task_count} open tasks still touching account follow-through",
                ],
            },
            {
                "id": "handoff-data-brief",
                "from_team": "Data Science Pod",
                "to_team": "CEO Brief Pod",
                "status": "Active" if metric_count or len(decision_rows) else "Queued",
                "topic": "Cross-functional KPI and narrative synthesis",
                "reason": "Cleaned features and recent decisions are ready to become manager-ready narrative and next action.",
                "route": "/app/director",
                "signal_at": _latest_signal([metric_latest, decision_latest, founder_brief_run_at]) or None,
                "payload": [
                    f"{metric_count} KPI rows",
                    f"{len(decision_rows)} decisions",
                    f"{learning_trust_score}% trust score on the learning database",
                ],
            },
        ]

        pipeline_stages = [
            {
                "id": "source-watch",
                "name": "Source Watch and Whole-Folder Intake",
                "status": "live",
                "purpose": "Continuously watch the Yangon Tyre Google Drive tree, Gmail threads, attachments, and writeback lanes for new evidence.",
                "sources": ["Plant A shared folders", "CEO data hub", "finance and purchase-order mail packs", "sales and procurement Gmail", "structured app entry"],
                "outputs": [
                    f"{receiving_count} receiving rows and {quality_incident_count} quality incidents already in the workspace state",
                    f"{lead_count} live commercial records and {pending_approval_count} approval items available for promotion",
                    "source event registry, attachment manifests, and topic candidate queues",
                ],
                "agents": ["Intake Router Pod", "Connector Control", "Document Intake"],
                "review_gate": "Tenant-admin review for connector scope, identity collisions, and sensitive evidence.",
            },
            {
                "id": "topic-extraction",
                "name": "Topic Extraction and Record Classification",
                "status": "live" if receiving_count or lead_count or supplier_risk_count else "mapped",
                "purpose": "Split the source mesh into manufacturing, quality, supplier, commercial, and leadership topic flows.",
                "sources": ["Drive revision deltas", "mail thread clusters", "manual forms", "ERP exports"],
                "outputs": [
                    "supplier issue candidates and GRN exceptions",
                    "account timeline events and director prompts",
                    f"{open_task_count} open workspace tasks available for routing and follow-up shaping",
                ],
                "agents": ["Intake Router Pod", "Supplier Recovery Pod", "Commercial Memory Pod"],
                "review_gate": "Cross-topic merges and high-risk classifications need manager review.",
            },
            {
                "id": "canonical-records",
                "name": "Canonical Records and Knowledge Promotion",
                "status": "live" if receiving_count or quality_incident_count or supplier_risk_count else "mapped",
                "purpose": "Promote extracted facts into durable tenant records with provenance back to the source evidence.",
                "sources": ["classified intake", "document canon review", "manual issue records", "director and manager notes"],
                "outputs": [
                    f"{supplier_risk_count} supplier-risk records and {quality_incident_count} quality records available for canon promotion",
                    "canonical supplier issues, quality incidents, shift blockers, and dealer account events",
                ],
                "agents": ["Knowledge Graph and SOP Vault", "Quality Watch Pod", "Decision Journal"],
                "review_gate": "Human review before records change supplier, quality, or commercial posture.",
            },
            {
                "id": "feature-engineering",
                "name": "Feature Engineering and KPI Marts",
                "status": "live" if metric_count else "mapped",
                "purpose": "Build reusable feature tables for management, industrial engineering, forecasting, and runtime scoring.",
                "sources": ["canonical records", "Tyre Analysis workbook", "ERP and GRN exports", "shift and downtime entry"],
                "outputs": [
                    f"{metric_count} metric rows currently available for feature refresh",
                    "feature marts, KPI baselines, anomaly signals, and industrial-engineering cuts",
                ],
                "agents": ["Data Science Pod", "Operating Intelligence Studio"],
                "review_gate": "Freshness, lineage, and explanation checks before features are used in live review.",
            },
            {
                "id": "analysis-modeling",
                "name": "Analysis, Modeling, and Industrial Engineering",
                "status": quality_fabric_status if metric_count or quality_incident_count or maintenance_count else "mapped",
                "purpose": "Turn feature marts into bottleneck review, yield studies, risk ranking, and manager-ready analysis.",
                "sources": ["feature marts", "quality baselines", "sales movement", "downtime and root-cause history"],
                "outputs": [
                    "gap-analysis packs, bottleneck studies, quality-loss analysis, and demand signals",
                    f"{maintenance_count} maintenance rows and {quality_incident_count} incidents available for industrial-engineering cuts",
                ],
                "agents": ["Data Science Pod", "Operations and Reliability Pod", "Manufacturing Genealogy Pod"],
                "review_gate": "Models remain advisory until a manager accepts them into operating decisions.",
            },
            {
                "id": "role-storytelling",
                "name": "Role Storytelling and Section-Specific Insight",
                "status": executive_fabric_status,
                "purpose": "Convert the same data into narratives that fit the role and desk consuming it.",
                "sources": ["feature marts", "canonical records", "manager notes", "runtime posture"],
                "outputs": [
                    "director brief, shift brief, quality board story, supplier recovery story, and demand story",
                    f"Latest brief runs: founder {founder_brief_run_at or 'not yet recorded'}, task triage {task_triage_run_at or 'not yet recorded'}",
                ],
                "agents": ["CEO Brief Pod", "Data Science Pod", "Commercial Memory Pod", "Quality Watch Pod"],
                "review_gate": "Stories must stay linked to the records that justify them.",
            },
            {
                "id": "human-writeback",
                "name": "Human Writeback and Continuous Improvement",
                "status": "live",
                "purpose": "Push the right fields back into operational desks so the team updates data where the work actually happens.",
                "sources": ["Receiving Control", "DQMS", "Maintenance", "Supplier Control", "Revenue Desk", "Director and KPI entry"],
                "outputs": [
                    "cleaner forms, missing-field prompts, manager corrections, and training signals",
                    f"{open_task_count} open tasks and {pending_approval_count} pending approvals are available for writeback-linked follow-through",
                ],
                "agents": ["Workforce Command", "Experience Assurance Pod", "Document Intelligence"],
                "review_gate": "The portal is the writeback lane; chat and shadow sheets are exceptions, not the source of truth.",
            },
        ]

        topic_pipelines = [
            {
                "id": "whole-folder",
                "name": "Whole-folder operating memory",
                "status": "live",
                "scope": "Crawl the entire Yangon Tyre Drive and mailbox estate so no important file or update stays invisible to the platform.",
                "source_packs": ["Plant A operations manual", "Plant A shared folders", "CEO data hub", "Data source register"],
                "connector_tracks": ["Google Drive evidence spine", "Gmail and attachment intake"],
                "transforms": ["folder indexing", "sheet snapshots", "file-to-topic routing", "attachment lineage"],
                "outputs": ["tenant evidence spine", "topic queues", "knowledge candidates", "stale-source alerts"],
                "role_stories": ["Admin data-quality story", "CEO daily brief"],
            },
            {
                "id": "manufacturing-industrial",
                "name": "Manufacturing and industrial engineering",
                "status": plant_fabric_status,
                "scope": "Use production, downtime, genealogy, and planning data to study throughput, bottlenecks, yield, and line balance.",
                "source_packs": ["Plant A operations manual", "Plant A shared folders", "Tyre Analysis workbook"],
                "connector_tracks": ["Google Drive evidence spine", "Shopfloor mobile forms and line logs"],
                "transforms": ["stage tagging", "batch and asset linkage", "yield normalization", "bottleneck feature engineering"],
                "outputs": ["plant flow mart", "downtime cuts", "bottleneck watchlist", "shift engineering brief"],
                "role_stories": ["Plant shift and engineering story", "CEO daily brief"],
            },
            {
                "id": "quality-genealogy",
                "name": "Quality, genealogy, and release",
                "status": quality_fabric_status,
                "scope": "Bind incidents, batch evidence, closeout actions, and release history into one quality-learning loop.",
                "source_packs": ["Plant A operations manual", "Plant A shared folders", "Tyre Analysis workbook"],
                "connector_tracks": ["Google Drive evidence spine", "Gmail and attachment intake", "Shopfloor mobile forms and line logs"],
                "transforms": ["incident extraction", "batch reference repair", "photo-to-issue linkage", "quality-loss features"],
                "outputs": ["quality loss mart", "incident canon", "release evidence packs", "weekly defect storyline"],
                "role_stories": ["Quality technical story", "CEO daily brief"],
            },
            {
                "id": "supplier-finance",
                "name": "Supplier, GRN, and finance recovery",
                "status": supplier_fabric_status,
                "scope": "Keep supplier discrepancies, missing documents, GRN mismatches, and financial exposure on one recovery graph.",
                "source_packs": ["Finance and purchase-order mail packs", "Plant A shared folders", "Data source register"],
                "connector_tracks": ["Gmail and attachment intake", "Google Drive evidence spine", "Viber, LINE, and WeChat internal and external chat mesh"],
                "transforms": ["supplier normalization", "mail-to-GRN binding", "evidence completeness scoring", "delay aging"],
                "outputs": ["supplier recovery mart", "document debt ranking", "plant-blocking discrepancy board", "approval-ready packets"],
                "role_stories": ["Supplier recovery story", "Finance approval story"],
            },
            {
                "id": "commercial-demand",
                "name": "Commercial demand and market response",
                "status": sales_fabric_status,
                "scope": "Merge dealer memory, quotes, inquiries, campaigns, and catalog movement into one demand intelligence layer.",
                "source_packs": ["Tyre Analysis workbook", "CEO data hub"],
                "connector_tracks": ["Gmail and attachment intake", "Website and product catalog signals", "Google Analytics and funnel telemetry", "Facebook and social commercial inbox"],
                "transforms": ["account timeline stitching", "lead-source scoring", "quote classification", "product-demand features"],
                "outputs": ["commercial demand mart", "dealer health cues", "campaign response summary", "revenue-risk storyline"],
                "role_stories": ["Sales and demand story", "CEO daily brief"],
            },
            {
                "id": "director-strategy",
                "name": "Director strategy and cross-functional control",
                "status": executive_fabric_status,
                "scope": "Fuse plant, supplier, commercial, and quality signals into management-level priorities with evidence links.",
                "source_packs": ["CEO data hub", "Tyre Analysis workbook", "Finance and purchase-order mail packs"],
                "connector_tracks": ["Gmail and attachment intake", "Google Drive evidence spine", "Google Analytics and funnel telemetry"],
                "transforms": ["cross-topic risk ranking", "KPI comparison", "decision-memory linking", "narrative assembly"],
                "outputs": ["executive KPI mart", "priority packs", "decision prompts", "section-specific stories"],
                "role_stories": ["CEO daily brief", "Admin data-quality story"],
            },
        ]

        feature_marts = [
            {
                "id": "plant-flow-mart",
                "name": "Plant flow and industrial engineering mart",
                "status": plant_fabric_status,
                "grain": "shift x stage x asset x product family",
                "sources": ["Plant A folders", "shopfloor logs", "maintenance entry", "production sheets"],
                "features": ["throughput by stage", "downtime minutes", "line-balance pressure", "yield loss by asset", "repeat-blocker rate"],
                "consumers": ["Operations Control", "Workforce Command", "Operating Intelligence Studio"],
                "cadence": "Every shift",
            },
            {
                "id": "quality-loss-mart",
                "name": "Quality loss and release mart",
                "status": quality_fabric_status,
                "grain": "incident x batch x defect x release decision",
                "sources": ["DQMS entry", "inspection files", "quality notes", "batch evidence"],
                "features": ["B+R by month", "defect cluster score", "release lag", "repeat defect recurrence", "closeout age"],
                "consumers": ["DQMS and Quality Methods", "CEO Command Center", "Operating Intelligence Studio"],
                "cadence": "Daily and weekly",
            },
            {
                "id": "supplier-recovery-mart",
                "name": "Supplier recovery and GRN mart",
                "status": supplier_fabric_status,
                "grain": "supplier x shipment x discrepancy case",
                "sources": ["procurement Gmail", "GRN exceptions", "document intake", "finance evidence"],
                "features": ["document debt age", "unresolved discrepancy value", "release block count", "supplier response lag", "claim recurrence"],
                "consumers": ["Supplier and Approval Control", "Receiving Control", "CEO Command Center"],
                "cadence": "Daily",
            },
            {
                "id": "commercial-demand-mart",
                "name": "Commercial demand and dealer mart",
                "status": sales_fabric_status,
                "grain": "account x inquiry x quote x product family",
                "sources": ["sales Gmail", "account reviews", "web inquiries", "campaign signals"],
                "features": ["lead-source score", "quote velocity", "dealer activity freshness", "product demand mix", "revenue-risk cues"],
                "consumers": ["Revenue Desk", "Lead Pipeline", "CEO Command Center"],
                "cadence": "Daily",
            },
            {
                "id": "executive-kpi-mart",
                "name": "Executive KPI and storytelling mart",
                "status": executive_fabric_status,
                "grain": "review cycle x business theme",
                "sources": ["feature marts", "director notes", "quality and supplier signals", "sales movement"],
                "features": ["priority gap ranking", "cross-functional risk score", "intervention backlog", "story freshness", "trend deltas"],
                "consumers": ["Operating Intelligence Studio", "CEO Command Center", "Workforce Command"],
                "cadence": "Daily and weekly",
            },
        ]

        role_stories = [
            {
                "id": "director-brief",
                "role": "CEO / director",
                "name": "CEO daily brief",
                "route": "/app/director",
                "inputs": ["executive KPI mart", "supplier recovery mart", "quality loss mart", "commercial demand mart"],
                "questions": ["What changed materially today?", "Where is cross-functional risk rising?", "Which decisions need owner and due date now?"],
                "outputs": ["priority reset", "decision prompts", "linked evidence pack"],
            },
            {
                "id": "plant-shift-story",
                "role": "Plant manager",
                "name": "Plant shift and engineering story",
                "route": "/app/operations",
                "inputs": ["plant flow mart", "quality loss mart", "maintenance and receiving records"],
                "questions": ["Where is throughput being lost?", "Which blocker is repeating?", "Which shift issue needs escalation before next handoff?"],
                "outputs": ["shift brief", "bottleneck watch", "root-cause priority list"],
            },
            {
                "id": "quality-board-story",
                "role": "Quality manager",
                "name": "Quality technical story",
                "route": "/app/dqms",
                "inputs": ["quality loss mart", "incident canon", "release evidence packs"],
                "questions": ["Which defects are recurring?", "What is driving B+R and release delay?", "Which CAPA items are not closing the loop?"],
                "outputs": ["weekly defect story", "CAPA focus list", "evidence-linked closeout board"],
            },
            {
                "id": "supplier-recovery-story",
                "role": "Procurement / finance",
                "name": "Supplier recovery story",
                "route": "/app/approvals",
                "inputs": ["supplier recovery mart", "finance mail evidence", "GRN exceptions"],
                "questions": ["Which discrepancies are blocking production or payment?", "Which suppliers are slow or incomplete?", "Which approvals are aging without evidence?"],
                "outputs": ["supplier debt view", "approval packets", "escalation shortlist"],
            },
            {
                "id": "sales-demand-story",
                "role": "Sales lead",
                "name": "Sales and demand story",
                "route": "/app/revenue",
                "inputs": ["commercial demand mart", "dealer account reviews", "campaign and web signals"],
                "questions": ["Which accounts or products are moving?", "Which inquiries are not converting?", "Where should follow-up or pricing focus next?"],
                "outputs": ["dealer movement brief", "follow-up priorities", "demand mix summary"],
            },
            {
                "id": "admin-data-quality-story",
                "role": "Tenant admin",
                "name": "Admin data-quality story",
                "route": "/app/platform-admin",
                "inputs": ["whole-folder operating memory", "source event registry", "feature mart freshness", "writeback completeness"],
                "questions": ["Which feeds are stale?", "Which topics are missing structured records?", "Where is human writeback incomplete or duplicated?"],
                "outputs": ["data-quality brief", "connector gap queue", "training and form fixes"],
            },
        ]

        copilots = [
            {
                "id": "intake-router",
                "name": "Intake Router Pod",
                "lead_role": "Admin",
                "mission": "Classify inbound email, files, and manual entry into the correct topic and owner before work gets lost.",
                "cadence": ["mailbox scan", "folder scan", "same-day stale intake sweep"],
                "outputs": ["triaged task", "document classification", "owner suggestion", "stale intake alert"],
                "write_policy": "Cross-topic publication and external communication still require human review.",
            },
            {
                "id": "operations-reliability",
                "name": "Operations and Reliability Pod",
                "lead_role": "Operations",
                "mission": "Convert shift notes, maintenance logs, and recurring blockers into cleaner operating records and industrial-engineering signals.",
                "cadence": ["shift digest", "repeat-failure watch", "daily blocker review"],
                "outputs": ["shift digest", "repeat-failure tag", "5W1H draft", "owner suggestion"],
                "write_policy": "Published root-cause tags and cross-functional escalations require manager review.",
            },
            {
                "id": "manufacturing-genealogy",
                "name": "Manufacturing Genealogy Pod",
                "lead_role": "Operations",
                "mission": "Connect raw material, machine, batch, and finished-tyre history into one traceable manufacturing record.",
                "cadence": ["genealogy refresh", "drift watch", "batch trace pack"],
                "outputs": ["traceability pack", "drift alert", "repeat-batch tag", "stage genealogy"],
                "write_policy": "Batch containment or supplier-affecting classifications require plant or quality review.",
            },
            {
                "id": "quality-watch",
                "name": "Quality Watch Pod",
                "lead_role": "Quality / QC",
                "mission": "Turn incidents, evidence, and closeout work into structured DQMS records and quality-loss learning.",
                "cadence": ["incident match", "CAPA prep", "stale closeout watch"],
                "outputs": ["incident draft", "CAPA starter", "Ishikawa starter", "closeout reminder"],
                "write_policy": "Published classifications that affect commercial or supplier posture require quality-manager review.",
            },
            {
                "id": "supplier-recovery",
                "name": "Supplier Recovery Pod",
                "lead_role": "Procurement",
                "mission": "Chase missing documents, delayed replies, and unresolved supplier discrepancies before they age into plant blockers.",
                "cadence": ["missing-doc sweep", "daily delay ranking", "supplier digest"],
                "outputs": ["document request task", "supplier follow-up draft", "delay ranking", "approval escalation"],
                "write_policy": "Supplier escalation that changes scorecards or finance posture requires procurement-lead review.",
            },
            {
                "id": "commercial-memory",
                "name": "Commercial Memory Pod",
                "lead_role": "Sales",
                "mission": "Keep dealer accounts, quote follow-up, and commercial history consistent across Gmail, calendar, and CRM.",
                "cadence": ["daily follow-up refresh", "weekly account review"],
                "outputs": ["account update draft", "follow-up draft", "commercial risk tag", "visit reminder"],
                "write_policy": "Credit-sensitive changes require finance or CEO review.",
            },
            {
                "id": "data-science",
                "name": "Data Science Pod",
                "lead_role": "Admin",
                "mission": "Clean tenant data, engineer features, and generate KPI, forecast, and gap-analysis signals for management review.",
                "cadence": ["dataset cleanup", "feature refresh", "weekly forecast run"],
                "outputs": ["clean dataset", "feature refresh", "forecast brief", "gap-analysis pack"],
                "write_policy": "Live decision changes require CEO or admin review.",
            },
            {
                "id": "director-brief",
                "name": "CEO Brief Pod",
                "lead_role": "CEO",
                "mission": "Compile a short executive review from plant, supplier, quality, commercial, and runtime state.",
                "cadence": ["daily brief", "weekend review", "stale decision watch"],
                "outputs": ["daily brief draft", "priority list", "decision prompt", "stale escalation watch"],
                "write_policy": "Outward-facing summaries and high-severity escalations require CEO or admin review.",
            },
        ]

        writeback_lanes = [
            {
                "id": "receiving-intake-entry",
                "name": "Receiving Intake and Variance Entry",
                "route": "/app/receiving",
                "users": ["receiving clerk", "plant manager"],
                "captures": ["GRN or batch", "supplier", "variance note", "hold or release state", "next action", "evidence link"],
                "quality_rules": ["batch required", "variance classification required", "owner and next action required"],
                "downstream_marts": ["supplier recovery and GRN mart", "plant flow and industrial engineering mart"],
                "downstream_stories": ["Supplier recovery story", "Plant shift and engineering story"],
            },
            {
                "id": "quality-closeout-entry",
                "name": "DQMS Incident and CAPA Entry",
                "route": "/app/dqms",
                "users": ["quality manager", "plant manager", "maintenance lead"],
                "captures": ["incident summary", "batch or lot", "containment action", "5W1H review", "CAPA owner", "closeout evidence"],
                "quality_rules": ["root cause before closeout", "evidence attached", "manager signoff required"],
                "downstream_marts": ["quality loss and release mart", "executive KPI and storytelling mart"],
                "downstream_stories": ["Quality technical story", "CEO daily brief"],
            },
            {
                "id": "strategy-gap-entry",
                "name": "KPI, SWOT, and Gap Analysis Entry",
                "route": "/app/insights",
                "users": ["director", "tenant admin", "plant manager", "sales lead"],
                "captures": ["target metric", "current gap", "SWOT notes", "corrective theme", "next move"],
                "quality_rules": ["metric source required", "owner required", "reviewed in management cadence"],
                "downstream_marts": ["executive KPI and storytelling mart"],
                "downstream_stories": ["CEO daily brief", "Admin data-quality story"],
            },
            {
                "id": "maintenance-work-entry",
                "name": "Maintenance Breakdown and PM Entry",
                "route": "/app/maintenance",
                "users": ["maintenance lead", "plant manager"],
                "captures": ["machine or asset", "downtime summary", "5W1H notes", "spare-part blocker", "next maintenance action"],
                "quality_rules": ["owner required", "repeat failure flagged", "downtime and follow-up required"],
                "downstream_marts": ["plant flow and industrial engineering mart", "quality loss and release mart"],
                "downstream_stories": ["Plant shift and engineering story", "Quality technical story"],
            },
            {
                "id": "operations-root-cause-entry",
                "name": "Operations Root-Cause Review",
                "route": "/app/operations",
                "users": ["plant manager", "quality manager", "maintenance lead"],
                "captures": ["issue summary", "Ishikawa branches", "why chain", "owner", "due date"],
                "quality_rules": ["linked source record required", "countermeasure owner required", "reviewed in shift or manager meeting"],
                "downstream_marts": ["plant flow and industrial engineering mart", "quality loss and release mart"],
                "downstream_stories": ["Plant shift and engineering story", "CEO daily brief"],
            },
            {
                "id": "supplier-recovery-entry",
                "name": "Supplier Discrepancy and Recovery Entry",
                "route": "/app/approvals",
                "users": ["procurement lead", "finance controller"],
                "captures": ["supplier record", "missing evidence", "financial impact", "required reply"],
                "quality_rules": ["discrepancy tied to shipment or PO", "approval threshold applied", "age tracked"],
                "downstream_marts": ["supplier recovery and GRN mart", "executive KPI and storytelling mart"],
                "downstream_stories": ["Supplier recovery story", "Finance approval story"],
            },
            {
                "id": "account-review-entry",
                "name": "Dealer Account Review",
                "route": "/app/revenue",
                "users": ["sales lead", "director"],
                "captures": ["account stage", "credit notes", "next visit", "commercial risk"],
                "quality_rules": ["account owner required", "next action required", "risk label reviewed weekly"],
                "downstream_marts": ["commercial demand and dealer mart", "executive KPI and storytelling mart"],
                "downstream_stories": ["Sales and demand story", "CEO daily brief"],
            },
            {
                "id": "director-exception-note",
                "name": "CEO Strategy Note",
                "route": "/app/director",
                "users": ["director", "tenant admin"],
                "captures": ["exception decision", "priority shift", "cross-module note", "strategy instruction"],
                "quality_rules": ["linked to source records", "owner and due date required"],
                "downstream_marts": ["executive KPI and storytelling mart"],
                "downstream_stories": ["CEO daily brief", "Admin data-quality story"],
            },
        ]

        updated_at = _runtime_latest_timestamp(
            [
                connector_change_latest,
                receiving_latest,
                quality_latest,
                metric_latest,
                maintenance_latest,
                approval_latest,
                lead_latest,
                decision_latest,
                revenue_scout_run_at,
                ops_watch_run_at,
                founder_brief_run_at,
                task_triage_run_at,
            ]
        )

        return {
            "status": "ready",
            "updated_at": updated_at,
            "summary": {
                "lead_count": lead_count,
                "receiving_count": receiving_count,
                "receiving_hold_count": receiving_hold_count,
                "quality_incident_count": quality_incident_count,
                "supplier_risk_count": supplier_risk_count,
                "maintenance_count": maintenance_count,
                "metric_count": metric_count,
                "pending_approval_count": pending_approval_count,
                "open_task_count": open_task_count,
            },
            "source_registry": source_registry,
            "connector_signals": connector_signals,
            "source_events": source_events,
            "learning_database": learning_database,
            "knowledge_graph_domains": knowledge_graph_domains,
            "change_lineage": change_lineage,
            "manager_programs": manager_programs,
            "agent_handoffs": agent_handoffs,
            "pipeline_stages": pipeline_stages,
            "topic_pipelines": topic_pipelines,
            "feature_marts": feature_marts,
            "role_stories": role_stories,
            "copilots": copilots,
            "writeback_lanes": writeback_lanes,
            "big_picture": {
                "thesis": "Yangon Tyre Data Fabric turns Drive, Gmail, ERP, and operator writeback into one enterprise data runtime for control, analysis, and storytelling.",
                "current_truth": [
                    f"{len(source_registry)} source registries and {len(connector_signals)} connector signals now expose evidence counts, routes, and freshness directly in the portal.",
                    f"{receiving_count} receiving rows, {quality_incident_count} quality incidents, {supplier_risk_count} supplier risks, and {lead_count} live leads are already available as raw tenant signal.",
                    f"{metric_count} metric rows and {open_task_count} open tasks can already be joined into feature engineering and manager review loops.",
                    f"{graph_node_count} graph nodes, {graph_edge_count} graph edges, and {connector_change_count} lineage events now describe how the learning database changes over time.",
                    f"{len(manager_programs)} manager programs and {len(agent_handoffs)} AI handoffs now translate tenant signal into the next owner and next analysis step.",
                    f"Latest source signals show Drive {drive_signal_at or 'not yet recorded'}, procurement {procurement_signal_at or 'not yet recorded'}, commercial {commercial_signal_at or 'not yet recorded'}, executive {executive_signal_at or 'not yet recorded'}.",
                ],
                "next_builds": [
                    "Persist direct Gmail, Drive, and ERP change events so connector freshness stops depending on promoted downstream records.",
                    "Add chat-mesh, website, analytics, and social ingestors with governed source-event promotion and role-specific routing.",
                    "Land stored feature marts and lineage contracts so role stories, manager programs, and agent handoffs can prove freshness, trust, and required follow-through automatically.",
                ],
            },
        }

    def _adoption_command_payload(session: dict[str, Any]) -> dict[str, Any]:
        workspace_id = str(session.get("workspace_id", "")).strip()
        lead_rows = enterprise_list_leads(enterprise_db_url, workspace_id=workspace_id, limit=200) if workspace_id else []
        workspace_tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=200) if workspace_id else []
        latest_agent_runs = enterprise_list_agent_runs(enterprise_db_url, workspace_id=workspace_id, limit=50) if workspace_id else []
        latest_agent_runs_by_type = _group_agent_runs_by_job_type(latest_agent_runs)
        decision_rows = list_decision_entries(state_db, limit=200)
        approval_rows = list_approval_entries(state_db, limit=200)
        quality_rows = list_quality_incidents(state_db, limit=200)
        capa_rows = list_capa_actions(state_db, limit=200)
        supplier_rows = list_supplier_risks(state_db, limit=200)
        receiving_rows = list_receiving_records(state_db, limit=200)
        maintenance_rows = list_maintenance_records(state_db, limit=200)
        metric_rows = list_metric_entries(state_db, limit=200)

        task_latest = _latest_timestamp_from_rows(workspace_tasks, ("updated_at", "created_at"))
        lead_latest = _latest_timestamp_from_rows(lead_rows, ("synced_at", "created_at"))
        decision_latest = _latest_timestamp_from_rows(decision_rows, ("created_at",))
        approval_latest = _latest_timestamp_from_rows(approval_rows, ("created_at",))
        quality_latest = _latest_signal(
            [
                _latest_timestamp_from_rows(quality_rows, ("reported_at", "synced_at")),
                _latest_timestamp_from_rows(capa_rows, ("synced_at", "created_at")),
            ]
        )
        procurement_latest = _latest_signal(
            [
                _latest_timestamp_from_rows(supplier_rows, ("synced_at", "eta")),
                approval_latest,
            ]
        )
        receiving_latest = _latest_timestamp_from_rows(receiving_rows, ("received_at", "synced_at"))
        maintenance_latest = _latest_timestamp_from_rows(maintenance_rows, ("logged_at", "synced_at"))
        metric_latest = _latest_timestamp_from_rows(metric_rows, ("captured_at", "synced_at"))
        plant_latest = _latest_signal([task_latest, receiving_latest, maintenance_latest])
        director_latest = _latest_signal([decision_latest, task_latest, approval_latest])
        admin_latest = _latest_signal([metric_latest, task_latest, decision_latest])

        receiving_completeness = _score_percent(
            _count_complete_rows(receiving_rows, ("supplier", "grn_or_batch", "material", "owner", "next_action", "evidence_link")),
            len(receiving_rows),
        )
        quality_incident_completeness = _score_percent(
            _count_complete_rows(quality_rows, ("title", "summary", "owner", "target_close_date")),
            len(quality_rows),
        )
        capa_completeness = _score_percent(
            _count_complete_rows(capa_rows, ("incident_id", "action_title", "owner", "target_date", "verification_criteria")),
            len(capa_rows),
        )
        quality_completeness = _average_scores([value for value in [quality_incident_completeness, capa_completeness] if value > 0])
        maintenance_completeness = _score_percent(
            _count_complete_rows(maintenance_rows, ("asset_name", "issue_type", "owner", "next_action", "evidence_link")),
            len(maintenance_rows),
        )
        approval_completeness = _score_percent(
            _count_complete_rows(approval_rows, ("title", "owner", "due", "evidence_link")),
            len(approval_rows),
        )
        supplier_completeness = _score_percent(
            _count_complete_rows(supplier_rows, ("supplier", "owner", "next_action", "risk_type")),
            len(supplier_rows),
        )
        procurement_completeness = _average_scores([value for value in [approval_completeness, supplier_completeness] if value > 0])
        sales_completeness = _score_percent(
            _count_complete_rows(lead_rows, ("company_name", "owner", "stage", "source")),
            len(lead_rows),
        )
        task_completeness = _score_percent(
            _count_complete_rows(workspace_tasks, ("title", "owner", "priority", "due")),
            len(workspace_tasks),
        )
        decision_completeness = _score_percent(
            _count_complete_rows(decision_rows, ("title", "decision_text", "owner", "due")),
            len(decision_rows),
        )
        metric_completeness = _score_percent(
            _count_complete_rows(metric_rows, ("metric_name", "metric_group", "metric_value", "period_label", "owner", "evidence_link")),
            len(metric_rows),
        )
        plant_completeness = _average_scores([value for value in [task_completeness, receiving_completeness, maintenance_completeness] if value > 0])
        director_completeness = _average_scores([value for value in [decision_completeness, task_completeness] if value > 0])
        admin_completeness = _average_scores([value for value in [metric_completeness, task_completeness, decision_completeness] if value > 0])

        receiving_stale_count = sum(
            1
            for row in receiving_rows
            if str(row.get("status", "")).strip().lower() in {"hold", "blocked", "review"}
            or str(row.get("variance_note", "")).strip().lower() not in {"", "matched"}
        )
        quality_stale_count = _count_active_rows(quality_rows) + _count_active_rows(capa_rows)
        maintenance_stale_count = _count_active_rows(maintenance_rows)
        task_overdue_count = _count_overdue_rows(workspace_tasks)
        approval_stale_count = _count_active_rows(approval_rows)
        supplier_stale_count = _count_active_rows(supplier_rows)
        sales_stale_count = _count_active_rows(lead_rows) + task_overdue_count
        director_stale_count = _count_active_rows(decision_rows) + task_overdue_count + approval_stale_count
        plant_stale_count = task_overdue_count + receiving_stale_count + maintenance_stale_count
        admin_stale_count = task_overdue_count + sum(1 for row in metric_rows if str(row.get("status", "")).strip().lower() in {"draft", "review", "stale"})

        receiving_live_count = len(receiving_rows)
        plant_live_count = len(workspace_tasks) + len(receiving_rows) + len(maintenance_rows)
        quality_live_count = len(quality_rows) + len(capa_rows)
        maintenance_live_count = len(maintenance_rows)
        procurement_live_count = len(supplier_rows) + len(approval_rows)
        sales_live_count = len(lead_rows)
        director_live_count = len(decision_rows) + len(workspace_tasks) + len(approval_rows)
        admin_live_count = len(metric_rows) + len(latest_agent_runs) + len(workspace_tasks)

        receiving_score = _adoption_score(receiving_completeness, receiving_latest, "daily", stale_count=receiving_stale_count, live_count=receiving_live_count)
        plant_score = _adoption_score(plant_completeness, plant_latest, "daily", stale_count=plant_stale_count, live_count=plant_live_count)
        quality_score = _adoption_score(quality_completeness, quality_latest, "daily", stale_count=quality_stale_count, live_count=quality_live_count)
        maintenance_score = _adoption_score(
            maintenance_completeness,
            maintenance_latest,
            "daily",
            stale_count=maintenance_stale_count,
            live_count=maintenance_live_count,
        )
        procurement_score = _adoption_score(
            procurement_completeness,
            procurement_latest,
            "daily",
            stale_count=approval_stale_count + supplier_stale_count,
            live_count=procurement_live_count,
        )
        sales_score = _adoption_score(sales_completeness, lead_latest, "daily", stale_count=sales_stale_count, live_count=sales_live_count)
        director_score = _adoption_score(director_completeness, director_latest, "daily", stale_count=director_stale_count, live_count=director_live_count)
        admin_score = _adoption_score(admin_completeness, admin_latest, "daily", stale_count=admin_stale_count, live_count=admin_live_count)

        role_packs = [
            {
                "id": "receiving",
                "status": _adoption_status(receiving_score, receiving_latest, "daily", has_live_signal=receiving_live_count > 0),
                "live_count": receiving_live_count,
                "stale_count": receiving_stale_count,
                "completeness_score": receiving_completeness,
                "adoption_score": receiving_score,
                "last_activity_at": receiving_latest,
                "blockers": [
                    *([f"{receiving_stale_count} receiving records still need hold, release, or variance follow-through."] if receiving_stale_count else []),
                    *(["Evidence links or next actions are still missing on some receiving records."] if receiving_completeness and receiving_completeness < 90 else []),
                    *(["No recent receiving signal has been captured in the workspace yet."] if not receiving_latest else []),
                ]
                or ["Receiving records are flowing; keep the manager review inside the portal."],
                "next_escalation": "Plant manager clears open holds before shift close and the next morning review.",
            },
            {
                "id": "plant",
                "status": _adoption_status(plant_score, plant_latest, "daily", has_live_signal=plant_live_count > 0),
                "live_count": plant_live_count,
                "stale_count": plant_stale_count,
                "completeness_score": plant_completeness,
                "adoption_score": plant_score,
                "last_activity_at": plant_latest,
                "blockers": [
                    *([f"{task_overdue_count} work items are overdue in the plant queue."] if task_overdue_count else []),
                    *([f"{receiving_stale_count} receiving issues are still feeding plant friction."] if receiving_stale_count else []),
                    *([f"{maintenance_stale_count} maintenance items remain open against plant execution."] if maintenance_stale_count else []),
                ]
                or ["Plant review is holding; keep the shift handoff inside the portal."],
                "next_escalation": "Plant manager runs the shift review from Operations Control and closes owners live.",
            },
            {
                "id": "quality",
                "status": _adoption_status(quality_score, quality_latest, "daily", has_live_signal=quality_live_count > 0),
                "live_count": quality_live_count,
                "stale_count": quality_stale_count,
                "completeness_score": quality_completeness,
                "adoption_score": quality_score,
                "last_activity_at": quality_latest,
                "blockers": [
                    *([f"{quality_stale_count} incidents or CAPA actions are still open."] if quality_stale_count else []),
                    *(["Incident or CAPA records are missing owner, close date, or verification detail."] if quality_completeness and quality_completeness < 90 else []),
                    *(["Quality evidence has not refreshed recently enough for the board review."] if quality_latest and _runtime_status_from_timestamp(quality_latest, "daily", missing="Needs wiring") != "Healthy" else []),
                ]
                or ["Quality evidence is flowing; keep closeout discipline on the same records."],
                "next_escalation": "Quality manager reviews incidents and CAPA age inside DQMS every day.",
            },
            {
                "id": "maintenance",
                "status": _adoption_status(maintenance_score, maintenance_latest, "daily", has_live_signal=maintenance_live_count > 0),
                "live_count": maintenance_live_count,
                "stale_count": maintenance_stale_count,
                "completeness_score": maintenance_completeness,
                "adoption_score": maintenance_score,
                "last_activity_at": maintenance_latest,
                "blockers": [
                    *([f"{maintenance_stale_count} maintenance records are still open or unresolved."] if maintenance_stale_count else []),
                    *(["Downtime or next-action fields are still incomplete on some maintenance work."] if maintenance_completeness and maintenance_completeness < 90 else []),
                    *(["No recent maintenance evidence has been captured yet."] if not maintenance_latest else []),
                ]
                or ["Maintenance records are active; keep downtime entry mandatory before closeout."],
                "next_escalation": "Maintenance lead reviews downtime and repeat failures before the next workday starts.",
            },
            {
                "id": "procurement",
                "status": _adoption_status(procurement_score, procurement_latest, "daily", has_live_signal=procurement_live_count > 0),
                "live_count": procurement_live_count,
                "stale_count": approval_stale_count + supplier_stale_count,
                "completeness_score": procurement_completeness,
                "adoption_score": procurement_score,
                "last_activity_at": procurement_latest,
                "blockers": [
                    *([f"{approval_stale_count} approvals still need owner action or evidence."] if approval_stale_count else []),
                    *([f"{supplier_stale_count} supplier-risk records are still open."] if supplier_stale_count else []),
                    *(["Supplier records or approval packets still lack evidence, due date, or next action."] if procurement_completeness and procurement_completeness < 90 else []),
                ]
                or ["Supplier recovery is flowing; keep the queue as the official follow-up list."],
                "next_escalation": "Procurement lead runs supplier recovery from the approvals queue, not from email alone.",
            },
            {
                "id": "sales",
                "status": _adoption_status(sales_score, lead_latest, "daily", has_live_signal=sales_live_count > 0),
                "live_count": sales_live_count,
                "stale_count": sales_stale_count,
                "completeness_score": sales_completeness,
                "adoption_score": sales_score,
                "last_activity_at": lead_latest,
                "blockers": [
                    *([f"{_count_active_rows(lead_rows)} active leads still need stage progression or closeout."] if _count_active_rows(lead_rows) else []),
                    *([f"{task_overdue_count} overdue tasks are now affecting commercial follow-through."] if task_overdue_count else []),
                    *(["Lead ownership, stage, or source tagging is still incomplete in the pipeline."] if sales_completeness and sales_completeness < 90 else []),
                ]
                or ["Sales records are active; keep next action on every account update."],
                "next_escalation": "Sales lead opens the weekly commercial review from the live pipeline and account records.",
            },
            {
                "id": "director",
                "status": _adoption_status(director_score, director_latest, "daily", has_live_signal=director_live_count > 0),
                "live_count": director_live_count,
                "stale_count": director_stale_count,
                "completeness_score": director_completeness,
                "adoption_score": director_score,
                "last_activity_at": director_latest,
                "blockers": [
                    *([f"{_count_active_rows(decision_rows)} decisions are still open without final closeout."] if _count_active_rows(decision_rows) else []),
                    *([f"{approval_stale_count} approval items are still blocking leadership review."] if approval_stale_count else []),
                    *(["Decision notes or due dates are incomplete on some management records."] if director_completeness and director_completeness < 90 else []),
                ]
                or ["Leadership review is on-system; keep decisions tied back to the source records."],
                "next_escalation": "Director closes each leadership review with a recorded decision, owner, and due date.",
            },
            {
                "id": "admin",
                "status": _adoption_status(admin_score, admin_latest, "daily", has_live_signal=admin_live_count > 0),
                "live_count": admin_live_count,
                "stale_count": admin_stale_count,
                "completeness_score": admin_completeness,
                "adoption_score": admin_score,
                "last_activity_at": admin_latest,
                "blockers": [
                    *([f"{admin_stale_count} admin-facing data or work items still need cleanup or review."] if admin_stale_count else []),
                    *(["Metric evidence or owner fields are still incomplete on some KPI rows."] if metric_completeness and metric_completeness < 90 else []),
                    *(["No recent admin control signal has been recorded yet."] if not admin_latest else []),
                ]
                or ["Admin controls are active; keep stale connectors and low-usage lanes visible every week."],
                "next_escalation": "Tenant admin reviews stale surfaces, role drift, and connector freshness every week with management.",
            },
        ]

        surface_health = [
            {
                "id": "receiving-intake-entry",
                "status": _adoption_status(receiving_score, receiving_latest, "daily", has_live_signal=receiving_live_count > 0),
                "live_count": receiving_live_count,
                "stale_count": receiving_stale_count,
                "completeness_score": receiving_completeness,
                "last_activity_at": receiving_latest,
                "manager_rule": "Every receiving exception needs batch, owner, next action, and evidence before the review closes.",
                "automation": "Feeds supplier recovery and plant-shift stories automatically once the record is complete.",
            },
            {
                "id": "quality-closeout-entry",
                "status": _adoption_status(quality_score, quality_latest, "daily", has_live_signal=quality_live_count > 0),
                "live_count": quality_live_count,
                "stale_count": quality_stale_count,
                "completeness_score": quality_completeness,
                "last_activity_at": quality_latest,
                "manager_rule": "Closeouts require containment, owner, target date, and evidence-backed verification.",
                "automation": "Feeds defect stories, CAPA review, and the CEO brief when records are complete.",
            },
            {
                "id": "strategy-gap-entry",
                "status": _adoption_status(admin_score, metric_latest, "daily", has_live_signal=len(metric_rows) > 0),
                "live_count": len(metric_rows),
                "stale_count": sum(1 for row in metric_rows if str(row.get("status", "")).strip().lower() in {"draft", "review", "stale"}),
                "completeness_score": metric_completeness,
                "last_activity_at": metric_latest,
                "manager_rule": "Every KPI row must cite source evidence, owner, and the management gap being reviewed.",
                "automation": "Feeds executive KPI stories and monthly intelligence packs.",
            },
            {
                "id": "maintenance-work-entry",
                "status": _adoption_status(maintenance_score, maintenance_latest, "daily", has_live_signal=maintenance_live_count > 0),
                "live_count": maintenance_live_count,
                "stale_count": maintenance_stale_count,
                "completeness_score": maintenance_completeness,
                "last_activity_at": maintenance_latest,
                "manager_rule": "Downtime and next action must be recorded before maintenance work is treated as closed.",
                "automation": "Feeds reliability cuts, repeat-failure watch, and plant-shift escalation.",
            },
            {
                "id": "operations-root-cause-entry",
                "status": _adoption_status(plant_score, task_latest, "daily", has_live_signal=len(workspace_tasks) > 0),
                "live_count": len(workspace_tasks),
                "stale_count": task_overdue_count,
                "completeness_score": task_completeness,
                "last_activity_at": task_latest,
                "manager_rule": "Operations reviews must end with owner, due date, and next action captured on the shared record.",
                "automation": "Feeds shift handoff, exception routing, and overdue escalation loops.",
            },
            {
                "id": "supplier-recovery-entry",
                "status": _adoption_status(procurement_score, procurement_latest, "daily", has_live_signal=procurement_live_count > 0),
                "live_count": procurement_live_count,
                "stale_count": approval_stale_count + supplier_stale_count,
                "completeness_score": procurement_completeness,
                "last_activity_at": procurement_latest,
                "manager_rule": "Discrepancies need shipment context, evidence, owner, and approval path in one case record.",
                "automation": "Feeds finance approvals, supplier escalation, and plant-blocker visibility.",
            },
            {
                "id": "account-review-entry",
                "status": _adoption_status(sales_score, lead_latest, "daily", has_live_signal=sales_live_count > 0),
                "live_count": sales_live_count,
                "stale_count": sales_stale_count,
                "completeness_score": sales_completeness,
                "last_activity_at": lead_latest,
                "manager_rule": "Every account update needs owner, stage, and next action before the meeting closes.",
                "automation": "Feeds revenue stories, demand watch, and dealer follow-up prompts.",
            },
            {
                "id": "director-exception-note",
                "status": _adoption_status(director_score, decision_latest, "daily", has_live_signal=len(decision_rows) > 0),
                "live_count": len(decision_rows),
                "stale_count": _count_active_rows(decision_rows),
                "completeness_score": decision_completeness,
                "last_activity_at": decision_latest,
                "manager_rule": "Leadership instructions must stay linked to a source record, owner, and due date.",
                "automation": "Feeds the CEO brief, admin data-quality story, and task-triage loop.",
            },
        ]

        loop_templates = [
            {
                "id": "ops_watch",
                "name": "Ops Watch",
                "cadence": "15m",
                "owner": "Tenant admin",
                "mission": "Watch stale queues, runtime pressure, and manager-review drift.",
                "focus": "Runtime health and adoption drift",
            },
            {
                "id": "task_triage",
                "name": "Task Triage",
                "cadence": "hourly",
                "owner": "Plant manager",
                "mission": "Promote stale work and missing owners into visible follow-through tasks.",
                "focus": "Owner clarity and queue hygiene",
            },
            {
                "id": "founder_brief",
                "name": "Founder Brief",
                "cadence": "daily",
                "owner": "CEO / director",
                "mission": "Publish a daily management view from live plant, supplier, sales, and approval state.",
                "focus": "Leadership review and priority reset",
            },
            {
                "id": "revenue_scout",
                "name": "Revenue Scout",
                "cadence": "hourly",
                "owner": "Sales lead",
                "mission": "Keep pipeline movement and demand changes visible without manual chase.",
                "focus": "Commercial freshness and next action coverage",
            },
        ]
        agent_loops = []
        loop_status_scores: list[int] = []
        for template in loop_templates:
            latest_run = latest_agent_runs_by_type.get(template["id"], {}) if isinstance(latest_agent_runs_by_type, dict) else {}
            last_run_at = str(latest_run.get("completed_at", "")).strip()
            status = _runtime_status_from_timestamp(last_run_at, template["cadence"], missing="Needs wiring")
            loop_status_scores.append({"Healthy": 100, "Warning": 72, "Degraded": 40, "Needs wiring": 15}.get(status, 15))
            agent_loops.append(
                {
                    "id": template["id"],
                    "status": status,
                    "last_run_at": last_run_at,
                    "owner": template["owner"],
                    "mission": template["mission"],
                    "focus": template["focus"],
                }
            )

        rituals = [
            {
                "id": "shift-review",
                "route": "/app/operations",
                "status": _adoption_status(plant_score, plant_latest, "daily", has_live_signal=plant_live_count > 0),
                "last_signal_at": plant_latest,
                "freshness": _runtime_freshness_label(plant_latest, fallback="No plant-review signal yet"),
                "backlog": f"{plant_stale_count} plant blockers and {receiving_stale_count} receiving holds are still open.",
            },
            {
                "id": "daily-brief",
                "route": "/app/director",
                "status": _adoption_status(
                    director_score,
                    str(latest_agent_runs_by_type.get("founder_brief", {}).get("completed_at", "")).strip() or director_latest,
                    "daily",
                    has_live_signal=director_live_count > 0,
                ),
                "last_signal_at": str(latest_agent_runs_by_type.get("founder_brief", {}).get("completed_at", "")).strip() or director_latest,
                "freshness": _runtime_freshness_label(
                    str(latest_agent_runs_by_type.get("founder_brief", {}).get("completed_at", "")).strip() or director_latest,
                    fallback="No director brief yet",
                ),
                "backlog": f"{approval_stale_count} approvals, {director_stale_count} director-side items, and {_count_active_rows(decision_rows)} open decisions need review.",
            },
            {
                "id": "quality-board",
                "route": "/app/dqms",
                "status": _adoption_status(quality_score, quality_latest, "daily", has_live_signal=quality_live_count > 0),
                "last_signal_at": quality_latest,
                "freshness": _runtime_freshness_label(quality_latest, fallback="No quality-board signal yet"),
                "backlog": f"{quality_stale_count} incidents or CAPA actions remain open in DQMS.",
            },
            {
                "id": "supplier-review",
                "route": "/app/approvals",
                "status": _adoption_status(procurement_score, procurement_latest, "daily", has_live_signal=procurement_live_count > 0),
                "last_signal_at": procurement_latest,
                "freshness": _runtime_freshness_label(procurement_latest, fallback="No supplier-review signal yet"),
                "backlog": f"{approval_stale_count} approvals and {supplier_stale_count} supplier records still need follow-through.",
            },
            {
                "id": "monthly-intelligence",
                "route": "/app/insights",
                "status": _adoption_status(admin_score, metric_latest, "daily", has_live_signal=len(metric_rows) > 0),
                "last_signal_at": metric_latest,
                "freshness": _runtime_freshness_label(metric_latest, fallback="No KPI refresh signal yet"),
                "backlog": f"{len(metric_rows)} KPI rows and {task_overdue_count} overdue tasks are shaping the current analysis backlog.",
            },
        ]

        healthy_role_count = sum(1 for item in role_packs if str(item.get("status", "")).strip() == "Healthy")
        warning_role_count = sum(1 for item in role_packs if str(item.get("status", "")).strip() == "Warning")
        degraded_role_count = sum(1 for item in role_packs if str(item.get("status", "")).strip() == "Degraded")
        live_surface_count = sum(1 for item in surface_health if int(item.get("live_count", 0) or 0) > 0)
        stale_surface_count = sum(
            1
            for item in surface_health
            if int(item.get("stale_count", 0) or 0) > 0 or str(item.get("status", "")).strip() != "Healthy"
        )
        agent_coverage_score = _average_scores(loop_status_scores)
        overall_score = _average_scores(
            [
                *[int(item.get("adoption_score", 0) or 0) for item in role_packs],
                *[
                    _adoption_score(
                        int(item.get("completeness_score", 0) or 0),
                        str(item.get("last_activity_at", "")).strip(),
                        "daily",
                        stale_count=int(item.get("stale_count", 0) or 0),
                        live_count=int(item.get("live_count", 0) or 0),
                    )
                    for item in surface_health
                ],
                agent_coverage_score,
            ]
        )

        updated_at = _runtime_latest_timestamp(
            [
                task_latest,
                lead_latest,
                decision_latest,
                approval_latest,
                quality_latest,
                procurement_latest,
                receiving_latest,
                maintenance_latest,
                metric_latest,
                *[str(item.get("last_run_at", "")).strip() for item in agent_loops],
            ]
        )

        return {
            "status": "ready",
            "updated_at": updated_at,
            "summary": {
                "overall_score": overall_score,
                "role_pack_count": len(role_packs),
                "healthy_role_count": healthy_role_count,
                "warning_role_count": warning_role_count,
                "degraded_role_count": degraded_role_count,
                "live_surface_count": live_surface_count,
                "stale_surface_count": stale_surface_count,
                "agent_coverage_score": agent_coverage_score,
            },
            "role_packs": role_packs,
            "surface_health": surface_health,
            "rituals": rituals,
            "agent_loops": agent_loops,
            "big_picture": {
                "thesis": "Adoption Command closes the loop between staff entry, manager review, role storytelling, and agent reinforcement.",
                "current_truth": [
                    f"{len(role_packs)} role packs are now scored from live receiving, quality, maintenance, approval, sales, and decision records.",
                    f"{live_surface_count} writeback lanes already show live traffic, while {stale_surface_count} still need intervention or tighter review.",
                    f"Agent reinforcement currently scores {agent_coverage_score}, based on ops watch, task triage, founder brief, and revenue scout freshness.",
                ],
                "next_builds": [
                    "Persist direct usage telemetry per role so command scores can distinguish no-work days from real adoption drift.",
                    "Add connector-backed signals from Gmail, Drive, and chat meshes so writeback coverage includes passive evidence flow too.",
                    "Promote low-score roles and stale writeback lanes into automatic review tasks and manager follow-through packets.",
                ],
            },
        }

    def _summary_payload(session: dict[str, Any]) -> dict[str, Any]:
        review = _load_json(pilot_data / "execution_review.json")
        autopilot = _load_json(pilot_data / "autopilot_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        publish = _load_json(pilot_data / "platform_publish.json")
        product_lab = load_snapshot(state_db, "product_lab") or _load_json(pilot_data / "product_lab.json")
        action_summary = load_action_summary(state_db)
        tenant_key = _agent_workspace_resource_key(session)
        agent_team_summary = load_agent_team_summary(state_db, tenant_key=tenant_key)
        quality_summary = load_quality_summary(state_db)
        supplier_summary = load_supplier_risk_summary(state_db)
        receiving_summary = load_receiving_summary(state_db)
        inventory_summary = load_inventory_summary(state_db)
        maintenance_summary = load_maintenance_summary(state_db)
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
            "maintenance": maintenance_summary,
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

    def _cloud_control_status(value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"ready", "healthy", "active", "configured"}:
            return "ready"
        if normalized in {"warning", "partial", "attention", "review", "reauth_required", "storage_quota_blocked", "timeout"}:
            return "attention"
        return "blocked"

    def _cloud_control_card(
        *,
        item_id: str,
        name: str,
        status: str,
        detail: str,
        chips: list[str] | None = None,
        route: str = "",
    ) -> dict[str, Any]:
        return {
            "id": item_id,
            "name": name,
            "status": status,
            "detail": detail,
            "chips": [str(item).strip() for item in (chips or []) if str(item).strip()],
            "route": route,
        }

    def _cloud_job_freshness_status(last_run_at: str, cadence: str) -> str:
        runtime_status = _runtime_status_from_timestamp(last_run_at, cadence, missing="Degraded")
        if runtime_status == "Healthy":
            return "ready"
        if runtime_status == "Warning":
            return "attention"
        return "blocked"

    def _cloud_toolchain_cards(*, github_runtime: dict[str, Any]) -> list[dict[str, Any]]:
        tool_specs = [
            {
                "id": "codex-cli",
                "name": "Codex CLI",
                "command": "codex",
                "lane": "Primary builder",
                "route": "/app/security",
                "missing_status": "blocked",
                "env_names": ("OPENAI_API_KEY",),
                "ready_detail": "Codex is installed on this host, so the main coding lane can build directly inside the shared workspace.",
                "missing_detail": "Codex is not installed on this host, so the primary coding lane cannot run locally.",
            },
            {
                "id": "node-runtime",
                "name": "Node runtime",
                "command": "node",
                "lane": "Frontend and worker runtime",
                "route": "/app/cloud",
                "missing_status": "blocked",
                "env_names": (),
                "ready_detail": "Node is available for the showroom app, frontend builds, and JavaScript tool execution.",
                "missing_detail": "Node is missing, so the portal build and JS worker surface cannot run on this host.",
            },
            {
                "id": "npm-cli",
                "name": "npm CLI",
                "command": "npm",
                "lane": "Package manager",
                "route": "/app/cloud",
                "missing_status": "attention",
                "env_names": (),
                "ready_detail": "npm is available for package install, build, and smoke workflows.",
                "missing_detail": "npm is missing, so frontend/package workflows are constrained on this host.",
            },
            {
                "id": "python-runtime",
                "name": "Python runtime",
                "command": "python3",
                "lane": "Backend and agent runtime",
                "route": "/app/runtime",
                "missing_status": "blocked",
                "env_names": (),
                "ready_detail": "Python is available for the backend, durable job runner, and data/runtime services.",
                "missing_detail": "Python is missing, so the backend and job worker lanes cannot run on this host.",
            },
            {
                "id": "git-runtime",
                "name": "Git runtime",
                "command": "git",
                "lane": "Repo control",
                "route": "/app/factory",
                "missing_status": "blocked",
                "env_names": (),
                "ready_detail": "Git is available for repo inspection, branch control, and release-state checks.",
                "missing_detail": "Git is missing, so repo inspection and release-state checks cannot run locally.",
            },
            {
                "id": "github-cli",
                "name": "GitHub CLI",
                "command": "gh",
                "lane": "Repo automation",
                "route": "/app/teams",
                "missing_status": "attention",
                "env_names": ("SUPERMEGA_GITHUB_TOKEN", "GITHUB_TOKEN"),
                "ready_detail": "GitHub CLI is available for authenticated issue, PR, and workflow operations beyond the public API probe.",
                "missing_detail": "GitHub CLI is not installed, so repo automation falls back to local git state and the GitHub REST probe.",
            },
            {
                "id": "vercel-cli",
                "name": "Vercel CLI",
                "command": "vercel",
                "lane": "Preview deploy",
                "route": "/app/factory",
                "missing_status": "attention",
                "env_names": ("VERCEL_TOKEN",),
                "ready_detail": "Vercel CLI is available for preview deploy and environment operations from the same workspace.",
                "missing_detail": "Vercel CLI is not installed, so preview deploys depend on scripted fallback paths only.",
            },
            {
                "id": "wrangler-cli",
                "name": "Wrangler CLI",
                "command": "wrangler",
                "lane": "Cloudflare edge lane",
                "route": "/app/cloud",
                "missing_status": "attention",
                "env_names": ("CLOUDFLARE_API_TOKEN",),
                "ready_detail": "Wrangler is available if Cloudflare Workers or Queues become part of the runtime mix.",
                "missing_detail": "Wrangler is not installed, so the Cloudflare edge lane is modeled but not executable on this host.",
            },
            {
                "id": "gemini-cli",
                "name": "Gemini CLI",
                "command": "gemini",
                "lane": "Secondary model benchmark",
                "route": "/app/security",
                "missing_status": "attention",
                "env_names": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
                "ready_detail": "Gemini CLI is available for secondary benchmarking and model-comparison work.",
                "missing_detail": "Gemini CLI is not installed, so secondary CLI benchmarking is not live on this host.",
            },
            {
                "id": "claude-cli",
                "name": "Claude CLI",
                "command": "claude",
                "lane": "Secondary model benchmark",
                "route": "/app/security",
                "missing_status": "attention",
                "env_names": ("ANTHROPIC_API_KEY",),
                "ready_detail": "Claude CLI is available for secondary benchmarking and workflow comparison.",
                "missing_detail": "Claude CLI is not installed, so Anthropic-side CLI benchmarking is not live on this host.",
            },
        ]

        cards: list[dict[str, Any]] = []
        github_api_access_mode = str(github_runtime.get("api_access_mode", "")).strip() or "local_only"
        github_repo_slug = str(github_runtime.get("repo", "")).strip()
        github_access_chip = (
            "GitHub token ready"
            if _env_secret_ready("SUPERMEGA_GITHUB_TOKEN", "GITHUB_TOKEN")
            else f"GitHub {github_api_access_mode.replace('_', ' ')}"
        )

        for spec in tool_specs:
            command = str(spec.get("command", "")).strip()
            command_path, version_output = _cached_runtime_probe(
                f"toolchain:{command}",
                300,
                lambda command=command: _probe_command_output(command, "--version"),
            )
            env_ready = _env_secret_ready(*tuple(spec.get("env_names", ())))
            installed = bool(command_path)
            status = "ready" if installed else str(spec.get("missing_status", "attention")).strip()
            chips = [
                str(spec.get("lane", "")).strip(),
                version_output or ("Version unavailable" if installed else "Not installed"),
                command_path or "PATH missing",
            ]
            if command == "gh":
                chips.append(github_access_chip)
                if github_repo_slug:
                    chips.append(github_repo_slug)
            elif spec.get("env_names"):
                chips.append("env credential ready" if env_ready else "env credential missing")
            detail = str(spec.get("ready_detail" if installed else "missing_detail", "")).strip()
            cards.append(
                _cloud_control_card(
                    item_id=str(spec.get("id", command)).strip() or command,
                    name=str(spec.get("name", command)).strip() or command,
                    status=status,
                    detail=detail,
                    chips=chips,
                    route=str(spec.get("route", "")).strip(),
                )
            )
        return cards

    def _cloud_model_provider_cards() -> list[dict[str, Any]]:
        openai_provider = _openai_provider()
        anthropic_provider = _anthropic_provider()
        gemini_env_ready = _env_secret_ready("GEMINI_API_KEY", "GOOGLE_API_KEY")
        codex_path, codex_version = _cached_runtime_probe(
            "toolchain:codex",
            300,
            lambda: _probe_command_output("codex", "--version"),
        )
        gemini_path, gemini_version = _cached_runtime_probe(
            "toolchain:gemini",
            300,
            lambda: _probe_command_output("gemini", "--version"),
        )
        claude_path, claude_version = _cached_runtime_probe(
            "toolchain:claude",
            300,
            lambda: _probe_command_output("claude", "--version"),
        )
        preferred_provider = str(os.getenv("SUPERMEGA_LLM_PROVIDER", "openai")).strip().lower() or "openai"
        openai_model = str(os.getenv("SUPERMEGA_OPENAI_MODEL", openai_provider.model)).strip() or openai_provider.model
        anthropic_model = str(os.getenv("SUPERMEGA_ANTHROPIC_MODEL", anthropic_provider.model)).strip() or anthropic_provider.model
        gemini_model = str(os.getenv("SUPERMEGA_GEMINI_MODEL", os.getenv("GOOGLE_GENAI_MODEL", "gemini-2.5-pro"))).strip() or "gemini-2.5-pro"

        return [
            _cloud_control_card(
                item_id="provider-openai",
                name="OpenAI provider lane",
                status="ready" if openai_provider.available() else "attention" if codex_path else "blocked",
                detail=(
                    "OpenAI API credentials are present for backend crews, structured extraction, and durable coding/runtime flows."
                    if openai_provider.available()
                    else "Backend OpenAI API credentials are not visible; this lane currently depends on Codex CLI auth or fallback providers."
                ),
                chips=[
                    f"preferred {preferred_provider}" if preferred_provider == "openai" else "fallback provider",
                    openai_model,
                    "API key ready" if openai_provider.available() else "API key missing",
                    codex_version or "Codex CLI not available",
                ],
                route="/app/security",
            ),
            _cloud_control_card(
                item_id="provider-anthropic",
                name="Anthropic provider lane",
                status="ready" if anthropic_provider.available() else "attention" if claude_path else "blocked",
                detail=(
                    "Anthropic API credentials are present for alternate reasoning and review lanes."
                    if anthropic_provider.available()
                    else "Anthropic API credentials are not visible; this lane is modeled unless a separate CLI auth path is installed."
                ),
                chips=[
                    f"preferred {preferred_provider}" if preferred_provider == "anthropic" else "secondary lane",
                    anthropic_model,
                    "API key ready" if anthropic_provider.available() else "API key missing",
                    claude_version or "Claude CLI not available",
                ],
                route="/app/security",
            ),
            _cloud_control_card(
                item_id="provider-gemini",
                name="Gemini provider lane",
                status="ready" if gemini_env_ready else "attention" if gemini_path else "blocked",
                detail=(
                    "Google/Gemini credentials are present for secondary benchmarking or multimodal expansion."
                    if gemini_env_ready
                    else "Google/Gemini credentials are not visible; this lane is not yet usable for backend agent runtime."
                ),
                chips=[
                    "secondary lane",
                    gemini_model,
                    "API key ready" if gemini_env_ready else "API key missing",
                    gemini_version or "Gemini CLI not available",
                ],
                route="/app/security",
            ),
        ]

    def _cloud_workspace_resource_cards(
        *,
        config: dict[str, Any],
        github_runtime: dict[str, Any],
        api_entrypoint: Path,
        jobs_script: Path,
        local_smoke_script: Path,
        deploy_preview_script: Path,
        claimable_preview_script: Path,
        scheduler_script: Path,
        showroom_dir: Path,
    ) -> list[dict[str, Any]]:
        sources = config.get("sources", {}) if isinstance(config, dict) else {}
        drive = sources.get("drive", {}) if isinstance(sources, dict) else {}
        local_root_raw = str(drive.get("local_root", "")).strip()
        local_root = _path_from_config(local_root_raw) if local_root_raw else None

        data_root_status = "blocked"
        data_root_detail = "No Yangon Tyre local source root is configured for this runtime."
        data_root_chips: list[str] = []
        if local_root_raw and local_root and local_root.exists():
            try:
                local_inventory = _cached_runtime_probe(
                    f"local-root-inventory:{local_root}",
                    900,
                    lambda root=local_root: scan_local_root(root, top_n=3),
                )
            except (FileNotFoundError, OSError, PermissionError):
                local_inventory = {}
            top_level_counts = (
                local_inventory.get("top_level_folder_counts", {})
                if isinstance(local_inventory, dict)
                else {}
            )
            top_folder = ""
            if isinstance(top_level_counts, dict) and top_level_counts:
                first_name, first_count = next(iter(top_level_counts.items()))
                top_folder = f"{first_name} {first_count}"
            total_files = int(local_inventory.get("total_files", 0) or 0) if isinstance(local_inventory, dict) else 0
            data_root_status = "ready"
            data_root_detail = "Yangon Tyre local data is mounted on this host and cached into a lightweight inventory for live Cloud Ops review."
            data_root_chips = [
                str(local_root),
                f"{total_files} files",
                f"top folder {top_folder}" if top_folder else "folder mix captured",
                "inventory cache 15m",
            ]
        elif local_root_raw:
            data_root_status = "attention"
            data_root_detail = "A Yangon Tyre local source root is configured, but it does not resolve on this host after cross-platform normalization."
            data_root_chips = [str(local_root or local_root_raw), "source root missing"]

        github_probe_status = str(github_runtime.get("status", "")).strip().lower()
        github_repo_slug = str(github_runtime.get("repo", "")).strip()
        github_branch = str(github_runtime.get("branch", "")).strip()
        github_is_dirty = bool(github_runtime.get("is_dirty", False))
        github_remote_credential_embedded = bool(github_runtime.get("remote_credential_embedded", False))
        github_api_access_mode = str(github_runtime.get("api_access_mode", "")).strip() or "local_only"
        repo_status = (
            "attention"
            if github_probe_status == "error" or github_remote_credential_embedded or github_is_dirty
            else "ready"
            if REPO_ROOT.exists()
            else "blocked"
        )
        repo_detail = (
            "The live repo workspace is mounted for backend, frontend, and worker changes, and GitHub runtime state is visible from the same control plane."
            if REPO_ROOT.exists()
            else "The live repo workspace is not mounted on this host."
        )
        repo_chips = [
            github_repo_slug or REPO_ROOT.name,
            github_branch or "branch unknown",
            "dirty workspace" if github_is_dirty else "clean workspace",
            github_api_access_mode.replace("_", " "),
            "remote credential embedded" if github_remote_credential_embedded else "remote sanitized",
        ]

        runtime_pack_status = (
            "ready"
            if api_entrypoint.exists() and jobs_script.exists() and showroom_dir.exists()
            else "attention"
            if api_entrypoint.exists() or jobs_script.exists() or showroom_dir.exists()
            else "blocked"
        )
        runtime_pack_detail = (
            "The repo contains the portal app, backend entrypoint, and durable job runner needed for one shared AI-native product runtime."
            if runtime_pack_status == "ready"
            else "The core portal/backend/job pack is incomplete on this host."
        )
        runtime_pack_chips = [
            "showroom ready" if showroom_dir.exists() else "showroom missing",
            "api_app.py ready" if api_entrypoint.exists() else "api_app.py missing",
            "job runner ready" if jobs_script.exists() else "job runner missing",
            "local smoke ready" if local_smoke_script.exists() else "local smoke missing",
        ]

        workspace_contract_count = len(list(AGENT_WORKSPACE_RESOURCE_DIR.glob("*.json"))) if AGENT_WORKSPACE_RESOURCE_DIR.exists() else 0
        workforce_pack_count = len(list(WORKFORCE_RESOURCE_DIR.glob("*.json"))) if WORKFORCE_RESOURCE_DIR.exists() else 0
        contract_status = (
            "ready"
            if workspace_contract_count and workforce_pack_count
            else "attention"
            if AGENT_WORKSPACE_RESOURCE_DIR.exists() or WORKFORCE_RESOURCE_DIR.exists()
            else "blocked"
        )
        contract_detail = (
            "Agent workspace and workforce contracts are present, so crews can inherit explicit scope and operating packs from the repo."
            if contract_status == "ready"
            else "Agent workspace/workforce contracts are only partially present on this host."
        )
        contract_chips = [
            f"{workspace_contract_count} workspace contracts",
            f"{workforce_pack_count} workforce packs",
            str(AGENT_WORKSPACE_RESOURCE_DIR.name),
            str(WORKFORCE_RESOURCE_DIR.name),
        ]

        automation_pack_status = (
            "ready"
            if scheduler_script.exists() and deploy_preview_script.exists() and claimable_preview_script.exists()
            else "attention"
            if scheduler_script.exists() or deploy_preview_script.exists() or claimable_preview_script.exists()
            else "blocked"
        )
        automation_pack_detail = (
            "Scheduler, deploy, and preview scripts are present for the autonomous runtime lane outside the interactive session."
            if automation_pack_status == "ready"
            else "Autonomous scheduler or deploy script coverage is incomplete on this host."
        )
        automation_pack_chips = [
            "scheduler ready" if scheduler_script.exists() else "scheduler missing",
            "preview deploy ready" if deploy_preview_script.exists() else "preview deploy missing",
            "claimable preview ready" if claimable_preview_script.exists() else "claimable preview missing",
        ]

        return [
            _cloud_control_card(
                item_id="ytf-local-data-root",
                name="Yangon Tyre local data root",
                status=data_root_status,
                detail=data_root_detail,
                chips=data_root_chips,
                route="/app/data-fabric",
            ),
            _cloud_control_card(
                item_id="repo-workspace",
                name="Repo workspace and GitHub state",
                status=repo_status,
                detail=repo_detail,
                chips=repo_chips,
                route="/app/factory",
            ),
            _cloud_control_card(
                item_id="runtime-pack",
                name="Portal and backend runtime pack",
                status=runtime_pack_status,
                detail=runtime_pack_detail,
                chips=runtime_pack_chips,
                route="/app/cloud",
            ),
            _cloud_control_card(
                item_id="agent-contract-pack",
                name="Agent workspace and workforce contracts",
                status=contract_status,
                detail=contract_detail,
                chips=contract_chips,
                route="/app/teams",
            ),
            _cloud_control_card(
                item_id="automation-pack",
                name="Autonomous scheduler and deploy pack",
                status=automation_pack_status,
                detail=automation_pack_detail,
                chips=automation_pack_chips,
                route="/app/runtime",
            ),
        ]

    def _cloud_control_payload(session: dict[str, Any]) -> dict[str, Any]:
        workspace_id = str(session.get("workspace_id", "")).strip()
        latest_agent_runs = enterprise_list_agent_runs(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=80,
        )
        latest_by_type = _group_agent_runs_by_job_type(latest_agent_runs)
        coverage = load_data_coverage_summary(pilot_data)
        config = _load_runtime_config()
        gmail_probe = _gmail_probe_from_config(config)
        gmail_client = gmail_probe.validate_client_config()
        gmail_runtime = _cached_runtime_probe(
            "cloud-control:gmail-runtime",
            180,
            lambda: _probe_with_timeout(
                gmail_probe.probe,
                timeout_seconds=4,
                timeout_message="Gmail runtime probe timed out. Using fail-fast connector status.",
            ),
        )
        drive_probe = _drive_probe_from_config(config)
        drive_runtime = _cached_runtime_probe(
            "cloud-control:drive-runtime",
            180,
            lambda: _probe_with_timeout(
                drive_probe.probe,
                timeout_seconds=4,
                timeout_message="Google Drive probe timed out. Using fail-fast connector status.",
            ),
        )
        github_runtime = _cached_runtime_probe(
            "cloud-control:github-runtime",
            180,
            lambda: _probe_with_timeout(
                lambda: _github_probe_for_repo(REPO_ROOT).probe(),
                timeout_seconds=4,
                timeout_message="GitHub runtime probe timed out. Using fail-fast connector status.",
            ),
        )

        runtime_base_url = str(os.getenv("SUPERMEGA_RUNTIME_BASE_URL", "")).strip() or app_base_url
        runtime_host = urlparse(runtime_base_url).netloc if runtime_base_url else ""
        cloud_run_service = str(os.getenv("K_SERVICE", "")).strip()
        cloud_run_revision = str(os.getenv("K_REVISION", "")).strip()
        vercel_url = str(os.getenv("VERCEL_URL", "")).strip()
        runtime_target = "Cloud Run" if cloud_run_service else "Vercel" if vercel_url else "Local or preview"
        state_db_ready = Path(state_db).exists()
        enterprise_db_ready = bool(str(enterprise_db_url or "").strip())
        queue_ready = bool(cloud_tasks_enabled and cloud_tasks_client is not None)
        queue_partial = bool(internal_cron_token or cloud_tasks_queue_default or cloud_tasks_worker_url or cloud_tasks_queue_browser or cloud_tasks_queue_brief)
        preferred_workforce_mode = "queue_worker" if queue_ready else "direct_batch"

        if queue_ready:
            queue_status = "ready"
            queue_detail = "Default workforce cycles can enqueue into Cloud Tasks and drain through the worker URL."
        elif queue_partial:
            queue_status = "attention"
            queue_detail = "Some queue runtime pieces are configured, but the cloud worker lane is still incomplete."
        else:
            queue_status = "blocked"
            queue_detail = "Workforce cycles still fall back to direct batch execution because the cloud queue runtime is not configured."

        service_status = "ready" if state_db_ready and enterprise_db_ready and app_base_url else "attention" if state_db_ready and enterprise_db_ready else "blocked"
        service_detail = (
            "Workspace app base URL, state store, and enterprise database are present for the shared control plane."
            if service_status == "ready"
            else "The control plane is missing one or more foundations: app base URL, state store, or enterprise database."
        )

        deploy_preview_script = REPO_ROOT / "tools" / "deploy_preview.sh"
        claimable_preview_script = REPO_ROOT / "tools" / "deploy_claimable_preview.sh"
        package_preview_script = REPO_ROOT / "tools" / "package_preview_bundle.py"
        jobs_script = REPO_ROOT / "tools" / "run_supermega_agent_jobs.py"
        local_smoke_script = REPO_ROOT / "tools" / "run_local_smoke.sh"
        scheduler_script = REPO_ROOT / "tools" / "ensure_supermega_scheduler.ps1"
        api_entrypoint = REPO_ROOT / "api_app.py"
        vercel_config = REPO_ROOT / "vercel.json"
        showroom_dir = REPO_ROOT / "showroom"
        vercel_cli_available = bool(shutil.which("vercel"))
        deploy_ready = all(
            item.exists()
            for item in (deploy_preview_script, claimable_preview_script, package_preview_script, vercel_config)
        )
        deploy_status = "ready" if deploy_ready else "attention" if any(
            item.exists()
            for item in (deploy_preview_script, claimable_preview_script, package_preview_script, vercel_config)
        ) else "blocked"
        deploy_detail = (
            "Preview deploy scripts and Vercel config are present, so the repo can ship a cloud preview from its current bundle path."
            if deploy_ready
            else "The preview deploy path is only partially wired. The repo needs the deploy scripts and Vercel config present together."
        )

        tooling_ready = all(item.exists() for item in (jobs_script, local_smoke_script, api_entrypoint))
        tooling_status = "ready" if tooling_ready else "attention"
        tooling_detail = (
            "The repo has operator scripts for durable jobs, local smoke, and the API entrypoint."
            if tooling_ready
            else "Some operator scripts or entrypoints are missing, which weakens autonomous development and recovery."
        )

        gmail_client_status = str(gmail_client.get("status", "not_configured")).strip()
        gmail_runtime_status = str(gmail_runtime.get("status", "not_configured")).strip()
        if gmail_runtime_status == "ready":
            gmail_status = "ready"
            gmail_detail = str(gmail_runtime.get("message", "")).strip() or "Gmail OAuth token is valid."
        elif gmail_client_status == "ready" and gmail_runtime_status in {"missing_token_file", "missing_token_path", "reauth_required", "error"}:
            gmail_status = "attention"
            gmail_detail = str(gmail_runtime.get("message", "")).strip() or "Gmail client exists but the token still needs repair."
        elif gmail_client_status == "ready":
            gmail_status = _cloud_control_status(gmail_runtime_status)
            gmail_detail = str(gmail_runtime.get("message", "")).strip() or "Gmail runtime still needs attention."
        else:
            gmail_status = "blocked"
            gmail_detail = str(gmail_client.get("message", "")).strip() or "Gmail OAuth client is not configured."

        drive_raw_status = str(drive_runtime.get("status", "not_configured")).strip()
        drive_status = _cloud_control_status(drive_raw_status)
        drive_detail = str(drive_runtime.get("message", "")).strip() or "Google Drive publishing and indexing state is not configured yet."

        coverage_raw_status = str(coverage.get("status", "not_ready")).strip()
        coverage_status = _cloud_control_status(coverage_raw_status)
        coverage_score = int(coverage.get("readiness_score", 0) or 0)
        coverage_detail = (
            f"Data coverage score is {coverage_score}. "
            + (
                str((coverage.get("top_actions") or ["Keep the daily coverage refresh healthy."])[0]).strip()
                if isinstance(coverage.get("top_actions"), list) and coverage.get("top_actions")
                else "Keep the daily coverage refresh healthy."
            )
        )

        surfaces = [
            _cloud_control_card(
                item_id="queue-runtime",
                name="Queue-backed workforce runtime",
                status=queue_status,
                detail=queue_detail,
                chips=[
                    "preferred mode: queue worker" if preferred_workforce_mode == "queue_worker" else "preferred mode: direct batch",
                    "cron token ready" if internal_cron_token else "cron token missing",
                    "default queue ready" if cloud_tasks_queue_default else "default queue missing",
                    "worker URL ready" if cloud_tasks_worker_url else "worker URL missing",
                ],
                route="/app/runtime",
            ),
            _cloud_control_card(
                item_id="service-backbone",
                name="Service backbone",
                status=service_status,
                detail=service_detail,
                chips=[
                    "app base ready" if app_base_url else "app base missing",
                    "state db ready" if state_db_ready else "state db missing",
                    "enterprise db ready" if enterprise_db_ready else "enterprise db missing",
                    "auth required" if auth_required else "preview auth",
                ],
                route="/app/platform-admin",
            ),
        ]

        connectors = [
            _cloud_control_card(
                item_id="gmail",
                name="Gmail connector",
                status=gmail_status,
                detail=gmail_detail,
                chips=[
                    str(gmail_runtime.get("email_address", "")).strip() or str(config.get("sources", {}).get("gmail", {}).get("user_email", "")).strip(),
                    "compose scope ready" if str(gmail_runtime.get("status", "")).strip() == "ready" else "draft auth needs attention",
                ],
                route="/app/connectors",
            ),
            _cloud_control_card(
                item_id="drive",
                name="Google Drive connector",
                status=drive_status,
                detail=drive_detail,
                chips=[
                    "folder configured" if bool(drive_runtime.get("folder_id_configured")) else "folder missing",
                    "publish target ready" if str(drive_raw_status).strip() == "ready" else "publish path needs attention",
                ],
                route="/app/data-fabric",
            ),
            _cloud_control_card(
                item_id="coverage",
                name="Data coverage and canon",
                status=coverage_status,
                detail=coverage_detail,
                chips=[
                    f"score {coverage_score}",
                    f"{len(coverage.get('hard_blockers', []) if isinstance(coverage.get('hard_blockers'), list) else [])} hard blockers",
                ],
                route="/app/data-fabric",
            ),
        ]

        development = [
            _cloud_control_card(
                item_id="deploy",
                name="Cloud preview deploy path",
                status=deploy_status,
                detail=deploy_detail,
                chips=[
                    "vercel cli ready" if vercel_cli_available else "vercel cli missing",
                    "preview script ready" if deploy_preview_script.exists() else "preview script missing",
                    "claimable deploy ready" if claimable_preview_script.exists() else "claimable deploy missing",
                    "vercel.json ready" if vercel_config.exists() else "vercel.json missing",
                ],
                route="/app/factory",
            ),
            _cloud_control_card(
                item_id="tooling",
                name="Autonomous development tooling",
                status=tooling_status,
                detail=tooling_detail,
                chips=[
                    "durable jobs script ready" if jobs_script.exists() else "jobs script missing",
                    "local smoke ready" if local_smoke_script.exists() else "local smoke missing",
                    "api entrypoint ready" if api_entrypoint.exists() else "api entrypoint missing",
                    runtime_base_url or "runtime base URL not set",
                ],
                route="/app/cloud",
            ),
        ]

        specialized_queue_status = (
            "ready"
            if queue_ready and cloud_tasks_queue_brief and cloud_tasks_queue_browser
            else "attention"
            if queue_ready and (cloud_tasks_queue_brief or cloud_tasks_queue_browser)
            else "blocked"
        )
        scheduler_status = "ready" if internal_cron_token and runtime_base_url else "attention" if internal_cron_token or runtime_base_url else "blocked"
        infrastructure = [
            _cloud_control_card(
                item_id="deployment-target",
                name="Deployment target and runtime host",
                status="ready" if runtime_base_url and (cloud_run_service or vercel_url) else "attention" if runtime_base_url else "blocked",
                detail=(
                    "The current runtime advertises its host, deployment target, and service identity for cloud operations."
                    if runtime_base_url
                    else "Runtime base URL is missing, so operator-facing cloud links and scheduler targets stay implicit."
                ),
                chips=[
                    runtime_target,
                    runtime_host or "runtime host missing",
                    f"service {cloud_run_service}" if cloud_run_service else "cloud run service not detected",
                    f"revision {cloud_run_revision[:12]}" if cloud_run_revision else (f"vercel {vercel_url}" if vercel_url else "local host"),
                ],
                route="/app/cloud",
            ),
            _cloud_control_card(
                item_id="default-queue-lane",
                name="Default Cloud Tasks worker lane",
                status=queue_status,
                detail=(
                    "The default queue carries the main workforce families and the ops-watch loop through the shared worker endpoint."
                    if cloud_tasks_queue_default
                    else "The default Cloud Tasks queue name is missing, so most agent families cannot be dispatched into the cloud worker lane."
                ),
                chips=[
                    cloud_tasks_queue_default or "default queue missing",
                    cloud_tasks_worker_url or "worker URL missing",
                    gcp_project_id or "project missing",
                    cloud_tasks_location or "region missing",
                ],
                route="/app/runtime",
            ),
            _cloud_control_card(
                item_id="specialized-queues",
                name="Specialized queue lanes",
                status=specialized_queue_status,
                detail=(
                    "Founder brief and browser work can be isolated from the default queue when their dedicated lanes are configured."
                    if cloud_tasks_queue_brief or cloud_tasks_queue_browser
                    else "Specialized queue lanes are not configured yet, so everything falls back to the default worker lane."
                ),
                chips=[
                    cloud_tasks_queue_brief or "brief queue missing",
                    cloud_tasks_queue_browser or "browser queue missing",
                    "founder brief isolated" if cloud_tasks_queue_brief else "founder brief shares default queue",
                    "browser queue reserved" if cloud_tasks_queue_browser else "browser queue not wired",
                ],
                route="/app/runtime",
            ),
            _cloud_control_card(
                item_id="scheduler-cadence",
                name="Scheduler cadence and worker drain",
                status=scheduler_status,
                detail=(
                    "Cloud Scheduler should enqueue the default families, ops watch, founder brief, and worker drain cadence against the live runtime host."
                    if internal_cron_token and runtime_base_url
                    else "The scheduler contract is still partial because the cron token or runtime base URL is missing."
                ),
                chips=[
                    "cron token ready" if internal_cron_token else "cron token missing",
                    "2h default batch",
                    "15m ops watch",
                    "daily founder brief",
                    "5m worker drain",
                ],
                route="/app/runtime",
            ),
        ]

        agent_toolchain = _cloud_toolchain_cards(github_runtime=github_runtime)
        model_providers = _cloud_model_provider_cards()
        workspace_resources = _cloud_workspace_resource_cards(
            config=config,
            github_runtime=github_runtime,
            api_entrypoint=api_entrypoint,
            jobs_script=jobs_script,
            local_smoke_script=local_smoke_script,
            deploy_preview_script=deploy_preview_script,
            claimable_preview_script=claimable_preview_script,
            scheduler_script=scheduler_script,
            showroom_dir=showroom_dir,
        )
        topology = _cloud_topology_payload(session)
        topology_rows = topology.get("rows", []) if isinstance(topology.get("rows"), list) else []
        domain_blocker_count = sum(1 for item in topology_rows if str(item.get("status", "")).strip() == "blocked")
        domain_attention_count = sum(1 for item in topology_rows if str(item.get("status", "")).strip() == "attention")

        jobs: list[dict[str, Any]] = []
        stale_job_count = 0
        for template in AGENT_JOB_TEMPLATES:
            last_run = latest_by_type.get(template["job_type"], {}) if isinstance(latest_by_type, dict) else {}
            last_run_at = _runtime_run_timestamp(last_run)
            freshness_status = _cloud_job_freshness_status(last_run_at, template["cadence"])
            if freshness_status != "ready":
                stale_job_count += 1
            jobs.append(
                {
                    "job_type": template["job_type"],
                    "name": template["name"],
                    "cadence": template["cadence"],
                    "status": freshness_status,
                    "last_run_at": last_run_at or None,
                    "detail": (
                        f"{_runtime_freshness_label(last_run_at, fallback='No run recorded yet.')}; latest source: {str(last_run.get('source', '')).strip() or 'unknown'}."
                        if last_run_at
                        else "No run recorded yet."
                    ),
                }
            )

        cadence_status = "ready" if stale_job_count == 0 else "attention" if stale_job_count < len(AGENT_JOB_TEMPLATES) else "blocked"
        surfaces.append(
            _cloud_control_card(
                item_id="cadence",
                name="Core workforce cadence",
                status=cadence_status,
                detail=(
                    "Every core job family has a recent run inside its expected cadence window."
                    if stale_job_count == 0
                    else f"{stale_job_count} core job families are stale or missing recent runs."
                ),
                chips=[f"{len(jobs)} core jobs", f"{stale_job_count} stale or missing"],
                route="/app/teams",
            )
        )

        commands: list[dict[str, str]] = []
        if jobs_script.exists():
            commands.append(
                {
                    "id": "run-durable-jobs",
                    "label": "Run durable jobs",
                    "command": "python3 tools/run_supermega_agent_jobs.py --as-json",
                    "detail": "Run the current durable job pack against the configured runtime base URL.",
                }
            )
        if local_smoke_script.exists():
            commands.append(
                {
                    "id": "local-smoke",
                    "label": "Run local smoke",
                    "command": "npm run smoke:local",
                    "detail": "Boot the local service and verify the authenticated portal, runtime, and queue paths.",
                }
            )
        if deploy_preview_script.exists():
            commands.append(
                {
                    "id": "deploy-preview",
                    "label": "Deploy preview",
                    "command": "bash tools/deploy_preview.sh",
                    "detail": "Package the current repo and push a preview deployment through the configured Vercel fallback.",
                }
            )
        if vercel_config.exists():
            commands.append(
                {
                    "id": "vercel-build",
                    "label": "Build for Vercel",
                    "command": "npx vercel build --yes",
                    "detail": "Build the repo in Vercel-compatible mode before deploying a prebuilt artifact.",
                }
            )
            commands.append(
                {
                    "id": "vercel-prebuilt-preview",
                    "label": "Deploy prebuilt preview",
                    "command": "npx vercel deploy --prebuilt -y",
                    "detail": "Ship a linked-project preview deployment using the repo-root Vercel configuration.",
                }
            )
            commands.append(
                {
                    "id": "vercel-prebuilt-prod",
                    "label": "Deploy production",
                    "command": "npx vercel deploy --prebuilt --prod -y",
                    "detail": "Promote a prebuilt artifact to the production domain once the linked project is configured.",
                }
            )
        if str(gmail_client.get("recommended_command", "")).strip() and gmail_status != "ready":
            commands.append(
                {
                    "id": "gmail-auth",
                    "label": "Repair Gmail auth",
                    "command": str(gmail_client.get("recommended_command", "")).strip(),
                    "detail": "Refresh Gmail OAuth so mail-driven evidence and draft flows are available again.",
                }
            )

        next_moves: list[str] = []
        if queue_status != "ready":
            next_moves.append("Finish the Cloud Tasks lane by setting the internal cron token, worker URL, and queue names so workforce cycles stop depending on direct batch runs.")
        if stale_job_count:
            next_moves.append("Queue or run the default workforce cycle now because one or more core job families are stale.")
        if gmail_status != "ready":
            next_moves.append("Repair Gmail OAuth so the runtime can see live inbox evidence and create operator drafts without leaving the control loop.")
        if drive_status != "ready":
            next_moves.append("Restore Google Drive service-account access and publish folder visibility so files, sheets, and rollout bundles feed the shared memory layer.")
        if coverage_score < 70:
            next_moves.append("Improve the data coverage score before expanding autonomy so the agents work from canonical records instead of partial evidence.")
        if deploy_status != "ready":
            next_moves.append("Close the preview deploy path gaps so product and runtime changes can ship to cloud without manual packaging detours.")
        if domain_blocker_count:
            next_moves.append("Verify and repair blocked domain rows so the public host, shared app host, and tenant portals stop relying on implicit DNS assumptions.")
        elif domain_attention_count:
            next_moves.append("Re-run domain verification and close the remaining DNS, TLS, or HTTP warnings before claiming the cloud topology is stable.")
        if any(str(card.get("id", "")).strip() == "github-cli" and str(card.get("status", "")).strip() != "ready" for card in agent_toolchain):
            next_moves.append("Add an authenticated GitHub automation lane so repo, workflow, and release operations stop depending on local git plus public API fallback only.")
        if any(str(card.get("id", "")).strip() == "ytf-local-data-root" and str(card.get("status", "")).strip() != "ready" for card in workspace_resources):
            next_moves.append("Normalize or mount the Yangon Tyre local source root on the worker image so live inventory and learning loops can see the same corpus the team updates.")
        if any(str(card.get("status", "")).strip() != "ready" for card in model_providers):
            next_moves.append("No direct model-provider API secrets are visible in this runtime, so backend agent crews still depend on local CLI auth or connector-scoped credentials.")
        if bool(github_runtime.get("remote_credential_embedded", False)):
            next_moves.append("Rotate the embedded GitHub remote credential into proper secret storage so the repo workspace stops carrying a release-path security risk.")
        if not next_moves:
            next_moves.append("The core cloud control path is wired. Keep queue cadence, coverage refresh, and deploy discipline healthy as you widen tenant scope.")

        all_cards = surfaces + connectors + development + infrastructure + agent_toolchain + model_providers + workspace_resources
        ready_count = sum(1 for item in all_cards if str(item.get("status", "")).strip() == "ready")
        attention_count = sum(1 for item in all_cards if str(item.get("status", "")).strip() == "attention")
        blocker_count = sum(1 for item in all_cards if str(item.get("status", "")).strip() == "blocked")

        return {
            "status": "ready",
            "updated_at": datetime.now().astimezone().isoformat(),
            "preferred_workforce_mode": preferred_workforce_mode,
            "summary": {
                "ready_count": ready_count,
                "attention_count": attention_count,
                "blocker_count": blocker_count,
                "coverage_score": coverage_score,
                "stale_job_count": stale_job_count,
                "queue_ready": queue_ready,
                "deploy_ready": deploy_ready,
            },
            "surfaces": surfaces,
            "connectors": connectors,
            "development": development,
            "infrastructure": infrastructure,
            "agent_toolchain": agent_toolchain,
            "model_providers": model_providers,
            "workspace_resources": workspace_resources,
            "topology": topology,
            "jobs": jobs,
            "commands": commands,
            "next_moves": next_moves,
        }

    def _insights_payload(session: dict[str, Any]) -> dict[str, Any]:
        return _maybe_ai_enrich_insights(
            _build_operating_insights(
                state_db,
                enterprise_db_url=enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
            )
        )

    def _control_plane_payload(session: dict[str, Any]) -> dict[str, Any]:
        workspace_id = str(session.get("workspace_id", "")).strip()
        tenant_state = _tenant_state_payload(session)
        profile = enterprise_ensure_workspace_profile(
            enterprise_db_url,
            workspace_id=workspace_id,
            workspace_slug=str(session.get("workspace_slug", "")).strip(),
            workspace_name=str(session.get("workspace_name", "")).strip(),
        )
        module_rows = enterprise_list_workspace_modules(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        member_rows = enterprise_list_workspace_members(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        audit_rows = enterprise_list_audit_events(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=20,
        )
        domain_rows = enterprise_list_workspace_domains(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        enabled_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "enabled")
        pilot_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "pilot")
        disabled_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "disabled")
        ready_domain_count = sum(1 for row in domain_rows if str(row.get("status", "")).strip() == "ready")
        attention_domain_count = sum(1 for row in domain_rows if str(row.get("status", "")).strip() == "attention")
        blocker_domain_count = sum(1 for row in domain_rows if str(row.get("status", "")).strip() == "blocked")
        return {
            "tenant_state": tenant_state,
            "workspace": {
                "workspace_id": workspace_id,
                "workspace_slug": str(session.get("workspace_slug", "")).strip(),
                "workspace_name": str(session.get("workspace_name", "")).strip(),
                "workspace_plan": str(session.get("workspace_plan", "")).strip(),
                "role": str(session.get("role", "")).strip(),
                "display_name": str(session.get("display_name", session.get("username", ""))).strip(),
            },
            "profile": profile,
            "catalog": {
                "module_count": len(enterprise_list_module_definitions(enterprise_db_url)),
            },
            "modules": {
                "count": len(module_rows),
                "enabled_count": enabled_count,
                "pilot_count": pilot_count,
                "disabled_count": disabled_count,
                "rows": module_rows,
            },
            "members": {
                "count": len(member_rows),
                "rows": member_rows,
            },
            "domains": {
                "count": len(domain_rows),
                "ready_count": ready_domain_count,
                "attention_count": attention_domain_count,
                "blocker_count": blocker_domain_count,
                "rows": domain_rows,
            },
            "audit_events": {
                "count": len(audit_rows),
                "rows": audit_rows,
            },
        }

    def _agent_workspace_resource_key(session: dict[str, Any]) -> str:
        workspace_slug = str(session.get("workspace_slug", "")).strip().lower()
        workspace_name = str(session.get("workspace_name", "")).strip().lower()
        if workspace_slug.startswith("ytf") or workspace_slug in {"yangon-tyre", "yangon-tyre-plant-a"} or "yangon tyre" in workspace_name:
            return "ytf-plant-a"
        return "default"

    def _load_agent_workspace_resource(session: dict[str, Any]) -> dict[str, Any]:
        resource_key = _agent_workspace_resource_key(session)
        resource_path = AGENT_WORKSPACE_RESOURCE_PATHS.get(resource_key, AGENT_WORKSPACE_RESOURCE_PATHS["default"])
        payload = _load_json(resource_path)
        if payload:
            return payload
        return _load_json(AGENT_WORKSPACE_RESOURCE_PATHS["default"])

    def _load_workforce_resource(session: dict[str, Any]) -> dict[str, Any]:
        resource_key = _agent_workspace_resource_key(session)
        resource_path = WORKFORCE_RESOURCE_PATHS.get(resource_key, WORKFORCE_RESOURCE_PATHS["default"])
        payload = _load_json(resource_path)
        if payload:
            return payload
        return _load_json(WORKFORCE_RESOURCE_PATHS["default"])

    def _load_cloud_topology_resource() -> dict[str, Any]:
        payload = _load_json(CLOUD_TOPOLOGY_RESOURCE_PATH)
        if payload:
            return payload
        return {
            "resource_id": "supermega-cloud-topology",
            "root_domain": "supermega.dev",
            "shared_app_host": "app.supermega.dev",
            "deployment_units": [],
        }

    def _workspace_domain_proof_paths(row: dict[str, Any]) -> list[str]:
        config = row.get("config", {}) if isinstance(row, dict) else {}
        proof_paths = [str(item).strip() for item in (config.get("proof_paths") or []) if str(item).strip()]
        if proof_paths:
            return proof_paths
        route_root = str(row.get("route_root", "")).strip() or "/"
        return [route_root]

    def _cloud_domain_status(row: dict[str, Any]) -> str:
        dns_status = str(row.get("dns_status", "")).strip().lower()
        tls_status = str(row.get("tls_status", "")).strip().lower()
        http_status = str(row.get("http_status", "")).strip().lower()
        if dns_status == "ready" and tls_status == "ready" and http_status == "ready":
            return "ready"
        if "ready" in {dns_status, tls_status, http_status}:
            return "attention"
        return "blocked"

    def _cloud_topology_payload(session: dict[str, Any]) -> dict[str, Any]:
        workspace_id = str(session.get("workspace_id", "")).strip()
        workspace_slug = str(session.get("workspace_slug", "")).strip().lower()
        resource = _load_cloud_topology_resource()
        resource_units = resource.get("deployment_units", []) if isinstance(resource.get("deployment_units"), list) else []
        units_by_hostname = {
            str(item.get("hostname", "")).strip().lower(): item
            for item in resource_units
            if isinstance(item, dict) and str(item.get("hostname", "")).strip()
        }
        domain_rows = enterprise_list_workspace_domains(enterprise_db_url, workspace_id=workspace_id)
        merged_rows: list[dict[str, Any]] = []
        for row in domain_rows:
            hostname = str(row.get("hostname", "")).strip().lower()
            unit = units_by_hostname.get(hostname, {})
            merged_rows.append(
                {
                    **row,
                    "name": str(unit.get("name", row.get("display_name", hostname))).strip() or hostname,
                    "summary": str(unit.get("summary", row.get("notes", ""))).strip(),
                    "managed_by": [str(item).strip() for item in (unit.get("managed_by") or []) if str(item).strip()],
                    "proof_paths": [str(item).strip() for item in (unit.get("proof_paths") or row.get("proof_paths") or []) if str(item).strip()],
                    "status": _cloud_domain_status(row),
                }
            )

        if not merged_rows and workspace_slug:
            for unit in resource_units:
                if not isinstance(unit, dict):
                    continue
                if str(unit.get("workspace_slug", "")).strip().lower() not in {"", workspace_slug}:
                    continue
                hostname = str(unit.get("hostname", "")).strip().lower()
                if not hostname:
                    continue
                merged_rows.append(
                    {
                        "domain_id": "",
                        "workspace_id": workspace_id,
                        "workspace_slug": workspace_slug,
                        "workspace_name": str(session.get("workspace_name", "")).strip(),
                        "hostname": hostname,
                        "scope": str(unit.get("scope", "")).strip(),
                        "provider": str(unit.get("provider", "vercel")).strip() or "vercel",
                        "runtime_target": str(unit.get("runtime_target", "")).strip(),
                        "desired_state": str(unit.get("desired_state", "planned")).strip() or "planned",
                        "route_root": str(unit.get("route_root", "/")).strip() or "/",
                        "dns_status": "unknown",
                        "tls_status": "unknown",
                        "http_status": "unknown",
                        "verified_at": "",
                        "deployment_url": "",
                        "last_deployed_at": "",
                        "notes": "",
                        "config": {},
                        "live_url": f"https://{hostname}",
                        "display_name": str(unit.get("name", hostname)).strip() or hostname,
                        "name": str(unit.get("name", hostname)).strip() or hostname,
                        "summary": str(unit.get("summary", "")).strip(),
                        "managed_by": [str(item).strip() for item in (unit.get("managed_by") or []) if str(item).strip()],
                        "proof_paths": [str(item).strip() for item in (unit.get("proof_paths") or []) if str(item).strip()],
                        "status": "blocked",
                    }
                )

        ready_count = sum(1 for item in merged_rows if str(item.get("status", "")).strip() == "ready")
        attention_count = sum(1 for item in merged_rows if str(item.get("status", "")).strip() == "attention")
        blocker_count = sum(1 for item in merged_rows if str(item.get("status", "")).strip() == "blocked")
        return {
            "resource_id": str(resource.get("resource_id", "supermega-cloud-topology")).strip() or "supermega-cloud-topology",
            "root_domain": str(resource.get("root_domain", "supermega.dev")).strip() or "supermega.dev",
            "shared_app_host": str(resource.get("shared_app_host", "app.supermega.dev")).strip() or "app.supermega.dev",
            "summary": {
                "count": len(merged_rows),
                "ready_count": ready_count,
                "attention_count": attention_count,
                "blocker_count": blocker_count,
            },
            "rows": merged_rows,
        }

    def _domain_verification_status(report: dict[str, Any], *, hostname: str) -> tuple[str, str, str]:
        checks = report.get("checks", []) if isinstance(report.get("checks"), list) else []
        dns_status = "unknown"
        tls_status = "unknown"
        http_status = "unknown"
        http_states: list[str] = []
        for item in checks:
            if not isinstance(item, dict):
                continue
            target = str(item.get("target", "")).strip()
            status = "ready" if str(item.get("status", "")).strip() == "ready" else "error"
            if target == f"dns:{hostname}":
                dns_status = status
            elif target == f"tls:{hostname}":
                tls_status = status
            elif target.startswith(f"http:https://{hostname}"):
                http_states.append(status)
        if http_states:
            http_status = "ready" if all(state == "ready" for state in http_states) else "attention" if any(state == "ready" for state in http_states) else "error"
        if str(report.get("overall_status", "")).strip() == "warning" and http_status == "error":
            http_status = "attention"
        return dns_status, tls_status, http_status

    def _verify_domain_row(session: dict[str, Any], row: dict[str, Any], routes: list[str] | None = None) -> dict[str, Any] | None:
        domain_id = str(row.get("domain_id", "")).strip()
        hostname = str(row.get("hostname", "")).strip().lower()
        if not domain_id or not hostname:
            return None
        route_list = [str(item).strip() for item in (routes or _workspace_domain_proof_paths(row)) if str(item).strip()]
        if not route_list:
            route_list = ["/"]
        report = run_domain_checks(hostname, route_list)
        dns_status, tls_status, http_status = _domain_verification_status(report, hostname=hostname)
        merged_config = dict(row.get("config", {}) if isinstance(row.get("config"), dict) else {})
        merged_config["last_verification"] = report
        verified_at = str(report.get("checked_at", "")).strip() or datetime.now().astimezone().isoformat()
        updated = enterprise_update_workspace_domain(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            domain_id=domain_id,
            dns_status=dns_status,
            tls_status=tls_status,
            http_status=http_status,
            verified_at=verified_at,
            config=merged_config,
        )
        if updated:
            enterprise_add_audit_event(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
                actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
                event_type="domain.verified",
                entity_type="domain",
                entity_id=domain_id,
                severity="info" if str(report.get("overall_status", "")).strip() in {"ready", "warning"} else "warning",
                summary=f"Verified {hostname}.",
                detail=f"DNS {dns_status}, TLS {tls_status}, HTTP {http_status}.",
                payload=report,
            )
        return updated

    def _extract_urls_from_output(output_text: str) -> list[str]:
        urls: list[str] = []
        for match in re.findall(r"https://[^\s\"'<>]+", str(output_text or "")):
            candidate = str(match).strip().rstrip("),.;")
            if candidate and candidate not in urls:
                urls.append(candidate)
        return urls

    def _preferred_deploy_url(urls: list[str]) -> str:
        for candidate in urls:
            if ".vercel.app" in candidate:
                return candidate
        return urls[0] if urls else ""

    def _run_vercel_cli_deploy(*, production: bool) -> dict[str, Any]:
        npx_path = shutil.which("npx")
        if not npx_path:
            raise HTTPException(status_code=503, detail="npx is not available on this host.")
        command = [npx_path, "vercel", "deploy"]
        if production:
            command.append("--prod")
        command.extend(["-y", "--no-wait"])
        try:
            completed = subprocess.run(
                command,
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=900,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=504,
                detail=f"{'Production' if production else 'Preview'} deploy timed out after {int(exc.timeout or 900)} seconds.",
            ) from exc
        combined_output = "\n".join(part for part in ((completed.stdout or "").strip(), (completed.stderr or "").strip()) if part).strip()
        if completed.returncode != 0:
            detail = combined_output or f"{'Production' if production else 'Preview'} deploy failed."
            raise HTTPException(status_code=502, detail=detail[:1200])
        urls = _extract_urls_from_output(combined_output)
        deployment_url = _preferred_deploy_url(urls)
        inspect_url = next((item for item in urls if "vercel.com/" in item), "")
        payload: dict[str, Any] = {
            "provider": "vercel-cli",
            "mode": "production" if production else "preview",
            "status": "pending",
            "deploymentUrl": deployment_url,
            "url": deployment_url,
            "inspectUrl": inspect_url,
            "urls": urls,
            "output": combined_output[-4000:],
        }
        if production:
            payload["productionUrl"] = deployment_url
        else:
            payload["previewUrl"] = deployment_url
        return payload

    def _run_preview_deploy(mode: str = "claimable_preview") -> dict[str, Any]:
        normalized_mode = str(mode or "claimable_preview").strip().lower()
        deploy_script = REPO_ROOT / "tools" / "deploy_claimable_preview.sh"
        fallback_errors: list[str] = []
        if normalized_mode not in {"preview", "direct", "vercel", "vercel_cli"}:
            if not deploy_script.exists():
                fallback_errors.append("Claimable preview deploy script is not available on this host.")
            else:
                bash_path = shutil.which("bash")
                if not bash_path:
                    fallback_errors.append("Bash is not available on this host.")
                else:
                    try:
                        completed = subprocess.run(
                            [bash_path, str(deploy_script)],
                            cwd=str(REPO_ROOT),
                            capture_output=True,
                            text=True,
                            timeout=600,
                            check=False,
                        )
                    except subprocess.TimeoutExpired as exc:
                        fallback_errors.append(f"Claimable preview deploy timed out after {int(exc.timeout or 600)} seconds.")
                    else:
                        if completed.returncode == 0:
                            output_text = (completed.stdout or "").strip()
                            try:
                                payload = json.loads(output_text)
                            except Exception as exc:
                                raise HTTPException(status_code=502, detail="Preview deploy completed but returned invalid JSON.") from exc
                            if not isinstance(payload, dict):
                                raise HTTPException(status_code=502, detail="Preview deploy completed but returned an invalid payload.")
                            payload.setdefault("provider", "claimable-preview")
                            payload.setdefault("mode", "preview")
                            payload.setdefault("status", "ready")
                            return payload
                        detail = (completed.stderr or completed.stdout or "Preview deploy failed.").strip()
                        fallback_errors.append(detail[:1200])
        try:
            payload = _run_vercel_cli_deploy(production=False)
        except HTTPException as exc:
            if fallback_errors:
                detail = "; ".join(item for item in fallback_errors if item)
                detail = f"{detail}; {exc.detail}" if detail else str(exc.detail)
                raise HTTPException(status_code=exc.status_code, detail=detail[:1200]) from exc
            raise
        if fallback_errors:
            payload["fallback"] = {
                "status": "used",
                "reason": fallback_errors[0],
                "details": fallback_errors[:3],
            }
        return payload

    def _record_workspace_deployment(session: dict[str, Any], deploy_result: dict[str, Any], *, production: bool) -> None:
        actor = str(session.get("display_name", session.get("username", "system"))).strip() or "system"
        workspace_id = str(session.get("workspace_id", "")).strip()
        if not workspace_id:
            return
        deployment_url = str(
            deploy_result.get("deploymentUrl")
            or deploy_result.get("previewUrl")
            or deploy_result.get("productionUrl")
            or deploy_result.get("url")
            or ""
        ).strip()
        config_key = "last_production_deploy" if production else "last_preview_deploy"
        deployed_at = datetime.now().astimezone().isoformat()
        for row in enterprise_list_workspace_domains(enterprise_db_url, workspace_id=workspace_id):
            if str(row.get("scope", "")).strip() not in {"public_site", "shared_app", "tenant_portal"}:
                continue
            update_kwargs: dict[str, Any] = {
                "last_deployed_at": deployed_at,
                "config": {
                    **(row.get("config", {}) if isinstance(row.get("config"), dict) else {}),
                    config_key: deploy_result,
                },
            }
            if production and deployment_url:
                update_kwargs["deployment_url"] = deployment_url
            enterprise_update_workspace_domain(
                enterprise_db_url,
                workspace_id=workspace_id,
                domain_id=str(row.get("domain_id", "")).strip(),
                **update_kwargs,
            )
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=workspace_id,
            actor=actor,
            event_type="deployment.production" if production else "deployment.preview",
            entity_type="deployment",
            entity_id=deployment_url or ("production" if production else "preview"),
            summary="Triggered production deployment." if production else "Triggered preview deployment.",
            detail=deployment_url or ("Production deployment started without a deployment URL in the payload." if production else "Preview deployment completed without a preview URL in the payload."),
            payload=deploy_result,
        )

    def _repo_relative_path(path: Path) -> str:
        try:
            return str(path.relative_to(REPO_ROOT)).replace("\\", "/")
        except ValueError:
            return str(path)

    def _path_updated_at(path: Path) -> str | None:
        if not path.exists():
            return None
        try:
            return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            return None

    def _path_resource_payload(*, item_id: str, label: str, category: str, path: Path, detail: str) -> dict[str, Any]:
        return {
            "id": item_id,
            "label": label,
            "category": category,
            "path": _repo_relative_path(path),
            "exists": path.exists(),
            "updated_at": _path_updated_at(path),
            "detail": detail,
        }

    def _find_domain_row(rows: list[dict[str, Any]], hostname: str) -> dict[str, Any] | None:
        normalized_hostname = str(hostname).strip().lower()
        if not normalized_hostname:
            return None
        return next(
            (
                row
                for row in rows
                if isinstance(row, dict) and str(row.get("hostname", "")).strip().lower() == normalized_hostname
            ),
            None,
        )

    def _cached_domain_report(rows: list[dict[str, Any]], hostname: str) -> dict[str, Any] | None:
        row = _find_domain_row(rows, hostname)
        config = row.get("config", {}) if isinstance(row, dict) and isinstance(row.get("config"), dict) else {}
        report = config.get("last_verification")
        return report if isinstance(report, dict) else None

    def _synthetic_domain_report(domain: str, routes: list[str], detail: str, *, status: str = "error") -> dict[str, Any]:
        failure = {
            "target": f"domain:{domain}",
            "status": status,
            "detail": str(detail).strip() or "domain_check_failed",
            "meta": {
                "domain": domain,
                "routes": routes,
            },
        }
        return {
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "domain": domain,
            "overall_status": "warning" if status == "timeout" else "error",
            "check_count": 0,
            "failure_count": 1,
            "optional_failure_count": 0,
            "failures": [failure],
            "optional_failures": [],
            "all_failures": [failure],
            "checks": [],
        }

    def _safe_domain_report(domain: str, routes: list[str], *, cached_rows: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        cached_report = _cached_domain_report(cached_rows or [], domain)
        probe = _probe_with_timeout(
            lambda: run_domain_checks(domain, routes),
            timeout_seconds=6,
            timeout_status="timeout",
            timeout_message=f"Domain check for {domain} exceeded 6 seconds.",
        )
        if isinstance(probe, dict) and "checked_at" in probe:
            return probe
        if cached_report:
            fallback = {**cached_report}
            fallback["live_probe_status"] = str(probe.get("status", "cached")).strip() if isinstance(probe, dict) else "cached"
            fallback["live_probe_message"] = str(probe.get("message", "Using cached verification report.")).strip() if isinstance(probe, dict) else "Using cached verification report."
            return fallback
        if isinstance(probe, dict):
            return _synthetic_domain_report(
                domain,
                routes,
                str(probe.get("message", "domain_check_failed")).strip(),
                status=str(probe.get("status", "error")).strip() or "error",
            )
        return _synthetic_domain_report(domain, routes, "domain_check_failed")

    def _supermega_dev_resource_groups() -> dict[str, list[dict[str, Any]]]:
        return {
            "code": [
                _path_resource_payload(
                    item_id="api-entrypoint",
                    label="API runtime entrypoint",
                    category="code",
                    path=REPO_ROOT / "api_app.py",
                    detail="Boots the packaged api-static site together with the FastAPI runtime.",
                ),
                _path_resource_payload(
                    item_id="workspace-server",
                    label="Workspace control server",
                    category="code",
                    path=REPO_ROOT / "tools" / "serve_solution.py",
                    detail="Serves auth, control-plane, runtime, domain, and operator APIs.",
                ),
                _path_resource_payload(
                    item_id="showroom-router",
                    label="Showroom app router",
                    category="code",
                    path=REPO_ROOT / "showroom" / "src" / "App.tsx",
                    detail="Maps the public site and authenticated app routes for supermega.dev.",
                ),
                _path_resource_payload(
                    item_id="state-store",
                    label="Tenant state store",
                    category="code",
                    path=REPO_ROOT / "mark1_pilot" / "state_store.py",
                    detail="Persists workforce, approvals, quality, maintenance, and other tenant state.",
                ),
            ],
            "data": [
                _path_resource_payload(
                    item_id="api-static-site",
                    label="Bundled site root",
                    category="data",
                    path=REPO_ROOT / "api-static",
                    detail="Static build payload served for public routes and packaged preview deploys.",
                ),
                _path_resource_payload(
                    item_id="pilot-data",
                    label="Pilot data",
                    category="data",
                    path=REPO_ROOT / "pilot-data",
                    detail="Workspace snapshots, manifests, and generated local operating artifacts.",
                ),
                _path_resource_payload(
                    item_id="agent-team-system",
                    label="Agent team snapshot",
                    category="data",
                    path=REPO_ROOT / "pilot-data" / "agent_team_system.json",
                    detail="Current serialized agent team system payload used by the operator surfaces.",
                ),
                _path_resource_payload(
                    item_id="cloud-topology-resource",
                    label="Cloud topology resource",
                    category="data",
                    path=CLOUD_TOPOLOGY_RESOURCE_PATH,
                    detail="Host, route, and deployment-unit map for supermega.dev and tenant hosts.",
                ),
            ],
            "instructions": [
                _path_resource_payload(
                    item_id="architecture-manifest",
                    label="OS architecture manifest",
                    category="instructions",
                    path=REPO_ROOT / "Super Mega Inc" / "runbooks" / "supermega_os_architecture_manifest_2026-03-26.json",
                    detail="Canonical architecture manifest for the SuperMega operating system.",
                ),
                _path_resource_payload(
                    item_id="cloud-blueprint",
                    label="Cloud agent company blueprint",
                    category="instructions",
                    path=REPO_ROOT / "Super Mega Inc" / "runbooks" / "supermega_cloud_agent_company_blueprint_2026-04-19.md",
                    detail="Current cloud-native AI workforce blueprint and company design memo.",
                ),
                _path_resource_payload(
                    item_id="ops-readme",
                    label="Ops control index",
                    category="instructions",
                    path=REPO_ROOT / "Super Mega Inc" / "ops" / "README.md",
                    detail="Operator-facing index for the execution logs, roadmaps, and live control docs.",
                ),
                _path_resource_payload(
                    item_id="core-workspace-resource",
                    label="Core workspace resource",
                    category="instructions",
                    path=AGENT_WORKSPACE_RESOURCE_PATHS["default"],
                    detail="Core AI workspace context that defines the default agent operating context.",
                ),
                _path_resource_payload(
                    item_id="build-workforce-resource",
                    label="Build workforce resource",
                    category="instructions",
                    path=WORKFORCE_RESOURCE_PATHS["default"],
                    detail="Default workforce pack that defines the cloud build and operator crews.",
                ),
            ],
        }

    def _supermega_dev_control_payload(session: dict[str, Any]) -> dict[str, Any]:
        control_plane = _control_plane_payload(session)
        cloud_control = _cloud_control_payload(session)
        data_fabric = _data_fabric_payload(session)
        workforce_registry = _workforce_registry_payload(
            session,
            cloud_control_override=cloud_control,
            data_fabric_override=data_fabric,
        )
        workforce_live = workforce_registry.get("live", {}) if isinstance(workforce_registry.get("live"), dict) else {}
        workforce_summary = workforce_registry.get("summary", {}) if isinstance(workforce_registry.get("summary"), dict) else {}
        topology = cloud_control.get("topology", {}) if isinstance(cloud_control.get("topology"), dict) else {}
        topology_rows = topology.get("rows", []) if isinstance(topology.get("rows"), list) else []
        workspace_domain_rows = (
            (control_plane.get("domains") or {}).get("rows", [])
            if isinstance(control_plane.get("domains"), dict)
            else []
        )
        root_domain = str(topology.get("root_domain", "supermega.dev")).strip() or "supermega.dev"
        shared_app_host = str(topology.get("shared_app_host", "app.supermega.dev")).strip() or "app.supermega.dev"
        public_routes = ["/", "/platform/", "/products/", "/packages/", "/contact/"]
        app_routes = ["/login/", "/app/meta/", "/app/cloud/", "/app/platform-admin/"]
        root_report = _safe_domain_report(root_domain, public_routes, cached_rows=workspace_domain_rows)
        shared_app_domain = _find_domain_row(topology_rows, shared_app_host) or _find_domain_row(workspace_domain_rows, shared_app_host)
        site_root = _default_site_root_path()
        deployment_scripts = [
            _path_resource_payload(
                item_id="deploy-preview-script",
                label="Preview deploy launcher",
                category="deployment",
                path=REPO_ROOT / "tools" / "deploy_preview.sh",
                detail="Checks the deploy endpoint and launches the preview bundle upload.",
            ),
            _path_resource_payload(
                item_id="claimable-preview-script",
                label="Claimable preview deploy",
                category="deployment",
                path=REPO_ROOT / "tools" / "deploy_claimable_preview.sh",
                detail="Packages and uploads a claimable preview bundle for the current repo state.",
            ),
            _path_resource_payload(
                item_id="preview-bundle-script",
                label="Preview bundle packager",
                category="deployment",
                path=REPO_ROOT / "tools" / "package_preview_bundle.py",
                detail="Curates the deployment bundle used for preview deploys.",
            ),
            _path_resource_payload(
                item_id="vercel-config",
                label="Vercel deployment config",
                category="deployment",
                path=REPO_ROOT / "vercel.json",
                detail="Deployment routing and function configuration for preview and production paths.",
            ),
        ]
        smoke_scripts = [
            _path_resource_payload(
                item_id="local-smoke-script",
                label="Local workspace smoke",
                category="smoke",
                path=REPO_ROOT / "tools" / "run_local_smoke.ps1",
                detail="Runs the local workspace smoke test against an isolated app session with the preferred Python runtime.",
            ),
            _path_resource_payload(
                item_id="portal-smoke-script",
                label="Portal and site smoke",
                category="smoke",
                path=REPO_ROOT / "tools" / "run_local_portal_smoke.ps1",
                detail="Builds the showroom and runs the portal smoke plus public-site route and asset checks.",
            ),
            _path_resource_payload(
                item_id="public-smoke-script",
                label="Public site smoke",
                category="smoke",
                path=REPO_ROOT / "tools" / "smoke_test_public_site.py",
                detail="Checks public supermega.dev routes and built asset availability.",
            ),
            _path_resource_payload(
                item_id="workspace-smoke-script",
                label="Workspace smoke",
                category="smoke",
                path=REPO_ROOT / "tools" / "smoke_test_supermega_app.py",
                detail="Exercises authenticated app routes, control APIs, and role gates.",
            ),
        ]
        resource_groups = _supermega_dev_resource_groups()
        deployment_ready = all(bool(item.get("exists")) for item in deployment_scripts)
        smoke_ready = all(bool(item.get("exists")) for item in smoke_scripts)
        topology_summary = topology.get("summary", {}) if isinstance(topology.get("summary"), dict) else {}
        cloud_summary = cloud_control.get("summary", {}) if isinstance(cloud_control.get("summary"), dict) else {}
        module_summary = control_plane.get("modules", {}) if isinstance(control_plane.get("modules"), dict) else {}
        member_summary = control_plane.get("members", {}) if isinstance(control_plane.get("members"), dict) else {}
        domain_summary = control_plane.get("domains", {}) if isinstance(control_plane.get("domains"), dict) else {}
        audit_summary = control_plane.get("audit_events", {}) if isinstance(control_plane.get("audit_events"), dict) else {}
        commands = [
            {
                "id": "machine-status",
                "label": "Machine status",
                "kind": "ops",
                "command": "powershell -ExecutionPolicy Bypass -File .\\tools\\supermega_machine.ps1 -Action status",
                "detail": "Show the public site, internal files, and command readiness in one machine snapshot.",
            },
            {
                "id": "build-site",
                "label": "Build showroom",
                "kind": "build",
                "command": "npm --prefix .\\showroom run build",
                "detail": "Build the public and app bundles from the repo root and refresh api-static routes.",
            },
            {
                "id": "preview-deploy",
                "label": "Deploy preview",
                "kind": "deploy",
                "command": "bash tools/deploy_preview.sh",
                "detail": "Ship the current repo into a preview deployment path.",
            },
            {
                "id": "package-preview",
                "label": "Package preview bundle",
                "kind": "deploy",
                "command": "python .\\tools\\package_preview_bundle.py",
                "detail": "Create the curated bundle before a claimable preview upload.",
            },
            {
                "id": "local-smoke",
                "label": "Run local smoke",
                "kind": "smoke",
                "command": "powershell -ExecutionPolicy Bypass -File .\\tools\\run_local_smoke.ps1",
                "detail": "Verify authenticated app flows, APIs, and role gates on a clean local run.",
            },
            {
                "id": "portal-smoke",
                "label": "Run portal smoke",
                "kind": "smoke",
                "command": "powershell -ExecutionPolicy Bypass -File .\\tools\\run_local_portal_smoke.ps1",
                "detail": "Verify the portal plus public supermega.dev pages and static assets.",
            },
        ]
        machine_sections = [
            {
                "id": "public-site",
                "name": "Public site",
                "route": "/platform",
                "summary": "The showroom builds from the showroom app into api-static and serves the public supermega.dev routes.",
                "signals": [
                    f"Root domain: {root_domain}",
                    f"Checked public routes: {len(public_routes)}",
                    f"Site root: {_repo_relative_path(site_root)}",
                ],
            },
            {
                "id": "authenticated-app",
                "name": "Authenticated app",
                "route": "/app/meta",
                "summary": "The app layer serves the internal operating surfaces on the shared host and enforces workspace capability gates.",
                "signals": [
                    f"Shared app host: {shared_app_host}",
                    f"Workspace routes tracked: {len(app_routes)}",
                    f"Workspace domains: {len(workspace_domain_rows)}",
                ],
            },
            {
                "id": "control-plane",
                "name": "Control plane",
                "route": "/app/platform-admin",
                "summary": "Workspace modules, members, domains, and audit events are persisted in the enterprise control plane.",
                "signals": [
                    f"Enabled modules: {int(module_summary.get('enabled_count', 0) or 0)}",
                    f"Members: {int(member_summary.get('count', 0) or 0)}",
                    f"Audit events: {int(audit_summary.get('count', 0) or 0)}",
                ],
            },
            {
                "id": "worker-runtime",
                "name": "Worker runtime",
                "route": "/app/runtime",
                "summary": "The backend runtime, state store, and job workers keep agent execution alive outside the UI session.",
                "signals": [
                    f"Preferred workforce mode: {str(cloud_control.get('preferred_workforce_mode', 'direct_batch'))}",
                    f"Ready controls: {int(cloud_summary.get('ready_count', 0) or 0)}",
                    f"Stale jobs: {int(cloud_summary.get('stale_job_count', 0) or 0)}",
                ],
            },
            {
                "id": "deploy-loop",
                "name": "Build and deploy loop",
                "route": "/app/cloud",
                "summary": "Preview deploy scripts, Vercel config, and smoke harnesses keep shipping and verification repeatable.",
                "signals": [
                    f"Deployment scripts ready: {'yes' if deployment_ready else 'partial'}",
                    f"Smoke harness ready: {'yes' if smoke_ready else 'partial'}",
                    f"Topology hosts: {int(topology_summary.get('count', 0) or 0)}",
                ],
            },
            {
                "id": "knowledge-resources",
                "name": "Knowledge resources",
                "route": "/app/workbench",
                "summary": "Runbooks, ops docs, and agent resource manifests shape how the machine understands and extends itself.",
                "signals": [
                    f"Instruction packs: {len(resource_groups.get('instructions', []))}",
                    f"Data packs: {len(resource_groups.get('data', []))}",
                    f"Code anchors: {len(resource_groups.get('code', []))}",
                ],
            },
        ]
        return {
            "status": "ready",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "workspace": control_plane.get("workspace", {}),
            "machine": {
                "repo_root": str(REPO_ROOT),
                "root_domain": root_domain,
                "shared_app_host": shared_app_host,
                "site_root": _repo_relative_path(site_root),
                "service_entrypoint": _repo_relative_path(REPO_ROOT / "tools" / "serve_solution.py"),
                "public_routes": public_routes,
                "app_routes": app_routes,
                "sections": machine_sections,
            },
            "platform": {
                "profile": control_plane.get("profile", {}),
                "modules": module_summary,
                "members": member_summary,
                "domains": domain_summary,
                "audit_events": audit_summary,
            },
            "cloud": {
                "preferred_workforce_mode": str(cloud_control.get("preferred_workforce_mode", "direct_batch")).strip() or "direct_batch",
                "summary": cloud_summary,
                "topology": topology,
                "jobs": cloud_control.get("jobs", []),
                "next_moves": cloud_control.get("next_moves", []),
            },
            "workforce": {
                "summary": workforce_summary,
                "preferred_workforce_mode": str(workforce_live.get("preferred_workforce_mode", "")).strip()
                or str(cloud_control.get("preferred_workforce_mode", "direct_batch")).strip()
                or "direct_batch",
                "core_team": workforce_live.get("core_team", []),
                "assignment_board": workforce_live.get("assignment_board", []),
                "review_cycles": workforce_live.get("review_cycles", []),
                "automation_lanes": workforce_live.get("automation_lanes", []),
                "data_links": workforce_live.get("data_links", []),
                "supervisor": workforce_live.get("supervisor", {}),
                "next_moves": workforce_live.get("next_moves", []),
            },
            "domains": {
                "root_report": root_report,
                "shared_app_domain": shared_app_domain,
                "workspace_rows": workspace_domain_rows,
                "topology_summary": topology_summary,
            },
            "deployment": {
                "preview_ready": deployment_ready,
                "vercel_cli_available": bool(shutil.which("vercel")),
                "scripts": deployment_scripts,
                "commands": [item for item in commands if str(item.get("kind", "")).strip() in {"ops", "build", "deploy"}],
            },
            "smoke": {
                "ready": smoke_ready,
                "public_routes": public_routes,
                "app_routes": app_routes,
                "scripts": smoke_scripts,
                "commands": [item for item in commands if str(item.get("kind", "")).strip() == "smoke"],
            },
            "resources": resource_groups,
            "commands": commands,
        }

    def _run_production_deploy() -> dict[str, Any]:
        return _run_vercel_cli_deploy(production=True)

    def _tenant_state_payload(session: dict[str, Any]) -> dict[str, Any]:
        expected_tenant_key = _agent_workspace_resource_key(session)
        resource = _load_agent_workspace_resource(session)
        resource_tenant_key = str(resource.get("tenant_key", "")).strip() or expected_tenant_key
        scoped_manifest = load_agent_operating_model(state_db, tenant_key=expected_tenant_key)
        scoped_manifest_tenant_key = str(scoped_manifest.get("tenantKey", "")).strip()
        scoped_snapshot = load_agent_team_system_snapshot(state_db, tenant_key=expected_tenant_key)
        scoped_snapshot_tenant_key = ""
        if isinstance(scoped_snapshot, dict):
            snapshot_manifest = scoped_snapshot.get("manifest", {})
            if isinstance(snapshot_manifest, dict):
                scoped_snapshot_tenant_key = str(snapshot_manifest.get("tenantKey", "")).strip()
            if not scoped_snapshot_tenant_key:
                scoped_snapshot_tenant_key = str(scoped_snapshot.get("tenant_key", "")).strip()
        latest_manifest = load_agent_operating_model(state_db)
        latest_manifest_tenant_key = str(latest_manifest.get("tenantKey", "")).strip()
        latest_snapshot = load_agent_team_system_snapshot(state_db)
        snapshot_tenant_key = ""
        if isinstance(latest_snapshot, dict):
            snapshot_manifest = latest_snapshot.get("manifest", {})
            if isinstance(snapshot_manifest, dict):
                snapshot_tenant_key = str(snapshot_manifest.get("tenantKey", "")).strip()
            if not snapshot_tenant_key:
                snapshot_tenant_key = str(latest_snapshot.get("tenant_key", "")).strip()

        status = "matched"
        blocked = False
        detail = f"Tenant state matches {expected_tenant_key}."

        if expected_tenant_key != "default" and not scoped_manifest_tenant_key and not scoped_snapshot_tenant_key:
            status = "missing"
            blocked = True
            detail = f"No scoped agent manifest is stored for tenant {expected_tenant_key} yet."
        elif scoped_manifest_tenant_key and scoped_manifest_tenant_key != expected_tenant_key:
            status = "mismatch"
            blocked = True
            detail = (
                f"Scoped manifest state is stored for {scoped_manifest_tenant_key}, "
                f"but this workspace expects {expected_tenant_key}."
            )
        elif scoped_snapshot_tenant_key and scoped_snapshot_tenant_key != expected_tenant_key:
            status = "mismatch"
            blocked = True
            detail = (
                f"Scoped agent snapshot belongs to {scoped_snapshot_tenant_key}, "
                f"but this workspace expects {expected_tenant_key}."
            )
        elif expected_tenant_key == "default" and not scoped_manifest_tenant_key:
            status = "fallback"
            detail = "No persisted default manifest was found, so the route will use the built-in default contract."
        elif latest_manifest_tenant_key and latest_manifest_tenant_key != expected_tenant_key:
            status = "parallel"
            detail = (
                f"Scoped state is ready for {expected_tenant_key}. "
                f"Another tenant ({latest_manifest_tenant_key}) was synced more recently."
            )

        return {
            "status": status,
            "blocked": blocked,
            "expected_tenant_key": expected_tenant_key,
            "resource_tenant_key": resource_tenant_key,
            "persisted_manifest_tenant_key": scoped_manifest_tenant_key,
            "scoped_snapshot_tenant_key": scoped_snapshot_tenant_key,
            "current_state_tenant_key": latest_manifest_tenant_key,
            "snapshot_tenant_key": snapshot_tenant_key,
            "workspace_slug": str(session.get("workspace_slug", "")).strip(),
            "workspace_name": str(session.get("workspace_name", "")).strip(),
            "detail": detail,
        }

    def _load_expected_agent_manifest(expected_tenant_key: str) -> dict[str, Any]:
        manifest = load_agent_operating_model(state_db, tenant_key=expected_tenant_key)
        if isinstance(manifest, dict) and manifest:
            return manifest
        if expected_tenant_key == "default":
            from mark1_pilot.agent_teams import build_agent_operating_manifest

            built = build_agent_operating_manifest()
            return built if isinstance(built, dict) else {}
        return {}

    def _count_rows_by_key(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        for row in rows:
            value = str(row.get(key, "")).strip() or "unknown"
            counts[value] = int(counts.get(value, 0)) + 1
        return [{"key": item_key, "count": count} for item_key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]

    def _agent_workspace_payload(session: dict[str, Any]) -> dict[str, Any]:
        resource = _load_agent_workspace_resource(session)
        workspace_id = str(session.get("workspace_id", "")).strip()
        module_rows = enterprise_list_workspace_modules(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        member_rows = enterprise_list_workspace_members(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        audit_rows = enterprise_list_audit_events(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=12,
        )
        workspace_task_rows = enterprise_list_workspace_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=200,
        )
        cloud_control = _cloud_control_payload(session)
        supervisor = _load_json(pilot_data / "supervisor_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")

        enabled_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "enabled")
        pilot_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "pilot")
        disabled_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "disabled")
        open_task_count = sum(
            1 for row in workspace_task_rows if str(row.get("status", "")).strip().lower() not in {"done", "closed", "archived"}
        )
        member_role_counts = _count_rows_by_key(member_rows, "role")
        module_status_counts = _count_rows_by_key(module_rows, "workspace_status")
        role_profiles = resource.get("role_profiles", []) if isinstance(resource.get("role_profiles"), list) else []
        configured_roles = {
            str(entry.get("id", "")).strip().lower()
            for entry in role_profiles
            if isinstance(entry, dict) and str(entry.get("id", "")).strip()
        }
        active_roles = {str(item.get("key", "")).strip().lower() for item in member_role_counts if str(item.get("key", "")).strip()}
        role_coverage_score = int(round((len(active_roles & configured_roles) / len(configured_roles)) * 100)) if configured_roles else 0
        cloud_summary = cloud_control.get("summary", {}) if isinstance(cloud_control.get("summary"), dict) else {}
        company = resource.get("company", {}) if isinstance(resource.get("company"), dict) else {}

        return {
            "status": "ready",
            "updated_at": datetime.now().astimezone().isoformat(),
            "resource_id": str(resource.get("resource_id", "")).strip(),
            "tenant_key": str(resource.get("tenant_key", "")).strip(),
            "company": company,
            "dialectic": resource.get("dialectic", {}) if isinstance(resource.get("dialectic"), dict) else {},
            "workspace": {
                "workspace_id": workspace_id,
                "workspace_slug": str(session.get("workspace_slug", "")).strip(),
                "workspace_name": str(session.get("workspace_name", "")).strip() or str(company.get("name", "")).strip(),
                "workspace_plan": str(session.get("workspace_plan", "")).strip(),
                "role": str(session.get("role", "")).strip(),
                "display_name": str(session.get("display_name", session.get("username", ""))).strip(),
            },
            "summary": {
                "workspace_count": len(resource.get("workspaces", []) if isinstance(resource.get("workspaces"), list) else []),
                "role_count": len(role_profiles),
                "tool_profile_count": len(resource.get("tool_profiles", []) if isinstance(resource.get("tool_profiles"), list) else []),
                "knowledge_resource_count": len(resource.get("knowledge_resources", []) if isinstance(resource.get("knowledge_resources"), list) else []),
                "trust_boundary_count": len(resource.get("trust_boundaries", []) if isinstance(resource.get("trust_boundaries"), list) else []),
                "ai_team_count": len(resource.get("ai_teams", []) if isinstance(resource.get("ai_teams"), list) else []),
                "execution_loop_count": len(resource.get("execution_loops", []) if isinstance(resource.get("execution_loops"), list) else []),
                "enabled_module_count": enabled_count,
                "pilot_module_count": pilot_count,
                "disabled_module_count": disabled_count,
                "member_count": len(member_rows),
                "open_task_count": open_task_count,
                "audit_event_count": len(audit_rows),
                "coverage_score": int(coverage.get("readiness_score", 0) or 0),
                "role_coverage_score": role_coverage_score,
                "cloud_ready_count": int(cloud_summary.get("ready_count", 0) or 0),
                "cloud_attention_count": int(cloud_summary.get("attention_count", 0) or 0),
                "cloud_blocker_count": int(cloud_summary.get("blocker_count", 0) or 0),
                "stale_job_count": int(cloud_summary.get("stale_job_count", 0) or 0),
            },
            "workspaces": resource.get("workspaces", []) if isinstance(resource.get("workspaces"), list) else [],
            "role_profiles": role_profiles,
            "tool_profiles": resource.get("tool_profiles", []) if isinstance(resource.get("tool_profiles"), list) else [],
            "knowledge_resources": resource.get("knowledge_resources", []) if isinstance(resource.get("knowledge_resources"), list) else [],
            "trust_boundaries": resource.get("trust_boundaries", []) if isinstance(resource.get("trust_boundaries"), list) else [],
            "ai_teams": resource.get("ai_teams", []) if isinstance(resource.get("ai_teams"), list) else [],
            "execution_loops": resource.get("execution_loops", []) if isinstance(resource.get("execution_loops"), list) else [],
            "quick_links": resource.get("quick_links", []) if isinstance(resource.get("quick_links"), list) else [],
            "references": resource.get("references", []) if isinstance(resource.get("references"), list) else [],
            "live": {
                "module_status_counts": module_status_counts,
                "module_rows": module_rows,
                "member_role_counts": member_role_counts,
                "recent_audits": audit_rows,
                "commands": cloud_control.get("commands", []) if isinstance(cloud_control.get("commands"), list) else [],
                "next_moves": cloud_control.get("next_moves", []) if isinstance(cloud_control.get("next_moves"), list) else [],
                "supervisor": {
                    "status": str(supervisor.get("status", "")).strip() or "unknown",
                    "cycle_count": int(supervisor.get("cycle_count", 0) or 0),
                    "last_finished_at": str(supervisor.get("last_finished_at", "")).strip(),
                    "interval_minutes": int(supervisor.get("interval_minutes", 0) or 0),
                },
            },
        }

    def _normalize_workforce_manifest(manifest: dict[str, Any], fallback_tenant_key: str) -> dict[str, Any]:
        if not isinstance(manifest, dict) or not manifest:
            return {}
        return {
            "version": str(manifest.get("version", "")).strip(),
            "tenantKey": str(manifest.get("tenantKey", fallback_tenant_key)).strip() or fallback_tenant_key,
            "title": str(manifest.get("title", "")).strip(),
            "summary": str(manifest.get("summary", "")).strip(),
            "managerMoves": manifest.get("managerMoves", []) if isinstance(manifest.get("managerMoves", []), list) else [],
            "tools": manifest.get("tools", []) if isinstance(manifest.get("tools", []), list) else [],
            "playbooks": manifest.get("playbooks", []) if isinstance(manifest.get("playbooks", []), list) else [],
        }

    def _workforce_manifest_for_session(session: dict[str, Any], resource: dict[str, Any]) -> dict[str, Any]:
        tenant_key = str(resource.get("tenant_key", _agent_workspace_resource_key(session))).strip() or "default"
        scoped_manifest = load_agent_operating_model(state_db, tenant_key=tenant_key)
        normalized_scoped = _normalize_workforce_manifest(scoped_manifest if isinstance(scoped_manifest, dict) else {}, tenant_key)
        if str(normalized_scoped.get("tenantKey", "")).strip() == tenant_key and normalized_scoped.get("playbooks"):
            return normalized_scoped
        if tenant_key == "default":
            from mark1_pilot.agent_teams import build_agent_operating_manifest

            return _normalize_workforce_manifest(build_agent_operating_manifest(), tenant_key)
        seed_playbooks = resource.get("seed_playbooks", []) if isinstance(resource.get("seed_playbooks", []), list) else []
        return {
            "version": "seed",
            "tenantKey": tenant_key,
            "title": str(resource.get("title", "")).strip() or "Tenant workforce",
            "summary": str(resource.get("dialectic", {}).get("synthesis", "")).strip() if isinstance(resource.get("dialectic"), dict) else "",
            "managerMoves": resource.get("manager_moves", []) if isinstance(resource.get("manager_moves", []), list) else [],
            "tools": [],
            "playbooks": seed_playbooks,
        }

    def _workforce_registry_payload(
        session: dict[str, Any],
        *,
        cloud_control_override: dict[str, Any] | None = None,
        data_fabric_override: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resource = _load_workforce_resource(session)
        manifest = _workforce_manifest_for_session(session, resource)
        workspace_id = str(session.get("workspace_id", "")).strip()
        module_rows = enterprise_list_workspace_modules(enterprise_db_url, workspace_id=workspace_id)
        member_rows = enterprise_list_workspace_members(enterprise_db_url, workspace_id=workspace_id)
        workspace_task_rows = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=200)
        latest_runs = enterprise_list_agent_runs(enterprise_db_url, workspace_id=workspace_id, limit=12) if workspace_id else []
        cloud_control = cloud_control_override if isinstance(cloud_control_override, dict) else _cloud_control_payload(session)
        data_fabric = data_fabric_override if isinstance(data_fabric_override, dict) else _data_fabric_payload(session)
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        supervisor = _load_json(pilot_data / "supervisor_status.json")

        role_cells = resource.get("role_cells", []) if isinstance(resource.get("role_cells", []), list) else []
        build_teams = resource.get("build_teams", []) if isinstance(resource.get("build_teams", []), list) else []
        workspaces = resource.get("workspaces", []) if isinstance(resource.get("workspaces", []), list) else []
        delegated_pods = resource.get("delegated_pods", []) if isinstance(resource.get("delegated_pods", []), list) else []
        instruction_packs = resource.get("instruction_packs", []) if isinstance(resource.get("instruction_packs", []), list) else []
        playbooks = manifest.get("playbooks", []) if isinstance(manifest.get("playbooks", []), list) else []
        tools = manifest.get("tools", []) if isinstance(manifest.get("tools", []), list) else []
        source_registry = data_fabric.get("source_registry", []) if isinstance(data_fabric.get("source_registry", []), list) else []
        manager_programs = data_fabric.get("manager_programs", []) if isinstance(data_fabric.get("manager_programs", []), list) else []
        change_lineage = data_fabric.get("change_lineage", []) if isinstance(data_fabric.get("change_lineage", []), list) else []

        ai_pod_names: set[str] = set()
        for team in build_teams:
            if not isinstance(team, dict):
                continue
            for pod_name in team.get("agent_pods", []) if isinstance(team.get("agent_pods", []), list) else []:
                cleaned = str(pod_name).strip()
                if cleaned:
                    ai_pod_names.add(cleaned)
        open_task_count = sum(
            1 for row in workspace_task_rows if str(row.get("status", "")).strip().lower() not in {"done", "closed", "archived"}
        )
        enabled_module_count = sum(1 for row in module_rows if str(row.get("workspace_status", "")).strip() == "enabled")
        member_role_counts = _count_rows_by_key(member_rows, "role")
        cloud_summary = cloud_control.get("summary", {}) if isinstance(cloud_control.get("summary"), dict) else {}
        active_playbook_count = sum(1 for row in latest_runs if str(row.get("status", "")).strip().lower() in {"queued", "running", "ready"})
        open_task_rows = [
            row
            for row in workspace_task_rows
            if isinstance(row, dict) and str(row.get("status", "")).strip().lower() not in {"done", "closed", "archived"}
        ]

        def _workforce_operating_route(label: str) -> str:
            normalized = _canonical_role(label)
            if normalized in {"quality", "quality_manager"}:
                return "/app/dqms"
            if normalized in {"maintenance"}:
                return "/app/maintenance"
            if normalized in {"finance_controller", "procurement_lead"}:
                return "/app/approvals"
            if normalized in {"sales", "sales_lead"}:
                return "/app/revenue"
            if normalized in {"director"}:
                return "/app/director"
            if normalized in {"platform_admin", "tenant_admin", "admin", "ceo", "owner", "product_owner", "implementation_lead"}:
                return "/app/platform-admin"
            if normalized in {"receiving_clerk"}:
                return "/app/receiving"
            if normalized in {"operations", "plant_manager", "manager", "operator", "member"}:
                return "/app/operations"
            return "/app/workforce"

        def _workforce_route_cadence(route: str) -> str:
            normalized = str(route or "").strip()
            cadence_by_route = {
                "/app/operations": "Every shift handoff",
                "/app/dqms": "Twice daily quality triage",
                "/app/approvals": "Twice daily packet review",
                "/app/revenue": "Daily commercial review",
                "/app/director": "Daily director brief",
                "/app/platform-admin": "Daily control-plane review",
                "/app/receiving": "Every receipt window",
                "/app/maintenance": "Daily reliability standup",
            }
            return cadence_by_route.get(normalized, "Daily manager review")

        def _owner_aliases(member: dict[str, Any]) -> set[str]:
            aliases = {
                str(member.get("display_name", "")).strip().lower(),
                str(member.get("username", "")).strip().lower(),
                str(member.get("email", "")).strip().lower(),
                str(member.get("role", "")).strip().lower(),
                _canonical_role(str(member.get("role", ""))).replace("_", " "),
            }
            return {alias for alias in aliases if alias}

        def _owner_matches_member(owner_value: str, member: dict[str, Any]) -> bool:
            normalized_owner = str(owner_value or "").strip().lower()
            if not normalized_owner:
                return False
            return normalized_owner in _owner_aliases(member)

        def _linked_sources_for_route(route: str, limit: int = 3) -> list[str]:
            normalized_route = str(route or "").strip().lower()
            linked = [
                str(item.get("name", "")).strip()
                for item in source_registry
                if isinstance(item, dict)
                and str(item.get("route", "")).strip().lower() == normalized_route
                and str(item.get("name", "")).strip()
            ]
            if linked:
                return linked[:limit]
            fallback = [
                str(item.get("name", "")).strip()
                for item in source_registry
                if isinstance(item, dict) and str(item.get("name", "")).strip()
            ]
            return fallback[:limit]

        def _task_profile(row: dict[str, Any]) -> dict[str, Any]:
            haystack = " ".join(
                [
                    str(row.get("template", "")).strip(),
                    str(row.get("title", "")).strip(),
                    str(row.get("notes", "")).strip(),
                    str(row.get("owner", "")).strip(),
                ]
            ).lower()
            if any(term in haystack for term in ("quality", "capa", "incident", "defect", "containment")):
                return {
                    "route": "/app/dqms",
                    "preferred_roles": ["quality", "quality_manager", "manager", "owner"],
                    "reason": "Quality tasks should land with the quality lane so evidence, CAPA, and recurrence stay in one review loop.",
                }
            if any(term in haystack for term in ("maintenance", "downtime", "asset", "repair", "pm ")):
                return {
                    "route": "/app/maintenance",
                    "preferred_roles": ["maintenance", "plant_manager", "manager", "owner"],
                    "reason": "Reliability work should route into the maintenance lane with plant escalation close by.",
                }
            if any(term in haystack for term in ("approval", "supplier", "receiving", "shipment", "invoice", "grn")):
                return {
                    "route": "/app/approvals",
                    "preferred_roles": ["finance_controller", "procurement_lead", "receiving_clerk", "manager", "owner"],
                    "reason": "Supplier, packet, and receiving work should route into procurement or finance review before it blocks release.",
                }
            if any(term in haystack for term in ("lead", "sales", "quote", "revenue", "customer", "dealer", "company")):
                return {
                    "route": "/app/revenue",
                    "preferred_roles": ["sales_lead", "sales", "director", "manager", "owner"],
                    "reason": "Commercial follow-up should stay inside the revenue lane so account memory and action timing remain visible.",
                }
            if any(term in haystack for term in ("connector", "data", "cloud", "deploy", "runtime", "automation", "review")):
                return {
                    "route": "/app/cloud",
                    "preferred_roles": ["owner", "tenant_admin", "platform_admin", "manager"],
                    "reason": "Cloud and connector work should stay with the control-plane owners so automation posture is explicit.",
                }
            return {
                "route": "/app/operations",
                "preferred_roles": ["plant_manager", "operations", "manager", "owner"],
                "reason": "Operational work should route into the plant and operations lane by default.",
            }

        def _pick_member_for_roles(preferred_roles: list[str]) -> dict[str, Any] | None:
            preferred = {_canonical_role(role) for role in preferred_roles if str(role).strip()}
            for member in member_rows:
                if not isinstance(member, dict):
                    continue
                if _canonical_role(str(member.get("role", ""))) in preferred:
                    return member
            for fallback_role in ("manager", "owner", "tenant_admin", "platform_admin"):
                for member in member_rows:
                    if not isinstance(member, dict):
                        continue
                    if _canonical_role(str(member.get("role", ""))) == fallback_role:
                        return member
            return next((member for member in member_rows if isinstance(member, dict)), None)

        core_team: list[dict[str, Any]] = []
        for member in member_rows:
            if not isinstance(member, dict):
                continue
            member_role = str(member.get("role", "")).strip()
            home_route = _workforce_operating_route(member_role)
            assigned_tasks = [row for row in open_task_rows if _owner_matches_member(str(row.get("owner", "")).strip(), member)]
            high_priority_tasks = [
                row for row in assigned_tasks if str(row.get("priority", "")).strip().lower() in {"high", "critical", "urgent"}
            ]
            linked_program_rows = [
                program
                for program in manager_programs
                if isinstance(program, dict) and str(program.get("route", "")).strip() == home_route
            ]
            matching_role_cell = next(
                (
                    cell
                    for cell in role_cells
                    if isinstance(cell, dict)
                    and (
                        _canonical_role(str(cell.get("role", "")).strip()) == _canonical_role(member_role)
                        or str(cell.get("route", "")).strip() == home_route
                    )
                ),
                {},
            )
            capability_focus = [
                *[
                    str(item).strip()
                    for item in (matching_role_cell.get("must_capture", []) if isinstance(matching_role_cell.get("must_capture", []), list) else [])
                    if str(item).strip()
                ][:2],
                *[
                    str(item).strip()
                    for program in linked_program_rows[:1]
                    for item in (program.get("watches", []) if isinstance(program.get("watches", []), list) else [])
                    if str(item).strip()
                ][:2],
            ]
            deduped_focus = list(dict.fromkeys(capability_focus))
            linked_sources = _linked_sources_for_route(home_route)
            next_move = (
                f"Clear {len(high_priority_tasks)} high-priority tasks from {home_route}."
                if high_priority_tasks
                else str((linked_program_rows[0] if linked_program_rows else {}).get("next_handoff", "")).strip()
                or f"Keep {home_route} reviewed on {_workforce_route_cadence(home_route).lower()}."
            )
            core_team.append(
                {
                    "member_id": str(member.get("membership_id", "")).strip(),
                    "name": str(member.get("display_name", member.get("username", ""))).strip() or "Workspace member",
                    "role": member_role,
                    "status": str(member.get("status", "")).strip() or "active",
                    "home_route": home_route,
                    "capability_focus": deduped_focus[:3],
                    "assigned_open_task_count": len(assigned_tasks),
                    "assigned_high_priority_task_count": len(high_priority_tasks),
                    "linked_programs": [
                        str(program.get("name", "")).strip()
                        for program in linked_program_rows
                        if isinstance(program, dict) and str(program.get("name", "")).strip()
                    ][:2],
                    "linked_data_domains": linked_sources,
                    "next_move": next_move,
                }
            )

        assignment_board: list[dict[str, Any]] = []
        for row in open_task_rows[:8]:
            profile = _task_profile(row)
            suggested_member = _pick_member_for_roles(profile.get("preferred_roles", []))
            current_owner = str(row.get("owner", "")).strip() or "Unassigned"
            suggested_owner = (
                str((suggested_member or {}).get("display_name", (suggested_member or {}).get("username", ""))).strip()
                or current_owner
            )
            suggested_role = str((suggested_member or {}).get("role", "")).strip() or "manager"
            assignment_board.append(
                {
                    "id": str(row.get("task_id", "")).strip(),
                    "title": str(row.get("title", "")).strip() or "Workspace task",
                    "priority": str(row.get("priority", "")).strip() or "normal",
                    "status": (
                        "Needs assignment"
                        if not str(row.get("owner", "")).strip() or str(row.get("owner", "")).strip().lower() in {"owner", "management"}
                        else "Assigned"
                    ),
                    "route": str(profile.get("route", "")).strip() or "/app/workforce",
                    "current_owner": current_owner,
                    "suggested_owner": suggested_owner,
                    "suggested_role": suggested_role,
                    "due": str(row.get("due", "")).strip() or None,
                    "data_signals": _linked_sources_for_route(str(profile.get("route", "")).strip() or "/app/workforce", limit=3),
                    "reason": str(profile.get("reason", "")).strip(),
                    "next_action": str(row.get("notes", "")).strip()
                    or f"Route this task to {suggested_owner} and review it in {str(profile.get('route', '')).strip() or '/app/workforce'}.",
                }
            )

        review_cycles: list[dict[str, Any]] = []
        for program in manager_programs[:5]:
            if not isinstance(program, dict):
                continue
            route = str(program.get("route", "")).strip() or "/app/workforce"
            matching_assignments = [item for item in assignment_board if str(item.get("route", "")).strip() == route]
            linked_sources = _linked_sources_for_route(route, limit=3)
            ready_source_count = sum(
                1
                for item in source_registry
                if isinstance(item, dict)
                and str(item.get("route", "")).strip() == route
                and str(item.get("status", "")).strip() in {"live", "mapped"}
            )
            review_cycles.append(
                {
                    "id": str(program.get("id", "")).strip() or _slugify(str(program.get("name", "")).strip()),
                    "name": str(program.get("name", "")).strip() or "Review cycle",
                    "cadence": _workforce_route_cadence(route),
                    "status": "Healthy" if ready_source_count and len(matching_assignments) <= 3 else "Attention" if linked_sources else "Needs wiring",
                    "route": route,
                    "owner_role": str(program.get("role", "")).strip() or "Manager",
                    "queue_count": len(matching_assignments),
                    "data_signals": linked_sources,
                    "focus": [
                        str(item).strip()
                        for item in (program.get("watches", []) if isinstance(program.get("watches", []), list) else [])
                        if str(item).strip()
                    ][:3],
                    "next_move": str(program.get("next_handoff", "")).strip()
                    or f"Review {len(matching_assignments)} queued items and confirm the next handoff.",
                }
            )

        cloud_jobs = cloud_control.get("jobs", []) if isinstance(cloud_control.get("jobs"), list) else []
        preferred_workforce_mode = str(cloud_control.get("preferred_workforce_mode", "direct_batch")).strip() or "direct_batch"
        automation_lanes: list[dict[str, Any]] = []
        for index, job in enumerate(cloud_jobs[:6], start=1):
            if not isinstance(job, dict):
                continue
            job_type = str(job.get("job_type", job.get("jobType", ""))).strip()
            job_name = str(job.get("name", "")).strip() or job_type or f"automation-{index}"
            route = _task_profile({"title": job_name, "template": job_type}).get("route", "/app/cloud")
            automation_lanes.append(
                {
                    "id": job_type or f"automation-{index}",
                    "name": job_name,
                    "cadence": str(job.get("cadence", "")).strip() or "On demand",
                    "status": str(job.get("status", "")).strip() or "blocked",
                    "route": str(route).strip() or "/app/cloud",
                    "mode": "Queue-first" if preferred_workforce_mode == "queue_worker" else "Direct batch",
                    "source_systems": _linked_sources_for_route(str(route).strip() or "/app/cloud", limit=3),
                    "latest_run_at": str(job.get("last_run_at", job.get("lastRunAt", ""))).strip() or None,
                    "queue_signal": (
                        "Queue worker drains the backlog after scheduler enqueue."
                        if preferred_workforce_mode == "queue_worker"
                        else "Direct batch can still run, but queue worker adoption is the next hardening step."
                    ),
                    "next_move": str(job.get("detail", "")).strip()
                    or f"Keep {job_name} running in cloud mode and attach direct source deltas.",
                }
            )

        data_links: list[dict[str, Any]] = []
        for item in source_registry[:6]:
            if not isinstance(item, dict):
                continue
            data_links.append(
                {
                    "id": str(item.get("id", "")).strip(),
                    "name": str(item.get("name", "")).strip() or "Source",
                    "status": str(item.get("status", "")).strip() or "mapped",
                    "route": str(item.get("route", "")).strip() or "/app/data-fabric",
                    "source_type": str(item.get("source_type", item.get("sourceType", ""))).strip() or "source",
                    "evidence_count": int(item.get("evidence_count", item.get("evidenceCount", 0)) or 0),
                    "consumers": [
                        str(consumer).strip()
                        for consumer in (item.get("consumers", []) if isinstance(item.get("consumers", []), list) else [])
                        if str(consumer).strip()
                    ][:3],
                    "next_automation": str(item.get("next_automation", item.get("nextAutomation", ""))).strip()
                    or "Connect this source to a durable sync and review loop.",
                }
            )

        return {
            "status": "ready",
            "updated_at": datetime.now().astimezone().isoformat(),
            "resource_id": str(resource.get("resource_id", "")).strip(),
            "tenant_key": str(resource.get("tenant_key", "")).strip() or _agent_workspace_resource_key(session),
            "title": str(resource.get("title", "")).strip(),
            "dialectic": resource.get("dialectic", {}) if isinstance(resource.get("dialectic"), dict) else {},
            "manager_moves": manifest.get("managerMoves", []) if isinstance(manifest.get("managerMoves", []), list) and manifest.get("managerMoves") else (
                resource.get("manager_moves", []) if isinstance(resource.get("manager_moves", []), list) else []
            ),
            "workspace": {
                "workspace_id": workspace_id,
                "workspace_slug": str(session.get("workspace_slug", "")).strip(),
                "workspace_name": str(session.get("workspace_name", "")).strip(),
                "workspace_plan": str(session.get("workspace_plan", "")).strip(),
                "role": str(session.get("role", "")).strip(),
                "display_name": str(session.get("display_name", session.get("username", ""))).strip(),
            },
            "summary": {
                "role_count": len(role_cells),
                "build_team_count": len(build_teams),
                "workspace_count": len(workspaces),
                "delegated_pod_count": len(delegated_pods),
                "instruction_pack_count": len(instruction_packs),
                "playbook_count": len(playbooks),
                "tool_count": len(tools),
                "ai_pod_count": len(ai_pod_names) if ai_pod_names else len(playbooks),
                "member_count": len(member_rows),
                "open_task_count": open_task_count,
                "active_playbook_count": active_playbook_count,
                "enabled_module_count": enabled_module_count,
                "coverage_score": int(coverage.get("readiness_score", 0) or 0),
                "cloud_ready_count": int(cloud_summary.get("ready_count", 0) or 0),
                "cloud_attention_count": int(cloud_summary.get("attention_count", 0) or 0),
                "cloud_blocker_count": int(cloud_summary.get("blocker_count", 0) or 0),
                "core_team_count": len(core_team),
                "assignment_count": len(assignment_board),
                "review_cycle_count": len(review_cycles),
                "automation_lane_count": len(automation_lanes),
                "data_link_count": len(data_links),
            },
            "role_cells": role_cells,
            "build_teams": build_teams,
            "workspaces": workspaces,
            "delegated_pods": delegated_pods,
            "instruction_packs": instruction_packs,
            "manifest": manifest,
            "live": {
                "member_role_counts": member_role_counts,
                "recent_runs": latest_runs,
                "commands": cloud_control.get("commands", []) if isinstance(cloud_control.get("commands", []), list) else [],
                "next_moves": cloud_control.get("next_moves", []) if isinstance(cloud_control.get("next_moves", []), list) else [],
                "preferred_workforce_mode": preferred_workforce_mode,
                "core_team": core_team,
                "assignment_board": assignment_board,
                "review_cycles": review_cycles,
                "automation_lanes": automation_lanes,
                "data_links": data_links,
                "supervisor": {
                    "status": str(supervisor.get("status", "")).strip() or "unknown",
                    "cycle_count": int(supervisor.get("cycle_count", 0) or 0),
                    "last_finished_at": str(supervisor.get("last_finished_at", "")).strip(),
                    "interval_minutes": int(supervisor.get("interval_minutes", 0) or 0),
                },
            },
        }

    def _model_ops_provider_id_for_model(model_name: str) -> str:
        normalized = str(model_name or "").strip().lower()
        if normalized.startswith("gpt-"):
            return "provider-openai"
        if normalized.startswith("claude"):
            return "provider-anthropic"
        if normalized.startswith("gemini"):
            return "provider-gemini"
        return ""

    def _model_ops_provider_name(card: dict[str, Any] | None) -> str:
        return str((card or {}).get("name", "")).strip() or "Unmapped provider"

    def _model_ops_provider_status(card: dict[str, Any] | None) -> str:
        return str((card or {}).get("status", "")).strip() or "blocked"

    def _model_ops_suggested_profile_id_for_crew(cell: dict[str, Any]) -> str:
        haystack = " ".join(
            [
                str(cell.get("name", "")).strip(),
                str(cell.get("workspace", "")).strip(),
                str(cell.get("mission", "")).strip(),
                *[str(item).strip() for item in (cell.get("toolClasses", []) if isinstance(cell.get("toolClasses"), list) else []) if str(item).strip()],
                *[str(item).strip() for item in (cell.get("dataSources", []) if isinstance(cell.get("dataSources"), list) else []) if str(item).strip()],
                *[str(item).strip() for item in (cell.get("allowedActions", []) if isinstance(cell.get("allowedActions"), list) else []) if str(item).strip()],
            ]
        ).lower()
        if any(term in haystack for term in ("repo", "code", "build", "patch", "shell", "release", "github", "refactor")):
            return "codex-builder"
        if any(term in haystack for term in ("browser", "computer use", "queue", "subagent", "qa", "skill", "tool search")):
            return "crew-operator"
        if any(term in haystack for term in ("extract", "classification", "ranking", "feature", "gmail", "drive", "erp", "document", "mail", "intake", "retrieval")):
            return "extract-classify"
        return "frontier-governance"

    def _model_ops_payload(session: dict[str, Any]) -> dict[str, Any]:
        cloud_control = _cloud_control_payload(session)
        runtime_control = _runtime_control_payload(session)
        data_fabric = _data_fabric_payload(session)

        provider_rows = cloud_control.get("model_providers", []) if isinstance(cloud_control.get("model_providers"), list) else []
        routing_profiles = (
            runtime_control.get("model_routing_profiles", []) if isinstance(runtime_control.get("model_routing_profiles"), list) else []
        )
        crew_cells = (
            runtime_control.get("agent_capability_cells", []) if isinstance(runtime_control.get("agent_capability_cells"), list) else []
        )
        toolchain_rows = cloud_control.get("agent_toolchain", []) if isinstance(cloud_control.get("agent_toolchain"), list) else []
        toolchain_ready_count = sum(1 for item in toolchain_rows if str(item.get("status", "")).strip() == "ready")
        provider_map = {
            str(item.get("id", "")).strip(): item
            for item in provider_rows
            if isinstance(item, dict) and str(item.get("id", "")).strip()
        }

        provider_lanes: list[dict[str, Any]] = []
        for card in provider_rows:
            if not isinstance(card, dict):
                continue
            provider_id = str(card.get("id", "")).strip()
            primary_profiles = [
                str(profile.get("name", "")).strip()
                for profile in routing_profiles
                if isinstance(profile, dict)
                and _model_ops_provider_id_for_model(str(profile.get("preferredModel", "")).strip()) == provider_id
                and str(profile.get("name", "")).strip()
            ]
            fallback_profiles = [
                str(profile.get("name", "")).strip()
                for profile in routing_profiles
                if isinstance(profile, dict)
                and _model_ops_provider_id_for_model(str(profile.get("fallbackModel", "")).strip()) == provider_id
                and str(profile.get("name", "")).strip()
            ]
            recommended_uses = (
                [f"Primary for {name}" for name in primary_profiles]
                if primary_profiles
                else ["No preferred routing lane assigned yet"]
            ) + [f"Fallback for {name}" for name in fallback_profiles]
            provider_lanes.append(
                {
                    **card,
                    "primaryProfiles": primary_profiles,
                    "fallbackProfiles": fallback_profiles,
                    "recommendedUses": recommended_uses,
                }
            )

        routing_lanes: list[dict[str, Any]] = []
        for profile in routing_profiles:
            if not isinstance(profile, dict):
                continue
            preferred_provider_id = _model_ops_provider_id_for_model(str(profile.get("preferredModel", "")).strip())
            fallback_provider_id = _model_ops_provider_id_for_model(str(profile.get("fallbackModel", "")).strip())
            preferred_provider = provider_map.get(preferred_provider_id)
            fallback_provider = provider_map.get(fallback_provider_id)
            routing_lanes.append(
                {
                    **profile,
                    "preferredProviderId": preferred_provider_id,
                    "preferredProviderName": _model_ops_provider_name(preferred_provider),
                    "preferredProviderStatus": _model_ops_provider_status(preferred_provider),
                    "fallbackProviderId": fallback_provider_id,
                    "fallbackProviderName": _model_ops_provider_name(fallback_provider),
                    "fallbackProviderStatus": _model_ops_provider_status(fallback_provider),
                }
            )
        routing_map = {
            str(item.get("id", "")).strip(): item
            for item in routing_lanes
            if isinstance(item, dict) and str(item.get("id", "")).strip()
        }

        crew_lanes: list[dict[str, Any]] = []
        for cell in crew_cells:
            if not isinstance(cell, dict):
                continue
            lane = routing_map.get(_model_ops_suggested_profile_id_for_crew(cell), {})
            tool_classes = cell.get("toolClasses", []) if isinstance(cell.get("toolClasses"), list) else []
            data_sources = cell.get("dataSources", []) if isinstance(cell.get("dataSources"), list) else []
            crew_lanes.append(
                {
                    "id": str(cell.get("id", "")).strip(),
                    "name": str(cell.get("name", "")).strip(),
                    "status": str(cell.get("status", "")).strip(),
                    "workspace": str(cell.get("workspace", "")).strip(),
                    "mission": str(cell.get("mission", "")).strip(),
                    "trustBoundary": str(cell.get("trustBoundary", "")).strip(),
                    "approvalGate": str(cell.get("approvalGate", "")).strip(),
                    "suggestedProfileId": str(lane.get("id", "")).strip(),
                    "suggestedProfileName": str(lane.get("name", "")).strip() or "Unassigned routing lane",
                    "suggestedProviderName": str(lane.get("preferredProviderName", "")).strip() or "Unmapped provider",
                    "suggestedProviderStatus": str(lane.get("preferredProviderStatus", "")).strip() or "blocked",
                    "signals": [
                        *[str(item).strip() for item in tool_classes[:2] if str(item).strip()],
                        *[str(item).strip() for item in data_sources[:2] if str(item).strip()],
                    ],
                    "risks": [str(item).strip() for item in (cell.get("risks", []) if isinstance(cell.get("risks"), list) else []) if str(item).strip()],
                    "route": "/app/agent-space",
                }
            )

        drill_templates = [
            {
                "id": "director-decision-packet",
                "profileId": "frontier-governance",
                "name": "Director decision packet",
                "owner": "Director review",
                "route": "/app/director",
                "objective": "Turn cross-functional evidence into one reviewed decision packet with clear tradeoffs, owner, and next action.",
                "checks": ["Citations or evidence links attached", "Escalation path named", "Decision and next move recorded"],
            },
            {
                "id": "foundry-builder-release",
                "profileId": "codex-builder",
                "name": "Foundry builder release",
                "owner": "Platform pod",
                "route": "/app/factory",
                "objective": "Ship multi-file module work with bounded write scope, verification, and release handoff back into the control plane.",
                "checks": ["Write scope is explicit", "Build or syntax check passes", "Release lane and rollback path are visible"],
            },
            {
                "id": "browser-ops-sweep",
                "profileId": "crew-operator",
                "name": "Browser and operator sweep",
                "owner": "Agent ops",
                "route": "/app/cloud",
                "objective": "Run repetitive UI, connector, and queue checks in the cheaper crew lane before operators spend manual time on them.",
                "checks": ["Task boundary is scoped", "External writes stay approved", "Trace logging is present"],
            },
            {
                "id": "evidence-extraction-lane",
                "profileId": "extract-classify",
                "name": "Gmail and Drive evidence extraction",
                "owner": "Knowledge systems",
                "route": "/app/data-fabric",
                "objective": "Convert inbox, folder, and document changes into scored evidence, feature signals, and promotable records.",
                "checks": ["Structured output validates", "Confidence threshold is recorded", "Promotion review is required before canon writeback"],
            },
        ]
        benchmark_drills: list[dict[str, Any]] = []
        for template in drill_templates:
            lane = routing_map.get(str(template.get("profileId", "")).strip(), {})
            provider_state = str(lane.get("preferredProviderStatus", "blocked")).strip().lower()
            profile_state = str(lane.get("status", "Blocked")).strip().lower()
            if provider_state == "blocked" or toolchain_ready_count <= 0:
                drill_status = "Blocked"
            elif provider_state == "attention" or profile_state == "warning":
                drill_status = "Attention"
            else:
                drill_status = "Healthy"
            benchmark_drills.append(
                {
                    "id": str(template.get("id", "")).strip(),
                    "name": str(template.get("name", "")).strip(),
                    "status": drill_status,
                    "owner": str(template.get("owner", "")).strip(),
                    "route": str(template.get("route", "")).strip(),
                    "profileName": str(lane.get("name", "")).strip() or "Unassigned routing lane",
                    "providerName": str(lane.get("preferredProviderName", "")).strip() or "Unmapped provider",
                    "objective": str(template.get("objective", "")).strip(),
                    "checks": [str(item).strip() for item in (template.get("checks", []) if isinstance(template.get("checks"), list) else []) if str(item).strip()],
                    "nextMove": str(lane.get("nextMove", "")).strip() or "Define a routing lane and approval boundary before scaling this workflow.",
                }
            )

        attention_providers = [str(item.get("name", "")).strip() for item in provider_lanes if str(item.get("status", "")).strip() != "ready"]
        runtime_big_picture = runtime_control.get("big_picture", {}) if isinstance(runtime_control.get("big_picture"), dict) else {}
        cloud_next_moves = cloud_control.get("next_moves", []) if isinstance(cloud_control.get("next_moves"), list) else []
        routing_next_moves = [
            str(item.get("nextMove", "")).strip()
            for item in routing_lanes
            if isinstance(item, dict) and str(item.get("status", "")).strip() != "Healthy" and str(item.get("nextMove", "")).strip()
        ]
        learning_database = data_fabric.get("learning_database", {}) if isinstance(data_fabric.get("learning_database"), dict) else {}
        learning_trust_score = int(learning_database.get("trust_score", 0) or 0)

        updated_at = _runtime_latest_timestamp(
            [
                str(cloud_control.get("updated_at", "")).strip(),
                str(runtime_control.get("updated_at", "")).strip(),
                str(data_fabric.get("updated_at", "")).strip(),
            ]
        )

        return {
            "status": "ready",
            "source": "live",
            "updatedAt": updated_at,
            "resourceId": "model-ops-control",
            "tenantKey": str(session.get("workspace_slug", "")).strip() or _agent_workspace_resource_key(session),
            "workspaceName": str(session.get("workspace_name", "")).strip(),
            "dialectic": {
                "thesis": str(runtime_big_picture.get("thesis", "")).strip(),
                "antithesis": (
                    f"Autonomy degrades when {', '.join(attention_providers)} remain partial and crews infer routing or writeback policy from context instead of explicit contracts."
                    if attention_providers
                    else "Autonomy still fails when crews infer routing, approval, or eval policy instead of working from explicit contracts."
                ),
                "synthesis": "Model Ops is the synthesis layer: every crew gets a declared lane, every lane maps to a provider and fallback, and every high-impact workflow gets benchmark drills before autonomy expands.",
            },
            "summary": {
                "providerCount": len(provider_lanes),
                "readyProviderCount": sum(1 for item in provider_lanes if str(item.get("status", "")).strip() == "ready"),
                "routingProfileCount": len(routing_lanes),
                "healthyRoutingCount": sum(1 for item in routing_lanes if str(item.get("status", "")).strip() == "Healthy"),
                "crewCount": len(crew_lanes),
                "guardedCrewCount": sum(1 for item in crew_lanes if str(item.get("status", "")).strip() == "Healthy"),
                "drillCount": len(benchmark_drills),
                "readyDrillCount": sum(1 for item in benchmark_drills if str(item.get("status", "")).strip() == "Healthy"),
                "toolchainReadyCount": toolchain_ready_count,
                "staleJobCount": int(((cloud_control.get("summary") or {}).get("stale_job_count", 0) or 0)),
                "learningTrustScore": learning_trust_score,
            },
            "providerLanes": provider_lanes,
            "routingLanes": routing_lanes,
            "crewLanes": crew_lanes,
            "benchmarkDrills": benchmark_drills,
            "nextMoves": [*cloud_next_moves[:3], *routing_next_moves[:2]],
        }

    def _exception_queue_payload(limit: int = 100) -> dict[str, Any]:
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
        return {"summary": summary, "count": len(rows), "rows": rows}

    def _meta_attention_payload(
        *,
        summary_payload: dict[str, Any],
        runtime_payload: dict[str, Any],
        agent_run_rows: list[dict[str, Any]],
        exception_rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        severity_rank = {"Critical": 0, "High": 1, "Medium": 2}

        def runtime_severity(status: str) -> str:
            normalized = str(status or "").strip().lower()
            if normalized == "degraded":
                return "Critical"
            if normalized in {"warning", "needs wiring"}:
                return "High"
            return "Medium"

        def exception_severity(priority: str) -> str:
            normalized = str(priority or "").strip().lower()
            if normalized in {"critical", "high"}:
                return "Critical"
            if normalized in {"medium", "review"}:
                return "High"
            return "Medium"

        def runtime_detail(item: dict[str, Any]) -> str:
            for key in ("backlog", "nextMove", "purpose", "freshness"):
                value = str(item.get(key, "")).strip()
                if value:
                    return value
            return ""

        items: list[dict[str, Any]] = []

        for row in exception_rows[:4]:
            items.append(
                {
                    "id": str(row.get("exception_id", "")).strip() or f"exception-{len(items)}",
                    "severity": exception_severity(str(row.get("priority", ""))),
                    "area": "Exception",
                    "title": str(row.get("title", "")).strip() or "Exception",
                    "owner": str(row.get("owner", "")).strip() or str(row.get("source_type", "")).strip() or "System",
                    "detail": str(row.get("summary", "")).strip() or "Review the exception queue.",
                    "route": str(row.get("route", "")).strip() or "/app/exceptions",
                }
            )

        for row in agent_run_rows:
            if str(row.get("status", "")).strip().lower() != "error":
                continue
            items.append(
                {
                    "id": str(row.get("run_id", "")).strip() or f"agent-{len(items)}",
                    "severity": "High",
                    "area": "Agent",
                    "title": str(row.get("job_type", "")).strip() or "Agent run",
                    "owner": str(row.get("triggered_by", "")).strip() or str(row.get("source", "")).strip() or "system",
                    "detail": str(row.get("error_text", "")).strip() or str(row.get("summary", "")).strip() or "Agent run failed.",
                    "route": "/app/teams",
                }
            )

        runtime_items: list[dict[str, Any]] = []
        for entry in runtime_payload.get("connectors", []):
            if not isinstance(entry, dict) or str(entry.get("status", "")).strip() == "Healthy":
                continue
            runtime_items.append(
                {
                    "id": str(entry.get("id", "")).strip() or f"runtime-{len(runtime_items)}",
                    "severity": runtime_severity(str(entry.get("status", ""))),
                    "area": "Runtime",
                    "title": str(entry.get("name", "")).strip() or "Connector",
                    "owner": str(entry.get("owner", "")).strip() or "Runtime",
                    "detail": runtime_detail(entry) or "Review runtime health.",
                    "route": "/app/runtime",
                }
            )
        for entry in runtime_payload.get("knowledge_collections", []):
            if not isinstance(entry, dict) or str(entry.get("status", "")).strip() == "Healthy":
                continue
            runtime_items.append(
                {
                    "id": str(entry.get("id", "")).strip() or f"knowledge-{len(runtime_items)}",
                    "severity": runtime_severity(str(entry.get("status", ""))),
                    "area": "Runtime",
                    "title": str(entry.get("name", "")).strip() or "Knowledge collection",
                    "owner": str(entry.get("owner", "")).strip() or "Knowledge",
                    "detail": runtime_detail(entry) or "Review the knowledge layer.",
                    "route": "/app/knowledge",
                }
            )
        for entry in runtime_payload.get("autonomy_loops", []):
            if not isinstance(entry, dict) or str(entry.get("status", "")).strip() == "Healthy":
                continue
            runtime_items.append(
                {
                    "id": str(entry.get("id", "")).strip() or f"loop-{len(runtime_items)}",
                    "severity": runtime_severity(str(entry.get("status", ""))),
                    "area": "Runtime",
                    "title": str(entry.get("name", "")).strip() or "Autonomy loop",
                    "owner": str(entry.get("owner", "")).strip() or "Runtime",
                    "detail": runtime_detail(entry) or "Review the autonomy loop.",
                    "route": "/app/teams",
                }
            )
        runtime_items.sort(key=lambda item: severity_rank.get(str(item.get("severity", "Medium")), 2))
        items.extend(runtime_items[:4])

        for index, title in enumerate((summary_payload.get("review", {}) or {}).get("top_priorities", [])[:3]):
            items.append(
                {
                    "id": f"priority-{index}",
                    "severity": "Medium",
                    "area": "Priority",
                    "title": str(title).strip() or "Priority",
                    "owner": "Leadership",
                    "detail": "Current company priority from the operating review.",
                    "route": "/app/insights",
                }
            )

        items.sort(key=lambda item: severity_rank.get(str(item.get("severity", "Medium")), 2))
        return items[:8]

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        review = _load_json(pilot_data / "execution_review.json")
        autopilot = _load_json(pilot_data / "autopilot_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        enterprise_db_scheme = str(enterprise_db_url or "").split(":", 1)[0].strip()
        return {
            "status": "ready",
            "service": "supermega-service",
            "site_root_ready": bool(site_root.exists()),
            "pilot_data_ready": bool(pilot_data.exists()),
            "state_db_ready": bool(Path(state_db).exists()),
            "enterprise_db_ready": bool(enterprise_db_url),
            "enterprise_db_scheme": enterprise_db_scheme or "unknown",
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
            "session": _session_payload(session)
            if session
            else (
                {
                    "username": auth_username,
                    "role": auth_role,
                    "display_name": auth_display_name,
                    "capabilities": sorted(_role_capabilities(auth_role)),
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
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(user.get("display_name", user.get("username", "system"))).strip() or "system",
            event_type="auth.login",
            entity_type="session",
            entity_id=str(session.get("session_id", "")).strip(),
            summary="Workspace login succeeded.",
            detail=f"Opened {str(session.get('workspace_name', '')).strip() or 'the workspace'}.",
            payload={
                "workspace_slug": str(session.get("workspace_slug", "")).strip(),
                "role": str(user.get("role", "")).strip(),
            },
        )
        return {
            "status": "ready",
            "authenticated": True,
            "session": _session_payload(
                {
                    "username": user.get("username", ""),
                    "display_name": user.get("display_name", ""),
                    "role": user.get("role", ""),
                    "workspace_id": session.get("workspace_id", ""),
                    "workspace_slug": session.get("workspace_slug", ""),
                    "workspace_name": session.get("workspace_name", ""),
                    "workspace_plan": session.get("workspace_plan", ""),
                }
            ),
            "uses_default_credentials": uses_default_credentials,
            "workspaces": enterprise_list_user_workspaces(enterprise_db_url, username=str(user.get("username", ""))),
        }

    @app.post("/api/auth/signup")
    def auth_signup(request: Request, response: Response, payload: SignupRequest) -> dict[str, Any]:
        tenant_defaults = _public_tenant_defaults(request)
        email = str(payload.email or "").strip().lower()
        company = str(payload.company or tenant_defaults.get("company", "")).strip()
        name = str(payload.name or "").strip() or company or "Owner"
        preferred_package = str(payload.package_name or "").strip()
        first_team = str(payload.first_team or "").strip()
        current_systems = _unique_values([str(item).strip() for item in (payload.current_systems or []) if str(item).strip()])
        goal = str(payload.goal or "").strip()
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
        enterprise_update_workspace_profile(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            company=company,
            preferred_package=preferred_package,
            first_team=first_team,
            systems=current_systems,
            goal=goal,
            onboarding_status=_derive_onboarding_status(
                preferred_package=preferred_package,
                first_team=first_team,
                systems=current_systems,
                goal=goal,
            ),
        )
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(user.get("display_name", user.get("username", "system"))).strip() or "system",
            event_type="workspace.signup",
            entity_type="workspace",
            entity_id=str(session.get("workspace_id", "")).strip(),
            summary="Workspace created from signup.",
            detail=f"{company} was provisioned with starter access.",
            payload={
                "workspace_slug": workspace_slug,
                "goal": goal,
                "preferred_package": preferred_package,
                "first_team": first_team,
                "current_systems": current_systems,
                "generated_password": not bool(str(payload.password or "").strip()),
            },
        )
        return {
            "status": "ready",
            "authenticated": True,
            "generated_password": "" if str(payload.password or "").strip() else password,
            "session": _session_payload(
                {
                    "username": user.get("username", ""),
                    "display_name": user.get("display_name", ""),
                    "role": user.get("role", ""),
                    "workspace_id": session.get("workspace_id", ""),
                    "workspace_slug": session.get("workspace_slug", ""),
                    "workspace_name": session.get("workspace_name", ""),
                    "workspace_plan": session.get("workspace_plan", ""),
                }
            ),
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
            enterprise_add_audit_event(
                enterprise_db_url,
                workspace_id=str(session.get("workspace_id", "")).strip(),
                actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
                event_type="auth.logout",
                entity_type="session",
                entity_id=str(session.get("session_id", "")).strip(),
                summary="Workspace logout completed.",
                detail=f"Closed {str(session.get('workspace_name', '')).strip() or 'the workspace'}.",
            )
            enterprise_revoke_session(enterprise_db_url, session_id=str(session.get("session_id", "")))
        _clear_session_cookie(response, request)
        return {"status": "ready", "authenticated": False}

    @app.get("/api/summary")
    def summary(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        return {"status": "ready", **_summary_payload(session)}

    @app.get("/api/runtime/control")
    def runtime_control(request: Request) -> dict[str, Any]:
        session = _require_runtime_control_access(request)
        return _runtime_control_payload(session)

    @app.get("/api/cloud/control")
    def cloud_control(request: Request) -> dict[str, Any]:
        session = _require_cloud_control_access(request)
        return _cloud_control_payload(session)

    @app.get("/api/model-ops")
    def model_ops(request: Request) -> dict[str, Any]:
        session = _require_model_ops_access(request)
        return _model_ops_payload(session)

    @app.get("/api/agent-workspace/context")
    def agent_workspace_context(request: Request) -> dict[str, Any]:
        session = _require_agent_workspace_access(request)
        return _agent_workspace_payload(session)

    @app.get("/api/workforce/registry")
    def workforce_registry(request: Request) -> dict[str, Any]:
        session = _require_workforce_registry_access(request)
        return _workforce_registry_payload(session)

    @app.post("/api/workforce/automation/apply")
    def apply_workforce_automation(request_http: Request, request: WorkforceAutomationRequest) -> dict[str, Any]:
        session = _require_workforce_manage_access(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        actor = str(session.get("display_name", session.get("username", "system"))).strip() or "system"
        source = str(request.source or "").strip() or "workforce_command"
        limit = max(1, int(request.limit or 8))

        registry = _workforce_registry_payload(session)
        live = registry.get("live", {}) if isinstance(registry.get("live"), dict) else {}
        assignment_board = live.get("assignment_board", []) if isinstance(live.get("assignment_board"), list) else []
        review_cycles = live.get("review_cycles", []) if isinstance(live.get("review_cycles"), list) else []
        automation_lanes = live.get("automation_lanes", []) if isinstance(live.get("automation_lanes"), list) else []

        def _normalized_owner(value: str) -> str:
            return str(value or "").strip().lower()

        applied_assignments: list[dict[str, Any]] = []
        seeded_reviews: list[dict[str, Any]] = []
        queue_result: dict[str, Any] | None = None
        process_result: dict[str, Any] | None = None

        if request.apply_assignments:
            for item in assignment_board[:limit]:
                if not isinstance(item, dict):
                    continue
                task_id = str(item.get("id", "")).strip()
                current_owner = str(item.get("current_owner", "")).strip()
                suggested_owner = str(item.get("suggested_owner", "")).strip()
                if not task_id or not suggested_owner:
                    continue
                if _normalized_owner(current_owner) == _normalized_owner(suggested_owner):
                    continue
                if _normalized_owner(current_owner) not in {"", "owner", "management", "unassigned"} and str(item.get("status", "")).strip() != "Needs assignment":
                    continue
                existing_notes = str(item.get("next_action", "")).strip()
                rationale = str(item.get("reason", "")).strip()
                notes = "\n".join(part for part in [existing_notes, f"Auto-assigned by Workforce Command. {rationale}".strip()] if part)
                row = enterprise_update_workspace_task(
                    enterprise_db_url,
                    workspace_id=workspace_id,
                    task_id=task_id,
                    owner=suggested_owner,
                    notes=notes,
                )
                if not row:
                    continue
                applied_assignments.append(row)
                _record_audit_and_connector_event(
                    enterprise_db_url=enterprise_db_url,
                    workspace_id=workspace_id,
                    actor=actor,
                    event_type="workforce.assignment.applied",
                    entity_type="workspace_task",
                    entity_id=task_id,
                    summary=f"Assigned task {str(row.get('title', task_id)).strip() or task_id} to {suggested_owner}.",
                    detail=rationale or f"Task routed to {suggested_owner} from Workforce Command.",
                    connector_id="ytf-shopfloor-entry",
                    source="Workforce automation",
                    kind="task_assignment",
                    route=str(item.get("route", "")).strip() or "/app/workforce",
                    payload={
                        "previous_owner": current_owner,
                        "suggested_owner": suggested_owner,
                        "suggested_role": str(item.get("suggested_role", "")).strip(),
                        "priority": str(item.get("priority", "")).strip(),
                        "status": str(row.get("status", "")).strip(),
                    },
                    connector_title=str(row.get("title", "")).strip() or "Workspace task",
                )

        if request.seed_review_cycles:
            existing_tasks = enterprise_list_workspace_tasks(enterprise_db_url, workspace_id=workspace_id, limit=500)
            open_templates = {
                str(row.get("template", "")).strip()
                for row in existing_tasks
                if isinstance(row, dict)
                and str(row.get("template", "")).strip()
                and str(row.get("status", "")).strip().lower() not in {"done", "closed", "archived"}
            }
            review_rows: list[dict[str, Any]] = []
            for cycle in review_cycles[:limit]:
                if not isinstance(cycle, dict):
                    continue
                cycle_id = str(cycle.get("id", "")).strip()
                if not cycle_id:
                    continue
                template = f"workforce_review:{cycle_id}"
                if template in open_templates:
                    continue
                queue_count = int(cycle.get("queue_count", 0) or 0)
                focus = [
                    str(item).strip()
                    for item in (cycle.get("focus", []) if isinstance(cycle.get("focus", []), list) else [])
                    if str(item).strip()
                ]
                signals = [
                    str(item).strip()
                    for item in (cycle.get("data_signals", []) if isinstance(cycle.get("data_signals", []), list) else [])
                    if str(item).strip()
                ]
                review_rows.append(
                    {
                        "title": f"{str(cycle.get('name', '')).strip() or 'Workforce review'} review",
                        "owner": str(cycle.get("owner_role", "")).strip() or "Manager",
                        "priority": "High" if str(cycle.get("status", "")).strip() != "Healthy" or queue_count > 0 else "Medium",
                        "due": "Today" if queue_count > 0 else "This week",
                        "status": "open",
                        "notes": (
                            f"Review {queue_count} queued items. "
                            f"Focus: {', '.join(focus) or 'manager review'}. "
                            f"Signals: {', '.join(signals) or 'data fabric feeds'}. "
                            f"Next move: {str(cycle.get('next_move', '')).strip() or 'Complete the review and record the next action.'}"
                        ),
                        "template": template,
                    }
                )
            if review_rows:
                saved = enterprise_add_workspace_tasks(
                    enterprise_db_url,
                    workspace_id=workspace_id,
                    rows=review_rows,
                )
                saved_task_ids = {str(item).strip() for item in saved.get("saved_task_ids", []) if str(item).strip()}
                seeded_reviews = [
                    row
                    for row in saved.get("tasks", [])
                    if isinstance(row, dict) and str(row.get("task_id", "")).strip() in saved_task_ids
                ]
                for row in seeded_reviews:
                    _record_audit_and_connector_event(
                        enterprise_db_url=enterprise_db_url,
                        workspace_id=workspace_id,
                        actor=actor,
                        event_type="workforce.review.seeded",
                        entity_type="workspace_task",
                        entity_id=str(row.get("task_id", "")).strip(),
                        summary=f"Seeded review task {str(row.get('title', 'Workforce review')).strip()}.",
                        detail=str(row.get("notes", "")).strip(),
                        connector_id="ytf-shopfloor-entry",
                        source="Workforce automation",
                        kind="review_task",
                        route="/app/workforce",
                        payload={
                            "template": str(row.get("template", "")).strip(),
                            "owner": str(row.get("owner", "")).strip(),
                            "priority": str(row.get("priority", "")).strip(),
                            "status": str(row.get("status", "")).strip(),
                        },
                        connector_title=str(row.get("title", "")).strip() or "Review task",
                    )

        allowed_job_types = {str(item.get("job_type", "")).strip() for item in AGENT_JOB_TEMPLATES if isinstance(item, dict)}
        selected_job_types = [
            str(item.get("id", "")).strip()
            for item in automation_lanes[:limit]
            if isinstance(item, dict) and str(item.get("id", "")).strip() in allowed_job_types
        ]
        if request.queue_default_jobs:
            queue_result = _enqueue_agent_job_batch(
                workspace_id=workspace_id,
                triggered_by=actor,
                source=source,
                job_types=selected_job_types,
            )
        if request.process_queue:
            process_result = _process_agent_run_queue(
                workspace_id=workspace_id,
                source=f"{source}_worker",
                job_types=selected_job_types,
                limit=min(limit, 8),
            )

        return {
            "status": "ready",
            "message": (
                f"Applied {len(applied_assignments)} assignments, seeded {len(seeded_reviews)} review tasks, "
                f"queued {int((queue_result or {}).get('queued_count', 0) or 0)} jobs, "
                f"processed {int((process_result or {}).get('processed_count', 0) or 0)} queued jobs."
            ),
            "applied_assignment_count": len(applied_assignments),
            "seeded_review_count": len(seeded_reviews),
            "queued_job_count": int((queue_result or {}).get("queued_count", 0) or 0),
            "processed_job_count": int((process_result or {}).get("processed_count", 0) or 0),
            "queue": queue_result,
            "processed": process_result,
            "assignment_rows": applied_assignments,
            "review_rows": seeded_reviews,
            "registry": _workforce_registry_payload(session),
        }

    @app.get("/api/data-fabric")
    def data_fabric(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        return _data_fabric_payload(session)

    @app.get("/api/adoption-command")
    def adoption_command(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        return _adoption_command_payload(session)

    @app.get("/api/platform/control-plane")
    def platform_control_plane(request: Request) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        return {"status": "ready", **_control_plane_payload(session)}

    @app.get("/api/supermega-dev/control")
    def supermega_dev_control(request: Request) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        return _supermega_dev_control_payload(session)

    @app.post("/api/platform/workspace-profile")
    def platform_update_workspace_profile(request: Request, payload: WorkspaceProfileUpdateRequest) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        preferred_package = str(payload.preferred_package or "").strip()
        first_team = str(payload.first_team or "").strip()
        systems = _unique_values([str(item).strip() for item in (payload.systems or []) if str(item).strip()])
        goal = str(payload.goal or "").strip()
        profile = enterprise_update_workspace_profile(
            enterprise_db_url,
            workspace_id=workspace_id,
            company=payload.company or None,
            preferred_package=preferred_package or None,
            first_team=first_team or None,
            systems=systems if payload.systems is not None else None,
            goal=goal or None,
            onboarding_status=payload.onboarding_status.strip() or _derive_onboarding_status(
                preferred_package=preferred_package,
                first_team=first_team,
                systems=systems,
                goal=goal,
            ),
            config=payload.config or {},
        )
        if not profile:
            raise HTTPException(status_code=500, detail="Workspace profile could not be updated.")
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=workspace_id,
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="workspace.profile_updated",
            entity_type="workspace_profile",
            entity_id=workspace_id,
            summary="Updated workspace rollout profile.",
            detail="Workspace onboarding context was saved into the control plane.",
            payload=profile,
        )
        return {
            "status": "ready",
            "profile": profile,
            "control_plane": _control_plane_payload(session),
        }

    @app.post("/api/platform/modules/{module_id}")
    def platform_update_module(module_id: str, request: Request, payload: WorkspaceModuleUpdateRequest) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        row = enterprise_update_workspace_module(
            enterprise_db_url,
            workspace_id=workspace_id,
            module_id=module_id,
            status=payload.status,
            source="platform_admin",
            config=payload.config,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Module not found.")
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=workspace_id,
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="module.status_updated",
            entity_type="module",
            entity_id=str(module_id).strip(),
            summary=f"Module {str(row.get('name', module_id)).strip()} set to {str(row.get('workspace_status', '')).strip() or payload.status}.",
            detail="Platform admin changed the workspace module status.",
            payload={
                "module_id": str(row.get("module_id", module_id)).strip(),
                "workspace_status": str(row.get("workspace_status", payload.status)).strip(),
                "config": row.get("config", {}),
            },
        )
        return {
            "status": "ready",
            "row": row,
            "control_plane": _control_plane_payload(session),
        }

    @app.post("/api/platform/domains/verify-all")
    def platform_verify_all_domains(request: Request, payload: WorkspaceDomainVerifyRequest) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        rows = enterprise_list_workspace_domains(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        verified_rows = [item for item in (_verify_domain_row(session, row, payload.routes or None) for row in rows) if item]
        return {
            "status": "ready",
            "verified_count": len(verified_rows),
            "rows": verified_rows,
            "control_plane": _control_plane_payload(session),
            "cloud_control": _cloud_control_payload(session),
        }

    @app.post("/api/platform/domains/{domain_id}")
    def platform_update_domain(domain_id: str, request: Request, payload: WorkspaceDomainUpdateRequest) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        existing_rows = enterprise_list_workspace_domains(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        existing_row = next((row for row in existing_rows if str(row.get("domain_id", "")).strip() == str(domain_id).strip()), None)
        existing_config = dict(existing_row.get("config", {}) if isinstance(existing_row, dict) and isinstance(existing_row.get("config"), dict) else {})
        merged_config = {**existing_config, **(payload.config or {})}
        row = enterprise_update_workspace_domain(
            enterprise_db_url,
            workspace_id=workspace_id,
            domain_id=domain_id,
            hostname=payload.hostname or None,
            scope=payload.scope or None,
            provider=payload.provider or None,
            runtime_target=payload.runtime_target or None,
            desired_state=payload.desired_state or None,
            route_root=payload.route_root or None,
            notes=payload.notes if payload.notes is not None else None,
            deployment_url=payload.deployment_url if payload.deployment_url is not None else None,
            config=merged_config,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Domain not found.")
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=workspace_id,
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="domain.updated",
            entity_type="domain",
            entity_id=str(domain_id).strip(),
            summary=f"Updated domain {str(row.get('hostname', '')).strip() or domain_id}.",
            detail="Platform admin changed workspace domain posture.",
            payload=row,
        )
        return {
            "status": "ready",
            "row": row,
            "control_plane": _control_plane_payload(session),
            "cloud_control": _cloud_control_payload(session),
        }

    @app.post("/api/platform/domains/{domain_id}/verify")
    def platform_verify_domain(domain_id: str, request: Request, payload: WorkspaceDomainVerifyRequest) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        rows = enterprise_list_workspace_domains(
            enterprise_db_url,
            workspace_id=workspace_id,
        )
        row = next((item for item in rows if str(item.get("domain_id", "")).strip() == str(domain_id).strip()), None)
        if not row:
            raise HTTPException(status_code=404, detail="Domain not found.")
        updated = _verify_domain_row(session, row, payload.routes or None)
        if not updated:
            raise HTTPException(status_code=500, detail="Domain verification failed.")
        return {
            "status": "ready",
            "row": updated,
            "control_plane": _control_plane_payload(session),
            "cloud_control": _cloud_control_payload(session),
        }

    @app.post("/api/cloud/deployments/preview")
    def cloud_preview_deploy(request: Request, payload: CloudPreviewDeployRequest) -> dict[str, Any]:
        session = _require_cloud_control_manage_access(request)
        deploy_result = _run_preview_deploy(payload.mode)
        _record_workspace_deployment(session, deploy_result, production=False)
        return {
            "status": "ready",
            "result": deploy_result,
            "cloud_control": _cloud_control_payload(session),
        }

    @app.post("/api/cloud/deployments/production")
    def cloud_production_deploy(request: Request, payload: CloudPreviewDeployRequest) -> dict[str, Any]:
        session = _require_cloud_control_manage_access(request)
        deploy_result = _run_production_deploy()
        _record_workspace_deployment(session, deploy_result, production=True)
        return {
            "status": "ready",
            "result": deploy_result,
            "cloud_control": _cloud_control_payload(session),
        }

    @app.get("/api/actions")
    def actions(request: Request, lane: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        items = list_actions(state_db, lane=lane, status=status, limit=limit)
        return {"status": "ready", "count": len(items), "items": items}

    @app.get("/api/insights")
    def insights(request: Request) -> dict[str, Any]:
        session = _require_session(request)
        return {"status": "ready", **_insights_payload(session)}

    @app.get("/api/meta/workspace")
    def meta_workspace(
        request: Request,
        exception_limit: int = 8,
        agent_run_limit: int = 8,
        approval_limit: int = 6,
    ) -> dict[str, Any]:
        session = _require_capability_access(
            request,
            capabilities={"actions.view"},
            detail="Meta workspace access required.",
        )
        limited_meta_view = not _session_has_any_capability(
            session,
            {"director.view", "agent_ops.view", "architect.view", "tenant_admin.view", "platform_admin.view"},
        )
        summary_payload = _summary_payload(session)
        workspace_id = str(session.get("workspace_id", "")).strip()
        workspace_task_rows = enterprise_list_workspace_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=12,
        )
        approval_rows = list_approval_entries(state_db, limit=approval_limit)

        if limited_meta_view:
            runtime_payload: dict[str, Any] = {}
            insights_payload: dict[str, Any] = {}
            expected_tenant_key = _agent_workspace_resource_key(session)
            tenant_state = {
                "status": "limited",
                "blocked": False,
                "expected_tenant_key": expected_tenant_key,
                "workspace_slug": str(session.get("workspace_slug", "")).strip(),
                "workspace_name": str(session.get("workspace_name", "")).strip(),
                "detail": "Limited meta view keeps the manager-facing workspace faster and simpler.",
            }
            agent_run_rows: list[dict[str, Any]] = []
            latest_by_type: dict[str, dict[str, Any]] = {}
            exception_payload = {"summary": {"total_items": 0}, "rows": []}
            team_rows: list[dict[str, Any]] = []
            agent_manifest: dict[str, Any] = {}
            latest_rollout = None
            agent_team_snapshot: dict[str, Any] = {}
            agent_team_rows: list[dict[str, Any]] = []
            agent_team_summary = {
                "team_count": 0,
                "shared_core_team_count": 0,
                "client_pod_team_count": 0,
                "autonomy_score": 0,
                "autonomy_level": "limited",
                "manifest_version": "",
                "manifest_tool_count": 0,
                "manifest_playbook_count": 0,
            }
        else:
            runtime_payload = _runtime_control_payload(session)
            insights_payload = _insights_payload(session)
            tenant_state = _tenant_state_payload(session)
            agent_run_rows = enterprise_list_agent_runs(
                enterprise_db_url,
                workspace_id=workspace_id,
                limit=agent_run_limit,
            )
            latest_by_type = _group_agent_runs_by_job_type(agent_run_rows)
            exception_payload = _exception_queue_payload(limit=exception_limit)
            team_rows = enterprise_list_workspace_members(
                enterprise_db_url,
                workspace_id=workspace_id,
            )
            expected_tenant_key = str(tenant_state.get("expected_tenant_key", "")).strip() or "default"
            agent_manifest = _load_expected_agent_manifest(expected_tenant_key)
            latest_rollout = _load_workspace_rollout_snapshot(workspace_id)
            agent_team_snapshot = (
                {}
                if bool(tenant_state.get("blocked"))
                else load_agent_team_system_snapshot(state_db, tenant_key=expected_tenant_key)
            )
            agent_team_rows = [] if bool(tenant_state.get("blocked")) else list_agent_teams(state_db, tenant_key=expected_tenant_key)
            agent_team_summary = (
                {
                    "team_count": 0,
                    "shared_core_team_count": 0,
                    "client_pod_team_count": 0,
                    "autonomy_score": 0,
                    "autonomy_level": "blocked",
                }
                if bool(tenant_state.get("blocked"))
                else load_agent_team_summary(state_db, tenant_key=expected_tenant_key)
            )
            if agent_manifest:
                agent_team_summary = {
                    **agent_team_summary,
                    "manifest_version": str(agent_manifest.get("version", "")).strip(),
                    "manifest_tool_count": len(agent_manifest.get("tools", [])),
                    "manifest_playbook_count": len(agent_manifest.get("playbooks", [])),
                }
        agent_runtime_viewer = {
            "role": str(session.get("role", "")).strip(),
            "display_name": str(session.get("display_name", "")).strip(),
            "capabilities": sorted(_role_capabilities(str(session.get("role", "")))),
            "can_run_jobs": _session_has_any_capability(session, {"agent_ops.view", "tenant_admin.view", "platform_admin.view"}),
            "can_manage_runtime": _session_has_any_capability(session, {"tenant_admin.view", "platform_admin.view"}),
            "can_approve_guardrails": _session_has_any_capability(
                session,
                {"architect.view", "director.view", "tenant_admin.view", "platform_admin.view"},
            ),
        }
        agent_runtime_contract = _build_agent_runtime_contract(
            manifest=agent_manifest,
            teams=agent_team_rows,
            latest_runs_by_type=latest_by_type,
            viewer_contract=agent_runtime_viewer,
        )

        return {
            "status": "ready",
            "summary": summary_payload,
            "runtime_control": runtime_payload,
            "insights": insights_payload,
            "agent_teams": {
                "status": "blocked" if bool(tenant_state.get("blocked")) else "ready",
                "tenant_state": tenant_state,
                "summary": agent_team_summary,
                "teams": agent_team_rows,
                "manifest": agent_manifest,
                "gaps": agent_team_snapshot.get("gaps", []) if isinstance(agent_team_snapshot, dict) else [],
                "scaling_model": agent_team_snapshot.get("scaling_model", {}) if isinstance(agent_team_snapshot, dict) else {},
                "next_moves": (
                    [str(tenant_state.get("detail", "")).strip()]
                    if bool(tenant_state.get("blocked"))
                    else agent_team_snapshot.get("next_moves", []) if isinstance(agent_team_snapshot, dict) else []
                ),
                "runtime_contract": agent_runtime_contract,
            },
            "agent_runs": {
                "count": len(agent_run_rows),
                "rows": agent_run_rows,
                "jobs": [
                    {
                        **template,
                        "last_run": latest_by_type.get(template["job_type"], {}),
                    }
                    for template in AGENT_JOB_TEMPLATES
                ],
            },
            "team_members": {
                "count": len(team_rows),
                "rows": team_rows,
            },
            "workspace_tasks": {
                "count": len(workspace_task_rows),
                "rows": workspace_task_rows,
            },
            "latest_rollout": latest_rollout if isinstance(latest_rollout, dict) else None,
            "approval_queue": {
                "count": len(approval_rows),
                "summary": load_approval_summary(state_db),
                "rows": approval_rows,
            },
            "exceptions": exception_payload,
            "attention": _meta_attention_payload(
                summary_payload=summary_payload,
                runtime_payload=runtime_payload,
                agent_run_rows=agent_run_rows,
                exception_rows=exception_payload.get("rows", []),
            ),
        }

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
        session = _require_agent_ops_control_access(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        job_type = str(request.job_type or "").strip().lower()
        if job_type not in {item["job_type"] for item in AGENT_JOB_TEMPLATES}:
            raise HTTPException(status_code=400, detail=f"Unsupported job type: {request.job_type}")

        triggered_by = str(session.get("display_name", session.get("username", "system")))
        if request.enqueue_only:
            row = enterprise_create_agent_run(
                enterprise_db_url,
                workspace_id=workspace_id,
                job_type=job_type,
                source=str(request.source or "").strip() or "manual",
                payload=request.payload,
                idempotency_key=str(request.idempotency_key or "").strip() or None,
                max_attempts=int(request.max_attempts or 1),
                triggered_by=triggered_by,
                related_entity_type=str(request.related_entity_type or "").strip(),
                related_entity_id=str(request.related_entity_id or "").strip(),
            )
            payload = _agent_jobs_payload(
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                rows=[row],
                extra={"mode": "queued", "queued_count": 1},
            )
            payload["row"] = row
            return payload
        final_row = _run_and_persist_agent_job(
            state_db=state_db,
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            triggered_by=triggered_by,
            job_type=job_type,
            source=str(request.source or "").strip() or "manual",
            payload=request.payload,
            idempotency_key=str(request.idempotency_key or "").strip() or None,
            related_entity_type=str(request.related_entity_type or "").strip(),
            related_entity_id=str(request.related_entity_id or "").strip(),
        )
        if str((final_row or {}).get("status", "")).strip() == "error":
            raise HTTPException(
                status_code=500,
                detail=f"Agent run failed: {str((final_row or {}).get('error_text', '')).strip() or job_type}",
            )
        payload = _agent_jobs_payload(enterprise_db_url=enterprise_db_url, workspace_id=workspace_id, rows=[final_row])
        payload["row"] = final_row
        return payload

    @app.post("/api/agent-runs/process-queue")
    def process_agent_run_queue(request_http: Request, request: AgentQueueProcessRequest) -> dict[str, Any]:
        session = _require_agent_ops_control_access(request_http)
        return _process_agent_run_queue(
            workspace_id=str(session.get("workspace_id", "")).strip(),
            source=str(request.source or "").strip() or "manual_worker",
            job_types=request.job_types,
            limit=int(request.limit or 8),
        )

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
        normalized_source = str(request.source or "").strip() or "scheduler"
        payload = (
            _enqueue_agent_job_batch(
                workspace_id=workspace_id,
                triggered_by=actor,
                source=normalized_source,
                job_types=request.job_types,
            )
            if request.enqueue_only
            else _run_agent_job_batch(
                workspace_id=workspace_id,
                triggered_by=actor,
                source=normalized_source,
                job_types=request.job_types,
            )
        )
        return {
            **payload,
            "workspace_slug": workspace_slug,
        }

    @app.post("/api/agent-runs/run-defaults")
    def run_default_agent_runs(request_http: Request, request: AgentBatchRunRequest) -> dict[str, Any]:
        session = _require_agent_ops_control_access(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        triggered_by = str(session.get("display_name", session.get("username", "system")))
        normalized_source = str(request.source or "").strip() or "manual_batch"
        return (
            _enqueue_agent_job_batch(
                workspace_id=workspace_id,
                triggered_by=triggered_by,
                source=normalized_source,
                job_types=request.job_types,
            )
            if request.enqueue_only
            else _run_agent_job_batch(
                workspace_id=workspace_id,
                triggered_by=triggered_by,
                source=normalized_source,
                job_types=request.job_types,
            )
        )

    @app.post("/api/internal/agent-runs/run-defaults")
    def run_internal_default_agent_runs(request_http: Request, request: AgentBatchRunRequest) -> dict[str, Any]:
        _require_internal_cron_token(request_http)
        normalized_source = str(request.source or "").strip() or "scheduler"
        return (
            _enqueue_agent_job_batch(
                workspace_id=default_workspace_id,
                triggered_by="cloud_scheduler",
                source=normalized_source,
                job_types=request.job_types,
            )
            if request.enqueue_only
            else _run_agent_job_batch(
                workspace_id=default_workspace_id,
                triggered_by="cloud_scheduler",
                source=normalized_source,
                job_types=request.job_types,
            )
        )

    @app.post("/api/internal/agent-runs/enqueue-defaults")
    def enqueue_internal_default_agent_runs(request_http: Request, request: AgentBatchRunRequest) -> dict[str, Any]:
        _require_internal_cron_token(request_http)
        return _enqueue_agent_job_batch(
            workspace_id=default_workspace_id,
            triggered_by="cloud_scheduler",
            source=str(request.source or "").strip() or "scheduler",
            job_types=request.job_types,
        )

    @app.post("/api/internal/agent-runs/process-queue")
    def process_internal_agent_run_queue(request_http: Request, request: AgentQueueProcessRequest) -> dict[str, Any]:
        _require_internal_cron_token(request_http)
        return _process_agent_run_queue(
            workspace_id=default_workspace_id,
            source=str(request.source or "").strip() or "worker",
            job_types=request.job_types,
            limit=int(request.limit or 8),
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
        workspace_id = str(session.get("workspace_id", "")).strip()
        actor = str(session.get("display_name", session.get("username", "system"))).strip() or "system"
        result = enterprise_add_workspace_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            rows=[row.model_dump() for row in request.rows],
        )
        saved_task_ids = {str(item).strip() for item in result.get("saved_task_ids", []) if str(item).strip()}
        saved_rows = [
            row
            for row in result.get("tasks", [])
            if isinstance(row, dict) and str(row.get("task_id", "")).strip() in saved_task_ids
        ]
        for row in saved_rows:
            template = str(row.get("template", "")).strip() or "manual"
            connector_id = template.split(":", 1)[1].strip() if template.startswith("connector_review:") else ""
            _record_audit_and_connector_event(
                enterprise_db_url=enterprise_db_url,
                workspace_id=workspace_id,
                actor=actor,
                event_type="workspace_task.created",
                entity_type="workspace_task",
                entity_id=str(row.get("task_id", "")).strip(),
                summary=f"Created task {str(row.get('title', 'Workspace task')).strip()}.",
                detail=str(row.get("notes", "")).strip(),
                connector_id=connector_id or "ytf-shopfloor-entry",
                source="Connector review task" if connector_id else "Manager tasking",
                kind="connector_review" if connector_id else "task",
                route="/app/connectors" if connector_id else "/app/adoption-command",
                payload={
                    "template": template,
                    "owner": str(row.get("owner", "")).strip(),
                    "priority": str(row.get("priority", "")).strip(),
                    "status": str(row.get("status", "")).strip(),
                },
                connector_title=str(row.get("title", "")).strip() or "Workspace task",
            )
        return result

    @app.post("/api/workspace-tasks/{task_id}")
    def update_workspace_tasks(task_id: str, request_http: Request, request: WorkspaceTaskUpdateRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        workspace_id = str(session.get("workspace_id", "")).strip()
        actor = str(session.get("display_name", session.get("username", "system"))).strip() or "system"
        row = enterprise_update_workspace_task(
            enterprise_db_url,
            workspace_id=workspace_id,
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
        template = str(row.get("template", "")).strip()
        connector_id = template.split(":", 1)[1].strip() if template.startswith("connector_review:") else ""
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=workspace_id,
            actor=actor,
            event_type="workspace_task.updated",
            entity_type="workspace_task",
            entity_id=str(task_id).strip(),
            summary=f"Updated task {str(row.get('title', task_id)).strip() or task_id}.",
            detail=f"Status {str(row.get('status', '')).strip() or 'open'} / owner {str(row.get('owner', '')).strip() or 'unassigned'}.",
            connector_id=connector_id or "ytf-shopfloor-entry",
            source="Connector review task" if connector_id else "Manager tasking",
            kind="connector_review" if connector_id else "task",
            route="/app/connectors" if connector_id else "/app/adoption-command",
            payload={
                "template": template,
                "status": str(row.get("status", "")).strip(),
                "owner": str(row.get("owner", "")).strip(),
            },
            connector_title=str(row.get("title", "")).strip() or "Workspace task",
        )
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
    def tool_solution_architect(request_http: Request, request: SolutionArchitectRequest) -> dict[str, Any]:
        _require_solution_architect_access(request_http)
        return {"status": "ready", "blueprint": build_solution_blueprint(request.model_dump())}

    def _build_solution_architect_launch_tasks(
        *,
        company_name: str,
        request_payload: dict[str, Any],
        blueprint: dict[str, Any],
        rollout_id: str,
        workspace_snapshot_key: str,
    ) -> list[dict[str, Any]]:
        module_names = [
            str(item.get("name", "")).strip()
            for item in blueprint.get("recommended_modules", [])
            if isinstance(item, dict) and str(item.get("name", "")).strip()
        ]
        implementation_order = [
            str(item).strip()
            for item in blueprint.get("implementation_order", [])
            if str(item).strip()
        ]
        data_sources = [str(item).strip() for item in request_payload.get("data_sources", []) if str(item).strip()]
        current_tools = [str(item).strip() for item in request_payload.get("current_tools", []) if str(item).strip()]
        wedge_product = str(blueprint.get("wedge_product", "")).strip() or "Action OS"
        primary_pack = str(blueprint.get("primary_pack", "")).strip() or "starter pack"
        flagship = str(blueprint.get("flagship", "")).strip() or "SuperMega OS"
        first_deep_module = implementation_order[1] if len(implementation_order) > 1 else wedge_product
        rollout_focus = ", ".join(module_names[:4]) or wedge_product
        source_map = ", ".join(data_sources[:4]) or "manual entry"
        tool_map = ", ".join(current_tools[:4]) or "current team tools"
        rollout_note_prefix = f"[rollout_id:{rollout_id}] [rollout_snapshot:{workspace_snapshot_key}]"
        rollout_task_ref = f"rollout:{rollout_id}"

        return [
            {
                "lead_id": rollout_task_ref,
                "title": f"Confirm {company_name} role model and owner map",
                "owner": "Implementation Lead",
                "priority": "high",
                "due": "This week",
                "status": "open",
                "template": "tenant_launch_roles",
                "notes": (
                    f"{rollout_note_prefix} Validate the rollout around {primary_pack}. Confirm CEO, admin, sales, operations, quality, and maintenance ownership before enabling automations."
                ),
            },
            {
                "lead_id": rollout_task_ref,
                "title": f"Connect first data sources for {company_name}",
                "owner": "Platform Engineering",
                "priority": "high",
                "due": "This week",
                "status": "open",
                "template": "tenant_launch_connectors",
                "notes": f"{rollout_note_prefix} Map source systems and access boundaries for {source_map}. Current tools to replace or wrap: {tool_map}.",
            },
            {
                "lead_id": rollout_task_ref,
                "title": f"Launch {wedge_product} for {company_name}",
                "owner": "Client Onboarding Pod",
                "priority": "high",
                "due": "Week 1",
                "status": "open",
                "template": "tenant_launch_wedge",
                "notes": f"{rollout_note_prefix} Stand up the first live workflow and prove the working surface before deeper ERP or AI rollout. Focus modules: {rollout_focus}.",
            },
            {
                "lead_id": rollout_task_ref,
                "title": f"Prepare {first_deep_module} rollout lane",
                "owner": "Client Operations Pod",
                "priority": "medium",
                "due": "Week 2",
                "status": "open",
                "template": "tenant_launch_module",
                "notes": f"{rollout_note_prefix} Build the next control module after the wedge stabilizes. The recommended flagship for this tenant is {flagship}.",
            },
            {
                "lead_id": rollout_task_ref,
                "title": f"Set approval and security boundaries for {company_name}",
                "owner": "Platform Admin",
                "priority": "high",
                "due": "Week 2",
                "status": "open",
                "template": "tenant_launch_security",
                "notes": f"{rollout_note_prefix} Define approval gates, sensitive writes, connector scopes, and operator-visible queues before agent writes move deeper into the workflow.",
            },
            {
                "lead_id": rollout_task_ref,
                "title": f"Start agent review rhythm for {company_name}",
                "owner": "Agent Ops",
                "priority": "medium",
                "due": "Week 3",
                "status": "open",
                "template": "tenant_launch_agents",
                "notes": f"{rollout_note_prefix} Run daily brief, task triage, and rollout review loops after the first working modules and role boundaries are trusted.",
            },
        ]

    def _solution_architect_snapshot_keys(workspace_id: str) -> tuple[str, str]:
        normalized_workspace_id = re.sub(r"[^a-z0-9_-]+", "-", str(workspace_id or "").strip().lower()).strip("-")
        workspace_key = (
            f"solution_architect_launch__{normalized_workspace_id}" if normalized_workspace_id else "solution_architect_launch__default"
        )
        return "solution_architect_launch_latest", workspace_key

    def _load_workspace_rollout_snapshot(workspace_id: str) -> dict[str, Any] | None:
        _, workspace_snapshot_key = _solution_architect_snapshot_keys(workspace_id)
        payload = load_snapshot(state_db, workspace_snapshot_key)
        if not isinstance(payload, dict):
            return None
        return _enrich_rollout_snapshot(payload, workspace_id=workspace_id)

    def _build_rollout_id(workspace_id: str, generated_at: str) -> str:
        seed = f"{str(workspace_id or '').strip()}:{str(generated_at or '').strip()}"
        digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:10].upper()
        return f"ROLL-{digest}"

    def _extract_rollout_note_markers(notes: str) -> dict[str, str]:
        text = str(notes or "").strip()
        markers: dict[str, str] = {}
        for key in ("rollout_id", "rollout_snapshot"):
            match = re.search(rf"\[{key}:([^\]]+)\]", text)
            if match:
                markers[key] = str(match.group(1)).strip()
        return markers

    def _snapshot_workspace_id(payload: Any) -> str:
        if not isinstance(payload, dict):
            return ""
        workspace = payload.get("workspace")
        if not isinstance(workspace, dict):
            return ""
        return str(workspace.get("workspace_id", "")).strip()

    def _snapshot_capability_requirements(snapshot_key: str) -> set[str]:
        normalized_key = str(snapshot_key or "").strip().lower()
        if normalized_key.startswith("solution_architect_launch"):
            return {"architect.view", "tenant_admin.view", "platform_admin.view"}
        if normalized_key in {"agent_team_system", "solution_portfolio_manifest", "platform_digest", "product_lab"}:
            return {"agent_ops.view", "architect.view", "director.view", "tenant_admin.view", "platform_admin.view"}
        return set()

    def _enforce_snapshot_access(session: dict[str, Any], snapshot_key: str, payload: Any) -> None:
        required_capabilities = _snapshot_capability_requirements(snapshot_key)
        if required_capabilities and not _session_has_any_capability(session, required_capabilities):
            raise HTTPException(status_code=403, detail="Snapshot access required.")
        payload_workspace_id = _snapshot_workspace_id(payload)
        if not payload_workspace_id:
            return
        session_workspace_id = str(session.get("workspace_id", "")).strip()
        if payload_workspace_id != session_workspace_id:
            raise HTTPException(status_code=404, detail=f"Snapshot not found: {snapshot_key}")

    def _enrich_rollout_snapshot(payload: dict[str, Any], *, workspace_id: str) -> dict[str, Any]:
        enriched = dict(payload)
        task_summary = dict(enriched.get("task_summary", {})) if isinstance(enriched.get("task_summary"), dict) else {}
        rollout_pack = dict(enriched.get("rollout_pack", {})) if isinstance(enriched.get("rollout_pack"), dict) else {}
        saved_task_ids = {
            str(item).strip()
            for item in task_summary.get("saved_task_ids", [])
            if str(item).strip()
        }
        rollout_id = str(enriched.get("rollout_id", "")).strip() or str(rollout_pack.get("rollout_id", "")).strip()
        workspace_rows = enterprise_list_workspace_tasks(
            enterprise_db_url,
            workspace_id=workspace_id,
            limit=200,
        )
        matched_rows: list[dict[str, Any]] = []
        for row in workspace_rows:
            row_task_id = str(row.get("task_id", "")).strip()
            if row_task_id and row_task_id in saved_task_ids:
                matched_rows.append(row)
                continue
            markers = _extract_rollout_note_markers(str(row.get("notes", "")))
            if rollout_id and str(markers.get("rollout_id", "")).strip() == rollout_id:
                matched_rows.append(row)
        unique_rows: list[dict[str, Any]] = []
        seen_task_ids: set[str] = set()
        for row in matched_rows:
            task_id = str(row.get("task_id", "")).strip()
            if task_id and task_id in seen_task_ids:
                continue
            if task_id:
                seen_task_ids.add(task_id)
            unique_rows.append(row)
        open_count = sum(1 for row in unique_rows if str(row.get("status", "")).strip().lower() != "done")
        done_count = sum(1 for row in unique_rows if str(row.get("status", "")).strip().lower() == "done")
        task_summary["saved_task_ids"] = [str(item.get("task_id", "")).strip() for item in unique_rows if str(item.get("task_id", "")).strip()]
        task_summary["saved_count"] = int(task_summary.get("saved_count", 0) or 0)
        task_summary["live_total_count"] = len(unique_rows)
        task_summary["live_open_count"] = open_count
        task_summary["live_done_count"] = done_count
        task_summary["rows"] = unique_rows
        rollout_pack["rollout_id"] = rollout_id
        enriched["rollout_id"] = rollout_id
        enriched["task_summary"] = task_summary
        enriched["rollout_pack"] = rollout_pack
        return enriched

    @app.post("/api/tools/solution-architect/launch")
    def tool_solution_architect_launch(request_http: Request, request: SolutionArchitectLaunchRequest) -> dict[str, Any]:
        session = _require_solution_architect_access(request_http)
        request_payload = request.model_dump(exclude={"create_tasks"})
        blueprint = build_solution_blueprint(request_payload)
        workspace_id = str(session.get("workspace_id", "")).strip()
        workspace_slug = str(session.get("workspace_slug", "")).strip()
        workspace_name = str(session.get("workspace_name", "")).strip()
        company_name = str(blueprint.get("company_name", "")).strip() or str(request.company_name).strip() or workspace_name or "New Client"
        latest_snapshot_key, workspace_snapshot_key = _solution_architect_snapshot_keys(workspace_id)
        generated_at = datetime.now().astimezone().isoformat()
        rollout_id = _build_rollout_id(workspace_id, generated_at)
        task_rows = _build_solution_architect_launch_tasks(
            company_name=company_name,
            request_payload=request_payload,
            blueprint=blueprint,
            rollout_id=rollout_id,
            workspace_snapshot_key=workspace_snapshot_key,
        )
        task_result = (
            enterprise_add_workspace_tasks(
                enterprise_db_url,
                workspace_id=workspace_id,
                rows=task_rows,
            )
            if request.create_tasks
            else {"status": "ready", "saved_count": 0, "saved_task_ids": [], "rows": []}
        )
        snapshot_payload = {
            "generated_at": generated_at,
            "rollout_id": rollout_id,
            "workspace_snapshot_key": workspace_snapshot_key,
            "workspace": {
                "workspace_id": workspace_id,
                "workspace_slug": workspace_slug,
                "workspace_name": workspace_name,
            },
            "request": request_payload,
            "blueprint": blueprint,
            "task_summary": {
                "saved_count": int(task_result.get("saved_count", 0) or 0),
                "saved_task_ids": task_result.get("saved_task_ids", []) if isinstance(task_result.get("saved_task_ids", []), list) else [],
            },
            "rollout_pack": {
                "rollout_id": rollout_id,
                "company_name": company_name,
                "primary_pack": str(blueprint.get("primary_pack", "")).strip(),
                "wedge_product": str(blueprint.get("wedge_product", "")).strip(),
                "flagship": str(blueprint.get("flagship", "")).strip(),
                "recommended_modules": [
                    str(item.get("name", "")).strip()
                    for item in blueprint.get("recommended_modules", [])
                    if isinstance(item, dict) and str(item.get("name", "")).strip()
                ],
                "implementation_order": [
                    str(item).strip() for item in blueprint.get("implementation_order", []) if str(item).strip()
                ],
                "first_30_days": [str(item).strip() for item in blueprint.get("first_30_days", []) if str(item).strip()],
                "agent_teams": [
                    str(item.get("name", "")).strip()
                    for item in blueprint.get("agent_teams", [])
                    if isinstance(item, dict) and str(item.get("name", "")).strip()
                ],
            },
        }
        enriched_snapshot_payload = _enrich_rollout_snapshot(snapshot_payload, workspace_id=workspace_id)
        upsert_snapshot(state_db, latest_snapshot_key, enriched_snapshot_payload)
        upsert_snapshot(state_db, workspace_snapshot_key, enriched_snapshot_payload)
        saved_count = int(task_result.get("saved_count", 0) or 0)
        return {
            "status": "ready",
            "message": f"Saved {company_name} rollout pack and queued {saved_count} workspace task{'s' if saved_count != 1 else ''}.",
            "snapshot_key": latest_snapshot_key,
            "workspace_snapshot_key": workspace_snapshot_key,
            "blueprint": blueprint,
            "tasks": task_result,
            "payload": enriched_snapshot_payload,
        }

    @app.get("/api/rollouts/latest")
    def latest_rollout(request: Request) -> dict[str, Any]:
        session = _require_rollout_access(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        _, workspace_snapshot_key = _solution_architect_snapshot_keys(workspace_id)
        payload = _load_workspace_rollout_snapshot(workspace_id)
        if not payload:
            raise HTTPException(status_code=404, detail="No rollout saved for this workspace.")
        return {"status": "ready", "snapshot_key": workspace_snapshot_key, "payload": payload}

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
        session = _require_session(request_http)
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
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="metric.record_created",
            entity_type="metric",
            entity_id=str(row.get("metric_id", "")).strip(),
            summary=f"Recorded metric {str(row.get('metric_name', '')).strip() or 'metric'}.",
            detail=f"{str(row.get('metric_group', '')).strip() or 'Metric'} / {str(row.get('period_label', '')).strip() or 'current period'}.",
            connector_id="ytf-shopfloor-entry",
            source="Metric intake",
            kind="metric",
            route="/app/insights",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
            },
            connector_title=str(row.get("metric_name", "")).strip() or "Metric refresh",
        )
        return {"status": "ready", "message": f"Metric saved for {row['metric_name']}.", "row": row, "rows": list_metric_entries(state_db, limit=100), "summary": load_metric_summary(state_db)}

    @app.post("/api/metrics/records/bulk")
    def create_metric_records_bulk(request_http: Request, request: MetricBulkSaveRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        rows = [row.model_dump() for row in request.rows]
        result = add_metric_entries(state_db, rows=rows, source_mode="metric_intake_review")
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="metric.records_bulk_saved",
            entity_type="metric",
            entity_id=f"bulk:{len(rows)}",
            summary=f"Saved {len(rows)} metric row{'s' if len(rows) != 1 else ''}.",
            detail="Bulk metric intake review promoted metrics into the tenant state.",
            connector_id="ytf-shopfloor-entry",
            source="Metric intake",
            kind="metric_bulk",
            route="/app/insights",
            payload={
                "row_count": len(rows),
            },
            connector_title=f"{len(rows)} metrics promoted",
        )
        return result

    @app.get("/api/product-feedback")
    def product_feedback(
        request: Request,
        source: str | None = None,
        surface: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        _require_session(request)
        rows = list_product_feedback(state_db, source=source, surface=surface, status=status, limit=limit)
        return {"status": "ready", "summary": load_product_feedback_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/product-feedback")
    def create_product_feedback(request_http: Request, request: ProductFeedbackRequest) -> dict[str, Any]:
        _require_session(request_http)
        row = add_product_feedback(
            state_db,
            source=request.source.strip(),
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
        session = _require_session(request_http)
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
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="decision.entry_created",
            entity_type="decision",
            entity_id=str(row.get("decision_id", "")).strip(),
            summary=f"Captured decision {str(row.get('title', '')).strip() or 'decision'}.",
            detail=str(row.get("decision_text", "")).strip() or str(row.get("context", "")).strip(),
            connector_id="ytf-markdown-vault",
            source="Decision journal",
            kind="decision",
            route=str(row.get("related_route", "")).strip() or "/app/director",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
            },
            connector_title=str(row.get("title", "")).strip() or "Decision update",
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
        session = _require_session(request_http)
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
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="approval.entry_created",
            entity_type="approval",
            entity_id=str(row.get("approval_id", "")).strip(),
            summary=f"Created approval {str(row.get('title', '')).strip() or 'request'}.",
            detail=str(row.get("summary", "")).strip() or f"Gate {str(row.get('approval_gate', '')).strip() or 'general'}.",
            connector_id="ytf-procurement-gmail",
            source="Approval queue",
            kind="approval",
            route=str(row.get("related_route", "")).strip() or "/app/approvals",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
                "approval_gate": str(row.get("approval_gate", "")).strip(),
            },
            connector_title=str(row.get("title", "")).strip() or "Approval review",
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
        session = _require_session(request_http)
        row = update_approval_entry(
            state_db,
            approval_id=approval_id,
            status=(request.status or "").strip() or None,
            owner=(request.owner or "").strip() or None,
            note=(request.note or "").strip() or None,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Approval not found.")
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="approval.status_updated",
            entity_type="approval",
            entity_id=str(approval_id).strip(),
            summary=f"Approval {str(row.get('title', approval_id)).strip() or approval_id} set to {str(row.get('status', '')).strip() or 'updated'}.",
            detail=str(request.note or "").strip(),
            connector_id="ytf-procurement-gmail",
            source="Approval queue",
            kind="approval_status",
            route=str(row.get("related_route", "")).strip() or "/app/approvals",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
            },
            connector_title=str(row.get("title", "")).strip() or "Approval update",
        )
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

    @app.post("/api/quality/incidents")
    def create_quality_incident(request_http: Request, request: QualityIncidentRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = add_quality_incident(
            state_db,
            status=request.status.strip(),
            severity=request.severity.strip(),
            owner=request.owner.strip(),
            supplier=request.supplier.strip(),
            title=request.title.strip(),
            summary=request.summary.strip(),
            source_type=request.source_type.strip(),
            reported_at=request.reported_at.strip(),
            target_close_date=request.target_close_date.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        rows = list_quality_incidents(state_db, limit=100)
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="quality.incident_created",
            entity_type="quality_incident",
            entity_id=str(row.get("incident_id", "")).strip(),
            summary=f"Created quality incident {str(row.get('title', '')).strip() or 'incident'}.",
            detail=str(row.get("summary", "")).strip(),
            connector_id="ytf-shopfloor-entry",
            source="DQMS writeback",
            kind="quality_incident",
            route="/app/dqms",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
                "severity": str(row.get("severity", "")).strip(),
            },
            connector_title=str(row.get("title", "")).strip() or "Quality incident",
        )
        return {
            "status": "ready",
            "message": "Quality incident saved.",
            "record": row,
            "summary": load_quality_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/quality/capa")
    def quality_capa(request: Request, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_capa_actions(state_db, status=status, limit=limit)
        return {"status": "ready", "summary": load_quality_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/quality/capa")
    def create_quality_capa(request_http: Request, request: QualityCapaRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = add_capa_action(
            state_db,
            incident_id=request.incident_id.strip(),
            status=request.status.strip(),
            owner=request.owner.strip(),
            action_title=request.action_title.strip(),
            verification_criteria=request.verification_criteria.strip(),
            target_date=request.target_date.strip(),
        )
        rows = list_capa_actions(state_db, limit=100)
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="quality.capa_created",
            entity_type="quality_capa",
            entity_id=str(row.get("capa_id", "")).strip() or str(row.get("incident_id", "")).strip(),
            summary=f"Created CAPA action {str(row.get('action_title', '')).strip() or 'action'}.",
            detail=str(row.get("verification_criteria", "")).strip(),
            connector_id="ytf-shopfloor-entry",
            source="Quality CAPA",
            kind="quality_capa",
            route="/app/dqms",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
                "incident_id": str(row.get("incident_id", "")).strip(),
            },
            connector_title=str(row.get("action_title", "")).strip() or "CAPA action",
        )
        return {
            "status": "ready",
            "message": "CAPA action saved.",
            "record": row,
            "summary": load_quality_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

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
        session = _require_session(request_http)
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
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="receiving.record_created",
            entity_type="receiving_record",
            entity_id=str(row.get("receiving_id", "")).strip(),
            summary=f"Saved receiving record for {str(row.get('supplier', '')).strip() or 'supplier'}.",
            detail=f"{str(row.get('material', '')).strip() or 'Material'} / status {str(row.get('status', '')).strip() or 'open'}.",
            connector_id="ytf-shopfloor-entry",
            source="Receiving writeback",
            kind="receiving",
            route="/app/operations",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
            },
            connector_title=f"{str(row.get('supplier', '')).strip() or 'Supplier'} / {str(row.get('material', '')).strip() or 'material'}",
        )
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
        session = _require_session(request_http)
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
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="inventory.record_created",
            entity_type="inventory_record",
            entity_id=str(row.get("inventory_id", "")).strip(),
            summary=f"Saved inventory record for {str(row.get('item_name', '')).strip() or str(row.get('item_code', '')).strip() or 'item'}.",
            detail=f"{str(row.get('warehouse', '')).strip() or 'Warehouse'} / status {str(row.get('status', '')).strip() or 'open'}.",
            connector_id="ytf-erp-export",
            source="Inventory writeback",
            kind="inventory",
            route="/app/operations",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
                "warehouse": str(row.get("warehouse", "")).strip(),
            },
            connector_title=str(row.get("item_name", "")).strip() or str(row.get("item_code", "")).strip() or "Inventory update",
        )
        return {
            "status": "ready",
            "message": "Inventory record saved.",
            "record": row,
            "summary": load_inventory_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/maintenance/records")
    def maintenance_records(request: Request, issue_type: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        rows = list_maintenance_records(state_db, issue_type=issue_type, status=status, limit=limit)
        return {"status": "ready", "summary": load_maintenance_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/maintenance/records")
    def create_maintenance_record(request_http: Request, request: MaintenanceRecordRequest) -> dict[str, Any]:
        session = _require_session(request_http)
        row = add_maintenance_record(
            state_db,
            logged_at=request.logged_at.strip(),
            asset_name=request.asset_name.strip(),
            issue_type=request.issue_type.strip(),
            priority=request.priority.strip(),
            status=request.status.strip(),
            owner=request.owner.strip(),
            downtime_minutes=request.downtime_minutes.strip(),
            next_action=request.next_action.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        rows = list_maintenance_records(state_db, limit=100)
        _record_audit_and_connector_event(
            enterprise_db_url=enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="maintenance.record_created",
            entity_type="maintenance_record",
            entity_id=str(row.get("maintenance_id", "")).strip(),
            summary=f"Saved maintenance record for {str(row.get('asset_name', '')).strip() or 'asset'}.",
            detail=str(row.get("next_action", "")).strip() or f"{str(row.get('issue_type', '')).strip() or 'Issue'} / status {str(row.get('status', '')).strip() or 'open'}.",
            connector_id="ytf-shopfloor-entry",
            source="Maintenance writeback",
            kind="maintenance",
            route="/app/operations",
            payload={
                "owner": str(row.get("owner", "")).strip(),
                "status": str(row.get("status", "")).strip(),
                "priority": str(row.get("priority", "")).strip(),
            },
            connector_title=str(row.get("asset_name", "")).strip() or "Maintenance issue",
        )
        return {
            "status": "ready",
            "message": "Maintenance record saved.",
            "record": row,
            "summary": load_maintenance_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/exceptions")
    def exception_queue(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_session(request)
        return {"status": "ready", **_exception_queue_payload(limit=limit)}

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
        session = _require_agent_manifest_access(request)
        workspace_id = str(session.get("workspace_id", "")).strip()
        tenant_state = _tenant_state_payload(session)
        expected_tenant_key = str(tenant_state.get("expected_tenant_key", "")).strip() or "default"
        manifest = _load_expected_agent_manifest(expected_tenant_key)
        payload = (
            {}
            if bool(tenant_state.get("blocked"))
            else load_agent_team_system_snapshot(state_db, tenant_key=expected_tenant_key)
        )
        team_rows = [] if bool(tenant_state.get("blocked")) else list_agent_teams(state_db, tenant_key=expected_tenant_key)
        latest_runs = enterprise_list_agent_runs(enterprise_db_url, workspace_id=workspace_id, limit=50) if workspace_id else []
        latest_runs_by_type = _group_agent_runs_by_job_type(latest_runs)
        summary = (
            {
                "team_count": 0,
                "shared_core_team_count": 0,
                "client_pod_team_count": 0,
                "autonomy_score": 0,
                "autonomy_level": "blocked",
            }
            if bool(tenant_state.get("blocked"))
            else load_agent_team_summary(state_db, tenant_key=expected_tenant_key)
        )
        if manifest:
            summary = {
                **summary,
                "manifest_version": str(manifest.get("version", "")).strip(),
                "manifest_tool_count": len(manifest.get("tools", [])),
                "manifest_playbook_count": len(manifest.get("playbooks", [])),
            }
        viewer_contract = {
            "role": str(session.get("role", "")).strip(),
            "display_name": str(session.get("display_name", "")).strip(),
            "capabilities": sorted(_role_capabilities(str(session.get("role", "")))),
            "can_run_jobs": _session_has_any_capability(session, {"agent_ops.view", "tenant_admin.view", "platform_admin.view"}),
            "can_manage_runtime": _session_has_any_capability(session, {"tenant_admin.view", "platform_admin.view"}),
            "can_approve_guardrails": _session_has_any_capability(
                session,
                {"architect.view", "director.view", "tenant_admin.view", "platform_admin.view"},
            ),
        }
        return {
            "status": "blocked" if bool(tenant_state.get("blocked")) else "ready",
            "tenant_state": tenant_state,
            "summary": summary,
            "teams": team_rows,
            "manifest": manifest,
            "gaps": payload.get("gaps", []) if isinstance(payload, dict) else [],
            "scaling_model": payload.get("scaling_model", {}) if isinstance(payload, dict) else {},
            "next_moves": (
                [str(tenant_state.get("detail", "")).strip()]
                if bool(tenant_state.get("blocked"))
                else payload.get("next_moves", []) if isinstance(payload, dict) else []
            ),
            "runtime_contract": _build_agent_runtime_contract(
                manifest=manifest,
                teams=team_rows,
                latest_runs_by_type=latest_runs_by_type,
                viewer_contract=viewer_contract,
            ),
        }

    @app.get("/api/team/members")
    def team_members(request: Request) -> dict[str, Any]:
        session = _require_workspace_admin(request)
        rows = enterprise_list_workspace_members(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
        )
        return {
            "status": "ready",
            "count": len(rows),
            "rows": rows,
        }

    @app.post("/api/team/members")
    def invite_team_member(request_http: Request, request: TeamMemberInviteRequest) -> dict[str, Any]:
        session = _require_workspace_admin(request_http)
        result = enterprise_invite_workspace_member(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            email=request.email,
            display_name=request.name,
            role=request.role,
            password=request.password,
        )
        if result.get("status") != "ready":
            raise HTTPException(status_code=400, detail="Could not add this team member.")
        rows = enterprise_list_workspace_members(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
        )
        email_delivery = _send_team_invite_email(
            to_email=request.email,
            display_name=request.name or str((result.get("member") or {}).get("display_name", "")).strip(),
            workspace_name=str(session.get("workspace_name", auth_workspace_name)).strip() or auth_workspace_name,
            role=request.role or "member",
            invited_by=str(session.get("display_name", session.get("username", "SuperMega"))).strip() or "SuperMega",
            password=str(result.get("generated_password", "")).strip(),
        )
        member_row = result.get("member") if isinstance(result.get("member"), dict) else {}
        enterprise_add_audit_event(
            enterprise_db_url,
            workspace_id=str(session.get("workspace_id", "")).strip(),
            actor=str(session.get("display_name", session.get("username", "system"))).strip() or "system",
            event_type="workspace.member_invited",
            entity_type="member",
            entity_id=str(member_row.get("email", request.email)).strip().lower(),
            summary=f"Invited {str(member_row.get('display_name', request.name or request.email)).strip() or request.email} to the workspace.",
            detail=f"Assigned role {str(request.role or 'member').strip() or 'member'}.",
            payload={
                "email": str(request.email).strip().lower(),
                "role": str(request.role or "member").strip() or "member",
                "created": bool(result.get("created")),
                "email_delivery_status": str((email_delivery or {}).get("status", "")).strip(),
            },
        )
        return {
            "status": "ready",
            "created": bool(result.get("created")),
            "generated_password": str(result.get("generated_password", "")).strip(),
            "row": member_row,
            "count": len(rows),
            "rows": rows,
            "email_delivery": email_delivery,
        }

    @app.get("/api/snapshots/{snapshot_key}")
    def snapshot(snapshot_key: str, request: Request) -> dict[str, Any]:
        session = _require_session(request)
        payload = load_snapshot(state_db, snapshot_key)
        if not payload:
            raise HTTPException(status_code=404, detail=f"Snapshot not found: {snapshot_key}")
        _enforce_snapshot_access(session, snapshot_key, payload)
        payload_workspace_id = _snapshot_workspace_id(payload)
        if payload_workspace_id:
            payload = _enrich_rollout_snapshot(payload, workspace_id=payload_workspace_id)
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
        team_summary = _contact_context_summary(team=request.team, data=request.data)
        requested_package = _normalize_requested_package(request.requested_package or request.workflow)
        row = add_contact_submission(
            state_db,
            source="website",
            name=request.name.strip(),
            email=request.email.strip(),
            company=request.company.strip(),
            workflow=request.workflow.strip(),
            requested_package=requested_package,
            data_summary=team_summary,
            goal=request.goal.strip(),
            status="captured",
            owner="Revenue Pod",
            next_step="Route this request into the revenue queue.",
        )
        pipeline_result: dict[str, Any] | None = None
        lead_id = ""
        task_id = ""
        routed_workspace_id = ""
        submission_status = "captured"
        submission_owner = "Revenue Pod"
        submission_next_step = "Route this request into the revenue queue."
        if default_workspace_id:
            inbound_row = _build_public_inbound_opportunity(request)
            pipeline_result = enterprise_add_leads_with_tasks(
                enterprise_db_url,
                workspace_id=default_workspace_id,
                rows=[inbound_row],
                campaign_goal=request.goal.strip() or "Book one discovery call.",
                source="website_request",
            )
            lead_id = next((str(item).strip() for item in (pipeline_result.get("saved_lead_ids") or []) if str(item).strip()), "")
            task_id = next((str(item).strip() for item in (pipeline_result.get("saved_task_ids") or []) if str(item).strip()), "")
            routed_workspace_id = default_workspace_id
            if lead_id or task_id:
                submission_status = "routed"
                submission_next_step = "Review inbound request and send first response."
            else:
                submission_next_step = "Check revenue queue setup and route this request manually."
            row = update_contact_submission_handoff(
                state_db,
                submission_id=int(row.get("id", 0) or 0),
                status=submission_status,
                owner=submission_owner,
                next_step=submission_next_step,
                workspace_id=routed_workspace_id,
                lead_id=lead_id,
                task_id=task_id,
            ) or row
            for lead_id_item in [str(item).strip() for item in (pipeline_result.get("saved_lead_ids") or []) if str(item).strip()]:
                enterprise_add_lead_activity(
                    enterprise_db_url,
                    workspace_id=default_workspace_id,
                    lead_id=lead_id_item,
                    actor="Website",
                    activity_type="inbound_request",
                    channel="website",
                    direction="inbound",
                    message=f"Inbound request from {request.name.strip() or request.company.strip()} for {requested_package or 'a rollout'}",
                    stage_after="offer_ready",
                    next_step="Review inbound request and send first response.",
                )
        else:
            row = update_contact_submission_handoff(
                state_db,
                submission_id=int(row.get("id", 0) or 0),
                status=submission_status,
                owner=submission_owner,
                next_step="Assign a revenue workspace and route this request manually.",
            ) or row
        delivery = _send_contact_submission_notification(
            name=request.name.strip(),
            email=request.email.strip(),
            company=request.company.strip(),
            workflow=request.workflow.strip(),
            requested_package=requested_package,
            data_summary=team_summary,
            goal=request.goal.strip(),
        )
        return {
            "status": "ready",
            "message": "Submission saved.",
            "submission": row,
            "delivery": delivery,
            "pipeline": {
                "saved_count": int((pipeline_result or {}).get("saved_count", 0) or 0),
                "saved_task_count": int((pipeline_result or {}).get("saved_task_count", 0) or 0),
                "workspace_id": routed_workspace_id,
                "lead_id": lead_id,
                "task_id": task_id,
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


def _default_site_root_path() -> Path:
    configured_site_root = os.getenv("SUPERMEGA_SITE_ROOT")
    if configured_site_root:
        return Path(configured_site_root)

    bundled_site_root = REPO_ROOT / "api-static"
    if bundled_site_root.exists():
        return bundled_site_root

    showroom_site_root = REPO_ROOT / "showroom" / "dist"
    if showroom_site_root.exists():
        return showroom_site_root

    fallback_site_root = REPO_ROOT / "swan-intelligence-hub"
    return fallback_site_root if fallback_site_root.exists() else showroom_site_root


def create_default_app() -> FastAPI:
    site_root = _default_site_root_path()
    pilot_data = Path(os.getenv("SUPERMEGA_PILOT_DATA", str(REPO_ROOT / "pilot-data")))
    return create_app(site_root, pilot_data)


app = create_default_app()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve SuperMega pilot outputs with a JSON API.")
    parser.add_argument("--host", default=os.getenv("SUPERMEGA_HOST", "0.0.0.0"), help="Bind host.")
    parser.add_argument("--port", type=int, default=int(os.getenv("PORT", os.getenv("SUPERMEGA_PORT", "8787"))), help="Bind port.")
    parser.add_argument("--site-root", default=str(_default_site_root_path()), help="Static site root.")
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
