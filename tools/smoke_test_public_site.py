from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROUTES = (
    "/",
    "/contact/",
)

APP_ROUTES = (
    "/app/start/",
    "/app/portal/",
    "/app/manager-system/",
    "/app/erp/",
)


def fetch(url: str, *, accept: str = "text/html", timeout: int = 20) -> tuple[int, str]:
    curl_path = shutil.which("curl")
    if curl_path:
        completed = subprocess.run(
            [
                curl_path,
                "-4",
                "-L",
                "-sS",
                "--max-time",
                str(timeout),
                "-A",
                "supermega-public-smoke/1.0",
                "-H",
                f"Accept: {accept}",
                "-o",
                "-",
                "-w",
                "\n__STATUS__:%{http_code}",
                url,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or f"curl_failed_{completed.returncode}")
        body, _, status_line = completed.stdout.rpartition("\n__STATUS__:")
        status = int(status_line.strip() or "0")
        if status >= 400:
            raise HTTPError(url, status, f"HTTP Error {status}", hdrs=None, fp=None)
        return status, body

    request = Request(
        url,
        headers={
            "Accept": accept,
            "User-Agent": "supermega-public-smoke/1.0",
        },
        method="GET",
    )
    with urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        status = int(getattr(response, "status", 200) or 200)
    return status, body


def fetch_bytes(url: str, *, accept: str = "*/*", timeout: int = 20) -> tuple[int, bytes]:
    curl_path = shutil.which("curl")
    if curl_path:
        completed = subprocess.run(
            [
                curl_path,
                "-4",
                "-L",
                "-sS",
                "--max-time",
                str(timeout),
                "-A",
                "supermega-public-smoke/1.0",
                "-H",
                f"Accept: {accept}",
                "-o",
                "-",
                "-w",
                "\n__STATUS__:%{http_code}",
                url,
            ],
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.decode("utf-8", errors="replace").strip() or f"curl_failed_{completed.returncode}")
        body, _, status_line = completed.stdout.rpartition(b"\n__STATUS__:")
        status = int(status_line.decode("utf-8", errors="replace").strip() or "0")
        if status >= 400:
            raise HTTPError(url, status, f"HTTP Error {status}", hdrs=None, fp=None)
        return status, body

    request = Request(
        url,
        headers={
            "Accept": accept,
            "User-Agent": "supermega-public-smoke/1.0",
        },
        method="GET",
    )
    with urlopen(request, timeout=timeout) as response:
        body = response.read()
        status = int(getattr(response, "status", 200) or 200)
    return status, body


def extract_asset(html: str, pattern: str) -> str:
    match = re.search(pattern, html)
    if not match:
        raise RuntimeError(f"Could not find asset with pattern: {pattern}")
    return match.group(1)


def extract_assets(html: str, pattern: str) -> list[str]:
    return sorted(set(re.findall(pattern, html)))


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test the public SUPERMEGA site.")
    parser.add_argument("--base-url", default="https://supermega.dev")
    parser.add_argument("--include-app-routes", action="store_true")
    parser.add_argument("--skip-api", action="store_true", help="Only verify static public routes and bundled assets.")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    routes = ROUTES + APP_ROUTES if args.include_app_routes else ROUTES

    try:
        route_statuses: dict[str, int] = {}
        for route in routes:
            status, _ = fetch(f"{base_url}{route}")
            route_statuses[route] = status
            if status != 200:
                raise RuntimeError(f"Expected 200 for {route}, got {status}")

        home_status, home_html = fetch(f"{base_url}/")
        if home_status != 200:
            raise RuntimeError(f"Expected 200 for home page, got {home_status}")
        stale_phrases = (
            "plug-and-play company portal",
            "work, files, and AI agents",
            "One portal for work",
            "Connect Gmail",
        )
        lowered_home_html = home_html.lower()
        for phrase in stale_phrases:
            if phrase.lower() in lowered_home_html:
                raise RuntimeError(f"Found stale public-site copy in home HTML: {phrase}")

        js_asset = extract_asset(home_html, r'(assets/index-[A-Za-z0-9_-]+\.js)')
        css_asset = extract_asset(home_html, r'(assets/index-[A-Za-z0-9_-]+\.css)')
        js_assets = extract_assets(home_html, r'(assets/[A-Za-z0-9_-]+\.js)')
        css_assets = extract_assets(home_html, r'(assets/[A-Za-z0-9_-]+\.css)')

        asset_statuses: dict[str, int] = {}
        for asset in js_assets:
            status, _ = fetch(f"{base_url}/{asset}", accept="text/javascript")
            asset_statuses[asset] = status
            if status != 200:
                raise RuntimeError(f"Expected 200 for JS asset {asset}, got {status}")
        for asset in css_assets:
            status, _ = fetch(f"{base_url}/{asset}", accept="text/css")
            asset_statuses[asset] = status
            if status != 200:
                raise RuntimeError(f"Expected 200 for CSS asset {asset}, got {status}")

        js_status = asset_statuses[js_asset]
        css_status = asset_statuses[css_asset]

        social_card_status = 0
        social_card_type = "skipped"
        social_status, social_body = fetch_bytes(f"{base_url}/social/supermega-portal-card.png", accept="image/png")
        social_card_status = social_status
        social_card_type = "png" if social_body.startswith(b"\x89PNG") else "unexpected"
        if social_status != 200 or social_card_type != "png":
            raise RuntimeError("Expected live social card PNG at /social/supermega-portal-card.png")

        qr_status, qr_body = fetch_bytes(f"{base_url}/social/supermega-contact-qr.png", accept="image/png")
        qr_type = "png" if qr_body.startswith(b"\x89PNG") else "unexpected"
        if qr_status != 200 or qr_type != "png":
            raise RuntimeError("Expected live contact QR PNG at /social/supermega-contact-qr.png")

        offer_status, offer_html = fetch(f"{base_url}/site/supermega-one-page-offer.html")
        if offer_status != 200 or "One workflow. One work desk." not in offer_html:
            raise RuntimeError("Expected one-page offer asset to be live.")

        contact_endpoint_status = 0
        health_status_value = "skipped"

        if not args.skip_api:
            health_status, health_body = fetch(f"{base_url}/api/health", accept="application/json")
            if health_status != 200:
                raise RuntimeError(f"Expected 200 for /api/health, got {health_status}")
            health_payload = json.loads(health_body)
            health_status_value = str(health_payload.get("status", ""))
            if health_status_value.strip() != "ready":
                raise RuntimeError(f"Expected ready health status, got {health_payload.get('status')}")

            contact_status, contact_body = fetch(f"{base_url}/api/contact-submissions", accept="application/json")
            if contact_status != 200:
                raise RuntimeError(f"Expected 200 for /api/contact-submissions, got {contact_status}")
            contact_payload = json.loads(contact_body)
            contact_endpoint_status = contact_status
            if str(contact_payload.get("status", "")).strip() != "ready":
                raise RuntimeError("Expected ready contact submission endpoint.")

        result = {
            "status": "ready",
            "base_url": base_url,
            "routes": route_statuses,
            "assets": {
                "js": {"path": js_asset, "status": js_status},
                "css": {"path": css_asset, "status": css_status},
                "all": asset_statuses,
            },
            "social_card": {"status": social_card_status, "type": social_card_type},
            "contact_qr": {"status": qr_status, "type": qr_type},
            "one_page_offer_status": offer_status,
            "health_status": health_status_value,
            "contact_endpoint_status": contact_endpoint_status,
        }
        print(result)
        return 0
    except (RuntimeError, HTTPError, URLError, TimeoutError) as exc:
        print({"status": "error", "base_url": base_url, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
