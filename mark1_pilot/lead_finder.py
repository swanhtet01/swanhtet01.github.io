from __future__ import annotations

import json
import re
from html import unescape
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen
import os


SEARCH_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0 Safari/537.36"
)
SOCIAL_HOST_HINTS = ("facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "youtube.com")
DIRECTORY_HOST_HINTS = ("tripadvisor.com", "fresha.com", "wanderlog.com", "top-rated.online")
STOP_WORDS = {
    "the",
    "and",
    "for",
    "with",
    "yangon",
    "myanmar",
    "near",
    "best",
    "top",
    "from",
    "that",
}


def _http_get(url: str, *, timeout: int = 20, limit_bytes: int = 250_000) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": SEARCH_USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        content = response.read(limit_bytes)
    return content.decode("utf-8", errors="ignore")


def _strip_html(value: str) -> str:
    cleaned = re.sub(r"<[^>]+>", " ", str(value or ""))
    cleaned = unescape(cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _unique_values(values: list[str]) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = str(value or "").strip().rstrip("),.;")
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def _resolve_redirect_url(raw_url: str) -> str:
    cleaned = unescape(str(raw_url or "").strip())
    if cleaned.startswith("//"):
        cleaned = f"https:{cleaned}"
    parsed = urlparse(cleaned)
    if "duckduckgo.com" in parsed.netloc:
        target = parse_qs(parsed.query).get("uddg", [""])[0]
        if target:
            return target
    return cleaned


def _source_kind_for_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    if ("google." in host or "maps.app.goo.gl" in host) and ("/maps" in url or "maps" in host):
        return "Google Maps"
    if any(hint in host for hint in SOCIAL_HOST_HINTS):
        return "Social"
    if any(hint in host for hint in DIRECTORY_HOST_HINTS):
        return "Directory"
    return "Website"


def _query_keywords(query: str, explicit_keywords: list[str] | None) -> list[str]:
    output: list[str] = []
    seen: set[str] = set()
    for value in explicit_keywords or []:
        normalized = str(value or "").strip().lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            output.append(normalized)
    for token in re.findall(r"[a-z0-9][a-z0-9&+.-]+", str(query or "").lower()):
        if token in STOP_WORDS or len(token) < 3:
            continue
        if token not in seen:
            seen.add(token)
            output.append(token)
    return output


def _extract_page_signals(url: str) -> dict[str, Any]:
    try:
        html = _http_get(url, timeout=12)
    except Exception:
        return {"title": "", "emails": [], "phones": [], "social_profiles": []}

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.I | re.S)
    emails = _unique_values(re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", html, flags=re.I))
    phones = _unique_values(
        [re.sub(r"\s+", " ", match).strip() for match in re.findall(r"\+?\d[\d\s\-()]{7,}\d", html)]
    )
    social_links = _unique_values(
        _resolve_redirect_url(match)
        for match in re.findall(r'href=["\']([^"\']+)["\']', html, flags=re.I)
        if any(hint in match.lower() for hint in SOCIAL_HOST_HINTS)
    )

    return {
        "title": _strip_html(title_match.group(1)) if title_match else "",
        "emails": emails[:3],
        "phones": phones[:3],
        "social_profiles": social_links[:4],
    }


def _parse_duckduckgo_results(query: str, limit: int) -> list[dict[str, str]]:
    search_url = "https://html.duckduckgo.com/html/?" + urlencode({"q": query})
    html = _http_get(search_url)

    anchor_pattern = re.compile(
        r'<a[^>]+class="result__a"[^>]+href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
        flags=re.I | re.S,
    )

    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in anchor_pattern.finditer(html):
        resolved = _resolve_redirect_url(match.group("href"))
        if not resolved or resolved in seen:
            continue
        seen.add(resolved)

        snippet_match = re.search(r'class="result__snippet"[^>]*>(.*?)</(?:a|div)>', html[match.end() : match.end() + 1600], flags=re.I | re.S)
        snippet = _strip_html(snippet_match.group(1)) if snippet_match else ""

        rows.append(
            {
                "title": _strip_html(match.group("title")),
                "url": resolved,
                "snippet": snippet,
                "source": _source_kind_for_url(resolved),
                "provider": "DuckDuckGo",
            }
        )
        if len(rows) >= limit:
            break
    return rows


def _parse_bing_results(query: str, limit: int) -> list[dict[str, str]]:
    search_url = "https://www.bing.com/search?" + urlencode({"q": query})
    html = _http_get(search_url)

    block_pattern = re.compile(r'<li class="b_algo".*?</li>', flags=re.I | re.S)
    link_pattern = re.compile(r'<h2><a href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>', flags=re.I | re.S)
    snippet_pattern = re.compile(r'<p>(?P<snippet>.*?)</p>', flags=re.I | re.S)

    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for block_match in block_pattern.finditer(html):
        block = block_match.group(0)
        link_match = link_pattern.search(block)
        if not link_match:
            continue
        resolved = _resolve_redirect_url(link_match.group("href"))
        if not resolved or resolved in seen:
            continue
        seen.add(resolved)
        snippet_match = snippet_pattern.search(block)
        rows.append(
            {
                "title": _strip_html(link_match.group("title")),
                "url": resolved,
                "snippet": _strip_html(snippet_match.group("snippet")) if snippet_match else "",
                "source": _source_kind_for_url(resolved),
                "provider": "Bing",
            }
        )
        if len(rows) >= limit:
            break
    return rows


def _google_places_results(query: str, limit: int) -> list[dict[str, Any]]:
    api_key = (
        os.environ.get("GOOGLE_PLACES_API_KEY")
        or os.environ.get("GOOGLE_MAPS_API_KEY")
        or os.environ.get("PLACES_API_KEY")
        or ""
    ).strip()
    if not api_key:
        return []

    text_url = "https://maps.googleapis.com/maps/api/place/textsearch/json?" + urlencode(
        {
            "query": query,
            "region": "mm",
            "language": "en",
            "key": api_key,
        }
    )
    try:
        payload = json.loads(_http_get(text_url, timeout=20))
    except Exception:
        return []

    results = payload.get("results", []) if isinstance(payload, dict) else []
    rows: list[dict[str, Any]] = []
    for item in results[:limit]:
        place_id = str(item.get("place_id", "")).strip()
        details: dict[str, Any] = {}
        if place_id:
            detail_url = "https://maps.googleapis.com/maps/api/place/details/json?" + urlencode(
                {
                    "place_id": place_id,
                    "fields": "name,formatted_phone_number,international_phone_number,website,url,rating,types",
                    "key": api_key,
                }
            )
            try:
                detail_payload = json.loads(_http_get(detail_url, timeout=20))
                details = detail_payload.get("result", {}) if isinstance(detail_payload, dict) else {}
            except Exception:
                details = {}

        website = str(details.get("website", "")).strip()
        phones = _unique_values(
            [
                str(details.get("formatted_phone_number", "")).strip(),
                str(details.get("international_phone_number", "")).strip(),
            ]
        )
        page_signals = _extract_page_signals(website) if website else {"emails": [], "social_profiles": []}

        rows.append(
            {
                "name": str(details.get("name") or item.get("name") or "Unknown business").strip(),
                "email": (page_signals.get("emails") or [""])[0] if isinstance(page_signals.get("emails"), list) else "",
                "phone": phones[0] if phones else "",
                "website": website,
                "source": "Google Maps",
                "source_url": str(details.get("url") or "").strip(),
                "snippet": " | ".join(
                    part
                    for part in [
                        str(item.get("formatted_address", "")).strip(),
                        f"rating {item.get('rating')}" if item.get("rating") else "",
                    ]
                    if part
                ),
                "social_profiles": page_signals.get("social_profiles", [])[:3],
                "fit_reasons": ["Google Maps result", "Business listing found"],
                "provider": "Google Places",
                "score": 6 + (2 if website else 0) + (2 if phones else 0) + (2 if page_signals.get("emails") else 0),
            }
        )
    return rows


def _candidate_to_row(candidate: dict[str, Any], keywords: list[str]) -> dict[str, Any]:
    source = str(candidate.get("source", "")).strip() or _source_kind_for_url(str(candidate.get("url", "")))
    source_url = str(candidate.get("url", "")).strip()
    page_signals = _extract_page_signals(source_url) if source == "Website" else {"title": "", "emails": [], "phones": [], "social_profiles": []}

    title = str(page_signals.get("title") or candidate.get("title") or "Unknown lead").strip()
    email = (page_signals.get("emails") or [""])[0] if isinstance(page_signals.get("emails"), list) else ""
    phone = (page_signals.get("phones") or [""])[0] if isinstance(page_signals.get("phones"), list) else ""
    website = source_url if source == "Website" else ""
    social_profiles = list(page_signals.get("social_profiles") or [])
    if source == "Social" and source_url:
        social_profiles = _unique_values([source_url, *social_profiles])

    searchable = " ".join(
        [
            title.lower(),
            str(candidate.get("snippet", "")).lower(),
            str(candidate.get("url", "")).lower(),
        ]
    )
    matched_keywords = [keyword for keyword in keywords if keyword and keyword in searchable]

    fit_reasons: list[str] = []
    if email:
        fit_reasons.append("email found")
    if phone:
        fit_reasons.append("phone found")
    if website:
        fit_reasons.append("website found")
    if source == "Social":
        fit_reasons.append("social profile found")
    if source == "Google Maps":
        fit_reasons.append("map listing found")
    if matched_keywords:
        fit_reasons.append("keyword match")

    score = 0
    if email:
        score += 3
    if phone:
        score += 2
    if website:
        score += 2
    if source in {"Social", "Google Maps"}:
        score += 1
    score += min(2, len(matched_keywords))

    return {
        "name": title,
        "email": email,
        "phone": phone,
        "website": website,
        "source": source,
        "source_url": source_url,
        "snippet": str(candidate.get("snippet", "")).strip(),
        "social_profiles": social_profiles[:4],
        "fit_reasons": fit_reasons,
        "provider": str(candidate.get("provider", "DuckDuckGo")),
        "score": score,
    }


def _dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        key = "|".join(
            [
                str(row.get("website", "")).strip().lower(),
                str(row.get("source_url", "")).strip().lower(),
                str(row.get("email", "")).strip().lower(),
                str(row.get("phone", "")).strip().lower(),
                str(row.get("name", "")).strip().lower(),
            ]
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(row)
    return output


def _search_queries(query: str, sources: list[str]) -> list[str]:
    active = {source.strip().lower() for source in sources if source.strip()}
    if not active:
        active = {"web", "social", "maps"}

    queries: list[str] = []
    if "web" in active:
        queries.append(query)
        queries.append(f'"{query}" contact')
    if "social" in active:
        queries.append(f'{query} site:facebook.com')
        queries.append(f'{query} site:instagram.com')
        queries.append(f'{query} site:linkedin.com')
    if "maps" in active:
        queries.append(f'{query} site:google.com/maps')
        queries.append(f'{query} "Google Maps"')
    return _unique_values(queries)


def parse_leads_from_text(raw_text: str) -> list[dict[str, Any]]:
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
                "source": "Pasted list",
                "source_url": "",
                "snippet": "",
                "social_profiles": [],
                "fit_reasons": ["pasted lead"],
                "provider": "Manual",
                "score": score,
            }
        )
    return sorted(rows, key=lambda item: (-int(item.get("score", 0)), str(item.get("name", ""))))[:15]


def discover_leads(query: str, keywords: list[str] | None = None, sources: list[str] | None = None, limit: int = 10) -> dict[str, Any]:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return {"provider": "none", "rows": []}

    limit = max(1, min(int(limit or 10), 20))
    normalized_keywords = _query_keywords(normalized_query, keywords)
    active_sources = [source.strip().lower() for source in (sources or ["web", "social", "maps"]) if source.strip()]

    rows: list[dict[str, Any]] = []
    providers: list[str] = []

    if "maps" in active_sources:
        places_rows = _google_places_results(normalized_query, min(5, limit))
        if places_rows:
            providers.append("Google Places")
            rows.extend(places_rows)

    per_query_limit = max(3, min(5, limit))
    for search_query in _search_queries(normalized_query, active_sources):
        try:
            candidates = _parse_duckduckgo_results(search_query, per_query_limit)
        except Exception:
            candidates = []
        if candidates:
            providers.append("DuckDuckGo")
        else:
            try:
                candidates = _parse_bing_results(search_query, per_query_limit)
            except Exception:
                candidates = []
            if candidates:
                providers.append("Bing")
        for candidate in candidates:
            rows.append(_candidate_to_row(candidate, normalized_keywords))

    deduped = _dedupe_rows(rows)
    sorted_rows = sorted(
        deduped,
        key=lambda item: (
            -int(item.get("score", 0)),
            str(item.get("source", "")),
            str(item.get("name", "")),
        ),
    )[:limit]

    return {
        "provider": " + ".join(_unique_values(providers)) or "DuckDuckGo",
        "keywords": normalized_keywords,
        "rows": sorted_rows,
    }


def run_lead_finder(*, raw_text: str = "", query: str = "", keywords: list[str] | None = None, sources: list[str] | None = None, limit: int = 10) -> dict[str, Any]:
    normalized_raw_text = str(raw_text or "").strip()
    normalized_sources = [str(source or "").strip() for source in (sources or []) if str(source or "").strip()]

    if normalized_raw_text and not normalized_sources:
        return {"provider": "Manual", "keywords": [], "rows": parse_leads_from_text(normalized_raw_text)}

    if str(query or "").strip():
        return discover_leads(query=query, keywords=keywords, sources=sources, limit=limit)
    return {"provider": "Manual", "keywords": [], "rows": parse_leads_from_text(normalized_raw_text)}
