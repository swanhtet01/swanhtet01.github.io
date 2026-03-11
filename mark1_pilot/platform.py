from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from html import escape
from typing import Any

from .config import PilotConfig
from .connectors.gmail import GmailProbe
from .connectors.google_drive import GoogleDriveProbe
from .dqms import load_dqms_summary
from .erp import load_erp_summary
from .external import ExternalSourceWatcher
from .input_center import load_input_center_summary
from .inventory import scan_local_root
from .search import search_index


def _profile_summary(result: dict[str, Any]) -> dict[str, Any]:
    messages = result.get("messages", [])
    senders = Counter(item.get("from", "") for item in messages if item.get("from"))
    subjects = [item.get("subject", "") for item in messages if item.get("subject")]
    newest = messages[0] if messages else {}
    return {
        "status": result.get("status", "unknown"),
        "message_count": len(messages),
        "top_senders": senders.most_common(5),
        "newest_subject": newest.get("subject", ""),
        "newest_date": newest.get("date", ""),
        "subjects": subjects[:5],
        "messages": messages,
    }


def _search_summary(result: dict[str, Any]) -> dict[str, Any]:
    hits = result.get("results", [])
    top_levels = Counter(item.get("top_level", "") for item in hits if item.get("top_level"))
    strongest = hits[0] if hits else {}
    return {
        "status": result.get("status", "unknown"),
        "result_count": len(hits),
        "top_levels": top_levels.most_common(5),
        "strongest_path": strongest.get("path", ""),
        "strongest_snippet": strongest.get("snippet", ""),
        "results": hits,
    }


def _latest_relevant_items(external_payload: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for source_name, source_payload in external_payload.get("sources", {}).items():
        relevant_items = source_payload.get("relevant_items") or source_payload.get("items", [])
        for item in relevant_items[:5]:
            items.append(
                {
                    "source": source_name,
                    "title": item.get("title", ""),
                    "url": item.get("url", ""),
                    "date": item.get("date", ""),
                    "summary": item.get("summary", ""),
                    "matched_keywords": item.get("matched_keywords", []),
                    "topics": item.get("topics", []),
                    "relevance_score": item.get("relevance_score", 0),
                }
            )
    items.sort(
        key=lambda item: (
            -item.get("relevance_score", 0),
            0 if item.get("date") else 1,
            item.get("source", ""),
            item.get("title", ""),
        )
    )
    return items[:12]


def _contains_any(items: list[str], keywords: tuple[str, ...]) -> bool:
    lowered_items = " ".join(items).lower()
    return any(keyword in lowered_items for keyword in keywords)


def _build_action_items(
    email_profiles: dict[str, dict[str, Any]],
    search_queries: dict[str, dict[str, Any]],
    external_payload: dict[str, Any],
    erp_summary: dict[str, Any],
    input_center: dict[str, Any],
) -> list[str]:
    actions: list[str] = []

    junky_subjects = email_profiles.get("supplier_junky", {}).get("subjects", [])
    if _contains_any(junky_subjects, ("overdue", "payment", "remittance", "invoice")):
        actions.append(
            "Reconcile Junky overdue-payment and remittance threads against the local cash and invoice evidence packs."
        )

    kiic_subjects = email_profiles.get("supplier_kiic", {}).get("subjects", [])
    if _contains_any(kiic_subjects, ("shipment", "tracking", "passport", "pi", "bead wire", "dhl")):
        actions.append(
            "Track KIIC shipment, PI revision, and customs-facing naming issues in one consolidated supplier control list."
        )

    internal_subjects = email_profiles.get("internal_ytf", {}).get("subjects", [])
    if _contains_any(internal_subjects, ("grn", "#ygn-r", "do ", "claim")):
        actions.append(
            "Review internal Yangon Tyre claim, DO, and GRN activity as a same-day operating checklist."
        )

    quality_subjects = email_profiles.get("quality_watch", {}).get("subjects", [])
    if _contains_any(quality_subjects, ("quality", "claim", "complaint", "defect", "reject", "ncr", "capa")):
        actions.append(
            "Create a DQMS quality incident register from claim/defect emails and assign open items to owner, due date, and closure evidence."
        )

    external_titles = [item.get("title", "") for item in _latest_relevant_items(external_payload)]
    if _contains_any(external_titles, ("fuel", "electricity", "import", "export", "border", "customs")):
        actions.append(
            "Monitor external policy and logistics headlines because they can change plant cost, shipment timing, and import handling."
        )

    if external_payload.get("sources", {}).get("MRPPA Market", {}).get("items"):
        actions.append(
            "Compare MRPPA market price signals against current procurement, compound, and sales assumptions."
        )

    if search_queries.get("cash", {}).get("result_count", 0) and search_queries.get("invoice", {}).get("result_count", 0):
        actions.append(
            "Cross-link payment emails with the local cash book and invoice files to create a grounded payment-control pack."
        )

    if search_queries.get("quality", {}).get("result_count", 0):
        actions.append(
            "Link quality-related files to email incidents so DQMS reviews can move from inbox threads to tracked CAPA records."
        )

    if erp_summary.get("status") == "ready" and erp_summary.get("watchlist_change_count", 0):
        actions.append(
            f"ERP watchlist shows {erp_summary.get('watchlist_change_count', 0)} changed files; review the change register and assign owners."
        )

    if erp_summary.get("status") == "ready" and erp_summary.get("drive_status") == "ready":
        drive_watch_changes = erp_summary.get("drive_watchlist_change_count", 0)
        if drive_watch_changes:
            actions.append(
                f"Drive watchlist shows {drive_watch_changes} changed cloud files; align owners and next actions with local ERP register."
            )
        if erp_summary.get("drive_truncated", False):
            actions.append("Drive ERP scan hit max item limit; increase `erp.drive_max_items` to widen coverage.")

    if erp_summary.get("status") == "ready" and erp_summary.get("module_activity"):
        for module, count in sorted(erp_summary.get("module_activity", {}).items()):
            if count > 0 and module in {"finance", "sales", "procurement", "quality"}:
                actions.append(
                    f"ERP module activity: {module} changed files = {count}. Validate business impact in this week plan."
                )
                break

    if input_center.get("status") == "ready":
        if input_center.get("total_rows", 0) == 0:
            actions.append("Input Center is active but empty. Ask each function owner to add one baseline update row today.")
        else:
            actions.append(
                f"Input Center captured {input_center.get('total_rows', 0)} team rows; use this as your daily management checkpoint."
            )
        if input_center.get("open_item_count", 0) > 0:
            actions.append(
                f"Input Center has {input_center.get('open_item_count', 0)} open tracker items. Push owner/date closure discipline."
            )

    for action in input_center.get("recommended_actions", [])[:2]:
        if action not in actions:
            actions.append(action)

    if not actions:
        actions.append("Expand the search index and email profiles so the next digest has stronger operational coverage.")

    return actions


def build_platform_digest(
    config: PilotConfig,
    *,
    email_max_results: int = 12,
) -> dict[str, Any]:
    inventory = scan_local_root(config.drive.local_root_path)
    drive_probe = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=config.drive.google_drive_folder_id,
    ).probe()
    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    gmail_probe = gmail.probe()

    email_profiles: dict[str, dict[str, Any]] = {}
    for profile_name in config.platform.email_profiles:
        query = config.gmail.profiles.get(profile_name)
        if not query:
            email_profiles[profile_name] = {
                "status": "missing_profile",
                "message_count": 0,
                "top_senders": [],
                "newest_subject": "",
                "newest_date": "",
                "subjects": [],
                "messages": [],
                "query": "",
            }
            continue
        result = gmail.search_messages(query=query, max_results=email_max_results)
        summary = _profile_summary(result)
        summary["query"] = query
        email_profiles[profile_name] = summary

    search_queries: dict[str, dict[str, Any]] = {}
    db_path = config.output.inventory_path / "search_index.sqlite"
    for query_config in config.platform.search_queries:
        result = search_index(db_path, query_config.query, top_k=query_config.top_k)
        summary = _search_summary(result)
        summary["query"] = query_config.query
        search_queries[query_config.name] = summary

    external_payload = ExternalSourceWatcher(config.external).fetch_all()
    external_items = _latest_relevant_items(external_payload)
    dqms = load_dqms_summary(config.output.inventory_path, config.dqms)
    erp = load_erp_summary(config.output.inventory_path, config.erp)
    input_center = load_input_center_summary(config.output.inventory_path, config.input_center)

    highlights = [
        f"Mailbox `{gmail_probe.get('email_address', '')}` is live with Yangon Tyre-focused profiles ready.",
        f"Local corpus remains the backbone at {inventory['total_files']} files dominated by spreadsheets, documents, and PDFs.",
        f"External watch is now pulling from {len(config.external.news_sources)} configured public sources.",
    ]
    if email_profiles.get("supplier_junky", {}).get("newest_subject"):
        highlights.append(
            f"Junky watch latest: {email_profiles['supplier_junky']['newest_subject']}"
        )
    if email_profiles.get("supplier_kiic", {}).get("newest_subject"):
        highlights.append(
            f"KIIC watch latest: {email_profiles['supplier_kiic']['newest_subject']}"
        )
    if external_items:
        highlights.append(f"External headline watch: {external_items[0]['title']}")
    if dqms.get("status") == "ready":
        highlights.append(
            f"DQMS snapshot: {dqms.get('open_incident_count', 0)} open or triage incidents and {dqms.get('capa_count', 0)} CAPA actions."
        )
    if erp.get("status") == "ready":
        local_changes = erp.get("local_total_changes", 0)
        drive_changes = erp.get("drive_total_changes", 0)
        highlights.append(
            f"ERP snapshot: {erp.get('total_changes', 0)} total changes ({local_changes} local + {drive_changes} Drive) and {erp.get('watchlist_change_count', 0)} watchlist changes."
        )
        if erp.get("drive_status") == "ready":
            highlights.append(
                f"Drive activity: {erp.get('drive_watchlist_change_count', 0)} watchlist changes from cloud files."
            )
    if input_center.get("status") == "ready":
        highlights.append(
            f"Input center: {input_center.get('total_rows', 0)} rows across {input_center.get('total_templates', 0)} live team sheets."
        )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "dashboard_title": config.platform.dashboard_title,
        "inventory": {
            "total_files": inventory["total_files"],
            "total_bytes": inventory["total_bytes"],
            "top_file_types": list(inventory["extension_counts"].items())[:5],
        },
        "connectors": {
            "drive": drive_probe,
            "gmail": gmail_probe,
        },
        "email_profiles": email_profiles,
        "search_queries": search_queries,
        "external": external_payload,
        "input_center": input_center,
        "dqms": dqms,
        "erp": erp,
        "highlights": highlights,
        "actions": _build_action_items(email_profiles, search_queries, external_payload, erp, input_center),
    }


def render_platform_digest_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# {payload['dashboard_title']}",
        "",
        f"- Generated: {payload['generated_at']}",
        f"- Gmail mailbox: `{payload['connectors']['gmail'].get('email_address', '')}`",
        f"- Local files: {payload['inventory']['total_files']}",
        "",
        "## Executive Pulse",
        "",
    ]
    for item in payload.get("highlights", []):
        lines.append(f"- {item}")

    lines.extend(["", "## Internal And Supplier Signals", ""])
    for profile_name, summary in payload.get("email_profiles", {}).items():
        lines.append(f"### {profile_name}")
        lines.append("")
        lines.append(f"- Messages sampled: {summary.get('message_count', 0)}")
        if summary.get("newest_subject"):
            lines.append(f"- Newest subject: {summary['newest_subject']}")
        if summary.get("top_senders"):
            sender_text = ", ".join(
                f"`{name}` ({count})" for name, count in summary["top_senders"][:3]
            )
            lines.append(f"- Main senders: {sender_text}")
        for message in summary.get("messages", [])[:3]:
            lines.append(
                f"- `{message.get('date', '')}` | `{message.get('from', '')}` | `{message.get('subject', '')}`"
            )
        lines.append("")

    lines.extend(["## Local Evidence Packs", ""])
    for query_name, summary in payload.get("search_queries", {}).items():
        lines.append(f"### {query_name}")
        lines.append("")
        lines.append(f"- Hits: {summary.get('result_count', 0)}")
        if summary.get("strongest_path"):
            lines.append(f"- Strongest file: `{summary['strongest_path']}`")
            lines.append(f"- Snippet: {summary.get('strongest_snippet', '')}")
        lines.append("")

    input_center = payload.get("input_center", {})
    lines.extend(["## Team Input Center", ""])
    if input_center.get("status") != "ready":
        lines.append("- Input center snapshot not ready yet. Run `input-center-setup` then `input-center-sync`.")
    else:
        lines.append(f"- Templates: {input_center.get('total_templates', 0)}")
        lines.append(f"- Total rows: {input_center.get('total_rows', 0)}")
        lines.append(f"- Open items: {input_center.get('open_item_count', 0)}")
        for template in input_center.get("templates", [])[:6]:
            lines.append(
                f"- `{template.get('key', '')}` | rows={template.get('row_count', 0)} | open={template.get('open_item_count', 0)}"
            )
        for update in input_center.get("top_updates", [])[:6]:
            lines.append(
                f"- `{update.get('template_key', '')}` | `{update.get('priority', '')}` | {update.get('summary', '')}"
            )
    lines.append("")

    erp = payload.get("erp", {})
    lines.extend(["## ERP File Activity", ""])
    if erp.get("status") != "ready":
        lines.append("- ERP change register is not generated yet. Run `erp-sync` first.")
    else:
        lines.append(f"- Total file changes: {erp.get('total_changes', 0)}")
        lines.append(f"- Watchlist file changes: {erp.get('watchlist_change_count', 0)}")
        lines.append(
            f"- Added: {erp.get('added_count', 0)} | Modified: {erp.get('modified_count', 0)} | Removed: {erp.get('removed_count', 0)}"
        )
        lines.append(
            f"- Local changes: {erp.get('local_total_changes', 0)} | Drive changes: {erp.get('drive_total_changes', 0)}"
        )
        lines.append(
            f"- Local watchlist: {erp.get('local_watchlist_change_count', 0)} | Drive watchlist: {erp.get('drive_watchlist_change_count', 0)}"
        )
        if erp.get("drive_status") == "ready":
            lines.append(f"- Drive snapshot truncated by max limit: {erp.get('drive_truncated', False)}")
        for module, count in sorted(erp.get("module_activity", {}).items()):
            lines.append(f"- `{module}`: {count}")
        for item in erp.get("recent_changes", [])[:6]:
            lines.append(
                f"- `{item.get('source', 'local')}` | `{item.get('type', '')}` | `{item.get('module', '')}` | `{item.get('path', '')}`"
            )
        if erp.get("drive_status") == "ready" and erp.get("drive_recent_changes"):
            lines.append("- Drive recent changes:")
            for item in erp.get("drive_recent_changes", [])[:4]:
                lines.append(
                    f"- drive_recent | `{item.get('type', '')}` | `{item.get('module', '')}` | `{item.get('path', '')}`"
                )
    lines.append("")

    lines.extend(["## External Watch", ""])
    for source_name, source_payload in payload.get("external", {}).get("sources", {}).items():
        lines.append(f"### {source_name}")
        lines.append("")
        items = source_payload.get("relevant_items") or source_payload.get("items", [])
        for item in items[:5]:
            topic_text = ", ".join(item.get("topics", [])[:2])
            suffix = f" | {topic_text}" if topic_text else ""
            lines.append(
                f"- `{item.get('date', '')}` | [{item.get('title', '')}]({item.get('url', '')}){suffix}"
            )
        lines.append("")

    manual_sources = payload.get("external", {}).get("manual_sources", [])
    if manual_sources:
        lines.extend(["## Manual Watchlist", ""])
        for source in manual_sources:
            lines.append(f"- `{source.get('name', '')}` | {source.get('notes', '')}")
        lines.append("")

    lines.extend(["## Recommended Actions", ""])
    for action in payload.get("actions", []):
        lines.append(f"- {action}")
    lines.append("")

    dqms = payload.get("dqms", {})
    lines.extend(["## DQMS Snapshot", ""])
    if dqms.get("status") != "ready":
        lines.append("- DQMS registers are not generated yet. Run `dqms-sync` first.")
    else:
        lines.append(f"- Open incidents: {dqms.get('open_incident_count', 0)}")
        lines.append(f"- CAPA actions: {dqms.get('capa_count', 0)}")
        lines.append(f"- Suppliers tracked: {dqms.get('supplier_count', 0)}")
        for supplier in dqms.get("top_suppliers", [])[:5]:
            lines.append(
                f"- `{supplier.get('supplier', '')}` | open={supplier.get('open_incidents', 0)} | triage={supplier.get('triage_incidents', 0)}"
            )
    lines.append("")
    return "\n".join(lines)


def render_platform_dashboard_html(payload: dict[str, Any]) -> str:
    def _list_html(items: list[str]) -> str:
        return "".join(f"<li>{escape(item)}</li>" for item in items)

    email_sections: list[str] = []
    for profile_name, summary in payload.get("email_profiles", {}).items():
        sender_html = "".join(
            f"<li><strong>{escape(name)}</strong> <span>{count}</span></li>"
            for name, count in summary.get("top_senders", [])[:4]
        )
        message_html = "".join(
            (
                "<li>"
                f"<div class='meta'>{escape(message.get('date', ''))}</div>"
                f"<div class='title'>{escape(message.get('subject', ''))}</div>"
                f"<div class='sub'>{escape(message.get('from', ''))}</div>"
                "</li>"
            )
            for message in summary.get("messages", [])[:4]
        )
        email_sections.append(
            "<section class='panel'>"
            f"<h3>{escape(profile_name)}</h3>"
            f"<p class='stat'>{summary.get('message_count', 0)} sampled emails</p>"
            f"<p class='lede'>{escape(summary.get('newest_subject', 'No recent subject'))}</p>"
            "<div class='split'>"
            f"<ul class='mini-list'>{sender_html}</ul>"
            f"<ul class='detail-list'>{message_html}</ul>"
            "</div>"
            "</section>"
        )

    file_sections: list[str] = []
    for query_name, summary in payload.get("search_queries", {}).items():
        result_html = "".join(
            (
                "<li>"
                f"<div class='title'>{escape(result.get('path', ''))}</div>"
                f"<div class='sub'>{escape(result.get('snippet', ''))}</div>"
                "</li>"
            )
            for result in summary.get("results", [])[:3]
        )
        file_sections.append(
            "<section class='panel'>"
            f"<h3>{escape(query_name)}</h3>"
            f"<p class='stat'>{summary.get('result_count', 0)} local hits</p>"
            f"<ul class='detail-list'>{result_html}</ul>"
            "</section>"
        )

    external_sections: list[str] = []
    for source_name, source_payload in payload.get("external", {}).get("sources", {}).items():
        items = source_payload.get("relevant_items") or source_payload.get("items", [])
        item_html = "".join(
            (
                "<li>"
                f"<a href='{escape(item.get('url', ''))}' target='_blank' rel='noreferrer'>{escape(item.get('title', ''))}</a>"
                f"<div class='sub'>{escape(' | '.join(part for part in [item.get('date', ''), ', '.join(item.get('topics', [])[:2])] if part))}</div>"
                "</li>"
            )
            for item in items[:5]
        )
        external_sections.append(
            "<section class='panel'>"
            f"<h3>{escape(source_name)}</h3>"
            f"<ul class='detail-list'>{item_html}</ul>"
            "</section>"
        )

    manual_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(source.get('name', ''))}</div>"
            f"<div class='sub'>{escape(source.get('notes', ''))}</div>"
            "</li>"
        )
        for source in payload.get("external", {}).get("manual_sources", [])
    )

    erp = payload.get("erp", {})
    erp_recent_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(item.get('source', 'local'))} | {escape(item.get('type', ''))} | {escape(item.get('module', ''))}</div>"
            f"<div class='sub'>{escape(item.get('path', ''))}</div>"
            "</li>"
        )
        for item in erp.get("recent_changes", [])[:6]
    )
    erp_drive_recent_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(item.get('type', ''))} | {escape(item.get('module', ''))}</div>"
            f"<div class='sub'>{escape(item.get('path', ''))}</div>"
            "</li>"
        )
        for item in erp.get("drive_recent_changes", [])[:6]
    )
    erp_module_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(module)}</div>"
            f"<div class='sub'>{count} changed files</div>"
            "</li>"
        )
        for module, count in sorted(erp.get("module_activity", {}).items())
    )

    input_center = payload.get("input_center", {})
    input_template_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(item.get('key', ''))}</div>"
            f"<div class='sub'>rows {item.get('row_count', 0)} | open {item.get('open_item_count', 0)}</div>"
            "</li>"
        )
        for item in input_center.get("templates", [])[:6]
    )
    input_updates_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(item.get('template_key', ''))} | {escape(item.get('priority', ''))}</div>"
            f"<div class='sub'>{escape(item.get('summary', ''))}</div>"
            "</li>"
        )
        for item in input_center.get("top_updates", [])[:6]
    )

    dqms = payload.get("dqms", {})
    dqms_html = "".join(
        (
            "<li>"
            f"<div class='title'>{escape(item.get('supplier', ''))}</div>"
            f"<div class='sub'>open {item.get('open_incidents', 0)} | triage {item.get('triage_incidents', 0)}</div>"
            "</li>"
        )
        for item in dqms.get("top_suppliers", [])[:5]
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(payload['dashboard_title'])}</title>
  <style>
    :root {{
      --bg: #f2efe7;
      --paper: #fffaf0;
      --ink: #1f2a24;
      --muted: #5c695f;
      --accent: #b54f2d;
      --accent-2: #1d5f74;
      --line: #d9d1c2;
      --shadow: 0 18px 40px rgba(39, 31, 18, 0.12);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Trebuchet MS", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top right, rgba(181, 79, 45, 0.12), transparent 28%),
        radial-gradient(circle at left center, rgba(29, 95, 116, 0.08), transparent 22%),
        var(--bg);
    }}
    main {{ max-width: 1240px; margin: 0 auto; padding: 36px 24px 64px; }}
    .hero {{
      display: grid;
      gap: 16px;
      grid-template-columns: 2fr 1fr;
      background: linear-gradient(135deg, rgba(255,250,240,0.94), rgba(245,240,230,0.94));
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 28px;
      box-shadow: var(--shadow);
    }}
    h1, h2, h3 {{ font-family: Georgia, "Times New Roman", serif; margin: 0 0 12px; letter-spacing: -0.02em; }}
    h1 {{ font-size: 2.8rem; line-height: 0.95; }}
    h2 {{ font-size: 1.4rem; margin-top: 34px; }}
    h3 {{ font-size: 1.1rem; }}
    .chips {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }}
    .chip {{ border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; background: rgba(255,255,255,0.7); font-size: 0.9rem; }}
    .grid {{ display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 18px; }}
    .panel {{ background: var(--paper); border: 1px solid var(--line); border-radius: 20px; padding: 20px; box-shadow: var(--shadow); }}
    .stat {{ color: var(--accent); font-size: 1.7rem; margin: 0 0 8px; }}
    .lede, .sub, .meta {{ color: var(--muted); }}
    ul {{ margin: 0; padding-left: 18px; }}
    .mini-list, .detail-list {{ list-style: none; padding-left: 0; display: grid; gap: 10px; }}
    .detail-list li, .mini-list li {{ padding: 10px 0; border-top: 1px solid rgba(217, 209, 194, 0.7); }}
    .detail-list li:first-child, .mini-list li:first-child {{ border-top: 0; padding-top: 0; }}
    .split {{ display: grid; gap: 16px; grid-template-columns: 1fr 1.3fr; }}
    a {{ color: var(--accent-2); text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    .title {{ font-weight: 700; }}
    .section-head {{ display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }}
    @media (max-width: 860px) {{
      .hero {{ grid-template-columns: 1fr; }}
      .split {{ grid-template-columns: 1fr; }}
      h1 {{ font-size: 2.2rem; }}
    }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div>
        <p class="meta">Personal platform for Swan | Generated {escape(payload['generated_at'])}</p>
        <h1>{escape(payload['dashboard_title'])}</h1>
        <p>A curated command surface combining Yangon Tyre files, live Gmail evidence, external Myanmar market/news watch, and structured team sheets.</p>
        <ul>{_list_html(payload.get('highlights', []))}</ul>
      </div>
      <div class="panel">
        <h3>Command Deck</h3>
        <div class="chips">
          <div class="chip">Gmail: {escape(payload['connectors']['gmail'].get('email_address', 'not connected'))}</div>
          <div class="chip">Files: {payload['inventory']['total_files']}</div>
          <div class="chip">Drive: {escape(payload['connectors']['drive'].get('status', 'unknown'))}</div>
          <div class="chip">External: {len(payload.get('external', {}).get('sources', {}))} sources</div>
          <div class="chip">Input rows: {input_center.get('total_rows', 0)}</div>
          <div class="chip">ERP changes: {erp.get('total_changes', 0)}</div>
          <div class="chip">ERP drive changes: {erp.get('drive_total_changes', 0)}</div>
          <div class="chip">DQMS open: {dqms.get('open_incident_count', 0)}</div>
        </div>
        <h3 style="margin-top:22px;">Next Moves</h3>
        <ul>{_list_html(payload.get('actions', []))}</ul>
      </div>
    </section>

    <div class="section-head"><h2>Email Signals</h2><p class="meta">Internal, supplier, and broad watch profiles</p></div>
    <div class="grid">{''.join(email_sections)}</div>

    <div class="section-head"><h2>Local Evidence</h2><p class="meta">Search packs from your Yangon Tyre file mirror</p></div>
    <div class="grid">{''.join(file_sections)}</div>

    <div class="section-head"><h2>Team Input Center</h2><p class="meta">Structured sheet updates from operations, quality, procurement, and sales</p></div>
    <div class="grid">
      <section class="panel">
        <p class="stat">{input_center.get('total_rows', 0)} input rows</p>
        <p class="lede">Open tracker items: {input_center.get('open_item_count', 0)}</p>
        <ul class="detail-list">{input_template_html or '<li><div class="sub">Run input-center-sync to populate team sheets.</div></li>'}</ul>
      </section>
      <section class="panel">
        <h3>Latest Team Updates</h3>
        <ul class="detail-list">{input_updates_html or '<li><div class="sub">No team updates yet.</div></li>'}</ul>
      </section>
    </div>

    <div class="section-head"><h2>ERP File Activity</h2><p class="meta">Track updates, changed files, and module-level movement</p></div>
    <div class="grid">
      <section class="panel">
        <p class="stat">{erp.get('total_changes', 0)} total changes</p>
        <p class="lede">Watchlist changes: {erp.get('watchlist_change_count', 0)}</p>
        <p class="sub">Local {erp.get('local_total_changes', 0)} | Drive {erp.get('drive_total_changes', 0)}</p>
        <ul class="detail-list">{erp_module_html or '<li><div class="sub">Run erp-sync to generate module activity.</div></li>'}</ul>
      </section>
      <section class="panel">
        <h3>Recent Changed Files</h3>
        <ul class="detail-list">{erp_recent_html or '<li><div class="sub">No recent ERP file changes.</div></li>'}</ul>
      </section>
    </div>

    <section class="panel" style="margin-top:16px;">
      <h3>Drive Recent Changed Files</h3>
      <p class="sub">Drive watchlist changes: {erp.get('drive_watchlist_change_count', 0)} | truncated: {erp.get('drive_truncated', False)}</p>
      <ul class="detail-list">{erp_drive_recent_html or '<li><div class="sub">No recent Drive file changes.</div></li>'}</ul>
    </section>

    <div class="section-head"><h2>External Watch</h2><p class="meta">Public Myanmar sources relevant to operations, rubber, trade, and logistics</p></div>
    <div class="grid">{''.join(external_sections)}</div>

    <div class="section-head"><h2>Manual Watchlist</h2><p class="meta">Sources that still need browser or export-based capture</p></div>
    <section class="panel"><ul class="detail-list">{manual_html or '<li><div class="sub">No manual watch sources configured.</div></li>'}</ul></section>

    <div class="section-head"><h2>DQMS Snapshot</h2><p class="meta">Quality incident and CAPA starter registers</p></div>
    <section class="panel">
      <p class="stat">{dqms.get('open_incident_count', 0)} open/triage incidents</p>
      <p class="lede">{dqms.get('capa_count', 0)} CAPA actions generated</p>
      <ul class="detail-list">{dqms_html or '<li><div class="sub">Run dqms-sync to generate DQMS registers.</div></li>'}</ul>
    </section>
  </main>
</body>
</html>"""
