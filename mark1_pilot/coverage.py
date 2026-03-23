from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import PilotConfig


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _cadence_for_template(key: str) -> str:
    lowered = key.lower()
    if "daily" in lowered or "ops" in lowered:
        return "daily"
    if "quality" in lowered or "incident" in lowered:
        return "daily"
    if "sales" in lowered or "market" in lowered:
        return "weekly"
    return "weekly"


def _score_for_status(status: str) -> int:
    mapping = {
        "ready": 20,
        "warning": 8,
        "error": 0,
        "not_ready": 0,
    }
    return mapping.get(status, 0)


def _status_from_score(score: int) -> str:
    if score >= 90:
        return "ready"
    if score >= 70:
        return "warning"
    return "error"


def build_data_coverage_report(config: PilotConfig) -> dict[str, Any]:
    output_dir = config.output.inventory_path
    now = datetime.now().astimezone().isoformat()

    gmail_check = _load_json(output_dir / "gmail_check.json")
    search_index = _load_json(output_dir / "search_index_status.json")
    erp_sync = _load_json(output_dir / "erp_sync_status.json")
    dqms_sync = _load_json(output_dir / "dqms_sync_status.json")
    input_center_sync = _load_json(output_dir / "input_center_sync_status.json")
    platform_publish = _load_json(output_dir / "platform_publish.json")

    dimensions: list[dict[str, Any]] = []
    actions: list[str] = []

    gmail_client_status = str(gmail_check.get("client", {}).get("status", "not_ready"))
    gmail_token_status = str(gmail_check.get("token", {}).get("status", "not_ready"))
    dqms_mail_status = str(dqms_sync.get("mail_status", "not_ready"))
    mail_verified_from_dqms = dqms_mail_status == "ready"

    if gmail_client_status == "ready" and (
        gmail_token_status == "ready" or mail_verified_from_dqms
    ):
        gmail_status = "ready"
    elif gmail_client_status == "ready":
        gmail_status = "error"
        actions.append("Gmail token is not ready. Run gmail-auth to restore email signal coverage.")
    else:
        gmail_status = "error"
        actions.append("Gmail OAuth client config is not ready. Fix client JSON and consent/test-user setup.")
    dimensions.append(
        {
            "name": "gmail_feed",
            "status": gmail_status,
            "details": {
                "client_status": gmail_client_status,
                "token_status": gmail_token_status,
                "mail_verified_from_dqms": mail_verified_from_dqms,
            },
        }
    )

    indexed_documents = int(search_index.get("indexed_documents", 0) or 0)
    documents_with_content = int(search_index.get("documents_with_content", 0) or 0)
    if str(search_index.get("status", "")) == "ready" and indexed_documents > 0:
        search_status = "ready"
    elif search_index:
        search_status = "warning"
        actions.append("Search index exists but is weak. Rebuild search-index and verify document extraction dependencies.")
    else:
        search_status = "error"
        actions.append("Search index missing. Run search-index before daily briefing.")
    dimensions.append(
        {
            "name": "search_index",
            "status": search_status,
            "details": {
                "indexed_documents": indexed_documents,
                "documents_with_content": documents_with_content,
                "error_count": int(search_index.get("error_count", 0) or 0),
            },
        }
    )

    erp_local_status = str(erp_sync.get("local", {}).get("status", "not_ready"))
    erp_drive_status = str(erp_sync.get("drive", {}).get("status", "not_ready"))
    erp_summary_status = str(erp_sync.get("status", "not_ready"))
    if erp_summary_status in {"ready", "ready_with_warnings"}:
        erp_status = "ready" if erp_summary_status == "ready" else "warning"
    elif erp_sync:
        erp_status = "warning"
    else:
        erp_status = "error"
    if erp_status != "ready":
        actions.append("ERP sync has gaps. Confirm Drive access/service-account permissions and rerun erp-sync.")
    dimensions.append(
        {
            "name": "erp_tracking",
            "status": erp_status,
            "details": {
                "summary_status": erp_summary_status,
                "local_status": erp_local_status,
                "drive_status": erp_drive_status,
                "watchlist_change_count": int(erp_sync.get("local", {}).get("watchlist_change_count", 0) or 0)
                + int(erp_sync.get("drive", {}).get("watchlist_change_count", 0) or 0),
            },
        }
    )

    dqms_incident_count = int(dqms_sync.get("incident_count", 0) or 0)
    dqms_file_hits = int(dqms_sync.get("file_hits", 0) or 0)
    if dqms_mail_status == "ready" and dqms_incident_count > 0:
        dqms_status = "ready"
    elif dqms_incident_count > 0 or dqms_file_hits > 0:
        dqms_status = "warning"
    elif dqms_sync:
        dqms_status = "warning"
    else:
        dqms_status = "error"
    if dqms_mail_status != "ready":
        actions.append("DQMS is running with email gap. Re-auth Gmail so quality email incidents are fully captured.")
    dimensions.append(
        {
            "name": "dqms_flow",
            "status": dqms_status,
            "details": {
                "mail_status": dqms_mail_status,
                "incident_count": dqms_incident_count,
                "file_hits": dqms_file_hits,
            },
        }
    )

    input_snapshot = input_center_sync.get("snapshot", {})
    total_rows = int(input_snapshot.get("total_rows", 0) or 0)
    total_templates = int(input_snapshot.get("total_templates", 0) or 0)
    open_items = int(input_snapshot.get("open_item_count", 0) or 0)
    populated_templates = [
        item for item in input_snapshot.get("templates", []) if int(item.get("row_count", 0) or 0) > 0
    ]
    if total_rows >= max(1, total_templates):
        input_status = "ready"
    elif input_center_sync:
        input_status = "warning"
        actions.append("Input center is under-used. Ask each function owner to submit at least one row today.")
    else:
        input_status = "error"
        actions.append("Input center snapshot missing. Run input-center-setup and input-center-sync.")
    dimensions.append(
        {
            "name": "team_input_center",
            "status": input_status,
            "details": {
                "total_templates": total_templates,
                "templates_with_rows": len(populated_templates),
                "total_rows": total_rows,
                "open_items": open_items,
            },
        }
    )

    publish_status_raw = str(platform_publish.get("status", "not_ready"))
    if publish_status_raw == "ready":
        publish_status = "ready"
    elif publish_status_raw == "skipped":
        publish_status = "warning"
        actions.append("Platform publish was skipped. Re-enable publish target before calling this setup fully ready.")
    elif platform_publish:
        publish_status = "warning"
        actions.append("Platform publish has issues. Check Drive publish target and service-account write access.")
    else:
        publish_status = "error"
        actions.append("Platform publish output missing. Run platform-publish.")
    dimensions.append(
        {
            "name": "publishing",
            "status": publish_status,
            "details": {
                "status": publish_status_raw,
                "workspace_link": platform_publish.get("target_folder", {}).get("webViewLink", ""),
                "google_doc_link": (platform_publish.get("google_doc") or {}).get("webViewLink", ""),
            },
        }
    )

    if not actions:
        actions.append("Coverage is healthy. Keep daily update discipline and keep weekly QA review cadence.")

    collection_protocol = []
    for template in config.input_center.templates:
        collection_protocol.append(
            {
                "template_key": template.key,
                "template_title": template.title,
                "cadence": _cadence_for_template(template.key),
                "required_fields": template.headers[:5],
            }
        )

    score_total = sum(_score_for_status(item["status"]) for item in dimensions)
    score_max = max(1, len(dimensions) * 20)
    readiness_score = int(round((score_total / score_max) * 100))
    hard_blockers = [
        item["name"]
        for item in dimensions
        if item["name"] in {"gmail_feed"} and item["status"] != "ready"
    ]
    if hard_blockers and readiness_score > 69:
        readiness_score = 69

    return {
        "generated_at": now,
        "status": _status_from_score(readiness_score),
        "readiness_score": readiness_score,
        "hard_blockers": hard_blockers,
        "dimensions": dimensions,
        "actions": actions,
        "collection_protocol": collection_protocol,
    }


def render_data_coverage_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Data Coverage Report",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Status: `{payload.get('status', '')}`",
        f"- Readiness score: `{payload.get('readiness_score', 0)}`",
        "",
        "## Hard Blockers",
        "",
    ]
    blockers = payload.get("hard_blockers", [])
    if blockers:
        for blocker in blockers:
            lines.append(f"- `{blocker}`")
    else:
        lines.append("- None")

    lines.extend([
        "",
        "## Coverage Dimensions",
        "",
    ])
    for item in payload.get("dimensions", []):
        lines.append(f"- `{item.get('name', '')}` | `{item.get('status', '')}`")
        for key, value in item.get("details", {}).items():
            lines.append(f"  {key}: {value}")

    lines.extend(["", "## Actions", ""])
    for action in payload.get("actions", []):
        lines.append(f"- {action}")

    lines.extend(["", "## Collection Protocol", ""])
    for item in payload.get("collection_protocol", []):
        fields = ", ".join(item.get("required_fields", []))
        lines.append(
            f"- `{item.get('template_key', '')}` ({item.get('cadence', '')}) | fields: {fields}"
        )
    lines.append("")
    return "\n".join(lines)


def write_data_coverage_outputs(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "data_coverage_report.json"
    md_path = output_dir / "data_coverage_report.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(render_data_coverage_markdown(payload), encoding="utf-8")
    return {
        "json_file": str(json_path.resolve()),
        "markdown_file": str(md_path.resolve()),
    }


def load_data_coverage_summary(output_dir: Path) -> dict[str, Any]:
    payload = _load_json(output_dir / "data_coverage_report.json")
    if not payload:
        return {
            "status": "not_ready",
            "readiness_score": 0,
            "hard_blockers": [],
            "dimensions": [],
            "top_actions": [],
        }
    return {
        "status": payload.get("status", "not_ready"),
        "readiness_score": int(payload.get("readiness_score", 0) or 0),
        "hard_blockers": payload.get("hard_blockers", []),
        "dimensions": payload.get("dimensions", []),
        "top_actions": payload.get("actions", [])[:4],
    }
