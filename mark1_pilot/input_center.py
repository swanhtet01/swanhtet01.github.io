from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import InputCenterConfig, InputCenterTemplateConfig


DEFAULT_INPUT_TEMPLATE_SPECS: list[dict[str, Any]] = [
    {
        "key": "daily_ops_update",
        "title": "YTF Daily Ops Update",
        "description": "Daily production and operations pulse from each team.",
        "headers": [
            "updated_at",
            "plant",
            "team",
            "shift",
            "production_status",
            "top_issue",
            "action_owner",
            "action_due_date",
            "remarks",
        ],
        "sample_row": [
            "2026-03-10",
            "Plant A",
            "Production",
            "Day",
            "On track",
            "Power fluctuation",
            "Ko Aung",
            "2026-03-11",
            "Escalated to maintenance",
        ],
    },
    {
        "key": "quality_incident_log",
        "title": "YTF Quality Incident Log",
        "description": "Incident and CAPA intake for DQMS follow-up.",
        "headers": [
            "reported_at",
            "incident_id",
            "supplier",
            "product_or_batch",
            "issue_type",
            "severity",
            "status",
            "owner",
            "target_close_date",
            "evidence_link",
            "notes",
        ],
        "sample_row": [
            "2026-03-10",
            "INC-MANUAL-001",
            "KIIC",
            "Batch-101",
            "Bead wire defect",
            "high",
            "open",
            "Quality Team",
            "2026-03-14",
            "",
            "Containment started",
        ],
    },
    {
        "key": "procurement_supplier_tracker",
        "title": "YTF Procurement Supplier Tracker",
        "description": "Track supplier commitments, ETAs, and procurement risks.",
        "headers": [
            "updated_at",
            "supplier",
            "po_or_pi",
            "material",
            "quantity",
            "eta",
            "status",
            "risk_level",
            "owner",
            "next_action",
        ],
        "sample_row": [
            "2026-03-10",
            "JUNKY",
            "PI-12345",
            "Raw material",
            "2 containers",
            "2026-03-22",
            "in_transit",
            "medium",
            "Procurement Team",
            "Confirm customs docs",
        ],
    },
    {
        "key": "sales_market_signal",
        "title": "YTF Sales And Market Signal",
        "description": "Sales team updates and market movement signals.",
        "headers": [
            "updated_at",
            "customer_or_market",
            "signal_type",
            "product",
            "volume_or_value",
            "status",
            "owner",
            "next_action",
            "link_or_source",
        ],
        "sample_row": [
            "2026-03-10",
            "Yangon distributors",
            "demand_shift",
            "PCR",
            "+8%",
            "review",
            "Sales Team",
            "Recheck weekly forecast",
            "",
        ],
    },
    {
        "key": "manager_action_board",
        "title": "YTF Manager Action Board",
        "description": "One manager-facing queue of actions, owners, due dates, and closure status seeded from the Action OS.",
        "headers": [
            "captured_at",
            "action_id",
            "lane",
            "title",
            "action",
            "owner",
            "priority",
            "due",
            "status",
            "source",
            "evidence_link",
            "notes",
        ],
        "sample_row": [
            "2026-03-10T08:30:00+06:30",
            "input-daily_ops_update-2",
            "do_now",
            "Power fluctuation | Plant A | Ko Aung",
            "Escalate maintenance and confirm recovery plan.",
            "Ko Aung",
            "high",
            "2026-03-11",
            "open",
            "input:daily_ops_update",
            "",
            "Seeded from Action OS. Update status, owner, due date, and closure notes here.",
        ],
    },
]


def _normalize_header(value: str) -> str:
    return " ".join(value.strip().split())


def _normalize_headers(headers: list[str]) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []
    for raw in headers:
        value = _normalize_header(raw)
        if not value:
            continue
        lower = value.lower()
        if lower in seen:
            continue
        seen.add(lower)
        normalized.append(value)
    return normalized


def _coerce_datetime(value: str) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None

    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except ValueError:
        pass

    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


def _first_present(row: dict[str, Any], keys: tuple[str, ...]) -> str:
    for key in keys:
        value = str(row.get(key, "")).strip()
        if value:
            return value
    return ""


def resolve_input_templates(config: InputCenterConfig) -> list[InputCenterTemplateConfig]:
    templates = config.templates
    if not templates:
        templates = [InputCenterTemplateConfig(**spec) for spec in DEFAULT_INPUT_TEMPLATE_SPECS]

    resolved: list[InputCenterTemplateConfig] = []
    seen_keys: set[str] = set()
    for template in templates:
        key = "".join(char for char in template.key.strip().lower() if char.isalnum() or char in {"_", "-"})
        if not key:
            key = f"template_{len(resolved) + 1}"
        if key in seen_keys:
            key = f"{key}_{len(resolved) + 1}"
        seen_keys.add(key)

        headers = _normalize_headers(template.headers)
        if not headers:
            headers = ["updated_at", "status", "owner", "notes"]

        sample_row = list(template.sample_row[: len(headers)])
        while len(sample_row) < len(headers):
            sample_row.append("")

        resolved.append(
            InputCenterTemplateConfig(
                key=key,
                title=template.title.strip() or key,
                description=template.description.strip(),
                headers=headers,
                sample_row=sample_row,
            )
        )
    return resolved


def template_payload(template: InputCenterTemplateConfig) -> dict[str, Any]:
    return {
        "key": template.key,
        "title": template.title,
        "description": template.description,
        "headers": list(template.headers),
        "sample_row": list(template.sample_row),
    }


def _row_priority(row: dict[str, Any]) -> str:
    text = " ".join(str(value) for value in row.values()).lower()
    if any(token in text for token in ("urgent", "critical", "high", "overdue", "blocker")):
        return "high"
    if any(token in text for token in ("medium", "review", "follow up", "pending")):
        return "medium"
    return "low"


def _row_is_open(row: dict[str, Any]) -> bool:
    status = _first_present(
        {key.lower(): value for key, value in row.items()},
        ("status", "action_status", "progress", "state"),
    ).lower()
    if not status:
        return True
    return status not in {"closed", "done", "completed", "complete", "resolved", "cancelled", "canceled"}


def _row_summary(row: dict[str, Any]) -> str:
    lower_row = {key.lower(): value for key, value in row.items()}
    main_parts = [
        _first_present(lower_row, ("title", "top_issue", "issue_type", "signal_type", "next_action", "action", "notes")),
        _first_present(lower_row, ("supplier", "plant", "team", "customer_or_market", "product_or_batch")),
        _first_present(lower_row, ("owner", "action_owner")),
    ]
    parts = [part for part in main_parts if part]
    return " | ".join(parts[:3])


def _row_updated_at(row: dict[str, Any]) -> tuple[str, datetime | None]:
    lower_row = {key.lower(): value for key, value in row.items()}
    raw = _first_present(
        lower_row,
        (
            "updated_at",
            "captured_at",
            "reported_at",
            "target_close_date",
            "action_due_date",
            "date",
            "timestamp",
            "eta",
        ),
    )
    return raw, _coerce_datetime(raw)


def build_input_center_snapshot(sync_payload: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now(UTC).isoformat()
    template_summaries: list[dict[str, Any]] = []
    top_updates: list[dict[str, Any]] = []
    total_rows = 0
    open_items = 0

    for template in sync_payload.get("templates", []):
        rows = template.get("rows", [])
        total_rows += len(rows)
        template_open = sum(1 for row in rows if _row_is_open(row))
        open_items += template_open

        normalized_rows: list[tuple[datetime, dict[str, Any]]] = []
        for row in rows:
            raw_ts, parsed_ts = _row_updated_at(row)
            normalized_rows.append(
                (
                    parsed_ts or datetime.min.replace(tzinfo=UTC),
                    {
                        "updated_at": raw_ts,
                        "priority": _row_priority(row),
                        "status": _first_present({key.lower(): value for key, value in row.items()}, ("status", "progress", "state")),
                        "owner": _first_present({key.lower(): value for key, value in row.items()}, ("owner", "action_owner")),
                        "summary": _row_summary(row),
                        "row": row,
                    },
                )
            )

        normalized_rows.sort(key=lambda item: item[0], reverse=True)
        recent_rows = [item[1] for item in normalized_rows[:5]]

        template_summaries.append(
            {
                "key": template.get("key", ""),
                "title": template.get("title", ""),
                "status": template.get("status", "unknown"),
                "spreadsheet_id": template.get("spreadsheet_id", ""),
                "web_view_link": template.get("web_view_link", ""),
                "sheet_name": template.get("sheet_name", "Input"),
                "headers": template.get("headers", []),
                "row_count": len(rows),
                "open_item_count": template_open,
                "recent_rows": recent_rows,
            }
        )

        for row in recent_rows[:2]:
            top_updates.append(
                {
                    "template_key": template.get("key", ""),
                    "template_title": template.get("title", ""),
                    "updated_at": row.get("updated_at", ""),
                    "priority": row.get("priority", "low"),
                    "status": row.get("status", ""),
                    "owner": row.get("owner", ""),
                    "summary": row.get("summary", ""),
                    "web_view_link": template.get("web_view_link", ""),
                }
            )

    top_updates.sort(
        key=lambda item: (
            0 if item.get("priority") == "high" else 1 if item.get("priority") == "medium" else 2,
            item.get("updated_at", ""),
        )
    )

    recommended_actions: list[str] = []
    if total_rows == 0:
        recommended_actions.append("No team input rows found yet. Ask each function owner to submit one baseline row today.")
    if open_items > 0:
        recommended_actions.append(f"{open_items} open tracker items need owner/date follow-up across team sheets.")
    if not recommended_actions:
        recommended_actions.append("Input center is active. Keep daily updates flowing and close stale open items.")

    template_errors = [item for item in template_summaries if item.get("status") != "ready"]
    status = "ready" if not template_errors else "ready_with_errors"

    return {
        "generated_at": generated_at,
        "status": status,
        "total_templates": len(template_summaries),
        "total_rows": total_rows,
        "open_item_count": open_items,
        "templates": template_summaries,
        "top_updates": top_updates[:10],
        "recommended_actions": recommended_actions,
    }


def render_input_center_markdown(snapshot: dict[str, Any]) -> str:
    lines = [
        "# Input Center Snapshot",
        "",
        f"- Generated: {snapshot.get('generated_at', '')}",
        f"- Status: {snapshot.get('status', 'unknown')}",
        f"- Templates: {snapshot.get('total_templates', 0)}",
        f"- Total rows: {snapshot.get('total_rows', 0)}",
        f"- Open items: {snapshot.get('open_item_count', 0)}",
        "",
        "## Recommended Actions",
        "",
    ]

    for action in snapshot.get("recommended_actions", []):
        lines.append(f"- {action}")

    lines.extend(["", "## Template Status", ""])
    for template in snapshot.get("templates", []):
        lines.append(
            f"- `{template.get('key', '')}` | status=`{template.get('status', '')}` | rows={template.get('row_count', 0)} | open={template.get('open_item_count', 0)}"
        )

    lines.extend(["", "## Top Updates", ""])
    if not snapshot.get("top_updates"):
        lines.append("- No updates captured yet.")
    for update in snapshot.get("top_updates", []):
        lines.append(
            f"- `{update.get('template_key', '')}` | `{update.get('priority', '')}` | {update.get('summary', '')} | owner `{update.get('owner', '')}`"
        )

    lines.append("")
    return "\n".join(lines)


def write_input_center_outputs(
    snapshot: dict[str, Any],
    output_dir: Path,
    config: InputCenterConfig,
) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = output_dir / config.snapshot_file
    summary_path = output_dir / config.summary_file
    snapshot_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    summary_path.write_text(render_input_center_markdown(snapshot), encoding="utf-8")
    return {
        "snapshot_file": str(snapshot_path.resolve()),
        "summary_file": str(summary_path.resolve()),
    }


def load_input_center_summary(output_dir: Path, config: InputCenterConfig) -> dict[str, Any]:
    snapshot_path = output_dir / config.snapshot_file
    if not snapshot_path.exists():
        return {
            "status": "not_ready",
            "total_templates": 0,
            "total_rows": 0,
            "open_item_count": 0,
            "top_updates": [],
            "recommended_actions": [],
        }

    try:
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except Exception:
        return {
            "status": "error",
            "total_templates": 0,
            "total_rows": 0,
            "open_item_count": 0,
            "top_updates": [],
            "recommended_actions": ["Input center snapshot exists but could not be parsed."],
        }

    return {
        "status": payload.get("status", "unknown"),
        "generated_at": payload.get("generated_at", ""),
        "total_templates": payload.get("total_templates", 0),
        "total_rows": payload.get("total_rows", 0),
        "open_item_count": payload.get("open_item_count", 0),
        "templates": payload.get("templates", [])[:8],
        "top_updates": payload.get("top_updates", [])[:8],
        "recommended_actions": payload.get("recommended_actions", [])[:6],
    }
