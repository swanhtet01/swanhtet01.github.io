from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import Column, String, Text, or_
from sqlmodel import Field, SQLModel, Session, create_engine, select


ENTERPRISE_DB_FILE = "supermega_enterprise.db"


def _now() -> str:
    return datetime.now().astimezone().isoformat()


def _stable_key(prefix: str, seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}-{digest}"


def _role_rank(role: str) -> int:
    normalized = str(role or "").strip().lower()
    if normalized == "owner":
        return 4
    if normalized == "manager":
        return 3
    if normalized in {"lead", "operator"}:
        return 2
    if normalized == "member":
        return 1
    return 0


def _merge_user_role(current_role: str, next_role: str) -> str:
    current = str(current_role or "").strip() or "member"
    proposed = str(next_role or "").strip() or "member"
    return current if _role_rank(current) >= _role_rank(proposed) else proposed


def _hash_password(password: str) -> str:
    return hashlib.sha256(str(password or "").encode("utf-8")).hexdigest()


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


class EnterpriseLead(SQLModel, table=True):
    __tablename__ = "enterprise_leads"

    lead_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    created_at: str
    company_name: str
    archetype: str = ""
    stage: str = "offer_ready"
    status: str = "open"
    owner: str = "Growth Studio"
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
    owner: str = "Growth Studio"
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


class EnterpriseGraphEntity(SQLModel, table=True):
    __tablename__ = "enterprise_graph_entities"

    entity_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    entity_type: str = Field(index=True)
    label: str
    status: str = Field(default="active", index=True)
    source_system: str = ""
    source_ref: str = Field(default="", index=True)
    metadata_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str
    updated_at: str
    last_seen_at: str


class EnterpriseGraphEdge(SQLModel, table=True):
    __tablename__ = "enterprise_graph_edges"

    edge_id: str = Field(primary_key=True)
    workspace_id: str = Field(index=True, foreign_key="enterprise_workspaces.workspace_id")
    from_entity_id: str = Field(index=True)
    to_entity_id: str = Field(index=True)
    relation_type: str = Field(index=True)
    status: str = Field(default="active", index=True)
    metadata_json: str = Field(default="{}", sa_column=Column(Text, nullable=False))
    created_at: str
    updated_at: str
    last_seen_at: str


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


def _graph_entity_to_dict(row: EnterpriseGraphEntity) -> dict[str, Any]:
    return {
        "entity_id": row.entity_id,
        "workspace_id": row.workspace_id,
        "entity_type": row.entity_type,
        "label": row.label,
        "status": row.status,
        "source_system": row.source_system,
        "source_ref": row.source_ref,
        "metadata": _json_object(row.metadata_json),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "last_seen_at": row.last_seen_at,
    }


def _graph_edge_to_dict(row: EnterpriseGraphEdge) -> dict[str, Any]:
    return {
        "edge_id": row.edge_id,
        "workspace_id": row.workspace_id,
        "from_entity_id": row.from_entity_id,
        "to_entity_id": row.to_entity_id,
        "relation_type": row.relation_type,
        "status": row.status,
        "metadata": _json_object(row.metadata_json),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "last_seen_at": row.last_seen_at,
    }


def _graph_entity_seed(
    workspace_id: str,
    entity_type: str,
    source_system: str,
    source_ref: str,
    label: str,
) -> str:
    return "|".join(
        [
            str(workspace_id or "").strip(),
            str(entity_type or "").strip().lower(),
            str(source_system or "").strip().lower(),
            str(source_ref or "").strip().lower(),
            str(label or "").strip().lower(),
        ]
    )


def _upsert_graph_entity(
    session: Session,
    *,
    workspace_id: str,
    entity_type: str,
    label: str,
    source_system: str = "",
    source_ref: str = "",
    status: str = "active",
    metadata: dict[str, Any] | None = None,
) -> EnterpriseGraphEntity:
    now = _now()
    entity_id = _stable_key(
        "GE",
        _graph_entity_seed(
            workspace_id,
            entity_type,
            source_system,
            source_ref,
            label,
        ),
    )
    row = session.get(EnterpriseGraphEntity, entity_id)
    if not row:
        row = EnterpriseGraphEntity(
            entity_id=entity_id,
            workspace_id=str(workspace_id),
            entity_type=str(entity_type or "").strip() or "unknown",
            label=str(label or "").strip() or "Untitled",
            status=str(status or "").strip() or "active",
            source_system=str(source_system or "").strip(),
            source_ref=str(source_ref or "").strip(),
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
            created_at=now,
            updated_at=now,
            last_seen_at=now,
        )
    else:
        row.workspace_id = str(workspace_id)
        row.entity_type = str(entity_type or row.entity_type or "").strip() or "unknown"
        row.label = str(label or row.label or "").strip() or "Untitled"
        row.status = str(status or row.status or "").strip() or "active"
        row.source_system = str(source_system or row.source_system or "").strip()
        row.source_ref = str(source_ref or row.source_ref or "").strip()
        row.metadata_json = json.dumps(metadata or {}, ensure_ascii=False)
        row.updated_at = now
        row.last_seen_at = now
    session.add(row)
    return row


def _upsert_graph_edge(
    session: Session,
    *,
    workspace_id: str,
    from_entity_id: str,
    to_entity_id: str,
    relation_type: str,
    status: str = "active",
    metadata: dict[str, Any] | None = None,
) -> EnterpriseGraphEdge:
    now = _now()
    edge_id = _stable_key(
        "GEDGE",
        "|".join(
            [
                str(workspace_id or "").strip(),
                str(from_entity_id or "").strip(),
                str(relation_type or "").strip().lower(),
                str(to_entity_id or "").strip(),
            ]
        ),
    )
    row = session.get(EnterpriseGraphEdge, edge_id)
    if not row:
        row = EnterpriseGraphEdge(
            edge_id=edge_id,
            workspace_id=str(workspace_id),
            from_entity_id=str(from_entity_id or "").strip(),
            to_entity_id=str(to_entity_id or "").strip(),
            relation_type=str(relation_type or "").strip() or "related_to",
            status=str(status or "").strip() or "active",
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
            created_at=now,
            updated_at=now,
            last_seen_at=now,
        )
    else:
        row.workspace_id = str(workspace_id)
        row.from_entity_id = str(from_entity_id or row.from_entity_id or "").strip()
        row.to_entity_id = str(to_entity_id or row.to_entity_id or "").strip()
        row.relation_type = str(relation_type or row.relation_type or "").strip() or "related_to"
        row.status = str(status or row.status or "").strip() or "active"
        row.metadata_json = json.dumps(metadata or {}, ensure_ascii=False)
        row.updated_at = now
        row.last_seen_at = now
    session.add(row)
    return row


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
        return {
            "workspace_id": workspace.workspace_id,
            "slug": workspace.slug,
            "name": workspace.name,
            "plan": workspace.plan,
            "status": workspace.status,
        }


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
    password_hash = _hash_password(password)
    engine = get_engine(database_url)
    with Session(engine) as session:
        user = session.exec(
            select(EnterpriseUser).where(
                EnterpriseUser.username == normalized_username,
                EnterpriseUser.password_hash == password_hash,
                EnterpriseUser.status == "active",
            )
        ).first()
    if not user:
        return None
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
    normalized_role = str(role or "").strip().lower() or "member"
    if normalized_role not in {"owner", "manager", "lead", "operator", "member"}:
        normalized_role = "member"
    if not normalized_workspace_id or not normalized_email:
        return {"status": "skipped"}

    now = _now()
    engine = get_engine(database_url)
    membership_id = _stable_key("MEM", f"{normalized_email}:{normalized_workspace_id}")
    generated_password = ""
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
            if str(password or "").strip():
                generated_password = str(password).strip()
                user.password_hash = _hash_password(generated_password)
        else:
            generated_password = str(password or "").strip() or secrets.token_urlsafe(10)
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


def list_graph_entities(
    database_url: str,
    *,
    workspace_id: str,
    entity_type: str | None = None,
    limit: int = 250,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(EnterpriseGraphEntity).where(EnterpriseGraphEntity.workspace_id == str(workspace_id))
    if entity_type:
        statement = statement.where(EnterpriseGraphEntity.entity_type == str(entity_type))
    statement = statement.order_by(EnterpriseGraphEntity.updated_at.desc(), EnterpriseGraphEntity.created_at.desc()).limit(
        max(1, int(limit))
    )
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_graph_entity_to_dict(row) for row in rows]


def list_graph_edges(
    database_url: str,
    *,
    workspace_id: str,
    relation_type: str | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    statement = select(EnterpriseGraphEdge).where(EnterpriseGraphEdge.workspace_id == str(workspace_id))
    if relation_type:
        statement = statement.where(EnterpriseGraphEdge.relation_type == str(relation_type))
    statement = statement.order_by(EnterpriseGraphEdge.updated_at.desc(), EnterpriseGraphEdge.created_at.desc()).limit(
        max(1, int(limit))
    )
    with Session(engine) as session:
        rows = session.exec(statement).all()
    return [_graph_edge_to_dict(row) for row in rows]


def load_graph_summary(
    database_url: str,
    *,
    workspace_id: str,
    recent_limit: int = 8,
) -> dict[str, Any]:
    entities = list_graph_entities(database_url, workspace_id=workspace_id, limit=1000)
    edges = list_graph_edges(database_url, workspace_id=workspace_id, limit=2000)
    by_type: dict[str, int] = {}
    by_relation: dict[str, int] = {}
    for row in entities:
        entity_type = str(row.get("entity_type", "")).strip() or "unknown"
        by_type[entity_type] = by_type.get(entity_type, 0) + 1
    for row in edges:
        relation_type = str(row.get("relation_type", "")).strip() or "related_to"
        by_relation[relation_type] = by_relation.get(relation_type, 0) + 1
    last_sync_at = ""
    if entities:
        last_sync_at = str(entities[0].get("updated_at", "")).strip()
    elif edges:
        last_sync_at = str(edges[0].get("updated_at", "")).strip()
    return {
        "status": "active" if entities or edges else "scaffolded",
        "entity_count": len(entities),
        "edge_count": len(edges),
        "entity_types": [
            {"type": key, "count": value}
            for key, value in sorted(by_type.items(), key=lambda item: (-item[1], item[0]))
        ],
        "relation_types": [
            {"type": key, "count": value}
            for key, value in sorted(by_relation.items(), key=lambda item: (-item[1], item[0]))
        ],
        "recent_entities": entities[: max(1, int(recent_limit or 8))],
        "recent_edges": edges[: max(1, int(recent_limit or 8))],
        "last_sync_at": last_sync_at,
    }


def sync_workspace_graph(
    database_url: str,
    *,
    workspace_id: str,
    workspace_slug: str = "",
    workspace_name: str = "",
    team_members: list[dict[str, Any]] | None = None,
    leads: list[dict[str, Any]] | None = None,
    tasks: list[dict[str, Any]] | None = None,
    agent_runs: list[dict[str, Any]] | None = None,
    drive_context: dict[str, Any] | None = None,
    gmail_context: dict[str, Any] | None = None,
    state_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    ensure_schema(database_url)
    engine = get_engine(database_url)
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        return load_graph_summary(database_url, workspace_id=normalized_workspace_id)

    now = _now()
    drive_context = drive_context or {}
    gmail_context = gmail_context or {}
    state_counts = state_counts or {}
    with Session(engine) as session:
        workspace_entity = _upsert_graph_entity(
            session,
            workspace_id=normalized_workspace_id,
            entity_type="workspace",
            label=str(workspace_name or workspace_slug or "Workspace").strip() or "Workspace",
            source_system="platform",
            source_ref=str(workspace_slug or normalized_workspace_id).strip() or normalized_workspace_id,
            metadata={
                "workspace_slug": str(workspace_slug or "").strip(),
                "workspace_name": str(workspace_name or "").strip(),
                "synced_at": now,
            },
        )

        lead_entity_ids: dict[str, str] = {}
        for row in team_members or []:
            email = str(row.get("email", row.get("username", ""))).strip().lower()
            label = str(row.get("display_name", "")).strip() or email or "Workspace member"
            member_entity = _upsert_graph_entity(
                session,
                workspace_id=normalized_workspace_id,
                entity_type="member",
                label=label,
                source_system="workspace",
                source_ref=email or str(row.get("membership_id", "")).strip(),
                metadata={
                    "email": email,
                    "role": str(row.get("role", "")).strip(),
                    "status": str(row.get("status", "")).strip(),
                },
            )
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=workspace_entity.entity_id,
                to_entity_id=member_entity.entity_id,
                relation_type="has_member",
                metadata={"role": str(row.get("role", "")).strip()},
            )

        for row in leads or []:
            lead_id = str(row.get("lead_id", "")).strip()
            label = str(row.get("company_name", "")).strip() or lead_id or "Lead"
            lead_entity = _upsert_graph_entity(
                session,
                workspace_id=normalized_workspace_id,
                entity_type="lead",
                label=label,
                source_system=str(row.get("source", "")).strip() or "workspace",
                source_ref=lead_id or label,
                metadata={
                    "stage": str(row.get("stage", "")).strip(),
                    "status": str(row.get("status", "")).strip(),
                    "service_pack": str(row.get("service_pack", "")).strip(),
                    "contact_email": str(row.get("contact_email", "")).strip(),
                    "website": str(row.get("website", "")).strip(),
                    "score": int(row.get("score", 0) or 0),
                },
            )
            lead_entity_ids[lead_id] = lead_entity.entity_id
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=workspace_entity.entity_id,
                to_entity_id=lead_entity.entity_id,
                relation_type="tracks_lead",
                metadata={
                    "stage": str(row.get("stage", "")).strip(),
                    "status": str(row.get("status", "")).strip(),
                },
            )

        for row in tasks or []:
            task_id = str(row.get("task_id", "")).strip()
            label = str(row.get("title", "")).strip() or task_id or "Task"
            task_entity = _upsert_graph_entity(
                session,
                workspace_id=normalized_workspace_id,
                entity_type="task",
                label=label,
                source_system="workspace",
                source_ref=task_id or label,
                metadata={
                    "status": str(row.get("status", "")).strip(),
                    "owner": str(row.get("owner", "")).strip(),
                    "priority": str(row.get("priority", "")).strip(),
                    "due": str(row.get("due", "")).strip(),
                },
            )
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=workspace_entity.entity_id,
                to_entity_id=task_entity.entity_id,
                relation_type="tracks_task",
                metadata={"status": str(row.get("status", "")).strip()},
            )
            lead_id = str(row.get("lead_id", "")).strip()
            if lead_id and lead_id in lead_entity_ids:
                _upsert_graph_edge(
                    session,
                    workspace_id=normalized_workspace_id,
                    from_entity_id=lead_entity_ids[lead_id],
                    to_entity_id=task_entity.entity_id,
                    relation_type="next_step",
                    metadata={"template": str(row.get("template", "")).strip()},
                )

        for row in (agent_runs or [])[:50]:
            run_id = str(row.get("run_id", "")).strip()
            job_type = str(row.get("job_type", "")).strip() or "agent-run"
            run_entity = _upsert_graph_entity(
                session,
                workspace_id=normalized_workspace_id,
                entity_type="agent_run",
                label=job_type.replace("-", " "),
                source_system="runtime",
                source_ref=run_id or job_type,
                metadata={
                    "status": str(row.get("status", "")).strip(),
                    "source": str(row.get("source", "")).strip(),
                    "completed_at": str(row.get("completed_at", row.get("finished_at", ""))).strip(),
                },
            )
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=workspace_entity.entity_id,
                to_entity_id=run_entity.entity_id,
                relation_type="triggered_run",
                metadata={"job_type": job_type},
            )

        drive_entity = _upsert_graph_entity(
            session,
            workspace_id=normalized_workspace_id,
            entity_type="connector",
            label="Google Drive",
            source_system="google_drive",
            source_ref=str(drive_context.get("folder_id", "")).strip() or "google-drive",
            status=str(drive_context.get("status", "")).strip() or "scaffolded",
            metadata={
                "folder_id": str(drive_context.get("folder_id", "")).strip(),
                "workspace_export_link": str(drive_context.get("workspace_export_link", "")).strip(),
                "founder_brief_link": str(drive_context.get("founder_brief_link", "")).strip(),
                "configured": bool(drive_context.get("configured", False)),
            },
        )
        _upsert_graph_edge(
            session,
            workspace_id=normalized_workspace_id,
            from_entity_id=workspace_entity.entity_id,
            to_entity_id=drive_entity.entity_id,
            relation_type="uses_source",
        )

        gmail_entity = _upsert_graph_entity(
            session,
            workspace_id=normalized_workspace_id,
            entity_type="connector",
            label="Gmail",
            source_system="gmail",
            source_ref="gmail",
            status=str(gmail_context.get("status", "")).strip() or "scaffolded",
            metadata={
                "compose_url": str(gmail_context.get("compose_url", "")).strip(),
                "client_configured": bool(gmail_context.get("client_configured", False)),
                "token_configured": bool(gmail_context.get("token_configured", False)),
            },
        )
        _upsert_graph_edge(
            session,
            workspace_id=normalized_workspace_id,
            from_entity_id=workspace_entity.entity_id,
            to_entity_id=gmail_entity.entity_id,
            relation_type="uses_source",
        )

        for artifact_type, artifact_label, artifact_link in [
            ("document", "Workspace export", str(drive_context.get("workspace_export_link", "")).strip()),
            ("document", "Founder brief", str(drive_context.get("founder_brief_link", "")).strip()),
        ]:
            if not artifact_link:
                continue
            artifact_entity = _upsert_graph_entity(
                session,
                workspace_id=normalized_workspace_id,
                entity_type=artifact_type,
                label=artifact_label,
                source_system="google_drive",
                source_ref=artifact_link,
                metadata={"link": artifact_link},
            )
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=drive_entity.entity_id,
                to_entity_id=artifact_entity.entity_id,
                relation_type="publishes_document",
            )
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=workspace_entity.entity_id,
                to_entity_id=artifact_entity.entity_id,
                relation_type="has_artifact",
            )

        for lane_key, lane_label in [
            ("approvals", "Approvals"),
            ("actions", "Action queue"),
            ("metrics", "KPI lane"),
            ("receiving", "Receiving lane"),
            ("inventory", "Inventory lane"),
            ("contacts", "Inbound contacts"),
            ("decisions", "Decision journal"),
        ]:
            count = int(state_counts.get(lane_key, 0) or 0)
            if count <= 0:
                continue
            lane_entity = _upsert_graph_entity(
                session,
                workspace_id=normalized_workspace_id,
                entity_type="state_lane",
                label=lane_label,
                source_system="state",
                source_ref=lane_key,
                metadata={"count": count},
            )
            _upsert_graph_edge(
                session,
                workspace_id=normalized_workspace_id,
                from_entity_id=workspace_entity.entity_id,
                to_entity_id=lane_entity.entity_id,
                relation_type="tracks_lane",
                metadata={"count": count},
            )

        session.commit()
    return load_graph_summary(database_url, workspace_id=normalized_workspace_id)


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
            lead.owner = str(row.get("owner", "")).strip() or "Growth Studio"
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
    owner: str = "Growth Studio",
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
    normalized_owner = str(owner or "").strip() or "Growth Studio"
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
            lead.owner = str(row.get("owner", "")).strip() or "Growth Studio"
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
        actor=str(actor or "").strip() or "Growth Studio",
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
