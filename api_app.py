import os
from pathlib import Path
import shutil


RUNTIME_SITE_ROOT = Path(__file__).resolve().parent / "api-static"
RUNTIME_PILOT_ROOT = Path("/tmp/supermega-pilot-data")
RUNTIME_PILOT_SKIP_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".db-shm", ".db-wal", ".log"}
RUNTIME_PILOT_DB_ALLOWLIST = {
    "ytf_root_warehouse.db",
    "ytf_plant_a_warehouse.db",
}
RUNTIME_PILOT_COPY_ALLOWLIST = {
    "agent_team_system.json",
    "agent_team_system.md",
    "gmail_auth_start.json",
    "gmail_auth_finish.json",
    "gmail_auth_reset.json",
    "gmail_check.json",
    "gmail_relevant_all.json",
    "gmail_supplier_forwarded.json",
    "gmail_supplier_junky.json",
    "gmail_supplier_kiic.json",
    "gmail_quality_watch.json",
    "ytf_drive_database/current/summary.md",
    "ytf_drive_database/current/promotion_board.json",
    "ytf_drive_database/current/promotion_board.csv",
    "ytf_drive_database/current/source_extraction_plan.json",
    "ytf_drive_database/current/source_extraction_plan.csv",
    "ytf_drive_database/current/organized_index.csv",
    "ytf_drive_database/current/by_plant/company.csv",
    "ytf_drive_database/current/by_plant/plant-a.csv",
    "ytf_drive_database/current/by_plant/plant-b.csv",
    "ytf_drive_database/current/by_plant/plant-a-b.csv",
    "ytf_drive_database/current/by_plant/shared-company.csv",
    "ytf_drive_database/current/by_department/production.csv",
    "ytf_drive_database/current/by_department/sales-and-inventory.csv",
    "ytf_drive_database/current/by_department/quality.csv",
    "ytf_drive_database/current/by_department/finance.csv",
    "ytf_drive_database/current/by_domain/plant.csv",
    "ytf_drive_database/current/by_domain/commercial.csv",
    "ytf_drive_database/current/by_domain/quality.csv",
    "ytf_drive_database/current/by_domain/finance.csv",
    "ytf_workbook_extraction/current/summary.md",
    "ytf_workbook_extraction/current/metric_schema_candidates.csv",
    "ytf_workbook_extraction/current/workbook_schema_catalog.csv",
    "ytf_workbook_extraction/current/workbook_metric_values.csv",
}

os.environ.setdefault("SUPERMEGA_SITE_ROOT", str(RUNTIME_SITE_ROOT))
os.environ.setdefault("SUPERMEGA_PILOT_DATA", str(RUNTIME_PILOT_ROOT))

from tools.serve_solution import REPO_ROOT
from tools.serve_solution import create_app
from app.api import iot_routes, twin_routes, vision_routes, voice_routes


def _prepare_runtime_pilot_data() -> Path:
    source_root = REPO_ROOT / "pilot-data"
    runtime_root = RUNTIME_PILOT_ROOT
    runtime_root.mkdir(parents=True, exist_ok=True)

    def copy_if_newer(source_file: Path, target_file: Path) -> None:
        if not source_file.exists() or not source_file.is_file():
            return
        target_stat = target_file.stat() if target_file.exists() else None
        source_stat = source_file.stat()
        if (
            target_stat is None
            or target_stat.st_size != source_stat.st_size
            or int(target_stat.st_mtime) < int(source_stat.st_mtime)
        ):
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_file, target_file)

    if source_root.exists() and not any(runtime_root.iterdir()):
        copy_full_pilot_data = str(os.getenv("SUPERMEGA_COPY_FULL_PILOT_DATA", "")).strip().lower() in {
            "1",
            "true",
            "yes",
        }
        if copy_full_pilot_data:
            for entry in source_root.iterdir():
                target = runtime_root / entry.name
                if entry.is_dir():
                    shutil.copytree(
                        entry,
                        target,
                        dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns(
                            "*.db",
                            "*.sqlite",
                            "*.sqlite3",
                            "*.db-shm",
                            "*.db-wal",
                            "*.log",
                        ),
                    )
                elif entry.suffix.lower() not in RUNTIME_PILOT_SKIP_SUFFIXES:
                    shutil.copy2(entry, target)
        else:
            for source_file in source_root.rglob("*"):
                if not source_file.is_file() or source_file.suffix.lower() in RUNTIME_PILOT_SKIP_SUFFIXES:
                    continue
                relative_path = source_file.relative_to(source_root).as_posix()
                if relative_path not in RUNTIME_PILOT_COPY_ALLOWLIST:
                    continue
                copy_if_newer(source_file, runtime_root / relative_path)

    if source_root.exists():
        for relative_path in RUNTIME_PILOT_COPY_ALLOWLIST:
            copy_if_newer(source_root / relative_path, runtime_root / relative_path)

    if source_root.exists():
        for db_name in RUNTIME_PILOT_DB_ALLOWLIST:
            source_db = source_root / db_name
            target_db = runtime_root / db_name
            if not source_db.exists():
                continue
            source_stat = source_db.stat()
            target_stat = target_db.stat() if target_db.exists() else None
            if (
                target_stat is None
                or target_stat.st_size != source_stat.st_size
                or int(target_stat.st_mtime) < int(source_stat.st_mtime)
            ):
                shutil.copy2(source_db, target_db)

    return runtime_root


app = create_app(REPO_ROOT / "api-static", _prepare_runtime_pilot_data())


def _include_priority_router(router, *, prefix: str) -> None:
    before = {id(route) for route in app.router.routes}
    app.include_router(router, prefix=prefix)
    added = [route for route in app.router.routes if id(route) not in before]
    existing = [route for route in app.router.routes if id(route) in before]
    app.router.routes = [*added, *existing]


_include_priority_router(iot_routes.router, prefix="/api/iot")
_include_priority_router(vision_routes.router, prefix="/api/vision")
_include_priority_router(voice_routes.router, prefix="/api/voice")
_include_priority_router(twin_routes.router, prefix="/api/twin")
