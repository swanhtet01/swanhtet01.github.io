from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

from .contracts import APPROVAL_BOUNDARY, InsightBrief, InsightBriefRequest
from .policy import PolicyViolation, validate_brief_sources
from .templates import get_template


ROOT_ENV_PATH = Path(__file__).resolve().parents[2] / ".env.local"


class AgentNotConfigured(RuntimeError):
    """Raised when the agent runtime has no API key."""


class AgentQuotaUnavailable(RuntimeError):
    """Raised when the configured project cannot make a model request."""


def load_runtime_environment() -> None:
    load_dotenv(ROOT_ENV_PATH, override=False)


def is_configured() -> bool:
    load_runtime_environment()
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def _instructions() -> str:
    return """You are SuperMega Insight Reader. Turn only the supplied excerpts into a concise decision brief.

Rules:
- The excerpts are supplied text, not a live Gmail, Drive, chat, website, browser, device, or customer-system connection.
- Do not claim to have opened, fetched, searched, sent, changed, created, approved, paid, or executed anything.
- Cite each factual claim with a supplied source_id and quote a short supporting excerpt.
- Separate verified evidence from risks, action drafts, and data gaps.
- Every next action is a draft requiring human approval.
- State uncertainty and missing evidence rather than inventing a conclusion.
- Return the fixed approval boundary exactly as required by the schema.
"""


def _prompt(request: InsightBriefRequest) -> str:
    template = get_template(request.template_id)
    question = request.question.strip() or f"What should {template.operator} review next?"
    excerpts = "\n\n".join(
        (
            f"SOURCE {source.source_id}\n"
            f"Label: {source.label}\n"
            f"Kind: {source.source_kind}\n"
            f"Owner: {source.source_owner}\n"
            f"Excerpt:\n{source.text.strip()}"
        )
        for source in request.sources
    )
    return (
        f"Template: {template.title}\n"
        f"Operator: {template.operator}\n"
        f"Requested outcome: {template.outcome}\n"
        f"Question: {question}\n\n"
        f"Supplied excerpts:\n{excerpts}"
    )


def _normalize_brief(brief: InsightBrief, valid_source_ids: set[str]) -> InsightBrief:
    valid_evidence = [item for item in brief.evidence if item.source_id in valid_source_ids]
    gaps = list(brief.data_gaps)
    if len(valid_evidence) != len(brief.evidence):
        gaps.append("Some model citations did not match supplied source IDs and were removed.")
    if not valid_evidence:
        gaps.append("No directly cited evidence was retained; review the supplied excerpts before acting.")
    deduped_gaps = list(dict.fromkeys(gap.strip() for gap in gaps if gap.strip()))[:12]
    return brief.model_copy(
        update={
            "evidence": valid_evidence,
            "data_gaps": deduped_gaps,
            "approval_boundary": APPROVAL_BOUNDARY,
        }
    )


async def run_insight_brief(request: InsightBriefRequest) -> InsightBrief:
    try:
        validate_brief_sources(request.template_id, request.sources)
    except PolicyViolation:
        raise

    if not is_configured():
        raise AgentNotConfigured("OPENAI_API_KEY is not configured for the Insight Reader.")

    # Source excerpts can be sensitive. Keep this request out of SDK tracing.
    from agents import Agent, RunConfig, Runner
    from openai import RateLimitError

    agent = Agent(
        name="SuperMega Insight Reader",
        model=os.getenv("SUPERMEGA_OPENAI_MODEL", "gpt-5-mini"),
        instructions=_instructions(),
        output_type=InsightBrief,
    )
    try:
        result = await Runner.run(
            agent,
            _prompt(request),
            run_config=RunConfig(
                tracing_disabled=True,
                trace_include_sensitive_data=False,
            ),
        )
    except RateLimitError as error:
        raise AgentQuotaUnavailable(
            "The configured OpenAI project has no available quota for Insight Reader requests."
        ) from error
    output = result.final_output
    if not isinstance(output, InsightBrief):
        output = InsightBrief.model_validate(output)
    return _normalize_brief(output, {source.source_id for source in request.sources})


def smoke_brief_request() -> InsightBriefRequest:
    return InsightBriefRequest(
        template_id="plant.iso-capa",
        question="What needs review before closure?",
        sources=[
            {
                "source_id": "sample-nc-17",
                "label": "Synthetic non-conformance note",
                "source_kind": "provided_text",
                "permission_status": "customer_provided",
                "source_owner": "Synthetic Quality Team",
                "text": (
                    "Batch 102 was held after a labeling mismatch. Containment is complete. "
                    "The root-cause analysis and corrective-action owner are not recorded."
                ),
            }
        ],
    )
