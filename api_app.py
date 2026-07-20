import os
from pathlib import Path
import shutil


RUNTIME_SITE_ROOT = Path(__file__).resolve().parent / "api-static"
RUNTIME_PILOT_ROOT = Path("/tmp/supermega-pilot-data")

os.environ.setdefault("SUPERMEGA_SITE_ROOT", str(RUNTIME_SITE_ROOT))
os.environ.setdefault("SUPERMEGA_PILOT_DATA", str(RUNTIME_PILOT_ROOT))

from tools.serve_solution import REPO_ROOT
from tools.serve_solution import create_app
from api.cloud_runtime import router as cloud_runtime_router


def _prepare_runtime_pilot_data() -> Path:
    source_root = REPO_ROOT / "pilot-data"
    runtime_root = RUNTIME_PILOT_ROOT
    runtime_root.mkdir(parents=True, exist_ok=True)

    if source_root.exists() and not any(runtime_root.iterdir()):
        for entry in source_root.iterdir():
            target = runtime_root / entry.name
            if entry.is_dir():
                shutil.copytree(entry, target, dirs_exist_ok=True)
            else:
                shutil.copy2(entry, target)

    return runtime_root


app = create_app(REPO_ROOT / "api-static", _prepare_runtime_pilot_data())
existing_route_ids = {id(route) for route in app.router.routes}
app.include_router(cloud_runtime_router)
new_routes = [route for route in app.router.routes if id(route) not in existing_route_ids]
existing_routes = [route for route in app.router.routes if id(route) in existing_route_ids]
app.router.routes = [*new_routes, *existing_routes]
