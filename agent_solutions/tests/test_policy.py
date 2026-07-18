import pytest

from agent_solutions.contracts import InsightBriefRequest
from agent_solutions.policy import PolicyViolation, validate_brief_sources


def _request(template_id: str = "agent.inbox-brief", **source: object) -> InsightBriefRequest:
    payload = {
        "source_id": "source-1",
        "label": "Approved excerpt",
        "source_kind": "provided_text",
        "permission_status": "customer_provided",
        "source_owner": "Customer",
        "text": "One short supplied note.",
    }
    payload.update(source)
    return InsightBriefRequest(template_id=template_id, sources=[payload])


def test_rejects_unconfirmed_source() -> None:
    request = _request(permission_status="not_confirmed")
    with pytest.raises(PolicyViolation):
        validate_brief_sources(request.template_id, request.sources)


def test_rejects_unapproved_web_extract() -> None:
    request = _request(
        template_id="agent.approved-web-brief",
        source_kind="approved_web_extract",
        permission_status="customer_provided",
    )
    with pytest.raises(PolicyViolation):
        validate_brief_sources(request.template_id, request.sources)


def test_accepts_customer_approved_web_extract() -> None:
    request = _request(
        template_id="agent.approved-web-brief",
        source_kind="approved_web_extract",
        permission_status="customer_approved",
    )
    validate_brief_sources(request.template_id, request.sources)
