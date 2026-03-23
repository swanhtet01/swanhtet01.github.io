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

    coverage_score = int(coverage.get("readiness_score", 0) or 0)
    required_failures = int(autopilot.get("required_failure_count", 0) or 0)
    dqms_ready = str(dqms.get("status", "")).startswith("ready")
    erp_ready = str(erp.get("status", "")) == "ready"
    input_ready = str(input_center.get("status", "")) == "ready"
    gmail_ready = any(
        str(item.get("name", "")) == "gmail_feed" and str(item.get("status", "")) == "ready"
        for item in coverage.get("dimensions", [])
    )

    flagship_status = "design_ready"
    if coverage_score >= 85 and erp_ready and input_ready:
        flagship_status = "pilot_ready"
    if coverage_score >= 90 and erp_ready and input_ready and dqms_ready and gmail_ready and required_failures == 0:
        flagship_status = "live_system"

    products = [
        {
            "id": "lead-scraper-agent",
            "name": "Lead Scraper Agent",
            "family": "showcase",
            "status": "live_demo",
            "promise": "Turn messy directories into scored leads fast.",
            "best_for": "sales, business development, agency outreach",
            "demo_route": "/examples#lead-finder",
            "data_sources": ["pasted text", "public web pages"],
            "next_build": "Add Google Maps and export connectors behind authenticated mode.",
        },
        {
            "id": "news-brief-agent",
            "name": "News Brief Agent",
            "family": "showcase",
            "status": "live_demo",
            "promise": "Convert daily source links into one management brief.",
            "best_for": "owners, directors, market watch",
            "demo_route": "/examples#news-brief",
            "data_sources": ["news URLs", "manual headlines"],
            "next_build": "Add saved watchlists and daily scheduled brief delivery.",
        },
        {
            "id": "action-board-agent",
            "name": "Action Board Agent",
            "family": "showcase",
            "status": "live_demo",
            "promise": "Turn raw updates into owner-ready actions.",
            "best_for": "operations, plant management, internal reviews",
            "demo_route": "/examples#action-planner",
            "data_sources": ["meeting notes", "ops updates", "manual text"],
            "next_build": "Add direct push into shared action registers.",
        },
        {
            "id": "supplier-risk-agent",
            "name": "Supplier Risk Agent",
            "family": "client_module",
            "status": "pilot_ready" if erp_ready else "design_ready",
            "promise": "Track ETA, payment, customs, and supplier follow-up risk.",
            "best_for": "procurement and supply chain teams",
            "demo_route": "",
            "data_sources": ["Gmail", "Drive files", "input sheets"],
            "next_build": "Add supplier-specific scorecards and escalation SLA tracking.",
        },
        {
            "id": "quality-capa-agent",
            "name": "Quality CAPA Agent",
            "family": "client_module",
            "status": "pilot_ready" if dqms_ready else "design_ready",
            "promise": "Convert quality issues into tracked CAPA chains.",
            "best_for": "quality teams and plant managers",
            "demo_route": "",
            "data_sources": ["quality emails", "incident sheets", "evidence files"],
            "next_build": "Add closure verification and supplier trend dashboards.",
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
            "next_build": "Move from file-first outputs to record-first action board and role dashboards.",
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
    if flagship_status != "live_system":
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
            "required_failures": required_failures,
            "flagship_status": flagship_status,
            "website_status": website_status or "unknown",
            "product_count": len(products),
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
        f"- Flagship status: `{_status_label(str(payload.get('summary', {}).get('flagship_status', '')) )}`",
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
