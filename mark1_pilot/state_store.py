from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


STATE_DB_FILE = "supermega_state.db"
SNAPSHOT_FILES: dict[str, str] = {
    "action_board": "action_board.json",
    "agent_team_system": "agent_team_system.json",
    "autopilot_status": "autopilot_status.json",
    "coverage_report": "data_coverage_report.json",
    "dqms_incidents": "dqms_incidents.json",
    "dqms_capa_actions": "dqms_capa_actions.json",
    "dqms_supplier_nonconformance": "dqms_supplier_nonconformance.json",
    "execution_review": "execution_review.json",
    "platform_digest": "platform_digest.json",
    "input_center_snapshot": "input_center_snapshot.json",
    "pilot_solution": "pilot_solution.json",
    "platform_publish": "platform_publish.json",
    "product_lab": "product_lab.json",
    "solution_portfolio_manifest": "../Super Mega Inc/sales/solution_portfolio_manifest.json",
}


def _stable_key(prefix: str, seed: str) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12].upper()
    return f"{prefix}-{digest}"


def resolve_state_db(output_dir: Path) -> Path:
    return output_dir.expanduser().resolve() / STATE_DB_FILE


def _load_json(path: Path) -> Any:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode=WAL")
    return connection


def ensure_schema(db_path: Path) -> None:
    with _connect(db_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS actions (
                action_id TEXT PRIMARY KEY,
                lane TEXT NOT NULL,
                title TEXT NOT NULL,
                action_text TEXT NOT NULL,
                owner TEXT NOT NULL,
                priority TEXT NOT NULL,
                due TEXT NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL,
                evidence_link TEXT NOT NULL,
                evidence_path TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS snapshots (
                snapshot_key TEXT PRIMARY KEY,
                generated_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contact_submissions (
                submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                company TEXT NOT NULL,
                workflow TEXT NOT NULL,
                data_summary TEXT NOT NULL,
                goal TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS attendance_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                employee_name TEXT NOT NULL,
                employee_code TEXT NOT NULL,
                shift_name TEXT NOT NULL,
                station TEXT NOT NULL,
                status TEXT NOT NULL,
                method TEXT NOT NULL,
                evidence_url TEXT NOT NULL,
                note TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS quality_incidents (
                incident_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                severity TEXT NOT NULL,
                owner TEXT NOT NULL,
                supplier TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_ref_json TEXT NOT NULL,
                reported_at TEXT NOT NULL,
                target_close_date TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS capa_actions (
                capa_id TEXT PRIMARY KEY,
                incident_id TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                action_title TEXT NOT NULL,
                verification_criteria TEXT NOT NULL,
                target_date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS supplier_risks (
                risk_id TEXT PRIMARY KEY,
                supplier TEXT NOT NULL,
                status TEXT NOT NULL,
                severity TEXT NOT NULL,
                owner TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                eta TEXT NOT NULL,
                risk_type TEXT NOT NULL,
                source TEXT NOT NULL,
                source_ref_json TEXT NOT NULL,
                next_action TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_teams (
                team_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                scaling_tier TEXT NOT NULL,
                mission TEXT NOT NULL,
                lead_agent TEXT NOT NULL,
                cadence TEXT NOT NULL,
                generated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_units (
                unit_id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                mode TEXT NOT NULL,
                output_schema TEXT NOT NULL,
                write_scope TEXT NOT NULL,
                approval_gate TEXT NOT NULL,
                focus TEXT NOT NULL,
                generated_at TEXT NOT NULL
            );
            """
        )


def upsert_snapshot(db_path: Path, key: str, payload: Any) -> None:
    ensure_schema(db_path)
    generated_at = datetime.now().astimezone().isoformat()
    payload_json = json.dumps(payload, indent=2)
    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO snapshots (snapshot_key, generated_at, payload_json)
            VALUES (?, ?, ?)
            ON CONFLICT(snapshot_key) DO UPDATE SET
                generated_at = excluded.generated_at,
                payload_json = excluded.payload_json
            """,
            (key, generated_at, payload_json),
        )
        connection.commit()


def sync_action_board(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(db_path)
    items = payload.get("items", []) if isinstance(payload, dict) else []
    synced_at = datetime.now().astimezone().isoformat()
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM actions")
        connection.executemany(
            """
            INSERT INTO actions (
                action_id,
                lane,
                title,
                action_text,
                owner,
                priority,
                due,
                status,
                source,
                evidence_link,
                evidence_path,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(item.get("id", "")).strip(),
                    str(item.get("lane", "")).strip(),
                    str(item.get("title", "")).strip(),
                    str(item.get("action", "")).strip(),
                    str(item.get("owner", "")).strip(),
                    str(item.get("priority", "")).strip(),
                    str(item.get("due", "")).strip(),
                    str(item.get("status", "")).strip(),
                    str(item.get("source", "")).strip(),
                    str(item.get("evidence_link", "")).strip(),
                    str(item.get("evidence_path", "")).strip(),
                    synced_at,
                )
                for item in items
                if str(item.get("id", "")).strip()
            ],
        )
        connection.commit()
    upsert_snapshot(db_path, "action_board", payload)
    return {
        "status": "ready",
        "db_path": str(db_path),
        "action_count": len(items),
        "synced_at": synced_at,
    }


def sync_quality_registers(
    db_path: Path,
    *,
    incidents_payload: list[dict[str, Any]],
    capa_payload: list[dict[str, Any]],
) -> dict[str, Any]:
    ensure_schema(db_path)
    synced_at = datetime.now().astimezone().isoformat()
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM quality_incidents")
        connection.execute("DELETE FROM capa_actions")
        connection.executemany(
            """
            INSERT INTO quality_incidents (
                incident_id,
                status,
                severity,
                owner,
                supplier,
                title,
                summary,
                source_type,
                source_ref_json,
                reported_at,
                target_close_date,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(item.get("incident_id", "")).strip(),
                    str(item.get("status", "")).strip(),
                    str(item.get("severity", "")).strip(),
                    str(item.get("owner", "")).strip(),
                    str(item.get("supplier", "")).strip(),
                    str(item.get("title", "")).strip(),
                    str(item.get("summary", "")).strip(),
                    str(item.get("source_type", "")).strip(),
                    json.dumps(item.get("source_ref", {}), ensure_ascii=False),
                    str(item.get("reported_at", "")).strip(),
                    str(item.get("target_close_date", "")).strip(),
                    synced_at,
                )
                for item in incidents_payload
                if str(item.get("incident_id", "")).strip()
            ],
        )
        connection.executemany(
            """
            INSERT INTO capa_actions (
                capa_id,
                incident_id,
                status,
                owner,
                action_title,
                verification_criteria,
                target_date,
                created_at,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(item.get("capa_id", "")).strip(),
                    str(item.get("incident_id", "")).strip(),
                    str(item.get("status", "")).strip(),
                    str(item.get("owner", "")).strip(),
                    str(item.get("action_title", "")).strip(),
                    str(item.get("verification_criteria", "")).strip(),
                    str(item.get("target_date", "")).strip(),
                    str(item.get("created_at", "")).strip(),
                    synced_at,
                )
                for item in capa_payload
                if str(item.get("capa_id", "")).strip()
            ],
        )
        connection.commit()
    return {
        "status": "ready",
        "incident_count": len(incidents_payload),
        "capa_count": len(capa_payload),
        "synced_at": synced_at,
    }


def _build_supplier_risk_rows(
    input_center_payload: dict[str, Any],
    supplier_nonconformance_payload: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    templates = input_center_payload.get("templates", []) if isinstance(input_center_payload, dict) else []
    for template in templates:
        if str(template.get("key", "")).strip() != "procurement_supplier_tracker":
            continue
        sheet_link = str(template.get("web_view_link", "")).strip()
        for recent in template.get("recent_rows", []):
            row = recent.get("row", {}) if isinstance(recent, dict) else {}
            supplier = str(row.get("supplier", "")).strip() or "UNKNOWN"
            risk_level = str(row.get("risk_level", "")).strip().lower() or "medium"
            status = str(row.get("status", "")).strip() or "review"
            owner = str(row.get("owner", "")).strip() or "Procurement Team"
            title = f"{supplier} supplier watch"
            summary = (
                f"{row.get('material', '')} | {row.get('quantity', '')} | "
                f"PO/PI {row.get('po_or_pi', '')} | ETA {row.get('eta', '')}"
            ).strip(" |")
            next_action = str(row.get("next_action", "")).strip() or "Review supplier status"
            risk_id = _stable_key(
                "SUP",
                f"tracker:{supplier}:{row.get('po_or_pi', '')}:{row.get('__row_number', '')}:{status}:{next_action}",
            )
            rows.append(
                {
                    "risk_id": risk_id,
                    "supplier": supplier,
                    "status": status,
                    "severity": risk_level,
                    "owner": owner,
                    "title": title,
                    "summary": summary,
                    "eta": str(row.get("eta", "")).strip(),
                    "risk_type": "procurement_tracker",
                    "source": "input_center",
                    "source_ref": {
                        "template_key": "procurement_supplier_tracker",
                        "sheet_link": sheet_link,
                        "row_number": row.get("__row_number", ""),
                    },
                    "next_action": next_action,
                }
            )

    for item in supplier_nonconformance_payload:
        supplier = str(item.get("supplier", "")).strip() or "UNKNOWN"
        if supplier == "UNKNOWN":
            continue
        open_incidents = int(item.get("open_incidents", 0) or 0)
        triage_incidents = int(item.get("triage_incidents", 0) or 0)
        severity = "high" if open_incidents >= 3 else ("medium" if open_incidents > 0 or triage_incidents > 0 else "low")
        risk_id = _stable_key("SUP", f"quality:{supplier}:{open_incidents}:{triage_incidents}")
        rows.append(
            {
                "risk_id": risk_id,
                "supplier": supplier,
                "status": "open" if open_incidents > 0 else "triage",
                "severity": severity,
                "owner": "Quality Team",
                "title": f"{supplier} supplier quality watch",
                "summary": f"{open_incidents} open incidents and {triage_incidents} triage incidents in the supplier quality rollup.",
                "eta": "",
                "risk_type": "supplier_quality_rollup",
                "source": "dqms",
                "source_ref": {
                    "latest_title": item.get("latest_title", ""),
                    "latest_reported_at": item.get("latest_reported_at", ""),
                },
                "next_action": "Review supplier corrective action and containment status.",
            }
        )

    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        deduped[row["risk_id"]] = row
    return list(deduped.values())


def sync_supplier_risks(
    db_path: Path,
    *,
    input_center_payload: dict[str, Any],
    supplier_nonconformance_payload: list[dict[str, Any]],
) -> dict[str, Any]:
    ensure_schema(db_path)
    synced_at = datetime.now().astimezone().isoformat()
    rows = _build_supplier_risk_rows(input_center_payload, supplier_nonconformance_payload)
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM supplier_risks")
        connection.executemany(
            """
            INSERT INTO supplier_risks (
                risk_id,
                supplier,
                status,
                severity,
                owner,
                title,
                summary,
                eta,
                risk_type,
                source,
                source_ref_json,
                next_action,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(row.get("risk_id", "")).strip(),
                    str(row.get("supplier", "")).strip(),
                    str(row.get("status", "")).strip(),
                    str(row.get("severity", "")).strip(),
                    str(row.get("owner", "")).strip(),
                    str(row.get("title", "")).strip(),
                    str(row.get("summary", "")).strip(),
                    str(row.get("eta", "")).strip(),
                    str(row.get("risk_type", "")).strip(),
                    str(row.get("source", "")).strip(),
                    json.dumps(row.get("source_ref", {}), ensure_ascii=False),
                    str(row.get("next_action", "")).strip(),
                    synced_at,
                )
                for row in rows
                if str(row.get("risk_id", "")).strip()
            ],
        )
        connection.commit()
    return {
        "status": "ready",
        "risk_count": len(rows),
        "synced_at": synced_at,
    }


def sync_state_from_output_dir(output_dir: Path) -> dict[str, Any]:
    output_dir = output_dir.expanduser().resolve()
    db_path = resolve_state_db(output_dir)
    ensure_schema(db_path)

    snapshot_count = 0
    action_count = 0
    payloads: dict[str, Any] = {}

    for key, filename in SNAPSHOT_FILES.items():
        payload = _load_json(output_dir / filename)
        if not payload:
            continue
        payloads[key] = payload
        if key == "action_board":
            result = sync_action_board(db_path, payload if isinstance(payload, dict) else {})
            action_count = int(result.get("action_count", 0) or 0)
            snapshot_count += 1
            continue
        if key == "agent_team_system":
            sync_agent_team_system(db_path, payload if isinstance(payload, dict) else {})
            snapshot_count += 1
            continue
        upsert_snapshot(db_path, key, payload)
        snapshot_count += 1

    incidents_payload = payloads.get("dqms_incidents", [])
    capa_payload = payloads.get("dqms_capa_actions", [])
    if isinstance(incidents_payload, list) or isinstance(capa_payload, list):
        sync_quality_registers(
            db_path,
            incidents_payload=incidents_payload if isinstance(incidents_payload, list) else [],
            capa_payload=capa_payload if isinstance(capa_payload, list) else [],
        )

    sync_supplier_risks(
        db_path,
        input_center_payload=payloads.get("input_center_snapshot", {}) if isinstance(payloads.get("input_center_snapshot", {}), dict) else {},
        supplier_nonconformance_payload=payloads.get("dqms_supplier_nonconformance", []) if isinstance(payloads.get("dqms_supplier_nonconformance", []), list) else [],
    )

    return {
        "status": "ready",
        "db_path": str(db_path),
        "snapshot_count": snapshot_count,
        "action_count": action_count,
        "generated_at": datetime.now().astimezone().isoformat(),
    }


def add_contact_submission(
    db_path: Path,
    *,
    source: str,
    name: str,
    email: str,
    company: str,
    workflow: str,
    data_summary: str,
    goal: str,
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    with _connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO contact_submissions (
                created_at,
                source,
                name,
                email,
                company,
                workflow,
                data_summary,
                goal
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (created_at, source, name, email, company, workflow, data_summary, goal),
        )
        connection.commit()
        submission_id = int(cursor.lastrowid)
    return {
        "id": submission_id,
        "created_at": created_at,
        "source": source,
        "name": name,
        "email": email,
        "company": company,
        "workflow": workflow,
        "data_summary": data_summary,
        "goal": goal,
    }


def list_contact_submissions(db_path: Path, *, limit: int = 50) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                submission_id,
                created_at,
                source,
                name,
                email,
                company,
                workflow,
                data_summary,
                goal
            FROM contact_submissions
            ORDER BY submission_id DESC
            LIMIT ?
            """,
            (max(1, int(limit)),),
        ).fetchall()
    return [
        {
            "id": int(row["submission_id"]),
            "created_at": row["created_at"],
            "source": row["source"],
            "name": row["name"],
            "email": row["email"],
            "company": row["company"],
            "workflow": row["workflow"],
            "data_summary": row["data_summary"],
            "goal": row["goal"],
        }
        for row in rows
    ]


def add_attendance_event(
    db_path: Path,
    *,
    employee_name: str,
    employee_code: str,
    shift_name: str,
    station: str,
    status: str,
    method: str,
    evidence_url: str,
    note: str,
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    with _connect(db_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO attendance_events (
                created_at,
                employee_name,
                employee_code,
                shift_name,
                station,
                status,
                method,
                evidence_url,
                note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (created_at, employee_name, employee_code, shift_name, station, status, method, evidence_url, note),
        )
        connection.commit()
        event_id = int(cursor.lastrowid)
    return {
        "id": event_id,
        "created_at": created_at,
        "employee_name": employee_name,
        "employee_code": employee_code,
        "shift_name": shift_name,
        "station": station,
        "status": status,
        "method": method,
        "evidence_url": evidence_url,
        "note": note,
    }


def add_action_items(
    db_path: Path,
    *,
    rows: list[dict[str, Any]],
    source: str = "tool:action_board",
    lane: str = "do_now",
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    inserted_rows: list[dict[str, Any]] = []
    with _connect(db_path) as connection:
        for index, row in enumerate(rows, start=1):
            title = str(row.get("title", "")).strip()
            if not title:
                continue
            action_id = str(row.get("id", "")).strip() or _stable_key(
                "ACT",
                f"{title}:{row.get('owner', '')}:{row.get('due', '')}:{created_at}:{index}",
            )
            action_text = str(row.get("action", "")).strip() or title
            owner = str(row.get("owner", "")).strip() or "Management"
            priority = str(row.get("priority", "")).strip().lower() or "medium"
            due = str(row.get("due", "")).strip() or "This week"
            status = str(row.get("status", "")).strip().lower() or "open"
            row_lane = str(row.get("lane", "")).strip() or lane
            evidence_link = str(row.get("evidence_link", "")).strip()
            evidence_path = str(row.get("evidence_path", "")).strip()

            connection.execute(
                """
                INSERT INTO actions (
                    action_id,
                    lane,
                    title,
                    action_text,
                    owner,
                    priority,
                    due,
                    status,
                    source,
                    evidence_link,
                    evidence_path,
                    synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(action_id) DO UPDATE SET
                    lane = excluded.lane,
                    title = excluded.title,
                    action_text = excluded.action_text,
                    owner = excluded.owner,
                    priority = excluded.priority,
                    due = excluded.due,
                    status = excluded.status,
                    source = excluded.source,
                    evidence_link = excluded.evidence_link,
                    evidence_path = excluded.evidence_path,
                    synced_at = excluded.synced_at
                """,
                (
                    action_id,
                    row_lane,
                    title,
                    action_text,
                    owner,
                    priority,
                    due,
                    status,
                    source,
                    evidence_link,
                    evidence_path,
                    created_at,
                ),
            )
            inserted_rows.append(
                {
                    "id": action_id,
                    "lane": row_lane,
                    "title": title,
                    "action": action_text,
                    "owner": owner,
                    "priority": priority,
                    "due": due,
                    "status": status,
                    "source": source,
                    "evidence_link": evidence_link,
                    "evidence_path": evidence_path,
                    "synced_at": created_at,
                }
            )
        connection.commit()

    return {
        "status": "ready",
        "saved_count": len(inserted_rows),
        "saved_rows": inserted_rows,
        "saved_at": created_at,
    }


def list_attendance_events(db_path: Path, *, limit: int = 100) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                event_id,
                created_at,
                employee_name,
                employee_code,
                shift_name,
                station,
                status,
                method,
                evidence_url,
                note
            FROM attendance_events
            ORDER BY event_id DESC
            LIMIT ?
            """,
            (max(1, int(limit)),),
        ).fetchall()
    return [
        {
            "id": int(row["event_id"]),
            "created_at": row["created_at"],
            "employee_name": row["employee_name"],
            "employee_code": row["employee_code"],
            "shift_name": row["shift_name"],
            "station": row["station"],
            "status": row["status"],
            "method": row["method"],
            "evidence_url": row["evidence_url"],
            "note": row["note"],
        }
        for row in rows
    ]


def list_actions(
    db_path: Path,
    *,
    lane: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            action_id,
            lane,
            title,
            action_text,
            owner,
            priority,
            due,
            status,
            source,
            evidence_link,
            evidence_path,
            synced_at
        FROM actions
    """
    conditions: list[str] = []
    params: list[Any] = []
    if lane:
        conditions.append("lane = ?")
        params.append(lane)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, due, title LIMIT ?"
    params.append(max(1, int(limit)))

    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "id": row["action_id"],
            "lane": row["lane"],
            "title": row["title"],
            "action": row["action_text"],
            "owner": row["owner"],
            "priority": row["priority"],
            "due": row["due"],
            "status": row["status"],
            "source": row["source"],
            "evidence_link": row["evidence_link"],
            "evidence_path": row["evidence_path"],
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def load_action_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM actions").fetchone()[0])
        lane_rows = connection.execute(
            "SELECT lane, COUNT(*) AS item_count FROM actions GROUP BY lane"
        ).fetchall()
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM actions GROUP BY status"
        ).fetchall()
    return {
        "total_items": total,
        "by_lane": {str(row["lane"]): int(row["item_count"]) for row in lane_rows},
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
    }


def list_quality_incidents(db_path: Path, *, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            incident_id,
            status,
            severity,
            owner,
            supplier,
            title,
            summary,
            source_type,
            source_ref_json,
            reported_at,
            target_close_date,
            synced_at
        FROM quality_incidents
    """
    params: list[Any] = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, reported_at DESC LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "incident_id": row["incident_id"],
            "status": row["status"],
            "severity": row["severity"],
            "owner": row["owner"],
            "supplier": row["supplier"],
            "title": row["title"],
            "summary": row["summary"],
            "source_type": row["source_type"],
            "source_ref": json.loads(row["source_ref_json"]) if row["source_ref_json"] else {},
            "reported_at": row["reported_at"],
            "target_close_date": row["target_close_date"],
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def load_quality_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        incident_total = int(connection.execute("SELECT COUNT(*) FROM quality_incidents").fetchone()[0])
        capa_total = int(connection.execute("SELECT COUNT(*) FROM capa_actions").fetchone()[0])
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM quality_incidents GROUP BY status"
        ).fetchall()
        supplier_rows = connection.execute(
            "SELECT supplier, COUNT(*) AS item_count FROM quality_incidents GROUP BY supplier ORDER BY item_count DESC, supplier LIMIT 5"
        ).fetchall()
    return {
        "incident_count": incident_total,
        "capa_count": capa_total,
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "top_suppliers": [
            {"supplier": str(row["supplier"]), "incident_count": int(row["item_count"])}
            for row in supplier_rows
        ],
    }


def list_capa_actions(db_path: Path, *, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            capa_id,
            incident_id,
            status,
            owner,
            action_title,
            verification_criteria,
            target_date,
            created_at,
            synced_at
        FROM capa_actions
    """
    params: list[Any] = []
    if status:
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY target_date, created_at DESC LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "capa_id": row["capa_id"],
            "incident_id": row["incident_id"],
            "status": row["status"],
            "owner": row["owner"],
            "action_title": row["action_title"],
            "verification_criteria": row["verification_criteria"],
            "target_date": row["target_date"],
            "created_at": row["created_at"],
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def list_supplier_risks(
    db_path: Path,
    *,
    supplier: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            risk_id,
            supplier,
            status,
            severity,
            owner,
            title,
            summary,
            eta,
            risk_type,
            source,
            source_ref_json,
            next_action,
            synced_at
        FROM supplier_risks
    """
    conditions: list[str] = []
    params: list[Any] = []
    if supplier:
        conditions.append("supplier = ?")
        params.append(supplier)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END, supplier, title LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "risk_id": row["risk_id"],
            "supplier": row["supplier"],
            "status": row["status"],
            "severity": row["severity"],
            "owner": row["owner"],
            "title": row["title"],
            "summary": row["summary"],
            "eta": row["eta"],
            "risk_type": row["risk_type"],
            "source": row["source"],
            "source_ref": json.loads(row["source_ref_json"]) if row["source_ref_json"] else {},
            "next_action": row["next_action"],
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def load_supplier_risk_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM supplier_risks").fetchone()[0])
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM supplier_risks GROUP BY status"
        ).fetchall()
        severity_rows = connection.execute(
            "SELECT severity, COUNT(*) AS item_count FROM supplier_risks GROUP BY severity"
        ).fetchall()
        supplier_rows = connection.execute(
            "SELECT supplier, COUNT(*) AS item_count FROM supplier_risks GROUP BY supplier ORDER BY item_count DESC, supplier LIMIT 5"
        ).fetchall()
    return {
        "risk_count": total,
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "by_severity": {str(row["severity"]): int(row["item_count"]) for row in severity_rows},
        "top_suppliers": [
            {"supplier": str(row["supplier"]), "risk_count": int(row["item_count"])}
            for row in supplier_rows
        ],
    }


def sync_agent_team_system(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(db_path)
    generated_at = str(payload.get("generated_at", "")).strip() or datetime.now().astimezone().isoformat()
    teams = payload.get("teams", []) if isinstance(payload, dict) else []
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM agent_units")
        connection.execute("DELETE FROM agent_teams")
        connection.executemany(
            """
            INSERT INTO agent_teams (
                team_id,
                name,
                status,
                scaling_tier,
                mission,
                lead_agent,
                cadence,
                generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(team.get("team_id", "")).strip(),
                    str(team.get("name", "")).strip(),
                    str(team.get("status", "")).strip(),
                    str(team.get("scaling_tier", "")).strip(),
                    str(team.get("mission", "")).strip(),
                    str(team.get("lead_agent", "")).strip(),
                    str(team.get("cadence", "")).strip(),
                    generated_at,
                )
                for team in teams
                if str(team.get("team_id", "")).strip()
            ],
        )
        connection.executemany(
            """
            INSERT INTO agent_units (
                unit_id,
                team_id,
                name,
                role,
                mode,
                output_schema,
                write_scope,
                approval_gate,
                focus,
                generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    f"{str(team.get('team_id', '')).strip()}::{str(agent.get('agent_id', '')).strip()}",
                    str(team.get("team_id", "")).strip(),
                    str(agent.get("name", "")).strip(),
                    str(agent.get("role", "")).strip(),
                    str(agent.get("mode", "")).strip(),
                    str(agent.get("output_schema", "")).strip(),
                    str(agent.get("write_scope", "")).strip(),
                    str(agent.get("approval_gate", "")).strip(),
                    str(agent.get("focus", "")).strip(),
                    generated_at,
                )
                for team in teams
                if str(team.get("team_id", "")).strip()
                for agent in team.get("agents", [])
                if str(agent.get("agent_id", "")).strip()
            ],
        )
        connection.commit()
    upsert_snapshot(db_path, "agent_team_system", payload)
    return {
        "status": "ready",
        "team_count": len(teams),
        "generated_at": generated_at,
    }


def list_agent_teams(db_path: Path) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        team_rows = connection.execute(
            """
            SELECT
                team_id,
                name,
                status,
                scaling_tier,
                mission,
                lead_agent,
                cadence,
                generated_at
            FROM agent_teams
            ORDER BY name
            """
        ).fetchall()
        unit_rows = connection.execute(
            """
            SELECT
                unit_id,
                team_id,
                name,
                role,
                mode,
                output_schema,
                write_scope,
                approval_gate,
                focus,
                generated_at
            FROM agent_units
            ORDER BY team_id, name
            """
        ).fetchall()

    units_by_team: dict[str, list[dict[str, Any]]] = {}
    for row in unit_rows:
        team_id = str(row["team_id"])
        units_by_team.setdefault(team_id, []).append(
            {
                "unit_id": row["unit_id"],
                "name": row["name"],
                "role": row["role"],
                "mode": row["mode"],
                "output_schema": row["output_schema"],
                "write_scope": row["write_scope"],
                "approval_gate": row["approval_gate"],
                "focus": row["focus"],
                "generated_at": row["generated_at"],
            }
        )

    return [
        {
            "team_id": row["team_id"],
            "name": row["name"],
            "status": row["status"],
            "scaling_tier": row["scaling_tier"],
            "mission": row["mission"],
            "lead_agent": row["lead_agent"],
            "cadence": row["cadence"],
            "generated_at": row["generated_at"],
            "agents": units_by_team.get(str(row["team_id"]), []),
        }
        for row in team_rows
    ]


def load_agent_team_summary(db_path: Path) -> dict[str, Any]:
    payload = load_snapshot(db_path, "agent_team_system")
    summary = payload.get("summary", {}) if isinstance(payload, dict) else {}
    teams = list_agent_teams(db_path)
    return {
        "team_count": len(teams),
        "shared_core_team_count": int(summary.get("shared_core_team_count", 0) or 0),
        "client_pod_team_count": int(summary.get("client_pod_team_count", 0) or 0),
        "autonomy_score": int(summary.get("autonomy_score", 0) or 0),
        "autonomy_level": str(summary.get("autonomy_level", "")).strip(),
        "status": str(payload.get("status", "")).strip() if isinstance(payload, dict) else "",
    }


def load_snapshot(db_path: Path, key: str) -> Any:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        row = connection.execute(
            "SELECT payload_json FROM snapshots WHERE snapshot_key = ?",
            (key,),
        ).fetchone()
    if not row:
        return {}
    try:
        return json.loads(row["payload_json"])
    except Exception:
        return {}
