from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any


PRODUCT_BLUEPRINTS: dict[str, dict[str, Any]] = {
    "lead_finder": {
        "name": "Lead Finder",
        "kind": "free_tool",
        "lane": "Commercial watch",
        "use_when": "You have raw lead lists or directory pages but no clean prospect sheet.",
        "time_to_first_live_output": "under 1 day",
        "primary_operator": "Growth lead or founder",
        "first_week_outcome": "A scored lead sheet with cleaner contacts and a first outreach list.",
        "required_connectors": ["manual_form"],
        "default_outputs": ["lead sheet", "CSV export", "priority shortlist"],
        "versions": ["retail leads", "distributor search", "industrial buyers"],
    },
    "news_brief": {
        "name": "News Brief",
        "kind": "free_tool",
        "lane": "Commercial watch",
        "use_when": "You already track headlines, but nobody turns them into one short brief.",
        "time_to_first_live_output": "under 1 day",
        "primary_operator": "Director or market-watch owner",
        "first_week_outcome": "A short market brief with tagged risks and next actions.",
        "required_connectors": ["external_feed", "manual_form"],
        "default_outputs": ["market brief", "risk tags", "action list"],
        "versions": ["policy watch", "market watch", "logistics watch"],
    },
    "action_board": {
        "name": "Action Board",
        "kind": "free_tool",
        "lane": "Run the day",
        "use_when": "Team updates exist, but owners and due dates are still informal.",
        "time_to_first_live_output": "under 1 day",
        "primary_operator": "Operations manager",
        "first_week_outcome": "One clean action list from raw updates with owners and due windows.",
        "required_connectors": ["manual_form"],
        "default_outputs": ["action list", "priority lane", "owner queue"],
        "versions": ["daily ops", "weekly review", "project follow-up"],
    },
    "action_os": {
        "name": "Action OS",
        "kind": "control_module",
        "lane": "Run the day",
        "use_when": "Managers are running the company from inboxes, sheets, and verbal updates.",
        "time_to_first_live_output": "3 to 5 days",
        "primary_operator": "Operations lead or chief of staff",
        "first_week_outcome": "A live owner + due-date board generated from daily updates and forwarded notes.",
        "required_connectors": ["sheet_row", "gmail_thread"],
        "default_outputs": ["action board", "blocker queue", "director summary"],
        "versions": ["ops-heavy", "director-heavy", "project-heavy"],
    },
    "supplier_watch": {
        "name": "Supplier Watch",
        "kind": "control_module",
        "lane": "Control risk",
        "use_when": "Supplier delay, payment, and customs risk are found too late.",
        "time_to_first_live_output": "3 to 5 days",
        "primary_operator": "Procurement manager",
        "first_week_outcome": "A live owner queue from supplier emails with risk tags and due dates.",
        "required_connectors": ["gmail_thread", "sheet_row"],
        "default_outputs": ["supplier risk board", "escalation queue", "follow-up list"],
        "versions": ["import watch", "delay watch", "documentation watch"],
    },
    "quality_closeout": {
        "name": "Quality Closeout",
        "kind": "control_module",
        "lane": "Control risk",
        "use_when": "Incidents get logged, but containment and CAPA follow-through are weak.",
        "time_to_first_live_output": "4 to 7 days",
        "primary_operator": "Quality manager",
        "first_week_outcome": "An incident-to-CAPA closeout board from one intake channel and one owner map.",
        "required_connectors": ["sheet_row", "drive_file"],
        "default_outputs": ["incident register", "CAPA chain", "closure checklist"],
        "versions": ["supplier NC", "customer complaint", "internal defect"],
    },
    "cash_watch": {
        "name": "Cash Watch",
        "kind": "control_module",
        "lane": "Control risk",
        "use_when": "Invoice control and payment follow-up depend on manual checking.",
        "time_to_first_live_output": "4 to 7 days",
        "primary_operator": "Finance manager",
        "first_week_outcome": "An overdue queue with owners, priorities, and promised-payment tracking.",
        "required_connectors": ["drive_file", "sheet_row"],
        "default_outputs": ["overdue queue", "collections list", "cash summary"],
        "versions": ["collections", "AR control", "payment confirmation"],
    },
    "production_pulse": {
        "name": "Production Pulse",
        "kind": "control_module",
        "lane": "Run the day",
        "use_when": "Shift updates and downtime notes exist, but not one reliable plant view.",
        "time_to_first_live_output": "4 to 7 days",
        "primary_operator": "Plant manager",
        "first_week_outcome": "A daily plant brief with top blockers and owner actions.",
        "required_connectors": ["sheet_row", "drive_file"],
        "default_outputs": ["plant brief", "blocker queue", "owner actions"],
        "versions": ["shift handover", "downtime watch", "plan vs actual"],
    },
    "sales_signal": {
        "name": "Sales Signal",
        "kind": "control_module",
        "lane": "Commercial watch",
        "use_when": "Demand shifts and distributor updates are not turned into fast decisions.",
        "time_to_first_live_output": "3 to 5 days",
        "primary_operator": "Commercial manager",
        "first_week_outcome": "A weekly commercial watchlist with demand-shift alerts and follow-up actions.",
        "required_connectors": ["sheet_row", "external_feed"],
        "default_outputs": ["sales signal brief", "watchlist", "follow-up queue"],
        "versions": ["distributor watch", "market watch", "price watch"],
    },
    "supermega_os": {
        "name": "SuperMega OS",
        "kind": "flagship",
        "lane": "Operating system",
        "use_when": "The company needs one action layer across managers, not another static dashboard.",
        "time_to_first_live_output": "2 to 4 weeks",
        "primary_operator": "Founder, GM, or operations director",
        "first_week_outcome": "One flagship control layer with one live module and one role-based review rhythm.",
        "required_connectors": ["gmail_thread", "drive_file", "sheet_row"],
        "default_outputs": ["manager board", "director brief", "exception queue"],
        "versions": ["director OS", "plant OS", "commercial OS"],
    },
}

PRODUCT_ALIASES = {
    "leadfinder": "lead_finder",
    "lead_finder": "lead_finder",
    "lead finder": "lead_finder",
    "newsbrief": "news_brief",
    "news_brief": "news_brief",
    "news brief": "news_brief",
    "marketbrief": "news_brief",
    "market_brief": "news_brief",
    "actionboard": "action_board",
    "action_board": "action_board",
    "action board": "action_board",
    "actionos": "action_os",
    "action_os": "action_os",
    "action os": "action_os",
    "supplierwatch": "supplier_watch",
    "supplier_watch": "supplier_watch",
    "supplier watch": "supplier_watch",
    "qualitycloseout": "quality_closeout",
    "quality_closeout": "quality_closeout",
    "quality closeout": "quality_closeout",
    "qualitycapa": "quality_closeout",
    "cashwatch": "cash_watch",
    "cash_watch": "cash_watch",
    "cash watch": "cash_watch",
    "productionpulse": "production_pulse",
    "production_pulse": "production_pulse",
    "production pulse": "production_pulse",
    "salessignal": "sales_signal",
    "sales_signal": "sales_signal",
    "sales signal": "sales_signal",
    "supermegaos": "supermega_os",
    "supermega_os": "supermega_os",
    "supermega os": "supermega_os",
}


def _slug(value: str) -> str:
    return "_".join("".join(ch.lower() if ch.isalnum() else " " for ch in str(value)).split())


def _ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    return [value]


def _ensure_str_list(value: Any) -> list[str]:
    items: list[str] = []
    for item in _ensure_list(value):
        text = str(item).strip()
        if text:
            items.append(text)
    return items


def _normalize_named_list(value: Any, default_kind: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, item in enumerate(_ensure_list(value)):
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip() or f"{default_kind}-{index + 1}"
            normalized = dict(item)
            normalized["name"] = name
            normalized.setdefault("kind", default_kind)
            items.append(normalized)
            continue
        text = str(item).strip()
        if text:
            items.append({"name": text, "kind": default_kind})
    return items


def _normalize_search_queries(value: Any) -> list[dict[str, Any]]:
    queries: list[dict[str, Any]] = []
    for item in _ensure_list(value):
        if isinstance(item, dict):
            name = str(item.get("name", "")).strip()
            query = str(item.get("query", "")).strip()
            if not name and query:
                name = _slug(query) or "query"
            if not query and name:
                query = name
            if name and query:
                queries.append({"name": name, "query": query, "top_k": int(item.get("top_k", 5) or 5)})
            continue
        text = str(item).strip()
        if text:
            queries.append({"name": _slug(text) or "query", "query": text, "top_k": 5})
    return queries


def _normalize_input_templates(value: Any) -> list[dict[str, Any]]:
    templates: list[dict[str, Any]] = []
    for item in _ensure_list(value):
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip() or _slug(item.get("title", "template"))
        title = str(item.get("title", "")).strip() or key.replace("_", " ").title()
        templates.append(
            {
                "key": key,
                "title": title,
                "description": str(item.get("description", "")).strip(),
                "headers": _ensure_str_list(item.get("headers", [])),
                "sample_row": [str(cell) for cell in _ensure_list(item.get("sample_row", []))],
            }
        )
    return templates


def _canonical_product_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    alias = PRODUCT_ALIASES.get(text.lower())
    if alias:
        return alias
    slug = _slug(text)
    return PRODUCT_ALIASES.get(slug, slug)


def _normalize_selected_products(raw: dict[str, Any]) -> dict[str, Any]:
    old_selection = raw.get("module_selection", {}) if isinstance(raw.get("module_selection"), dict) else {}
    selection = raw.get("selected_products", {}) if isinstance(raw.get("selected_products"), dict) else {}

    flagship = _canonical_product_id(selection.get("flagship", "")) or "supermega_os"
    free_tools = [
        item
        for item in (_canonical_product_id(product) for product in selection.get("free_tools", []))
        if item
    ]
    control_modules = [
        item
        for item in (_canonical_product_id(product) for product in selection.get("control_modules", []))
        if item
    ]

    old_free_tool = _canonical_product_id(old_selection.get("free_tool", ""))
    if old_free_tool and old_free_tool not in free_tools:
        free_tools.insert(0, old_free_tool)

    first_control = _canonical_product_id(old_selection.get("first_control_module", ""))
    if first_control and first_control not in control_modules:
        control_modules.insert(0, first_control)

    for product in _ensure_list(old_selection.get("next_modules", [])):
        product_id = _canonical_product_id(product)
        if product_id and product_id not in control_modules:
            control_modules.append(product_id)

    return {
        "flagship": flagship,
        "free_tools": free_tools,
        "control_modules": control_modules,
        "role_dashboards": _ensure_str_list(selection.get("role_dashboards", old_selection.get("role_dashboards", []))),
    }


def normalize_client_context(raw: dict[str, Any], resolved_path: Path) -> dict[str, Any]:
    company_raw = raw.get("company", {}) if isinstance(raw.get("company"), dict) else {}
    sources_raw = raw.get("sources", {}) if isinstance(raw.get("sources"), dict) else {}
    connectors_raw = raw.get("connectors", {}) if isinstance(raw.get("connectors"), dict) else {}
    entities_raw = raw.get("entities", {}) if isinstance(raw.get("entities"), dict) else {}
    entity_maps_raw = raw.get("entity_maps", {}) if isinstance(raw.get("entity_maps"), dict) else {}
    rules_raw = raw.get("rules", {}) if isinstance(raw.get("rules"), dict) else {}
    workflow_rules_raw = raw.get("workflow_rules", {}) if isinstance(raw.get("workflow_rules"), dict) else {}
    outputs_raw = raw.get("outputs", {}) if isinstance(raw.get("outputs"), dict) else {}
    governance_raw = raw.get("governance", {}) if isinstance(raw.get("governance"), dict) else {}
    success_metrics_raw = raw.get("success_metrics", {}) if isinstance(raw.get("success_metrics"), dict) else {}

    gmail_raw = connectors_raw.get("gmail", {}) if isinstance(connectors_raw.get("gmail"), dict) else {}
    drive_raw = connectors_raw.get("drive", {}) if isinstance(connectors_raw.get("drive"), dict) else {}
    sheets_raw = connectors_raw.get("sheets", {}) if isinstance(connectors_raw.get("sheets"), dict) else {}
    external_raw = connectors_raw.get("external", {}) if isinstance(connectors_raw.get("external"), dict) else {}

    raw_profiles = gmail_raw.get("query_profiles", gmail_raw.get("profiles", sources_raw.get("gmail", [])))
    gmail_profiles = (
        {str(key): str(value) for key, value in raw_profiles.items() if str(value).strip()}
        if isinstance(raw_profiles, dict)
        else {}
    )

    normalized = {
        "context_id": str(raw.get("context_id", "")).strip()
        or _slug(company_raw.get("name", ""))
        or _slug(resolved_path.stem),
        "company": {
            "name": str(company_raw.get("name", "")).strip(),
            "industry": str(company_raw.get("industry", "")).strip(),
            "footprint": str(company_raw.get("footprint", "")).strip(),
            "roles": _ensure_str_list(company_raw.get("roles", company_raw.get("core_roles", []))),
            "priorities": _ensure_str_list(company_raw.get("priorities", company_raw.get("priority", []))),
        },
        "selected_products": _normalize_selected_products(raw),
        "connectors": {
            "gmail": {
                "user_email": str(gmail_raw.get("user_email", "")).strip(),
                "query": str(gmail_raw.get("query", "")).strip(),
                "query_profiles": gmail_profiles,
                "mailboxes": _ensure_str_list(gmail_raw.get("mailboxes", [])),
            },
            "drive": {
                "local_root": str(drive_raw.get("local_root", "")).strip(),
                "folder_id": str(drive_raw.get("folder_id", drive_raw.get("google_drive_folder_id", ""))).strip(),
                "publish_folder_id": str(drive_raw.get("publish_folder_id", "")).strip(),
                "service_account_json": str(drive_raw.get("service_account_json", "")).strip(),
                "sources": _normalize_named_list(sources_raw.get("drive", []), "drive_file"),
            },
            "sheets": {
                "workspace_folder_name": str(sheets_raw.get("workspace_folder_name", "")).strip(),
                "templates": _normalize_input_templates(sheets_raw.get("templates", [])),
                "sources": _normalize_named_list(sources_raw.get("sheets", []), "sheet_row"),
            },
            "external": {
                "watch_keywords": _ensure_str_list(external_raw.get("watch_keywords", sources_raw.get("watch_keywords", []))),
                "sources": _normalize_named_list(
                    external_raw.get("sources", sources_raw.get("external", sources_raw.get("news_sources", []))),
                    "external_feed",
                ),
            },
        },
        "entity_maps": {
            "suppliers": _normalize_named_list(entity_maps_raw.get("suppliers", entities_raw.get("suppliers", [])), "supplier"),
            "customers": _normalize_named_list(entity_maps_raw.get("customers", entities_raw.get("customers", [])), "customer"),
            "plants": _normalize_named_list(entity_maps_raw.get("plants", entities_raw.get("plants", [])), "plant"),
            "teams": _normalize_named_list(entity_maps_raw.get("teams", entities_raw.get("teams", [])), "team"),
            "owners": _normalize_named_list(entity_maps_raw.get("owners", entities_raw.get("owners", [])), "owner"),
            "approvers": _normalize_named_list(entity_maps_raw.get("approvers", entities_raw.get("approvers", [])), "approver"),
            "aliases": entity_maps_raw.get("aliases", {}),
        },
        "terminology": {
            key: _ensure_str_list(value)
            for key, value in (raw.get("terminology", {}) if isinstance(raw.get("terminology"), dict) else {}).items()
        },
        "workflow_rules": {
            "severity_levels": _ensure_str_list(workflow_rules_raw.get("severity_levels", rules_raw.get("severity_levels", []))),
            "risk_categories": _ensure_str_list(workflow_rules_raw.get("risk_categories", rules_raw.get("risk_categories", []))),
            "routing_rules": _ensure_list(workflow_rules_raw.get("routing_rules", [])),
            "due_date_rules": _ensure_list(workflow_rules_raw.get("due_date_rules", rules_raw.get("due_date_rules", []))),
            "escalation_rules": _ensure_list(workflow_rules_raw.get("escalation_rules", rules_raw.get("escalation_rules", []))),
            "approval_rules": _ensure_list(workflow_rules_raw.get("approval_rules", rules_raw.get("approval_rules", []))),
        },
        "outputs": {
            "dashboard_title": str(outputs_raw.get("dashboard_title", "")).strip(),
            "email_profiles": _ensure_str_list(outputs_raw.get("email_profiles", [])),
            "search_queries": _normalize_search_queries(outputs_raw.get("search_queries", [])),
            "input_templates": _normalize_input_templates(outputs_raw.get("input_templates", [])),
            "views": _ensure_str_list(outputs_raw.get("views", [])),
        },
        "governance": {
            "mode": str(governance_raw.get("mode", "read_only")).strip() or "read_only",
            "writeback_allowed": bool(governance_raw.get("writeback_allowed", False)),
            "approval_required_for": _ensure_str_list(governance_raw.get("approval_required_for", [])),
            "closers": _ensure_str_list(governance_raw.get("closers", [])),
            "overrides": _ensure_str_list(governance_raw.get("overrides", [])),
        },
        "success_metrics": {
            "week_1": _ensure_str_list(success_metrics_raw.get("week_1", [])),
            "month_1": _ensure_str_list(success_metrics_raw.get("month_1", [])),
            "kpis": _ensure_str_list(success_metrics_raw.get("kpis", [])),
        },
    }

    if not normalized["outputs"]["input_templates"]:
        normalized["outputs"]["input_templates"] = list(normalized["connectors"]["sheets"]["templates"])
    if not normalized["outputs"]["dashboard_title"] and normalized["company"]["name"]:
        normalized["outputs"]["dashboard_title"] = f"{normalized['company']['name']} Intelligence Hub"
    return normalized


def _available_connectors(context: dict[str, Any]) -> set[str]:
    available: set[str] = {"manual_form"}
    gmail = context.get("connectors", {}).get("gmail", {})
    if gmail.get("query_profiles") or gmail.get("user_email"):
        available.add("gmail_thread")
    drive = context.get("connectors", {}).get("drive", {})
    if drive.get("local_root") or drive.get("folder_id") or drive.get("sources"):
        available.add("drive_file")
    sheets = context.get("connectors", {}).get("sheets", {})
    if sheets.get("workspace_folder_name") or sheets.get("templates") or sheets.get("sources"):
        available.add("sheet_row")
    external = context.get("connectors", {}).get("external", {})
    if external.get("watch_keywords") or external.get("sources"):
        available.add("external_feed")
    return available


def _validate_context(context: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not context.get("company", {}).get("name"):
        errors.append("company.name is required.")
    available = _available_connectors(context)
    if not available:
        warnings.append("No connectors are configured yet. The context pack is still descriptive only.")

    selected = context.get("selected_products", {})
    if not selected.get("free_tools") and not selected.get("control_modules"):
        warnings.append("No free tools or control modules are selected.")

    for product_id in [selected.get("flagship", "")] + list(selected.get("free_tools", [])) + list(selected.get("control_modules", [])):
        if product_id and product_id not in PRODUCT_BLUEPRINTS:
            warnings.append(f"Unknown product id '{product_id}' in selected_products.")

    first_control = next(iter(selected.get("control_modules", [])), "")
    if first_control in PRODUCT_BLUEPRINTS:
        missing = sorted(set(PRODUCT_BLUEPRINTS[first_control].get("required_connectors", [])) - available)
        if missing:
            warnings.append(f"First control module '{PRODUCT_BLUEPRINTS[first_control]['name']}' is missing connectors: {', '.join(missing)}.")

    if not context.get("outputs", {}).get("email_profiles") and "gmail_thread" in available:
        warnings.append("Gmail is configured but outputs.email_profiles is empty.")
    if not context.get("outputs", {}).get("input_templates") and "sheet_row" in available:
        warnings.append("Sheets are configured but no input templates are defined yet.")
    return errors, warnings


def _module_plan(product_id: str, available_connectors: set[str]) -> dict[str, Any]:
    blueprint = PRODUCT_BLUEPRINTS.get(product_id, {})
    required = list(blueprint.get("required_connectors", []))
    missing = sorted(set(required) - available_connectors)
    return {
        "id": product_id,
        "name": blueprint.get("name", product_id),
        "kind": blueprint.get("kind", ""),
        "lane": blueprint.get("lane", ""),
        "use_when": blueprint.get("use_when", ""),
        "time_to_first_live_output": blueprint.get("time_to_first_live_output", ""),
        "primary_operator": blueprint.get("primary_operator", ""),
        "first_week_outcome": blueprint.get("first_week_outcome", ""),
        "required_connectors": required,
        "default_outputs": list(blueprint.get("default_outputs", [])),
        "versions": list(blueprint.get("versions", [])),
        "missing_connectors": missing,
        "status": "ready" if not missing else "needs_context",
    }


def build_client_context_report(context_state: dict[str, Any]) -> dict[str, Any]:
    if not context_state:
        return {
            "status": "not_configured",
            "summary": {"company_name": "", "context_id": "", "selected_module_count": 0, "connector_count": 0, "readiness_score": 0},
            "validation_errors": [],
            "validation_warnings": [],
            "deployment_sequence": [],
            "lanes": [],
            "next_actions": ["Add a client context pack before trying to reuse these modules across other companies."],
        }

    context = copy.deepcopy(context_state)
    available = _available_connectors(context)
    selected = context.get("selected_products", {})

    deployment_sequence: list[dict[str, Any]] = []
    for product_id in selected.get("free_tools", []):
        deployment_sequence.append(_module_plan(product_id, available))
    for product_id in selected.get("control_modules", []):
        deployment_sequence.append(_module_plan(product_id, available))
    flagship_id = str(selected.get("flagship", "")).strip()
    if flagship_id:
        deployment_sequence.append(_module_plan(flagship_id, available))

    lanes: dict[str, list[dict[str, Any]]] = {}
    for item in deployment_sequence:
        lanes.setdefault(item.get("lane", "Other"), []).append(item)

    error_count = len(context.get("validation_errors", []))
    warning_count = len(context.get("validation_warnings", []))
    readiness_score = 100 - (error_count * 30) - (warning_count * 8)
    readiness_score -= sum(len(item.get("missing_connectors", [])) for item in deployment_sequence[:3]) * 7
    readiness_score = max(0, min(100, readiness_score))

    next_actions: list[str] = []
    if error_count:
        next_actions.append("Fix the blocking context-pack errors before trying to deploy this client profile.")
    for item in deployment_sequence:
        if item.get("missing_connectors"):
            next_actions.append(
                f"Add {', '.join(item.get('missing_connectors', []))} for {item.get('name', '')} so it can move from template to live rollout."
            )
            break
    if not context.get("success_metrics", {}).get("week_1"):
        next_actions.append("Define week-1 success metrics so each pilot has a concrete first proof of value.")
    if not context.get("outputs", {}).get("views"):
        next_actions.append("Choose the first manager or director view so the rollout lands on one real operating screen.")
    if not next_actions:
        next_actions.append("Context pack is structurally ready. Focus next on wiring the first control module to live data.")

    summary = {
        "company_name": context.get("company", {}).get("name", ""),
        "industry": context.get("company", {}).get("industry", ""),
        "context_id": context.get("context_id", ""),
        "selected_module_count": len(deployment_sequence),
        "free_tool_count": len(selected.get("free_tools", [])),
        "control_module_count": len(selected.get("control_modules", [])),
        "connector_count": len(available),
        "entity_count": sum(len(context.get("entity_maps", {}).get(key, [])) for key in ("suppliers", "customers", "plants", "teams", "owners", "approvers")),
        "readiness_score": readiness_score,
    }

    return {
        "status": context.get("status", "warning"),
        "resolved_path": context.get("resolved_path", ""),
        "summary": summary,
        "company": context.get("company", {}),
        "selected_products": selected,
        "available_connectors": sorted(available),
        "validation_errors": list(context.get("validation_errors", [])),
        "validation_warnings": list(context.get("validation_warnings", [])),
        "deployment_sequence": deployment_sequence,
        "lanes": [{"lane": lane, "modules": modules} for lane, modules in lanes.items()],
        "outputs": context.get("outputs", {}),
        "governance": context.get("governance", {}),
        "success_metrics": context.get("success_metrics", {}),
        "next_actions": next_actions,
    }


def render_client_context_markdown(report: dict[str, Any]) -> str:
    summary = report.get("summary", {})
    lines = [
        "# Client Context Blueprint",
        "",
        f"- Status: `{report.get('status', 'unknown')}`",
        f"- Company: `{summary.get('company_name', '')}`",
        f"- Context ID: `{summary.get('context_id', '')}`",
        f"- Connector count: `{summary.get('connector_count', 0)}`",
        f"- Selected modules: `{summary.get('selected_module_count', 0)}`",
        f"- Readiness score: `{summary.get('readiness_score', 0)}`",
        "",
        "## Validation",
        "",
    ]
    if report.get("validation_errors"):
        for item in report.get("validation_errors", []):
            lines.append(f"- Error: {item}")
    else:
        lines.append("- No blocking validation errors.")
    if report.get("validation_warnings"):
        for item in report.get("validation_warnings", []):
            lines.append(f"- Warning: {item}")
    else:
        lines.append("- No validation warnings.")

    lines.extend(["", "## Deployment Sequence", ""])
    for item in report.get("deployment_sequence", []):
        lines.extend(
            [
                f"### {item.get('name', '')}",
                "",
                f"- Lane: {item.get('lane', '')}",
                f"- Primary operator: {item.get('primary_operator', '')}",
                f"- Use when: {item.get('use_when', '')}",
                f"- Time to first live output: {item.get('time_to_first_live_output', '')}",
                f"- Week 1 outcome: {item.get('first_week_outcome', '')}",
                f"- Required connectors: {', '.join(item.get('required_connectors', [])) or '(none)'}",
                f"- Missing connectors: {', '.join(item.get('missing_connectors', [])) or '(none)'}",
                f"- Default outputs: {', '.join(item.get('default_outputs', [])) or '(none)'}",
                f"- Versions: {', '.join(item.get('versions', [])) or '(none)'}",
                "",
            ]
        )
    lines.extend(["## Next Actions", ""])
    for item in report.get("next_actions", []):
        lines.append(f"- {item}")
    return "\n".join(lines)


def write_client_context_outputs(report: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    context_id = _slug(str(report.get("summary", {}).get("context_id", "")).strip() or "default")
    json_text = json.dumps(report, indent=2)
    markdown_text = render_client_context_markdown(report)

    json_file = output_dir / "client_context_blueprint.json"
    md_file = output_dir / "client_context_blueprint.md"
    context_json_file = output_dir / f"client_context_blueprint_{context_id}.json"
    context_md_file = output_dir / f"client_context_blueprint_{context_id}.md"

    json_file.write_text(json_text, encoding="utf-8")
    md_file.write_text(markdown_text, encoding="utf-8")
    context_json_file.write_text(json_text, encoding="utf-8")
    context_md_file.write_text(markdown_text, encoding="utf-8")
    return {
        "json_file": str(json_file.resolve()),
        "markdown_file": str(md_file.resolve()),
        "context_json_file": str(context_json_file.resolve()),
        "context_markdown_file": str(context_md_file.resolve()),
    }


def _project_external_sources(context: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    news_sources: list[dict[str, Any]] = []
    manual_sources: list[dict[str, Any]] = []
    for item in context.get("connectors", {}).get("external", {}).get("sources", []):
        entry = {
            "name": str(item.get("name", "")).strip(),
            "kind": str(item.get("kind", "external_feed")).strip() or "external_feed",
            "url": str(item.get("url", "")).strip(),
            "notes": str(item.get("notes", "")).strip(),
        }
        if "manual" in entry["kind"] or "social" in entry["kind"]:
            manual_sources.append(entry)
        else:
            news_sources.append(entry)
    return news_sources, manual_sources


def apply_client_context(base_config: dict[str, Any], context: dict[str, Any], resolved_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    data = copy.deepcopy(base_config)
    sources = data.setdefault("sources", {})
    gmail = sources.setdefault("gmail", {})
    drive = sources.setdefault("drive", {})
    external = sources.setdefault("external", {})
    platform = data.setdefault("platform", {})
    publish = platform.setdefault("publish", {})
    input_center = data.setdefault("input_center", {})

    gmail_context = context.get("connectors", {}).get("gmail", {})
    if gmail_context.get("user_email"):
        gmail["user_email"] = gmail_context["user_email"]
    if gmail_context.get("query"):
        gmail["query"] = gmail_context["query"]
    if gmail_context.get("query_profiles"):
        gmail["profiles"] = gmail_context["query_profiles"]

    drive_context = context.get("connectors", {}).get("drive", {})
    if drive_context.get("local_root"):
        drive["local_root"] = drive_context["local_root"]
    if drive_context.get("folder_id"):
        drive["google_drive_folder_id"] = drive_context["folder_id"]
    if drive_context.get("service_account_json"):
        drive["service_account_json"] = drive_context["service_account_json"]
    if drive_context.get("publish_folder_id"):
        publish["drive_folder_id"] = drive_context["publish_folder_id"]
        if not input_center.get("drive_folder_id"):
            input_center["drive_folder_id"] = drive_context["publish_folder_id"]

    sheets_context = context.get("connectors", {}).get("sheets", {})
    if sheets_context.get("workspace_folder_name"):
        input_center["workspace_folder_name"] = sheets_context["workspace_folder_name"]
    templates = context.get("outputs", {}).get("input_templates", []) or sheets_context.get("templates", [])
    if templates:
        input_center["templates"] = templates

    outputs = context.get("outputs", {})
    if outputs.get("dashboard_title"):
        platform["dashboard_title"] = outputs["dashboard_title"]
    if outputs.get("email_profiles"):
        platform["email_profiles"] = outputs["email_profiles"]
    if outputs.get("search_queries"):
        platform["search_queries"] = outputs["search_queries"]

    external_context = context.get("connectors", {}).get("external", {})
    if external_context.get("watch_keywords"):
        external["watch_keywords"] = external_context["watch_keywords"]
    news_sources, manual_sources = _project_external_sources(context)
    if news_sources:
        external["news_sources"] = news_sources
    if manual_sources:
        external["manual_sources"] = manual_sources

    validation_errors, validation_warnings = _validate_context(context)
    status = "error" if validation_errors else "warning" if validation_warnings else "ready"
    context_state = copy.deepcopy(context)
    context_state.update(
        {
            "path": str(base_config.get("client_context", {}).get("path", "")),
            "resolved_path": str(resolved_path),
            "status": status,
            "validation_errors": validation_errors,
            "validation_warnings": validation_warnings,
        }
    )
    data["client_context"] = context_state
    return data, context_state


def resolve_client_context(base_config: dict[str, Any], config_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    context_config = base_config.get("client_context", {})
    if not isinstance(context_config, dict):
        context_config = {}
    context_path_value = str(context_config.get("path", "")).strip()
    if not context_path_value:
        context_state = {"path": "", "resolved_path": "", "status": "not_configured", "validation_errors": [], "validation_warnings": []}
        data = copy.deepcopy(base_config)
        data["client_context"] = context_state
        return data, context_state

    context_path = Path(context_path_value).expanduser()
    if not context_path.is_absolute():
        context_path = (config_path.parent / context_path).resolve()
    if not context_path.exists():
        context_state = {
            "path": context_path_value,
            "resolved_path": str(context_path),
            "status": "error",
            "validation_errors": [f"Client context file does not exist: {context_path}"],
            "validation_warnings": [],
        }
        data = copy.deepcopy(base_config)
        data["client_context"] = context_state
        return data, context_state

    raw = json.loads(context_path.read_text(encoding="utf-8"))
    normalized = normalize_client_context(raw if isinstance(raw, dict) else {}, context_path)
    return apply_client_context(base_config, normalized, context_path)


def scaffold_client_context_template(output_path: Path, template_path: Path, force: bool = False) -> dict[str, str]:
    if output_path.exists() and not force:
        raise FileExistsError(f"Client context file already exists: {output_path}")
    payload = json.loads(template_path.read_text(encoding="utf-8"))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"output_file": str(output_path.resolve()), "template_file": str(template_path.resolve())}
