from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from .config import DQMSConfig


def _slug(value: str) -> str:
    return "".join(char.lower() for char in value if char.isalnum() or char in {"_", "-"}).strip()


def _stable_id(prefix: str, seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:10].upper()
    return f"{prefix}-{digest}"


def _normalized_file_key(path: str) -> str:
    name = Path(path).name.lower()
    return "".join(char for char in name if char.isalnum())


def _contains_any(text: str, keywords: list[str]) -> list[str]:
    lowered = text.lower()
    return [keyword for keyword in keywords if keyword.lower() in lowered]


def _infer_supplier(source_text: str) -> str:
    lowered = source_text.lower()
    if "kiic" in lowered or "zhuangshidong" in lowered:
        return "KIIC"
    if "junky" in lowered or "cheng" in lowered:
        return "JUNKY"
    if "yangontyre.com" in lowered or "ytf" in lowered:
        return "YANGON_TYRE_INTERNAL"
    return "UNKNOWN"


def _severity_for_text(text: str) -> str:
    lowered = text.lower()
    if any(token in lowered for token in ("urgent", "overdue", "reject", "defect", "complaint")):
        return "high"
    if any(token in lowered for token in ("claim", "quality", "ncr", "capa")):
        return "medium"
    return "low"


def _date_or_now(value: str | None, fallback: datetime) -> str:
    if not value:
        return fallback.isoformat()
    return value


NON_OPERATIONAL_PATH_PREFIXES = (
    "director_manual/",
    "mark1_pilot/",
    "showroom/",
    "super mega inc/",
    "pilot-data/",
    ".github/",
    "tools/",
)

FILE_INCIDENT_KEYWORDS = (
    "claim",
    "complaint",
    "defect",
    "reject",
    "nonconformance",
    "ncr",
    "return",
    "capa",
)


def _is_operational_quality_file(path: str, snippet: str) -> bool:
    normalized_path = str(path).replace("\\", "/").strip().lower()
    if not normalized_path:
        return False
    if normalized_path.startswith(NON_OPERATIONAL_PATH_PREFIXES):
        return False

    ext = Path(normalized_path).suffix.lower()
    if ext in {".py", ".md", ".json", ".html", ".ts", ".tsx", ".js", ".css"}:
        return False

    text = f"{normalized_path} {snippet}".lower()
    return any(keyword in text for keyword in FILE_INCIDENT_KEYWORDS)


def build_dqms_registers(
    config: DQMSConfig,
    *,
    quality_messages: list[dict[str, Any]],
    quality_files: list[dict[str, Any]],
) -> dict[str, Any]:
    generated_at = datetime.now(UTC)
    incidents: list[dict[str, Any]] = []
    capa_actions: list[dict[str, Any]] = []

    for message in quality_messages:
        text = " ".join(
            [
                message.get("subject", ""),
                message.get("snippet", ""),
                message.get("from", ""),
                message.get("to", ""),
            ]
        )
        matches = _contains_any(text, config.incident_keywords)
        if not matches:
            continue

        severity = _severity_for_text(text)
        incident_id = _stable_id("INC", f"gmail:{message.get('id', '')}:{message.get('subject', '')}")
        due_days = max(3, config.due_days_default // 2) if severity == "high" else config.due_days_default
        due_date = (generated_at + timedelta(days=due_days)).date().isoformat()
        supplier = _infer_supplier(text)

        incidents.append(
            {
                "incident_id": incident_id,
                "status": "open",
                "severity": severity,
                "owner": config.owner_default,
                "supplier": supplier,
                "title": message.get("subject", "").strip() or "Quality signal from email",
                "summary": message.get("snippet", "").strip(),
                "tags": matches,
                "source_type": "gmail",
                "source_ref": {
                    "message_id": message.get("id", ""),
                    "thread_id": message.get("thread_id", ""),
                    "from": message.get("from", ""),
                    "date": _date_or_now(message.get("date", ""), generated_at),
                },
                "reported_at": generated_at.isoformat(),
                "target_close_date": due_date,
            }
        )

    for item in quality_files:
        path = item.get("path", "")
        snippet = item.get("snippet", "")
        text = f"{path} {snippet}"
        if not _is_operational_quality_file(path, snippet):
            continue
        matches = _contains_any(text, config.incident_keywords)
        if not matches:
            continue

        incident_id = _stable_id("INC", f"file:{path}")
        severity = _severity_for_text(text)
        due_days = max(3, config.due_days_default // 2) if severity == "high" else config.due_days_default
        due_date = (generated_at + timedelta(days=due_days)).date().isoformat()
        supplier = _infer_supplier(text)

        incidents.append(
            {
                "incident_id": incident_id,
                "status": "triage",
                "severity": severity,
                "owner": config.owner_default,
                "supplier": supplier,
                "title": f"Quality evidence file: {Path(path).name}",
                "summary": snippet,
                "tags": matches,
                "source_type": "local_file",
                "source_ref": {
                    "path": path,
                },
                "reported_at": generated_at.isoformat(),
                "target_close_date": due_date,
            }
        )

    deduped: dict[str, dict[str, Any]] = {}
    for item in incidents:
        dedupe_key = item["incident_id"]
        if item.get("source_type") == "local_file":
            dedupe_key = f"local:{_normalized_file_key(str(item.get('source_ref', {}).get('path', '')))}"
        if dedupe_key not in deduped:
            deduped[dedupe_key] = item
            continue

        existing = deduped[dedupe_key]
        existing_supplier = str(existing.get("supplier", "")).strip().upper()
        new_supplier = str(item.get("supplier", "")).strip().upper()
        if existing_supplier == "UNKNOWN" and new_supplier not in {"", "UNKNOWN"}:
            deduped[dedupe_key] = item

    incidents = sorted(deduped.values(), key=lambda item: (item["status"], item["severity"], item["title"]))

    for incident in incidents:
        action_id = _stable_id("CAPA", incident["incident_id"])
        action_title = (
            "Contain issue and protect customer shipments"
            if incident["severity"] == "high"
            else "Run root cause analysis and corrective action"
        )
        capa_actions.append(
            {
                "capa_id": action_id,
                "incident_id": incident["incident_id"],
                "status": "open",
                "owner": incident["owner"],
                "action_title": action_title,
                "verification_criteria": "Evidence attached, effectiveness confirmed, and issue recurrence monitored.",
                "target_date": incident["target_close_date"],
                "created_at": generated_at.isoformat(),
            }
        )

    supplier_rollup: dict[str, dict[str, Any]] = {}
    for incident in incidents:
        supplier = incident["supplier"]
        if supplier not in supplier_rollup:
            supplier_rollup[supplier] = {
                "supplier": supplier,
                "open_incidents": 0,
                "triage_incidents": 0,
                "latest_title": incident["title"],
                "latest_reported_at": incident["reported_at"],
            }
        if incident["status"] == "open":
            supplier_rollup[supplier]["open_incidents"] += 1
        if incident["status"] == "triage":
            supplier_rollup[supplier]["triage_incidents"] += 1

    supplier_nonconformance = sorted(
        supplier_rollup.values(),
        key=lambda item: (-item["open_incidents"], -item["triage_incidents"], item["supplier"]),
    )

    return {
        "generated_at": generated_at.isoformat(),
        "incident_count": len(incidents),
        "capa_count": len(capa_actions),
        "supplier_count": len(supplier_nonconformance),
        "incidents": incidents,
        "capa_actions": capa_actions,
        "supplier_nonconformance": supplier_nonconformance,
    }


def render_dqms_weekly_summary(payload: dict[str, Any]) -> str:
    lines = [
        "# DQMS Weekly Summary",
        "",
        f"- Generated: {payload.get('generated_at', '')}",
        f"- Open or triage incidents: {payload.get('incident_count', 0)}",
        f"- CAPA actions: {payload.get('capa_count', 0)}",
        f"- Suppliers in rollup: {payload.get('supplier_count', 0)}",
        "",
        "## Incident Snapshot",
        "",
    ]

    incidents = payload.get("incidents", [])
    if not incidents:
        lines.append("- No quality incidents detected from current signals.")
    for incident in incidents[:20]:
        lines.append(
            f"- `{incident.get('incident_id', '')}` | `{incident.get('status', '')}` | `{incident.get('severity', '')}` | `{incident.get('supplier', '')}` | {incident.get('title', '')}"
        )

    lines.extend(["", "## CAPA Actions", ""])
    capa_actions = payload.get("capa_actions", [])
    if not capa_actions:
        lines.append("- No CAPA actions generated.")
    for action in capa_actions[:20]:
        lines.append(
            f"- `{action.get('capa_id', '')}` | incident `{action.get('incident_id', '')}` | owner `{action.get('owner', '')}` | due `{action.get('target_date', '')}`"
        )

    lines.extend(["", "## Supplier Nonconformance Rollup", ""])
    rollup = payload.get("supplier_nonconformance", [])
    if not rollup:
        lines.append("- No supplier-level nonconformance rollup available.")
    for item in rollup:
        lines.append(
            f"- `{item.get('supplier', '')}` | open={item.get('open_incidents', 0)} | triage={item.get('triage_incidents', 0)} | latest={item.get('latest_title', '')}"
        )

    lines.append("")
    return "\n".join(lines)


def write_dqms_outputs(payload: dict[str, Any], output_dir: Path, config: DQMSConfig) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    incident_file = output_dir / config.incident_file
    capa_file = output_dir / config.capa_file
    supplier_file = output_dir / config.supplier_file
    summary_file = output_dir / config.weekly_summary_file

    incident_file.write_text(json.dumps(payload.get("incidents", []), indent=2), encoding="utf-8")
    capa_file.write_text(json.dumps(payload.get("capa_actions", []), indent=2), encoding="utf-8")
    supplier_file.write_text(json.dumps(payload.get("supplier_nonconformance", []), indent=2), encoding="utf-8")
    summary_file.write_text(render_dqms_weekly_summary(payload), encoding="utf-8")

    return {
        "incident_file": str(incident_file.resolve()),
        "capa_file": str(capa_file.resolve()),
        "supplier_file": str(supplier_file.resolve()),
        "summary_file": str(summary_file.resolve()),
    }


def load_dqms_summary(output_dir: Path, config: DQMSConfig) -> dict[str, Any]:
    incident_file = output_dir / config.incident_file
    capa_file = output_dir / config.capa_file
    supplier_file = output_dir / config.supplier_file
    if not incident_file.exists() or not capa_file.exists() or not supplier_file.exists():
        return {
            "status": "not_ready",
            "incident_count": 0,
            "open_incident_count": 0,
            "capa_count": 0,
            "supplier_count": 0,
        }

    incidents = json.loads(incident_file.read_text(encoding="utf-8"))
    capa_actions = json.loads(capa_file.read_text(encoding="utf-8"))
    suppliers = json.loads(supplier_file.read_text(encoding="utf-8"))
    open_incidents = [item for item in incidents if item.get("status") in {"open", "triage"}]

    return {
        "status": "ready",
        "incident_count": len(incidents),
        "open_incident_count": len(open_incidents),
        "capa_count": len(capa_actions),
        "supplier_count": len(suppliers),
        "top_suppliers": suppliers[:5],
    }
