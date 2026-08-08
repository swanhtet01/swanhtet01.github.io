"""Smoke test the public SuperMega site against the canonical site-manifest.json.

Routes, redirects, and required home tokens are derived from the manifest so this
script cannot drift from the published surface. `--self-test` validates the
derivation offline (and, when a built `.vercel/output/static` exists, that every
manifest page file was generated) without contacting any live URL.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "site-manifest.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def page_routes(manifest: dict) -> tuple[str, ...]:
    return tuple(page["route"] for page in manifest["pages"])


def required_home_tokens(manifest: dict) -> tuple[str, ...]:
    product_routes = tuple(
        page["route"] for page in manifest["pages"] if page.get("productId")
    )
    return (manifest["brand"]["name"], *product_routes, "/contact/")


def redirect_probe(source: str) -> str | None:
    """Derive one concrete probe path from a manifest redirect source regex.

    Handles the anchored pattern shapes used by site-manifest.json; returns None
    when a sample cannot be derived, and never returns a sample that fails to
    fullmatch its own source.
    """
    sample = source
    sample = sample.removeprefix("^").removesuffix("$")
    sample = re.sub(r"\(\?:([^()|]+)(?:\|[^()]*)?\)", r"\1", sample)
    for optional_tail in ("/?.*", "(?:/.+)?", "(?:/.*)?", "/?"):
        sample = sample.replace(optional_tail, "")
    sample = sample.rstrip("/") + "/"
    if re.fullmatch(source, sample) or re.fullmatch(source, sample.rstrip("/")):
        return sample if re.fullmatch(source, sample) else sample.rstrip("/")
    return None


def redirect_expectations(manifest: dict) -> dict[str, str]:
    expectations: dict[str, str] = {}
    for redirect in manifest["redirects"]:
        probe = redirect_probe(redirect["source"])
        if probe is not None:
            expectations[probe] = redirect["destination"]
    return expectations


def fetch(url: str, *, accept: str = "text/html", timeout: int = 20) -> tuple[int, str]:
    request = Request(url, headers={"Accept": accept}, method="GET")
    with urlopen(request, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
        status = int(getattr(response, "status", 200) or 200)
    return status, body


class NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch_without_redirect(url: str, timeout: int = 20) -> tuple[int, str]:
    opener = build_opener(NoRedirectHandler)
    request = Request(url, headers={"Accept": "text/html"}, method="GET")
    try:
        with opener.open(request, timeout=timeout) as response:
            return int(getattr(response, "status", 200) or 200), response.headers.get("Location", "")
    except HTTPError as exc:
        return int(exc.code or 0), exc.headers.get("Location", "")


def self_test(manifest: dict) -> int:
    routes = page_routes(manifest)
    failures: list[str] = []
    for required in ("/", "/shop/", "/plant/", "/website/", "/ecommerce/", "/contact/", "/privacy/"):
        if required not in routes:
            failures.append(f"manifest_missing_page:{required}")
    expectations = redirect_expectations(manifest)
    if len(expectations) < 10:
        failures.append(f"redirect_probe_coverage_low:{len(expectations)}")
    for probe, destination in expectations.items():
        if not destination:
            failures.append(f"redirect_destination_empty:{probe}")
    tokens = required_home_tokens(manifest)
    if len(tokens) < 6:
        failures.append(f"home_token_coverage_low:{len(tokens)}")
    static_root = REPO_ROOT / ".vercel" / "output" / "static"
    built_pages_checked = 0
    if static_root.is_dir():
        for page in manifest["pages"]:
            if not (static_root / page["file"]).is_file():
                failures.append(f"built_page_missing:{page['file']}")
            else:
                built_pages_checked += 1
    result = {
        "status": "error" if failures else "ok",
        "mode": "self_test",
        "routes": len(routes),
        "redirectProbes": len(expectations),
        "homeTokens": len(tokens),
        "builtPagesChecked": built_pages_checked,
        "failures": failures,
    }
    print(json.dumps(result))
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test the public SuperMega site.")
    parser.add_argument("--base-url", default="https://supermega.dev")
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Validate manifest-derived expectations offline; contacts no live URL.",
    )
    args = parser.parse_args()

    manifest = load_manifest()
    if args.self_test:
        return self_test(manifest)

    base_url = args.base_url.rstrip("/")
    try:
        route_statuses: dict[str, int] = {}
        for route in page_routes(manifest):
            status, _ = fetch(f"{base_url}{route}")
            route_statuses[route] = status
            if status != 200:
                raise RuntimeError(f"Expected 200 for {route}, got {status}")

        redirect_statuses: dict[str, str] = {}
        for probe, expected_location in redirect_expectations(manifest).items():
            status, location = fetch_without_redirect(f"{base_url}{probe}")
            redirect_statuses[probe] = f"{status} -> {location}"
            if status != 308 or location != expected_location:
                raise RuntimeError(
                    f"Expected 308 redirect for {probe} to {expected_location}, got {status} -> {location}"
                )

        home_status, home_html = fetch(f"{base_url}/")
        if home_status != 200:
            raise RuntimeError(f"Expected 200 for home page, got {home_status}")
        missing = [token for token in required_home_tokens(manifest) if token not in home_html]
        if missing:
            raise RuntimeError(f"Public home page is missing required tokens: {missing}")

        result = {
            "status": "ready",
            "base_url": base_url,
            "routes": route_statuses,
            "redirects": redirect_statuses,
        }
        print(json.dumps(result))
        return 0
    except (RuntimeError, HTTPError, URLError, TimeoutError) as exc:
        print(json.dumps({"status": "error", "base_url": base_url, "error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
