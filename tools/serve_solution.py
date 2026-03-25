from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mark1_pilot.state_store import (  # noqa: E402
    add_action_items,
    add_attendance_event,
    add_contact_submission,
    add_inventory_record,
    add_receiving_record,
    list_actions,
    list_agent_teams,
    list_attendance_events,
    list_capa_actions,
    list_contact_submissions,
    list_inventory_records,
    list_receiving_records,
    list_quality_incidents,
    list_supplier_risks,
    load_action_summary,
    load_agent_team_summary,
    load_inventory_summary,
    load_receiving_summary,
    load_quality_summary,
    load_snapshot,
    load_supplier_risk_summary,
    resolve_state_db,
    sync_state_from_output_dir,
)
from mark1_pilot.lead_finder import run_lead_finder  # noqa: E402
from mark1_pilot.document_intake import analyze_document  # noqa: E402
from mark1_pilot.solution_architect import build_solution_blueprint  # noqa: E402


class LeadFinderRequest(BaseModel):
    raw_text: str = Field(default="")
    query: str = Field(default="")
    keywords: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=lambda: ["web", "social", "maps"])
    limit: int = Field(default=10, ge=1, le=20)


class NewsBriefRequest(BaseModel):
    raw_text: str = Field(default="")
    urls: list[str] = Field(default_factory=list)


class ActionBoardRequest(BaseModel):
    raw_text: str = Field(default="")


class ActionBoardSaveRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)


class ContactSubmissionRequest(BaseModel):
    name: str
    email: str
    company: str
    workflow: str
    data: str
    goal: str


class AttendanceCheckinRequest(BaseModel):
    employee_name: str
    employee_code: str = ""
    shift_name: str = ""
    station: str = ""
    status: str = "present"
    method: str = "photo_checkin"
    evidence_url: str = ""
    note: str = ""


class ReceivingRecordRequest(BaseModel):
    received_at: str = ""
    supplier: str
    po_or_pi: str = ""
    grn_or_batch: str = ""
    material: str
    expected_qty: str = ""
    received_qty: str = ""
    status: str = "review"
    owner: str = "Stores Team"
    next_action: str = ""
    evidence_link: str = ""


class InventoryRecordRequest(BaseModel):
    captured_at: str = ""
    item_code: str = ""
    item_name: str
    warehouse: str = "Main Warehouse"
    on_hand_qty: str = ""
    reserved_qty: str = ""
    reorder_point: str = ""
    status: str = ""
    owner: str = "Stores Team"
    next_action: str = ""
    evidence_link: str = ""


class DocumentIntakeRequest(BaseModel):
    filename: str
    content_base64: str


class SolutionArchitectRequest(BaseModel):
    company_name: str = "New Client"
    sector: str = "mixed"
    team_size: int = 25
    site_count: int = 1
    priorities: list[str] = Field(default_factory=list)
    current_tools: list[str] = Field(default_factory=list)
    data_sources: list[str] = Field(default_factory=list)
    pain_points: str = ""


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _unique_values(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = str(value or "").strip().rstrip("),.;")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def _parse_leads(raw_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    lines = [line.strip() for line in str(raw_text or "").splitlines() if line.strip()]
    for line in lines:
        emails = _unique_values(re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", line, flags=re.I))
        websites = _unique_values(re.findall(r"(?:https?://|www\.)[^\s,;]+", line, flags=re.I))
        phones = _unique_values([re.sub(r"\s+", " ", match).strip() for match in re.findall(r"\+?\d[\d\s\-()]{7,}\d", line)])

        score = 0
        if emails:
            score += 2
        if websites:
            score += 2
        if phones:
            score += 1
        if re.search(r"(tyre|tire|truck|industrial|distributor|auto|service|retail|buyer)", line, flags=re.I):
            score += 2

        rows.append(
            {
                "name": line.split("|")[0].split(",")[0].strip() or "Unknown lead",
                "email": emails[0] if emails else "",
                "phone": phones[0] if phones else "",
                "website": websites[0] if websites else "",
                "score": score,
            }
        )
    return sorted(rows, key=lambda item: (-int(item.get("score", 0)), str(item.get("name", ""))))[:15]


def _build_news_brief(raw_text: str) -> dict[str, Any]:
    lowered = str(raw_text or "").lower()
    themes: list[str] = []
    watch_items: list[str] = []
    actions: list[str] = []

    def add(theme: str, watch: str, action: str) -> None:
        if theme not in themes:
            themes.append(theme)
        if watch not in watch_items:
            watch_items.append(watch)
        if action not in actions:
            actions.append(action)

    if re.search(r"(fuel|logistics|shipment|eta|port|customs|delay)", lowered):
        add("Supply", "Supply chain pressure is showing up in logistics or fuel movement.", "Check shipment timing and inbound exposure today.")
    if re.search(r"(rss|rubber|price|cost|usd|currency|kyat)", lowered):
        add("Cost", "Input cost or raw material pricing moved in the latest signal set.", "Compare raw material movement against current buying assumptions.")
    if re.search(r"(policy|tax|regulation|permit|import|export|government)", lowered):
        add("Policy", "Policy or clearance conditions may change timing or handling.", "Review exposure to import or compliance changes.")
    if re.search(r"(demand|sales|distributor|customer|market|truck tyre|truck tire|retail)", lowered):
        add("Demand", "Commercial demand is shifting by channel, product, or buyer type.", "Push the latest demand signal into sales and procurement review.")

    if not themes:
        themes.append("General")
        watch_items.append("Signals were detected but still need manual categorization.")
        actions.append("Review the incoming notes and set one owner for follow-up.")

    summary = f"{themes[0]} moved in the latest signal set." if len(themes) == 1 else f"{themes[0]} and {themes[1]} moved in the latest signal set."
    return {"summary": summary, "themes": themes[:4], "watch_items": watch_items[:4], "actions": actions[:4]}


def _strip_html(value: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", str(value or ""))
    cleaned = unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _fetch_url_brief_context(urls: list[str]) -> list[str]:
    snippets: list[str] = []
    for raw_url in urls[:4]:
        normalized = str(raw_url or "").strip()
        if not normalized:
            continue
        if not normalized.startswith(("http://", "https://")):
            normalized = f"https://{normalized}"
        try:
            request = Request(
                normalized,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            with urlopen(request, timeout=15) as response:
                html = response.read(120_000).decode("utf-8", errors="ignore")
        except Exception:
            continue

        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
        title = _strip_html(title_match.group(1)) if title_match else urlparse(normalized).netloc
        body = _strip_html(html[:6000])
        if body:
            snippets.append(f"{title}. {body[:800]}")
    return snippets


def _infer_owner(text: str) -> str:
    lowered = str(text or "").lower()
    if re.search(r"(quality|defect|capa|reject|inspection|bead wire|ncr)", lowered):
        return "Quality"
    if re.search(r"(supplier|customs|eta|shipment|po|docs|procurement|junky|kiic)", lowered):
        return "Procurement"
    if re.search(r"(cash|invoice|payment|overdue|collection|finance)", lowered):
        return "Finance"
    if re.search(r"(sales|demand|distributor|customer|market)", lowered):
        return "Sales"
    if re.search(r"(plant|production|power|shift|downtime|operations)", lowered):
        return "Operations"
    return "Management"


def _infer_priority(text: str) -> str:
    lowered = str(text or "").lower()
    if re.search(r"(defect|delay|blocked|overdue|urgent|customs|power|shortage|risk)", lowered):
        return "High"
    if re.search(r"(confirm|review|check|follow|inspect)", lowered):
        return "Medium"
    return "Low"


def _build_action_rows(raw_text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in [item.strip() for item in str(raw_text or "").splitlines() if item.strip()]:
        priority = _infer_priority(line)
        rows.append(
            {
                "title": line.split("|")[0].strip() or line,
                "owner": _infer_owner(line),
                "priority": priority,
                "due": "Today" if priority == "High" else "This week" if priority == "Medium" else "Next review",
            }
        )
    return rows


def create_app(site_root: Path, pilot_data: Path) -> FastAPI:
    site_root = site_root.expanduser().resolve()
    pilot_data = pilot_data.expanduser().resolve()
    state_db = resolve_state_db(pilot_data)
    sync_state_from_output_dir(pilot_data)

    app = FastAPI(title="SuperMega Service", version="0.2.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        review = _load_json(pilot_data / "execution_review.json")
        autopilot = _load_json(pilot_data / "autopilot_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        return {
            "status": "ready",
            "service": "supermega-service",
            "site_root": str(site_root),
            "pilot_data": str(pilot_data),
            "state_db": str(state_db),
            "review_status": review.get("status", "unknown"),
            "autopilot_status": autopilot.get("status", "unknown"),
            "coverage_score": int(coverage.get("readiness_score", 0) or 0),
        }

    @app.get("/api/summary")
    def summary() -> dict[str, Any]:
        review = _load_json(pilot_data / "execution_review.json")
        autopilot = _load_json(pilot_data / "autopilot_status.json")
        coverage = _load_json(pilot_data / "data_coverage_report.json")
        publish = _load_json(pilot_data / "platform_publish.json")
        product_lab = load_snapshot(state_db, "product_lab") or _load_json(pilot_data / "product_lab.json")
        action_summary = load_action_summary(state_db)
        agent_team_summary = load_agent_team_summary(state_db)
        quality_summary = load_quality_summary(state_db)
        supplier_summary = load_supplier_risk_summary(state_db)
        receiving_summary = load_receiving_summary(state_db)
        inventory_summary = load_inventory_summary(state_db)
        portfolio = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )
        platform_digest = load_snapshot(state_db, "platform_digest") or _load_json(pilot_data / "platform_digest.json")
        supervisor = _load_json(pilot_data / "supervisor_status.json")
        return {
            "status": "ready",
            "review": {
                "project_status": review.get("project_status", {}),
                "top_priorities": review.get("top_priorities", []),
            },
            "autopilot": {
                "status": autopilot.get("status", "unknown"),
                "required_failure_count": int(autopilot.get("required_failure_count", 0) or 0),
                "optional_failure_count": int(autopilot.get("optional_failure_count", 0) or 0),
            },
            "coverage_score": int(coverage.get("readiness_score", 0) or 0),
            "actions": action_summary,
            "agent_system": agent_team_summary,
            "quality": quality_summary,
            "supplier_watch": supplier_summary,
            "receiving": receiving_summary,
            "inventory": inventory_summary,
            "product_lab": {
                "flagship_status": product_lab.get("summary", {}).get("flagship_status", ""),
                "pilot_ready_count": product_lab.get("summary", {}).get("pilot_ready_count", 0),
                "live_demo_count": product_lab.get("summary", {}).get("live_demo_count", 0),
            },
            "workspace": {
                "drive_folder_link": publish.get("workspace_link", ""),
                "google_doc_link": publish.get("google_doc_link", ""),
            },
            "role_views": platform_digest.get("role_views", {}) if isinstance(platform_digest, dict) else {},
            "supervisor": {
                "status": supervisor.get("status", ""),
                "cycle_count": supervisor.get("cycle_count", 0),
                "last_finished_at": supervisor.get("last_finished_at", ""),
                "interval_minutes": supervisor.get("interval_minutes", 0),
            },
            "portfolio": portfolio,
        }

    @app.get("/api/actions")
    def actions(lane: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        items = list_actions(state_db, lane=lane, status=status, limit=limit)
        return {"status": "ready", "count": len(items), "items": items}

    @app.post("/api/tools/lead-finder")
    def tool_lead_finder(request: LeadFinderRequest) -> dict[str, Any]:
        result = run_lead_finder(
            raw_text=request.raw_text,
            query=request.query,
            keywords=request.keywords,
            sources=request.sources,
            limit=request.limit,
        )
        rows = result.get("rows", []) if isinstance(result, dict) else []
        return {
            "status": "ready",
            "count": len(rows),
            "provider": result.get("provider", ""),
            "keywords": result.get("keywords", []),
            "rows": rows,
        }

    @app.post("/api/tools/news-brief")
    def tool_news_brief(request: NewsBriefRequest) -> dict[str, Any]:
        hydrated_parts = [request.raw_text.strip()]
        hydrated_parts.extend(_fetch_url_brief_context(request.urls))
        payload = "\n".join(part for part in hydrated_parts if part)
        return {
            "status": "ready",
            "source_count": len([url for url in request.urls if str(url).strip()]),
            **_build_news_brief(payload),
        }

    @app.post("/api/tools/document-intake")
    def tool_document_intake(request: DocumentIntakeRequest) -> dict[str, Any]:
        return {"status": "ready", "analysis": analyze_document(request.filename, request.content_base64)}

    @app.post("/api/tools/solution-architect")
    def tool_solution_architect(request: SolutionArchitectRequest) -> dict[str, Any]:
        return {"status": "ready", "blueprint": build_solution_blueprint(request.model_dump())}

    @app.post("/api/tools/action-board")
    def tool_action_board(request: ActionBoardRequest) -> dict[str, Any]:
        rows = _build_action_rows(request.raw_text)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/tools/action-board/save")
    def tool_action_board_save(request: ActionBoardSaveRequest) -> dict[str, Any]:
        payload = add_action_items(state_db, rows=request.rows, source="tool:action_board", lane="do_now")
        return payload

    @app.get("/api/portfolio")
    def portfolio() -> dict[str, Any]:
        payload = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )
        return {"status": "ready", "payload": payload}

    @app.get("/api/supermega/operating-model")
    def supermega_operating_model() -> dict[str, Any]:
        payload = _load_json(REPO_ROOT / "Super Mega Inc" / "runbooks" / "supermega_os_architecture_manifest_2026-03-26.json")
        return {"status": "ready", "payload": payload}

    @app.get("/api/quality/incidents")
    def quality_incidents(status: str | None = None, limit: int = 100) -> dict[str, Any]:
        rows = list_quality_incidents(state_db, status=status, limit=limit)
        return {"status": "ready", "summary": load_quality_summary(state_db), "count": len(rows), "rows": rows}

    @app.get("/api/quality/capa")
    def quality_capa(status: str | None = None, limit: int = 100) -> dict[str, Any]:
        rows = list_capa_actions(state_db, status=status, limit=limit)
        return {"status": "ready", "summary": load_quality_summary(state_db), "count": len(rows), "rows": rows}

    @app.get("/api/suppliers/risks")
    def supplier_risks(supplier: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        rows = list_supplier_risks(state_db, supplier=supplier, status=status, limit=limit)
        return {"status": "ready", "summary": load_supplier_risk_summary(state_db), "count": len(rows), "rows": rows}

    @app.get("/api/receiving/records")
    def receiving_records(supplier: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        rows = list_receiving_records(state_db, supplier=supplier, status=status, limit=limit)
        return {"status": "ready", "summary": load_receiving_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/receiving/records")
    def create_receiving_record(request: ReceivingRecordRequest) -> dict[str, Any]:
        row = add_receiving_record(
            state_db,
            received_at=request.received_at.strip(),
            supplier=request.supplier.strip(),
            po_or_pi=request.po_or_pi.strip(),
            grn_or_batch=request.grn_or_batch.strip(),
            material=request.material.strip(),
            expected_qty=request.expected_qty.strip(),
            received_qty=request.received_qty.strip(),
            status=request.status.strip(),
            owner=request.owner.strip(),
            next_action=request.next_action.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        rows = list_receiving_records(state_db, limit=100)
        return {
            "status": "ready",
            "message": "Receiving record saved.",
            "record": row,
            "summary": load_receiving_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/inventory/records")
    def inventory_records(warehouse: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        rows = list_inventory_records(state_db, warehouse=warehouse, status=status, limit=limit)
        return {"status": "ready", "summary": load_inventory_summary(state_db), "count": len(rows), "rows": rows}

    @app.post("/api/inventory/records")
    def create_inventory_record(request: InventoryRecordRequest) -> dict[str, Any]:
        row = add_inventory_record(
            state_db,
            captured_at=request.captured_at.strip(),
            item_code=request.item_code.strip(),
            item_name=request.item_name.strip(),
            warehouse=request.warehouse.strip(),
            on_hand_qty=request.on_hand_qty.strip(),
            reserved_qty=request.reserved_qty.strip(),
            reorder_point=request.reorder_point.strip(),
            status=request.status.strip(),
            owner=request.owner.strip(),
            next_action=request.next_action.strip(),
            evidence_link=request.evidence_link.strip(),
        )
        rows = list_inventory_records(state_db, limit=100)
        return {
            "status": "ready",
            "message": "Inventory record saved.",
            "record": row,
            "summary": load_inventory_summary(state_db),
            "count": len(rows),
            "rows": rows,
        }

    @app.get("/api/reports/role/{role}")
    def role_report(role: str) -> dict[str, Any]:
        normalized_role = str(role).strip().lower()
        if normalized_role not in {"ceo", "director", "manager"}:
            raise HTTPException(status_code=404, detail=f"Unknown role report: {role}")
        platform_digest = load_snapshot(state_db, "platform_digest") or _load_json(pilot_data / "platform_digest.json")
        role_views = platform_digest.get("role_views", {}) if isinstance(platform_digest, dict) else {}
        rows = role_views.get(normalized_role, []) if isinstance(role_views, dict) else []
        return {"status": "ready", "role": normalized_role, "count": len(rows), "rows": rows}

    @app.get("/api/supervisor")
    def supervisor_status() -> dict[str, Any]:
        payload = _load_json(pilot_data / "supervisor_status.json")
        return {"status": "ready", "payload": payload}

    @app.get("/api/agent-teams")
    def agent_teams() -> dict[str, Any]:
        payload = load_snapshot(state_db, "agent_team_system")
        return {
            "status": "ready",
            "summary": load_agent_team_summary(state_db),
            "teams": list_agent_teams(state_db),
            "gaps": payload.get("gaps", []) if isinstance(payload, dict) else [],
            "scaling_model": payload.get("scaling_model", {}) if isinstance(payload, dict) else {},
            "next_moves": payload.get("next_moves", []) if isinstance(payload, dict) else [],
        }

    @app.get("/api/snapshots/{snapshot_key}")
    def snapshot(snapshot_key: str) -> dict[str, Any]:
        payload = load_snapshot(state_db, snapshot_key)
        if not payload:
            raise HTTPException(status_code=404, detail=f"Snapshot not found: {snapshot_key}")
        return {"status": "ready", "snapshot_key": snapshot_key, "payload": payload}

    @app.post("/api/state/sync")
    def state_sync() -> dict[str, Any]:
        return sync_state_from_output_dir(pilot_data)

    @app.get("/api/workspaces")
    def workspaces() -> dict[str, Any]:
        registry = _load_json(pilot_data / "input_center_registry.json")
        publish = _load_json(pilot_data / "platform_publish.json")
        templates = registry.get("templates", []) if isinstance(registry, dict) else []
        return {
            "status": "ready",
            "input_center_workspace": registry.get("workspace_link", ""),
            "published_workspace": publish.get("workspace_link", ""),
            "published_google_doc": publish.get("google_doc_link", ""),
            "templates": [
                {
                    "key": item.get("key", ""),
                    "title": item.get("title", ""),
                    "web_view_link": item.get("web_view_link", ""),
                    "spreadsheet_id": item.get("spreadsheet_id", ""),
                }
                for item in templates
            ],
        }

    @app.post("/api/contact-submissions")
    def create_contact_submission(request: ContactSubmissionRequest) -> dict[str, Any]:
        row = add_contact_submission(
            state_db,
            source="website",
            name=request.name.strip(),
            email=request.email.strip(),
            company=request.company.strip(),
            workflow=request.workflow.strip(),
            data_summary=request.data.strip(),
            goal=request.goal.strip(),
        )
        return {"status": "ready", "message": "Submission saved.", "submission": row}

    @app.get("/api/contact-submissions")
    def contact_submissions(limit: int = 50) -> dict[str, Any]:
        rows = list_contact_submissions(state_db, limit=limit)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/attendance/checkins")
    def create_attendance_checkin(request: AttendanceCheckinRequest) -> dict[str, Any]:
        row = add_attendance_event(
            state_db,
            employee_name=request.employee_name.strip(),
            employee_code=request.employee_code.strip(),
            shift_name=request.shift_name.strip(),
            station=request.station.strip(),
            status=request.status.strip() or "present",
            method=request.method.strip() or "photo_checkin",
            evidence_url=request.evidence_url.strip(),
            note=request.note.strip(),
        )
        return {
            "status": "ready",
            "message": "Attendance event captured.",
            "attendance": row,
            "face_scan_ready": False,
            "note": "Photo-assisted attendance is available now. Face matching still needs a separate identity and privacy layer.",
        }

    @app.get("/api/attendance/checkins")
    def attendance_checkins(limit: int = 100) -> dict[str, Any]:
        rows = list_attendance_events(state_db, limit=limit)
        status_counts: dict[str, int] = {}
        for row in rows:
            status_key = str(row.get("status", "")).strip() or "unknown"
            status_counts[status_key] = status_counts.get(status_key, 0) + 1
        return {"status": "ready", "count": len(rows), "status_counts": status_counts, "rows": rows}

    app.mount("/", StaticFiles(directory=str(site_root), html=True), name="site")
    return app


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve SuperMega pilot outputs with a JSON API.")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host.")
    parser.add_argument("--port", type=int, default=8787, help="Bind port.")
    parser.add_argument("--site-root", default="swan-intelligence-hub", help="Static site root.")
    parser.add_argument("--pilot-data", default="pilot-data", help="Generated output directory.")
    args = parser.parse_args()

    site_root = Path(args.site_root).expanduser().resolve()
    pilot_data = Path(args.pilot_data).expanduser().resolve()
    if not site_root.exists():
        print(
            json.dumps(
                {
                    "status": "missing_site_root",
                    "site_root": str(site_root),
                    "message": "Run platform-publish or run_solution first.",
                },
                indent=2,
            )
        )
        return 1

    app = create_app(site_root, pilot_data)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
