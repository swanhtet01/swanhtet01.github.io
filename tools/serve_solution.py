from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from mark1_pilot.state_store import (  # noqa: E402
    add_attendance_event,
    add_contact_submission,
    list_actions,
    list_attendance_events,
    list_contact_submissions,
    load_action_summary,
    load_snapshot,
    resolve_state_db,
    sync_state_from_output_dir,
)


class LeadFinderRequest(BaseModel):
    raw_text: str = Field(default="")


class NewsBriefRequest(BaseModel):
    raw_text: str = Field(default="")


class ActionBoardRequest(BaseModel):
    raw_text: str = Field(default="")


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
        portfolio = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )
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
            "product_lab": {
                "flagship_status": product_lab.get("summary", {}).get("flagship_status", ""),
                "pilot_ready_count": product_lab.get("summary", {}).get("pilot_ready_count", 0),
                "live_demo_count": product_lab.get("summary", {}).get("live_demo_count", 0),
            },
            "workspace": {
                "drive_folder_link": publish.get("workspace_link", ""),
                "google_doc_link": publish.get("google_doc_link", ""),
            },
            "portfolio": portfolio,
        }

    @app.get("/api/actions")
    def actions(lane: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        items = list_actions(state_db, lane=lane, status=status, limit=limit)
        return {"status": "ready", "count": len(items), "items": items}

    @app.post("/api/tools/lead-finder")
    def tool_lead_finder(request: LeadFinderRequest) -> dict[str, Any]:
        rows = _parse_leads(request.raw_text)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.post("/api/tools/news-brief")
    def tool_news_brief(request: NewsBriefRequest) -> dict[str, Any]:
        return {"status": "ready", **_build_news_brief(request.raw_text)}

    @app.post("/api/tools/action-board")
    def tool_action_board(request: ActionBoardRequest) -> dict[str, Any]:
        rows = _build_action_rows(request.raw_text)
        return {"status": "ready", "count": len(rows), "rows": rows}

    @app.get("/api/portfolio")
    def portfolio() -> dict[str, Any]:
        payload = load_snapshot(state_db, "solution_portfolio_manifest") or _load_json(
            REPO_ROOT / "Super Mega Inc" / "sales" / "solution_portfolio_manifest.json"
        )
        return {"status": "ready", "payload": payload}

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
