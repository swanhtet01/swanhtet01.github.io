from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import PilotConfig


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _load_latest_domain_report(output_dir: Path) -> dict[str, Any]:
    candidates = [
        _load_json(output_dir / "domain_health_latest.json"),
        _load_json(output_dir / "domain_health_autopilot.json"),
    ]
    reports = [item for item in candidates if isinstance(item, dict) and item]
    if not reports:
        return {}

    def _timestamp(report: dict[str, Any]) -> str:
        return str(report.get("checked_at", ""))

    reports.sort(key=_timestamp, reverse=True)
    return reports[0]


def _readiness_status(scores: list[str]) -> str:
    if any(status == "error" for status in scores):
        return "error"
    if any(status == "warning" for status in scores):
        return "warning"
    return "ready"


def _domain_summary(domain_report: dict[str, Any]) -> tuple[str, dict[str, Any], list[str], list[str]]:
    checks = domain_report.get("checks", [])
    failures = domain_report.get("failures", [])
    next_actions: list[str] = []

    dns_apex_ready = any(
        item.get("target") == "dns:supermega.dev" and item.get("status") == "ready"
        for item in checks
    )
    dns_www_ready = any(
        item.get("target") == "dns:www.supermega.dev" and item.get("status") == "ready"
        for item in checks
    )
    dns_ready = dns_apex_ready and dns_www_ready
    all_timeout = bool(failures) and all("timed out" in str(item.get("detail", "")).lower() for item in failures)
    apex_https_ready = any(
        item.get("target") == "http:https://supermega.dev/" and item.get("status") == "ready"
        for item in checks
    )
    www_failure_only = (
        len(failures) == 1
        and str(failures[0].get("target", "")).strip() == "http:https://www.supermega.dev/"
    )

    if not dns_ready:
        next_actions.append("Recheck apex A records and www CNAME in DNS provider.")

    if domain_report.get("overall_status") == "ready":
        status = "ready"
    elif dns_ready and apex_https_ready and www_failure_only:
        next_actions.append("Apex site is live, but www is not redirecting yet. Wait for propagation and re-run domain check.")
        status = "warning"
    elif dns_ready and all_timeout:
        next_actions.append("Confirm GitHub Pages custom domain and Enforce HTTPS in repository settings.")
        next_actions.append("If timeout persists, deploy showroom to Cloud Run and point domain there as fallback.")
        status = "warning"
    else:
        next_actions.append("Inspect failing health checks and repair DNS/TLS route before launch.")
        status = "error"

    failure_details = [
        f"{item.get('target', '')}: {item.get('detail', '')}"
        for item in failures[:4]
    ]
    return (
        status,
        {
            "dns_ready": dns_ready,
            "failure_count": int(domain_report.get("failure_count", 0) or 0),
            "overall_status": domain_report.get("overall_status", "not_ready"),
        },
        failure_details,
        next_actions,
    )


def _ytf_summary(
    coverage: dict[str, Any],
    autopilot: dict[str, Any],
    input_snapshot: dict[str, Any],
    dqms_incidents: Any,
) -> tuple[str, dict[str, Any], list[str], list[str]]:
    readiness_score = int(coverage.get("readiness_score", 0) or 0)
    required_failures = int(autopilot.get("required_failure_count", 0) or 0)
    optional_failures = int(autopilot.get("optional_failure_count", 0) or 0)
    input_rows = int(input_snapshot.get("total_rows", 0) or 0)
    incident_count = len(dqms_incidents) if isinstance(dqms_incidents, list) else 0

    gmail_dimension = next(
        (item for item in coverage.get("dimensions", []) if item.get("name") == "gmail_feed"),
        {},
    )
    gmail_status = gmail_dimension.get("status", "not_ready")

    gaps: list[str] = []
    next_actions: list[str] = []
    if gmail_status != "ready":
        gaps.append("Gmail token is not ready, so email signal quality is reduced.")
        next_actions.append("Run gmail-auth once to restore full email coverage.")
    if input_rows <= 0:
        gaps.append("Input center has no submitted rows.")
        next_actions.append("Have each team submit one update row today.")
    if required_failures > 0:
        gaps.append(f"Autopilot has {required_failures} required failures.")
        next_actions.append("Fix required autopilot steps before relying on daily outputs.")

    if required_failures == 0 and readiness_score >= 85:
        status = "ready"
    elif required_failures == 0 and readiness_score >= 65:
        status = "warning"
    else:
        status = "error"

    metrics = {
        "readiness_score": readiness_score,
        "required_failures": required_failures,
        "optional_failures": optional_failures,
        "input_rows": input_rows,
        "dqms_incidents": incident_count,
        "gmail_status": gmail_status,
    }
    return status, metrics, gaps, next_actions


def _supermega_summary(repo_root: Path) -> tuple[str, dict[str, Any], list[str], list[str]]:
    manus_file = repo_root / "Super Mega Inc" / "manus_catalog" / "manus_assets_index.json"
    sales_dir = repo_root / "Super Mega Inc" / "sales"
    runbooks_dir = repo_root / "Super Mega Inc" / "runbooks"
    showroom_dir = repo_root / "showroom"

    manus_payload = _load_json(manus_file)
    manus_entries = len(manus_payload.get("entries", [])) if isinstance(manus_payload, dict) else 0
    sales_assets = list(sales_dir.rglob("*")) if sales_dir.exists() else []
    runbook_assets = list(runbooks_dir.glob("*.md")) if runbooks_dir.exists() else []
    showroom_exists = showroom_dir.exists()

    metrics = {
        "manus_entries": manus_entries,
        "sales_asset_count": len([item for item in sales_assets if item.is_file()]),
        "runbook_count": len(runbook_assets),
        "showroom_repo_present": showroom_exists,
    }

    gaps: list[str] = []
    next_actions: list[str] = []
    if manus_entries <= 0:
        gaps.append("Manus asset catalog is missing or empty.")
        next_actions.append("Run manus-catalog to refresh import/reference/quarantine index.")
    if metrics["sales_asset_count"] <= 0:
        gaps.append("Sales collateral folder has no files.")
        next_actions.append("Add package one-pagers and proposal templates under Super Mega Inc/sales.")
    if metrics["runbook_count"] <= 0:
        gaps.append("Runbooks are missing.")
        next_actions.append("Add operating runbooks for delivery and domain operations.")

    readiness_inputs = [
        "ready" if manus_entries > 0 else "warning",
        "ready" if metrics["sales_asset_count"] > 0 else "warning",
        "ready" if metrics["runbook_count"] > 0 else "warning",
        "ready" if showroom_exists else "error",
    ]
    status = _readiness_status(readiness_inputs)
    return status, metrics, gaps, next_actions


def build_execution_review(
    config: PilotConfig,
    repo_root: Path | None = None,
    autopilot_status_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    output_dir = config.output.inventory_path
    repo = repo_root or Path(__file__).resolve().parent.parent

    autopilot = autopilot_status_override or _load_json(output_dir / "autopilot_status.json")
    coverage = _load_json(output_dir / "data_coverage_report.json")
    domain = _load_latest_domain_report(output_dir)
    input_snapshot = _load_json(output_dir / config.input_center.snapshot_file)
    dqms_incidents = _load_json(output_dir / config.dqms.incident_file)

    website_status, website_metrics, website_gaps, website_actions = _domain_summary(domain)
    ytf_status, ytf_metrics, ytf_gaps, ytf_actions = _ytf_summary(
        coverage,
        autopilot,
        input_snapshot,
        dqms_incidents,
    )
    supermega_status, supermega_metrics, supermega_gaps, supermega_actions = _supermega_summary(repo)

    projects = [
        {
            "id": "website",
            "title": "supermega.dev showroom",
            "status": website_status,
            "metrics": website_metrics,
            "gaps": website_gaps,
            "next_actions": website_actions,
        },
        {
            "id": "ytf_pilot",
            "title": "YTF ERP + DQMS personal pilot",
            "status": ytf_status,
            "metrics": ytf_metrics,
            "gaps": ytf_gaps,
            "next_actions": ytf_actions,
        },
        {
            "id": "supermega_company",
            "title": "SuperMega productization and R&D",
            "status": supermega_status,
            "metrics": supermega_metrics,
            "gaps": supermega_gaps,
            "next_actions": supermega_actions,
        },
    ]

    top_priorities: list[str] = []
    for project in projects:
        for action in project.get("next_actions", []):
            if action not in top_priorities:
                top_priorities.append(action)
    if not top_priorities:
        top_priorities.append("Pipeline is healthy. Keep daily cadence and push conversion-focused showroom updates.")

    commands = [
        {
            "label": "Daily autopilot",
            "command": '& "C:\\Users\\swann\\OneDrive - BDA\\.venv\\Scripts\\python.exe" -m mark1_pilot.cli autopilot-run --config .\\config.example.json --skip-drive --run-domain-check',
        },
        {
            "label": "Execution review",
            "command": '& "C:\\Users\\swann\\OneDrive - BDA\\.venv\\Scripts\\python.exe" -m mark1_pilot.cli execution-review --config .\\config.example.json',
        },
        {
            "label": "Gmail re-auth",
            "command": '& "C:\\Users\\swann\\OneDrive - BDA\\.venv\\Scripts\\python.exe" -m mark1_pilot.cli gmail-auth --config .\\config.example.json --host 127.0.0.1 --port 8765',
        },
    ]

    overall = _readiness_status([item.get("status", "warning") for item in projects])
    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "status": overall,
        "projects": projects,
        "top_priorities": top_priorities[:10],
        "quick_commands": commands,
    }


def render_execution_review_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# SuperMega Execution Review",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Overall status: `{payload.get('status', 'unknown')}`",
        "",
    ]

    for project in payload.get("projects", []):
        lines.extend(
            [
                f"## {project.get('title', '')}",
                "",
                f"- Status: `{project.get('status', 'unknown')}`",
            ]
        )
        for key, value in project.get("metrics", {}).items():
            lines.append(f"- {key}: {value}")

        gaps = project.get("gaps", [])
        lines.append("- Gaps:")
        if gaps:
            for item in gaps:
                lines.append(f"  - {item}")
        else:
            lines.append("  - None currently.")

        actions = project.get("next_actions", [])
        lines.append("- Next actions:")
        if actions:
            for item in actions:
                lines.append(f"  - {item}")
        else:
            lines.append("  - Keep current execution cadence.")
        lines.append("")

    lines.extend(["## Top Priorities", ""])
    for item in payload.get("top_priorities", []):
        lines.append(f"- {item}")

    lines.extend(["", "## Quick Commands", ""])
    for item in payload.get("quick_commands", []):
        lines.append(f"- {item.get('label', '')}: `{item.get('command', '')}`")
    lines.append("")

    return "\n".join(lines)


def write_execution_review_outputs(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    review_json = output_dir / "execution_review.json"
    review_md = output_dir / "execution_review.md"
    today_json = output_dir / "TODAY.json"
    today_md = output_dir / "TODAY.md"

    markdown = render_execution_review_markdown(payload)
    review_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    review_md.write_text(markdown, encoding="utf-8")
    today_json.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    today_md.write_text(markdown, encoding="utf-8")

    return {
        "json_file": str(review_json.resolve()),
        "markdown_file": str(review_md.resolve()),
        "today_json_file": str(today_json.resolve()),
        "today_markdown_file": str(today_md.resolve()),
    }
