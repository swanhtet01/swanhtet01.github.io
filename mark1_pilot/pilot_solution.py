from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


PROFILE_PRIORITY = [
    "quality_watch",
    "supplier_kiic",
    "supplier_junky",
    "supplier_forwarded",
    "internal_ytf",
    "relevant_all",
]


def _urgency_for_text(text: str) -> str:
    lowered = text.lower()
    if any(term in lowered for term in ("urgent", "overdue", "claim", "defect", "reject", "quality", "capa", "critical")):
        return "high"
    if any(term in lowered for term in ("invoice", "payment", "shipment", "quotation", "supplier", "risk")):
        return "medium"
    return "low"


def _action_for_signal(profile: str, subject: str, snippet: str) -> str:
    text = f"{subject} {snippet}".lower()
    if profile == "quality_watch" or any(term in text for term in ("claim", "defect", "reject", "quality", "capa")):
        return "Review quality signal and confirm incident/CAPA ownership."
    if profile.startswith("supplier_") or any(term in text for term in ("shipment", "quotation", "kiic", "junky")):
        return "Follow up supplier thread and lock owner/date for next action."
    if any(term in text for term in ("invoice", "payment", "cash", "overdue")):
        return "Validate payment status against invoice and cash records."
    return "Review thread and assign explicit next step."


def _action_for_input_signal(update: dict[str, Any]) -> str:
    summary = update.get("summary", "Team update requires review.")
    status = str(update.get("status", "")).strip().lower()
    priority = str(update.get("priority", "low")).strip().lower()
    if priority == "high":
        return f"Escalate and close high-priority team update: {summary}"
    if status in {"open", "pending", "review", "in_progress", "in progress"}:
        return f"Assign owner/date and move open team item forward: {summary}"
    return f"Review team update and capture next action: {summary}"


def _extract_email_signals(
    payload: dict[str, Any],
    limit: int = 15,
    per_profile_limit: int = 4,
) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    email_profiles = payload.get("email_profiles", {})

    for profile in PROFILE_PRIORITY:
        profile_data = email_profiles.get(profile, {})
        profile_count = 0
        for message in profile_data.get("messages", []):
            if profile_count >= per_profile_limit:
                break
            message_id = message.get("id", "")
            if message_id in seen_ids:
                continue
            seen_ids.add(message_id)
            subject = message.get("subject", "").strip()
            snippet = message.get("snippet", "").strip()
            urgency = _urgency_for_text(f"{subject} {snippet}")
            signals.append(
                {
                    "profile": profile,
                    "message_id": message_id,
                    "thread_id": message.get("thread_id", ""),
                    "from": message.get("from", ""),
                    "to": message.get("to", ""),
                    "subject": subject,
                    "snippet": snippet,
                    "date": message.get("date", ""),
                    "urgency": urgency,
                    "next_action": _action_for_signal(profile, subject, snippet),
                }
            )
            profile_count += 1
            if len(signals) >= limit:
                return signals
    return signals


def _extract_drive_signals(payload: dict[str, Any], per_query: int = 3) -> list[dict[str, Any]]:
    drive_signals: list[dict[str, Any]] = []
    for name, data in payload.get("search_queries", {}).items():
        for item in data.get("results", [])[:per_query]:
            drive_signals.append(
                {
                    "query": name,
                    "path": item.get("path", ""),
                    "name": item.get("name", ""),
                    "top_level": item.get("top_level", ""),
                    "snippet": item.get("snippet", ""),
                    "score": item.get("score", 0),
                }
            )
    return drive_signals


def _extract_input_signals(payload: dict[str, Any], limit: int = 10) -> list[dict[str, Any]]:
    input_center = payload.get("input_center", {})
    updates = input_center.get("top_updates", [])
    signals: list[dict[str, Any]] = []
    for update in updates[:limit]:
        priority = str(update.get("priority", "low")).lower()
        signals.append(
            {
                "template_key": update.get("template_key", ""),
                "template_title": update.get("template_title", ""),
                "updated_at": update.get("updated_at", ""),
                "priority": priority,
                "status": update.get("status", ""),
                "owner": update.get("owner", ""),
                "summary": update.get("summary", ""),
                "next_action": _action_for_input_signal(update),
                "web_view_link": update.get("web_view_link", ""),
            }
        )
    return signals


def _derive_priority_actions(
    email_signals: list[dict[str, Any]],
    input_signals: list[dict[str, Any]],
    dqms: dict[str, Any],
    erp: dict[str, Any],
    platform_actions: list[str],
) -> list[dict[str, str]]:
    actions: list[dict[str, str]] = []

    for signal in email_signals[:8]:
        actions.append(
            {
                "priority": signal.get("urgency", "medium"),
                "source": f"email:{signal.get('profile', '')}",
                "title": signal.get("subject", "Untitled signal"),
                "action": signal.get("next_action", "Review and assign owner."),
            }
        )

    for signal in input_signals[:6]:
        actions.append(
            {
                "priority": signal.get("priority", "medium"),
                "source": f"input:{signal.get('template_key', '')}",
                "title": signal.get("summary", "Team update"),
                "action": signal.get("next_action", "Review and assign owner."),
            }
        )

    if dqms.get("status") == "ready" and dqms.get("open_incident_count", 0) > 0:
        actions.append(
            {
                "priority": "high",
                "source": "dqms",
                "title": "Open quality incidents",
                "action": f"Close or update {dqms.get('open_incident_count', 0)} open/triage quality items with owner and date.",
            }
        )

    if erp.get("status") == "ready" and erp.get("watchlist_change_count", 0) > 0:
        actions.append(
            {
                "priority": "high",
                "source": "erp",
                "title": "Watchlist files changed",
                "action": f"Review {erp.get('watchlist_change_count', 0)} watchlist file changes and assign owner/date.",
            }
        )

    if erp.get("status") == "ready" and erp.get("drive_status") == "ready" and erp.get("drive_watchlist_change_count", 0) > 0:
        actions.append(
            {
                "priority": "high",
                "source": "erp_drive",
                "title": "Drive watchlist files changed",
                "action": f"Review {erp.get('drive_watchlist_change_count', 0)} Drive watchlist file changes and map them to manager owners.",
            }
        )

    if erp.get("status") == "ready" and erp.get("recent_changes"):
        top_change = erp["recent_changes"][0]
        actions.append(
            {
                "priority": "medium",
                "source": "erp",
                "title": "Latest file activity",
                "action": f"Check {top_change.get('type', 'change')} on `{top_change.get('path', '')}` ({top_change.get('module', 'general')}).",
            }
        )

    for action in platform_actions[:5]:
        actions.append(
            {
                "priority": "medium",
                "source": "platform",
                "title": "Platform recommendation",
                "action": action,
            }
        )

    return actions[:18]


def build_pilot_solution(payload: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now().astimezone().isoformat()
    email_signals = _extract_email_signals(payload, limit=15)
    drive_signals = _extract_drive_signals(payload, per_query=3)
    input_signals = _extract_input_signals(payload, limit=10)
    dqms = payload.get("dqms", {})
    erp = payload.get("erp", {})
    priority_actions = _derive_priority_actions(email_signals, input_signals, dqms, erp, payload.get("actions", []))

    return {
        "generated_at": generated_at,
        "dashboard_title": payload.get("dashboard_title", "Pilot Solution"),
        "email_signal_count": len(email_signals),
        "drive_signal_count": len(drive_signals),
        "input_signal_count": len(input_signals),
        "dqms": dqms,
        "erp": erp,
        "email_signals": email_signals,
        "drive_signals": drive_signals,
        "input_signals": input_signals,
        "priority_actions": priority_actions,
    }


def render_pilot_solution_markdown(solution: dict[str, Any]) -> str:
    lines = [
        "# Swan Personal Pilot Solution Brief",
        "",
        f"- Generated: {solution.get('generated_at', '')}",
        f"- Email signals: {solution.get('email_signal_count', 0)}",
        f"- Drive evidence signals: {solution.get('drive_signal_count', 0)}",
        f"- Team input signals: {solution.get('input_signal_count', 0)}",
        f"- DQMS open incidents: {solution.get('dqms', {}).get('open_incident_count', 0)}",
        f"- ERP changed files: {solution.get('erp', {}).get('total_changes', 0)}",
        f"- ERP watchlist changes: {solution.get('erp', {}).get('watchlist_change_count', 0)}",
        f"- ERP local changes: {solution.get('erp', {}).get('local_total_changes', 0)}",
        f"- ERP Drive changes: {solution.get('erp', {}).get('drive_total_changes', 0)}",
        "",
        "## Priority Actions",
        "",
    ]
    for item in solution.get("priority_actions", []):
        lines.append(
            f"- [`{item.get('priority', '')}`] {item.get('action', '')} ({item.get('source', '')})"
        )

    lines.extend(["", "## Team Input Signals", ""])
    input_signals = solution.get("input_signals", [])
    if not input_signals:
        lines.append("- No structured team input signals yet. Run `input-center-sync` after setting up templates.")
    for signal in input_signals[:12]:
        lines.append(
            f"- `{signal.get('template_key', '')}` | `{signal.get('priority', '')}` | {signal.get('summary', '')} | owner `{signal.get('owner', '')}`"
        )

    lines.extend(["", "## Email Signals", ""])
    for signal in solution.get("email_signals", [])[:15]:
        lines.append(
            f"- `{signal.get('profile', '')}` | `{signal.get('urgency', '')}` | {signal.get('subject', '')} | from `{signal.get('from', '')}`"
        )

    lines.extend(["", "## Drive Evidence Signals", ""])
    for signal in solution.get("drive_signals", [])[:15]:
        lines.append(
            f"- `{signal.get('query', '')}` | `{signal.get('top_level', '')}` | `{signal.get('name', '')}` | {signal.get('snippet', '')[:140]}"
        )

    lines.extend(["", "## ERP Recent File Changes", ""])
    erp_changes = solution.get("erp", {}).get("recent_changes", [])
    if not erp_changes:
        lines.append("- No ERP file changes detected yet. Run `erp-sync` first.")
    for change in erp_changes[:12]:
        lines.append(
            f"- `{change.get('source', 'local')}` | `{change.get('type', '')}` | `{change.get('module', '')}` | `{change.get('path', '')}` | {change.get('action', '')}"
        )

    lines.append("")
    return "\n".join(lines)


def write_pilot_solution(solution: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "pilot_solution.json"
    md_path = output_dir / "pilot_solution.md"
    json_path.write_text(json.dumps(solution, indent=2), encoding="utf-8")
    md_path.write_text(render_pilot_solution_markdown(solution), encoding="utf-8")
    return {
        "json_file": str(json_path.resolve()),
        "markdown_file": str(md_path.resolve()),
    }
