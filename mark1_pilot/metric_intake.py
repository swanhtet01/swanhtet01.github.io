from __future__ import annotations

import re
from typing import Any

from .document_intake import extract_document_text


METRIC_PATTERNS: list[tuple[str, str, str | None, list[str]]] = [
    ("production_output", "production", "pcs", ["output", "production", "produced", "qty produced"]),
    ("downtime", "production", "minutes", ["downtime", "machine stop", "stoppage"]),
    ("reject_rate", "quality", "%", ["reject rate", "defect rate", "ppm", "scrap rate"]),
    ("rejected_qty", "quality", "pcs", ["rejected", "reject qty", "defect qty", "scrap"]),
    ("received_qty", "receiving", "qty", ["received qty", "goods received", "receipt qty"]),
    ("expected_qty", "receiving", "qty", ["expected qty", "ordered qty", "po qty"]),
    ("on_hand_stock", "inventory", "qty", ["on hand", "stock on hand", "closing stock"]),
    ("reserved_stock", "inventory", "qty", ["reserved", "allocated stock"]),
    ("available_stock", "inventory", "qty", ["available", "free stock"]),
    ("reorder_point", "inventory", "qty", ["reorder point", "minimum stock"]),
    ("sales_value", "sales", "currency", ["sales", "revenue", "turnover"]),
    ("collections", "cash", "currency", ["collection", "collected", "cash received"]),
    ("overdue_value", "cash", "currency", ["overdue", "outstanding", "aged receivable"]),
    ("attendance_count", "people", "count", ["attendance", "present", "headcount"]),
]


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _parse_number(value: str) -> str:
    cleaned = str(value or "").replace(",", "").strip()
    if cleaned.endswith("%"):
        cleaned = cleaned[:-1].strip()
    return cleaned


def _value_to_float(value: str) -> float | None:
    cleaned = _parse_number(value)
    try:
        return float(cleaned)
    except Exception:
        return None


def _extract_first_number(value: str) -> str:
    match = re.search(r"(-?\d[\d,]*(?:\.\d+)?%?)", value)
    return match.group(1) if match else ""


def _infer_unit(value: str, default: str | None) -> str:
    lowered = value.lower()
    if "%" in value:
        return "%"
    if re.search(r"\b(kg|kgs|kilogram|kilograms)\b", lowered):
        return "kg"
    if re.search(r"\b(mt|ton|tons|tonne|tonnes)\b", lowered):
        return "ton"
    if re.search(r"\b(min|mins|minute|minutes)\b", lowered):
        return "minutes"
    if re.search(r"\b(hr|hrs|hour|hours)\b", lowered):
        return "hours"
    if re.search(r"\b(usd|mmk|kyat|\$)\b", lowered):
        return "currency"
    if re.search(r"\b(pcs|pieces|units|qty)\b", lowered):
        return "qty"
    return default or "value"


def _metric_from_cells(cells: list[str], line: str) -> dict[str, Any] | None:
    joined = " | ".join(cells)
    for metric_name, metric_group, default_unit, hints in METRIC_PATTERNS:
        if any(hint in joined.lower() for hint in hints):
            for cell in cells[1:]:
                number = _extract_first_number(cell)
                if number:
                    return {
                        "metric_name": metric_name,
                        "metric_group": metric_group,
                        "metric_value": _parse_number(number),
                        "unit": _infer_unit(cell, default_unit),
                        "scope": cells[0][:80] if cells and cells[0] != cell else "",
                        "period_label": "",
                        "source_line": line,
                        "confidence": "high",
                    }

    numeric_cells = [cell for cell in cells if _extract_first_number(cell)]
    if len(cells) >= 2 and numeric_cells:
        label = cells[0]
        value_cell = numeric_cells[0]
        number = _extract_first_number(value_cell)
        metric_group = "general"
        lowered_label = label.lower()
        if any(word in lowered_label for word in ["stock", "inventory", "warehouse"]):
            metric_group = "inventory"
        elif any(word in lowered_label for word in ["quality", "reject", "defect", "scrap"]):
            metric_group = "quality"
        elif any(word in lowered_label for word in ["sales", "revenue"]):
            metric_group = "sales"
        elif any(word in lowered_label for word in ["cash", "collection", "payment", "overdue"]):
            metric_group = "cash"
        elif any(word in lowered_label for word in ["production", "output", "downtime"]):
            metric_group = "production"
        elif any(word in lowered_label for word in ["receiving", "received", "inbound"]):
            metric_group = "receiving"
        return {
            "metric_name": _clean_text(label).lower().replace(" ", "_")[:60] or "metric_value",
            "metric_group": metric_group,
            "metric_value": _parse_number(number),
            "unit": _infer_unit(value_cell, None),
            "scope": cells[1][:80] if len(cells) > 2 else "",
            "period_label": "",
            "source_line": line,
            "confidence": "medium",
        }
    return None


def _metric_from_line(line: str) -> dict[str, Any] | None:
    cleaned = _clean_text(line)
    if not cleaned:
        return None

    cells = [part.strip() for part in cleaned.split("|") if part.strip()]
    if len(cells) >= 2:
        metric = _metric_from_cells(cells, cleaned)
        if metric:
            return metric

    lowered = cleaned.lower()
    for metric_name, metric_group, default_unit, hints in METRIC_PATTERNS:
        if any(hint in lowered for hint in hints):
            number = _extract_first_number(cleaned)
            if number:
                return {
                    "metric_name": metric_name,
                    "metric_group": metric_group,
                    "metric_value": _parse_number(number),
                    "unit": _infer_unit(cleaned, default_unit),
                    "scope": "",
                    "period_label": "",
                    "source_line": cleaned,
                    "confidence": "high",
                }

    match = re.match(r"([A-Za-z][A-Za-z0-9 /_-]{2,80})[:\-]\s*(-?\d[\d,]*(?:\.\d+)?%?)\s*([A-Za-z%$]*)", cleaned)
    if match:
        return {
            "metric_name": match.group(1).strip().lower().replace(" ", "_")[:60],
            "metric_group": "general",
            "metric_value": _parse_number(match.group(2)),
            "unit": _infer_unit(match.group(3) or match.group(2), None),
            "scope": "",
            "period_label": "",
            "source_line": cleaned,
            "confidence": "medium",
        }
    return None


def extract_metric_candidates(filename: str, content_base64: str) -> dict[str, Any]:
    text, meta = extract_document_text(filename, content_base64)
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()

    for raw_line in text.splitlines():
        metric = _metric_from_line(raw_line)
        if not metric:
            continue
        key = "|".join(
            [
                str(metric.get("metric_name", "")),
                str(metric.get("metric_group", "")),
                str(metric.get("metric_value", "")),
                str(metric.get("scope", "")),
            ]
        )
        if key in seen:
            continue
        seen.add(key)
        candidates.append(metric)
        if len(candidates) >= 30:
            break

    recommended_groups = sorted({str(item.get("metric_group", "")).strip() for item in candidates if item.get("metric_group")})
    return {
        "filename": filename,
        "metric_count": len(candidates),
        "recommended_groups": recommended_groups,
        "metrics": candidates,
        "preview": _clean_text(text)[:1200],
        "meta": meta,
        "summary": (
            f"Found {len(candidates)} metric candidates. "
            + ("These look strongest for " + ", ".join(recommended_groups) + "." if recommended_groups else "Review and classify before saving.")
        ),
    }


def summarize_metric_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    group_counts: dict[str, int] = {}
    numeric_values: list[float] = []
    for row in rows:
        group = str(row.get("metric_group", "")).strip() or "general"
        group_counts[group] = group_counts.get(group, 0) + 1
        value = _value_to_float(str(row.get("metric_value", "")))
        if value is not None:
            numeric_values.append(value)
    return {
        "metric_count": len(rows),
        "group_counts": group_counts,
        "numeric_metric_count": len(numeric_values),
    }
