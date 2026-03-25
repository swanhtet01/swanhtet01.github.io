from __future__ import annotations

from typing import Any


CURRENT_STACK = [
    "React",
    "Vite",
    "TypeScript",
    "FastAPI",
    "SQLite",
    "Google APIs",
    "PowerShell operators",
]

NEXT_STACK = [
    "SQLModel",
    "Cloud Run",
    "Cloud Scheduler",
    "Cloud Tasks",
    "Secret Manager",
    "Polars",
    "DuckDB",
    "LangGraph",
    "PydanticAI",
    "Playwright or Stagehand",
]

PRIORITY_TO_MODULE = {
    "actions": "Action OS",
    "follow_up": "Action OS",
    "director_visibility": "Action OS",
    "supplier": "Supplier Watch",
    "receiving": "Receiving Control",
    "inventory": "Inventory Pulse",
    "quality": "Quality Closeout",
    "cash": "Cash Watch",
    "sales": "Sales Signal",
    "production": "Production Pulse",
    "attendance": "Production Pulse",
}

MODULE_REASONS = {
    "Action OS": "Creates one shared owner and due-date layer before adding deeper ERP logic.",
    "Supplier Watch": "Flags delay, customs, documentation, and supplier-payment risk before they hit operations.",
    "Receiving Control": "Turns inbound receipt, variance, and hold status into one working control board.",
    "Inventory Pulse": "Shows available stock, reorder pressure, and warehouse risk without waiting for a full ERP rollout.",
    "Quality Closeout": "Moves incidents from report-only into containment, CAPA, and closeout discipline.",
    "Cash Watch": "Puts overdue, promised payment, and follow-up into one finance control surface.",
    "Production Pulse": "Converts daily shift and downtime noise into a usable manager execution view.",
    "Sales Signal": "Converts market and distributor updates into one commercial watch layer.",
}

SEMI_PRODUCT_RULES = {
    "Document Intake": {"keywords": {"receiving", "inventory", "quality", "cash", "documents", "supplier"}},
    "Reply Draft": {"keywords": {"supplier", "cash", "sales", "follow_up"}},
    "Director Flash": {"keywords": {"actions", "director_visibility", "quality", "cash", "sales"}},
    "Attendance Check-In": {"keywords": {"production", "attendance"}},
}

FREE_TOOL_RULES = {
    "Lead Finder": {"keywords": {"sales", "growth", "distribution", "services"}},
    "News Brief": {"keywords": {"sales", "director_visibility", "supplier", "production"}},
    "Action Board": {"keywords": {"actions", "follow_up", "director_visibility", "quality", "cash", "production"}},
}


def _clean_list(values: list[str] | None) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        cleaned = str(value or "").strip().lower().replace(" ", "_")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def _append_unique(items: list[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def _service_packs(sector: str, priorities: list[str]) -> list[str]:
    packs = ["Owner / Director OS"]
    if sector in {"factory", "manufacturing", "mixed"} or any(
        item in priorities for item in {"supplier", "receiving", "inventory", "quality", "production", "attendance"}
    ):
        packs.append("Factory Control")
    if sector in {"distribution", "trading", "services", "mixed"} or any(
        item in priorities for item in {"cash", "sales", "follow_up"}
    ):
        packs.append("Commercial Control")
    return packs


def _recommended_modules(sector: str, priorities: list[str]) -> list[str]:
    modules = ["Action OS"]
    for priority in priorities:
        _append_unique(modules, PRIORITY_TO_MODULE.get(priority, ""))

    if sector in {"factory", "manufacturing"}:
        for module in ["Receiving Control", "Inventory Pulse", "Supplier Watch", "Quality Closeout", "Production Pulse"]:
            _append_unique(modules, module)
    elif sector in {"distribution", "trading"}:
        for module in ["Cash Watch", "Sales Signal", "Supplier Watch", "Inventory Pulse"]:
            _append_unique(modules, module)
    elif sector == "services":
        for module in ["Sales Signal", "Cash Watch"]:
            _append_unique(modules, module)
    else:
        for module in ["Supplier Watch", "Cash Watch", "Sales Signal"]:
            _append_unique(modules, module)

    return modules


def _semi_products(priorities: list[str], modules: list[str]) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    keyword_set = set(priorities)
    for name, rule in SEMI_PRODUCT_RULES.items():
        if keyword_set.intersection(rule["keywords"]):
            output.append(
                {
                    "name": name,
                    "reason": {
                        "Document Intake": "Use it as the front door for files so teams stop retyping documents into later modules.",
                        "Reply Draft": "Use it beside Supplier Watch or Cash Watch to cut repetitive thread handling.",
                        "Director Flash": "Use it on top of Action OS and the control modules to brief owners and directors.",
                        "Attendance Check-In": "Use it to get basic shift presence into the operating system quickly.",
                    }[name],
                }
            )
    if any(module in modules for module in {"Receiving Control", "Inventory Pulse"}) and not any(
        item["name"] == "Document Intake" for item in output
    ):
        output.append(
            {
                "name": "Document Intake",
                "reason": "Receiving and inventory flows get much cleaner when inbound documents land in a structured intake first.",
            }
        )
    return output


def _free_tools(priorities: list[str], sector: str) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    keyword_set = set(priorities)
    for name, rule in FREE_TOOL_RULES.items():
        if keyword_set.intersection(rule["keywords"]):
            output.append(
                {
                    "name": name,
                    "reason": {
                        "Lead Finder": "Good front-door proof for outbound, partnerships, and commercial teams.",
                        "News Brief": "Useful proof for director watch layers and market monitoring.",
                        "Action Board": "Best general proof because it shows messy work turning into a usable management queue.",
                    }[name],
                }
            )
    if sector in {"factory", "manufacturing"} and not any(item["name"] == "Action Board" for item in output):
        output.append({"name": "Action Board", "reason": "Good proof tool for plant and operations follow-up."})
    return output


def _agent_teams(modules: list[str], sector: str) -> list[dict[str, str]]:
    teams = [
        {"name": "Command Office", "role": "Owns director visibility, priorities, and operating reviews."},
        {"name": "Client Delivery", "role": "Turns reusable templates into a live client rollout."},
        {"name": "R&D Lab", "role": "Tests new tools, UX, and workflow upgrades before productizing them."},
        {"name": "Platform Engineering", "role": "Owns connectors, APIs, state, evals, and deployment."},
    ]
    if modules:
        teams.insert(
            1,
            {"name": "Control Tower", "role": "Runs live operational queues for actions, suppliers, receiving, inventory, quality, and cash."},
        )
    if sector in {"distribution", "trading", "services", "mixed"} or "Sales Signal" in modules:
        teams.append({"name": "Growth Studio", "role": "Turns proof tools and outreach into qualified pilot demand."})
    return teams


def _implementation_order(sector: str, modules: list[str]) -> list[str]:
    order = ["Action OS"]
    if sector in {"factory", "manufacturing"}:
        for item in ["Receiving Control", "Inventory Pulse", "Supplier Watch", "Quality Closeout", "Production Pulse"]:
            if item in modules:
                _append_unique(order, item)
    elif sector in {"distribution", "trading"}:
        for item in ["Cash Watch", "Sales Signal", "Supplier Watch", "Inventory Pulse"]:
            if item in modules:
                _append_unique(order, item)
    else:
        for item in modules:
            _append_unique(order, item)
    _append_unique(order, "Approval Layer")
    return order


def _next_stack(sector: str, modules: list[str]) -> list[str]:
    stack = ["SQLModel", "Cloud Run", "Cloud Scheduler", "Cloud Tasks", "Secret Manager"]
    if any(item in modules for item in {"Receiving Control", "Inventory Pulse", "Cash Watch", "Production Pulse"}):
        stack.extend(["Polars", "DuckDB"])
    if len(modules) >= 4:
        stack.extend(["LangGraph", "PydanticAI"])
    if sector in {"services", "distribution", "mixed"}:
        stack.append("Playwright or Stagehand")
    return stack


def _ux_surfaces(modules: list[str], sector: str) -> list[str]:
    surfaces = [
        "Director command view",
        "Manager action board",
        "Exception queue",
        "Document intake lane",
    ]
    if any(item in modules for item in {"Receiving Control", "Inventory Pulse", "Production Pulse"}):
        surfaces.append("Operator mobile forms")
    if sector in {"distribution", "services", "mixed"}:
        surfaces.append("Commercial watch view")
    return surfaces


def build_solution_blueprint(payload: dict[str, Any]) -> dict[str, Any]:
    company_name = str(payload.get("company_name") or "New Client").strip()
    sector = str(payload.get("sector") or "mixed").strip().lower()
    priorities = _clean_list(payload.get("priorities"))
    current_tools = _clean_list(payload.get("current_tools"))
    data_sources = _clean_list(payload.get("data_sources"))
    pain_points = str(payload.get("pain_points") or "").strip()
    team_size = int(payload.get("team_size") or 25)
    site_count = int(payload.get("site_count") or 1)

    packs = _service_packs(sector, priorities)
    modules = _recommended_modules(sector, priorities)
    semi_products = _semi_products(priorities, modules)
    free_tools = _free_tools(priorities, sector)
    agent_teams = _agent_teams(modules, sector)
    implementation_order = _implementation_order(sector, modules)
    next_stack = _next_stack(sector, modules)
    ux_surfaces = _ux_surfaces(modules, sector)

    value_prop = (
        "Start with Action OS so the company gets one live owner and due-date layer first, then add the control modules "
        "that remove the most manual follow-up, hidden risk, and spreadsheet chaos."
    )
    if sector in {"factory", "manufacturing"}:
        value_prop = (
            "Give the factory one action layer first, then move immediately into receiving, stock, supplier, and quality control "
            "without waiting for a heavy ERP rollout."
        )
    elif sector in {"distribution", "trading"}:
        value_prop = (
            "Start with Action OS and commercial control, then add supplier, stock, and finance visibility so managers stop running the business out of scattered sheets and inboxes."
        )

    risks = [
        "Do not oversell full ERP replacement before the first action and control layers are stable.",
        "Keep browser-side automation as a sidecar, not the source of truth.",
        "Add approvals before enabling deeper autonomous writes.",
    ]
    if "drive" not in data_sources and "sheets" not in data_sources:
        risks.append("This rollout needs at least one structured source such as Google Sheets or a simple intake form.")
    if team_size > 120 or site_count > 3:
        risks.append("Multi-site rollout should land in phases with one site or function first.")

    return {
        "company_name": company_name,
        "sector": sector,
        "team_size": team_size,
        "site_count": site_count,
        "service_packs": packs,
        "primary_pack": packs[0],
        "wedge_product": "Action OS",
        "flagship": "SuperMega OS",
        "recommended_modules": [{"name": name, "reason": MODULE_REASONS.get(name, "")} for name in modules],
        "semi_products": semi_products,
        "free_tools": free_tools,
        "agent_teams": agent_teams,
        "implementation_order": implementation_order,
        "current_stack": CURRENT_STACK,
        "next_stack": next_stack,
        "ux_surfaces": ux_surfaces,
        "value_prop": value_prop,
        "first_30_days": [
            "Connect one live input source and owner map.",
            "Stand up Action OS with a manager board and director flash.",
            f"Deploy {implementation_order[1]} as the first control module." if len(implementation_order) > 1 else "Stabilize Action OS.",
            "Add approvals and write-back only after the first board is trusted.",
        ],
        "notes": [
            f"Current tools detected: {', '.join(current_tools) or 'not specified'}.",
            f"Primary data sources: {', '.join(data_sources) or 'not specified'}.",
            f"Main pain point: {pain_points or 'not specified'}.",
        ],
        "risks": risks,
    }
