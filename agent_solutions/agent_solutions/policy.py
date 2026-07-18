from __future__ import annotations

from collections.abc import Iterable

from .contracts import LeadImportRow, SourceItem
from .templates import get_template


class PolicyViolation(ValueError):
    """Raised when a request would exceed the non-executing product boundary."""


ALLOWED_PERMISSION_STATUSES = {"customer_provided", "customer_approved"}


def validate_brief_sources(template_id: str, sources: Iterable[SourceItem]) -> None:
    template = get_template(template_id)
    source_list = list(sources)
    if sum(len(source.text) for source in source_list) > 60000:
        raise PolicyViolation("Brief source text exceeds the 60,000-character request limit.")

    known_ids: set[str] = set()
    for source in source_list:
        if source.source_id in known_ids:
            raise PolicyViolation(f"Duplicate source_id: {source.source_id}")
        known_ids.add(source.source_id)
        if source.permission_status not in ALLOWED_PERMISSION_STATUSES:
            raise PolicyViolation(
                f"Source {source.source_id} is {source.permission_status}; only customer-provided or customer-approved excerpts are accepted."
            )
        if source.source_kind not in template.allowed_source_kinds:
            raise PolicyViolation(
                f"Template {template_id} does not accept source_kind {source.source_kind}."
            )
        if source.source_kind == "approved_web_extract" and source.permission_status != "customer_approved":
            raise PolicyViolation("Approved website extracts require customer_approved status.")


def lead_disposition(lead: LeadImportRow) -> str:
    if lead.permission_status not in ALLOWED_PERMISSION_STATUSES:
        return "blocked"
    if lead.do_not_contact:
        return "suppressed"
    return "review"
