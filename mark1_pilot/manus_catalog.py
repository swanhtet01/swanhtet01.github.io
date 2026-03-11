from __future__ import annotations

import hashlib
import io
import json
import shutil
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from zipfile import BadZipFile, ZipFile

MAX_NESTED_ARCHIVE_BYTES = 200 * 1024 * 1024
DEFAULT_MAX_NESTING_DEPTH = 2


def _normalize(value: str) -> str:
    return value.lower().strip()


def _score_from_matches(matches: list[str]) -> int:
    if not matches:
        return 20
    base = 35
    return min(98, base + len(matches) * 11)


def _classify_entry(source_zip: Path, entry_name: str) -> dict[str, Any]:
    text = _normalize(f"{source_zip.name} {entry_name}")
    sensitive_terms = [
        "keystore",
        "secret",
        "api key",
        "oauth",
        "token",
        "credential",
        "client_secret",
        "serviceaccount",
        ".pem",
        ".key",
        ".p12",
        "screenshot",
    ]
    case_terms = [
        "yangon tyre",
        "ytf",
        "dashboard",
        "platform",
        "lms",
        "football stats",
        "google analytics",
        "facebook data",
    ]
    architecture_terms = [
        "agent",
        "autonomous",
        "infrastructure",
        "aws",
        "local transition",
        "spec pack",
        "machine",
    ]
    showroom_terms = [
        "website",
        "showroom",
        "landing",
        "fix website",
        "update",
        "professional",
        "shareable",
    ]

    sensitive_matches = [term for term in sensitive_terms if term in text]
    if sensitive_matches:
        return {
            "category": "credentials_sensitive",
            "relevance_score": _score_from_matches(sensitive_matches),
            "action": "quarantine",
            "rationale": f"Sensitive indicators: {', '.join(sensitive_matches[:4])}",
        }

    showroom_matches = [term for term in showroom_terms if term in text]
    if showroom_matches:
        return {
            "category": "showroom_content",
            "relevance_score": _score_from_matches(showroom_matches),
            "action": "import",
            "rationale": f"Showroom indicators: {', '.join(showroom_matches[:4])}",
        }

    case_matches = [term for term in case_terms if term in text]
    if case_matches:
        return {
            "category": "case_studies_proof",
            "relevance_score": _score_from_matches(case_matches),
            "action": "import",
            "rationale": f"Proof indicators: {', '.join(case_matches[:4])}",
        }

    architecture_matches = [term for term in architecture_terms if term in text]
    if architecture_matches:
        return {
            "category": "product_architecture",
            "relevance_score": _score_from_matches(architecture_matches),
            "action": "reference",
            "rationale": f"Architecture indicators: {', '.join(architecture_matches[:4])}",
        }

    return {
        "category": "automations_workflows",
        "relevance_score": 34,
        "action": "reference",
        "rationale": "No strong category signals; keep as workflow/reference material.",
    }


def _entry_hash(source_zip: Path, entry_name: str) -> str:
    digest = hashlib.sha1(f"{source_zip}|{entry_name}".encode("utf-8")).hexdigest()
    return digest[:12]


def _collect_zip_entries(
    source_zip: Path,
    archive: ZipFile,
    *,
    prefix: str,
    depth: int,
    max_depth: int,
    errors: list[dict[str, str]],
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for item in archive.infolist():
        if item.is_dir():
            continue
        display_name = f"{prefix}::{item.filename}" if prefix else item.filename
        classified = _classify_entry(source_zip, display_name)
        entries.append(
            {
                "id": _entry_hash(source_zip, display_name),
                "source_archive": str(source_zip),
                "entry_name": display_name,
                "size_bytes": item.file_size,
                "compressed_bytes": item.compress_size,
                "depth": depth,
                "category": classified["category"],
                "relevance_score": classified["relevance_score"],
                "action": classified["action"],
                "rationale": classified["rationale"],
            }
        )
        is_nested_archive = item.filename.lower().endswith(".zip")
        if not is_nested_archive or depth >= max_depth:
            continue
        try:
            if item.file_size <= MAX_NESTED_ARCHIVE_BYTES:
                nested_bytes = archive.read(item.filename)
                with ZipFile(io.BytesIO(nested_bytes)) as nested:
                    entries.extend(
                        _collect_zip_entries(
                            source_zip,
                            nested,
                            prefix=display_name,
                            depth=depth + 1,
                            max_depth=max_depth,
                            errors=errors,
                        )
                    )
            else:
                with archive.open(item.filename) as nested_stream, tempfile.NamedTemporaryFile(
                    suffix=".zip", delete=False
                ) as temp_zip:
                    shutil.copyfileobj(nested_stream, temp_zip)
                    temp_path = Path(temp_zip.name)
                try:
                    with ZipFile(temp_path) as nested:
                        entries.extend(
                            _collect_zip_entries(
                                source_zip,
                                nested,
                                prefix=display_name,
                                depth=depth + 1,
                                max_depth=max_depth,
                                errors=errors,
                            )
                        )
                finally:
                    temp_path.unlink(missing_ok=True)
        except BadZipFile:
            errors.append(
                {
                    "path": str(source_zip),
                    "error": f"bad_nested_zip:{display_name}",
                }
            )
        except Exception as exc:  # pragma: no cover - operational fallback
            errors.append(
                {
                    "path": str(source_zip),
                    "error": f"nested_zip_error:{display_name}:{exc}",
                }
            )
    return entries


def _zip_entries(path: Path, errors: list[dict[str, str]], max_nesting_depth: int) -> list[dict[str, Any]]:
    with ZipFile(path) as archive:
        return _collect_zip_entries(
            path,
            archive,
            prefix="",
            depth=0,
            max_depth=max_nesting_depth,
            errors=errors,
        )


def build_manus_catalog(
    zip_paths: list[Path],
    *,
    max_nesting_depth: int = DEFAULT_MAX_NESTING_DEPTH,
) -> dict[str, Any]:
    generated_at = datetime.now(UTC).isoformat()
    normalized_paths = [path.expanduser().resolve() for path in zip_paths]
    results: list[dict[str, Any]] = []
    source_summary: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for path in normalized_paths:
        if not path.exists():
            errors.append({"path": str(path), "error": "missing_file"})
            continue
        try:
            items = _zip_entries(path, errors, max_nesting_depth)
            top_level_items = [item for item in items if item.get("depth", 0) == 0]
            source_summary.append(
                {
                    "path": str(path),
                    "status": "ready",
                    "entry_count": len(top_level_items),
                    "expanded_entry_count": len(items),
                    "size_bytes": path.stat().st_size,
                }
            )
            results.extend(items)
        except BadZipFile:
            errors.append({"path": str(path), "error": "bad_zip_file"})
        except Exception as exc:  # pragma: no cover - operational fallback
            errors.append({"path": str(path), "error": str(exc)})

    category_counts: dict[str, int] = {}
    action_counts: dict[str, int] = {}
    for item in results:
        category = item["category"]
        action = item["action"]
        category_counts[category] = category_counts.get(category, 0) + 1
        action_counts[action] = action_counts.get(action, 0) + 1

    results.sort(
        key=lambda item: (
            -item["relevance_score"],
            item["action"],
            item["category"],
            item["entry_name"],
        )
    )

    return {
        "generated_at": generated_at,
        "sources": source_summary,
        "entries": results,
        "category_counts": category_counts,
        "action_counts": action_counts,
        "max_nesting_depth": max_nesting_depth,
        "error_count": len(errors),
        "errors": errors,
    }


def render_manus_catalog_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# SuperMega Manus Asset Catalog",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Sources processed: {len(payload.get('sources', []))}",
        f"- Entries cataloged: {len(payload.get('entries', []))}",
        "",
        "## Category Counts",
        "",
    ]
    for category, count in sorted(payload.get("category_counts", {}).items()):
        lines.append(f"- `{category}`: {count}")

    lines.extend(["", "## Action Counts", ""])
    for action, count in sorted(payload.get("action_counts", {}).items()):
        lines.append(f"- `{action}`: {count}")

    lines.extend(["", "## Source Summary", ""])
    for source in payload.get("sources", []):
        lines.append(
            f"- `{source.get('path', '')}` | status={source.get('status', '')} | top_level_entries={source.get('entry_count', 0)} | expanded_entries={source.get('expanded_entry_count', source.get('entry_count', 0))} | bytes={source.get('size_bytes', 0)}"
        )

    lines.extend(["", "## Top Priority Imports", ""])
    import_candidates = [item for item in payload.get("entries", []) if item.get("action") == "import"][:25]
    if not import_candidates:
        lines.append("- None")
    for item in import_candidates:
        lines.append(
            f"- `{item.get('entry_name', '')}` | {item.get('category', '')} | score={item.get('relevance_score', 0)} | {item.get('rationale', '')}"
        )

    lines.extend(["", "## Quarantine Items", ""])
    quarantine_items = [item for item in payload.get("entries", []) if item.get("action") == "quarantine"][:25]
    if not quarantine_items:
        lines.append("- None")
    for item in quarantine_items:
        lines.append(
            f"- `{item.get('entry_name', '')}` | score={item.get('relevance_score', 0)} | {item.get('rationale', '')}"
        )

    if payload.get("errors"):
        lines.extend(["", "## Errors", ""])
        for error in payload["errors"]:
            lines.append(f"- `{error.get('path', '')}` | {error.get('error', '')}")

    lines.append("")
    return "\n".join(lines)


def write_manus_catalog(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "manus_assets_index.json"
    md_path = output_dir / "manus_assets_index.md"
    json_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    md_path.write_text(render_manus_catalog_markdown(payload), encoding="utf-8")
    return {
        "json_file": str(json_path.resolve()),
        "markdown_file": str(md_path.resolve()),
    }
