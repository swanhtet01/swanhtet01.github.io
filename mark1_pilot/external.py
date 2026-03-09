from __future__ import annotations

import re
from datetime import UTC, datetime
from html import unescape
from typing import Any
from urllib.parse import urljoin

import requests

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

from .config import ExternalSourceConfig, ExternalWatchSourceConfig


REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/136.0.0.0 Safari/537.36"
    )
}

DATE_PATTERNS = (
    re.compile(
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b\d{2}/\d{2}/\d{4}\b"),
)

HIGH_SIGNAL_KEYWORDS = {
    "rubber",
    "tyre",
    "tire",
    "shipment",
    "logistics",
    "import",
    "export",
    "customs",
    "fuel",
    "electricity",
    "bead wire",
    "chemical",
    "border trade",
    "bangladesh",
}

LOW_SIGNAL_KEYWORDS = {
    "yangon",
    "myanmar",
    "plant",
    "factory",
}

TOPIC_RULES = {
    "Raw Material Market": {"rubber", "tyre", "tire", "bead wire", "chemical"},
    "Trade And Logistics": {
        "shipment",
        "logistics",
        "import",
        "export",
        "customs",
        "border trade",
        "bangladesh",
    },
    "Energy And Utilities": {"fuel", "electricity"},
    "Finance And Payment": {"payment", "overdue"},
    "Operating Footprint": {"yangon", "myanmar", "plant", "factory"},
}

MIN_RELEVANCE_SCORE = 3
ANCHOR_PATTERN = re.compile(
    r"<a\b[^>]*href\s*=\s*(?:\"([^\"]+)\"|'([^']+)'|([^\s>]+))[^>]*>(.*?)</a>",
    re.IGNORECASE | re.DOTALL,
)


def _strip_html_tags(html_text: str) -> str:
    return re.sub(r"<[^>]+>", " ", html_text or "")


def _clean_text(text: str) -> str:
    text = unescape(text or "")
    return re.sub(r"\s+", " ", text).strip()


def _extract_date(text: str) -> str:
    for pattern in DATE_PATTERNS:
        match = pattern.search(text)
        if match:
            return match.group(0)
    return ""


def _matched_keywords(text: str, keywords: list[str]) -> list[str]:
    lowered = _clean_text(text).lower()
    matches: list[str] = []
    for keyword in keywords:
        target = keyword.lower().strip()
        if not target:
            continue
        if " " in target or "-" in target:
            if target in lowered:
                matches.append(keyword)
            continue
        if re.search(rf"\b{re.escape(target)}\b", lowered):
            matches.append(keyword)
    return matches


def _relevance_score(matched_keywords: list[str]) -> int:
    score = 0
    for keyword in matched_keywords:
        target = keyword.lower().strip()
        if target in HIGH_SIGNAL_KEYWORDS:
            score += 4
        elif target in LOW_SIGNAL_KEYWORDS:
            score += 1
        else:
            score += 2
    if len(matched_keywords) > 1:
        score += len(matched_keywords) - 1
    return score


def _topics_for_keywords(matched_keywords: list[str]) -> list[str]:
    lowered = {keyword.lower().strip() for keyword in matched_keywords}
    topics: list[str] = []
    for label, tokens in TOPIC_RULES.items():
        if lowered & tokens:
            topics.append(label)
    return topics


def _build_summary(context: str, title: str, date_text: str) -> str:
    summary = context
    if title:
        summary = summary.replace(title, "").strip()
    if date_text:
        summary = summary.replace(date_text, "").strip()
    return summary[:240]


def _collect_ranked_items(
    source: ExternalWatchSourceConfig,
    entries: list[dict[str, str]],
    watch_keywords: list[str],
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    source_prefix = source.name.lower().split()[0] if source.name else ""

    for entry in entries:
        title = _clean_text(entry.get("title", ""))
        href = _clean_text(entry.get("url", ""))
        context = _clean_text(entry.get("context", ""))
        date_text = _clean_text(entry.get("date", ""))

        if len(title) < 16:
            continue
        if not href.startswith("http"):
            continue
        if href.rstrip("/") == source.url.rstrip("/") and source_prefix and title.lower().startswith(source_prefix):
            continue

        fingerprint = f"{title}|{href}"
        if fingerprint in seen:
            continue
        seen.add(fingerprint)

        if not date_text:
            date_text = _extract_date(context) or _extract_date(title)
        summary = _build_summary(context, title, date_text)
        matched = _matched_keywords(_clean_text(f"{title} {summary}"), watch_keywords)
        relevance_score = _relevance_score(matched)
        items.append(
            {
                "title": title,
                "url": href,
                "date": date_text,
                "summary": summary,
                "matched_keywords": matched,
                "topics": _topics_for_keywords(matched),
                "relevance_score": relevance_score,
            }
        )

    items.sort(
        key=lambda item: (
            -item["relevance_score"],
            0 if item["date"] else 1,
            item["title"],
        )
    )
    return items


def _fallback_homepage_entries(source: ExternalWatchSourceConfig, html_text: str) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    is_eleven = "elevenmyanmar.com" in source.url

    for match in ANCHOR_PATTERN.finditer(html_text):
        href = match.group(1) or match.group(2) or match.group(3) or ""
        href = urljoin(source.url, href).split("#", 1)[0]
        if is_eleven and "/news/" not in href:
            continue

        title = _clean_text(_strip_html_tags(match.group(4)))
        snippet_start = max(0, match.start() - 280)
        snippet_end = min(len(html_text), match.end() + 280)
        context = _clean_text(_strip_html_tags(html_text[snippet_start:snippet_end]))
        entries.append(
            {
                "title": title,
                "url": href,
                "context": context,
                "date": "",
            }
        )

    return entries


class ExternalSourceWatcher:
    def __init__(self, config: ExternalSourceConfig) -> None:
        self.config = config

    def fetch_all(self) -> dict[str, Any]:
        outputs: dict[str, Any] = {}
        for source in self.config.news_sources:
            outputs[source.name] = self.fetch_source(source)

        manual_sources = [
            {
                "name": source.name,
                "kind": source.kind,
                "url": source.url,
                "notes": source.notes,
                "status": "manual_review_required",
            }
            for source in self.config.manual_sources
        ]

        return {
            "generated_at": datetime.now(UTC).isoformat(),
            "watch_keywords": self.config.watch_keywords,
            "sources": outputs,
            "manual_sources": manual_sources,
        }

    def fetch_source(self, source: ExternalWatchSourceConfig) -> dict[str, Any]:
        if source.kind == "mrppa_market":
            return self._fetch_mrppa_market(source)
        return self._fetch_homepage(source)

    def _fetch_homepage(self, source: ExternalWatchSourceConfig) -> dict[str, Any]:
        try:
            response = requests.get(source.url, headers=REQUEST_HEADERS, timeout=25)
            response.raise_for_status()
        except Exception as exc:
            return {
                "status": "error",
                "source": source.name,
                "url": source.url,
                "message": str(exc),
            }

        entries: list[dict[str, str]]
        parser_mode = "regex_fallback"

        if BeautifulSoup is not None:
            soup = BeautifulSoup(response.text, "html.parser")
            parser_mode = "beautifulsoup"
            if "elevenmyanmar.com" in source.url:
                anchors = [
                    anchor
                    for anchor in soup.select("a[href]")
                    if "/news/" in urljoin(source.url, anchor.get("href", ""))
                ]
            else:
                anchors = []
                for selector in ("h1 a", "h2 a", "h3 a", "h4 a", "article a"):
                    anchors.extend(soup.select(selector))

            entries = []
            for anchor in anchors:
                container = anchor.find_parent(["article", "section", "div", "li"]) or anchor.parent
                context = _clean_text(container.get_text(" ", strip=True))
                time_node = container.find("time") if hasattr(container, "find") else None
                date_text = (
                    _clean_text(time_node.get("datetime", "") or time_node.get_text(" ", strip=True))
                    if time_node
                    else _extract_date(context)
                )
                entries.append(
                    {
                        "title": _clean_text(anchor.get_text(" ", strip=True)),
                        "url": urljoin(source.url, anchor.get("href", "")).split("#", 1)[0],
                        "context": context,
                        "date": date_text,
                    }
                )
        else:
            entries = _fallback_homepage_entries(source, response.text)

        items = _collect_ranked_items(source, entries, self.config.watch_keywords)
        relevant_items = [item for item in items if item["relevance_score"] >= MIN_RELEVANCE_SCORE][:10]
        if not relevant_items:
            relevant_items = [item for item in items if item["matched_keywords"]][:5]

        return {
            "status": "ready",
            "source": source.name,
            "kind": source.kind,
            "url": source.url,
            "parser_mode": parser_mode,
            "items": items[:20],
            "relevant_items": relevant_items,
        }

    def _fetch_mrppa_market(self, source: ExternalWatchSourceConfig) -> dict[str, Any]:
        try:
            response = requests.get(source.url, headers=REQUEST_HEADERS, timeout=25)
            response.raise_for_status()
        except Exception as exc:
            return {
                "status": "error",
                "source": source.name,
                "url": source.url,
                "message": str(exc),
            }

        parser_mode = "regex_fallback"
        if BeautifulSoup is not None:
            soup = BeautifulSoup(response.text, "html.parser")
            text = unescape(soup.get_text("\n", strip=True))
            parser_mode = "beautifulsoup"
        else:
            text = unescape(_strip_html_tags(response.text))

        header_match = re.search(r"\(([^)]+)\)", text)
        price_date = header_match.group(1) if header_match else _extract_date(text)
        lines = [_clean_text(line) for line in text.splitlines() if _clean_text(line)]

        items: list[dict[str, Any]] = []
        seen_categories: set[tuple[str, str]] = set()
        for index, line in enumerate(lines):
            if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", line):
                continue
            if index + 2 >= len(lines):
                continue

            category = lines[index + 1]
            price_line = lines[index + 2]
            if not category or category in {"Price", "View All"} or "USD" not in price_line:
                continue

            fingerprint = (line, category)
            if fingerprint in seen_categories:
                continue
            seen_categories.add(fingerprint)

            title = f"{category} - {price_line}"
            matched = _matched_keywords(title, self.config.watch_keywords)
            effective_matches = matched or ["rubber"]
            items.append(
                {
                    "title": title,
                    "url": source.url,
                    "date": line,
                    "summary": price_line,
                    "matched_keywords": effective_matches,
                    "topics": _topics_for_keywords(effective_matches) or ["Raw Material Market"],
                    "relevance_score": max(MIN_RELEVANCE_SCORE, _relevance_score(effective_matches)),
                }
            )

        return {
            "status": "ready",
            "source": source.name,
            "kind": source.kind,
            "url": source.url,
            "parser_mode": parser_mode,
            "price_date": price_date,
            "items": items,
            "relevant_items": items[:10],
        }
