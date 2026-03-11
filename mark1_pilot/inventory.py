from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat()


def _ext_name(path: Path) -> str:
    return path.suffix.lower() if path.suffix else "[no_extension]"


def scan_local_root(root: Path, top_n: int = 15) -> dict[str, Any]:
    root = root.expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Local source root does not exist: {root}")

    extension_counts: Counter[str] = Counter()
    top_level_counts: Counter[str] = Counter()
    files: list[dict[str, Any]] = []
    total_bytes = 0

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        stat = path.stat()
        size = stat.st_size
        total_bytes += size

        rel = path.relative_to(root)
        top_level = rel.parts[0] if rel.parts else "."

        extension_counts[_ext_name(path)] += 1
        top_level_counts[top_level] += 1
        files.append(
            {
                "path": str(rel).replace("\\", "/"),
                "size_bytes": size,
                "modified_at": _iso(stat.st_mtime),
                "extension": _ext_name(path),
                "top_level": top_level,
            }
        )

    files_by_size = sorted(files, key=lambda item: item["size_bytes"], reverse=True)
    files_by_time = sorted(files, key=lambda item: item["modified_at"], reverse=True)

    return {
        "root": str(root),
        "generated_at": datetime.now(UTC).isoformat(),
        "total_files": len(files),
        "total_bytes": total_bytes,
        "extension_counts": dict(extension_counts.most_common()),
        "top_level_folder_counts": dict(top_level_counts.most_common()),
        "largest_files": files_by_size[:top_n],
        "latest_files": files_by_time[:top_n],
    }


def render_inventory_markdown(report: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# Yangon Tyre Source Inventory")
    lines.append("")
    lines.append(f"- Generated: {report['generated_at']}")
    lines.append(f"- Root: `{report['root']}`")
    lines.append(f"- Total files: {report['total_files']}")
    lines.append(f"- Total size (bytes): {report['total_bytes']}")
    lines.append("")
    lines.append("## Top file types")
    lines.append("")
    for ext, count in list(report["extension_counts"].items())[:10]:
        lines.append(f"- `{ext}`: {count}")
    lines.append("")
    lines.append("## Top-level folders")
    lines.append("")
    for name, count in report["top_level_folder_counts"].items():
        lines.append(f"- `{name}`: {count}")
    lines.append("")
    lines.append("## Largest files")
    lines.append("")
    for item in report["largest_files"]:
        lines.append(
            f"- `{item['path']}` | {item['size_bytes']} bytes | {item['modified_at']}"
        )
    lines.append("")
    lines.append("## Latest files")
    lines.append("")
    for item in report["latest_files"]:
        lines.append(
            f"- `{item['path']}` | {item['size_bytes']} bytes | {item['modified_at']}"
        )
    lines.append("")
    return "\n".join(lines)
