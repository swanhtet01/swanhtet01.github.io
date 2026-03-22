from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


class SolutionHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: object, root_dir: Path, pilot_dir: Path, **kwargs: object) -> None:
        self.root_dir = root_dir
        self.pilot_dir = pilot_dir
        super().__init__(*args, directory=str(root_dir), **kwargs)

    def _write_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/api/status":
            review = _load_json(self.pilot_dir / "execution_review.json")
            autopilot = _load_json(self.pilot_dir / "autopilot_status.json")
            coverage = _load_json(self.pilot_dir / "data_coverage_report.json")
            self._write_json(
                {
                    "review_status": review.get("status", "unknown"),
                    "autopilot_status": autopilot.get("status", "unknown"),
                    "coverage_score": int(coverage.get("readiness_score", 0) or 0),
                    "generated_at": review.get("generated_at", ""),
                    "projects": review.get("projects", []),
                    "priorities": review.get("top_priorities", []),
                }
            )
            return

        if self.path == "/api/files":
            self._write_json(
                {
                    "site_root": str(self.root_dir.resolve()),
                    "pilot_data": str(self.pilot_dir.resolve()),
                    "index_exists": (self.root_dir / "index.html").exists(),
                    "today_exists": (self.pilot_dir / "TODAY.md").exists(),
                }
            )
            return

        super().do_GET()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve SuperMega pilot outputs locally.")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host.")
    parser.add_argument("--port", type=int, default=8787, help="Bind port.")
    parser.add_argument(
        "--site-root",
        default="swan-intelligence-hub",
        help="Directory to serve as static root.",
    )
    parser.add_argument(
        "--pilot-data",
        default="pilot-data",
        help="Directory containing generated JSON/markdown outputs.",
    )
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

    def handler(*handler_args: object, **handler_kwargs: object) -> SolutionHandler:
        return SolutionHandler(
            *handler_args,
            root_dir=site_root,
            pilot_dir=pilot_data,
            **handler_kwargs,
        )

    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(
        json.dumps(
            {
                "status": "ready",
                "url": f"http://{args.host}:{args.port}",
                "site_root": str(site_root),
                "pilot_data": str(pilot_data),
                "api_status": f"http://{args.host}:{args.port}/api/status",
            },
            indent=2,
        )
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
