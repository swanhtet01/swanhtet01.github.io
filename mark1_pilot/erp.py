from __future__ import annotations

import json
from datetime import UTC, datetime
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

from .config import ERPConfig


DEFAULT_MODULE_KEYWORDS: dict[str, list[str]] = {
    "finance": ["cash", "invoice", "receipt", "bank", "payment", "account", "ledger"],
    "sales": ["sales", "customer", "quotation", "order", "forecast", "price", "radial"],
    "procurement": ["supplier", "purchase", "kiic", "junky", "shipment", "import", "po", "raw"],
    "quality": ["quality", "claim", "defect", "reject", "ncr", "capa", "inspection", "nonconformance"],
    "production": ["production", "factory", "mixing", "curing", "process", "line"],
    "management": ["strategy", "plan", "meeting", "report", "dashboard", "brief"],
}


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat()


def _normalize(path: str) -> str:
    return path.replace("\\", "/")


def _fingerprint(size_bytes: int, modified_epoch: float) -> str:
    modified_ns = int(modified_epoch * 1_000_000_000)
    return f"{size_bytes}:{modified_ns}"


def _module_for_path(path: str, top_level: str, keywords: dict[str, list[str]]) -> str:
    lowered = f"{path} {top_level}".lower()
    for module, module_keywords in keywords.items():
        if any(keyword.lower() in lowered for keyword in module_keywords):
            return module
    return "general"


def _matches_watch(path: str, patterns: list[str]) -> tuple[bool, list[str]]:
    normalized = _normalize(path)
    matched = [pattern for pattern in patterns if fnmatch(normalized.lower(), pattern.lower())]
    return bool(matched), matched


def _build_snapshot(root: Path, config: ERPConfig, watch_patterns: list[str]) -> dict[str, Any]:
    merged_keywords = dict(DEFAULT_MODULE_KEYWORDS)
    for module, module_keywords in (config.module_keywords or {}).items():
        merged_keywords[module] = module_keywords

    files: dict[str, dict[str, Any]] = {}
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        stat = path.stat()
        rel = _normalize(str(path.relative_to(root)))
        top_level = path.relative_to(root).parts[0] if path.relative_to(root).parts else "."
        watch_match, matched_patterns = _matches_watch(rel, watch_patterns)
        files[rel] = {
            "path": rel,
            "name": path.name,
            "top_level": top_level,
            "extension": path.suffix.lower() if path.suffix else "[no_extension]",
            "size_bytes": stat.st_size,
            "modified_at": _iso(stat.st_mtime),
            "fingerprint": _fingerprint(stat.st_size, stat.st_mtime),
            "module": _module_for_path(rel, top_level, merged_keywords),
            "watch_match": watch_match,
            "matched_watch_patterns": matched_patterns,
        }

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "root": str(root),
        "watch_patterns": watch_patterns,
        "file_count": len(files),
        "files": files,
    }


def _load_previous_snapshot(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _recommend_action(module: str, change_type: str, path: str) -> str:
    if module == "quality":
        return "Check quality incident linkage and update CAPA status."
    if module == "procurement":
        return "Confirm supplier status, shipment timeline, and next owner action."
    if module == "finance":
        return "Reconcile with payment/cash control records."
    if module == "sales":
        return "Review sales movement impact and customer follow-up."
    if module == "production":
        return "Validate production impact and schedule dependencies."
    if module == "management":
        return "Review strategic implications and update executive brief."
    if change_type == "removed":
        return "Confirm file removal was intentional and preserve audit evidence."
    return "Review change and assign owner/date in weekly operating review."


def _compare_snapshots(
    current: dict[str, Any],
    previous: dict[str, Any] | None,
    max_recent_changes: int,
) -> dict[str, Any]:
    previous_files = (previous or {}).get("files", {})
    current_files = current.get("files", {})

    added_paths = sorted(path for path in current_files if path not in previous_files)
    removed_paths = sorted(path for path in previous_files if path not in current_files)
    modified_paths = sorted(
        path
        for path in current_files
        if path in previous_files
        and current_files[path].get("fingerprint") != previous_files[path].get("fingerprint")
    )

    changes: list[dict[str, Any]] = []

    for path in added_paths:
        item = current_files[path]
        changes.append(
            {
                "type": "added",
                "path": path,
                "module": item.get("module", "general"),
                "top_level": item.get("top_level", ""),
                "modified_at": item.get("modified_at", ""),
                "size_bytes": item.get("size_bytes", 0),
                "watch_match": item.get("watch_match", False),
                "matched_watch_patterns": item.get("matched_watch_patterns", []),
                "action": _recommend_action(item.get("module", "general"), "added", path),
            }
        )

    for path in modified_paths:
        current_item = current_files[path]
        previous_item = previous_files[path]
        changes.append(
            {
                "type": "modified",
                "path": path,
                "module": current_item.get("module", "general"),
                "top_level": current_item.get("top_level", ""),
                "modified_at": current_item.get("modified_at", ""),
                "previous_modified_at": previous_item.get("modified_at", ""),
                "size_bytes": current_item.get("size_bytes", 0),
                "previous_size_bytes": previous_item.get("size_bytes", 0),
                "size_delta_bytes": current_item.get("size_bytes", 0) - previous_item.get("size_bytes", 0),
                "watch_match": current_item.get("watch_match", False),
                "matched_watch_patterns": current_item.get("matched_watch_patterns", []),
                "action": _recommend_action(current_item.get("module", "general"), "modified", path),
            }
        )

    for path in removed_paths:
        item = previous_files[path]
        changes.append(
            {
                "type": "removed",
                "path": path,
                "module": item.get("module", "general"),
                "top_level": item.get("top_level", ""),
                "modified_at": item.get("modified_at", ""),
                "size_bytes": item.get("size_bytes", 0),
                "watch_match": item.get("watch_match", False),
                "matched_watch_patterns": item.get("matched_watch_patterns", []),
                "action": _recommend_action(item.get("module", "general"), "removed", path),
            }
        )

    changes.sort(
        key=lambda item: (
            item.get("modified_at", ""),
            item.get("type", ""),
            item.get("path", ""),
        ),
        reverse=True,
    )
    recent_changes = changes[:max_recent_changes]

    module_activity: dict[str, int] = {}
    for item in changes:
        module = item.get("module", "general")
        module_activity[module] = module_activity.get(module, 0) + 1

    watchlist_changes = [item for item in changes if item.get("watch_match")]
    watchlist_changes = watchlist_changes[:max_recent_changes]

    recommended_actions = []
    if module_activity.get("quality", 0):
        recommended_actions.append(
            f"Quality files changed ({module_activity['quality']}); verify incident/CAPA linkage."
        )
    if module_activity.get("procurement", 0):
        recommended_actions.append(
            f"Procurement files changed ({module_activity['procurement']}); update supplier follow-up log."
        )
    if module_activity.get("finance", 0):
        recommended_actions.append(
            f"Finance files changed ({module_activity['finance']}); reconcile with payment controls."
        )
    if watchlist_changes:
        recommended_actions.append(
            f"Watchlist has {len(watchlist_changes)} changed files; review critical changes first."
        )
    if not recommended_actions:
        recommended_actions.append("No material file changes detected since previous snapshot.")

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "previous_snapshot_at": (previous or {}).get("generated_at", ""),
        "current_snapshot_at": current.get("generated_at", ""),
        "total_changes": len(changes),
        "added_count": len(added_paths),
        "modified_count": len(modified_paths),
        "removed_count": len(removed_paths),
        "module_activity": dict(sorted(module_activity.items(), key=lambda item: item[0])),
        "watchlist_change_count": len(watchlist_changes),
        "watchlist_changes": watchlist_changes,
        "recent_changes": recent_changes,
        "recommended_actions": recommended_actions,
    }


def _drive_fingerprint(item: dict[str, Any]) -> str:
    modified = str(item.get("modified_time", ""))
    size = str(item.get("size_bytes", ""))
    md5 = str(item.get("md5_checksum", ""))
    path = str(item.get("path", ""))
    return f"{modified}|{size}|{md5}|{path}"


def _build_drive_snapshot(
    *,
    drive_file_index: dict[str, Any],
    config: ERPConfig,
) -> dict[str, Any]:
    merged_keywords = dict(DEFAULT_MODULE_KEYWORDS)
    for module, module_keywords in (config.module_keywords or {}).items():
        merged_keywords[module] = module_keywords

    watch_patterns = config.drive_watch_patterns or config.watch_patterns
    files: dict[str, dict[str, Any]] = {}

    for item in drive_file_index.get("files", []):
        file_id = str(item.get("id", "")).strip()
        if not file_id:
            continue

        path = _normalize(str(item.get("path", "")).strip())
        if not path:
            continue

        top_level = path.split("/", 1)[0] if "/" in path else path
        watch_match, matched_patterns = _matches_watch(path, watch_patterns)

        normalized_item = {
            "id": file_id,
            "path": path,
            "name": item.get("name", ""),
            "top_level": top_level,
            "mime_type": item.get("mime_type", ""),
            "size_bytes": int(item.get("size", 0) or 0),
            "modified_at": item.get("modified_time", ""),
            "md5_checksum": item.get("md5_checksum", ""),
            "web_view_link": item.get("web_view_link", ""),
            "last_modified_by": item.get("last_modified_by", ""),
            "module": _module_for_path(path, top_level, merged_keywords),
            "watch_match": watch_match,
            "matched_watch_patterns": matched_patterns,
        }
        normalized_item["fingerprint"] = _drive_fingerprint(normalized_item)
        files[file_id] = normalized_item

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_generated_at": drive_file_index.get("generated_at", ""),
        "root": drive_file_index.get("root", {}),
        "truncated": bool(drive_file_index.get("truncated", False)),
        "max_items": int(drive_file_index.get("max_items", 0) or 0),
        "watch_patterns": watch_patterns,
        "file_count": len(files),
        "files": files,
    }


def _compare_drive_snapshots(
    current: dict[str, Any],
    previous: dict[str, Any] | None,
    max_recent_changes: int,
) -> dict[str, Any]:
    previous_files = (previous or {}).get("files", {})
    current_files = current.get("files", {})

    added_ids = sorted(file_id for file_id in current_files if file_id not in previous_files)
    removed_ids = sorted(file_id for file_id in previous_files if file_id not in current_files)
    modified_ids = sorted(
        file_id
        for file_id in current_files
        if file_id in previous_files
        and current_files[file_id].get("fingerprint") != previous_files[file_id].get("fingerprint")
    )

    changes: list[dict[str, Any]] = []

    for file_id in added_ids:
        item = current_files[file_id]
        changes.append(
            {
                "type": "added",
                "file_id": file_id,
                "path": item.get("path", ""),
                "module": item.get("module", "general"),
                "top_level": item.get("top_level", ""),
                "modified_at": item.get("modified_at", ""),
                "size_bytes": item.get("size_bytes", 0),
                "mime_type": item.get("mime_type", ""),
                "web_view_link": item.get("web_view_link", ""),
                "watch_match": item.get("watch_match", False),
                "matched_watch_patterns": item.get("matched_watch_patterns", []),
                "action": _recommend_action(item.get("module", "general"), "added", item.get("path", "")),
            }
        )

    for file_id in modified_ids:
        current_item = current_files[file_id]
        previous_item = previous_files[file_id]
        changes.append(
            {
                "type": "modified",
                "file_id": file_id,
                "path": current_item.get("path", ""),
                "previous_path": previous_item.get("path", ""),
                "module": current_item.get("module", "general"),
                "top_level": current_item.get("top_level", ""),
                "modified_at": current_item.get("modified_at", ""),
                "previous_modified_at": previous_item.get("modified_at", ""),
                "size_bytes": current_item.get("size_bytes", 0),
                "previous_size_bytes": previous_item.get("size_bytes", 0),
                "size_delta_bytes": current_item.get("size_bytes", 0) - previous_item.get("size_bytes", 0),
                "mime_type": current_item.get("mime_type", ""),
                "web_view_link": current_item.get("web_view_link", ""),
                "watch_match": current_item.get("watch_match", False),
                "matched_watch_patterns": current_item.get("matched_watch_patterns", []),
                "action": _recommend_action(current_item.get("module", "general"), "modified", current_item.get("path", "")),
            }
        )

    for file_id in removed_ids:
        item = previous_files[file_id]
        changes.append(
            {
                "type": "removed",
                "file_id": file_id,
                "path": item.get("path", ""),
                "module": item.get("module", "general"),
                "top_level": item.get("top_level", ""),
                "modified_at": item.get("modified_at", ""),
                "size_bytes": item.get("size_bytes", 0),
                "mime_type": item.get("mime_type", ""),
                "web_view_link": item.get("web_view_link", ""),
                "watch_match": item.get("watch_match", False),
                "matched_watch_patterns": item.get("matched_watch_patterns", []),
                "action": _recommend_action(item.get("module", "general"), "removed", item.get("path", "")),
            }
        )

    changes.sort(
        key=lambda item: (
            item.get("modified_at", ""),
            item.get("type", ""),
            item.get("path", ""),
        ),
        reverse=True,
    )
    recent_changes = changes[:max_recent_changes]
    watchlist_changes = [item for item in changes if item.get("watch_match")][:max_recent_changes]

    module_activity: dict[str, int] = {}
    for item in changes:
        module = item.get("module", "general")
        module_activity[module] = module_activity.get(module, 0) + 1

    recommended_actions = []
    if watchlist_changes:
        recommended_actions.append(
            f"Drive watchlist has {len(watchlist_changes)} changed files; review and assign owners."
        )
    if module_activity.get("quality", 0):
        recommended_actions.append(
            f"Drive quality files changed ({module_activity['quality']}); link them to incident/CAPA flow."
        )
    if module_activity.get("procurement", 0):
        recommended_actions.append(
            f"Drive procurement files changed ({module_activity['procurement']}); update supplier tracker."
        )
    if current.get("truncated"):
        recommended_actions.append(
            "Drive snapshot reached max_items limit; increase erp.drive_max_items for wider coverage."
        )
    if not recommended_actions:
        recommended_actions.append("No material Google Drive file changes detected since previous snapshot.")

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_generated_at": current.get("source_generated_at", ""),
        "previous_snapshot_at": (previous or {}).get("generated_at", ""),
        "current_snapshot_at": current.get("generated_at", ""),
        "truncated": bool(current.get("truncated", False)),
        "total_changes": len(changes),
        "added_count": len(added_ids),
        "modified_count": len(modified_ids),
        "removed_count": len(removed_ids),
        "module_activity": dict(sorted(module_activity.items(), key=lambda item: item[0])),
        "watchlist_change_count": len(watchlist_changes),
        "watchlist_changes": watchlist_changes,
        "recent_changes": recent_changes,
        "recommended_actions": recommended_actions,
    }


def render_erp_change_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# ERP File Change Register",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Previous snapshot: {payload.get('previous_snapshot_at', '') or 'none'}",
        f"- Current snapshot: {payload.get('current_snapshot_at', '')}",
        f"- Total changes: {payload.get('total_changes', 0)}",
        f"- Added: {payload.get('added_count', 0)} | Modified: {payload.get('modified_count', 0)} | Removed: {payload.get('removed_count', 0)}",
        f"- Watchlist changes: {payload.get('watchlist_change_count', 0)}",
        "",
        "## Module Activity",
        "",
    ]
    for module, count in payload.get("module_activity", {}).items():
        lines.append(f"- `{module}`: {count}")

    lines.extend(["", "## Recommended Actions", ""])
    for action in payload.get("recommended_actions", []):
        lines.append(f"- {action}")

    lines.extend(["", "## Recent Changes", ""])
    for item in payload.get("recent_changes", []):
        lines.append(
            f"- `{item.get('type', '')}` | `{item.get('module', '')}` | `{item.get('path', '')}` | {item.get('action', '')}"
        )

    lines.extend(["", "## Watchlist Changes", ""])
    watch_changes = payload.get("watchlist_changes", [])
    if not watch_changes:
        lines.append("- None")
    for item in watch_changes:
        lines.append(
            f"- `{item.get('type', '')}` | `{item.get('path', '')}` | patterns={', '.join(item.get('matched_watch_patterns', []))}"
        )

    lines.append("")
    return "\n".join(lines)


def render_erp_drive_change_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# ERP Google Drive Change Register",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Source snapshot generated: {payload.get('source_generated_at', '')}",
        f"- Previous snapshot: {payload.get('previous_snapshot_at', '') or 'none'}",
        f"- Current snapshot: {payload.get('current_snapshot_at', '')}",
        f"- Total changes: {payload.get('total_changes', 0)}",
        f"- Added: {payload.get('added_count', 0)} | Modified: {payload.get('modified_count', 0)} | Removed: {payload.get('removed_count', 0)}",
        f"- Watchlist changes: {payload.get('watchlist_change_count', 0)}",
        f"- Truncated by max limit: {payload.get('truncated', False)}",
        "",
        "## Module Activity",
        "",
    ]
    for module, count in payload.get("module_activity", {}).items():
        lines.append(f"- `{module}`: {count}")

    lines.extend(["", "## Recommended Actions", ""])
    for action in payload.get("recommended_actions", []):
        lines.append(f"- {action}")

    lines.extend(["", "## Recent Drive Changes", ""])
    for item in payload.get("recent_changes", []):
        lines.append(
            f"- `{item.get('type', '')}` | `{item.get('module', '')}` | `{item.get('path', '')}` | {item.get('action', '')}"
        )

    lines.extend(["", "## Drive Watchlist Changes", ""])
    watch_changes = payload.get("watchlist_changes", [])
    if not watch_changes:
        lines.append("- None")
    for item in watch_changes:
        lines.append(
            f"- `{item.get('type', '')}` | `{item.get('path', '')}` | patterns={', '.join(item.get('matched_watch_patterns', []))}"
        )

    lines.append("")
    return "\n".join(lines)


def sync_erp_files(
    *,
    root: Path,
    output_dir: Path,
    config: ERPConfig,
    watch_patterns_override: list[str] | None = None,
) -> dict[str, Any]:
    root = root.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    watch_patterns = watch_patterns_override or config.watch_patterns
    snapshot_path = output_dir / config.snapshot_file
    change_path = output_dir / config.change_file
    markdown_path = output_dir / config.change_markdown_file

    previous_snapshot = _load_previous_snapshot(snapshot_path)
    current_snapshot = _build_snapshot(root, config, watch_patterns)
    change_payload = _compare_snapshots(current_snapshot, previous_snapshot, config.max_recent_changes)

    snapshot_path.write_text(json.dumps(current_snapshot, indent=2), encoding="utf-8")
    change_path.write_text(json.dumps(change_payload, indent=2), encoding="utf-8")
    markdown_path.write_text(render_erp_change_markdown(change_payload), encoding="utf-8")

    return {
        "status": "ready",
        "snapshot_file": str(snapshot_path.resolve()),
        "change_file": str(change_path.resolve()),
        "change_markdown_file": str(markdown_path.resolve()),
        "total_changes": change_payload.get("total_changes", 0),
        "watchlist_change_count": change_payload.get("watchlist_change_count", 0),
        "module_activity": change_payload.get("module_activity", {}),
    }


def sync_erp_drive_activity(
    *,
    output_dir: Path,
    config: ERPConfig,
    drive_file_index: dict[str, Any],
) -> dict[str, Any]:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if drive_file_index.get("status") != "ready":
        return {
            "status": "error",
            "message": drive_file_index.get("message", "Drive file index is not ready."),
        }

    snapshot_path = output_dir / config.drive_snapshot_file
    change_path = output_dir / config.drive_change_file
    markdown_path = output_dir / config.drive_change_markdown_file

    previous_snapshot = _load_previous_snapshot(snapshot_path)
    current_snapshot = _build_drive_snapshot(drive_file_index=drive_file_index, config=config)
    change_payload = _compare_drive_snapshots(current_snapshot, previous_snapshot, config.max_recent_changes)

    snapshot_path.write_text(json.dumps(current_snapshot, indent=2), encoding="utf-8")
    change_path.write_text(json.dumps(change_payload, indent=2), encoding="utf-8")
    markdown_path.write_text(render_erp_drive_change_markdown(change_payload), encoding="utf-8")

    return {
        "status": "ready",
        "snapshot_file": str(snapshot_path.resolve()),
        "change_file": str(change_path.resolve()),
        "change_markdown_file": str(markdown_path.resolve()),
        "total_changes": change_payload.get("total_changes", 0),
        "watchlist_change_count": change_payload.get("watchlist_change_count", 0),
        "module_activity": change_payload.get("module_activity", {}),
        "truncated": change_payload.get("truncated", False),
    }


def load_erp_summary(output_dir: Path, config: ERPConfig) -> dict[str, Any]:
    change_path = output_dir / config.change_file
    drive_change_path = output_dir / config.drive_change_file

    local_payload = json.loads(change_path.read_text(encoding="utf-8")) if change_path.exists() else {}
    drive_payload = json.loads(drive_change_path.read_text(encoding="utf-8")) if drive_change_path.exists() else {}

    local_ready = bool(local_payload)
    drive_ready = bool(drive_payload)
    if not local_ready and not drive_ready:
        return {
            "status": "not_ready",
            "total_changes": 0,
            "watchlist_change_count": 0,
            "module_activity": {},
            "recent_changes": [],
            "recommended_actions": [],
            "local_status": "not_ready",
            "drive_status": "not_ready",
        }

    combined_module_activity: dict[str, int] = {}
    for source_payload in [local_payload, drive_payload]:
        for module, count in source_payload.get("module_activity", {}).items():
            combined_module_activity[module] = combined_module_activity.get(module, 0) + int(count)

    combined_recent_changes: list[dict[str, Any]] = []
    for item in local_payload.get("recent_changes", []):
        merged = dict(item)
        merged["source"] = "local"
        combined_recent_changes.append(merged)
    for item in drive_payload.get("recent_changes", []):
        merged = dict(item)
        merged["source"] = "drive"
        combined_recent_changes.append(merged)

    combined_recent_changes.sort(
        key=lambda item: (
            item.get("modified_at", ""),
            item.get("source", ""),
            item.get("path", ""),
        ),
        reverse=True,
    )

    combined_actions: list[str] = []
    for source_payload in [local_payload, drive_payload]:
        for action in source_payload.get("recommended_actions", []):
            if action not in combined_actions:
                combined_actions.append(action)

    return {
        "status": "ready",
        "generated_at": max(local_payload.get("generated_at", ""), drive_payload.get("generated_at", "")),
        "total_changes": int(local_payload.get("total_changes", 0)) + int(drive_payload.get("total_changes", 0)),
        "added_count": int(local_payload.get("added_count", 0)) + int(drive_payload.get("added_count", 0)),
        "modified_count": int(local_payload.get("modified_count", 0)) + int(drive_payload.get("modified_count", 0)),
        "removed_count": int(local_payload.get("removed_count", 0)) + int(drive_payload.get("removed_count", 0)),
        "watchlist_change_count": int(local_payload.get("watchlist_change_count", 0))
        + int(drive_payload.get("watchlist_change_count", 0)),
        "module_activity": dict(sorted(combined_module_activity.items(), key=lambda item: item[0])),
        "recent_changes": combined_recent_changes[:8],
        "recommended_actions": combined_actions[:6],
        "local_status": "ready" if local_ready else "not_ready",
        "local_total_changes": local_payload.get("total_changes", 0),
        "local_watchlist_change_count": local_payload.get("watchlist_change_count", 0),
        "local_module_activity": local_payload.get("module_activity", {}),
        "drive_status": "ready" if drive_ready else "not_ready",
        "drive_total_changes": drive_payload.get("total_changes", 0),
        "drive_watchlist_change_count": drive_payload.get("watchlist_change_count", 0),
        "drive_module_activity": drive_payload.get("module_activity", {}),
        "drive_truncated": drive_payload.get("truncated", False),
        "drive_recent_changes": drive_payload.get("recent_changes", [])[:8],
    }


def _is_glob_pattern(term: str) -> bool:
    return any(token in term for token in ("*", "?", "[", "]"))


def _match_focus_term(path: str, term: str) -> bool:
    normalized_path = _normalize(path).lower()
    normalized_term = _normalize(term).lower()
    if _is_glob_pattern(normalized_term):
        return fnmatch(normalized_path, normalized_term)
    return normalized_term in normalized_path


def _collect_local_focus_hits(local_files: dict[str, dict[str, Any]], term: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for item in local_files.values():
        path = str(item.get("path", ""))
        if not path or not _match_focus_term(path, term):
            continue
        hits.append(
            {
                "path": path,
                "module": item.get("module", "general"),
                "top_level": item.get("top_level", ""),
                "modified_at": item.get("modified_at", ""),
                "size_bytes": item.get("size_bytes", 0),
                "watch_match": item.get("watch_match", False),
            }
        )
    hits.sort(key=lambda item: (item.get("modified_at", ""), item.get("path", "")), reverse=True)
    return hits


def _collect_drive_focus_hits(drive_files: dict[str, dict[str, Any]], term: str) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    for item in drive_files.values():
        path = str(item.get("path", ""))
        if not path or not _match_focus_term(path, term):
            continue
        hits.append(
            {
                "file_id": item.get("id", ""),
                "path": path,
                "module": item.get("module", "general"),
                "top_level": item.get("top_level", ""),
                "modified_at": item.get("modified_at", ""),
                "size_bytes": item.get("size_bytes", 0),
                "watch_match": item.get("watch_match", False),
                "web_view_link": item.get("web_view_link", ""),
            }
        )
    hits.sort(key=lambda item: (item.get("modified_at", ""), item.get("path", "")), reverse=True)
    return hits


def build_erp_focus_report(
    *,
    output_dir: Path,
    config: ERPConfig,
    focus_terms: list[str],
) -> dict[str, Any]:
    output_dir = output_dir.expanduser().resolve()
    snapshot_path = output_dir / config.snapshot_file
    drive_snapshot_path = output_dir / config.drive_snapshot_file
    change_path = output_dir / config.change_file
    drive_change_path = output_dir / config.drive_change_file

    if not snapshot_path.exists() and not drive_snapshot_path.exists():
        return {
            "status": "not_ready",
            "message": "ERP snapshots are missing. Run erp-sync first.",
            "required_files": [
                str(snapshot_path),
                str(drive_snapshot_path),
            ],
        }

    if not focus_terms:
        return {
            "status": "missing_focus_terms",
            "message": "No focus terms were provided. Add terms in config.erp.focus_terms, the focus file, or --focus flags.",
        }

    local_snapshot = json.loads(snapshot_path.read_text(encoding="utf-8")) if snapshot_path.exists() else {}
    drive_snapshot = json.loads(drive_snapshot_path.read_text(encoding="utf-8")) if drive_snapshot_path.exists() else {}
    local_changes = json.loads(change_path.read_text(encoding="utf-8")) if change_path.exists() else {}
    drive_changes = json.loads(drive_change_path.read_text(encoding="utf-8")) if drive_change_path.exists() else {}

    local_files = local_snapshot.get("files", {})
    drive_files = drive_snapshot.get("files", {})
    local_change_map = {
        str(item.get("path", "")): str(item.get("type", ""))
        for item in local_changes.get("recent_changes", [])
    }
    drive_change_map = {
        str(item.get("path", "")): str(item.get("type", ""))
        for item in drive_changes.get("recent_changes", [])
    }

    focus_entries: list[dict[str, Any]] = []
    for term in focus_terms:
        local_hits = _collect_local_focus_hits(local_files, term)
        drive_hits = _collect_drive_focus_hits(drive_files, term)

        local_recent_types = sorted(
            {
                local_change_map[item.get("path", "")]
                for item in local_hits
                if item.get("path", "") in local_change_map
            }
        )
        drive_recent_types = sorted(
            {
                drive_change_map[item.get("path", "")]
                for item in drive_hits
                if item.get("path", "") in drive_change_map
            }
        )
        local_latest = local_hits[0].get("modified_at", "") if local_hits else ""
        drive_latest = drive_hits[0].get("modified_at", "") if drive_hits else ""

        if local_hits and drive_hits:
            presence = "present_local_and_drive"
        elif local_hits:
            presence = "present_local_only"
        elif drive_hits:
            presence = "present_drive_only"
        else:
            presence = "missing"

        focus_entries.append(
            {
                "focus_term": term,
                "presence": presence,
                "local_match_count": len(local_hits),
                "drive_match_count": len(drive_hits),
                "local_latest_modified_at": local_latest,
                "drive_latest_modified_at": drive_latest,
                "local_recent_change_types": local_recent_types,
                "drive_recent_change_types": drive_recent_types,
                "local_matches": local_hits[:10],
                "drive_matches": drive_hits[:10],
                "action": (
                    "Verify naming and path coverage for this critical file set."
                    if presence == "missing"
                    else "Review the latest matched files and assign owner/date if action is required."
                ),
            }
        )

    missing_terms = [item["focus_term"] for item in focus_entries if item.get("presence") == "missing"]
    recent_change_terms = [
        item["focus_term"]
        for item in focus_entries
        if item.get("local_recent_change_types") or item.get("drive_recent_change_types")
    ]

    actions: list[str] = []
    if missing_terms:
        actions.append(
            f"Missing focus terms ({len(missing_terms)}): {', '.join(missing_terms[:8])}. Tighten naming or update focus terms."
        )
    if recent_change_terms:
        actions.append(
            f"Recent changes detected for {len(recent_change_terms)} focus terms: {', '.join(recent_change_terms[:8])}."
        )
    if not actions:
        actions.append("All focus terms resolved without recent critical changes.")

    return {
        "status": "ready",
        "generated_at": datetime.now(UTC).isoformat(),
        "focus_term_count": len(focus_terms),
        "missing_focus_count": len(missing_terms),
        "recent_change_focus_count": len(recent_change_terms),
        "entries": focus_entries,
        "actions": actions,
    }


def render_erp_focus_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# ERP Focus File Tracker",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Focus terms: {payload.get('focus_term_count', 0)}",
        f"- Missing terms: {payload.get('missing_focus_count', 0)}",
        f"- Terms with recent changes: {payload.get('recent_change_focus_count', 0)}",
        "",
        "## Recommended Actions",
        "",
    ]
    for action in payload.get("actions", []):
        lines.append(f"- {action}")

    lines.extend(["", "## Focus Coverage", ""])
    for entry in payload.get("entries", []):
        lines.append(
            f"- `{entry.get('focus_term', '')}` | `{entry.get('presence', '')}` | local={entry.get('local_match_count', 0)} | drive={entry.get('drive_match_count', 0)}"
        )
        if entry.get("local_recent_change_types"):
            lines.append(f"  local_recent_changes: {', '.join(entry.get('local_recent_change_types', []))}")
        if entry.get("drive_recent_change_types"):
            lines.append(f"  drive_recent_changes: {', '.join(entry.get('drive_recent_change_types', []))}")
        for item in entry.get("local_matches", [])[:3]:
            lines.append(f"  local: `{item.get('path', '')}` | {item.get('modified_at', '')}")
        for item in entry.get("drive_matches", [])[:3]:
            lines.append(f"  drive: `{item.get('path', '')}` | {item.get('modified_at', '')}")

    lines.append("")
    return "\n".join(lines)


def write_erp_focus_outputs(payload: dict[str, Any], output_dir: Path, config: ERPConfig) -> dict[str, str]:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    json_path = output_dir / config.focus_report_file
    md_path = output_dir / config.focus_markdown_file
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(render_erp_focus_markdown(payload), encoding="utf-8")
    return {
        "json_file": str(json_path.resolve()),
        "markdown_file": str(md_path.resolve()),
    }
