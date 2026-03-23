from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Any

from .config import DQMSConfig, ERPConfig, InputCenterConfig


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _priority_rank(value: str) -> int:
    order = {"high": 0, "medium": 1, "low": 2}
    return order.get(str(value).strip().lower(), 3)


def _safe_slug(value: str) -> str:
    text = "".join(char.lower() if char.isalnum() else "-" for char in str(value))
    return "-".join(part for part in text.split("-") if part)


def _parse_date(value: str) -> date | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    for candidate in (raw, raw[:10]):
        try:
            return datetime.fromisoformat(candidate).date()
        except ValueError:
            continue
    return None


def _due_label(value: str) -> str:
    parsed = _parse_date(value)
    if not parsed:
        return "This week"
    return parsed.isoformat()


def _lane_for_item(priority: str, due_value: str, source: str) -> str:
    parsed_due = _parse_date(due_value)
    today = datetime.now().astimezone().date()
    lowered_priority = str(priority).strip().lower()
    lowered_source = str(source).strip().lower()

    if lowered_source == "system":
        return "system"
    if lowered_priority == "high":
        return "do_now"
    if parsed_due:
        if parsed_due <= today:
            return "do_now"
        if (parsed_due - today).days <= 7:
            return "this_week"
    return "watch"


def _sorted_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            _priority_rank(str(item.get("priority", ""))),
            0 if _parse_date(str(item.get("due", ""))) else 1,
            str(item.get("due", "")),
            str(item.get("title", "")),
        ),
    )


def _item(
    *,
    item_id: str,
    title: str,
    action: str,
    owner: str,
    priority: str,
    due: str,
    source: str,
    status: str,
    evidence_link: str = "",
    evidence_path: str = "",
) -> dict[str, Any]:
    lane = _lane_for_item(priority, due, source)
    return {
        "id": item_id,
        "lane": lane,
        "title": title,
        "action": action,
        "owner": owner or "Unassigned",
        "priority": priority or "medium",
        "due": _due_label(due),
        "source": source,
        "status": status or "open",
        "evidence_link": evidence_link,
        "evidence_path": evidence_path,
    }


def _build_input_items(input_snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for template in input_snapshot.get("templates", []):
        template_key = str(template.get("key", "")).strip()
        template_title = str(template.get("title", "")).strip()
        for recent in template.get("recent_rows", [])[:3]:
            row = recent.get("row", {})
            summary = str(recent.get("summary", "")).strip() or template_title
            owner = str(recent.get("owner", "")).strip()
            priority = str(recent.get("priority", "medium")).strip().lower()
            status = str(recent.get("status", "")).strip() or "open"
            evidence_link = str(template.get("web_view_link", "")).strip()

            action = "Review and assign next action."
            due = ""
            if template_key == "daily_ops_update":
                action = str(row.get("remarks", "")).strip() or f"Resolve: {row.get('top_issue', 'daily ops issue')}"
                due = str(row.get("action_due_date", "")).strip()
                owner = owner or str(row.get("action_owner", "")).strip()
            elif template_key == "quality_incident_log":
                action = str(row.get("notes", "")).strip() or f"Progress incident {row.get('incident_id', '')}".strip()
                due = str(row.get("target_close_date", "")).strip()
            elif template_key == "procurement_supplier_tracker":
                action = str(row.get("next_action", "")).strip() or "Confirm ETA and customs documents."
                due = str(row.get("eta", "")).strip()
            elif template_key == "sales_market_signal":
                action = str(row.get("next_action", "")).strip() or "Review sales signal and update forecast."
                due = ""

            items.append(
                _item(
                    item_id=f"input-{template_key}-{row.get('__row_number', recent.get('updated_at', 'row'))}",
                    title=summary,
                    action=action,
                    owner=owner,
                    priority=priority,
                    due=due,
                    source=f"input:{template_key}",
                    status=status,
                    evidence_link=evidence_link,
                )
            )
    return items


def _build_dqms_items(incidents: list[dict[str, Any]], capa_actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    capa_by_incident = {str(item.get("incident_id", "")): item for item in capa_actions}
    items: list[dict[str, Any]] = []
    for incident in incidents[:8]:
        incident_id = str(incident.get("incident_id", "")).strip()
        capa = capa_by_incident.get(incident_id, {})
        items.append(
            _item(
                item_id=f"dqms-{incident_id}",
                title=str(incident.get("title", "")).strip() or incident_id,
                action=str(capa.get("action_title", "")).strip() or "Review incident and create CAPA.",
                owner=str(incident.get("owner", "")).strip(),
                priority=str(incident.get("severity", "medium")).strip().lower(),
                due=str(incident.get("target_close_date", "")).strip(),
                source="dqms",
                status=str(incident.get("status", "open")).strip(),
                evidence_path=str(incident.get("source_ref", {}).get("path", "")).strip(),
            )
        )
    return items


def _build_erp_items(erp_changes: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for change in erp_changes.get("watchlist_changes", [])[:5]:
        module = str(change.get("module", "general")).strip() or "general"
        items.append(
            _item(
                item_id=f"erp-{_safe_slug(change.get('path', 'change'))}",
                title=f"{module.title()} watchlist file changed",
                action=f"Review {change.get('path', '')} and confirm business impact.",
                owner="Manager",
                priority="high",
                due="",
                source="erp",
                status="open",
                evidence_path=str(change.get("path", "")).strip(),
            )
        )

    if not items and erp_changes.get("recommended_actions"):
        items.append(
            _item(
                item_id="erp-no-change",
                title="ERP watchlist",
                action=str(erp_changes.get("recommended_actions", ["No ERP actions."])[0]),
                owner="Manager",
                priority="low",
                due="",
                source="erp",
                status="watch",
            )
        )
    return items


def _build_system_items(coverage: dict[str, Any], review: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for action in coverage.get("actions", [])[:2]:
        items.append(
            _item(
                item_id=f"system-coverage-{_safe_slug(action)}",
                title="Coverage gap",
                action=str(action),
                owner="System Admin",
                priority="high" if "gmail" in str(action).lower() else "medium",
                due="",
                source="system",
                status="open",
            )
        )

    for action in review.get("top_priorities", [])[:2]:
        lowered = str(action).lower()
        if "gmail" not in lowered and "domain" not in lowered and "website" not in lowered:
            continue
        items.append(
            _item(
                item_id=f"system-review-{_safe_slug(action)}",
                title="System follow-up",
                action=str(action),
                owner="System Admin",
                priority="high" if "gmail" in lowered else "medium",
                due="",
                source="system",
                status="open",
            )
        )
    return items


def build_action_board(
    output_dir: Path,
    *,
    input_config: InputCenterConfig,
    dqms_config: DQMSConfig,
    erp_config: ERPConfig,
) -> dict[str, Any]:
    output_dir = output_dir.expanduser().resolve()
    input_snapshot = _load_json(output_dir / input_config.snapshot_file)
    incidents = _load_json(output_dir / dqms_config.incident_file)
    capa_actions = _load_json(output_dir / dqms_config.capa_file)
    erp_changes = _load_json(output_dir / erp_config.change_file)
    coverage = _load_json(output_dir / "data_coverage_report.json")
    review = _load_json(output_dir / "execution_review.json")

    raw_items = (
        _build_input_items(input_snapshot)
        + _build_dqms_items(incidents if isinstance(incidents, list) else [], capa_actions if isinstance(capa_actions, list) else [])
        + _build_erp_items(erp_changes if isinstance(erp_changes, dict) else {})
        + _build_system_items(coverage if isinstance(coverage, dict) else {}, review if isinstance(review, dict) else {})
    )

    deduped: dict[str, dict[str, Any]] = {}
    for item in raw_items:
        deduped[item["id"]] = item

    items = _sorted_items(list(deduped.values()))
    lanes = {
        "do_now": [item for item in items if item.get("lane") == "do_now"],
        "this_week": [item for item in items if item.get("lane") == "this_week"],
        "watch": [item for item in items if item.get("lane") == "watch"],
        "system": [item for item in items if item.get("lane") == "system"],
    }

    return {
        "generated_at": datetime.now().astimezone().isoformat(),
        "status": "ready",
        "summary": {
            "total_items": len(items),
            "do_now_count": len(lanes["do_now"]),
            "this_week_count": len(lanes["this_week"]),
            "watch_count": len(lanes["watch"]),
            "system_count": len(lanes["system"]),
        },
        "lanes": lanes,
        "items": items,
    }


def render_action_board_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Action Board",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Total items: {payload.get('summary', {}).get('total_items', 0)}",
        f"- Do now: {payload.get('summary', {}).get('do_now_count', 0)}",
        f"- This week: {payload.get('summary', {}).get('this_week_count', 0)}",
        f"- Watch: {payload.get('summary', {}).get('watch_count', 0)}",
        f"- System: {payload.get('summary', {}).get('system_count', 0)}",
        "",
    ]

    lane_titles = {
        "do_now": "Do Now",
        "this_week": "This Week",
        "watch": "Watch",
        "system": "System",
    }
    for lane_key in ("do_now", "this_week", "watch", "system"):
        lines.extend([f"## {lane_titles[lane_key]}", ""])
        lane_items = payload.get("lanes", {}).get(lane_key, [])
        if not lane_items:
            lines.append("- No items in this lane.")
            lines.append("")
            continue
        for item in lane_items:
            evidence = item.get("evidence_link", "") or item.get("evidence_path", "")
            evidence_text = f" | evidence `{evidence}`" if evidence else ""
            lines.append(
                f"- [`{item.get('priority', '')}`] {item.get('title', '')} | owner `{item.get('owner', '')}` | due `{item.get('due', '')}` | {item.get('action', '')}{evidence_text}"
            )
        lines.append("")

    return "\n".join(lines)


def write_action_board_outputs(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    json_file = output_dir / "action_board.json"
    md_file = output_dir / "action_board.md"
    json_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_file.write_text(render_action_board_markdown(payload), encoding="utf-8")
    return {
        "json_file": str(json_file.resolve()),
        "markdown_file": str(md_file.resolve()),
    }
