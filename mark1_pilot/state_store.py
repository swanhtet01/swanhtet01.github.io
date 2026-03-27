from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timedelta
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


def _coerce_number(value: str) -> float | None:
    text = str(value or "").strip().replace(",", "")
    if not text:
        return None
    cleaned = "".join(char for char in text if char.isdigit() or char in {".", "-"})
    if not cleaned or cleaned in {"-", ".", "-."}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


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

            CREATE TABLE IF NOT EXISTS workspace_members (
                email TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL,
                source TEXT NOT NULL,
                name TEXT NOT NULL,
                company TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS product_feedback (
                feedback_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL,
                surface TEXT NOT NULL,
                category TEXT NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL,
                note TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS decision_journal (
                decision_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL,
                title TEXT NOT NULL,
                context TEXT NOT NULL,
                decision_text TEXT NOT NULL,
                rationale TEXT NOT NULL,
                owner TEXT NOT NULL,
                status TEXT NOT NULL,
                due TEXT NOT NULL,
                related_route TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS lead_pipeline (
                lead_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                company_name TEXT NOT NULL,
                archetype TEXT NOT NULL,
                stage TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                campaign_goal TEXT NOT NULL,
                service_pack TEXT NOT NULL,
                wedge_product TEXT NOT NULL,
                starter_modules_json TEXT NOT NULL,
                semi_products_json TEXT NOT NULL,
                outreach_subject TEXT NOT NULL,
                outreach_message TEXT NOT NULL,
                discovery_questions_json TEXT NOT NULL,
                contact_email TEXT NOT NULL,
                contact_phone TEXT NOT NULL,
                website TEXT NOT NULL,
                source TEXT NOT NULL,
                source_url TEXT NOT NULL,
                provider TEXT NOT NULL,
                score INTEGER NOT NULL,
                notes TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS lead_activity (
                activity_id TEXT PRIMARY KEY,
                lead_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                actor TEXT NOT NULL,
                activity_type TEXT NOT NULL,
                channel TEXT NOT NULL,
                direction TEXT NOT NULL,
                message TEXT NOT NULL,
                stage_after TEXT NOT NULL,
                next_step TEXT NOT NULL
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

            CREATE TABLE IF NOT EXISTS receiving_records (
                receiving_id TEXT PRIMARY KEY,
                received_at TEXT NOT NULL,
                supplier TEXT NOT NULL,
                po_or_pi TEXT NOT NULL,
                grn_or_batch TEXT NOT NULL,
                material TEXT NOT NULL,
                expected_qty TEXT NOT NULL,
                received_qty TEXT NOT NULL,
                variance_note TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                next_action TEXT NOT NULL,
                evidence_link TEXT NOT NULL,
                source_ref_json TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS inventory_records (
                inventory_id TEXT PRIMARY KEY,
                captured_at TEXT NOT NULL,
                item_code TEXT NOT NULL,
                item_name TEXT NOT NULL,
                warehouse TEXT NOT NULL,
                on_hand_qty TEXT NOT NULL,
                reserved_qty TEXT NOT NULL,
                available_qty TEXT NOT NULL,
                reorder_point TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT NOT NULL,
                next_action TEXT NOT NULL,
                evidence_link TEXT NOT NULL,
                source_ref_json TEXT NOT NULL,
                synced_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS metric_entries (
                metric_id TEXT PRIMARY KEY,
                captured_at TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                metric_group TEXT NOT NULL,
                metric_value TEXT NOT NULL,
                unit TEXT NOT NULL,
                period_label TEXT NOT NULL,
                scope TEXT NOT NULL,
                owner TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT NOT NULL,
                evidence_link TEXT NOT NULL,
                source_ref_json TEXT NOT NULL,
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

            CREATE TABLE IF NOT EXISTS app_users (
                username TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_sessions (
                session_id TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
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


def _build_receiving_rows(input_center_payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    templates = input_center_payload.get("templates", []) if isinstance(input_center_payload, dict) else []
    for template in templates:
        if str(template.get("key", "")).strip() != "receiving_control_log":
            continue
        sheet_link = str(template.get("web_view_link", "")).strip()
        for recent in template.get("recent_rows", []):
            row = recent.get("row", {}) if isinstance(recent, dict) else {}
            receiving_id = _stable_key(
                "RCV",
                f"{row.get('supplier', '')}:{row.get('po_or_pi', '')}:{row.get('grn_or_batch', '')}:{row.get('__row_number', '')}",
            )
            expected_qty = str(row.get("expected_qty", "")).strip()
            received_qty = str(row.get("received_qty", "")).strip()
            variance_note = "matched"
            if expected_qty and received_qty and expected_qty != received_qty:
                variance_note = f"expected {expected_qty}, received {received_qty}"

            rows.append(
                {
                    "receiving_id": receiving_id,
                    "received_at": str(row.get("received_at", "")).strip(),
                    "supplier": str(row.get("supplier", "")).strip() or "UNKNOWN",
                    "po_or_pi": str(row.get("po_or_pi", "")).strip(),
                    "grn_or_batch": str(row.get("grn_or_batch", "")).strip(),
                    "material": str(row.get("material", "")).strip(),
                    "expected_qty": expected_qty,
                    "received_qty": received_qty,
                    "variance_note": variance_note,
                    "status": str(row.get("status", "")).strip() or "review",
                    "owner": str(row.get("owner", "")).strip() or "Stores Team",
                    "next_action": str(row.get("next_action", "")).strip() or "Review receipt status",
                    "evidence_link": str(row.get("evidence_link", "")).strip(),
                    "source_ref": {
                        "template_key": "receiving_control_log",
                        "sheet_link": sheet_link,
                        "row_number": row.get("__row_number", ""),
                    },
                }
            )
    return rows


def sync_receiving_records(db_path: Path, *, input_center_payload: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(db_path)
    synced_at = datetime.now().astimezone().isoformat()
    rows = _build_receiving_rows(input_center_payload)
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM receiving_records")
        connection.executemany(
            """
            INSERT INTO receiving_records (
                receiving_id,
                received_at,
                supplier,
                po_or_pi,
                grn_or_batch,
                material,
                expected_qty,
                received_qty,
                variance_note,
                status,
                owner,
                next_action,
                evidence_link,
                source_ref_json,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(row.get("receiving_id", "")).strip(),
                    str(row.get("received_at", "")).strip(),
                    str(row.get("supplier", "")).strip(),
                    str(row.get("po_or_pi", "")).strip(),
                    str(row.get("grn_or_batch", "")).strip(),
                    str(row.get("material", "")).strip(),
                    str(row.get("expected_qty", "")).strip(),
                    str(row.get("received_qty", "")).strip(),
                    str(row.get("variance_note", "")).strip(),
                    str(row.get("status", "")).strip(),
                    str(row.get("owner", "")).strip(),
                    str(row.get("next_action", "")).strip(),
                    str(row.get("evidence_link", "")).strip(),
                    json.dumps(row.get("source_ref", {}), ensure_ascii=False),
                    synced_at,
                )
                for row in rows
                if str(row.get("receiving_id", "")).strip()
            ],
        )
        connection.commit()
    return {"status": "ready", "receiving_count": len(rows), "synced_at": synced_at}


def _build_inventory_rows(input_center_payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    templates = input_center_payload.get("templates", []) if isinstance(input_center_payload, dict) else []
    for template in templates:
        if str(template.get("key", "")).strip() != "inventory_pulse_log":
            continue
        sheet_link = str(template.get("web_view_link", "")).strip()
        for recent in template.get("recent_rows", []):
            row = recent.get("row", {}) if isinstance(recent, dict) else {}
            item_code = str(row.get("item_code", "")).strip()
            item_name = str(row.get("item_name", "")).strip() or "Unknown item"
            warehouse = str(row.get("warehouse", "")).strip() or "Main"
            on_hand_qty = str(row.get("on_hand_qty", "")).strip()
            reserved_qty = str(row.get("reserved_qty", "")).strip()
            reorder_point = str(row.get("reorder_point", "")).strip()

            on_hand_num = _coerce_number(on_hand_qty)
            reserved_num = _coerce_number(reserved_qty)
            reorder_num = _coerce_number(reorder_point)
            available_num = None
            if on_hand_num is not None and reserved_num is not None:
                available_num = on_hand_num - reserved_num
            available_qty = (
                f"{available_num:.2f}".rstrip("0").rstrip(".")
                if available_num is not None
                else on_hand_qty
            )

            status = str(row.get("status", "")).strip().lower() or "review"
            if available_num is not None and reorder_num is not None:
                if available_num <= reorder_num:
                    status = "reorder"
                elif available_num <= reorder_num * 1.25:
                    status = "watch"
                elif status == "review":
                    status = "healthy"

            inventory_id = _stable_key(
                "INV",
                f"{item_code}:{item_name}:{warehouse}:{row.get('__row_number', '')}",
            )
            rows.append(
                {
                    "inventory_id": inventory_id,
                    "captured_at": str(row.get("captured_at", "")).strip() or str(row.get("updated_at", "")).strip(),
                    "item_code": item_code,
                    "item_name": item_name,
                    "warehouse": warehouse,
                    "on_hand_qty": on_hand_qty,
                    "reserved_qty": reserved_qty,
                    "available_qty": available_qty,
                    "reorder_point": reorder_point,
                    "status": status,
                    "owner": str(row.get("owner", "")).strip() or "Stores Team",
                    "next_action": str(row.get("next_action", "")).strip() or "Review stock position",
                    "evidence_link": str(row.get("evidence_link", "")).strip(),
                    "source_ref": {
                        "template_key": "inventory_pulse_log",
                        "sheet_link": sheet_link,
                        "row_number": row.get("__row_number", ""),
                    },
                }
            )
    return rows


def sync_inventory_records(db_path: Path, *, input_center_payload: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(db_path)
    synced_at = datetime.now().astimezone().isoformat()
    rows = _build_inventory_rows(input_center_payload)
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM inventory_records")
        connection.executemany(
            """
            INSERT INTO inventory_records (
                inventory_id,
                captured_at,
                item_code,
                item_name,
                warehouse,
                on_hand_qty,
                reserved_qty,
                available_qty,
                reorder_point,
                status,
                owner,
                next_action,
                evidence_link,
                source_ref_json,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    str(row.get("inventory_id", "")).strip(),
                    str(row.get("captured_at", "")).strip(),
                    str(row.get("item_code", "")).strip(),
                    str(row.get("item_name", "")).strip(),
                    str(row.get("warehouse", "")).strip(),
                    str(row.get("on_hand_qty", "")).strip(),
                    str(row.get("reserved_qty", "")).strip(),
                    str(row.get("available_qty", "")).strip(),
                    str(row.get("reorder_point", "")).strip(),
                    str(row.get("status", "")).strip(),
                    str(row.get("owner", "")).strip(),
                    str(row.get("next_action", "")).strip(),
                    str(row.get("evidence_link", "")).strip(),
                    json.dumps(row.get("source_ref", {}), ensure_ascii=False),
                    synced_at,
                )
                for row in rows
                if str(row.get("inventory_id", "")).strip()
            ],
        )
        connection.commit()
    return {"status": "ready", "inventory_count": len(rows), "synced_at": synced_at}


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

    sync_receiving_records(
        db_path,
        input_center_payload=payloads.get("input_center_snapshot", {}) if isinstance(payloads.get("input_center_snapshot", {}), dict) else {},
    )

    sync_inventory_records(
        db_path,
        input_center_payload=payloads.get("input_center_snapshot", {}) if isinstance(payloads.get("input_center_snapshot", {}), dict) else {},
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


def grant_workspace_access(
    db_path: Path,
    *,
    source: str,
    name: str,
    email: str,
    company: str,
    role: str,
    status: str = "active",
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    normalized_email = str(email or "").strip().lower()
    normalized_name = str(name or "").strip()
    normalized_company = str(company or "").strip()
    normalized_role = str(role or "").strip() or "operator"
    normalized_source = str(source or "").strip() or "access_page"
    normalized_status = str(status or "").strip() or "active"
    if not normalized_email:
        raise ValueError("Workspace access requires an email.")

    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO workspace_members (
                email,
                created_at,
                last_seen_at,
                source,
                name,
                company,
                role,
                status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                last_seen_at = excluded.last_seen_at,
                source = excluded.source,
                name = excluded.name,
                company = excluded.company,
                role = excluded.role,
                status = excluded.status
            """,
            (
                normalized_email,
                created_at,
                created_at,
                normalized_source,
                normalized_name,
                normalized_company,
                normalized_role,
                normalized_status,
            ),
        )
        connection.commit()

    return {
        "email": normalized_email,
        "created_at": created_at,
        "last_seen_at": created_at,
        "source": normalized_source,
        "name": normalized_name,
        "company": normalized_company,
        "role": normalized_role,
        "status": normalized_status,
    }


def list_workspace_members(db_path: Path, *, limit: int = 50) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                email,
                created_at,
                last_seen_at,
                source,
                name,
                company,
                role,
                status
            FROM workspace_members
            ORDER BY last_seen_at DESC, email
            LIMIT ?
            """,
            (max(1, int(limit or 50)),),
        ).fetchall()

    return [
        {
            "email": row["email"],
            "created_at": row["created_at"],
            "last_seen_at": row["last_seen_at"],
            "source": row["source"],
            "name": row["name"],
            "company": row["company"],
            "role": row["role"],
            "status": row["status"],
        }
        for row in rows
    ]


def load_workspace_member_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM workspace_members").fetchone()[0])
        active_rows = connection.execute(
            "SELECT COUNT(*) FROM workspace_members WHERE status = 'active'"
        ).fetchone()
        last_seen_row = connection.execute(
            "SELECT last_seen_at FROM workspace_members ORDER BY last_seen_at DESC LIMIT 1"
        ).fetchone()

    return {
        "member_count": total,
        "active_count": int(active_rows[0] if active_rows else 0),
        "last_seen_at": str(last_seen_row["last_seen_at"]) if last_seen_row else "",
    }


def add_lead_pipeline_rows(
    db_path: Path,
    *,
    rows: list[dict[str, Any]],
    campaign_goal: str = "",
    source: str = "lead_to_pilot",
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    inserted_rows: list[dict[str, Any]] = []

    with _connect(db_path) as connection:
        for row in rows:
            company_name = str(row.get("name", "")).strip() or "Unknown lead"
            source_url = str(row.get("source_url", "")).strip()
            website = str(row.get("website", "")).strip()
            contact_email = str(row.get("email", "")).strip()
            contact_phone = str(row.get("phone", "")).strip()
            provider = str(row.get("provider", "")).strip()
            score = int(row.get("score", 0) or 0)
            lead_id = _stable_key(
                "LED",
                f"{company_name}:{source_url or website}:{contact_email}:{contact_phone}",
            )

            normalized_row = {
                "lead_id": lead_id,
                "created_at": created_at,
                "company_name": company_name,
                "archetype": str(row.get("archetype", "")).strip() or "owner_led_business",
                "stage": str(row.get("stage", "")).strip().lower() or "offer_ready",
                "status": str(row.get("status", "")).strip().lower() or "open",
                "owner": str(row.get("owner", "")).strip() or "Growth Studio",
                "campaign_goal": str(campaign_goal or row.get("campaign_goal", "")).strip(),
                "service_pack": str(row.get("service_pack", "")).strip(),
                "wedge_product": str(row.get("wedge_product", "")).strip() or "Action OS",
                "starter_modules": list(row.get("starter_modules", []) or []),
                "semi_products": list(row.get("semi_products", []) or []),
                "outreach_subject": str(row.get("outreach_subject", "")).strip(),
                "outreach_message": str(row.get("outreach_message", "")).strip(),
                "discovery_questions": list(row.get("discovery_questions", []) or []),
                "contact_email": contact_email,
                "contact_phone": contact_phone,
                "website": website,
                "source": str(row.get("source", "")).strip() or source,
                "source_url": source_url,
                "provider": provider,
                "score": score,
                "notes": str(row.get("notes", "")).strip(),
            }

            connection.execute(
                """
                INSERT INTO lead_pipeline (
                    lead_id,
                    created_at,
                    company_name,
                    archetype,
                    stage,
                    status,
                    owner,
                    campaign_goal,
                    service_pack,
                    wedge_product,
                    starter_modules_json,
                    semi_products_json,
                    outreach_subject,
                    outreach_message,
                    discovery_questions_json,
                    contact_email,
                    contact_phone,
                    website,
                    source,
                    source_url,
                    provider,
                    score,
                    notes,
                    synced_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(lead_id) DO UPDATE SET
                    archetype = excluded.archetype,
                    stage = excluded.stage,
                    status = excluded.status,
                    owner = excluded.owner,
                    campaign_goal = excluded.campaign_goal,
                    service_pack = excluded.service_pack,
                    wedge_product = excluded.wedge_product,
                    starter_modules_json = excluded.starter_modules_json,
                    semi_products_json = excluded.semi_products_json,
                    outreach_subject = excluded.outreach_subject,
                    outreach_message = excluded.outreach_message,
                    discovery_questions_json = excluded.discovery_questions_json,
                    contact_email = excluded.contact_email,
                    contact_phone = excluded.contact_phone,
                    website = excluded.website,
                    source = excluded.source,
                    source_url = excluded.source_url,
                    provider = excluded.provider,
                    score = excluded.score,
                    notes = excluded.notes,
                    synced_at = excluded.synced_at
                """,
                (
                    normalized_row["lead_id"],
                    normalized_row["created_at"],
                    normalized_row["company_name"],
                    normalized_row["archetype"],
                    normalized_row["stage"],
                    normalized_row["status"],
                    normalized_row["owner"],
                    normalized_row["campaign_goal"],
                    normalized_row["service_pack"],
                    normalized_row["wedge_product"],
                    json.dumps(normalized_row["starter_modules"], ensure_ascii=False),
                    json.dumps(normalized_row["semi_products"], ensure_ascii=False),
                    normalized_row["outreach_subject"],
                    normalized_row["outreach_message"],
                    json.dumps(normalized_row["discovery_questions"], ensure_ascii=False),
                    normalized_row["contact_email"],
                    normalized_row["contact_phone"],
                    normalized_row["website"],
                    normalized_row["source"],
                    normalized_row["source_url"],
                    normalized_row["provider"],
                    normalized_row["score"],
                    normalized_row["notes"],
                    created_at,
                ),
            )
            inserted_rows.append(normalized_row)
        connection.commit()

    return {
        "status": "ready",
        "saved_count": len(inserted_rows),
        "rows": list_lead_pipeline(db_path, limit=100),
        "summary": load_lead_pipeline_summary(db_path),
        "saved_at": created_at,
    }


def update_lead_pipeline_row(
    db_path: Path,
    *,
    lead_id: str,
    stage: str | None = None,
    status: str | None = None,
    owner: str | None = None,
    notes: str | None = None,
) -> dict[str, Any] | None:
    ensure_schema(db_path)
    normalized_id = str(lead_id or "").strip()
    if not normalized_id:
        return None

    fields: list[str] = []
    params: list[Any] = []
    if stage is not None:
        fields.append("stage = ?")
        params.append(str(stage).strip().lower() or "offer_ready")
    if status is not None:
        fields.append("status = ?")
        params.append(str(status).strip().lower() or "open")
    if owner is not None:
        fields.append("owner = ?")
        params.append(str(owner).strip() or "Growth Studio")
    if notes is not None:
        fields.append("notes = ?")
        params.append(str(notes).strip())
    fields.append("synced_at = ?")
    params.append(datetime.now().astimezone().isoformat())
    params.append(normalized_id)

    with _connect(db_path) as connection:
        connection.execute(
            f"UPDATE lead_pipeline SET {', '.join(fields)} WHERE lead_id = ?",
            params,
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT
                lead_id,
                created_at,
                company_name,
                archetype,
                stage,
                status,
                owner,
                campaign_goal,
                service_pack,
                wedge_product,
                starter_modules_json,
                semi_products_json,
                outreach_subject,
                outreach_message,
                discovery_questions_json,
                contact_email,
                contact_phone,
                website,
                source,
                source_url,
                provider,
                score,
                notes,
                synced_at
            FROM lead_pipeline
            WHERE lead_id = ?
            """,
            (normalized_id,),
        ).fetchone()
    if not row:
        return None
    return _lead_pipeline_row_to_dict(row)


def _lead_pipeline_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "lead_id": row["lead_id"],
        "created_at": row["created_at"],
        "company_name": row["company_name"],
        "archetype": row["archetype"],
        "stage": row["stage"],
        "status": row["status"],
        "owner": row["owner"],
        "campaign_goal": row["campaign_goal"],
        "service_pack": row["service_pack"],
        "wedge_product": row["wedge_product"],
        "starter_modules": json.loads(row["starter_modules_json"]) if row["starter_modules_json"] else [],
        "semi_products": json.loads(row["semi_products_json"]) if row["semi_products_json"] else [],
        "outreach_subject": row["outreach_subject"],
        "outreach_message": row["outreach_message"],
        "discovery_questions": json.loads(row["discovery_questions_json"]) if row["discovery_questions_json"] else [],
        "contact_email": row["contact_email"],
        "contact_phone": row["contact_phone"],
        "website": row["website"],
        "source": row["source"],
        "source_url": row["source_url"],
        "provider": row["provider"],
        "score": int(row["score"] or 0),
        "notes": row["notes"],
        "synced_at": row["synced_at"],
    }


def list_lead_pipeline(
    db_path: Path,
    *,
    stage: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            lead_id,
            created_at,
            company_name,
            archetype,
            stage,
            status,
            owner,
            campaign_goal,
            service_pack,
            wedge_product,
            starter_modules_json,
            semi_products_json,
            outreach_subject,
            outreach_message,
            discovery_questions_json,
            contact_email,
            contact_phone,
            website,
            source,
            source_url,
            provider,
            score,
            notes,
            synced_at
        FROM lead_pipeline
    """
    conditions: list[str] = []
    params: list[Any] = []
    if stage:
        conditions.append("stage = ?")
        params.append(stage)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE stage WHEN 'contact_ready' THEN 0 WHEN 'offer_ready' THEN 1 WHEN 'contacted' THEN 2 WHEN 'discovery' THEN 3 WHEN 'proposal' THEN 4 ELSE 5 END, score DESC, company_name LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [_lead_pipeline_row_to_dict(row) for row in rows]


def load_lead_pipeline_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM lead_pipeline").fetchone()[0])
        stage_rows = connection.execute(
            "SELECT stage, COUNT(*) AS item_count FROM lead_pipeline GROUP BY stage"
        ).fetchall()
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM lead_pipeline GROUP BY status"
        ).fetchall()
        pack_rows = connection.execute(
            "SELECT service_pack, COUNT(*) AS item_count FROM lead_pipeline GROUP BY service_pack ORDER BY item_count DESC, service_pack LIMIT 6"
        ).fetchall()
    return {
        "lead_count": total,
        "by_stage": {str(row["stage"]): int(row["item_count"]) for row in stage_rows},
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "by_pack": {str(row["service_pack"]): int(row["item_count"]) for row in pack_rows},
    }


def add_product_feedback(
    db_path: Path,
    *,
    source: str,
    surface: str,
    category: str,
    priority: str,
    status: str,
    note: str,
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    normalized_source = str(source or "").strip() or "workbench"
    normalized_surface = str(surface or "").strip().lower() or "general"
    normalized_category = str(category or "").strip().lower() or "idea"
    normalized_priority = str(priority or "").strip().lower() or "medium"
    normalized_status = str(status or "").strip().lower() or "open"
    normalized_note = str(note or "").strip()
    feedback_id = _stable_key(
        "FDB",
        f"{normalized_surface}:{normalized_category}:{normalized_priority}:{normalized_note}:{created_at}",
    )

    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO product_feedback (
                feedback_id,
                created_at,
                source,
                surface,
                category,
                priority,
                status,
                note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                feedback_id,
                created_at,
                normalized_source,
                normalized_surface,
                normalized_category,
                normalized_priority,
                normalized_status,
                normalized_note,
            ),
        )
        connection.commit()
    return {
        "feedback_id": feedback_id,
        "created_at": created_at,
        "source": normalized_source,
        "surface": normalized_surface,
        "category": normalized_category,
        "priority": normalized_priority,
        "status": normalized_status,
        "note": normalized_note,
    }


def list_product_feedback(
    db_path: Path,
    *,
    surface: str | None = None,
    status: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            feedback_id,
            created_at,
            source,
            surface,
            category,
            priority,
            status,
            note
        FROM product_feedback
    """
    conditions: list[str] = []
    params: list[Any] = []
    if surface:
        conditions.append("surface = ?")
        params.append(surface)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'review' THEN 1 ELSE 2 END, CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, created_at DESC LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "feedback_id": row["feedback_id"],
            "created_at": row["created_at"],
            "source": row["source"],
            "surface": row["surface"],
            "category": row["category"],
            "priority": row["priority"],
            "status": row["status"],
            "note": row["note"],
        }
        for row in rows
    ]


def add_decision_entry(
    db_path: Path,
    *,
    title: str,
    context: str,
    decision_text: str,
    rationale: str,
    owner: str,
    status: str,
    due: str,
    related_route: str,
    source: str = "app:decision_journal",
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    normalized_title = str(title or "").strip() or "Untitled decision"
    normalized_context = str(context or "").strip()
    normalized_decision = str(decision_text or "").strip()
    normalized_rationale = str(rationale or "").strip()
    normalized_owner = str(owner or "").strip() or "Management"
    normalized_status = str(status or "").strip().lower() or "open"
    normalized_due = str(due or "").strip()
    normalized_route = str(related_route or "").strip()
    decision_id = _stable_key(
        "DEC",
        f"{normalized_title}:{normalized_owner}:{normalized_status}:{normalized_due}:{created_at}",
    )
    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO decision_journal (
                decision_id,
                created_at,
                source,
                title,
                context,
                decision_text,
                rationale,
                owner,
                status,
                due,
                related_route
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                decision_id,
                created_at,
                source,
                normalized_title,
                normalized_context,
                normalized_decision,
                normalized_rationale,
                normalized_owner,
                normalized_status,
                normalized_due,
                normalized_route,
            ),
        )
        connection.commit()
    return {
        "decision_id": decision_id,
        "created_at": created_at,
        "source": source,
        "title": normalized_title,
        "context": normalized_context,
        "decision_text": normalized_decision,
        "rationale": normalized_rationale,
        "owner": normalized_owner,
        "status": normalized_status,
        "due": normalized_due,
        "related_route": normalized_route,
    }


def list_decision_entries(
    db_path: Path,
    *,
    status: str | None = None,
    owner: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            decision_id,
            created_at,
            source,
            title,
            context,
            decision_text,
            rationale,
            owner,
            status,
            due,
            related_route
        FROM decision_journal
    """
    conditions: list[str] = []
    params: list[Any] = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if owner:
        conditions.append("owner = ?")
        params.append(owner)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'review' THEN 1 WHEN 'decided' THEN 2 ELSE 3 END, created_at DESC LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "decision_id": row["decision_id"],
            "created_at": row["created_at"],
            "source": row["source"],
            "title": row["title"],
            "context": row["context"],
            "decision_text": row["decision_text"],
            "rationale": row["rationale"],
            "owner": row["owner"],
            "status": row["status"],
            "due": row["due"],
            "related_route": row["related_route"],
        }
        for row in rows
    ]


def load_decision_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM decision_journal").fetchone()[0])
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM decision_journal GROUP BY status"
        ).fetchall()
        owner_rows = connection.execute(
            "SELECT owner, COUNT(*) AS item_count FROM decision_journal GROUP BY owner ORDER BY item_count DESC, owner LIMIT 5"
        ).fetchall()
    return {
        "decision_count": total,
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "top_owners": [{"owner": str(row["owner"]), "decision_count": int(row["item_count"])} for row in owner_rows],
    }


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


def _derive_receiving_variance(expected_qty: str, received_qty: str) -> str:
    expected = str(expected_qty or "").strip()
    received = str(received_qty or "").strip()
    if expected and received and expected != received:
        return f"expected {expected}, received {received}"
    return "matched"


def add_receiving_record(
    db_path: Path,
    *,
    received_at: str,
    supplier: str,
    po_or_pi: str,
    grn_or_batch: str,
    material: str,
    expected_qty: str,
    received_qty: str,
    status: str,
    owner: str,
    next_action: str,
    evidence_link: str,
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    normalized_received_at = str(received_at or "").strip() or created_at
    normalized_supplier = str(supplier or "").strip() or "Unknown supplier"
    normalized_po = str(po_or_pi or "").strip()
    normalized_grn = str(grn_or_batch or "").strip()
    normalized_material = str(material or "").strip() or "Inbound material"
    normalized_expected = str(expected_qty or "").strip()
    normalized_received = str(received_qty or "").strip()
    normalized_status = str(status or "").strip().lower() or "review"
    normalized_owner = str(owner or "").strip() or "Stores Team"
    normalized_action = str(next_action or "").strip() or "Review receipt status"
    normalized_evidence = str(evidence_link or "").strip()
    receiving_id = _stable_key(
        "RCV",
        f"{normalized_supplier}:{normalized_po}:{normalized_grn}:{normalized_material}:{normalized_received_at}:{created_at}",
    )
    variance_note = _derive_receiving_variance(normalized_expected, normalized_received)
    source_ref = {"source": "tool:receiving_control", "mode": "manual_entry"}

    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO receiving_records (
                receiving_id,
                received_at,
                supplier,
                po_or_pi,
                grn_or_batch,
                material,
                expected_qty,
                received_qty,
                variance_note,
                status,
                owner,
                next_action,
                evidence_link,
                source_ref_json,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                receiving_id,
                normalized_received_at,
                normalized_supplier,
                normalized_po,
                normalized_grn,
                normalized_material,
                normalized_expected,
                normalized_received,
                variance_note,
                normalized_status,
                normalized_owner,
                normalized_action,
                normalized_evidence,
                json.dumps(source_ref),
                created_at,
            ),
        )
        connection.commit()

    return {
        "receiving_id": receiving_id,
        "received_at": normalized_received_at,
        "supplier": normalized_supplier,
        "po_or_pi": normalized_po,
        "grn_or_batch": normalized_grn,
        "material": normalized_material,
        "expected_qty": normalized_expected,
        "received_qty": normalized_received,
        "variance_note": variance_note,
        "status": normalized_status,
        "owner": normalized_owner,
        "next_action": normalized_action,
        "evidence_link": normalized_evidence,
        "source_ref": source_ref,
        "synced_at": created_at,
    }


def _derive_inventory_available_qty(on_hand_qty: str, reserved_qty: str) -> str:
    on_hand_num = _coerce_number(on_hand_qty)
    reserved_num = _coerce_number(reserved_qty)
    if on_hand_num is None or reserved_num is None:
        return ""
    available_num = on_hand_num - reserved_num
    return str(int(available_num)) if available_num.is_integer() else f"{available_num:.2f}".rstrip("0").rstrip(".")


def _derive_inventory_status(status: str, available_qty: str, reorder_point: str) -> str:
    normalized = str(status or "").strip().lower()
    if normalized:
        return normalized
    available_num = _coerce_number(available_qty)
    reorder_num = _coerce_number(reorder_point)
    if available_num is None or reorder_num is None:
        return "review"
    if available_num <= reorder_num:
        return "reorder"
    if available_num <= reorder_num * 1.25:
        return "watch"
    return "healthy"


def add_inventory_record(
    db_path: Path,
    *,
    captured_at: str,
    item_code: str,
    item_name: str,
    warehouse: str,
    on_hand_qty: str,
    reserved_qty: str,
    reorder_point: str,
    status: str,
    owner: str,
    next_action: str,
    evidence_link: str,
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    normalized_captured_at = str(captured_at or "").strip() or created_at
    normalized_item_code = str(item_code or "").strip()
    normalized_item_name = str(item_name or "").strip() or "Unknown item"
    normalized_warehouse = str(warehouse or "").strip() or "Main Warehouse"
    normalized_on_hand = str(on_hand_qty or "").strip()
    normalized_reserved = str(reserved_qty or "").strip()
    normalized_reorder = str(reorder_point or "").strip()
    available_qty = _derive_inventory_available_qty(normalized_on_hand, normalized_reserved)
    normalized_status = _derive_inventory_status(status, available_qty, normalized_reorder)
    normalized_owner = str(owner or "").strip() or "Stores Team"
    normalized_action = str(next_action or "").strip() or "Review stock position"
    normalized_evidence = str(evidence_link or "").strip()
    inventory_id = _stable_key(
        "INV",
        f"{normalized_item_code}:{normalized_item_name}:{normalized_warehouse}:{normalized_captured_at}:{created_at}",
    )
    source_ref = {"source": "tool:inventory_pulse", "mode": "manual_entry"}

    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO inventory_records (
                inventory_id,
                captured_at,
                item_code,
                item_name,
                warehouse,
                on_hand_qty,
                reserved_qty,
                available_qty,
                reorder_point,
                status,
                owner,
                next_action,
                evidence_link,
                source_ref_json,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                inventory_id,
                normalized_captured_at,
                normalized_item_code,
                normalized_item_name,
                normalized_warehouse,
                normalized_on_hand,
                normalized_reserved,
                available_qty,
                normalized_reorder,
                normalized_status,
                normalized_owner,
                normalized_action,
                normalized_evidence,
                json.dumps(source_ref),
                created_at,
            ),
        )
        connection.commit()

    return {
        "inventory_id": inventory_id,
        "captured_at": normalized_captured_at,
        "item_code": normalized_item_code,
        "item_name": normalized_item_name,
        "warehouse": normalized_warehouse,
        "on_hand_qty": normalized_on_hand,
        "reserved_qty": normalized_reserved,
        "available_qty": available_qty,
        "reorder_point": normalized_reorder,
        "status": normalized_status,
        "owner": normalized_owner,
        "next_action": normalized_action,
        "evidence_link": normalized_evidence,
        "source_ref": source_ref,
        "synced_at": created_at,
    }


def add_metric_entry(
    db_path: Path,
    *,
    captured_at: str,
    metric_name: str,
    metric_group: str,
    metric_value: str,
    unit: str,
    period_label: str,
    scope: str,
    owner: str,
    status: str,
    notes: str,
    evidence_link: str,
    source_mode: str = "manual_entry",
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone().isoformat()
    normalized_captured_at = str(captured_at or "").strip() or created_at
    normalized_name = str(metric_name or "").strip() or "metric_value"
    normalized_group = str(metric_group or "").strip().lower() or "general"
    normalized_value = str(metric_value or "").strip()
    normalized_unit = str(unit or "").strip() or "value"
    normalized_period = str(period_label or "").strip()
    normalized_scope = str(scope or "").strip()
    normalized_owner = str(owner or "").strip() or "Management"
    normalized_status = str(status or "").strip().lower() or "reported"
    normalized_notes = str(notes or "").strip()
    normalized_evidence = str(evidence_link or "").strip()
    metric_id = _stable_key(
        "MET",
        f"{normalized_name}:{normalized_group}:{normalized_scope}:{normalized_captured_at}:{normalized_value}:{created_at}",
    )
    source_ref = {"source": "tool:metric_intake", "mode": source_mode}

    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO metric_entries (
                metric_id,
                captured_at,
                metric_name,
                metric_group,
                metric_value,
                unit,
                period_label,
                scope,
                owner,
                status,
                notes,
                evidence_link,
                source_ref_json,
                synced_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                metric_id,
                normalized_captured_at,
                normalized_name,
                normalized_group,
                normalized_value,
                normalized_unit,
                normalized_period,
                normalized_scope,
                normalized_owner,
                normalized_status,
                normalized_notes,
                normalized_evidence,
                json.dumps(source_ref),
                created_at,
            ),
        )
        connection.commit()

    return {
        "metric_id": metric_id,
        "captured_at": normalized_captured_at,
        "metric_name": normalized_name,
        "metric_group": normalized_group,
        "metric_value": normalized_value,
        "unit": normalized_unit,
        "period_label": normalized_period,
        "scope": normalized_scope,
        "owner": normalized_owner,
        "status": normalized_status,
        "notes": normalized_notes,
        "evidence_link": normalized_evidence,
        "source_ref": source_ref,
        "synced_at": created_at,
    }


def add_metric_entries(db_path: Path, *, rows: list[dict[str, Any]], source_mode: str = "extracted_file") -> dict[str, Any]:
    ensure_schema(db_path)
    created_rows: list[dict[str, Any]] = []
    for row in rows:
        created_rows.append(
            add_metric_entry(
                db_path,
                captured_at=str(row.get("captured_at", "")).strip(),
                metric_name=str(row.get("metric_name", "")).strip(),
                metric_group=str(row.get("metric_group", "")).strip(),
                metric_value=str(row.get("metric_value", "")).strip(),
                unit=str(row.get("unit", "")).strip(),
                period_label=str(row.get("period_label", "")).strip(),
                scope=str(row.get("scope", "")).strip(),
                owner=str(row.get("owner", "")).strip(),
                status=str(row.get("status", "")).strip(),
                notes=str(row.get("notes", "")).strip(),
                evidence_link=str(row.get("evidence_link", "")).strip(),
                source_mode=source_mode,
            )
        )
    return {
        "status": "ready",
        "saved_count": len(created_rows),
        "rows": list_metric_entries(db_path, limit=100),
        "summary": load_metric_summary(db_path),
    }


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


def list_receiving_records(
    db_path: Path,
    *,
    supplier: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            receiving_id,
            received_at,
            supplier,
            po_or_pi,
            grn_or_batch,
            material,
            expected_qty,
            received_qty,
            variance_note,
            status,
            owner,
            next_action,
            evidence_link,
            source_ref_json,
            synced_at
        FROM receiving_records
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
    query += " ORDER BY received_at DESC, supplier, material LIMIT ?"
    params.append(max(1, int(limit)))

    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "receiving_id": row["receiving_id"],
            "received_at": row["received_at"],
            "supplier": row["supplier"],
            "po_or_pi": row["po_or_pi"],
            "grn_or_batch": row["grn_or_batch"],
            "material": row["material"],
            "expected_qty": row["expected_qty"],
            "received_qty": row["received_qty"],
            "variance_note": row["variance_note"],
            "status": row["status"],
            "owner": row["owner"],
            "next_action": row["next_action"],
            "evidence_link": row["evidence_link"],
            "source_ref": json.loads(row["source_ref_json"]) if row["source_ref_json"] else {},
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def load_receiving_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM receiving_records").fetchone()[0])
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM receiving_records GROUP BY status"
        ).fetchall()
        supplier_rows = connection.execute(
            "SELECT supplier, COUNT(*) AS item_count FROM receiving_records GROUP BY supplier ORDER BY item_count DESC, supplier LIMIT 5"
        ).fetchall()
        variance_rows = connection.execute(
            "SELECT COUNT(*) FROM receiving_records WHERE variance_note != 'matched'"
        ).fetchone()
        hold_rows = connection.execute(
            "SELECT COUNT(*) FROM receiving_records WHERE status IN ('hold', 'blocked', 'review')"
        ).fetchone()
    return {
        "receiving_count": total,
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "variance_count": int(variance_rows[0] if variance_rows else 0),
        "hold_count": int(hold_rows[0] if hold_rows else 0),
        "top_suppliers": [
            {"supplier": str(row["supplier"]), "receiving_count": int(row["item_count"])}
            for row in supplier_rows
        ],
    }


def list_inventory_records(
    db_path: Path,
    *,
    warehouse: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            inventory_id,
            captured_at,
            item_code,
            item_name,
            warehouse,
            on_hand_qty,
            reserved_qty,
            available_qty,
            reorder_point,
            status,
            owner,
            next_action,
            evidence_link,
            source_ref_json,
            synced_at
        FROM inventory_records
    """
    conditions: list[str] = []
    params: list[Any] = []
    if warehouse:
        conditions.append("warehouse = ?")
        params.append(warehouse)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY CASE status WHEN 'reorder' THEN 0 WHEN 'watch' THEN 1 WHEN 'review' THEN 2 ELSE 3 END, item_name LIMIT ?"
    params.append(max(1, int(limit)))

    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "inventory_id": row["inventory_id"],
            "captured_at": row["captured_at"],
            "item_code": row["item_code"],
            "item_name": row["item_name"],
            "warehouse": row["warehouse"],
            "on_hand_qty": row["on_hand_qty"],
            "reserved_qty": row["reserved_qty"],
            "available_qty": row["available_qty"],
            "reorder_point": row["reorder_point"],
            "status": row["status"],
            "owner": row["owner"],
            "next_action": row["next_action"],
            "evidence_link": row["evidence_link"],
            "source_ref": json.loads(row["source_ref_json"]) if row["source_ref_json"] else {},
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def load_inventory_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM inventory_records").fetchone()[0])
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM inventory_records GROUP BY status"
        ).fetchall()
        warehouse_rows = connection.execute(
            "SELECT warehouse, COUNT(*) AS item_count FROM inventory_records GROUP BY warehouse ORDER BY item_count DESC, warehouse LIMIT 5"
        ).fetchall()
        reorder_rows = connection.execute(
            "SELECT COUNT(*) FROM inventory_records WHERE status = 'reorder'"
        ).fetchone()
        watch_rows = connection.execute(
            "SELECT COUNT(*) FROM inventory_records WHERE status = 'watch'"
        ).fetchone()
    return {
        "inventory_count": total,
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "reorder_count": int(reorder_rows[0] if reorder_rows else 0),
        "watch_count": int(watch_rows[0] if watch_rows else 0),
        "top_warehouses": [
            {"warehouse": str(row["warehouse"]), "item_count": int(row["item_count"])}
            for row in warehouse_rows
        ],
    }


def list_metric_entries(
    db_path: Path,
    *,
    metric_group: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    query = """
        SELECT
            metric_id,
            captured_at,
            metric_name,
            metric_group,
            metric_value,
            unit,
            period_label,
            scope,
            owner,
            status,
            notes,
            evidence_link,
            source_ref_json,
            synced_at
        FROM metric_entries
    """
    conditions: list[str] = []
    params: list[Any] = []
    if metric_group:
        conditions.append("metric_group = ?")
        params.append(metric_group)
    if status:
        conditions.append("status = ?")
        params.append(status)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY captured_at DESC, metric_group, metric_name LIMIT ?"
    params.append(max(1, int(limit)))
    with _connect(db_path) as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            "metric_id": row["metric_id"],
            "captured_at": row["captured_at"],
            "metric_name": row["metric_name"],
            "metric_group": row["metric_group"],
            "metric_value": row["metric_value"],
            "unit": row["unit"],
            "period_label": row["period_label"],
            "scope": row["scope"],
            "owner": row["owner"],
            "status": row["status"],
            "notes": row["notes"],
            "evidence_link": row["evidence_link"],
            "source_ref": json.loads(row["source_ref_json"]) if row["source_ref_json"] else {},
            "synced_at": row["synced_at"],
        }
        for row in rows
    ]


def load_metric_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM metric_entries").fetchone()[0])
        group_rows = connection.execute(
            "SELECT metric_group, COUNT(*) AS item_count FROM metric_entries GROUP BY metric_group ORDER BY item_count DESC, metric_group LIMIT 8"
        ).fetchall()
        status_rows = connection.execute(
            "SELECT status, COUNT(*) AS item_count FROM metric_entries GROUP BY status"
        ).fetchall()
    return {
        "metric_count": total,
        "by_group": {str(row["metric_group"]): int(row["item_count"]) for row in group_rows},
        "by_status": {str(row["status"]): int(row["item_count"]) for row in status_rows},
        "top_groups": [
            {"metric_group": str(row["metric_group"]), "item_count": int(row["item_count"])}
            for row in group_rows
        ],
    }


def load_product_feedback_summary(db_path: Path) -> dict[str, Any]:
    ensure_schema(db_path)
    with _connect(db_path) as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM product_feedback").fetchone()[0])
        open_rows = connection.execute(
            "SELECT COUNT(*) FROM product_feedback WHERE status IN ('open', 'review')"
        ).fetchone()
        high_rows = connection.execute(
            "SELECT COUNT(*) FROM product_feedback WHERE priority = 'high'"
        ).fetchone()
        category_rows = connection.execute(
            "SELECT category, COUNT(*) AS item_count FROM product_feedback GROUP BY category ORDER BY item_count DESC, category LIMIT 8"
        ).fetchall()
    return {
        "feedback_count": total,
        "open_count": int(open_rows[0] if open_rows else 0),
        "high_priority_count": int(high_rows[0] if high_rows else 0),
        "by_category": {str(row["category"]): int(row["item_count"]) for row in category_rows},
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


def _hash_password(password: str) -> str:
    return hashlib.sha256(str(password or "").encode("utf-8")).hexdigest()


def ensure_app_user(
    db_path: Path,
    *,
    username: str,
    password: str,
    display_name: str = "",
    role: str = "owner",
) -> dict[str, Any]:
    ensure_schema(db_path)
    normalized_username = str(username or "").strip().lower()
    normalized_password = str(password or "").strip()
    normalized_display_name = str(display_name or "").strip() or normalized_username or "Owner"
    normalized_role = str(role or "").strip() or "owner"
    if not normalized_username or not normalized_password:
        return {"status": "skipped", "message": "Username or password is missing."}

    now = datetime.now().astimezone().isoformat()
    password_hash = _hash_password(normalized_password)
    with _connect(db_path) as connection:
        existing = connection.execute(
            "SELECT username, display_name, role, status, created_at FROM app_users WHERE username = ?",
            (normalized_username,),
        ).fetchone()
        if existing:
            connection.execute(
                """
                UPDATE app_users
                SET display_name = ?,
                    password_hash = ?,
                    role = ?,
                    status = 'active',
                    updated_at = ?
                WHERE username = ?
                """,
                (normalized_display_name, password_hash, normalized_role, now, normalized_username),
            )
        else:
            connection.execute(
                """
                INSERT INTO app_users (
                    username,
                    display_name,
                    password_hash,
                    role,
                    status,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, 'active', ?, ?)
                """,
                (normalized_username, normalized_display_name, password_hash, normalized_role, now, now),
            )
        connection.commit()

    return {
        "status": "ready",
        "username": normalized_username,
        "display_name": normalized_display_name,
        "role": normalized_role,
    }


def authenticate_app_user(db_path: Path, *, username: str, password: str) -> dict[str, Any] | None:
    ensure_schema(db_path)
    normalized_username = str(username or "").strip().lower()
    password_hash = _hash_password(password)
    with _connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT username, display_name, role, status
            FROM app_users
            WHERE username = ? AND password_hash = ?
            """,
            (normalized_username, password_hash),
        ).fetchone()
    if not row or str(row["status"]).strip().lower() != "active":
        return None
    return {
        "username": row["username"],
        "display_name": row["display_name"],
        "role": row["role"],
        "status": row["status"],
    }


def create_app_session(
    db_path: Path,
    *,
    username: str,
    role: str,
    ttl_hours: int = 24 * 14,
) -> dict[str, Any]:
    ensure_schema(db_path)
    created_at = datetime.now().astimezone()
    expires_at = created_at + timedelta(hours=max(ttl_hours, 1))
    session_id = secrets.token_urlsafe(32)
    payload = {
        "session_id": session_id,
        "username": str(username or "").strip().lower(),
        "role": str(role or "").strip() or "owner",
        "created_at": created_at.isoformat(),
        "expires_at": expires_at.isoformat(),
        "last_seen_at": created_at.isoformat(),
    }
    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO app_sessions (
                session_id,
                username,
                role,
                created_at,
                expires_at,
                last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                payload["session_id"],
                payload["username"],
                payload["role"],
                payload["created_at"],
                payload["expires_at"],
                payload["last_seen_at"],
            ),
        )
        connection.commit()
    return payload


def get_app_session(db_path: Path, *, session_id: str) -> dict[str, Any] | None:
    ensure_schema(db_path)
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return None

    now = datetime.now().astimezone()
    with _connect(db_path) as connection:
        row = connection.execute(
            """
            SELECT session_id, username, role, created_at, expires_at, last_seen_at
            FROM app_sessions
            WHERE session_id = ?
            """,
            (normalized_session_id,),
        ).fetchone()
        if not row:
            return None

        expires_at = datetime.fromisoformat(str(row["expires_at"]))
        if expires_at <= now:
            connection.execute("DELETE FROM app_sessions WHERE session_id = ?", (normalized_session_id,))
            connection.commit()
            return None

        last_seen = now.isoformat()
        connection.execute(
            "UPDATE app_sessions SET last_seen_at = ? WHERE session_id = ?",
            (last_seen, normalized_session_id),
        )
        connection.commit()

    return {
        "session_id": row["session_id"],
        "username": row["username"],
        "role": row["role"],
        "created_at": row["created_at"],
        "expires_at": row["expires_at"],
        "last_seen_at": now.isoformat(),
    }


def revoke_app_session(db_path: Path, *, session_id: str) -> None:
    ensure_schema(db_path)
    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        return
    with _connect(db_path) as connection:
        connection.execute("DELETE FROM app_sessions WHERE session_id = ?", (normalized_session_id,))
        connection.commit()


def add_lead_activity(
    db_path: Path,
    *,
    lead_id: str,
    actor: str,
    activity_type: str,
    channel: str,
    direction: str,
    message: str,
    stage_after: str = "",
    next_step: str = "",
) -> dict[str, Any]:
    ensure_schema(db_path)
    normalized_lead_id = str(lead_id or "").strip()
    created_at = datetime.now().astimezone().isoformat()
    activity_id = _stable_key(
        "ACT",
        "|".join(
            [
                normalized_lead_id,
                str(activity_type or "").strip(),
                str(channel or "").strip(),
                created_at,
                str(message or "").strip(),
            ]
        ),
    )
    payload = {
        "activity_id": activity_id,
        "lead_id": normalized_lead_id,
        "created_at": created_at,
        "actor": str(actor or "").strip() or "Growth Studio",
        "activity_type": str(activity_type or "").strip() or "note",
        "channel": str(channel or "").strip() or "manual",
        "direction": str(direction or "").strip() or "internal",
        "message": str(message or "").strip(),
        "stage_after": str(stage_after or "").strip(),
        "next_step": str(next_step or "").strip(),
    }
    with _connect(db_path) as connection:
        connection.execute(
            """
            INSERT INTO lead_activity (
                activity_id,
                lead_id,
                created_at,
                actor,
                activity_type,
                channel,
                direction,
                message,
                stage_after,
                next_step
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["activity_id"],
                payload["lead_id"],
                payload["created_at"],
                payload["actor"],
                payload["activity_type"],
                payload["channel"],
                payload["direction"],
                payload["message"],
                payload["stage_after"],
                payload["next_step"],
            ),
        )
        if payload["stage_after"]:
            status = "active" if payload["stage_after"] in {"contacted", "discovery", "proposal"} else "open"
            connection.execute(
                """
                UPDATE lead_pipeline
                SET stage = ?, status = ?, notes = ?, synced_at = ?
                WHERE lead_id = ?
                """,
                (
                    payload["stage_after"],
                    status,
                    payload["next_step"] or payload["message"],
                    created_at,
                    payload["lead_id"],
                ),
            )
        connection.commit()
    return payload


def list_lead_activity(db_path: Path, *, lead_id: str, limit: int = 20) -> list[dict[str, Any]]:
    ensure_schema(db_path)
    normalized_lead_id = str(lead_id or "").strip()
    with _connect(db_path) as connection:
        rows = connection.execute(
            """
            SELECT
                activity_id,
                lead_id,
                created_at,
                actor,
                activity_type,
                channel,
                direction,
                message,
                stage_after,
                next_step
            FROM lead_activity
            WHERE lead_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (normalized_lead_id, max(limit, 1)),
        ).fetchall()
    return [
        {
            "activity_id": row["activity_id"],
            "lead_id": row["lead_id"],
            "created_at": row["created_at"],
            "actor": row["actor"],
            "activity_type": row["activity_type"],
            "channel": row["channel"],
            "direction": row["direction"],
            "message": row["message"],
            "stage_after": row["stage_after"],
            "next_step": row["next_step"],
        }
        for row in rows
    ]
