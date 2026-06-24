from __future__ import annotations

import argparse
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROUTES = (
    "/",
    "/platform/",
    "/demo-center/",
    "/products/",
    "/products/manager-operating-system/",
    "/products/agent-runtime/",
    "/products/tenant-control-plane/",
    "/packages/",
    "/signup/",
    "/login/",
    "/contact/",
    "/clients/yangon-tyre/",
    "/products/find-clients/",
)


def fetch(url: str, *, accept: str = "text/html", timeout: int = 20) -> tuple[int, str]:
    request = Request(url, headers={"Accept": accept}, method="GET")
    with urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        status = int(getattr(response, "status", 200) or 200)
    return status, body


def extract_asset(html: str, pattern: str) -> str:
    match = re.search(pattern, html)
    if not match:
        raise RuntimeError(f"Could not find asset with pattern: {pattern}")
    return match.group(1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test the public SUPERMEGA site.")
    parser.add_argument("--base-url", default="https://supermega.dev")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")

    try:
        route_statuses: dict[str, int] = {}
        for route in ROUTES:
            status, _ = fetch(f"{base_url}{route}")
            route_statuses[route] = status
            if status != 200:
                raise RuntimeError(f"Expected 200 for {route}, got {status}")

        home_status, home_html = fetch(f"{base_url}/")
        if home_status != 200:
            raise RuntimeError(f"Expected 200 for home page, got {home_status}")

        js_asset = extract_asset(home_html, r'(assets/index-[A-Za-z0-9_-]+\.js)')
        css_asset = extract_asset(home_html, r'(assets/index-[A-Za-z0-9_-]+\.css)')

        js_status, _ = fetch(f"{base_url}/{js_asset}", accept="text/javascript")
        css_status, _ = fetch(f"{base_url}/{css_asset}", accept="text/css")
        if js_status != 200:
            raise RuntimeError(f"Expected 200 for JS asset {js_asset}, got {js_status}")
        if css_status != 200:
            raise RuntimeError(f"Expected 200 for CSS asset {css_asset}, got {css_status}")

        meta_status = 0
        try:
            fetch(f"{base_url}/api/meta/workspace", accept="application/json")
            meta_status = 200
        except HTTPError as exc:
            meta_status = int(exc.code or 0)

        if meta_status not in {200, 401}:
            raise RuntimeError(f"Expected 200 or 401 for /api/meta/workspace, got {meta_status}")

        result = {
            "status": "ready",
            "base_url": base_url,
            "routes": route_statuses,
            "assets": {
                "js": {"path": js_asset, "status": js_status},
                "css": {"path": css_asset, "status": css_status},
            },
            "meta_workspace_status": meta_status,
        }
        print(result)
        return 0
    except (RuntimeError, HTTPError, URLError, TimeoutError) as exc:
        print({"status": "error", "base_url": base_url, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
