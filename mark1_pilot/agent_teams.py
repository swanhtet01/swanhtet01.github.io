from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .client_context import build_client_context_report
from .config import PilotConfig
from .coverage import load_data_coverage_summary


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _autonomy_level(score: int) -> str:
    if score >= 85:
        return "scaling_ready"
    if score >= 70:
        return "semi_autonomous"
    if score >= 55:
        return "operator_guided"
    return "manual_heavy"


def _team_status(*, required_failures: int, optional_failures: int, coverage_score: int, gmail_ready: bool) -> str:
    if required_failures > 0:
        return "blocked"
    if coverage_score < 60:
        return "fragile"
    if not gmail_ready and optional_failures > 0:
        return "partial"
    return "active"


def _agent(
    agent_id: str,
    name: str,
    role: str,
    mode: str,
    tools: list[str],
    output_schema: str,
    write_scope: str,
    approval_gate: str,
    focus: str,
) -> dict[str, Any]:
    return {
        "agent_id": agent_id,
        "name": name,
        "role": role,
        "mode": mode,
        "tools": tools,
        "output_schema": output_schema,
        "write_scope": write_scope,
        "approval_gate": approval_gate,
        "focus": focus,
    }


def _tool_definition(tool_id: str, name: str, category: str, purpose: str) -> dict[str, Any]:
    return {
        "id": tool_id,
        "name": name,
        "category": category,
        "purpose": purpose,
    }


def _tool_access(tool_id: str, mode: str, scope: str) -> dict[str, Any]:
    return {
        "toolId": tool_id,
        "mode": mode,
        "scope": scope,
    }


def _kpi(name: str, target: str) -> dict[str, Any]:
    return {
        "name": name,
        "target": target,
    }


def _playbook(
    playbook_id: str,
    team_id: str,
    name: str,
    workspace: str,
    lead_role: str,
    mission: str,
    outputs: list[str],
    cadence: list[str],
    tools: list[dict[str, Any]],
    instructions: list[str],
    escalate_when: list[str],
    write_policy: str,
    kpis: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": playbook_id,
        "teamId": team_id,
        "name": name,
        "workspace": workspace,
        "leadRole": lead_role,
        "mission": mission,
        "outputs": outputs,
        "cadence": cadence,
        "tools": tools,
        "instructions": instructions,
        "escalateWhen": escalate_when,
        "writePolicy": write_policy,
        "kpis": kpis,
    }


def build_agent_operating_manifest() -> dict[str, Any]:
    return {
        "version": "v2",
        "tenantKey": "default",
        "title": "SUPERMEGA.dev operating pods",
        "summary": "Shared pods that sell, launch, observe, and scale the core product and new tenant rollouts.",
        "managerMoves": [
            "Keep one named owner on every tenant rollout, connector scope, and release decision.",
            "Approve only high-risk writes; everything else should stay inside bounded playbooks.",
            "Review runtime health, open escalations, and launch blockers every day from one control surface.",
        ],
        "tools": [
            _tool_definition(
                "gmail",
                "Gmail",
                "Connector",
                "Watch rollout mailboxes, customer replies, and draft operator follow-up.",
            ),
            _tool_definition(
                "google-drive",
                "Google Drive",
                "Connector",
                "Index files, sheets, and rollout bundles that feed product and tenant memory.",
            ),
            _tool_definition(
                "google-calendar",
                "Google Calendar",
                "Connector",
                "Tie rollout reviews, sales meetings, and check-ins to live work.",
            ),
            _tool_definition(
                "github",
                "GitHub",
                "Connector",
                "Track code changes, release readiness, and implementation backlog.",
            ),
            _tool_definition(
                "sentry",
                "Sentry",
                "Connector",
                "Surface production failures and route them into runtime or product ops.",
            ),
            _tool_definition(
                "platform-admin",
                "Platform Admin",
                "Control",
                "Own tenant setup, role scope, and rollout posture.",
            ),
            _tool_definition(
                "runtime-desk",
                "Runtime Desk",
                "Control",
                "Monitor sync freshness, job health, and policy drift.",
            ),
            _tool_definition(
                "solution-architect",
                "Solution Architect",
                "Control",
                "Map a client into modules, roles, and rollout order.",
            ),
            _tool_definition(
                "agent-ops",
                "Agent Ops",
                "Workspace",
                "Run jobs, review outcomes, and manage operator access.",
            ),
            _tool_definition(
                "knowledge-runtime",
                "Knowledge Runtime",
                "Knowledge",
                "Keep canonical documents, entities, and provenance usable by product teams and agents.",
            ),
        ],
        "playbooks": [
            _playbook(
                "tenant-launch",
                "client_delivery",
                "Client Onboarding Pod",
                "core-platform/provisioning",
                "Implementation Lead",
                "Turn one client blueprint into a live tenant with the right modules, roles, domain, and starter data.",
                ["tenant setup checklist", "module map", "role map", "launch blocker list"],
                ["new tenant kickoff", "daily rollout review", "pre-launch validation"],
                [
                    _tool_access("solution-architect", "Admin", "module and role blueprint"),
                    _tool_access("platform-admin", "Admin", "tenant, domain, and module posture"),
                    _tool_access("google-drive", "Read", "client files and rollout bundles"),
                    _tool_access("github", "Review", "implementation backlog and release scope"),
                ],
                [
                    "Start from one live workflow, not the full transformation.",
                    "Map current files, inboxes, exports, and human owners before enabling automations.",
                    "Keep launch blockers visible until each one has a human owner.",
                ],
                [
                    "The tenant needs a new data model or connector scope not covered by the product base.",
                    "A role boundary or domain setup decision affects security or billing.",
                    "Launch requires custom code instead of configuration.",
                ],
                "Tenant setup and domain changes are allowed only after implementation-lead or platform-admin review.",
                [
                    _kpi("time to first live workflow", "under 14 days for a standard rollout"),
                    _kpi("launch blocker age", "no blocker unresolved beyond 48 hours"),
                ],
            ),
            _playbook(
                "connector-reliability",
                "platform_engineering",
                "Connector Reliability Pod",
                "core-platform/connectors",
                "Platform Admin",
                "Keep Gmail, Drive, Calendar, and tenant data feeds fresh enough for agents and operators to trust.",
                ["stale-source alerts", "retry decisions", "connector health digest"],
                ["15-minute sync watch", "daily connector review"],
                [
                    _tool_access("gmail", "Review", "connector-linked inbox tests"),
                    _tool_access("google-drive", "Review", "file index freshness and sheet publishing"),
                    _tool_access("google-calendar", "Review", "calendar sync coverage"),
                    _tool_access("runtime-desk", "Admin", "sync freshness and job failures"),
                    _tool_access("sentry", "Review", "connector and runtime incidents"),
                ],
                [
                    "Treat stale or partial sync as a production issue, not a cosmetic issue.",
                    "Keep source-level provenance attached to every retry and repair decision.",
                    "Prioritize the connectors that block live customer workflows first.",
                ],
                [
                    "A connector requires broader OAuth scope, credential rotation, or source-owner approval.",
                    "Data freshness drops below the workflow's required cadence.",
                    "A broken sync affects more than one tenant or one critical client workspace.",
                ],
                "Connector retries are allowed automatically; scope changes and credential changes require platform-admin approval.",
                [
                    _kpi("critical connector freshness", "no critical feed stale beyond one cadence window"),
                    _kpi("incident recovery time", "critical sync failures triaged within 30 minutes"),
                ],
            ),
            _playbook(
                "knowledge-graph",
                "platform_engineering",
                "Knowledge Graph Pod",
                "core-platform/knowledge",
                "Implementation Lead",
                "Turn files, sheets, notes, and messages into canonical business memory with provenance.",
                ["entity and relation candidates", "document canon updates", "knowledge quality review"],
                ["document ingest", "daily relation repair", "weekly knowledge review"],
                [
                    _tool_access("google-drive", "Read", "files, sheets, and markdown bundles"),
                    _tool_access("knowledge-runtime", "Admin", "documents, entities, relations, provenance"),
                    _tool_access("agent-ops", "Review", "knowledge jobs and reviewer assignments"),
                ],
                [
                    "Every extracted fact needs a source link that a human can inspect.",
                    "Prefer canonical business entities over folder-level summaries.",
                    "Do not publish schema changes into tenant workspaces without review.",
                ],
                [
                    "A knowledge rule changes the meaning of commercial, financial, or quality records.",
                    "Entity extraction quality drops below reviewer trust.",
                    "A tenant needs a new domain schema that affects several modules.",
                ],
                "Knowledge writes are allowed for candidate records; canonical publishing requires reviewer approval when schema or trust boundaries change.",
                [
                    _kpi("source-linked records", "100 percent of published knowledge records retain provenance"),
                    _kpi("reviewer acceptance", "over 85 percent accepted without rework"),
                ],
            ),
            _playbook(
                "runtime-safety",
                "platform_engineering",
                "Runtime Safety Pod",
                "core-platform/runtime",
                "Platform Admin",
                "Keep agent jobs bounded, observable, and safe enough to scale across client workspaces.",
                ["runtime health board", "autonomy guardrail updates", "escalation queue"],
                ["continuous monitoring", "daily batch review", "weekly policy review"],
                [
                    _tool_access("agent-ops", "Admin", "job runs, members, and manual recovery"),
                    _tool_access("runtime-desk", "Admin", "runtime posture and policy drift"),
                    _tool_access("sentry", "Review", "production failures and runtime regressions"),
                    _tool_access("platform-admin", "Review", "tenant posture and unsafe rollout pressure"),
                ],
                [
                    "Move work into scheduled loops only when the failure mode and approval gate are visible.",
                    "Every autonomous write path needs a human rollback path.",
                    "Treat repeated manual recovery as a design bug, not an operator job.",
                ],
                [
                    "An agent writes across tenant or security boundaries.",
                    "A job repeatedly fails or goes stale beyond its approved cadence.",
                    "A rollout depends on automations that do not have clear review gates.",
                ],
                "Runtime jobs may run automatically inside existing guardrails; guardrail changes require platform-admin approval.",
                [
                    _kpi("stale core loops", "zero stale core loops at daily review"),
                    _kpi("manual recovery pressure", "down week over week"),
                ],
            ),
            _playbook(
                "growth-proof",
                "growth_studio",
                "Revenue Pod",
                "core-platform/growth",
                "Owner",
                "Turn live products, case studies, and outreach into qualified rollout demand.",
                ["account shortlist", "proof packs", "qualified rollout requests"],
                ["daily prospect refresh", "weekly proof review"],
                [
                    _tool_access("gmail", "Review", "pilot follow-up and outbound drafts"),
                    _tool_access("google-drive", "Read", "case-study assets and rollout collateral"),
                    _tool_access("github", "Review", "release readiness for proof-worthy surfaces"),
                ],
                [
                    "Lead with one real product and one concrete customer problem.",
                    "Do not sell internal architecture as if it were customer value.",
                    "Keep proof tied to working screens, rollout outcomes, and customer context.",
                ],
                [
                    "The site promises a feature that is not production-ready.",
                    "A customer request requires a new rollout pattern or unsupported integration.",
                    "Demand is blocked by product gaps rather than messaging gaps.",
                ],
                "Drafting and proof-pack updates are allowed; public claims about enterprise readiness require owner review.",
                [
                    _kpi("qualified rollout requests", "increase month over month"),
                    _kpi("time from proof to contact", "shorter each release cycle"),
                ],
            ),
        ],
    }


def build_agent_team_system(config: PilotConfig, repo_root: Path | None = None) -> dict[str, Any]:
    root = repo_root or Path(__file__).resolve().parent.parent
    output_dir = config.output.inventory_path

    coverage = load_data_coverage_summary(output_dir)
    autopilot = _load_json(output_dir / "autopilot_status.json")
    execution_review = _load_json(output_dir / "execution_review.json")
    product_lab = _load_json(output_dir / "product_lab.json")
    portfolio = _load_json(root / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json")
    context_report = build_client_context_report(config.client_context)
    context_summary = context_report.get("summary", {})
    selected_products = context_report.get("selected_products", {})

    coverage_score = int(coverage.get("readiness_score", 0) or 0)
    required_failures = int(autopilot.get("required_failure_count", 0) or 0)
    optional_failures = int(autopilot.get("optional_failure_count", 0) or 0)
    gmail_ready = any(
        str(item.get("name", "")) == "gmail_feed" and str(item.get("status", "")) == "ready"
        for item in coverage.get("dimensions", [])
    )
    review_priorities = [str(item).strip() for item in execution_review.get("top_priorities", []) if str(item).strip()]
    portfolio_modules = [item for item in portfolio.get("modules", []) if isinstance(item, dict)]
    priority_products = [str(item.get("name", "")).strip() for item in portfolio_modules if str(item.get("priority", "")).strip() == "now"]
    selected_control_modules = [str(item).strip() for item in selected_products.get("control_modules", []) if str(item).strip()]

    autonomy_score = 35
    if coverage_score >= 85:
        autonomy_score += 15
    if coverage_score >= 95:
        autonomy_score += 5
    if required_failures == 0:
        autonomy_score += 15
    if optional_failures == 0:
        autonomy_score += 10
    if gmail_ready:
        autonomy_score += 10
    if str(product_lab.get("summary", {}).get("flagship_status", "")) in {"pilot_ready", "live_system"}:
        autonomy_score += 10

    status = _team_status(
        required_failures=required_failures,
        optional_failures=optional_failures,
        coverage_score=coverage_score,
        gmail_ready=gmail_ready,
    )
    autonomy_level = _autonomy_level(autonomy_score)

    teams = [
        {
            "team_id": "command_office",
            "name": "Founder Control",
            "status": status,
            "scaling_tier": "shared_core",
            "mission": "Turn scattered operational signals into one decision layer for the owner and leadership.",
            "lead_agent": "Director Command Agent",
            "cadence": "daily",
            "inputs": ["action board", "execution review", "market watch", "workspace summaries"],
            "outputs": ["founder brief", "weekly operating brief", "priority queue"],
            "handoff_to": ["control_tower", "growth_studio"],
            "agents": [
                _agent(
                    "director_command",
                    "Director Command Agent",
                    "lead",
                    "review",
                    ["summary_api", "brief_builder", "workspace_links"],
                    "director_brief",
                    "pilot-data briefs and summaries",
                    "director review for decisions",
                    "Convert the operating surface into top priorities and escalation notes.",
                ),
                _agent(
                    "market_watch",
                    "Market Watch Agent",
                    "analyst",
                    "read",
                    ["external_watch", "news_brief", "source_pack"],
                    "market_signal_pack",
                    "signal notes only",
                    "human review before escalation",
                    "Watch logistics, cost, policy, and demand signals that affect the operating plan.",
                ),
                _agent(
                    "product_prioritizer",
                    "Product Prioritizer Agent",
                    "planner",
                    "review",
                    ["product_lab", "portfolio_manifest", "client_context"],
                    "backlog_recommendation",
                    "product backlog notes",
                    "product owner review",
                    "Decide which module or pack deserves the next engineering sprint.",
                ),
            ],
        },
        {
            "team_id": "control_tower",
            "name": "Client Operations Pod",
            "status": status,
            "scaling_tier": "per_client_pod",
            "mission": "Run the client operating layer: actions, supplier control, quality closeout, cash watch, and plant follow-up.",
            "lead_agent": "Action OS Manager",
            "cadence": "daily",
            "inputs": ["gmail", "drive", "google sheets", "team updates"],
            "outputs": ["manager action board", "risk queue", "closeout queue", "owner actions"],
            "handoff_to": ["client_delivery", "command_office"],
            "agents": [
                _agent(
                    "action_os_manager",
                    "Action OS Manager",
                    "lead",
                    "write_controlled",
                    ["action_board", "state_store", "input_center"],
                    "action_board_rows",
                    "manager action rows and summaries",
                    "manager review on write-back",
                    "Keep the action board clean, owned, and current.",
                ),
                _agent(
                    "supplier_watch",
                    "Supplier Watch Agent",
                    "specialist",
                    "write_controlled",
                    ["gmail", "eta_sheet", "payment_tracker"],
                    "supplier_risk_record",
                    "supplier risk queue",
                    "procurement review before escalation",
                    "Detect delay, customs, payment, and documentation risk early.",
                ),
                _agent(
                    "quality_closeout",
                    "Quality Closeout Agent",
                    "specialist",
                    "write_controlled",
                    ["quality_mailbox", "incident_sheet", "evidence_files"],
                    "quality_incident_record",
                    "incident and CAPA rows",
                    "quality lead approval",
                    "Move issues from report to containment, RCA, CAPA, and closure.",
                ),
                _agent(
                    "cash_watch",
                    "Cash Watch Agent",
                    "specialist",
                    "write_controlled",
                    ["invoice_files", "cash_book", "payment_mailbox"],
                    "cash_watch_record",
                    "cash control queue",
                    "finance review before external communication",
                    "Track overdue collections, payment promises, and invoice follow-up.",
                ),
                _agent(
                    "attendance_checkin",
                    "Attendance Check-In Agent",
                    "mini_product_operator",
                    "write_controlled",
                    ["attendance_api", "photo_checkin", "shift_map"],
                    "attendance_event",
                    "attendance event log",
                    "ops or HR review",
                    "Capture simple shift attendance with photo-backed check-ins.",
                ),
            ],
        },
        {
            "team_id": "client_delivery",
            "name": "Client Onboarding Pod",
            "status": "active" if coverage_score >= 70 else "partial",
            "scaling_tier": "per_client_pod",
            "mission": "Convert reusable templates into client-specific launches without rebuilding from zero.",
            "lead_agent": "Client Pod Manager",
            "cadence": "weekly",
            "inputs": ["client context pack", "selected modules", "input templates", "handover SOP"],
            "outputs": ["client pod blueprint", "setup checklist", "deployment notes"],
            "handoff_to": ["platform_engineering", "control_tower"],
            "agents": [
                _agent(
                    "client_pod_manager",
                    "Client Pod Manager",
                    "lead",
                    "review",
                    ["client_context", "portfolio_manifest", "template_registry"],
                    "client_pod_blueprint",
                    "client rollout blueprint",
                    "delivery lead review",
                    "Assemble the right module set, owner map, and deployment rhythm for each client.",
                ),
                _agent(
                    "document_intake",
                    "Document Intake Agent",
                    "mini_product_operator",
                    "write_controlled",
                    ["document_parser", "drive", "schemas"],
                    "structured_document_record",
                    "document intake records",
                    "operator review for critical records",
                    "Turn messy uploaded files into structured operational records.",
                ),
                _agent(
                    "reply_draft",
                    "Reply Draft Agent",
                    "mini_product_operator",
                    "draft",
                    ["gmail", "thread_context", "style_rules"],
                    "reply_draft",
                    "drafts only",
                    "human send required",
                    "Prepare cleaner replies for supplier, customer, or internal threads.",
                ),
            ],
        },
        {
            "team_id": "growth_studio",
            "name": "Revenue Pod",
            "status": "active",
            "scaling_tier": "shared_core",
            "mission": "Turn site traffic, outreach, proof, and inbound requests into qualified rollout demand.",
            "lead_agent": "Lead-to-Pilot Agent",
            "cadence": "weekly",
            "inputs": ["lead finder usage", "contact submissions", "product portfolio", "showroom analytics"],
            "outputs": ["qualified lead queue", "proof packs", "rollout-ready opportunities"],
            "handoff_to": ["command_office", "client_delivery"],
            "agents": [
                _agent(
                    "lead_to_pilot",
                    "Lead-to-Pilot Agent",
                    "lead",
                    "review",
                    ["lead_finder", "contact_submissions", "qualification_rules"],
                    "lead_qualification_pack",
                    "CRM-like qualification notes",
                    "sales review",
                    "Turn public interest into real pilot opportunities.",
                ),
                _agent(
                    "showroom_optimizer",
                    "Showroom Optimizer Agent",
                    "specialist",
                    "review",
                    ["website_review", "trial_usage", "page_copy"],
                    "showroom_backlog",
                    "showroom recommendations only",
                    "product owner review",
                    "Keep the public site clean, credible, and tied to live proof.",
                ),
                _agent(
                    "case_study_builder",
                    "Case Study Builder Agent",
                    "specialist",
                    "draft",
                    ["pilot_outputs", "delivery_notes", "result_metrics"],
                    "case_study_outline",
                    "case study drafts",
                    "commercial review",
                    "Package proof into reusable sales material without inflating claims.",
                ),
            ],
        },
        {
            "team_id": "rd_lab",
            "name": "R&D Lab",
            "status": "active" if required_failures == 0 else "partial",
            "scaling_tier": "shared_core",
            "mission": "Turn new tools, models, and workflow ideas into tested product upgrades instead of random experiments.",
            "lead_agent": "R&D Orchestrator",
            "cadence": "weekly",
            "inputs": ["product gaps", "client pain points", "agent evals", "new tools and frameworks"],
            "outputs": ["experiment backlog", "prototype reviews", "adopt or reject decisions"],
            "handoff_to": ["platform_engineering", "growth_studio", "client_delivery"],
            "agents": [
                _agent(
                    "rd_orchestrator",
                    "R&D Orchestrator",
                    "lead",
                    "review",
                    ["product_lab", "agent_team_system", "framework_notes"],
                    "rd_priority_brief",
                    "experiment backlog and adoption notes",
                    "product owner review",
                    "Choose which experiments are worth shipping and which should be cut.",
                ),
                _agent(
                    "framework_scout",
                    "Framework Scout Agent",
                    "researcher",
                    "review",
                    ["framework_watch", "sdk_notes", "integration_checklist"],
                    "framework_recommendation",
                    "tooling recommendations only",
                    "engineering review",
                    "Track useful frameworks, services, and patterns that can improve the product stack.",
                ),
                _agent(
                    "ux_concept_lab",
                    "UX Concept Lab Agent",
                    "designer",
                    "review",
                    ["showroom_review", "product_usage", "manus_references"],
                    "ux_concept_pack",
                    "design recommendations only",
                    "product owner review",
                    "Turn weak tool or website flows into clearer, more product-like interfaces.",
                ),
                _agent(
                    "automation_builder",
                    "Automation Builder Agent",
                    "builder",
                    "write_controlled",
                    ["scheduler", "workflow_specs", "playbooks"],
                    "automation_change_note",
                    "automation configs and playbooks",
                    "engineering review",
                    "Turn repeatable human work into scheduled workflows and reusable automations.",
                ),
            ],
        },
        {
            "team_id": "platform_engineering",
            "name": "Platform Engineering",
            "status": "active" if required_failures == 0 else "partial",
            "scaling_tier": "shared_core",
            "mission": "Maintain connectors, state, APIs, evals, and deployment surfaces so the agent system scales safely.",
            "lead_agent": "Agent Platform Steward",
            "cadence": "daily",
            "inputs": ["autopilot status", "execution review", "service health", "connector health"],
            "outputs": ["runtime fixes", "schema updates", "eval backlog", "deployment notes"],
            "handoff_to": ["all"],
            "agents": [
                _agent(
                    "platform_steward",
                    "Agent Platform Steward",
                    "lead",
                    "write_controlled",
                    ["fastapi", "state_store", "scheduler", "runbooks"],
                    "platform_change_note",
                    "runtime code and docs",
                    "engineering review",
                    "Own the core runtime, connectors, and source-of-truth state.",
                ),
                _agent(
                    "integrations_engineer",
                    "Integrations Engineer Agent",
                    "specialist",
                    "write_controlled",
                    ["gmail", "drive", "sheets", "oauth"],
                    "connector_status_pack",
                    "connector code and diagnostics",
                    "engineering review",
                    "Keep Gmail, Drive, Sheets, and publish flows healthy.",
                ),
                _agent(
                    "eval_guard",
                    "Evaluation Guard Agent",
                    "reviewer",
                    "review",
                    ["golden_cases", "latency_logs", "quality_checks"],
                    "agent_eval_report",
                    "eval reports only",
                    "engineering review before gating changes",
                    "Check that agents stay useful, typed, and cheap enough to run.",
                ),
            ],
        },
    ]

    team_gaps = [
        {
            "gap_id": "canonical_agent_state",
            "severity": "high",
            "team": "platform_engineering",
            "problem": "Agents are defined in docs and manifests, but not yet tracked with full run logs, approvals, and outcome metrics.",
            "next_step": "Add canonical tables for agent runs, approvals, and module-specific records.",
        },
        {
            "gap_id": "module_eval_packs",
            "severity": "high",
            "team": "platform_engineering",
            "problem": "Most modules still lack formal golden cases, fail cases, and typed regression checks.",
            "next_step": "Create eval sets for Action OS, Supplier Watch, Quality Closeout, and Cash Watch first.",
        },
        {
            "gap_id": "rd_decision_loop",
            "severity": "medium",
            "team": "rd_lab",
            "problem": "New tools and frameworks are discussed often, but the adopt, test, or reject loop is still too informal.",
            "next_step": "Track each experiment with a target workflow, success measure, and ship-or-drop decision.",
        },
        {
            "gap_id": "client_pod_provisioning",
            "severity": "medium",
            "team": "client_delivery",
            "problem": "Client pod setup is templated, but not yet one-command reproducible.",
            "next_step": "Generate context pack, input center sheets, board setup, and publish surfaces from one provisioning flow.",
        },
        {
            "gap_id": "browser_sidecar_guardrails",
            "severity": "medium",
            "team": "platform_engineering",
            "problem": "Computer-use or browser-side tasks are not yet isolated behind a clear sandbox and credentials policy.",
            "next_step": "Use browser agents only as sidecars with separate credentials and human review for critical writes.",
        },
        {
            "gap_id": "role_views",
            "severity": "medium",
            "team": "control_tower",
            "problem": "Manager and director outputs exist, but role-specific workspace views are still thin.",
            "next_step": "Add manager workspace and director flash endpoints backed by canonical state.",
        },
        {
            "gap_id": "erp_depth",
            "severity": "high",
            "team": "control_tower",
            "problem": "Receiving, inventory, production, and approval flows are still shallower than the action/risk layer.",
            "next_step": "Build Receiving Control and Inventory Pulse next, then expand Production Pulse and approvals.",
        },
    ]

    shared_core = [team["team_id"] for team in teams if team["scaling_tier"] == "shared_core"]
    client_pod_teams = [team["team_id"] for team in teams if team["scaling_tier"] == "per_client_pod"]

    versions = [
        {
            "name": "Lite Pod",
            "best_for": "one founder or manager trying the system with minimal setup",
            "includes": ["Action OS", "Lead Finder", "News Brief", "Action Board"],
            "operator_load": "low",
        },
        {
            "name": "Control Pod",
            "best_for": "teams needing supplier, quality, or cash control around one operating lane",
            "includes": ["Action OS", "Supplier Watch", "Quality Closeout", "Cash Watch"],
            "operator_load": "medium",
        },
        {
            "name": "Factory Pod",
            "best_for": "plant-heavy clients needing cross-functional command and role views",
            "includes": ["Action OS", "Supplier Watch", "Quality Closeout", "Production Pulse", "Attendance Check-In"],
            "operator_load": "high",
        },
        {
            "name": "Growth Pod",
            "best_for": "commercial teams needing lead generation, market watch, and follow-up support",
            "includes": ["Lead Finder", "News Brief", "Sales Signal", "Reply Draft"],
            "operator_load": "medium",
        },
    ]

    payload = {
        "version": "v2",
        "generated_at": datetime.now().astimezone().isoformat(),
        "status": status,
        "summary": {
            "company_name": context_summary.get("company_name", config.project_name),
            "context_id": context_summary.get("context_id", ""),
            "coverage_score": coverage_score,
            "required_failures": required_failures,
            "optional_failures": optional_failures,
            "gmail_ready": gmail_ready,
            "autonomy_score": autonomy_score,
            "autonomy_level": autonomy_level,
            "team_count": len(teams),
            "shared_core_team_count": len(shared_core),
            "client_pod_team_count": len(client_pod_teams),
            "priority_product_count": len(priority_products),
            "selected_control_module_count": len(selected_control_modules),
        },
        "operating_model": {
            "core_rule": "Use small bounded agents in teams. Keep source-of-truth state in the runtime. Let teams coordinate through typed records and explicit handoffs.",
            "shared_core_teams": shared_core,
            "client_pod_teams": client_pod_teams,
            "coordination_events": [
                "signal_detected",
                "risk_opened",
                "action_published",
                "approval_needed",
                "pilot_requested",
                "client_pod_ready",
            ],
            "review_rhythm": {
                "daily": ["command_office", "control_tower", "platform_engineering"],
                "weekly": ["client_delivery", "growth_studio", "command_office"],
            },
        },
        "teams": teams,
        "gaps": team_gaps,
        "scaling_model": {
            "shared_core": "Keep founder control, revenue, platform, and R&D teams shared across all clients.",
            "client_pod_pattern": "Spin up a per-client Client Operations Pod plus Client Onboarding Pod using the context pack and selected modules.",
            "rd_rule": "Keep R&D in the shared core. Only promote experiments into client pods after they survive eval and operator review.",
            "versions": versions,
            "client_specific_inputs": [
                "terminology",
                "owner_map",
                "approval_ladder",
                "data_source_paths",
                "thresholds",
                "review cadence",
            ],
            "reusable_assets": [
                "module templates",
                "input center sheets",
                "manager board",
                "workspace views",
                "operating SOPs",
                "eval sets",
            ],
        },
        "focus_products": {
            "priority_now": priority_products,
            "selected_for_context": selected_control_modules,
        },
        "manifest": build_agent_operating_manifest(),
        "next_moves": [
            "Add canonical state for supplier risks, incidents, collections, and approvals so the teams act on records instead of only snapshots.",
            "Build one-command client pod provisioning from context pack to sheets, board, and workspace surface.",
            "Add manager and director role views tied to the new agent teams.",
            "Give R&D Lab a tracked experiment backlog so framework and agent ideas lead to explicit ship or cut decisions.",
            "Create eval packs for Action OS, Supplier Watch, Quality Closeout, and Cash Watch before deeper autonomy.",
            "Keep browser/computer-use agents isolated as sidecars until the main runtime is fully record-first.",
        ],
        "top_priorities": review_priorities[:6],
    }
    return payload


def render_agent_team_markdown(payload: dict[str, Any]) -> str:
    summary = payload.get("summary", {})
    lines = [
        f"# Agent Team System",
        "",
        f"- Status: `{payload.get('status', 'unknown')}`",
        f"- Company: `{summary.get('company_name', '')}`",
        f"- Context ID: `{summary.get('context_id', '')}`",
        f"- Coverage score: `{summary.get('coverage_score', 0)}`",
        f"- Autonomy score: `{summary.get('autonomy_score', 0)}`",
        f"- Autonomy level: `{summary.get('autonomy_level', '')}`",
        f"- Team count: `{summary.get('team_count', 0)}`",
        f"- Shared core teams: `{summary.get('shared_core_team_count', 0)}`",
        f"- Client pod teams: `{summary.get('client_pod_team_count', 0)}`",
        "",
        "## Team Layout",
        "",
    ]

    for team in payload.get("teams", []):
        lines.extend(
            [
                f"### {team.get('name', '')}",
                "",
                f"- Team ID: `{team.get('team_id', '')}`",
                f"- Status: `{team.get('status', '')}`",
                f"- Scaling tier: `{team.get('scaling_tier', '')}`",
                f"- Mission: {team.get('mission', '')}",
                f"- Lead agent: `{team.get('lead_agent', '')}`",
                f"- Cadence: `{team.get('cadence', '')}`",
                f"- Handoff to: {', '.join(team.get('handoff_to', [])) or 'n/a'}",
                "",
                "Agents:",
            ]
        )
        for agent in team.get("agents", []):
            lines.append(
                f"- `{agent.get('name', '')}`: {agent.get('focus', '')} "
                f"(mode `{agent.get('mode', '')}`, schema `{agent.get('output_schema', '')}`)"
            )
        lines.append("")

    lines.extend(["## Gaps", ""])
    for gap in payload.get("gaps", []):
        lines.extend(
            [
                f"- `{gap.get('gap_id', '')}` [{gap.get('severity', '')}]: {gap.get('problem', '')}",
                f"  Next step: {gap.get('next_step', '')}",
            ]
        )

    lines.extend(["", "## Scaling Model", ""])
    for version in payload.get("scaling_model", {}).get("versions", []):
        includes = ", ".join(version.get("includes", []))
        lines.append(
            f"- `{version.get('name', '')}`: {version.get('best_for', '')}. Includes: {includes}. "
            f"Operator load: `{version.get('operator_load', '')}`."
        )

    lines.extend(["", "## Next Moves", ""])
    for item in payload.get("next_moves", []):
        lines.append(f"- {item}")

    manifest = payload.get("manifest", {}) if isinstance(payload, dict) else {}
    playbooks = manifest.get("playbooks", []) if isinstance(manifest, dict) else []
    tools = manifest.get("tools", []) if isinstance(manifest, dict) else []
    if manifest:
        lines.extend(
            [
                "",
                "## Runtime Contract",
                "",
                f"- Version: `{manifest.get('version', '')}`",
                f"- Tenant key: `{manifest.get('tenantKey', '')}`",
                f"- Tool count: `{len(tools)}`",
                f"- Playbook count: `{len(playbooks)}`",
                "",
            ]
        )
        for playbook in playbooks:
            lines.extend(
                [
                    f"- `{playbook.get('name', '')}` [{playbook.get('leadRole', '')}]: "
                    f"{playbook.get('workspace', '')} / "
                    f"{len(playbook.get('tools', []))} tools / "
                    f"{len(playbook.get('kpis', []))} KPIs",
                ]
            )
    return "\n".join(lines).strip() + "\n"


def write_agent_team_outputs(output_dir: Path, payload: dict[str, Any]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "agent_team_system.json"
    md_path = output_dir / "agent_team_system.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(render_agent_team_markdown(payload), encoding="utf-8")
    return {
        "json_file": str(json_path.resolve()),
        "markdown_file": str(md_path.resolve()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the SuperMega agent team system report.")
    parser.add_argument("--config", default="config.example.json", help="Path to config JSON.")
    parser.add_argument("--repo-root", default=".", help="Repo root path.")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).expanduser().resolve()
    config = PilotConfig.from_path(args.config)
    payload = build_agent_team_system(config, repo_root=repo_root)
    outputs = write_agent_team_outputs(config.output.inventory_path, payload)
    print(
        json.dumps(
            {
                "status": "ready",
                "summary": payload.get("summary", {}),
                "outputs": outputs,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
