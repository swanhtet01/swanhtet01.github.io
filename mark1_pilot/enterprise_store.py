from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import Column, String, Text, or_
from sqlmodel import Field, SQLModel, Session, create_engine, select


ENTERPRISE_DB_FILE = "supermega_enterprise.db"
PASSWORD_HASH_PREFIX = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 310000

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


def _now() -> str:
    return datetime.now().astimezone().isoformat()


def _stable_key(prefix: str, seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}-{digest}"


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


def _agent_run_to_dict(row: EnterpriseAgentRun) -> dict[str, Any]:
    return {
        "run_id": row.run_id,
        "workspace_id": row.workspace_id,
        "job_type": row.job_type,
        "source": row.source,
        "idempotency_key": row.idempotency_key,
        "status": row.status,
        "payload": _json_object(row.payload_json),
        "result": _json_object(row.result_json),
        "error_text": row.error_text,
        "attempt_count": row.attempt_count,
        "max_attempts": row.max_attempts,
        "scheduled_for": row.scheduled_for,
        "started_at": row.started_at,
        "finished_at": row.finished_at,
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


def resolve_database_url(output_dir: Path) -> str:
    env_value = str(os.getenv("SUPERMEGA_DATABASE_URL", "")).strip()
    if env_value:
        return env_value
    db_path = output_dir.expanduser().resolve() / ENTERPRISE_DB_FILE
    return f"sqlite:///{db_path.as_posix()}"


def _connect_args(database_url: str) -> dict[str, Any]:
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


def get_engine(database_url: str):
    return create_engine(database_url, connect_args=_connect_args(database_url))


def ensure_schema(database_url: str) -> None:
    engine = get_engine(database_url)
    SQLModel.metadata.create_all(engine)


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
    with Session(engine) as session:
        workspace = session.exec(
            select(EnterpriseWorkspace).where(EnterpriseWorkspace.slug == normalized_slug)
        ).first()
        if workspace:
            workspace.name = normalized_name
            workspace.plan = str(plan or workspace.plan or "pilot")
            workspace.status = "active"
            workspace.updated_at = now
        else:
            workspace = EnterpriseWorkspace(
                workspace_id=_stable_key("WS", normalized_slug),
                slug=normalized_slug,
                name=normalized_name,
                plan=str(plan or "pilot"),
                status="active",
                created_at=now,
                updated_at=now,
            )
            session.add(workspace)
        session.commit()
        session.refresh(workspace)
        payload = {
            "workspace_id": workspace.workspace_id,
            "slug": workspace.slug,
            "name": workspace.name,
            "plan": workspace.plan,
            "status": workspace.status,
        }
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
    workspaces = list_user_workspaces(database_url, username=normalized_username)
    workspace = next((item for item in workspaces if item["slug"] == requested_slug), None) if requested_slug else None
    if not workspace and workspaces:
        workspace = workspaces[0]
    if not workspace:
        raise ValueError(f"No active workspace access for {normalized_username}")

    created_at = datetime.now().astimezone()
    expires_at = created_at + timedelta(hours=max(ttl_hours, 1))
    session_id = secrets.token_urlsafe(32)
    workspace_id = str(workspace["workspace_id"])
    workspace_slug_value = str(workspace.get("slug", ""))
    workspace_name_value = str(workspace.get("name", ""))
    role_value = str(workspace.get("role") or role or "owner")
    created_at_value = created_at.isoformat()
    expires_at_value = expires_at.isoformat()
    payload = EnterpriseSession(
        session_id=session_id,
        username=normalized_username,
        workspace_id=workspace_id,
        role=role_value,
        created_at=created_at_value,
        expires_at=expires_at_value,
        last_seen_at=created_at_value,
    )
    engine = get_engine(database_url)
    with Session(engine) as session:
        session.add(payload)
        session.commit()
    return get_session(database_url, session_id=session_id) or {
        "session_id": session_id,
        "username": normalized_username,
        "role": role_value,
        "workspace_id": workspace_id,
        "workspace_slug": workspace_slug_value,
        "workspace_name": workspace_name_value,
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


def list_workspace_tasks(
    database_url: str,
    *,
    workspace_id: str,
    status: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(EnterpriseWorkspaceTask).where(EnterpriseWorkspaceTask.workspace_id == str(workspace_id))
    if status:
        statement = statement.where(EnterpriseWorkspaceTask.status == str(status))
    statement = statement.order_by(EnterpriseWorkspaceTask.updated_at.desc(), EnterpriseWorkspaceTask.created_at.desc()).limit(max(1, int(limit)))
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_task_to_dict(row) for row in rows]


def add_workspace_tasks(
    database_url: str,
    *,
    workspace_id: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    ensure_schema(database_url)
    now = _now()
    engine = get_engine(database_url)
    saved_ids: list[str] = []
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
        session.commit()

    return {
        "status": "ready",
        "saved_count": len(saved_ids),
        "saved_task_ids": saved_ids,
        "rows": list_workspace_tasks(database_url, workspace_id=workspace_id, limit=200),
    }


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


def remove_workspace_task(
    database_url: str,
    *,
    workspace_id: str,
    task_id: str,
) -> bool:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    with Session(engine) as session:
        row = session.get(EnterpriseWorkspaceTask, str(task_id))
        if not row or row.workspace_id != str(workspace_id):
            return False
        session.delete(row)
        session.commit()
        return True


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
        row = EnterpriseAgentRun(
            run_id=secrets.token_urlsafe(16),
            workspace_id=str(workspace_id),
            job_type=str(job_type or "").strip() or "unknown",
            source=str(source or "").strip() or "manual",
            idempotency_key=normalized_key,
            status="queued",
            payload_json=json.dumps(payload or {}, ensure_ascii=False),
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
            triggered_by=str(triggered_by or "").strip() or "system",
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
        row.status = normalized_status
        row.finished_at = now
        row.summary = str(summary or "").strip()
        row.result_json = json.dumps(result or {}, ensure_ascii=False)
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
