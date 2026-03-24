from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


STATE_DB_FILE = "supermega_state.db"
SNAPSHOT_FILES: dict[str, str] = {
    "action_board": "action_board.json",
    "autopilot_status": "autopilot_status.json",
    "coverage_report": "data_coverage_report.json",
    "dqms_incidents": "dqms_incidents.json",
    "dqms_capa_actions": "dqms_capa_actions.json",
    "execution_review": "execution_review.json",
    "input_center_snapshot": "input_center_snapshot.json",
    "pilot_solution": "pilot_solution.json",
    "platform_publish": "platform_publish.json",
    "product_lab": "product_lab.json",
    "solution_portfolio_manifest": "../Super Mega Inc/sales/solution_portfolio_manifest.json",
}


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


def sync_state_from_output_dir(output_dir: Path) -> dict[str, Any]:
    output_dir = output_dir.expanduser().resolve()
    db_path = resolve_state_db(output_dir)
    ensure_schema(db_path)

    snapshot_count = 0
    action_count = 0

    for key, filename in SNAPSHOT_FILES.items():
        payload = _load_json(output_dir / filename)
        if not payload:
            continue
        if key == "action_board":
            result = sync_action_board(db_path, payload if isinstance(payload, dict) else {})
            action_count = int(result.get("action_count", 0) or 0)
            snapshot_count += 1
            continue
        upsert_snapshot(db_path, key, payload)
        snapshot_count += 1

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
