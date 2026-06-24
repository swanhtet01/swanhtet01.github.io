from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import shutil
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import Column, String, Text, delete, func, or_, text
from sqlalchemy.pool import NullPool
from sqlmodel import Field, SQLModel, Session, create_engine, select


ENTERPRISE_DB_FILE = "supermega_enterprise.db"
PASSWORD_HASH_PREFIX = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 310000
DATABASE_URL_ENV_KEYS = (
    "SUPERMEGA_DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "POSTGRES_URL_NON_POOLING",
    "DATABASE_URL",
    "DATABASE_URL_POSTGRES_URL",
    "DATABASE_URL_POSTGRES_PRISMA_URL",
    "DATABASE_URL_POSTGRES_URL_NON_POOLING",
)
_ENGINE_CACHE: dict[str, Any] = {}
_ENGINE_CACHE_LOCK = threading.Lock()

CORE_MODULE_DEFINITIONS: list[dict[str, Any]] = [
    {
        "module_id": "find-clients",
        "name": "Find Clients",
        "category": "Workflow",
        "maturity": "live_wedge",
        "route": "/find-companies",
        "summary": "Search a market, keep the shortlist, and create the first follow-up.",
        "default_enabled": True,
    },
    {
        "module_id": "company-list",
        "name": "Company List",
        "category": "Workflow",
        "maturity": "live_wedge",
        "route": "/company-list",
        "summary": "Turn raw rows into one usable company list with owners and next steps.",
        "default_enabled": True,
    },
    {
        "module_id": "receiving-control",
        "name": "Receiving Control",
        "category": "Workflow",
        "maturity": "live_wedge",
        "route": "/receiving-log",
        "summary": "Track shortages, holds, GRN gaps, and next actions in one shared queue.",
        "default_enabled": True,
    },
    {
        "module_id": "founder-brief",
        "name": "Founder Brief",
        "category": "Intelligence",
        "maturity": "pilot_ready",
        "route": "/app/director",
        "summary": "Condense live queue, approval, and exception state into one short executive brief.",
        "default_enabled": True,
    },
    {
        "module_id": "sales-system",
        "name": "Sales System",
        "category": "Workflow",
        "maturity": "mapped_module",
        "route": "/app/sales",
        "summary": "Prospecting, follow-up, quoting, and commercial review on one shared operating layer.",
        "default_enabled": False,
    },
    {
        "module_id": "operations-inbox",
        "name": "Operations Inbox",
        "category": "Workflow",
        "maturity": "mapped_module",
        "route": "/app/operations",
        "summary": "Requests, blockers, files, and operational exceptions in one owned queue.",
        "default_enabled": False,
    },
    {
        "module_id": "approval-flow",
        "name": "Approval Flow",
        "category": "Automation",
        "maturity": "mapped_module",
        "route": "/app/approvals",
        "summary": "Purchase, exception, and rollout approvals with timestamps and decision history.",
        "default_enabled": False,
    },
    {
        "module_id": "document-intake",
        "name": "Document Intake",
        "category": "Knowledge",
        "maturity": "mapped_module",
        "route": "/app/documents",
        "summary": "Collect files, extract useful fields, and route the next action.",
        "default_enabled": False,
    },
    {
        "module_id": "client-portal",
        "name": "Client Portal",
        "category": "Workflow",
        "maturity": "mapped_module",
        "route": "/products/client-portal",
        "summary": "Status, approvals, files, and delivery communication in one branded workspace.",
        "default_enabled": False,
    },
    {
        "module_id": "platform-admin",
        "name": "Platform Admin",
        "category": "Control",
        "maturity": "control_layer",
        "route": "/app/platform-admin",
        "summary": "Manage tenant posture, modules, roles, connectors, and rollout readiness.",
        "default_enabled": True,
    },
    {
        "module_id": "runtime-desk",
        "name": "Runtime Desk",
        "category": "Control",
        "maturity": "control_layer",
        "route": "/app/runtime",
        "summary": "Watch connector freshness, guardrails, and agent execution health.",
        "default_enabled": True,
    },
    {
        "module_id": "adoption-command",
        "name": "Adoption Command",
        "category": "Control",
        "maturity": "control_layer",
        "route": "/app/adoption-command",
        "summary": "Score role usage, writeback health, manager rituals, and agent reinforcement from live workspace state.",
        "default_enabled": True,
    },
]

DEFAULT_ROOT_DOMAIN = "supermega.dev"
POSTGRES_QUERY_OPTIONS = {
    "application_name",
    "channel_binding",
    "connect_timeout",
    "gssencmode",
    "host",
    "keepalives",
    "keepalives_count",
    "keepalives_idle",
    "keepalives_interval",
    "options",
    "sslcert",
    "sslcompression",
    "sslcrl",
    "sslkey",
    "sslmode",
    "sslrootcert",
    "target_session_attrs",
}
_SCHEMA_READY_DATABASES: set[str] = set()


def _now() -> str:
    return datetime.now().astimezone().isoformat()


def _stable_key(prefix: str, seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}-{digest}"


def stable_workspace_id_for_slug(slug: str) -> str:
    normalized_slug = str(slug or "").strip().lower() or "supermega-lab"
    return _stable_key("WS", normalized_slug)


WORKSPACE_ROLE_ALIASES = {
    "ceo": "ceo",
    "chief_executive": "ceo",
    "chief_executive_officer": "ceo",
    "executive": "ceo",
    "architect": "implementation_lead",
    "product_manager": "product_owner",
    "maintenance_lead": "maintenance",
    "maintenance_manager": "maintenance",
    "maintenance_ops": "maintenance",
    "ops": "operations",
    "operations_lead": "operations",
    "operations_manager": "operations",
    "quality_manager": "quality",
    "quality_lead": "quality",
    "qc": "quality",
    "sales_lead": "sales",
    "sales_manager": "sales",
}

SUPPORTED_WORKSPACE_ROLES = {
    "platform_admin",
    "tenant_admin",
    "owner",
    "admin",
    "ceo",
    "product_owner",
    "implementation_lead",
    "manager",
    "director",
    "tenant_operator",
    "plant_manager",
    "finance_controller",
    "procurement_lead",
    "receiving_clerk",
    "operations",
    "quality",
    "maintenance",
    "sales",
    "lead",
    "operator",
    "member",
}

WORKSPACE_ROLE_RANKS = {
    "platform_admin": 11,
    "ceo": 10,
    "admin": 10,
    "tenant_admin": 9,
    "owner": 8,
    "product_owner": 7,
    "implementation_lead": 7,
    "director": 6,
    "manager": 6,
    "tenant_operator": 5,
    "plant_manager": 5,
    "finance_controller": 5,
    "procurement_lead": 4,
    "receiving_clerk": 4,
    "operations": 4,
    "quality": 4,
    "maintenance": 4,
    "sales": 4,
    "lead": 3,
    "operator": 2,
    "member": 1,
}


def _normalize_workspace_role(role: str) -> str:
    normalized = str(role or "").strip().lower()
    return WORKSPACE_ROLE_ALIASES.get(normalized, normalized)


def _role_rank(role: str) -> int:
    normalized = _normalize_workspace_role(role)
    return int(WORKSPACE_ROLE_RANKS.get(normalized, 0) or 0)


def _merge_user_role(current_role: str, next_role: str) -> str:
    current = _normalize_workspace_role(current_role) or "member"
    proposed = _normalize_workspace_role(next_role) or "member"
    return current if _role_rank(current) >= _role_rank(proposed) else proposed


def _hash_password(password: str) -> str:
    normalized_password = str(password or "")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        normalized_password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"{PASSWORD_HASH_PREFIX}${PASSWORD_HASH_ITERATIONS}$"
        f"{base64.b64encode(salt).decode('ascii')}$"
        f"{base64.b64encode(digest).decode('ascii')}"
    )


def _verify_password(password: str, stored_hash: str) -> tuple[bool, bool]:
    normalized_password = str(password or "")
    normalized_hash = str(stored_hash or "").strip()
    if not normalized_hash:
        return False, False

    if normalized_hash.startswith(f"{PASSWORD_HASH_PREFIX}$"):
        try:
            _, iterations_raw, salt_raw, digest_raw = normalized_hash.split("$", 3)
            iterations = int(iterations_raw)
            salt = base64.b64decode(salt_raw.encode("ascii"))
            expected_digest = base64.b64decode(digest_raw.encode("ascii"))
        except Exception:
            return False, False
        computed_digest = hashlib.pbkdf2_hmac(
            "sha256",
            normalized_password.encode("utf-8"),
            salt,
            iterations,
        )
        return hmac.compare_digest(computed_digest, expected_digest), iterations != PASSWORD_HASH_ITERATIONS

    legacy_digest = hashlib.sha256(normalized_password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy_digest, normalized_hash), True


class EnterpriseWorkspace(SQLModel, table=True):
    __tablename__ = "enterprise_workspaces"

    workspace_id: str = Field(primary_key=True)
    slug: str = Field(sa_column=Column(String, unique=True, index=True, nullable=False))
    name: str
    plan: str = "pilot"
    status: str = "active"
    created_at: str
    updated_at: str


class EnterpriseUser(SQLModel, table=True):
    __tablename__ = "enterprise_users"

    username: str = Field(primary_key=True)
    display_name: str
    password_hash: str
    role: str
    status: str = "active"
    created_at: str
    updated_at: str


class EnterpriseMembership(SQLModel, table=True):
    __tablename__ = "enterprise_memberships"

    membership_id: str = Field(primary_key=True)
    username: str = Field(index=True, foreign_key="enterprise_users.username")
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    role: str
    status: str = "active"
    created_at: str
    updated_at: str


class EnterpriseSession(SQLModel, table=True):
    __tablename__ = "enterprise_sessions"

    session_id: str = Field(primary_key=True)
    username: str = Field(index=True, foreign_key="enterprise_users.username")
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    role: str
    created_at: str
    expires_at: str
    last_seen_at: str


class EnterpriseModuleDefinition(SQLModel, table=True):
    __tablename__ = "enterprise_module_definitions"

    module_id: str = Field(primary_key=True)
    name: str
    category: str = "Workflow"
    maturity: str = "mapped_module"
    route: str = ""
    summary: str = ""
    default_enabled: bool = False
    created_at: str
    updated_at: str


class EnterpriseWorkspaceModule(SQLModel, table=True):
    __tablename__ = "enterprise_workspace_modules"

    assignment_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    module_id: str = Field(index=True, foreign_key="enterprise_module_definitions.module_id")
    status: str = "disabled"
    source: str = "default"
    config_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str
    updated_at: str


class EnterpriseWorkspaceDomain(SQLModel, table=True):
    __tablename__ = "enterprise_workspace_domains"

    domain_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    hostname: str = Field(index=True)
    scope: str = Field(default="tenant_portal", index=True)
    provider: str = "vercel"
    runtime_target: str = "tenant_portal"
    desired_state: str = "planned"
    route_root: str = "/"
    dns_status: str = "unknown"
    tls_status: str = "unknown"
    http_status: str = "unknown"
    verified_at: str = ""
    deployment_url: str = ""
    last_deployed_at: str = ""
    notes: str = ""
    config_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str
    updated_at: str


class EnterpriseWorkspaceProfile(SQLModel, table=True):
    __tablename__ = "enterprise_workspace_profiles"

    workspace_id: str = Field(primary_key=True, foreign_key="enterprise_workspaces.workspace_id")
    company: str = ""
    preferred_package: str = ""
    first_team: str = ""
    systems_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    goal: str = ""
    onboarding_status: str = "draft"
    config_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str
    updated_at: str


class EnterpriseAuditEvent(SQLModel, table=True):
    __tablename__ = "enterprise_audit_events"

    event_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    actor: str
    event_type: str = Field(index=True)
    entity_type: str = ""
    entity_id: str = ""
    severity: str = "info"
    summary: str
    detail: str = ""
    payload_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str


class EnterpriseConnectorEvent(SQLModel, table=True):
    __tablename__ = "enterprise_connector_events"

    event_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    connector_id: str = Field(index=True)
    connector_name: str = ""
    tenant: str = ""
    source: str = ""
    kind: str = Field(default="event", index=True)
    title: str
    detail: str = ""
    route: str = ""
    severity: str = Field(default="info", index=True)
    actor: str = "system"
    entity_type: str = ""
    entity_id: str = ""
    payload_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str = Field(index=True)


class EnterpriseMetricRecord(SQLModel, table=True):
    __tablename__ = "enterprise_metric_records"

    metric_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    captured_at: str = Field(index=True)
    metric_name: str
    metric_group: str = Field(index=True)
    metric_value: str
    unit: str = "value"
    period_label: str = ""
    scope: str = ""
    owner: str = "Management"
    status: str = Field(default="reported", index=True)
    notes: str = ""
    evidence_link: str = ""
    source_ref_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    synced_at: str
    updated_at: str


class EnterpriseKnowledgeChunk(SQLModel, table=True):
    __tablename__ = "enterprise_knowledge_chunks"

    chunk_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    source: str = Field(default="ytf_root_warehouse", index=True)
    record_id: str = Field(default="", index=True)
    title: str = ""
    chunk_type: str = Field(default="summary", index=True)
    text: str = Field(sa_column=Column(Text, nullable=False))
    route: str = Field(default="", index=True)
    source_url: str = ""
    modified_time: str = ""
    entity_ids_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    vector_profile_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    token_count: int = 0
    synced_at: str = Field(index=True)
    updated_at: str


class EnterpriseSourceRecord(SQLModel, table=True):
    __tablename__ = "enterprise_source_records"

    source_record_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    source_system: str = Field(default="google_drive", index=True)
    source_root_id: str = Field(default="", index=True)
    source_root_title: str = ""
    source_item_id: str = Field(default="", index=True)
    title: str = Field(index=True)
    path: str = Field(default="", index=True)
    organized_path: str = Field(default="", index=True)
    mime_type: str = ""
    file_kind: str = Field(default="file", index=True)
    domain: str = Field(default="general", index=True)
    plant: str = Field(default="", index=True)
    department: str = Field(default="", index=True)
    owning_route: str = Field(default="", index=True)
    owner_hint: str = ""
    kpi_readiness: str = Field(default="context", index=True)
    rag_readiness: str = Field(default="metadata", index=True)
    risk_level: str = Field(default="medium", index=True)
    source_behavior: str = ""
    source_mode: str = Field(default="live", index=True)
    web_view_link: str = ""
    modified_time: str = Field(default="", index=True)
    size_bytes: int = 0
    checksum: str = ""
    shortcut_target_id: str = ""
    shortcut_target_mime_type: str = ""
    classification_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    lineage_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    synced_at: str = Field(index=True)
    updated_at: str


class EnterpriseSourceChangeEvent(SQLModel, table=True):
    __tablename__ = "enterprise_source_change_events"

    event_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    source_system: str = Field(default="google_drive", index=True)
    source_record_id: str = Field(default="", index=True)
    source_item_id: str = Field(default="", index=True)
    change_type: str = Field(default="updated", index=True)
    title: str = Field(default="", index=True)
    path: str = Field(default="", index=True)
    organized_path: str = ""
    domain: str = Field(default="general", index=True)
    plant: str = Field(default="", index=True)
    department: str = Field(default="", index=True)
    owning_route: str = Field(default="", index=True)
    owner_hint: str = ""
    kpi_readiness: str = Field(default="context", index=True)
    rag_readiness: str = Field(default="metadata", index=True)
    previous_modified_time: str = ""
    current_modified_time: str = ""
    previous_signature: str = Field(default="", index=True)
    current_signature: str = Field(default="", index=True)
    detected_at: str = Field(index=True)
    summary: str = Field(default="", sa_column=Column(Text, nullable=False))
    payload_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str
    updated_at: str


class EnterpriseLead(SQLModel, table=True):
    __tablename__ = "enterprise_leads"

    lead_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    created_at: str
    company_name: str
    archetype: str = ""
    stage: str = "offer_ready"
    status: str = "open"
    owner: str = "Revenue Pod"
    campaign_goal: str = ""
    service_pack: str = ""
    wedge_product: str = ""
    starter_modules_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    semi_products_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    outreach_subject: str = ""
    outreach_message: str = ""
    discovery_questions_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    contact_email: str = ""
    contact_phone: str = ""
    website: str = ""
    source: str = ""
    source_url: str = ""
    provider: str = ""
    score: int = 0
    notes: str = ""
    synced_at: str


class EnterpriseLeadActivity(SQLModel, table=True):
    __tablename__ = "enterprise_lead_activities"

    activity_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    lead_id: str = Field(index=True, foreign_key="enterprise_leads.lead_id")
    created_at: str
    actor: str
    activity_type: str = "note"
    channel: str = "manual"
    direction: str = "internal"
    message: str
    stage_after: str = ""
    next_step: str = ""


class EnterpriseWorkspaceTask(SQLModel, table=True):
    __tablename__ = "enterprise_workspace_tasks"

    task_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    lead_id: str = ""
    template: str = "manual"
    title: str
    owner: str = "Owner"
    priority: str = "Medium"
    due: str = "This week"
    status: str = "open"
    notes: str = ""
    created_at: str
    updated_at: str


class EnterpriseLeadHuntProfile(SQLModel, table=True):
    __tablename__ = "enterprise_lead_hunt_profiles"

    hunt_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    created_at: str
    updated_at: str
    last_run_at: str = ""
    name: str
    owner: str = "Revenue Pod"
    status: str = "active"
    query: str = ""
    raw_text: str = ""
    keywords_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    sources_json: str = Field(default="[]", sa_column=Column(Text, nullable=False))
    limit: int = 8
    campaign_goal: str = ""
    export_workspace: bool = True
    last_provider: str = ""
    last_engine: str = ""
    last_saved_count: int = 0
    last_summary: str = ""


class EnterpriseAgentRun(SQLModel, table=True):
    __tablename__ = "enterprise_agent_runs"

    run_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    job_type: str = Field(index=True)
    source: str = "manual"
    idempotency_key: str | None = Field(default=None, sa_column=Column(String, unique=True, index=True, nullable=True))
    started_at: str
    finished_at: str = ""
    status: str = Field(default="queued", index=True)
    summary: str = ""
    payload_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    result_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    error_text: str = ""
    attempt_count: int = 0
    max_attempts: int = 1
    scheduled_for: str = ""
    related_entity_type: str = ""
    related_entity_id: str = ""
    triggered_by: str = "system"
    created_at: str
    updated_at: str


def _json_list(value: str) -> list[str]:
    try:
        payload = json.loads(value or "[]")
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    return [str(item).strip() for item in payload if str(item).strip()]


def _hunt_profile_to_dict(row: EnterpriseLeadHuntProfile) -> dict[str, Any]:
    return {
        "hunt_id": row.hunt_id,
        "workspace_id": row.workspace_id,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "last_run_at": row.last_run_at,
        "name": row.name,
        "owner": row.owner,
        "status": row.status,
        "query": row.query,
        "raw_text": row.raw_text,
        "keywords": _json_list(row.keywords_json),
        "sources": _json_list(row.sources_json),
        "limit": row.limit,
        "campaign_goal": row.campaign_goal,
        "export_workspace": row.export_workspace,
        "last_provider": row.last_provider,
        "last_engine": row.last_engine,
        "last_saved_count": row.last_saved_count,
        "last_summary": row.last_summary,
    }


def _json_object(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(value or "{}")
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _agent_run_evidence_contract(
    *,
    job_type: str,
    source: str,
    triggered_by: str,
    status: str,
    summary: str,
    error_text: str,
    payload: dict[str, Any],
    result: dict[str, Any],
) -> dict[str, Any]:
    existing = result.get("evidence_contract") or payload.get("evidence_contract") or {}
    if not isinstance(existing, dict):
        existing = {}
    required_fields = [
        "input_scope",
        "output_artifact",
        "source_refs",
        "tool_calls",
        "approval_state",
        "owner",
        "security_drill_status",
        "rollback_path",
        "risk_level",
        "write_policy",
    ]
    normalized_status = str(status or "").strip().lower()
    normalized_job_type = str(job_type or "").strip() or "agent_job"
    output_artifact = str(
        existing.get("output_artifact")
        or result.get("artifact")
        or result.get("report_path")
        or result.get("web_view_link")
        or f"enterprise_agent_runs/{normalized_job_type}"
    ).strip()
    source_refs = _string_list(existing.get("source_refs") or result.get("source_refs") or result.get("sources"))
    if not source_refs:
        related = str(payload.get("related_entity_id") or "").strip()
        source_refs = [related] if related else [f"workspace:{str(payload.get('workspace_slug') or '').strip() or 'current'}"]
    tool_calls = _string_list(existing.get("tool_calls") or result.get("tool_calls") or result.get("tools_used"))
    if not tool_calls:
        tool_calls = [str(result.get("provider") or result.get("engine") or "rules-runtime").strip()]
    approval_state = str(existing.get("approval_state") or "").strip()
    if not approval_state:
        approval_state = "failed_review_required" if normalized_status == "error" else "review_required_before_writeback"
    security_drill_status = str(existing.get("security_drill_status") or "").strip() or "mapped_required"
    risk_level = str(existing.get("risk_level") or "").strip()
    if not risk_level:
        risk_level = "high" if normalized_status == "error" else ("medium" if "scheduler" in str(source or "").lower() else "low")
    contract = {
        "input_scope": str(existing.get("input_scope") or payload.get("input_scope") or "workspace-scoped job payload and configured source records").strip(),
        "output_artifact": output_artifact,
        "source_refs": source_refs,
        "tool_calls": tool_calls,
        "approval_state": approval_state,
        "owner": str(existing.get("owner") or payload.get("owner") or triggered_by or "Agent Ops").strip(),
        "security_drill_status": security_drill_status,
        "rollback_path": str(
            existing.get("rollback_path")
            or "Keep outputs staged, rerun the job, and promote only after human review."
        ).strip(),
        "risk_level": risk_level,
        "summary": str(summary or error_text or result.get("summary") or "").strip(),
        "write_policy": str(existing.get("write_policy") or "No silent customer-system writes. Approval required before external mutation.").strip(),
    }
    missing_fields = [
        field
        for field in required_fields
        if not contract.get(field) or (isinstance(contract.get(field), list) and not contract.get(field))
    ]
    contract["required_fields"] = required_fields
    contract["missing_required_fields"] = missing_fields
    contract["complete"] = not missing_fields
    return contract


def _payload_with_agent_evidence_contract(
    *,
    job_type: str,
    source: str,
    triggered_by: str,
    payload: dict[str, Any] | None,
) -> dict[str, Any]:
    next_payload = dict(payload or {})
    next_payload.setdefault(
        "evidence_contract",
        _agent_run_evidence_contract(
            job_type=job_type,
            source=source,
            triggered_by=triggered_by,
            status="queued",
            summary="",
            error_text="",
            payload=next_payload,
            result={},
        ),
    )
    return next_payload


def _agent_run_to_dict(row: EnterpriseAgentRun) -> dict[str, Any]:
    payload = _json_object(row.payload_json)
    result = _json_object(row.result_json)
    evidence_contract = _agent_run_evidence_contract(
        job_type=row.job_type,
        source=row.source,
        triggered_by=row.triggered_by,
        status=row.status,
        summary=row.summary,
        error_text=row.error_text,
        payload=payload,
        result=result,
    )
    result_with_contract = {**result, "evidence_contract": evidence_contract}
    return {
        "run_id": row.run_id,
        "workspace_id": row.workspace_id,
        "job_type": row.job_type,
        "source": row.source,
        "idempotency_key": row.idempotency_key,
        "status": row.status,
        "payload": payload,
        "result": result_with_contract,
        "evidence_contract": evidence_contract,
        "error_text": row.error_text,
        "attempt_count": row.attempt_count,
        "max_attempts": row.max_attempts,
        "scheduled_for": row.scheduled_for,
        "started_at": row.started_at,
        "finished_at": row.finished_at,
        "completed_at": row.finished_at,
        "summary": row.summary,
        "related_entity_type": row.related_entity_type,
        "related_entity_id": row.related_entity_id,
        "triggered_by": row.triggered_by,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _module_definition_to_dict(row: EnterpriseModuleDefinition) -> dict[str, Any]:
    return {
        "module_id": row.module_id,
        "name": row.name,
        "category": row.category,
        "maturity": row.maturity,
        "route": row.route,
        "summary": row.summary,
        "default_enabled": bool(row.default_enabled),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _workspace_module_to_dict(
    definition: EnterpriseModuleDefinition,
    assignment: EnterpriseWorkspaceModule | None,
) -> dict[str, Any]:
    config = _json_object(assignment.config_json) if assignment else {}
    workspace_status = str(assignment.status if assignment else "disabled").strip() or "disabled"
    return {
        **_module_definition_to_dict(definition),
        "workspace_status": workspace_status,
        "enabled": workspace_status in {"enabled", "pilot"},
        "source": str(assignment.source if assignment else "default").strip() or "default",
        "config": config,
        "assignment_id": str(assignment.assignment_id if assignment else "").strip(),
    }


def _workspace_domain_templates(workspace_slug: str, workspace_name: str) -> list[dict[str, Any]]:
    normalized_slug = str(workspace_slug or "").strip().lower()
    normalized_name = str(workspace_name or "").strip().lower()
    is_platform_workspace = normalized_slug in {"", "default", "supermega", "supermega-lab"} or normalized_name.startswith("supermega")
    templates: list[dict[str, Any]] = []

    if is_platform_workspace:
        templates.extend(
            [
                {
                    "hostname": DEFAULT_ROOT_DOMAIN,
                    "scope": "public_site",
                    "provider": "vercel",
                    "runtime_target": "public_site",
                    "desired_state": "live",
                    "route_root": "/",
                    "notes": "Primary public platform site.",
                    "config": {
                        "display_name": "Public platform site",
                        "workspace_slug": normalized_slug or "supermega-lab",
                        "proof_paths": ["/", "/products", "/contact"],
                    },
                },
                {
                    "hostname": f"app.{DEFAULT_ROOT_DOMAIN}",
                    "scope": "shared_app",
                    "provider": "vercel",
                    "runtime_target": "shared_app",
                    "desired_state": "live",
                    "route_root": "/app",
                    "notes": "Shared authenticated app host.",
                    "config": {
                        "display_name": "Shared app host",
                        "workspace_slug": normalized_slug or "supermega-lab",
                        "proof_paths": ["/login", "/app", "/app/cloud"],
                    },
                },
            ]
        )
        return templates

    tenant_subdomain = normalized_slug or "workspace"
    if tenant_subdomain == "ytf-plant-a" or "yangon tyre" in normalized_name:
        tenant_subdomain = "ytf"
    desired_state = "pilot" if tenant_subdomain == "ytf" else "planned"
    proof_paths = ["/app", "/app/platform-admin"]
    if tenant_subdomain == "ytf":
        proof_paths = ["/app/portal", "/app/dqms", "/app/platform-admin"]

    templates.append(
        {
            "hostname": f"{tenant_subdomain}.{DEFAULT_ROOT_DOMAIN}",
            "scope": "tenant_portal",
            "provider": "vercel",
            "runtime_target": "tenant_portal",
            "desired_state": desired_state,
            "route_root": "/app",
            "notes": "Workspace-scoped tenant portal host.",
            "config": {
                "display_name": f"{workspace_name or workspace_slug or 'Workspace'} portal",
                "proof_paths": proof_paths,
                "workspace_slug": normalized_slug,
            },
        }
    )
    return templates


def _workspace_domain_to_dict(
    row: EnterpriseWorkspaceDomain,
    workspace: EnterpriseWorkspace | None = None,
    *,
    workspace_slug: str = "",
    workspace_name: str = "",
) -> dict[str, Any]:
    config = _json_object(row.config_json)
    route_root = str(row.route_root or "").strip() or "/"
    hostname = str(row.hostname or "").strip().lower()
    live_url = f"https://{hostname}"
    workspace_slug_value = str(workspace.slug if workspace else workspace_slug or config.get("workspace_slug", "")).strip()
    workspace_name_value = str(workspace.name if workspace else workspace_name or config.get("workspace_name", "")).strip()
    return {
        "domain_id": row.domain_id,
        "workspace_id": row.workspace_id,
        "workspace_slug": workspace_slug_value,
        "workspace_name": workspace_name_value,
        "hostname": hostname,
        "scope": row.scope,
        "provider": row.provider,
        "runtime_target": row.runtime_target,
        "desired_state": row.desired_state,
        "route_root": route_root,
        "dns_status": row.dns_status,
        "tls_status": row.tls_status,
        "http_status": row.http_status,
        "verified_at": row.verified_at,
        "deployment_url": row.deployment_url,
        "last_deployed_at": row.last_deployed_at,
        "notes": row.notes,
        "config": config,
        "live_url": live_url,
        "display_name": str(config.get("display_name", "")).strip() or hostname,
        "proof_paths": [str(item).strip() for item in (config.get("proof_paths") or []) if str(item).strip()],
        "status": (
            "ready"
            if row.dns_status == "ready" and row.tls_status == "ready" and row.http_status == "ready"
            else "attention"
            if any(str(value).strip() == "ready" for value in (row.dns_status, row.tls_status, row.http_status))
            else "blocked"
        ),
    }


def _workspace_profile_to_dict(
    row: EnterpriseWorkspaceProfile,
    workspace: EnterpriseWorkspace | None = None,
    *,
    workspace_slug: str = "",
    workspace_name: str = "",
) -> dict[str, Any]:
    config = _json_object(row.config_json)
    workspace_slug_value = str(workspace.slug if workspace else workspace_slug or config.get("workspace_slug", "")).strip()
    workspace_name_value = str(workspace.name if workspace else workspace_name or config.get("workspace_name", "")).strip()
    return {
        "workspace_id": row.workspace_id,
        "workspace_slug": workspace_slug_value,
        "workspace_name": workspace_name_value,
        "company": str(row.company or workspace_name_value).strip(),
        "preferred_package": str(row.preferred_package or "").strip(),
        "first_team": str(row.first_team or "").strip(),
        "systems": _json_list(row.systems_json),
        "goal": str(row.goal or "").strip(),
        "onboarding_status": str(row.onboarding_status or "draft").strip() or "draft",
        "config": config,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def _audit_event_to_dict(row: EnterpriseAuditEvent) -> dict[str, Any]:
    return {
        "event_id": row.event_id,
        "workspace_id": row.workspace_id,
        "actor": row.actor,
        "event_type": row.event_type,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "severity": row.severity,
        "summary": row.summary,
        "detail": row.detail,
        "payload": _json_object(row.payload_json),
        "created_at": row.created_at,
    }


def _connector_event_to_dict(row: EnterpriseConnectorEvent) -> dict[str, Any]:
    return {
        "event_id": row.event_id,
        "workspace_id": row.workspace_id,
        "connector_id": row.connector_id,
        "connector_name": row.connector_name,
        "tenant": row.tenant,
        "source": row.source,
        "kind": row.kind,
        "title": row.title,
        "detail": row.detail,
        "route": row.route,
        "severity": row.severity,
        "actor": row.actor,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "payload": _json_object(row.payload_json),
        "created_at": row.created_at,
    }


def _metric_record_to_dict(row: EnterpriseMetricRecord) -> dict[str, Any]:
    return {
        "metric_id": row.metric_id,
        "workspace_id": row.workspace_id,
        "captured_at": row.captured_at,
        "metric_name": row.metric_name,
        "metric_group": row.metric_group,
        "metric_value": row.metric_value,
        "unit": row.unit,
        "period_label": row.period_label,
        "scope": row.scope,
        "owner": row.owner,
        "status": row.status,
        "notes": row.notes,
        "evidence_link": row.evidence_link,
        "source_ref": _json_object(row.source_ref_json),
        "synced_at": row.synced_at,
        "updated_at": row.updated_at,
    }


def _knowledge_chunk_to_dict(row: EnterpriseKnowledgeChunk) -> dict[str, Any]:
    return {
        "chunk_id": row.chunk_id,
        "workspace_id": row.workspace_id,
        "source": row.source,
        "record_id": row.record_id,
        "title": row.title,
        "chunk_type": row.chunk_type,
        "text": row.text,
        "route": row.route,
        "source_url": row.source_url,
        "modified_time": row.modified_time,
        "entity_ids": _json_list(row.entity_ids_json),
        "vector_profile": _json_object(row.vector_profile_json),
        "token_count": row.token_count,
        "synced_at": row.synced_at,
        "updated_at": row.updated_at,
    }


def _source_record_to_dict(row: EnterpriseSourceRecord) -> dict[str, Any]:
    return {
        "source_record_id": row.source_record_id,
        "workspace_id": row.workspace_id,
        "source_system": row.source_system,
        "source_root_id": row.source_root_id,
        "source_root_title": row.source_root_title,
        "source_item_id": row.source_item_id,
        "title": row.title,
        "path": row.path,
        "organized_path": row.organized_path,
        "mime_type": row.mime_type,
        "file_kind": row.file_kind,
        "domain": row.domain,
        "plant": row.plant,
        "department": row.department,
        "owning_route": row.owning_route,
        "owner_hint": row.owner_hint,
        "kpi_readiness": row.kpi_readiness,
        "rag_readiness": row.rag_readiness,
        "risk_level": row.risk_level,
        "source_behavior": row.source_behavior,
        "source_mode": row.source_mode,
        "web_view_link": row.web_view_link,
        "modified_time": row.modified_time,
        "size_bytes": row.size_bytes,
        "checksum": row.checksum,
        "shortcut_target_id": row.shortcut_target_id,
        "shortcut_target_mime_type": row.shortcut_target_mime_type,
        "classification": _json_object(row.classification_json),
        "lineage": _json_object(row.lineage_json),
        "synced_at": row.synced_at,
        "updated_at": row.updated_at,
    }


def _source_change_event_to_dict(row: EnterpriseSourceChangeEvent) -> dict[str, Any]:
    return {
        "event_id": row.event_id,
        "workspace_id": row.workspace_id,
        "source_system": row.source_system,
        "source_record_id": row.source_record_id,
        "source_item_id": row.source_item_id,
        "change_type": row.change_type,
        "title": row.title,
        "path": row.path,
        "organized_path": row.organized_path,
        "domain": row.domain,
        "plant": row.plant,
        "department": row.department,
        "owning_route": row.owning_route,
        "owner_hint": row.owner_hint,
        "kpi_readiness": row.kpi_readiness,
        "rag_readiness": row.rag_readiness,
        "previous_modified_time": row.previous_modified_time,
        "current_modified_time": row.current_modified_time,
        "previous_signature": row.previous_signature,
        "current_signature": row.current_signature,
        "detected_at": row.detected_at,
        "summary": row.summary,
        "payload": _json_object(row.payload_json),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def normalize_database_url(database_url: str) -> str:
    normalized = str(database_url or "").strip()
    if normalized.startswith("postgres://"):
        normalized = "postgresql+psycopg://" + normalized[len("postgres://") :]
    elif normalized.startswith("postgresql://"):
        normalized = "postgresql+psycopg://" + normalized[len("postgresql://") :]
    return _sanitize_postgres_query_options(normalized)


def _sanitize_postgres_query_options(database_url: str) -> str:
    if not database_url.startswith("postgresql+psycopg://"):
        return database_url
    parsed = urlsplit(database_url)
    if not parsed.query:
        return database_url
    retained = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.strip().lower() in POSTGRES_QUERY_OPTIONS
    ]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(retained), parsed.fragment))


def resolve_database_url_source() -> tuple[str, str]:
    for key in DATABASE_URL_ENV_KEYS:
        value = str(os.getenv(key, "")).strip()
        if value:
            return key, normalize_database_url(value)
    return "", ""


def resolve_database_url(output_dir: Path) -> str:
    _, env_value = resolve_database_url_source()
    if env_value:
        return env_value
    db_path = output_dir.expanduser().resolve() / ENTERPRISE_DB_FILE
    if os.getenv("VERCEL"):
        runtime_root = Path(os.getenv("SUPERMEGA_RUNTIME_DIR", "/tmp/supermega")).expanduser()
        runtime_root.mkdir(parents=True, exist_ok=True)
        runtime_db_path = runtime_root / ENTERPRISE_DB_FILE
        if not runtime_db_path.exists() and db_path.exists():
            shutil.copy2(db_path, runtime_db_path)
        return f"sqlite:///{runtime_db_path.as_posix()}"
    return f"sqlite:///{db_path.as_posix()}"


def _connect_args(database_url: str) -> dict[str, Any]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    if database_url.startswith("postgresql+psycopg"):
        args: dict[str, Any] = {
            "prepare_threshold": None,
            "connect_timeout": int(os.getenv("SUPERMEGA_DB_CONNECT_TIMEOUT", "8") or "8"),
        }
        if _postgres_startup_options_supported(database_url):
            args["options"] = f"-c statement_timeout={int(os.getenv('SUPERMEGA_DB_STATEMENT_TIMEOUT_MS', '12000') or '12000')}"
        return args
    return {}


def _postgres_startup_options_supported(database_url: str) -> bool:
    mode = str(os.getenv("SUPERMEGA_DB_STARTUP_OPTIONS", "auto")).strip().lower()
    if mode in {"0", "false", "no", "off", "disabled"}:
        return False
    if mode in {"1", "true", "yes", "on", "enabled"}:
        return True
    try:
        host = str(urlsplit(database_url).hostname or "").strip().lower()
    except Exception:
        host = ""
    # Neon transaction pooler rejects startup `options`; unpooled URLs can keep it.
    return "-pooler." not in host and "pgbouncer" not in host


def _env_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw not in {"", "0", "false", "no", "off"}


def get_engine(database_url: str):
    kwargs: dict[str, Any] = {"connect_args": _connect_args(database_url)}
    if database_url.startswith("sqlite"):
        return create_engine(database_url, **kwargs)

    disable_pool_default = bool(os.getenv("VERCEL"))
    if _env_bool("SUPERMEGA_DB_DISABLE_POOL", disable_pool_default) and not _env_bool("SUPERMEGA_DB_FORCE_POOL", False):
        kwargs["poolclass"] = NullPool
    else:
        kwargs.update(
            {
                "pool_pre_ping": True,
                "pool_size": max(1, int(os.getenv("SUPERMEGA_DB_POOL_SIZE", "5") or "5")),
                "max_overflow": max(0, int(os.getenv("SUPERMEGA_DB_MAX_OVERFLOW", "10") or "10")),
                "pool_timeout": max(2, int(os.getenv("SUPERMEGA_DB_POOL_TIMEOUT", "8") or "8")),
                "pool_recycle": max(30, int(os.getenv("SUPERMEGA_DB_POOL_RECYCLE", "300") or "300")),
                "pool_use_lifo": True,
            }
        )
    cache_key = hashlib.sha1(json.dumps({"url": database_url, "kwargs": kwargs}, sort_keys=True, default=str).encode("utf-8")).hexdigest()
    with _ENGINE_CACHE_LOCK:
        engine = _ENGINE_CACHE.get(cache_key)
        if engine is None:
            engine = create_engine(database_url, **kwargs)
            _ENGINE_CACHE[cache_key] = engine
        return engine


def ensure_schema(database_url: str) -> None:
    schema_cache_key = hashlib.sha1(f"{database_url or ''}|source-change-events-v1".encode("utf-8")).hexdigest()
    if schema_cache_key in _SCHEMA_READY_DATABASES:
        return
    engine = get_engine(database_url)
    if not database_url.startswith("sqlite") and str(os.getenv("SUPERMEGA_FORCE_SCHEMA_CREATE", "")).strip() != "1":
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1 FROM enterprise_workspaces LIMIT 1"))
                connection.execute(text("SELECT 1 FROM enterprise_source_change_events LIMIT 1"))
            _SCHEMA_READY_DATABASES.add(schema_cache_key)
            return
        except Exception:
            pass
    SQLModel.metadata.create_all(engine)
    _SCHEMA_READY_DATABASES.add(schema_cache_key)


def ensure_workspace(
    database_url: str,
    *,
    slug: str,
    name: str,
    plan: str = "pilot",
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_slug = str(slug or "").strip().lower() or "supermega-lab"
    normalized_name = str(name or "").strip() or "SuperMega Lab"
    now = _now()
    engine = get_engine(database_url)
    created_workspace = False
    with Session(engine) as session:
        workspace = session.exec(
            select(EnterpriseWorkspace).where(EnterpriseWorkspace.slug == normalized_slug)
        ).first()
        if workspace:
            workspace_changed = False
            next_plan = str(plan or workspace.plan or "pilot")
            if workspace.name != normalized_name:
                workspace.name = normalized_name
                workspace_changed = True
            if workspace.plan != next_plan:
                workspace.plan = next_plan
                workspace_changed = True
            if workspace.status != "active":
                workspace.status = "active"
                workspace_changed = True
            if workspace_changed:
                workspace.updated_at = now
                session.add(workspace)
                session.commit()
                session.refresh(workspace)
        else:
            workspace = EnterpriseWorkspace(
                workspace_id=stable_workspace_id_for_slug(normalized_slug),
                slug=normalized_slug,
                name=normalized_name,
                plan=str(plan or "pilot"),
                status="active",
                created_at=now,
                updated_at=now,
            )
            session.add(workspace)
            created_workspace = True
            session.commit()
            session.refresh(workspace)
        payload = {
            "workspace_id": workspace.workspace_id,
            "slug": workspace.slug,
            "name": workspace.name,
            "plan": workspace.plan,
            "status": workspace.status,
        }
    force_bootstrap = str(os.getenv("SUPERMEGA_FORCE_WORKSPACE_BOOTSTRAP", "")).strip() == "1"
    if created_workspace or force_bootstrap:
        ensure_workspace_modules(database_url, workspace_id=str(payload["workspace_id"]))
        ensure_workspace_domains(
            database_url,
            workspace_id=str(payload["workspace_id"]),
            workspace_slug=str(payload["slug"]),
            workspace_name=str(payload["name"]),
        )
        ensure_workspace_profile(
            database_url,
            workspace_id=str(payload["workspace_id"]),
            workspace_slug=str(payload["slug"]),
            workspace_name=str(payload["name"]),
        )
    return payload


def ensure_core_module_definitions(database_url: str) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        for item in CORE_MODULE_DEFINITIONS:
            module_id = str(item.get("module_id", "")).strip()
            if not module_id:
                continue
            row = session.get(EnterpriseModuleDefinition, module_id)
            if not row:
                row = EnterpriseModuleDefinition(
                    module_id=module_id,
                    created_at=now,
                    updated_at=now,
                    name=str(item.get("name", "")).strip() or module_id,
                )
            row.name = str(item.get("name", row.name)).strip() or row.name
            row.category = str(item.get("category", row.category)).strip() or row.category
            row.maturity = str(item.get("maturity", row.maturity)).strip() or row.maturity
            row.route = str(item.get("route", row.route)).strip()
            row.summary = str(item.get("summary", row.summary)).strip()
            row.default_enabled = bool(item.get("default_enabled", row.default_enabled))
            row.updated_at = now
            session.add(row)
        session.commit()
        rows = session.exec(select(EnterpriseModuleDefinition).order_by(EnterpriseModuleDefinition.name.asc())).all()
    return [_module_definition_to_dict(row) for row in rows]


def ensure_workspace_modules(database_url: str, *, workspace_id: str) -> list[dict[str, Any]]:
    ensure_core_module_definitions(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        definitions = session.exec(
            select(EnterpriseModuleDefinition).order_by(EnterpriseModuleDefinition.name.asc())
        ).all()
        for definition in definitions:
            assignment_id = _stable_key("WMOD", f"{normalized_workspace_id}:{definition.module_id}")
            assignment = session.get(EnterpriseWorkspaceModule, assignment_id)
            if assignment:
                continue
            assignment = EnterpriseWorkspaceModule(
                assignment_id=assignment_id,
                workspace_id=normalized_workspace_id,
                module_id=definition.module_id,
                status="enabled" if definition.default_enabled else "disabled",
                source="default",
                config_json="{}",
                created_at=now,
                updated_at=now,
            )
            session.add(assignment)
        session.commit()
        refreshed_definitions = session.exec(
            select(EnterpriseModuleDefinition).order_by(EnterpriseModuleDefinition.name.asc())
        ).all()
        refreshed_assignments = session.exec(
            select(EnterpriseWorkspaceModule).where(EnterpriseWorkspaceModule.workspace_id == normalized_workspace_id)
        ).all()
    assignments_by_module = {row.module_id: row for row in refreshed_assignments}
    return [_workspace_module_to_dict(definition, assignments_by_module.get(definition.module_id)) for definition in refreshed_definitions]


def ensure_workspace_domains(
    database_url: str,
    *,
    workspace_id: str,
    workspace_slug: str = "",
    workspace_name: str = "",
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        workspace = session.get(EnterpriseWorkspace, normalized_workspace_id)
        if not workspace:
            return []
        slug_value = str(workspace_slug or workspace.slug or "").strip().lower()
        name_value = str(workspace_name or workspace.name or "").strip()
        templates = _workspace_domain_templates(slug_value, name_value)
        for item in templates:
            hostname = str(item.get("hostname", "")).strip().lower()
            if not hostname:
                continue
            domain_id = _stable_key("DOM", f"{normalized_workspace_id}:{hostname}")
            row = session.get(EnterpriseWorkspaceDomain, domain_id)
            if row:
                continue
            row = EnterpriseWorkspaceDomain(
                domain_id=domain_id,
                workspace_id=normalized_workspace_id,
                hostname=hostname,
                scope=str(item.get("scope", "tenant_portal")).strip() or "tenant_portal",
                provider=str(item.get("provider", "vercel")).strip() or "vercel",
                runtime_target=str(item.get("runtime_target", "tenant_portal")).strip() or "tenant_portal",
                desired_state=str(item.get("desired_state", "planned")).strip() or "planned",
                route_root=str(item.get("route_root", "/")).strip() or "/",
                dns_status="unknown",
                tls_status="unknown",
                http_status="unknown",
                verified_at="",
                deployment_url="",
                last_deployed_at="",
                notes=str(item.get("notes", "")).strip(),
                config_json=json.dumps(item.get("config", {}), ensure_ascii=False),
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        session.commit()
        rows = session.exec(
            select(EnterpriseWorkspaceDomain)
            .where(EnterpriseWorkspaceDomain.workspace_id == normalized_workspace_id)
            .order_by(EnterpriseWorkspaceDomain.scope.asc(), EnterpriseWorkspaceDomain.hostname.asc())
        ).all()
    workspace_slug_value = str(slug_value or workspace.slug or "").strip()
    workspace_name_value = str(name_value or workspace.name or "").strip()
    return [_workspace_domain_to_dict(row, workspace_slug=workspace_slug_value, workspace_name=workspace_name_value) for row in rows]


def list_module_definitions(database_url: str) -> list[dict[str, Any]]:
    ensure_core_module_definitions(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(select(EnterpriseModuleDefinition).order_by(EnterpriseModuleDefinition.name.asc())).all()
    return [_module_definition_to_dict(row) for row in rows]


def list_workspace_modules(database_url: str, *, workspace_id: str) -> list[dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    ensure_workspace_modules(database_url, workspace_id=normalized_workspace_id)
    engine = get_engine(database_url)
    with Session(engine) as session:
        definitions = session.exec(
            select(EnterpriseModuleDefinition).order_by(EnterpriseModuleDefinition.name.asc())
        ).all()
        assignments = session.exec(
            select(EnterpriseWorkspaceModule).where(EnterpriseWorkspaceModule.workspace_id == normalized_workspace_id)
        ).all()
    assignments_by_module = {row.module_id: row for row in assignments}
    return [_workspace_module_to_dict(definition, assignments_by_module.get(definition.module_id)) for definition in definitions]


def list_workspace_domains(database_url: str, *, workspace_id: str) -> list[dict[str, Any]]:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    return ensure_workspace_domains(database_url, workspace_id=normalized_workspace_id)


def ensure_workspace_profile(
    database_url: str,
    *,
    workspace_id: str,
    workspace_slug: str = "",
    workspace_name: str = "",
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return None
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        workspace = session.get(EnterpriseWorkspace, normalized_workspace_id)
        if not workspace:
            return None
        workspace_slug_value = str(workspace_slug or workspace.slug or "").strip()
        workspace_name_value = str(workspace_name or workspace.name or "").strip()
        row = session.get(EnterpriseWorkspaceProfile, normalized_workspace_id)
        if not row:
            row = EnterpriseWorkspaceProfile(
                workspace_id=normalized_workspace_id,
                company=workspace_name_value,
                preferred_package="",
                first_team="",
                systems_json="[]",
                goal="",
                onboarding_status="draft",
                config_json=json.dumps(
                    {
                        "workspace_slug": workspace_slug_value,
                        "workspace_name": workspace_name_value,
                    },
                    ensure_ascii=False,
                ),
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        else:
            config = _json_object(row.config_json)
            if workspace_slug_value:
                config["workspace_slug"] = workspace_slug_value
            if workspace_name_value:
                config["workspace_name"] = workspace_name_value
            if not str(row.company or "").strip() and workspace_name_value:
                row.company = workspace_name_value
            row.config_json = json.dumps(config, ensure_ascii=False)
            row.updated_at = now
        session.commit()
        session.refresh(row)
    return _workspace_profile_to_dict(row, workspace_slug=workspace_slug_value, workspace_name=workspace_name_value)


def get_workspace_profile(database_url: str, *, workspace_id: str) -> dict[str, Any] | None:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return None
    return ensure_workspace_profile(database_url, workspace_id=normalized_workspace_id)


def get_workspace_domain_by_hostname(database_url: str, *, hostname: str) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_hostname = str(hostname or "").strip().lower()
    if not normalized_hostname:
        return None
    candidates = [normalized_hostname]
    if normalized_hostname.startswith("www."):
        candidates.append(normalized_hostname[4:])
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.exec(
            select(EnterpriseWorkspaceDomain).where(or_(*[EnterpriseWorkspaceDomain.hostname == item for item in candidates]))
        ).first()
        workspace = session.get(EnterpriseWorkspace, row.workspace_id) if row else None
    workspace_slug_value = str(workspace.slug if workspace else "").strip()
    workspace_name_value = str(workspace.name if workspace else "").strip()
    return _workspace_domain_to_dict(row, workspace_slug=workspace_slug_value, workspace_name=workspace_name_value) if row else None


def update_workspace_module(
    database_url: str,
    *,
    workspace_id: str,
    module_id: str,
    status: str,
    source: str = "manual",
    config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_module_id = str(module_id or "").strip()
    normalized_status = str(status or "").strip().lower() or "disabled"
    if normalized_status not in {"enabled", "pilot", "disabled"}:
        normalized_status = "disabled"
    if not normalized_workspace_id or not normalized_module_id:
        return None

    ensure_workspace_modules(database_url, workspace_id=normalized_workspace_id)
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        definition = session.get(EnterpriseModuleDefinition, normalized_module_id)
        if not definition:
            return None
        assignment_id = _stable_key("WMOD", f"{normalized_workspace_id}:{normalized_module_id}")
        assignment = session.get(EnterpriseWorkspaceModule, assignment_id)
        if not assignment:
            assignment = EnterpriseWorkspaceModule(
                assignment_id=assignment_id,
                workspace_id=normalized_workspace_id,
                module_id=normalized_module_id,
                created_at=now,
                updated_at=now,
            )
        assignment.status = normalized_status
        assignment.source = str(source or "").strip() or "manual"
        if config is not None:
            assignment.config_json = json.dumps(config, ensure_ascii=False)
        elif not str(assignment.config_json or "").strip():
            assignment.config_json = "{}"
        assignment.updated_at = now
        session.add(assignment)
        session.commit()
        session.refresh(definition)
        session.refresh(assignment)
        return _workspace_module_to_dict(definition, assignment)


def update_workspace_domain(
    database_url: str,
    *,
    workspace_id: str,
    domain_id: str,
    hostname: str | None = None,
    scope: str | None = None,
    provider: str | None = None,
    runtime_target: str | None = None,
    desired_state: str | None = None,
    route_root: str | None = None,
    dns_status: str | None = None,
    tls_status: str | None = None,
    http_status: str | None = None,
    verified_at: str | None = None,
    deployment_url: str | None = None,
    last_deployed_at: str | None = None,
    notes: str | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_domain_id = str(domain_id or "").strip()
    if not normalized_workspace_id or not normalized_domain_id:
        return None

    ensure_workspace_domains(database_url, workspace_id=normalized_workspace_id)
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseWorkspaceDomain, normalized_domain_id)
        if not row or row.workspace_id != normalized_workspace_id:
            return None
        if hostname is not None:
            row.hostname = str(hostname or "").strip().lower() or row.hostname
        if scope is not None:
            row.scope = str(scope or "").strip() or row.scope
        if provider is not None:
            row.provider = str(provider or "").strip() or row.provider
        if runtime_target is not None:
            row.runtime_target = str(runtime_target or "").strip() or row.runtime_target
        if desired_state is not None:
            row.desired_state = str(desired_state or "").strip() or row.desired_state
        if route_root is not None:
            row.route_root = str(route_root or "").strip() or row.route_root
        if dns_status is not None:
            row.dns_status = str(dns_status or "").strip() or row.dns_status
        if tls_status is not None:
            row.tls_status = str(tls_status or "").strip() or row.tls_status
        if http_status is not None:
            row.http_status = str(http_status or "").strip() or row.http_status
        if verified_at is not None:
            row.verified_at = str(verified_at or "").strip()
        if deployment_url is not None:
            row.deployment_url = str(deployment_url or "").strip()
        if last_deployed_at is not None:
            row.last_deployed_at = str(last_deployed_at or "").strip()
        if notes is not None:
            row.notes = str(notes or "").strip()
        if config is not None:
            row.config_json = json.dumps(config, ensure_ascii=False)
        elif not str(row.config_json or "").strip():
            row.config_json = "{}"
        row.updated_at = now
        session.add(row)
        session.commit()
        session.refresh(row)
        workspace = session.get(EnterpriseWorkspace, row.workspace_id)
    workspace_slug_value = str(workspace.slug if workspace else "").strip()
    workspace_name_value = str(workspace.name if workspace else "").strip()
    return _workspace_domain_to_dict(row, workspace_slug=workspace_slug_value, workspace_name=workspace_name_value)


def update_workspace_profile(
    database_url: str,
    *,
    workspace_id: str,
    company: str | None = None,
    preferred_package: str | None = None,
    first_team: str | None = None,
    systems: list[str] | None = None,
    goal: str | None = None,
    onboarding_status: str | None = None,
    config: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return None

    ensure_workspace_profile(database_url, workspace_id=normalized_workspace_id)
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseWorkspaceProfile, normalized_workspace_id)
        workspace = session.get(EnterpriseWorkspace, normalized_workspace_id)
        if not row or not workspace:
            return None
        workspace_slug_value = str(workspace.slug or "").strip()
        workspace_name_value = str(workspace.name or "").strip()
        if company is not None:
            row.company = str(company or "").strip()
        if preferred_package is not None:
            row.preferred_package = str(preferred_package or "").strip()
        if first_team is not None:
            row.first_team = str(first_team or "").strip()
        if systems is not None:
            normalized_systems = [str(item).strip() for item in systems if str(item).strip()]
            row.systems_json = json.dumps(normalized_systems, ensure_ascii=False)
        if goal is not None:
            row.goal = str(goal or "").strip()
        if onboarding_status is not None:
            row.onboarding_status = str(onboarding_status or "").strip() or row.onboarding_status or "draft"

        profile_config = _json_object(row.config_json)
        if config is not None:
            profile_config.update(config)
        profile_config["workspace_slug"] = workspace_slug_value
        profile_config["workspace_name"] = workspace_name_value
        row.config_json = json.dumps(profile_config, ensure_ascii=False)
        row.updated_at = now
        session.add(row)
        session.commit()
        session.refresh(row)
    return _workspace_profile_to_dict(row, workspace_slug=workspace_slug_value, workspace_name=workspace_name_value)


def add_audit_event(
    database_url: str,
    *,
    workspace_id: str,
    actor: str,
    event_type: str,
    summary: str,
    detail: str = "",
    entity_type: str = "",
    entity_id: str = "",
    severity: str = "info",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ensure_schema(database_url)
    now = _now()
    normalized_workspace_id = str(workspace_id or "").strip()
    row = EnterpriseAuditEvent(
        event_id=secrets.token_urlsafe(16),
        workspace_id=normalized_workspace_id,
        actor=str(actor or "").strip() or "system",
        event_type=str(event_type or "").strip() or "unknown",
        entity_type=str(entity_type or "").strip(),
        entity_id=str(entity_id or "").strip(),
        severity=str(severity or "").strip() or "info",
        summary=str(summary or "").strip() or "Audit event",
        detail=str(detail or "").strip(),
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
        created_at=now,
    )
    engine = get_engine(database_url)
    with Session(engine) as session:
        session.add(row)
        session.commit()
        session.refresh(row)
    return _audit_event_to_dict(row)


def list_audit_events(
    database_url: str,
    *,
    workspace_id: str,
    limit: int = 25,
    event_type: str | None = None,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    engine = get_engine(database_url)
    statement = select(EnterpriseAuditEvent).where(EnterpriseAuditEvent.workspace_id == normalized_workspace_id)
    if event_type:
        statement = statement.where(EnterpriseAuditEvent.event_type == str(event_type).strip())
    statement = statement.order_by(EnterpriseAuditEvent.created_at.desc()).limit(max(1, int(limit or 25)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_audit_event_to_dict(row) for row in rows]


def add_connector_event(
    database_url: str,
    *,
    workspace_id: str,
    connector_id: str,
    title: str,
    connector_name: str = "",
    tenant: str = "",
    source: str = "",
    kind: str = "",
    detail: str = "",
    route: str = "",
    severity: str = "info",
    actor: str = "system",
    entity_type: str = "",
    entity_id: str = "",
    payload: dict[str, Any] | None = None,
    created_at: str = "",
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_connector_id = str(connector_id or "").strip()
    normalized_title = str(title or "").strip()
    if not normalized_workspace_id or not normalized_connector_id or not normalized_title:
        return None

    row = EnterpriseConnectorEvent(
        event_id=secrets.token_urlsafe(16),
        workspace_id=normalized_workspace_id,
        connector_id=normalized_connector_id,
        connector_name=str(connector_name or "").strip(),
        tenant=str(tenant or "").strip(),
        source=str(source or "").strip(),
        kind=str(kind or "").strip() or "event",
        title=normalized_title,
        detail=str(detail or "").strip(),
        route=str(route or "").strip(),
        severity=str(severity or "").strip() or "info",
        actor=str(actor or "").strip() or "system",
        entity_type=str(entity_type or "").strip(),
        entity_id=str(entity_id or "").strip(),
        payload_json=json.dumps(payload or {}, ensure_ascii=False),
        created_at=str(created_at or "").strip() or _now(),
    )
    engine = get_engine(database_url)
    with Session(engine) as session:
        session.add(row)
        session.commit()
        session.refresh(row)
    return _connector_event_to_dict(row)


def list_connector_events(
    database_url: str,
    *,
    workspace_id: str,
    limit: int = 25,
    connector_id: str | None = None,
    kind: str | None = None,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    engine = get_engine(database_url)
    statement = select(EnterpriseConnectorEvent).where(EnterpriseConnectorEvent.workspace_id == normalized_workspace_id)
    if connector_id:
        statement = statement.where(EnterpriseConnectorEvent.connector_id == str(connector_id).strip())
    if kind:
        statement = statement.where(EnterpriseConnectorEvent.kind == str(kind).strip())
    statement = statement.order_by(EnterpriseConnectorEvent.created_at.desc()).limit(max(1, int(limit or 25)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_connector_event_to_dict(row) for row in rows]


def _normalize_metric_source_ref(row: dict[str, Any]) -> str:
    source_ref = row.get("source_ref", None)
    if isinstance(source_ref, dict):
        return json.dumps(source_ref, ensure_ascii=True, sort_keys=True)
    source_ref_json = str(row.get("source_ref_json", "") or "").strip()
    if source_ref_json:
        try:
            parsed = json.loads(source_ref_json)
        except Exception:
            parsed = {"raw": source_ref_json}
        return json.dumps(parsed if isinstance(parsed, dict) else {"value": parsed}, ensure_ascii=True, sort_keys=True)
    return "{}"


def upsert_metric_records(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id or not rows:
        return {"status": "ready", "saved_count": 0, "saved_metric_ids": [], "rows": []}

    now = _now()
    saved_ids: list[str] = []
    engine = get_engine(database_url)
    with Session(engine) as session:
        for item in rows:
            metric_name = str(item.get("metric_name", "")).strip()
            metric_value = str(item.get("metric_value", "")).strip()
            if not metric_name or not metric_value:
                continue
            metric_group = str(item.get("metric_group", "")).strip() or "general"
            captured_at = str(item.get("captured_at", "")).strip() or now
            metric_id = str(item.get("metric_id", "")).strip() or _stable_key(
                "MET",
                "|".join(
                    [
                        normalized_workspace_id,
                        metric_group,
                        metric_name.lower(),
                        metric_value,
                        captured_at,
                    ]
                ),
            )
            record = session.get(EnterpriseMetricRecord, metric_id)
            if not record:
                record = EnterpriseMetricRecord(
                    metric_id=metric_id,
                    workspace_id=normalized_workspace_id,
                    captured_at=captured_at,
                    metric_name=metric_name,
                    metric_group=metric_group,
                    metric_value=metric_value,
                    synced_at=str(item.get("synced_at", "")).strip() or now,
                    updated_at=now,
                )
            record.workspace_id = normalized_workspace_id
            record.captured_at = captured_at
            record.metric_name = metric_name
            record.metric_group = metric_group
            record.metric_value = metric_value
            record.unit = str(item.get("unit", "")).strip() or "value"
            record.period_label = str(item.get("period_label", "")).strip()
            record.scope = str(item.get("scope", "")).strip()
            record.owner = str(item.get("owner", "")).strip() or "Management"
            record.status = str(item.get("status", "")).strip() or "reported"
            record.notes = str(item.get("notes", "")).strip()
            record.evidence_link = str(item.get("evidence_link", "")).strip()
            record.source_ref_json = _normalize_metric_source_ref(item)
            record.synced_at = str(item.get("synced_at", "")).strip() or now
            record.updated_at = now
            session.add(record)
            saved_ids.append(metric_id)
        session.commit()

    return {
        "status": "ready",
        "saved_count": len(saved_ids),
        "saved_metric_ids": saved_ids,
        "rows": list_metric_records(database_url, workspace_id=normalized_workspace_id, limit=100),
    }


def list_metric_records(
    database_url: str,
    *,
    workspace_id: str,
    metric_group: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    statement = select(EnterpriseMetricRecord).where(EnterpriseMetricRecord.workspace_id == normalized_workspace_id)
    if metric_group:
        statement = statement.where(EnterpriseMetricRecord.metric_group == str(metric_group).strip())
    if status:
        statement = statement.where(EnterpriseMetricRecord.status == str(status).strip())
    statement = statement.order_by(EnterpriseMetricRecord.updated_at.desc(), EnterpriseMetricRecord.captured_at.desc()).limit(
        max(1, int(limit or 100))
    )
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_metric_record_to_dict(row) for row in rows]


def load_metric_record_summary(database_url: str, *, workspace_id: str) -> dict[str, Any]:
    rows = list_metric_records(database_url, workspace_id=workspace_id, limit=5000)
    by_group: dict[str, int] = {}
    by_status: dict[str, int] = {}
    official_count = 0
    candidate_count = 0
    latest_at = ""
    for row in rows:
        group = str(row.get("metric_group", "")).strip() or "general"
        status = str(row.get("status", "")).strip() or "reported"
        by_group[group] = by_group.get(group, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        if status in {"official", "reported", "live", "ready"}:
            official_count += 1
        if status == "candidate":
            candidate_count += 1
        row_latest = str(row.get("updated_at") or row.get("synced_at") or row.get("captured_at") or "").strip()
        if row_latest and row_latest > latest_at:
            latest_at = row_latest
    return {
        "metric_count": len(rows),
        "official_count": official_count,
        "candidate_count": candidate_count,
        "by_group": by_group,
        "by_status": by_status,
        "latest_at": latest_at,
    }


def update_metric_record_status(
    database_url: str,
    *,
    workspace_id: str,
    metric_id: str,
    status: str,
    owner: str | None = None,
    note: str | None = None,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_metric_id = str(metric_id or "").strip()
    if not normalized_workspace_id or not normalized_metric_id:
        return None
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseMetricRecord, normalized_metric_id)
        if not row or row.workspace_id != normalized_workspace_id:
            return None
        row.status = str(status or "").strip() or row.status
        if owner is not None and str(owner).strip():
            row.owner = str(owner).strip()
        if note is not None and str(note).strip():
            existing_notes = str(row.notes or "").strip()
            note_text = str(note).strip()
            row.notes = f"{existing_notes}\n{note_text}".strip() if existing_notes else note_text
        row.updated_at = _now()
        session.add(row)
        session.commit()
        session.refresh(row)
        return _metric_record_to_dict(row)


def upsert_knowledge_chunks(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
    source: str = "ytf_root_warehouse",
    replace_source: bool = False,
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return {"status": "blocked", "saved_count": 0, "saved_chunk_ids": [], "rows": []}
    now = _now()
    saved_ids: list[str] = []
    engine = get_engine(database_url)
    removed_count = 0
    with Session(engine) as session:
        for row in rows:
            text = str(row.get("text", "")).strip()
            if not text:
                continue
            chunk_id = str(row.get("chunk_id", "")).strip() or _stable_key(
                "KCH",
                f"{normalized_workspace_id}:{source}:{row.get('record_id','')}:{row.get('chunk_type','')}:{text[:160]}",
            )
            chunk = session.get(EnterpriseKnowledgeChunk, chunk_id)
            if not chunk:
                chunk = EnterpriseKnowledgeChunk(
                    chunk_id=chunk_id,
                    workspace_id=normalized_workspace_id,
                    text=text,
                    synced_at=now,
                    updated_at=now,
                )
            chunk.workspace_id = normalized_workspace_id
            chunk.source = str(row.get("source", "")).strip() or source
            chunk.record_id = str(row.get("record_id", "")).strip()
            chunk.title = str(row.get("title", "")).strip()
            chunk.chunk_type = str(row.get("chunk_type", "")).strip() or "summary"
            chunk.text = text
            chunk.route = str(row.get("route", "")).strip()
            chunk.source_url = str(row.get("source_url", "")).strip()
            chunk.modified_time = str(row.get("modified_time", "")).strip()
            entity_ids = row.get("entity_ids", [])
            chunk.entity_ids_json = json.dumps(entity_ids if isinstance(entity_ids, list) else [], ensure_ascii=False)
            vector_profile = row.get("vector_profile", {})
            chunk.vector_profile_json = json.dumps(vector_profile if isinstance(vector_profile, dict) else {}, ensure_ascii=False)
            try:
                chunk.token_count = int(row.get("token_count", 0) or 0)
            except Exception:
                chunk.token_count = 0
            chunk.synced_at = now
            chunk.updated_at = now
            session.add(chunk)
            saved_ids.append(chunk_id)
        if replace_source and saved_ids:
            result = session.exec(
                delete(EnterpriseKnowledgeChunk).where(
                    EnterpriseKnowledgeChunk.workspace_id == normalized_workspace_id,
                    EnterpriseKnowledgeChunk.source == source,
                    ~EnterpriseKnowledgeChunk.chunk_id.in_(saved_ids),
                )
            )
            removed_count = int(getattr(result, "rowcount", 0) or 0)
        session.commit()
    return {
        "status": "ready",
        "saved_count": len(saved_ids),
        "removed_stale_count": removed_count,
        "saved_chunk_ids": saved_ids,
        "rows": list_knowledge_chunks(database_url, workspace_id=normalized_workspace_id, source=source, limit=100),
        "summary": load_knowledge_chunk_summary(database_url, workspace_id=normalized_workspace_id),
    }


def list_knowledge_chunks(
    database_url: str,
    *,
    workspace_id: str,
    source: str | None = None,
    route: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    statement = select(EnterpriseKnowledgeChunk).where(EnterpriseKnowledgeChunk.workspace_id == normalized_workspace_id)
    if source:
        statement = statement.where(EnterpriseKnowledgeChunk.source == str(source).strip())
    if route:
        statement = statement.where(EnterpriseKnowledgeChunk.route == str(route).strip())
    statement = statement.order_by(EnterpriseKnowledgeChunk.updated_at.desc(), EnterpriseKnowledgeChunk.title.asc()).limit(max(1, int(limit or 100)))
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_knowledge_chunk_to_dict(row) for row in rows]


def load_knowledge_chunk_summary(database_url: str, *, workspace_id: str) -> dict[str, Any]:
    rows = list_knowledge_chunks(database_url, workspace_id=workspace_id, limit=5000)
    by_source: dict[str, int] = {}
    by_route: dict[str, int] = {}
    latest_at = ""
    token_count = 0
    for row in rows:
        source = str(row.get("source", "")).strip() or "unknown"
        route = str(row.get("route", "")).strip() or "unrouted"
        by_source[source] = by_source.get(source, 0) + 1
        by_route[route] = by_route.get(route, 0) + 1
        token_count += int(row.get("token_count", 0) or 0)
        row_latest = str(row.get("updated_at") or row.get("synced_at") or "").strip()
        if row_latest and row_latest > latest_at:
            latest_at = row_latest
    return {
        "chunk_count": len(rows),
        "token_count": token_count,
        "by_source": by_source,
        "by_route": by_route,
        "latest_at": latest_at,
    }


def _knowledge_embedding_content_hash(row: dict[str, Any], model: str) -> str:
    text_value = str(row.get("text", "")).strip()
    seed = {
        "chunk_id": str(row.get("chunk_id", "")).strip(),
        "title": str(row.get("title", "")).strip(),
        "text": text_value,
        "route": str(row.get("route", "")).strip(),
        "source_url": str(row.get("source_url", "")).strip(),
        "model": str(model or "").strip(),
    }
    return hashlib.sha256(json.dumps(seed, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{float(value):.9g}" for value in values) + "]"


def ensure_knowledge_vector_schema(database_url: str, *, dimensions: int = 1536) -> dict[str, Any]:
    ensure_schema(database_url)
    if database_url.startswith("sqlite"):
        return {
            "status": "blocked",
            "reason": "pgvector requires Postgres; local SQLite can keep token-profile retrieval only.",
            "dimensions": dimensions,
        }
    normalized_dimensions = max(1, int(dimensions or 1536))
    engine = get_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("create schema if not exists extensions"))
        connection.execute(text("create extension if not exists vector with schema extensions"))
        connection.execute(
            text(
                f"""
                create table if not exists enterprise_knowledge_embeddings (
                    chunk_id text primary key references enterprise_knowledge_chunks(chunk_id) on delete cascade,
                    workspace_id text not null,
                    source text not null default '',
                    route text not null default '',
                    title text not null default '',
                    content_hash text not null,
                    embedding_model text not null,
                    embedding_dimensions integer not null,
                    embedding extensions.vector({normalized_dimensions}) not null,
                    metadata_json text not null default '{{}}',
                    embedded_at text not null,
                    updated_at text not null
                )
                """
            )
        )
        connection.execute(
            text(
                "create index if not exists idx_enterprise_knowledge_embeddings_workspace "
                "on enterprise_knowledge_embeddings (workspace_id, embedding_model)"
            )
        )
        connection.execute(
            text(
                "create index if not exists idx_enterprise_knowledge_embeddings_route "
                "on enterprise_knowledge_embeddings (workspace_id, route)"
            )
        )
        try:
            connection.execute(
                text(
                    "create index if not exists idx_enterprise_knowledge_embeddings_hnsw "
                    "on enterprise_knowledge_embeddings using hnsw (embedding extensions.vector_cosine_ops)"
                )
            )
            index_mode = "hnsw"
        except Exception:
            index_mode = "sequential_fallback"
    return {
        "status": "ready",
        "table": "enterprise_knowledge_embeddings",
        "dimensions": normalized_dimensions,
        "index_mode": index_mode,
    }


def load_knowledge_embedding_summary(
    database_url: str,
    *,
    workspace_id: str,
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_model = str(model or "text-embedding-3-small").strip()
    if not normalized_workspace_id:
        return {"status": "blocked", "reason": "workspace_id is required"}
    schema = ensure_knowledge_vector_schema(database_url, dimensions=dimensions)
    if schema.get("status") != "ready":
        return {"status": "blocked", "schema": schema, "indexed_count": 0}
    chunks = list_knowledge_chunks(database_url, workspace_id=normalized_workspace_id, limit=5000)
    chunk_hashes = {str(row.get("chunk_id", "")).strip(): _knowledge_embedding_content_hash(row, normalized_model) for row in chunks}
    engine = get_engine(database_url)
    embedding_rows: dict[str, dict[str, Any]] = {}
    latest_at = ""
    with engine.connect() as connection:
        result = connection.execute(
            text(
                """
                select chunk_id, content_hash, embedding_model, embedding_dimensions, embedded_at, updated_at
                from enterprise_knowledge_embeddings
                where workspace_id = :workspace_id
                """
            ),
            {"workspace_id": normalized_workspace_id},
        )
        for row in result:
            mapping = dict(row._mapping)
            chunk_id = str(mapping.get("chunk_id", "")).strip()
            embedding_rows[chunk_id] = mapping
            row_latest = str(mapping.get("updated_at") or mapping.get("embedded_at") or "").strip()
            if row_latest and row_latest > latest_at:
                latest_at = row_latest
    missing_count = 0
    stale_count = 0
    model_mismatch_count = 0
    for chunk_id, content_hash in chunk_hashes.items():
        indexed = embedding_rows.get(chunk_id)
        if not indexed:
            missing_count += 1
            continue
        if str(indexed.get("embedding_model", "")).strip() != normalized_model:
            model_mismatch_count += 1
            continue
        if str(indexed.get("content_hash", "")).strip() != content_hash:
            stale_count += 1
    return {
        "status": "ready",
        "schema": schema,
        "workspace_id": normalized_workspace_id,
        "model": normalized_model,
        "dimensions": dimensions,
        "chunk_count": len(chunks),
        "indexed_count": len(embedding_rows),
        "ready_count": max(0, len(chunks) - missing_count - stale_count - model_mismatch_count),
        "missing_count": missing_count,
        "stale_count": stale_count,
        "model_mismatch_count": model_mismatch_count,
        "latest_at": latest_at,
    }


def select_knowledge_embedding_candidates(
    database_url: str,
    *,
    workspace_id: str,
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
    limit: int = 64,
    force: bool = False,
) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_model = str(model or "text-embedding-3-small").strip()
    normalized_limit = max(1, int(limit or 64))
    schema = ensure_knowledge_vector_schema(database_url, dimensions=dimensions)
    if schema.get("status") != "ready":
        return {"status": "blocked", "schema": schema, "candidates": []}
    chunks = list_knowledge_chunks(database_url, workspace_id=normalized_workspace_id, limit=5000)
    engine = get_engine(database_url)
    indexed: dict[str, dict[str, Any]] = {}
    with engine.connect() as connection:
        result = connection.execute(
            text(
                """
                select chunk_id, content_hash, embedding_model
                from enterprise_knowledge_embeddings
                where workspace_id = :workspace_id
                """
            ),
            {"workspace_id": normalized_workspace_id},
        )
        for row in result:
            mapping = dict(row._mapping)
            indexed[str(mapping.get("chunk_id", "")).strip()] = mapping
    candidates: list[dict[str, Any]] = []
    missing_count = 0
    stale_count = 0
    model_mismatch_count = 0
    for chunk in chunks:
        chunk_id = str(chunk.get("chunk_id", "")).strip()
        content_hash = _knowledge_embedding_content_hash(chunk, normalized_model)
        row = indexed.get(chunk_id)
        reason = ""
        if force:
            reason = "force"
        elif not row:
            missing_count += 1
            reason = "missing"
        elif str(row.get("embedding_model", "")).strip() != normalized_model:
            model_mismatch_count += 1
            reason = "model_mismatch"
        elif str(row.get("content_hash", "")).strip() != content_hash:
            stale_count += 1
            reason = "stale"
        if reason:
            candidate = dict(chunk)
            candidate["content_hash"] = content_hash
            candidate["embedding_model"] = normalized_model
            candidate["embedding_reason"] = reason
            candidates.append(candidate)
            if len(candidates) >= normalized_limit:
                break
    return {
        "status": "ready",
        "schema": schema,
        "workspace_id": normalized_workspace_id,
        "model": normalized_model,
        "dimensions": dimensions,
        "chunk_count": len(chunks),
        "indexed_count": len(indexed),
        "missing_count": missing_count,
        "stale_count": stale_count,
        "model_mismatch_count": model_mismatch_count,
        "candidate_count": len(candidates),
        "candidates": candidates,
    }


def upsert_knowledge_embeddings(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_model = str(model or "text-embedding-3-small").strip()
    if not normalized_workspace_id:
        return {"status": "blocked", "saved_count": 0, "reason": "workspace_id is required"}
    schema = ensure_knowledge_vector_schema(database_url, dimensions=dimensions)
    if schema.get("status") != "ready":
        return {"status": "blocked", "saved_count": 0, "schema": schema}
    now = _now()
    saved = 0
    engine = get_engine(database_url)
    with engine.begin() as connection:
        for row in rows:
            chunk_id = str(row.get("chunk_id", "")).strip()
            values = row.get("embedding", [])
            if not chunk_id or not isinstance(values, list) or len(values) != dimensions:
                continue
            metadata = {
                "source_url": str(row.get("source_url", "")).strip(),
                "record_id": str(row.get("record_id", "")).strip(),
                "chunk_type": str(row.get("chunk_type", "")).strip(),
                "reason": str(row.get("embedding_reason", "")).strip(),
            }
            connection.execute(
                text(
                    """
                    insert into enterprise_knowledge_embeddings (
                        chunk_id,
                        workspace_id,
                        source,
                        route,
                        title,
                        content_hash,
                        embedding_model,
                        embedding_dimensions,
                        embedding,
                        metadata_json,
                        embedded_at,
                        updated_at
                    )
                    values (
                        :chunk_id,
                        :workspace_id,
                        :source,
                        :route,
                        :title,
                        :content_hash,
                        :embedding_model,
                        :embedding_dimensions,
                        cast(:embedding as extensions.vector),
                        :metadata_json,
                        :embedded_at,
                        :updated_at
                    )
                    on conflict (chunk_id) do update set
                        workspace_id = excluded.workspace_id,
                        source = excluded.source,
                        route = excluded.route,
                        title = excluded.title,
                        content_hash = excluded.content_hash,
                        embedding_model = excluded.embedding_model,
                        embedding_dimensions = excluded.embedding_dimensions,
                        embedding = excluded.embedding,
                        metadata_json = excluded.metadata_json,
                        embedded_at = excluded.embedded_at,
                        updated_at = excluded.updated_at
                    """
                ),
                {
                    "chunk_id": chunk_id,
                    "workspace_id": normalized_workspace_id,
                    "source": str(row.get("source", "")).strip(),
                    "route": str(row.get("route", "")).strip(),
                    "title": str(row.get("title", "")).strip(),
                    "content_hash": str(row.get("content_hash", "")).strip() or _knowledge_embedding_content_hash(row, normalized_model),
                    "embedding_model": normalized_model,
                    "embedding_dimensions": dimensions,
                    "embedding": _vector_literal(values),
                    "metadata_json": json.dumps(metadata, ensure_ascii=False),
                    "embedded_at": now,
                    "updated_at": now,
                },
            )
            saved += 1
    return {
        "status": "ready",
        "saved_count": saved,
        "summary": load_knowledge_embedding_summary(
            database_url,
            workspace_id=normalized_workspace_id,
            model=normalized_model,
            dimensions=dimensions,
        ),
    }


def query_knowledge_embeddings(
    database_url: str,
    *,
    workspace_id: str,
    query_embedding: list[float],
    model: str = "text-embedding-3-small",
    dimensions: int = 1536,
    limit: int = 6,
) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_model = str(model or "text-embedding-3-small").strip()
    normalized_limit = max(1, min(20, int(limit or 6)))
    if not normalized_workspace_id:
        return {"status": "blocked", "matches": [], "reason": "workspace_id is required"}
    if not isinstance(query_embedding, list) or len(query_embedding) != dimensions:
        return {"status": "blocked", "matches": [], "reason": "query embedding dimension mismatch"}
    schema = ensure_knowledge_vector_schema(database_url, dimensions=dimensions)
    if schema.get("status") != "ready":
        return {"status": "blocked", "matches": [], "schema": schema}
    vector = _vector_literal(query_embedding)
    engine = get_engine(database_url)
    matches: list[dict[str, Any]] = []
    with engine.connect() as connection:
        result = connection.execute(
            text(
                """
                select
                    k.chunk_id,
                    k.title,
                    k.text,
                    k.route,
                    k.source_url,
                    k.modified_time,
                    e.source,
                    e.embedding_model,
                    e.embedded_at,
                    1 - (e.embedding <=> cast(:embedding as extensions.vector)) as similarity
                from enterprise_knowledge_embeddings e
                join enterprise_knowledge_chunks k on k.chunk_id = e.chunk_id
                where e.workspace_id = :workspace_id
                  and e.embedding_model = :embedding_model
                order by e.embedding <=> cast(:embedding as extensions.vector)
                limit :limit
                """
            ),
            {
                "workspace_id": normalized_workspace_id,
                "embedding_model": normalized_model,
                "embedding": vector,
                "limit": normalized_limit,
            },
        )
        for row in result:
            mapping = dict(row._mapping)
            matches.append(
                {
                    "chunk_id": str(mapping.get("chunk_id", "")).strip(),
                    "title": str(mapping.get("title", "")).strip(),
                    "text": str(mapping.get("text", "")).strip(),
                    "route": str(mapping.get("route", "")).strip(),
                    "source_url": str(mapping.get("source_url", "")).strip(),
                    "source": str(mapping.get("source", "")).strip(),
                    "modified_time": str(mapping.get("modified_time", "")).strip(),
                    "embedding_model": str(mapping.get("embedding_model", "")).strip(),
                    "embedded_at": str(mapping.get("embedded_at", "")).strip(),
                    "similarity": float(mapping.get("similarity") or 0.0),
                }
            )
    return {
        "status": "ready",
        "model": normalized_model,
        "dimensions": dimensions,
        "match_count": len(matches),
        "matches": matches,
    }


def upsert_source_records(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
    source_system: str = "google_drive",
    replace_current: bool = False,
    include_rows: bool = True,
    include_saved_ids: bool = True,
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id or not rows:
        return {"status": "ready", "saved_count": 0, "saved_source_record_ids": [], "rows": []}
    now = _now()
    prepared_by_id: dict[str, dict[str, Any]] = {}
    for item in rows:
        title = str(item.get("title", "") or item.get("name", "")).strip()
        source_item_id = str(item.get("source_item_id", "") or item.get("drive_item_id", "") or item.get("item_id", "")).strip()
        if not title or not source_item_id:
            continue
        source_root_id = str(item.get("source_root_id", "") or item.get("lane_id", "")).strip()
        source_system_value = str(item.get("source_system", "")).strip() or source_system
        record_id = str(item.get("source_record_id", "")).strip() or _stable_key(
            "SRC",
            "|".join([normalized_workspace_id, source_system_value, source_root_id, source_item_id]),
        )
        prepared_by_id[record_id] = {
            "item": item,
            "title": title,
            "source_item_id": source_item_id,
            "source_root_id": source_root_id,
            "source_system": source_system_value,
        }
    saved_ids = list(prepared_by_id.keys())
    if not saved_ids:
        return {"status": "ready", "saved_count": 0, "saved_source_record_ids": [], "rows": []}
    engine = get_engine(database_url)
    with Session(engine) as session:
        existing_rows = session.exec(
            select(EnterpriseSourceRecord).where(EnterpriseSourceRecord.source_record_id.in_(saved_ids))
        ).all()
        existing_by_id = {row.source_record_id: row for row in existing_rows}
        for record_id, prepared in prepared_by_id.items():
            item = prepared["item"]
            title = str(prepared["title"])
            source_item_id = str(prepared["source_item_id"])
            source_root_id = str(prepared["source_root_id"])
            source_system_value = str(prepared["source_system"])
            record = existing_by_id.get(record_id)
            if not record:
                record = EnterpriseSourceRecord(
                    source_record_id=record_id,
                    workspace_id=normalized_workspace_id,
                    source_item_id=source_item_id,
                    title=title,
                    synced_at=now,
                    updated_at=now,
                )
            record.workspace_id = normalized_workspace_id
            record.source_system = source_system_value
            record.source_root_id = source_root_id
            record.source_root_title = str(item.get("source_root_title", "") or item.get("lane_title", "")).strip()
            record.source_item_id = source_item_id
            record.title = title
            record.path = str(item.get("path", "")).strip()
            record.organized_path = str(item.get("organized_path", "")).strip()
            record.mime_type = str(item.get("mime_type", "")).strip()
            record.file_kind = str(item.get("file_kind", "")).strip() or "file"
            record.domain = str(item.get("domain", "")).strip() or "general"
            record.plant = str(item.get("plant", "")).strip()
            record.department = str(item.get("department", "")).strip()
            record.owning_route = str(item.get("owning_route", "") or item.get("route", "")).strip()
            record.owner_hint = str(item.get("owner_hint", "") or item.get("owner", "")).strip()
            record.kpi_readiness = str(item.get("kpi_readiness", "")).strip() or "context"
            record.rag_readiness = str(item.get("rag_readiness", "")).strip() or "metadata"
            record.risk_level = str(item.get("risk_level", "")).strip() or "medium"
            record.source_behavior = str(item.get("source_behavior", "")).strip()
            record.source_mode = str(item.get("source_mode", "")).strip() or "live"
            record.web_view_link = str(item.get("web_view_link", "") or item.get("source_url", "")).strip()
            record.modified_time = str(item.get("modified_time", "")).strip()
            try:
                record.size_bytes = int(item.get("size_bytes", 0) or 0)
            except Exception:
                record.size_bytes = 0
            record.checksum = str(item.get("checksum", "") or item.get("md5_checksum", "")).strip()
            record.shortcut_target_id = str(item.get("shortcut_target_id", "")).strip()
            record.shortcut_target_mime_type = str(item.get("shortcut_target_mime_type", "")).strip()
            classification = item.get("classification", {})
            lineage = item.get("lineage", {})
            record.classification_json = json.dumps(classification if isinstance(classification, dict) else {}, ensure_ascii=False)
            record.lineage_json = json.dumps(lineage if isinstance(lineage, dict) else {}, ensure_ascii=False)
            record.synced_at = now
            record.updated_at = now
            session.add(record)
        removed_count = 0
        if replace_current and saved_ids:
            result = session.exec(
                delete(EnterpriseSourceRecord).where(
                    EnterpriseSourceRecord.workspace_id == normalized_workspace_id,
                    EnterpriseSourceRecord.source_system == source_system,
                    ~EnterpriseSourceRecord.source_record_id.in_(saved_ids),
                )
            )
            removed_count = int(getattr(result, "rowcount", 0) or 0)
        session.commit()
    return {
        "status": "ready",
        "saved_count": len(saved_ids),
        "removed_stale_count": removed_count,
        "saved_source_record_ids": saved_ids if include_saved_ids else [],
        "rows": list_source_records(database_url, workspace_id=normalized_workspace_id, limit=100) if include_rows else [],
        "summary": load_source_record_summary(database_url, workspace_id=normalized_workspace_id),
    }


def list_source_records(
    database_url: str,
    *,
    workspace_id: str,
    domain: str | None = None,
    plant: str | None = None,
    department: str | None = None,
    kpi_readiness: str | None = None,
    rag_readiness: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    statement = select(EnterpriseSourceRecord).where(EnterpriseSourceRecord.workspace_id == normalized_workspace_id)
    if domain:
        statement = statement.where(EnterpriseSourceRecord.domain == str(domain).strip())
    if plant:
        statement = statement.where(EnterpriseSourceRecord.plant == str(plant).strip())
    if department:
        statement = statement.where(EnterpriseSourceRecord.department == str(department).strip())
    if kpi_readiness:
        statement = statement.where(EnterpriseSourceRecord.kpi_readiness == str(kpi_readiness).strip())
    if rag_readiness:
        statement = statement.where(EnterpriseSourceRecord.rag_readiness == str(rag_readiness).strip())
    statement = statement.order_by(
        EnterpriseSourceRecord.modified_time.desc(),
        EnterpriseSourceRecord.updated_at.desc(),
        EnterpriseSourceRecord.title.asc(),
    ).limit(max(1, int(limit or 100)))
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_source_record_to_dict(row) for row in rows]


def load_source_record_summary(database_url: str, *, workspace_id: str) -> dict[str, Any]:
    by_domain: dict[str, int] = {}
    by_plant: dict[str, int] = {}
    by_department: dict[str, int] = {}
    by_file_kind: dict[str, int] = {}
    by_kpi_readiness: dict[str, int] = {}
    by_rag_readiness: dict[str, int] = {}
    by_extractor_profile: dict[str, int] = {}
    by_extraction_mode: dict[str, int] = {}
    by_extraction_priority: dict[str, int] = {}
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return {
            "source_record_count": 0,
            "by_domain": by_domain,
            "by_plant": by_plant,
            "by_department": by_department,
            "by_file_kind": by_file_kind,
            "by_kpi_readiness": by_kpi_readiness,
            "by_rag_readiness": by_rag_readiness,
            "latest_modified_time": "",
            "shortcut_count": 0,
            "drive_shortcut_count": 0,
            "windows_shortcut_count": 0,
            "resolved_shortcut_target_count": 0,
            "unresolved_shortcut_count": 0,
            "unresolved_drive_shortcut_count": 0,
            "shortcut_backed_record_count": 0,
            "metric_candidate_count": 0,
            "rag_candidate_count": 0,
            "agentic_extraction": {
                "file_agent_count": 0,
                "high_priority_file_agent_count": 0,
                "missing_contract_count": 0,
                "profile_count": 0,
                "by_profile": {},
                "by_automation_mode": {},
                "by_priority": {},
            },
        }
    ensure_schema(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(
            select(
                EnterpriseSourceRecord.domain,
                EnterpriseSourceRecord.plant,
                EnterpriseSourceRecord.department,
                EnterpriseSourceRecord.file_kind,
                EnterpriseSourceRecord.kpi_readiness,
                EnterpriseSourceRecord.rag_readiness,
                EnterpriseSourceRecord.modified_time,
                EnterpriseSourceRecord.shortcut_target_id,
                EnterpriseSourceRecord.source_item_id,
                EnterpriseSourceRecord.mime_type,
                EnterpriseSourceRecord.classification_json,
            ).where(
                EnterpriseSourceRecord.workspace_id == normalized_workspace_id
            )
        ).all()
    latest_modified_time = ""
    source_record_count = len(rows)
    file_agent_count = 0
    high_priority_file_agent_count = 0
    missing_contract_count = 0
    shortcut_count = 0
    drive_shortcut_count = 0
    windows_shortcut_count = 0
    resolved_shortcut_target_count = 0
    unresolved_drive_shortcut_count = 0
    shortcut_backed_record_count = 0
    for domain, plant, department, file_kind, kpi_readiness, rag_readiness, modified_time, shortcut_target_id, source_item_id, mime_type, classification_json in rows:
        for bucket, key, fallback in (
            (by_domain, domain, "general"),
            (by_plant, plant, "unknown"),
            (by_department, department, "unknown"),
            (by_file_kind, file_kind, "file"),
            (by_kpi_readiness, kpi_readiness, "context"),
            (by_rag_readiness, rag_readiness, "metadata"),
        ):
            normalized_key = str(key or "").strip() or fallback
            bucket[normalized_key] = bucket.get(normalized_key, 0) + 1
        normalized_file_kind = str(file_kind or "").strip()
        normalized_shortcut_target_id = str(shortcut_target_id or "").strip()
        if normalized_file_kind == "shortcut":
            shortcut_count += 1
            if str(mime_type or "").strip() == "application/x-ms-shortcut":
                windows_shortcut_count += 1
            else:
                drive_shortcut_count += 1
                if not normalized_shortcut_target_id:
                    unresolved_drive_shortcut_count += 1
            if normalized_shortcut_target_id:
                resolved_shortcut_target_count += 1
        if normalized_shortcut_target_id and normalized_shortcut_target_id == str(source_item_id or "").strip():
            shortcut_backed_record_count += 1
        row_modified_time = str(modified_time or "").strip()
        if row_modified_time and row_modified_time > latest_modified_time:
            latest_modified_time = row_modified_time
        classification = _json_object(str(classification_json or "{}"))
        extractor_agent = classification.get("extractor_agent", {}) if isinstance(classification.get("extractor_agent"), dict) else {}
        if extractor_agent:
            file_agent_count += 1
            profile_id = str(extractor_agent.get("profile_id", "")).strip() or "unknown"
            automation_mode = str(extractor_agent.get("automation_mode", "")).strip() or "metadata_first"
            priority = str(extractor_agent.get("priority", "")).strip() or "low"
            by_extractor_profile[profile_id] = by_extractor_profile.get(profile_id, 0) + 1
            by_extraction_mode[automation_mode] = by_extraction_mode.get(automation_mode, 0) + 1
            by_extraction_priority[priority] = by_extraction_priority.get(priority, 0) + 1
            if priority == "high":
                high_priority_file_agent_count += 1
        else:
            missing_contract_count += 1
    return {
        "source_record_count": source_record_count,
        "by_domain": by_domain,
        "by_plant": by_plant,
        "by_department": by_department,
        "by_file_kind": by_file_kind,
        "by_kpi_readiness": by_kpi_readiness,
        "by_rag_readiness": by_rag_readiness,
        "latest_modified_time": latest_modified_time,
        "shortcut_count": shortcut_count,
        "drive_shortcut_count": drive_shortcut_count,
        "windows_shortcut_count": windows_shortcut_count,
        "resolved_shortcut_target_count": resolved_shortcut_target_count,
        "unresolved_shortcut_count": max(0, shortcut_count - resolved_shortcut_target_count),
        "unresolved_drive_shortcut_count": unresolved_drive_shortcut_count,
        "shortcut_backed_record_count": shortcut_backed_record_count,
        "metric_candidate_count": sum(
            count for key, count in by_kpi_readiness.items() if key in {"metric_candidate", "feature_candidate"}
        ),
        "rag_candidate_count": sum(count for key, count in by_rag_readiness.items() if "candidate" in key),
        "agentic_extraction": {
            "file_agent_count": file_agent_count,
            "high_priority_file_agent_count": high_priority_file_agent_count,
            "missing_contract_count": missing_contract_count,
            "profile_count": len(by_extractor_profile),
            "by_profile": by_extractor_profile,
            "by_automation_mode": by_extraction_mode,
            "by_priority": by_extraction_priority,
        },
    }


def _source_change_record_view(item: dict[str, Any], *, workspace_id: str, source_system: str) -> dict[str, Any] | None:
    normalized_workspace_id = str(workspace_id or "").strip()
    source_system_value = str(item.get("source_system", "") or source_system).strip() or "google_drive"
    source_root_id = str(item.get("source_root_id", "") or item.get("lane_id", "")).strip()
    source_item_id = str(
        item.get("source_item_id", "")
        or item.get("drive_item_id", "")
        or item.get("item_id", "")
    ).strip()
    title = str(item.get("title", "") or item.get("name", "")).strip()
    if not normalized_workspace_id or not (source_item_id or title):
        return None
    source_record_id = str(item.get("source_record_id", "")).strip() or _stable_key(
        "SRC",
        "|".join([normalized_workspace_id, source_system_value, source_root_id, source_item_id or title]),
    )
    try:
        size_bytes = int(item.get("size_bytes", 0) or 0)
    except Exception:
        size_bytes = 0
    view = {
        "source_record_id": source_record_id,
        "source_system": source_system_value,
        "source_root_id": source_root_id,
        "source_item_id": source_item_id,
        "title": title or source_item_id or source_record_id,
        "path": str(item.get("path", "")).strip(),
        "organized_path": str(item.get("organized_path", "")).strip(),
        "mime_type": str(item.get("mime_type", "")).strip(),
        "file_kind": str(item.get("file_kind", "")).strip() or "file",
        "domain": str(item.get("domain", "")).strip() or "general",
        "plant": str(item.get("plant", "")).strip(),
        "department": str(item.get("department", "")).strip(),
        "owning_route": str(item.get("owning_route", "") or item.get("route", "")).strip(),
        "owner_hint": str(item.get("owner_hint", "") or item.get("owner", "")).strip(),
        "kpi_readiness": str(item.get("kpi_readiness", "")).strip() or "context",
        "rag_readiness": str(item.get("rag_readiness", "")).strip() or "metadata",
        "risk_level": str(item.get("risk_level", "")).strip() or "medium",
        "source_mode": str(item.get("source_mode", "")).strip() or "live",
        "web_view_link": str(item.get("web_view_link", "") or item.get("source_url", "")).strip(),
        "modified_time": str(item.get("modified_time", "")).strip(),
        "size_bytes": size_bytes,
        "checksum": str(item.get("checksum", "") or item.get("md5_checksum", "")).strip(),
    }
    signature_payload = {
        key: view.get(key, "")
        for key in (
            "title",
            "path",
            "organized_path",
            "mime_type",
            "file_kind",
            "domain",
            "plant",
            "department",
            "owning_route",
            "owner_hint",
            "kpi_readiness",
            "rag_readiness",
            "risk_level",
            "source_mode",
            "modified_time",
            "size_bytes",
            "checksum",
        )
    }
    view["signature"] = hashlib.sha1(
        json.dumps(signature_payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    return view


def _source_change_summary(change_type: str, current: dict[str, Any] | None, previous: dict[str, Any] | None) -> str:
    row = current or previous or {}
    title = str(row.get("title", "")).strip() or "Untitled source"
    domain = str(row.get("domain", "")).strip() or "general"
    owner = str(row.get("owner_hint", "")).strip() or "YTF Management"
    if change_type == "added":
        return f"New {domain} source detected: {title}. Review owner: {owner}."
    if change_type == "removed":
        return f"{domain.title()} source disappeared from the latest Drive crawl: {title}. Confirm before retiring it."
    return f"{domain.title()} source changed: {title}. Review owner: {owner}."


def record_source_change_events(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
    previous_rows: list[dict[str, Any]],
    source_system: str = "google_drive",
    detected_at: str = "",
    include_rows: bool = True,
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return {"status": "skipped", "saved_count": 0, "summary": {}, "rows": []}
    now = str(detected_at or "").strip() or _now()
    current_by_id: dict[str, dict[str, Any]] = {}
    previous_by_id: dict[str, dict[str, Any]] = {}
    for item in rows:
        if not isinstance(item, dict):
            continue
        view = _source_change_record_view(item, workspace_id=normalized_workspace_id, source_system=source_system)
        if view:
            current_by_id[str(view["source_record_id"])] = view
    for item in previous_rows:
        if not isinstance(item, dict):
            continue
        view = _source_change_record_view(item, workspace_id=normalized_workspace_id, source_system=source_system)
        if view:
            previous_by_id[str(view["source_record_id"])] = view

    prepared: list[dict[str, Any]] = []
    for record_id, current in current_by_id.items():
        previous = previous_by_id.get(record_id)
        if not previous:
            prepared.append({"change_type": "added", "current": current, "previous": None})
            continue
        if str(current.get("signature", "")) != str(previous.get("signature", "")):
            prepared.append({"change_type": "updated", "current": current, "previous": previous})
    for record_id, previous in previous_by_id.items():
        if record_id not in current_by_id:
            prepared.append({"change_type": "removed", "current": None, "previous": previous})

    if not prepared:
        summary = load_source_change_summary(database_url, workspace_id=normalized_workspace_id)
        return {"status": "ready", "saved_count": 0, "summary": summary, "rows": []}

    engine = get_engine(database_url)
    saved_ids: list[str] = []
    with Session(engine) as session:
        for item in prepared:
            change_type = str(item.get("change_type", "")).strip() or "updated"
            current = item.get("current") if isinstance(item.get("current"), dict) else None
            previous = item.get("previous") if isinstance(item.get("previous"), dict) else None
            row = current or previous or {}
            source_record_id = str(row.get("source_record_id", "")).strip()
            previous_signature = str((previous or {}).get("signature", "")).strip()
            current_signature = str((current or {}).get("signature", "")).strip()
            event_id = _stable_key(
                "SCE",
                "|".join(
                    [
                        normalized_workspace_id,
                        str(row.get("source_system", "") or source_system).strip(),
                        source_record_id,
                        change_type,
                        previous_signature,
                        current_signature,
                    ]
                ),
            )
            event = session.get(EnterpriseSourceChangeEvent, event_id)
            if not event:
                event = EnterpriseSourceChangeEvent(
                    event_id=event_id,
                    workspace_id=normalized_workspace_id,
                    source_record_id=source_record_id,
                    source_item_id=str(row.get("source_item_id", "")).strip(),
                    detected_at=now,
                    created_at=now,
                    updated_at=now,
                )
            event.workspace_id = normalized_workspace_id
            event.source_system = str(row.get("source_system", "") or source_system).strip() or "google_drive"
            event.source_record_id = source_record_id
            event.source_item_id = str(row.get("source_item_id", "")).strip()
            event.change_type = change_type
            event.title = str(row.get("title", "")).strip()
            event.path = str(row.get("path", "")).strip()
            event.organized_path = str(row.get("organized_path", "")).strip()
            event.domain = str(row.get("domain", "")).strip() or "general"
            event.plant = str(row.get("plant", "")).strip()
            event.department = str(row.get("department", "")).strip()
            event.owning_route = str(row.get("owning_route", "")).strip()
            event.owner_hint = str(row.get("owner_hint", "")).strip()
            event.kpi_readiness = str(row.get("kpi_readiness", "")).strip() or "context"
            event.rag_readiness = str(row.get("rag_readiness", "")).strip() or "metadata"
            event.previous_modified_time = str((previous or {}).get("modified_time", "")).strip()
            event.current_modified_time = str((current or {}).get("modified_time", "")).strip()
            event.previous_signature = previous_signature
            event.current_signature = current_signature
            event.detected_at = str(event.detected_at or now).strip() or now
            event.summary = _source_change_summary(change_type, current, previous)
            event.payload_json = json.dumps(
                {
                    "change_type": change_type,
                    "current": current or {},
                    "previous": previous or {},
                },
                ensure_ascii=False,
            )
            event.updated_at = now
            session.add(event)
            saved_ids.append(event_id)
        session.commit()

    summary = load_source_change_summary(database_url, workspace_id=normalized_workspace_id)
    return {
        "status": "ready",
        "saved_count": len(saved_ids),
        "saved_event_ids": saved_ids,
        "summary": summary,
        "rows": list_source_change_events(database_url, workspace_id=normalized_workspace_id, limit=25) if include_rows else [],
    }


def list_source_change_events(
    database_url: str,
    *,
    workspace_id: str,
    change_type: str | None = None,
    domain: str | None = None,
    plant: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return []
    statement = select(EnterpriseSourceChangeEvent).where(
        EnterpriseSourceChangeEvent.workspace_id == normalized_workspace_id
    )
    if change_type:
        statement = statement.where(EnterpriseSourceChangeEvent.change_type == str(change_type).strip())
    if domain:
        statement = statement.where(EnterpriseSourceChangeEvent.domain == str(domain).strip())
    if plant:
        statement = statement.where(EnterpriseSourceChangeEvent.plant == str(plant).strip())
    statement = statement.order_by(
        EnterpriseSourceChangeEvent.detected_at.desc(),
        EnterpriseSourceChangeEvent.updated_at.desc(),
        EnterpriseSourceChangeEvent.title.asc(),
    ).limit(max(1, min(500, int(limit or 50))))
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_source_change_event_to_dict(row) for row in rows]


def load_source_change_summary(database_url: str, *, workspace_id: str, since_hours: int = 24) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    empty = {
        "event_count": 0,
        "recent_event_count": 0,
        "added_count": 0,
        "updated_count": 0,
        "removed_count": 0,
        "by_type": {},
        "by_domain": {},
        "by_plant": {},
        "latest_event_at": "",
        "since_hours": max(1, int(since_hours or 24)),
    }
    if not normalized_workspace_id:
        return empty
    ensure_schema(database_url)
    cutoff = (datetime.now().astimezone() - timedelta(hours=empty["since_hours"])).isoformat()
    engine = get_engine(database_url)
    with Session(engine) as session:
        rows = session.exec(
            select(EnterpriseSourceChangeEvent).where(
                EnterpriseSourceChangeEvent.workspace_id == normalized_workspace_id
            )
        ).all()
    summary = dict(empty)
    summary["event_count"] = len(rows)
    for row in rows:
        detected_at = str(row.detected_at or "").strip()
        if detected_at and detected_at > str(summary.get("latest_event_at", "")):
            summary["latest_event_at"] = detected_at
        if detected_at >= cutoff:
            summary["recent_event_count"] = int(summary.get("recent_event_count", 0) or 0) + 1
        change_type = str(row.change_type or "").strip() or "updated"
        domain = str(row.domain or "").strip() or "general"
        plant = str(row.plant or "").strip() or "unknown"
        summary["by_type"][change_type] = int(summary["by_type"].get(change_type, 0) or 0) + 1
        summary["by_domain"][domain] = int(summary["by_domain"].get(domain, 0) or 0) + 1
        summary["by_plant"][plant] = int(summary["by_plant"].get(plant, 0) or 0) + 1
    summary["added_count"] = int(summary["by_type"].get("added", 0) or 0)
    summary["updated_count"] = int(summary["by_type"].get("updated", 0) or 0)
    summary["removed_count"] = int(summary["by_type"].get("removed", 0) or 0)
    return summary


def ensure_user(
    database_url: str,
    *,
    username: str,
    password: str,
    display_name: str = "",
    role: str = "owner",
    workspace_slug: str = "supermega-lab",
    workspace_name: str = "SuperMega Lab",
    workspace_plan: str = "pilot",
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_username = str(username or "").strip().lower()
    normalized_password = str(password or "").strip()
    if not normalized_username or not normalized_password:
        return {"status": "skipped"}

    workspace = ensure_workspace(
        database_url,
        slug=workspace_slug,
        name=workspace_name,
        plan=workspace_plan,
    )
    now = _now()
    engine = get_engine(database_url)
    password_hash = _hash_password(normalized_password)
    display = str(display_name or "").strip() or normalized_username
    normalized_role = str(role or "").strip() or "owner"
    membership_id = _stable_key("MEM", f"{normalized_username}:{workspace['workspace_id']}")
    with Session(engine) as session:
        user = session.get(EnterpriseUser, normalized_username)
        if user:
            user.display_name = display
            user.password_hash = password_hash
            user.role = normalized_role
            user.status = "active"
            user.updated_at = now
        else:
            user = EnterpriseUser(
                username=normalized_username,
                display_name=display,
                password_hash=password_hash,
                role=normalized_role,
                status="active",
                created_at=now,
                updated_at=now,
            )
            session.add(user)

        membership = session.get(EnterpriseMembership, membership_id)
        if membership:
            membership.role = normalized_role
            membership.status = "active"
            membership.updated_at = now
        else:
            membership = EnterpriseMembership(
                membership_id=membership_id,
                username=normalized_username,
                workspace_id=workspace["workspace_id"],
                role=normalized_role,
                status="active",
                created_at=now,
                updated_at=now,
            )
            session.add(membership)
        session.commit()

    return {
        "status": "ready",
        "username": normalized_username,
        "display_name": display,
        "role": normalized_role,
        "workspace": workspace,
    }


def authenticate_user(database_url: str, *, username: str, password: str) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_username = str(username or "").strip().lower()
    engine = get_engine(database_url)
    with Session(engine) as session:
        user = session.exec(
            select(EnterpriseUser).where(
                EnterpriseUser.username == normalized_username,
                EnterpriseUser.status == "active",
            )
        ).first()
        if not user:
            return None
        matched, needs_upgrade = _verify_password(password, user.password_hash)
        if not matched:
            return None
        if needs_upgrade:
            user.password_hash = _hash_password(password)
            user.updated_at = _now()
            session.add(user)
            session.commit()
            session.refresh(user)
        return {
            "username": user.username,
            "display_name": user.display_name,
            "role": user.role,
            "status": user.status,
        }


def list_user_workspaces(database_url: str, *, username: str) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_username = str(username or "").strip().lower()
    engine = get_engine(database_url)
    with Session(engine) as session:
        memberships = session.exec(
            select(EnterpriseMembership).where(
                EnterpriseMembership.username == normalized_username,
                EnterpriseMembership.status == "active",
            )
        ).all()
        workspace_ids = [membership.workspace_id for membership in memberships]
        workspaces = session.exec(
            select(EnterpriseWorkspace).where(EnterpriseWorkspace.workspace_id.in_(workspace_ids))
        ).all() if workspace_ids else []
    by_id = {workspace.workspace_id: workspace for workspace in workspaces}
    return [
        {
            "workspace_id": membership.workspace_id,
            "slug": by_id[membership.workspace_id].slug if membership.workspace_id in by_id else "",
            "name": by_id[membership.workspace_id].name if membership.workspace_id in by_id else "",
            "plan": by_id[membership.workspace_id].plan if membership.workspace_id in by_id else "",
            "status": by_id[membership.workspace_id].status if membership.workspace_id in by_id else "",
            "role": membership.role,
        }
        for membership in memberships
    ]


def list_workspace_members(database_url: str, *, workspace_id: str) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    engine = get_engine(database_url)
    with Session(engine) as session:
        memberships = session.exec(
            select(EnterpriseMembership).where(
                EnterpriseMembership.workspace_id == normalized_workspace_id,
                EnterpriseMembership.status == "active",
            )
        ).all()
        usernames = [membership.username for membership in memberships]
        users = (
            session.exec(select(EnterpriseUser).where(EnterpriseUser.username.in_(usernames))).all()
            if usernames
            else []
        )
    by_username = {user.username: user for user in users}
    rows = [
        {
            "membership_id": membership.membership_id,
            "workspace_id": membership.workspace_id,
            "username": membership.username,
            "email": membership.username,
            "display_name": (
                by_username[membership.username].display_name
                if membership.username in by_username
                else membership.username
            ),
            "role": membership.role,
            "status": membership.status,
            "created_at": membership.created_at,
            "updated_at": membership.updated_at,
        }
        for membership in memberships
    ]
    return sorted(
        rows,
        key=lambda row: (
            -_role_rank(str(row.get("role", ""))),
            str(row.get("display_name", "")).strip().lower(),
            str(row.get("email", "")).strip().lower(),
        ),
    )


def invite_workspace_member(
    database_url: str,
    *,
    workspace_id: str,
    email: str,
    display_name: str = "",
    role: str = "member",
    password: str = "",
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    normalized_email = str(email or "").strip().lower()
    normalized_role = _normalize_workspace_role(role) or "member"
    if normalized_role not in SUPPORTED_WORKSPACE_ROLES:
        normalized_role = "member"
    if not normalized_workspace_id or not normalized_email:
        return {"status": "skipped"}

    now = _now()
    engine = get_engine(database_url)
    membership_id = _stable_key("MEM", f"{normalized_email}:{normalized_workspace_id}")
    generated_password = ""
    invite_password = str(password or "").strip() or secrets.token_urlsafe(10)
    created = False
    with Session(engine) as session:
        workspace = session.get(EnterpriseWorkspace, normalized_workspace_id)
        if not workspace:
            return {"status": "missing_workspace"}

        user = session.get(EnterpriseUser, normalized_email)
        name_value = (
            str(display_name or "").strip()
            or (user.display_name if user else "")
            or normalized_email.split("@")[0].replace(".", " ").replace("_", " ").title()
        )
        if user:
            user.display_name = name_value
            user.role = _merge_user_role(user.role, normalized_role)
            user.status = "active"
            user.updated_at = now
            generated_password = invite_password
            user.password_hash = _hash_password(generated_password)
        else:
            generated_password = invite_password
            user = EnterpriseUser(
                username=normalized_email,
                display_name=name_value,
                password_hash=_hash_password(generated_password),
                role=normalized_role,
                status="active",
                created_at=now,
                updated_at=now,
            )
            session.add(user)
            created = True

        membership = session.get(EnterpriseMembership, membership_id)
        if membership:
            membership.role = normalized_role
            membership.status = "active"
            membership.updated_at = now
        else:
            membership = EnterpriseMembership(
                membership_id=membership_id,
                username=normalized_email,
                workspace_id=normalized_workspace_id,
                role=normalized_role,
                status="active",
                created_at=now,
                updated_at=now,
            )
            session.add(membership)
            created = True
        session.commit()

    member = next(
        (
            row
            for row in list_workspace_members(database_url, workspace_id=normalized_workspace_id)
            if str(row.get("email", "")).strip().lower() == normalized_email
        ),
        None,
    )
    return {
        "status": "ready",
        "created": created,
        "generated_password": generated_password,
        "member": member,
    }


def _select_workspace_access(
    session: Session,
    *,
    username: str,
    workspace_slug: str = "",
) -> tuple[EnterpriseMembership, EnterpriseWorkspace] | None:
    normalized_username = str(username or "").strip().lower()
    requested_slug = str(workspace_slug or "").strip().lower()
    memberships = session.exec(
        select(EnterpriseMembership).where(
            EnterpriseMembership.username == normalized_username,
            EnterpriseMembership.status == "active",
        )
    ).all()
    workspace_ids = [membership.workspace_id for membership in memberships]
    workspaces = session.exec(
        select(EnterpriseWorkspace).where(EnterpriseWorkspace.workspace_id.in_(workspace_ids))
    ).all() if workspace_ids else []
    by_id = {workspace.workspace_id: workspace for workspace in workspaces}
    candidates = [
        (membership, by_id[membership.workspace_id])
        for membership in memberships
        if membership.workspace_id in by_id
    ]
    selected = next(
        (
            (membership, workspace)
            for membership, workspace in candidates
            if requested_slug and str(workspace.slug or "").strip().lower() == requested_slug
        ),
        None,
    )
    if not selected and candidates:
        selected = candidates[0]
    return selected


def authenticate_and_create_session(
    database_url: str,
    *,
    username: str,
    password: str,
    workspace_slug: str = "",
    ttl_hours: int = 24 * 14,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_username = str(username or "").strip().lower()
    engine = get_engine(database_url)
    with Session(engine) as session:
        user = session.exec(
            select(EnterpriseUser).where(
                EnterpriseUser.username == normalized_username,
                EnterpriseUser.status == "active",
            )
        ).first()
        if not user:
            return None
        matched, needs_upgrade = _verify_password(password, user.password_hash)
        if not matched:
            return None
        if needs_upgrade:
            user.password_hash = _hash_password(password)
            user.updated_at = _now()
            session.add(user)
        selected = _select_workspace_access(session, username=normalized_username, workspace_slug=workspace_slug)
        if not selected:
            raise ValueError(f"No active workspace access for {normalized_username}")
        membership, workspace = selected
        created_at = datetime.now().astimezone()
        expires_at = created_at + timedelta(hours=max(ttl_hours, 1))
        session_id = secrets.token_urlsafe(32)
        created_at_value = created_at.isoformat()
        expires_at_value = expires_at.isoformat()
        role_value = str(membership.role or user.role or "owner")
        session.add(
            EnterpriseSession(
                session_id=session_id,
                username=normalized_username,
                workspace_id=str(workspace.workspace_id),
                role=role_value,
                created_at=created_at_value,
                expires_at=expires_at_value,
                last_seen_at=created_at_value,
            )
        )
        session.commit()
        return {
            "user": {
                "username": user.username,
                "display_name": user.display_name,
                "role": user.role,
                "status": user.status,
            },
            "session": {
                "session_id": session_id,
                "username": normalized_username,
                "role": role_value,
                "workspace_id": str(workspace.workspace_id),
                "workspace_slug": str(workspace.slug or ""),
                "workspace_name": str(workspace.name or ""),
                "workspace_plan": str(workspace.plan or ""),
                "created_at": created_at_value,
                "expires_at": expires_at_value,
                "last_seen_at": created_at_value,
            },
        }


def create_session(
    database_url: str,
    *,
    username: str,
    role: str,
    workspace_slug: str = "",
    ttl_hours: int = 24 * 14,
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_username = str(username or "").strip().lower()
    requested_slug = str(workspace_slug or "").strip().lower()
    created_at = datetime.now().astimezone()
    expires_at = created_at + timedelta(hours=max(ttl_hours, 1))
    session_id = secrets.token_urlsafe(32)
    created_at_value = created_at.isoformat()
    expires_at_value = expires_at.isoformat()
    engine = get_engine(database_url)
    with Session(engine) as session:
        selected = _select_workspace_access(session, username=normalized_username, workspace_slug=requested_slug)
        if not selected:
            raise ValueError(f"No active workspace access for {normalized_username}")
        membership, workspace = selected
        workspace_id = str(workspace.workspace_id)
        workspace_slug_value = str(workspace.slug or "")
        workspace_name_value = str(workspace.name or "")
        workspace_plan_value = str(workspace.plan or "")
        role_value = str(membership.role or role or "owner")
        payload = EnterpriseSession(
            session_id=session_id,
            username=normalized_username,
            workspace_id=workspace_id,
            role=role_value,
            created_at=created_at_value,
            expires_at=expires_at_value,
            last_seen_at=created_at_value,
        )
        session.add(payload)
        session.commit()
    return {
        "session_id": session_id,
        "username": normalized_username,
        "role": role_value,
        "workspace_id": workspace_id,
        "workspace_slug": workspace_slug_value,
        "workspace_name": workspace_name_value,
        "workspace_plan": workspace_plan_value,
        "created_at": created_at_value,
        "expires_at": expires_at_value,
        "last_seen_at": created_at_value,
    }


def get_session(database_url: str, *, session_id: str) -> dict[str, Any] | None:
    ensure_schema(database_url)
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return None
    now = datetime.now().astimezone()
    engine = get_engine(database_url)
    with Session(engine) as session:
        session_row = session.get(EnterpriseSession, normalized_session_id)
        if not session_row:
            return None
        expires_at = datetime.fromisoformat(session_row.expires_at)
        if expires_at <= now:
            session.delete(session_row)
            session.commit()
            return None
        user = session.get(EnterpriseUser, session_row.username)
        workspace = session.get(EnterpriseWorkspace, session_row.workspace_id)
        session_row.last_seen_at = now.isoformat()
        session.add(session_row)
        session.commit()
        return {
            "session_id": session_row.session_id,
            "username": session_row.username,
            "display_name": user.display_name if user else session_row.username,
            "role": session_row.role,
            "workspace_id": session_row.workspace_id,
            "workspace_slug": workspace.slug if workspace else "",
            "workspace_name": workspace.name if workspace else "",
            "workspace_plan": workspace.plan if workspace else "",
            "created_at": session_row.created_at,
            "expires_at": session_row.expires_at,
            "last_seen_at": session_row.last_seen_at,
        }


def revoke_session(database_url: str, *, session_id: str) -> None:
    ensure_schema(database_url)
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return
    engine = get_engine(database_url)
    with Session(engine) as session:
        session_row = session.get(EnterpriseSession, normalized_session_id)
        if session_row:
            session.delete(session_row)
            session.commit()


def _load_json_list(raw_value: str) -> list[str]:
    try:
        parsed = json.loads(raw_value or "[]")
    except Exception:
        return []
    return [str(item).strip() for item in parsed if str(item).strip()]


def _lead_to_dict(row: EnterpriseLead) -> dict[str, Any]:
    return {
        "lead_id": row.lead_id,
        "company_name": row.company_name,
        "archetype": row.archetype,
        "stage": row.stage,
        "status": row.status,
        "owner": row.owner,
        "campaign_goal": row.campaign_goal,
        "service_pack": row.service_pack,
        "wedge_product": row.wedge_product,
        "starter_modules": _load_json_list(row.starter_modules_json),
        "semi_products": _load_json_list(row.semi_products_json),
        "outreach_subject": row.outreach_subject,
        "outreach_message": row.outreach_message,
        "discovery_questions": _load_json_list(row.discovery_questions_json),
        "contact_email": row.contact_email,
        "contact_phone": row.contact_phone,
        "website": row.website,
        "source": row.source,
        "source_url": row.source_url,
        "provider": row.provider,
        "score": row.score,
        "notes": row.notes,
        "created_at": row.created_at,
        "synced_at": row.synced_at,
    }


def _task_to_dict(row: EnterpriseWorkspaceTask) -> dict[str, Any]:
    return {
        "task_id": row.task_id,
        "workspace_id": row.workspace_id,
        "lead_id": row.lead_id,
        "template": row.template,
        "title": row.title,
        "owner": row.owner,
        "priority": row.priority,
        "due": row.due,
        "status": row.status,
        "notes": row.notes,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def list_leads(
    database_url: str,
    *,
    workspace_id: str,
    stage: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(EnterpriseLead).where(EnterpriseLead.workspace_id == str(workspace_id))
    if stage:
        statement = statement.where(EnterpriseLead.stage == str(stage))
    if status:
        statement = statement.where(EnterpriseLead.status == str(status))
    statement = statement.order_by(EnterpriseLead.score.desc(), EnterpriseLead.created_at.desc()).limit(max(1, int(limit)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_lead_to_dict(row) for row in rows]


def get_lead(database_url: str, *, workspace_id: str, lead_id: str) -> dict[str, Any] | None:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseLead, str(lead_id))
        if not row or row.workspace_id != str(workspace_id):
            return None
        return _lead_to_dict(row)


def load_lead_summary(database_url: str, *, workspace_id: str) -> dict[str, Any]:
    rows = list_leads(database_url, workspace_id=workspace_id, limit=1000)
    by_stage: dict[str, int] = {}
    by_status: dict[str, int] = {}
    by_pack: dict[str, int] = {}
    for row in rows:
        stage = str(row.get("stage", "")).strip() or "unknown"
        status = str(row.get("status", "")).strip() or "unknown"
        service_pack = str(row.get("service_pack", "")).strip() or "unspecified"
        by_stage[stage] = by_stage.get(stage, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
        by_pack[service_pack] = by_pack.get(service_pack, 0) + 1
    return {
        "lead_count": len(rows),
        "by_stage": by_stage,
        "by_status": by_status,
        "by_pack": by_pack,
    }


_WORKSPACE_TASK_FALLBACK_LOCK = threading.Lock()


def _runtime_fallback_root() -> Path:
    configured = str(os.getenv("SUPERMEGA_RUNTIME_DIR", "")).strip()
    root = Path(configured).expanduser() if configured else Path("/tmp/supermega" if os.getenv("VERCEL") else "pilot-data")
    root.mkdir(parents=True, exist_ok=True)
    return root


def _workspace_task_fallback_path() -> Path:
    return _runtime_fallback_root() / "workspace_tasks_fallback.json"


def _workspace_task_db_unavailable(exc: Exception) -> bool:
    text_value = f"{type(exc).__name__}: {exc}".lower()
    return any(
        marker in text_value
        for marker in (
            "operationalerror",
            "connection failed",
            "connection refused",
            "connection timeout",
            "connect timeout",
            "timed out",
            "quota",
            "too many connections",
            "could not translate host",
            "server closed the connection",
        )
    )


def _read_workspace_task_fallback_rows() -> list[dict[str, Any]]:
    path = _workspace_task_fallback_path()
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    return [row for row in rows if isinstance(row, dict)]


def _write_workspace_task_fallback_rows(rows: list[dict[str, Any]]) -> None:
    path = _workspace_task_fallback_path()
    payload = {"updated_at": _now(), "rows": rows[-1000:]}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _filter_workspace_task_rows(
    rows: list[dict[str, Any]],
    *,
    workspace_id: str,
    status: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    normalized_workspace_id = str(workspace_id)
    normalized_status = str(status or "").strip()
    filtered = [
        row
        for row in rows
        if str(row.get("workspace_id", "")).strip() == normalized_workspace_id
        and (not normalized_status or str(row.get("status", "")).strip() == normalized_status)
    ]
    filtered.sort(
        key=lambda row: (
            str(row.get("updated_at", "")).strip(),
            str(row.get("created_at", "")).strip(),
        ),
        reverse=True,
    )
    return filtered[: max(1, int(limit))]


def _fallback_workspace_task_from_row(
    row: dict[str, Any],
    *,
    workspace_id: str,
    now: str,
) -> tuple[str, dict[str, Any]] | None:
    title = str(row.get("title", "")).strip()
    if not title:
        return None
    lead_id = str(row.get("lead_id", "")).strip()
    template = str(row.get("template", "")).strip() or "manual"
    dedupe_seed = (
        "|".join([str(workspace_id), template, lead_id, title.lower()])
        if lead_id or template != "manual"
        else ""
    )
    task_id = str(row.get("task_id", "")).strip() or (_stable_key("TASK", dedupe_seed) if dedupe_seed else secrets.token_urlsafe(16))
    task = {
        "task_id": task_id,
        "workspace_id": str(workspace_id),
        "lead_id": lead_id,
        "template": template,
        "title": title,
        "owner": str(row.get("owner", "")).strip() or "Owner",
        "priority": str(row.get("priority", "")).strip() or "Medium",
        "due": str(row.get("due", "")).strip() or "This week",
        "status": str(row.get("status", "")).strip() or "open",
        "notes": str(row.get("notes", "")).strip(),
        "created_at": str(row.get("created_at", "")).strip() or now,
        "updated_at": now,
        "storage_mode": "runtime_fallback",
    }
    return task_id, task


def _fallback_list_workspace_tasks(
    *,
    workspace_id: str,
    status: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    with _WORKSPACE_TASK_FALLBACK_LOCK:
        rows = _read_workspace_task_fallback_rows()
        return _filter_workspace_task_rows(rows, workspace_id=workspace_id, status=status, limit=limit)


def _fallback_add_workspace_tasks(*, workspace_id: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    now = _now()
    saved_ids: list[str] = []
    with _WORKSPACE_TASK_FALLBACK_LOCK:
        existing_rows = _read_workspace_task_fallback_rows()
        by_id = {str(row.get("task_id", "")).strip(): row for row in existing_rows if str(row.get("task_id", "")).strip()}
        for row in rows:
            built = _fallback_workspace_task_from_row(row, workspace_id=workspace_id, now=now)
            if not built:
                continue
            task_id, task = built
            if task_id in by_id:
                task["created_at"] = str(by_id[task_id].get("created_at", "")).strip() or task["created_at"]
            by_id[task_id] = task
            saved_ids.append(task_id)
        merged_rows = list(by_id.values())
        _write_workspace_task_fallback_rows(merged_rows)
        scoped_rows = _filter_workspace_task_rows(merged_rows, workspace_id=workspace_id, limit=200)
    return {
        "status": "ready",
        "mode": "runtime_fallback",
        "saved_count": len(saved_ids),
        "saved_task_ids": saved_ids,
        "rows": scoped_rows,
    }


def _fallback_update_workspace_task(
    *,
    workspace_id: str,
    task_id: str,
    status: str | None = None,
    owner: str | None = None,
    priority: str | None = None,
    due: str | None = None,
    title: str | None = None,
    notes: str | None = None,
    template: str | None = None,
    create_if_missing: bool = False,
) -> dict[str, Any] | None:
    now = _now()
    with _WORKSPACE_TASK_FALLBACK_LOCK:
        rows = _read_workspace_task_fallback_rows()
        target = next(
            (
                row
                for row in rows
                if str(row.get("task_id", "")).strip() == str(task_id).strip()
                and str(row.get("workspace_id", "")).strip() == str(workspace_id)
            ),
            None,
        )
        if target is None:
            if not create_if_missing:
                return None
            target = {
                "task_id": str(task_id),
                "workspace_id": str(workspace_id),
                "lead_id": "",
                "template": str(template or "").strip() or "serverless_recovered_task",
                "title": str(title or "").strip() or "Recovered workspace task",
                "owner": "Owner",
                "priority": "Medium",
                "due": "This week",
                "status": "open",
                "notes": "",
                "created_at": now,
                "storage_mode": "runtime_fallback",
            }
            rows.append(target)
        if status is not None:
            target["status"] = str(status).strip() or target.get("status", "open")
        if owner is not None:
            target["owner"] = str(owner).strip() or target.get("owner", "Owner")
        if priority is not None:
            target["priority"] = str(priority).strip() or target.get("priority", "Medium")
        if due is not None:
            target["due"] = str(due).strip() or target.get("due", "This week")
        if title is not None:
            target["title"] = str(title).strip() or target.get("title", "Workspace task")
        if notes is not None:
            target["notes"] = str(notes)
        if template is not None and str(template).strip():
            target["template"] = str(template).strip()
        target["updated_at"] = now
        target["storage_mode"] = "runtime_fallback"
        _write_workspace_task_fallback_rows(rows)
        return dict(target)


def _fallback_remove_workspace_task(*, workspace_id: str, task_id: str) -> bool:
    with _WORKSPACE_TASK_FALLBACK_LOCK:
        rows = _read_workspace_task_fallback_rows()
        next_rows = [
            row
            for row in rows
            if not (
                str(row.get("task_id", "")).strip() == str(task_id).strip()
                and str(row.get("workspace_id", "")).strip() == str(workspace_id)
            )
        ]
        if len(next_rows) == len(rows):
            return False
        _write_workspace_task_fallback_rows(next_rows)
        return True


def list_workspace_tasks(
    database_url: str,
    *,
    workspace_id: str,
    status: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    try:
        ensure_schema(database_url)
        engine = get_engine(database_url)
        statement = select(EnterpriseWorkspaceTask).where(EnterpriseWorkspaceTask.workspace_id == str(workspace_id))
        if status:
            statement = statement.where(EnterpriseWorkspaceTask.status == str(status))
        statement = statement.order_by(EnterpriseWorkspaceTask.updated_at.desc(), EnterpriseWorkspaceTask.created_at.desc()).limit(max(1, int(limit)))
        with Session(engine) as session:
            rows = session.exec(statement).all()
        return [_task_to_dict(row) for row in rows]
    except Exception as exc:
        if _workspace_task_db_unavailable(exc):
            return _fallback_list_workspace_tasks(workspace_id=workspace_id, status=status, limit=limit)
        raise


def add_workspace_tasks(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    try:
        ensure_schema(database_url)
        now = _now()
        engine = get_engine(database_url)
        saved_ids: list[str] = []
        saved_rows: list[dict[str, Any]] = []
        with Session(engine) as session:
            for row in rows:
                title = str(row.get("title", "")).strip()
                if not title:
                    continue
                lead_id = str(row.get("lead_id", "")).strip()
                template = str(row.get("template", "")).strip() or "manual"
                dedupe_seed = (
                    "|".join([str(workspace_id), template, lead_id, title.lower()])
                    if lead_id or template != "manual"
                    else ""
                )
                task_id = _stable_key("TASK", dedupe_seed) if dedupe_seed else secrets.token_urlsafe(16)
                task = session.get(EnterpriseWorkspaceTask, task_id)
                if not task:
                    task = EnterpriseWorkspaceTask(
                        task_id=task_id,
                        workspace_id=str(workspace_id),
                        created_at=now,
                        updated_at=now,
                        title=title,
                    )
                task.workspace_id = str(workspace_id)
                task.lead_id = lead_id
                task.template = template
                task.title = title
                task.owner = str(row.get("owner", "")).strip() or "Owner"
                task.priority = str(row.get("priority", "")).strip() or "Medium"
                task.due = str(row.get("due", "")).strip() or "This week"
                task.status = str(row.get("status", "")).strip() or "open"
                task.notes = str(row.get("notes", "")).strip()
                task.updated_at = now
                session.add(task)
                saved_ids.append(task_id)
                saved_rows.append(_task_to_dict(task))
            session.commit()

        return {
            "status": "ready",
            "saved_count": len(saved_ids),
            "saved_task_ids": saved_ids,
            "rows": saved_rows,
        }
    except Exception as exc:
        if _workspace_task_db_unavailable(exc):
            return _fallback_add_workspace_tasks(workspace_id=workspace_id, rows=rows)
        raise


def add_leads_with_tasks(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
    campaign_goal: str = "",
    source: str = "lead_to_pilot",
    default_task_owner: str = "Sales",
    default_task_priority: str = "High",
    default_task_due: str = "Today",
    default_task_notes: str = "First outreach",
) -> dict[str, Any]:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    saved_lead_ids: list[str] = []
    saved_task_ids: list[str] = []
    with Session(engine) as session:
        for row in rows:
            company_name = str(row.get("name") or row.get("company_name") or "").strip()
            if not company_name:
                continue
            source_url = str(row.get("source_url", "")).strip()
            lead_id = _stable_key("LEAD", f"{workspace_id}:{company_name}:{source_url or source}:{campaign_goal}")
            lead = session.get(EnterpriseLead, lead_id)
            if not lead:
                lead = EnterpriseLead(
                    lead_id=lead_id,
                    workspace_id=str(workspace_id),
                    created_at=now,
                    company_name=company_name,
                    synced_at=now,
                )
            lead.archetype = str(row.get("archetype", "")).strip()
            lead.stage = str(row.get("stage", "")).strip() or "offer_ready"
            lead.status = str(row.get("status", "")).strip() or "open"
            lead.owner = str(row.get("owner", "")).strip() or "Revenue Pod"
            lead.campaign_goal = str(campaign_goal or row.get("campaign_goal", "")).strip()
            lead.service_pack = str(row.get("service_pack", "")).strip()
            lead.wedge_product = str(row.get("wedge_product", "")).strip()
            lead.starter_modules_json = json.dumps(row.get("starter_modules", []), ensure_ascii=False)
            lead.semi_products_json = json.dumps(row.get("semi_products", []), ensure_ascii=False)
            lead.outreach_subject = str(row.get("outreach_subject", "")).strip()
            lead.outreach_message = str(row.get("outreach_message", "")).strip()
            lead.discovery_questions_json = json.dumps(row.get("discovery_questions", []), ensure_ascii=False)
            lead.contact_email = str(row.get("email") or row.get("contact_email") or "").strip()
            lead.contact_phone = str(row.get("phone") or row.get("contact_phone") or "").strip()
            lead.website = str(row.get("website", "")).strip()
            lead.source = str(row.get("source", "")).strip() or str(source or "").strip()
            lead.source_url = source_url
            lead.provider = str(row.get("provider", "")).strip()
            try:
                lead.score = int(row.get("score", 0) or 0)
            except Exception:
                lead.score = 0
            lead.notes = str(row.get("notes", "")).strip()
            lead.synced_at = now
            session.add(lead)
            saved_lead_ids.append(lead_id)

            title = str(row.get("task_title", "")).strip() or f"Follow up {company_name}"
            template = str(row.get("task_template", "")).strip() or "lead_follow_up"
            dedupe_seed = "|".join([str(workspace_id), template, lead_id, title.lower()])
            task_id = _stable_key("TASK", dedupe_seed)
            task = session.get(EnterpriseWorkspaceTask, task_id)
            if not task:
                task = EnterpriseWorkspaceTask(
                    task_id=task_id,
                    workspace_id=str(workspace_id),
                    created_at=now,
                    updated_at=now,
                    title=title,
                )
            task.workspace_id = str(workspace_id)
            task.lead_id = lead_id
            task.template = template
            task.title = title
            task.owner = str(row.get("task_owner", "")).strip() or default_task_owner
            task.priority = str(row.get("task_priority", "")).strip() or default_task_priority
            task.due = str(row.get("task_due", "")).strip() or default_task_due
            task.status = str(row.get("task_status", "")).strip() or "open"
            task.notes = str(row.get("task_notes", "")).strip() or default_task_notes
            task.updated_at = now
            session.add(task)
            saved_task_ids.append(task_id)
        session.commit()

    return {
        "status": "ready",
        "saved_count": len(saved_lead_ids),
        "saved_lead_ids": saved_lead_ids,
        "saved_task_count": len(saved_task_ids),
        "saved_task_ids": saved_task_ids,
        "rows": list_leads(database_url, workspace_id=workspace_id, limit=100),
        "tasks": list_workspace_tasks(database_url, workspace_id=workspace_id, limit=200),
        "summary": load_lead_summary(database_url, workspace_id=workspace_id),
        "saved_at": now,
    }


def update_workspace_task(
    database_url: str,
    *,
    workspace_id: str,
    task_id: str,
    status: str | None = None,
    owner: str | None = None,
    priority: str | None = None,
    due: str | None = None,
    title: str | None = None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    try:
        ensure_schema(database_url)
        engine = get_engine(database_url)
        with Session(engine) as session:
            row = session.get(EnterpriseWorkspaceTask, str(task_id))
            if not row or row.workspace_id != str(workspace_id):
                return None
            if status is not None:
                row.status = str(status).strip() or row.status
            if owner is not None:
                row.owner = str(owner).strip() or row.owner
            if priority is not None:
                row.priority = str(priority).strip() or row.priority
            if due is not None:
                row.due = str(due).strip() or row.due
            if title is not None:
                row.title = str(title).strip() or row.title
            if notes is not None:
                row.notes = str(notes).strip()
            row.updated_at = _now()
            session.add(row)
            session.commit()
            session.refresh(row)
            return _task_to_dict(row)
    except Exception as exc:
        if _workspace_task_db_unavailable(exc):
            return _fallback_update_workspace_task(
                workspace_id=workspace_id,
                task_id=task_id,
                status=status,
                owner=owner,
                priority=priority,
                due=due,
                title=title,
                notes=notes,
            )
        raise


def upsert_workspace_task_by_id(
    database_url: str,
    *,
    workspace_id: str,
    task_id: str,
    status: str | None = None,
    owner: str | None = None,
    priority: str | None = None,
    due: str | None = None,
    title: str | None = None,
    notes: str | None = None,
    template: str | None = None,
) -> dict[str, Any]:
    try:
        ensure_schema(database_url)
        engine = get_engine(database_url)
        now = _now()
        with Session(engine) as session:
            row = session.get(EnterpriseWorkspaceTask, str(task_id))
            if row and row.workspace_id != str(workspace_id):
                return _task_to_dict(row)
            if not row:
                row = EnterpriseWorkspaceTask(
                    task_id=str(task_id),
                    workspace_id=str(workspace_id),
                    created_at=now,
                    updated_at=now,
                    title=(str(title or "").strip() or "Recovered workspace task"),
                    template=(str(template or "").strip() or "serverless_recovered_task"),
                )
            if status is not None:
                row.status = str(status).strip() or row.status
            if owner is not None:
                row.owner = str(owner).strip() or row.owner
            if priority is not None:
                row.priority = str(priority).strip() or row.priority
            if due is not None:
                row.due = str(due).strip() or row.due
            if title is not None:
                row.title = str(title).strip() or row.title
            if notes is not None:
                row.notes = str(notes)
            row.updated_at = now
            session.add(row)
            session.commit()
            session.refresh(row)
            return _task_to_dict(row)
    except Exception as exc:
        if _workspace_task_db_unavailable(exc):
            row = _fallback_update_workspace_task(
                workspace_id=workspace_id,
                task_id=task_id,
                status=status,
                owner=owner,
                priority=priority,
                due=due,
                title=title,
                notes=notes,
                template=template,
                create_if_missing=True,
            )
            if row is not None:
                return row
        raise


def remove_workspace_task(
    database_url: str,
    *,
    workspace_id: str,
    task_id: str,
) -> bool:
    try:
        ensure_schema(database_url)
        engine = get_engine(database_url)
        with Session(engine) as session:
            row = session.get(EnterpriseWorkspaceTask, str(task_id))
            if not row or row.workspace_id != str(workspace_id):
                return False
            session.delete(row)
            session.commit()
            return True
    except Exception as exc:
        if _workspace_task_db_unavailable(exc):
            return _fallback_remove_workspace_task(workspace_id=workspace_id, task_id=task_id)
        raise


def list_lead_hunt_profiles(
    database_url: str,
    *,
    workspace_id: str,
    status: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(EnterpriseLeadHuntProfile).where(EnterpriseLeadHuntProfile.workspace_id == str(workspace_id))
    if status:
        statement = statement.where(EnterpriseLeadHuntProfile.status == str(status))
    statement = statement.order_by(
        EnterpriseLeadHuntProfile.updated_at.desc(),
        EnterpriseLeadHuntProfile.created_at.desc(),
    ).limit(max(1, int(limit)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_hunt_profile_to_dict(row) for row in rows]


def get_lead_hunt_profile(
    database_url: str,
    *,
    workspace_id: str,
    hunt_id: str,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseLeadHuntProfile, str(hunt_id))
        if not row or row.workspace_id != str(workspace_id):
            return None
        return _hunt_profile_to_dict(row)


def save_lead_hunt_profile(
    database_url: str,
    *,
    workspace_id: str,
    hunt_id: str | None = None,
    name: str,
    owner: str = "Revenue Pod",
    query: str = "",
    raw_text: str = "",
    keywords: list[str] | None = None,
    sources: list[str] | None = None,
    limit: int = 8,
    campaign_goal: str = "",
    export_workspace: bool = True,
    status: str = "active",
) -> dict[str, Any]:
    ensure_schema(database_url)
    now = _now()
    keywords_payload = [str(item).strip() for item in (keywords or []) if str(item).strip()]
    sources_payload = [str(item).strip() for item in (sources or []) if str(item).strip()]
    normalized_name = str(name or "").strip() or "Untitled hunt"
    normalized_owner = str(owner or "").strip() or "Revenue Pod"
    normalized_query = str(query or "").strip()
    normalized_raw_text = str(raw_text or "").strip()
    normalized_campaign_goal = str(campaign_goal or "").strip()
    normalized_status = str(status or "").strip() or "active"
    normalized_hunt_id = str(hunt_id or "").strip() or _stable_key(
        "HUNT",
        "|".join(
            [
                str(workspace_id),
                normalized_name,
                normalized_query,
                normalized_campaign_goal,
            ]
        ),
    )
    engine = get_engine(database_url)
    with Session(engine) as session:
        profile = session.get(EnterpriseLeadHuntProfile, normalized_hunt_id)
        if not profile:
            profile = EnterpriseLeadHuntProfile(
                hunt_id=normalized_hunt_id,
                workspace_id=str(workspace_id),
                created_at=now,
                updated_at=now,
                name=normalized_name,
            )
        profile.updated_at = now
        profile.name = normalized_name
        profile.owner = normalized_owner
        profile.status = normalized_status
        profile.query = normalized_query
        profile.raw_text = normalized_raw_text
        profile.keywords_json = json.dumps(keywords_payload, ensure_ascii=False)
        profile.sources_json = json.dumps(sources_payload, ensure_ascii=False)
        profile.limit = max(1, min(int(limit or 8), 20))
        profile.campaign_goal = normalized_campaign_goal
        profile.export_workspace = bool(export_workspace)
        session.add(profile)
        session.commit()
        session.refresh(profile)
        return _hunt_profile_to_dict(profile)


def record_lead_hunt_run(
    database_url: str,
    *,
    workspace_id: str,
    hunt_id: str,
    provider: str,
    engine_name: str,
    saved_count: int,
    summary: str,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        profile = session.get(EnterpriseLeadHuntProfile, str(hunt_id))
        if not profile or profile.workspace_id != str(workspace_id):
            return None
        profile.updated_at = now
        profile.last_run_at = now
        profile.last_provider = str(provider or "").strip()
        profile.last_engine = str(engine_name or "").strip()
        profile.last_saved_count = max(0, int(saved_count or 0))
        profile.last_summary = str(summary or "").strip()
        session.add(profile)
        session.commit()
        session.refresh(profile)
        return _hunt_profile_to_dict(profile)


def create_agent_run(
    database_url: str,
    *,
    workspace_id: str,
    job_type: str,
    source: str = "manual",
    payload: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
    max_attempts: int = 1,
    scheduled_for: str = "",
    triggered_by: str = "system",
    related_entity_type: str = "",
    related_entity_id: str = "",
) -> dict[str, Any]:
    ensure_schema(database_url)
    normalized_key = str(idempotency_key or "").strip() or None
    engine = get_engine(database_url)
    with Session(engine) as session:
        if normalized_key:
            existing = session.exec(
                select(EnterpriseAgentRun).where(
                    EnterpriseAgentRun.workspace_id == str(workspace_id),
                    EnterpriseAgentRun.idempotency_key == normalized_key,
                )
            ).first()
            if existing:
                return _agent_run_to_dict(existing)

        now = _now()
        normalized_job_type = str(job_type or "").strip() or "unknown"
        normalized_source = str(source or "").strip() or "manual"
        normalized_triggered_by = str(triggered_by or "").strip() or "system"
        persisted_payload = _payload_with_agent_evidence_contract(
            job_type=normalized_job_type,
            source=normalized_source,
            triggered_by=normalized_triggered_by,
            payload=payload,
        )
        row = EnterpriseAgentRun(
            run_id=secrets.token_urlsafe(16),
            workspace_id=str(workspace_id),
            job_type=normalized_job_type,
            source=normalized_source,
            idempotency_key=normalized_key,
            status="queued",
            payload_json=json.dumps(persisted_payload, ensure_ascii=False),
            result_json="{}",
            error_text="",
            attempt_count=0,
            max_attempts=max(1, int(max_attempts or 1)),
            scheduled_for=str(scheduled_for or "").strip(),
            started_at="",
            finished_at="",
            summary="",
            related_entity_type=str(related_entity_type or "").strip(),
            related_entity_id=str(related_entity_id or "").strip(),
            triggered_by=normalized_triggered_by,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        session.commit()
        session.refresh(row)
        return _agent_run_to_dict(row)


def get_agent_run(
    database_url: str,
    *,
    workspace_id: str,
    run_id: str,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseAgentRun, str(run_id))
        if not row or row.workspace_id != str(workspace_id):
            return None
        return _agent_run_to_dict(row)


def list_agent_runs(
    database_url: str,
    *,
    workspace_id: str,
    job_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(EnterpriseAgentRun).where(EnterpriseAgentRun.workspace_id == str(workspace_id))
    if job_type:
        statement = statement.where(EnterpriseAgentRun.job_type == str(job_type))
    if status:
        statement = statement.where(EnterpriseAgentRun.status == str(status))
    statement = statement.order_by(EnterpriseAgentRun.created_at.desc()).limit(max(1, int(limit)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_agent_run_to_dict(row) for row in rows]


def list_agent_run_headers(
    database_url: str,
    *,
    workspace_id: str,
    job_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return lightweight agent-run metadata without loading large result_json blobs."""
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(
        EnterpriseAgentRun.run_id,
        EnterpriseAgentRun.workspace_id,
        EnterpriseAgentRun.job_type,
        EnterpriseAgentRun.source,
        EnterpriseAgentRun.started_at,
        EnterpriseAgentRun.finished_at,
        EnterpriseAgentRun.status,
        EnterpriseAgentRun.summary,
        EnterpriseAgentRun.payload_json,
        EnterpriseAgentRun.error_text,
        EnterpriseAgentRun.attempt_count,
        EnterpriseAgentRun.max_attempts,
        EnterpriseAgentRun.scheduled_for,
        EnterpriseAgentRun.related_entity_type,
        EnterpriseAgentRun.related_entity_id,
        EnterpriseAgentRun.triggered_by,
        EnterpriseAgentRun.created_at,
        EnterpriseAgentRun.updated_at,
    ).where(EnterpriseAgentRun.workspace_id == str(workspace_id))
    if job_type:
        statement = statement.where(EnterpriseAgentRun.job_type == str(job_type))
    if status:
        statement = statement.where(EnterpriseAgentRun.status == str(status))
    statement = statement.order_by(EnterpriseAgentRun.created_at.desc()).limit(max(1, int(limit)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    headers: list[dict[str, Any]] = []
    for row in rows:
        (
            run_id,
            workspace_id_value,
            job_type_value,
            source,
            started_at,
            finished_at,
            status_value,
            summary,
            payload_json,
            error_text,
            attempt_count,
            max_attempts,
            scheduled_for,
            related_entity_type,
            related_entity_id,
            triggered_by,
            created_at,
            updated_at,
        ) = row
        headers.append(
            {
                "run_id": run_id,
                "id": run_id,
                "workspace_id": workspace_id_value,
                "job_type": job_type_value,
                "source": source,
                "started_at": started_at,
                "finished_at": finished_at,
                "completed_at": finished_at,
                "status": status_value,
                "summary": summary,
                "payload": _json_object(payload_json),
                "result": {},
                "error_text": error_text,
                "attempt_count": attempt_count,
                "max_attempts": max_attempts,
                "scheduled_for": scheduled_for,
                "related_entity_type": related_entity_type,
                "related_entity_id": related_entity_id,
                "triggered_by": triggered_by,
                "created_at": created_at,
                "updated_at": updated_at,
                "compact": True,
            }
        )
    return headers


def claim_agent_runs(
    database_url: str,
    *,
    workspace_id: str,
    job_types: list[str] | None = None,
    limit: int = 1,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    now = _now()
    normalized_job_types = [str(item or "").strip() for item in (job_types or []) if str(item or "").strip()]
    engine = get_engine(database_url)
    with Session(engine) as session:
        statement = select(EnterpriseAgentRun).where(
            EnterpriseAgentRun.workspace_id == str(workspace_id),
            EnterpriseAgentRun.status == "queued",
            or_(EnterpriseAgentRun.scheduled_for == "", EnterpriseAgentRun.scheduled_for <= now),
        )
        if normalized_job_types:
            statement = statement.where(EnterpriseAgentRun.job_type.in_(normalized_job_types))
        statement = statement.order_by(EnterpriseAgentRun.created_at.asc()).limit(max(1, int(limit or 1)))
        if engine.dialect.name != "sqlite":
            statement = statement.with_for_update(skip_locked=True)
        rows = list(session.exec(statement).all())
        if not rows:
            return []
        for row in rows:
            row.status = "running"
            row.started_at = now
            row.finished_at = ""
            row.error_text = ""
            row.attempt_count = int(row.attempt_count or 0) + 1
            row.updated_at = now
            session.add(row)
        session.commit()
        for row in rows:
            session.refresh(row)
        return [_agent_run_to_dict(row) for row in rows]


def start_agent_run(
    database_url: str,
    *,
    workspace_id: str,
    run_id: str,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseAgentRun, str(run_id))
        if not row or row.workspace_id != str(workspace_id):
            return None
        row.status = "running"
        row.started_at = now
        row.finished_at = ""
        row.error_text = ""
        row.attempt_count = int(row.attempt_count or 0) + 1
        row.updated_at = now
        session.add(row)
        session.commit()
        session.refresh(row)
        return _agent_run_to_dict(row)


def claim_agent_runs(
    database_url: str,
    *,
    workspace_id: str,
    limit: int = 10,
    job_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    normalized_job_types = [str(item or "").strip().lower() for item in (job_types or []) if str(item or "").strip()]
    with Session(engine) as session:
        statement = select(EnterpriseAgentRun).where(
            EnterpriseAgentRun.workspace_id == str(workspace_id),
            EnterpriseAgentRun.status == "queued",
            or_(EnterpriseAgentRun.scheduled_for == "", EnterpriseAgentRun.scheduled_for <= now),
        )
        if normalized_job_types:
            statement = statement.where(EnterpriseAgentRun.job_type.in_(normalized_job_types))
        statement = statement.order_by(EnterpriseAgentRun.created_at.asc()).limit(max(1, int(limit or 1)))
        bind = session.get_bind()
        dialect_name = str(getattr(getattr(bind, "dialect", None), "name", "")).strip().lower()
        if dialect_name == "postgresql":
            statement = statement.with_for_update(skip_locked=True)
        rows = list(session.exec(statement).all())
        claimed: list[EnterpriseAgentRun] = []
        for row in rows:
            row.status = "running"
            row.started_at = now
            row.finished_at = ""
            row.error_text = ""
            row.attempt_count = int(row.attempt_count or 0) + 1
            row.updated_at = now
            session.add(row)
            claimed.append(row)
        session.commit()
        for row in claimed:
            session.refresh(row)
        return [_agent_run_to_dict(row) for row in claimed]


def complete_agent_run(
    database_url: str,
    *,
    workspace_id: str,
    run_id: str,
    status: str,
    summary: str = "",
    result: dict[str, Any] | None = None,
    error_text: str = "",
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    now = _now()
    normalized_status = str(status or "").strip() or "ready"
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseAgentRun, str(run_id))
        if not row or row.workspace_id != str(workspace_id):
            return None
        payload = _json_object(row.payload_json)
        result_payload = dict(result or {})
        evidence_contract = _agent_run_evidence_contract(
            job_type=row.job_type,
            source=row.source,
            triggered_by=row.triggered_by,
            status=normalized_status,
            summary=str(summary or "").strip(),
            error_text=str(error_text or "").strip(),
            payload=payload,
            result=result_payload,
        )
        result_payload["evidence_contract"] = evidence_contract
        row.status = normalized_status
        row.finished_at = now
        row.summary = str(summary or "").strip()
        row.result_json = json.dumps(result_payload, ensure_ascii=False)
        row.error_text = str(error_text or "").strip()
        row.updated_at = now
        session.add(row)
        session.commit()
        session.refresh(row)
        return _agent_run_to_dict(row)


def add_leads(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
    campaign_goal: str = "",
    source: str = "lead_to_pilot",
) -> dict[str, Any]:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    saved_ids: list[str] = []
    with Session(engine) as session:
        for row in rows:
            company_name = str(row.get("name") or row.get("company_name") or "").strip()
            if not company_name:
                continue
            source_url = str(row.get("source_url", "")).strip()
            lead_id = _stable_key("LEAD", f"{workspace_id}:{company_name}:{source_url or source}:{campaign_goal}")
            lead = session.get(EnterpriseLead, lead_id)
            if not lead:
                lead = EnterpriseLead(
                    lead_id=lead_id,
                    workspace_id=str(workspace_id),
                    created_at=now,
                    company_name=company_name,
                    synced_at=now,
                )
            lead.archetype = str(row.get("archetype", "")).strip()
            lead.stage = str(row.get("stage", "")).strip() or "offer_ready"
            lead.status = str(row.get("status", "")).strip() or "open"
            lead.owner = str(row.get("owner", "")).strip() or "Revenue Pod"
            lead.campaign_goal = str(campaign_goal or row.get("campaign_goal", "")).strip()
            lead.service_pack = str(row.get("service_pack", "")).strip()
            lead.wedge_product = str(row.get("wedge_product", "")).strip()
            lead.starter_modules_json = json.dumps(row.get("starter_modules", []), ensure_ascii=False)
            lead.semi_products_json = json.dumps(row.get("semi_products", []), ensure_ascii=False)
            lead.outreach_subject = str(row.get("outreach_subject", "")).strip()
            lead.outreach_message = str(row.get("outreach_message", "")).strip()
            lead.discovery_questions_json = json.dumps(row.get("discovery_questions", []), ensure_ascii=False)
            lead.contact_email = str(row.get("email") or row.get("contact_email") or "").strip()
            lead.contact_phone = str(row.get("phone") or row.get("contact_phone") or "").strip()
            lead.website = str(row.get("website", "")).strip()
            lead.source = str(row.get("source", "")).strip() or str(source or "").strip()
            lead.source_url = source_url
            lead.provider = str(row.get("provider", "")).strip()
            try:
                lead.score = int(row.get("score", 0) or 0)
            except Exception:
                lead.score = 0
            lead.notes = str(row.get("notes", "")).strip()
            lead.synced_at = now
            session.add(lead)
            saved_ids.append(lead_id)
        session.commit()
    return {
        "status": "ready",
        "saved_count": len(saved_ids),
        "saved_lead_ids": saved_ids,
        "rows": list_leads(database_url, workspace_id=workspace_id, limit=100),
        "summary": load_lead_summary(database_url, workspace_id=workspace_id),
        "saved_at": now,
    }


def update_lead(
    database_url: str,
    *,
    workspace_id: str,
    lead_id: str,
    stage: str | None = None,
    status: str | None = None,
    owner: str | None = None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        lead = session.get(EnterpriseLead, str(lead_id))
        if not lead or lead.workspace_id != str(workspace_id):
            return None
        if stage is not None:
            lead.stage = str(stage).strip() or lead.stage
        if status is not None:
            lead.status = str(status).strip() or lead.status
        if owner is not None:
            lead.owner = str(owner).strip() or lead.owner
        if notes is not None:
            lead.notes = str(notes).strip()
        lead.synced_at = _now()
        session.add(lead)
        session.commit()
        session.refresh(lead)
        return _lead_to_dict(lead)


def save_lead_offer_packet(
    database_url: str,
    *,
    workspace_id: str,
    lead_id: str,
    offer_id: str,
    offer_name: str,
    price_tier: str = "",
    starter_price: str = "",
    pilot_price: str = "",
    retainer_price: str = "",
    proof_route: str = "",
    proposal_scope: str = "",
    source_inputs: list[str] | None = None,
    implementation_checklist: list[str] | None = None,
    deliverables: list[str] | None = None,
    agent_jobs: list[str] | None = None,
    outreach_subject: str = "",
    outreach_message: str = "",
    discovery_questions: list[str] | None = None,
    actor: str = "Revenue Pod",
) -> dict[str, Any] | None:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    synced_at = _now()
    source_values = [str(item).strip() for item in (source_inputs or []) if str(item).strip()]
    checklist_values = [str(item).strip() for item in (implementation_checklist or []) if str(item).strip()]
    deliverable_values = [str(item).strip() for item in (deliverables or []) if str(item).strip()]
    agent_job_values = [str(item).strip() for item in (agent_jobs or []) if str(item).strip()]
    question_values = [str(item).strip() for item in (discovery_questions or []) if str(item).strip()]
    normalized_offer_name = str(offer_name or "").strip() or str(offer_id or "").strip() or "SuperMega offer"
    normalized_offer_id = str(offer_id or "").strip() or normalized_offer_name.lower().replace(" ", "-")
    normalized_tier = str(price_tier or "").strip() or "starter-sprint"
    normalized_scope = str(proposal_scope or "").strip()
    if not normalized_scope:
        normalized_scope = f"Launch {normalized_offer_name} with source mapping, review queue, proof route, and manager handoff."
    packet = {
        "offer_id": normalized_offer_id,
        "offer_name": normalized_offer_name,
        "price_tier": normalized_tier,
        "starter_price": str(starter_price or "").strip(),
        "pilot_price": str(pilot_price or "").strip(),
        "retainer_price": str(retainer_price or "").strip(),
        "proof_route": str(proof_route or "").strip(),
        "proposal_scope": normalized_scope,
        "source_inputs": source_values,
        "implementation_checklist": checklist_values,
        "deliverables": deliverable_values,
        "agent_jobs": agent_job_values,
        "review_gate": "Founder approval required before sending proposal or outreach.",
        "saved_at": synced_at,
    }
    with Session(engine) as session:
        lead = session.get(EnterpriseLead, str(lead_id))
        if not lead or lead.workspace_id != str(workspace_id):
            return None
        lead.service_pack = normalized_offer_name
        lead.wedge_product = normalized_offer_name
        lead.starter_modules_json = json.dumps(deliverable_values[:6] or [normalized_offer_name], ensure_ascii=False)
        lead.semi_products_json = json.dumps(agent_job_values[:6] or ["Review queue", "Proof packet"], ensure_ascii=False)
        if outreach_subject:
            lead.outreach_subject = str(outreach_subject).strip()
        if outreach_message:
            lead.outreach_message = str(outreach_message).strip()
        if question_values:
            lead.discovery_questions_json = json.dumps(question_values, ensure_ascii=False)
        lead.stage = "proposal" if lead.stage in {"offer_ready", "contacted", "discovery"} else lead.stage
        lead.status = "active" if lead.stage in {"contacted", "discovery", "proposal"} else lead.status
        lead.notes = "\n".join(
            part
            for part in [
                lead.notes.strip(),
                f"Commercial offer packet: {normalized_offer_name}",
                f"Price tier: {normalized_tier}",
                f"Proof route: {str(proof_route or '').strip()}",
                f"Review gate: Founder approval required before sending.",
            ]
            if part
        )
        lead.synced_at = synced_at
        session.add(lead)
        session.commit()
        session.refresh(lead)
    activity = add_lead_activity(
        database_url,
        workspace_id=workspace_id,
        lead_id=lead_id,
        actor=actor,
        activity_type="offer_packet",
        channel="commercial_system",
        direction="internal",
        message=json.dumps(packet, ensure_ascii=False),
        stage_after="proposal",
        next_step="Review the packet, approve outbound copy, then send the scoped proposal.",
    )
    refreshed = get_lead(database_url, workspace_id=workspace_id, lead_id=lead_id)
    return {
        "lead": refreshed,
        "offer_packet": packet,
        "activity": activity,
    }


def add_lead_activity(
    database_url: str,
    *,
    workspace_id: str,
    lead_id: str,
    actor: str,
    activity_type: str,
    channel: str,
    direction: str,
    message: str,
    stage_after: str = "",
    next_step: str = "",
) -> dict[str, Any]:
    ensure_schema(database_url)
    created_at = _now()
    activity_id = _stable_key(
        "ACT",
        "|".join(
            [
                str(workspace_id),
                str(lead_id),
                str(activity_type),
                str(channel),
                created_at,
                str(message),
            ]
        ),
    )
    engine = get_engine(database_url)
    payload = EnterpriseLeadActivity(
        activity_id=activity_id,
        workspace_id=str(workspace_id),
        lead_id=str(lead_id),
        created_at=created_at,
        actor=str(actor or "").strip() or "Revenue Pod",
        activity_type=str(activity_type or "").strip() or "note",
        channel=str(channel or "").strip() or "manual",
        direction=str(direction or "").strip() or "internal",
        message=str(message or "").strip(),
        stage_after=str(stage_after or "").strip(),
        next_step=str(next_step or "").strip(),
    )
    response = {
        "activity_id": payload.activity_id,
        "lead_id": payload.lead_id,
        "workspace_id": payload.workspace_id,
        "created_at": payload.created_at,
        "actor": payload.actor,
        "activity_type": payload.activity_type,
        "channel": payload.channel,
        "direction": payload.direction,
        "message": payload.message,
        "stage_after": payload.stage_after,
        "next_step": payload.next_step,
    }
    with Session(engine) as session:
        session.add(payload)
        lead = session.get(EnterpriseLead, str(lead_id))
        if lead and lead.workspace_id == str(workspace_id) and payload.stage_after:
            lead.stage = payload.stage_after
            lead.status = "active" if payload.stage_after in {"contacted", "discovery", "proposal"} else "open"
            lead.notes = payload.next_step or payload.message
            lead.synced_at = created_at
            session.add(lead)
        session.commit()
    return response


def list_lead_activities(
    database_url: str,
    *,
    workspace_id: str,
    lead_id: str,
    limit: int = 20,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = (
        select(EnterpriseLeadActivity)
        .where(
            EnterpriseLeadActivity.workspace_id == str(workspace_id),
            EnterpriseLeadActivity.lead_id == str(lead_id),
        )
        .order_by(EnterpriseLeadActivity.created_at.desc())
        .limit(max(1, int(limit)))
    )
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [
        {
            "activity_id": row.activity_id,
            "lead_id": row.lead_id,
            "workspace_id": row.workspace_id,
            "created_at": row.created_at,
            "actor": row.actor,
            "activity_type": row.activity_type,
            "channel": row.channel,
            "direction": row.direction,
            "message": row.message,
            "stage_after": row.stage_after,
            "next_step": row.next_step,
        }
        for row in rows
    ]


def bootstrap_workspace_leads(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    existing = load_lead_summary(database_url, workspace_id=workspace_id)
    if int(existing.get("lead_count", 0) or 0) > 0:
        return {"status": "skipped", "reason": "existing_leads_present"}
    return add_leads(
        database_url,
        workspace_id=workspace_id,
        rows=rows,
        campaign_goal="Bootstrap import",
        source="state_store_bootstrap",
    )
