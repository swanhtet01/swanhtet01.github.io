from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import PilotConfig
from .coverage import load_data_coverage_summary
from .dqms import load_dqms_summary
from .erp import load_erp_summary


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _status_rank(status: str) -> int:
    order = {
        "blocked": 0,
        "design_ready": 1,
        "pilot_ready": 2,
        "live_demo": 3,
        "live_system": 4,
    }
    return order.get(status, 0)


def _status_label(status: str) -> str:
    labels = {
        "blocked": "blocked",
        "design_ready": "design ready",
        "pilot_ready": "pilot ready",
        "live_demo": "live demo",
        "live_system": "live system",
    }
    return labels.get(status, status)


def build_product_lab(config: PilotConfig, repo_root: Path | None = None) -> dict[str, Any]:
    root = repo_root or Path(__file__).resolve().parent.parent
    output_dir = config.output.inventory_path

    coverage = load_data_coverage_summary(output_dir)
    dqms = load_dqms_summary(output_dir, config.dqms)
    erp = load_erp_summary(output_dir, config.erp)
    autopilot = _load_json(output_dir / "autopilot_status.json")
    input_center = _load_json(output_dir / config.input_center.snapshot_file)
    execution_review = _load_json(output_dir / "execution_review.json")
    action_board = _load_json(output_dir / "action_board.json")

    coverage_score = int(coverage.get("readiness_score", 0) or 0)
    hard_blockers = list(coverage.get("hard_blockers", []))
    required_failures = int(autopilot.get("required_failure_count", 0) or 0)
    dqms_ready = str(dqms.get("status", "")).startswith("ready")
    erp_ready = str(erp.get("status", "")) == "ready"
    input_ready = str(input_center.get("status", "")) == "ready"
    gmail_ready = any(
        str(item.get("name", "")) == "gmail_feed" and str(item.get("status", "")) == "ready"
        for item in coverage.get("dimensions", [])
    )

    flagship_status = "blocked" if hard_blockers else "design_ready"
    if not hard_blockers and coverage_score >= 85 and erp_ready and input_ready:
        flagship_status = "pilot_ready"
    if (
        not hard_blockers
        and coverage_score >= 90
        and erp_ready
        and input_ready
        and dqms_ready
        and gmail_ready
        and required_failures == 0
    ):
        flagship_status = "live_system"

    products = [
        {
            "id": "lead-finder",
            "name": "Lead Finder",
            "family": "free_tool",
            "status": "live_demo",
            "promise": "Turn messy lead sources into scored outreach-ready prospects.",
            "best_for": "sales, business development, outbound growth",
            "demo_route": "/examples#lead-finder",
            "data_sources": ["pasted lead lists", "directories", "public web pages"],
            "next_build": "Add richer entity cleanup, export formats, and authenticated source connectors.",
        },
        {
            "id": "news-brief",
            "name": "News Brief",
            "family": "free_tool",
            "status": "live_demo",
            "promise": "Turn raw headlines and copied notes into one short operating brief.",
            "best_for": "directors, founders, and market-watch teams",
            "demo_route": "/examples#market-brief",
            "data_sources": ["pasted headlines", "external watch feeds", "manual notes"],
            "next_build": "Add source fetching, saved watchlists, and recurring brief generation.",
        },
        {
            "id": "action-board",
            "name": "Action Board",
            "family": "free_tool",
            "status": "live_demo",
            "promise": "Convert raw updates into owners, priorities, and due dates.",
            "best_for": "operations, projects, and plant management",
            "demo_route": "/examples#action-board",
            "data_sources": ["ops updates", "team notes", "manager snippets"],
            "next_build": "Add write-back into manager boards and role-specific action lanes.",
        },
        {
            "id": "supplier-watch",
            "name": "Supplier Watch",
            "family": "control_module",
            "status": "pilot_ready" if gmail_ready else "design_ready",
            "promise": "Read supplier threads and return risk, owner, due date, and next actions.",
            "best_for": "procurement and supply chain teams",
            "demo_route": "",
            "data_sources": ["Gmail", "supplier threads", "ETA sheets", "customs notes"],
            "next_build": "Connect directly to live supplier inboxes and escalation write-backs.",
        },
        {
            "id": "quality-closeout",
            "name": "Quality Closeout",
            "family": "control_module",
            "status": "pilot_ready" if dqms_ready else "design_ready",
            "promise": "Turn a quality issue into a tracked containment and CAPA chain.",
            "best_for": "quality teams and plant managers",
            "demo_route": "",
            "data_sources": ["quality emails", "incident sheets", "evidence files"],
            "next_build": "Add closure verification and supplier quality trend views.",
        },
        {
            "id": "cash-watch",
            "name": "Cash Watch",
            "family": "control_module",
            "status": "pilot_ready" if erp_ready else "design_ready",
            "promise": "Turn invoices, cash books, and payment signals into a control queue.",
            "best_for": "finance and commercial control",
            "demo_route": "",
            "data_sources": ["invoice files", "cash books", "payment emails"],
            "next_build": "Add aging buckets, collection drafts, and owner write-backs.",
        },
        {
            "id": "supermega-os",
            "name": "SuperMega OS",
            "family": "flagship",
            "status": flagship_status,
            "promise": "AI-native operating system replacing manual ERP layers for owner-led teams.",
            "best_for": "SMBs that run on Drive, Gmail, and Sheets today",
            "demo_route": "",
            "data_sources": ["Drive", "Gmail", "input center", "external watch"],
            "next_build": "Expand the action board into role dashboards and controlled write-backs.",
        },
    ]

    status_counts: dict[str, int] = {}
    for product in products:
        status_counts[product["status"]] = status_counts.get(product["status"], 0) + 1

    learning_loops = [
        {
            "name": "showcase_to_lead",
            "description": "Free demos create intent signals and reveal which product gets real user pull.",
            "artifacts": ["website leads", "demo usage feedback", "contact requests"],
        },
        {
            "name": "pilot_to_template",
            "description": "Client pilots become reusable templates, SOPs, and modules.",
            "artifacts": ["input center templates", "delivery SOP", "product catalog"],
        },
        {
            "name": "data_to_decision",
            "description": "Drive, Gmail, and sheets are normalized into action-oriented management outputs.",
            "artifacts": ["ERP sync", "DQMS registers", "pilot solution", "platform digest"],
        },
        {
            "name": "review_to_improvement",
            "description": "Autopilot and execution review create the next engineering backlog every day.",
            "artifacts": ["autopilot status", "execution review", "product lab"],
        },
    ]

    architecture = {
        "flagship_product": "SuperMega OS",
        "how_it_works": [
            "Team submits updates through sheets, email, and existing files.",
            "Ingestion normalizes updates into structured operating signals.",
            "Agents triage, summarize, and assign owner plus due date.",
            "CEO, director, and manager views show actions instead of raw data.",
            "Every pilot creates reusable templates for the next client.",
        ],
        "design_rules": [
            "simple enough for managers to use daily",
            "evidence-linked outputs",
            "human approval on risky writes",
            "start from current tools before full migration",
        ],
    }

    next_moves: list[str] = []
    if not gmail_ready:
        next_moves.append("Restore Gmail auth so supplier, internal, and quality agents move from partial to full signal coverage.")
    if action_board.get("status") == "ready":
        next_moves.append("Expand the action board into role dashboards and controlled write-backs for SuperMega OS.")
    elif flagship_status != "live_system":
        next_moves.append("Build the first record-first action board behind SuperMega OS so the flagship product is more than a reporting layer.")
    if erp_ready and dqms_ready:
        next_moves.append("Turn supplier risk and quality CAPA into first paid modules under the flagship OS.")
    next_moves.append("Track which free demo produces the most serious requests and prioritize that agent for deeper productization.")

    projects = execution_review.get("projects", []) if isinstance(execution_review, dict) else []
    website_status = next((str(item.get("status", "")) for item in projects if item.get("id") == "website"), "")

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "status": "ready",
        "summary": {
            "coverage_score": coverage_score,
            "hard_blocker_count": len(hard_blockers),
            "required_failures": required_failures,
            "flagship_status": flagship_status,
            "website_status": website_status or "unknown",
            "product_count": len(products),
            "free_tool_count": len([item for item in products if item.get("family") == "free_tool"]),
            "control_module_count": len([item for item in products if item.get("family") in {"control_module", "client_module"}]),
            "live_demo_count": status_counts.get("live_demo", 0),
            "pilot_ready_count": status_counts.get("pilot_ready", 0),
            "live_system_count": status_counts.get("live_system", 0),
        },
        "products": sorted(products, key=lambda item: (-_status_rank(str(item["status"])), item["name"])),
        "learning_loops": learning_loops,
        "architecture": architecture,
        "next_moves": next_moves,
    }


def render_product_lab_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# SuperMega Product Lab",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Coverage score: {payload.get('summary', {}).get('coverage_score', 0)}",
        f"- Hard blockers: `{payload.get('summary', {}).get('hard_blocker_count', 0)}`",
        f"- Flagship status: `{_status_label(str(payload.get('summary', {}).get('flagship_status', '')) )}`",
        f"- Free tools: `{payload.get('summary', {}).get('free_tool_count', 0)}`",
        f"- Control modules: `{payload.get('summary', {}).get('control_module_count', 0)}`",
        f"- Live demos: `{payload.get('summary', {}).get('live_demo_count', 0)}`",
        f"- Pilot-ready modules: `{payload.get('summary', {}).get('pilot_ready_count', 0)}`",
        "",
        "## Flagship",
        "",
        f"- Product: `{payload.get('architecture', {}).get('flagship_product', '')}`",
        "",
        "### How It Works",
        "",
    ]

    for item in payload.get("architecture", {}).get("how_it_works", []):
        lines.append(f"- {item}")

    lines.extend(["", "## Product Stack", ""])
    for product in payload.get("products", []):
        lines.extend(
            [
                f"### {product.get('name', '')}",
                "",
                f"- Status: `{_status_label(str(product.get('status', '')) )}`",
                f"- Promise: {product.get('promise', '')}",
                f"- Best for: {product.get('best_for', '')}",
                f"- Data sources: {', '.join(product.get('data_sources', []))}",
                f"- Next build: {product.get('next_build', '')}",
                "",
            ]
        )

    lines.extend(["## Learning Loops", ""])
    for loop in payload.get("learning_loops", []):
        lines.append(f"- `{loop.get('name', '')}` | {loop.get('description', '')}")
    lines.extend(["", "## Next Moves", ""])
    for item in payload.get("next_moves", []):
        lines.append(f"- {item}")
    lines.append("")
    return "\n".join(lines)


def write_product_lab_outputs(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    json_file = output_dir / "product_lab.json"
    md_file = output_dir / "product_lab.md"
    json_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_file.write_text(render_product_lab_markdown(payload), encoding="utf-8")
    return {
        "json_file": str(json_file.resolve()),
        "markdown_file": str(md_file.resolve()),
    }
