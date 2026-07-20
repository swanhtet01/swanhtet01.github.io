from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
RUNTIME_SITE_ROOT = REPO_ROOT / "api-static"
RUNTIME_PILOT_ROOT = Path(os.getenv("SUPERMEGA_PILOT_DATA", "/tmp/supermega-pilot-data"))
RUNTIME_PILOT_SKIP_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".db-shm", ".db-wal", ".log"}
RUNTIME_PILOT_DB_ALLOWLIST = {
    "ytf_root_warehouse.db",
    "ytf_plant_a_warehouse.db",
}

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _prepare_runtime_pilot_data() -> Path:
    source_root = REPO_ROOT / "pilot-data"
    runtime_root = RUNTIME_PILOT_ROOT
    runtime_root.mkdir(parents=True, exist_ok=True)

    if source_root.exists() and not any(runtime_root.iterdir()):
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


def _include_priority_router(app, router, *, prefix: str) -> None:
    before = {id(route) for route in app.router.routes}
    app.include_router(router, prefix=prefix)
    added = [route for route in app.router.routes if id(route) not in before]
    existing = [route for route in app.router.routes if id(route) in before]
    app.router.routes = [*added, *existing]


def build_app():
    os.environ.setdefault("SUPERMEGA_SITE_ROOT", str(RUNTIME_SITE_ROOT))
    os.environ.setdefault("SUPERMEGA_PILOT_DATA", str(RUNTIME_PILOT_ROOT))

    from tools.serve_solution import create_app
    from app.api import iot_routes, twin_routes, vision_routes, voice_routes

    app = create_app(RUNTIME_SITE_ROOT, _prepare_runtime_pilot_data())
    _include_priority_router(app, iot_routes.router, prefix="/api/iot")
    _include_priority_router(app, vision_routes.router, prefix="/api/vision")
    _include_priority_router(app, voice_routes.router, prefix="/api/voice")
    _include_priority_router(app, twin_routes.router, prefix="/api/twin")
    return app
