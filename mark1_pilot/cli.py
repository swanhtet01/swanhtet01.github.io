from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Any, Callable

from .briefing import build_gmail_brief_markdown, build_query_brief_markdown
from .config import PilotConfig
from .connectors.gmail import DEFAULT_GMAIL_AUTH_HOST, DEFAULT_GMAIL_AUTH_PORT, GmailProbe
from .connectors.google_drive import GoogleDriveProbe
from .coverage import build_data_coverage_report, write_data_coverage_outputs
from .dqms import build_dqms_registers, render_dqms_weekly_summary, write_dqms_outputs
from .erp import (
    build_erp_focus_report,
    sync_erp_drive_activity,
    sync_erp_files,
    write_erp_focus_outputs,
)
from .execution_review import build_execution_review, write_execution_review_outputs
from .inventory import render_inventory_markdown, scan_local_root
from .manus_catalog import build_manus_catalog, write_manus_catalog
from .platform import (
    build_platform_digest,
    render_platform_dashboard_html,
    render_platform_digest_markdown,
)
from .pilot_solution import build_pilot_solution, write_pilot_solution
from .input_center import (
    build_input_center_snapshot,
    resolve_input_templates,
    template_payload,
    write_input_center_outputs,
)
from .review import build_connector_presence_summary, build_review_markdown
from .search import build_search_index, search_index

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None


def _write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _write_platform_outputs(config: PilotConfig, payload: dict) -> dict[str, str]:
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    markdown = render_platform_digest_markdown(payload)
    html = render_platform_dashboard_html(payload)

    json_file = output_dir / "platform_digest.json"
    md_file = output_dir / "platform_digest.md"
    html_file = output_dir / "platform_dashboard.html"
    _write_json(json_file, payload)
    _write_text(md_file, markdown)
    _write_text(html_file, html)

    site_dir = config.platform.publish.site_path
    site_dir.mkdir(parents=True, exist_ok=True)
    site_html_file = site_dir / "index.html"
    site_md_file = site_dir / "latest.md"
    site_json_file = site_dir / "latest.json"
    site_manifest_file = site_dir / "manifest.json"
    _write_text(site_html_file, html)
    _write_text(site_md_file, markdown)
    _write_json(site_json_file, payload)
    _write_json(
        site_manifest_file,
        {
            "generated_at": payload.get("generated_at", ""),
            "dashboard_title": payload.get("dashboard_title", ""),
            "local_outputs": {
                "html_file": str(html_file.resolve()),
                "markdown_file": str(md_file.resolve()),
                "json_file": str(json_file.resolve()),
            },
            "site_outputs": {
                "index_file": str(site_html_file.resolve()),
                "markdown_file": str(site_md_file.resolve()),
                "json_file": str(site_json_file.resolve()),
            },
        },
    )
    return {
        "markdown_file": str(md_file.resolve()),
        "html_file": str(html_file.resolve()),
        "json_file": str(json_file.resolve()),
        "site_index_file": str(site_html_file.resolve()),
        "site_markdown_file": str(site_md_file.resolve()),
        "site_json_file": str(site_json_file.resolve()),
        "site_manifest_file": str(site_manifest_file.resolve()),
        "markdown_content": markdown,
        "html_content": html,
        "json_content": json.dumps(payload, indent=2),
    }


def run_inventory(config_path: str) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    inventory = scan_local_root(config.drive.local_root_path)
    drive_probe = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=config.drive.google_drive_folder_id,
    ).probe()
    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    gmail_client = gmail.validate_client_config()
    gmail_probe = gmail.probe()
    review = build_review_markdown(config, inventory, drive_probe, gmail_client, gmail_probe)
    presence = build_connector_presence_summary(config)

    _write_json(output_dir / "yangon_tyre_inventory.json", inventory)
    _write_text(output_dir / "yangon_tyre_inventory.md", render_inventory_markdown(inventory))
    _write_text(output_dir / "pilot_review.md", review)
    _write_json(
        output_dir / "connector_status.json",
        {
            "presence": presence,
            "drive_probe": drive_probe,
            "gmail_client": gmail_client,
            "gmail_probe": gmail_probe,
        },
    )

    summary = {
        "project_name": config.project_name,
        "inventory_dir": str(output_dir.resolve()),
        "total_files": inventory["total_files"],
        "top_file_types": list(inventory["extension_counts"].items())[:5],
        "drive_probe": drive_probe["status"],
        "gmail_client": gmail_client["status"],
        "gmail_probe": gmail_probe["status"],
    }
    print(json.dumps(summary, indent=2))
    return 0


def run_config_profiles(config_path: str) -> int:
    config_file = Path(config_path).expanduser()
    if not config_file.is_absolute():
        config_file = (Path.cwd() / config_file).resolve()
    data = json.loads(config_file.read_text(encoding="utf-8"))
    profiles = data.get("profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}

    summary = {
        "config_file": str(config_file),
        "default_profile": str(data.get("default_profile", "")),
        "profile_count": len(profiles),
        "profiles": sorted(str(key) for key in profiles.keys()),
        "active_profile_from_env": str((os.getenv("MARK1_PROFILE", "") or "").strip()),
    }
    print(json.dumps(summary, indent=2))
    return 0


def run_config_profile_create(
    config_path: str,
    profile_name: str,
    from_profile: str | None,
    set_default: bool,
    overwrite: bool,
) -> int:
    config_file = Path(config_path).expanduser()
    if not config_file.is_absolute():
        config_file = (Path.cwd() / config_file).resolve()

    if not config_file.exists():
        print(
            json.dumps(
                {
                    "status": "missing_config",
                    "message": f"Config file does not exist: {config_file}",
                },
                indent=2,
            )
        )
        return 1

    data = json.loads(config_file.read_text(encoding="utf-8"))
    profiles = data.get("profiles", {})
    if not isinstance(profiles, dict):
        profiles = {}

    source_payload: dict[str, Any] = {}
    source_name = (from_profile or "").strip()
    if source_name:
        source_value = profiles.get(source_name)
        if source_value is None:
            print(
                json.dumps(
                    {
                        "status": "missing_source_profile",
                        "message": f"Profile '{source_name}' was not found in config.",
                        "available_profiles": sorted(str(key) for key in profiles.keys()),
                    },
                    indent=2,
                )
            )
            return 1
        if not isinstance(source_value, dict):
            print(
                json.dumps(
                    {
                        "status": "invalid_source_profile",
                        "message": f"Profile '{source_name}' is not a JSON object and cannot be used as a template.",
                    },
                    indent=2,
                )
            )
            return 1
        source_payload = copy.deepcopy(source_value)

    target_name = profile_name.strip()
    if not target_name:
        print(
            json.dumps(
                {
                    "status": "invalid_profile_name",
                    "message": "Profile name cannot be empty.",
                },
                indent=2,
            )
        )
        return 1

    already_exists = target_name in profiles
    if already_exists and not overwrite:
        print(
            json.dumps(
                {
                    "status": "profile_exists",
                    "message": f"Profile '{target_name}' already exists. Use --overwrite to replace it.",
                },
                indent=2,
            )
        )
        return 1

    profiles[target_name] = source_payload
    data["profiles"] = profiles
    if set_default:
        data["default_profile"] = target_name

    config_file.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": "ready",
                "config_file": str(config_file),
                "profile_name": target_name,
                "copied_from": source_name,
                "set_as_default": bool(set_default),
                "overwrote_existing": bool(already_exists),
                "profile_count": len(profiles),
            },
            indent=2,
        )
    )
    return 0


def _render_drive_tree(node: dict, depth: int = 0) -> list[str]:
    indent = "  " * depth
    lines = [f"{indent}- {node.get('name', '')} ({node.get('mime_type', '')})"]
    for child in node.get("children", []):
        lines.extend(_render_drive_tree(child, depth + 1))
    return lines


def run_drive_map(config_path: str, max_depth: int, folder_id: str | None = None) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    drive = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=folder_id or config.drive.google_drive_folder_id,
    )
    snapshot = drive.list_folder_tree(max_depth=max_depth)
    _write_json(output_dir / "drive_root_snapshot.json", snapshot)

    if snapshot.get("root"):
        markdown = ["# Yangon Tyre Drive Root Snapshot", ""]
        markdown.extend(_render_drive_tree(snapshot["root"]))
        markdown.append("")
        _write_text(output_dir / "drive_root_snapshot.md", "\n".join(markdown))

    print(
        json.dumps(
            {
                "status": snapshot.get("status", "unknown"),
                "output_dir": str(output_dir.resolve()),
                "max_depth": max_depth,
            },
            indent=2,
        )
    )
    return 0


def run_drive_shared_list(config_path: str) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    drive = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=config.drive.google_drive_folder_id,
    )
    result = drive.list_shared_drives()
    _write_json(output_dir / "drive_shared_drives.json", result)
    print(
        json.dumps(
            {
                "status": result.get("status", "unknown"),
                "count": result.get("count", 0),
                "output_file": str((output_dir / "drive_shared_drives.json").resolve()),
                "service_account_email": result.get("service_account_email", ""),
            },
            indent=2,
        )
    )
    return 0 if result.get("status") == "ready" else 1


def run_gmail_auth(config_path: str, no_browser: bool, host: str, port: int) -> int:
    config = PilotConfig.from_path(config_path)
    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    result = gmail.bootstrap_token(open_browser=not no_browser, host=host, port=port)
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "ready" else 1


def run_gmail_check(config_path: str, host: str, port: int) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    result = {
        "client": gmail.validate_client_config(host=host, port=port),
        "token": gmail.probe(),
        "profiles": config.gmail.profiles,
    }
    _write_json(output_dir / "gmail_check.json", result)
    print(
        json.dumps(
            {
                "client_status": result["client"].get("status", "unknown"),
                "token_status": result["token"].get("status", "unknown"),
                "profile_count": len(config.gmail.profiles),
                "output_file": str((output_dir / "gmail_check.json").resolve()),
            },
            indent=2,
        )
    )
    client_ok = result["client"].get("status") == "ready"
    token_ok = result["token"].get("status") == "ready"
    return 0 if client_ok and token_ok else 1


def run_gmail_setup(config_path: str, host: str, port: int) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    guide = gmail.build_setup_guide(host=host, port=port)
    validation = gmail.validate_client_config(host=host, port=port)
    _write_text(output_dir / "gmail_setup_guide.md", guide)
    _write_json(output_dir / "gmail_setup_status.json", validation)
    print(
        json.dumps(
            {
                "status": validation.get("status", "unknown"),
                "host": host,
                "port": port,
                "guide_file": str((output_dir / "gmail_setup_guide.md").resolve()),
                "status_file": str((output_dir / "gmail_setup_status.json").resolve()),
            },
            indent=2,
        )
    )
    return 0 if validation.get("status") == "ready" else 1


def run_gmail_auth_start(config_path: str) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    result = gmail.start_manual_auth_session()
    _write_json(output_dir / "gmail_auth_start.json", result)
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "ready" else 1


def run_gmail_auth_finish(config_path: str, callback_url: str) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    result = gmail.complete_manual_auth_session(callback_url)
    _write_json(output_dir / "gmail_auth_finish.json", result)
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "ready" else 1


def run_gmail_preview(config_path: str, profile: str, max_results: int) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    query = config.gmail.profiles.get(profile)
    if not query:
        print(
            json.dumps(
                {
                    "status": "missing_profile",
                    "message": f"Unknown Gmail profile: {profile}",
                    "available_profiles": sorted(config.gmail.profiles.keys()),
                },
                indent=2,
            )
        )
        return 1

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    result = gmail.search_messages(query=query, max_results=max_results)
    safe_name = profile.replace("/", "_").replace("\\", "_")
    _write_json(output_dir / f"gmail_{safe_name}.json", result)
    print(
        json.dumps(
            {
                "status": result.get("status", "unknown"),
                "profile": profile,
                "query": query,
                "output_file": str((output_dir / f"gmail_{safe_name}.json").resolve()),
                "message_count": len(result.get("messages", [])),
            },
            indent=2,
        )
    )
    return 0 if result.get("status") == "ready" else 1


def run_gmail_brief(config_path: str, profile: str, max_results: int, title: str | None) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    query = config.gmail.profiles.get(profile)
    if not query:
        print(
            json.dumps(
                {
                    "status": "missing_profile",
                    "message": f"Unknown Gmail profile: {profile}",
                    "available_profiles": sorted(config.gmail.profiles.keys()),
                },
                indent=2,
            )
        )
        return 1

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    result = gmail.search_messages(query=query, max_results=max_results)
    markdown = build_gmail_brief_markdown(profile, result, title=title)
    safe_name = profile.replace("/", "_").replace("\\", "_")
    json_file = output_dir / f"gmail_brief_{safe_name}.json"
    md_file = output_dir / f"gmail_brief_{safe_name}.md"
    _write_json(json_file, result)
    _write_text(md_file, markdown)
    print(
        json.dumps(
            {
                "status": result.get("status", "unknown"),
                "profile": profile,
                "query": query,
                "markdown_file": str(md_file.resolve()),
                "json_file": str(json_file.resolve()),
                "message_count": len(result.get("messages", [])),
            },
            indent=2,
        )
    )
    return 0 if result.get("status") == "ready" else 1


def run_search_index(config_path: str, char_limit: int, top_levels: list[str] | None) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "search_index.sqlite"

    result = build_search_index(
        config.drive.local_root_path,
        db_path,
        char_limit=char_limit,
        top_levels=set(top_levels) if top_levels else None,
    )
    _write_json(output_dir / "search_index_status.json", result)
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "ready" else 1


def run_search_query(config_path: str, query: str, top_k: int) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "search_index.sqlite"

    result = search_index(db_path, query, top_k=top_k)
    safe_name = "".join(char if char.isalnum() else "_" for char in query).strip("_") or "query"
    output_file = output_dir / f"search_query_{safe_name[:48]}.json"
    _write_json(output_file, result)
    print(
        json.dumps(
            {
                "status": result.get("status", "unknown"),
                "query": query,
                "db_path": str(db_path.resolve()),
                "result_count": len(result.get("results", [])),
                "output_file": str(output_file.resolve()),
            },
            indent=2,
        )
    )
    return 0 if result.get("status") == "ready" else 1


def run_brief_query(config_path: str, query: str, top_k: int, title: str | None) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "search_index.sqlite"

    result = search_index(db_path, query, top_k=top_k)
    safe_name = "".join(char if char.isalnum() else "_" for char in query).strip("_") or "query"
    markdown = build_query_brief_markdown(result, title=title)
    json_file = output_dir / f"brief_query_{safe_name[:48]}.json"
    md_file = output_dir / f"brief_query_{safe_name[:48]}.md"
    _write_json(json_file, result)
    _write_text(md_file, markdown)
    print(
        json.dumps(
            {
                "status": result.get("status", "unknown"),
                "query": query,
                "result_count": len(result.get("results", [])),
                "markdown_file": str(md_file.resolve()),
                "json_file": str(json_file.resolve()),
            },
            indent=2,
        )
    )
    return 0 if result.get("status") == "ready" else 1


def run_erp_sync(config_path: str, watch_patterns: list[str]) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    local_result = sync_erp_files(
        root=config.drive.local_root_path,
        output_dir=output_dir,
        config=config.erp,
        watch_patterns_override=watch_patterns or None,
    )

    drive_result: dict[str, Any] = {
        "status": "skipped",
        "reason": "include_drive_activity_disabled",
    }
    drive_index_status: dict[str, Any] = {
        "status": "skipped",
        "reason": "include_drive_activity_disabled",
    }

    if config.erp.include_drive_activity:
        drive_probe = GoogleDriveProbe(
            service_account_json=config.drive.service_account_path,
            folder_id=config.drive.google_drive_folder_id,
        )
        drive_index_status = drive_probe.list_folder_file_index(max_items=config.erp.drive_max_items)
        _write_json(output_dir / "erp_drive_file_index_status.json", drive_index_status)

        if drive_index_status.get("status") == "ready":
            drive_result = sync_erp_drive_activity(
                output_dir=output_dir,
                config=config.erp,
                drive_file_index=drive_index_status,
            )
        else:
            drive_result = {
                "status": "error",
                "message": drive_index_status.get("message", "Drive file index failed."),
            }
        _write_json(output_dir / "erp_drive_sync_status.json", drive_result)

    local_ready = local_result.get("status") == "ready"
    drive_ready = drive_result.get("status") == "ready"
    drive_required = bool(config.erp.include_drive_activity and config.erp.drive_activity_required)

    if local_ready and (drive_ready or not drive_required):
        status = "ready" if (drive_ready or not config.erp.include_drive_activity) else "ready_with_warnings"
    else:
        status = "error"

    summary = {
        "status": status,
        "local": {
            "status": local_result.get("status", "unknown"),
            "total_changes": local_result.get("total_changes", 0),
            "watchlist_change_count": local_result.get("watchlist_change_count", 0),
            "snapshot_file": local_result.get("snapshot_file", ""),
            "change_file": local_result.get("change_file", ""),
            "change_markdown_file": local_result.get("change_markdown_file", ""),
        },
        "drive": {
            "enabled": config.erp.include_drive_activity,
            "required": drive_required,
            "status": drive_result.get("status", "unknown"),
            "message": drive_result.get("message", ""),
            "total_changes": drive_result.get("total_changes", 0),
            "watchlist_change_count": drive_result.get("watchlist_change_count", 0),
            "snapshot_file": drive_result.get("snapshot_file", ""),
            "change_file": drive_result.get("change_file", ""),
            "change_markdown_file": drive_result.get("change_markdown_file", ""),
            "index_truncated": drive_index_status.get("truncated", False),
            "indexed_files": drive_index_status.get("file_count", 0),
        },
    }
    _write_json(output_dir / "erp_sync_status.json", summary)

    print(
        json.dumps(summary, indent=2)
    )
    return 0 if status in {"ready", "ready_with_warnings"} else 1


def _load_focus_terms(config: PilotConfig, explicit_terms: list[str], focus_file: str | None) -> list[str]:
    terms: list[str] = []
    for term in explicit_terms:
        cleaned = term.strip()
        if cleaned:
            terms.append(cleaned)

    for term in config.erp.focus_terms:
        cleaned = str(term).strip()
        if cleaned and cleaned not in terms:
            terms.append(cleaned)

    focus_path = Path(focus_file).expanduser() if focus_file else config.output.inventory_path / config.erp.focus_file
    if focus_path.exists():
        for line in focus_path.read_text(encoding="utf-8").splitlines():
            cleaned = line.strip()
            if not cleaned or cleaned.startswith("#"):
                continue
            if cleaned not in terms:
                terms.append(cleaned)

    return terms


def run_erp_focus(config_path: str, focus_terms: list[str], focus_file: str | None) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    resolved_terms = _load_focus_terms(config, focus_terms, focus_file)
    payload = build_erp_focus_report(
        output_dir=output_dir,
        config=config.erp,
        focus_terms=resolved_terms,
    )

    if payload.get("status") == "ready":
        outputs = write_erp_focus_outputs(payload, output_dir, config.erp)
        print(
            json.dumps(
                {
                    "status": "ready",
                    "focus_term_count": payload.get("focus_term_count", 0),
                    "missing_focus_count": payload.get("missing_focus_count", 0),
                    "recent_change_focus_count": payload.get("recent_change_focus_count", 0),
                    "json_file": outputs["json_file"],
                    "markdown_file": outputs["markdown_file"],
                },
                indent=2,
            )
        )
        return 0

    print(json.dumps(payload, indent=2))
    return 0 if payload.get("status") == "missing_focus_terms" else 1


def run_coverage_report(config_path: str) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = build_data_coverage_report(config)
    outputs = write_data_coverage_outputs(payload, output_dir)
    print(
        json.dumps(
            {
                "status": payload.get("status", "unknown"),
                "readiness_score": payload.get("readiness_score", 0),
                "dimension_count": len(payload.get("dimensions", [])),
                "action_count": len(payload.get("actions", [])),
                "json_file": outputs["json_file"],
                "markdown_file": outputs["markdown_file"],
            },
            indent=2,
        )
    )
    return 0 if payload.get("status") in {"ready", "warning"} else 1


def run_execution_review(
    config_path: str,
    autopilot_status_override: dict[str, Any] | None = None,
) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = build_execution_review(config, autopilot_status_override=autopilot_status_override)
    outputs = write_execution_review_outputs(payload, output_dir)
    project_status = {
        item.get("id", ""): item.get("status", "unknown")
        for item in payload.get("projects", [])
    }
    print(
        json.dumps(
            {
                "status": payload.get("status", "unknown"),
                "project_status": project_status,
                "priority_count": len(payload.get("top_priorities", [])),
                "json_file": outputs["json_file"],
                "markdown_file": outputs["markdown_file"],
                "today_markdown_file": outputs["today_markdown_file"],
            },
            indent=2,
        )
    )
    return 0 if payload.get("status") in {"ready", "warning"} else 1


def run_input_center_setup(config_path: str, folder_id: str | None = None) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    if not config.input_center.enabled:
        result = {
            "status": "disabled",
            "message": "Input center is disabled in config.",
        }
        _write_json(output_dir / "input_center_setup_status.json", result)
        print(json.dumps(result, indent=2))
        return 0

    templates = [template_payload(template) for template in resolve_input_templates(config.input_center)]
    target_folder_id = (
        folder_id
        or config.input_center.drive_folder_id
        or config.platform.publish.drive_folder_id
        or config.drive.google_drive_folder_id
    )

    drive = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=target_folder_id,
    )
    result = drive.setup_input_center_templates(
        workspace_folder_name=config.input_center.workspace_folder_name,
        templates=templates,
        sheet_name=config.input_center.sheet_name,
    )

    registry_path = output_dir / config.input_center.registry_file
    if result.get("status") == "ready":
        registry_payload = {
            "generated_at": result.get("generated_at", ""),
            "status": "ready",
            "sheet_name": result.get("sheet_name", config.input_center.sheet_name),
            "drive_folder_id": target_folder_id,
            "workspace_folder": result.get("target_folder", {}),
            "templates": result.get("templates", []),
        }
        _write_json(registry_path, registry_payload)
    else:
        _write_json(
            registry_path,
            {
                "generated_at": datetime.now().astimezone().isoformat(),
                "status": "error",
                "drive_folder_id": target_folder_id,
                "templates": templates,
                "last_error": result,
            },
        )

    _write_json(output_dir / "input_center_setup_status.json", result)
    print(
        json.dumps(
            {
                "status": result.get("status", "unknown"),
                "template_count": len(result.get("templates", [])),
                "registry_file": str(registry_path.resolve()),
                "workspace_folder": result.get("target_folder", {}).get("name", ""),
                "workspace_link": result.get("target_folder", {}).get("webViewLink", ""),
            },
            indent=2,
        )
    )
    return 0 if result.get("status") == "ready" else 1


def run_input_center_sync(config_path: str, max_rows: int = 0) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    if not config.input_center.enabled:
        result = {
            "status": "disabled",
            "message": "Input center is disabled in config.",
        }
        _write_json(output_dir / "input_center_sync_status.json", result)
        print(json.dumps(result, indent=2))
        return 0

    registry_path = output_dir / config.input_center.registry_file
    if not registry_path.exists():
        result = {
            "status": "missing_registry",
            "message": "Run input-center-setup first.",
            "registry_file": str(registry_path.resolve()),
        }
        _write_json(output_dir / "input_center_sync_status.json", result)
        print(json.dumps(result, indent=2))
        return 1

    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    templates = registry.get("templates", [])
    if not templates:
        result = {
            "status": "missing_templates",
            "message": "Input center registry has no templates. Re-run input-center-setup.",
            "registry_file": str(registry_path.resolve()),
        }
        _write_json(output_dir / "input_center_sync_status.json", result)
        print(json.dumps(result, indent=2))
        return 1

    row_limit = max_rows if max_rows > 0 else config.input_center.max_rows_per_sheet
    target_folder_id = (
        registry.get("drive_folder_id", "")
        or config.input_center.drive_folder_id
        or config.platform.publish.drive_folder_id
        or config.drive.google_drive_folder_id
    )

    drive = GoogleDriveProbe(
        service_account_json=config.drive.service_account_path,
        folder_id=target_folder_id,
    )
    sync_result = drive.read_input_center_templates(
        templates=templates,
        default_sheet_name=config.input_center.sheet_name,
        max_rows_per_sheet=row_limit,
    )

    snapshot = build_input_center_snapshot(sync_result)
    outputs = write_input_center_outputs(snapshot, output_dir, config.input_center)
    status_payload = {
        "sync": sync_result,
        "snapshot": snapshot,
        "outputs": outputs,
    }
    _write_json(output_dir / "input_center_sync_status.json", status_payload)

    print(
        json.dumps(
            {
                "status": sync_result.get("status", "unknown"),
                "template_count": snapshot.get("total_templates", 0),
                "total_rows": snapshot.get("total_rows", 0),
                "open_item_count": snapshot.get("open_item_count", 0),
                "snapshot_file": outputs.get("snapshot_file", ""),
                "summary_file": outputs.get("summary_file", ""),
            },
            indent=2,
        )
    )
    return 0 if sync_result.get("status") in {"ready", "ready_with_errors"} else 1


def run_platform_digest(config_path: str, email_max_results: int) -> int:
    config = PilotConfig.from_path(config_path)
    payload = build_platform_digest(config, email_max_results=email_max_results)
    outputs = _write_platform_outputs(config, payload)
    print(
        json.dumps(
            {
                "status": "ready",
                "dashboard_title": payload.get("dashboard_title", ""),
                "markdown_file": outputs["markdown_file"],
                "html_file": outputs["html_file"],
                "json_file": outputs["json_file"],
                "site_index_file": outputs["site_index_file"],
                "email_profiles": sorted(payload.get("email_profiles", {}).keys()),
                "external_sources": sorted(payload.get("external", {}).get("sources", {}).keys()),
            },
            indent=2,
        )
    )
    return 0


def run_platform_publish(
    config_path: str,
    email_max_results: int,
    skip_drive: bool,
    folder_id: str | None = None,
) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = build_platform_digest(config, email_max_results=email_max_results)
    outputs = _write_platform_outputs(config, payload)

    if skip_drive:
        publish_result = {
            "status": "skipped",
            "message": "Drive publish skipped by CLI flag.",
        }
    elif not config.platform.publish.publish_to_drive:
        publish_result = {
            "status": "skipped",
            "message": "Drive publish disabled in config.",
        }
    else:
        publish_folder_id = (
            folder_id
            or config.platform.publish.drive_folder_id
            or config.drive.google_drive_folder_id
        )
        drive = GoogleDriveProbe(
            service_account_json=config.drive.service_account_path,
            folder_id=publish_folder_id,
        )
        publish_result = drive.publish_dashboard_bundle(
            workspace_folder_name=config.platform.publish.workspace_folder_name,
            dashboard_title=payload.get("dashboard_title", "Swan Intelligence Hub"),
            html_content=outputs["html_content"],
            markdown_content=outputs["markdown_content"],
            json_content=outputs["json_content"],
            create_google_doc=config.platform.publish.create_google_doc,
        )

    _write_json(output_dir / "platform_publish.json", publish_result)
    print(
        json.dumps(
            {
                "status": publish_result.get("status", "unknown"),
                "dashboard_title": payload.get("dashboard_title", ""),
                "site_index_file": outputs["site_index_file"],
                "drive_publish_file": str((output_dir / "platform_publish.json").resolve()),
                "workspace_folder": publish_result.get("target_folder", {}).get("name", ""),
                "workspace_link": publish_result.get("target_folder", {}).get("webViewLink", ""),
                "google_doc_link": (publish_result.get("google_doc") or {}).get("webViewLink", ""),
            },
            indent=2,
        )
    )
    return 0 if publish_result.get("status") in {"ready", "skipped", "storage_quota_blocked"} else 1


def run_pilot_solution(config_path: str, email_max_results: int) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = build_platform_digest(config, email_max_results=email_max_results)
    solution = build_pilot_solution(payload)
    outputs = write_pilot_solution(solution, output_dir)
    print(
        json.dumps(
            {
                "status": "ready",
                "email_signal_count": solution.get("email_signal_count", 0),
                "drive_signal_count": solution.get("drive_signal_count", 0),
                "priority_action_count": len(solution.get("priority_actions", [])),
                "json_file": outputs["json_file"],
                "markdown_file": outputs["markdown_file"],
            },
            indent=2,
        )
    )
    return 0


def run_manus_catalog(config_path: str, zip_paths: list[str]) -> int:
    config = PilotConfig.from_path(config_path)
    root = Path(config_path).expanduser().resolve().parent
    catalog_dir = root / "Super Mega Inc" / "manus_catalog"
    paths = [Path(path).expanduser() for path in zip_paths]
    payload = build_manus_catalog(paths)
    output = write_manus_catalog(payload, catalog_dir)
    print(
        json.dumps(
            {
                "status": "ready",
                "entries": len(payload.get("entries", [])),
                "errors": payload.get("error_count", 0),
                "json_file": output["json_file"],
                "markdown_file": output["markdown_file"],
            },
            indent=2,
        )
    )
    return 0


def run_dqms_sync(config_path: str, max_email_results: int, search_top_k: int) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    quality_profile_query = config.gmail.profiles.get(config.dqms.quality_profile_name)
    if not quality_profile_query:
        print(
            json.dumps(
                {
                    "status": "missing_profile",
                    "message": f"Missing quality profile in config: {config.dqms.quality_profile_name}",
                    "available_profiles": sorted(config.gmail.profiles.keys()),
                },
                indent=2,
            )
        )
        return 1

    gmail = GmailProbe(
        client_secret_json=config.gmail.client_secret_path,
        token_json=config.gmail.token_path,
    )
    quality_mail_result = gmail.search_messages(
        query=quality_profile_query,
        max_results=max_email_results,
    )
    mail_status = quality_mail_result.get("status")
    quality_messages: list[dict] = []
    mail_warning = ""
    if mail_status == "ready":
        quality_messages = quality_mail_result.get("messages", [])
    elif GmailProbe.is_non_fatal_mail_gap(quality_mail_result):
        mail_warning = quality_mail_result.get("message", "Gmail quality feed unavailable.")
    else:
        print(json.dumps(quality_mail_result, indent=2))
        return 1

    search_db = output_dir / "search_index.sqlite"
    quality_file_result = search_index(
        search_db,
        config.dqms.quality_search_query,
        top_k=search_top_k,
    )
    quality_files = quality_file_result.get("results", [])
    if quality_file_result.get("status") != "ready":
        print(json.dumps(quality_file_result, indent=2))
        return 1

    payload = build_dqms_registers(
        config.dqms,
        quality_messages=quality_messages,
        quality_files=quality_files,
    )
    outputs = write_dqms_outputs(payload, output_dir, config.dqms)
    _write_json(
        output_dir / "dqms_sync_status.json",
        {
            "mail_status": mail_status,
            "mail_warning": mail_warning,
            "mail_query": quality_profile_query,
            "mail_messages": len(quality_messages),
            "file_query": config.dqms.quality_search_query,
            "file_hits": len(quality_files),
            "generated_at": payload.get("generated_at", ""),
            "incident_count": payload.get("incident_count", 0),
            "capa_count": payload.get("capa_count", 0),
            "supplier_count": payload.get("supplier_count", 0),
            "outputs": outputs,
        },
    )
    print(
        json.dumps(
            {
                "status": "ready_with_email_gap" if mail_warning else "ready",
                "mail_status": mail_status,
                "mail_warning": mail_warning,
                "incident_count": payload.get("incident_count", 0),
                "capa_count": payload.get("capa_count", 0),
                "supplier_count": payload.get("supplier_count", 0),
                "incident_file": outputs["incident_file"],
                "capa_file": outputs["capa_file"],
                "supplier_file": outputs["supplier_file"],
                "summary_file": outputs["summary_file"],
            },
            indent=2,
        )
    )
    return 0


def run_dqms_report(config_path: str) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    incidents_path = output_dir / config.dqms.incident_file
    capa_path = output_dir / config.dqms.capa_file
    supplier_path = output_dir / config.dqms.supplier_file

    missing = [str(path) for path in (incidents_path, capa_path, supplier_path) if not path.exists()]
    if missing:
        print(
            json.dumps(
                {
                    "status": "missing_inputs",
                    "message": "Run dqms-sync first.",
                    "missing_files": missing,
                },
                indent=2,
            )
        )
        return 1

    incidents = json.loads(incidents_path.read_text(encoding="utf-8"))
    capa_actions = json.loads(capa_path.read_text(encoding="utf-8"))
    supplier_rollup = json.loads(supplier_path.read_text(encoding="utf-8"))
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "incident_count": len(incidents),
        "capa_count": len(capa_actions),
        "supplier_count": len(supplier_rollup),
        "incidents": incidents,
        "capa_actions": capa_actions,
        "supplier_nonconformance": supplier_rollup,
    }
    markdown = render_dqms_weekly_summary(payload)
    report_file = output_dir / config.dqms.weekly_summary_file
    _write_text(report_file, markdown)
    print(
        json.dumps(
            {
                "status": "ready",
                "report_file": str(report_file.resolve()),
                "incident_count": len(incidents),
                "capa_count": len(capa_actions),
                "supplier_count": len(supplier_rollup),
            },
            indent=2,
        )
    )
    return 0


def run_autopilot(
    config_path: str,
    *,
    rebuild_search_index: bool,
    skip_search_index: bool,
    index_char_limit: int,
    index_top_levels: list[str],
    skip_erp: bool,
    dqms_max_email_results: int,
    dqms_search_top_k: int,
    publish_email_max_results: int,
    skip_dqms: bool,
    skip_input_center: bool,
    skip_platform_publish: bool,
    skip_drive: bool,
    publish_folder_id: str | None,
    run_manus_catalog_step: bool,
    manus_zip_paths: list[str],
    run_domain_check: bool,
) -> int:
    config = PilotConfig.from_path(config_path)
    output_dir = config.output.inventory_path
    output_dir.mkdir(parents=True, exist_ok=True)

    search_db = output_dir / "search_index.sqlite"
    default_manus_paths = [
        "C:/Users/swann/Downloads/supermega_manus-20260304T080146Z-1-001.zip",
        "C:/Users/swann/Downloads/keystore-20260309T135435Z-1-001.zip",
    ]
    selected_manus_paths = manus_zip_paths or default_manus_paths

    steps: list[dict[str, object]] = []
    started_at = datetime.now().astimezone()

    def execute_step(
        name: str,
        required: bool,
        call: Callable[[], int],
    ) -> int:
        step_start = datetime.now().astimezone().isoformat()
        tick = perf_counter()
        code = call()
        elapsed = round(perf_counter() - tick, 3)
        step_end = datetime.now().astimezone().isoformat()
        steps.append(
            {
                "name": name,
                "required": required,
                "status": "ready" if code == 0 else "error",
                "exit_code": code,
                "started_at": step_start,
                "ended_at": step_end,
                "duration_seconds": elapsed,
            }
        )
        return code

    if not skip_search_index:
        should_index = rebuild_search_index or not search_db.exists()
        if should_index:
            execute_step(
                "search-index",
                True,
                lambda: run_search_index(
                    config_path,
                    char_limit=index_char_limit,
                    top_levels=index_top_levels,
                ),
            )
        else:
            steps.append(
                {
                    "name": "search-index",
                    "required": True,
                    "status": "skipped",
                    "exit_code": 0,
                    "reason": "existing_search_index_reused",
                }
            )
    else:
        steps.append(
            {
                "name": "search-index",
                "required": True,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_search_index_flag",
            }
        )

    if skip_erp:
        steps.append(
            {
                "name": "erp-sync",
                "required": True,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_erp_flag",
            }
        )
        steps.append(
            {
                "name": "erp-focus",
                "required": False,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_erp_flag",
            }
        )
    else:
        execute_step(
            "erp-sync",
            True,
            lambda: run_erp_sync(config_path, watch_patterns=[]),
        )
        execute_step(
            "erp-focus",
            False,
            lambda: run_erp_focus(config_path, focus_terms=[], focus_file=None),
        )

    if skip_dqms:
        steps.append(
            {
                "name": "dqms-sync",
                "required": True,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_dqms_flag",
            }
        )
        steps.append(
            {
                "name": "dqms-report",
                "required": True,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_dqms_flag",
            }
        )
    else:
        execute_step(
            "dqms-sync",
            True,
            lambda: run_dqms_sync(
                config_path,
                max_email_results=dqms_max_email_results,
                search_top_k=dqms_search_top_k,
            ),
        )
        execute_step("dqms-report", True, lambda: run_dqms_report(config_path))


    if skip_input_center:
        steps.append(
            {
                "name": "input-center-setup",
                "required": False,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_input_center_flag",
            }
        )
        steps.append(
            {
                "name": "input-center-sync",
                "required": False,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_input_center_flag",
            }
        )
    else:
        execute_step(
            "input-center-setup",
            False,
            lambda: run_input_center_setup(config_path, folder_id=publish_folder_id),
        )
        execute_step(
            "input-center-sync",
            False,
            lambda: run_input_center_sync(config_path, max_rows=0),
        )

    execute_step(
        "pilot-solution",
        True,
        lambda: run_pilot_solution(
            config_path,
            email_max_results=publish_email_max_results,
        ),
    )
    execute_step(
        "coverage-report",
        False,
        lambda: run_coverage_report(config_path),
    )

    if run_manus_catalog_step:
        execute_step(
            "manus-catalog",
            False,
            lambda: run_manus_catalog(config_path, selected_manus_paths),
        )
    else:
        steps.append(
            {
                "name": "manus-catalog",
                "required": False,
                "status": "skipped",
                "exit_code": 0,
                "reason": "disabled_by_default",
            }
        )

    if run_domain_check:
        domain_script = Path(config_path).expanduser().resolve().parent / "tools" / "check_supermega_domain.py"
        domain_report = output_dir / "domain_health_autopilot.json"
        if domain_script.exists():
            execute_step(
                "domain-health",
                False,
                lambda: subprocess.call(
                    [
                        sys.executable,
                        str(domain_script),
                        "--json-out",
                        str(domain_report),
                    ]
                ),
            )
        else:
            steps.append(
                {
                    "name": "domain-health",
                    "required": False,
                    "status": "skipped",
                    "exit_code": 0,
                    "reason": "domain_check_script_missing",
                }
            )

    if skip_platform_publish:
        steps.append(
            {
                "name": "platform-publish",
                "required": True,
                "status": "skipped",
                "exit_code": 0,
                "reason": "skip_platform_publish_flag",
            }
        )
    else:
        execute_step(
            "platform-publish",
            True,
            lambda: run_platform_publish(
                config_path,
                email_max_results=publish_email_max_results,
                skip_drive=skip_drive,
                folder_id=publish_folder_id,
            ),
        )

    preview_required_failures = [step for step in steps if step.get("required") and step.get("status") == "error"]
    preview_optional_failures = [step for step in steps if not step.get("required") and step.get("status") == "error"]
    preview_overall_status = "ready" if not preview_required_failures else "error"

    review_step_started = datetime.now().astimezone().isoformat()
    review_tick = perf_counter()
    review_code = run_execution_review(
        config_path,
        autopilot_status_override={
            "status": preview_overall_status,
            "required_failure_count": len(preview_required_failures),
            "optional_failure_count": len(preview_optional_failures),
        },
    )
    review_elapsed = round(perf_counter() - review_tick, 3)
    review_step_finished = datetime.now().astimezone().isoformat()
    steps.append(
        {
            "name": "execution-review",
            "required": False,
            "status": "ready" if review_code == 0 else "error",
            "exit_code": review_code,
            "started_at": review_step_started,
            "ended_at": review_step_finished,
            "duration_seconds": review_elapsed,
        }
    )

    required_failures = [step for step in steps if step.get("required") and step.get("status") == "error"]
    optional_failures = [step for step in steps if not step.get("required") and step.get("status") == "error"]
    overall_status = "ready" if not required_failures else "error"
    finished_at = datetime.now().astimezone()
    duration_seconds = round((finished_at - started_at).total_seconds(), 3)

    summary = {
        "status": overall_status,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": duration_seconds,
        "required_failure_count": len(required_failures),
        "optional_failure_count": len(optional_failures),
        "steps": steps,
    }

    json_file = output_dir / "autopilot_status.json"
    md_file = output_dir / "autopilot_status.md"
    _write_json(json_file, summary)
    markdown_lines = [
        "# SuperMega Autopilot Status",
        "",
        f"- Status: `{overall_status}`",
        f"- Started: `{summary['started_at']}`",
        f"- Finished: `{summary['finished_at']}`",
        f"- Duration seconds: `{duration_seconds}`",
        f"- Required failures: `{len(required_failures)}`",
        f"- Optional failures: `{len(optional_failures)}`",
        "",
        "## Steps",
        "",
    ]
    for step in steps:
        markdown_lines.append(
            f"- `{step.get('name', '')}` | status=`{step.get('status', '')}` | required=`{step.get('required', False)}` | exit_code=`{step.get('exit_code', '')}`"
        )
    markdown_lines.append("")
    _write_text(md_file, "\n".join(markdown_lines))

    print(
        json.dumps(
            {
                "status": overall_status,
                "required_failure_count": len(required_failures),
                "optional_failure_count": len(optional_failures),
                "autopilot_json": str(json_file.resolve()),
                "autopilot_markdown": str(md_file.resolve()),
            },
            indent=2,
        )
    )
    return 0 if overall_status == "ready" else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Mark 1 personal pilot CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inventory_parser = subparsers.add_parser(
        "inventory",
        help="Scan local Yangon Tyre data and write pilot review outputs.",
    )
    inventory_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    config_profiles_parser = subparsers.add_parser(
        "config-profiles",
        help="List available profile overlays defined in the config file.",
    )
    config_profiles_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    config_profile_create_parser = subparsers.add_parser(
        "config-profile-create",
        help="Create a new profile overlay in config JSON, optionally cloned from an existing profile.",
    )
    config_profile_create_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    config_profile_create_parser.add_argument(
        "--profile",
        required=True,
        help="Name of the new profile to create.",
    )
    config_profile_create_parser.add_argument(
        "--from-profile",
        default="",
        help="Optional existing profile name to clone as the starting template.",
    )
    config_profile_create_parser.add_argument(
        "--set-default",
        action="store_true",
        help="Set the created profile as default_profile in config.",
    )
    config_profile_create_parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace the target profile if it already exists.",
    )

    drive_map_parser = subparsers.add_parser(
        "drive-map",
        help="Snapshot the shared Yangon Tyre Google Drive folder tree.",
    )
    drive_map_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    drive_map_parser.add_argument(
        "--max-depth",
        type=int,
        default=2,
        help="Maximum folder depth to traverse.",
    )
    drive_map_parser.add_argument(
        "--folder-id",
        default=None,
        help="Optional Google Drive folder or shared drive ID override.",
    )

    drive_shared_list_parser = subparsers.add_parser(
        "drive-shared-list",
        help="List shared drives visible to the configured service account.",
    )
    drive_shared_list_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    manus_catalog_parser = subparsers.add_parser(
        "manus-catalog",
        help="Build a full asset catalog from Manus ZIP archives with import/reference/quarantine classification.",
    )
    manus_catalog_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    manus_catalog_parser.add_argument(
        "--zip-path",
        action="append",
        default=[],
        help="Absolute path to a Manus ZIP archive. You can pass this multiple times.",
    )

    gmail_auth_parser = subparsers.add_parser(
        "gmail-auth",
        help="Bootstrap a Gmail OAuth token using the configured OAuth client.",
    )
    gmail_auth_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    gmail_auth_parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not attempt to open a browser automatically.",
    )
    gmail_auth_parser.add_argument(
        "--host",
        default=DEFAULT_GMAIL_AUTH_HOST,
        help="Loopback host for the local Gmail OAuth callback server.",
    )
    gmail_auth_parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_GMAIL_AUTH_PORT,
        help="Loopback port for the local Gmail OAuth callback server.",
    )

    gmail_check_parser = subparsers.add_parser(
        "gmail-check",
        help="Validate Gmail OAuth client/token setup and write a diagnostics file.",
    )
    gmail_check_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    gmail_check_parser.add_argument(
        "--host",
        default=DEFAULT_GMAIL_AUTH_HOST,
        help="Loopback host expected in the OAuth client redirect URI.",
    )
    gmail_check_parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_GMAIL_AUTH_PORT,
        help="Loopback port expected in the OAuth client redirect URI.",
    )

    gmail_setup_parser = subparsers.add_parser(
        "gmail-setup",
        help="Write a concrete Gmail OAuth setup guide for the current local client file.",
    )
    gmail_setup_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    gmail_setup_parser.add_argument(
        "--host",
        default=DEFAULT_GMAIL_AUTH_HOST,
        help="Loopback host to use for local Gmail auth.",
    )
    gmail_setup_parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_GMAIL_AUTH_PORT,
        help="Loopback port to use for local Gmail auth.",
    )

    gmail_auth_start_parser = subparsers.add_parser(
        "gmail-auth-start",
        help="Start a manual Gmail OAuth session and write the authorization URL.",
    )
    gmail_auth_start_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    gmail_auth_finish_parser = subparsers.add_parser(
        "gmail-auth-finish",
        help="Finish a manual Gmail OAuth session using the full callback URL.",
    )
    gmail_auth_finish_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    gmail_auth_finish_parser.add_argument(
        "--callback-url",
        required=True,
        help="Full callback URL from the browser address bar after Google sign-in.",
    )

    gmail_preview_parser = subparsers.add_parser(
        "gmail-preview",
        help="Preview a Yangon Tyre-related Gmail query profile.",
    )
    gmail_preview_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    gmail_preview_parser.add_argument(
        "--profile",
        required=True,
        help="Configured Gmail profile name.",
    )
    gmail_preview_parser.add_argument(
        "--max-results",
        type=int,
        default=10,
        help="Maximum number of Gmail messages to fetch.",
    )

    gmail_brief_parser = subparsers.add_parser(
        "gmail-brief",
        help="Generate a director-style brief from a Gmail query profile.",
    )
    gmail_brief_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    gmail_brief_parser.add_argument(
        "--profile",
        required=True,
        help="Configured Gmail profile name.",
    )
    gmail_brief_parser.add_argument(
        "--max-results",
        type=int,
        default=10,
        help="Maximum number of Gmail messages to fetch.",
    )
    gmail_brief_parser.add_argument(
        "--title",
        default=None,
        help="Optional custom brief title.",
    )

    search_index_parser = subparsers.add_parser(
        "search-index",
        help="Build a local full-text index over the Yangon Tyre mirror.",
    )
    search_index_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    search_index_parser.add_argument(
        "--char-limit",
        type=int,
        default=20000,
        help="Maximum extracted characters per file.",
    )
    search_index_parser.add_argument(
        "--top-level",
        action="append",
        default=[],
        help="Restrict indexing to one or more top-level folders or files from the local mirror.",
    )

    search_query_parser = subparsers.add_parser(
        "search-query",
        help="Query the local Yangon Tyre full-text index.",
    )
    search_query_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    search_query_parser.add_argument(
        "--query",
        required=True,
        help="FTS query string.",
    )
    search_query_parser.add_argument(
        "--top-k",
        type=int,
        default=10,
        help="Maximum number of search results.",
    )

    brief_query_parser = subparsers.add_parser(
        "brief-query",
        help="Generate a director-style brief from local search results.",
    )
    brief_query_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    brief_query_parser.add_argument(
        "--query",
        required=True,
        help="FTS query string.",
    )
    brief_query_parser.add_argument(
        "--top-k",
        type=int,
        default=10,
        help="Maximum number of search results.",
    )
    brief_query_parser.add_argument(
        "--title",
        default=None,
        help="Optional custom brief title.",
    )

    erp_sync_parser = subparsers.add_parser(
        "erp-sync",
        help="Build ERP-style local and Drive file snapshots and change registers with watchlist tracking.",
    )
    erp_sync_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    erp_sync_parser.add_argument(
        "--watch-pattern",
        action="append",
        default=[],
        help="Optional watch pattern override (repeatable, fnmatch style).",
    )

    erp_focus_parser = subparsers.add_parser(
        "erp-focus",
        help="Track specific critical files/folders across local + Drive ERP snapshots.",
    )
    erp_focus_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    erp_focus_parser.add_argument(
        "--focus",
        action="append",
        default=[],
        help="Focus term to track. Supports substring or fnmatch wildcard (repeatable).",
    )
    erp_focus_parser.add_argument(
        "--focus-file",
        default=None,
        help="Optional file path with one focus term per line.",
    )

    input_center_setup_parser = subparsers.add_parser(
        "input-center-setup",
        help="Create or update structured Google Sheets templates for team input in the configured Shared Drive.",
    )
    input_center_setup_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    input_center_setup_parser.add_argument(
        "--folder-id",
        default=None,
        help="Optional Google Drive folder or shared drive ID override for input-center setup.",
    )

    input_center_sync_parser = subparsers.add_parser(
        "input-center-sync",
        help="Pull latest rows from input-center sheets and write snapshot outputs.",
    )
    input_center_sync_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    input_center_sync_parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="Maximum rows to fetch per sheet (0 uses config default).",
    )

    platform_digest_parser = subparsers.add_parser(
        "platform-digest",
        help="Build a curated personal dashboard from Gmail, local evidence, and external sources.",
    )
    platform_digest_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    platform_digest_parser.add_argument(
        "--email-max-results",
        type=int,
        default=12,
        help="Maximum number of emails to sample per configured profile.",
    )

    platform_publish_parser = subparsers.add_parser(
        "platform-publish",
        help="Build the latest dashboard, mirror it into the site folder, and publish it to Drive when configured.",
    )
    platform_publish_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    platform_publish_parser.add_argument(
        "--email-max-results",
        type=int,
        default=12,
        help="Maximum number of emails to sample per configured profile.",
    )
    platform_publish_parser.add_argument(
        "--skip-drive",
        action="store_true",
        help="Do not push the latest dashboard bundle to Google Drive.",
    )
    platform_publish_parser.add_argument(
        "--folder-id",
        default=None,
        help="Optional Google Drive folder or shared drive ID override for publish.",
    )

    pilot_solution_parser = subparsers.add_parser(
        "pilot-solution",
        help="Build a personal pilot brief from Gmail + Drive signals with prioritized actions for Swan.",
    )
    pilot_solution_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    pilot_solution_parser.add_argument(
        "--email-max-results",
        type=int,
        default=12,
        help="Maximum number of emails sampled per profile.",
    )

    coverage_parser = subparsers.add_parser(
        "coverage-report",
        help="Generate a data coverage scorecard and collection actions for pilot operations.",
    )
    coverage_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    execution_review_parser = subparsers.add_parser(
        "execution-review",
        help="Generate one concise status review across website, YTF pilot, and SuperMega productization.",
    )
    execution_review_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    dqms_sync_parser = subparsers.add_parser(
        "dqms-sync",
        help="Generate DQMS starter registers from quality emails and local quality evidence.",
    )
    dqms_sync_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    dqms_sync_parser.add_argument(
        "--max-email-results",
        type=int,
        default=25,
        help="Maximum quality-watch emails to scan per run.",
    )
    dqms_sync_parser.add_argument(
        "--search-top-k",
        type=int,
        default=25,
        help="Maximum local quality evidence hits to include.",
    )

    dqms_report_parser = subparsers.add_parser(
        "dqms-report",
        help="Regenerate the DQMS weekly summary markdown from current register files.",
    )
    dqms_report_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )

    autopilot_parser = subparsers.add_parser(
        "autopilot-run",
        help="Run the daily autonomous pipeline: search index, ERP sync, DQMS sync, platform publish, optional Manus refresh, and optional domain check.",
    )
    autopilot_parser.add_argument(
        "--config",
        default="./config.example.json",
        help="Path to pilot config JSON.",
    )
    autopilot_parser.add_argument(
        "--rebuild-search-index",
        action="store_true",
        help="Force rebuilding the local search index even if it already exists.",
    )
    autopilot_parser.add_argument(
        "--skip-search-index",
        action="store_true",
        help="Skip search index build/check in this run.",
    )
    autopilot_parser.add_argument(
        "--index-char-limit",
        type=int,
        default=20000,
        help="Maximum extracted characters per file when rebuilding search index.",
    )
    autopilot_parser.add_argument(
        "--index-top-level",
        action="append",
        default=[],
        help="Restrict search indexing to selected top-level folders or files (repeatable).",
    )
    autopilot_parser.add_argument(
        "--dqms-max-email-results",
        type=int,
        default=25,
        help="Maximum quality-watch emails to scan during DQMS sync.",
    )
    autopilot_parser.add_argument(
        "--dqms-search-top-k",
        type=int,
        default=25,
        help="Maximum local quality evidence hits for DQMS sync.",
    )
    autopilot_parser.add_argument(
        "--publish-email-max-results",
        type=int,
        default=12,
        help="Maximum number of emails sampled per profile for platform publish.",
    )
    autopilot_parser.add_argument(
        "--skip-erp",
        action="store_true",
        help="Skip ERP file-change sync step.",
    )
    autopilot_parser.add_argument(
        "--skip-dqms",
        action="store_true",
        help="Skip DQMS sync/report steps.",
    )
    autopilot_parser.add_argument(
        "--skip-input-center",
        action="store_true",
        help="Skip input-center setup/sync steps.",
    )
    autopilot_parser.add_argument(
        "--skip-platform-publish",
        action="store_true",
        help="Skip platform publish step.",
    )
    autopilot_parser.add_argument(
        "--skip-drive",
        action="store_true",
        help="Do not publish dashboard bundle to Google Drive.",
    )
    autopilot_parser.add_argument(
        "--folder-id",
        default=None,
        help="Optional Google Drive folder/shared drive ID override for platform publish.",
    )
    autopilot_parser.add_argument(
        "--run-manus-catalog",
        action="store_true",
        help="Include Manus catalog rebuild in this autopilot run.",
    )
    autopilot_parser.add_argument(
        "--zip-path",
        action="append",
        default=[],
        help="Optional Manus ZIP path override (repeatable) when --run-manus-catalog is enabled.",
    )
    autopilot_parser.add_argument(
        "--run-domain-check",
        action="store_true",
        help="Run domain DNS/TLS/HTTP checks during autopilot.",
    )

    return parser


def main() -> int:
    if load_dotenv is not None:
        load_dotenv()

    parser = build_parser()
    args = parser.parse_args()

    if args.command == "inventory":
        return run_inventory(args.config)
    if args.command == "config-profiles":
        return run_config_profiles(args.config)
    if args.command == "config-profile-create":
        return run_config_profile_create(
            args.config,
            profile_name=args.profile,
            from_profile=args.from_profile,
            set_default=args.set_default,
            overwrite=args.overwrite,
        )
    if args.command == "drive-map":
        return run_drive_map(args.config, args.max_depth, args.folder_id)
    if args.command == "drive-shared-list":
        return run_drive_shared_list(args.config)
    if args.command == "manus-catalog":
        paths = args.zip_path or [
            "C:/Users/swann/Downloads/supermega_manus-20260304T080146Z-1-001.zip",
            "C:/Users/swann/Downloads/keystore-20260309T135435Z-1-001.zip",
        ]
        return run_manus_catalog(args.config, paths)
    if args.command == "gmail-auth":
        return run_gmail_auth(args.config, args.no_browser, args.host, args.port)
    if args.command == "gmail-check":
        return run_gmail_check(args.config, args.host, args.port)
    if args.command == "gmail-setup":
        return run_gmail_setup(args.config, args.host, args.port)
    if args.command == "gmail-auth-start":
        return run_gmail_auth_start(args.config)
    if args.command == "gmail-auth-finish":
        return run_gmail_auth_finish(args.config, args.callback_url)
    if args.command == "gmail-preview":
        return run_gmail_preview(args.config, args.profile, args.max_results)
    if args.command == "gmail-brief":
        return run_gmail_brief(args.config, args.profile, args.max_results, args.title)
    if args.command == "search-index":
        return run_search_index(args.config, args.char_limit, args.top_level)
    if args.command == "search-query":
        return run_search_query(args.config, args.query, args.top_k)
    if args.command == "brief-query":
        return run_brief_query(args.config, args.query, args.top_k, args.title)
    if args.command == "erp-sync":
        return run_erp_sync(args.config, args.watch_pattern)
    if args.command == "erp-focus":
        return run_erp_focus(args.config, args.focus, args.focus_file)
    if args.command == "input-center-setup":
        return run_input_center_setup(args.config, args.folder_id)
    if args.command == "input-center-sync":
        return run_input_center_sync(args.config, args.max_rows)
    if args.command == "platform-digest":
        return run_platform_digest(args.config, args.email_max_results)
    if args.command == "platform-publish":
        return run_platform_publish(args.config, args.email_max_results, args.skip_drive, args.folder_id)
    if args.command == "pilot-solution":
        return run_pilot_solution(args.config, args.email_max_results)
    if args.command == "coverage-report":
        return run_coverage_report(args.config)
    if args.command == "execution-review":
        return run_execution_review(args.config)
    if args.command == "dqms-sync":
        return run_dqms_sync(args.config, args.max_email_results, args.search_top_k)
    if args.command == "dqms-report":
        return run_dqms_report(args.config)
    if args.command == "autopilot-run":
        return run_autopilot(
            args.config,
            rebuild_search_index=args.rebuild_search_index,
            skip_search_index=args.skip_search_index,
            index_char_limit=args.index_char_limit,
            index_top_levels=args.index_top_level,
            skip_erp=args.skip_erp,
            dqms_max_email_results=args.dqms_max_email_results,
            dqms_search_top_k=args.dqms_search_top_k,
            publish_email_max_results=args.publish_email_max_results,
            skip_dqms=args.skip_dqms,
            skip_input_center=args.skip_input_center,
            skip_platform_publish=args.skip_platform_publish,
            skip_drive=args.skip_drive,
            publish_folder_id=args.folder_id,
            run_manus_catalog_step=args.run_manus_catalog,
            manus_zip_paths=args.zip_path,
            run_domain_check=args.run_domain_check,
        )

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
